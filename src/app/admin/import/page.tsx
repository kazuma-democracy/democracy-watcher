'use client'

import { useState, useCallback } from 'react'

const SESSIONS = [
  { id: 216, label: '第216回（2025年〜）' },
  { id: 215, label: '第215回（2024年〜）' },
  { id: 214, label: '第214回（2024年）' },
  { id: 213, label: '第213回（2024年）' },
  { id: 212, label: '第212回（2023年）' },
  { id: 211, label: '第211回（2023年）' },
  { id: 210, label: '第210回（2022年）' },
  { id: 209, label: '第209回（2022年）' },
  { id: 208, label: '第208回（2022年）' },
]

type ImportStatus = {
  legislators: number
  speeches: number
  representatives: number
  councillors: number
  answerers: number
  answerer_sample: { name: string; current_position: string }[]
  kishida_check: { id: string; name: string; current_party: string; current_position: string }[]
}

type ImportResult = {
  total: number
  fetched: number
  speakers?: number
  inserted?: number
  updated?: number
  imported?: number
  skipped?: number
  nextStart: number | null
  done: boolean
  session: number
  error?: string
}

export default function AdminImportPage() {
  const [password, setPassword] = useState('')
  const [authed, setAuthed] = useState(false)
  const [status, setStatus] = useState<ImportStatus | null>(null)
  const [loading, setLoading] = useState(false)
  const [log, setLog] = useState<string[]>([])
  const [running, setRunning] = useState(false)
  const [selectedSessions, setSelectedSessions] = useState<Set<number>>(new Set([215, 214, 213]))
  const [importType, setImportType] = useState<'legislators' | 'speeches'>('legislators')

  function addLog(msg: string) {
    setLog(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`])
  }

  function adminFetch(body: any) {
    return fetch('/api/admin/import', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-password': password,
      },
      body: JSON.stringify(body),
    })
  }

  async function handleLogin() {
    if (!password) return
    setLoading(true)
    try {
      const res = await fetch('/api/admin/scandals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-password': password },
        body: JSON.stringify({ action: 'verify_auth' }),
      })
      const data = await res.json()
      if (res.ok && data.ok) {
        setAuthed(true)
        loadStatus()
      }
    } catch (e: any) {
      addLog(`❌ ${e.message}`)
    } finally {
      setLoading(false)
    }
  }

  const loadStatus = useCallback(async () => {
    try {
      const res = await adminFetch({ action: 'get_import_status' })
      const data = await res.json()
      setStatus(data)
    } catch (e: any) {
      addLog(`❌ ステータス取得失敗: ${e.message}`)
    }
  }, [password])

  function toggleSession(id: number) {
    setSelectedSessions(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // 段階的インポート
  async function runImport() {
    if (running) return
    setRunning(true)
    const sessions = Array.from(selectedSessions).sort((a, b) => b - a)
    const action = importType === 'legislators' ? 'import_legislators' : 'import_speeches'
    const label = importType === 'legislators' ? '議員マスタ' : '発言データ'

    addLog(`🚀 ${label}インポート開始 (${sessions.length}セッション)`)

    let grandTotal = { inserted: 0, updated: 0, imported: 0, skipped: 0 }

    for (const session of sessions) {
      addLog(`\n🏛️ 第${session}回国会...`)
      let startRecord = 1
      let batchNum = 0

      while (true) {
        batchNum++
        try {
          const res = await adminFetch({ action, session, startRecord })
          const result: ImportResult = await res.json()

          if (result.error) {
            addLog(`  ⚠️ ${result.error}`)
            break
          }

          if (importType === 'legislators') {
            grandTotal.inserted += result.inserted || 0
            grandTotal.updated += result.updated || 0
            addLog(`  バッチ${batchNum}: ${result.fetched}件取得, ${result.speakers}名発見, 新規${result.inserted}, 更新${result.updated} (${Math.round(startRecord / result.total * 100)}%)`)
          } else {
            grandTotal.imported += result.imported || 0
            grandTotal.skipped += result.skipped || 0
            addLog(`  バッチ${batchNum}: ${result.imported}件取込, ${result.skipped}件スキップ (${Math.round(startRecord / result.total * 100)}%)`)
          }

          if (result.done || !result.nextStart) break
          startRecord = result.nextStart

          // 少し待つ（API過負荷防止）
          await new Promise(r => setTimeout(r, 500))
        } catch (e: any) {
          addLog(`  ❌ ${e.message}`)
          break
        }
      }
    }

    if (importType === 'legislators') {
      addLog(`\n✅ 完了！ 新規: ${grandTotal.inserted}名, 更新: ${grandTotal.updated}名`)
    } else {
      addLog(`\n✅ 完了！ 取込: ${grandTotal.imported}件, スキップ: ${grandTotal.skipped}件`)
    }

    setRunning(false)
    loadStatus()
  }

  // パスワード画面
  if (!authed) {
    return (
      <div className="max-w-md mx-auto px-4 py-20">
        <div className="bg-slate-800/50 rounded-xl border border-slate-700/30 p-8 text-center">
          <div className="text-4xl mb-4">📥</div>
          <h1 className="text-lg font-bold text-slate-200 mb-4">国会データ インポート</h1>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleLogin() }}
            placeholder="パスワード"
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-sm text-slate-200 mb-3 focus:border-blue-500 focus:outline-none"
          />
          <button
            onClick={handleLogin}
            disabled={loading || !password}
            className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 text-white rounded-lg text-sm transition-colors"
          >
            {loading ? '...' : 'ログイン'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-slate-100 mb-2">📥 国会データ インポート</h1>
      <p className="text-sm text-slate-400 mb-6">国会会議録APIから議員マスタ・発言データを取り込みます</p>

      {/* DB Status */}
      <div className="bg-slate-800/30 rounded-xl border border-slate-700/30 p-5 mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-slate-300">📊 現在のDB状態</h2>
          <button onClick={loadStatus} className="text-xs text-blue-400 hover:text-blue-300">更新</button>
        </div>

        {status ? (
          <div className="space-y-2">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-slate-900/50 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-slate-100">{status.legislators}</div>
                <div className="text-xs text-slate-500">議員総数</div>
              </div>
              <div className="bg-slate-900/50 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-blue-400">{status.representatives}</div>
                <div className="text-xs text-slate-500">衆議院</div>
              </div>
              <div className="bg-slate-900/50 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-emerald-400">{status.councillors}</div>
                <div className="text-xs text-slate-500">参議院</div>
              </div>
              <div className="bg-slate-900/50 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-orange-400">{status.speeches}</div>
                <div className="text-xs text-slate-500">発言数</div>
              </div>
            </div>

            {/* 岸田チェック */}
            <div className={`text-xs p-2 rounded ${status.kishida_check.length > 0 ? 'bg-emerald-900/20 text-emerald-400' : 'bg-red-900/20 text-red-400'}`}>
              岸田文雄: {status.kishida_check.length > 0
                ? `✅ 登録済み (${status.kishida_check[0]?.current_position || ''})`
                : '❌ 未登録'}
            </div>

            {/* 答弁者サンプル */}
            {status.answerer_sample.length > 0 && (
              <div className="text-xs text-slate-500">
                答弁者例: {status.answerer_sample.slice(0, 5).map(a => `${a.name}(${a.current_position})`).join(', ')}
              </div>
            )}
          </div>
        ) : (
          <p className="text-xs text-slate-500">読み込み中...</p>
        )}
      </div>

      {/* 統計キャッシュ更新 */}
      <div className="bg-slate-800/30 rounded-xl border border-slate-700/30 p-5 mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-slate-300">📊 ダッシュボード統計更新</h2>
            <p className="text-xs text-slate-500 mt-1">インポート後に実行すると、ダッシュボードの数字が最新になります</p>
          </div>
          <button
            onClick={async () => {
              addLog('📊 統計更新中...')
              try {
                const res = await adminFetch({ action: 'refresh_stats' })
                const data = await res.json()
                if (data.ok) {
                  addLog(`✅ 統計更新完了: 発言${data.stats?.speeches_count}件 / 議員${data.stats?.legislators_count}人 / 議案${data.stats?.bills_count}件`)
                } else {
                  addLog(`❌ ${data.error}`)
                }
              } catch (e: any) {
                addLog(`❌ ${e.message}`)
              }
            }}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shrink-0"
          >
            統計を更新
          </button>
        </div>
      </div>

      {/* Import Controls */}
      <div className="bg-slate-800/30 rounded-xl border border-slate-700/30 p-5 mb-6">
        <h2 className="text-sm font-bold text-slate-300 mb-3">⚙️ インポート設定</h2>

        {/* Type */}
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setImportType('legislators')}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
              importType === 'legislators'
                ? 'bg-blue-600 text-white'
                : 'bg-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            👤 議員マスタ
          </button>
          <button
            onClick={() => setImportType('speeches')}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
              importType === 'speeches'
                ? 'bg-blue-600 text-white'
                : 'bg-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            💬 発言データ（答弁含む）
          </button>
        </div>

        {/* Sessions */}
        <p className="text-xs text-slate-500 mb-2">対象の国会回次:</p>
        <div className="flex flex-wrap gap-2 mb-4">
          {SESSIONS.map(s => (
            <button
              key={s.id}
              onClick={() => toggleSession(s.id)}
              className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                selectedSessions.has(s.id)
                  ? 'bg-blue-600 border-blue-500 text-white'
                  : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-blue-500'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        {importType === 'legislators' && (
          <div className="text-xs text-slate-500 mb-4 bg-slate-900/50 rounded-lg p-3">
            💡 国会会議録APIの全発言者を収集し、会派所属や大臣ポジションのある人物を議員として登録します。
            岸田文雄のような答弁者（内閣総理大臣）も含まれます。
          </div>
        )}

        {importType === 'speeches' && (
          <div className="text-xs text-slate-500 mb-4 bg-slate-900/50 rounded-lg p-3">
            💡 先に議員マスタをインポートしてから発言データをインポートしてください。
            答弁（大臣の回答）も含む全発言が取り込まれます。
          </div>
        )}

        <button
          onClick={runImport}
          disabled={running || selectedSessions.size === 0}
          className={`w-full py-3 rounded-lg text-sm font-bold transition-colors ${
            running
              ? 'bg-yellow-600 text-white animate-pulse'
              : 'bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-500 text-white'
          }`}
        >
          {running
            ? '⏳ インポート中...'
            : `🚀 ${importType === 'legislators' ? '議員マスタ' : '発言データ'}をインポート（${selectedSessions.size}セッション）`}
        </button>
      </div>

      {/* Log */}
      <div className="bg-slate-800/30 rounded-xl border border-slate-700/30 p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-slate-300">📋 ログ</h2>
          <button onClick={() => setLog([])} className="text-xs text-slate-500 hover:text-slate-300">クリア</button>
        </div>
        <div className="bg-slate-900 rounded-lg p-3 max-h-[400px] overflow-y-auto font-mono text-xs">
          {log.length === 0 ? (
            <p className="text-slate-600">まだログがありません</p>
          ) : (
            log.map((entry, i) => (
              <div key={i} className={`py-0.5 ${
                entry.includes('❌') ? 'text-red-400' :
                entry.includes('✅') ? 'text-emerald-400' :
                entry.includes('⚠️') ? 'text-yellow-400' :
                entry.includes('🚀') ? 'text-blue-400' :
                'text-slate-400'
              }`}>
                {entry}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
