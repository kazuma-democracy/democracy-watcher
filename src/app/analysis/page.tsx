'use client'

import { useEffect, useState } from 'react'
import { supabase, getPartyShortName } from '@/lib/supabase'

// ===== 型 =====
type CategoryVote = {
  party_name: string
  category: string
  n_votes: number
  yes_count: number
  no_count: number
  yes_pct: number
  no_pct: number
}

type PairAgreement = {
  party_a: string
  party_b: string
  n_common_bills: number
  same_count: number
  agree_pct: number
}

type ContestedBill = {
  bill_id: string
  session: number | null
  house: string | null
  bill_type: string | null
  bill_name: string
  status: string | null
  category: string | null
  n_parties: number
  yes_parties: number
  no_parties: number
  split_score: number
}

// 主要政党の表示順
const PARTY_ORDER = [
  '自由民主党', '立憲民主党', '公明党', '日本維新の会',
  '国民民主党', '日本共産党', 'れいわ新選組', '参政党',
  '社会民主党', '教育無償化を実現する会',
]

function sortParties(parties: string[]): string[] {
  return parties.sort((a, b) => {
    const ia = PARTY_ORDER.indexOf(a)
    const ib = PARTY_ORDER.indexOf(b)
    if (ia >= 0 && ib >= 0) return ia - ib
    if (ia >= 0) return -1
    if (ib >= 0) return 1
    return a.localeCompare(b)
  })
}

export default function AnalysisPage() {
  const [catVotes, setCatVotes] = useState<CategoryVote[]>([])
  const [pairData, setPairData] = useState<PairAgreement[]>([])
  const [contested, setContested] = useState<ContestedBill[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'heatmap' | 'agreement' | 'controversial'>('heatmap')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const [r1, r2, r3] = await Promise.all([
          supabase.from('v_party_category_votes').select('*'),
          supabase.from('v_party_pair_agreement').select('*'),
          supabase.from('v_contested_bills').select('*')
            .order('split_score', { ascending: false })
            .limit(200),
        ])
        if (r1.error) throw new Error(`ヒートマップ: ${r1.error.message}`)
        if (r2.error) throw new Error(`一致率: ${r2.error.message}`)
        if (r3.error) throw new Error(`争点: ${r3.error.message}`)
        setCatVotes(r1.data || [])
        setPairData(r2.data || [])
        setContested(r3.data || [])
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : '取得エラー')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-20 text-center">
        <div className="animate-pulse">
          <div className="text-4xl mb-4">📊</div>
          <p className="text-slate-400">賛否データを分析中...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-20 text-center">
        <div className="text-4xl mb-4">⚠️</div>
        <p className="text-red-400 mb-2">データ取得エラー</p>
        <p className="text-sm text-slate-500">{error}</p>
        <p className="text-xs text-slate-600 mt-4">
          Supabase SQL Editor で <code className="bg-slate-800 px-1 rounded">create_analysis_views.sql</code> を実行してください
        </p>
      </div>
    )
  }

  // ===== ヒートマップ用データ整理 =====
  const hmParties = sortParties([...new Set(catVotes.map(v => v.party_name))]).slice(0, 10)
  const catTotals: Record<string, number> = {}
  for (const v of catVotes) {
    catTotals[v.category] = (catTotals[v.category] || 0) + v.n_votes
  }
  const hmCategories = Object.keys(catTotals).sort((a, b) => catTotals[b] - catTotals[a])

  const hmLookup: Record<string, CategoryVote> = {}
  for (const v of catVotes) {
    hmLookup[`${v.party_name}__${v.category}`] = v
  }

  // ===== 一致率用データ整理 =====
  const agParties = sortParties([...new Set([
    ...pairData.map(p => p.party_a),
    ...pairData.map(p => p.party_b),
  ])]).slice(0, 10)

  const agLookup: Record<string, PairAgreement> = {}
  for (const p of pairData) {
    agLookup[`${p.party_a}__${p.party_b}`] = p
    agLookup[`${p.party_b}__${p.party_a}`] = p
  }

  const sortedPairs = [...pairData].filter(p =>
    agParties.includes(p.party_a) && agParties.includes(p.party_b) && p.n_common_bills >= 10
  )
  const topAgree = [...sortedPairs].sort((a, b) => b.agree_pct - a.agree_pct).slice(0, 5)
  const topDisagree = [...sortedPairs].sort((a, b) => a.agree_pct - b.agree_pct).slice(0, 5)

  // ===== 色関数 =====
  function getHeatColor(yeaPct: number, nVotes: number): string {
    const opacity = nVotes < 10 ? ' opacity-40' : ''
    if (yeaPct >= 90) return 'bg-emerald-600/80 text-white' + opacity
    if (yeaPct >= 70) return 'bg-emerald-700/50 text-emerald-200' + opacity
    if (yeaPct >= 50) return 'bg-yellow-700/40 text-yellow-200' + opacity
    if (yeaPct >= 30) return 'bg-orange-700/40 text-orange-200' + opacity
    return 'bg-red-700/50 text-red-200' + opacity
  }

  function getAgreeColor(pct: number, n: number): string {
    const opacity = n < 30 ? ' opacity-40' : ''
    if (pct >= 90) return 'bg-emerald-600/70 text-white' + opacity
    if (pct >= 70) return 'bg-emerald-800/40 text-emerald-300' + opacity
    if (pct >= 50) return 'bg-yellow-800/30 text-yellow-300' + opacity
    if (pct >= 30) return 'bg-orange-800/30 text-orange-300' + opacity
    return 'bg-red-800/40 text-red-300' + opacity
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-100 mb-1">📊 政策スタンス分析</h1>
        <p className="text-sm text-slate-500">
          衆議院の会派別賛否データから政策スタンスを可視化
        </p>
      </div>

      {/* 注釈バナー */}
      <div className="bg-amber-900/20 border border-amber-700/30 rounded-xl px-4 py-2.5 mb-6">
        <p className="text-xs text-amber-400/80">
          ⚠️ これは「会派（政党）の賛否」であり、議員個人の賛否ではありません。
          衆議院の採決データのみを使用しています。薄く表示されたセルは母数が少なく参考値です。
        </p>
      </div>

      {/* タブ */}
      <div className="flex gap-1 mb-6 bg-slate-800/50 rounded-xl p-1 border border-slate-700/50">
        {([
          { key: 'heatmap' as const, label: '🗺️ 政策分野別' },
          { key: 'agreement' as const, label: '🤝 政党間一致率' },
          { key: 'controversial' as const, label: '⚡ 賛否が割れた法案' },
        ]).map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              tab === t.key ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ===== TAB 1: ヒートマップ ===== */}
      {tab === 'heatmap' && (
        <div>
          <p className="text-xs text-slate-500 mb-4">
            政策分野ごとの賛成率（%）。括弧内は採決数（母数）。
          </p>
          <div className="overflow-x-auto -mx-4 px-4">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr>
                  <th className="text-left py-2.5 px-2 text-slate-400 sticky left-0 bg-slate-900 z-10 min-w-36 border-b border-slate-700/50">
                    政策分野
                  </th>
                  {hmParties.map(p => (
                    <th key={p} className="py-2.5 px-1 text-center text-slate-300 min-w-16 border-b border-slate-700/50">
                      {getPartyShortName(p)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {hmCategories.map(cat => (
                  <tr key={cat} className="border-b border-slate-800/30 hover:bg-slate-800/20">
                    <td className="py-2 px-2 text-slate-300 sticky left-0 bg-slate-900 z-10">
                      {cat}
                      <span className="text-slate-600 ml-1">({catTotals[cat]})</span>
                    </td>
                    {hmParties.map(party => {
                      const d = hmLookup[`${party}__${cat}`]
                      if (!d) {
                        return <td key={party} className="py-2 px-1 text-center text-slate-700">—</td>
                      }
                      return (
                        <td key={party} className="py-2 px-1 text-center">
                          <div
                            className={`rounded px-1 py-1 font-mono leading-tight ${getHeatColor(d.yes_pct, d.n_votes)}`}
                            title={`賛成${d.yes_count} / 反対${d.no_count} (計${d.n_votes})`}
                          >
                            <div className="text-xs font-bold">{d.yes_pct}</div>
                            <div className="text-[10px] opacity-60">({d.n_votes})</div>
                          </div>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center gap-3 mt-4 text-[10px] text-slate-500">
            <span>凡例:</span>
            <span className="px-2 py-0.5 rounded bg-emerald-600/80 text-white">90%+</span>
            <span className="px-2 py-0.5 rounded bg-emerald-700/50 text-emerald-200">70-89%</span>
            <span className="px-2 py-0.5 rounded bg-yellow-700/40 text-yellow-200">50-69%</span>
            <span className="px-2 py-0.5 rounded bg-orange-700/40 text-orange-200">30-49%</span>
            <span className="px-2 py-0.5 rounded bg-red-700/50 text-red-200">0-29%</span>
            <span className="opacity-40 px-2 py-0.5 rounded bg-slate-600 text-slate-300">薄い=母数少</span>
          </div>
        </div>
      )}

      {/* ===== TAB 2: 政党間一致率 ===== */}
      {tab === 'agreement' && (
        <div>
          <p className="text-xs text-slate-500 mb-4">
            同じ法案に対して同じ投票をした割合。括弧内は比較法案数。
          </p>
          <div className="overflow-x-auto -mx-4 px-4">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr>
                  <th className="text-left py-2.5 px-2 text-slate-400 sticky left-0 bg-slate-900 z-10 min-w-20 border-b border-slate-700/50"></th>
                  {agParties.map(p => (
                    <th key={p} className="py-2.5 px-1 text-center text-slate-300 min-w-16 border-b border-slate-700/50">
                      {getPartyShortName(p)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {agParties.map(p1 => (
                  <tr key={p1} className="border-b border-slate-800/30 hover:bg-slate-800/20">
                    <td className="py-2 px-2 text-slate-300 font-medium sticky left-0 bg-slate-900 z-10">
                      {getPartyShortName(p1)}
                    </td>
                    {agParties.map(p2 => {
                      if (p1 === p2) {
                        return (
                          <td key={p2} className="py-2 px-1 text-center">
                            <div className="bg-slate-700/30 rounded px-1 py-1 text-slate-500">—</div>
                          </td>
                        )
                      }
                      const d = agLookup[`${p1}__${p2}`]
                      if (!d) {
                        return <td key={p2} className="py-2 px-1 text-center text-slate-700">—</td>
                      }
                      return (
                        <td key={p2} className="py-2 px-1 text-center">
                          <div
                            className={`rounded px-1 py-1 font-mono leading-tight ${getAgreeColor(d.agree_pct, d.n_common_bills)}`}
                            title={`一致${d.same_count}/${d.n_common_bills}件`}
                          >
                            <div className="text-xs font-bold">{d.agree_pct}%</div>
                            <div className="text-[10px] opacity-60">({d.n_common_bills})</div>
                          </div>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-slate-800/30 rounded-xl border border-slate-700/30 p-4">
              <h3 className="text-sm font-bold text-emerald-400 mb-3">🤝 一致率TOP5</h3>
              {topAgree.map((p, i) => (
                <div key={i} className="flex items-center justify-between py-1.5 border-b border-slate-800/30 last:border-0">
                  <span className="text-sm text-slate-300">
                    {getPartyShortName(p.party_a)} × {getPartyShortName(p.party_b)}
                  </span>
                  <div className="text-right">
                    <span className="text-sm font-mono font-bold text-emerald-400">{p.agree_pct}%</span>
                    <span className="text-xs text-slate-600 ml-1">({p.n_common_bills}件)</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="bg-slate-800/30 rounded-xl border border-slate-700/30 p-4">
              <h3 className="text-sm font-bold text-red-400 mb-3">⚔️ 対立TOP5</h3>
              {topDisagree.map((p, i) => (
                <div key={i} className="flex items-center justify-between py-1.5 border-b border-slate-800/30 last:border-0">
                  <span className="text-sm text-slate-300">
                    {getPartyShortName(p.party_a)} × {getPartyShortName(p.party_b)}
                  </span>
                  <div className="text-right">
                    <span className="text-sm font-mono font-bold text-red-400">{p.agree_pct}%</span>
                    <span className="text-xs text-slate-600 ml-1">({p.n_common_bills}件)</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ===== TAB 3: 賛否が割れた法案 ===== */}
      {tab === 'controversial' && (
        <div>
          <p className="text-xs text-slate-500 mb-4">
            賛成・反対の両方が存在する法案（{contested.length}件）。反対会派が多い順。
          </p>
          <div className="space-y-2 max-h-[650px] overflow-y-auto pr-1">
            {contested.map((bill) => (
              <a
                key={bill.bill_id}
                href={`/bills/${bill.bill_id}`}
                className="block bg-slate-800/40 border border-slate-700/40 rounded-xl p-4 hover:border-slate-600/60 transition-all"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-200 leading-snug mb-2 line-clamp-2">
                      {bill.bill_name}
                    </p>
                    <div className="flex items-center gap-2 flex-wrap">
                      {bill.category && (
                        <span className="text-xs px-1.5 py-0.5 rounded-full bg-indigo-900/30 text-indigo-400 border border-indigo-700/30">
                          {bill.category}
                        </span>
                      )}
                      {bill.status && (
                        <span className="text-xs text-slate-500">{bill.status}</span>
                      )}
                      <span className="text-xs text-slate-600">第{bill.session}回</span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs px-2 py-1 rounded-lg bg-emerald-900/20 text-emerald-400 border border-emerald-800/30">
                        賛成 {bill.yes_parties}
                      </span>
                      <span className="text-xs px-2 py-1 rounded-lg bg-red-900/20 text-red-400 border border-red-800/30">
                        反対 {bill.no_parties}
                      </span>
                    </div>
                  </div>
                </div>
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
