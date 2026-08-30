import React from 'react'

export function SummaryCard({ title, value, unit, colorClass = "text-text-primary" }: any) {
  return (
    <div className="glass-panel p-4 flex flex-col justify-center h-24">
      <div className="text-text-secondary text-xs uppercase tracking-widest font-semibold mb-1">
        {title}
      </div>
      <div className="flex items-baseline gap-1">
        <span className={`text-3xl font-bold font-mono ${colorClass}`}>{value}</span>
        {unit && <span className="text-sm text-text-muted">{unit}</span>}
      </div>
    </div>
  )
}
