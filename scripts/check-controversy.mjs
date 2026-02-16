#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve } from 'path'
const envText = readFileSync(resolve(process.cwd(), '.env.local'), 'utf-8')
const vars = {}
for (const line of envText.split('\n')) { const m = line.match(/^([A-Z_]+)=(.+)$/); if (m) vars[m[1]] = m[2].trim() }
const supabase = createClient(vars.NEXT_PUBLIC_SUPABASE_URL, vars.SUPABASE_SERVICE_ROLE_KEY || vars.NEXT_PUBLIC_SUPABASE_ANON_KEY)

async function main() {
  console.log('=== v_bill_controversy TOP 10 ===')
  const { data, error } = await supabase
    .from('v_bill_controversy')
    .select('*')
    .order('controversy_score', { ascending: false })
    .limit(10)
  
  if (error) { console.error('Error:', error.message); return }
  for (const b of data || []) {
    console.log(`  score=${b.controversy_score} | 賛成${b.yes_parties} 反対${b.no_parties} | ${b.bill_name?.substring(0, 50)}`)
    console.log(`    keys: ${Object.keys(b).join(', ')}`)
    break // show keys once
  }
  console.log('')
  for (const b of data || []) {
    console.log(`  ${b.controversy_score?.toFixed?.(1) || b.controversy_score} | Y:${b.yes_parties} N:${b.no_parties} | ${b.bill_name?.substring(0, 60)}`)
  }

  console.log('\n=== v_trending_bills_7d TOP 5 ===')
  const { data: tb, error: te } = await supabase
    .from('v_trending_bills_7d')
    .select('*')
    .order('speech_hits_7d', { ascending: false })
    .limit(5)
  if (te) { console.error('Error:', te.message); return }
  for (const b of tb || []) {
    console.log(`  hits=${b.speech_hits_7d} | ${b.bill_name?.substring(0, 60)}`)
  }
}
main().catch(console.error)
