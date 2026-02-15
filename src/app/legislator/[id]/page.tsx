'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { supabase, Legislator, getPartyClass, getPartyShortName } from '@/lib/supabase'

type SpeechWithMeeting = {
  id: string
  speech_id: string
  speech_order: number | null
  speaker_name: string
  speaker_group: string | null
  speaker_position: string | null
  content: string | null
  ai_summary: string | null
  speech_url: string | null
  date: string
  meetings: {
    meeting_name: string
    house: string
    date: string
  } | null
}

export default function LegislatorPage() {
  const params = useParams()
  const id = params.id as string

  const [legislator, setLegislator] = useState<Legislator | null>(null)
  const [speeches, setSpeeches] = useState<SpeechWithMeeting[]>([])
  const [speechCount, setSpeechCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [expandedSpeech, setExpandedSpeech] = useState<string | null>(null)
  const [showCount, setShowCount] = useState(20)
  const [committees, setCommittees] = useState<{name: string; count: number}[]>([])
  const [monthly, setMonthly] = useState<{month: string; count: number}[]>([])
  const [partyBills, setPartyBills] = useState<{bill: any; vote: string}[]>([])
  const [partyBillsLoading, setPartyBillsLoading] = useState(true)
  useEffect(() => {
    async function load() {
      // 議員情報
      const { data: leg } = await supabase
        .from('legislators')
        .select('*')
        .eq('id', id)
        .single()

      if (leg) setLegislator(leg)

      // 発言数
      const { count } = await supabase
        .from('speeches')
        .select('*', { count: 'exact', head: true })
        .eq('legislator_id', id)
      setSpeechCount(count || 0)

      // 発言一覧（会議情報付き）
      const { data: sp } = await supabase
        .from('speeches')
        .select('*, meetings(meeting_name, house, date)')
        .eq('legislator_id', id)
        .order('date', { ascending: false })
        .limit(50)

      if (sp) setSpeeches(sp as SpeechWithMeeting[])

      // 委員会別集計
      const { data: allSp } = await supabase
        .from('speeches')
        .select('meetings(meeting_name)')
        .eq('legislator_id', id)
        .range(0, 4999)

      const cMap: Record<string, number> = {}
      for (const s of (allSp || [])) {
        const name = (s as any).meetings?.meeting_name || '不明'
        cMap[name] = (cMap[name] || 0) + 1
      }
      setCommittees(Object.entries(cMap).map(([name, cnt]) => ({name, count: cnt})).sort((a,b) => b.count - a.count).slice(0, 8))

      // 月別集計
      const { data: dates } = await supabase
        .from('speeches')
        .select('date')
        .eq('legislator_id', id)
        .range(0, 4999)

      const mMap: Record<string, number> = {}
      for (const s of (dates || [])) {
        const m = (s as any).date?.substring(0, 7)
        if (m) mMap[m] = (mMap[m] || 0) + 1
      }
      setMonthly(Object.entries(mMap).map(([month, cnt]) => ({month, count: cnt})).sort((a,b) => a.month.localeCompare(b.month)))

      setLoading(false)
    }
    load()
  }, [id])

  // 会派の賛否データを取得
  useEffect(() => {
    if (!legislator?.current_party) return
    async function loadPartyBills() {
      setPartyBillsLoading(true)
      // 会派名の部分一致で検索（「自由民主党・無所属の会」→「自由民主党」で探す）
      const partyName = legislator!.current_party!
      const searchTerms: string[] = [partyName]
      // 短縮名も追加
      if (partyName.includes('自由民主党')) searchTerms.push('自由民主党')
      if (partyName.includes('立憲民主')) searchTerms.push('立憲民主')
      if (partyName.includes('公明')) searchTerms.push('公明')
      if (partyName.includes('維新')) searchTerms.push('日本維新')
      if (partyName.includes('国民民主')) searchTerms.push('国民民主')
      if (partyName.includes('共産')) searchTerms.push('日本共産')
      if (partyName.includes('れいわ')) searchTerms.push('れいわ')
      if (partyName.includes('参政')) searchTerms.push('参政')
      if (partyName === '社会民主党') searchTerms.push('社会民主')

      // bill_votes から会派名で検索（最新50件）
      let allVotes: any[] = []
      for (const term of searchTerms) {
        const { data } = await supabase
          .from('bill_votes')
          .select('vote, bills!inner(id, bill_name, bill_type, status, session, submit_session, bill_number, category, category_sub, progress_url)')
          .ilike('party_name', `%${term}%`)
          .order('bill_id', { ascending: false })
          .limit(60)
        if (data) allVotes = allVotes.concat(data)
      }

      // 重複除去（同じbill_id）
      const seen = new Set<string>()
      const unique: {bill: any; vote: string}[] = []
      for (const v of allVotes) {
        const bill = v.bills as any
        if (!bill || seen.has(bill.id)) continue
        seen.add(bill.id)
        unique.push({ bill, vote: v.vote })
      }

      // sessionで降順ソート
      unique.sort((a, b) => (b.bill.session || 0) - (a.bill.session || 0))
      setPartyBills(unique.slice(0, 50))
      setPartyBillsLoading(false)
    }
    loadPartyBills()
  }, [legislator])

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-20 text-center">
        <div className="animate-pulse">
          <div className="text-4xl mb-4">👤</div>
          <p className="text-slate-400">読み込み中...</p>
        </div>
      </div>
    )
  }

  if (!legislator) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-20 text-center">
        <div className="text-4xl mb-4">❌</div>
        <p className="text-slate-400">議員が見つかりません</p>
        <a href="/" className="text-blue-400 hover:underline text-sm mt-4 inline-block">← 一覧に戻る</a>
      </div>
    )
  }

  const partyClass = getPartyClass(legislator.current_party)
  const partyShort = getPartyShortName(legislator.current_party)

  // 発言の冒頭を取得（200文字）
  function truncate(text: string | null, len = 200) {
    if (!text) return ''
    // 発言冒頭の「○議員名（...）　」を除去
    const cleaned = text.replace(/^○.+?　/, '')
    if (cleaned.length <= len) return cleaned
    return cleaned.substring(0, len) + '...'
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* 戻るリンク */}
      <div className="flex items-center justify-between mb-6">
        <a href="/" className="text-sm text-slate-400 hover:text-blue-400 transition-colors">
          ← 議員一覧に戻る
        </a>
        <a href={`/compare?leg1=${id}`} className="text-xs text-slate-400 hover:text-blue-400 border border-slate-700 hover:border-blue-600 px-3 py-1.5 rounded-lg transition-colors">
          ⚖️ この議員を比較
        </a>
      </div>

      {/* ① プロフィールカード */}
      <div className={`rounded-2xl overflow-hidden mb-8 border border-slate-700/50`}>
        <div className={`party-${partyClass} px-6 py-4`}>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-white">{legislator.name}</h1>
              <p className="text-white/70 text-sm mt-1">{legislator.name_yomi}</p>
            </div>
            <div className="text-right">
              <span className="bg-white/20 text-white px-3 py-1 rounded-lg text-sm font-medium">
                {partyShort}
              </span>
            </div>
          </div>
        </div>
        <div className="bg-slate-800 px-6 py-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <div className="text-xs text-slate-500 mb-1">所属院</div>
              <div className="text-sm text-slate-200">{legislator.house || '不明'}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500 mb-1">会派</div>
              <div className="text-sm text-slate-200">{legislator.current_party || '不明'}</div>
            </div>
            {legislator.current_position && (
              <div>
                <div className="text-xs text-slate-500 mb-1">役職</div>
                <div className="text-sm text-amber-400">{legislator.current_position}</div>
              </div>
            )}
            <div>
              <div className="text-xs text-slate-500 mb-1">発言数</div>
              <div className="text-sm text-emerald-400 font-bold">{speechCount}件</div>
            </div>
          </div>
        </div>
      </div>

      {/* ② 関連ニュース */}
      <LegislatorNewsSection name={legislator.name} party={legislator.current_party} />

      {/* ③ 国会発言（スクロール式） */}
      <div className="mb-8">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-slate-100">
            💬 国会発言
          </h2>
          <span className="text-sm text-slate-500">{speechCount}件（新しい順）</span>
        </div>

        {speeches.length > 0 ? (
          <div className="bg-slate-800/20 rounded-xl border border-slate-700/30 overflow-hidden">
            <div className="max-h-[500px] overflow-y-auto">
              {speeches.slice(0, showCount).map((sp, i) => {
                const isExpanded = expandedSpeech === sp.id
                return (
                  <div
                    key={sp.id}
                    className={`${i > 0 ? 'border-t border-slate-700/20' : ''}`}
                  >
                    <div className="px-4 py-3 flex items-center justify-between border-b border-slate-700/10">
                      <div className="flex items-center gap-3 text-xs">
                        <span className="text-slate-400">{sp.date}</span>
                        <span className="bg-slate-700 px-2 py-0.5 rounded text-slate-300">
                          {sp.meetings?.house} {sp.meetings?.meeting_name}
                        </span>
                        {sp.speaker_position && (
                          <span className="text-amber-400/80">{sp.speaker_position}</span>
                        )}
                      </div>
                      <a
                        href={sp.speech_url || '#'}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-blue-400/60 hover:text-blue-400 transition-colors"
                      >
                        原文 ↗
                      </a>
                    </div>
                    <div
                      className="px-4 py-3 cursor-pointer hover:bg-slate-700/20 transition-colors"
                      onClick={() => setExpandedSpeech(isExpanded ? null : sp.id)}
                    >
                      {sp.ai_summary && (
                        <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3 mb-3 text-sm text-blue-200">
                          <span className="text-xs text-blue-400 font-medium">🤖 AI要約：</span>
                          <span className="ml-2">{sp.ai_summary}</span>
                        </div>
                      )}
                      <p className="text-sm text-slate-300 leading-relaxed">
                        {isExpanded ? sp.content?.replace(/^○.+?　/, '') : truncate(sp.content)}
                      </p>
                      {(sp.content?.length || 0) > 200 && (
                        <button className="text-xs text-blue-400/60 hover:text-blue-400 mt-2 transition-colors">
                          {isExpanded ? '▲ 閉じる' : '▼ 全文を表示'}
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
            {showCount < speeches.length && (
              <div className="text-center py-3 border-t border-slate-700/30">
                <button
                  onClick={() => setShowCount((prev) => prev + 20)}
                  className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
                >
                  もっと読み込む
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-12 bg-slate-800/20 rounded-xl border border-slate-700/30">
            <div className="text-3xl mb-3">📭</div>
            <p className="text-slate-400">発言データがまだありません</p>
            <p className="text-slate-500 text-sm mt-1">データ収集中です。しばらくお待ちください。</p>
          </div>
        )}
      </div>

      {/* ④ グラフセクション（月別発言数・委員会別） */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        {monthly.length > 0 && (
          <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
            <h3 className="text-sm font-bold text-slate-300 mb-4">📈 月別発言数</h3>
            {(() => {
              const maxM = Math.max(...monthly.map(x => x.count))
              const barMaxHeight = 120
              return (
                <>
                  <div className="flex items-end gap-1.5" style={{ height: `${barMaxHeight + 20}px` }}>
                    {monthly.map(m => {
                      const barH = maxM > 0 ? Math.max(m.count > 0 ? 3 : 0, Math.round((m.count / maxM) * barMaxHeight)) : 0
                      return (
                        <div key={m.month} className="flex-1 flex flex-col items-center justify-end group relative" style={{ minWidth: '20px', height: '100%' }}>
                          <div className="absolute -top-7 hidden group-hover:block bg-slate-700 text-xs text-slate-200 px-2 py-1 rounded whitespace-nowrap z-10 shadow-lg">
                            {m.month}: {m.count}件
                          </div>
                          <div className="text-xs text-emerald-400 mb-1 font-medium">{m.count}</div>
                          <div
                            className="w-full bg-emerald-500 hover:bg-emerald-400 rounded-t transition-colors"
                            style={{ height: `${barH}px` }}
                          />
                        </div>
                      )
                    })}
                  </div>
                  <div className="flex text-xs text-slate-500 mt-2 border-t border-slate-700/30 pt-2">
                    {monthly.map(m => (
                      <span key={m.month} style={{ flex: 1, textAlign: 'center', fontSize: '10px' }}>
                        {m.month.substring(5)}月
                      </span>
                    ))}
                  </div>
                </>
              )
            })()}
          </div>
        )}

        {committees.length > 0 && (
          <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
            <h3 className="text-sm font-bold text-slate-300 mb-4">📋 委員会別発言数</h3>
            <div className="space-y-2">
              {committees.map(c => {
                const maxC = committees[0].count
                return (
                  <div key={c.name} className="flex items-center gap-2">
                    <div className="flex-1 text-xs text-slate-300 truncate" title={c.name}>{c.name}</div>
                    <div className="w-28 bg-slate-700/30 rounded-full h-3 overflow-hidden">
                      <div className="h-full rounded-full bg-blue-500/60" style={{ width: `${(c.count / maxC) * 100}%` }} />
                    </div>
                    <span className="text-xs text-slate-500 w-8 text-right">{c.count}</span>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* ⑤ 所属会派の賛否履歴 */}
      {legislator.current_party && (
        <div className="mb-8">
          <h2 className="text-xl font-bold text-slate-100 mb-1">
            🗳️ 所属会派の賛否履歴
          </h2>
          <p className="text-xs text-slate-500 mb-4">
            {legislator.current_party} としての賛否（※議員個人ではなく会派としての投票）
          </p>

          {partyBillsLoading ? (
            <div className="text-center py-8">
              <div className="animate-pulse text-slate-500 text-sm">賛否データを読み込み中...</div>
            </div>
          ) : partyBills.length === 0 ? (
            <div className="text-center py-8 bg-slate-800/20 rounded-xl border border-slate-700/30">
              <p className="text-slate-500 text-sm">この会派の賛否データが見つかりませんでした</p>
            </div>
          ) : (
            <>
              {(() => {
                const yeaCount = partyBills.filter(pb => pb.vote === '賛成').length
                const nayCount = partyBills.filter(pb => pb.vote === '反対').length
                const total = yeaCount + nayCount
                const yeaPct = total > 0 ? Math.round((yeaCount / total) * 100) : 0
                return (
                  <div className="bg-slate-800/30 rounded-xl border border-slate-700/30 p-4 mb-4">
                    <div className="flex items-center justify-between text-sm mb-2">
                      <span className="text-emerald-400 font-bold">⭕ 賛成 {yeaCount}件</span>
                      <span className="text-red-400 font-bold">❌ 反対 {nayCount}件</span>
                    </div>
                    <div className="w-full h-3 bg-slate-700/50 rounded-full overflow-hidden flex">
                      <div className="h-full bg-emerald-500/70 rounded-l-full" style={{ width: `${yeaPct}%` }} />
                      <div className="h-full bg-red-500/70 rounded-r-full" style={{ width: `${100 - yeaPct}%` }} />
                    </div>
                    <p className="text-xs text-slate-500 mt-2 text-center">直近{total}件の採決</p>
                  </div>
                )
              })()}
              <div className="bg-slate-800/20 rounded-xl border border-slate-700/30 overflow-hidden">
                <div className="max-h-96 overflow-y-auto">
                  {partyBills.map((pb, i) => (
                    <a
                      key={pb.bill.id}
                      href={`/bills/${pb.bill.id}`}
                      className={`flex items-start gap-3 px-4 py-3 hover:bg-slate-700/30 transition-colors ${
                        i > 0 ? 'border-t border-slate-700/20' : ''
                      }`}
                    >
                      <span className={`text-xs font-bold shrink-0 mt-0.5 w-12 ${
                        pb.vote === '賛成' ? 'text-emerald-400' : 'text-red-400'
                      }`}>
                        {pb.vote === '賛成' ? '⭕ 賛成' : '❌ 反対'}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-slate-300 leading-snug line-clamp-2">
                          {pb.bill.bill_name}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          {pb.bill.category && (
                            <span className="text-xs px-1.5 py-0.5 rounded-full bg-indigo-900/30 text-indigo-400 border border-indigo-700/30">
                              {pb.bill.category}
                            </span>
                          )}
                          <span className="text-xs text-slate-600">第{pb.bill.session}回</span>
                        </div>
                      </div>
                    </a>
                  ))}
                </div>
                {partyBills.length >= 50 && (
                  <div className="px-4 py-2 border-t border-slate-700/30 text-center">
                    <a href="/bills" className="text-xs text-blue-400 hover:text-blue-300">
                      全議案を見る →
                    </a>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* 議員比較リンク */}
      <div className="mb-8 text-center">
        <a
          href={`/compare?leg1=${id}`}
          className="text-sm text-blue-400/70 hover:text-blue-400 transition-colors"
        >
          ⚖️ この議員を他の議員と比較する →
        </a>
      </div>
    </div>
  )
}

// ===== 議員関連ニュースコンポーネント（5タブ式） =====
type NewsTab = {
  key: string
  label: string
  icon: string
  keywords: string  // 議員名の後に追加する検索キーワード
}

const NEWS_TABS: NewsTab[] = [
  { key: 'latest', label: '最新', icon: '📰', keywords: '' },
  { key: 'scandal', label: '疑惑・問題', icon: '⚠️', keywords: '裏金 OR 不正 OR 疑惑 OR 不祥事 OR 逮捕 OR 辞任 OR 処分 OR 政治資金' },
  { key: 'policy', label: '政策・活動', icon: '🏛️', keywords: '法案 OR 政策 OR 提言 OR 委員会 OR 質疑 OR 答弁' },
  { key: 'election', label: '選挙', icon: '🗳️', keywords: '選挙 OR 出馬 OR 当選 OR 落選 OR 公約' },
]

type NewsArticle = { title: string; url: string; source: string; date: string }

function LegislatorNewsSection({ name, party }: { name: string; party: string | null }) {
  const [activeTab, setActiveTab] = useState('latest')
  const [cache, setCache] = useState<Record<string, NewsArticle[]>>({})
  const [loadingTab, setLoadingTab] = useState<string | null>(null)
  const [errorTab, setErrorTab] = useState<string | null>(null)
  const [customKeyword, setCustomKeyword] = useState('')
  const [customInput, setCustomInput] = useState('')

  // タブ切り替え or 初回ロード時にニュース取得
  useEffect(() => {
    fetchTab(activeTab)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchTab(tabKey: string) {
    setActiveTab(tabKey)
    // キャッシュがあればスキップ
    if (cache[tabKey]) return

    setLoadingTab(tabKey)
    setErrorTab(null)
    try {
      let keywords = ''
      if (tabKey === 'custom') {
        keywords = customKeyword
      } else {
        const tab = NEWS_TABS.find(t => t.key === tabKey)
        keywords = tab?.keywords || ''
      }
      const query = keywords ? `${name} ${keywords}` : name
      const res = await fetch(`/api/news?q=${encodeURIComponent(query)}`)
      const data = await res.json()
      setCache(prev => ({ ...prev, [tabKey]: data.articles || [] }))
    } catch {
      setErrorTab(tabKey)
    } finally {
      setLoadingTab(null)
    }
  }

  function handleCustomSearch() {
    if (!customInput.trim()) return
    setCustomKeyword(customInput.trim())
    // カスタムのキャッシュをクリアして再検索
    setCache(prev => {
      const next = { ...prev }
      delete next['custom']
      return next
    })
    setActiveTab('custom')
    // fetchTabはuseEffect経由ではなく直接呼ぶ
    setTimeout(() => {
      fetchCustom(customInput.trim())
    }, 0)
  }

  async function fetchCustom(kw: string) {
    setLoadingTab('custom')
    setErrorTab(null)
    try {
      const query = `${name} ${kw}`
      const res = await fetch(`/api/news?q=${encodeURIComponent(query)}`)
      const data = await res.json()
      setCache(prev => ({ ...prev, custom: data.articles || [] }))
    } catch {
      setErrorTab('custom')
    } finally {
      setLoadingTab(null)
    }
  }

  const articles = cache[activeTab] || []
  const isLoading = loadingTab === activeTab
  const isError = errorTab === activeTab

  // 現在のタブの検索クエリ（外部リンク用）
  const currentQuery = (() => {
    if (activeTab === 'custom') return `${name} ${customKeyword}`
    const tab = NEWS_TABS.find(t => t.key === activeTab)
    return tab?.keywords ? `${name} ${tab.keywords}` : name
  })()

  return (
    <div className="bg-slate-800/30 rounded-xl border border-slate-700/30 p-5 mb-8">
      <h2 className="text-sm font-bold text-slate-300 mb-3">📰 関連ニュース</h2>

      {/* タブ */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        {NEWS_TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => fetchTab(tab.key)}
            className={`text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${
              activeTab === tab.key
                ? 'bg-blue-600 border-blue-500 text-white'
                : 'bg-slate-800/50 border-slate-700/50 text-slate-400 hover:text-slate-200'
            }`}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
        {/* カスタムタブ（検索済みなら表示） */}
        {customKeyword && (
          <button
            onClick={() => fetchTab('custom')}
            className={`text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${
              activeTab === 'custom'
                ? 'bg-purple-600 border-purple-500 text-white'
                : 'bg-slate-800/50 border-slate-700/50 text-slate-400 hover:text-slate-200'
            }`}
          >
            🔎 {customKeyword.length > 10 ? customKeyword.slice(0, 10) + '...' : customKeyword}
          </button>
        )}
      </div>

      {/* カスタム検索入力 */}
      <div className="flex gap-2 mb-4">
        <input
          type="text"
          value={customInput}
          onChange={(e) => setCustomInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleCustomSearch() }}
          placeholder="カスタムキーワード（例: 裏金 献金）"
          className="flex-1 bg-slate-800/50 border border-slate-700/50 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-blue-500 focus:outline-none"
        />
        <button
          onClick={handleCustomSearch}
          disabled={!customInput.trim()}
          className="text-xs px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:bg-slate-700 disabled:text-slate-500 text-white transition-colors shrink-0"
        >
          🔍 検索
        </button>
      </div>

      {/* 記事一覧 */}
      {isLoading && (
        <div className="animate-pulse space-y-2">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-10 bg-slate-700/30 rounded-lg" />
          ))}
        </div>
      )}

      {!isLoading && articles.length > 0 && (
        <div className="space-y-1.5 mb-3">
          {articles.map((a, i) => (
            <a
              key={i}
              href={a.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-start gap-3 px-3 py-2.5 rounded-lg hover:bg-slate-700/30 transition-colors group"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm text-slate-200 leading-snug group-hover:text-blue-300 transition-colors line-clamp-2">
                  {a.title}
                </p>
                <div className="flex items-center gap-2 mt-1">
                  {a.source && <span className="text-xs text-slate-500">{a.source}</span>}
                  {a.date && <span className="text-xs text-slate-600">{a.date}</span>}
                </div>
              </div>
              <span className="text-xs text-slate-600 shrink-0 mt-1">↗</span>
            </a>
          ))}
        </div>
      )}

      {!isLoading && articles.length === 0 && !isError && cache[activeTab] !== undefined && (
        <p className="text-xs text-slate-500 mb-3">関連するニュースが見つかりませんでした</p>
      )}

      {isError && (
        <p className="text-xs text-slate-500 mb-3">ニュースの取得に失敗しました</p>
      )}

      {/* 外部リンク */}
      <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-700/30">
        <a
          href={`https://news.google.com/search?q=${encodeURIComponent(currentQuery)}&hl=ja&gl=JP&ceid=JP:ja`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-blue-400 hover:text-blue-300 border border-blue-700/50 px-2.5 py-1.5 rounded-lg hover:bg-blue-900/30 transition-colors"
        >
          📰 Google Newsで詳しく ↗
        </a>
        <a
          href={`https://x.com/search?q=${encodeURIComponent(currentQuery)}&f=live`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-blue-400 hover:text-blue-300 border border-blue-700/50 px-2.5 py-1.5 rounded-lg hover:bg-blue-900/30 transition-colors"
        >
          𝕏 ポストを検索 ↗
        </a>
      </div>
    </div>
  )
}
