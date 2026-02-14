'use client'

import { useEffect, useState } from 'react'
import { getBills, getBillSessions, getPartyShortName, getPartyClass } from '@/lib/supabase'
import type { Bill } from '@/lib/supabase'

const STATUS_FILTERS = [
  { key: 'all', label: '全て' },
  { key: '成立', label: '成立' },
  { key: '衆議院で審議中', label: '審議中' },
  { key: '本院議了', label: '本院議了' },
  { key: '衆議院閉会中審査', label: '閉会中審査' },
  { key: '撤回', label: '撤回' },
]

const TYPE_FILTERS = [
  { key: 'all', label: '全種類' },
  { key: '閣法', label: '閣法' },
  { key: '衆法', label: '衆法' },
  { key: '参法', label: '参法' },
  { key: '予算', label: '予算' },
  { key: '条約', label: '条約' },
  { key: '承認', label: '承認' },
  { key: '決議', label: '決議' },
]

export default function BillsPage() {
  const [bills, setBills] = useState<Bill[]>([])
  const [sessions, setSessions] = useState<number[]>([])
  const [loading, setLoading] = useState(true)
  const [sessionFilter, setSessionFilter] = useState<number | null>(null)
  const [statusFilter, setStatusFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')
  const [searchInput, setSearchInput] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [page, setPage] = useState(0)
  const perPage = 30

  useEffect(() => {
    getBillSessions().then(s => {
      setSessions(s)
      if (s.length > 0) setSessionFilter(s[0])
    })
  }, [])

  useEffect(() => {
    if (sessionFilter === null) return
    setLoading(true)
    getBills({
      session: sessionFilter,
      status: statusFilter !== 'all' ? statusFilter : undefined,
      billType: typeFilter !== 'all' ? typeFilter : undefined,
      search: searchQuery || undefined,
      limit: 200,
    }).then(data => {
      setBills(data)
      setLoading(false)
    })
  }, [sessionFilter, statusFilter, typeFilter, searchQuery])

  function doSearch() {
    setSearchQuery(searchInput.trim())
    setPage(0)
  }

  const filtered = categoryFilter === 'all'
    ? bills
    : bills.filter(b => b.category === categoryFilter)
  const paged = filtered.slice(page * perPage, (page + 1) * perPage)
  const totalPages = Math.ceil(filtered.length / perPage)

  // 賛否の統計
  const withVotes = filtered.filter(b => b.bill_votes && b.bill_votes.length > 0).length

  // カテゴリ一覧（データから動的に取得）
  const categories = Array.from(new Set(bills.map(b => b.category).filter(Boolean))) as string[]

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* ヘッダー */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-100 mb-1">📜 議案一覧（衆議院）</h1>
        <p className="text-sm text-slate-500">
          政党別の賛否データ付き。出典：
          <a href="https://smartnews-smri.github.io/house-of-representatives/" target="_blank" className="underline hover:text-slate-300">
            スマートニュース メディア研究所
          </a>
        </p>
      </div>

      {/* フィルター */}
      <div className="space-y-3 mb-6">
        {/* 国会回次セレクト */}
        <div className="flex items-center gap-3 flex-wrap">
          <label className="text-sm text-slate-400 shrink-0">国会回次:</label>
          <select
            value={sessionFilter ?? ''}
            onChange={e => { setSessionFilter(Number(e.target.value)); setPage(0) }}
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-blue-500"
          >
            {sessions.map(s => (
              <option key={s} value={s}>第{s}回国会</option>
            ))}
          </select>

          {/* 種類フィルター */}
          <div className="flex gap-1 flex-wrap">
            {TYPE_FILTERS.map(f => (
              <button
                key={f.key}
                onClick={() => { setTypeFilter(f.key); setPage(0) }}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                  typeFilter === f.key
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-700'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* ステータスフィルター */}
        <div className="flex items-center gap-3 flex-wrap">
          <label className="text-sm text-slate-400 shrink-0">審議状況:</label>
          <div className="flex gap-1 flex-wrap">
            {STATUS_FILTERS.map(f => (
              <button
                key={f.key}
                onClick={() => { setStatusFilter(f.key); setPage(0) }}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                  statusFilter === f.key
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-700'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* カテゴリフィルター */}
        {categories.length > 0 && (
          <div className="flex items-center gap-3 flex-wrap">
            <label className="text-sm text-slate-400 shrink-0">政策分野:</label>
            <select
              value={categoryFilter}
              onChange={e => { setCategoryFilter(e.target.value); setPage(0) }}
              className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
            >
              <option value="all">全分野</option>
              {categories.sort().map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            {categoryFilter !== 'all' && (
              <button
                onClick={() => { setCategoryFilter('all'); setPage(0) }}
                className="text-xs text-slate-400 hover:text-slate-200"
              >✕ 解除</button>
            )}
          </div>
        )}

        {/* 検索 */}
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="議案名で検索..."
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') doSearch() }}
            className="flex-1 bg-slate-800/50 border border-slate-700/50 rounded-xl py-2 px-4 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500"
          />
          <button
            onClick={doSearch}
            className="px-4 py-2 rounded-xl text-sm font-medium bg-blue-600 hover:bg-blue-500 text-white transition-colors shrink-0"
          >
            検索
          </button>
          {searchQuery && (
            <button
              onClick={() => { setSearchInput(''); setSearchQuery(''); setPage(0) }}
              className="px-3 py-2 rounded-xl text-sm text-slate-400 hover:text-slate-200 bg-slate-800 border border-slate-700"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* 統計 */}
      <div className="text-sm text-slate-500 mb-4">
        {filtered.length}件の議案{searchQuery && `（「${searchQuery}」で絞り込み）`}
        {categoryFilter !== 'all' && `（${categoryFilter}）`}
        {withVotes > 0 && ` ・ ${withVotes}件に賛否データあり`}
      </div>

      {/* 議案リスト */}
      {loading ? (
        <div className="text-center py-20">
          <div className="animate-pulse">
            <div className="text-4xl mb-4">📜</div>
            <p className="text-slate-400">議案データを読み込み中...</p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {paged.map(bill => (
            <BillCard key={bill.id} bill={bill} />
          ))}
          {paged.length === 0 && (
            <div className="text-center py-12 text-slate-500">
              該当する議案がありません
            </div>
          )}
        </div>
      )}

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


function BillCard({ bill }: { bill: Bill }) {
  const votes = bill.bill_votes || []
  const yea = votes.filter(v => v.vote === '賛成')
  const nay = votes.filter(v => v.vote === '反対')

  // ステータスの色
  const statusColor = (() => {
    if (!bill.status) return 'text-slate-400 bg-slate-800 border-slate-700'
    if (bill.status === '成立') return 'text-emerald-300 bg-emerald-900/50 border-emerald-700/50'
    if (bill.status.includes('否決')) return 'text-red-300 bg-red-900/50 border-red-700/50'
    if (bill.status.includes('審議中')) return 'text-yellow-300 bg-yellow-900/50 border-yellow-700/50'
    if (bill.status === '撤回') return 'text-slate-400 bg-slate-800 border-slate-600'
    return 'text-sky-300 bg-sky-900/50 border-sky-700/50'
  })()

  // 議案種類の色
  const typeColor = (() => {
    if (bill.bill_type === '閣法') return 'text-blue-300 bg-blue-900/40'
    if (bill.bill_type === '衆法') return 'text-orange-300 bg-orange-900/40'
    if (bill.bill_type === '参法') return 'text-purple-300 bg-purple-900/40'
    if (bill.bill_type === '予算') return 'text-pink-300 bg-pink-900/40'
    if (bill.bill_type === '条約') return 'text-teal-300 bg-teal-900/40'
    return 'text-slate-300 bg-slate-800'
  })()

  return (
    <a href={`/bills/${bill.id}`} className="block bg-slate-800/50 border border-slate-700/50 rounded-xl p-4 hover:border-slate-600 transition-all cursor-pointer">
      {/* ヘッダー */}
      <div className="flex items-start gap-2 mb-2">
        <span className={`text-xs px-2 py-0.5 rounded shrink-0 ${typeColor}`}>
          {bill.bill_type || '不明'}
        </span>
        <span className={`text-xs px-2 py-0.5 rounded border shrink-0 ${statusColor}`}>
          {bill.status || '不明'}
        </span>
        {bill.bill_number && (
          <span className="text-xs text-slate-500 shrink-0">
            第{bill.submit_session}回 第{bill.bill_number}号
          </span>
        )}
      </div>

      {/* 議案名 */}
      <h3 className="text-sm font-bold text-slate-200 mb-2 leading-relaxed">
        {bill.bill_name}
      </h3>

      {/* カテゴリ + テンプレ要約 */}
      <div className="flex items-start gap-2 mb-2 flex-wrap">
        {bill.category && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-900/40 text-indigo-300 border border-indigo-700/40 shrink-0">
            {bill.category}
          </span>
        )}
        {bill.category_sub && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700/40 shrink-0">
            {bill.category_sub}
          </span>
        )}
      </div>
      {bill.summary_template && (
        <p className="text-xs text-slate-400 mb-2 leading-relaxed">
          💡 {bill.summary_template}
        </p>
      )}

      {/* 提出者 */}
      {bill.proposer && (
        <div className="text-xs text-slate-500 mb-2">
          提出: {bill.proposer}
          {bill.proposer_party && ` (${bill.proposer_party})`}
        </div>
      )}

      {/* 賛否 */}
      {votes.length > 0 && (
        <div className="mt-3 pt-3 border-t border-slate-700/50">
          {yea.length > 0 && (
            <div className="flex items-start gap-2 mb-1.5">
              <span className="text-xs text-emerald-400 font-bold shrink-0 w-8 pt-0.5">賛成</span>
              <div className="flex flex-wrap gap-1">
                {yea.map((v, i) => (
                  <span
                    key={i}
                    className={`party-tag party-tag-${getPartyClass(v.party_name)} text-xs`}
                  >
                    {getPartyShortName(v.party_name)}
                  </span>
                ))}
              </div>
            </div>
          )}
          {nay.length > 0 && (
            <div className="flex items-start gap-2">
              <span className="text-xs text-red-400 font-bold shrink-0 w-8 pt-0.5">反対</span>
              <div className="flex flex-wrap gap-1">
                {nay.map((v, i) => (
                  <span
                    key={i}
                    className={`party-tag party-tag-${getPartyClass(v.party_name)} text-xs opacity-60`}
                  >
                    {getPartyShortName(v.party_name)}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* フッター */}
      <div className="flex items-center justify-between text-xs text-slate-600 mt-2">
        <div className="flex items-center gap-3">
          {bill.committee && <span>📋 {bill.committee}委員会</span>}
          {bill.law_number && <span>📕 {bill.law_number}</span>}
        </div>
        <span className="text-slate-500">詳細 →</span>
      </div>
    </a>
  )
}
