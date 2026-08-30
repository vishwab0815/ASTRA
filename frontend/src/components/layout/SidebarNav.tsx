import React from 'react'
import { Cpu, Waypoints, GitMerge, TerminalSquare, BellDot, Flame, Settings, ShieldCheck, Server } from 'lucide-react'
import { motion } from 'framer-motion'

export type TabState = 'overview' | 'topology' | 'incidents' | 'traces' | 'logs' | 'alerts' | 'audit' | 'clusters'

interface SidebarNavProps {
  activeTab: TabState
  onTabChange: (tab: TabState) => void
}

export function SidebarNav({ activeTab, onTabChange }: SidebarNavProps) {
  return (
    <aside className="w-16 border-r border-border-subtle bg-black/40 flex flex-col items-center py-6 z-20 shrink-0">
      
      {/* Brand Icon */}
      <div className="w-10 h-10 bg-neon-cyan/20 rounded-xl border border-neon-cyan/40 flex items-center justify-center mb-8 shadow-[0_0_15px_rgba(0,240,255,0.3)]">
        <span className="font-bold text-neon-cyan text-lg">A</span>
      </div>

      {/* Nav Links */}
      <nav className="flex flex-col gap-6 w-full px-2">
        <NavItem 
          icon={<Cpu />} 
          isActive={activeTab === 'overview'} 
          onClick={() => onTabChange('overview')} 
          label="Overview"
        />
        <NavItem 
          icon={<Waypoints />} 
          isActive={activeTab === 'topology'} 
          onClick={() => onTabChange('topology')} 
          label="Topology"
        />
        <NavItem 
          icon={<GitMerge />} 
          isActive={activeTab === 'traces'} 
          onClick={() => onTabChange('traces')} 
          label="Traces"
        />
        <NavItem 
          icon={<TerminalSquare />} 
          isActive={activeTab === 'logs'} 
          onClick={() => onTabChange('logs')} 
          label="Logs"
        />
        <NavItem 
          icon={<BellDot />} 
          isActive={activeTab === 'alerts'} 
          onClick={() => onTabChange('alerts')} 
          label="Correlations"
        />
        <div className="w-8 h-px bg-border-subtle mx-auto my-2" />
        <NavItem 
          icon={<Flame />} 
          isActive={activeTab === 'incidents'} 
          onClick={() => onTabChange('incidents')} 
          label="Incidents"
        />
        <NavItem 
          icon={<ShieldCheck />} 
          isActive={activeTab === 'audit'} 
          onClick={() => onTabChange('audit')} 
          label="Audit Trail"
        />
        <NavItem 
          icon={<Server />} 
          isActive={activeTab === 'clusters'} 
          onClick={() => onTabChange('clusters')} 
          label="Fleet Mgmt"
        />
      </nav>

      <div className="mt-auto">
        <NavItem 
          icon={<Settings />} 
          isActive={false} 
          onClick={() => {}} 
          label="Settings"
        />
      </div>
    </aside>
  )
}

function NavItem({ icon, isActive, onClick, label }: any) {
  return (
    <div className="group relative flex justify-center">
      <button 
        onClick={onClick}
        className={`relative p-2.5 rounded-xl transition-colors duration-300 z-10 ${
          isActive 
            ? 'text-white' 
            : 'text-text-muted hover:text-text-primary'
        }`}
      >
        {isActive && (
          <motion.div
            layoutId="activeTabGlow"
            className="absolute inset-0 bg-white/10 rounded-xl border border-white/20 shadow-[0_0_20px_rgba(255,255,255,0.1)]"
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
          />
        )}
        <span className="relative z-20 block">
          {React.cloneElement(icon, { className: 'w-5 h-5' })}
        </span>
      </button>
      
      {/* Tooltip */}
      <div className="absolute left-14 top-1/2 -translate-y-1/2 px-2 py-1 bg-white/10 backdrop-blur-md text-text-primary text-xs rounded opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity border border-border-subtle whitespace-nowrap z-50">
        {label}
      </div>
    </div>
  )
}
