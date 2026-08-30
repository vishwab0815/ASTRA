import React from 'react'

export function CustomTooltip({ active, payload, label }: any) {
  if (active && payload && payload.length) {
    return (
      <div className="bg-panel border border-border-subtle p-2 rounded shadow-xl flex flex-col gap-1 min-w-[120px]">
        <div className="text-[10px] text-text-muted font-mono uppercase tracking-widest border-b border-border-subtle pb-1 mb-1">
          {/* Label is the X-axis time value */}
          T{label} 
        </div>
        
        {payload.map((entry: any, index: number) => (
          <div key={index} className="flex items-center justify-between gap-4 text-xs font-mono">
            <span className="flex items-center gap-1.5 text-text-secondary">
              <span 
                className="w-1.5 h-1.5 rounded-full" 
                style={{ backgroundColor: entry.color || 'var(--color-text-primary)' }}
              />
              {entry.name}
            </span>
            <span className="font-bold text-text-primary">
              {Number(entry.value).toFixed(1)}
            </span>
          </div>
        ))}
      </div>
    )
  }

  return null
}
