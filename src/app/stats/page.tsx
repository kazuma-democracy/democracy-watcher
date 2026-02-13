'use client'

import { useEffect, useState } from 'react'
import { supabase, getPartyClass, getPartyShortName } from '@/lib/supabase'

type PartyStats = {
  party: string
  shortName: string
  partyClass: string
  memberCount: number
  speechCount: number
  avgSpeeches: number
}

type TopLegislator = {
  name: string
  current_party: string
  speech_count: number
  id: string
}

export default function StatsPage() {
  const [partyStats, setPartyStats] = useState<PartyStats[]>([])
  const [topLegislators, setTopLegislators] = useState<TopLegislator[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'party' | 'ranking'>('party')

  useEffect(() => {
    async function load() {
      // 議員データ（発言数付き）
      const { data: legs } = await supabase
        .from('legislators_with_counts')
        .select('*')
        .range(0, 4999)

      if (!legs) { setLoading(false); return }

      // 政党別集計
      const partyMap: Record<string, { members: number; speeches: number }> = {}
      for (const leg of legs) {
        const party = leg.current_party || '無所属'
        if (!partyMap[party]) partyMap[party] = { members: 0, speeches: 0 }
        partyMap[party].members++
        partyMap[party].speeches += leg.speech_count || 0
      }

      // 主要政党でグループ化
      const majorParties: Record<string, { members: number; speeches: number }> = {}
      for (const [party, data] of Object.entries(partyMap)) {
        const short = getPartyShortName(party)
        if (!majorParties[short]) majorParties[short] = { members: 0, speeches: 0 }
        majorParties[short].members += data.members
        majorParties[short].speeches += data.speeches
      }

      const stats: PartyStats[] = Object.entries(majorParties)
        .map(([shortName, data]) => ({
          party: shortName,
          shortName,
          partyClass: getPartyClass(
            shortName === '自民' ? '自由民主党' :
            shortName === '立憲' ? '立憲民主' :
            shortName === '公明' ? '公明' :
            shortName === '維新' ? '維新' :
            shortName === '国民' ? '国民民主' :
            shortName === '共産' ? '共産' :
            shortName === 'れいわ' ? 'れいわ' :
            shortName === '社民' ? '社会民主党' :
            shortName === '参政' ? '参政' :
            shortName === 'みらい' ? 'みらい' :
            '無所属'
          ),
          memberCount: data.members,
          speechCount: data.speeches,
          avgSpeeches: data.members > 0 ? Math.round(data.speeches / data.members) : 0
        }))
        .sort((a, b) => b.speechCount - a.speechCount)

      setPartyStats(stats)

      // 発言数ランキングTOP30
      const top = (legs as any[])
        .filter((l: any) => (l.speech_count || 0) > 0)
        .sort((a: any, b: any) => (b.speech_count || 0) - (a.speech_count || 0))
        .slice(0, 30)
        .map((l: any) => ({
          name: l.name,
          current_party: l.current_party,
          speech_count: l.speech_count || 0,
          id: l.id
        }))
      setTopLegislators(top)
      setLoading(false)
    }
    load()
  }, [])

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-20 text-center">
        <div className="animate-pulse">
          <div className="text-4xl mb-4">📊</div>
          <p className="text-slate-400">統計データを計算中...</p>
        </div>
      </div>
    )
  }

  const maxSpeechCount = partyStats.length > 0 ? partyStats[0].speechCount : 1
  const maxLegSpeech = topLegislators.length > 0 ? topLegislators[0].speech_count : 1

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-slate-100 mb-6">📊 統計・分析</h1>

      {/* タブ */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setTab('party')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            tab === 'party' ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-slate-200'
          }`}
        >
          🏛️ 政党別分析
        </button>
        <button
          onClick={() => setTab('ranking')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            tab === 'ranking' ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-slate-200'
          }`}
        >
          🏆 発言数ランキング
        </button>
      </div>

      {tab === 'party' && (
        <div>
          {/* 総発言数バー */}
          <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700/50 mb-6">
            <h2 className="text-base font-bold text-slate-200 mb-4">政党別 総発言数</h2>
            <div className="space-y-3">
              {partyStats.filter(p => p.speechCount > 0).map(p => (
                <div key={p.shortName} className="flex items-center gap-3">
                  <div className={`w-16 text-xs font-bold text-right party-tag-${p.partyClass}`} style={{color: 'inherit'}}>
                    {p.shortName}
                  </div>
                  <div className="flex-1 bg-slate-700/30 rounded-full h-6 overflow-hidden">
                    <div
                      className={`h-full rounded-full flex items-center justify-end pr-2 transition-all duration-500`}
                      style={{
                        width: `${Math.max(2, (p.speechCount / maxSpeechCount) * 100)}%`,
                        backgroundColor: p.partyClass === 'ldp' ? '#4ade80' :
                          p.partyClass === 'cdp' ? '#60a5fa' :
                          p.partyClass === 'komeito' ? '#f59e0b' :
                          p.partyClass === 'ishin' ? '#a78bfa' :
                          p.partyClass === 'dpfp' ? '#fbbf24' :
                          p.partyClass === 'jcp' ? '#f87171' :
                          p.partyClass === 'reiwa' ? '#c084fc' :
                          p.partyClass === 'sdp' ? '#f472b6' :
                          '#94a3b8'
                      }}
                    >
                      <span className="text-xs font-bold text-white drop-shadow">{p.speechCount.toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 議員1人あたり平均 */}
          <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700/50 mb-6">
            <h2 className="text-base font-bold text-slate-200 mb-4">議員1人あたり平均発言数</h2>
            <div className="space-y-3">
              {[...partyStats].filter(p => p.avgSpeeches > 0).sort((a, b) => b.avgSpeeches - a.avgSpeeches).map(p => {
                const maxAvg = Math.max(...partyStats.map(pp => pp.avgSpeeches))
                return (
                  <div key={p.shortName} className="flex items-center gap-3">
                    <div className={`w-16 text-xs font-bold text-right party-tag-${p.partyClass}`} style={{color: 'inherit'}}>
                      {p.shortName}
                    </div>
                    <div className="flex-1 bg-slate-700/30 rounded-full h-6 overflow-hidden">
                      <div
                        className="h-full rounded-full flex items-center justify-end pr-2"
                        style={{
                          width: `${Math.max(2, (p.avgSpeeches / maxAvg) * 100)}%`,
                          backgroundColor: p.partyClass === 'ldp' ? '#4ade80' :
                            p.partyClass === 'cdp' ? '#60a5fa' :
                            p.partyClass === 'komeito' ? '#f59e0b' :
                            p.partyClass === 'ishin' ? '#a78bfa' :
                            p.partyClass === 'dpfp' ? '#fbbf24' :
                            p.partyClass === 'jcp' ? '#f87171' :
                            p.partyClass === 'reiwa' ? '#c084fc' :
                            p.partyClass === 'sdp' ? '#f472b6' :
                            '#94a3b8'
                        }}
                      >
                        <span className="text-xs font-bold text-white drop-shadow">{p.avgSpeeches}</span>
                      </div>
                    </div>
                    <span className="text-xs text-slate-500 w-16">{p.memberCount}人</span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* 政党カード */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {partyStats.filter(p => p.memberCount > 0).map(p => (
              <div key={p.shortName} className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
                <div className={`text-lg font-bold party-tag-${p.partyClass} mb-2`} style={{color: 'inherit'}}>
                  {p.shortName}
                </div>
                <div className="space-y-1 text-xs text-slate-400">
                  <div className="flex justify-between">
                    <span>議員数</span>
                    <span className="text-slate-200 font-medium">{p.memberCount}人</span>
                  </div>
                  <div className="flex justify-between">
                    <span>総発言数</span>
                    <span className="text-slate-200 font-medium">{p.speechCount.toLocaleString()}件</span>
                  </div>
                  <div className="flex justify-between">
                    <span>平均発言数</span>
                    <span className="text-emerald-400 font-medium">{p.avgSpeeches}件/人</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'ranking' && (
        <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700/50">
          <h2 className="text-base font-bold text-slate-200 mb-4">🏆 発言数ランキング TOP30</h2>
          <div className="space-y-2">
            {topLegislators.map((leg, i) => (
              <a
                key={leg.id}
                href={`/legislator/${leg.id}`}
                className="flex items-center gap-3 hover:bg-slate-700/30 rounded-lg px-2 py-1.5 transition-colors"
              >
                <span className={`w-8 text-center text-sm font-bold ${
                  i === 0 ? 'text-yellow-400' : i === 1 ? 'text-slate-300' : i === 2 ? 'text-amber-600' : 'text-slate-500'
                }`}>
                  {i + 1}
                </span>
                <span className="text-sm text-slate-200 font-medium flex-1">{leg.name}</span>
                <span className={`text-xs px-2 py-0.5 rounded border party-tag-${getPartyClass(leg.current_party)}`}>
                  {getPartyShortName(leg.current_party)}
                </span>
                <div className="w-40 bg-slate-700/30 rounded-full h-4 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-emerald-500/70"
                    style={{ width: `${(leg.speech_count / maxLegSpeech) * 100}%` }}
                  />
                </div>
                <span className="text-xs text-slate-400 w-16 text-right">{leg.speech_count.toLocaleString()}件</span>
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
