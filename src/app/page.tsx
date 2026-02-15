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
  const [controversialBills, setControversialBills] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  // 検索
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [searchOpen, setSearchOpen] = useState(false)
  const [searching, setSearching] = useState(false)

  useEffect(() => {
    loadDashboard()
  }, [])

  async function loadDashboard() {
    const [
      { count: memberCount },
      { count: expertCount },
      { count: speechCount },
      { count: meetingCount },
      { count: billCount },
      { count: scandalCount },
      { data: meetings },
      { data: scandals },
      { data: scandalPeople },
      { data: speakers },
      { data: trendLegs },
      { data: trendBills },
      { data: controBills },
    ] = await Promise.all([
      supabase.from('legislators').select('*', { count: 'exact', head: true }).neq('is_member', false),
      supabase.from('legislators').select('*', { count: 'exact', head: true }).eq('is_member', false),
      supabase.from('speeches').select('*', { count: 'exact', head: true }),
      supabase.from('meetings').select('*', { count: 'exact', head: true }),
      supabase.from('bills').select('*', { count: 'exact', head: true }),
      supabase.from('scandals').select('*', { count: 'exact', head: true }).eq('is_published', true),
      supabase.from('meetings').select('*').order('date', { ascending: false }).limit(5),
      supabase.from('scandals').select('*').eq('is_published', true).order('created_at', { ascending: false }),
      supabase.from('scandal_people').select('*, legislators(name, current_party)'),
      supabase.from('v_legislator_rankings').select('*').order('speeches_1y', { ascending: false }).limit(10),
      supabase.from('v_trending_legislators_7d').select('*').order('trend_score', { ascending: false }).limit(5),
      supabase.from('v_trending_bills_7d').select('*').order('speech_hits_7d', { ascending: false }).limit(5),
      supabase.from('v_bill_controversy').select('*').order('controversy_score', { ascending: false }).limit(5),
    ])

    setStats({
      legislators: memberCount || 0,
      experts: expertCount || 0,
      speeches: speechCount || 0,
      meetings: meetingCount || 0,
      bills: billCount || 0,
      scandals: scandalCount || 0,
    })

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
    setControversialBills(controBills || [])
    setLoading(false)
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

              {/* 注目議案 */}
              <div>
                <h3 className="text-sm font-bold text-slate-300 mb-2">争点法案</h3>
                <div className="space-y-1.5">
                  {controversialBills.length === 0 && trendingBills.length === 0 && (
                    <p className="text-xs text-slate-600 py-2">賛否データ不足</p>
                  )}
                  {(controversialBills.length > 0 ? controversialBills : trendingBills).map((tb: any) => (
                    <a key={tb.bill_id} href={`/bills/${tb.bill_id}`}
                      className="block py-1.5 px-2 rounded-lg hover:bg-slate-700/30 transition-all">
                      <div className="text-xs text-slate-200 line-clamp-2 leading-relaxed">{tb.bill_name}</div>
                      <div className="flex items-center gap-2 mt-1">
                        {tb.controversy_score > 0 && (
                          <>
                            <span className="text-xs px-1.5 py-0.5 rounded bg-emerald-900/20 text-emerald-400">賛成 {tb.yes_parties}</span>
                            <span className="text-xs px-1.5 py-0.5 rounded bg-red-900/20 text-red-400">反対 {tb.no_parties}</span>
                          </>
                        )}
                        {tb.speech_hits_7d > 0 && (
                          <span className="text-xs text-slate-500">発言 {tb.speech_hits_7d}件/7d</span>
                        )}
                      </div>
                    </a>
                  ))}
                </div>
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
                { label: '分析',       icon: '📊', href: '/analysis',   desc: '争点・一致率・ヒートマップ' },
                { label: '不祥事一覧', icon: '⚠️', href: '/scandals',   desc: 'スキャンダル検索' },
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
