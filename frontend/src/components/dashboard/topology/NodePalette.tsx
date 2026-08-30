import React from 'react'
import {
  Globe, Server, Cpu, Database, HardDrive, MessageSquare, Radio, Plus, GripVertical
} from 'lucide-react'

interface NodePaletteProps {
  onAddNode: (type: string) => void
}

const PALETTE_ITEMS = [
  { type: 'ingress',  label: 'Ingress',    icon: Globe,         color: '#00f0ff', desc: 'API Gateway / LB' },
  { type: 'service',  label: 'Service',    icon: Server,        color: '#818cf8', desc: 'Deployment' },
  { type: 'worker',   label: 'Worker',     icon: Cpu,           color: '#f59e0b', desc: 'CronJob / Job' },
  { type: 'database', label: 'Database',   icon: Database,      color: '#a855f7', desc: 'StatefulSet' },
  { type: 'cache',    label: 'Cache',      icon: HardDrive,     color: '#10b981', desc: 'Redis / Memcached' },
  { type: 'queue',    label: 'Queue',      icon: MessageSquare, color: '#f97316', desc: 'Kafka / RabbitMQ' },
  { type: 'external', label: 'External',   icon: Radio,         color: '#6b7280', desc: 'External API' },
]

export function NodePalette({ onAddNode }: NodePaletteProps) {
  return (
    <div className="absolute top-6 left-6 z-20 flex flex-col gap-2">
      <div
        className="rounded-xl border overflow-hidden shadow-2xl backdrop-blur-xl"
        style={{
          background: 'rgba(9,10,15,0.92)',
          borderColor: 'rgba(255,255,255,0.1)',
        }}
      >
        {/* Header */}
        <div className="flex items-center gap-2 px-3 py-2.5 border-b border-white/5">
          <GripVertical className="w-3 h-3 text-text-muted" />
          <span className="text-[9px] font-mono text-text-muted uppercase tracking-widest font-bold">
            Components
          </span>
        </div>

        {/* Items */}
        <div className="p-2 flex flex-col gap-0.5">
          {PALETTE_ITEMS.map(item => (
            <button
              key={item.type}
              onClick={() => onAddNode(item.type)}
              className="group flex items-center gap-2.5 w-full px-2.5 py-2 rounded-lg hover:bg-white/5 transition-all text-left border border-transparent hover:border-white/8"
            >
              {/* Left accent line */}
              <div
                className="w-0.5 h-6 rounded-full flex-shrink-0 opacity-60 group-hover:opacity-100 transition-opacity"
                style={{ background: item.color }}
              />

              {/* Icon */}
              <div
                className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0"
                style={{ background: `${item.color}18`, border: `1px solid ${item.color}35` }}
              >
                <item.icon className="w-3 h-3" style={{ color: item.color }} />
              </div>

              {/* Text */}
              <div className="flex flex-col min-w-0">
                <span className="text-[11px] font-medium text-text-secondary group-hover:text-white transition-colors leading-tight">
                  {item.label}
                </span>
                <span className="text-[9px] text-text-muted leading-tight">{item.desc}</span>
              </div>

              {/* Plus icon */}
              <Plus className="w-3 h-3 text-text-muted group-hover:text-white opacity-0 group-hover:opacity-100 ml-auto flex-shrink-0 transition-all" />
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
