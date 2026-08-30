import React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Activity, ArrowRight, ShieldCheck, Zap, Server } from 'lucide-react'

interface EdgePayloadModalProps {
  edge: any | null
  sourceNodeLabel?: string
  targetNodeLabel?: string
  onClose: () => void
}

export function EdgePayloadModal({ edge, sourceNodeLabel = 'Source', targetNodeLabel = 'Target', onClose }: EdgePayloadModalProps) {
  if (!edge) return null

  const isError = Boolean(edge.data?.isError)
  const latency = edge.data?.latency || (isError ? '485ms' : '14.2ms')
  const throughput = edge.data?.throughput || (isError ? '18 req/s' : '1,240 req/s')
  const protocol = edge.data?.protocol || 'gRPC / HTTP/2'

  return (
    <AnimatePresence>
      <div 
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0, y: 10 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0, y: 10 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          onClick={(e) => e.stopPropagation()}
          className="relative w-full max-w-lg bg-obsidian/95 border border-border-subtle rounded-2xl shadow-2xl overflow-hidden backdrop-blur-2xl flex flex-col"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-5 border-b border-border-subtle bg-black/40">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg border ${
                isError ? 'bg-danger-rose/10 border-danger-rose/30 text-danger-rose' : 'bg-neon-cyan/10 border-neon-cyan/30 text-neon-cyan'
              }`}>
                <Activity className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-text-primary flex items-center gap-2">
                  <span>{sourceNodeLabel}</span>
                  <ArrowRight className="w-4 h-4 text-text-muted" />
                  <span>{targetNodeLabel}</span>
                </h3>
                <p className="text-xs text-text-muted font-mono mt-0.5">SYNAPTIC LINK TELEMETRY</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-full hover:bg-white/10 text-text-muted hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Body */}
          <div className="p-6 flex flex-col gap-5">
            {/* Live Metrics Grid */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-black/50 border border-border-subtle rounded-xl p-3">
                <div className="text-[10px] font-mono text-text-muted uppercase">Latency (P99)</div>
                <div className={`text-lg font-bold font-mono mt-1 ${isError ? 'text-danger-rose' : 'text-neon-cyan'}`}>
                  {latency}
                </div>
              </div>
              <div className="bg-black/50 border border-border-subtle rounded-xl p-3">
                <div className="text-[10px] font-mono text-text-muted uppercase">Throughput</div>
                <div className="text-lg font-bold font-mono text-white mt-1">
                  {throughput}
                </div>
              </div>
              <div className="bg-black/50 border border-border-subtle rounded-xl p-3">
                <div className="text-[10px] font-mono text-text-muted uppercase">Protocol</div>
                <div className="text-xs font-bold font-mono text-text-secondary mt-2 truncate">
                  {protocol}
                </div>
              </div>
            </div>

            {/* Health & Error Distribution */}
            <div className="bg-black/40 border border-border-subtle rounded-xl p-4 flex flex-col gap-2">
              <div className="flex justify-between items-center text-xs font-mono">
                <span className="text-text-muted">Status Breakdown</span>
                <span className={isError ? 'text-danger-rose font-bold' : 'text-success-emerald font-bold'}>
                  {isError ? '94.2% Error Rate (504 Gateway Timeout)' : '99.8% Success (200 OK)'}
                </span>
              </div>
              <div className="h-2 bg-white/10 rounded-full overflow-hidden flex">
                <div className={`h-full ${isError ? 'bg-danger-rose w-[94%]' : 'bg-success-emerald w-[99.8%]'}`} />
                <div className={`h-full ${isError ? 'bg-white/20 w-[6%]' : 'bg-danger-rose w-[0.2%]'}`} />
              </div>
            </div>

            {/* Sample Payload Inspector */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono text-text-secondary uppercase tracking-wider">Live Packet Trace</span>
                <span className="text-[10px] font-mono text-neon-cyan bg-neon-cyan/10 px-2 py-0.5 rounded border border-neon-cyan/20">
                  TLS 1.3 (eBPF Captured)
                </span>
              </div>
              <div className="p-3.5 bg-[#0a0a0c] border border-border-subtle rounded-xl font-mono text-xs text-text-secondary overflow-x-auto">
                <div className="text-neon-cyan">POST /api/v1/authenticate HTTP/2</div>
                <div className="text-text-muted">Host: {targetNodeLabel}.internal</div>
                <div className="text-text-muted">X-Astra-Trace-ID: tr-789a2bc9f41e0</div>
                <div className="text-text-muted">Content-Type: application/grpc+proto</div>
                <div className="mt-2 text-text-primary">
                  {isError 
                    ? '{ "error": "upstream_service_timeout", "retry_count": 3, "circuit_state": "OPEN" }' 
                    : '{ "status": "verified", "claims": { "role": "operator", "pqc_sig": "valid" } }'}
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="p-4 bg-black/40 border-t border-border-subtle flex justify-between items-center">
            <div className="flex items-center gap-2 text-[11px] font-mono text-text-muted">
              <ShieldCheck className="w-4 h-4 text-neon-cyan" />
              <span>Inspected via eBPF Kernel Probe</span>
            </div>
            <button
              onClick={onClose}
              className="px-4 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-semibold text-white transition-colors"
            >
              Close
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  )
}
