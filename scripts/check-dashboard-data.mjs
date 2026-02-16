#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve } from 'path'
const envText = readFileSync(resolve(process.cwd(), '.env.local'), 'utf-8')
const vars = {}
for (const line of envText.split('\n')) { const m = line.match(/^([A-Z_]+)=(.+)$/); if (m) vars[m[1]] = m[2].trim() }
const supabase = createClient(vars.NEXT_PUBLIC_SUPABASE_URL, vars.SUPABASE_SERVICE_ROLE_KEY || vars.NEXT_PUBLIC_SUPABASE_ANON_KEY)

async function main() {
  // 1. speeches count
  const { count: spCount, error: spErr } = await supabase.from('speeches').select('*', { count: 'exact', head: true })
  console.log(`speeches count: ${spCount}  error: ${spErr?.message || 'なし'}`)

  // 2. v_legislator_rankings
  const { data: ranks, error: rankErr } = await supabase
    .from('v_legislator_rankings')
    .select('*')
    .order('speeches_1y', { ascending: false })
    .limit(3)
  console.log(`\nv_legislator_rankings: ${ranks?.length || 0}件  error: ${rankErr?.message || 'なし'}`)
  for (const r of ranks || []) console.log(`  ${r.name}: speeches_1y=${r.speeches_1y}`)

  // 3. v_trending_legislators_7d
  const { data: trend, error: trendErr } = await supabase
    .from('v_trending_legislators_7d')
    .select('*')
    .order('trend_score', { ascending: false })
    .limit(3)
  console.log(`\nv_trending_legislators_7d: ${trend?.length || 0}件  error: ${trendErr?.message || 'なし'}`)
  for (const t of trend || []) console.log(`  ${t.name}: trend_score=${t.trend_score}, speeches_7d=${t.speeches_7d}`)

  // 4. RLS check - try anon key
  const anonKey = vars.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const anonClient = createClient(vars.NEXT_PUBLIC_SUPABASE_URL, anonKey)
  const { count: anonCount, error: anonErr } = await anonClient.from('speeches').select('*', { count: 'exact', head: true })
  console.log(`\nAnon key speeches count: ${anonCount}  error: ${anonErr?.message || 'なし'}`)

  const { data: anonRanks, error: anonRankErr } = await anonClient
    .from('v_legislator_rankings')
    .select('*')
    .limit(1)
  console.log(`Anon key rankings: ${anonRanks?.length || 0}件  error: ${anonRankErr?.message || 'なし'}`)
}
main().catch(console.error)
