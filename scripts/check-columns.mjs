#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve } from 'path'
const envText = readFileSync(resolve(process.cwd(), '.env.local'), 'utf-8')
const vars = {}
for (const line of envText.split('\n')) { const m = line.match(/^([A-Z_]+)=(.+)$/); if (m) vars[m[1]] = m[2].trim() }
const supabase = createClient(vars.NEXT_PUBLIC_SUPABASE_URL, vars.SUPABASE_SERVICE_ROLE_KEY || vars.NEXT_PUBLIC_SUPABASE_ANON_KEY)
async function main() {
  const { data } = await supabase.from('legislators').select('*').limit(1)
  if (data && data[0]) console.log('legislators columns:', Object.keys(data[0]).join(', '))
  const { data: sp } = await supabase.from('speeches').select('*').limit(1)
  if (sp && sp[0]) console.log('speeches columns:', Object.keys(sp[0]).join(', '))
}
main().catch(console.error)
