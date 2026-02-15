'use client'

import { useEffect, useState } from 'react'
import { supabase, getPartyShortName, getPartyClass } from '@/lib/supabase'

const CATEGORIES: Record<string, { label: string; icon: string }> = {
  political_funds: { label: '政治資金', icon: '💰' },
  election_violation: { label: '選挙違反', icon: '🗳️' },
  corruption: { label: '汚職・口利き', icon: '🏴' },
  harassment: { label: 'ハラスメント', icon: '🚫' },
  ethics: { label: '倫理問題', icon: '⚖️' },
  cult_relations: { label: '旧統一教会等', icon: '⛪' },
  tax_evasion: { label: '脱税', icon: '📑' },
  violence: { label: '暴力・暴言', icon: '👊' },
  other: { label: 'その他', icon: '📌' },
}

const SEVERITIES: Record<string, { label: string; color: string; badge: string }> = {
  allegation: { label: '疑惑', color: 'text-yellow-400', badge: 'bg-yellow-500/20 border-yellow-500/40 text-yellow-400' },
  investigation: { label: '調査中', color: 'text-orange-400', badge: 'bg-orange-500/20 border-orange-500/40 text-orange-400' },
  confirmed: { label: '事実確認', color: 'text-red-400', badge: 'bg-red-500/20 border-red-500/40 text-red-400' },
  convicted: { label: '有罪確定', color: 'text-red-500', badge: 'bg-red-600/20 border-red-600/40 text-red-500' },
}

type Scandal = {
  id: string
  title: string
  category: string
  severity: string
  start_date: string | null
  end_date: string | null
  summary: string
  created_at: string
  people: { legislator_id: string; role: string; name: string; party: string | null }[]
  sources: { url: string; publisher: string | null; published_at: string | null; snippet: string | null }[]
  timeline: { event_date: string; event_type: string; description: string }[]
}

export default function ScandalsPage() {
  const [scandals, setScandals] = useState<Scandal[]>([])
  const [loading, setLoading] = useState(true)
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [severityFilter, setSeverityFilter] = useState('all')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const { data: scandalRows } = await supabase
        .from('scandals')
        .select('*')
        .eq('is_published', true)
        .order('start_date', { ascending: false })

      if (!scandalRows) { setLoading(false); return }

      // 関連データを一括取得
      const ids = scandalRows.map(s => s.id)

      const { data: people } = await supabase
        .from('scandal_people')
        .select('*, legislators(id, name, current_party)')
        .in('scandal_id', ids)

      const { data: sources } = await supabase
        .from('scandal_sources')
        .select('*')
        .in('scandal_id', ids)
        .order('published_at', { ascending: false })

      const { data: timeline } = await supabase
        .from('scandal_timeline')
        .select('*')
        .in('scandal_id', ids)
        .order('event_date', { ascending: true })

      const merged: Scandal[] = scandalRows.map(s => ({
        ...s,
        people: (people || [])
          .filter(p => p.scandal_id === s.id)
          .map(p => ({
            legislator_id: p.legislators?.id || p.legislator_id,
            role: p.role,
            name: p.legislators?.name || '不明',
            party: p.legislators?.current_party
          })),
        sources: (sources || []).filter(src => src.scandal_id === s.id),
        timeline: (timeline || []).filter(t => t.scandal_id === s.id),
      }))

      setScandals(merged)
      setLoading(false)
    }
    load()
  }, [])

  const filtered = scandals.filter(s => {
    if (categoryFilter !== 'all' && s.category !== categoryFilter) return false
    if (severityFilter !== 'all' && s.severity !== severityFilter) return false
    return true
  })

  const eventTypeLabels: Record<string, string> = {
    reported: '📰 報道',
    investigated: '🔍 捜査・調査',
    charged: '⚖️ 起訴・立件',
    convicted: '🔨 有罪判決',
    acquitted: '✅ 無罪',
    resigned: '🚪 辞任・離党',
    disciplined: '⚠️ 処分',
  }

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-20 text-center">
        <div className="animate-pulse">
          <div className="text-4xl mb-4">⚠️</div>
          <p className="text-slate-400">不祥事データベースを読み込み中...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-100 mb-2">⚠️ 不祥事データベース</h1>
        <p className="text-sm text-slate-400">
          国会議員に関する問題・疑惑の記録（{scandals.length}件）
        </p>
      </div>

      {/* 注意書き */}
      <div className="bg-amber-900/20 border border-amber-700/30 rounded-lg px-4 py-3 mb-6">
        <p className="text-xs text-amber-400/80 leading-relaxed">
          ⚠️ このデータベースは公開報道をもとに構成しています。
          「疑惑」段階の記録は事実認定を意味しません。各ソースをご確認ください。
          調査終了・無罪確定の場合はその旨を記載しています。
        </p>
      </div>

      {/* フィルター */}
      <div className="bg-slate-800/30 rounded-xl border border-slate-700/30 p-4 mb-6">
        <div className="flex flex-wrap gap-3">
          {/* カテゴリ */}
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => setCategoryFilter('all')}
              className={`text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${
                categoryFilter === 'all'
                  ? 'bg-blue-600 border-blue-500 text-white'
                  : 'bg-slate-800/50 border-slate-700/50 text-slate-400 hover:text-slate-200'
              }`}
            >
              全カテゴリ
            </button>
            {Object.entries(CATEGORIES).map(([key, { label, icon }]) => (
              <button
                key={key}
                onClick={() => setCategoryFilter(key)}
                className={`text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${
                  categoryFilter === key
                    ? 'bg-blue-600 border-blue-500 text-white'
                    : 'bg-slate-800/50 border-slate-700/50 text-slate-400 hover:text-slate-200'
                }`}
              >
                {icon} {label}
              </button>
            ))}
          </div>

          {/* 深刻度 */}
          <div className="flex gap-1.5 ml-auto">
            {Object.entries(SEVERITIES).map(([key, { label, badge }]) => (
              <button
                key={key}
                onClick={() => setSeverityFilter(severityFilter === key ? 'all' : key)}
                className={`text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${
                  severityFilter === key ? badge : 'bg-slate-800/50 border-slate-700/50 text-slate-400 hover:text-slate-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 統計 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {Object.entries(SEVERITIES).map(([key, { label, color }]) => {
          const count = scandals.filter(s => s.severity === key).length
          return (
            <div key={key} className="bg-slate-800/30 rounded-xl border border-slate-700/30 p-3 text-center">
              <div className={`text-xl font-bold ${color}`}>{count}</div>
              <div className="text-xs text-slate-500">{label}</div>
            </div>
          )
        })}
      </div>

      {/* 不祥事一覧 */}
      <div className="space-y-3">
        {filtered.map(scandal => {
          const cat = CATEGORIES[scandal.category] || CATEGORIES.other
          const sev = SEVERITIES[scandal.severity] || SEVERITIES.allegation
          const isExpanded = expandedId === scandal.id

          return (
            <div key={scandal.id}
              className="bg-slate-800/20 rounded-xl border border-slate-700/30 overflow-hidden">
              {/* ヘッダー */}
              <div
                className="px-4 py-3 cursor-pointer hover:bg-slate-700/20 transition-colors"
                onClick={() => setExpandedId(isExpanded ? null : scandal.id)}
              >
                <div className="flex items-start gap-3">
                  <span className="text-lg mt-0.5">{cat.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className={`text-xs px-2 py-0.5 rounded border ${sev.badge}`}>
                        {sev.label}
                      </span>
                      <span className="text-xs text-slate-500 bg-slate-700/50 px-2 py-0.5 rounded">
                        {cat.label}
                      </span>
                      {scandal.start_date && (
                        <span className="text-xs text-slate-500">{scandal.start_date}</span>
                      )}
                    </div>
                    <h3 className="text-sm font-bold text-slate-200 mb-1">{scandal.title}</h3>
                    {/* 関係議員 */}
                    {scandal.people.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-1">
                        {scandal.people.map(p => (
                          <a
                            key={p.legislator_id}
                            href={`/legislator/${p.legislator_id}`}
                            onClick={e => e.stopPropagation()}
                            className={`text-xs px-2 py-0.5 rounded border border-slate-600/50 hover:border-blue-500/50 transition-colors ${
                              p.role === 'subject' ? 'text-red-400 bg-red-500/10' : 'text-slate-400 bg-slate-700/30'
                            }`}
                          >
                            {p.name}
                            {p.party && <span className="text-slate-500 ml-1">({getPartyShortName(p.party)})</span>}
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                  <span className="text-xs text-slate-600">{isExpanded ? '▲' : '▼'}</span>
                </div>
              </div>

              {/* 展開部分 */}
              {isExpanded && (
                <div className="border-t border-slate-700/30 px-4 py-4">
                  {/* 概要 */}
                  <p className="text-sm text-slate-300 leading-relaxed mb-4">{scandal.summary}</p>

                  {/* タイムライン */}
                  {scandal.timeline.length > 0 && (
                    <div className="mb-4">
                      <h4 className="text-xs font-bold text-slate-400 mb-2">📅 経過</h4>
                      <div className="space-y-1.5 border-l-2 border-slate-700 pl-3 ml-1">
                        {scandal.timeline.map((t, i) => (
                          <div key={i} className="flex items-start gap-2">
                            <span className="text-xs text-slate-500 shrink-0 w-20">{t.event_date}</span>
                            <span className="text-xs text-slate-400">
                              {eventTypeLabels[t.event_type] || t.event_type}
                            </span>
                            <span className="text-xs text-slate-300">{t.description}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* ソース */}
                  {scandal.sources.length > 0 && (
                    <div>
                      <h4 className="text-xs font-bold text-slate-400 mb-2">📎 出典</h4>
                      <div className="space-y-1">
                        {scandal.sources.map((src, i) => (
                          <a
                            key={i}
                            href={src.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 text-xs text-blue-400/80 hover:text-blue-400 transition-colors"
                          >
                            <span className="text-slate-500">{src.publisher || '出典'}</span>
                            {src.published_at && <span className="text-slate-600">{src.published_at}</span>}
                            <span className="truncate">{src.snippet || src.url}</span>
                            <span className="shrink-0">↗</span>
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-16 bg-slate-800/20 rounded-xl border border-slate-700/30">
          <div className="text-3xl mb-3">✅</div>
          <p className="text-slate-400">該当する記録がありません</p>
        </div>
      )}
    </div>
  )
}
