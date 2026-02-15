'use client'

import { useEffect, useState } from 'react'
import { supabase, getPartyClass, getPartyShortName } from '@/lib/supabase'

// ===== 型 =====
type VoteRecord = {
  party_name: string
  vote: string  // '賛成' | '反対'
  bill_id: string
  bills: {
    category: string | null
    bill_name: string
    session: number | null
    status: string | null
  }
}

type CategoryMatrix = Record<string, Record<string, { yea: number; nay: number; total: number }>>
type AgreementMatrix = Record<string, Record<string, number>>

// 主要政党の表示順
const MAJOR_PARTIES = [
  '自由民主党', '立憲民主党', '公明党', '日本維新の会',
  '国民民主党', '日本共産党', 'れいわ新選組', '参政党',
  '社会民主党', '教育無償化を実現する会',
]

function partyMatch(name: string, major: string): boolean {
  if (name.includes(major)) return true
  // 短縮名対応
  const shorts: Record<string, string[]> = {
    '自由民主党': ['自民'],
    '立憲民主党': ['立憲', '立民'],
    '公明党': ['公明'],
    '日本維新の会': ['維新'],
    '国民民主党': ['国民民主', '国民'],
    '日本共産党': ['共産'],
    'れいわ新選組': ['れいわ'],
    '参政党': ['参政'],
    '社会民主党': ['社民'],
  }
  for (const s of (shorts[major] || [])) {
    if (name.includes(s)) return true
  }
  return false
}

function normalizeParty(name: string): string {
  for (const major of MAJOR_PARTIES) {
    if (partyMatch(name, major)) return major
  }
  return name
}

export default function AnalysisPage() {
  const [votes, setVotes] = useState<VoteRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'heatmap' | 'agreement' | 'controversial'>('heatmap')

  useEffect(() => {
    async function load() {
      // bill_votes + bills(category) を結合取得
      let allVotes: VoteRecord[] = []
      let offset = 0
      const pageSize = 1000
      while (true) {
        const { data, error } = await supabase
          .from('bill_votes')
          .select('party_name, vote, bill_id, bills!inner(category, bill_name, session, status)')
          .range(offset, offset + pageSize - 1)
        if (error || !data || data.length === 0) break
        allVotes = allVotes.concat(data as unknown as VoteRecord[])
        if (data.length < pageSize) break
        offset += pageSize
      }
      setVotes(allVotes)
      setLoading(false)
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

  // ===== データ集計 =====

  // 政党名を正規化
  const normalizedVotes = votes.map(v => ({
    ...v,
    party: normalizeParty(v.party_name),
  }))

  // 出現する政党（主要政党順 + その他）
  const partySet = new Set(normalizedVotes.map(v => v.party))
  const parties = MAJOR_PARTIES.filter(p => partySet.has(p))
  for (const p of partySet) {
    if (!parties.includes(p)) parties.push(p)
  }

  // カテゴリ一覧
  const catSet = new Set(normalizedVotes.map(v => v.bills.category).filter(Boolean) as string[])
  const categories = Array.from(catSet).sort()

  // ===== 1. 政党×カテゴリ ヒートマップ =====
  const catMatrix: CategoryMatrix = {}
  for (const v of normalizedVotes) {
    const cat = v.bills.category || '未分類'
    const party = v.party
    if (!catMatrix[party]) catMatrix[party] = {}
    if (!catMatrix[party][cat]) catMatrix[party][cat] = { yea: 0, nay: 0, total: 0 }
    catMatrix[party][cat].total++
    if (v.vote === '賛成') catMatrix[party][cat].yea++
    else catMatrix[party][cat].nay++
  }

  // ===== 2. 政党間一致率 =====
  // 各法案ごとの各政党の投票を集める
  const billPartyVotes: Record<string, Record<string, string>> = {}
  for (const v of normalizedVotes) {
    if (!billPartyVotes[v.bill_id]) billPartyVotes[v.bill_id] = {}
    billPartyVotes[v.bill_id][v.party] = v.vote
  }

  const agreementMatrix: AgreementMatrix = {}
  for (const p1 of parties) {
    agreementMatrix[p1] = {}
    for (const p2 of parties) {
      let agree = 0
      let total = 0
      for (const billId in billPartyVotes) {
        const bv = billPartyVotes[billId]
        if (bv[p1] && bv[p2]) {
          total++
          if (bv[p1] === bv[p2]) agree++
        }
      }
      agreementMatrix[p1][p2] = total > 0 ? Math.round((agree / total) * 100) : -1
    }
  }

  // ===== 3. 賛否が割れた法案 =====
  type ControversialBill = {
    bill_id: string
    bill_name: string
    session: number | null
    category: string | null
    yea_parties: string[]
    nay_parties: string[]
  }

  const controversialBills: ControversialBill[] = []
  for (const billId in billPartyVotes) {
    const bv = billPartyVotes[billId]
    const yeaParties = Object.entries(bv).filter(([_, v]) => v === '賛成').map(([p]) => p)
    const nayParties = Object.entries(bv).filter(([_, v]) => v === '反対').map(([p]) => p)
    if (nayParties.length >= 2) {
      // この法案の情報を探す
      const voteRecord = normalizedVotes.find(v => v.bill_id === billId)
      if (voteRecord) {
        controversialBills.push({
          bill_id: billId,
          bill_name: voteRecord.bills.bill_name,
          session: voteRecord.bills.session,
          category: voteRecord.bills.category,
          yea_parties: yeaParties,
          nay_parties: nayParties,
        })
      }
    }
  }
  // 反対政党数の多い順
  controversialBills.sort((a, b) => b.nay_parties.length - a.nay_parties.length)

  // ===== レンダリング =====

  function getHeatColor(yeaRate: number): string {
    // 0%=赤, 50%=黄, 100%=緑
    if (yeaRate >= 90) return 'bg-emerald-600/80 text-white'
    if (yeaRate >= 70) return 'bg-emerald-700/50 text-emerald-200'
    if (yeaRate >= 50) return 'bg-yellow-700/40 text-yellow-200'
    if (yeaRate >= 30) return 'bg-orange-700/40 text-orange-200'
    return 'bg-red-700/50 text-red-200'
  }

  function getAgreementColor(pct: number): string {
    if (pct < 0) return 'bg-slate-800/30 text-slate-600'
    if (pct >= 90) return 'bg-emerald-600/70 text-white'
    if (pct >= 70) return 'bg-emerald-800/40 text-emerald-300'
    if (pct >= 50) return 'bg-yellow-800/30 text-yellow-300'
    if (pct >= 30) return 'bg-orange-800/30 text-orange-300'
    return 'bg-red-800/40 text-red-300'
  }

  // ヒートマップで使うカテゴリ（データがある分野のみ、件数多い順）
  const catCounts: Record<string, number> = {}
  for (const party of parties) {
    for (const cat of categories) {
      if (catMatrix[party]?.[cat]) {
        catCounts[cat] = (catCounts[cat] || 0) + catMatrix[party][cat].total
      }
    }
  }
  const sortedCats = categories.filter(c => catCounts[c] > 0).sort((a, b) => (catCounts[b] || 0) - (catCounts[a] || 0))
  // 主要8政党のみヒートマップに
  const heatmapParties = parties.slice(0, 8)

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-100 mb-1">📊 政策スタンス分析</h1>
        <p className="text-sm text-slate-500">
          衆議院の政党別賛否データ（{Object.keys(billPartyVotes).length}件の採決）から分析
        </p>
      </div>

      {/* タブ */}
      <div className="flex gap-1 mb-6 bg-slate-800/50 rounded-xl p-1 border border-slate-700/50">
        {[
          { key: 'heatmap' as const, label: '🗺️ 政策分野別スタンス', },
          { key: 'agreement' as const, label: '🤝 政党間一致率', },
          { key: 'controversial' as const, label: '⚡ 賛否が割れた法案', },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
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
            政策分野ごとの賛成率。数値は賛成率(%)。色が緑→赤で賛成→反対の傾向を示す。
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr>
                  <th className="text-left py-2 px-2 text-slate-400 sticky left-0 bg-slate-900 z-10 min-w-32">政策分野</th>
                  {heatmapParties.map(p => (
                    <th key={p} className="py-2 px-1 text-center text-slate-300 min-w-16">
                      {getPartyShortName(p)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedCats.map(cat => (
                  <tr key={cat} className="border-t border-slate-800/50">
                    <td className="py-1.5 px-2 text-slate-300 sticky left-0 bg-slate-900 z-10">{cat}</td>
                    {heatmapParties.map(party => {
                      const data = catMatrix[party]?.[cat]
                      if (!data || data.total === 0) {
                        return <td key={party} className="py-1.5 px-1 text-center text-slate-700">—</td>
                      }
                      const yeaRate = Math.round((data.yea / data.total) * 100)
                      return (
                        <td key={party} className="py-1.5 px-1 text-center">
                          <div className={`rounded px-1 py-0.5 text-xs font-mono ${getHeatColor(yeaRate)}`}>
                            {yeaRate}
                          </div>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-slate-600 mt-3">
            ※ 衆議院の採決データのみ。参議院は賛否データ未取得。
          </p>
        </div>
      )}

      {/* ===== TAB 2: 政党間一致率 ===== */}
      {tab === 'agreement' && (
        <div>
          <p className="text-xs text-slate-500 mb-4">
            同じ法案に対して同じ投票（両方賛成 or 両方反対）をした割合。100%なら完全に同じ投票行動。
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr>
                  <th className="text-left py-2 px-2 text-slate-400 sticky left-0 bg-slate-900 z-10 min-w-20"></th>
                  {heatmapParties.map(p => (
                    <th key={p} className="py-2 px-1 text-center text-slate-300 min-w-16">
                      {getPartyShortName(p)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {heatmapParties.map(p1 => (
                  <tr key={p1} className="border-t border-slate-800/50">
                    <td className="py-1.5 px-2 text-slate-300 font-medium sticky left-0 bg-slate-900 z-10">
                      {getPartyShortName(p1)}
                    </td>
                    {heatmapParties.map(p2 => {
                      const pct = agreementMatrix[p1]?.[p2] ?? -1
                      if (p1 === p2) {
                        return <td key={p2} className="py-1.5 px-1 text-center"><div className="bg-slate-700/30 rounded px-1 py-0.5 text-slate-500">—</div></td>
                      }
                      return (
                        <td key={p2} className="py-1.5 px-1 text-center">
                          <div className={`rounded px-1 py-0.5 text-xs font-mono ${getAgreementColor(pct)}`}>
                            {pct >= 0 ? `${pct}%` : '—'}
                          </div>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* 最も一致する組み合わせ TOP5 */}
            <div className="bg-slate-800/30 rounded-xl border border-slate-700/30 p-4">
              <h3 className="text-sm font-bold text-emerald-400 mb-3">🤝 一致率が高い組み合わせ</h3>
              {(() => {
                const pairs: { p1: string; p2: string; pct: number }[] = []
                for (let i = 0; i < heatmapParties.length; i++) {
                  for (let j = i + 1; j < heatmapParties.length; j++) {
                    const pct = agreementMatrix[heatmapParties[i]]?.[heatmapParties[j]] ?? -1
                    if (pct >= 0) pairs.push({ p1: heatmapParties[i], p2: heatmapParties[j], pct })
                  }
                }
                pairs.sort((a, b) => b.pct - a.pct)
                return pairs.slice(0, 5).map((pair, i) => (
                  <div key={i} className="flex items-center justify-between py-1">
                    <span className="text-xs text-slate-300">
                      {getPartyShortName(pair.p1)} × {getPartyShortName(pair.p2)}
                    </span>
                    <span className="text-xs font-mono text-emerald-400">{pair.pct}%</span>
                  </div>
                ))
              })()}
            </div>
            {/* 最も対立する組み合わせ TOP5 */}
            <div className="bg-slate-800/30 rounded-xl border border-slate-700/30 p-4">
              <h3 className="text-sm font-bold text-red-400 mb-3">⚔️ 一致率が低い組み合わせ</h3>
              {(() => {
                const pairs: { p1: string; p2: string; pct: number }[] = []
                for (let i = 0; i < heatmapParties.length; i++) {
                  for (let j = i + 1; j < heatmapParties.length; j++) {
                    const pct = agreementMatrix[heatmapParties[i]]?.[heatmapParties[j]] ?? -1
                    if (pct >= 0) pairs.push({ p1: heatmapParties[i], p2: heatmapParties[j], pct })
                  }
                }
                pairs.sort((a, b) => a.pct - b.pct)
                return pairs.slice(0, 5).map((pair, i) => (
                  <div key={i} className="flex items-center justify-between py-1">
                    <span className="text-xs text-slate-300">
                      {getPartyShortName(pair.p1)} × {getPartyShortName(pair.p2)}
                    </span>
                    <span className="text-xs font-mono text-red-400">{pair.pct}%</span>
                  </div>
                ))
              })()}
            </div>
          </div>
        </div>
      )}

      {/* ===== TAB 3: 賛否が割れた法案 ===== */}
      {tab === 'controversial' && (
        <div>
          <p className="text-xs text-slate-500 mb-4">
            2政党以上が反対した法案（{controversialBills.length}件）。反対政党が多い順。
          </p>
          <div className="max-h-[600px] overflow-y-auto space-y-2">
            {controversialBills.slice(0, 100).map((bill, i) => (
              <a
                key={bill.bill_id}
                href={`/bills/${bill.bill_id}`}
                className="block bg-slate-800/40 border border-slate-700/40 rounded-xl p-4 hover:border-slate-600 transition-all"
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
                      <span className="text-xs text-slate-600">第{bill.session}回</span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-xs text-red-400 font-bold">{bill.nay_parties.length}党反対</span>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {bill.yea_parties.map(p => (
                    <span key={p} className="text-xs px-2 py-0.5 rounded-full bg-emerald-900/30 text-emerald-400 border border-emerald-700/30">
                      ⭕ {getPartyShortName(p)}
                    </span>
                  ))}
                  {bill.nay_parties.map(p => (
                    <span key={p} className="text-xs px-2 py-0.5 rounded-full bg-red-900/30 text-red-400 border border-red-700/30">
                      ❌ {getPartyShortName(p)}
                    </span>
                  ))}
                </div>
              </a>
            ))}
          </div>
          {controversialBills.length > 100 && (
            <p className="text-xs text-slate-500 text-center mt-3">
              ※ 上位100件のみ表示（全{controversialBills.length}件）
            </p>
          )}
        </div>
      )}
    </div>
  )
}
