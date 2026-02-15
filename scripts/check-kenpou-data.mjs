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
  // 1. 憲法審査会の会議を確認
  const { data: mtgs } = await supabase
    .from('meetings')
    .select('id, meeting_name, date, house')
    .ilike('meeting_name', '%憲法審査会%')
    .order('date', { ascending: false })
    .limit(5)
  
  console.log('=== 憲法審査会の会議（最新5件） ===')
  for (const m of mtgs || []) {
    console.log(`  ${m.date} | ${m.house} | ${m.meeting_name} | id=${m.id}`)
  }

  if (mtgs && mtgs.length > 0) {
    // 2. その会議IDでspeechesを検索
    const meetingIds = mtgs.map(m => m.id)
    const { data: spch, error } = await supabase
      .from('speeches')
      .select('id, speaker_name, meeting_id')
      .in('meeting_id', meetingIds)
      .limit(10)
    
    console.log(`\n=== 上記会議IDのspeech検索結果 ===`)
    console.log(`  件数: ${spch?.length || 0}  エラー: ${error?.message || 'なし'}`)
    for (const s of spch || []) {
      console.log(`  ${s.speaker_name} (meeting_id=${s.meeting_id})`)
    }

    // 3. speechesテーブル全体の件数
    const { count } = await supabase.from('speeches').select('*', { count: 'exact', head: true })
    console.log(`\n=== speechesテーブル総件数: ${count} ===`)

    // 4. ilike検索も試す（committee pageと同じクエリ）
    const { data: spch2, error: err2 } = await supabase
      .from('speeches')
      .select('id, speaker_name, meetings!inner(meeting_name)')
      .ilike('meetings.meeting_name', '%憲法審査会%')
      .limit(5)
    
    console.log(`\n=== ilike join検索結果 ===`)
    console.log(`  件数: ${spch2?.length || 0}  エラー: ${err2?.message || 'なし'}`)
  }
}

main().catch(console.error)
