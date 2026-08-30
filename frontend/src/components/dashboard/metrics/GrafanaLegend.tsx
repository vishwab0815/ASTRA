import React from 'react'

interface LegendData {
  name: string
  color: string
  min: string
  max: string
  avg: string
  current: string
}

export function GrafanaLegend({ items }: { items: LegendData[] }) {
  return (
    <div className="w-full mt-2 font-mono text-[11px] text-text-secondary border-t border-border-subtle pt-2 overflow-x-auto">
      <table className="w-full text-left border-collapse">
        <thead>
          <tr>
            <th className="font-normal px-2 pb-1 text-text-muted">Series</th>
            <th className="font-normal px-2 pb-1 text-right text-text-muted">Min</th>
            <th className="font-normal px-2 pb-1 text-right text-text-muted">Max</th>
            <th className="font-normal px-2 pb-1 text-right text-text-muted">Avg</th>
            <th className="font-normal px-2 pb-1 text-right text-text-muted">Current</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, i) => (
            <tr key={i} className="hover:bg-white/5 transition-colors group cursor-default">
              <td className="px-2 py-0.5 flex items-center gap-1.5 whitespace-nowrap">
                <div className="w-2 h-0.5 rounded-full" style={{ backgroundColor: item.color }} />
                <span className="group-hover:text-text-primary transition-colors">{item.name}</span>
              </td>
              <td className="px-2 py-0.5 text-right">{item.min}</td>
              <td className="px-2 py-0.5 text-right">{item.max}</td>
              <td className="px-2 py-0.5 text-right">{item.avg}</td>
              <td className="px-2 py-0.5 text-right font-bold text-text-primary">{item.current}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
