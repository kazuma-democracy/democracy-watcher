'use client'

import { useEffect, useState } from 'react'
import { supabase, Legislator, getPartyClass, getPartyShortName, getHouseLabel, getPositionDisplay, getLegislatorsWithCounts, getStats, searchSpeeches } from '@/lib/supabase'

const PARTY_FILTERS = [
  { key: 'all', label: '全政党', color: 'text-slate-300 border-slate-500' },
  { key: '自由民主党', label: '自民', color: 'party-tag-ldp' },
  { key: '立憲民主', label: '立憲', color: 'party-tag-cdp' },
  { key: '公明', label: '公明', color: 'party-tag-komeito' },
  { key: '維新', label: '維新', color: 'party-tag-ishin' },
  { key: '国民民主', label: '国民', color: 'party-tag-dpfp' },
  { key: '共産', label: '共産', color: 'party-tag-jcp' },
  { key: 'れいわ', label: 'れいわ', color: 'party-tag-reiwa' },
  { key: '参政', label: '参政', color: 'party-tag-sansei' },
  { key: '社会民主党', label: '社民', color: 'party-tag-sdp' },
  { key: '保守', label: '保守党', color: 'party-tag-other' },
  { key: '有志の会', label: '有志', color: 'party-tag-other' },
  { key: '沖縄の風', label: '沖縄', color: 'party-tag-other' },
  { key: 'NHK', label: 'NHK', color: 'party-tag-other' },
  { key: 'みらい', label: 'みらい', color: 'party-tag-mirai' },
  { key: '無所属', label: '無所属', color: 'party-tag-other' },
]

type SortMode = 'name' | 'speeches' | 'recent'
type SearchMode = 'legislator' | 'speech'

export default function Home() {
  const [legislators, setLegislators] = useState<(Legislator & { speech_count: number; is_member?: boolean })[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [committedQuery, setCommittedQuery] = useState('')
  const [partyFilter, setPartyFilter] = useState('all')
  const [houseFilter, setHouseFilter] = useState<'all' | 'representatives' | 'councillors'>('all')
  const [sortMode, setSortMode] = useState<SortMode>('speeches')
  const [searchMode, setSearchMode] = useState<SearchMode>('legislator')
  const [speechResults, setSpeechResults] = useState<any[]>([])
  const [searchingSpeeches, setSearchingSpeeches] = useState(false)
  const [speakerFilter, setSpeakerFilter] = useState('')
  const [stats, setStats] = useState({ legislators: 0, speeches: 0, meetings: 0 })
  const [memberFilter, setMemberFilter] = useState<'members' | 'others' | 'all'>('members')
  const [tagMap, setTagMap] = useState<Record<string, string[]>>({})

  useEffect(() => {
    async function load() {
      const [legs, st] = await Promise.all([
        getLegislatorsWithCounts(),
        getStats(),
      ])
      setLegislators(legs)
      setStats(st)

      // タグ取得（裏金・統一教会）
      const { data: tags } = await supabase
        .from('legislator_tags')
        .select('legislator_id, tag')
        .in('tag', ['裏金議員', '統一教会接点'])
      if (tags) {
        const map: Record<string, string[]> = {}
        for (const t of tags) {
          if (!map[t.legislator_id]) map[t.legislator_id] = []
          if (!map[t.legislator_id].includes(t.tag)) map[t.legislator_id].push(t.tag)
        }
        setTagMap(map)
      }

      setLoading(false)
    }
    load()
  }, [])

  // 検索実行（ボタンクリック or Enter）
  function doSearch() {
    setCommittedQuery(searchQuery)
    if (searchMode === 'speech' && searchQuery.length >= 2) {
      doSpeechSearch()
    }
  }

  // 発言検索
  async function doSpeechSearch() {
    if (searchQuery.length < 2) return
    setSearchingSpeeches(true)
    const results = await searchSpeeches(searchQuery, 30, speakerFilter || undefined)
    setSpeechResults(results)
    setSearchingSpeeches(false)
  }

  // フィルター＋ソート
  const filtered = legislators
    .filter((leg) => {
      // 議員/非議員フィルター
      if (memberFilter === 'members' && leg.is_member === false) return false
      if (memberFilter === 'others' && leg.is_member !== false) return false
      if (searchMode === 'legislator' && committedQuery) {
        const q = committedQuery.toLowerCase()
        const matchName = leg.name.toLowerCase().includes(q)
        const matchYomi = leg.name_yomi?.toLowerCase().includes(q)
        const matchParty = leg.current_party?.toLowerCase().includes(q)
        if (!matchName && !matchYomi && !matchParty) return false
      }
      if (partyFilter !== 'all') {
        const party = leg.current_party || ''
        // 全角→半角変換してからマッチ（ＮＨＫ→NHK対応）
        const normalized = party.replace(/[Ａ-Ｚａ-ｚ０-９]/g, (c) =>
          String.fromCharCode(c.charCodeAt(0) - 0xFEE0)
        )
        if (!party.includes(partyFilter) && !normalized.includes(partyFilter)) return false
      }
      if (houseFilter !== 'all') {
        if (leg.house !== houseFilter) return false
      }
      return true
    })
    .sort((a, b) => {
      if (sortMode === 'speeches') return (b.speech_count || 0) - (a.speech_count || 0)
      if (sortMode === 'recent') return (b.last_seen || '').localeCompare(a.last_seen || '')
      return a.name.localeCompare(b.name, 'ja')
    })

  // 役職名を短くする
  function truncatePosition(pos: string | null) {
    if (!pos) return null
    if (pos.length > 20) return pos.substring(0, 18) + '…'
    return pos
  }

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
      {(() => {
        const memberCount = legislators.filter(l => l.is_member !== false).length
        const otherCount = legislators.filter(l => l.is_member === false).length
        return (
          <div className="grid grid-cols-4 gap-3 mb-8">
            <div className="bg-slate-800/50 rounded-xl p-4 text-center border border-slate-700/50">
              <div className="text-3xl font-bold text-blue-400">{memberCount.toLocaleString()}</div>
              <div className="text-sm text-slate-400 mt-1">人の議員</div>
            </div>
            <div className="bg-slate-800/50 rounded-xl p-4 text-center border border-slate-700/50">
              <div className="text-3xl font-bold text-purple-400">{otherCount.toLocaleString()}</div>
              <div className="text-sm text-slate-400 mt-1">人の有識者等</div>
            </div>
            <div className="bg-slate-800/50 rounded-xl p-4 text-center border border-slate-700/50">
              <div className="text-3xl font-bold text-emerald-400">{stats.speeches.toLocaleString()}</div>
              <div className="text-sm text-slate-400 mt-1">件の発言</div>
            </div>
            <div className="bg-slate-800/50 rounded-xl p-4 text-center border border-slate-700/50">
              <div className="text-3xl font-bold text-amber-400">{stats.meetings.toLocaleString()}</div>
              <div className="text-sm text-slate-400 mt-1">件の会議</div>
            </div>
          </div>
        )
      })()}

      {/* 検索モード切替 + 検索バー */}
      <div className="mb-6">
        <div className="flex gap-2 mb-2">
          <button
            onClick={() => { setSearchMode('legislator'); setSpeechResults([]); setSpeakerFilter(''); setCommittedQuery('') }}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
              searchMode === 'legislator' ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            👤 議員検索
          </button>
          <button
            onClick={() => { setSearchMode('speech'); setCommittedQuery('') }}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
              searchMode === 'speech' ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            💬 発言検索
          </button>
        </div>
        <div className="relative flex gap-2">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">🔍</span>
          <input
            type="text"
            placeholder={searchMode === 'legislator' ? '議員名・政党名で検索...' : '発言内容をキーワードで検索（例: 防衛費、少子化）...'}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') doSearch() }}
            className="w-full bg-slate-800 border border-slate-600 rounded-xl py-3 pl-12 pr-4 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
          />
          <button
            onClick={doSearch}
            disabled={searchQuery.length < 1 || searchingSpeeches}
            className={`px-5 py-3 ${searchMode === 'speech' ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-blue-600 hover:bg-blue-500'} disabled:bg-slate-700 disabled:text-slate-500 text-white font-medium rounded-xl transition-colors shrink-0`}
          >
            検索
          </button>
        </div>
        {/* 発言者フィルター（発言検索モード時のみ） */}
        {searchMode === 'speech' && (
          <div className="relative mt-2">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">👤</span>
            <input
              type="text"
              placeholder="発言者名で絞り込み（例: 高市、石破）..."
              value={speakerFilter}
              onChange={(e) => setSpeakerFilter(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') doSpeechSearch() }}
              className="w-full bg-slate-800/70 border border-slate-700 rounded-xl py-2 pl-12 pr-4 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
            />
            {speakerFilter && (
              <button
                onClick={() => setSpeakerFilter('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 text-sm"
              >
                ✕
              </button>
            )}
          </div>
        )}
      </div>

      {/* 発言検索結果 */}
      {searchMode === 'speech' && (searchingSpeeches || speechResults.length > 0) && (
        <div className="mb-8">
          {searchingSpeeches ? (
            <div className="text-center py-8">
              <div className="animate-pulse text-slate-400">🔍 発言を検索中...</div>
            </div>
          ) : speechResults.length > 0 ? (
            <div>
              <div className="text-sm text-slate-400 mb-3">
                💬 「{searchQuery}」を含む発言{speakerFilter ? `（${speakerFilter}）` : ''}: {speechResults.length}件
              </div>
              <div className="space-y-3">
                {speechResults.map((sp: any) => {
                  const content = sp.content || ''
                  const idx = content.toLowerCase().indexOf(searchQuery.toLowerCase())
                  const start = Math.max(0, idx - 50)
                  const end = Math.min(content.length, idx + searchQuery.length + 100)
                  const snippet = (start > 0 ? '...' : '') + content.substring(start, end) + (end < content.length ? '...' : '')

                  return (
                    <a
                      key={sp.id}
                      href={`/legislator/${sp.legislator_id}`}
                      className="block bg-slate-800/50 border border-slate-700/50 rounded-xl p-4 hover:border-slate-600 transition-all"
                    >
                      <div className="flex items-center gap-3 mb-2 text-xs">
                        <span className="text-slate-300 font-bold">{sp.legislators?.name}</span>
                        <span className={`px-2 py-0.5 rounded border party-tag-${getPartyClass(sp.legislators?.current_party)}`}>
                          {getPartyShortName(sp.legislators?.current_party)}
                        </span>
                        <span className="text-slate-500">{sp.date}</span>
                        <span className="bg-slate-700 px-2 py-0.5 rounded text-slate-400">
                          {getHouseLabel(sp.meetings?.house)} {sp.meetings?.meeting_name}
                        </span>
                      </div>
                      <p className="text-sm text-slate-400 leading-relaxed">
                        {snippet.split(new RegExp(`(${searchQuery})`, 'gi')).map((part: string, i: number) =>
                          part.toLowerCase() === searchQuery.toLowerCase()
                            ? <mark key={i} className="bg-yellow-500/30 text-yellow-200 px-0.5 rounded">{part}</mark>
                            : part
                        )}
                      </p>
                    </a>
                  )
                })}
              </div>
            </div>
          ) : (
            <div className="text-center py-8">
              <div className="text-slate-500">「{searchQuery}」を含む発言は見つかりませんでした</div>
            </div>
          )}
        </div>
      )}

      {/* フィルター + ソート */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {/* 議員/発言者フィルター */}
        <div className="flex gap-1 mr-2">
          {([
            { key: 'members', label: '👤 議員' },
            { key: 'others', label: '🏢 その他の発言者' },
            { key: 'all', label: '全員' },
          ] as { key: 'members' | 'others' | 'all'; label: string }[]).map((f) => (
            <button
              key={f.key}
              onClick={() => setMemberFilter(f.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                memberFilter === f.key ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="w-full sm:w-auto" />
        {/* 院フィルター */}
        <div className="flex gap-1 mr-2">
          {([{key: 'all', label: '全院'}, {key: 'representatives', label: '衆議院'}, {key: 'councillors', label: '参議院'}] as const).map((house) => (
            <button
              key={house.key}
              onClick={() => setHouseFilter(house.key as any)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                houseFilter === house.key ? 'bg-slate-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              {house.label}
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

        {/* ソート */}
        <div className="flex gap-1 ml-auto">
          {([
            { key: 'speeches', label: '発言数順' },
            { key: 'name', label: '名前順' },
            { key: 'recent', label: '最近の活動順' },
          ] as { key: SortMode; label: string }[]).map((s) => (
            <button
              key={s.key}
              onClick={() => setSortMode(s.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                sortMode === s.key ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
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
          const position = (() => {
            const pd = getPositionDisplay(leg)
            return pd.label ? { text: truncatePosition(pd.label), isOverride: pd.isOverride, full: pd.label } : null
          })()
          const isInactive = (leg.speech_count || 0) === 0
          return (
            <a
              key={leg.id}
              href={`/legislator/${leg.id}`}
              className={`group border rounded-xl p-4 transition-all hover:shadow-lg hover:shadow-slate-900/50 ${
                isInactive
                  ? 'bg-slate-900/30 border-slate-800/50 opacity-60 hover:opacity-80'
                  : 'bg-slate-800/50 hover:bg-slate-800 border-slate-700/50 hover:border-slate-600'
              }`}
            >
              <div className="flex items-start justify-between mb-2">
                <div className="min-w-0 flex-1 mr-2">
                  <h3 className="text-lg font-bold text-slate-100 group-hover:text-blue-400 transition-colors truncate">
                    {leg.name}
                  </h3>
                  <p className="text-xs text-slate-500">{leg.name_yomi}</p>
                </div>
                <span className={`text-xs font-medium px-2 py-1 rounded border shrink-0 party-tag-${partyClass}`}>
                  {partyShort}
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-400 mt-3 flex-wrap">
                <span className="bg-slate-700/50 px-2 py-0.5 rounded">
                  {getHouseLabel(leg.house)}
                </span>
                {position && (
                  <span className={`truncate max-w-[200px] ${position.isOverride ? 'text-amber-400' : 'text-amber-400/50 italic'}`} title={position.full}>
                    {position.text}{!position.isOverride && ' ※'}
                  </span>
                )}
                {tagMap[leg.id]?.includes('裏金議員') && (
                  <span className="bg-red-900/40 text-red-400 border border-red-700/40 px-1.5 py-0.5 rounded text-[10px] font-bold">
                    🏴 裏金
                  </span>
                )}
                {tagMap[leg.id]?.includes('統一教会接点') && (
                  <span className="bg-purple-900/40 text-purple-400 border border-purple-700/40 px-1.5 py-0.5 rounded text-[10px] font-bold">
                    ⛪ 統一教会
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-700/30">
                <span className="text-xs text-slate-500">
                  💬 発言 {(leg.speech_count || 0).toLocaleString()}件
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
