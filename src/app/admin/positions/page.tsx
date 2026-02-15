'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

type LegResult = {
  id: string
  name: string
  name_yomi: string | null
  house: string | null
  current_party: string | null
  current_position: string | null
  current_position_override: string | null
  current_position_source: string | null
  current_position_updated_at: string | null
}

export default function AdminPositionsPage() {
  const [search, setSearch] = useState('')
  const [results, setResults] = useState<LegResult[]>([])
  const [loading, setLoading] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)
  const [overrideList, setOverrideList] = useState<LegResult[]>([])

  // 既存の override 一覧を読み込み
  useEffect(() => {
    loadOverrides()
  }, [])

  async function loadOverrides() {
    const { data } = await supabase
      .from('legislators')
      .select('id, name, name_yomi, house, current_party, current_position, current_position_override, current_position_source, current_position_updated_at')
      .not('current_position_override', 'is', null)
      .order('current_position_updated_at', { ascending: false })
    setOverrideList(data || [])
  }

  async function handleSearch() {
    if (!search.trim()) return
    setLoading(true)
    setMessage(null)
    const { data, error } = await supabase
      .from('legislators')
      .select('id, name, name_yomi, house, current_party, current_position, current_position_override, current_position_source, current_position_updated_at')
      .or(`name.ilike.%${search}%,name_yomi.ilike.%${search}%`)
      .order('name')
      .limit(20)
    setResults(data || [])
    setLoading(false)
    if (error) setMessage({ type: 'error', text: error.message })
  }

  function startEdit(leg: LegResult) {
    setEditingId(leg.id)
    setEditValue(leg.current_position_override || '')
  }

  async function saveOverride(id: string) {
    setSaving(true)
    setMessage(null)
    const value = editValue.trim() || null
    const { error } = await supabase
      .from('legislators')
      .update({
        current_position_override: value,
        current_position_source: value ? 'manual' : null,
        current_position_updated_at: value ? new Date().toISOString() : null,
      })
      .eq('id', id)

    if (error) {
      setMessage({ type: 'error', text: `保存失敗: ${error.message}` })
    } else {
      setMessage({ type: 'success', text: '保存しました' })
      setEditingId(null)
      // 結果を更新
      setResults(prev => prev.map(r => r.id === id ? {
        ...r,
        current_position_override: value,
        current_position_source: value ? 'manual' : null,
        current_position_updated_at: value ? new Date().toISOString() : null,
      } : r))
      loadOverrides()
    }
    setSaving(false)
  }

  async function clearOverride(id: string) {
    if (!confirm('このoverride を削除しますか？（発言由来の役職に戻ります）')) return
    setSaving(true)
    const { error } = await supabase
      .from('legislators')
      .update({
        current_position_override: null,
        current_position_source: 'speech_inferred',
        current_position_updated_at: null,
      })
      .eq('id', id)

    if (!error) {
      setMessage({ type: 'success', text: 'override を削除しました' })
      setResults(prev => prev.map(r => r.id === id ? { ...r, current_position_override: null, current_position_source: 'speech_inferred', current_position_updated_at: null } : r))
      loadOverrides()
    }
    setSaving(false)
  }

  const houseLabel = (h: string | null) => h === 'representatives' ? '衆' : h === 'councillors' ? '参' : h || '?'

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 p-4 max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <a href="/" className="text-slate-500 hover:text-slate-300">← トップ</a>
        <h1 className="text-2xl font-bold">🏛️ 役職管理（Position Override）</h1>
      </div>

      <div className="bg-slate-900/50 rounded-xl border border-slate-700/50 p-4 mb-6">
        <p className="text-sm text-slate-400 mb-3">
          議員の「現在の役職」を手動で設定します。override が設定されると、発言由来の古い役職の代わりに表示されます。
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="議員名で検索..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-blue-500"
          />
          <button
            onClick={handleSearch}
            disabled={loading}
            className="bg-blue-600 hover:bg-blue-500 px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
          >
            {loading ? '検索中...' : '検索'}
          </button>
        </div>
      </div>

      {message && (
        <div className={`rounded-lg px-4 py-2 mb-4 text-sm ${
          message.type === 'success' ? 'bg-green-900/50 text-green-300 border border-green-700/50' : 'bg-red-900/50 text-red-300 border border-red-700/50'
        }`}>
          {message.text}
        </div>
      )}

      {/* 検索結果 */}
      {results.length > 0 && (
        <div className="mb-8">
          <h2 className="text-sm font-bold text-slate-400 mb-3">検索結果（{results.length}件）</h2>
          <div className="space-y-2">
            {results.map(leg => (
              <div key={leg.id} className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs bg-slate-700 px-1.5 py-0.5 rounded">{houseLabel(leg.house)}</span>
                    <span className="font-bold">{leg.name}</span>
                    <span className="text-xs text-slate-500">{leg.name_yomi}</span>
                    <span className="text-xs text-slate-500">{leg.current_party}</span>
                  </div>
                  <a href={`/legislator/${leg.id}`} className="text-xs text-blue-400 hover:text-blue-300">詳細 →</a>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs mb-2">
                  <div>
                    <span className="text-slate-500">発言由来: </span>
                    <span className="text-slate-400 italic">{leg.current_position || '（なし）'}</span>
                  </div>
                  <div>
                    <span className="text-slate-500">override: </span>
                    <span className={leg.current_position_override ? 'text-amber-400 font-medium' : 'text-slate-600'}>
                      {leg.current_position_override || '（未設定）'}
                    </span>
                  </div>
                </div>

                {editingId === leg.id ? (
                  <div className="flex gap-2 mt-2">
                    <input
                      type="text"
                      value={editValue}
                      onChange={e => setEditValue(e.target.value)}
                      placeholder="現在の役職を入力（空=削除）"
                      className="flex-1 bg-slate-900 border border-slate-600 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-amber-500"
                      autoFocus
                      onKeyDown={e => e.key === 'Enter' && saveOverride(leg.id)}
                    />
                    <button
                      onClick={() => saveOverride(leg.id)}
                      disabled={saving}
                      className="bg-amber-600 hover:bg-amber-500 px-3 py-1.5 rounded text-xs font-medium disabled:opacity-50"
                    >
                      {saving ? '...' : '保存'}
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="bg-slate-700 hover:bg-slate-600 px-3 py-1.5 rounded text-xs"
                    >
                      取消
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={() => startEdit(leg)}
                      className="bg-slate-700 hover:bg-slate-600 px-3 py-1.5 rounded text-xs"
                    >
                      ✏️ 役職を設定
                    </button>
                    {leg.current_position_override && (
                      <button
                        onClick={() => clearOverride(leg.id)}
                        className="bg-red-900/50 hover:bg-red-800/50 text-red-300 px-3 py-1.5 rounded text-xs"
                      >
                        🗑️ 削除
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 既存の override 一覧 */}
      <div>
        <h2 className="text-sm font-bold text-slate-400 mb-3">📋 現在の override 一覧（{overrideList.length}件）</h2>
        {overrideList.length === 0 ? (
          <p className="text-sm text-slate-600">override が設定された議員はまだいません。SQLを実行するか、上の検索から設定してください。</p>
        ) : (
          <div className="bg-slate-800/30 rounded-lg border border-slate-700/50 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700/50 text-xs text-slate-500">
                  <th className="px-3 py-2 text-left">議員名</th>
                  <th className="px-3 py-2 text-left">院</th>
                  <th className="px-3 py-2 text-left">override（現在の役職）</th>
                  <th className="px-3 py-2 text-left">ソース</th>
                  <th className="px-3 py-2 text-left">更新日</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {overrideList.map(leg => (
                  <tr key={leg.id} className="border-b border-slate-800 hover:bg-slate-800/50">
                    <td className="px-3 py-2 font-medium">{leg.name}</td>
                    <td className="px-3 py-2 text-xs">{houseLabel(leg.house)}</td>
                    <td className="px-3 py-2 text-amber-400">{leg.current_position_override}</td>
                    <td className="px-3 py-2 text-xs text-slate-500">{leg.current_position_source}</td>
                    <td className="px-3 py-2 text-xs text-slate-500">
                      {leg.current_position_updated_at ? new Date(leg.current_position_updated_at).toLocaleDateString('ja-JP') : '-'}
                    </td>
                    <td className="px-3 py-2">
                      <button
                        onClick={() => { setSearch(leg.name); setResults([leg]); startEdit(leg); window.scrollTo(0, 0) }}
                        className="text-xs text-blue-400 hover:text-blue-300"
                      >
                        編集
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
