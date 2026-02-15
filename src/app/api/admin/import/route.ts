import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) throw new Error('Missing Supabase env vars')
  return createClient(url, serviceKey)
}

function checkAuth(req: NextRequest): boolean {
  const pw = req.headers.get('x-admin-password')
  const expected = process.env.ADMIN_PASSWORD || 'democracy2026'
  return pw === expected
}

const KOKKAI_API = 'https://kokkai.ndl.go.jp/api'

// 議員ではない発言者
const EXCLUDED_SPEAKERS = ['会議録情報']

// 答弁者の肩書き
const ANSWER_KEYWORDS = [
  '大臣', '総理', '内閣官房', '政務官', '副大臣', '政府参考人', '政府委員',
]

type KokkaiSpeech = {
  speechID: string
  issueID: string
  session: number
  nameOfHouse: string
  nameOfMeeting: string
  issue: string
  date: string
  speechOrder: number
  speaker: string
  speakerYomi: string | null
  speakerGroup: string | null
  speakerPosition: string | null
  speakerRole: string | null
  speech: string
  speechURL: string
  meetingURL: string
}

async function fetchKokkai(endpoint: string, params: Record<string, string | number>) {
  const url = new URL(`${KOKKAI_API}/${endpoint}`)
  url.searchParams.set('recordPacking', 'json')
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, String(v))
  }

  const res = await fetch(url.toString(), {
    headers: { 'User-Agent': 'DemocracyWatcher/1.0' },
  })
  if (!res.ok) throw new Error(`Kokkai API: ${res.status}`)
  return res.json()
}

export async function POST(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await req.json()
    const { action } = body
    const db = getAdminClient()

    // ============================================================
    // import_legislators — セッションから議員を収集してupsert
    // Vercelタイムアウト対策: 1セッション分ずつ、バッチで処理
    // ============================================================
    if (action === 'import_legislators') {
      const session = body.session || 215
      const startRecord = body.startRecord || 1
      const maxRecords = 100

      const data = await fetchKokkai('speech', {
        sessionFrom: session,
        sessionTo: session,
        maximumRecords: maxRecords,
        startRecord,
      })

      if (data.message) {
        return NextResponse.json({
          error: data.message,
          total: 0,
          fetched: 0,
          done: true,
        })
      }

      const total = data.numberOfRecords || 0
      const records: KokkaiSpeech[] = data.speechRecord || []
      const nextStart = data.nextRecordPosition || null

      // ユニークな発言者を収集
      const speakerMap = new Map<string, {
        name: string
        yomi: string | null
        group: string | null
        position: string | null
        house: string | null
        role: string | null
        firstDate: string
        lastDate: string
      }>()

      for (const rec of records) {
        const name = rec.speaker?.trim()
        if (!name || EXCLUDED_SPEAKERS.includes(name)) continue

        const house = rec.nameOfHouse === '衆議院' ? 'representatives'
          : rec.nameOfHouse === '参議院' ? 'councillors' : null

        const existing = speakerMap.get(name)
        if (!existing) {
          speakerMap.set(name, {
            name,
            yomi: rec.speakerYomi || null,
            group: rec.speakerGroup || null,
            position: rec.speakerPosition || null,
            house,
            role: rec.speakerRole || null,
            firstDate: rec.date,
            lastDate: rec.date,
          })
        } else {
          if (rec.speakerGroup) existing.group = rec.speakerGroup
          if (rec.speakerYomi) existing.yomi = rec.speakerYomi
          if (rec.speakerPosition) existing.position = rec.speakerPosition
          if (rec.date > existing.lastDate) existing.lastDate = rec.date
          if (rec.date < existing.firstDate) existing.firstDate = rec.date
        }
      }

      // DBにupsert（参考人・証人は除外）
      let inserted = 0
      let updated = 0
      const nonLegRoles = ['証人', '参考人', '公述人']

      const speakers = Array.from(speakerMap.values())
      for (let i = 0; i < speakers.length; i++) {
        const info = speakers[i]
        // 参考人等はスキップ
        if (info.role && nonLegRoles.includes(info.role)) continue
        // 会派もポジションもない1回だけの発言者はスキップ
        if (!info.group && !info.position) continue

        try {
          const { data: existing } = await db
            .from('legislators')
            .select('id')
            .eq('name', info.name)
            .limit(1)

          if (existing && existing.length > 0) {
            await db.from('legislators').update({
              name_yomi: info.yomi,
              current_party: info.group,
              current_position: info.position,
              house: info.house,
              last_seen: info.lastDate,
            }).eq('id', existing[0].id)
            updated++
          } else {
            await db.from('legislators').insert({
              name: info.name,
              name_yomi: info.yomi,
              current_party: info.group,
              current_position: info.position,
              house: info.house,
              first_seen: info.firstDate,
              last_seen: info.lastDate,
            })
            inserted++
          }
        } catch (e: any) {
          console.error(`Legislator upsert error for ${info.name}:`, e.message)
        }
      }

      return NextResponse.json({
        total,
        fetched: records.length,
        speakers: speakerMap.size,
        inserted,
        updated,
        nextStart,
        done: !nextStart || (startRecord + records.length) >= total,
        session,
      })
    }

    // ============================================================
    // import_speeches — 発言データを取り込み（答弁含む）
    // ============================================================
    if (action === 'import_speeches') {
      const session = body.session || 215
      const startRecord = body.startRecord || 1
      const maxRecords = 100

      // 議員名→IDマップ
      const { data: allLegs } = await db
        .from('legislators')
        .select('id, name')
      const legMap = new Map<string, string>()
      for (const l of (allLegs || [])) {
        legMap.set(l.name, l.id)
      }

      const data = await fetchKokkai('speech', {
        sessionFrom: session,
        sessionTo: session,
        maximumRecords: maxRecords,
        startRecord,
      })

      if (data.message) {
        return NextResponse.json({
          error: data.message,
          total: 0,
          done: true,
        })
      }

      const total = data.numberOfRecords || 0
      const records: KokkaiSpeech[] = data.speechRecord || []
      const nextStart = data.nextRecordPosition || null

      let imported = 0
      let skipped = 0

      for (const rec of records) {
        const speaker = rec.speaker?.trim()
        if (!speaker || EXCLUDED_SPEAKERS.includes(speaker)) {
          skipped++
          continue
        }

        // 発言本文のプレフィックス除去
        let content = rec.speech || ''
        content = content.replace(/^○[^\s]*\s*/, '')
        if (content.length < 10) {
          skipped++
          continue
        }

        const legislatorId = legMap.get(speaker) || null

        try {
          const { error } = await db
            .from('speeches')
            .upsert({
              speech_id: rec.speechID,
              legislator_id: legislatorId,
              speech_order: rec.speechOrder || null,
              speaker_name: speaker,
              speaker_group: rec.speakerGroup || null,
              speaker_position: rec.speakerPosition || null,
              content: content.substring(0, 50000),
              speech_url: rec.speechURL || null,
              date: rec.date,
            }, { onConflict: 'speech_id', ignoreDuplicates: true })

          if (!error) imported++
          else skipped++
        } catch {
          skipped++
        }
      }

      return NextResponse.json({
        total,
        fetched: records.length,
        imported,
        skipped,
        nextStart,
        done: !nextStart || (startRecord + records.length) >= total,
        session,
      })
    }

    // ============================================================
    // get_import_status — 現在のDB状態を確認
    // ============================================================
    if (action === 'get_import_status') {
      const { count: legCount } = await db
        .from('legislators')
        .select('*', { count: 'exact', head: true })

      const { count: speechCount } = await db
        .from('speeches')
        .select('*', { count: 'exact', head: true })

      // 答弁者（positionに大臣等が含まれる）の数
      const { data: answerers } = await db
        .from('legislators')
        .select('name, current_position')
        .or(ANSWER_KEYWORDS.map(k => `current_position.ilike.%${k}%`).join(','))
        .limit(50)

      // 衆参別
      const { count: repCount } = await db
        .from('legislators')
        .select('*', { count: 'exact', head: true })
        .eq('house', 'representatives')

      const { count: couCount } = await db
        .from('legislators')
        .select('*', { count: 'exact', head: true })
        .eq('house', 'councillors')

      // 岸田文雄チェック
      const { data: kishida } = await db
        .from('legislators')
        .select('id, name, current_party, current_position')
        .ilike('name', '%岸田%')

      return NextResponse.json({
        legislators: legCount || 0,
        speeches: speechCount || 0,
        representatives: repCount || 0,
        councillors: couCount || 0,
        answerers: answerers?.length || 0,
        answerer_sample: (answerers || []).slice(0, 10),
        kishida_check: kishida || [],
      })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (e: any) {
    console.error('Import API error:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
