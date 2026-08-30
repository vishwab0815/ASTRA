import React, { useMemo } from 'react'
import { Handle, Position } from '@xyflow/react'
import { motion } from 'framer-motion'
import {
  Server, Database, Globe, Layers, Cpu, Zap,
  MessageSquare, HardDrive, Radio, AlertTriangle, Clock, RotateCcw
} from 'lucide-react'
import type { TopologyNode as BackendNode } from '@/lib/api'

// ── Node type visual config ───────────────────────────────────────────────────
const NODE_CONFIG: Record<string, {
  icon: React.ElementType
  accentColor: string
  bgColor: string
  borderColor: string
  glowColor: string
  label: string
}> = {
  ingress:  { icon: Globe,          accentColor: '#00f0ff', bgColor: 'rgba(0,240,255,0.06)',  borderColor: 'rgba(0,240,255,0.3)',  glowColor: 'rgba(0,240,255,0.25)',  label: 'Gateway'        },
  service:  { icon: Server,         accentColor: '#818cf8', bgColor: 'rgba(129,140,248,0.06)', borderColor: 'rgba(129,140,248,0.3)', glowColor: 'rgba(129,140,248,0.2)', label: 'Deployment'     },
  worker:   { icon: Cpu,            accentColor: '#f59e0b', bgColor: 'rgba(245,158,11,0.06)', borderColor: 'rgba(245,158,11,0.3)', glowColor: 'rgba(245,158,11,0.2)',  label: 'CronJob/Worker' },
  database: { icon: Database,       accentColor: '#a855f7', bgColor: 'rgba(168,85,247,0.06)', borderColor: 'rgba(168,85,247,0.3)', glowColor: 'rgba(168,85,247,0.2)',  label: 'StatefulSet'    },
  cache:    { icon: HardDrive,      accentColor: '#10b981', bgColor: 'rgba(16,185,129,0.06)', borderColor: 'rgba(16,185,129,0.3)', glowColor: 'rgba(16,185,129,0.2)',  label: 'Cache'          },
  queue:    { icon: MessageSquare,  accentColor: '#f97316', bgColor: 'rgba(249,115,22,0.06)', borderColor: 'rgba(249,115,22,0.3)', glowColor: 'rgba(249,115,22,0.2)',  label: 'Message Queue'  },
  external: { icon: Radio,          accentColor: '#6b7280', bgColor: 'rgba(107,114,128,0.06)', borderColor: 'rgba(107,114,128,0.3)', glowColor: 'rgba(107,114,128,0.2)', label: 'External API'  },
}

const STATUS_CONFIG: Record<string, { dot: string; label: string; pulse: boolean }> = {
  healthy:  { dot: '#10b981', label: 'Running',  pulse: false },
  degraded: { dot: '#f59e0b', label: 'Degraded', pulse: true  },
  crashed:  { dot: '#f2495c', label: 'Error',    pulse: true  },
  pending:  { dot: '#818cf8', label: 'Pending',  pulse: true  },
}

interface ServiceNodeProps {
  id: string
  data: Partial<BackendNode> & {
    label?: string
    status?: string
    node_type?: string
    type?: string
    replicas?: number
    port?: string
    metrics?: any
    incidents?: string[]
    image?: string
    helm_release?: string
  }
  selected?: boolean
}

export function ServiceNode({ id, data, selected }: ServiceNodeProps) {
  const nodeType = data.node_type || data.type || 'service'
  const status   = data.status || 'healthy'
  const config   = NODE_CONFIG[nodeType] || NODE_CONFIG.service
  const statusCfg = STATUS_CONFIG[status] || STATUS_CONFIG.healthy

  const isCrashed  = status === 'crashed'
  const isDegraded = status === 'degraded'
  const isPending  = status === 'pending'
  const isHealthy  = status === 'healthy'

  const metrics = data.metrics || {
    cpu_percent: isCrashed ? 98.7 : isDegraded ? 62 : 18,
    mem_mb: 256,
    replicas: data.replicas || 1,
    ready_replicas: isCrashed ? 0 : data.replicas || 1,
    restart_count: isCrashed ? 14 : isDegraded ? 3 : 0,
    latency_p99_ms: isCrashed ? 520 : isDegraded ? 88 : 18,
    error_rate: isCrashed ? 0.94 : isDegraded ? 0.12 : 0.002,
  }

  const incidents = data.incidents || []
  const hasIncident = incidents.length > 0

  const floatDelay = useMemo(() => {
    const code = id.charCodeAt(id.length - 1) || 0
    return (code % 5) * 0.5
  }, [id])

  // Dynamic border/glow based on status
  const borderStyle = isCrashed
    ? { borderColor: '#f2495c', boxShadow: '0 0 24px rgba(242,73,92,0.35), inset 0 0 12px rgba(242,73,92,0.05)' }
    : isDegraded
    ? { borderColor: '#f59e0b', boxShadow: '0 0 16px rgba(245,158,11,0.25)' }
    : selected
    ? { borderColor: config.accentColor, boxShadow: `0 0 28px ${config.glowColor}` }
    : { borderColor: 'rgba(255,255,255,0.1)' }

  const cpuBarColor = metrics.cpu_percent > 80 ? '#f2495c' : metrics.cpu_percent > 60 ? '#f59e0b' : config.accentColor
  const cpuBarWidth = Math.min(metrics.cpu_percent, 100)

  return (
    <motion.div
      animate={isHealthy ? { y: [0, -4, 0] } : {}}
      transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut', delay: floatDelay }}
      className="relative select-none"
      style={{ width: 230 }}
    >
      {/* Outer Ambient Glow */}
      {(isCrashed || isDegraded || selected) && (
        <div
          className="absolute -inset-2 rounded-2xl opacity-60 blur-xl pointer-events-none transition-all duration-700"
          style={{
            background: isCrashed ? 'rgba(242,73,92,0.4)'
              : isDegraded ? 'rgba(245,158,11,0.3)'
              : config.glowColor
          }}
        />
      )}

      {/* HITL Incident Badge (top-right) */}
      {hasIncident && (
        <motion.div
          animate={{ scale: [1, 1.1, 1] }}
          transition={{ duration: 1.5, repeat: Infinity }}
          className="absolute -top-2.5 -right-2.5 z-10 flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold font-mono bg-amber-500 text-black shadow-lg"
        >
          <AlertTriangle className="w-2.5 h-2.5" />
          HITL
        </motion.div>
      )}

      {/* Main Card */}
      <div
        className="relative rounded-xl overflow-hidden border backdrop-blur-xl transition-all duration-300 cursor-pointer"
        style={{
          background: isCrashed ? 'rgba(20,5,8,0.95)' : `rgba(9,11,17,0.94)`,
          ...borderStyle,
        }}
      >
        {/* n8n-style LEFT ACCENT BAR */}
        <div
          className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l-xl"
          style={{ background: isCrashed ? '#f2495c' : isDegraded ? '#f59e0b' : config.accentColor }}
        />

        {/* ── Header Row ────────────────────────────────────────────────────── */}
        <div className="flex items-center gap-3 px-4 pt-3.5 pb-2.5 pl-5">
          {/* Icon */}
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border"
            style={{
              background: isCrashed ? 'rgba(242,73,92,0.12)' : config.bgColor,
              borderColor: isCrashed ? 'rgba(242,73,92,0.35)' : config.borderColor,
              color: isCrashed ? '#f2495c' : config.accentColor,
            }}
          >
            <config.icon className="w-4 h-4" />
          </div>

          {/* Name & Kind */}
          <div className="flex-1 min-w-0">
            <div className="text-[12px] font-semibold text-white truncate leading-tight font-sans">
              {data.label || 'Service'}
            </div>
            <div className="text-[9px] text-text-muted font-mono mt-0.5 flex items-center gap-1.5">
              <span style={{ color: config.accentColor }}>{config.label}</span>
              <span className="text-border-subtle">·</span>
              <span>:{data.port || '8080'}</span>
            </div>
          </div>

          {/* Status dot */}
          <div className="shrink-0 flex items-center gap-1.5">
            <div
              className="w-2 h-2 rounded-full"
              style={{
                background: statusCfg.dot,
                boxShadow: `0 0 8px ${statusCfg.dot}`,
                animation: statusCfg.pulse ? 'pulse 1.4s ease-in-out infinite' : 'none',
              }}
            />
          </div>
        </div>

        {/* ── Divider ───────────────────────────────────────────────────────── */}
        <div className="mx-4 h-px bg-white/5" />

        {/* ── Metrics Row ───────────────────────────────────────────────────── */}
        <div className="px-4 pl-5 py-2.5 flex flex-col gap-2">
          {/* CPU Bar */}
          <div className="flex flex-col gap-1">
            <div className="flex justify-between items-center">
              <span className="text-[9px] font-mono text-text-muted uppercase tracking-wider">CPU</span>
              <span
                className="text-[9px] font-mono font-bold"
                style={{ color: cpuBarColor }}
              >
                {metrics.cpu_percent.toFixed(1)}%
              </span>
            </div>
            <div className="h-1 bg-white/8 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-1000"
                style={{ width: `${cpuBarWidth}%`, background: cpuBarColor }}
              />
            </div>
          </div>

          {/* Stats Row */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {/* Replicas */}
              <div className="flex items-center gap-1 text-[9px] font-mono text-text-muted">
                <Layers className="w-2.5 h-2.5" style={{ color: config.accentColor }} />
                <span>
                  <span className="text-white font-semibold">{metrics.ready_replicas}</span>
                  /{metrics.replicas}
                </span>
              </div>

              {/* Latency */}
              <div className="flex items-center gap-1 text-[9px] font-mono text-text-muted">
                <Zap className="w-2.5 h-2.5 text-yellow-400" />
                <span className={isCrashed ? 'text-danger-rose font-bold' : 'text-white'}>
                  {metrics.latency_p99_ms > 1000
                    ? `${(metrics.latency_p99_ms / 1000).toFixed(1)}s`
                    : `${metrics.latency_p99_ms}ms`}
                </span>
              </div>
            </div>

            {/* Restart Count (only if > 0) */}
            {metrics.restart_count > 0 && (
              <div className="flex items-center gap-1 text-[9px] font-mono text-danger-rose">
                <RotateCcw className="w-2.5 h-2.5" />
                {metrics.restart_count}↺
              </div>
            )}

            {/* Helm release */}
            {data.helm_release && (
              <div className="text-[8px] font-mono text-text-muted bg-white/5 px-1.5 py-0.5 rounded border border-white/8">
                ⎈ {data.helm_release}
              </div>
            )}
          </div>
        </div>

        {/* ── Status Footer (error state only) ──────────────────────────────── */}
        {(isCrashed || isDegraded) && (
          <div
            className="px-4 pl-5 py-1.5 text-[9px] font-mono flex items-center gap-1.5"
            style={{
              background: isCrashed ? 'rgba(242,73,92,0.08)' : 'rgba(245,158,11,0.07)',
              color: isCrashed ? '#f2495c' : '#f59e0b',
              borderTop: `1px solid ${isCrashed ? 'rgba(242,73,92,0.2)' : 'rgba(245,158,11,0.2)'}`,
            }}
          >
            {isPending ? (
              <><Clock className="w-2.5 h-2.5" /> Healing in progress…</>
            ) : isCrashed ? (
              <><AlertTriangle className="w-2.5 h-2.5" /> CrashLoopBackOff · {metrics.restart_count} restarts</>
            ) : (
              <><AlertTriangle className="w-2.5 h-2.5" /> Degraded · {(metrics.error_rate * 100).toFixed(0)}% error rate</>
            )}
          </div>
        )}

        {/* React Flow Handles */}
        <Handle
          type="target"
          position={Position.Top}
          className="!w-3 !h-3 !border-2 !rounded-full transition-transform hover:scale-150"
          style={{
            background: '#0b0d13',
            borderColor: config.accentColor,
            boxShadow: `0 0 8px ${config.accentColor}80`,
            top: -6,
          }}
        />
        <Handle
          type="source"
          position={Position.Bottom}
          className="!w-3 !h-3 !border-2 !rounded-full transition-transform hover:scale-150"
          style={{
            background: '#0b0d13',
            borderColor: config.accentColor,
            boxShadow: `0 0 8px ${config.accentColor}80`,
            bottom: -6,
          }}
        />
      </div>
    </motion.div>
  )
}
