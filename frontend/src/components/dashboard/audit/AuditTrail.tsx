'use client'

import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchAuditTrail } from '@/lib/api'
import { Shield, Clock, ShieldCheck, FileCheck, CheckCircle2, AlertTriangle, User, RefreshCw, XCircle } from 'lucide-react'

export function AuditTrail() {
  const [statusFilter, setStatusFilter] = useState('all')

  const { data: records = [], isLoading, refetch } = useQuery<any[]>({
    queryKey: ['audit-trail', statusFilter],
    queryFn: () => fetchAuditTrail(100, statusFilter),
    refetchInterval: 10000,
  })

  return (
    <div className="flex-1 flex flex-col gap-4 overflow-hidden p-4 h-full">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Shield className="w-5 h-5 text-neon-cyan" /> Enterprise Audit Trail
          </h2>
          <p className="text-xs text-text-muted mt-1 font-mono">Immutable ledger of all HITL approvals, auto-remediations, and system actions.</p>
        </div>
        <div className="flex items-center gap-3">
          <select 
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="bg-obsidian border border-white/10 text-xs font-mono text-white px-3 py-1.5 rounded focus:outline-none focus:border-neon-cyan"
          >
            <option value="all">All Events</option>
            <option value="resolved">Resolved</option>
            <option value="paused">Pending Approval</option>
            <option value="aborted">Rejected</option>
          </select>
          <button onClick={() => refetch()} className="p-1.5 rounded hover:bg-white/10 text-text-muted transition-colors">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto rounded-xl border border-white/10 bg-black/40">
        {isLoading ? (
          <div className="flex justify-center items-center h-48 text-text-muted text-sm">Loading audit records...</div>
        ) : records.length === 0 ? (
          <div className="flex flex-col justify-center items-center h-48 text-text-muted gap-2">
            <ShieldCheck className="w-8 h-8 opacity-20" />
            <span className="text-sm">No audit records found</span>
          </div>
        ) : (
          <table className="w-full text-left border-collapse text-[11px] font-mono">
            <thead className="sticky top-0 bg-[#0a0a0f] border-b border-white/10 z-10">
              <tr>
                <th className="px-4 py-3 font-normal text-text-muted uppercase tracking-wider">Timestamp</th>
                <th className="px-4 py-3 font-normal text-text-muted uppercase tracking-wider">Event / Risk</th>
                <th className="px-4 py-3 font-normal text-text-muted uppercase tracking-wider">Target</th>
                <th className="px-4 py-3 font-normal text-text-muted uppercase tracking-wider">Operator</th>
                <th className="px-4 py-3 font-normal text-text-muted uppercase tracking-wider">Compliance</th>
                <th className="px-4 py-3 font-normal text-text-muted uppercase tracking-wider">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {records.map((r, i) => {
                const isAuto = r.event_type === 'auto_remediation'
                const isHighRisk = r.risk_level === 'high'
                
                return (
                  <tr key={i} className="hover:bg-white/5 transition-colors group">
                    <td className="px-4 py-3 whitespace-nowrap text-text-secondary">
                      {new Date(r.timestamp).toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {r.status === 'resolved' ? <CheckCircle2 className="w-3.5 h-3.5 text-success-emerald" /> : 
                         r.status === 'aborted' ? <XCircle className="w-3.5 h-3.5 text-danger-rose" /> :
                         <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />}
                        <span className={`font-bold ${
                          r.status === 'resolved' ? 'text-success-emerald' : 
                          r.status === 'aborted' ? 'text-danger-rose' : 'text-amber-400'
                        }`}>
                          {r.event_type.replace('_', ' ').toUpperCase()}
                        </span>
                        {isHighRisk && (
                          <span className="bg-danger-rose/20 text-danger-rose px-1.5 py-0.5 rounded text-[9px]">HIGH RISK</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-white font-bold">{r.pod || r.service || 'unknown'}</div>
                      <div className="text-[9px] text-text-muted">ns:{r.namespace}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        {isAuto ? <ShieldCheck className="w-3.5 h-3.5 text-neon-cyan" /> : <User className="w-3.5 h-3.5 text-violet-400" />}
                        <span className={isAuto ? 'text-neon-cyan' : 'text-violet-400'}>{r.operator_id}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        {r.compliance_tags?.map((tag: string) => (
                          <span key={tag} className="bg-white/10 text-text-secondary px-1.5 py-0.5 rounded border border-white/10">
                            {tag}
                          </span>
                        )) || <span className="text-text-muted">—</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-text-secondary max-w-[200px] truncate group-hover:whitespace-normal group-hover:max-w-md">
                      {r.tool ? `Executed: ${r.tool}` : (r.diagnosis || r.alert_name)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
