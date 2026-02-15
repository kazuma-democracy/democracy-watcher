'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { getBill, getRelatedSpeeches, extractBillKeywords, getPartyClass, getPartyShortName, getHouseLabel } from '@/lib/supabase'
import type { Bill } from '@/lib/supabase'

type RelatedSpeech = {
  id: string
  speaker_name: string
  speaker_group: string | null
  speaker_position: string | null
  content: string | null
  speech_url: string | null
  date: string
  legislator_id: string | null
  legislators?: { id: string; name: string; current_party: string | null } | null
  meetings?: { id: string; session: number; meeting_name: string; house: string; date: string } | null
}

export default function BillDetailPage() {
  const params = useParams()
  const id = params.id as string

  const [bill, setBill] = useState<Bill | null>(null)
  const [speeches, setSpeeches] = useState<RelatedSpeech[]>([])
  const [loading, setLoading] = useState(true)
  const [speechLoading, setSpeechLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const b = await getBill(id)
      setBill(b)
      setLoading(false)

      if (b) {
        setSpeechLoading(true)
        const sp = await getRelatedSpeeches(b, 50)
        setSpeeches(sp as any[])
        setSpeechLoading(false)
      }
    }
    load()
  }, [id])

  function truncate(text: string | null, len = 200) {
    if (!text) return ''
    const cleaned = text.replace(/^○.+?　/, '')
    if (cleaned.length <= len) return cleaned
    return cleaned.substring(0, len) + '...'
  }

  function highlightKeyword(text: string, keywords: string[]) {
    if (!keywords.length) return text
    // キーワード部分を太字にする（JSXで）
    const kw = keywords[0]
    const idx = text.indexOf(kw)
    if (idx === -1) return text
    return (
      <>
        {text.substring(0, idx)}
        <span className="text-yellow-300 font-bold">{kw}</span>
        {text.substring(idx + kw.length)}
      </>
    )
  }

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-20 text-center">
        <div className="animate-pulse">
          <div className="text-4xl mb-4">📜</div>
          <p className="text-slate-400">議案データを読み込み中...</p>
        </div>
      </div>
    )
  }

  if (!bill) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-20 text-center">
        <div className="text-4xl mb-4">❌</div>
        <p className="text-slate-400">議案が見つかりません</p>
        <a href="/bills" className="text-blue-400 hover:underline text-sm mt-4 inline-block">← 議案一覧に戻る</a>
      </div>
    )
  }

  const votes = bill.bill_votes || []
  const yea = votes.filter(v => v.vote === '賛成')
  const nay = votes.filter(v => v.vote === '反対')
  const keywords = extractBillKeywords(bill.bill_name)

  // ステータスの色
  const statusColor = (() => {
    if (!bill.status) return 'text-slate-400 bg-slate-800 border-slate-700'
    if (bill.status === '成立') return 'text-emerald-300 bg-emerald-900/50 border-emerald-700/50'
    if (bill.status.includes('否決')) return 'text-red-300 bg-red-900/50 border-red-700/50'
    if (bill.status.includes('審議中')) return 'text-yellow-300 bg-yellow-900/50 border-yellow-700/50'
    if (bill.status === '撤回') return 'text-slate-400 bg-slate-800 border-slate-600'
    return 'text-sky-300 bg-sky-900/50 border-sky-700/50'
  })()

  const typeColor = (() => {
    if (bill.bill_type === '閣法') return 'text-blue-300 bg-blue-900/40'
    if (bill.bill_type === '衆法') return 'text-orange-300 bg-orange-900/40'
    if (bill.bill_type === '参法') return 'text-purple-300 bg-purple-900/40'
    if (bill.bill_type === '予算') return 'text-pink-300 bg-pink-900/40'
    if (bill.bill_type === '条約') return 'text-teal-300 bg-teal-900/40'
    return 'text-slate-300 bg-slate-800'
  })()

  // 発言を会議ごとにグループ化
  const speechesByMeeting = new Map<string, { meeting: any; speeches: RelatedSpeech[] }>()
  for (const sp of speeches) {
    const m = sp.meetings as any
    if (!m) continue
    const key = m.id
    if (!speechesByMeeting.has(key)) {
      speechesByMeeting.set(key, { meeting: m, speeches: [] })
    }
    speechesByMeeting.get(key)!.speeches.push(sp)
  }
  const meetingGroups = Array.from(speechesByMeeting.values())
    .sort((a, b) => (b.meeting.date || '').localeCompare(a.meeting.date || ''))

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <a href="/bills" className="text-sm text-slate-400 hover:text-blue-400 transition-colors mb-6 inline-block">
        ← 議案一覧に戻る
      </a>

      {/* 議案ヘッダー */}
      <div className="bg-slate-800/50 rounded-2xl border border-slate-700/50 p-6 mb-6">
        <div className="flex items-start gap-2 mb-3 flex-wrap">
          <span className={`text-xs px-2 py-0.5 rounded shrink-0 ${typeColor}`}>
            {bill.bill_type || '不明'}
          </span>
          <span className={`text-xs px-2 py-0.5 rounded border shrink-0 ${statusColor}`}>
            {bill.status || '不明'}
          </span>
          {bill.bill_number && (
            <span className="text-xs text-slate-500">
              第{bill.submit_session}回 第{bill.bill_number}号
            </span>
          )}
        </div>

        <h1 className="text-xl font-bold text-slate-100 mb-3 leading-relaxed">
          {bill.bill_name}
        </h1>

        {/* カテゴリ + 影響対象 */}
        {(bill.category || bill.affected_groups) && (
          <div className="bg-slate-700/20 rounded-lg p-3 mb-3">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              {bill.category && (
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-indigo-900/40 text-indigo-300 border border-indigo-700/40">
                  {bill.category}
                </span>
              )}
              {bill.category_sub && (
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700/40">
                  {bill.category_sub}
                </span>
              )}
            </div>
            {bill.affected_groups && (
              <p className="text-xs text-slate-500">
                👥 影響を受ける可能性がある人: {bill.affected_groups}
              </p>
            )}
          </div>
        )}

        <div className="flex items-center gap-4 text-sm text-slate-400 flex-wrap">
          {bill.proposer && <span>📝 提出: {bill.proposer}</span>}
          {bill.proposer_party && <span className="text-slate-500">({bill.proposer_party})</span>}
          {bill.committee && <span>📋 {bill.committee}委員会</span>}
          {bill.law_number && <span>📕 {bill.law_number}</span>}
        </div>

        {/* 外部リンク */}
        <div className="flex gap-2 mt-4">
          {bill.progress_url && (
            <a
              href={bill.progress_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-400 hover:text-blue-300 border border-blue-700/50 px-3 py-1.5 rounded-lg hover:bg-blue-900/30 transition-colors"
            >
              {getHouseLabel(bill.house) === '参議院' ? '参議院 議案情報' : '衆議院 経過情報'} ↗
            </a>
          )}
        </div>
      </div>

      {/* 政党別賛否 */}
      {votes.length > 0 && (
        <div className="bg-slate-800/30 rounded-xl border border-slate-700/30 p-5 mb-6">
          <h2 className="text-sm font-bold text-slate-300 mb-4">🗳️ 政党別賛否</h2>

          {yea.length > 0 && (
            <div className="mb-4">
              <div className="text-xs text-emerald-400 font-bold mb-2">
                ⭕ 賛成（{yea.length}会派）
              </div>
              <div className="flex flex-wrap gap-2">
                {yea.map((v, i) => (
                  <span
                    key={i}
                    className={`party-tag party-tag-${getPartyClass(v.party_name)}`}
                  >
                    {v.party_name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {nay.length > 0 && (
            <div>
              <div className="text-xs text-red-400 font-bold mb-2">
                ❌ 反対（{nay.length}会派）
              </div>
              <div className="flex flex-wrap gap-2">
                {nay.map((v, i) => (
                  <span
                    key={i}
                    className={`party-tag party-tag-${getPartyClass(v.party_name)} opacity-70`}
                  >
                    {v.party_name}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 関連ニュース検索 */}
      <NewsSection billName={bill.bill_name} />

      {/* 関連発言 */}
      <div className="mb-8">
        <h2 className="text-sm font-bold text-slate-300 mb-1">
          💬 関連する国会発言
        </h2>
        <p className="text-xs text-slate-500 mb-4">
          「{keywords[0]}」を含む第{bill.submit_session}回国会の発言
        </p>

        {speechLoading ? (
          <div className="text-center py-12">
            <div className="animate-pulse">
              <p className="text-slate-500 text-sm">関連発言を検索中...</p>
            </div>
          </div>
        ) : speeches.length === 0 ? (
          <div className="text-center py-12 bg-slate-800/20 rounded-xl border border-slate-700/30">
            <p className="text-slate-500 text-sm">この議案に関連する発言が見つかりませんでした</p>
          </div>
        ) : (
          <div className="space-y-6">
            {meetingGroups.map(({ meeting, speeches: mSpeeches }) => (
              <div key={meeting.id} className="space-y-2">
                {/* 会議ヘッダー */}
                <a
                  href={`/meetings/${meeting.id}`}
                  className="block bg-slate-800/40 rounded-lg px-4 py-2 border border-slate-700/30 hover:border-slate-600 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-1.5 py-0.5 rounded ${
                      getHouseLabel(meeting.house) === '衆議院'
                        ? 'bg-blue-900/50 text-blue-300'
                        : 'bg-purple-900/50 text-purple-300'
                    }`}>
                      {getHouseLabel(meeting.house)}
                    </span>
                    <span className="text-sm font-medium text-slate-300">{meeting.meeting_name}</span>
                    <span className="text-xs text-slate-500">{meeting.date}</span>
                    <span className="text-xs text-slate-600 ml-auto">会議詳細 →</span>
                  </div>
                </a>

                {/* その会議の関連発言 */}
                {mSpeeches.map(sp => {
                  const isExpanded = expandedId === sp.id
                  const leg = sp.legislators as any
                  const partyClass = leg ? getPartyClass(leg.current_party) : null

                  return (
                    <div
                      key={sp.id}
                      className={`rounded-xl border transition-all ml-4 ${
                        leg
                          ? 'bg-slate-800/50 border-slate-700/50 hover:border-slate-600'
                          : 'bg-slate-800/20 border-slate-700/30'
                      }`}
                    >
                      <button
                        onClick={() => setExpandedId(isExpanded ? null : sp.id)}
                        className="w-full text-left p-3"
                      >
                        <div className="flex items-start gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              {leg ? (
                                <a
                                  href={`/legislator/${leg.id}`}
                                  onClick={e => e.stopPropagation()}
                                  className="text-sm font-bold text-slate-200 hover:text-blue-400 transition-colors"
                                >
                                  {sp.speaker_name}
                                </a>
                              ) : (
                                <span className="text-sm font-medium text-slate-400">{sp.speaker_name}</span>
                              )}
                              {partyClass && (
                                <span className={`text-xs px-1.5 py-0.5 rounded border party-tag-${partyClass}`}>
                                  {getPartyShortName(leg.current_party)}
                                </span>
                              )}
                              {sp.speaker_position && (
                                <span className="text-xs text-amber-400/70">{sp.speaker_position}</span>
                              )}
                            </div>
                            <p className="text-xs text-slate-400 leading-relaxed">
                              {isExpanded
                                ? (sp.content?.replace(/^○.+?　/, '') || '')
                                : truncate(sp.content)
                              }
                            </p>
                          </div>
                          <span className="text-xs text-slate-600 shrink-0">{isExpanded ? '▲' : '▼'}</span>
                        </div>
                      </button>
                      {isExpanded && sp.speech_url && (
                        <div className="px-3 pb-2">
                          <a href={sp.speech_url} target="_blank" rel="noopener noreferrer"
                            className="text-xs text-blue-400/60 hover:text-blue-400">
                            原文を見る ↗
                          </a>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        )}

        {speeches.length >= 50 && (
          <p className="text-xs text-slate-500 text-center mt-4">
            ※ 最新50件のみ表示しています
          </p>
        )}
      </div>
    </div>
  )
}

// ===== 関連ニュースコンポーネント =====
function NewsSection({ billName }: { billName: string }) {
  const [articles, setArticles] = useState<{ title: string; url: string; source: string; date: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  // 議案名から検索キーワード生成
  const shortName = (() => {
    const lawMatch = billName.match(/(.+?)の一部を改正/)
    return lawMatch ? lawMatch[1] : billName.replace(/に関する法律案$/, '').slice(0, 30)
  })()

  useEffect(() => {
    async function fetchNews() {
      try {
        const res = await fetch(`/api/news?q=${encodeURIComponent(shortName)}`)
        const data = await res.json()
        setArticles(data.articles || [])
      } catch {
        setError(true)
      } finally {
        setLoading(false)
      }
    }
    fetchNews()
  }, [shortName])

  return (
    <div className="bg-slate-800/30 rounded-xl border border-slate-700/30 p-5 mb-6">
      <h2 className="text-sm font-bold text-slate-300 mb-3">📰 関連ニュース</h2>

      {loading && (
        <div className="animate-pulse space-y-2">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-10 bg-slate-700/30 rounded-lg" />
          ))}
        </div>
      )}

      {!loading && articles.length > 0 && (
        <div className="space-y-1.5 mb-3">
          {articles.map((a, i) => (
            <a
              key={i}
              href={a.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-start gap-3 px-3 py-2.5 rounded-lg hover:bg-slate-700/30 transition-colors group"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm text-slate-200 leading-snug group-hover:text-blue-300 transition-colors line-clamp-2">
                  {a.title}
                </p>
                <div className="flex items-center gap-2 mt-1">
                  {a.source && (
                    <span className="text-xs text-slate-500">{a.source}</span>
                  )}
                  {a.date && (
                    <span className="text-xs text-slate-600">{a.date}</span>
                  )}
                </div>
              </div>
              <span className="text-xs text-slate-600 shrink-0 mt-1">↗</span>
            </a>
          ))}
        </div>
      )}

      {!loading && articles.length === 0 && !error && (
        <p className="text-xs text-slate-500 mb-3">関連するニュースが見つかりませんでした</p>
      )}

      {error && (
        <p className="text-xs text-slate-500 mb-3">ニュースの取得に失敗しました</p>
      )}

      {/* 外部検索リンク */}
      <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-700/30">
        <a
          href={`https://news.google.com/search?q=${encodeURIComponent(shortName)}&hl=ja&gl=JP&ceid=JP:ja`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-blue-400 hover:text-blue-300 border border-blue-700/50 px-2.5 py-1.5 rounded-lg hover:bg-blue-900/30 transition-colors"
        >
          📰 Google Newsで詳しく ↗
        </a>
        <a
          href={`https://x.com/search?q=${encodeURIComponent(shortName)}&f=live`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-blue-400 hover:text-blue-300 border border-blue-700/50 px-2.5 py-1.5 rounded-lg hover:bg-blue-900/30 transition-colors"
        >
          𝕏 ポストを検索 ↗
        </a>
      </div>
    </div>
  )
}
