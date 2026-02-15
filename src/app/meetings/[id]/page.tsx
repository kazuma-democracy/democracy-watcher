'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { supabase, getPartyClass, getPartyShortName, getHouseLabel } from '@/lib/supabase'

type MeetingDetail = {
  id: string
  issue_id: string
  session: number | null
  house: string
  meeting_name: string
  issue_number: string | null
  date: string
  meeting_url: string | null
}

type SpeechItem = {
  id: string
  speech_order: number | null
  speaker_name: string
  speaker_group: string | null
  speaker_position: string | null
  content: string | null
  speech_url: string | null
  legislator_id: string | null
  legislators?: {
    id: string
    name: string
    current_party: string | null
  } | null
}

export default function MeetingDetailPage() {
  const params = useParams()
  const id = params.id as string

  const [meeting, setMeeting] = useState<MeetingDetail | null>(null)
  const [speeches, setSpeeches] = useState<SpeechItem[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      // 会議情報
      const { data: m } = await supabase
        .from('meetings')
        .select('*')
        .eq('id', id)
        .single()
      if (m) setMeeting(m)

      // 発言一覧（発言順）
      const { data: sp } = await supabase
        .from('speeches')
        .select('id, speech_order, speaker_name, speaker_group, speaker_position, content, speech_url, legislator_id, legislators(id, name, current_party)')
        .eq('meeting_id', id)
        .order('speech_order', { ascending: true })
        .range(0, 499)

      setSpeeches((sp || []) as any[])
      setLoading(false)
    }
    load()
  }, [id])

  function truncate(text: string | null, len = 300) {
    if (!text) return ''
    const cleaned = text.replace(/^○.+?　/, '')
    if (cleaned.length <= len) return cleaned
    return cleaned.substring(0, len) + '...'
  }

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-20 text-center">
        <div className="animate-pulse">
          <div className="text-4xl mb-4">📋</div>
          <p className="text-slate-400">会議データを読み込み中...</p>
        </div>
      </div>
    )
  }

  if (!meeting) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-20 text-center">
        <div className="text-4xl mb-4">❌</div>
        <p className="text-slate-400">会議が見つかりません</p>
        <a href="/meetings" className="text-blue-400 hover:underline text-sm mt-4 inline-block">← 会議一覧に戻る</a>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <a href="/meetings" className="text-sm text-slate-400 hover:text-blue-400 transition-colors mb-6 inline-block">
        ← 会議一覧に戻る
      </a>

      {/* 会議ヘッダー */}
      <div className="bg-slate-800/50 rounded-2xl border border-slate-700/50 p-6 mb-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className={`text-xs px-2 py-0.5 rounded ${
                getHouseLabel(meeting.house) === '衆議院'
                  ? 'bg-blue-900/50 text-blue-300 border border-blue-700/50'
                  : 'bg-purple-900/50 text-purple-300 border border-purple-700/50'
              }`}>
                {getHouseLabel(meeting.house)}
              </span>
              {meeting.issue_number && <span className="text-xs text-slate-500">{meeting.issue_number}</span>}
            </div>
            <h1 className="text-xl font-bold text-slate-100 mb-2">{meeting.meeting_name}</h1>
            <div className="flex items-center gap-4 text-sm text-slate-400">
              <span>📅 {meeting.date}</span>
              <span>第{meeting.session}回国会</span>
              <span>💬 {speeches.length}件の発言</span>
            </div>
          </div>
          {meeting.meeting_url && (
            <a
              href={meeting.meeting_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-400 hover:text-blue-300 border border-blue-700/50 px-3 py-1.5 rounded-lg hover:bg-blue-900/30 transition-colors shrink-0"
            >
              国会議事録 ↗
            </a>
          )}
        </div>
      </div>

      {/* 関連ニュース */}
      <MeetingNewsSection meetingName={meeting.meeting_name} date={meeting.date} />

      {/* 発言者サマリー */}
      {(() => {
        const speakers = new Map<string, { count: number; party: string | null; legId: string | null }>()
        for (const sp of speeches) {
          const key = sp.speaker_name
          const existing = speakers.get(key)
          if (existing) {
            existing.count++
          } else {
            speakers.set(key, {
              count: 1,
              party: (sp.legislators as any)?.current_party || sp.speaker_group,
              legId: sp.legislator_id
            })
          }
        }
        const sorted = Array.from(speakers.entries()).sort((a, b) => b[1].count - a[1].count)
        return (
          <div className="bg-slate-800/30 rounded-xl border border-slate-700/30 p-4 mb-6">
            <h2 className="text-xs font-bold text-slate-400 mb-3">👥 発言者（{speakers.size}人）</h2>
            <div className="flex flex-wrap gap-2">
              {sorted.map(([name, info]) => (
                <span key={name} className="inline-flex items-center gap-1.5">
                  {info.legId ? (
                    <a href={`/legislator/${info.legId}`} className="text-xs bg-slate-700/50 hover:bg-slate-700 text-slate-300 px-2.5 py-1 rounded-lg transition-colors">
                      {name}
                      <span className="text-slate-500 ml-1">({info.count})</span>
                    </a>
                  ) : (
                    <span className="text-xs bg-slate-800/50 text-slate-500 px-2.5 py-1 rounded-lg">
                      {name}
                      <span className="text-slate-600 ml-1">({info.count})</span>
                    </span>
                  )}
                </span>
              ))}
            </div>
          </div>
        )
      })()}

      {/* 発言一覧 */}
      <div className="space-y-3">
        {speeches.map((sp, i) => {
          const isExpanded = expandedId === sp.id
          const leg = sp.legislators as any
          const partyClass = leg ? getPartyClass(leg.current_party) : null
          const isLegislator = !!leg

          return (
            <div
              key={sp.id}
              className={`rounded-xl border transition-all ${
                isLegislator
                  ? 'bg-slate-800/50 border-slate-700/50 hover:border-slate-600'
                  : 'bg-slate-800/20 border-slate-700/30'
              }`}
            >
              <button
                onClick={() => setExpandedId(isExpanded ? null : sp.id)}
                className="w-full text-left p-4"
              >
                <div className="flex items-start gap-3">
                  <span className="text-xs text-slate-600 mt-1 shrink-0 w-6 text-right">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      {isLegislator ? (
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
                      {isExpanded ? (sp.content?.replace(/^○.+?　/, '') || '') : truncate(sp.content)}
                    </p>
                  </div>
                  <span className="text-xs text-slate-600 shrink-0">{isExpanded ? '▲' : '▼'}</span>
                </div>
              </button>
              {isExpanded && sp.speech_url && (
                <div className="px-4 pb-3 pl-14">
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
    </div>
  )
}

// ===== 関連ニュースコンポーネント =====
function MeetingNewsSection({ meetingName, date }: { meetingName: string; date: string }) {
  const [articles, setArticles] = useState<{ title: string; url: string; source: string; date: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  // 委員会名からキーワード生成（「予算委員会」→「予算委員会 国会」）
  const keyword = meetingName.replace(/第?\d+号$/, '').trim()

  useEffect(() => {
    async function fetchNews() {
      try {
        const res = await fetch(`/api/news?q=${encodeURIComponent(keyword + ' 国会')}`)
        const data = await res.json()
        setArticles(data.articles || [])
      } catch {
        setError(true)
      } finally {
        setLoading(false)
      }
    }
    fetchNews()
  }, [keyword])

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
                  {a.source && <span className="text-xs text-slate-500">{a.source}</span>}
                  {a.date && <span className="text-xs text-slate-600">{a.date}</span>}
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

      <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-700/30">
        <a
          href={`https://news.google.com/search?q=${encodeURIComponent(keyword)}&hl=ja&gl=JP&ceid=JP:ja`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-blue-400 hover:text-blue-300 border border-blue-700/50 px-2.5 py-1.5 rounded-lg hover:bg-blue-900/30 transition-colors"
        >
          📰 Google Newsで詳しく ↗
        </a>
        <a
          href={`https://x.com/search?q=${encodeURIComponent(keyword)}&f=live`}
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
