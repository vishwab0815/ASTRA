import React from 'react'
import { Database } from 'lucide-react'

export function DatabaseSaturation({ saturation }: { saturation: number }) {
  const isHigh = saturation > 85

  return (
    <div className="glass-panel p-3 flex flex-col justify-center h-32 bg-obsidian relative">
      <div className="flex items-center gap-1.5 text-neon-yellow font-bold text-[10px] uppercase tracking-widest mb-2">
        <Database className="w-3 h-3" /> DB Saturation
      </div>
      <div className="flex items-end gap-2">
        <span className={`text-3xl font-bold ${isHigh ? 'text-neon-magenta animate-pulse' : 'text-neon-yellow'}`}>
          {saturation.toFixed(1)}%
        </span>
      </div>
      
      {/* Visual heatbar */}
      <div className="mt-3 flex gap-1 h-2 w-full">
        {Array.from({ length: 20 }).map((_, i) => {
          const threshold = i * 5
          const isActive = saturation > threshold
          let color = 'bg-border-subtle'
          if (isActive) {
            color = threshold > 80 ? 'bg-neon-magenta shadow-[0_0_8px_var(--color-neon-magenta)]' 
                  : threshold > 60 ? 'bg-neon-yellow shadow-[0_0_8px_var(--color-neon-yellow)]' 
                  : 'bg-neon-cyan shadow-[0_0_8px_var(--color-neon-cyan)]'
          }
          return <div key={i} className={`flex-1 rounded-sm ${color} transition-colors`} />
        })}
      </div>
    </div>
  )
}
