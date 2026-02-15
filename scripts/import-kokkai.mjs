#!/usr/bin/env node
/**
 * import-kokkai.mjs
 * 
 * 国会会議録検索システムAPIから議員マスタ＋発言（答弁含む）をインポート
 * 
 * 使い方:
 *   # 環境変数を設定（.env.localからでもOK）
 *   export NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
 *   export SUPABASE_SERVICE_ROLE_KEY=eyJ...
 * 
 *   # 議員マスタのみインポート（軽量・高速）
 *   node scripts/import-kokkai.mjs --legislators-only
 * 
 *   # 議員＋発言データをインポート（時間がかかる）
 *   node scripts/import-kokkai.mjs --full
 * 
 *   # 特定セッションのみ
 *   node scripts/import-kokkai.mjs --session 215
 * 
 *   # ドライラン（DBに書き込まない）
 *   node scripts/import-kokkai.mjs --dry-run
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'

// ============================================================
// 設定
// ============================================================
const KOKKAI_API_BASE = 'https://kokkai.ndl.go.jp/api'
const DELAY_MS = 2000        // API間隔（2秒）
const MAX_PER_REQUEST = 100  // speech APIの1回最大
const DEFAULT_SESSIONS = [211, 212, 213, 214, 215, 216] // 最近の国会回次

// 答弁者の肩書きパターン（これに一致すれば答弁としてマーク）
const ANSWER_POSITIONS = [
  '内閣総理大臣', '国務大臣', '副大臣', '大臣政務官',
  '政府参考人', '政府委員', '内閣官房長官', '内閣府特命担当大臣',
  '外務大臣', '財務大臣', '文部科学大臣', '厚生労働大臣',
  '農林水産大臣', '経済産業大臣', '国土交通大臣', '環境大臣',
  '防衛大臣', '総務大臣', '法務大臣', '復興大臣',
  'デジタル大臣', '少子化担当大臣', '万博担当大臣',
]

// 除外する発言者（議員でも答弁者でもない）
const EXCLUDED_SPEAKERS = [
  '会議録情報', '議長', '副議長', '委員長', '理事',
]

// speakerRoleに値がある場合は参考人等なので議員マスタには入れない
// ただしspeechとしては取り込む
const NON_LEGISLATOR_ROLES = ['証人', '参考人', '公述人']

// ============================================================
// 引数パース
// ============================================================
const args = process.argv.slice(2)
const DRY_RUN = args.includes('--dry-run')
const LEGISLATORS_ONLY = args.includes('--legislators-only')
const FULL_IMPORT = args.includes('--full')
const sessionIdx = args.indexOf('--session')
const TARGET_SESSIONS = sessionIdx >= 0 
  ? [parseInt(args[sessionIdx + 1])]
  : DEFAULT_SESSIONS

// ============================================================
// .env.local 読み込み
// ============================================================
function loadEnv() {
  const envPath = resolve(process.cwd(), '.env.local')
  if (existsSync(envPath)) {
    const lines = readFileSync(envPath, 'utf-8').split('\n')
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eqIdx = trimmed.indexOf('=')
      if (eqIdx > 0) {
        const key = trimmed.substring(0, eqIdx).trim()
        const val = trimmed.substring(eqIdx + 1).trim()
        if (!process.env[key]) {
          process.env[key] = val
        }
      }
    }
  }
}

loadEnv()

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ 環境変数が未設定です:')
  if (!SUPABASE_URL) console.error('  - NEXT_PUBLIC_SUPABASE_URL')
  if (!SUPABASE_KEY) console.error('  - SUPABASE_SERVICE_ROLE_KEY')
  console.error('\n.env.local に設定するか、環境変数をexportしてください')
  process.exit(1)
}

const db = createClient(SUPABASE_URL, SUPABASE_KEY)

// ============================================================
// ユーティリティ
// ============================================================
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

async function fetchKokkaiAPI(endpoint, params) {
  const url = new URL(`${KOKKAI_API_BASE}/${endpoint}`)
  url.searchParams.set('recordPacking', 'json')
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, String(v))
  }
  
  const res = await fetch(url.toString())
  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`)
  }
  return res.json()
}

function isLegislator(speaker, position, role) {
  // 除外リスト
  if (EXCLUDED_SPEAKERS.includes(speaker)) return false
  // 参考人等はfalse
  if (role && NON_LEGISLATOR_ROLES.includes(role)) return false
  // 「会議録情報」的なspeechOrder=0は除外
  if (!speaker || speaker === '') return false
  return true
}

function isAnswerer(position) {
  if (!position) return false
  return ANSWER_POSITIONS.some(p => position.includes(p))
}

function determineHouse(nameOfHouse) {
  if (nameOfHouse === '衆議院') return 'representatives'
  if (nameOfHouse === '参議院') return 'councillors'
  return null
}

function cleanSpeakerName(name) {
  // 「○○大臣（岸田文雄君）」→ 岸田文雄
  // 発言者名フィールドは通常きれいだが念のため
  return name?.trim() || ''
}

// ============================================================
// Phase 1: 議員マスタ収集
// ============================================================
async function collectLegislators(sessions) {
  console.log('\n📋 Phase 1: 議員マスタ収集')
  console.log(`   対象セッション: ${sessions.join(', ')}`)
  
  // speaker → { name, yomi, group, position, house, sessions }
  const legislatorMap = new Map()
  
  for (const session of sessions) {
    console.log(`\n  🏛️ 第${session}回国会...`)
    
    let startRecord = 1
    let totalRecords = null
    let fetchedCount = 0
    
    while (true) {
      try {
        const data = await fetchKokkaiAPI('speech', {
          sessionFrom: session,
          sessionTo: session,
          maximumRecords: MAX_PER_REQUEST,
          startRecord,
        })
        
        if (data.message) {
          // エラー
          console.log(`    ⚠️ API: ${data.message}`)
          break
        }
        
        totalRecords = totalRecords || data.numberOfRecords
        const records = data.speechRecord || []
        
        if (records.length === 0) break
        
        for (const rec of records) {
          const name = cleanSpeakerName(rec.speaker)
          if (!name) continue
          
          const existing = legislatorMap.get(name)
          const house = determineHouse(rec.nameOfHouse)
          
          if (!existing) {
            legislatorMap.set(name, {
              name,
              yomi: rec.speakerYomi || null,
              group: rec.speakerGroup || null,
              position: rec.speakerPosition || null,
              house,
              role: rec.speakerRole || null,
              sessions: new Set([session]),
              speechCount: 1,
              lastDate: rec.date,
              firstDate: rec.date,
            })
          } else {
            existing.sessions.add(session)
            existing.speechCount++
            // 最新の情報で更新
            if (rec.speakerGroup) existing.group = rec.speakerGroup
            if (rec.speakerPosition) existing.position = rec.speakerPosition
            if (rec.speakerYomi) existing.yomi = rec.speakerYomi
            if (house) existing.house = house
            if (rec.date > existing.lastDate) existing.lastDate = rec.date
            if (rec.date < existing.firstDate) existing.firstDate = rec.date
          }
        }
        
        fetchedCount += records.length
        const pct = totalRecords > 0 ? Math.round(fetchedCount / totalRecords * 100) : '?'
        process.stdout.write(`\r    ${fetchedCount}/${totalRecords} 発言処理 (${pct}%) - 議員候補: ${legislatorMap.size}名`)
        
        if (!data.nextRecordPosition || fetchedCount >= totalRecords) break
        startRecord = data.nextRecordPosition
        
        await sleep(DELAY_MS)
      } catch (e) {
        console.error(`\n    ❌ エラー: ${e.message}`)
        // 1000件超えの場合が多い。日付で分割は必要だが、
        // ここでは取得できた分だけで続行
        break
      }
    }
    
    console.log(`\n    ✅ ${fetchedCount}件処理完了`)
  }
  
  // フィルタリング: 議員と認定できるものだけ
  const legislators = []
  const answerers = []
  
  for (const [name, info] of legislatorMap) {
    if (EXCLUDED_SPEAKERS.includes(name)) continue
    if (info.role && NON_LEGISLATOR_ROLES.includes(info.role)) continue
    
    // 会派所属があるか、答弁者ポジションか
    const hasGroup = info.group && info.group !== ''
    const isAnswer = isAnswerer(info.position)
    
    if (hasGroup || isAnswer || info.speechCount >= 2) {
      legislators.push(info)
      if (isAnswer) answerers.push(info)
    }
  }
  
  console.log(`\n📊 収集結果:`)
  console.log(`   全発言者: ${legislatorMap.size}名`)
  console.log(`   議員候補: ${legislators.length}名`)
  console.log(`   答弁者: ${answerers.length}名`)
  
  return legislators
}

// ============================================================
// Phase 2: DBにupsert
// ============================================================
async function upsertLegislators(legislators) {
  console.log('\n💾 Phase 2: Supabase にupsert')
  
  if (DRY_RUN) {
    console.log('  (ドライラン - DBに書き込みません)')
    const sample = legislators.slice(0, 20)
    for (const l of sample) {
      const flag = isAnswerer(l.position) ? '🎤答弁' : '💬質問'
      console.log(`  ${flag} ${l.name} (${l.yomi || '?'}) [${l.group || '無所属'}] ${l.house || '?'} - ${l.speechCount}回発言`)
    }
    if (legislators.length > 20) {
      console.log(`  ... 他 ${legislators.length - 20}名`)
    }
    return { inserted: 0, updated: 0 }
  }
  
  let inserted = 0
  let updated = 0
  let errors = 0
  
  // バッチ処理（50件ずつ）
  const BATCH_SIZE = 50
  for (let i = 0; i < legislators.length; i += BATCH_SIZE) {
    const batch = legislators.slice(i, i + BATCH_SIZE)
    
    const rows = batch.map(l => ({
      name: l.name,
      name_yomi: l.yomi,
      current_party: l.group,
      current_position: l.position,
      house: l.house,
      first_seen: l.firstDate,
      last_seen: l.lastDate,
    }))
    
    // 各議員を個別にupsert（nameでマッチ）
    for (const row of rows) {
      try {
        // まず既存チェック
        const { data: existing } = await db
          .from('legislators')
          .select('id, name')
          .eq('name', row.name)
          .limit(1)
        
        if (existing && existing.length > 0) {
          // 更新
          const { error } = await db
            .from('legislators')
            .update({
              name_yomi: row.name_yomi || existing[0].name_yomi,
              current_party: row.current_party,
              current_position: row.current_position,
              house: row.house,
              last_seen: row.last_seen,
            })
            .eq('id', existing[0].id)
          
          if (error) throw error
          updated++
        } else {
          // 新規挿入
          const { error } = await db
            .from('legislators')
            .insert(row)
          
          if (error) throw error
          inserted++
        }
      } catch (e) {
        errors++
        if (errors <= 5) {
          console.error(`  ⚠️ ${row.name}: ${e.message}`)
        }
      }
    }
    
    process.stdout.write(`\r  ${Math.min(i + BATCH_SIZE, legislators.length)}/${legislators.length} 処理中... (新規: ${inserted}, 更新: ${updated})`)
  }
  
  console.log(`\n\n✅ 議員マスタ完了:`)
  console.log(`   新規登録: ${inserted}名`)
  console.log(`   更新: ${updated}名`)
  if (errors > 0) console.log(`   エラー: ${errors}件`)
  
  return { inserted, updated }
}

// ============================================================
// Phase 3: 発言データインポート（答弁含む）
// ============================================================
async function importSpeeches(sessions) {
  console.log('\n📝 Phase 3: 発言データインポート（答弁含む）')
  
  // まず既存の議員マップを取得
  const { data: allLegs } = await db
    .from('legislators')
    .select('id, name')
  
  const legNameMap = new Map()
  for (const l of (allLegs || [])) {
    legNameMap.set(l.name, l.id)
  }
  console.log(`  議員マスタ: ${legNameMap.size}名`)
  
  let totalInserted = 0
  let totalSkipped = 0
  
  for (const session of sessions) {
    console.log(`\n  🏛️ 第${session}回国会の発言...`)
    
    let startRecord = 1
    let totalRecords = null
    let fetchedCount = 0
    let sessionInserted = 0
    
    while (true) {
      try {
        const data = await fetchKokkaiAPI('speech', {
          sessionFrom: session,
          sessionTo: session,
          maximumRecords: MAX_PER_REQUEST,
          startRecord,
        })
        
        if (data.message) {
          console.log(`    ⚠️ ${data.message}`)
          break
        }
        
        totalRecords = totalRecords || data.numberOfRecords
        const records = data.speechRecord || []
        if (records.length === 0) break
        
        // バッチでinsert
        const speechRows = []
        
        for (const rec of records) {
          const speaker = cleanSpeakerName(rec.speaker)
          if (!speaker || EXCLUDED_SPEAKERS.includes(speaker)) continue
          
          const legislatorId = legNameMap.get(speaker) || null
          
          // speechの先頭にある発言者名プレフィックスを除去
          let content = rec.speech || ''
          // 「○内閣総理大臣（岸田文雄君）」のようなプレフィックス
          content = content.replace(/^○[^\s]*\s*/, '')
          
          // 短すぎる発言はスキップ
          if (content.length < 10) continue
          
          speechRows.push({
            speech_id: rec.speechID,
            legislator_id: legislatorId,
            speech_order: rec.speechOrder || null,
            speaker_name: speaker,
            speaker_group: rec.speakerGroup || null,
            speaker_position: rec.speakerPosition || null,
            content: content.substring(0, 50000), // 長すぎる場合は切り詰め
            speech_url: rec.speechURL || null,
            date: rec.date,
          })
        }
        
        if (speechRows.length > 0 && !DRY_RUN) {
          // speech_idでupsert
          const { error } = await db
            .from('speeches')
            .upsert(speechRows, { onConflict: 'speech_id', ignoreDuplicates: true })
          
          if (error) {
            // 個別にinsert
            for (const row of speechRows) {
              try {
                const { error: sErr } = await db
                  .from('speeches')
                  .upsert(row, { onConflict: 'speech_id', ignoreDuplicates: true })
                if (!sErr) sessionInserted++
                else totalSkipped++
              } catch { totalSkipped++ }
            }
          } else {
            sessionInserted += speechRows.length
          }
        } else if (DRY_RUN) {
          sessionInserted += speechRows.length
        }
        
        fetchedCount += records.length
        const pct = totalRecords > 0 ? Math.round(fetchedCount / totalRecords * 100) : '?'
        process.stdout.write(`\r    ${fetchedCount}/${totalRecords} (${pct}%) - ${sessionInserted}件取込`)
        
        if (!data.nextRecordPosition || fetchedCount >= totalRecords) break
        startRecord = data.nextRecordPosition
        
        await sleep(DELAY_MS)
      } catch (e) {
        console.error(`\n    ❌ ${e.message}`)
        break
      }
    }
    
    totalInserted += sessionInserted
    console.log(`\n    ✅ ${sessionInserted}件取込完了`)
  }
  
  console.log(`\n📊 発言インポート結果:`)
  console.log(`   取込: ${totalInserted}件`)
  if (totalSkipped > 0) console.log(`   スキップ: ${totalSkipped}件`)
}

// ============================================================
// メイン
// ============================================================
async function main() {
  console.log('╔══════════════════════════════════════════════╗')
  console.log('║  国会会議録 → Democracy Watcher インポーター ║')
  console.log('╚══════════════════════════════════════════════╝')
  console.log()
  console.log(`モード: ${DRY_RUN ? '🔍 ドライラン' : '💾 本番書込'}`)
  console.log(`対象: ${LEGISLATORS_ONLY ? '議員マスタのみ' : FULL_IMPORT ? '議員＋発言' : '議員マスタのみ（デフォルト）'}`)
  console.log(`セッション: ${TARGET_SESSIONS.join(', ')}`)
  console.log(`DB: ${SUPABASE_URL}`)
  
  // DB接続テスト
  const { count, error } = await db
    .from('legislators')
    .select('*', { count: 'exact', head: true })
  
  if (error) {
    console.error(`\n❌ DB接続エラー: ${error.message}`)
    process.exit(1)
  }
  console.log(`現在の議員数: ${count}名`)
  
  // Phase 1: 議員収集
  const legislators = await collectLegislators(TARGET_SESSIONS)
  
  // Phase 2: DB upsert
  await upsertLegislators(legislators)
  
  // Phase 3: 発言インポート（--fullの場合のみ）
  if (FULL_IMPORT && !LEGISLATORS_ONLY) {
    await importSpeeches(TARGET_SESSIONS)
  } else if (!LEGISLATORS_ONLY && !FULL_IMPORT) {
    console.log('\n💡 発言データもインポートするには --full オプションを付けてください')
  }
  
  // 最終確認
  const { count: finalCount } = await db
    .from('legislators')
    .select('*', { count: 'exact', head: true })
  
  console.log(`\n🏁 完了！ 議員数: ${count}名 → ${finalCount}名`)
}

main().catch(e => {
  console.error('\n💥 致命的エラー:', e.message)
  process.exit(1)
})
