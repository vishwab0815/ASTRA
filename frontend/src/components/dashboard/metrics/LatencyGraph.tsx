import React, { useMemo } from 'react'
import { AreaChart, Area, ResponsiveContainer, YAxis, XAxis, CartesianGrid, Tooltip } from 'recharts'
import { Activity } from 'lucide-react'
import { GrafanaLegend } from './GrafanaLegend'
import { CustomTooltip } from './CustomTooltip'

export function LatencyGraph({ data }: { data: any[] }) {
  // Calculate stats for the legend
  const stats = useMemo(() => {
    if (!data.length) return []
    const values = data.map(d => d.latency)
    const min = Math.min(...values).toFixed(1)
    const max = Math.max(...values).toFixed(1)
    const avg = (values.reduce((a, b) => a + b, 0) / values.length).toFixed(1)
    const current = values[values.length - 1].toFixed(1)
    
    return [{
      name: 'System Latency',
      color: 'var(--color-neon-cyan)',
      min: `${min} ms`,
      max: `${max} ms`,
      avg: `${avg} ms`,
      current: `${current} ms`
    }]
  }, [data])

  return (
    <div className="glass-panel p-3 flex flex-col h-full w-full">
      <div className="flex items-center gap-1.5 text-text-primary font-bold text-[11px] mb-2">
        <Activity className="w-3 h-3 text-neon-cyan" /> Latency (ms)
      </div>
      
      <div className="flex-1 min-h-0 relative">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} syncId="metrics-sync" margin={{ top: 5, right: 0, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="colorLatency" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--color-neon-cyan)" stopOpacity={0.3}/>
                <stop offset="95%" stopColor="var(--color-neon-cyan)" stopOpacity={0}/>
              </linearGradient>
            </defs>
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
              cursor={{ stroke: 'var(--color-border-focus)', strokeWidth: 1, strokeDasharray: '4 4' }}
              isAnimationActive={false}
            />
            <Area 
              type="monotone" 
              name="Latency"
              dataKey="latency" 
              stroke="var(--color-neon-cyan)" 
              strokeWidth={1.5} 
              fillOpacity={1} 
              fill="url(#colorLatency)" 
              isAnimationActive={false} 
              activeDot={{ r: 4, strokeWidth: 0, fill: 'var(--color-neon-cyan)' }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <GrafanaLegend items={stats} />
    </div>
  )
}
