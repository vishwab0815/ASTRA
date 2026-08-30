import React from 'react'
import { Activity, CheckCircle2, PauseCircle, AlertTriangle } from 'lucide-react'
import { IncidentStatus } from '@/types/astra'

interface StatusPillProps {
  status: IncidentStatus
}

export function StatusPill({ status }: StatusPillProps) {
  switch (status) {
    case 'started':
      return (
        <span className="text-xs font-mono text-neon-blue bg-neon-blue/10 px-2 py-0.5 rounded border border-neon-blue/20 flex items-center gap-1 w-fit">
          <Activity className="w-3 h-3 animate-pulse" />
          INVESTIGATING
        </span>
      )
    case 'resolved':
      return (
        <span className="text-xs font-mono text-success-emerald bg-success-emerald/10 px-2 py-0.5 rounded border border-success-emerald/20 flex items-center gap-1 w-fit">
          <CheckCircle2 className="w-3 h-3" />
          RESOLVED
        </span>
      )
    case 'paused':
      return (
        <span className="text-xs font-mono text-warning-amber bg-warning-amber/10 px-2 py-0.5 rounded border border-warning-amber/20 flex items-center gap-1 w-fit">
          <PauseCircle className="w-3 h-3" />
          APPROVAL NEEDED
        </span>
      )
    default:
      return (
        <span className="text-xs font-mono text-danger-rose bg-danger-rose/10 px-2 py-0.5 rounded border border-danger-rose/20 flex items-center gap-1 w-fit">
          <AlertTriangle className="w-3 h-3" />
          ERROR
        </span>
      )
  }
}
