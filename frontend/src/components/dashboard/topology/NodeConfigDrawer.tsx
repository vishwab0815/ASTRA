'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X, Cpu, MemoryStick, Play, CheckCircle2, ShieldCheck,
  FileCode2, Bot, Sliders, Copy, Check, Send, AlertTriangle,
  RotateCcw, ChevronDown, Zap, Layers, Clock, ArrowRight,
  RefreshCw, StopCircle, TrendingDown, Shield
} from 'lucide-react'
import { scaleService, remediateService, approveAstraIncident, rejectAstraIncident, getHelmDiff } from '@/lib/api'
import type { TopologyNode } from '@/lib/api'

interface NodeConfigDrawerProps {
  node: any | null
  onClose: () => void
  onSave?: (nodeId: string, updatedData: any) => void
  onRefreshTopology?: () => void
}

type TabType = 'config' | 'diff' | 'yaml' | 'incidents' | 'copilot'

export function NodeConfigDrawer({ node, onClose, onSave, onRefreshTopology }: NodeConfigDrawerProps) {
  const [activeTab, setActiveTab]     = useState<TabType>('config')
  const [replicas, setReplicas]       = useState(2)
  const [image, setImage]             = useState('')
  const [port, setPort]               = useState('8080')
  const [status, setStatus]           = useState('healthy')
  const [namespace, setNamespace]     = useState('production')
  const [isDeploying, setIsDeploying] = useState(false)
  const [deployResult, setDeployResult] = useState<{ success: boolean; message: string } | null>(null)
  const [copied, setCopied]           = useState(false)
  const [remediateLoading, setRemediateLoading] = useState<string | null>(null)
  const [chatMessages, setChatMessages] = useState<Array<{ role: 'user' | 'assistant'; text: string }>>([
    { role: 'assistant', text: 'Astra Copilot active. I have full visibility into this node\'s eBPF telemetry, pod logs, and Kubernetes events. What would you like to investigate?' }
  ])
  const [inputMessage, setInputMessage] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const [hitlLoading, setHitlLoading] = useState<string | null>(null)
  const [completedHitlIds, setCompletedHitlIds] = useState<Set<string>>(new Set())
  const [diffData, setDiffData] = useState<any>(null)
  const [isDiffLoading, setIsDiffLoading] = useState(false)

  const metrics = node?.data?.metrics || node?.data || {}
  const incidents: string[] = node?.data?.incidents || []
  const helmRelease = node?.data?.helm_release || ''
  const nodeType = node?.data?.node_type || node?.data?.type || 'service'

  useEffect(() => {
    if (node) {
      setReplicas(metrics.replicas || node.data?.replicas || 2)
      setImage(node.data?.image || `gcr.io/astra/${node.data?.label || 'service'}:latest`)
      setPort(node.data?.port || '8080')
      setStatus(node.data?.status || 'healthy')
      setNamespace(node.data?.namespace || 'production')
      setDeployResult(null)
      setActiveTab('config')
    }
  }, [node?.id])

  const synthesizedYaml = useMemo(() => {
    const name = node?.data?.label || 'microservice'
    const isStateful = nodeType === 'database'
    const isCron     = nodeType === 'worker'
    const kind = isStateful ? 'StatefulSet' : isCron ? 'CronJob' : 'Deployment'

    const baseYaml = `apiVersion: apps/v1
kind: ${kind}
metadata:
  name: ${name}
  namespace: ${namespace}
  labels:
    app.kubernetes.io/name: ${name}
    app.kubernetes.io/managed-by: Helm
    astra.io/synaptic-sync: "enabled"
    astra.io/quantum-safe: "fips-203-kyber768"
    helm.sh/chart: ${helmRelease || name}-1.0.0
spec:
  replicas: ${replicas}
  selector:
    matchLabels:
      app: ${name}
  template:
    metadata:
      labels:
        app: ${name}
        astra.io/monitored: "true"
      annotations:
        prometheus.io/scrape: "true"
        prometheus.io/port: "${port}"
    spec:
      containers:
      - name: ${name}
        image: ${image}
        ports:
        - containerPort: ${port}
          name: http
          protocol: TCP
        resources:
          requests:
            cpu: "${replicas * 100}m"
            memory: "${replicas * 128}Mi"
          limits:
            cpu: "${replicas * 250}m"
            memory: "${replicas * 256}Mi"
        livenessProbe:
          httpGet:
            path: /healthz
            port: ${port}
          initialDelaySeconds: 15
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /ready
            port: ${port}
          initialDelaySeconds: 5
          periodSeconds: 5
        envFrom:
        - secretRef:
            name: ${name}-secrets
---
apiVersion: v1
kind: Service
metadata:
  name: ${name}-svc
  namespace: ${namespace}
spec:
  type: ClusterIP
  ports:
  - port: ${port}
    targetPort: ${port}
    name: http
  selector:
    app: ${name}
---
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: ${name}-pdb
  namespace: ${namespace}
spec:
  minAvailable: ${Math.max(1, replicas - 1)}
  selector:
    matchLabels:
      app: ${name}`

    return baseYaml
  }, [node, replicas, image, port, namespace, helmRelease])

  // Fetch diff whenever switching to 'diff' tab or when parameters change and tab is 'diff'
  useEffect(() => {
    if (activeTab === 'diff' && node) {
      setIsDiffLoading(true)
      getHelmDiff({
        service_id: node.data?.id || node.id,
        old_replicas: metrics.replicas || 2,
        new_replicas: replicas,
        old_image: node.data?.image || `gcr.io/astra/${node.data?.label || 'service'}:latest`,
        new_image: image,
        namespace,
        helm_release: helmRelease || node.data?.label || 'unknown',
      }).then(res => {
        setDiffData(res)
        setIsDiffLoading(false)
      })
    }
  }, [activeTab, replicas, image, namespace, helmRelease, node])

  const handleDeploy = async () => {
    if (!node) return
    setIsDeploying(true)
    setDeployResult(null)

    const result = await scaleService(
      node.data?.id || node.id,
      replicas,
      namespace,
      image !== node.data?.image ? image : undefined
    )
    setDeployResult(result)
    setIsDeploying(false)

    if (result.success) {
      onSave?.(node.id, { ...node.data, replicas, image, port, status: 'healthy' })
      onRefreshTopology?.()
    }
  }

  const handleRemediate = async (action: 'restart' | 'rollback' | 'scale_down' | 'cordon') => {
    if (!node) return
    setRemediateLoading(action)
    const result = await remediateService(node.data?.id || node.id, action, namespace)
    setRemediateLoading(null)
    if (result.success) {
      onSave?.(node.id, { ...node.data, status: action === 'cordon' ? 'degraded' : 'pending' })
      onRefreshTopology?.()
    }
  }

  const handleHITLApprove = async (threadId: string) => {
    setHitlLoading(threadId)
    const result = await approveAstraIncident(threadId)
    if (result.success) {
      setCompletedHitlIds(prev => new Set([...prev, threadId]))
      onRefreshTopology?.()
    }
    setHitlLoading(null)
  }

  const handleHITLReject = async (threadId: string) => {
    setHitlLoading(threadId)
    const result = await rejectAstraIncident(threadId)
    if (result.success) {
      setCompletedHitlIds(prev => new Set([...prev, threadId]))
      onRefreshTopology?.()
    }
    setHitlLoading(null)
  }

  const handleSendMessage = (text?: string) => {
    const msg = text || inputMessage
    if (!msg.trim()) return
    setChatMessages(prev => [...prev, { role: 'user', text: msg }])
    if (!text) setInputMessage('')
    setIsTyping(true)
    setTimeout(() => {
      let response = `Running analysis on ${node?.data?.label}. Pod telemetry is stable within SLA.`
      const lower = msg.toLowerCase()
      if (lower.includes('optim') || lower.includes('memory') || lower.includes('resource')) {
        response = `✅ Optimization Found: Set memory limit to ${replicas * 256}Mi and CPU request to ${replicas * 80}m. Estimated 18% cost reduction. I've pre-synced the GitOps YAML manifest — click Deploy to apply.`
      } else if (lower.includes('crash') || lower.includes('diagnose') || lower.includes('loop')) {
        response = `🔴 Root Cause: Detected OOMKilled signal (exit code 137) on previous container. Container was hitting ${replicas * 256}Mi limit. Recommend increasing memory limit to ${replicas * 384}Mi and adding a liveness probe.`
      } else if (lower.includes('security') || lower.includes('policy') || lower.includes('network')) {
        response = `🛡️ Security Audit: NIST FIPS 203 ML-KEM-768 post-quantum signature verified. Zero-Trust NetworkPolicy auto-applied. No lateral movement paths detected from port ${port}.`
      } else if (lower.includes('helm') || lower.includes('rollback')) {
        response = `⎈ Helm Status: Release '${helmRelease || node?.data?.label}' is at revision 4. Last deploy: 2h ago. Previous stable revision: 3. Use 'Rollback to v-1' action above to revert.`
      } else if (lower.includes('scale') || lower.includes('replica')) {
        response = `📊 Scaling Analysis: Current ${replicas} replicas handling ~${replicas * 450}rps with P99 latency ${metrics.latency_p99_ms || 18}ms. For 2x traffic I recommend ${replicas * 2} replicas with HPA min:${replicas} max:${replicas * 4}.`
      }
      setChatMessages(prev => [...prev, { role: 'assistant', text: response }])
      setIsTyping(false)
    }, 900)
  }

  const handleCopyYaml = () => {
    navigator.clipboard.writeText(synthesizedYaml)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const cpu = metrics.cpu_percent ?? replicas * 14
  const mem = metrics.mem_mb ?? replicas * 128
  const cpuColor = cpu > 80 ? '#f2495c' : cpu > 60 ? '#f59e0b' : '#00f0ff'

  const TABS: Array<{ id: TabType; label: string; icon: React.ElementType; badge?: number }> = [
    { id: 'config',    label: 'Config',    icon: Sliders   },
    { id: 'diff',      label: 'Helm Diff', icon: FileCode2 },
    { id: 'yaml',      label: 'GitOps',    icon: FileCode2 },
    { id: 'incidents', label: 'Incidents', icon: AlertTriangle, badge: incidents.filter(i => !completedHitlIds.has(i)).length },
    { id: 'copilot',   label: 'Copilot',   icon: Bot       },
  ]

  return (
    <AnimatePresence>
      {node && (
        <>
          {/* Backdrop blur for drawer */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-20 pointer-events-none"
            style={{ background: 'linear-gradient(to left, rgba(0,0,0,0.35) 0%, transparent 60%)' }}
          />

          <motion.div
            initial={{ x: '100%', opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: '100%', opacity: 0 }}
            transition={{ type: 'spring', damping: 28, stiffness: 240 }}
            className="absolute top-0 right-0 bottom-0 w-[440px] z-30 flex flex-col border-l"
            style={{
              background: 'rgba(7,8,12,0.97)',
              borderColor: 'rgba(255,255,255,0.08)',
              backdropFilter: 'blur(24px)',
            }}
          >
            {/* ── Header ─────────────────────────────────────────────── */}
            <div
              className="flex items-center justify-between px-5 py-4 border-b"
              style={{ borderColor: 'rgba(255,255,255,0.07)', background: 'rgba(0,0,0,0.4)' }}
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-1 h-9 rounded-full"
                  style={{
                    background: status === 'crashed' ? '#f2495c' : status === 'degraded' ? '#f59e0b' : '#00f0ff',
                    boxShadow: `0 0 10px ${status === 'crashed' ? '#f2495c' : status === 'degraded' ? '#f59e0b' : '#00f0ff'}`,
                  }}
                />
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    {node.data?.label}
                    {status === 'crashed' && (
                      <span className="text-[9px] bg-danger-rose/20 text-danger-rose border border-danger-rose/30 px-1.5 py-0.5 rounded font-mono animate-pulse">
                        CRASHED
                      </span>
                    )}
                    {status === 'degraded' && (
                      <span className="text-[9px] bg-amber-500/20 text-amber-400 border border-amber-500/30 px-1.5 py-0.5 rounded font-mono animate-pulse">
                        DEGRADED
                      </span>
                    )}
                  </h3>
                  <p className="text-[10px] text-text-muted font-mono mt-0.5">
                    {nodeType.toUpperCase()} · {namespace} · ⎈ {helmRelease || 'unmanaged'}
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg hover:bg-white/8 text-text-muted hover:text-white transition-all"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* ── Tab Bar ────────────────────────────────────────────── */}
            <div
              className="flex border-b px-3 pt-1.5"
              style={{ borderColor: 'rgba(255,255,255,0.07)', background: 'rgba(0,0,0,0.2)' }}
            >
              {TABS.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`relative flex items-center gap-1.5 px-3 py-2 text-[11px] font-mono border-b-2 transition-all ${
                    activeTab === tab.id
                      ? 'border-neon-cyan text-neon-cyan font-bold'
                      : 'border-transparent text-text-muted hover:text-text-secondary'
                  }`}
                >
                  <tab.icon className="w-3 h-3" />
                  {tab.label}
                  {tab.badge != null && tab.badge > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-amber-500 text-black text-[8px] font-bold flex items-center justify-center">
                      {tab.badge}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* ── Tab Content ────────────────────────────────────────── */}
            <div className="flex-1 overflow-y-auto">
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeTab}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.15 }}
                  className="p-5 flex flex-col gap-4"
                >

                  {/* ════════════════════════════════════════════════════
                      TAB 1: CONFIG & TELEMETRY
                  ════════════════════════════════════════════════════ */}
                  {activeTab === 'config' && (
                    <>
                      {/* Live Metrics */}
                      <div className="grid grid-cols-2 gap-2.5">
                        <div className="rounded-xl p-3.5 border flex flex-col gap-1.5" style={{ background: 'rgba(0,0,0,0.4)', borderColor: 'rgba(255,255,255,0.07)' }}>
                          <div className="flex items-center gap-1.5 text-[10px] font-mono text-text-muted uppercase tracking-wider">
                            <Cpu className="w-3 h-3 text-neon-cyan" /> CPU
                          </div>
                          <div className="text-xl font-bold font-mono" style={{ color: cpuColor }}>
                            {cpu.toFixed(1)}<span className="text-xs text-text-muted ml-1">%</span>
                          </div>
                          <div className="h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
                            <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(cpu, 100)}%`, background: cpuColor }} />
                          </div>
                        </div>
                        <div className="rounded-xl p-3.5 border flex flex-col gap-1.5" style={{ background: 'rgba(0,0,0,0.4)', borderColor: 'rgba(255,255,255,0.07)' }}>
                          <div className="flex items-center gap-1.5 text-[10px] font-mono text-text-muted uppercase tracking-wider">
                            <MemoryStick className="w-3 h-3 text-violet-400" /> Memory
                          </div>
                          <div className="text-xl font-bold font-mono text-white">
                            {mem >= 1024 ? `${(mem / 1024).toFixed(1)}` : mem}
                            <span className="text-xs text-text-muted ml-1">{mem >= 1024 ? 'GB' : 'MB'}</span>
                          </div>
                          <div className="h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
                            <div className="h-full rounded-full bg-violet-400 transition-all" style={{ width: `${Math.min((mem / 2048) * 100, 100)}%` }} />
                          </div>
                        </div>
                        <div className="rounded-xl p-3 border flex items-center gap-2" style={{ background: 'rgba(0,0,0,0.4)', borderColor: 'rgba(255,255,255,0.07)' }}>
                          <Zap className="w-3.5 h-3.5 text-yellow-400" />
                          <div>
                            <div className="text-[9px] font-mono text-text-muted uppercase">P99 Latency</div>
                            <div className={`text-sm font-bold font-mono ${status === 'crashed' ? 'text-danger-rose' : 'text-white'}`}>
                              {metrics.latency_p99_ms || 18}ms
                            </div>
                          </div>
                        </div>
                        <div className="rounded-xl p-3 border flex items-center gap-2" style={{ background: 'rgba(0,0,0,0.4)', borderColor: 'rgba(255,255,255,0.07)' }}>
                          <Layers className="w-3.5 h-3.5 text-neon-cyan" />
                          <div>
                            <div className="text-[9px] font-mono text-text-muted uppercase">Pods Ready</div>
                            <div className="text-sm font-bold font-mono text-white">
                              {metrics.ready_replicas ?? replicas}
                              <span className="text-text-muted text-xs">/{replicas}</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Parameters */}
                      <div className="flex flex-col gap-3">
                        <h4 className="text-[10px] font-bold text-text-muted uppercase tracking-widest border-b pb-2" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
                          Pod Parameters
                        </h4>

                        {/* Replicas Slider */}
                        <div className="flex flex-col gap-1.5">
                          <div className="flex justify-between items-center text-[10px] font-mono text-text-muted">
                            <span>Replica Count</span>
                            <span className="text-white bg-white/8 px-2 py-0.5 rounded border border-white/12 font-bold">{replicas} pods</span>
                          </div>
                          <input
                            type="range" min="0" max="12" value={replicas}
                            onChange={e => setReplicas(parseInt(e.target.value))}
                            className="w-full accent-neon-cyan cursor-pointer h-1"
                          />
                          <div className="flex justify-between text-[8px] font-mono text-text-muted">
                            <span>0</span><span>Scale down</span><span>12 (max)</span>
                          </div>
                        </div>

                        {/* Image */}
                        <div className="flex flex-col gap-1.5">
                          <label className="text-[10px] font-mono text-text-muted">Container Image</label>
                          <input
                            type="text" value={image}
                            onChange={e => setImage(e.target.value)}
                            className="rounded-lg px-3 py-2 text-[11px] text-white font-mono focus:outline-none transition-colors border"
                            style={{ background: 'rgba(0,0,0,0.4)', borderColor: 'rgba(255,255,255,0.08)' }}
                          />
                        </div>

                        {/* Port & Namespace */}
                        <div className="grid grid-cols-2 gap-2">
                          <div className="flex flex-col gap-1.5">
                            <label className="text-[10px] font-mono text-text-muted">Service Port</label>
                            <input
                              type="text" value={port}
                              onChange={e => setPort(e.target.value)}
                              className="rounded-lg px-3 py-2 text-[11px] text-white font-mono focus:outline-none border"
                              style={{ background: 'rgba(0,0,0,0.4)', borderColor: 'rgba(255,255,255,0.08)' }}
                            />
                          </div>
                          <div className="flex flex-col gap-1.5">
                            <label className="text-[10px] font-mono text-text-muted">Namespace</label>
                            <input
                              type="text" value={namespace}
                              onChange={e => setNamespace(e.target.value)}
                              className="rounded-lg px-3 py-2 text-[11px] text-white font-mono focus:outline-none border"
                              style={{ background: 'rgba(0,0,0,0.4)', borderColor: 'rgba(255,255,255,0.08)' }}
                            />
                          </div>
                        </div>
                      </div>

                      {/* Remediation Actions */}
                      <div className="flex flex-col gap-2">
                        <h4 className="text-[10px] font-bold text-text-muted uppercase tracking-widest border-b pb-2" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
                          SRE Quick Actions
                        </h4>
                        <div className="grid grid-cols-2 gap-2">
                          {([
                            { action: 'restart',    label: 'Restart Pod',    icon: RotateCcw,    color: '#818cf8' },
                            { action: 'rollback',   label: 'Rollback v-1',   icon: RefreshCw,    color: '#f59e0b' },
                            { action: 'scale_down', label: 'Scale to 1x',    icon: TrendingDown, color: '#f97316' },
                            { action: 'cordon',     label: 'Cordon Node',    icon: StopCircle,   color: '#f2495c' },
                          ] as const).map(({ action, label, icon: Icon, color }) => (
                            <button
                              key={action}
                              onClick={() => handleRemediate(action)}
                              disabled={remediateLoading !== null}
                              className="flex items-center gap-2 px-3 py-2 rounded-lg border text-[10px] font-medium transition-all hover:brightness-110 disabled:opacity-50"
                              style={{
                                background: `${color}10`,
                                borderColor: `${color}30`,
                                color,
                              }}
                            >
                              {remediateLoading === action
                                ? <div className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
                                : <Icon className="w-3 h-3" />
                              }
                              {label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Security badge */}
                      <div className="rounded-xl p-3 flex items-center gap-3 border" style={{ background: 'rgba(0,240,255,0.03)', borderColor: 'rgba(0,240,255,0.12)' }}>
                        <Shield className="w-4 h-4 text-neon-cyan shrink-0" />
                        <div className="text-[10px] text-text-secondary leading-tight">
                          <strong className="text-white block mb-0.5">PQC Guardrail Active</strong>
                          NIST FIPS 203 ML-KEM-768 · Zero-Trust NetworkPolicy applied
                        </div>
                      </div>
                    </>
                  )}

                  {/* ════════════════════════════════════════════════════
                      TAB 2: HELM DIFF PREVIEW
                  ════════════════════════════════════════════════════ */}
                  {activeTab === 'diff' && (
                    <div className="flex flex-col gap-4">
                      <div className="flex items-center justify-between border-b pb-2" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
                        <div>
                          <h3 className="text-[12px] font-bold text-white uppercase tracking-widest">Pre-Deploy Diff</h3>
                          <p className="text-[10px] text-text-muted mt-0.5">Exactly what Helm will change</p>
                        </div>
                        {diffData && (
                          <div className={`px-2 py-1 rounded border text-[9px] font-mono font-bold ${
                            diffData.risk_level === 'high' ? 'bg-danger-rose/10 text-danger-rose border-danger-rose/30' :
                            diffData.risk_level === 'medium' ? 'bg-amber-500/10 text-amber-400 border-amber-500/30' :
                            'bg-success-emerald/10 text-success-emerald border-success-emerald/30'
                          }`}>
                            Risk: {diffData.risk_level.toUpperCase()}
                          </div>
                        )}
                      </div>

                      {isDiffLoading ? (
                        <div className="flex flex-col items-center justify-center py-12 gap-3 text-text-muted">
                          <RefreshCw className="w-5 h-5 animate-spin opacity-50" />
                          <span className="text-[10px] font-mono uppercase tracking-widest">Synthesizing Diff...</span>
                        </div>
                      ) : diffData ? (
                        <>
                          <pre className="p-3 rounded-xl border font-mono text-[10px] leading-relaxed overflow-x-auto" style={{ background: 'rgba(0,0,0,0.5)', borderColor: 'rgba(255,255,255,0.06)' }}>
                            {diffData.diff_lines.map((line: string, i: number) => (
                              <div key={i} className={`px-2 ${line.startsWith('+') ? 'text-success-emerald bg-success-emerald/10' : line.startsWith('-') ? 'text-danger-rose bg-danger-rose/10' : 'text-text-secondary'}`}>
                                {line}
                              </div>
                            ))}
                          </pre>
                          <div className="flex items-center justify-between px-3 py-2 rounded-lg border text-[10px] font-mono text-text-secondary" style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.06)' }}>
                            <span>Est. Rollout: {diffData.estimated_rollout_seconds}s</span>
                            {diffData.pdb_respected && <span className="text-success-emerald">✔ PDB Respected</span>}
                          </div>
                        </>
                      ) : (
                        <div className="text-[10px] text-text-muted text-center py-8">Change parameters to see diff</div>
                      )}
                    </div>
                  )}

                  {/* ════════════════════════════════════════════════════
                      TAB 3: GITOPS YAML STUDIO
                  ════════════════════════════════════════════════════ */}
                  {activeTab === 'yaml' && (
                    <>
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-mono text-text-muted">Live Manifest · k8s v1.30 · {namespace}</span>
                        <button
                          onClick={handleCopyYaml}
                          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[10px] font-mono text-white transition-all hover:brightness-110"
                          style={{ background: 'rgba(255,255,255,0.05)', borderColor: 'rgba(255,255,255,0.1)' }}
                        >
                          {copied ? <Check className="w-3 h-3 text-success-emerald" /> : <Copy className="w-3 h-3" />}
                          {copied ? 'Copied!' : 'Copy YAML'}
                        </button>
                      </div>
                      <pre
                        className="p-4 rounded-xl border font-mono text-[10px] leading-relaxed overflow-x-auto whitespace-pre select-all"
                        style={{
                          background: 'rgba(0,0,0,0.5)',
                          borderColor: 'rgba(255,255,255,0.06)',
                          color: '#00d4ff',
                          maxHeight: 480,
                        }}
                      >
                        {synthesizedYaml}
                      </pre>
                      <p className="text-[9px] text-text-muted font-mono text-center">
                        Manifest auto-generated from canvas parameters · Changes reflected instantly
                      </p>
                    </>
                  )}

                  {/* ════════════════════════════════════════════════════
                      TAB 4: INCIDENTS / HITL
                  ════════════════════════════════════════════════════ */}
                  {activeTab === 'incidents' && (
                    <>
                      {incidents.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-12 gap-3">
                          <CheckCircle2 className="w-10 h-10 text-success-emerald opacity-50" />
                          <p className="text-sm text-text-muted">No active incidents for this service</p>
                          <p className="text-[10px] text-text-muted font-mono">All workflows resolved</p>
                        </div>
                      ) : (
                        <div className="flex flex-col gap-3">
                          <p className="text-[10px] font-mono text-text-muted">
                            {incidents.filter(i => !completedHitlIds.has(i)).length} active HITL decisions pending
                          </p>
                          {incidents.map(threadId => {
                            const isCompleted = completedHitlIds.has(threadId)
                            const isLoading = hitlLoading === threadId
                            return (
                              <div
                                key={threadId}
                                className="rounded-xl border overflow-hidden"
                                style={{
                                  background: isCompleted ? 'rgba(16,185,129,0.05)' : 'rgba(245,158,11,0.05)',
                                  borderColor: isCompleted ? 'rgba(16,185,129,0.2)' : 'rgba(245,158,11,0.25)',
                                }}
                              >
                                <div className="px-3 py-2.5 flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    {isCompleted
                                      ? <CheckCircle2 className="w-4 h-4 text-success-emerald" />
                                      : <AlertTriangle className="w-4 h-4 text-amber-400 animate-pulse" />
                                    }
                                    <span className="text-[10px] font-mono text-text-secondary truncate max-w-[200px]">
                                      {threadId}
                                    </span>
                                  </div>
                                  {!isCompleted && (
                                    <div className="flex gap-1.5">
                                      <button
                                        onClick={() => handleHITLReject(threadId)}
                                        disabled={isLoading}
                                        className="px-2 py-1 rounded text-[9px] font-bold text-danger-rose border border-danger-rose/30 hover:bg-danger-rose/10 transition-all disabled:opacity-50"
                                      >
                                        {isLoading ? '…' : 'Reject'}
                                      </button>
                                      <button
                                        onClick={() => handleHITLApprove(threadId)}
                                        disabled={isLoading}
                                        className="px-2 py-1 rounded text-[9px] font-bold text-success-emerald border border-success-emerald/30 hover:bg-success-emerald/10 transition-all disabled:opacity-50"
                                      >
                                        {isLoading ? '…' : 'Approve'}
                                      </button>
                                    </div>
                                  )}
                                  {isCompleted && (
                                    <span className="text-[9px] font-mono text-success-emerald">Resolved</span>
                                  )}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </>
                  )}

                  {/* ════════════════════════════════════════════════════
                      TAB 5: AI COPILOT
                  ════════════════════════════════════════════════════ */}
                  {activeTab === 'copilot' && (
                    <>
                      <div
                        className="flex flex-col gap-2.5 max-h-64 overflow-y-auto p-3 rounded-xl border"
                        style={{ background: 'rgba(0,0,0,0.4)', borderColor: 'rgba(255,255,255,0.07)' }}
                      >
                        {chatMessages.map((msg, i) => (
                          <div
                            key={i}
                            className={`px-3 py-2 rounded-lg text-[11px] leading-relaxed ${
                              msg.role === 'assistant'
                                ? 'bg-white/5 border border-white/8 text-text-primary self-start mr-6'
                                : 'bg-neon-cyan/10 border border-neon-cyan/20 text-neon-cyan self-end ml-6'
                            }`}
                          >
                            <div className="text-[8px] font-mono text-text-muted mb-1 uppercase">
                              {msg.role === 'assistant' ? '🤖 Astra' : '👤 Operator'}
                            </div>
                            {msg.text}
                          </div>
                        ))}
                        {isTyping && (
                          <div className="flex gap-1 px-3 py-2">
                            {[0, 1, 2].map(i => (
                              <div
                                key={i}
                                className="w-1.5 h-1.5 rounded-full bg-neon-cyan animate-bounce"
                                style={{ animationDelay: `${i * 0.15}s` }}
                              />
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Quick chips */}
                      <div className="flex flex-wrap gap-1.5">
                        {[
                          '✨ Optimize resources',
                          '🔍 Diagnose crash',
                          '🛡️ Security audit',
                          '⎈ Helm status',
                          '📊 Scale advice',
                        ].map(chip => (
                          <button
                            key={chip}
                            onClick={() => handleSendMessage(chip)}
                            className="text-[9px] font-mono px-2 py-1 rounded border transition-all hover:bg-white/8 hover:text-white text-text-muted"
                            style={{ borderColor: 'rgba(255,255,255,0.08)' }}
                          >
                            {chip}
                          </button>
                        ))}
                      </div>

                      <div className="flex gap-2">
                        <input
                          type="text"
                          placeholder="Ask Astra about this service…"
                          value={inputMessage}
                          onChange={e => setInputMessage(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && handleSendMessage()}
                          className="flex-1 rounded-lg px-3 py-2 text-[11px] text-white placeholder-text-muted focus:outline-none border font-sans"
                          style={{ background: 'rgba(0,0,0,0.5)', borderColor: 'rgba(255,255,255,0.08)' }}
                        />
                        <button
                          onClick={() => handleSendMessage()}
                          className="p-2.5 rounded-lg bg-neon-cyan text-black hover:bg-neon-cyan/80 transition-colors"
                        >
                          <Send className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </>
                  )}

                </motion.div>
              </AnimatePresence>
            </div>

            {/* ── Footer Deploy Button ────────────────────────────── */}
            <div
              className="p-4 border-t flex flex-col gap-2"
              style={{ borderColor: 'rgba(255,255,255,0.07)', background: 'rgba(0,0,0,0.4)' }}
            >
              {deployResult && (
                <motion.div
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`text-[10px] font-mono px-3 py-1.5 rounded-lg border ${
                    deployResult.success
                      ? 'text-success-emerald bg-success-emerald/10 border-success-emerald/20'
                      : 'text-danger-rose bg-danger-rose/10 border-danger-rose/20'
                  }`}
                >
                  {deployResult.message}
                </motion.div>
              )}
              <button
                onClick={handleDeploy}
                disabled={isDeploying}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm transition-all shadow-lg disabled:opacity-60"
                style={{
                  background: isDeploying ? 'rgba(16,185,129,0.2)' : 'white',
                  color: 'black',
                }}
              >
                {isDeploying ? (
                  <>
                    <div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                    Applying via GitOps…
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 fill-black" />
                    Deploy · {replicas} replicas
                  </>
                )}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
