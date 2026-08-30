import React from 'react'
import { Activity, Bell, Settings, User } from 'lucide-react'

export function GlobalHUD() {
  return (
    <header className="glass-panel rounded-none border-t-0 border-x-0 border-b flex items-center justify-between px-6 py-3 z-10 shrink-0 shadow-lg shadow-black/20">
      <div className="flex items-center gap-3">
        <div className="relative flex items-center justify-center w-8 h-8 bg-neon-blue/20 rounded-lg border border-neon-blue/40 shadow-[0_0_15px_rgba(59,130,246,0.3)]">
          <Activity className="w-5 h-5 text-neon-blue" />
        </div>
        <div>
          <h1 className="font-bold text-lg text-text-primary tracking-wide leading-none">ASTRA</h1>
          <p className="text-[10px] text-text-muted uppercase tracking-widest mt-1">Incident Command Center</p>
        </div>
      </div>
      
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-success-emerald animate-pulse-glow" />
          <span className="text-xs font-mono text-text-secondary">Core Engine Online</span>
        </div>
        
        <div className="w-px h-6 bg-border-subtle" />
        
        <div className="flex gap-4 text-text-muted">
          <Bell className="w-4 h-4 hover:text-text-primary cursor-pointer transition-colors" />
          <Settings className="w-4 h-4 hover:text-text-primary cursor-pointer transition-colors" />
          <User className="w-4 h-4 hover:text-text-primary cursor-pointer transition-colors" />
        </div>
      </div>
    </header>
  )
}
