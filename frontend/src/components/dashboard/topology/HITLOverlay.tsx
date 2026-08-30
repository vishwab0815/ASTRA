'use client'

import React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { AlertTriangle, CheckCircle, XCircle, Brain, Clock, ArrowRight, Loader2 } from 'lucide-react'
import { approveAstraIncident, rejectAstraIncident } from '@/lib/api'
import { useQueryClient } from '@tanstack/react-query'

interface HITLIncident {
  thread_id: string
  alert_name: string
  pod: string
  namespace: string
  diagnosis?: string
  confidence?: number
  status: string
  created_at: string
}

interface HITLOverlayProps {
  incidents: HITLIncident[]
  onDismiss?: (threadId: string) => void
}

export function HITLOverlay({ incidents, onDismiss }: HITLOverlayProps) {
  const queryClient = useQueryClient()
  const [loadingId, setLoadingId] = React.useState<string | null>(null)
  const [completedIds, setCompletedIds] = React.useState<Set<string>>(new Set())

  const pendingIncidents = incidents.filter(
    i => i.status === 'paused' && !completedIds.has(i.thread_id)
  )

  const handleApprove = async (threadId: string) => {
    setLoadingId(threadId)
    const result = await approveAstraIncident(threadId)
    if (result.success) {
      setCompletedIds(prev => new Set([...prev, threadId]))
      queryClient.invalidateQueries({ queryKey: ['history'] })
    }
    setLoadingId(null)
  }

  const handleReject = async (threadId: string) => {
    setLoadingId(threadId)
    const result = await rejectAstraIncident(threadId)
    if (result.success) {
      setCompletedIds(prev => new Set([...prev, threadId]))
      queryClient.invalidateQueries({ queryKey: ['history'] })
    }
    setLoadingId(null)
  }

  if (pendingIncidents.length === 0) return null

  return (
    <div className="absolute top-6 left-1/2 -translate-x-1/2 z-40 flex flex-col gap-3 max-w-lg w-full px-4">
      <AnimatePresence>
        {pendingIncidents.slice(0, 3).map(incident => {
          const confidence = incident.confidence ?? 0
          const isLoading = loadingId === incident.thread_id
          const confColor = confidence >= 0.85 ? '#10b981' : confidence >= 0.65 ? '#f59e0b' : '#f2495c'

          return (
            <motion.div
              key={incident.thread_id}
              initial={{ opacity: 0, y: -20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.95 }}
              transition={{ type: 'spring', damping: 22, stiffness: 280 }}
              className="relative rounded-xl border overflow-hidden backdrop-blur-2xl shadow-2xl"
              style={{
                background: 'rgba(9,10,15,0.96)',
                borderColor: 'rgba(245,158,11,0.5)',
                boxShadow: '0 0 30px rgba(245,158,11,0.2), 0 8px 32px rgba(0,0,0,0.6)',
              }}
            >
              {/* Amber left accent */}
              <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-amber-500" />

              {/* Header */}
              <div className="flex items-center justify-between px-4 py-2.5 pl-5 border-b border-amber-500/20">
                <div className="flex items-center gap-2">
                  <motion.div
                    animate={{ scale: [1, 1.15, 1] }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                  >
                    <AlertTriangle className="w-4 h-4 text-amber-400" />
                  </motion.div>
                  <span className="text-[11px] font-bold text-amber-400 font-mono uppercase tracking-wider">
                    HITL Approval Required
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-[9px] font-mono text-text-muted">
                  <Clock className="w-3 h-3" />
                  {new Date(incident.created_at).toLocaleTimeString()}
                </div>
              </div>

              {/* Body */}
              <div className="px-4 py-3 pl-5 flex flex-col gap-2.5">
                {/* Alert & Pod */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold text-white">{incident.alert_name}</span>
                  <ArrowRight className="w-3 h-3 text-text-muted flex-shrink-0" />
                  <span className="text-[11px] font-mono text-neon-cyan">{incident.pod}</span>
                  <span className="text-[9px] font-mono text-text-muted bg-white/5 px-1.5 py-0.5 rounded border border-white/10">
                    ns:{incident.namespace}
                  </span>
                </div>

                {/* Diagnosis */}
                {incident.diagnosis && (
                  <div className="flex items-start gap-2">
                    <Brain className="w-3.5 h-3.5 text-violet-400 shrink-0 mt-0.5" />
                    <p className="text-[11px] text-text-secondary leading-relaxed line-clamp-2">
                      {incident.diagnosis}
                    </p>
                  </div>
                )}

                {/* Confidence bar */}
                <div className="flex items-center gap-3">
                  <span className="text-[9px] font-mono text-text-muted uppercase tracking-wider w-20 shrink-0">
                    AI Confidence
                  </span>
                  <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${confidence * 100}%` }}
                      transition={{ duration: 0.8, ease: 'easeOut' }}
                      className="h-full rounded-full"
                      style={{ background: confColor }}
                    />
                  </div>
                  <span
                    className="text-[10px] font-bold font-mono w-10 text-right"
                    style={{ color: confColor }}
                  >
                    {(confidence * 100).toFixed(0)}%
                  </span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex border-t border-white/5">
                <button
                  onClick={() => handleReject(incident.thread_id)}
                  disabled={isLoading}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-[11px] font-semibold text-danger-rose hover:bg-danger-rose/10 transition-all border-r border-white/5 disabled:opacity-50"
                >
                  {isLoading ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <XCircle className="w-3.5 h-3.5" />
                  )}
                  Reject Remediation
                </button>
                <button
                  onClick={() => handleApprove(incident.thread_id)}
                  disabled={isLoading}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-[11px] font-semibold text-success-emerald hover:bg-success-emerald/10 transition-all disabled:opacity-50"
                >
                  {isLoading ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <CheckCircle className="w-3.5 h-3.5" />
                  )}
                  Approve & Deploy
                </button>
              </div>
            </motion.div>
          )
        })}
      </AnimatePresence>

      {pendingIncidents.length > 3 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center text-[10px] font-mono text-amber-500 bg-amber-500/10 border border-amber-500/20 rounded-lg py-1.5"
        >
          +{pendingIncidents.length - 3} more pending HITL decisions
        </motion.div>
      )}
    </div>
  )
}
