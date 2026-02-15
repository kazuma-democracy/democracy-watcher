#!/usr/bin/env node
/**
 * SMRI賛否データインポーター
 * 
 * SmartNews Media Research Institute の衆議院・参議院データから
 * 政党別の賛否を bill_votes テーブルにインポートする。
 * 
 * 使い方:
 *   cd C:\Users\wetli\Desktop\Democracy\democracy-watcher-app
 *   node scripts/import-smri-votes.mjs
 * 
 * 前提:
 *   - .env.local に NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY がある
 *   - Node.js 18+ (native fetch)
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'

// ===== 設定 =====
const SMRI_URLS = {
  shu: 'https://raw.githubusercontent.com/smartnews-smri/house-of-representatives/main/data/gian.csv',
  san: 'https://raw.githubusercontent.com/smartnews-smri/house-of-councillors/main/data/gian.csv',
}

// .env.local 読み込み
function loadEnv() {
  const envPath = resolve(process.cwd(), '.env.local')
  if (!existsSync(envPath)) {
    console.error('❌ .env.local が見つかりません。プロジェクトルートで実行してください。')
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
const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Supabase接続情報が .env.local にありません')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

// ===== CSV パーサー（日本語対応） =====
function parseCSV(text) {
  const lines = text.split('\n')
  if (lines.length < 2) return []
  
  // ヘッダー行をパース
  const headers = parseCSVLine(lines[0])
  const rows = []
  
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue
    
    const values = parseCSVLine(line)
    if (values.length !== headers.length) continue // skip malformed rows
    
    const row = {}
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = values[j]
    }
    rows.push(row)
  }
  
  return rows
}

function parseCSVLine(line) {
  const result = []
  let current = ''
  let inQuotes = false
  
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        current += ch
      }
    } else {
      if (ch === '"') {
        inQuotes = true
      } else if (ch === ',') {
        result.push(current.trim())
        current = ''
      } else {
        current += ch
      }
    }
  }
  result.push(current.trim())
  return result
}

// ===== 会派名の正規化 =====
// SMRI の会派名「自由民主党・無所属の会」→「自由民主党」等
const PARTY_NORMALIZE = {
  '自由民主党・無所属の会': '自由民主党',
  '自民': '自由民主党',
  '立憲民主党・無所属': '立憲民主党',
  '立憲民主・社民・無所属': '立憲民主党',
  '立憲': '立憲民主党',
  '公明': '公明党',
  '維新': '日本維新の会',
  '日本維新の会・無所属の会': '日本維新の会',
  '日本維新の会（馬場派）': '日本維新の会',
  '国民民主党・無所属クラブ': '国民民主党',
  '国民民主党・新緑風会': '国民民主党',
  '民主': '国民民主党',
  '共産': '日本共産党',
  'れ新': 'れいわ新選組',
  '参政': '参政党',
  '社民': '社会民主党',
  '教育': '教育無償化を実現する会',
  '沖縄の風': '沖縄の風',
  'NHKから国民を守る党': 'NHK党',
  'みんなの党': 'みんなの党',
  '無所属': '無所属',
  '各派に属しない議員': '無所属',
}

function normalizePartyName(raw) {
  const trimmed = raw.trim()
  if (!trimmed) return null
  // 完全一致
  if (PARTY_NORMALIZE[trimmed]) return PARTY_NORMALIZE[trimmed]
  // 部分一致
  for (const [key, val] of Object.entries(PARTY_NORMALIZE)) {
    if (trimmed.includes(key)) return val
  }
  // そのまま返す
  return trimmed
}

// 賛成会派・反対会派のテキストを分割してパーティ配列にする
function parseParties(text) {
  if (!text || text.trim() === '' || text === '-' || text === '－') return []
  
  // 区切りパターン: 「、」「；」「;」「／」「/」
  const parts = text.split(/[、；;／\/]/)
  const parties = []
  
  for (const part of parts) {
    const normalized = normalizePartyName(part)
    if (normalized && !parties.includes(normalized)) {
      parties.push(normalized)
    }
  }
  
  return parties
}

// ===== 既存 bills のマッピング構築 =====
async function loadBillsMap() {
  console.log('📦 既存billsを読み込み中...')
  
  let allBills = []
  let from = 0
  const pageSize = 1000
  
  while (true) {
    const { data, error } = await supabase
      .from('bills')
      .select('id, session, bill_name, bill_type, bill_number, house')
      .range(from, from + pageSize - 1)
    
    if (error) {
      console.error('❌ bills取得エラー:', error.message)
      break
    }
    
    allBills = allBills.concat(data)
    if (data.length < pageSize) break
    from += pageSize
  }
  
  console.log(`  → ${allBills.length}件のbillsを取得`)
  
  // 複合キーでマップ: "session|bill_name" → bill
  const byName = new Map()
  // "session|bill_type|bill_number" → bill
  const byNumber = new Map()
  
  for (const b of allBills) {
    if (b.session && b.bill_name) {
      byName.set(`${b.session}|${b.bill_name}`, b)
    }
    if (b.session && b.bill_type && b.bill_number) {
      byNumber.set(`${b.session}|${b.bill_type}|${b.bill_number}`, b)
    }
  }
  
  return { byName, byNumber, count: allBills.length }
}

// ===== 既存 bill_votes の取得（重複回避） =====
async function loadExistingVotes() {
  console.log('📦 既存bill_votesを読み込み中...')
  
  let allVotes = []
  let from = 0
  const pageSize = 1000
  
  while (true) {
    const { data, error } = await supabase
      .from('bill_votes')
      .select('bill_id, party_name, vote, chamber')
      .range(from, from + pageSize - 1)
    
    if (error) {
      console.error('❌ bill_votes取得エラー:', error.message)
      break
    }
    
    allVotes = allVotes.concat(data)
    if (data.length < pageSize) break
    from += pageSize
  }
  
  console.log(`  → ${allVotes.length}件の既存votesを取得`)
  
  // "bill_id|party_name|chamber" → true (DB unique constraint)
  const existing = new Set()
  for (const v of allVotes) {
    existing.add(`${v.bill_id}|${v.party_name}|${v.chamber}`)
  }
  
  return existing
}

// ===== CSVダウンロード =====
async function downloadCSV(url, label) {
  console.log(`⬇️  ${label}のCSVをダウンロード中...`)
  console.log(`   URL: ${url}`)
  
  try {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const text = await res.text()
    console.log(`  → ${(text.length / 1024 / 1024).toFixed(1)}MB 取得完了`)
    return text
  } catch (err) {
    console.error(`❌ ダウンロード失敗: ${err.message}`)
    return null
  }
}

// ===== カラム名の自動検出 =====
function detectColumns(rows) {
  if (rows.length === 0) return null
  
  const keys = Object.keys(rows[0])
  console.log(`  カラム: ${keys.join(', ')}`)
  
  // 賛成会派カラムを探す
  const yesCol = keys.find(k => 
    k.includes('賛成会派') || k.includes('賛成した会派') || k === '賛成'
  )
  const noCol = keys.find(k => 
    k.includes('反対会派') || k.includes('反対した会派') || k === '反対'
  )
  const sessionCol = keys.find(k => 
    k.includes('掲載回次') || k.includes('回次') || k === 'session'
  )
  const nameCol = keys.find(k => 
    k.includes('議案件名') || k.includes('件名') || k.includes('議案名称')
  )
  const typeCol = keys.find(k => 
    k.includes('議案種類') || k === '種類'
  )
  const numberCol = keys.find(k => 
    k === '番号' || k.includes('議案番号')
  )
  
  console.log(`  検出: 賛成=${yesCol || '?'}, 反対=${noCol || '?'}, 回次=${sessionCol || '?'}, 件名=${nameCol || '?'}`)
  
  return { yesCol, noCol, sessionCol, nameCol, typeCol, numberCol }
}

// ===== メイン処理 =====
async function main() {
  console.log('🗳️  SMRI賛否データインポーター')
  console.log('================================')
  console.log(`Supabase: ${supabaseUrl}`)
  console.log()
  
  // 既存データ読み込み
  const billsMap = await loadBillsMap()
  const existingVotes = await loadExistingVotes()
  
  const stats = {
    csvRows: 0,
    withVotes: 0,
    matched: 0,
    unmatched: 0,
    inserted: 0,
    skipped: 0,
    errors: 0,
    unmatchedSamples: [],
  }
  
  // 衆議院・参議院の順にインポート
  for (const [key, url] of Object.entries(SMRI_URLS)) {
    const chamber = key === 'shu' ? '衆議院' : '参議院'
    const label = key === 'shu' ? '衆議院' : '参議院'
    
    console.log()
    console.log(`━━━ ${label} ━━━`)
    
    const csvText = await downloadCSV(url, label)
    if (!csvText) continue
    
    const rows = parseCSV(csvText)
    console.log(`  → ${rows.length}行をパース`)
    stats.csvRows += rows.length
    
    const cols = detectColumns(rows)
    if (!cols || !cols.sessionCol || !cols.nameCol) {
      console.error('❌ 必要なカラムが見つかりません。スキップ。')
      continue
    }
    
    if (!cols.yesCol && !cols.noCol) {
      console.error('❌ 賛成会派・反対会派カラムが見つかりません。スキップ。')
      continue
    }
    
    // 投票レコードを収集
    const votesToInsert = []
    
    for (const row of rows) {
      const session = parseInt(row[cols.sessionCol])
      const billName = row[cols.nameCol]?.trim()
      if (!session || !billName) continue
      
      const yesText = cols.yesCol ? row[cols.yesCol] : ''
      const noText = cols.noCol ? row[cols.noCol] : ''
      
      const yesParties = parseParties(yesText)
      const noParties = parseParties(noText)
      
      if (yesParties.length === 0 && noParties.length === 0) continue
      stats.withVotes++
      
      // billを検索（名前マッチ優先、次に番号マッチ）
      let bill = billsMap.byName.get(`${session}|${billName}`)
      
      if (!bill && cols.typeCol && cols.numberCol) {
        const bType = row[cols.typeCol]?.trim()
        const bNum = parseInt(row[cols.numberCol])
        if (bType && bNum) {
          bill = billsMap.byNumber.get(`${session}|${bType}|${bNum}`)
        }
      }
      
      // 名前の部分一致も試す
      if (!bill) {
        // 短い名前で探す（先頭30文字）
        const shortName = billName.substring(0, 30)
        for (const [key, b] of billsMap.byName.entries()) {
          if (key.startsWith(`${session}|`) && key.includes(shortName)) {
            bill = b
            break
          }
        }
      }
      
      if (!bill) {
        stats.unmatched++
        if (stats.unmatchedSamples.length < 10) {
          stats.unmatchedSamples.push(`第${session}回 ${billName.substring(0, 40)}`)
        }
        continue
      }
      
      stats.matched++
      
      // 賛成レコード
      for (const party of yesParties) {
        const voteKey = `${bill.id}|${party}|${chamber}`
        if (existingVotes.has(voteKey)) {
          stats.skipped++
          continue
        }
        votesToInsert.push({
          bill_id: bill.id,
          party_name: party,
          vote: '賛成',
          chamber,
        })
        existingVotes.add(voteKey) // 重複防止
      }
      
      // 反対レコード
      for (const party of noParties) {
        const voteKey = `${bill.id}|${party}|${chamber}`
        if (existingVotes.has(voteKey)) {
          stats.skipped++
          continue
        }
        votesToInsert.push({
          bill_id: bill.id,
          party_name: party,
          vote: '反対',
          chamber,
        })
        existingVotes.add(voteKey)
      }
    }
    
    console.log(`  → ${votesToInsert.length}件の投票レコードを挿入予定`)
    
    // バッチ内の重複を除去（同一bill_id+party+chamberが複数回次で重複する場合）
    const seenInBatch = new Set()
    const dedupedVotes = []
    for (const v of votesToInsert) {
      const key = `${v.bill_id}|${v.party_name}|${v.chamber}`
      if (seenInBatch.has(key)) continue
      seenInBatch.add(key)
      dedupedVotes.push(v)
    }
    if (dedupedVotes.length !== votesToInsert.length) {
      console.log(`  → 重複除去: ${votesToInsert.length} → ${dedupedVotes.length}件`)
    }

    // バッチ挿入（500件ずつ、upsertでconflict回避）
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
    console.log()
  }
  
  // 結果サマリー
  console.log()
  console.log('━━━ 結果サマリー ━━━')
  console.log(`CSV行数:        ${stats.csvRows}`)
  console.log(`賛否あり:       ${stats.withVotes}`)
  console.log(`DBマッチ:       ${stats.matched}`)
  console.log(`マッチなし:     ${stats.unmatched}`)
  console.log(`挿入成功:       ${stats.inserted}`)
  console.log(`既存スキップ:   ${stats.skipped}`)
  console.log(`エラー:         ${stats.errors}`)
  
  if (stats.unmatchedSamples.length > 0) {
    console.log()
    console.log('⚠️  マッチしなかった例:')
    for (const s of stats.unmatchedSamples) {
      console.log(`   ${s}`)
    }
  }
  
  console.log()
  console.log('🎉 完了！')
  console.log('   分析VIEWが自動的に更新されます。')
  console.log('   ダッシュボードの「注目トピック」や分析ページを確認してください。')
}

main().catch(err => {
  console.error('❌ 致命的エラー:', err)
  process.exit(1)
})
