'use client'

import { useEffect, useState } from 'react'
import { supabase, getPartyShortName, getPartyClass } from '@/lib/supabase'

const VERDICTS: Record<string, { label: string; icon: string; color: string; badge: string }> = {
  accurate:        { label: '正確',     icon: '✅', color: 'text-emerald-400', badge: 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400' },
  mostly_accurate: { label: '一部正確', icon: '🟡', color: 'text-yellow-400',  badge: 'bg-yellow-500/20 border-yellow-500/40 text-yellow-400' },
  unclear:         { label: '根拠不明', icon: '❓', color: 'text-slate-400',   badge: 'bg-slate-500/20 border-slate-500/40 text-slate-400' },
  inaccurate:      { label: '不正確',   icon: '⚠️', color: 'text-orange-400',  badge: 'bg-orange-500/20 border-orange-500/40 text-orange-400' },
  false:           { label: '誤り',     icon: '❌', color: 'text-red-400',     badge: 'bg-red-500/20 border-red-500/40 text-red-400' },
}

const CATEGORIES: Record<string, { label: string; icon: string }> = {
  diet_speech:    { label: '国会答弁', icon: '🏛️' },
  policy:        { label: '政策公約', icon: '📋' },
  career:        { label: '経歴',     icon: '📄' },
  organization:  { label: '団体関係', icon: '🤝' },
  press:         { label: '記者会見', icon: '🎤' },
  other:         { label: 'その他',   icon: '📌' },
}

const GRADES: Record<string, { label: string; desc: string }> = {
  A: { label: 'A', desc: '一次資料で直接確認' },
  B: { label: 'B', desc: '複数の信頼できる二次資料' },
  C: { label: 'C', desc: '状況証拠' },
}

type FactCheck = {
  id: string
  legislator_id: string
  title: string
  category: string
  topic: string | null
  claim: string
  claim_date: string | null
  verdict: string | null
  evidence_grade: string | null
  analysis: string | null
  published_at: string | null
  legislators?: { id: string; name: string; current_party: string | null; house: string | null }
}

export default function FactCheckPage() {
  const [checks, setChecks] = useState<FactCheck[]>([])
  const [loading, setLoading] = useState(true)
  const [verdictFilter, setVerdictFilter] = useState('all')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    async function load() {
      const { data, error } = await supabase
        .from('fact_checks')
        .select('*, legislators(id, name, current_party, house)')
        .eq('is_published', true)
        .order('published_at', { ascending: false })

      if (error) console.error('fact_checks error:', error)
      setChecks((data || []) as FactCheck[])
      setLoading(false)
    }
    load()
  }, [])

  const filtered = checks.filter(fc => {
    if (verdictFilter !== 'all' && fc.verdict !== verdictFilter) return false
    if (categoryFilter !== 'all' && fc.category !== categoryFilter) return false
    if (searchQuery.length >= 2) {
      const q = searchQuery.toLowerCase()
      const match = fc.title.toLowerCase().includes(q)
        || fc.claim.toLowerCase().includes(q)
        || fc.legislators?.name?.toLowerCase().includes(q)
      if (!match) return false
    }
    return true
  })

  // 統計
  const verdictCounts: Record<string, number> = {}
  checks.forEach(fc => { if (fc.verdict) verdictCounts[fc.verdict] = (verdictCounts[fc.verdict] || 0) + 1 })

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      {/* ヘッダー */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-100 mb-2">🔍 発言検証（ファクトチェック）</h1>
        <p className="text-sm text-slate-400">
          国会議員の発言・主張を一次資料に基づいて検証します。
          判定基準は国際ファクトチェックネットワーク（IFCN）の原則に準拠しています。
        </p>
      </div>

      {/* 判定基準の説明 */}
      <div className="bg-slate-800/30 rounded-xl border border-slate-700/30 p-4 mb-6">
        <h2 className="text-xs font-bold text-slate-400 mb-3">判定基準</h2>
        <div className="flex flex-wrap gap-3">
          {Object.entries(VERDICTS).map(([key, v]) => (
            <div key={key} className="flex items-center gap-1.5">
              <span className="text-sm">{v.icon}</span>
              <span className={`text-xs font-medium ${v.color}`}>{v.label}</span>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-3 mt-2 pt-2 border-t border-slate-700/30">
          <span className="text-xs text-slate-500">証拠等級:</span>
          {Object.entries(GRADES).map(([key, g]) => (
            <span key={key} className="text-xs text-slate-500">
              <span className="font-bold text-slate-400">{g.label}</span> = {g.desc}
            </span>
          ))}
        </div>
      </div>

      {/* 統計カード */}
      {checks.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-6">
          <div className="bg-slate-800/40 rounded-lg p-3 text-center border border-slate-700/30">
            <div className="text-lg font-bold text-slate-200">{checks.length}</div>
            <div className="text-xs text-slate-500">検証済み</div>
          </div>
          {Object.entries(VERDICTS).map(([key, v]) => (
            <div key={key} className="bg-slate-800/40 rounded-lg p-3 text-center border border-slate-700/30">
              <div className={`text-lg font-bold ${v.color}`}>{verdictCounts[key] || 0}</div>
              <div className="text-xs text-slate-500">{v.icon} {v.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* フィルター */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <input
          type="text"
          placeholder="議員名・キーワードで検索..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-500 flex-1 min-w-[200px]"
        />
        <select
          value={verdictFilter}
          onChange={e => setVerdictFilter(e.target.value)}
          className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-300"
        >
          <option value="all">判定：すべて</option>
          {Object.entries(VERDICTS).map(([key, v]) => (
            <option key={key} value={key}>{v.icon} {v.label}</option>
          ))}
        </select>
        <select
          value={categoryFilter}
          onChange={e => setCategoryFilter(e.target.value)}
          className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-300"
        >
          <option value="all">分類：すべて</option>
          {Object.entries(CATEGORIES).map(([key, c]) => (
            <option key={key} value={key}>{c.icon} {c.label}</option>
          ))}
        </select>
      </div>

      {/* 検証カード一覧 */}
      {loading ? (
        <div className="text-center py-12">
          <div className="animate-pulse text-slate-500 text-sm">読み込み中...</div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 bg-slate-800/20 rounded-xl border border-slate-700/30">
          <div className="text-3xl mb-3">🔍</div>
          <p className="text-slate-500 text-sm">
            {checks.length === 0
              ? '検証カードはまだ公開されていません'
              : '条件に一致する検証カードがありません'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map(fc => {
            const v = fc.verdict ? VERDICTS[fc.verdict] : null
            const cat = CATEGORIES[fc.category] || CATEGORIES.other
            const grade = fc.evidence_grade ? GRADES[fc.evidence_grade] : null
            const leg = fc.legislators

            return (
              <a
                key={fc.id}
                href={`/fact-check/${fc.id}`}
                className="block bg-slate-800/40 border border-slate-700/30 rounded-xl p-5 hover:border-slate-600 hover:bg-slate-800/60 transition-all"
              >
                <div className="flex items-start gap-3">
                  {/* 判定バッジ */}
                  <div className="shrink-0 mt-0.5">
                    {v ? (
                      <span className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border font-bold ${v.badge}`}>
                        {v.icon} {v.label}
                      </span>
                    ) : (
                      <span className="text-xs px-2.5 py-1 rounded-full bg-slate-700/50 text-slate-500 border border-slate-600/50">
                        検証中
                      </span>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    {/* タイトル */}
                    <h3 className="text-base font-bold text-slate-200 mb-1.5 leading-relaxed">
                      {fc.title}
                    </h3>

                    {/* 主張の要約 */}
                    <p className="text-sm text-slate-400 line-clamp-2 mb-3 leading-relaxed">
                      「{fc.claim}」
                    </p>

                    {/* メタ情報 */}
                    <div className="flex items-center gap-3 flex-wrap">
                      {leg && (
                        <span className="flex items-center gap-1.5">
                          <span className="text-xs text-slate-300">{leg.name}</span>
                          {leg.current_party && (
                            <span className={`text-[10px] px-1 py-0.5 rounded party-${getPartyClass(leg.current_party)}`}>
                              {getPartyShortName(leg.current_party)}
                            </span>
                          )}
                        </span>
                      )}
                      <span className="text-xs text-slate-600">{cat.icon} {cat.label}</span>
                      {grade && (
                        <span className="text-xs text-slate-600" title={grade.desc}>
                          証拠等級: <span className="font-bold text-slate-400">{grade.label}</span>
                        </span>
                      )}
                      {fc.claim_date && (
                        <span className="text-xs text-slate-600">
                          発言日: {fc.claim_date}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </a>
            )
          })}
        </div>
      )}

      {/* フッター注記 */}
      <div className="mt-8 p-4 bg-slate-800/20 rounded-xl border border-slate-700/20">
        <p className="text-xs text-slate-600 leading-relaxed">
          ※ 本ページは政治家の発言・主張の正確性を一次資料に基づいて検証するものであり、
          特定の政党や個人を攻撃する目的ではありません。
          検証に誤りがある場合は反証とともにご連絡ください。判定を修正いたします。
        </p>
      </div>
    </div>
  )
}
