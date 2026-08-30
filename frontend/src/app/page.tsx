'use client'

import React, { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { AstraIncident } from '@/types/astra'
import { fetchAstraHistory, approveAstraIncident, rejectAstraIncident } from '@/lib/api'

import { SidebarNav, TabState } from '@/components/layout/SidebarNav'
import { GlobalHUD } from '@/components/layout/GlobalHUD'
import { MetricsHUD } from '@/components/dashboard/MetricsHUD'
import { ClusterTopology } from '@/components/dashboard/ClusterTopology'
import { IncidentFeed } from '@/components/dashboard/IncidentFeed'
import { InvestigationTerminal } from '@/components/dashboard/InvestigationTerminal'
import { TraceWaterfall } from '@/components/dashboard/traces/TraceWaterfall'
import { LogExplorer } from '@/components/dashboard/logs/LogExplorer'
import { AlertRulesBuilder } from '@/components/dashboard/alerts/AlertRulesBuilder'
import { CommandPalette } from '@/components/layout/CommandPalette'
import { AuditTrail } from '@/components/dashboard/audit/AuditTrail'
import { ClusterSelector } from '@/components/dashboard/clusters/ClusterSelector'

export default function Home() {
  const [activeTab, setActiveTab] = useState<TabState>('overview')
  const [selectedIncidentId, setSelectedIncidentId] = useState<string | null>(null)
  const queryClient = useQueryClient()

  const { data: history, isLoading, error } = useQuery({
    queryKey: ['history'],
    queryFn: fetchAstraHistory,
    refetchInterval: 5000,
  })

  const selectedIncident = history?.find(h => h.thread_id === selectedIncidentId) || null

  const handleApprove = async (id: string) => {
    const result = await approveAstraIncident(id)
    if (result.success) {
      alert('Fix approved! Astra is deploying the GitOps patch.')
      queryClient.invalidateQueries({ queryKey: ['history'] })
    } else {
      alert(`Failed to approve fix: ${result.error || 'Check Astra backend logs'}`)
    }
  }

  const handleReject = async (id: string) => {
    const result = await rejectAstraIncident(id)
    if (result.success) {
      alert('Fix rejected. Astra paused further action and marked workflow aborted.')
      queryClient.invalidateQueries({ queryKey: ['history'] })
    } else {
      alert(`Failed to reject fix: ${result.error || 'Check Astra backend logs'}`)
    }
  }

  return (
    <main className="flex h-screen overflow-hidden text-sm">
      <CommandPalette setActiveTab={setActiveTab} />
      {/* Left Sidebar Navigation */}
      <SidebarNav activeTab={activeTab} onTabChange={setActiveTab} />
      
      {/* Main Content Pane */}
      <section className="flex-1 flex flex-col relative overflow-hidden bg-obsidian">
        {/* Dynamic Background */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-neon-cyan/5 via-obsidian to-obsidian pointer-events-none" />
        
        {/* Simple top header (just for title) */}
        {activeTab !== 'topology' && <GlobalHUD />}
        
        <div className="flex-1 overflow-y-auto p-6 z-10">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="h-full"
            >
              {/* TAB 1: OVERVIEW (Bento Grid) */}
              {activeTab === 'overview' && (
                <div className="max-w-7xl mx-auto h-full flex flex-col">
                  <h2 className="text-2xl font-bold mb-6 text-text-primary tracking-wide">Global Overview</h2>
                  <MetricsHUD />
                </div>
              )}

              {/* TAB 2: TOPOLOGY MAP */}
              {activeTab === 'topology' && (
                <div className="h-full rounded-3xl overflow-hidden border border-border-subtle shadow-2xl">
                  <ClusterTopology />
                </div>
              )}

              {/* TAB 3: INCIDENTS (Workflow) */}
              {activeTab === 'incidents' && (
                <div className="flex h-full gap-6 max-w-[1600px] mx-auto w-full">
                  <div className="w-96 shrink-0 h-full">
                    <IncidentFeed 
                      history={history} 
                      isLoading={isLoading} 
                      error={error}
                      selectedId={selectedIncidentId}
                      onSelect={setSelectedIncidentId}
                    />
                  </div>
                  <div className="flex-1 h-full">
                    <div className="relative z-10 flex flex-col h-full bg-obsidian/40 backdrop-blur-3xl rounded-3xl border border-border-subtle shadow-2xl overflow-hidden">
                      <InvestigationTerminal 
                        incident={selectedIncident} 
                        onApprove={handleApprove}
                        onReject={handleReject}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 4: DISTRIBUTED TRACING */}
              {activeTab === 'traces' && (
                <div className="max-w-7xl mx-auto h-full flex flex-col">
                  <h2 className="text-2xl font-bold mb-6 text-text-primary tracking-wide">Distributed Tracing</h2>
                  <TraceWaterfall />
                </div>
              )}

              {/* TAB 5: LOG EXPLORER */}
              {activeTab === 'logs' && (
                <div className="max-w-7xl mx-auto h-full flex flex-col">
                  <h2 className="text-2xl font-bold mb-6 text-text-primary tracking-wide">Log Explorer</h2>
                  <LogExplorer />
                </div>
              )}

              {/* TAB 6: CORRELATION ENGINE (formerly Alert Rules) */}
              {activeTab === 'alerts' && (
                <div className="max-w-7xl mx-auto h-full flex flex-col">
                  <h2 className="text-2xl font-bold mb-6 text-text-primary tracking-wide">Correlation Engine</h2>
                  <AlertRulesBuilder />
                </div>
              )}

              {/* TAB 7: AUDIT TRAIL */}
              {activeTab === 'audit' && (
                <div className="max-w-7xl mx-auto h-full flex flex-col">
                  <AuditTrail />
                </div>
              )}

              {/* TAB 8: FLEET MANAGEMENT */}
              {activeTab === 'clusters' && (
                <div className="max-w-7xl mx-auto h-full flex flex-col">
                  <ClusterSelector />
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </section>
    </main>
  )
}
