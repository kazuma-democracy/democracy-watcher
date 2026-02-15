#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const envText = readFileSync(resolve(process.cwd(), '.env.local'), 'utf-8')
const vars = {}
for (const line of envText.split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.+)$/)
  if (m) vars[m[1]] = m[2].trim()
}
const supabase = createClient(vars.NEXT_PUBLIC_SUPABASE_URL, vars.SUPABASE_SERVICE_ROLE_KEY || vars.NEXT_PUBLIC_SUPABASE_ANON_KEY)

async function main() {
  console.log('=== 仮説2: meetingsのsessionカラムを確認 ===')
  const { data: mtgs } = await supabase
    .from('meetings')
    .select('id, session, meeting_name, date')
    .not('session', 'is', null)
    .limit(5)
  console.log(`  session非nullの会議: ${mtgs?.length || 0}件`)
  for (const m of mtgs || []) {
    console.log(`    session=${m.session} | ${m.date} | ${m.meeting_name}`)
  }

  const { count: nullCount } = await supabase
    .from('meetings')
    .select('*', { count: 'exact', head: true })
    .is('session', null)
  const { count: totalCount } = await supabase
    .from('meetings')
    .select('*', { count: 'exact', head: true })
  console.log(`  session=null: ${nullCount}件 / 全体: ${totalCount}件`)

  console.log('\n=== 仮説3: キーワード「出入国管理」の発言を直接検索 ===')
  // session絞りなしで検索
  const { data: sp1, count: c1 } = await supabase
    .from('speeches')
    .select('id, speaker_name, date', { count: 'exact' })
    .ilike('content', '%出入国管理%')
    .limit(5)
  console.log(`  「出入国管理」を含む発言（全体）: ${c1}件`)
  for (const s of sp1 || []) {
    console.log(`    ${s.date} | ${s.speaker_name}`)
  }

  console.log('\n=== 仮説1: ilike + join eq の問題再現 ===')
  // 現状のクエリ（問題のあるパターン）
  const { data: sp2, error: err2 } = await supabase
    .from('speeches')
    .select('id, speaker_name, meetings!inner(session, meeting_name)')
    .ilike('content', '%出入国管理%')
    .eq('meetings.session', 197)
    .limit(10)
  console.log(`  ilike+join eq結果: ${sp2?.length || 0}件  エラー: ${err2?.message || 'なし'}`)

  // 2段階クエリ（修正パターン）
  const { data: mtgs197 } = await supabase
    .from('meetings')
    .select('id')
    .eq('session', 197)
  console.log(`  第197回国会の会議数: ${mtgs197?.length || 0}件`)

  if (mtgs197 && mtgs197.length > 0) {
    const ids = mtgs197.map(m => m.id)
    const { data: sp3, count: c3 } = await supabase
      .from('speeches')
      .select('id, speaker_name, date', { count: 'exact' })
      .in('meeting_id', ids.slice(0, 50))
      .ilike('content', '%出入国管理%')
      .limit(10)
    console.log(`  2段階クエリ結果: ${c3}件`)
    for (const s of sp3 || []) {
      console.log(`    ${s.date} | ${s.speaker_name}`)
    }
  }
}

main().catch(console.error)
