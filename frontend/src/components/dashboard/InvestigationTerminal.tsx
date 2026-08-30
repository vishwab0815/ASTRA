import React from 'react'
import { Terminal, Server, Pause, Play, Activity } from 'lucide-react'
import { AstraIncident } from '@/types/astra'

interface InvestigationTerminalProps {
  incident: AstraIncident | null
  onApprove: (id: string) => void
  onReject: (id: string) => void
}

export function InvestigationTerminal({ incident, onApprove, onReject }: InvestigationTerminalProps) {
  if (!incident) {
    return (
      <section className="flex-1 flex items-center justify-center bg-obsidian relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-neon-blue/5 via-obsidian to-obsidian opacity-50" />
        <div className="text-center z-10 glass-panel p-8 max-w-md">
          <Activity className="w-12 h-12 text-neon-blue mx-auto mb-4 opacity-50" />
          <h2 className="text-xl font-bold text-text-primary mb-2">Astra Standby</h2>
          <p className="text-text-secondary text-sm">Select an incident from the feed to view the investigation terminal and GitOps diffs.</p>
        </div>
      </section>
    )
  }

  // Basic diff syntax highlighter helper
  const renderDiffLine = (line: string, i: number) => {
    if (line.startsWith('+')) {
      return <div key={i} className="text-success-emerald bg-success-emerald/10 px-2 rounded-sm">{line}</div>
    }
    if (line.startsWith('-')) {
      return <div key={i} className="text-danger-rose bg-danger-rose/10 px-2 rounded-sm">{line}</div>
    }
    if (line.startsWith('#') || line.startsWith('Branch')) {
      return <div key={i} className="text-text-muted">{line}</div>
    }
    return <div key={i} className="text-text-primary px-2">{line}</div>
  }

  return (
    <section className="flex-1 flex flex-col bg-obsidian relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-neon-blue/5 via-obsidian to-obsidian" />
      
      <div className="relative flex-1 overflow-y-auto p-8 z-10">
        {/* Header */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <h2 className="text-2xl font-bold text-text-primary mb-2 flex items-center gap-3">
              <Terminal className="w-6 h-6 text-neon-blue" />
              Incident: {incident.alert_name}
            </h2>
            <div className="flex gap-4 font-mono text-xs text-text-secondary">
              <span className="flex items-center gap-1"><Server className="w-3 h-3"/> {incident.pod}</span>
              <span>|</span>
              <span>Namespace: {incident.namespace}</span>
            </div>
          </div>
          
          {incident.status === 'paused' && (
            <div className="flex gap-3">
              <button 
                onClick={() => onReject(incident.thread_id)}
                className="flex items-center gap-2 px-6 py-2.5 rounded bg-danger-rose/10 hover:bg-danger-rose/20 text-danger-rose border border-danger-rose/30 transition-colors font-medium"
              >
                <Pause className="w-4 h-4" /> Reject Fix
              </button>
              <button 
                onClick={() => onApprove(incident.thread_id)}
                className="flex items-center gap-2 px-6 py-2.5 rounded bg-success-emerald/10 hover:bg-success-emerald/20 text-success-emerald border border-success-emerald/30 transition-colors font-medium shadow-[0_0_15px_rgba(16,185,129,0.15)] hover:shadow-[0_0_20px_rgba(16,185,129,0.25)]"
              >
                <Play className="w-4 h-4" /> Approve Patch
              </button>
            </div>
          )}
        </div>

        {/* AI Diagnosis */}
        {incident.diagnosis && (
          <div className="glass-panel p-6 mb-6">
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-xs uppercase tracking-widest text-neon-blue font-semibold">Astra AI Diagnosis</h3>
              <span className="text-xs font-mono text-text-muted border border-border-subtle rounded px-2 py-1">
                Confidence: {(incident.confidence * 100).toFixed(0)}%
              </span>
            </div>
            <p className="text-text-primary text-base leading-relaxed whitespace-pre-wrap">
              {incident.diagnosis}
            </p>
          </div>
        )}

        {/* Evidence Logs */}
        {incident.investigation_summary && (
          <div className="glass-panel overflow-hidden mb-6">
            <div className="bg-black/40 px-4 py-2 border-b border-border-subtle flex items-center gap-2 text-xs font-mono text-text-muted uppercase tracking-wider">
              <Terminal className="w-3 h-3" />
              Investigation Evidence
            </div>
            <div className="p-4 bg-black/60 font-mono text-sm overflow-x-auto text-text-secondary whitespace-pre-wrap leading-relaxed">
              {incident.investigation_summary}
            </div>
          </div>
        )}

        {/* Proposed GitOps Patch */}
        {incident.tool_result && (
          <div className="glass-panel overflow-hidden">
            <div className="bg-neon-blue/10 px-4 py-2 border-b border-neon-blue/20 flex items-center gap-2 text-xs font-mono text-neon-blue font-semibold uppercase tracking-wider">
              Tool Output / GitOps Patch
            </div>
            <div className="p-4 bg-[#1e1e1e] font-mono text-sm overflow-x-auto">
              {incident.tool_result.split('\n').map((line, i) => renderDiffLine(line, i))}
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
