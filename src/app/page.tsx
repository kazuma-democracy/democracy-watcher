'use client'

import { useEffect, useState } from 'react'
import { supabase, Legislator, getPartyClass, getPartyShortName } from '@/lib/supabase'

// 政党フィルターの定義
const PARTY_FILTERS = [
  { key: 'all', label: '全政党', color: 'text-slate-300 border-slate-500' },
  { key: '自由民主党', label: '自民', color: 'party-tag-ldp' },
  { key: '立憲民主', label: '立憲', color: 'party-tag-cdp' },
  { key: '公明', label: '公明', color: 'party-tag-komeito' },
  { key: '維新', label: '維新', color: 'party-tag-ishin' },
  { key: '国民民主', label: '国民', color: 'party-tag-dpfp' },
  { key: '共産', label: '共産', color: 'party-tag-jcp' },
  { key: 'れいわ', label: 'れいわ', color: 'party-tag-reiwa' },
  { key: '無所属', label: '無所属', color: 'party-tag-other' },
]

export default function Home() {
  const [legislators, setLegislators] = useState<(Legislator & { speech_count: number })[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [partyFilter, setPartyFilter] = useState('all')
  const [houseFilter, setHouseFilter] = useState<'all' | '衆議院' | '参議院'>('all')
  const [stats, setStats] = useState({ legislators: 0, speeches: 0, meetings: 0 })

  useEffect(() => {
    async function load() {
      // 議員一覧を取得
      const { data: legs, error } = await supabase
        .from('legislators')
        .select('*')
        .order('name')

      if (error) {
        console.error(error)
        setLoading(false)
        return
      }

      // 各議員の発言数を取得
      const withCounts = await Promise.all(
        (legs || []).map(async (leg: Legislator) => {
          const { count } = await supabase
            .from('speeches')
            .select('*', { count: 'exact', head: true })
            .eq('legislator_id', leg.id)
          return { ...leg, speech_count: count || 0 }
        })
      )

      setLegislators(withCounts)

      // 統計
      const [sCount, mCount] = await Promise.all([
        supabase.from('speeches').select('*', { count: 'exact', head: true }),
        supabase.from('meetings').select('*', { count: 'exact', head: true }),
      ])
      setStats({
        legislators: withCounts.length,
        speeches: sCount.count || 0,
        meetings: mCount.count || 0,
      })

      setLoading(false)
    }
    load()
  }, [])

  // フィルター適用
  const filtered = legislators.filter((leg) => {
    // 検索
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      const matchName = leg.name.toLowerCase().includes(q)
      const matchYomi = leg.name_yomi?.toLowerCase().includes(q)
      const matchParty = leg.current_party?.toLowerCase().includes(q)
      if (!matchName && !matchYomi && !matchParty) return false
    }
    // 政党フィルター
    if (partyFilter !== 'all') {
      if (!leg.current_party?.includes(partyFilter)) return false
    }
    // 院フィルター
    if (houseFilter !== 'all') {
      if (leg.house !== houseFilter) return false
    }
    return true
  })

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-20 text-center">
        <div className="animate-pulse">
          <div className="text-4xl mb-4">🏛️</div>
          <p className="text-slate-400">国会データを読み込み中...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* 統計バー */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="bg-slate-800/50 rounded-xl p-4 text-center border border-slate-700/50">
          <div className="text-3xl font-bold text-blue-400">{stats.legislators}</div>
          <div className="text-sm text-slate-400 mt-1">人の議員</div>
        </div>
        <div className="bg-slate-800/50 rounded-xl p-4 text-center border border-slate-700/50">
          <div className="text-3xl font-bold text-emerald-400">{stats.speeches.toLocaleString()}</div>
          <div className="text-sm text-slate-400 mt-1">件の発言</div>
        </div>
        <div className="bg-slate-800/50 rounded-xl p-4 text-center border border-slate-700/50">
          <div className="text-3xl font-bold text-amber-400">{stats.meetings}</div>
          <div className="text-sm text-slate-400 mt-1">件の会議</div>
        </div>
      </div>

      {/* 検索バー */}
      <div className="mb-6">
        <div className="relative">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">🔍</span>
          <input
            type="text"
            placeholder="議員名・政党名で検索..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-800 border border-slate-600 rounded-xl py-3 pl-12 pr-4 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
          />
        </div>
      </div>

      {/* フィルター */}
      <div className="flex flex-wrap gap-2 mb-4">
        {/* 院フィルター */}
        <div className="flex gap-1 mr-4">
          {(['all', '衆議院', '参議院'] as const).map((house) => (
            <button
              key={house}
              onClick={() => setHouseFilter(house)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                houseFilter === house
                  ? 'bg-slate-600 text-white'
                  : 'bg-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              {house === 'all' ? '全院' : house}
            </button>
          ))}
        </div>
        {/* 政党フィルター */}
        {PARTY_FILTERS.map((pf) => (
          <button
            key={pf.key}
            onClick={() => setPartyFilter(pf.key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
              partyFilter === pf.key
                ? `${pf.color} border-current bg-current/10`
                : 'border-slate-700 text-slate-500 hover:text-slate-300 hover:border-slate-500'
            }`}
          >
            {pf.label}
          </button>
        ))}
      </div>

      {/* 結果数 */}
      <div className="text-sm text-slate-500 mb-4">
        {filtered.length}人の議員を表示中
      </div>

      {/* 議員カード一覧 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {filtered.map((leg) => {
          const partyClass = getPartyClass(leg.current_party)
          const partyShort = getPartyShortName(leg.current_party)
          return (
            <a
              key={leg.id}
              href={`/legislator/${leg.id}`}
              className="group bg-slate-800/50 hover:bg-slate-800 border border-slate-700/50 hover:border-slate-600 rounded-xl p-4 transition-all hover:shadow-lg hover:shadow-slate-900/50"
            >
              <div className="flex items-start justify-between mb-2">
                <div>
                  <h3 className="text-lg font-bold text-slate-100 group-hover:text-blue-400 transition-colors">
                    {leg.name}
                  </h3>
                  <p className="text-xs text-slate-500">{leg.name_yomi}</p>
                </div>
                <span className={`text-xs font-medium px-2 py-1 rounded border party-tag-${partyClass}`}>
                  {partyShort}
                </span>
              </div>
              <div className="flex items-center gap-3 text-xs text-slate-400 mt-3">
                <span className="bg-slate-700/50 px-2 py-0.5 rounded">
                  {leg.house || '不明'}
                </span>
                {leg.current_position && (
                  <span className="text-amber-400/80">
                    {leg.current_position}
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-700/30">
                <span className="text-xs text-slate-500">
                  💬 発言 {leg.speech_count}件
                </span>
                <span className="text-xs text-slate-600 group-hover:text-blue-400 transition-colors">
                  詳細を見る →
                </span>
              </div>
            </a>
          )
        })}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-16">
          <div className="text-4xl mb-4">🔍</div>
          <p className="text-slate-400">該当する議員が見つかりません</p>
          <p className="text-slate-500 text-sm mt-2">検索条件を変えてみてください</p>
        </div>
      )}
    </div>
  )
}
