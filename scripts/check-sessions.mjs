#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve } from 'path'
const envText = readFileSync(resolve(process.cwd(), '.env.local'), 'utf-8')
const vars = {}
for (const line of envText.split('\n')) { const m = line.match(/^([A-Z_]+)=(.+)$/); if (m) vars[m[1]] = m[2].trim() }
const supabase = createClient(vars.NEXT_PUBLIC_SUPABASE_URL, vars.SUPABASE_SERVICE_ROLE_KEY || vars.NEXT_PUBLIC_SUPABASE_ANON_KEY)

async function main() {
  // 回次ごとの会議数
  const { data: mtgs } = await supabase.from('meetings').select('session')
  const sessionMap = {}
  for (const m of mtgs || []) { sessionMap[m.session] = (sessionMap[m.session] || 0) + 1 }
  const sorted = Object.entries(sessionMap).sort((a, b) => Number(a[0]) - Number(b[0]))
  
  console.log('=== 回次別の会議数 ===')
  for (const [s, c] of sorted) console.log(`  第${s}回: ${c}件`)
  
  console.log(`\n=== bills側の回次分布（上位10） ===`)
  const { data: bills } = await supabase.from('bills').select('session')
  const billMap = {}
  for (const b of bills || []) { billMap[b.session] = (billMap[b.session] || 0) + 1 }
  const billSorted = Object.entries(billMap).sort((a, b) => Number(b[1]) - Number(a[1]))
  for (const [s, c] of billSorted.slice(0, 15)) console.log(`  第${s}回: ${c}件`)
  
  // speechesの総件数とdate範囲
  const { data: range } = await supabase.from('speeches').select('date').order('date', { ascending: true }).limit(1)
  const { data: range2 } = await supabase.from('speeches').select('date').order('date', { ascending: false }).limit(1)
  console.log(`\n=== speeches期間 ===`)
  console.log(`  最古: ${range?.[0]?.date}  最新: ${range2?.[0]?.date}`)
}
main().catch(console.error)
