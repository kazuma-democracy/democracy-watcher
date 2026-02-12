'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { supabase, Legislator, getPartyClass, getPartyShortName } from '@/lib/supabase'

type SpeechWithMeeting = {
  id: string
  speech_id: string
  speech_order: number | null
  speaker_name: string
  speaker_group: string | null
  speaker_position: string | null
  content: string | null
  ai_summary: string | null
  speech_url: string | null
  date: string
  meetings: {
    meeting_name: string
    house: string
    date: string
  } | null
}

export default function LegislatorPage() {
  const params = useParams()
  const id = params.id as string

  const [legislator, setLegislator] = useState<Legislator | null>(null)
  const [speeches, setSpeeches] = useState<SpeechWithMeeting[]>([])
  const [speechCount, setSpeechCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [expandedSpeech, setExpandedSpeech] = useState<string | null>(null)
  const [showCount, setShowCount] = useState(20)

  useEffect(() => {
    async function load() {
      // 議員情報
      const { data: leg } = await supabase
        .from('legislators')
        .select('*')
        .eq('id', id)
        .single()

      if (leg) setLegislator(leg)

      // 発言数
      const { count } = await supabase
        .from('speeches')
        .select('*', { count: 'exact', head: true })
        .eq('legislator_id', id)
      setSpeechCount(count || 0)

      // 発言一覧（会議情報付き）
      const { data: sp } = await supabase
        .from('speeches')
        .select('*, meetings(meeting_name, house, date)')
        .eq('legislator_id', id)
        .order('date', { ascending: false })
        .limit(50)

      if (sp) setSpeeches(sp as SpeechWithMeeting[])
      setLoading(false)
    }
    load()
  }, [id])

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-20 text-center">
        <div className="animate-pulse">
          <div className="text-4xl mb-4">👤</div>
          <p className="text-slate-400">読み込み中...</p>
        </div>
      </div>
    )
  }

  if (!legislator) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-20 text-center">
        <div className="text-4xl mb-4">❌</div>
        <p className="text-slate-400">議員が見つかりません</p>
        <a href="/" className="text-blue-400 hover:underline text-sm mt-4 inline-block">← 一覧に戻る</a>
      </div>
    )
  }

  const partyClass = getPartyClass(legislator.current_party)
  const partyShort = getPartyShortName(legislator.current_party)

  // 発言の冒頭を取得（200文字）
  function truncate(text: string | null, len = 200) {
    if (!text) return ''
    // 発言冒頭の「○議員名（...）　」を除去
    const cleaned = text.replace(/^○.+?　/, '')
    if (cleaned.length <= len) return cleaned
    return cleaned.substring(0, len) + '...'
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* 戻るリンク */}
      <a href="/" className="text-sm text-slate-400 hover:text-blue-400 transition-colors mb-6 inline-block">
        ← 議員一覧に戻る
      </a>

      {/* プロフィールカード */}
      <div className={`rounded-2xl overflow-hidden mb-8 border border-slate-700/50`}>
        <div className={`party-${partyClass} px-6 py-4`}>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-white">{legislator.name}</h1>
              <p className="text-white/70 text-sm mt-1">{legislator.name_yomi}</p>
            </div>
            <div className="text-right">
              <span className="bg-white/20 text-white px-3 py-1 rounded-lg text-sm font-medium">
                {partyShort}
              </span>
            </div>
          </div>
        </div>
        <div className="bg-slate-800 px-6 py-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <div className="text-xs text-slate-500 mb-1">所属院</div>
              <div className="text-sm text-slate-200">{legislator.house || '不明'}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500 mb-1">会派</div>
              <div className="text-sm text-slate-200">{legislator.current_party || '不明'}</div>
            </div>
            {legislator.current_position && (
              <div>
                <div className="text-xs text-slate-500 mb-1">役職</div>
                <div className="text-sm text-amber-400">{legislator.current_position}</div>
              </div>
            )}
            <div>
              <div className="text-xs text-slate-500 mb-1">発言数</div>
              <div className="text-sm text-emerald-400 font-bold">{speechCount}件</div>
            </div>
          </div>
        </div>
      </div>

      {/* 発言一覧 */}
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-bold text-slate-100">
          💬 国会発言
        </h2>
        <span className="text-sm text-slate-500">{speechCount}件（新しい順）</span>
      </div>

      <div className="space-y-3">
        {speeches.slice(0, showCount).map((sp) => {
          const isExpanded = expandedSpeech === sp.id
          return (
            <div
              key={sp.id}
              className="bg-slate-800/50 border border-slate-700/50 rounded-xl overflow-hidden"
            >
              {/* ヘッダー */}
              <div className="px-4 py-3 flex items-center justify-between border-b border-slate-700/30">
                <div className="flex items-center gap-3 text-xs">
                  <span className="text-slate-400">{sp.date}</span>
                  <span className="bg-slate-700 px-2 py-0.5 rounded text-slate-300">
                    {sp.meetings?.house} {sp.meetings?.meeting_name}
                  </span>
                  {sp.speaker_position && (
                    <span className="text-amber-400/80">{sp.speaker_position}</span>
                  )}
                </div>
                <a
                  href={sp.speech_url || '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-blue-400/60 hover:text-blue-400 transition-colors"
                  title="国会会議録で見る"
                >
                  原文 ↗
                </a>
              </div>

              {/* 発言内容 */}
              <div
                className="px-4 py-3 cursor-pointer"
                onClick={() => setExpandedSpeech(isExpanded ? null : sp.id)}
              >
                {sp.ai_summary && (
                  <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3 mb-3 text-sm text-blue-200">
                    <span className="text-xs text-blue-400 font-medium">🤖 AI要約：</span>
                    <span className="ml-2">{sp.ai_summary}</span>
                  </div>
                )}
                <p className="text-sm text-slate-300 leading-relaxed">
                  {isExpanded ? sp.content?.replace(/^○.+?　/, '') : truncate(sp.content)}
                </p>
                {(sp.content?.length || 0) > 200 && (
                  <button className="text-xs text-blue-400/60 hover:text-blue-400 mt-2 transition-colors">
                    {isExpanded ? '▲ 閉じる' : '▼ 全文を表示'}
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* もっと見る */}
      {showCount < speeches.length && (
        <div className="text-center mt-6">
          <button
            onClick={() => setShowCount((prev) => prev + 20)}
            className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-6 py-2 rounded-xl text-sm border border-slate-600 transition-colors"
          >
            もっと見る
          </button>
        </div>
      )}

      {speeches.length === 0 && (
        <div className="text-center py-12">
          <div className="text-3xl mb-3">📭</div>
          <p className="text-slate-400">発言データがまだありません</p>
          <p className="text-slate-500 text-sm mt-1">データ収集中です。しばらくお待ちください。</p>
        </div>
      )}
    </div>
  )
}
