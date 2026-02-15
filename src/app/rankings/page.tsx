'use client'

import { useEffect, useState } from 'react'
import { supabase, getPartyClass, getPartyShortName, getHouseLabel, getPositionDisplay } from '@/lib/supabase'

type RankingEntry = {
  legislator_id: string
  name: string
  name_yomi: string | null
  house: string
  current_party: string | null
  current_position: string | null
  current_position_override: string | null
  total_speeches: number
  speeches_1y: number
  meetings_attended: number
  committees_count: number
  top_committee_name: string | null
  specialization_pct: number
  speech_rank_pct: number
  participation_rank_pct: number
  activity_score: number
}

type SortKey = 'speeches_1y' | 'total_speeches' | 'meetings_attended' | 'committees_count' | 'activity_score'

export default function RankingsPage() {
  const [data, setData] = useState<RankingEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [houseFilter, setHouseFilter] = useState<string>('all')
  const [partyFilter, setPartyFilter] = useState<string>('all')
  const [sortKey, setSortKey] = useState<SortKey>('speeches_1y')
  const [showCount, setShowCount] = useState(50)

  useEffect(() => {
    async function load() {
      const { data: rows } = await supabase
        .from('v_legislator_rankings')
        .select('*')
      if (rows) setData(rows as RankingEntry[])
      setLoading(false)
    }
    load()
  }, [])

  // フィルター
  const filtered = data.filter(d => {
    if (houseFilter !== 'all' && d.house !== houseFilter) return false
    if (partyFilter !== 'all' && !d.current_party?.includes(partyFilter)) return false
    return true
  })

  // ソート
  const sorted = [...filtered].sort((a, b) => {
    const av = a[sortKey] ?? 0
    const bv = b[sortKey] ?? 0
    return (bv as number) - (av as number)
  })

  // 政党一覧
  const parties = Array.from(new Set(data.map(d => getPartyShortName(d.current_party)).filter(Boolean))).sort()

  const scoreStars = (score: number) =>
    Array.from({length: 5}).map((_, i) => (
      <span key={i} className={i < score ? 'text-amber-400' : 'text-slate-700'}>★</span>
    ))

  const sortOptions: { key: SortKey; label: string }[] = [
    { key: 'speeches_1y', label: '直近1年の発言数' },
    { key: 'total_speeches', label: '通算発言数' },
    { key: 'meetings_attended', label: '会議参加数' },
    { key: 'committees_count', label: '委員会数' },
    { key: 'activity_score', label: '活動スコア' },
  ]

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-20 text-center">
        <div className="animate-pulse">
          <div className="text-4xl mb-4">📊</div>
          <p className="text-slate-400">ランキングを集計中...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-100 mb-2">📊 議員活動ランキング</h1>
        <p className="text-sm text-slate-400">
          国会発言データに基づく活動度のランキングです。{data.length}名の議員を集計。
        </p>
      </div>

      {/* フィルター・ソート */}
      <div className="bg-slate-800/30 rounded-xl border border-slate-700/30 p-4 mb-6">
        <div className="flex flex-wrap gap-3 items-center">
          {/* 院フィルター */}
          <div className="flex gap-1.5">
            {['all', '衆議院', '参議院'].map(h => (
              <button
                key={h}
                onClick={() => setHouseFilter(h)}
                className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                  houseFilter === h
                    ? 'bg-blue-600 border-blue-500 text-white'
                    : 'bg-slate-800/50 border-slate-700/50 text-slate-400 hover:text-slate-200'
                }`}
              >
                {h === 'all' ? '全体' : h}
              </button>
            ))}
          </div>

          {/* 政党フィルター */}
          <select
            value={partyFilter}
            onChange={e => setPartyFilter(e.target.value)}
            className="text-xs bg-slate-800/50 border border-slate-700/50 rounded-lg px-3 py-1.5 text-slate-300"
          >
            <option value="all">全政党</option>
            {parties.map(p => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>

          {/* ソート */}
          <select
            value={sortKey}
            onChange={e => setSortKey(e.target.value as SortKey)}
            className="text-xs bg-slate-800/50 border border-slate-700/50 rounded-lg px-3 py-1.5 text-slate-300"
          >
            {sortOptions.map(o => (
              <option key={o.key} value={o.key}>並び替え: {o.label}</option>
            ))}
          </select>

          <span className="text-xs text-slate-500 ml-auto">{sorted.length}名</span>
        </div>
      </div>

      {/* 注釈 */}
      <div className="bg-amber-900/20 border border-amber-700/30 rounded-lg px-4 py-3 mb-6">
        <p className="text-xs text-amber-400/80 leading-relaxed">
          ⚠️ このランキングは発言回数に基づく「量」の指標です。
          質問の質・政策への影響力・選挙区活動等は反映されていません。
          発言がない＝欠席とは限りません。
        </p>
      </div>

      {/* ランキング上位3名 */}
      {sorted.length >= 3 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          {sorted.slice(0, 3).map((r, i) => {
            const medals = ['🥇', '🥈', '🥉']
            const partyClass = getPartyClass(r.current_party)
            return (
              <a
                key={r.legislator_id}
                href={`/legislator/${r.legislator_id}`}
                className={`rounded-xl border border-slate-700/50 overflow-hidden hover:border-slate-600 transition-colors`}
              >
                <div className={`party-${partyClass} px-4 py-3`}>
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{medals[i]}</span>
                    <div>
                      <div className="text-white font-bold">{r.name}</div>
                      <div className="text-white/60 text-xs">{getPartyShortName(r.current_party)} · {getHouseLabel(r.house)}</div>
                    </div>
                  </div>
                </div>
                <div className="bg-slate-800 px-4 py-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-lg font-bold text-emerald-400">{r.speeches_1y}</div>
                      <div className="text-xs text-slate-500">直近1年の発言</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm">{scoreStars(r.activity_score)}</div>
                      <div className="text-xs text-slate-500">{r.committees_count}委員会</div>
                    </div>
                  </div>
                </div>
              </a>
            )
          })}
        </div>
      )}

      {/* テーブル */}
      <div className="bg-slate-800/20 rounded-xl border border-slate-700/30 overflow-hidden">
        <div className="max-h-[600px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-slate-800 z-10">
              <tr className="text-xs text-slate-500 border-b border-slate-700/30">
                <th className="px-3 py-2.5 text-left w-10">#</th>
                <th className="px-3 py-2.5 text-left">議員名</th>
                <th className="px-3 py-2.5 text-center hidden sm:table-cell">スコア</th>
                <th className="px-3 py-2.5 text-right cursor-pointer hover:text-slate-300" onClick={() => setSortKey('speeches_1y')}>
                  発言(1年){sortKey === 'speeches_1y' ? ' ▼' : ''}
                </th>
                <th className="px-3 py-2.5 text-right cursor-pointer hover:text-slate-300 hidden md:table-cell" onClick={() => setSortKey('total_speeches')}>
                  通算{sortKey === 'total_speeches' ? ' ▼' : ''}
                </th>
                <th className="px-3 py-2.5 text-right cursor-pointer hover:text-slate-300 hidden md:table-cell" onClick={() => setSortKey('meetings_attended')}>
                  会議数{sortKey === 'meetings_attended' ? ' ▼' : ''}
                </th>
                <th className="px-3 py-2.5 text-right cursor-pointer hover:text-slate-300 hidden lg:table-cell" onClick={() => setSortKey('committees_count')}>
                  委員会{sortKey === 'committees_count' ? ' ▼' : ''}
                </th>
                <th className="px-3 py-2.5 text-left hidden lg:table-cell">専門分野</th>
              </tr>
            </thead>
            <tbody>
              {sorted.slice(0, showCount).map((r, i) => {
                const partyShort = getPartyShortName(r.current_party)
                return (
                  <tr
                    key={r.legislator_id}
                    className="border-t border-slate-700/20 hover:bg-slate-700/20 transition-colors"
                  >
                    <td className="px-3 py-2.5 text-slate-500 text-xs">{i + 1}</td>
                    <td className="px-3 py-2.5">
                      <a href={`/legislator/${r.legislator_id}`} className="hover:text-blue-400 transition-colors">
                        <div className="text-slate-200 font-medium">{r.name}</div>
                        <div className="text-xs text-slate-500">
                          <span className={`inline-block px-1.5 py-0.5 rounded text-xs mr-1 party-${getPartyClass(r.current_party)} text-white/90`}>
                            {partyShort}
                          </span>
                          {getHouseLabel(r.house)}
                          {(() => { const pd = getPositionDisplay(r); return pd.label ? <span className={`ml-1 ${pd.isOverride ? 'text-amber-400/70' : 'text-amber-400/40 italic'}`}>{pd.label}</span> : null })()}
                        </div>
                      </a>
                    </td>
                    <td className="px-3 py-2.5 text-center hidden sm:table-cell">
                      <span className="text-xs">{scoreStars(r.activity_score)}</span>
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <span className="text-emerald-400 font-bold">{r.speeches_1y}</span>
                    </td>
                    <td className="px-3 py-2.5 text-right text-slate-400 hidden md:table-cell">{r.total_speeches}</td>
                    <td className="px-3 py-2.5 text-right text-slate-400 hidden md:table-cell">{r.meetings_attended}</td>
                    <td className="px-3 py-2.5 text-right text-slate-400 hidden lg:table-cell">{r.committees_count}</td>
                    <td className="px-3 py-2.5 hidden lg:table-cell">
                      <div className="text-xs text-slate-500 truncate max-w-[140px]" title={r.top_committee_name || ''}>
                        {r.top_committee_name || '-'}
                      </div>
                      <div className="text-xs text-slate-600">{r.specialization_pct}%集中</div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {showCount < sorted.length && (
          <div className="text-center py-3 border-t border-slate-700/30">
            <button
              onClick={() => setShowCount(prev => prev + 50)}
              className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
            >
              もっと読み込む（残り{sorted.length - showCount}名）
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
