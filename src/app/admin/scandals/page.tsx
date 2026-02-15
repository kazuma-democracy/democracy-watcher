'use client'

import { useState, useEffect } from 'react'

const CATEGORIES = [
  { key: 'political_funds', label: '💰 政治資金' },
  { key: 'election_violation', label: '🗳️ 選挙違反' },
  { key: 'corruption', label: '🏴 汚職・口利き' },
  { key: 'harassment', label: '🚫 ハラスメント' },
  { key: 'ethics', label: '⚖️ 倫理問題' },
  { key: 'cult_relations', label: '⛪ 旧統一教会等' },
  { key: 'tax_evasion', label: '📑 脱税' },
  { key: 'violence', label: '👊 暴力・暴言' },
  { key: 'other', label: '📌 その他' },
]

const SEVERITIES = [
  { key: 'allegation', label: '疑惑' },
  { key: 'investigation', label: '調査中' },
  { key: 'confirmed', label: '事実確認' },
  { key: 'convicted', label: '有罪確定' },
]

const SCANDAL_KEYWORDS = [
  '裏金', '不正', '疑惑', '逮捕', '起訴', '辞任', '処分', '政治資金',
  '買収', '収賄', 'パワハラ', 'セクハラ', '暴言', '不祥事', '統一教会',
]

type Article = { title: string; url: string; source: string; date: string }
type LinkedLeg = { id: string; name: string; party: string | null }

export default function AdminScandalsPage() {
  // Auth
  const [password, setPassword] = useState('')
  const [authed, setAuthed] = useState(false)

  // Search
  const [searchName, setSearchName] = useState('')
  const [searchKeyword, setSearchKeyword] = useState('不祥事')
  const [articles, setArticles] = useState<Article[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [selectedArticles, setSelectedArticles] = useState<Set<number>>(new Set())

  // Form
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('political_funds')
  const [severity, setSeverity] = useState('allegation')
  const [startDate, setStartDate] = useState('')
  const [summary, setSummary] = useState('')

  // Legislator linking
  const [legQuery, setLegQuery] = useState('')
  const [legResults, setLegResults] = useState<any[]>([])
  const [linkedLegs, setLinkedLegs] = useState<LinkedLeg[]>([])
  const [legSearching, setLegSearching] = useState(false)

  // Submit
  const [submitting, setSubmitting] = useState(false)
  const [submitResult, setSubmitResult] = useState<string | null>(null)
  const [recentScandals, setRecentScandals] = useState<any[]>([])

  function adminFetch(body: any) {
    return fetch('/api/admin/scandals', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-password': password,
      },
      body: JSON.stringify(body),
    })
  }

  async function searchNews() {
    if (!searchName && !searchKeyword) return
    setSearchLoading(true)
    setSelectedArticles(new Set())
    try {
      const q = [searchName, searchKeyword].filter(Boolean).join(' ')
      const res = await fetch(`/api/news?q=${encodeURIComponent(q)}`)
      const data = await res.json()
      setArticles(data.articles || [])
    } catch (e) {
      console.error(e)
    } finally {
      setSearchLoading(false)
    }
  }

  function toggleArticle(idx: number) {
    setSelectedArticles(prev => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      return next
    })
  }

  function prefillFromArticle(article: Article) {
    if (!title) setTitle(article.title)
    if (!startDate && article.date) {
      setStartDate(article.date.replace(/\//g, '-'))
    }
  }

  async function searchLegislator() {
    if (!legQuery.trim()) return
    setLegSearching(true)
    try {
      const res = await adminFetch({ action: 'search_legislators', query: legQuery })
      const data = await res.json()
      setLegResults(data.legislators || [])
    } catch (e) {
      console.error(e)
    } finally {
      setLegSearching(false)
    }
  }

  function addLeg(leg: any) {
    if (linkedLegs.find(l => l.id === leg.id)) return
    setLinkedLegs(prev => [...prev, { id: leg.id, name: leg.name, party: leg.current_party }])
    setLegResults([])
    setLegQuery('')
  }

  function removeLeg(id: string) {
    setLinkedLegs(prev => prev.filter(l => l.id !== id))
  }

  async function handleSubmit() {
    if (!title || !summary) {
      setSubmitResult('❌ タイトルと概要は必須です')
      return
    }

    setSubmitting(true)
    setSubmitResult(null)

    const sources = Array.from(selectedArticles).map(idx => {
      const a = articles[idx]
      return {
        url: a.url,
        publisher: a.source,
        published_at: a.date?.replace(/\//g, '-') || null,
        snippet: a.title,
      }
    })

    try {
      const res = await adminFetch({
        action: 'create_scandal',
        title,
        category,
        severity,
        start_date: startDate || null,
        summary,
        sources,
        legislator_ids: linkedLegs.map(l => l.id),
      })
      const data = await res.json()
      if (data.error) {
        setSubmitResult(`❌ ${data.error}`)
      } else {
        setSubmitResult(`✅ 登録完了: ${data.scandal.title}`)
        setRecentScandals(prev => [data.scandal, ...prev])
        // Reset form
        setTitle('')
        setSummary('')
        setStartDate('')
        setSelectedArticles(new Set())
        setLinkedLegs([])
      }
    } catch (e: any) {
      setSubmitResult(`❌ エラー: ${e.message}`)
    } finally {
      setSubmitting(false)
    }
  }

  // Password gate
  if (!authed) {
    return (
      <div className="max-w-md mx-auto px-4 py-20">
        <div className="bg-slate-800/50 rounded-xl border border-slate-700/30 p-8 text-center">
          <div className="text-4xl mb-4">🔐</div>
          <h1 className="text-lg font-bold text-slate-200 mb-4">管理者ログイン</h1>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && password) setAuthed(true) }}
            placeholder="パスワード"
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-sm text-slate-200 mb-4 focus:border-blue-500 focus:outline-none"
          />
          <button
            onClick={() => { if (password) setAuthed(true) }}
            className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm transition-colors"
          >
            ログイン
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-slate-100 mb-2">🔧 不祥事データベース管理</h1>
      <p className="text-sm text-slate-400 mb-6">ニュース検索 → レビュー → 不祥事レコード登録</p>

      {/* ========== STEP 1: ニュース検索 ========== */}
      <div className="bg-slate-800/30 rounded-xl border border-slate-700/30 p-5 mb-6">
        <h2 className="text-sm font-bold text-slate-300 mb-3">① ニュース検索</h2>

        <div className="flex gap-2 mb-3">
          <input
            type="text"
            value={searchName}
            onChange={e => setSearchName(e.target.value)}
            placeholder="議員名（例: 西村康稔）"
            className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:border-blue-500 focus:outline-none"
          />
          <input
            type="text"
            value={searchKeyword}
            onChange={e => setSearchKeyword(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') searchNews() }}
            placeholder="キーワード"
            className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:border-blue-500 focus:outline-none"
          />
          <button
            onClick={searchNews}
            disabled={searchLoading}
            className="px-5 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 text-white rounded-lg text-sm transition-colors shrink-0"
          >
            {searchLoading ? '...' : '🔍 検索'}
          </button>
        </div>

        {/* キーワードチップ */}
        <div className="flex flex-wrap gap-1.5 mb-4">
          {SCANDAL_KEYWORDS.map(kw => (
            <button
              key={kw}
              onClick={() => setSearchKeyword(kw)}
              className={`text-xs px-2 py-1 rounded border transition-colors ${
                searchKeyword === kw
                  ? 'bg-red-600 border-red-500 text-white'
                  : 'bg-slate-800/50 border-slate-700/50 text-slate-400 hover:text-slate-200'
              }`}
            >
              {kw}
            </button>
          ))}
        </div>

        {/* 検索結果 */}
        {articles.length > 0 && (
          <div className="border border-slate-700/30 rounded-lg overflow-hidden max-h-[350px] overflow-y-auto">
            {articles.map((article, idx) => (
              <div
                key={idx}
                className={`flex items-start gap-3 px-3 py-2.5 cursor-pointer transition-colors ${
                  idx > 0 ? 'border-t border-slate-700/20' : ''
                } ${selectedArticles.has(idx)
                  ? 'bg-blue-900/30 border-l-2 border-l-blue-500'
                  : 'hover:bg-slate-700/20'}`}
                onClick={() => { toggleArticle(idx); prefillFromArticle(article) }}
              >
                <input
                  type="checkbox"
                  checked={selectedArticles.has(idx)}
                  readOnly
                  className="mt-1 shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-slate-200">{article.title}</p>
                  <div className="flex gap-2 mt-1 text-xs text-slate-500">
                    <span>{article.source}</span>
                    <span>{article.date}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        {articles.length > 0 && selectedArticles.size > 0 && (
          <p className="text-xs text-blue-400 mt-2">
            ✓ {selectedArticles.size}件の記事を出典として選択中
          </p>
        )}
      </div>

      {/* ========== STEP 2: 不祥事情報入力 ========== */}
      <div className="bg-slate-800/30 rounded-xl border border-slate-700/30 p-5 mb-6">
        <h2 className="text-sm font-bold text-slate-300 mb-3">② 不祥事情報</h2>

        <div className="space-y-3">
          <div>
            <label className="block text-xs text-slate-500 mb-1">タイトル *</label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="例: 〇〇議員の政治資金収支報告書不記載問題"
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-slate-500 mb-1">カテゴリ</label>
              <select
                value={category}
                onChange={e => setCategory(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:border-blue-500 focus:outline-none"
              >
                {CATEGORIES.map(c => (
                  <option key={c.key} value={c.key}>{c.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">深刻度</label>
              <select
                value={severity}
                onChange={e => setSeverity(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:border-blue-500 focus:outline-none"
              >
                {SEVERITIES.map(s => (
                  <option key={s.key} value={s.key}>{s.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">発覚日</label>
              <input
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:border-blue-500 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-slate-500 mb-1">概要 *</label>
            <textarea
              value={summary}
              onChange={e => setSummary(e.target.value)}
              rows={4}
              placeholder="不祥事の概要を記載..."
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:border-blue-500 focus:outline-none resize-none"
            />
          </div>
        </div>
      </div>

      {/* ========== STEP 3: 議員紐付け ========== */}
      <div className="bg-slate-800/30 rounded-xl border border-slate-700/30 p-5 mb-6">
        <h2 className="text-sm font-bold text-slate-300 mb-3">③ 関係議員を紐付け</h2>

        <div className="flex gap-2 mb-3">
          <input
            type="text"
            value={legQuery}
            onChange={e => setLegQuery(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') searchLegislator() }}
            placeholder="議員名で検索..."
            className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:border-blue-500 focus:outline-none"
          />
          <button
            onClick={searchLegislator}
            disabled={legSearching}
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm transition-colors shrink-0"
          >
            {legSearching ? '...' : '検索'}
          </button>
        </div>

        {/* 検索結果 */}
        {legResults.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {legResults.map((leg: any) => (
              <button
                key={leg.id}
                onClick={() => addLeg(leg)}
                className="text-xs px-2.5 py-1.5 rounded-lg border border-slate-600 bg-slate-800/50 text-slate-300 hover:bg-blue-900/30 hover:border-blue-500/50 transition-colors"
              >
                + {leg.name} ({leg.current_party || '無所属'})
              </button>
            ))}
          </div>
        )}

        {/* 紐付け済み */}
        {linkedLegs.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {linkedLegs.map(leg => (
              <span key={leg.id} className="text-xs px-2.5 py-1.5 rounded-lg bg-red-900/30 border border-red-700/30 text-red-400 flex items-center gap-1.5">
                {leg.name}
                {leg.party && <span className="text-red-400/50">({leg.party})</span>}
                <button onClick={() => removeLeg(leg.id)} className="text-red-500 hover:text-red-400">×</button>
              </span>
            ))}
          </div>
        )}
        {linkedLegs.length === 0 && (
          <p className="text-xs text-slate-600">まだ議員を紐付けていません</p>
        )}
      </div>

      {/* ========== STEP 4: 登録 ========== */}
      <div className="bg-slate-800/30 rounded-xl border border-slate-700/30 p-5 mb-6">
        <h2 className="text-sm font-bold text-slate-300 mb-3">④ 登録</h2>

        {/* プレビュー */}
        <div className="bg-slate-900/50 rounded-lg p-4 mb-4">
          <p className="text-xs text-slate-500 mb-2">プレビュー</p>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs px-2 py-0.5 rounded bg-yellow-500/20 text-yellow-400 border border-yellow-500/40">
              {SEVERITIES.find(s => s.key === severity)?.label}
            </span>
            <span className="text-xs text-slate-500">
              {CATEGORIES.find(c => c.key === category)?.label}
            </span>
            {startDate && <span className="text-xs text-slate-500">{startDate}</span>}
          </div>
          <p className="text-sm font-bold text-slate-200 mb-1">{title || '（タイトル未入力）'}</p>
          <p className="text-xs text-slate-400">{summary ? summary.substring(0, 100) + '...' : '（概要未入力）'}</p>
          {linkedLegs.length > 0 && (
            <div className="flex gap-1.5 mt-2">
              {linkedLegs.map(l => (
                <span key={l.id} className="text-xs text-red-400">{l.name}</span>
              ))}
            </div>
          )}
          <p className="text-xs text-slate-600 mt-1">出典: {selectedArticles.size}件</p>
        </div>

        <button
          onClick={handleSubmit}
          disabled={submitting || !title || !summary}
          className="w-full py-3 bg-red-600 hover:bg-red-500 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-lg text-sm font-bold transition-colors"
        >
          {submitting ? '登録中...' : '⚠️ 不祥事を登録する'}
        </button>

        {submitResult && (
          <p className={`text-sm mt-3 ${submitResult.startsWith('✅') ? 'text-emerald-400' : 'text-red-400'}`}>
            {submitResult}
          </p>
        )}
      </div>

      {/* 最近の登録 */}
      {recentScandals.length > 0 && (
        <div className="bg-slate-800/30 rounded-xl border border-slate-700/30 p-5">
          <h2 className="text-sm font-bold text-slate-300 mb-3">📝 今回登録した不祥事</h2>
          <div className="space-y-2">
            {recentScandals.map((s: any) => (
              <div key={s.id} className="flex items-center gap-2 text-xs">
                <span className="text-emerald-400">✓</span>
                <span className="text-slate-300">{s.title}</span>
                <span className="text-slate-600">{s.id.substring(0, 8)}...</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
