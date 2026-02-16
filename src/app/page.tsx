'use client'

import { useEffect, useState } from 'react'
import { supabase, getPartyClass, getPartyShortName, getHouseLabel, getPositionDisplay } from '@/lib/supabase'

// === 不祥事ステータス ===
const SEVERITY_MAP: Record<string, { label: string; color: string; bg: string }> = {
  allegation:    { label: '疑惑',     color: 'text-yellow-400', bg: 'bg-yellow-500/20' },
  investigation: { label: '調査中',   color: 'text-orange-400', bg: 'bg-orange-500/20' },
  confirmed:     { label: '事実確認', color: 'text-red-400',    bg: 'bg-red-500/20' },
  convicted:     { label: '有罪確定', color: 'text-red-500',    bg: 'bg-red-600/20' },
}

// === 横断検索の型 ===
type SearchResult = {
  type: 'legislator' | 'bill' | 'scandal'
  id: string
  title: string
  subtitle: string
  href: string
}

export default function Dashboard() {
  // --- state ---
  const [stats, setStats] = useState({ legislators: 0, experts: 0, speeches: 0, meetings: 0, bills: 0, scandals: 0 })
  const [recentMeetings, setRecentMeetings] = useState<any[]>([])
  const [recentScandals, setRecentScandals] = useState<any[]>([])
  const [scandalCounts, setScandalCounts] = useState<Record<string, number>>({})
  const [scandalPartyTop, setScandalPartyTop] = useState<{ party: string; count: number }[]>([])
  const [topSpeakers, setTopSpeakers] = useState<any[]>([])
  const [trendingLegislators, setTrendingLegislators] = useState<any[]>([])
  const [trendingBills, setTrendingBills] = useState<any[]>([])
  const [allControBills, setAllControBills] = useState<any[]>([])
  const [allRubberBills, setAllRubberBills] = useState<any[]>([])
  const [controPeriod, setControPeriod] = useState('5y')
  const [loading, setLoading] = useState(true)

  // 検索
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [searchOpen, setSearchOpen] = useState(false)
  const [searching, setSearching] = useState(false)

  // 期間フィルター: 回次→年の概算マッピング
  const PERIOD_SESSION_MIN: Record<string, number> = {
    '1y': 219,   // 2025〜
    '5y': 208,   // 2022〜
    '10y': 190,  // 2016〜
    'all': 0,
  }

  // 期間でフィルターした争点法案と翼賛法案
  const { filteredContro, rubberStampBills } = (() => {
    const minSession = PERIOD_SESSION_MIN[controPeriod] || 0

    // 争点法案（与野党が割れた）：多様性フィルター付き
    const inPeriod = allControBills.filter(b => (b.session || 0) >= minSession)
    const contro: any[] = []
    const seenCat: Record<string, number> = {}
    for (const b of inPeriod.filter(b => b.no_parties >= 3)) {
      const cat = b.category || '不明'
      seenCat[cat] = (seenCat[cat] || 0) + 1
      if (seenCat[cat] <= 2) contro.push(b)
      if (contro.length >= 5) break
    }

    // 翼賛法案（ほぼ全会一致、1〜2党だけ反対）：専用データソース
    const rubberInPeriod = allRubberBills.filter(b => (b.session || 0) >= minSession)
    // 多様性フィルター
    const rubber: any[] = []
    const seenCat2: Record<string, number> = {}
    for (const b of rubberInPeriod) {
      const cat = b.category || '不明'
      seenCat2[cat] = (seenCat2[cat] || 0) + 1
      if (seenCat2[cat] <= 2) rubber.push(b)
      if (rubber.length >= 5) break
    }

    return { filteredContro: contro, rubberStampBills: rubber }
  })()

  useEffect(() => {
    loadDashboard()
  }, [])

  async function loadDashboard() {
    // Phase 1: app_statsから統計を一発取得（タイムアウトしない）
    const { data: statsRow, error: statsErr } = await supabase
      .from('app_stats')
      .select('*')
      .eq('id', 1)
      .single()

    if (statsErr) console.error('app_stats error:', statsErr)

    setStats({
      legislators: statsRow?.legislators_count ?? 0,
      experts: statsRow?.experts_count ?? 0,
      speeches: statsRow?.speeches_count ?? 0,
      meetings: statsRow?.meetings_count ?? 0,
      bills: statsRow?.bills_count ?? 0,
      scandals: statsRow?.scandals_count ?? 0,
    })

    // Phase 2: データ取得系（6本）
    const [
      { data: meetings },
      { data: scandals },
      { data: scandalPeople },
      { data: speakers },
      { data: trendLegs },
      { data: trendBills },
    ] = await Promise.all([
      supabase.from('meetings').select('*').order('date', { ascending: false }).limit(5),
      supabase.from('scandals').select('*').eq('is_published', true).order('created_at', { ascending: false }),
      supabase.from('scandal_people').select('*, legislators(name, current_party)'),
      supabase.from('v_legislator_rankings').select('*').order('speeches_1y', { ascending: false }).limit(10),
      supabase.from('v_trending_legislators_7d').select('*').order('trend_score', { ascending: false }).limit(5),
      supabase.from('v_trending_bills_7d').select('*').order('speech_hits_7d', { ascending: false }).limit(5),
    ])

    // 会議に発言数を付与
    if (meetings) {
      const meetingIds = meetings.map(m => m.id)
      const { data: speechRows } = await supabase
        .from('speeches')
        .select('meeting_id')
        .in('meeting_id', meetingIds)
      const countMap: Record<string, number> = {}
      ;(speechRows || []).forEach(s => {
        countMap[s.meeting_id] = (countMap[s.meeting_id] || 0) + 1
      })
      setRecentMeetings(meetings.map(m => ({ ...m, speech_count: countMap[m.id] || 0 })))
    }

    // 不祥事
    if (scandals) {
      setRecentScandals(scandals.slice(0, 3))
      const counts: Record<string, number> = {}
      scandals.forEach(s => { counts[s.severity] = (counts[s.severity] || 0) + 1 })
      setScandalCounts(counts)

      // 会派別TOP
      const partyMap: Record<string, number> = {}
      ;(scandalPeople || []).forEach((sp: any) => {
        const party = sp.legislators?.current_party
        if (party) {
          const short = getPartyShortName(party)
          partyMap[short] = (partyMap[short] || 0) + 1
        }
      })
      setScandalPartyTop(
        Object.entries(partyMap)
          .map(([party, count]) => ({ party, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 5)
      )
    }

    setTopSpeakers(speakers || [])
    setTrendingLegislators(trendLegs || [])
    setTrendingBills(trendBills || [])
    setLoading(false)

    // Phase 3: 重いクエリ（争点法案）— 画面表示後に非同期で読み込み
    const [
      { data: controBills },
      { data: rubberBills },
    ] = await Promise.all([
      supabase.from('v_bill_controversy').select('*').order('controversy_score', { ascending: false }).limit(200),
      supabase.from('v_bill_controversy').select('*').lte('no_parties', 2).gte('yes_parties', 4).order('yes_parties', { ascending: false }).limit(100),
    ])
    setAllControBills(controBills || [])
    setAllRubberBills(rubberBills || [])
  }

  // === 横断検索 ===
  async function doSearch(q: string) {
    if (q.length < 2) { setSearchResults([]); return }
    setSearching(true)
    const results: SearchResult[] = []

    const [{ data: legs }, { data: bills }, { data: scans }] = await Promise.all([
      supabase.from('legislators').select('id, name, name_yomi, current_party, house')
        .or(`name.ilike.%${q}%,name_yomi.ilike.%${q}%`).limit(5),
      supabase.from('bills').select('id, bill_name, status, session')
        .ilike('bill_name', `%${q}%`).limit(5),
      supabase.from('scandals').select('id, title, severity')
        .eq('is_published', true).ilike('title', `%${q}%`).limit(5),
    ])

    ;(legs || []).forEach(l => results.push({
      type: 'legislator', id: l.id, href: `/legislator/${l.id}`,
      title: l.name,
      subtitle: `${getPartyShortName(l.current_party)} / ${getHouseLabel(l.house)}`,
    }))
    ;(bills || []).forEach(b => results.push({
      type: 'bill', id: b.id, href: `/bills/${b.id}`,
      title: b.bill_name.length > 40 ? b.bill_name.substring(0, 38) + '…' : b.bill_name,
      subtitle: `第${b.session}回国会 / ${b.status || ''}`,
    }))
    ;(scans || []).forEach(s => results.push({
      type: 'scandal', id: s.id, href: `/scandals`,
      title: s.title,
      subtitle: SEVERITY_MAP[s.severity]?.label || s.severity,
    }))

    setSearchResults(results)
    setSearching(false)
  }

  const typeIcon = (t: string) => t === 'legislator' ? '👤' : t === 'bill' ? '📜' : '⚠️'

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-20 text-center">
        <div className="animate-pulse">
          <div className="text-4xl mb-4">🏛️</div>
          <p className="text-slate-400">ダッシュボードを読み込み中...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">

      {/* ========== 検索バー ========== */}
      <div className="relative mb-8">
        <div className="bg-slate-800/70 border border-slate-700/50 rounded-2xl p-1">
          <input
            type="text"
            placeholder="🔍 議員・議案・不祥事を横断検索..."
            value={searchQuery}
            onChange={e => {
              setSearchQuery(e.target.value)
              setSearchOpen(true)
              doSearch(e.target.value)
            }}
            onFocus={() => searchQuery.length >= 2 && setSearchOpen(true)}
            onBlur={() => setTimeout(() => setSearchOpen(false), 200)}
            className="w-full bg-transparent px-5 py-3 text-lg text-slate-100 placeholder:text-slate-500 focus:outline-none"
          />
        </div>
        {searchOpen && searchResults.length > 0 && (
          <div className="absolute z-50 top-full mt-1 w-full bg-slate-800 border border-slate-700 rounded-xl shadow-2xl max-h-80 overflow-y-auto">
            {searchResults.map(r => (
              <a key={`${r.type}-${r.id}`} href={r.href}
                className="flex items-center gap-3 px-4 py-3 hover:bg-slate-700/50 border-b border-slate-700/30 last:border-0">
                <span className="text-lg">{typeIcon(r.type)}</span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-slate-100 truncate">{r.title}</div>
                  <div className="text-xs text-slate-500">{r.subtitle}</div>
                </div>
              </a>
            ))}
          </div>
        )}
        {searchOpen && searchQuery.length >= 2 && searchResults.length === 0 && !searching && (
          <div className="absolute z-50 top-full mt-1 w-full bg-slate-800 border border-slate-700 rounded-xl p-4 text-center text-slate-500 text-sm">
            該当なし
          </div>
        )}
      </div>

      {/* ========== 統計バー ========== */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-8">
        {[
          { label: '議員', value: stats.legislators, icon: '👤', href: '/legislators' },
          { label: '有識者等', value: stats.experts, icon: '🎓', href: '/legislators' },
          { label: '発言', value: stats.speeches, icon: '💬', href: '/legislators' },
          { label: '会議', value: stats.meetings, icon: '🏛️', href: '/meetings' },
          { label: '議案', value: stats.bills, icon: '📜', href: '/bills' },
          { label: '不祥事', value: stats.scandals, icon: '⚠️', href: '/scandals' },
        ].map(s => (
          <a key={s.label} href={s.href}
            className="bg-slate-800/50 border border-slate-700/40 rounded-xl p-3 text-center hover:bg-slate-800 hover:border-slate-600 transition-all">
            <div className="text-lg">{s.icon}</div>
            <div className="text-xl font-bold text-slate-100">{s.value.toLocaleString()}</div>
            <div className="text-xs text-slate-500">{s.label}</div>
          </a>
        ))}
      </div>

      {/* ========== 2カラム ========== */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">

        {/* 左カラム（3/5） */}
        <div className="lg:col-span-3 space-y-6">

          {/* 直近の国会 */}
          <section className="bg-slate-800/40 border border-slate-700/40 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-slate-100">🏛️ 直近の国会</h2>
              <a href="/meetings" className="text-xs text-blue-400 hover:text-blue-300">すべて見る →</a>
            </div>
            <div className="space-y-3">
              {recentMeetings.map(m => (
                <a key={m.id} href={`/meetings/${m.id}`}
                  className="block bg-slate-900/50 rounded-lg p-3 hover:bg-slate-900/80 transition-all border border-slate-700/30 hover:border-slate-600/50">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-slate-200 truncate">{m.meeting_name}</div>
                      <div className="flex items-center gap-2 mt-1 text-xs text-slate-500">
                        <span>{m.date}</span>
                        <span className="bg-slate-700/50 px-1.5 py-0.5 rounded">{getHouseLabel(m.house)}</span>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-emerald-400 font-bold text-sm">{m.speech_count}</span>
                      <span className="text-xs text-slate-500 ml-1">発言</span>
                    </div>
                  </div>
                </a>
              ))}
            </div>
          </section>

          {/* 注目トピック */}
          <section className="bg-slate-800/40 border border-slate-700/40 rounded-xl p-5">
            <h2 className="text-lg font-bold text-slate-100 mb-4">🔥 注目トピック</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

              {/* 注目議員 */}
              <div>
                <h3 className="text-sm font-bold text-slate-300 mb-2">注目議員（直近7日）</h3>
                <div className="space-y-1.5">
                  {trendingLegislators.length === 0 && (
                    <p className="text-xs text-slate-600 py-2">直近7日のデータなし</p>
                  )}
                  {trendingLegislators.map((tl: any) => {
                    const pd = getPositionDisplay(tl)
                    return (
                      <a key={tl.id} href={`/legislator/${tl.id}`}
                        className="flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-slate-700/30 transition-all">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm font-medium text-slate-200">{tl.name}</span>
                            <span className={`text-xs px-1 py-0.5 rounded party-${getPartyClass(tl.current_party)}`}>
                              {getPartyShortName(tl.current_party)}
                            </span>
                          </div>
                          {pd.label && (
                            <div className={`text-xs truncate ${pd.isOverride ? 'text-amber-400/70' : 'text-amber-400/40 italic'}`}>
                              {pd.label}
                            </div>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          <span className="text-emerald-400 font-bold text-xs">{tl.speeches_7d}</span>
                          <span className="text-xs text-slate-600 ml-0.5">件/7d</span>
                        </div>
                      </a>
                    )
                  })}
                </div>
              </div>

              {/* 注目議案（争点法案 + 翼賛法案） */}
              <div>
                {/* 期間フィルター */}
                <div className="flex items-center gap-2 mb-3">
                  <h3 className="text-sm font-bold text-slate-300">⚡ 賛否が割れた法案</h3>
                  <div className="flex gap-1 ml-auto">
                    {[
                      { key: '1y', label: '1年' },
                      { key: '5y', label: '5年' },
                      { key: '10y', label: '10年' },
                      { key: 'all', label: '全期間' },
                    ].map(p => (
                      <button
                        key={p.key}
                        onClick={() => setControPeriod(p.key)}
                        className={`text-[10px] px-1.5 py-0.5 rounded transition-colors ${
                          controPeriod === p.key
                            ? 'bg-blue-600 text-white'
                            : 'bg-slate-700/50 text-slate-500 hover:text-slate-300'
                        }`}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 与野党対立 */}
                <div className="space-y-2 mb-4">
                  {filteredContro.length === 0 && (
                    <p className="text-xs text-slate-600 py-2">この期間の対立法案なし</p>
                  )}
                  {filteredContro.map((tb: any, idx: number) => {
                    const totalParties = (tb.yes_parties || 0) + (tb.no_parties || 0)
                    const yeaPct = totalParties > 0 ? Math.round((tb.yes_parties / totalParties) * 100) : 50
                    return (
                      <a key={tb.bill_id} href={`/bills/${tb.bill_id}`}
                        className="block py-2.5 px-3 rounded-lg bg-slate-800/40 border border-slate-700/20 hover:border-slate-600 hover:bg-slate-800/60 transition-all">
                        <div className="flex items-start gap-2 mb-1.5">
                          <span className="text-xs text-slate-600 font-bold shrink-0 mt-0.5">{idx + 1}</span>
                          <div className="min-w-0 flex-1">
                            <div className="text-xs text-slate-200 line-clamp-2 leading-relaxed">{tb.bill_name}</div>
                            {tb.category && (
                              <span className="text-[10px] text-slate-500 mt-0.5 inline-block">{tb.category}</span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 mt-1">
                          <span className="text-[10px] text-emerald-400 w-5 text-right">{tb.yes_parties}</span>
                          <div className="flex-1 h-2 bg-slate-700/50 rounded-full overflow-hidden flex">
                            <div className="h-full bg-emerald-500/60 rounded-l-full" style={{ width: `${yeaPct}%` }} />
                            <div className="h-full bg-red-500/60 rounded-r-full" style={{ width: `${100 - yeaPct}%` }} />
                          </div>
                          <span className="text-[10px] text-red-400 w-5">{tb.no_parties}</span>
                        </div>
                      </a>
                    )
                  })}
                </div>

                {/* 翼賛法案 */}
                {rubberStampBills.length > 0 && (
                  <div>
                    <h3 className="text-sm font-bold text-amber-400/80 mb-2 flex items-center gap-1">
                      🏛️ ほぼ全会一致（少数党のみ反対）
                    </h3>
                    <div className="space-y-1.5">
                      {rubberStampBills.map((tb: any) => {
                        const totalParties = (tb.yes_parties || 0) + (tb.no_parties || 0)
                        const yeaPct = totalParties > 0 ? Math.round((tb.yes_parties / totalParties) * 100) : 50
                        return (
                          <a key={tb.bill_id} href={`/bills/${tb.bill_id}`}
                            className="block py-2 px-3 rounded-lg bg-amber-900/10 border border-amber-700/15 hover:border-amber-600/30 hover:bg-amber-900/20 transition-all">
                            <div className="text-xs text-slate-300 line-clamp-2 leading-relaxed">{tb.bill_name}</div>
                            <div className="flex items-center gap-1.5 mt-1">
                              <span className="text-[10px] text-emerald-400 w-5 text-right">{tb.yes_parties}</span>
                              <div className="flex-1 h-1.5 bg-slate-700/50 rounded-full overflow-hidden flex">
                                <div className="h-full bg-emerald-500/40 rounded-l-full" style={{ width: `${yeaPct}%` }} />
                                <div className="h-full bg-amber-500/60 rounded-r-full" style={{ width: `${100 - yeaPct}%` }} />
                              </div>
                              <span className="text-[10px] text-amber-400 w-5">{tb.no_parties}</span>
                            </div>
                          </a>
                        )
                      })}
                    </div>
                    <p className="text-[10px] text-slate-600 mt-1.5">
                      ※ 反対が1〜2会派のみの法案。多数派の同調圧力に注意
                    </p>
                  </div>
                )}
              </div>
            </div>
            <div className="mt-3 text-right">
              <a href="/analysis" className="text-xs text-blue-400 hover:text-blue-300">分析ページで詳しく →</a>
            </div>
          </section>

          {/* 探索ショートカット */}
          <section>
            <h2 className="text-lg font-bold text-slate-100 mb-4">🧭 探索する</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {[
                { label: '議員一覧',   icon: '👤', href: '/legislators', desc: '全議員を検索・フィルター' },
                { label: '議案・採決', icon: '📜', href: '/bills',       desc: '法案の賛否を確認' },
                { label: '議員比較',   icon: '⚖️', href: '/compare',    desc: '2人の活動を比較' },
                { label: 'ランキング', icon: '🏆', href: '/rankings',   desc: '活動量ランキング' },
                { label: '委員会',     icon: '📋', href: '/committee',  desc: '委員会別の発言' },
                { label: '憲法審査会', icon: '📜', href: '/kenpou',     desc: '憲法改正の議論を追跡' },
                { label: '分析',       icon: '📊', href: '/analysis',   desc: '争点・一致率・ヒートマップ' },
                { label: '不祥事一覧', icon: '⚠️', href: '/scandals',   desc: 'スキャンダル検索' },
                { label: '発言検証',   icon: '🔍', href: '/fact-check', desc: '発言の正確性を検証' },
              ].map(item => (
                <a key={item.label} href={item.href}
                  className="bg-slate-800/40 border border-slate-700/40 rounded-xl p-4 hover:bg-slate-800 hover:border-slate-600 transition-all group">
                  <div className="text-2xl mb-2">{item.icon}</div>
                  <div className="text-sm font-bold text-slate-200 group-hover:text-blue-400 transition-colors">{item.label}</div>
                  <div className="text-xs text-slate-500 mt-1">{item.desc}</div>
                </a>
              ))}
            </div>
          </section>
        </div>

        {/* 右カラム（2/5） */}
        <div className="lg:col-span-2 space-y-6">

          {/* 不祥事ダイジェスト */}
          <section className="bg-slate-800/40 border border-slate-700/40 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-slate-100">⚠️ 不祥事ダイジェスト</h2>
              <a href="/scandals" className="text-xs text-blue-400 hover:text-blue-300">すべて見る →</a>
            </div>

            {/* ステータス別カウント */}
            <div className="grid grid-cols-4 gap-2 mb-4">
              {Object.entries(SEVERITY_MAP).map(([key, sv]) => (
                <div key={key} className={`${sv.bg} rounded-lg p-2 text-center`}>
                  <div className={`text-lg font-bold ${sv.color}`}>{scandalCounts[key] || 0}</div>
                  <div className="text-xs text-slate-400">{sv.label}</div>
                </div>
              ))}
            </div>

            {/* 最新3件 */}
            <div className="space-y-2 mb-4">
              {recentScandals.map(s => (
                <a key={s.id} href="/scandals"
                  className="block bg-slate-900/50 rounded-lg p-3 hover:bg-slate-900/80 transition-all border border-slate-700/30">
                  <div className="text-sm text-slate-200 truncate">{s.title}</div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`text-xs px-1.5 py-0.5 rounded ${SEVERITY_MAP[s.severity]?.bg} ${SEVERITY_MAP[s.severity]?.color}`}>
                      {SEVERITY_MAP[s.severity]?.label || s.severity}
                    </span>
                    <span className="text-xs text-slate-600">{s.start_date || ''}</span>
                  </div>
                </a>
              ))}
              {recentScandals.length === 0 && (
                <p className="text-sm text-slate-600 text-center py-3">登録された不祥事はありません</p>
              )}
            </div>

            {/* 会派別ミニバー */}
            {scandalPartyTop.length > 0 && (
              <div>
                <div className="text-xs text-slate-500 mb-2">会派別 関与件数</div>
                <div className="space-y-1.5">
                  {scandalPartyTop.map(p => {
                    const max = scandalPartyTop[0]?.count || 1
                    return (
                      <div key={p.party} className="flex items-center gap-2">
                        <span className="text-xs text-slate-400 w-12 text-right shrink-0">{p.party}</span>
                        <div className="flex-1 bg-slate-900/50 rounded-full h-4 overflow-hidden">
                          <div className="bg-red-500/60 h-full rounded-full" style={{ width: `${(p.count / max) * 100}%` }} />
                        </div>
                        <span className="text-xs text-red-400 w-6 shrink-0">{p.count}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </section>

          {/* 発言ランキング TOP10 */}
          <section className="bg-slate-800/40 border border-slate-700/40 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-slate-100">🏆 発言ランキング（直近1年）</h2>
              <a href="/rankings" className="text-xs text-blue-400 hover:text-blue-300">全ランキング →</a>
            </div>
            <div className="space-y-1">
              {topSpeakers.map((sp: any, i: number) => {
                const pd = getPositionDisplay(sp)
                return (
                  <a key={sp.legislator_id} href={`/legislator/${sp.legislator_id}`}
                    className="flex items-center gap-3 py-2 px-2 rounded-lg hover:bg-slate-700/30 transition-all">
                    <span className={`w-6 text-center font-bold text-sm ${
                      i === 0 ? 'text-yellow-400' : i === 1 ? 'text-slate-300' : i === 2 ? 'text-amber-600' : 'text-slate-500'
                    }`}>{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-medium text-slate-200">{sp.name}</span>
                        <span className={`text-xs px-1 py-0.5 rounded party-${getPartyClass(sp.current_party)} text-white/80`}>
                          {getPartyShortName(sp.current_party)}
                        </span>
                      </div>
                      {pd.label && (
                        <div className={`text-xs truncate ${pd.isOverride ? 'text-amber-400/70' : 'text-amber-400/40 italic'}`}>
                          {pd.label}
                        </div>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-emerald-400 font-bold text-sm">{sp.speeches_1y}</span>
                      <span className="text-xs text-slate-500 ml-0.5">件</span>
                    </div>
                  </a>
                )
              })}
            </div>
          </section>

        </div>
      </div>
    </div>
  )
}
