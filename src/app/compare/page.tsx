'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { supabase, Legislator, getPartyClass, getPartyShortName, getHouseLabel } from '@/lib/supabase'

type LegWithStats = Legislator & {
  speech_count: number
  committees: { name: string; count: number }[]
  monthly: { month: string; count: number }[]
}

// ★ SearchBoxをトップレベルに定義（再レンダリングで再生成されない）
function SearchBox({ value, onChange, onSelect, allLegs }: {
  value: string; onChange: (v: string) => void; onSelect: (id: string) => void;
  allLegs: (Legislator & { speech_count: number })[]
}) {
  const candidates = value.length >= 1
    ? allLegs.filter(l => l.name.includes(value) || (l.name_yomi || '').includes(value)).slice(0, 8) : []
  return (
    <div className="relative">
      <input type="text" placeholder="議員名で検索..." value={value} onChange={e => onChange(e.target.value)}
        className="w-full bg-slate-800 border border-slate-600 rounded-xl py-2 px-4 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500" />
      {candidates.length > 0 && (
        <div className="absolute top-full left-0 right-0 bg-slate-800 border border-slate-600 rounded-xl mt-1 z-20 max-h-60 overflow-y-auto">
          {candidates.map(c => (
            <button key={c.id} onClick={() => { onSelect(c.id); onChange('') }}
              className="w-full text-left px-4 py-2 hover:bg-slate-700 text-sm text-slate-200 flex items-center justify-between">
              <span>{c.name}</span>
              <span className={`text-xs px-2 py-0.5 rounded border party-tag-${getPartyClass(c.current_party)}`}>
                {getPartyShortName(c.current_party)}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ★ LegCardもトップレベルに
function LegCard({ leg }: { leg: LegWithStats }) {
  const maxCommittee = leg.committees.length > 0 ? leg.committees[0].count : 1
  const maxMonthly = leg.monthly.length > 0 ? Math.max(...leg.monthly.map(m => m.count)) : 1
  const barMaxH = 80
  return (
    <div>
      <div className="rounded-xl overflow-hidden border border-slate-700/50 mb-4">
        <div className={`party-${getPartyClass(leg.current_party)} px-4 py-3`}>
          <a href={`/legislator/${leg.id}`} className="hover:underline">
            <h3 className="text-xl font-bold text-white">{leg.name}</h3>
          </a>
          <p className="text-xs text-white/70">{leg.name_yomi}</p>
        </div>
        <div className="bg-slate-800 p-4 space-y-2 text-sm">
          <div className="flex justify-between"><span className="text-slate-500">政党</span><span className="text-slate-200">{getPartyShortName(leg.current_party)}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">所属院</span><span className="text-slate-200">{getHouseLabel(leg.house)}</span></div>
          {leg.current_position && <div className="flex justify-between"><span className="text-slate-500">役職</span><span className="text-amber-400 text-xs">{leg.current_position}</span></div>}
          <div className="flex justify-between"><span className="text-slate-500">発言数</span><span className="text-emerald-400 font-bold">{leg.speech_count.toLocaleString()}件</span></div>
        </div>
      </div>

      <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50 mb-4">
        <h4 className="text-xs font-bold text-slate-400 mb-3">📋 委員会別発言数</h4>
        <div className="space-y-2">
          {leg.committees.map(c => (
            <div key={c.name} className="flex items-center gap-2">
              <div className="flex-1 text-xs text-slate-300 truncate" title={c.name}>{c.name}</div>
              <div className="w-24 bg-slate-700/30 rounded-full h-3 overflow-hidden">
                <div className="h-full rounded-full bg-blue-500/60" style={{ width: `${(c.count / maxCommittee) * 100}%` }} />
              </div>
              <span className="text-xs text-slate-500 w-8 text-right">{c.count}</span>
            </div>
          ))}
        </div>
      </div>

      {leg.monthly.length > 0 && (
        <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
          <h4 className="text-xs font-bold text-slate-400 mb-3">📈 月別発言数</h4>
          <div className="flex items-end gap-1" style={{ height: `${barMaxH + 20}px` }}>
            {leg.monthly.map(m => {
              const barH = maxMonthly > 0 ? Math.max(m.count > 0 ? 3 : 0, Math.round((m.count / maxMonthly) * barMaxH)) : 0
              return (
                <div key={m.month} className="flex-1 flex flex-col items-center justify-end group relative" style={{ minWidth: '12px', height: '100%' }}>
                  <div className="absolute -top-6 hidden group-hover:block bg-slate-700 text-xs text-slate-200 px-2 py-1 rounded whitespace-nowrap z-10">
                    {m.month}: {m.count}件
                  </div>
                  <div className="text-emerald-400 mb-0.5" style={{ fontSize: '9px' }}>{m.count}</div>
                  <div className="w-full bg-emerald-500 hover:bg-emerald-400 rounded-t transition-colors" style={{ height: `${barH}px` }} />
                </div>
              )
            })}
          </div>
          <div className="flex text-xs text-slate-500 mt-1 border-t border-slate-700/30 pt-1">
            {leg.monthly.map(m => (
              <span key={m.month} style={{ flex: 1, textAlign: 'center', fontSize: '9px' }}>{m.month.substring(5)}月</span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function CompareContent() {
  const searchParams = useSearchParams()
  const [allLegs, setAllLegs] = useState<(Legislator & { speech_count: number })[]>([])
  const [loading, setLoading] = useState(true)
  const [search1, setSearch1] = useState('')
  const [search2, setSearch2] = useState('')
  const [leg1, setLeg1] = useState<LegWithStats | null>(null)
  const [leg2, setLeg2] = useState<LegWithStats | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)

  async function loadDetail(legId: string, slot: 1 | 2) {
    setLoadingDetail(true)
    const { data: leg } = await supabase.from('legislators').select('*').eq('id', legId).single()
    if (!leg) { setLoadingDetail(false); return }

    const { count } = await supabase.from('speeches').select('*', { count: 'exact', head: true }).eq('legislator_id', legId)

    const { data: speeches } = await supabase
      .from('speeches').select('meetings(meeting_name)').eq('legislator_id', legId).range(0, 999)
    const committeeCounts: Record<string, number> = {}
    for (const sp of (speeches || [])) {
      const name = (sp as any).meetings?.meeting_name || '不明'
      committeeCounts[name] = (committeeCounts[name] || 0) + 1
    }
    const committees = Object.entries(committeeCounts)
      .map(([name, cnt]) => ({ name, count: cnt })).sort((a, b) => b.count - a.count).slice(0, 8)

    const { data: monthData } = await supabase
      .from('speeches').select('date').eq('legislator_id', legId).range(0, 4999)
    const monthlyCounts: Record<string, number> = {}
    for (const sp of (monthData || [])) {
      const m = (sp as any).date?.substring(0, 7)
      if (m) monthlyCounts[m] = (monthlyCounts[m] || 0) + 1
    }
    const monthly = Object.entries(monthlyCounts)
      .map(([month, cnt]) => ({ month, count: cnt })).sort((a, b) => a.month.localeCompare(b.month))

    const result: LegWithStats = { ...leg, speech_count: count || 0, committees, monthly }
    if (slot === 1) { setLeg1(result); setSearch1('') }
    else { setLeg2(result); setSearch2('') }
    setLoadingDetail(false)
  }

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('legislators_with_counts').select('*').gt('speech_count', 0)
        .order('speech_count', { ascending: false }).range(0, 4999)
      setAllLegs(data || [])
      setLoading(false)

      const leg1Id = searchParams.get('leg1')
      if (leg1Id) { loadDetail(leg1Id, 1) }
    }
    load()
  }, [])

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-20 text-center">
        <div className="animate-pulse"><div className="text-4xl mb-4">⚖️</div><p className="text-slate-400">データを読み込み中...</p></div>
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-slate-100 mb-6">⚖️ 議員比較</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          {!leg1 ? (
            <div className="bg-slate-800/30 rounded-xl p-6 border border-dashed border-slate-600 text-center">
              <p className="text-slate-500 text-sm mb-3">議員を選択してください</p>
              <SearchBox value={search1} onChange={setSearch1} onSelect={(id) => loadDetail(id, 1)} allLegs={allLegs} />
            </div>
          ) : (
            <div>
              <div className="flex justify-end mb-2">
                <button onClick={() => setLeg1(null)} className="text-xs text-slate-500 hover:text-slate-300">✕ 変更</button>
              </div>
              <LegCard leg={leg1} />
            </div>
          )}
        </div>
        <div>
          {!leg2 ? (
            <div className="bg-slate-800/30 rounded-xl p-6 border border-dashed border-slate-600 text-center">
              <p className="text-slate-500 text-sm mb-3">議員を選択してください</p>
              <SearchBox value={search2} onChange={setSearch2} onSelect={(id) => loadDetail(id, 2)} allLegs={allLegs} />
            </div>
          ) : (
            <div>
              <div className="flex justify-end mb-2">
                <button onClick={() => setLeg2(null)} className="text-xs text-slate-500 hover:text-slate-300">✕ 変更</button>
              </div>
              <LegCard leg={leg2} />
            </div>
          )}
        </div>
      </div>
      {loadingDetail && (
        <div className="text-center py-8"><div className="animate-pulse text-slate-400">データを取得中...</div></div>
      )}
    </div>
  )
}

export default function ComparePage() {
  return (
    <Suspense fallback={<div className="max-w-5xl mx-auto px-4 py-20 text-center"><div className="animate-pulse"><div className="text-4xl mb-4">⚖️</div><p className="text-slate-400">読み込み中...</p></div></div>}>
      <CompareContent />
    </Suspense>
  )
}
