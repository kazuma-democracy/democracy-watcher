'use client'

import { useState, useEffect, useCallback } from 'react'

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
  { key: 'allegation', label: '疑惑', color: 'yellow' },
  { key: 'investigation', label: '調査中', color: 'orange' },
  { key: 'confirmed', label: '事実確認', color: 'red' },
  { key: 'convicted', label: '有罪確定', color: 'red' },
]

const SCANDAL_KEYWORDS = [
  '裏金', '不正', '疑惑', '逮捕', '起訴', '辞任', '処分', '政治資金',
  '買収', '収賄', 'パワハラ', 'セクハラ', '暴言', '不祥事', '統一教会',
]

type Article = { title: string; url: string; source: string; date: string }
type LinkedLeg = { id: string; name: string; party: string | null }
type Scandal = {
  id: string
  title: string
  category: string
  severity: string
  start_date: string | null
  summary: string
  is_published: boolean
  created_at: string
  people: any[]
  sources: any[]
}

export default function AdminScandalsPage() {
  // Auth
  const [password, setPassword] = useState('')
  const [authed, setAuthed] = useState(false)
  const [authError, setAuthError] = useState('')
  const [authLoading, setAuthLoading] = useState(false)

  // Existing scandals
  const [existingScandals, setExistingScandals] = useState<Scandal[]>([])
  const [scandalsLoading, setScandalsLoading] = useState(false)
  const [expandedScandal, setExpandedScandal] = useState<string | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  // Search
  const [searchName, setSearchName] = useState('')
  const [searchKeyword, setSearchKeyword] = useState('不祥事')
  const [articles, setArticles] = useState<Article[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [savedSources, setSavedSources] = useState<Article[]>([])

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

  // Editing
  const [editingId, setEditingId] = useState<string | null>(null)

  // Active tab
  const [activeTab, setActiveTab] = useState<'register' | 'list'>('list')

  // ============================================================
  // API helper
  // ============================================================
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

  // ============================================================
  // Auth — サーバーサイド検証
  // ============================================================
  async function handleLogin() {
    if (!password) return
    setAuthLoading(true)
    setAuthError('')
    try {
      const res = await fetch('/api/admin/scandals', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-password': password,
        },
        body: JSON.stringify({ action: 'verify_auth' }),
      })
      const data = await res.json()
      if (res.ok && data.ok) {
        setAuthed(true)
      } else {
        setAuthError(data.error || 'ログインに失敗しました')
      }
    } catch (e: any) {
      setAuthError(`接続エラー: ${e.message}`)
    } finally {
      setAuthLoading(false)
    }
  }

  // ============================================================
  // 既存の不祥事を読み込み
  // ============================================================
  const loadScandals = useCallback(async () => {
    setScandalsLoading(true)
    try {
      const res = await adminFetch({ action: 'list_scandals' })
      const data = await res.json()
      if (data.scandals) {
        setExistingScandals(data.scandals)
      }
    } catch (e) {
      console.error('Failed to load scandals:', e)
    } finally {
      setScandalsLoading(false)
    }
  }, [password])

  useEffect(() => {
    if (authed) loadScandals()
  }, [authed, loadScandals])

  // ============================================================
  // 公開/非公開 切り替え
  // ============================================================
  async function togglePublish(scandalId: string, currentState: boolean) {
    try {
      const res = await adminFetch({
        action: 'toggle_publish',
        scandal_id: scandalId,
        is_published: !currentState,
      })
      const data = await res.json()
      if (data.scandal) {
        setExistingScandals(prev =>
          prev.map(s => s.id === scandalId ? { ...s, is_published: !currentState } : s)
        )
      }
    } catch (e) {
      console.error(e)
    }
  }

  // ============================================================
  // 削除
  // ============================================================
  async function deleteScandal(scandalId: string) {
    try {
      const res = await adminFetch({ action: 'delete_scandal', scandal_id: scandalId })
      const data = await res.json()
      if (data.deleted) {
        setExistingScandals(prev => prev.filter(s => s.id !== scandalId))
        setDeleteConfirm(null)
      }
    } catch (e) {
      console.error(e)
    }
  }

  // ============================================================
  // ニュース検索
  // ============================================================
  async function searchNews() {
    if (!searchName && !searchKeyword) return
    setSearchLoading(true)
    setSearchLoading(true)
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

  function isSourceSaved(article: Article) {
    return savedSources.some(s => s.url === article.url)
  }

  function toggleSource(article: Article) {
    if (isSourceSaved(article)) {
      setSavedSources(prev => prev.filter(s => s.url !== article.url))
    } else {
      setSavedSources(prev => [...prev, article])
    }
  }

  function removeSource(url: string) {
    setSavedSources(prev => prev.filter(s => s.url !== url))
  }

  function prefillFromArticle(article: Article) {
    if (!title) setTitle(article.title)
    if (!startDate && article.date) {
      setStartDate(article.date.replace(/\//g, '-'))
    }
  }

  // ============================================================
  // 議員検索
  // ============================================================
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

  // ============================================================
  // 登録 / 更新
  // ============================================================
  async function handleSubmit() {
    if (!title || !summary) {
      setSubmitResult('❌ タイトルと概要は必須です')
      return
    }

    setSubmitting(true)
    setSubmitResult(null)

    try {
      if (editingId) {
        // ---- 更新モード ----
        const res = await adminFetch({
          action: 'update_scandal',
          scandal_id: editingId,
          title,
          category,
          severity,
          start_date: startDate || null,
          summary,
          legislator_ids: linkedLegs.map(l => l.id),
        })
        const data = await res.json()
        if (data.error) {
          setSubmitResult(`❌ ${data.error}`)
        } else {
          setSubmitResult(`✅ 更新完了: ${data.scandal.title}`)
          setEditingId(null)
          resetForm()
          loadScandals()
        }
      } else {
        // ---- 新規登録モード ----
        const sources = savedSources.map(a => ({
          url: a.url,
          publisher: a.source,
          published_at: a.date?.replace(/\//g, '-') || null,
          snippet: a.title,
        }))

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
          resetForm()
          loadScandals()
        }
      }
    } catch (e: any) {
      setSubmitResult(`❌ エラー: ${e.message}`)
    } finally {
      setSubmitting(false)
    }
  }

  // ============================================================
  // 編集開始
  // ============================================================
  function startEdit(scandal: Scandal) {
    setEditingId(scandal.id)
    setTitle(scandal.title)
    setCategory(scandal.category)
    setSeverity(scandal.severity)
    setStartDate(scandal.start_date || '')
    setSummary(scandal.summary)
    // 関係議員をセット
    const legs: LinkedLeg[] = scandal.people
      .filter((p: any) => p.legislators)
      .map((p: any) => ({
        id: p.legislators.id,
        name: p.legislators.name,
        party: p.legislators.current_party,
      }))
    setLinkedLegs(legs)
    // タブを切り替え
    setActiveTab('register')
    setSubmitResult(null)
    setArticles([])
    setSavedSources([])
    // スクロールトップ
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function cancelEdit() {
    setEditingId(null)
    resetForm()
  }

  // ============================================================
  // フォームリセット
  // ============================================================
  function resetForm() {
    setTitle('')
    setSummary('')
    setStartDate('')
    setCategory('political_funds')
    setSeverity('allegation')
    setSavedSources([])
    setLinkedLegs([])
    setArticles([])
    setSearchName('')
    setSearchKeyword('不祥事')
    setSubmitResult(null)
    setEditingId(null)
  }

  // ============================================================
  // ヘルパー
  // ============================================================
  function getCategoryLabel(key: string) {
    return CATEGORIES.find(c => c.key === key)?.label || key
  }
  function getSeverityLabel(key: string) {
    return SEVERITIES.find(s => s.key === key)?.label || key
  }
  function getSeverityColor(key: string) {
    switch (key) {
      case 'convicted': return 'bg-red-600/30 text-red-300 border-red-500/40'
      case 'confirmed': return 'bg-red-500/20 text-red-400 border-red-500/30'
      case 'investigation': return 'bg-orange-500/20 text-orange-400 border-orange-500/30'
      default: return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/40'
    }
  }

  // ============================================================
  // パスワード画面
  // ============================================================
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
            onKeyDown={e => { if (e.key === 'Enter') handleLogin() }}
            placeholder="パスワード"
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-sm text-slate-200 mb-3 focus:border-blue-500 focus:outline-none"
          />
          {authError && (
            <p className="text-sm text-red-400 mb-3">{authError}</p>
          )}
          <button
            onClick={handleLogin}
            disabled={authLoading || !password}
            className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-lg text-sm transition-colors"
          >
            {authLoading ? '検証中...' : 'ログイン'}
          </button>
        </div>
      </div>
    )
  }

  // ============================================================
  // 管理画面本体
  // ============================================================
  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">🔧 不祥事データベース管理</h1>
          <p className="text-sm text-slate-400 mt-1">登録済み: {existingScandals.length}件</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={resetForm}
            className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg text-xs transition-colors"
          >
            フォームリセット
          </button>
        </div>
      </div>

      {/* タブ切り替え */}
      <div className="flex gap-1 mb-6 bg-slate-800/50 rounded-lg p-1">
        <button
          onClick={() => setActiveTab('list')}
          className={`flex-1 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'list'
              ? 'bg-slate-700 text-white'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          📋 登録済み一覧 ({existingScandals.length})
        </button>
        <button
          onClick={() => setActiveTab('register')}
          className={`flex-1 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'register'
              ? 'bg-slate-700 text-white'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          {editingId ? '✏️ 編集中' : '➕ 新規登録'}
        </button>
      </div>

      {/* ============================================================ */}
      {/* 登録済み一覧タブ */}
      {/* ============================================================ */}
      {activeTab === 'list' && (
        <div>
          {scandalsLoading ? (
            <div className="text-center py-12 text-slate-500">読み込み中...</div>
          ) : existingScandals.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-slate-500 mb-3">まだ不祥事が登録されていません</p>
              <button
                onClick={() => setActiveTab('register')}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm transition-colors"
              >
                最初の不祥事を登録する
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {existingScandals.map(scandal => (
                <div
                  key={scandal.id}
                  className={`rounded-xl border p-4 transition-colors ${
                    scandal.is_published
                      ? 'bg-slate-800/30 border-slate-700/30'
                      : 'bg-slate-900/50 border-slate-700/20 opacity-60'
                  }`}
                >
                  {/* ヘッダー行 */}
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className={`text-xs px-2 py-0.5 rounded border ${getSeverityColor(scandal.severity)}`}>
                          {getSeverityLabel(scandal.severity)}
                        </span>
                        <span className="text-xs text-slate-500">{getCategoryLabel(scandal.category)}</span>
                        {scandal.start_date && (
                          <span className="text-xs text-slate-600">{scandal.start_date}</span>
                        )}
                        {!scandal.is_published && (
                          <span className="text-xs px-1.5 py-0.5 rounded bg-slate-700 text-slate-400">非公開</span>
                        )}
                      </div>
                      <button
                        onClick={() => setExpandedScandal(expandedScandal === scandal.id ? null : scandal.id)}
                        className="text-left"
                      >
                        <p className="text-sm font-bold text-slate-200 hover:text-blue-400 transition-colors">
                          {scandal.title}
                        </p>
                      </button>
                      {/* 関係議員 */}
                      {scandal.people.length > 0 && (
                        <div className="flex gap-1.5 mt-1.5 flex-wrap">
                          {scandal.people.map((p: any, i: number) => (
                            <span key={i} className="text-xs px-2 py-0.5 rounded bg-red-900/20 border border-red-800/20 text-red-400">
                              {p.legislators?.name || p.legislator_id}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* 操作ボタン */}
                    <div className="flex gap-1.5 shrink-0">
                      <button
                        onClick={() => startEdit(scandal)}
                        className="text-xs px-2.5 py-1.5 rounded-lg border border-slate-600 text-slate-400 hover:bg-blue-900/20 hover:text-blue-400 hover:border-blue-600/40 transition-colors"
                      >
                        ✏️ 編集
                      </button>
                      <button
                        onClick={() => togglePublish(scandal.id, scandal.is_published)}
                        className={`text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${
                          scandal.is_published
                            ? 'border-slate-600 text-slate-400 hover:bg-yellow-900/20 hover:text-yellow-400 hover:border-yellow-600/40'
                            : 'border-emerald-600/40 text-emerald-400 hover:bg-emerald-900/20'
                        }`}
                        title={scandal.is_published ? '非公開にする' : '公開する'}
                      >
                        {scandal.is_published ? '🔒 非公開' : '🌐 公開'}
                      </button>
                      {deleteConfirm === scandal.id ? (
                        <div className="flex gap-1">
                          <button
                            onClick={() => deleteScandal(scandal.id)}
                            className="text-xs px-2.5 py-1.5 rounded-lg bg-red-600 text-white hover:bg-red-500 transition-colors"
                          >
                            確定
                          </button>
                          <button
                            onClick={() => setDeleteConfirm(null)}
                            className="text-xs px-2.5 py-1.5 rounded-lg border border-slate-600 text-slate-400 hover:bg-slate-700 transition-colors"
                          >
                            戻る
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setDeleteConfirm(scandal.id)}
                          className="text-xs px-2.5 py-1.5 rounded-lg border border-slate-600 text-slate-400 hover:bg-red-900/20 hover:text-red-400 hover:border-red-600/40 transition-colors"
                        >
                          🗑 削除
                        </button>
                      )}
                    </div>
                  </div>

                  {/* 展開時の詳細 */}
                  {expandedScandal === scandal.id && (
                    <div className="mt-3 pt-3 border-t border-slate-700/30">
                      <p className="text-xs text-slate-400 whitespace-pre-wrap mb-3">{scandal.summary}</p>
                      {scandal.sources.length > 0 && (
                        <div>
                          <p className="text-xs text-slate-500 mb-1">出典:</p>
                          <div className="space-y-1">
                            {scandal.sources.map((src: any, i: number) => (
                              <a
                                key={i}
                                href={src.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="block text-xs text-blue-400 hover:text-blue-300 truncate"
                              >
                                {src.publisher && <span className="text-slate-500">[{src.publisher}]</span>}{' '}
                                {src.snippet || src.url}
                              </a>
                            ))}
                          </div>
                        </div>
                      )}
                      <p className="text-xs text-slate-600 mt-2">ID: {scandal.id}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ============================================================ */}
      {/* 新規登録タブ */}
      {/* ============================================================ */}
      {activeTab === 'register' && (
        <div>
          {/* 編集モードバナー */}
          {editingId && (
            <div className="bg-blue-900/30 border border-blue-600/30 rounded-xl p-4 mb-6 flex items-center justify-between">
              <div>
                <p className="text-sm font-bold text-blue-300">✏️ 編集モード</p>
                <p className="text-xs text-blue-400/70 mt-0.5">既存の不祥事レコードを編集中です</p>
              </div>
              <button
                onClick={cancelEdit}
                className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg text-xs transition-colors"
              >
                編集をキャンセル
              </button>
            </div>
          )}

          {/* STEP 1: ニュース検索 */}
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
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-slate-500">{articles.length}件のニュース</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      const newSources = articles.filter(a => !isSourceSaved(a))
                      if (newSources.length > 0) setSavedSources(prev => [...prev, ...newSources])
                    }}
                    className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
                  >
                    全て追加
                  </button>
                  <button
                    onClick={() => {
                      const urls = new Set(articles.map(a => a.url))
                      setSavedSources(prev => prev.filter(s => !urls.has(s.url)))
                    }}
                    className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
                  >
                    表示分を解除
                  </button>
                </div>
              </div>
            )}
            {articles.length > 0 && (
              <div className="border border-slate-700/30 rounded-lg overflow-hidden max-h-[350px] overflow-y-auto">
                {articles.map((article, idx) => {
                  const saved = isSourceSaved(article)
                  return (
                    <div
                      key={idx}
                      className={`flex items-start gap-3 px-3 py-2.5 cursor-pointer transition-colors ${
                        idx > 0 ? 'border-t border-slate-700/20' : ''
                      } ${saved
                        ? 'bg-blue-900/30 border-l-2 border-l-blue-500'
                        : 'hover:bg-slate-700/20'}`}
                      onClick={() => { toggleSource(article); prefillFromArticle(article) }}
                    >
                      <input
                        type="checkbox"
                        checked={saved}
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
                  )
                })}
              </div>
            )}

            {/* 蓄積済み出典一覧 */}
            {savedSources.length > 0 && (
              <div className="mt-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-bold text-blue-400">
                    📎 選択済み出典: {savedSources.length}件
                  </p>
                  <button
                    onClick={() => setSavedSources([])}
                    className="text-xs text-slate-500 hover:text-red-400 transition-colors"
                  >
                    全てクリア
                  </button>
                </div>
                <div className="border border-blue-700/30 rounded-lg overflow-hidden max-h-[250px] overflow-y-auto bg-blue-900/10">
                  {savedSources.map((src, i) => (
                    <div
                      key={src.url}
                      className={`flex items-start gap-2 px-3 py-2 ${i > 0 ? 'border-t border-blue-700/15' : ''}`}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-xs text-slate-300">{src.title}</p>
                        <div className="flex gap-2 mt-0.5 text-xs text-slate-600">
                          <span>{src.source}</span>
                          <span>{src.date}</span>
                        </div>
                      </div>
                      <button
                        onClick={() => removeSource(src.url)}
                        className="text-xs text-slate-600 hover:text-red-400 shrink-0 mt-0.5"
                        title="出典から除外"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-slate-600 mt-1.5">
                  💡 キーワードを変えて再検索しても、選択済みの出典はそのまま残ります
                </p>
              </div>
            )}
          </div>

          {/* STEP 2: 不祥事情報入力 */}
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

          {/* STEP 3: 議員紐付け */}
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

          {/* STEP 4: 登録/更新 */}
          <div className="bg-slate-800/30 rounded-xl border border-slate-700/30 p-5 mb-6">
            <h2 className="text-sm font-bold text-slate-300 mb-3">{editingId ? '④ 更新' : '④ 登録'}</h2>

            {/* プレビュー */}
            <div className="bg-slate-900/50 rounded-lg p-4 mb-4">
              <p className="text-xs text-slate-500 mb-2">プレビュー</p>
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-xs px-2 py-0.5 rounded border ${getSeverityColor(severity)}`}>
                  {getSeverityLabel(severity)}
                </span>
                <span className="text-xs text-slate-500">
                  {getCategoryLabel(category)}
                </span>
                {startDate && <span className="text-xs text-slate-500">{startDate}</span>}
              </div>
              <p className="text-sm font-bold text-slate-200 mb-1">{title || '（タイトル未入力）'}</p>
              <p className="text-xs text-slate-400">{summary ? summary.substring(0, 100) + (summary.length > 100 ? '...' : '') : '（概要未入力）'}</p>
              {linkedLegs.length > 0 && (
                <div className="flex gap-1.5 mt-2">
                  {linkedLegs.map(l => (
                    <span key={l.id} className="text-xs text-red-400">{l.name}</span>
                  ))}
                </div>
              )}
              <p className="text-xs text-slate-600 mt-1">出典: {savedSources.length}件</p>
            </div>

            <button
              onClick={handleSubmit}
              disabled={submitting || !title || !summary}
              className={`w-full py-3 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-lg text-sm font-bold transition-colors ${
                editingId
                  ? 'bg-blue-600 hover:bg-blue-500'
                  : 'bg-red-600 hover:bg-red-500'
              }`}
            >
              {submitting
                ? (editingId ? '更新中...' : '登録中...')
                : (editingId ? '✏️ この不祥事を更新する' : '⚠️ 不祥事を登録する')
              }
            </button>

            {submitResult && (
              <p className={`text-sm mt-3 ${submitResult.startsWith('✅') ? 'text-emerald-400' : 'text-red-400'}`}>
                {submitResult}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
