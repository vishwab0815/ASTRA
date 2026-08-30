import React from 'react'
import { Handle, Position } from '@xyflow/react'
import { Server, Database, Globe, Hexagon } from 'lucide-react'

export function NeuralNode({ data }: any) {
  const isCrashed = data.status === 'crashed'
  
  // Choose icon based on type
  let Icon = Server
  if (data.icon === 'db') Icon = Database
  if (data.icon === 'web') Icon = Globe

  return (
    <div className="relative group">
      {/* Outer Hexagon Shape for the Hacker Aesthetic */}
      <div className={`absolute -inset-2 opacity-20 group-hover:opacity-100 transition-opacity blur-sm rounded-full ${
        isCrashed ? 'bg-neon-magenta' : 'bg-neon-cyan'
      }`} />
      
      <div className={`relative px-4 py-2 border bg-obsidian flex items-center gap-3 w-56 clip-path-hexagon ${
        isCrashed 
          ? 'border-neon-magenta shadow-[0_0_15px_rgba(255,0,60,0.5)] animate-pulse' 
          : 'border-neon-cyan shadow-[0_0_10px_rgba(0,240,255,0.1)]'
      }`}>
        <Handle type="target" position={Position.Top} className="w-1.5 h-1.5 !bg-neon-cyan border-none rounded-none" />
        
        <div className={`p-1.5 border border-dashed ${isCrashed ? 'border-neon-magenta text-neon-magenta bg-neon-magenta/10' : 'border-neon-cyan text-neon-cyan bg-neon-cyan/10'}`}>
          <Icon className="w-5 h-5" />
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="text-xs font-bold text-text-primary truncate tracking-wider">{data.label}</div>
          <div className={`text-[9px] uppercase tracking-widest mt-0.5 ${isCrashed ? 'text-neon-magenta' : 'text-neon-cyan'}`}>
            [{isCrashed ? 'ERR:CRASHLOOP' : 'SYS:ONLINE'}]
          </div>
        </div>
        
        <Handle type="source" position={Position.Bottom} className="w-1.5 h-1.5 !bg-neon-cyan border-none rounded-none" />
      </div>
    </div>
  )
}
