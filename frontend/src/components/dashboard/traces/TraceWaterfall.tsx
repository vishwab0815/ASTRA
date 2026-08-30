'use client'

import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { Zap, AlertTriangle, ChevronRight, RefreshCw, Filter, Tag } from 'lucide-react'
import { API_BASE_URL, getHeaders } from '@/lib/api'

interface TraceSpan {
  span_id: string
  trace_id: string
  parent_span_id: string | null
  service: string
  operation: string
  start_time_ms: number
  duration_ms: number
  has_error: boolean
  status_code: number
  tags: Record<string, string>
  color: string
}

interface TraceItem {
  trace_id: string
  root_service: string
  root_operation: string
  total_duration_ms: number
  has_error: boolean
  span_count: number
  created_at: number
  spans: TraceSpan[]
}

async function fetchTraces(): Promise<TraceItem[]> {
  try {
    const res = await fetch(`${API_BASE_URL}/traces?limit=20`, { headers: getHeaders() })
    if (!res.ok) return []
    return res.json()
  } catch { return [] }
}

function CriticalPathHighlight({ spans, totalMs }: { spans: TraceSpan[]; totalMs: number }) {
  // Find critical path: the chain of spans with maximum cumulative duration
  const errorSpans = spans.filter(s => s.has_error)
  const slowestSpan = [...spans].sort((a, b) => b.duration_ms - a.duration_ms)[0]

  return (
    <div className="flex items-center gap-2 text-[10px] font-mono">
      {errorSpans.length > 0 && (
        <span className="flex items-center gap-1 text-danger-rose bg-danger-rose/10 border border-danger-rose/20 px-2 py-0.5 rounded-full">
          <AlertTriangle className="w-2.5 h-2.5" />
          {errorSpans.length} error span{errorSpans.length > 1 ? 's' : ''}
        </span>
      )}
      {slowestSpan && (
        <span className="flex items-center gap-1 text-amber-400 bg-amber-400/10 border border-amber-400/20 px-2 py-0.5 rounded-full">
          <Zap className="w-2.5 h-2.5" />
          Critical: {slowestSpan.service} ({slowestSpan.duration_ms}ms)
        </span>
      )}
    </div>
  )
}

function SpanRow({ span, totalMs, depth = 0 }: { span: TraceSpan; totalMs: number; depth?: number }) {
  const [expanded, setExpanded] = useState(false)
  const leftOffset = (span.start_time_ms % totalMs) / totalMs * 100  // Relative within trace
  const width = Math.max(1, (span.duration_ms / totalMs) * 100)
  const hasTags = Object.keys(span.tags).length > 0

  return (
    <>
      <motion.div
        initial={{ opacity: 0, x: -4 }}
        animate={{ opacity: 1, x: 0 }}
        className={`flex group items-center hover:bg-white/4 rounded-lg px-2 py-1 transition-colors cursor-pointer ${span.has_error ? 'bg-danger-rose/5' : ''}`}
        onClick={() => hasTags && setExpanded(!expanded)}
      >
        {/* Service name */}
        <div
          className="shrink-0 pr-3 flex items-center gap-1.5"
          style={{ width: 220, paddingLeft: depth * 16 }}
        >
          {hasTags && (
            <ChevronRight
              className={`w-2.5 h-2.5 text-text-muted transition-transform flex-shrink-0 ${expanded ? 'rotate-90' : ''}`}
            />
          )}
          <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: span.color }} />
          <div className="flex flex-col min-w-0">
            <span className="text-[10px] font-semibold text-white truncate">{span.service}</span>
            <span className="text-[8px] font-mono text-text-muted truncate">{span.operation}</span>
          </div>
        </div>

        {/* Waterfall bar */}
        <div className="flex-1 relative h-7 flex items-center">
          {/* Background line */}
          <div className="absolute inset-x-0 h-px bg-white/5 top-1/2" />

          {/* Span bar */}
          <div
            className={`absolute h-5 rounded flex items-center overflow-hidden transition-all group-hover:brightness-125 ${span.has_error ? 'animate-pulse' : ''}`}
            style={{
              left: `${Math.min(leftOffset, 95)}%`,
              width: `${Math.min(width, 100 - leftOffset)}%`,
              background: span.has_error
                ? 'rgba(242,73,92,0.25)'
                : `${span.color}22`,
              border: `1px solid ${span.has_error ? '#f2495c' : span.color}`,
              minWidth: 24,
            }}
          >
            <span
              className="px-1.5 text-[8px] font-mono whitespace-nowrap font-bold"
              style={{ color: span.has_error ? '#f2495c' : span.color }}
            >
              {span.duration_ms >= 1000 ? `${(span.duration_ms / 1000).toFixed(1)}s` : `${Math.round(span.duration_ms)}ms`}
            </span>
          </div>

          {/* Error dot */}
          {span.has_error && (
            <div
              className="absolute w-2 h-2 rounded-full bg-danger-rose animate-ping"
              style={{ left: `${Math.min(leftOffset, 95)}%`, marginLeft: -8, top: '50%', marginTop: -4 }}
            />
          )}
        </div>

        {/* Status */}
        <div className="w-12 text-right shrink-0">
          <span className={`text-[9px] font-mono font-bold ${span.has_error ? 'text-danger-rose' : 'text-text-muted'}`}>
            {span.status_code > 0 ? span.status_code : '—'}
          </span>
        </div>
      </motion.div>

      {/* Tags expandable */}
      <AnimatePresence>
        {expanded && hasTags && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden ml-8"
          >
            <div className="flex flex-wrap gap-1.5 px-4 pb-2 pt-1">
              {Object.entries(span.tags).map(([k, v]) => (
                <div key={k} className="flex items-center gap-1 text-[9px] font-mono bg-white/5 border border-white/8 px-2 py-0.5 rounded-full">
                  <Tag className="w-2 h-2 text-text-muted" />
                  <span className="text-text-muted">{k}:</span>
                  <span className={`${v.includes('error') || v.includes('Error') ? 'text-danger-rose font-bold' : 'text-white'}`}>{v}</span>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}

export function TraceWaterfall() {
  const [selectedTraceId, setSelectedTraceId] = useState<string | null>(null)
  const [serviceFilter, setServiceFilter] = useState<string>('')

  const { data: traces = [], isLoading, refetch } = useQuery<TraceItem[]>({
    queryKey: ['traces'],
    queryFn: fetchTraces,
    refetchInterval: 10000,
    staleTime: 8000,
  })

  const selectedTrace = traces.find(t => t.trace_id === selectedTraceId) || traces[0] || null
  const displayTraces = serviceFilter
    ? traces.filter(t => t.root_service.includes(serviceFilter) || t.spans.some(s => s.service.includes(serviceFilter)))
    : traces

  const totalMs = selectedTrace?.total_duration_ms || 1

  // Timeline axis labels
  const timeLabels = [0, 0.25, 0.5, 0.75, 1].map(p => {
    const ms = p * totalMs
    return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms)}ms`
  })

  return (
    <div className="flex-1 flex gap-4 overflow-hidden h-full">

      {/* ── Left: Trace List ─────────────────────────────────────────────── */}
      <div
        className="w-64 flex flex-col shrink-0 rounded-xl border overflow-hidden"
        style={{ background: 'rgba(7,8,12,0.96)', borderColor: 'rgba(255,255,255,0.08)' }}
      >
        <div className="p-3 border-b flex items-center justify-between" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
          <span className="text-[10px] font-bold text-text-muted uppercase tracking-widest">Recent Traces</span>
          <button
            onClick={() => refetch()}
            className="p-1 rounded hover:bg-white/8 text-text-muted hover:text-white transition-all"
          >
            <RefreshCw className="w-3 h-3" />
          </button>
        </div>

        {/* Filter */}
        <div className="px-3 py-2 border-b" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
          <div className="flex items-center gap-1.5 bg-white/5 rounded-lg px-2 py-1.5">
            <Filter className="w-3 h-3 text-text-muted" />
            <input
              type="text"
              placeholder="Filter by service…"
              value={serviceFilter}
              onChange={e => setServiceFilter(e.target.value)}
              className="bg-transparent text-[10px] font-mono text-white placeholder-text-muted focus:outline-none w-full"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="p-4 text-center text-text-muted text-xs">Loading traces…</div>
          ) : displayTraces.length === 0 ? (
            <div className="p-4 text-center text-text-muted text-xs">No traces found</div>
          ) : (
            displayTraces.map(trace => (
              <button
                key={trace.trace_id}
                onClick={() => setSelectedTraceId(trace.trace_id)}
                className={`w-full text-left px-3 py-2.5 border-b transition-all hover:bg-white/5 ${
                  (selectedTrace?.trace_id === trace.trace_id) ? 'bg-white/8 border-l-2 border-l-neon-cyan' : ''
                }`}
                style={{ borderBottomColor: 'rgba(255,255,255,0.05)' }}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded ${trace.has_error ? 'bg-danger-rose/20 text-danger-rose' : 'bg-success-emerald/15 text-success-emerald'}`}>
                    {trace.has_error ? 'ERROR' : 'OK'}
                  </span>
                  <span className={`text-[10px] font-bold font-mono ${trace.has_error ? 'text-danger-rose' : 'text-white'}`}>
                    {trace.total_duration_ms >= 1000 ? `${(trace.total_duration_ms / 1000).toFixed(1)}s` : `${Math.round(trace.total_duration_ms)}ms`}
                  </span>
                </div>
                <div className="text-[10px] font-semibold text-white truncate">{trace.root_service}</div>
                <div className="text-[9px] font-mono text-text-muted truncate mt-0.5">{trace.root_operation}</div>
                <div className="text-[8px] text-text-muted mt-0.5">{trace.span_count} spans · {new Date(trace.created_at * 1000).toLocaleTimeString()}</div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* ── Right: Waterfall Detail ──────────────────────────────────────── */}
      <div
        className="flex-1 flex flex-col overflow-hidden rounded-xl border"
        style={{ background: 'rgba(7,8,12,0.96)', borderColor: 'rgba(255,255,255,0.08)' }}
      >
        {selectedTrace ? (
          <>
            {/* Header */}
            <div className="px-5 py-3.5 border-b flex items-center justify-between" style={{ borderColor: 'rgba(255,255,255,0.07)', background: 'rgba(0,0,0,0.3)' }}>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-bold text-white text-sm">{selectedTrace.root_operation}</h3>
                  <span className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded ${selectedTrace.has_error ? 'bg-danger-rose/20 text-danger-rose' : 'bg-success-emerald/15 text-success-emerald'}`}>
                    {selectedTrace.has_error ? '502 ERROR' : '200 OK'}
                  </span>
                </div>
                <div className="text-[10px] text-text-muted font-mono">
                  {selectedTrace.trace_id} · {selectedTrace.span_count} spans · {new Date(selectedTrace.created_at * 1000).toLocaleString()}
                </div>
              </div>
              <div className="text-right">
                <div className={`text-2xl font-bold font-mono ${selectedTrace.has_error ? 'text-danger-rose' : 'text-white'}`}>
                  {selectedTrace.total_duration_ms >= 1000
                    ? `${(selectedTrace.total_duration_ms / 1000).toFixed(2)}s`
                    : `${Math.round(selectedTrace.total_duration_ms)}ms`}
                </div>
                <div className="text-[9px] text-text-muted uppercase tracking-widest">Total Duration</div>
              </div>
            </div>

            {/* Critical path bar */}
            <div className="px-5 py-2 border-b flex items-center gap-3" style={{ borderColor: 'rgba(255,255,255,0.05)', background: 'rgba(0,0,0,0.15)' }}>
              <span className="text-[9px] font-mono text-text-muted uppercase tracking-wider">Critical Path:</span>
              <CriticalPathHighlight spans={selectedTrace.spans} totalMs={totalMs} />
            </div>

            {/* Timeline axis */}
            <div className="flex items-center px-5 pt-3 pb-1.5" style={{ paddingLeft: 245 }}>
              <div className="flex-1 relative">
                <div className="flex justify-between text-[9px] font-mono text-text-muted">
                  {timeLabels.map((l, i) => <span key={i}>{l}</span>)}
                </div>
                <div className="flex mt-1">
                  {[25, 50, 75].map(p => (
                    <div key={p} className="absolute h-full w-px bg-white/5" style={{ left: `${p}%` }} />
                  ))}
                </div>
              </div>
              <div className="w-12 text-right text-[9px] font-mono text-text-muted">Status</div>
            </div>

            {/* Spans */}
            <div className="flex-1 overflow-y-auto px-3 pb-4">
              {selectedTrace.spans.map((span, i) => (
                <SpanRow key={span.span_id} span={span} totalMs={totalMs} depth={span.parent_span_id ? 1 : 0} />
              ))}
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-text-muted">
            <Zap className="w-10 h-10 opacity-20" />
            <p className="text-sm">Select a trace to inspect the waterfall</p>
          </div>
        )}
      </div>
    </div>
  )
}
