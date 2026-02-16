'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { supabase, getPartyShortName, getPartyClass } from '@/lib/supabase'

const VERDICTS: Record<string, { label: string; icon: string; color: string; bg: string }> = {
  accurate:        { label: '正確',     icon: '✅', color: 'text-emerald-400', bg: 'bg-emerald-900/30 border-emerald-700/50' },
  mostly_accurate: { label: '一部正確', icon: '🟡', color: 'text-yellow-400',  bg: 'bg-yellow-900/30 border-yellow-700/50' },
  unclear:         { label: '根拠不明', icon: '❓', color: 'text-slate-400',   bg: 'bg-slate-800/50 border-slate-600/50' },
  inaccurate:      { label: '不正確',   icon: '⚠️', color: 'text-orange-400',  bg: 'bg-orange-900/30 border-orange-700/50' },
  false:           { label: '誤り',     icon: '❌', color: 'text-red-400',     bg: 'bg-red-900/30 border-red-700/50' },
}

const EVIDENCE_TYPES: Record<string, { label: string; icon: string }> = {
  claim:        { label: '主張の出典', icon: '💬' },
  kokkai:       { label: '国会答弁',   icon: '🏛️' },
  official_doc: { label: '公文書',     icon: '📄' },
  media:        { label: '報道',       icon: '📰' },
  website:      { label: '公式サイト', icon: '🌐' },
  other:        { label: 'その他',     icon: '📎' },
}

const GRADES: Record<string, { label: string; desc: string; color: string }> = {
  A: { label: 'A', desc: '一次資料で直接確認', color: 'text-emerald-400' },
  B: { label: 'B', desc: '複数の信頼できる二次資料', color: 'text-yellow-400' },
  C: { label: 'C', desc: '状況証拠', color: 'text-orange-400' },
}

type FactCheck = {
  id: string
  legislator_id: string
  title: string
  category: string
  topic: string | null
  stance: string | null
  claim: string
  claim_date: string | null
  claim_source_url: string | null
  claim_speech_id: string | null
  verdict: string | null
  evidence_grade: string | null
  analysis: string | null
  context_notes: string | null
  possible_counterpoints: string | null
  published_at: string | null
  updated_at: string
  legislators?: { id: string; name: string; current_party: string | null; house: string | null }
}

type Evidence = {
  id: string
  type: string
  title: string | null
  url: string | null
  speech_id: string | null
  quote: string | null
  supports_claim: boolean | null
  sort_order: number
}

type Update = {
  id: string
  change_description: string
  created_at: string
}

export default function FactCheckDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [fc, setFc] = useState<FactCheck | null>(null)
  const [evidence, setEvidence] = useState<Evidence[]>([])
  const [updates, setUpdates] = useState<Update[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const [{ data: fcData }, { data: evData }, { data: upData }] = await Promise.all([
        supabase
          .from('fact_checks')
          .select('*, legislators(id, name, current_party, house)')
          .eq('id', id)
          .single(),
        supabase
          .from('fact_check_evidence')
          .select('*')
          .eq('fact_check_id', id)
          .order('sort_order', { ascending: true }),
        supabase
          .from('fact_check_updates')
          .select('*')
          .eq('fact_check_id', id)
          .order('created_at', { ascending: false }),
      ])

      setFc(fcData as FactCheck | null)
      setEvidence((evData || []) as Evidence[])
      setUpdates((upData || []) as Update[])
      setLoading(false)
    }
    load()
  }, [id])

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center">
        <div className="animate-pulse text-slate-500">読み込み中...</div>
      </div>
    )
  }

  if (!fc) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center">
        <p className="text-slate-500">検証カードが見つかりません</p>
        <a href="/fact-check" className="text-sm text-blue-400 hover:text-blue-300 mt-4 inline-block">← 検証一覧に戻る</a>
      </div>
    )
  }

  const v = fc.verdict ? VERDICTS[fc.verdict] : null
  const grade = fc.evidence_grade ? GRADES[fc.evidence_grade] : null
  const leg = fc.legislators

  // 証拠を分類
  const supportEvidence = evidence.filter(e => e.supports_claim === true)
  const refuteEvidence = evidence.filter(e => e.supports_claim === false)
  const contextEvidence = evidence.filter(e => e.supports_claim === null)

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <a href="/fact-check" className="text-sm text-slate-400 hover:text-blue-400 transition-colors mb-6 inline-block">
        ← 検証一覧に戻る
      </a>

      {/* 判定ヘッダー */}
      {v && (
        <div className={`rounded-xl border p-5 mb-6 ${v.bg}`}>
          <div className="flex items-center gap-3">
            <span className="text-3xl">{v.icon}</span>
            <div>
              <div className={`text-xl font-bold ${v.color}`}>判定：{v.label}</div>
              {grade && (
                <div className="text-sm text-slate-400 mt-0.5">
                  証拠等級: <span className={`font-bold ${grade.color}`}>{grade.label}</span>
                  <span className="text-slate-600 ml-1">({grade.desc})</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 検証タイトル + 議員情報 */}
      <div className="bg-slate-800/50 rounded-2xl border border-slate-700/50 p-6 mb-6">
        <h1 className="text-xl font-bold text-slate-100 mb-3 leading-relaxed">
          {fc.title}
        </h1>

        <div className="flex items-center gap-3 flex-wrap mb-4">
          {leg && (
            <a href={`/legislator/${leg.id}`} className="flex items-center gap-1.5 hover:opacity-80 transition-opacity">
              <span className="text-sm font-medium text-slate-200">{leg.name}</span>
              {leg.current_party && (
                <span className={`text-xs px-1.5 py-0.5 rounded party-${getPartyClass(leg.current_party)}`}>
                  {getPartyShortName(leg.current_party)}
                </span>
              )}
            </a>
          )}
          {fc.claim_date && (
            <span className="text-xs text-slate-500">発言日: {fc.claim_date}</span>
          )}
          {fc.published_at && (
            <span className="text-xs text-slate-600">
              検証公開: {new Date(fc.published_at).toLocaleDateString('ja-JP')}
            </span>
          )}
        </div>

        {/* 主張 */}
        <div className="bg-slate-700/30 rounded-lg p-4 border-l-4 border-sky-500/50">
          <div className="text-xs text-sky-400 font-bold mb-1.5">検証対象の主張</div>
          <p className="text-sm text-slate-200 leading-relaxed whitespace-pre-wrap">
            「{fc.claim}」
          </p>
          {fc.claim_source_url && (
            <a
              href={fc.claim_source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-400 hover:text-blue-300 mt-2 inline-block"
            >
              出典を確認 ↗
            </a>
          )}
        </div>
      </div>

      {/* 検証内容 */}
      {fc.analysis && (
        <div className="bg-slate-800/30 rounded-xl border border-slate-700/30 p-6 mb-6">
          <h2 className="text-sm font-bold text-slate-300 mb-3">📝 検証内容</h2>
          <div className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">
            {fc.analysis}
          </div>
        </div>
      )}

      {/* 補足・反論可能性 */}
      {(fc.context_notes || fc.possible_counterpoints) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          {fc.context_notes && (
            <div className="bg-slate-800/30 rounded-xl border border-slate-700/30 p-4">
              <h3 className="text-xs font-bold text-slate-400 mb-2">📋 背景・補足</h3>
              <p className="text-xs text-slate-400 leading-relaxed whitespace-pre-wrap">{fc.context_notes}</p>
            </div>
          )}
          {fc.possible_counterpoints && (
            <div className="bg-amber-900/10 rounded-xl border border-amber-700/20 p-4">
              <h3 className="text-xs font-bold text-amber-400/80 mb-2">⚖️ 反論可能性</h3>
              <p className="text-xs text-slate-400 leading-relaxed whitespace-pre-wrap">{fc.possible_counterpoints}</p>
            </div>
          )}
        </div>
      )}

      {/* 証拠一覧 */}
      {evidence.length > 0 && (
        <div className="bg-slate-800/30 rounded-xl border border-slate-700/30 p-6 mb-6">
          <h2 className="text-sm font-bold text-slate-300 mb-4">📎 証拠・出典</h2>

          {/* 主張を支持する証拠 */}
          {supportEvidence.length > 0 && (
            <div className="mb-4">
              <div className="text-xs font-bold text-emerald-400/80 mb-2">主張を支持</div>
              <div className="space-y-2">
                {supportEvidence.map(e => <EvidenceCard key={e.id} evidence={e} />)}
              </div>
            </div>
          )}

          {/* 反証 */}
          {refuteEvidence.length > 0 && (
            <div className="mb-4">
              <div className="text-xs font-bold text-red-400/80 mb-2">反証・矛盾</div>
              <div className="space-y-2">
                {refuteEvidence.map(e => <EvidenceCard key={e.id} evidence={e} />)}
              </div>
            </div>
          )}

          {/* 関連資料 */}
          {contextEvidence.length > 0 && (
            <div>
              <div className="text-xs font-bold text-slate-500 mb-2">関連資料</div>
              <div className="space-y-2">
                {contextEvidence.map(e => <EvidenceCard key={e.id} evidence={e} />)}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 更新履歴 */}
      {updates.length > 0 && (
        <div className="bg-slate-800/20 rounded-xl border border-slate-700/20 p-5 mb-6">
          <h2 className="text-xs font-bold text-slate-500 mb-3">📜 更新履歴（訂正ポリシー）</h2>
          <div className="space-y-2">
            {updates.map(u => (
              <div key={u.id} className="flex gap-3 text-xs">
                <span className="text-slate-600 shrink-0">
                  {new Date(u.created_at).toLocaleDateString('ja-JP')}
                </span>
                <span className="text-slate-400">{u.change_description}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* フッター */}
      <div className="p-4 bg-slate-800/20 rounded-xl border border-slate-700/20">
        <p className="text-xs text-slate-600 leading-relaxed">
          ※ この検証に誤りがある場合、一次資料をお持ちの方はご連絡ください。
          新しい証拠に基づき、判定を修正いたします。すべての修正は更新履歴に記録されます。
        </p>
      </div>
    </div>
  )
}

function EvidenceCard({ evidence }: { evidence: Evidence }) {
  const etype = EVIDENCE_TYPES[evidence.type] || EVIDENCE_TYPES.other
  return (
    <div className="bg-slate-700/20 rounded-lg p-3 border border-slate-700/30">
      <div className="flex items-start gap-2">
        <span className="text-sm shrink-0">{etype.icon}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs text-slate-500">{etype.label}</span>
            {evidence.title && (
              <span className="text-xs text-slate-300 font-medium">{evidence.title}</span>
            )}
          </div>
          {evidence.quote && (
            <p className="text-xs text-slate-400 italic mb-1.5 leading-relaxed">
              「{evidence.quote}」
            </p>
          )}
          {evidence.url && (
            <a
              href={evidence.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-400 hover:text-blue-300"
            >
              出典を確認 ↗
            </a>
          )}
          {evidence.speech_id && (
            <span className="text-[10px] text-slate-600 ml-2">
              会議録ID: {evidence.speech_id}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
