import React from 'react'
import { BaseEdge, getBezierPath } from '@xyflow/react'

export function NeuralEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  data,
}: any) {
  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  })

  const isError = data?.isError

  return (
    <>
      {/* Outer Glow Effect */}
      <BaseEdge 
        path={edgePath} 
        style={{
          ...style,
          strokeWidth: isError ? 4 : 2,
          stroke: isError ? 'var(--color-neon-magenta)' : 'var(--color-neon-cyan)',
          opacity: 0.3,
          filter: `drop-shadow(0 0 5px ${isError ? 'var(--color-neon-magenta)' : 'var(--color-neon-cyan)'})`
        }} 
      />
      {/* Inner Crisp Line */}
      <BaseEdge 
        id={id} 
        path={edgePath} 
        style={{
          ...style,
          strokeWidth: 1,
          stroke: '#ffffff',
          strokeDasharray: '5,5',
          animation: isError ? 'dash 1s linear infinite' : 'dash 20s linear infinite',
        }} 
      />
      <style>
        {`
          @keyframes dash {
            to {
              stroke-dashoffset: -1000;
            }
          }
        `}
      </style>
    </>
  )
}
