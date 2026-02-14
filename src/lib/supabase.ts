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
  if (party.includes('保守')) return 'hoshu'
  if (party.includes('有志の会')) return 'yushi'
  if (party.includes('沖縄の風')) return 'okinawa'
  if (party.includes('NHK') || party.includes('ＮＨＫ')) return 'nhk'
  if (party.includes('みらい') || party.includes('安野')) return 'mirai'
  if (party.includes('減税')) return 'other'
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
  if (party.includes('保守')) return '保守'
  if (party.includes('有志の会')) return '有志'
  if (party.includes('沖縄の風')) return '沖縄'
  if (party.includes('NHK') || party.includes('ＮＨＫ')) return 'NHK'
  if (party.includes('みらい')) return 'みらい'
  if (party.includes('減税')) return '減税'
  if (party.includes('無所属')) return '無所属'
  if (party.includes('各派に属しない')) return '無所属'
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

// 発言の全文検索（発言者フィルター対応）
export async function searchSpeeches(keyword: string, limit = 50, speakerName?: string) {
  let query = supabase
    .from('speeches')
    .select('*, legislators!inner(name, name_yomi, current_party), meetings(meeting_name, house, date)')
    .ilike('content', '%' + keyword + '%')

  // 発言者フィルター
  if (speakerName && speakerName.trim()) {
    query = query.ilike('speaker_name', '%' + speakerName.trim() + '%')
  }

  const { data, error } = await query
    .order('date', { ascending: false })
    .limit(limit)

  if (error) return []
  return data
}

// === 議案関連 ===

export type Bill = {
  id: string
  house: string
  session: number | null
  submit_session: number | null
  bill_type: string | null
  bill_number: number | null
  bill_name: string
  caption: string | null
  status: string | null
  proposer: string | null
  proposer_party: string | null
  committee: string | null
  date_submitted: string | null
  date_passed: string | null
  result: string | null
  law_number: string | null
  progress_url: string | null
  bill_votes?: BillVote[]
}

export type BillVote = {
  id: string
  bill_id: string
  party_name: string
  vote: string  // '賛成' or '反対'
  chamber: string
}

export async function getBills(options: {
  session?: number
  status?: string
  billType?: string
  search?: string
  limit?: number
  offset?: number
} = {}) {
  const { session, status, billType, search, limit = 50, offset = 0 } = options

  let query = supabase
    .from('bills')
    .select('*, bill_votes(*)')
    .order('session', { ascending: false })
    .order('bill_number', { ascending: true })
    .range(offset, offset + limit - 1)

  if (session) query = query.eq('session', session)
  if (status) query = query.eq('status', status)
  if (billType) query = query.eq('bill_type', billType)
  if (search) query = query.ilike('bill_name', `%${search}%`)

  const { data, error } = await query
  if (error) { console.error(error); return [] }
  return data as Bill[]
}

export async function getBillSessions(): Promise<number[]> {
  const { data, error } = await supabase
    .from('bills')
    .select('session')
    .order('session', { ascending: false })

  if (error || !data) return []
  const sessionSet = new Set(data.map((d: any) => d.session).filter(Boolean))
  const sessions = Array.from(sessionSet) as number[]
  return sessions.sort((a, b) => b - a)
}

export async function getBill(id: string): Promise<Bill | null> {
  const { data, error } = await supabase
    .from('bills')
    .select('*, bill_votes(*)')
    .eq('id', id)
    .single()
  if (error) return null
  return data as Bill
}

/**
 * 議案名からキーワードを抽出して関連発言を検索
 * 例: "消費税率の引上げに伴う...法律案" → "消費税" で発言検索
 */
export function extractBillKeywords(billName: string): string[] {
  // 一般的な接尾辞を除去
  let name = billName
    .replace(/の一部を改正する法律案$/, '')
    .replace(/に関する法律案$/, '')
    .replace(/法律案$/, '')
    .replace(/に関する件$/, '')
    .replace(/に関する決議案$/, '')
    .replace(/等$/, '')
    .replace(/及び.*$/, '')  // 「及び」以降を除去（長くなりすぎ防止）
    .trim()

  // 短すぎる場合は元の名前から
  if (name.length < 4) name = billName.replace(/法律案$/, '').trim()

  return [name]
}

export async function getRelatedSpeeches(bill: Bill, limit = 30) {
  const keywords = extractBillKeywords(bill.bill_name)
  if (keywords.length === 0) return []

  // 議案名のキーワードで発言を検索（同じ国会回次）
  let query = supabase
    .from('speeches')
    .select('id, speaker_name, speaker_group, speaker_position, content, speech_url, date, legislator_id, legislators(id, name, current_party), meetings!inner(id, session, meeting_name, house, date)')
    .ilike('content', `%${keywords[0]}%`)

  // セッション絞り込み（提出回次ベース）
  if (bill.submit_session) {
    query = query.eq('meetings.session', bill.submit_session)
  }

  const { data, error } = await query
    .order('date', { ascending: false })
    .limit(limit)

  if (error) { console.error('Related speeches error:', error); return [] }
  return data || []
}
