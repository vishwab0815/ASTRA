import React from 'react'
import {
  LayoutGrid, Flame, Sparkles, Activity, Search,
  Filter, Download, AlertTriangle, RefreshCw
} from 'lucide-react'

interface TopologyToolbarProps {
  onAutoLayout: () => void
  onInjectChaos: () => void
  onAutoHealAll: () => void
  onRefresh?: () => void
  nodeCount: number
  crashedCount: number
  degradedCount: number
  searchQuery: string
  onSearchChange: (q: string) => void
  statusFilter: string
  onStatusFilterChange: (s: string) => void
  isLive: boolean
}

export function TopologyToolbar({
  onAutoLayout, onInjectChaos, onAutoHealAll, onRefresh,
  nodeCount, crashedCount, degradedCount,
  searchQuery, onSearchChange,
  statusFilter, onStatusFilterChange,
  isLive,
}: TopologyToolbarProps) {
  const totalAlerts = crashedCount + degradedCount
  const allHealthy = totalAlerts === 0

  return (
    <div className="absolute top-5 right-5 z-20 flex flex-col items-end gap-2.5">

      {/* ── Cluster Health Status Bar ───────────────────────────── */}
      <div
        className="flex items-center gap-3 px-3.5 py-2 rounded-xl border shadow-2xl backdrop-blur-xl text-xs font-mono"
        style={{
          background: 'rgba(9,10,15,0.92)',
          borderColor: totalAlerts > 0 ? 'rgba(242,73,92,0.3)' : 'rgba(16,185,129,0.25)',
          boxShadow: totalAlerts > 0 ? '0 0 20px rgba(242,73,92,0.1)' : '0 0 20px rgba(16,185,129,0.08)',
        }}
      >
        {/* Live indicator */}
        <div className="flex items-center gap-1.5">
          <div
            className="w-1.5 h-1.5 rounded-full"
            style={{
              background: isLive ? '#10b981' : '#6b7280',
              boxShadow: isLive ? '0 0 6px #10b981' : 'none',
              animation: isLive ? 'pulse 2s infinite' : 'none',
            }}
          />
          <span className="text-text-muted text-[9px]">{isLive ? 'LIVE' : 'STATIC'}</span>
        </div>

        <div className="w-px h-4 bg-white/10" />

        <Activity className="w-3.5 h-3.5 text-neon-cyan" />
        <span className="text-text-secondary">{nodeCount} nodes</span>

        <div className="w-px h-4 bg-white/10" />

        {allHealthy ? (
          <span className="text-success-emerald font-bold flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-success-emerald inline-block" style={{ boxShadow: '0 0 6px #10b981' }} />
            100% Healthy
          </span>
        ) : (
          <span className="text-danger-rose font-bold flex items-center gap-1.5 animate-pulse">
            <AlertTriangle className="w-3 h-3" />
            {crashedCount > 0 && <span>{crashedCount} crashed</span>}
            {degradedCount > 0 && <span>{degradedCount} degraded</span>}
          </span>
        )}
      </div>

      {/* ── Search & Filter Row ────────────────────────────────── */}
      <div
        className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl border shadow-xl backdrop-blur-xl"
        style={{
          background: 'rgba(9,10,15,0.90)',
          borderColor: 'rgba(255,255,255,0.1)',
        }}
      >
        <Search className="w-3.5 h-3.5 text-text-muted flex-shrink-0" />
        <input
          type="text"
          placeholder="Search services…"
          value={searchQuery}
          onChange={e => onSearchChange(e.target.value)}
          className="bg-transparent text-[11px] text-white placeholder-text-muted focus:outline-none w-32 font-mono"
        />
        <div className="w-px h-4 bg-white/10 flex-shrink-0" />
        <Filter className="w-3 h-3 text-text-muted flex-shrink-0" />
        <select
          value={statusFilter}
          onChange={e => onStatusFilterChange(e.target.value)}
          className="bg-transparent text-[10px] text-text-muted focus:outline-none cursor-pointer font-mono"
        >
          <option value="all">All</option>
          <option value="healthy">Healthy</option>
          <option value="degraded">Degraded</option>
          <option value="crashed">Crashed</option>
          <option value="pending">Pending</option>
        </select>
      </div>

      {/* ── Action Buttons Row ─────────────────────────────────── */}
      <div
        className="flex items-center gap-1 p-1.5 rounded-xl border shadow-2xl backdrop-blur-xl"
        style={{
          background: 'rgba(9,10,15,0.92)',
          borderColor: 'rgba(255,255,255,0.1)',
        }}
      >
        {/* Refresh */}
        {onRefresh && (
          <button
            onClick={onRefresh}
            title="Refresh topology from backend"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg hover:bg-white/8 text-xs font-medium text-text-muted hover:text-neon-cyan transition-all"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        )}

        <div className="w-px h-5 bg-white/8" />

        {/* Auto-Layout */}
        <button
          onClick={onAutoLayout}
          title="Hierarchical DAG Auto-Layout"
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg hover:bg-white/8 text-xs font-medium text-text-secondary hover:text-white transition-all"
        >
          <LayoutGrid className="w-3.5 h-3.5 text-neon-cyan" />
          <span className="text-[10px]">Auto-Arrange</span>
        </button>

        <div className="w-px h-5 bg-white/8" />

        {/* Chaos Simulator */}
        <button
          onClick={onInjectChaos}
          title="Inject a random pod failure (Chaos Engineering)"
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg hover:bg-danger-rose/12 text-xs font-medium text-danger-rose border border-transparent hover:border-danger-rose/25 transition-all"
        >
          <Flame className="w-3.5 h-3.5" />
          <span className="text-[10px]">Chaos</span>
        </button>

        {/* Auto-Heal All */}
        <button
          onClick={onAutoHealAll}
          title="Reset cluster to healthy baseline"
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg hover:bg-success-emerald/12 text-xs font-medium text-success-emerald border border-transparent hover:border-success-emerald/25 transition-all"
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span className="text-[10px]">Heal All</span>
        </button>
      </div>
    </div>
  )
}
