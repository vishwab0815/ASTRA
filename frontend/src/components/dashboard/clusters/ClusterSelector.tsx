'use client'

import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchClusters, selectCluster } from '@/lib/api'
import { Server, Activity, ArrowRight, Layers, LayoutGrid, CheckCircle2, AlertTriangle, ShieldAlert } from 'lucide-react'

export function ClusterSelector() {
  const [activeClusterId, setActiveClusterId] = useState<string>('prod-us-east-1')

  const { data: clusters = [], isLoading } = useQuery<any[]>({
    queryKey: ['clusters'],
    queryFn: fetchClusters,
    refetchInterval: 15000,
  })

  const handleSelect = async (id: string) => {
    setActiveClusterId(id)
    await selectCluster(id)
    // In a real app, this would trigger a global context refresh for topology/traces
  }

  return (
    <div className="flex-1 flex flex-col gap-4 overflow-hidden p-4 h-full">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <LayoutGrid className="w-5 h-5 text-neon-cyan" /> Multi-Cluster Fleet Management
          </h2>
          <p className="text-xs text-text-muted mt-1 font-mono">Manage and observe Astra deployments across your entire global infrastructure.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {isLoading ? (
          <div className="col-span-full py-12 text-center text-text-muted text-sm">Loading fleet registry...</div>
        ) : (
          clusters.map(cluster => {
            const isActive = activeClusterId === cluster.id
            const isDegraded = cluster.status === 'degraded'
            const StatusIcon = isDegraded ? AlertTriangle : CheckCircle2
            
            return (
              <button
                key={cluster.id}
                onClick={() => handleSelect(cluster.id)}
                className={`relative flex flex-col text-left p-4 rounded-xl border transition-all hover:-translate-y-1 ${
                  isActive 
                    ? 'bg-neon-cyan/5 border-neon-cyan/30 shadow-[0_0_15px_rgba(0,240,255,0.1)]' 
                    : 'bg-black/40 border-white/10 hover:bg-white/5'
                }`}
              >
                {/* Active indicator */}
                {isActive && (
                  <div className="absolute top-0 right-4 px-2 py-0.5 bg-neon-cyan text-black text-[9px] font-bold rounded-b-md uppercase tracking-wider">
                    Active Context
                  </div>
                )}
                
                <div className="flex items-center justify-between mb-4 w-full">
                  <div className="flex items-center gap-2">
                    <div className={`p-1.5 rounded-lg ${isActive ? 'bg-neon-cyan/20' : 'bg-white/10'}`}>
                      <Server className={`w-4 h-4 ${isActive ? 'text-neon-cyan' : 'text-text-muted'}`} />
                    </div>
                    <span className="text-xs font-bold font-mono text-white tracking-widest">{cluster.provider}</span>
                  </div>
                  <div className={`flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest px-2 py-0.5 rounded border ${
                    isDegraded ? 'text-amber-400 bg-amber-400/10 border-amber-400/20' : 'text-success-emerald bg-success-emerald/10 border-success-emerald/20'
                  }`}>
                    <StatusIcon className="w-3 h-3" />
                    {cluster.status}
                  </div>
                </div>

                <h3 className="text-sm font-bold text-white mb-1 truncate">{cluster.name}</h3>
                <div className="text-[10px] font-mono text-text-secondary mb-4">ID: {cluster.id}</div>

                <div className="grid grid-cols-2 gap-2 mt-auto w-full pt-4 border-t border-white/5">
                  <div className="flex flex-col">
                    <span className="text-[9px] font-mono text-text-muted uppercase tracking-wider">Nodes</span>
                    <span className="text-xs font-bold text-white font-mono">{cluster.node_count}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[9px] font-mono text-text-muted uppercase tracking-wider">Namespaces</span>
                    <span className="text-xs font-bold text-white font-mono">{cluster.namespace_count}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[9px] font-mono text-text-muted uppercase tracking-wider">Region</span>
                    <span className="text-xs font-bold text-white font-mono truncate">{cluster.region}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[9px] font-mono text-text-muted uppercase tracking-wider">K8s Ver</span>
                    <span className="text-xs font-bold text-white font-mono">{cluster.version}</span>
                  </div>
                </div>
              </button>
            )
          })
        )}
      </div>
      
      {/* Overview stats */}
      <div className="mt-8 grid grid-cols-3 gap-4">
        <div className="bg-black/40 border border-white/10 p-4 rounded-xl flex items-center gap-4">
          <div className="p-3 bg-violet-500/20 rounded-lg">
            <Layers className="w-5 h-5 text-violet-400" />
          </div>
          <div>
            <div className="text-[10px] font-mono text-text-muted uppercase tracking-widest">Total Managed Nodes</div>
            <div className="text-xl font-bold font-mono text-white">53</div>
          </div>
        </div>
        <div className="bg-black/40 border border-white/10 p-4 rounded-xl flex items-center gap-4">
          <div className="p-3 bg-success-emerald/20 rounded-lg">
            <Activity className="w-5 h-5 text-success-emerald" />
          </div>
          <div>
            <div className="text-[10px] font-mono text-text-muted uppercase tracking-widest">Global Health</div>
            <div className="text-xl font-bold font-mono text-white">98.4%</div>
          </div>
        </div>
        <div className="bg-black/40 border border-white/10 p-4 rounded-xl flex items-center gap-4">
          <div className="p-3 bg-amber-500/20 rounded-lg">
            <ShieldAlert className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <div className="text-[10px] font-mono text-text-muted uppercase tracking-widest">Cross-Cluster Alerts</div>
            <div className="text-xl font-bold font-mono text-white">2 Active</div>
          </div>
        </div>
      </div>
    </div>
  )
}
