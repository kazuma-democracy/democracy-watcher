'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

type MeetingWithCount = {
  id: string
  issue_id: string
  session: number | null
  house: string
  meeting_name: string
  issue_number: string | null
  date: string
  meeting_url: string | null
  speech_count: number
}

export default function MeetingsPage() {
  const [meetings, setMeetings] = useState<MeetingWithCount[]>([])
  const [loading, setLoading] = useState(true)
  const [houseFilter, setHouseFilter] = useState<'all' | '衆議院' | '参議院'>('all')
  const [page, setPage] = useState(0)
  const perPage = 30

  useEffect(() => {
    async function load() {
      // meetings_with_counts viewを使う（N+1問題を解消）
      const { data, error } = await supabase
        .from('meetings_with_counts')
        .select('*')
        .order('date', { ascending: false })
        .range(0, 499)

      if (error) {
        // Viewがない場合のフォールバック
        console.error(error)
        const { data: fallback } = await supabase
          .from('meetings')
          .select('*')
          .order('date', { ascending: false })
          .range(0, 299)
        setMeetings((fallback || []).map((m: any) => ({ ...m, speech_count: 0 })))
        setLoading(false)
        return
      }

      setMeetings(data || [])
      setLoading(false)
    }
    load()
  }, [])

  const filtered = meetings.filter(m => {
    if (houseFilter !== 'all' && m.house !== houseFilter) return false
    return true
  })

  const paged = filtered.slice(page * perPage, (page + 1) * perPage)
  const totalPages = Math.ceil(filtered.length / perPage)

  // 日付でグループ化
  const grouped: Record<string, MeetingWithCount[]> = {}
  for (const m of paged) {
    const d = m.date || '不明'
    if (!grouped[d]) grouped[d] = []
    grouped[d].push(m)
  }

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-20 text-center">
        <div className="animate-pulse">
          <div className="text-4xl mb-4">📋</div>
          <p className="text-slate-400">会議データを読み込み中...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-100">📋 会議一覧</h1>
        <div className="flex gap-1">
          {(['all', '衆議院', '参議院'] as const).map(h => (
            <button
              key={h}
              onClick={() => { setHouseFilter(h); setPage(0) }}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                houseFilter === h ? 'bg-slate-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              {h === 'all' ? '全院' : h}
            </button>
          ))}
        </div>
      </div>

      <div className="text-sm text-slate-500 mb-4">{filtered.length}件の会議（新しい順）</div>

      {Object.entries(grouped).map(([date, items]) => (
        <div key={date} className="mb-6">
          <div className="text-sm font-bold text-slate-400 mb-2 sticky top-16 bg-slate-900/90 backdrop-blur-sm py-2 z-10">
            📅 {date}
          </div>
          <div className="space-y-2">
            {items.map(m => (
              <a key={m.id} href={`/meetings/${m.id}`} className="block bg-slate-800/50 border border-slate-700/50 rounded-xl p-4 hover:border-slate-600 hover:bg-slate-800/70 transition-all cursor-pointer">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-xs px-2 py-0.5 rounded ${
                        m.house === '衆議院' ? 'bg-blue-900/50 text-blue-300 border border-blue-700/50' : 'bg-purple-900/50 text-purple-300 border border-purple-700/50'
                      }`}>
                        {m.house}
                      </span>
                      <h3 className="text-sm font-bold text-slate-200">{m.meeting_name}</h3>
                      {m.issue_number && <span className="text-xs text-slate-500">{m.issue_number}</span>}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-slate-500 mt-1">
                      <span>第{m.session}回国会</span>
                      <span>💬 {m.speech_count}件の発言</span>
                    </div>
                  </div>
                  <span className="text-xs text-slate-600 shrink-0 ml-3">詳細 →</span>
                </div>
              </a>
            ))}
          </div>
        </div>
      ))}

      {/* ページネーション */}
      {totalPages > 1 && (
        <div className="flex justify-center gap-2 mt-8">
          <button
            onClick={() => setPage(p => Math.max(0, p - 1))}
            disabled={page === 0}
            className="px-4 py-2 rounded-lg text-sm bg-slate-800 text-slate-300 border border-slate-700 disabled:opacity-30"
          >
            ← 前へ
          </button>
          <span className="px-4 py-2 text-sm text-slate-400">{page + 1} / {totalPages}</span>
          <button
            onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            className="px-4 py-2 rounded-lg text-sm bg-slate-800 text-slate-300 border border-slate-700 disabled:opacity-30"
          >
            次へ →
          </button>
        </div>
      )}
    </div>
  )
}
