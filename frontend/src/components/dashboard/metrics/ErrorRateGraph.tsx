import React, { useMemo } from 'react'
import { BarChart, Bar, ResponsiveContainer, YAxis, XAxis, CartesianGrid, Tooltip } from 'recharts'
import { AlertTriangle } from 'lucide-react'
import { GrafanaLegend } from './GrafanaLegend'
import { CustomTooltip } from './CustomTooltip'

export function ErrorRateGraph({ data }: { data: any[] }) {
  const stats = useMemo(() => {
    if (!data.length) return []
    const values = data.map(d => d.errors)
    const min = Math.min(...values)
    const max = Math.max(...values)
    const avg = (values.reduce((a, b) => a + b, 0) / values.length).toFixed(1)
    const current = values[values.length - 1]
    
    return [{
      name: 'HTTP 5xx',
      color: 'var(--color-neon-magenta)',
      min: min.toString(),
      max: max.toString(),
      avg: avg,
      current: current.toString()
    }]
  }, [data])

  return (
    <div className="glass-panel p-3 flex flex-col h-full w-full border-t-2 border-t-neon-magenta">
      <div className="flex items-center gap-1.5 text-text-primary font-bold text-[11px] mb-2">
        <AlertTriangle className="w-3 h-3 text-neon-magenta" /> Error Rates
      </div>
      
      <div className="flex-1 min-h-0 relative">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} syncId="metrics-sync" margin={{ top: 5, right: 0, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-subtle)" vertical={false} />
            <XAxis dataKey="time" hide />
            <YAxis 
              tick={{ fill: 'var(--color-text-secondary)', fontSize: 10 }} 
              tickLine={false}
              axisLine={false}
              domain={[0, 'auto']}
              width={40}
            />
            <Tooltip 
              content={<CustomTooltip />} 
              cursor={{ fill: 'rgba(255,255,255,0.05)' }}
              isAnimationActive={false}
            />
            <Bar name="Errors (5xx)" dataKey="errors" fill="var(--color-neon-magenta)" isAnimationActive={false} radius={[1, 1, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <GrafanaLegend items={stats} />
    </div>
  )
}
