import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co'
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder'

export const supabase = createClient(supabaseUrl, supabaseKey)

// === 型定義 ===

export type Legislator = {
  id: string
  name: string
  name_yomi: string | null
  current_party: string | null
  current_position: string | null
  house: string | null
  district: string | null
  first_seen: string | null
  last_seen: string | null
  speech_count?: number
}

export type Speech = {
  id: string
  speech_id: string
  legislator_id: string | null
  meeting_id: string | null
  speech_order: number | null
  speaker_name: string
  speaker_group: string | null
  speaker_position: string | null
  content: string | null
  ai_summary: string | null
  speech_url: string | null
  date: string
}

export type Meeting = {
  id: string
  issue_id: string
  session: number | null
  house: string
  meeting_name: string
  issue_number: string | null
  date: string
  meeting_url: string | null
}

// === 政党カラー判定（修正版） ===

export function getPartyClass(party: string | null): string {
  if (!party) return 'other'
  if (party === '社会民主党' || party === '社民党') return 'sdp'
  if (party.includes('自由民主党')) return 'ldp'
  if (party.includes('立憲民主')) return 'cdp'
  if (party.includes('公明')) return 'komeito'
  if (party.includes('維新')) return 'ishin'
  if (party.includes('国民民主')) return 'dpfp'
  if (party.includes('共産')) return 'jcp'
  if (party.includes('れいわ')) return 'reiwa'
  if (party.includes('参政')) return 'sansei'
  if (party.includes('みらい')) return 'mirai'
  return 'other'
}

export function getPartyShortName(party: string | null): string {
  if (!party) return '無所属'
  if (party === '社会民主党' || party === '社民党') return '社民'
  if (party.includes('自由民主党')) return '自民'
  if (party.includes('立憲民主')) return '立憲'
  if (party.includes('公明')) return '公明'
  if (party.includes('維新')) return '維新'
  if (party.includes('国民民主')) return '国民'
  if (party.includes('共産')) return '共産'
  if (party.includes('れいわ')) return 'れいわ'
  if (party.includes('参政')) return '参政'
  if (party.includes('みらい')) return 'みらい'
  if (party.includes('無所属')) return '無所属'
  if (party.length > 6) return party.substring(0, 5) + '…'
  return party
}

// === データ取得関数 ===

export async function getLegislatorsWithCounts() {
  const { data, error } = await supabase
    .from('legislators_with_counts')
    .select('*')
    .range(0, 4999)

  if (error) {
    console.error('View error, falling back:', error)
    const { data: legs } = await supabase
      .from('legislators')
      .select('*')
      .order('name')
      .range(0, 4999)
    return (legs || []).map((l: any) => ({ ...l, speech_count: 0 }))
  }
  return data as (Legislator & { speech_count: number })[]
}

export async function getLegislator(id: string) {
  const { data, error } = await supabase
    .from('legislators')
    .select('*')
    .eq('id', id)
    .single()
  if (error) return null
  return data as Legislator
}

export async function getSpeeches(legislatorId: string, limit = 20) {
  const { data, error } = await supabase
    .from('speeches')
    .select('*, meetings(meeting_name, house, date)')
    .eq('legislator_id', legislatorId)
    .order('date', { ascending: false })
    .limit(limit)
  if (error) return []
  return data
}

export async function getStats() {
  const [legislators, speeches, meetings] = await Promise.all([
    supabase.from('legislators').select('*', { count: 'exact', head: true }),
    supabase.from('speeches').select('*', { count: 'exact', head: true }),
    supabase.from('meetings').select('*', { count: 'exact', head: true }),
  ])
  return {
    legislators: legislators.count || 0,
    speeches: speeches.count || 0,
    meetings: meetings.count || 0,
  }
}

export async function searchSpeeches(keyword: string, limit = 50) {
  const { data, error } = await supabase
    .from('speeches')
    .select('*, legislators!inner(name, name_yomi, current_party), meetings(meeting_name, house, date)')
    .ilike('content', '%' + keyword + '%')
    .order('date', { ascending: false })
    .limit(limit)
  if (error) return []
  return data
}
