import React, { useMemo } from 'react'
import { LineChart, Line, ResponsiveContainer, YAxis, XAxis, CartesianGrid, Tooltip } from 'recharts'
import { Wifi } from 'lucide-react'
import { GrafanaLegend } from './GrafanaLegend'
import { CustomTooltip } from './CustomTooltip'

export function NetworkIOGraph({ data }: { data: any[] }) {
  const stats = useMemo(() => {
    if (!data.length) return []
    
    const getStats = (key: string, name: string, color: string) => {
      const values = data.map(d => d[key])
      return {
        name,
        color,
        min: `${Math.min(...values).toFixed(1)} MB/s`,
        max: `${Math.max(...values).toFixed(1)} MB/s`,
        avg: `${(values.reduce((a, b) => a + b, 0) / values.length).toFixed(1)} MB/s`,
        current: `${values[values.length - 1].toFixed(1)} MB/s`
      }
    }
    
    return [
      getStats('netIn', 'Inbound (RX)', 'var(--color-neon-green)'),
      getStats('netOut', 'Outbound (TX)', 'var(--color-neon-cyan)')
    ]
  }, [data])

  return (
    <div className="glass-panel p-3 flex flex-col h-full w-full">
      <div className="flex items-center gap-1.5 text-text-primary font-bold text-[11px] mb-2">
        <Wifi className="w-3 h-3 text-neon-green" /> Network I/O
      </div>
      
      <div className="flex-1 min-h-0 relative">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} syncId="metrics-sync" margin={{ top: 5, right: 0, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-subtle)" vertical={false} />
            <XAxis dataKey="time" hide />
            <YAxis 
              tick={{ fill: 'var(--color-text-secondary)', fontSize: 10 }} 
              tickLine={false}
              axisLine={false}
              domain={[0, 'auto']}
              width={50}
            />
            <Tooltip 
              content={<CustomTooltip />} 
              cursor={{ stroke: 'var(--color-border-focus)', strokeWidth: 1, strokeDasharray: '4 4' }}
              isAnimationActive={false}
            />
            <Line name="RX (In)" type="monotone" dataKey="netIn" stroke="var(--color-neon-green)" strokeWidth={1.5} dot={false} isAnimationActive={false} activeDot={{ r: 4, strokeWidth: 0, fill: 'var(--color-neon-green)' }} />
            <Line name="TX (Out)" type="monotone" dataKey="netOut" stroke="var(--color-neon-cyan)" strokeWidth={1.5} dot={false} isAnimationActive={false} activeDot={{ r: 4, strokeWidth: 0, fill: 'var(--color-neon-cyan)' }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <GrafanaLegend items={stats} />
    </div>
  )
}
