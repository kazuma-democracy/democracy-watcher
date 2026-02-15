#!/usr/bin/env node
/**
 * 参議院CSVの採決関連カラムを分析する診断スクリプト
 * 
 * 使い方:
 *   node scripts/analyze-san-votes.mjs
 */

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

async function main() {
  console.log('⬇️  参議院CSVをダウンロード中...')
  const res = await fetch('https://raw.githubusercontent.com/smartnews-smri/house-of-councillors/main/data/gian.csv')
  const text = await res.text()
  const rows = parseCSV(text)
  console.log(`→ ${rows.length}行をパース\n`)

  // 採決関連カラムを特定
  const keys = Object.keys(rows[0])
  const voteRelated = keys.filter(k => 
    k.includes('採決') || k.includes('態様') || k.includes('投票') || 
    k.includes('議決') || k.includes('賛成') || k.includes('反対')
  )
  
  console.log('=== 採決関連カラム ===')
  for (const col of voteRelated) {
    console.log(`  「${col}」`)
  }
  console.log()

  // 各カラムの値のサンプルと統計
  for (const col of voteRelated) {
    const values = rows.map(r => r[col]).filter(v => v && v.trim() !== '')
    const unique = [...new Set(values)]
    
    console.log(`\n━━━ 「${col}」 ━━━`)
    console.log(`  非空: ${values.length}件 / ユニーク: ${unique.length}件`)
    
    // 値のサンプル（最大20個、長いものも含む）
    console.log('  サンプル値:')
    const samples = unique.slice(0, 25)
    for (const s of samples) {
      const count = values.filter(v => v === s).length
      console.log(`    [${count}件] ${s.substring(0, 200)}${s.length > 200 ? '...' : ''}`)
    }
    if (unique.length > 25) {
      console.log(`    ... 他 ${unique.length - 25}種類`)
    }
  }

  // 特に「採決態様」を深堀り — 会派名が含まれるか？
  const taiyoCol = keys.find(k => k.includes('採決態様'))
  if (taiyoCol) {
    console.log(`\n\n━━━ 「${taiyoCol}」の詳細分析 ━━━`)
    const values = rows.map(r => r[taiyoCol]).filter(v => v && v.trim() !== '')
    
    // 会派名を含むものを探す
    const partyKeywords = ['自民', '立憲', '公明', '維新', '共産', '国民', 'れいわ', '社民']
    const withParty = values.filter(v => partyKeywords.some(p => v.includes(p)))
    console.log(`  会派名を含む値: ${withParty.length}件`)
    for (const v of withParty.slice(0, 15)) {
      console.log(`    ${v.substring(0, 300)}`)
    }
  }

  // 「投票結果」を深堀り
  const tohyoCol = keys.find(k => k.includes('投票結果'))
  if (tohyoCol) {
    console.log(`\n\n━━━ 「${tohyoCol}」の詳細分析 ━━━`)
    const values = rows.map(r => r[tohyoCol]).filter(v => v && v.trim() !== '')
    console.log(`  非空: ${values.length}件`)
    
    const withParty = values.filter(v => 
      ['自民', '立憲', '公明', '維新', '共産', '賛成', '反対'].some(p => v.includes(p))
    )
    console.log(`  会派/賛否を含む値: ${withParty.length}件`)
    for (const v of withParty.slice(0, 15)) {
      console.log(`    ${v.substring(0, 400)}`)
    }
  }
}

main().catch(err => { console.error('❌ エラー:', err); process.exit(1) })
