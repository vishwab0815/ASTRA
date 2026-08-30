import React from 'react'
import { BaseEdge, EdgeProps, getBezierPath } from '@xyflow/react'

// RPS → stroke width (min 1.5, max 6)
function rpsToWidth(rps: number): number {
  if (rps <= 0) return 1.5
  if (rps >= 3000) return 5.5
  return 1.5 + (rps / 3000) * 4
}

// Latency → animation speed (fast = low latency, slow = high latency)
function latencyToDuration(latencyMs: number): string {
  if (latencyMs < 20) return '1.6s'
  if (latencyMs < 100) return '2.4s'
  if (latencyMs < 300) return '3.5s'
  return '1s' // error state is fastest/most urgent
}

export function AnimatedEdge({
  id,
  sourceX, sourceY,
  targetX, targetY,
  sourcePosition, targetPosition,
  style = {},
  markerEnd,
  data,
}: EdgeProps) {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX, sourceY, sourcePosition,
    targetX, targetY, targetPosition,
  })

  const isError    = Boolean(data?.is_error ?? data?.isError)
  const isDegraded = !isError && Number(data?.error_rate ?? 0) > 0.05
  const rps        = Number(data?.rps ?? 0)
  const latencyMs  = Number(data?.latency_ms ?? data?.latency ?? 14)
  const protocol   = String(data?.protocol ?? 'HTTP/2')

  const strokeWidth   = rpsToWidth(rps)
  const animDuration  = latencyToDuration(latencyMs)

  // Color system
  const strokeColor   = isError ? '#f2495c' : isDegraded ? '#f59e0b' : '#00f0ff'
  const glowIntensity = isError ? 0.55 : isDegraded ? 0.3 : 0.2
  const photonColor   = isError ? '#ff4d4d' : isDegraded ? '#fbbf24' : '#ffffff'
  const trailColor    = isError ? '#f2495c' : isDegraded ? '#f59e0b' : 'rgba(0,240,255,0.35)'

  const latencyLabel = latencyMs >= 1000
    ? `${(latencyMs / 1000).toFixed(1)}s`
    : `${latencyMs}ms`

  return (
    <>
      <defs>
        <filter id={`glow-${id}`} x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation={isError ? 4 : 2.5} result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
      </defs>

      {/* Layer 1: Ambient glow halo */}
      <path
        d={edgePath}
        fill="none"
        stroke={strokeColor}
        strokeWidth={strokeWidth + 4}
        strokeOpacity={glowIntensity}
        className="pointer-events-none"
        filter={`url(#glow-${id})`}
      />

      {/* Layer 2: Core edge line */}
      <BaseEdge
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          ...style,
          strokeWidth,
          stroke: strokeColor,
          strokeDasharray: isError ? '10 6' : undefined,
          opacity: 0.9,
        }}
        className={isError ? 'animate-pulse' : ''}
      />

      {/* Layer 3: Fiber optic data stream (healthy only) */}
      {!isError && (
        <path
          d={edgePath}
          fill="none"
          stroke="rgba(255,255,255,0.3)"
          strokeWidth={1}
          strokeDasharray="5 9"
          className="pointer-events-none"
        >
          <animate
            attributeName="stroke-dashoffset"
            values="14;0"
            dur="0.7s"
            repeatCount="indefinite"
          />
        </path>
      )}

      {/* Layer 4: Primary photon packet */}
      <circle
        r={isError ? 4 : strokeWidth > 3 ? 3.5 : 2.5}
        fill={photonColor}
        className="pointer-events-none"
        style={{ filter: `drop-shadow(0 0 4px ${trailColor})` }}
      >
        <animateMotion
          dur={animDuration}
          repeatCount="indefinite"
          path={edgePath}
        />
        <animate
          attributeName="r"
          values={isError ? "4;6;4" : "2.5;3.8;2.5"}
          dur="1s"
          repeatCount="indefinite"
        />
        <animate
          attributeName="opacity"
          values="1;0.7;1"
          dur="0.8s"
          repeatCount="indefinite"
        />
      </circle>

      {/* Layer 5: Secondary photon (phase offset, high-traffic links only) */}
      {!isError && rps > 500 && (
        <circle
          r="2"
          fill={strokeColor}
          opacity={0.7}
          className="pointer-events-none"
        >
          <animateMotion
            dur={animDuration}
            begin={`-${parseFloat(animDuration) / 2}s`}
            repeatCount="indefinite"
            path={edgePath}
          />
        </circle>
      )}

      {/* Invisible hit area for click */}
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={28}
        className="cursor-pointer hover:stroke-white/5 transition-colors"
      />

      {/* Center metric badge */}
      <foreignObject
        width={86}
        height={22}
        x={labelX - 43}
        y={labelY - 11}
        className="overflow-visible pointer-events-auto cursor-pointer"
      >
        <div className={`px-2 py-0.5 rounded-full text-[9px] font-mono flex items-center justify-center gap-1.5 border shadow-lg backdrop-blur-md transition-all hover:scale-110 ${
          isError
            ? 'bg-danger-rose/20 text-danger-rose border-danger-rose/40 animate-pulse'
            : isDegraded
            ? 'bg-amber-500/15 text-amber-400 border-amber-500/30'
            : 'bg-obsidian/85 text-text-muted border-border-subtle hover:border-neon-cyan hover:text-neon-cyan'
        }`}>
          <span className="w-1.5 h-1.5 rounded-full bg-current flex-shrink-0" />
          <span>{latencyLabel}</span>
          {rps > 0 && (
            <span className="text-[8px] opacity-70">
              {rps >= 1000 ? `${(rps / 1000).toFixed(1)}k` : rps}rps
            </span>
          )}
        </div>
      </foreignObject>

      {/* Protocol badge (on hover via edge) */}
      <foreignObject
        width={60}
        height={16}
        x={labelX - 30}
        y={labelY + 15}
        className="overflow-visible pointer-events-none opacity-0 hover:opacity-100"
      >
        <div className="px-1.5 py-0.5 rounded text-[8px] font-mono text-center text-text-muted bg-black/60 border border-border-subtle">
          {protocol}
        </div>
      </foreignObject>
    </>
  )
}
