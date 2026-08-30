import React from 'react'
import { Terminal } from 'lucide-react'

export function LiveLogStream({ logs }: { logs: string[] }) {
  return (
    <div className="glass-panel p-3 flex flex-col h-full bg-obsidian relative col-span-2 row-span-2 border-neon-cyan/20">
      <div className="flex items-center gap-1.5 text-neon-cyan font-bold text-[10px] uppercase tracking-widest border-b border-neon-cyan/20 pb-2 mb-2">
        <Terminal className="w-3 h-3" /> Global Neural Trace (Live)
      </div>
      
      <div className="flex-1 overflow-hidden relative flex flex-col justify-end">
        {/* Gradient fade at the top of the terminal */}
        <div className="absolute top-0 inset-x-0 h-10 bg-gradient-to-b from-obsidian to-transparent z-10 pointer-events-none" />
        
        <div className="space-y-1 font-mono text-[10px] sm:text-xs">
          {logs.map((log, i) => {
            // Apply different colors based on log content
            const isError = log.includes('ERR') || log.includes('Crash')
            const isWarn = log.includes('WARN') || log.includes('Latency')
            
            return (
              <div key={i} className={`animate-fade-in-up ${
                isError ? 'text-neon-magenta shadow-[0_0_5px_rgba(255,0,60,0.5)]' 
                : isWarn ? 'text-neon-yellow' 
                : 'text-text-primary/70'
              }`}>
                {log}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
