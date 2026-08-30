'use client'

import React, { useState, useCallback, useEffect } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Node,
  Edge,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  BackgroundVariant,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useQuery, useQueryClient } from '@tanstack/react-query'

import {
  fetchTopologyGraph, fetchAstraHistory,
  type TopologyGraph, type TopologyNode as ApiNode
} from '@/lib/api'

import { ServiceNode }      from './topology/ServiceNode'
import { AnimatedEdge }     from './topology/AnimatedEdge'
import { NodePalette }      from './topology/NodePalette'
import { NodeConfigDrawer } from './topology/NodeConfigDrawer'
import { TopologyToolbar }  from './topology/TopologyToolbar'
import { EdgePayloadModal } from './topology/EdgePayloadModal'
import { HITLOverlay }      from './topology/HITLOverlay'

const nodeTypes = { custom: ServiceNode }
const edgeTypes = { custom: AnimatedEdge }

// ── Static layout coordinates per node type ────────────────────────────────
const TYPE_POSITIONS: Record<string, { x: number; y: number }[]> = {
  ingress:  [{ x: 380, y: 40  }],
  service:  [{ x: 80, y: 200 }, { x: 380, y: 200 }, { x: 680, y: 200 }],
  worker:   [{ x: 200, y: 380 }, { x: 560, y: 380 }],
  database: [{ x: 80, y: 520  }, { x: 380, y: 520 }],
  cache:    [{ x: 560, y: 520 }],
  queue:    [{ x: 700, y: 380 }],
  external: [{ x: 700, y: 60  }],
}
const typeCounters: Record<string, number> = {}

function assignPosition(nodeType: string): { x: number; y: number } {
  const positions = TYPE_POSITIONS[nodeType] || TYPE_POSITIONS.service
  const idx = (typeCounters[nodeType] || 0) % positions.length
  typeCounters[nodeType] = (typeCounters[nodeType] || 0) + 1
  // Add a small jitter to avoid exact overlap when more nodes than positions
  const base = positions[idx]
  const overflow = Math.floor((typeCounters[nodeType] - 1) / positions.length)
  return { x: base.x + overflow * 250, y: base.y + overflow * 140 }
}

// ── Convert backend topology graph → React Flow nodes + edges ─────────────
function graphToFlow(graph: TopologyGraph): { nodes: Node[]; edges: Edge[] } {
  // reset counters
  Object.keys(typeCounters).forEach(k => delete typeCounters[k])

  const nodes: Node[] = graph.nodes.map(n => ({
    id: n.id,
    type: 'custom',
    position: assignPosition(n.node_type),
    data: {
      id: n.id,
      label: n.label,
      node_type: n.node_type,
      status: n.status,
      namespace: n.namespace,
      port: n.port,
      image: n.image,
      helm_release: n.helm_release,
      metrics: n.metrics,
      incidents: n.incidents,
    },
  }))

  const edges: Edge[] = graph.edges.map(e => ({
    id: e.id,
    type: 'custom',
    source: e.source,
    target: e.target,
    animated: true,
    data: {
      protocol: e.protocol,
      latency_ms: e.latency_ms,
      rps: e.rps,
      error_rate: e.error_rate,
      is_error: e.is_error,
    },
  }))

  return { nodes, edges }
}

// ── Palette node type config ───────────────────────────────────────────────
const PALETTE_NODE_DEFAULTS: Record<string, any> = {
  ingress:  { port: '443',  image: 'nginx/nginx-ingress:3.4',         helm_release: 'ingress-nginx' },
  service:  { port: '8080', image: 'gcr.io/astra/service:latest',     helm_release: 'service' },
  worker:   { port: '8090', image: 'gcr.io/astra/worker:latest',      helm_release: 'worker' },
  database: { port: '5432', image: 'postgres:16-alpine',              helm_release: 'postgresql' },
  cache:    { port: '6379', image: 'redis:7-alpine',                  helm_release: 'redis' },
  queue:    { port: '9092', image: 'confluentinc/cp-kafka:7.6',       helm_release: 'kafka' },
  external: { port: '443',  image: 'external/api:latest',             helm_release: '' },
}

// ── Static fallback topology (used when backend is unreachable) ───────────
const STATIC_FALLBACK: TopologyGraph = {
  timestamp: new Date().toISOString(),
  namespace: 'production',
  nodes: [
    { id: 'ingress-nginx',       label: 'ingress-nginx',       node_type: 'ingress',   status: 'healthy',  namespace: 'production', port: '443',  image: 'nginx/nginx-ingress:3.4',       helm_release: 'ingress-nginx', incidents: [], metrics: { cpu_percent: 8.2,  mem_mb: 128,  replicas: 2, ready_replicas: 2, restart_count: 0,  latency_p99_ms: 12.4, error_rate: 0.001 } },
    { id: 'auth-service',        label: 'auth-service',        node_type: 'service',   status: 'healthy',  namespace: 'production', port: '8081', image: 'gcr.io/astra/auth:v3.2.1',      helm_release: 'auth-svc',      incidents: [], metrics: { cpu_percent: 22.1, mem_mb: 256,  replicas: 3, ready_replicas: 3, restart_count: 0,  latency_p99_ms: 18.2, error_rate: 0.002 } },
    { id: 'payment-service',     label: 'payment-service',     node_type: 'service',   status: 'healthy',  namespace: 'production', port: '8082', image: 'gcr.io/astra/payment:v2.8.0',   helm_release: 'payment-svc',   incidents: [], metrics: { cpu_percent: 35.6, mem_mb: 512,  replicas: 4, ready_replicas: 4, restart_count: 0,  latency_p99_ms: 22.1, error_rate: 0.003 } },
    { id: 'frontend-crash-app',  label: 'frontend-crash-app',  node_type: 'service',   status: 'crashed',  namespace: 'production', port: '3000', image: 'gcr.io/astra/frontend:v1.4.0', helm_release: 'frontend',      incidents: [], metrics: { cpu_percent: 98.7, mem_mb: 512,  replicas: 1, ready_replicas: 0, restart_count: 14, latency_p99_ms: 520,  error_rate: 0.94  } },
    { id: 'postgres-db',         label: 'postgres-db',         node_type: 'database',  status: 'healthy',  namespace: 'production', port: '5432', image: 'postgres:16.1-alpine',          helm_release: 'postgresql',    incidents: [], metrics: { cpu_percent: 12.3, mem_mb: 1024, replicas: 2, ready_replicas: 2, restart_count: 0,  latency_p99_ms: 8.1,  error_rate: 0.0   } },
    { id: 'redis-cache',         label: 'redis-cache',         node_type: 'cache',     status: 'healthy',  namespace: 'production', port: '6379', image: 'redis:7.2-alpine',              helm_release: 'redis',         incidents: [], metrics: { cpu_percent: 5.8,  mem_mb: 256,  replicas: 3, ready_replicas: 3, restart_count: 0,  latency_p99_ms: 5.3,  error_rate: 0.0   } },
    { id: 'kafka-broker',        label: 'kafka-broker',        node_type: 'queue',     status: 'healthy',  namespace: 'production', port: '9092', image: 'confluentinc/cp-kafka:7.6',     helm_release: 'kafka',         incidents: [], metrics: { cpu_percent: 18.4, mem_mb: 768,  replicas: 3, ready_replicas: 3, restart_count: 0,  latency_p99_ms: 3.2,  error_rate: 0.0   } },
    { id: 'notification-worker', label: 'notification-worker', node_type: 'worker',    status: 'degraded', namespace: 'production', port: '8090', image: 'gcr.io/astra/notif-worker:v1.2', helm_release: 'notif-worker', incidents: [], metrics: { cpu_percent: 62.4, mem_mb: 384,  replicas: 2, ready_replicas: 1, restart_count: 3,  latency_p99_ms: 88,   error_rate: 0.12  } },
  ],
  edges: [
    { id: 'e-ing-auth',    source: 'ingress-nginx',       target: 'auth-service',        protocol: 'HTTP/2',    latency_ms: 12.4, rps: 1420, error_rate: 0.001, is_error: false },
    { id: 'e-ing-pay',     source: 'ingress-nginx',       target: 'payment-service',     protocol: 'HTTP/2',    latency_ms: 16.2, rps: 980,  error_rate: 0.003, is_error: false },
    { id: 'e-ing-front',   source: 'ingress-nginx',       target: 'frontend-crash-app',  protocol: 'HTTP/2',    latency_ms: 520,  rps: 14,   error_rate: 0.94,  is_error: true  },
    { id: 'e-auth-db',     source: 'auth-service',        target: 'postgres-db',         protocol: 'PostgreSQL', latency_ms: 8.1, rps: 2100, error_rate: 0.0,   is_error: false },
    { id: 'e-pay-redis',   source: 'payment-service',     target: 'redis-cache',         protocol: 'Redis',     latency_ms: 5.3,  rps: 3400, error_rate: 0.0,   is_error: false },
    { id: 'e-front-db',    source: 'frontend-crash-app',  target: 'postgres-db',         protocol: 'PostgreSQL', latency_ms: 490, rps: 8,    error_rate: 0.88,  is_error: true  },
    { id: 'e-auth-kafka',  source: 'auth-service',        target: 'kafka-broker',        protocol: 'Kafka',     latency_ms: 3.2,  rps: 420,  error_rate: 0.0,   is_error: false },
    { id: 'e-kafka-notif', source: 'kafka-broker',        target: 'notification-worker', protocol: 'Kafka',     latency_ms: 88,   rps: 210,  error_rate: 0.12,  is_error: false },
  ],
}

export function ClusterTopology() {
  const queryClient = useQueryClient()

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const [activeNodeId, setActiveNodeId]  = useState<string | null>(null)
  const [selectedEdge, setSelectedEdge]  = useState<Edge | null>(null)
  const [searchQuery, setSearchQuery]    = useState('')
  const [statusFilter, setStatusFilter]  = useState('all')
  const [isInitialized, setIsInitialized] = useState(false)

  // ── Live topology data from backend ──────────────────────────────────────
  const { data: topologyGraph, refetch: refetchTopology } = useQuery<TopologyGraph | null>({
    queryKey: ['topologyGraph'],
    queryFn: fetchTopologyGraph,
    refetchInterval: 5000,
    staleTime: 3000,
  })

  // Resolve effective graph: live backend data OR static fallback
  const effectiveGraph = topologyGraph ?? STATIC_FALLBACK

  // ── Live incident history for HITL overlay ────────────────────────────────
  const { data: history } = useQuery({
    queryKey: ['history'],
    queryFn: fetchAstraHistory,
    refetchInterval: 5000,
  })

  // Sync backend topology → canvas (initial + on refresh)
  useEffect(() => {
    const source = topologyGraph ?? STATIC_FALLBACK
    if (!isInitialized) {
      const { nodes: n, edges: e } = graphToFlow(source)
      setNodes(n)
      setEdges(e)
      setIsInitialized(true)
    } else if (topologyGraph) {
      // Live update: sync status/metrics only, preserve user-arranged positions
      setNodes(prev =>
        prev.map(node => {
          const backendNode = topologyGraph.nodes.find(bn => bn.id === node.id)
          if (!backendNode) return node
          return {
            ...node,
            data: {
              ...node.data,
              status: backendNode.status,
              metrics: backendNode.metrics,
              incidents: backendNode.incidents,
            },
          }
        })
      )
    }
  }, [topologyGraph, isInitialized])

  // Keyboard: Escape = close drawers
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setActiveNodeId(null); setSelectedEdge(null) }
      if (e.key === 'r' && !e.ctrlKey && !e.metaKey) refetchTopology()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const onConnect = useCallback(
    (params: Connection | Edge) => {
      if (params.source === params.target) return
      setEdges(eds => addEdge({
        ...params,
        type: 'custom',
        animated: true,
        data: { is_error: false, latency_ms: 14, rps: 800, protocol: 'HTTP/2', error_rate: 0 },
      }, eds))
    },
    [setEdges]
  )

  const handleAddNode = (type: string) => {
    const ts = Date.now()
    const id = `${type}-${ts}`
    const count = nodes.filter(n => n.data?.node_type === type).length
    const base = TYPE_POSITIONS[type]?.[0] || { x: 200, y: 200 }
    const pos = { x: base.x + count * 260, y: base.y + Math.floor(count / 3) * 160 }
    const defaults = PALETTE_NODE_DEFAULTS[type] || PALETTE_NODE_DEFAULTS.service

    setNodes(prev => [...prev, {
      id,
      type: 'custom',
      position: pos,
      data: {
        id,
        label: `${type}-${nodes.length + 1}`,
        node_type: type,
        status: 'healthy',
        namespace: 'production',
        ...defaults,
        metrics: { cpu_percent: 12, mem_mb: 256, replicas: 2, ready_replicas: 2, restart_count: 0, latency_p99_ms: 18, error_rate: 0 },
        incidents: [],
      },
    }])
    setActiveNodeId(id)
  }

  const handleUpdateNodeData = (nodeId: string, updatedData: any) => {
    setNodes(prev => prev.map(node => {
      if (node.id !== nodeId) return node
      return { ...node, data: { ...node.data, ...updatedData } }
    }))
    if (updatedData.status === 'healthy') {
      setEdges(prev => prev.map(edge => {
        if (edge.source !== nodeId && edge.target !== nodeId) return edge
        return { ...edge, data: { ...edge.data, is_error: false, latency_ms: 14 } }
      }))
    }
  }

  const handleAutoLayout = () => {
    Object.keys(typeCounters).forEach(k => delete typeCounters[k])
    setNodes(prev => {
      const byType: Record<string, Node[]> = {}
      prev.forEach(n => {
        const t = (n.data?.node_type as string) || 'service'
        byType[t] = [...(byType[t] || []), n]
      })
      return prev.map(node => {
        const t = (node.data?.node_type as string) || 'service'
        const idx = byType[t].findIndex(n => n.id === node.id)
        const positions = TYPE_POSITIONS[t] || TYPE_POSITIONS.service
        const base = positions[idx % positions.length]
        const overflow = Math.floor(idx / positions.length)
        return { ...node, position: { x: base.x + overflow * 260, y: base.y + overflow * 150 } }
      })
    })
  }

  const handleInjectChaos = () => {
    const healthy = nodes.filter(n => n.data?.status !== 'crashed' && n.data?.node_type !== 'ingress')
    if (healthy.length === 0) return
    const target = healthy[Math.floor(Math.random() * healthy.length)]
    setNodes(prev => prev.map(n =>
      n.id === target.id ? { ...n, data: { ...n.data, status: 'crashed', metrics: { ...n.data.metrics as any, cpu_percent: 98, restart_count: 5, error_rate: 0.94 } } } : n
    ))
    setEdges(prev => prev.map(e =>
      (e.source === target.id || e.target === target.id)
        ? { ...e, data: { ...e.data, is_error: true, latency_ms: 512, error_rate: 0.94 } }
        : e
    ))
    setActiveNodeId(target.id)
  }

  const handleAutoHealAll = () => {
    setNodes(prev => prev.map(n => ({
      ...n,
      data: { ...n.data, status: 'healthy', metrics: { ...n.data.metrics as any, cpu_percent: 15, restart_count: 0, error_rate: 0 } },
    })))
    setEdges(prev => prev.map(e => ({
      ...e,
      data: { ...e.data, is_error: false, latency_ms: 14, error_rate: 0 },
    })))
  }

  // Compute stats
  const activeNode    = nodes.find(n => n.id === activeNodeId) || null
  const crashedCount  = nodes.filter(n => n.data?.status === 'crashed').length
  const degradedCount = nodes.filter(n => n.data?.status === 'degraded').length
  const sourceNode    = nodes.find(n => n.id === selectedEdge?.source)
  const targetNode    = nodes.find(n => n.id === selectedEdge?.target)

  // HITL incidents for overlay — only 'paused' status from history
  const hitlIncidents = (history || []).filter(h => h.status === 'paused') as any[]

  // Filter nodes by search + status (visual only, dims non-matching)
  const filteredNodeIds = new Set(
    nodes
      .filter(n => {
        const matchesSearch = !searchQuery
          || (n.data?.label as string || '').toLowerCase().includes(searchQuery.toLowerCase())
        const matchesStatus = statusFilter === 'all' || n.data?.status === statusFilter
        return matchesSearch && matchesStatus
      })
      .map(n => n.id)
  )

  const displayNodes = nodes.map(n => ({
    ...n,
    style: filteredNodeIds.has(n.id) ? {} : { opacity: 0.2, pointerEvents: 'none' as const },
  }))

  return (
    <div
      className="flex-1 relative overflow-hidden h-full"
      style={{
        background: 'radial-gradient(ellipse at 30% 20%, rgba(0,240,255,0.04) 0%, transparent 50%), radial-gradient(ellipse at 70% 80%, rgba(129,140,248,0.04) 0%, transparent 50%), #080a0f',
        borderRadius: 16,
        border: '1px solid rgba(255,255,255,0.07)',
      }}
    >
      {/* Left Palette */}
      <NodePalette onAddNode={handleAddNode} />

      {/* Top-Right Toolbar */}
      <TopologyToolbar
        onAutoLayout={handleAutoLayout}
        onInjectChaos={handleInjectChaos}
        onAutoHealAll={handleAutoHealAll}
        onRefresh={() => { refetchTopology(); queryClient.invalidateQueries({ queryKey: ['topologyGraph'] }) }}
        nodeCount={nodes.length}
        crashedCount={crashedCount}
        degradedCount={degradedCount}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        isLive={!!topologyGraph}
      />

      {/* HITL On-Canvas Overlay */}
      <HITLOverlay incidents={hitlIncidents} />

      {/* Node Config Drawer */}
      <NodeConfigDrawer
        node={activeNode}
        onClose={() => setActiveNodeId(null)}
        onSave={handleUpdateNodeData}
        onRefreshTopology={() => refetchTopology()}
      />

      {/* Edge Payload Modal */}
      <EdgePayloadModal
        edge={selectedEdge}
        sourceNodeLabel={(sourceNode?.data?.label as string) || 'Source'}
        targetNodeLabel={(targetNode?.data?.label as string) || 'Target'}
        onClose={() => setSelectedEdge(null)}
      />

      {/* React Flow Canvas */}
      <ReactFlow
        nodes={displayNodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={(_, node) => { setSelectedEdge(null); setActiveNodeId(node.id) }}
        onEdgeClick={(_, edge) => { setActiveNodeId(null); setSelectedEdge(edge) }}
        onPaneClick={() => { setActiveNodeId(null); setSelectedEdge(null) }}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        minZoom={0.3}
        maxZoom={2.5}
        className="bg-transparent"
        defaultEdgeOptions={{ animated: true }}
      >
        {/* Dot-pattern background grid */}
        <Background
          variant={BackgroundVariant.Dots}
          color="rgba(255,255,255,0.06)"
          gap={24}
          size={1.2}
        />

        {/* Controls */}
        <Controls
          showInteractive={false}
          className="rounded-xl overflow-hidden shadow-xl"
          style={{
            background: 'rgba(9,10,15,0.92)',
            border: '1px solid rgba(255,255,255,0.1)',
          }}
        />

        {/* MiniMap */}
        <MiniMap
          nodeColor={n => {
            if (n.data?.status === 'crashed')  return '#f2495c'
            if (n.data?.status === 'degraded') return '#f59e0b'
            if (n.data?.status === 'pending')  return '#818cf8'
            return '#00f0ff'
          }}
          maskColor="rgba(0,0,0,0.78)"
          style={{
            background: 'rgba(9,10,15,0.92)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 12,
          }}
        />
      </ReactFlow>
    </div>
  )
}
