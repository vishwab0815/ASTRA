import React from 'react'
import { ShieldAlert, Server } from 'lucide-react'
import { AstraIncident } from '@/types/astra'
import { StatusPill } from '@/components/ui/StatusPill'

interface IncidentFeedProps {
  history?: AstraIncident[]
  isLoading: boolean
  error: Error | null
  selectedId: string | null
  onSelect: (id: string) => void
}

export function IncidentFeed({ history, isLoading, error, selectedId, onSelect }: IncidentFeedProps) {
  return (
    <aside className="w-full h-full glass-panel flex flex-col z-0 overflow-hidden">
      <div className="p-4 border-b border-border-subtle flex items-center justify-between bg-white/5 shrink-0">
        <h2 className="font-semibold text-text-secondary flex items-center gap-2 text-xs uppercase tracking-wider">
          <ShieldAlert className="w-4 h-4" />
          Active Incidents
        </h2>
      </div>
      
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {isLoading ? (
          <div className="text-center py-10 text-text-muted animate-pulse">Loading intelligence...</div>
        ) : error ? (
          <div className="text-center py-10 text-danger-rose bg-danger-rose/10 rounded border border-danger-rose/30">Failed to connect to Astra</div>
        ) : history?.length === 0 ? (
          <div className="text-center py-10 text-text-muted">All systems optimal.</div>
        ) : (
          history?.map((incident) => {
            const isSelected = selectedId === incident.thread_id
            return (
              <div 
                key={incident.thread_id} 
                onClick={() => onSelect(incident.thread_id)}
                className={`glass-panel p-4 cursor-pointer transition-colors border-l-2 ${
                  isSelected 
                    ? 'bg-white/10 border-l-neon-blue shadow-[0_0_15px_rgba(59,130,246,0.15)]' 
                    : 'hover:bg-white/5 border-l-transparent'
                }`}
              >
                <div className="flex items-start justify-between mb-2">
                  <StatusPill status={incident.status} />
                  <span className="text-[10px] text-text-muted">
                    {new Date(incident.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                  </span>
                </div>
                <h3 className="font-medium text-text-primary mb-1 truncate">{incident.alert_name}</h3>
                <div className="flex items-center gap-1.5 text-xs text-text-secondary font-mono">
                  <Server className="w-3 h-3" />
                  <span className="truncate">{incident.pod}</span>
                </div>
              </div>
            )
          })
        )}
      </div>
    </aside>
  )
}
