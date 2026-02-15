'use client'

import { Suspense, useEffect, useState, useMemo } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { supabase, getPartyClass, getPartyShortName } from '@/lib/supabase'

// 注目委員会プリセット
const FEATURED_COMMITTEES = [
  { key: '憲法審査会', label: '憲法審査会', icon: '📜', description: '憲法改正の議論を行う機関' },
  { key: '予算委員会', label: '予算委員会', icon: '💰', description: '国家予算の審議・政府への質疑' },
  { key: '政治倫理の確立及び選挙制度に関する特別委員会', label: '政治倫理・選挙', icon: '⚖️', description: '政治倫理と選挙制度の審議' },
  { key: '政治倫理審査会', label: '政治倫理審査会', icon: '🔍', description: '議員の政治倫理を審査' },
  { key: '安全保障委員会', label: '安全保障委員会', icon: '🛡️', description: '防衛・安全保障政策の審議' },
]

// 護憲派政党
const GOKEN_PARTIES = ['立憲民主', 'れいわ', '共産']

// 憲法審査会用の発言分類タブ
const KENPOU_SPEECH_TABS = [
  { key: 'all', label: '全件', icon: '📋', keywords: [] as string[], partyGroup: '' },
  { key: 'pro_amendment', label: '改憲派', icon: '🔴', keywords: [], partyGroup: 'kaiken' },
  { key: 'pro_protect', label: '護憲派', icon: '🔵', keywords: [], partyGroup: 'goken' },
  { key: 'article9', label: '9条・自衛隊', icon: '🛡️', keywords: ['九条', '9条', '自衛隊', '戦力', '交戦権', '専守防衛', '戦争放棄'], partyGroup: '' },
  { key: 'emergency', label: '緊急事態', icon: '🚨', keywords: ['緊急事態', '緊急政令', '非常事態', '有事', '緊急事態条項', '国会の機能維持'], partyGroup: '' },
  { key: 'rights', label: '人権・権利', icon: '⚖️', keywords: ['人権', '基本的人権', '表現の自由', 'プライバシー', '知る権利', '環境権', '新しい人権'], partyGroup: '' },
  { key: 'referendum', label: '国民投票', icon: '🗳️', keywords: ['国民投票', '投票法', 'CM規制', '広告規制', '最低投票率'], partyGroup: '' },
  { key: 'procedure', label: '審査手続', icon: '📝', keywords: ['請願', '審査会の運営', '公聴会', '参考人', '自由討議', '定足数'], partyGroup: '' },
]

// 汎用委員会用の発言分類タブ
const GENERIC_SPEECH_TABS = [
  { key: 'all', label: '全件', icon: '📋', keywords: [] as string[], partyGroup: '' },
  { key: 'question', label: '質疑', icon: '❓', keywords: ['お伺い', '質問', '伺いたい', '御見解', 'いかがでしょうか', '認識を伺'], partyGroup: '' },
  { key: 'answer', label: '答弁', icon: '💬', keywords: ['お答え', '答弁', '御指摘', '御質問に', '政府として'], partyGroup: '' },
  { key: 'criticism', label: '追及・批判', icon: '⚠️', keywords: ['問題', '責任', '説明責任', '不十分', '疑惑', '納得できない', '許されない'], partyGroup: '' },
]

// 論点分析カード用（既存のキーワード分析を維持）
const KENPOU_KEYWORDS = [
  { key: 'amendment', label: '改憲', keywords: ['改正', '改憲', '発議', '国民投票'] },
  { key: 'article9', label: '9条・自衛隊', keywords: ['九条', '9条', '自衛隊', '戦力', '交戦権'] },
  { key: 'emergency', label: '緊急事態', keywords: ['緊急事態', '緊急政令', '非常事態', '有事'] },
  { key: 'rights', label: '人権・権利', keywords: ['人権', '基本的人権', '表現の自由', 'プライバシー'] },
]

type SpeakerStat = { name: string; party: string | null; count: number; legislator_id: string | null }
type MonthlyCount = { month: string; count: number }

export default function CommitteeWatchWrapper() {
  return (
    <Suspense fallback={
      <div className="max-w-6xl mx-auto px-4 py-20 text-center">
        <div className="animate-pulse"><div className="text-4xl mb-4">🏛️</div>
        <p className="text-slate-400">読み込み中...</p></div>
      </div>
    }>
      <CommitteeWatchPage />
    </Suspense>
  )
}

function CommitteeWatchPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const committeeName = searchParams.get('name') || '憲法審査会'

  const [meetings, setMeetings] = useState<any[]>([])
  const [speeches, setSpeeches] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [activeAnalysis, setActiveAnalysis] = useState('speakers')
  const [speechFilter, setSpeechFilter] = useState('all')
  const [showSpeechCount, setShowSpeechCount] = useState(20)
  const [expandedSpeech, setExpandedSpeech] = useState<string | null>(null)
  const [allCommittees, setAllCommittees] = useState<string[]>([])
  const [searchInput, setSearchInput] = useState('')

  useEffect(() => {
    loadData()
    loadCommitteeList()
  }, [committeeName]) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadData() {
    setLoading(true)
    setShowSpeechCount(20)
    setExpandedSpeech(null)
    setSpeechFilter('all')

    // 会議一覧
    const { data: mtgs } = await supabase
      .from('meetings')
      .select('*')
      .ilike('meeting_name', `%${committeeName}%`)
      .order('date', { ascending: false })

    // 発言一覧
    const { data: spch } = await supabase
      .from('speeches')
      .select('*, legislators(id, name, current_party), meetings!inner(id, meeting_name, house, date)')
      .ilike('meetings.meeting_name', `%${committeeName}%`)
      .order('date', { ascending: false })
      .limit(500)

    setMeetings(mtgs || [])
    setSpeeches(spch || [])
    setLoading(false)
  }

  async function loadCommitteeList() {
    const { data } = await supabase
      .from('meetings')
      .select('meeting_name')
    if (data) {
      const names = Array.from(new Set(data.map((m: any) => m.meeting_name))).sort()
      setAllCommittees(names as string[])
    }
  }

  function navigateTo(name: string) {
    router.push(`/committee?name=${encodeURIComponent(name)}`)
  }

  // === 分析データ ===

  // 発言者ランキング
  const speakerStats: SpeakerStat[] = useMemo(() => {
    const map: Record<string, SpeakerStat> = {}
    speeches.forEach((sp: any) => {
      const name = sp.speaker_name || '不明'
      if (!map[name]) {
        map[name] = {
          name,
          party: sp.legislators?.current_party || sp.speaker_group || null,
          count: 0,
          legislator_id: sp.legislators?.id || sp.legislator_id
        }
      }
      map[name].count++
    })
    return Object.values(map).sort((a, b) => b.count - a.count)
  }, [speeches])

  // 政党別発言数
  const partyStats = useMemo(() => {
    const map: Record<string, number> = {}
    speeches.forEach((sp: any) => {
      const party = getPartyShortName(sp.legislators?.current_party || sp.speaker_group) || '無所属/不明'
      map[party] = (map[party] || 0) + 1
    })
    return Object.entries(map)
      .map(([party, count]) => ({ party, count }))
      .sort((a, b) => b.count - a.count)
  }, [speeches])

  // 月別開催数
  const monthlyMeetings: MonthlyCount[] = useMemo(() => {
    const map: Record<string, number> = {}
    meetings.forEach((m: any) => {
      const month = m.date?.substring(0, 7)
      if (month) map[month] = (map[month] || 0) + 1
    })
    return Object.entries(map)
      .map(([month, count]) => ({ month, count }))
      .sort((a, b) => a.month.localeCompare(b.month))
  }, [meetings])

  // キーワード分析（憲法審査会用）
  const keywordStats = useMemo(() => {
    return KENPOU_KEYWORDS.map(kw => {
      const matchCount = speeches.filter((sp: any) =>
        kw.keywords.some(k => sp.content?.includes(k))
      ).length
      return { ...kw, count: matchCount }
    })
  }, [speeches])

  const maxMonthly = Math.max(...monthlyMeetings.map(m => m.count), 1)
  const isKenpou = committeeName.includes('憲法審査会')

  // 発言フィルター
  const speechTabs = isKenpou ? KENPOU_SPEECH_TABS : GENERIC_SPEECH_TABS

  function isGokenParty(sp: any): boolean {
    const group = sp.speaker_group || sp.legislators?.current_party || ''
    return GOKEN_PARTIES.some(p => group.includes(p))
  }

  const filteredSpeeches = useMemo(() => {
    if (speechFilter === 'all') return speeches
    const tab = speechTabs.find(k => k.key === speechFilter)
    if (!tab) return speeches

    // 政党グループフィルター
    if (tab.partyGroup === 'goken') {
      return speeches.filter((sp: any) => isGokenParty(sp))
    }
    if (tab.partyGroup === 'kaiken') {
      return speeches.filter((sp: any) => !isGokenParty(sp))
    }

    // キーワードフィルター
    if (tab.keywords.length === 0) return speeches
    return speeches.filter((sp: any) =>
      tab.keywords.some(k => sp.content?.includes(k))
    )
  }, [speeches, speechFilter, speechTabs])

  // 開催されなかった月の検出
  const inactiveMonths = useMemo(() => {
    if (monthlyMeetings.length < 2) return []
    const inactive: string[] = []
    const start = monthlyMeetings[0].month
    const end = monthlyMeetings[monthlyMeetings.length - 1].month
    const activeSet = new Set(monthlyMeetings.map(m => m.month))

    let current = start
    while (current <= end) {
      if (!activeSet.has(current)) inactive.push(current)
      const [y, m] = current.split('-').map(Number)
      const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`
      current = next
    }
    return inactive
  }, [monthlyMeetings])

  function truncate(text: string | null, len = 200) {
    if (!text) return ''
    const cleaned = text.replace(/^○.+?　/, '')
    return cleaned.length <= len ? cleaned : cleaned.substring(0, len) + '...'
  }

  // 委員会検索
  const filteredCommittees = allCommittees.filter(c =>
    !searchInput || c.includes(searchInput)
  )

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-20 text-center">
        <div className="animate-pulse">
          <div className="text-4xl mb-4">🏛️</div>
          <p className="text-slate-400">「{committeeName}」のデータを読み込み中...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* ヘッダー */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-100 mb-1">
          🏛️ 委員会ウォッチ: {committeeName}
        </h1>
        <p className="text-sm text-slate-400">
          {FEATURED_COMMITTEES.find(c => committeeName.includes(c.key))?.description ||
            `「${committeeName}」の活動を分析・監視`}
        </p>
      </div>

      {/* 注目委員会プリセット */}
      <div className="flex flex-wrap gap-2 mb-4">
        {FEATURED_COMMITTEES.map(c => (
          <button
            key={c.key}
            onClick={() => navigateTo(c.key)}
            className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
              committeeName.includes(c.key)
                ? 'bg-blue-600 border-blue-500 text-white'
                : 'bg-slate-800/50 border-slate-700/50 text-slate-400 hover:text-slate-200'
            }`}
          >
            {c.icon} {c.label}
          </button>
        ))}
      </div>

      {/* 委員会検索 */}
      <div className="flex gap-2 mb-6">
        <div className="relative flex-1">
          <input
            type="text"
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            placeholder="委員会名を検索..."
            className="w-full bg-slate-800/50 border border-slate-700/50 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-blue-500 focus:outline-none"
          />
          {searchInput && filteredCommittees.length > 0 && (
            <div className="absolute z-20 top-full mt-1 w-full bg-slate-800 border border-slate-700 rounded-lg max-h-48 overflow-y-auto shadow-xl">
              {filteredCommittees.slice(0, 15).map(c => (
                <button
                  key={c}
                  onClick={() => { navigateTo(c); setSearchInput('') }}
                  className="w-full text-left px-3 py-2 text-xs text-slate-300 hover:bg-slate-700/50 transition-colors"
                >
                  {c}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* サマリーカード */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <div className="bg-slate-800/30 rounded-xl border border-slate-700/30 p-4 text-center">
          <div className="text-2xl font-bold text-emerald-400">{meetings.length}</div>
          <div className="text-xs text-slate-500">開催回数</div>
        </div>
        <div className="bg-slate-800/30 rounded-xl border border-slate-700/30 p-4 text-center">
          <div className="text-2xl font-bold text-blue-400">{speeches.length}</div>
          <div className="text-xs text-slate-500">発言数</div>
        </div>
        <div className="bg-slate-800/30 rounded-xl border border-slate-700/30 p-4 text-center">
          <div className="text-2xl font-bold text-purple-400">{speakerStats.length}</div>
          <div className="text-xs text-slate-500">発言者数</div>
        </div>
        <div className="bg-slate-800/30 rounded-xl border border-slate-700/30 p-4 text-center">
          <div className="text-2xl font-bold text-amber-400">{partyStats.length}</div>
          <div className="text-xs text-slate-500">参加政党数</div>
        </div>
      </div>

      {/* 開催されなかった月の警告 */}
      {inactiveMonths.length > 0 && (
        <div className="bg-red-900/20 border border-red-700/30 rounded-lg px-4 py-3 mb-6">
          <p className="text-xs text-red-400/90 font-medium mb-1">
            🚨 開催されなかった月（{inactiveMonths.length}ヶ月）
          </p>
          <p className="text-xs text-red-400/70">
            {inactiveMonths.slice(0, 12).join('、')}{inactiveMonths.length > 12 ? ` 他${inactiveMonths.length - 12}ヶ月` : ''}
          </p>
          {isKenpou && (
            <p className="text-xs text-red-400/50 mt-1">
              ※ 憲法審査会が開かれないこと自体が政治的判断です
            </p>
          )}
        </div>
      )}

      {/* 分析タブ */}
      <div className="flex gap-1.5 mb-4">
        {[
          { key: 'speakers', label: '👤 発言者', },
          { key: 'parties', label: '🏛️ 政党別' },
          { key: 'timeline', label: '📅 開催推移' },
          ...(isKenpou ? [{ key: 'keywords', label: '🔑 論点分析' }] : []),
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveAnalysis(tab.key)}
            className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
              activeAnalysis === tab.key
                ? 'bg-blue-600 border-blue-500 text-white'
                : 'bg-slate-800/50 border-slate-700/50 text-slate-400 hover:text-slate-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 分析コンテンツ */}
      <div className="bg-slate-800/20 rounded-xl border border-slate-700/30 p-4 mb-8">
        {/* 発言者ランキング */}
        {activeAnalysis === 'speakers' && (
          <div>
            <h3 className="text-sm font-bold text-slate-300 mb-3">発言回数ランキング（上位30名）</h3>
            <div className="space-y-1.5 max-h-[400px] overflow-y-auto">
              {speakerStats.slice(0, 30).map((s, i) => {
                const pct = (s.count / speakerStats[0].count) * 100
                return (
                  <div key={s.name} className="flex items-center gap-3">
                    <span className="text-xs text-slate-500 w-6 text-right">{i + 1}</span>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-0.5">
                        {s.legislator_id ? (
                          <a href={`/legislator/${s.legislator_id}`}
                            className="text-sm text-slate-200 hover:text-blue-400 transition-colors">{s.name}</a>
                        ) : (
                          <span className="text-sm text-slate-200">{s.name}</span>
                        )}
                        {s.party && (
                          <span className={`text-xs px-1.5 py-0.5 rounded party-${getPartyClass(s.party)} text-white/80`}>
                            {getPartyShortName(s.party)}
                          </span>
                        )}
                      </div>
                      <div className="h-1.5 bg-slate-700/50 rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-500/60 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                    <span className="text-xs text-emerald-400 font-bold w-10 text-right">{s.count}</span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* 政党別 */}
        {activeAnalysis === 'parties' && (
          <div>
            <h3 className="text-sm font-bold text-slate-300 mb-3">政党別発言数</h3>
            <div className="space-y-2">
              {partyStats.map(ps => {
                const pct = (ps.count / partyStats[0].count) * 100
                return (
                  <div key={ps.party} className="flex items-center gap-3">
                    <span className="text-sm text-slate-200 w-28 truncate">{ps.party}</span>
                    <div className="flex-1 h-6 bg-slate-700/30 rounded overflow-hidden">
                      <div className="h-full bg-blue-500/50 rounded flex items-center pl-2"
                        style={{ width: `${Math.max(pct, 5)}%` }}>
                        <span className="text-xs text-white font-bold">{ps.count}</span>
                      </div>
                    </div>
                    <span className="text-xs text-slate-500 w-12 text-right">
                      {Math.round((ps.count / speeches.length) * 100)}%
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* 開催推移 */}
        {activeAnalysis === 'timeline' && (
          <div>
            <h3 className="text-sm font-bold text-slate-300 mb-3">月別開催回数</h3>
            {monthlyMeetings.length > 0 ? (
              <div className="flex items-end gap-1 h-32 overflow-x-auto pb-6">
                {monthlyMeetings.map(m => (
                  <div key={m.month} className="flex flex-col items-center min-w-[28px]">
                    <div
                      className="w-5 bg-emerald-500/60 rounded-t hover:bg-emerald-400/70 transition-colors"
                      style={{ height: `${(m.count / maxMonthly) * 100}px` }}
                      title={`${m.month}: ${m.count}回`}
                    />
                    <span className="text-[9px] text-slate-600 mt-1 -rotate-45 origin-top-left whitespace-nowrap">
                      {m.month.substring(2)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500">開催データがありません</p>
            )}
          </div>
        )}

        {/* 論点分析（憲法審査会のみ） */}
        {activeAnalysis === 'keywords' && isKenpou && (
          <div>
            <h3 className="text-sm font-bold text-slate-300 mb-3">論点別の発言数</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              {keywordStats.map(kw => (
                <button
                  key={kw.key}
                  onClick={() => setSpeechFilter(speechFilter === kw.key ? 'all' : kw.key)}
                  className={`rounded-lg border p-3 text-center transition-colors ${
                    speechFilter === kw.key
                      ? 'bg-purple-600/30 border-purple-500/50'
                      : 'bg-slate-800/50 border-slate-700/30 hover:border-slate-600'
                  }`}
                >
                  <div className="text-xl font-bold text-purple-400">{kw.count}</div>
                  <div className="text-xs text-slate-400">{kw.label}</div>
                  <div className="text-[10px] text-slate-600 mt-1">{kw.keywords.join(' / ')}</div>
                </button>
              ))}
            </div>
            <p className="text-xs text-slate-600">
              ※ カードをクリックすると下の発言一覧がフィルターされます
            </p>
          </div>
        )}
      </div>

      {/* 発言一覧 */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold text-slate-100">
            💬 発言一覧
            {speechFilter !== 'all' && (
              <span className="text-sm text-purple-400 ml-2">
                — {speechTabs.find(k => k.key === speechFilter)?.label}
              </span>
            )}
          </h2>
          <span className="text-sm text-slate-500">{filteredSpeeches.length}件</span>
        </div>

        {/* 発言フィルタータブ */}
        <div className="flex flex-wrap gap-1.5 mb-4">
          {speechTabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setSpeechFilter(speechFilter === tab.key ? 'all' : tab.key)}
              className={`text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${
                speechFilter === tab.key
                  ? tab.key === 'pro_amendment' ? 'bg-red-600 border-red-500 text-white'
                  : tab.key === 'pro_protect' ? 'bg-blue-600 border-blue-500 text-white'
                  : 'bg-purple-600 border-purple-500 text-white'
                  : 'bg-slate-800/50 border-slate-700/50 text-slate-400 hover:text-slate-200'
              }`}
            >
              {tab.icon} {tab.label}
              {tab.key !== 'all' && (
                <span className="ml-1 opacity-60">
                  ({tab.partyGroup === 'goken'
                    ? speeches.filter((sp: any) => isGokenParty(sp)).length
                    : tab.partyGroup === 'kaiken'
                    ? speeches.filter((sp: any) => !isGokenParty(sp)).length
                    : speeches.filter((sp: any) => tab.keywords.some((k: string) => sp.content?.includes(k))).length})
                </span>
              )}
            </button>
          ))}
        </div>

        {filteredSpeeches.length > 0 ? (
          <div className="bg-slate-800/20 rounded-xl border border-slate-700/30 overflow-hidden">
            <div className="max-h-[500px] overflow-y-auto">
              {filteredSpeeches.slice(0, showSpeechCount).map((sp: any, i: number) => {
                const isExpanded = expandedSpeech === sp.id
                return (
                  <div key={sp.id} className={`${i > 0 ? 'border-t border-slate-700/20' : ''}`}>
                    <div className="px-4 py-3 flex items-center justify-between border-b border-slate-700/10">
                      <div className="flex items-center gap-3 text-xs">
                        <span className="text-slate-400">{sp.date || sp.meetings?.date}</span>
                        <span className="bg-slate-700 px-2 py-0.5 rounded text-slate-300">
                          {sp.meetings?.house}
                        </span>
                        {sp.legislators?.id ? (
                          <a href={`/legislator/${sp.legislators.id}`}
                            className="text-blue-400 hover:text-blue-300 transition-colors">
                            {sp.speaker_name}
                          </a>
                        ) : (
                          <span className="text-slate-300">{sp.speaker_name}</span>
                        )}
                        {sp.speaker_group && (
                          <span className="text-slate-500">({getPartyShortName(sp.speaker_group)})</span>
                        )}
                      </div>
                      <a href={sp.speech_url || '#'} target="_blank" rel="noopener noreferrer"
                        className="text-xs text-blue-400/60 hover:text-blue-400 transition-colors">原文 ↗</a>
                    </div>
                    <div className="px-4 py-3 cursor-pointer hover:bg-slate-700/20 transition-colors"
                      onClick={() => setExpandedSpeech(isExpanded ? null : sp.id)}>
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
            {showSpeechCount < filteredSpeeches.length && (
              <div className="text-center py-3 border-t border-slate-700/30">
                <button onClick={() => setShowSpeechCount(prev => prev + 20)}
                  className="text-xs text-blue-400 hover:text-blue-300 transition-colors">
                  もっと読み込む（残り{filteredSpeeches.length - showSpeechCount}件）
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-12 bg-slate-800/20 rounded-xl border border-slate-700/30">
            <div className="text-3xl mb-3">📭</div>
            <p className="text-slate-400">発言データがありません</p>
          </div>
        )}
      </div>
    </div>
  )
}
