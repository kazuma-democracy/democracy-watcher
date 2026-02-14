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

      {/* プロフィールカード */}
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

      {/* グラフセクション */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        {/* 月別発言数チャート */}
        {monthly.length > 0 && (
          <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
            <h3 className="text-sm font-bold text-slate-300 mb-4">📈 月別発言数</h3>
            {(() => {
              const maxM = Math.max(...monthly.map(x => x.count))
              const barMaxHeight = 120 // px
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

        {/* 委員会別発言数 */}
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

      {/* 議員比較リンク */}
      <div className="mb-8">
        <a
          href={`/compare?leg1=${id}`}
          className="text-sm text-blue-400/70 hover:text-blue-400 transition-colors"
        >
          ⚖️ この議員を他の議員と比較する →
        </a>
      </div>

      {/* 所属会派の賛否履歴 */}
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
              {/* カテゴリ別サマリー */}
              {(() => {
                const catMap: Record<string, { yea: number; nay: number }> = {}
                for (const pb of partyBills) {
                  const cat = pb.bill.category || 'その他'
                  if (!catMap[cat]) catMap[cat] = { yea: 0, nay: 0 }
                  if (pb.vote === '賛成') catMap[cat].yea++
                  else catMap[cat].nay++
                }
                const sorted = Object.entries(catMap).sort((a, b) => (b[1].yea + b[1].nay) - (a[1].yea + a[1].nay))
                return sorted.length > 0 ? (
                  <div className="bg-slate-800/30 rounded-xl border border-slate-700/30 p-4 mb-4">
                    <h3 className="text-xs font-bold text-slate-400 mb-3">政策分野別の賛否傾向</h3>
                    <div className="flex flex-wrap gap-2">
                      {sorted.map(([cat, counts]) => (
                        <div key={cat} className="bg-slate-800/50 rounded-lg px-3 py-1.5 border border-slate-700/40">
                          <span className="text-xs text-slate-300">{cat}</span>
                          <span className="text-xs text-emerald-400 ml-2">⭕{counts.yea}</span>
                          {counts.nay > 0 && <span className="text-xs text-red-400 ml-1">❌{counts.nay}</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null
              })()}

              {/* 賛否リスト */}
              <div className="space-y-2">
                {partyBills.map(pb => (
                  <a
                    key={pb.bill.id}
                    href={`/bills/${pb.bill.id}`}
                    className="flex items-start gap-3 bg-slate-800/40 border border-slate-700/40 rounded-xl p-3 hover:border-slate-600 transition-all"
                  >
                    <span className={`text-xs font-bold shrink-0 mt-0.5 ${
                      pb.vote === '賛成' ? 'text-emerald-400' : 'text-red-400'
                    }`}>
                      {pb.vote === '賛成' ? '⭕ 賛成' : '❌ 反対'}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-0.5">
                        {pb.bill.category && (
                          <span className="text-xs px-1.5 py-0.5 rounded-full bg-indigo-900/40 text-indigo-300 border border-indigo-700/40">
                            {pb.bill.category}
                          </span>
                        )}
                        <span className="text-xs text-slate-500">
                          第{pb.bill.session}回
                        </span>
                      </div>
                      <p className="text-sm text-slate-300 leading-relaxed">
                        {pb.bill.bill_name}
                      </p>
                    </div>
                  </a>
                ))}
              </div>

              {partyBills.length >= 50 && (
                <p className="text-xs text-slate-500 text-center mt-3">
                  ※ 最新50件のみ表示
                </p>
              )}
            </>
          )}
        </div>
      )}

      {/* 発言一覧 */}
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-bold text-slate-100">
          💬 国会発言
        </h2>
        <span className="text-sm text-slate-500">{speechCount}件（新しい順）</span>
      </div>

      <div className="space-y-3">
        {speeches.slice(0, showCount).map((sp) => {
          const isExpanded = expandedSpeech === sp.id
          return (
            <div
              key={sp.id}
              className="bg-slate-800/50 border border-slate-700/50 rounded-xl overflow-hidden"
            >
              {/* ヘッダー */}
              <div className="px-4 py-3 flex items-center justify-between border-b border-slate-700/30">
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
                  title="国会会議録で見る"
                >
                  原文 ↗
                </a>
              </div>

              {/* 発言内容 */}
              <div
                className="px-4 py-3 cursor-pointer"
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

      {/* もっと見る */}
      {showCount < speeches.length && (
        <div className="text-center mt-6">
          <button
            onClick={() => setShowCount((prev) => prev + 20)}
            className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-6 py-2 rounded-xl text-sm border border-slate-600 transition-colors"
          >
            もっと見る
          </button>
        </div>
      )}

      {speeches.length === 0 && (
        <div className="text-center py-12">
          <div className="text-3xl mb-3">📭</div>
          <p className="text-slate-400">発言データがまだありません</p>
          <p className="text-slate-500 text-sm mt-1">データ収集中です。しばらくお待ちください。</p>
        </div>
      )}
    </div>
  )
}
