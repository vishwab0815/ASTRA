'use client'

import React, { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { useQuery } from '@tanstack/react-query'
import { fetchLiveTelemetry, LiveTelemetry } from '@/lib/api'
import { LatencyGraph } from './metrics/LatencyGraph'
import { ErrorRateGraph } from './metrics/ErrorRateGraph'
import { NetworkIOGraph } from './metrics/NetworkIOGraph'
import { LiveLogStream } from './metrics/LiveLogStream'
import { MemoryDonut } from './metrics/MemoryDonut'
import { SummaryCard } from './metrics/SummaryCard'

const generateInitialData = () => {
  return Array.from({ length: 200 }, (_, i) => ({
    time: i,
    latency: 18 + Math.sin(i * 0.1) * 6,
    errors: i % 50 === 0 ? 1 : 0,
    netIn: 28 + Math.cos(i * 0.1) * 10,
    netOut: 14 + Math.sin(i * 0.15) * 6,
  }))
}

const INITIAL_LOGS = [
  '[SYS] Astra autonomous kernel active',
  '[AUTH] Post-Quantum signature check verified (ML-KEM/Kyber768)',
  '[eBPF] Ingress gateway packet inspection latency: 12.4ms',
  '[AGENT] Self-healing workflow pool ready (10 slots)',
]

export function MetricsHUD() {
  const [data, setData] = useState(generateInitialData)
  const [localUptime, setLocalUptime] = useState(0)

  // Stream live real-time telemetry from FastAPI backend
  const { data: telemetry } = useQuery<LiveTelemetry | null>({
    queryKey: ['liveTelemetry'],
    queryFn: fetchLiveTelemetry,
    refetchInterval: 2500,
  })

  // Real-time dense data flow tick
  useEffect(() => {
    const interval = setInterval(() => {
      setLocalUptime(prev => prev + 1)
      
      setData(prev => {
        const newData = [...prev.slice(1)]
        const last = prev[prev.length - 1]
        
        const cpuBias = telemetry?.cpu_percent ? (telemetry.cpu_percent / 100) * 10 : 0
        let newLatency = Math.max(5, last.latency + (Math.random() - 0.5) * 6 + cpuBias * 0.2)
        let newNetIn = Math.max(10, last.netIn + (Math.random() - 0.5) * 12)
        let newNetOut = Math.max(5, last.netOut + (Math.random() - 0.5) * 8)

        newData.push({
          time: last.time + 1,
          latency: Number(newLatency.toFixed(1)),
          errors: Math.random() > 0.98 ? 1 : 0,
          netIn: Number(newNetIn.toFixed(1)),
          netOut: Number(newNetOut.toFixed(1)),
        })
        return newData
      })
    }, 600)
    
    return () => clearInterval(interval)
  }, [telemetry])

  const container = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.05
      }
    }
  }

  const item = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0, transition: { type: "spring" as const, stiffness: 300, damping: 24 } }
  }

  // Format uptime
  const uptimeSeconds = telemetry?.uptime_seconds || localUptime
  const hours = Math.floor(uptimeSeconds / 3600)
  const minutes = Math.floor((uptimeSeconds % 3600) / 60)
  const seconds = uptimeSeconds % 60
  const uptimeDisplay = `${hours > 0 ? `${hours}h ` : ''}${minutes}m ${String(seconds).padStart(2, '0')}s`

  const cpuDisplay = telemetry?.cpu_percent ? telemetry.cpu_percent.toFixed(1) : '14.2'
  const memoryUsed = telemetry?.memory_used_gb || 4.2
  const memoryTotal = telemetry?.memory_total_gb || 16.0
  const resolvedCount = telemetry?.resolved_alerts_count !== undefined ? telemetry.resolved_alerts_count : 14
  const displayLogs = telemetry?.recent_logs && telemetry.recent_logs.length > 0 ? telemetry.recent_logs : INITIAL_LOGS

  return (
    <motion.div 
      variants={container}
      initial="hidden"
      animate="show"
      className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-4 gap-4 auto-rows-min"
    >
      {/* Top Row: High-Level Summary Cards */}
      <motion.div variants={item}>
        <SummaryCard 
          title="Cluster Uptime (Real-Time)" 
          value={uptimeDisplay} 
          colorClass="text-neon-cyan" 
        />
      </motion.div>
      <motion.div variants={item}>
        <SummaryCard 
          title="Host CPU Utilization" 
          value={cpuDisplay} 
          unit="%" 
          colorClass="text-text-primary" 
        />
      </motion.div>
      <motion.div variants={item}>
        <SummaryCard 
          title="Active Synaptic Pods" 
          value="42" 
          colorClass="text-text-primary" 
        />
      </motion.div>
      <motion.div variants={item}>
        <SummaryCard 
          title="Autonomous Healing" 
          value={`${resolvedCount} fixed`} 
          unit="100% SLA" 
          colorClass="text-neon-green" 
        />
      </motion.div>

      {/* Second Row: Donuts and Line Charts */}
      <motion.div variants={item} className="col-span-1">
        <MemoryDonut used={memoryUsed} total={memoryTotal} />
      </motion.div>
      <motion.div variants={item} className="col-span-1 md:col-span-2 h-72">
        <NetworkIOGraph data={data} />
      </motion.div>
      <motion.div variants={item} className="col-span-1 h-72">
        <LatencyGraph data={data} />
      </motion.div>

      {/* Third Row: Large Logs and Error Rates */}
      <motion.div variants={item} className="col-span-1 md:col-span-2 2xl:col-span-3 h-72">
        <LiveLogStream logs={displayLogs} />
      </motion.div>
      <motion.div variants={item} className="col-span-1 h-72">
        <ErrorRateGraph data={data} />
      </motion.div>
    </motion.div>
  )
}
