import React, { useState, useMemo } from 'react'
import { Search, Play, Filter } from 'lucide-react'
import { BarChart, Bar, ResponsiveContainer, XAxis, Tooltip } from 'recharts'

// Generate dummy log data
const generateDummyLogs = () => {
  const services = ['frontend-app', 'auth-service', 'payment-service', 'postgres-db']
  const severities = ['INFO', 'INFO', 'INFO', 'WARN', 'ERROR']
  const messages = [
    'Connection established to 10.2.4.5',
    'User authentication successful',
    'Payment gateway timeout (stripe)',
    'Query took 450ms to execute',
    'Worker node health check failed',
    'Cache miss for key user_session'
  ]

  return Array.from({ length: 50 }, (_, i) => ({
    id: `log-${50 - i}`,
    timestamp: new Date(Date.now() - i * 5000).toISOString().replace('T', ' ').substring(0, 19),
    service: services[Math.floor(Math.random() * services.length)],
    severity: severities[Math.floor(Math.random() * severities.length)],
    message: messages[Math.floor(Math.random() * messages.length)]
  }))
}

const DUMMY_LOGS = generateDummyLogs()

// Generate histogram data (log volume per minute)
const HISTOGRAM_DATA = Array.from({ length: 30 }, (_, i) => ({
  time: `-${30 - i}m`,
  info: Math.floor(Math.random() * 50) + 10,
  warn: Math.floor(Math.random() * 10),
  error: i === 25 ? 45 : Math.floor(Math.random() * 2), // Massive error spike at t-5m
}))

export function LogExplorer() {
  const [query, setQuery] = useState('{app="frontend-app"} |= "timeout"')
  const [logs] = useState(DUMMY_LOGS)

  return (
    <div className="flex-1 flex flex-col gap-4 overflow-hidden">
      
      {/* 1. Query Builder Bar */}
      <div className="glass-panel p-2 flex items-center gap-2 shrink-0">
        <div className="bg-obsidian border border-border-subtle rounded flex items-center px-3 py-2 flex-1 gap-2 focus-within:border-neon-cyan transition-colors">
          <Search className="w-4 h-4 text-text-secondary" />
          <input 
            type="text" 
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="bg-transparent border-none outline-none text-text-primary font-mono text-sm w-full"
            placeholder='e.g. {service="payment-service"} |~ "timeout|error"'
          />
        </div>
        <button className="bg-border-subtle hover:bg-border-focus text-text-primary px-4 py-2 rounded flex items-center gap-2 font-semibold transition-colors">
          <Play className="w-4 h-4" /> Run Query
        </button>
      </div>

      {/* 2. Log Volume Histogram */}
      <div className="glass-panel p-4 h-48 shrink-0 flex flex-col">
        <div className="text-xs font-bold text-text-muted uppercase tracking-widest mb-2 flex items-center justify-between">
          <span>Log Volume</span>
          <span className="text-neon-cyan">Last 30 Minutes</span>
        </div>
        <div className="flex-1 min-h-0">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={HISTOGRAM_DATA} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
              <XAxis dataKey="time" tick={{ fill: 'var(--color-text-secondary)', fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip cursor={{ fill: 'rgba(255,255,255,0.05)' }} contentStyle={{ backgroundColor: 'var(--color-panel)', borderColor: 'var(--color-border-subtle)' }} />
              <Bar dataKey="info" stackId="a" fill="var(--color-border-focus)" isAnimationActive={false} />
              <Bar dataKey="warn" stackId="a" fill="var(--color-neon-yellow)" isAnimationActive={false} />
              <Bar dataKey="error" stackId="a" fill="var(--color-neon-magenta)" isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 3. Detailed Log Stream Table */}
      <div className="glass-panel flex-1 overflow-hidden flex flex-col">
        <div className="border-b border-border-subtle p-2 flex items-center justify-between bg-white/5">
          <div className="text-xs font-bold text-text-primary">50 Results found</div>
          <button className="text-text-secondary hover:text-text-primary flex items-center gap-1 text-xs">
            <Filter className="w-3 h-3" /> Filter
          </button>
        </div>
        
        <div className="flex-1 overflow-auto">
          <table className="w-full text-left border-collapse text-xs font-mono">
            <thead className="sticky top-0 bg-panel border-b border-border-subtle z-10">
              <tr>
                <th className="font-normal px-4 py-2 text-text-muted w-48">Timestamp</th>
                <th className="font-normal px-4 py-2 text-text-muted w-24">Severity</th>
                <th className="font-normal px-4 py-2 text-text-muted w-48">Service</th>
                <th className="font-normal px-4 py-2 text-text-muted">Message</th>
              </tr>
            </thead>
            <tbody>
              {logs.map(log => {
                let severityColor = 'text-text-secondary'
                if (log.severity === 'ERROR') severityColor = 'text-neon-magenta'
                if (log.severity === 'WARN') severityColor = 'text-neon-yellow'
                
                return (
                  <tr key={log.id} className="border-b border-border-subtle/30 hover:bg-white/5 cursor-pointer">
                    <td className="px-4 py-2 text-text-secondary whitespace-nowrap">{log.timestamp}</td>
                    <td className={`px-4 py-2 font-bold ${severityColor}`}>{log.severity}</td>
                    <td className="px-4 py-2 text-text-primary">{log.service}</td>
                    <td className="px-4 py-2 text-text-primary break-all">{log.message}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  )
}
