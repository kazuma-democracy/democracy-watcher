#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve } from 'path'
const envText = readFileSync(resolve(process.cwd(), '.env.local'), 'utf-8')
const vars = {}
for (const line of envText.split('\n')) { const m = line.match(/^([A-Z_]+)=(.+)$/); if (m) vars[m[1]] = m[2].trim() }
const supabase = createClient(vars.NEXT_PUBLIC_SUPABASE_URL, vars.SUPABASE_SERVICE_ROLE_KEY || vars.NEXT_PUBLIC_SUPABASE_ANON_KEY)

async function main() {
  const { count: total } = await supabase.from('bills').select('*', { count: 'exact', head: true })
  const { count: hasSubmit } = await supabase.from('bills').select('*', { count: 'exact', head: true }).not('date_submitted', 'is', null)
  const { count: hasPassed } = await supabase.from('bills').select('*', { count: 'exact', head: true }).not('date_passed', 'is', null)
  
  console.log(`bills総数: ${total}`)
  console.log(`date_submitted あり: ${hasSubmit} (${Math.round(hasSubmit/total*100)}%)`)
  console.log(`date_passed あり: ${hasPassed} (${Math.round(hasPassed/total*100)}%)`)

  // サンプル
  const { data: samples } = await supabase.from('bills').select('session, bill_name, date_submitted, date_passed')
    .not('date_submitted', 'is', null).limit(5)
  console.log('\nサンプル:')
  for (const b of samples || []) {
    console.log(`  第${b.session}回 | 提出:${b.date_submitted} | 成立:${b.date_passed || '-'} | ${b.bill_name?.substring(0,30)}`)
  }

  // 217-220回のbills数（speeches期間内）
  const { count: inRange } = await supabase.from('bills').select('*', { count: 'exact', head: true })
    .gte('session', 217).lte('session', 220)
  console.log(`\n第217-220回のbills: ${inRange}件`)

  // 208-216回のbills数（取得候補）
  const { count: target } = await supabase.from('bills').select('*', { count: 'exact', head: true })
    .gte('session', 208).lte('session', 216)
  console.log(`第208-216回のbills: ${target}件（取得候補）`)
}
main().catch(console.error)
