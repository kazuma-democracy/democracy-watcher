import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Service role client for admin operations
function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    throw new Error(
      !url
        ? 'NEXT_PUBLIC_SUPABASE_URL が未設定です'
        : 'SUPABASE_SERVICE_ROLE_KEY が未設定です。Vercel の環境変数を確認してください。'
    )
  }
  return createClient(url, serviceKey)
}

// Simple admin password check
function checkAuth(req: NextRequest): boolean {
  const pw = req.headers.get('x-admin-password')
  const expected = process.env.ADMIN_PASSWORD || 'democracy2026'
  return pw === expected
}

export async function POST(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: 'パスワードが正しくありません' }, { status: 401 })
  }

  try {
    const body = await req.json()
    const { action } = body
    const db = getAdminClient()

    // ============================================================
    // verify_auth — パスワード検証のみ
    // ============================================================
    if (action === 'verify_auth') {
      return NextResponse.json({ ok: true })
    }

    // ============================================================
    // list_scandals — 既存の不祥事一覧取得
    // ============================================================
    if (action === 'list_scandals') {
      const { data: scandals, error } = await db
        .from('scandals')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100)

      if (error) throw error

      // 関係議員を取得
      const scandalIds = (scandals || []).map((s: any) => s.id)
      let peopleMap: Record<string, any[]> = {}
      let sourcesMap: Record<string, any[]> = {}

      if (scandalIds.length > 0) {
        const { data: people } = await db
          .from('scandal_people')
          .select('scandal_id, legislator_id, role, legislators(id, name, current_party)')
          .in('scandal_id', scandalIds)

        for (const p of people || []) {
          if (!peopleMap[p.scandal_id]) peopleMap[p.scandal_id] = []
          peopleMap[p.scandal_id].push(p)
        }

        const { data: sources } = await db
          .from('scandal_sources')
          .select('scandal_id, url, publisher, published_at, snippet')
          .in('scandal_id', scandalIds)

        for (const s of sources || []) {
          if (!sourcesMap[s.scandal_id]) sourcesMap[s.scandal_id] = []
          sourcesMap[s.scandal_id].push(s)
        }
      }

      const enriched = (scandals || []).map((s: any) => ({
        ...s,
        people: peopleMap[s.id] || [],
        sources: sourcesMap[s.id] || [],
      }))

      return NextResponse.json({ scandals: enriched })
    }

    // ============================================================
    // create_scandal — 不祥事を新規登録
    // ============================================================
    if (action === 'create_scandal') {
      const { title, category, severity, start_date, summary, sources, legislator_ids } = body

      // 1. Insert scandal
      const { data: scandal, error: scandalErr } = await db
        .from('scandals')
        .insert({
          title,
          category,
          severity: severity || 'allegation',
          start_date: start_date || null,
          summary,
          is_published: true,
        })
        .select()
        .single()

      if (scandalErr) throw scandalErr

      // 2. Insert sources
      if (sources?.length > 0) {
        const sourceRows = sources.map((s: any) => ({
          scandal_id: scandal.id,
          url: s.url,
          publisher: s.publisher || null,
          published_at: s.published_at || null,
          snippet: s.snippet || null,
        }))
        const { error: srcErr } = await db.from('scandal_sources').insert(sourceRows)
        if (srcErr) console.error('Sources insert error:', srcErr)
      }

      // 3. Link legislators
      if (legislator_ids?.length > 0) {
        const peopleRows = legislator_ids.map((lid: string) => ({
          scandal_id: scandal.id,
          legislator_id: lid,
          role: 'subject',
        }))
        const { error: pplErr } = await db.from('scandal_people').insert(peopleRows)
        if (pplErr) console.error('People insert error:', pplErr)
      }

      // 4. Add initial timeline entry
      await db.from('scandal_timeline').insert({
        scandal_id: scandal.id,
        event_date: start_date || new Date().toISOString().split('T')[0],
        event_type: 'reported',
        description: '報道により発覚',
      })

      return NextResponse.json({ scandal })
    }

    // ============================================================
    // update_scandal — 既存の不祥事を編集
    // ============================================================
    if (action === 'update_scandal') {
      const { scandal_id, title, category, severity, start_date, summary, legislator_ids } = body

      // 1. Update scandal record
      const { data: scandal, error: scandalErr } = await db
        .from('scandals')
        .update({
          title,
          category,
          severity,
          start_date: start_date || null,
          summary,
        })
        .eq('id', scandal_id)
        .select()
        .single()

      if (scandalErr) throw scandalErr

      // 2. Re-link legislators (delete existing, insert new)
      if (legislator_ids !== undefined) {
        await db.from('scandal_people').delete().eq('scandal_id', scandal_id)
        if (legislator_ids.length > 0) {
          const peopleRows = legislator_ids.map((lid: string) => ({
            scandal_id,
            legislator_id: lid,
            role: 'subject',
          }))
          await db.from('scandal_people').insert(peopleRows)
        }
      }

      return NextResponse.json({ scandal })
    }

    // ============================================================
    // toggle_publish — 公開/非公開の切り替え
    // ============================================================
    if (action === 'toggle_publish') {
      const { scandal_id, is_published } = body
      const { data, error } = await db
        .from('scandals')
        .update({ is_published })
        .eq('id', scandal_id)
        .select()
        .single()
      if (error) throw error
      return NextResponse.json({ scandal: data })
    }

    // ============================================================
    // delete_scandal — 不祥事を削除（関連テーブルも）
    // ============================================================
    if (action === 'delete_scandal') {
      const { scandal_id } = body

      // 子テーブルを先に削除
      await db.from('scandal_timeline').delete().eq('scandal_id', scandal_id)
      await db.from('scandal_sources').delete().eq('scandal_id', scandal_id)
      await db.from('scandal_people').delete().eq('scandal_id', scandal_id)
      const { error } = await db.from('scandals').delete().eq('id', scandal_id)
      if (error) throw error

      return NextResponse.json({ deleted: true })
    }

    // ============================================================
    // search_legislators — 議員検索（改善版）
    // ============================================================
    if (action === 'search_legislators') {
      const { query } = body
      if (!query?.trim()) {
        return NextResponse.json({ legislators: [] })
      }

      const q = query.trim()

      // 1st: exact partial match (current behavior)
      const { data: exact } = await db
        .from('legislators')
        .select('id, name, current_party, house')
        .or(`name.ilike.%${q}%,name_yomi.ilike.%${q}%`)
        .limit(10)

      if (exact && exact.length > 0) {
        return NextResponse.json({ legislators: exact })
      }

      // 2nd: strip spaces & try again (handles full-width space in DB names)
      const noSpace = q.replace(/[\s　]/g, '')
      const { data: noSpaceResult } = await db
        .from('legislators')
        .select('id, name, current_party, house')
        .or(`name.ilike.%${noSpace}%,name_yomi.ilike.%${noSpace}%`)
        .limit(10)

      if (noSpaceResult && noSpaceResult.length > 0) {
        return NextResponse.json({ legislators: noSpaceResult })
      }

      // 3rd: split into parts and search each (e.g. "岸田" + "文雄" separately)
      const parts = noSpace.length >= 2
        ? [noSpace.substring(0, 2), noSpace.substring(2)].filter(p => p.length > 0)
        : [noSpace]

      // Search for surname (first 2 chars) which is most discriminating
      const { data: partialResult } = await db
        .from('legislators')
        .select('id, name, current_party, house')
        .or(parts.map(p => `name.ilike.%${p}%`).join(','))
        .limit(20)

      // If searching by parts, prioritize matches that match all parts
      if (partialResult && partialResult.length > 0) {
        const scored = partialResult.map(leg => {
          const matchCount = parts.filter(p =>
            leg.name.includes(p) || (leg as any).name_yomi?.includes(p)
          ).length
          return { ...leg, matchCount }
        })
        scored.sort((a, b) => b.matchCount - a.matchCount)
        return NextResponse.json({ legislators: scored.slice(0, 10) })
      }

      // 4th: nothing found — return debug info
      console.log(`[search_legislators] No results for: "${q}"`)
      return NextResponse.json({ legislators: [], debug: `"${q}" に一致する議員が見つかりません` })
    }

    // ============================================================
    // debug_legislators — DB内の議員を診断
    // ============================================================
    if (action === 'debug_legislators') {
      const { count } = await db
        .from('legislators')
        .select('*', { count: 'exact', head: true })

      const { data: sample } = await db
        .from('legislators')
        .select('id, name, name_yomi, house, current_party')
        .order('name')
        .limit(30)

      // 特定の名前をチェック
      const testNames = ['岸田文雄', '岸田', '松野博一', '萩生田光一', '安倍晋三']
      const checks: Record<string, any> = {}
      for (const name of testNames) {
        const { data } = await db
          .from('legislators')
          .select('id, name')
          .ilike('name', `%${name}%`)
          .limit(3)
        checks[name] = data || []
      }

      return NextResponse.json({
        total: count,
        sample,
        name_checks: checks,
      })
    }

    return NextResponse.json({ error: '不明なアクション: ' + action }, { status: 400 })
  } catch (e: any) {
    console.error('Admin API error:', e)
    return NextResponse.json({ error: e.message || 'サーバーエラー' }, { status: 500 })
  }
}
