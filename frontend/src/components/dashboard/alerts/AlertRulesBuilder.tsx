'use client'

import React, { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import {
  AlertTriangle, Flame, TrendingUp, GitBranch,
  ChevronRight, Circle, RefreshCw, Clock, Layers
} from 'lucide-react'
import { API_BASE_URL, getHeaders } from '@/lib/api'
import { BarChart, Bar, ResponsiveContainer, XAxis, Tooltip, Cell } from 'recharts'

interface Correlation {
  id: string
  root_cause_service: string
  root_cause_alert: string
  severity: 'P1' | 'P2' | 'P3' | 'P4'
  status: string
  alert_count: number
  affected_services: string[]
  namespace: string
  is_storm: boolean
  correlation_reason: string
  causal_chain: Array<{ service: string; impact: string; reason: string }>
  age_seconds: number
  last_seen_at: number
}

const SEVERITY_CONFIG: Record<string, { bg: string; text: string; border: string; label: string }> = {
  P1: { bg: 'rgba(242,73,92,0.15)',   text: '#f2495c', border: 'rgba(242,73,92,0.4)',   label: 'Critical'  },
  P2: { bg: 'rgba(249,115,22,0.12)',  text: '#f97316', border: 'rgba(249,115,22,0.35)', label: 'High'      },
  P3: { bg: 'rgba(245,158,11,0.12)', text: '#f59e0b', border: 'rgba(245,158,11,0.3)',  label: 'Medium'    },
  P4: { bg: 'rgba(107,114,128,0.1)', text: '#9ca3af', border: 'rgba(107,114,128,0.2)', label: 'Low'       },
}

async function fetchCorrelations(): Promise<Correlation[]> {
  try {
    const res = await fetch(`${API_BASE_URL}/alerts/correlations?limit=20`, { headers: getHeaders() })
    if (!res.ok) return []
    return res.json()
  } catch { return [] }
}

function formatAge(seconds: number): string {
  if (seconds < 60) return `${seconds}s ago`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  return `${Math.floor(seconds / 3600)}h ago`
}

function CausalChain({ chain }: { chain: Correlation['causal_chain'] }) {
  if (chain.length === 0) return null
  return (
    <div className="mt-3 flex flex-col gap-1.5">
      <div className="text-[9px] font-mono text-text-muted uppercase tracking-widest mb-1">Cascade Impact</div>
      <div className="flex items-center gap-1 flex-wrap">
        {chain.slice(0, 4).map((c, i) => (
          <React.Fragment key={c.service}>
            <div className={`flex items-center gap-1 text-[9px] font-mono px-2 py-0.5 rounded border ${
              c.impact === 'cascading_failure'
                ? 'bg-danger-rose/10 text-danger-rose border-danger-rose/25'
                : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
            }`}>
              <Circle className="w-1.5 h-1.5 fill-current" />
              {c.service}
            </div>
            {i < Math.min(chain.length - 1, 3) && (
              <ChevronRight className="w-3 h-3 text-text-muted flex-shrink-0" />
            )}
          </React.Fragment>
        ))}
        {chain.length > 4 && (
          <span className="text-[9px] text-text-muted">+{chain.length - 4} more</span>
        )}
      </div>
    </div>
  )
}

export function AlertRulesBuilder() {
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const { data: correlations = [], isLoading, refetch } = useQuery<Correlation[]>({
    queryKey: ['alert-correlations'],
    queryFn: fetchCorrelations,
    refetchInterval: 8000,
    staleTime: 5000,
  })

  // Alert storm chart data
  const stormData = useMemo(() => {
    const now = Date.now() / 1000
    return Array.from({ length: 30 }, (_, i) => {
      const t = now - (30 - i) * 60
      const active = correlations.filter(c => c.last_seen_at >= t && c.last_seen_at < t + 60)
      return {
        time: `-${30 - i}m`,
        p1: active.filter(c => c.severity === 'P1').length,
        p2: active.filter(c => c.severity === 'P2').length,
        p3: active.filter(c => c.severity === 'P3').length,
        storm: active.filter(c => c.is_storm).length,
      }
    })
  }, [correlations])

  const p1Count    = correlations.filter(c => c.severity === 'P1' && c.status === 'open').length
  const stormCount = correlations.filter(c => c.is_storm).length
  const selected   = correlations.find(c => c.id === selectedId) || null

  return (
    <div className="flex-1 flex flex-col gap-4 overflow-hidden h-full">

      {/* ── Summary Bar ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-4 gap-3 shrink-0">
        {[
          { label: 'Active Incidents',  value: correlations.filter(c => c.status === 'open').length, color: '#f2495c', icon: AlertTriangle },
          { label: 'P1 Critical',       value: p1Count,                                                color: '#f2495c', icon: Flame       },
          { label: 'Alert Storms',      value: stormCount,                                             color: '#f59e0b', icon: TrendingUp  },
          { label: 'Services Affected', value: new Set(correlations.flatMap(c => c.affected_services)).size, color: '#818cf8', icon: Layers },
        ].map(stat => (
          <div
            key={stat.label}
            className="rounded-xl p-3.5 border flex items-center gap-3"
            style={{
              background: stat.value > 0 ? `${stat.color}10` : 'rgba(0,0,0,0.4)',
              borderColor: stat.value > 0 ? `${stat.color}30` : 'rgba(255,255,255,0.07)',
            }}
          >
            <stat.icon className="w-5 h-5 flex-shrink-0" style={{ color: stat.color }} />
            <div>
              <div className="text-xl font-bold font-mono" style={{ color: stat.value > 0 ? stat.color : 'white' }}>
                {stat.value}
              </div>
              <div className="text-[10px] text-text-muted">{stat.label}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="flex-1 flex gap-4 overflow-hidden">

        {/* ── Left: Incident List ───────────────────────────────────────── */}
        <div className="flex flex-col gap-3 w-96 shrink-0 overflow-y-auto">
          {/* Alert Volume Histogram */}
          <div
            className="rounded-xl border p-3 shrink-0"
            style={{ background: 'rgba(0,0,0,0.5)', borderColor: 'rgba(255,255,255,0.07)' }}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-mono font-bold text-text-muted uppercase tracking-wider">Alert Volume (30m)</span>
              <button onClick={() => refetch()} className="text-text-muted hover:text-white transition-colors">
                <RefreshCw className="w-3 h-3" />
              </button>
            </div>
            <div className="h-20">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stormData} margin={{ top: 2, right: 0, left: -22, bottom: 0 }}>
                  <XAxis dataKey="time" tick={{ fill: '#6b7280', fontSize: 8 }} axisLine={false} tickLine={false} interval={9} />
                  <Tooltip
                    contentStyle={{ background: 'rgba(7,8,12,0.98)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 10 }}
                    labelStyle={{ color: '#e5e7eb' }}
                  />
                  <Bar dataKey="p1" stackId="a" fill="#f2495c" isAnimationActive={false} />
                  <Bar dataKey="p2" stackId="a" fill="#f97316" isAnimationActive={false} />
                  <Bar dataKey="p3" stackId="a" fill="#f59e0b" isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Incident list */}
          {isLoading ? (
            <div className="text-center py-8 text-text-muted text-sm">Loading correlations…</div>
          ) : correlations.length === 0 ? (
            <div className="text-center py-12 text-text-muted text-sm">
              <AlertTriangle className="w-8 h-8 opacity-20 mx-auto mb-2" />
              No active incidents
            </div>
          ) : (
            correlations.map(corr => {
              const sev = SEVERITY_CONFIG[corr.severity] || SEVERITY_CONFIG.P4
              const isSelected = selectedId === corr.id
              return (
                <motion.div
                  key={corr.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  onClick={() => setSelectedId(isSelected ? null : corr.id)}
                  className="rounded-xl border p-3.5 cursor-pointer transition-all hover:brightness-110"
                  style={{
                    background: isSelected ? sev.bg : 'rgba(0,0,0,0.45)',
                    borderColor: isSelected ? sev.border : 'rgba(255,255,255,0.07)',
                  }}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className="text-[10px] font-bold font-mono px-1.5 py-0.5 rounded border"
                        style={{ background: sev.bg, color: sev.text, borderColor: sev.border }}
                      >
                        {corr.severity}
                      </span>
                      {corr.is_storm && (
                        <span className="text-[9px] font-bold text-amber-400 bg-amber-400/15 border border-amber-400/25 px-1.5 py-0.5 rounded flex items-center gap-1">
                          <Flame className="w-2.5 h-2.5" /> STORM
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1 text-[9px] text-text-muted font-mono shrink-0">
                      <Clock className="w-2.5 h-2.5" />
                      {formatAge(corr.age_seconds)}
                    </div>
                  </div>

                  <div className="text-xs font-bold text-white mb-0.5">{corr.root_cause_alert}</div>
                  <div className="text-[10px] font-mono text-text-secondary mb-2">{corr.root_cause_service} · ns:{corr.namespace}</div>

                  <div className="text-[10px] text-text-muted leading-relaxed border-t pt-2" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                    {corr.correlation_reason}
                  </div>

                  <div className="flex items-center justify-between mt-2 text-[9px] font-mono text-text-muted">
                    <span>{corr.alert_count} alert{corr.alert_count > 1 ? 's' : ''} grouped</span>
                    <span>{corr.affected_services.length} service{corr.affected_services.length > 1 ? 's' : ''} affected</span>
                  </div>
                </motion.div>
              )
            })
          )}
        </div>

        {/* ── Right: Causality Detail ───────────────────────────────────── */}
        <div
          className="flex-1 rounded-xl border overflow-hidden flex flex-col"
          style={{ background: 'rgba(7,8,12,0.96)', borderColor: 'rgba(255,255,255,0.08)' }}
        >
          {selected ? (
            <>
              <div className="px-5 py-4 border-b" style={{ borderColor: 'rgba(255,255,255,0.07)', background: 'rgba(0,0,0,0.3)' }}>
                <div className="flex items-center gap-2 mb-1">
                  <GitBranch className="w-4 h-4 text-violet-400" />
                  <h3 className="text-sm font-bold text-white">Causality Analysis</h3>
                </div>
                <p className="text-[10px] text-text-muted">Multi-service cascade map for {selected.root_cause_service}</p>
              </div>

              <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4">
                {/* Root cause */}
                <div className="rounded-xl p-4 border" style={{ background: SEVERITY_CONFIG[selected.severity]?.bg, borderColor: SEVERITY_CONFIG[selected.severity]?.border }}>
                  <div className="text-[10px] font-mono text-text-muted uppercase tracking-wider mb-2">Root Cause</div>
                  <div className="text-sm font-bold text-white mb-1">{selected.root_cause_alert}</div>
                  <div className="text-[11px] text-text-secondary">{selected.correlation_reason}</div>
                  <div className="mt-2 flex items-center gap-4 text-[10px] font-mono text-text-muted">
                    <span>Namespace: <strong className="text-white">{selected.namespace}</strong></span>
                    <span>Alert count: <strong style={{ color: SEVERITY_CONFIG[selected.severity]?.text }}>{selected.alert_count}</strong></span>
                    {selected.is_storm && <span className="text-amber-400 font-bold">⚡ STORM DETECTED</span>}
                  </div>
                </div>

                {/* Causal chain visualization */}
                {selected.causal_chain.length > 0 && (
                  <div className="flex flex-col gap-2">
                    <div className="text-[10px] font-mono text-text-muted uppercase tracking-wider">Downstream Blast Radius</div>
                    {selected.causal_chain.map((node, i) => (
                      <motion.div
                        key={node.service}
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.06 }}
                        className="flex items-start gap-3 rounded-xl p-3 border"
                        style={{
                          marginLeft: node.impact === 'indirect_degradation' ? 20 : 0,
                          background: node.impact === 'cascading_failure' ? 'rgba(242,73,92,0.07)' : 'rgba(245,158,11,0.06)',
                          borderColor: node.impact === 'cascading_failure' ? 'rgba(242,73,92,0.2)' : 'rgba(245,158,11,0.18)',
                        }}
                      >
                        <div className={`w-2 h-2 rounded-full mt-1 flex-shrink-0 ${node.impact === 'cascading_failure' ? 'bg-danger-rose' : 'bg-amber-400'}`} />
                        <div>
                          <div className="text-[11px] font-bold text-white">{node.service}</div>
                          <div className="text-[10px] text-text-secondary mt-0.5">{node.reason}</div>
                          <div className={`text-[9px] font-mono mt-1 ${node.impact === 'cascading_failure' ? 'text-danger-rose' : 'text-amber-400'}`}>
                            {node.impact === 'cascading_failure' ? '⚠ Cascading Failure' : '↘ Indirect Degradation'}
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}

                {/* All affected services */}
                <div className="flex flex-col gap-2">
                  <div className="text-[10px] font-mono text-text-muted uppercase tracking-wider">All Affected Services ({selected.affected_services.length})</div>
                  <div className="flex flex-wrap gap-2">
                    {selected.affected_services.map((svc, i) => (
                      <span
                        key={svc}
                        className="text-[10px] font-mono px-2.5 py-1 rounded-lg border"
                        style={{
                          background: i === 0 ? 'rgba(242,73,92,0.1)' : 'rgba(255,255,255,0.05)',
                          borderColor: i === 0 ? 'rgba(242,73,92,0.3)' : 'rgba(255,255,255,0.1)',
                          color: i === 0 ? '#f2495c' : '#e5e7eb',
                        }}
                      >
                        {i === 0 && '⚡ '}{svc}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 text-text-muted">
              <GitBranch className="w-10 h-10 opacity-20" />
              <p className="text-sm">Select an incident to see causality analysis</p>
              <p className="text-[11px] text-text-muted">Astra maps which service failures cascade into others</p>
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
