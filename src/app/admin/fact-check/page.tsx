'use client'

import { useState, useEffect, useCallback } from 'react'

const CATEGORIES = [
  { key: 'diet_speech', label: '🏛️ 国会答弁' },
  { key: 'policy', label: '📋 政策公約' },
  { key: 'career', label: '📄 経歴' },
  { key: 'organization', label: '🤝 団体関係' },
  { key: 'press', label: '🎤 記者会見' },
  { key: 'other', label: '📌 その他' },
]

const VERDICTS = [
  { key: 'accurate', label: '✅ 正確', color: 'text-emerald-400' },
  { key: 'mostly_accurate', label: '🟡 一部正確', color: 'text-yellow-400' },
  { key: 'unclear', label: '❓ 根拠不明', color: 'text-slate-400' },
  { key: 'inaccurate', label: '⚠️ 不正確', color: 'text-orange-400' },
  { key: 'false', label: '❌ 誤り', color: 'text-red-400' },
]

const GRADES = [
  { key: 'A', label: 'A — 一次資料で直接確認' },
  { key: 'B', label: 'B — 複数の信頼できる二次資料' },
  { key: 'C', label: 'C — 状況証拠' },
]

const EVIDENCE_TYPES = [
  { key: 'claim', label: '💬 主張の出典' },
  { key: 'kokkai', label: '🏛️ 国会答弁' },
  { key: 'official_doc', label: '📄 公文書' },
  { key: 'media', label: '📰 報道' },
  { key: 'website', label: '🌐 公式サイト' },
  { key: 'other', label: '📎 その他' },
]

type Evidence = {
  type: string
  title: string
  url: string
  speech_id: string
  quote: string
  supports_claim: boolean | null
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
  status: string
  is_published: boolean
  created_at: string
  legislators?: { id: string; name: string; current_party: string | null }
  evidence: any[]
}

const emptyEvidence = (): Evidence => ({
  type: 'media', title: '', url: '', speech_id: '', quote: '', supports_claim: null,
})

export default function AdminFactCheckPage() {
  // Auth
  const [password, setPassword] = useState('')
  const [authed, setAuthed] = useState(false)

  // List
  const [checks, setChecks] = useState<FactCheck[]>([])
  const [loading, setLoading] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  // Tab
  const [tab, setTab] = useState<'list' | 'form'>('list')
  const [editingId, setEditingId] = useState<string | null>(null)

  // Form
  const [legQuery, setLegQuery] = useState('')
  const [legResults, setLegResults] = useState<any[]>([])
  const [selectedLeg, setSelectedLeg] = useState<{ id: string; name: string; party: string | null } | null>(null)
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('diet_speech')
  const [topic, setTopic] = useState('')
  const [stance, setStance] = useState('')
  const [claim, setClaim] = useState('')
  const [claimDate, setClaimDate] = useState('')
  const [claimSourceUrl, setClaimSourceUrl] = useState('')
  const [claimSpeechId, setClaimSpeechId] = useState('')
  const [verdict, setVerdict] = useState('')
  const [evidenceGrade, setEvidenceGrade] = useState('')
  const [analysis, setAnalysis] = useState('')
  const [contextNotes, setContextNotes] = useState('')
  const [counterpoints, setCounterpoints] = useState('')
  const [evidenceList, setEvidenceList] = useState<Evidence[]>([emptyEvidence()])

  const [submitting, setSubmitting] = useState(false)
  const [submitResult, setSubmitResult] = useState<string | null>(null)

  // ============================================================
  function adminFetch(body: any) {
    return fetch('/api/admin/fact-check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-password': password },
      body: JSON.stringify(body),
    })
  }

  async function handleLogin() {
    if (!password) return
    try {
      const res = await adminFetch({ action: 'verify_auth' })
      const data = await res.json()
      if (res.ok && data.ok) setAuthed(true)
    } catch {}
  }

  const loadChecks = useCallback(async () => {
    setLoading(true)
    try {
      const res = await adminFetch({ action: 'list' })
      const data = await res.json()
      if (data.checks) setChecks(data.checks)
    } catch {}
    setLoading(false)
  }, [password])

  useEffect(() => {
    if (authed) loadChecks()
  }, [authed, loadChecks])

  // ============================================================
  // 議員検索
  // ============================================================
  async function searchLeg() {
    if (legQuery.length < 1) return
    try {
      const res = await adminFetch({ action: 'search_legislators', query: legQuery })
      const data = await res.json()
      setLegResults(data.legislators || [])
    } catch {}
  }

  // ============================================================
  // フォームリセット
  // ============================================================
  function resetForm() {
    setEditingId(null)
    setSelectedLeg(null)
    setLegQuery('')
    setTitle('')
    setCategory('diet_speech')
    setTopic('')
    setStance('')
    setClaim('')
    setClaimDate('')
    setClaimSourceUrl('')
    setClaimSpeechId('')
    setVerdict('')
    setEvidenceGrade('')
    setAnalysis('')
    setContextNotes('')
    setCounterpoints('')
    setEvidenceList([emptyEvidence()])
    setSubmitResult(null)
  }

  // ============================================================
  // 編集モードに切り替え
  // ============================================================
  function startEdit(fc: FactCheck) {
    setEditingId(fc.id)
    setSelectedLeg(fc.legislators ? { id: fc.legislators.id, name: fc.legislators.name, party: fc.legislators.current_party } : null)
    setTitle(fc.title)
    setCategory(fc.category)
    setTopic(fc.topic || '')
    setStance(fc.stance || '')
    setClaim(fc.claim)
    setClaimDate(fc.claim_date || '')
    setClaimSourceUrl(fc.claim_source_url || '')
    setClaimSpeechId(fc.claim_speech_id || '')
    setVerdict(fc.verdict || '')
    setEvidenceGrade(fc.evidence_grade || '')
    setAnalysis(fc.analysis || '')
    setContextNotes(fc.context_notes || '')
    setCounterpoints(fc.possible_counterpoints || '')
    setEvidenceList(
      fc.evidence.length > 0
        ? fc.evidence.map((e: any) => ({
            type: e.type, title: e.title || '', url: e.url || '',
            speech_id: e.speech_id || '', quote: e.quote || '',
            supports_claim: e.supports_claim,
          }))
        : [emptyEvidence()]
    )
    setTab('form')
  }

  // ============================================================
  // 保存
  // ============================================================
  async function handleSubmit() {
    if (!selectedLeg) { setSubmitResult('❌ 議員を選択してください'); return }
    if (!title || !claim) { setSubmitResult('❌ タイトルと主張は必須です'); return }

    setSubmitting(true)
    setSubmitResult(null)

    const payload: any = {
      legislator_id: selectedLeg.id,
      title, category, topic: topic || null, stance: stance || null,
      claim, claim_date: claimDate || null,
      claim_source_url: claimSourceUrl || null,
      claim_speech_id: claimSpeechId || null,
      verdict: verdict || null, evidence_grade: evidenceGrade || null,
      analysis: analysis || null, context_notes: contextNotes || null,
      possible_counterpoints: counterpoints || null,
      evidence: evidenceList.filter(e => e.title || e.url || e.quote),
    }

    try {
      let res
      if (editingId) {
        res = await adminFetch({ action: 'update', id: editingId, ...payload })
      } else {
        res = await adminFetch({ action: 'create', ...payload })
      }
      const data = await res.json()
      if (data.ok) {
        setSubmitResult(editingId ? '✅ 更新しました' : '✅ 作成しました')
        loadChecks()
        if (!editingId) resetForm()
      } else {
        setSubmitResult(`❌ ${data.error}`)
      }
    } catch (e: any) {
      setSubmitResult(`❌ ${e.message}`)
    }
    setSubmitting(false)
  }

  // ============================================================
  // 公開切り替え
  // ============================================================
  async function togglePublish(id: string, current: boolean) {
    await adminFetch({ action: 'toggle_publish', fact_check_id: id, is_published: !current })
    loadChecks()
  }

  // ============================================================
  // 削除
  // ============================================================
  async function handleDelete(id: string) {
    await adminFetch({ action: 'delete', fact_check_id: id })
    setDeleteConfirm(null)
    loadChecks()
  }

  // ============================================================
  // 証拠の追加・削除・更新
  // ============================================================
  function updateEvidence(idx: number, field: keyof Evidence, value: any) {
    setEvidenceList(prev => prev.map((e, i) => i === idx ? { ...e, [field]: value } : e))
  }
  function addEvidence() {
    setEvidenceList(prev => [...prev, emptyEvidence()])
  }
  function removeEvidence(idx: number) {
    setEvidenceList(prev => prev.filter((_, i) => i !== idx))
  }

  // ============================================================
  // Auth画面
  // ============================================================
  if (!authed) {
    return (
      <div className="max-w-md mx-auto px-4 py-16">
        <h1 className="text-xl font-bold text-slate-200 mb-6">🔍 発言検証 管理画面</h1>
        <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-6">
          <input
            type="password"
            placeholder="管理パスワード"
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleLogin()}
            className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-sm text-slate-200 mb-3"
          />
          <button onClick={handleLogin} className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded px-4 py-2 text-sm">
            ログイン
          </button>
        </div>
      </div>
    )
  }

  // ============================================================
  // メイン画面
  // ============================================================
  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-slate-200">🔍 発言検証 管理画面</h1>
        <div className="flex gap-2">
          <button
            onClick={() => { resetForm(); setTab('list') }}
            className={`px-3 py-1.5 text-xs rounded ${tab === 'list' ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-400'}`}
          >
            一覧 ({checks.length})
          </button>
          <button
            onClick={() => { resetForm(); setTab('form') }}
            className={`px-3 py-1.5 text-xs rounded ${tab === 'form' ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-400'}`}
          >
            + 新規作成
          </button>
        </div>
      </div>

      {/* ============================================================ */}
      {/* 一覧タブ */}
      {/* ============================================================ */}
      {tab === 'list' && (
        <div>
          {loading ? (
            <div className="text-center py-8 text-slate-500 text-sm">読み込み中...</div>
          ) : checks.length === 0 ? (
            <div className="text-center py-12 bg-slate-800/30 rounded-xl border border-slate-700/30">
              <p className="text-slate-500 text-sm">検証カードがまだありません</p>
            </div>
          ) : (
            <div className="space-y-3">
              {checks.map(fc => {
                const vLabel = VERDICTS.find(v => v.key === fc.verdict)
                return (
                  <div key={fc.id} className="bg-slate-800/40 border border-slate-700/30 rounded-xl p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          {/* ステータスバッジ */}
                          {fc.is_published ? (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">公開中</span>
                          ) : (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-600/30 text-slate-500 border border-slate-600/50">下書き</span>
                          )}
                          {vLabel && <span className={`text-xs ${vLabel.color}`}>{vLabel.label}</span>}
                          {fc.evidence_grade && <span className="text-[10px] text-slate-500">等級{fc.evidence_grade}</span>}
                        </div>
                        <h3 className="text-sm font-bold text-slate-200">{fc.title}</h3>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {fc.legislators?.name} — {CATEGORIES.find(c => c.key === fc.category)?.label}
                          {fc.evidence.length > 0 && ` — 証拠${fc.evidence.length}件`}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={() => startEdit(fc)}
                          className="px-2 py-1 text-[10px] bg-slate-700 hover:bg-slate-600 text-slate-300 rounded"
                        >
                          編集
                        </button>
                        <button
                          onClick={() => togglePublish(fc.id, fc.is_published)}
                          className={`px-2 py-1 text-[10px] rounded ${
                            fc.is_published
                              ? 'bg-orange-600/30 hover:bg-orange-600/50 text-orange-400'
                              : 'bg-emerald-600/30 hover:bg-emerald-600/50 text-emerald-400'
                          }`}
                        >
                          {fc.is_published ? '非公開に' : '公開する'}
                        </button>
                        {deleteConfirm === fc.id ? (
                          <div className="flex gap-1">
                            <button onClick={() => handleDelete(fc.id)} className="px-2 py-1 text-[10px] bg-red-600 text-white rounded">確定</button>
                            <button onClick={() => setDeleteConfirm(null)} className="px-2 py-1 text-[10px] bg-slate-600 text-slate-300 rounded">戻す</button>
                          </div>
                        ) : (
                          <button onClick={() => setDeleteConfirm(fc.id)} className="px-2 py-1 text-[10px] bg-red-900/30 hover:bg-red-900/50 text-red-400 rounded">
                            削除
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ============================================================ */}
      {/* フォームタブ */}
      {/* ============================================================ */}
      {tab === 'form' && (
        <div className="space-y-6">
          {editingId && (
            <div className="bg-blue-900/20 border border-blue-700/30 rounded-lg p-3 text-xs text-blue-400">
              編集中: {title || '（無題）'}
            </div>
          )}

          {/* 議員選択 */}
          <Section title="👤 対象議員">
            {selectedLeg ? (
              <div className="flex items-center gap-2">
                <span className="text-sm text-slate-200">{selectedLeg.name}</span>
                <span className="text-xs text-slate-500">{selectedLeg.party}</span>
                <button onClick={() => setSelectedLeg(null)} className="text-xs text-red-400 hover:text-red-300">変更</button>
              </div>
            ) : (
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="議員名を入力..."
                  value={legQuery}
                  onChange={e => setLegQuery(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && searchLeg()}
                  className="flex-1 bg-slate-700 border border-slate-600 rounded px-3 py-2 text-sm text-slate-200"
                />
                <button onClick={searchLeg} className="px-3 py-2 bg-slate-600 hover:bg-slate-500 text-xs text-slate-200 rounded">検索</button>
              </div>
            )}
            {legResults.length > 0 && !selectedLeg && (
              <div className="mt-2 space-y-1">
                {legResults.map((l: any) => (
                  <button
                    key={l.id}
                    onClick={() => { setSelectedLeg({ id: l.id, name: l.name, party: l.current_party }); setLegResults([]) }}
                    className="block w-full text-left px-3 py-1.5 bg-slate-700/50 hover:bg-slate-700 rounded text-sm text-slate-300"
                  >
                    {l.name} <span className="text-xs text-slate-500">{l.current_party} / {l.house}</span>
                  </button>
                ))}
              </div>
            )}
          </Section>

          {/* 基本情報 */}
          <Section title="📝 基本情報">
            <Field label="タイトル" required>
              <input value={title} onChange={e => setTitle(e.target.value)} className="input-field" placeholder="例: 放送法解釈変更に関する国会答弁" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="分類">
                <select value={category} onChange={e => setCategory(e.target.value)} className="input-field">
                  {CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                </select>
              </Field>
              <Field label="トピック">
                <input value={topic} onChange={e => setTopic(e.target.value)} className="input-field" placeholder="例: broadcasting, tax" />
              </Field>
            </div>
          </Section>

          {/* 検証対象の主張 */}
          <Section title="💬 検証対象の主張">
            <Field label="主張の内容" required>
              <textarea value={claim} onChange={e => setClaim(e.target.value)} rows={3} className="input-field"
                placeholder="本人の主張を要約（「」で囲む引用+文脈）" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="発言日">
                <input type="date" value={claimDate} onChange={e => setClaimDate(e.target.value)} className="input-field" />
              </Field>
              <Field label="会議録speechID">
                <input value={claimSpeechId} onChange={e => setClaimSpeechId(e.target.value)} className="input-field" placeholder="国会会議録のID" />
              </Field>
            </div>
            <Field label="出典URL">
              <input value={claimSourceUrl} onChange={e => setClaimSourceUrl(e.target.value)} className="input-field" placeholder="https://..." />
            </Field>
          </Section>

          {/* 判定 */}
          <Section title="⚖️ 判定">
            <div className="grid grid-cols-2 gap-3">
              <Field label="判定">
                <select value={verdict} onChange={e => setVerdict(e.target.value)} className="input-field">
                  <option value="">未判定</option>
                  {VERDICTS.map(v => <option key={v.key} value={v.key}>{v.label}</option>)}
                </select>
              </Field>
              <Field label="証拠等級">
                <select value={evidenceGrade} onChange={e => setEvidenceGrade(e.target.value)} className="input-field">
                  <option value="">未設定</option>
                  {GRADES.map(g => <option key={g.key} value={g.key}>{g.label}</option>)}
                </select>
              </Field>
            </div>
          </Section>

          {/* 検証本文 */}
          <Section title="📝 検証内容">
            <Field label="検証本文">
              <textarea value={analysis} onChange={e => setAnalysis(e.target.value)} rows={6} className="input-field"
                placeholder="事実関係の検証内容を記述..." />
            </Field>
            <Field label="背景・補足">
              <textarea value={contextNotes} onChange={e => setContextNotes(e.target.value)} rows={3} className="input-field"
                placeholder="時代背景や前提条件..." />
            </Field>
            <Field label="反論可能性">
              <textarea value={counterpoints} onChange={e => setCounterpoints(e.target.value)} rows={3} className="input-field"
                placeholder="この判定に対してどのような反論がありうるか..." />
            </Field>
          </Section>

          {/* 証拠 */}
          <Section title="📎 証拠・出典">
            {evidenceList.map((ev, idx) => (
              <div key={idx} className="bg-slate-700/30 rounded-lg p-3 mb-3 border border-slate-700/30">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-slate-400 font-bold">証拠 {idx + 1}</span>
                  {evidenceList.length > 1 && (
                    <button onClick={() => removeEvidence(idx)} className="text-[10px] text-red-400 hover:text-red-300">削除</button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2 mb-2">
                  <select value={ev.type} onChange={e => updateEvidence(idx, 'type', e.target.value)} className="input-field text-xs">
                    {EVIDENCE_TYPES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
                  </select>
                  <select
                    value={ev.supports_claim === true ? 'true' : ev.supports_claim === false ? 'false' : ''}
                    onChange={e => updateEvidence(idx, 'supports_claim', e.target.value === '' ? null : e.target.value === 'true')}
                    className="input-field text-xs"
                  >
                    <option value="">関連資料</option>
                    <option value="true">主張を支持</option>
                    <option value="false">反証</option>
                  </select>
                </div>
                <input value={ev.title} onChange={e => updateEvidence(idx, 'title', e.target.value)}
                  placeholder="証拠のタイトル" className="input-field text-xs mb-1.5" />
                <input value={ev.url} onChange={e => updateEvidence(idx, 'url', e.target.value)}
                  placeholder="URL" className="input-field text-xs mb-1.5" />
                <input value={ev.quote} onChange={e => updateEvidence(idx, 'quote', e.target.value)}
                  placeholder="短い引用" className="input-field text-xs" />
              </div>
            ))}
            <button onClick={addEvidence} className="text-xs text-blue-400 hover:text-blue-300">
              + 証拠を追加
            </button>
          </Section>

          {/* 送信 */}
          <div className="flex items-center gap-3">
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-sm font-bold"
            >
              {submitting ? '保存中...' : editingId ? '更新する' : '下書き保存'}
            </button>
            {editingId && (
              <button onClick={() => { resetForm(); setTab('list') }} className="px-4 py-2 text-sm text-slate-400 hover:text-slate-300">
                キャンセル
              </button>
            )}
            {submitResult && <span className="text-sm">{submitResult}</span>}
          </div>
        </div>
      )}

      <style jsx>{`
        .input-field {
          width: 100%;
          background: rgb(51, 65, 85);
          border: 1px solid rgb(71, 85, 105);
          border-radius: 6px;
          padding: 8px 12px;
          font-size: 14px;
          color: rgb(226, 232, 240);
        }
        .input-field::placeholder { color: rgb(100, 116, 139); }
        .input-field:focus { outline: none; border-color: rgb(59, 130, 246); }
        textarea.input-field { resize: vertical; }
      `}</style>
    </div>
  )
}

// ============================================================
// 共通コンポーネント
// ============================================================
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-slate-800/40 border border-slate-700/30 rounded-xl p-5">
      <h2 className="text-sm font-bold text-slate-300 mb-3">{title}</h2>
      <div className="space-y-3">{children}</div>
    </div>
  )
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs text-slate-400 mb-1 block">
        {label} {required && <span className="text-red-400">*</span>}
      </label>
      {children}
    </div>
  )
}
