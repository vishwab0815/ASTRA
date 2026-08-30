import React from 'react'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'
import { HardDrive } from 'lucide-react'

export function MemoryDonut({ used, total }: { used: number, total: number }) {
  const data = [
    { name: 'Used', value: used },
    { name: 'Available', value: total - used }
  ]
  const COLORS = ['var(--color-neon-magenta)', 'var(--color-border-subtle)']

  return (
    <div className="glass-panel p-4 flex flex-col h-48 relative overflow-hidden group">
      <div className="flex items-center gap-1.5 text-text-secondary font-semibold text-xs uppercase tracking-widest mb-2 z-10">
        <HardDrive className="w-4 h-4 text-neon-magenta" /> Memory Usage
      </div>
      
      <div className="flex-1 relative">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              innerRadius={40}
              outerRadius={55}
              paddingAngle={2}
              dataKey="value"
              stroke="none"
              isAnimationActive={false}
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        
        {/* Center Text */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-xl font-bold text-text-primary">{((used/total)*100).toFixed(0)}%</span>
        </div>
      </div>
    </div>
  )
}
