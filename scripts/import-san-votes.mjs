#!/usr/bin/env node
/**
 * 参議院 賛否データインポーター
 * 
 * 参議院CSVの投票結果URLをスクレイピングして
 * 会派別の賛否を bill_votes テーブルにインポートする。
 * 
 * - 全会一致 → 全会派「賛成」として登録
 * - 多数/少数 → 投票結果URLから会派別賛否を取得
 * 
 * 使い方:
 *   cd C:\Users\wetli\Desktop\Democracy\democracy-watcher-app
 *   node scripts/import-san-votes.mjs
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync, writeFileSync } from 'fs'
import { resolve } from 'path'

// ===== 設定 =====
const SAN_CSV_URL = 'https://raw.githubusercontent.com/smartnews-smri/house-of-councillors/main/data/gian.csv'
const FETCH_DELAY_MS = 300  // 参議院サーバーへの配慮（300ms間隔）
const CACHE_FILE = resolve(process.cwd(), 'scripts/san-vote-cache.json')

// .env.local 読み込み
function loadEnv() {
  const envPath = resolve(process.cwd(), '.env.local')
  if (!existsSync(envPath)) {
    console.error('❌ .env.local が見つかりません')
    process.exit(1)
  }
  const envText = readFileSync(envPath, 'utf-8')
  const vars = {}
  for (const line of envText.split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.+)$/)
    if (m) vars[m[1]] = m[2].trim()
  }
  return vars
}

const env = loadEnv()
const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

// ===== CSV パーサー =====
function parseCSVLine(line) {
  const result = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') { current += '"'; i++ }
        else inQuotes = false
      } else current += ch
    } else {
      if (ch === '"') inQuotes = true
      else if (ch === ',') { result.push(current.trim()); current = '' }
      else current += ch
    }
  }
  result.push(current.trim())
  return result
}

function parseCSV(text) {
  const lines = text.split('\n')
  if (lines.length < 2) return []
  const headers = parseCSVLine(lines[0])
  const rows = []
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue
    const values = parseCSVLine(line)
    if (values.length !== headers.length) continue
    const row = {}
    for (let j = 0; j < headers.length; j++) row[headers[j]] = values[j]
    rows.push(row)
  }
  return rows
}

// ===== 会派名の正規化 =====
const PARTY_NORMALIZE = {
  '自由民主党・保守党': '自由民主党',
  '自由民主党・保守新党': '自由民主党',
  '自由民主党・国民の声': '自由民主党',
  '自由民主党': '自由民主党',
  '自民党・保守党': '自由民主党',
  '立憲民主・社民': '立憲民主党',
  '立憲民主・社民・無所属': '立憲民主党',
  '民主党・新緑風会': '立憲民主党',  // 系譜として
  '民主党': '立憲民主党',
  '民進党・新緑風会': '立憲民主党',
  '国民民主党・新緑風会': '国民民主党',
  '国民民主党': '国民民主党',
  '公明党': '公明党',
  '日本維新の会': '日本維新の会',
  '日本維新の会・希望の党': '日本維新の会',
  'おおさか維新の会': '日本維新の会',
  '維新の党': '日本維新の会',
  '日本共産党': '日本共産党',
  'れいわ新選組': 'れいわ新選組',
  '社会民主党・護憲連合': '社会民主党',
  '社民党': '社会民主党',
  '自由党': '自由党',
  '無所属の会': '無所属',
  '各派に属しない議員': '無所属',
  '無所属': '無所属',
  'みんなの党': 'みんなの党',
  '新党改革': '新党改革',
  '日本のこころを大切にする党': '日本のこころ',
  '日本のこころ': '日本のこころ',
  '次世代の党': '次世代の党',
  '生活の党': '生活の党',
  '生活の党と山本太郎となかまたち': '生活の党',
  'NHKから国民を守る党': 'NHK党',
  '参政党': '参政党',
  '沖縄の風': '沖縄の風',
  '碧水会': '碧水会',
  '国民新党': '国民新党',
  'たちあがれ日本・新党改革': '新党改革',
  '新党大地・真民主': '新党大地',
  'みどりの風': 'みどりの風',
  '教育無償化を実現する会': '教育無償化を実現する会',
}

function normalizePartyName(raw) {
  const trimmed = raw.trim()
  if (!trimmed) return null
  
  // 完全一致
  if (PARTY_NORMALIZE[trimmed]) return PARTY_NORMALIZE[trimmed]
  
  // 部分一致（長いキーから順に）
  const sortedKeys = Object.keys(PARTY_NORMALIZE).sort((a, b) => b.length - a.length)
  for (const key of sortedKeys) {
    if (trimmed.includes(key)) return PARTY_NORMALIZE[key]
  }
  
  return trimmed
}

// ===== 投票結果HTMLのパース =====
function parseVotePage(html) {
  const results = []
  
  // 会派ブロックを検出: "会派名(N名)" + "賛成票 X　反対票 Y"
  // パターン1: テキストから直接抽出
  const lines = html.replace(/<[^>]+>/g, '\n').split('\n').map(l => l.trim()).filter(l => l)
  
  for (let i = 0; i < lines.length; i++) {
    // 会派名パターン: "自由民主党・保守党(116名)" or "自由民主党・保守党( 116名)"
    const partyMatch = lines[i].match(/^(.+?)\(\s*(\d+)\s*名\s*\)$/)
    if (!partyMatch) continue
    
    const rawPartyName = partyMatch[1].trim()
    const partyName = normalizePartyName(rawPartyName)
    if (!partyName) continue
    
    // 次の数行で賛成票・反対票を探す
    for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
      const voteMatch = lines[j].match(/賛成票\s*(\d+)\s*反対票\s*(\d+)/)
      if (voteMatch) {
        const yes = parseInt(voteMatch[1])
        const no = parseInt(voteMatch[2])
        
        // 賛成多数 or 反対多数で判定
        if (yes > 0 || no > 0) {
          results.push({
            party: partyName,
            rawParty: rawPartyName,
            yes,
            no,
            vote: yes >= no ? '賛成' : '反対',
          })
        }
        break
      }
    }
  }
  
  return results
}

// ===== URLフェッチ（キャッシュ付き） =====
let cache = {}
function loadCache() {
  try {
    if (existsSync(CACHE_FILE)) {
      cache = JSON.parse(readFileSync(CACHE_FILE, 'utf-8'))
      console.log(`📦 キャッシュ読み込み: ${Object.keys(cache).length}件`)
    }
  } catch { cache = {} }
}

function saveCache() {
  try {
    writeFileSync(CACHE_FILE, JSON.stringify(cache), 'utf-8')
  } catch {}
}

async function fetchVotePage(url) {
  if (cache[url]) return cache[url]
  
  await new Promise(r => setTimeout(r, FETCH_DELAY_MS))
  
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'DemocracyWatcher/1.0 (research)' }
    })
    if (!res.ok) return null
    
    // Shift_JIS対応
    const buffer = await res.arrayBuffer()
    let html
    try {
      // まずUTF-8で試す
      html = new TextDecoder('utf-8').decode(buffer)
      if (html.includes('charset=euc-jp') || html.includes('charset=EUC-JP')) {
        html = new TextDecoder('euc-jp').decode(buffer)
      } else if (html.includes('charset=shift_jis') || html.includes('charset=Shift_JIS')) {
        html = new TextDecoder('shift-jis').decode(buffer)
      }
    } catch {
      html = new TextDecoder('utf-8', { fatal: false }).decode(buffer)
    }
    
    cache[url] = html
    return html
  } catch (err) {
    console.error(`    ⚠️ フェッチ失敗: ${url} - ${err.message}`)
    return null
  }
}

// ===== 既存DB読み込み =====
async function loadBillsMap() {
  console.log('📦 既存billsを読み込み中...')
  let allBills = []
  let from = 0
  while (true) {
    const { data, error } = await supabase
      .from('bills')
      .select('id, session, bill_name, bill_type, bill_number, house')
      .range(from, from + 999)
    if (error) break
    allBills = allBills.concat(data)
    if (data.length < 1000) break
    from += 1000
  }
  console.log(`  → ${allBills.length}件`)
  
  const byName = new Map()
  const byNumber = new Map()
  for (const b of allBills) {
    if (b.session && b.bill_name) byName.set(`${b.session}|${b.bill_name}`, b)
    if (b.session && b.bill_type && b.bill_number) byNumber.set(`${b.session}|${b.bill_type}|${b.bill_number}`, b)
  }
  return { byName, byNumber }
}

async function loadExistingVotes() {
  console.log('📦 既存bill_votesを読み込み中...')
  let allVotes = []
  let from = 0
  while (true) {
    const { data, error } = await supabase
      .from('bill_votes')
      .select('bill_id, party_name, chamber')
      .range(from, from + 999)
    if (error) break
    allVotes = allVotes.concat(data)
    if (data.length < 1000) break
    from += 1000
  }
  console.log(`  → ${allVotes.length}件`)
  
  const existing = new Set()
  for (const v of allVotes) existing.add(`${v.bill_id}|${v.party_name}|${v.chamber}`)
  return existing
}

// ===== 全会一致時の会派リスト取得 =====
// 参議院のCSVから各回次の会派一覧を推定する
async function getSessionParties(session) {
  // 主要会派（時代に応じて変わるが、大まかに）
  // 全会一致の場合は主要会派のみ登録する
  if (session >= 210) {
    return ['自由民主党', '立憲民主党', '公明党', '日本維新の会', '国民民主党', '日本共産党', 'れいわ新選組', '参政党', 'NHK党']
  } else if (session >= 200) {
    return ['自由民主党', '立憲民主党', '公明党', '日本維新の会', '国民民主党', '日本共産党', 'れいわ新選組']
  } else if (session >= 195) {
    return ['自由民主党', '立憲民主党', '公明党', '日本維新の会', '国民民主党', '日本共産党', '社会民主党']
  } else if (session >= 190) {
    return ['自由民主党', '民進党', '公明党', '日本共産党', 'おおさか維新の会', '社会民主党', '生活の党']
  } else if (session >= 180) {
    return ['自由民主党', '民主党', '公明党', '日本維新の会', 'みんなの党', '日本共産党', '社会民主党']
  } else if (session >= 170) {
    return ['自由民主党', '民主党', '公明党', '日本共産党', '社会民主党', '国民新党']
  } else {
    return ['自由民主党', '民主党', '公明党', '日本共産党', '社会民主党', '自由党']
  }
}

// ===== メイン処理 =====
async function main() {
  console.log('🗳️  参議院 賛否データインポーター')
  console.log('====================================')
  
  loadCache()
  const billsMap = await loadBillsMap()
  const existingVotes = await loadExistingVotes()
  
  // CSV取得
  console.log('\n⬇️  参議院CSVをダウンロード中...')
  const res = await fetch(SAN_CSV_URL)
  const csvText = await res.text()
  const rows = parseCSV(csvText)
  console.log(`  → ${rows.length}行をパース`)
  
  // カラム検出
  const keys = Object.keys(rows[0])
  const sessionCol = keys.find(k => k.includes('審議回次'))
  const nameCol = keys.find(k => k === '件名')
  const typeCol = keys.find(k => k === '種類')
  const numberCol = keys.find(k => k.includes('提出番号'))
  const taiyoCol = keys.find(k => k === '参議院本会議経過情報 - 採決態様')
  const tohyoCol = keys.find(k => k === '参議院本会議経過情報 - 投票結果')
  const giketu = keys.find(k => k === '参議院本会議経過情報 - 議決')
  
  console.log(`  回次=${sessionCol}, 件名=${nameCol}, 採決態様=${taiyoCol}, 投票結果=${tohyoCol}`)
  
  const stats = {
    total: 0,
    zenkaiiichi: 0,
    scraped: 0,
    scrapeFailed: 0,
    matched: 0,
    unmatched: 0,
    inserted: 0,
    skipped: 0,
    errors: 0,
  }
  
  const votesToInsert = []
  
  // 全会一致の処理
  console.log('\n━━━ 全会一致の議案を処理 ━━━')
  for (const row of rows) {
    const taiyo = row[taiyoCol]
    if (taiyo !== '全会一致') continue
    
    const session = parseInt(row[sessionCol])
    const billName = row[nameCol]?.trim()
    if (!session || !billName) continue
    
    stats.total++
    stats.zenkaiiichi++
    
    // bill検索
    let bill = billsMap.byName.get(`${session}|${billName}`)
    if (!bill && typeCol && numberCol) {
      const bType = row[typeCol]?.trim()
      const bNum = parseInt(row[numberCol])
      if (bType && bNum) bill = billsMap.byNumber.get(`${session}|${bType}|${bNum}`)
    }
    if (!bill) {
      const shortName = billName.substring(0, 30)
      for (const [key, b] of billsMap.byName.entries()) {
        if (key.startsWith(`${session}|`) && key.includes(shortName)) { bill = b; break }
      }
    }
    
    if (!bill) { stats.unmatched++; continue }
    stats.matched++
    
    // 全会一致 → 主要政党すべて「賛成」
    const parties = await getSessionParties(session)
    for (const party of parties) {
      const key = `${bill.id}|${party}|参議院`
      if (existingVotes.has(key)) { stats.skipped++; continue }
      votesToInsert.push({ bill_id: bill.id, party_name: party, vote: '賛成', chamber: '参議院' })
      existingVotes.add(key)
    }
  }
  console.log(`  → 全会一致: ${stats.zenkaiiichi}件 / マッチ: ${stats.matched}件`)
  
  // 多数/少数 → URL スクレイピング
  console.log('\n━━━ 投票結果URLをスクレイピング ━━━')
  const urlRows = rows.filter(r => {
    const taiyo = r[taiyoCol]
    const url = r[tohyoCol]
    return (taiyo === '多数' || taiyo === '少数') && url && url.startsWith('http')
  })
  console.log(`  → 対象: ${urlRows.length}件`)
  
  let scrapeCount = 0
  for (const row of urlRows) {
    const session = parseInt(row[sessionCol])
    const billName = row[nameCol]?.trim()
    if (!session || !billName) continue
    
    stats.total++
    
    // bill検索
    let bill = billsMap.byName.get(`${session}|${billName}`)
    if (!bill && typeCol && numberCol) {
      const bType = row[typeCol]?.trim()
      const bNum = parseInt(row[numberCol])
      if (bType && bNum) bill = billsMap.byNumber.get(`${session}|${bType}|${bNum}`)
    }
    if (!bill) {
      const shortName = billName.substring(0, 30)
      for (const [key, b] of billsMap.byName.entries()) {
        if (key.startsWith(`${session}|`) && key.includes(shortName)) { bill = b; break }
      }
    }
    
    if (!bill) { stats.unmatched++; continue }
    stats.matched++
    
    // URLフェッチ＆パース
    const url = row[tohyoCol].trim()
    const html = await fetchVotePage(url)
    
    scrapeCount++
    if (scrapeCount % 50 === 0) {
      process.stdout.write(`  📡 ${scrapeCount}/${urlRows.length} スクレイピング中...\r`)
      saveCache() // 定期キャッシュ保存
    }
    
    if (!html) { stats.scrapeFailed++; continue }
    
    const partyVotes = parseVotePage(html)
    if (partyVotes.length === 0) { stats.scrapeFailed++; continue }
    stats.scraped++
    
    for (const pv of partyVotes) {
      const key = `${bill.id}|${pv.party}|参議院`
      if (existingVotes.has(key)) { stats.skipped++; continue }
      votesToInsert.push({
        bill_id: bill.id,
        party_name: pv.party,
        vote: pv.vote,
        chamber: '参議院',
      })
      existingVotes.add(key)
    }
  }
  
  saveCache()
  console.log(`\n  → スクレイピング成功: ${stats.scraped}件 / 失敗: ${stats.scrapeFailed}件`)
  
  // 重複除去
  const seenInBatch = new Set()
  const dedupedVotes = []
  for (const v of votesToInsert) {
    const key = `${v.bill_id}|${v.party_name}|${v.chamber}`
    if (seenInBatch.has(key)) continue
    seenInBatch.add(key)
    dedupedVotes.push(v)
  }
  console.log(`\n━━━ 挿入: ${dedupedVotes.length}件 ━━━`)
  
  // バッチ挿入
  const batchSize = 500
  for (let i = 0; i < dedupedVotes.length; i += batchSize) {
    const batch = dedupedVotes.slice(i, i + batchSize)
    const { error } = await supabase
      .from('bill_votes')
      .upsert(batch, { onConflict: 'bill_id,party_name,chamber', ignoreDuplicates: true })
    
    if (error) {
      console.error(`  ❌ バッチ ${Math.floor(i/batchSize)+1} エラー: ${error.message}`)
      stats.errors += batch.length
    } else {
      stats.inserted += batch.length
      process.stdout.write(`  ✅ ${Math.min(i + batchSize, dedupedVotes.length)}/${dedupedVotes.length} 挿入完了\r`)
    }
  }
  
  // 結果
  console.log('\n\n━━━ 結果サマリー ━━━')
  console.log(`処理議案数:       ${stats.total}`)
  console.log(`  全会一致:       ${stats.zenkaiiichi}`)
  console.log(`  スクレイピング: ${stats.scraped} (失敗: ${stats.scrapeFailed})`)
  console.log(`DBマッチ:         ${stats.matched}`)
  console.log(`マッチなし:       ${stats.unmatched}`)
  console.log(`挿入成功:         ${stats.inserted}`)
  console.log(`既存スキップ:     ${stats.skipped}`)
  console.log(`エラー:           ${stats.errors}`)
  console.log('\n🎉 完了！')
}

main().catch(err => { console.error('❌ 致命的エラー:', err); process.exit(1) })
