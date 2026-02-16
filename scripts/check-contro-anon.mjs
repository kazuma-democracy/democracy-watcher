#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve } from 'path'
const envText = readFileSync(resolve(process.cwd(), '.env.local'), 'utf-8')
const vars = {}
for (const line of envText.split('\n')) { const m = line.match(/^([A-Z_]+)=(.+)$/); if (m) vars[m[1]] = m[2].trim() }

// anon key（フロントと同じ）
const supabase = createClient(vars.NEXT_PUBLIC_SUPABASE_URL, vars.NEXT_PUBLIC_SUPABASE_ANON_KEY)

async function main() {
  console.log('=== v_bill_controversy (anon key) ===')
  const t1 = Date.now()
  const { data: d1, error: e1 } = await supabase
    .from('v_bill_controversy')
    .select('*')
    .order('controversy_score', { ascending: false })
    .limit(5)
  console.log(`  ${Date.now() - t1}ms | ${d1?.length || 0}件 | error: ${e1?.message || 'なし'}`)

  console.log('\n=== rubber stamp query (anon key) ===')
  const t2 = Date.now()
  const { data: d2, error: e2 } = await supabase
    .from('v_bill_controversy')
    .select('*')
    .lte('no_parties', 2)
    .gte('yes_parties', 4)
    .order('yes_parties', { ascending: false })
    .limit(5)
  console.log(`  ${Date.now() - t2}ms | ${d2?.length || 0}件 | error: ${e2?.message || 'なし'}`)

  console.log('\n=== service role key で同じクエリ ===')
  const supa2 = createClient(vars.NEXT_PUBLIC_SUPABASE_URL, vars.SUPABASE_SERVICE_ROLE_KEY || vars.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  const t3 = Date.now()
  const { data: d3, error: e3 } = await supa2
    .from('v_bill_controversy')
    .select('*')
    .order('controversy_score', { ascending: false })
    .limit(5)
  console.log(`  ${Date.now() - t3}ms | ${d3?.length || 0}件 | error: ${e3?.message || 'なし'}`)
}
main().catch(console.error)
