'use client'

import React, { useState, useEffect, useRef } from 'react'
import { Search, Command, LayoutDashboard, Activity, Network, FileText, BellRing, ChevronRight } from 'lucide-react'
import { TabState } from './SidebarNav'

interface CommandPaletteProps {
  setActiveTab: (tab: TabState) => void
}

type Action = {
  id: string
  title: string
  icon: React.ReactNode
  tab: TabState
}

const actions: Action[] = [
  { id: '1', title: 'Go to Overview Dashboard', icon: <LayoutDashboard className="w-4 h-4" />, tab: 'overview' },
  { id: '2', title: 'Go to Incident Feed', icon: <Activity className="w-4 h-4" />, tab: 'incidents' },
  { id: '3', title: 'View Cluster Topology', icon: <Network className="w-4 h-4" />, tab: 'topology' },
  { id: '4', title: 'Investigate Trace Waterfall', icon: <Search className="w-4 h-4" />, tab: 'traces' },
  { id: '5', title: 'Open Log Explorer', icon: <FileText className="w-4 h-4" />, tab: 'logs' },
  { id: '6', title: 'Configure Alert Rules', icon: <BellRing className="w-4 h-4" />, tab: 'alerts' },
]

export function CommandPalette({ setActiveTab }: CommandPaletteProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  // Filter actions based on search
  const filteredActions = actions.filter(action => 
    action.title.toLowerCase().includes(search.toLowerCase())
  )

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Toggle on Cmd/Ctrl + K
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setIsOpen((prev) => !prev)
      }
      
      // Close on Escape
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen])

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setSearch('')
      setSelectedIndex(0)
      setTimeout(() => inputRef.current?.focus(), 10)
    }
  }, [isOpen])

  // Handle keyboard navigation within the menu
  useEffect(() => {
    const handleNavigation = (e: KeyboardEvent) => {
      if (!isOpen) return

      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex((prev) => (prev < filteredActions.length - 1 ? prev + 1 : prev))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : prev))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        if (filteredActions[selectedIndex]) {
          setActiveTab(filteredActions[selectedIndex].tab)
          setIsOpen(false)
        }
      }
    }

    window.addEventListener('keydown', handleNavigation)
    return () => window.removeEventListener('keydown', handleNavigation)
  }, [isOpen, filteredActions, selectedIndex, setActiveTab])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]">
      {/* Blurred Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={() => setIsOpen(false)}
      />

      {/* Modal */}
      <div className="relative w-full max-w-xl bg-panel border border-border-focus rounded-xl shadow-[0_0_50px_-12px_rgba(0,0,0,1)] overflow-hidden">
        
        {/* Search Header */}
        <div className="flex items-center px-4 py-4 border-b border-border-subtle bg-black/20">
          <Search className="w-5 h-5 text-text-secondary mr-3" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Type a command or search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 bg-transparent text-text-primary text-lg outline-none placeholder:text-text-muted font-sans"
          />
          <div className="flex items-center gap-1 text-[10px] text-text-muted font-mono font-bold tracking-widest px-2 py-1 bg-white/5 rounded border border-border-subtle">
            <Command className="w-3 h-3" /> K
          </div>
        </div>

        {/* Action List */}
        <div className="max-h-[60vh] overflow-y-auto py-2">
          {filteredActions.length === 0 ? (
            <div className="px-6 py-8 text-center text-text-muted text-sm font-mono">
              No results found.
            </div>
          ) : (
            <div className="px-2">
              <div className="px-3 py-2 text-[10px] text-text-muted font-mono font-bold tracking-widest uppercase mb-1">
                Navigation
              </div>
              {filteredActions.map((action, index) => (
                <div
                  key={action.id}
                  onClick={() => {
                    setActiveTab(action.tab)
                    setIsOpen(false)
                  }}
                  onMouseEnter={() => setSelectedIndex(index)}
                  className={`flex items-center justify-between px-3 py-3 rounded-lg cursor-pointer transition-colors ${
                    index === selectedIndex 
                      ? 'bg-white/10 text-text-primary' 
                      : 'text-text-secondary hover:bg-white/5 hover:text-text-primary'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {action.icon}
                    <span className="text-sm font-medium font-sans">{action.title}</span>
                  </div>
                  {index === selectedIndex && (
                    <ChevronRight className="w-4 h-4 text-text-secondary" />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
        
        {/* Footer */}
        <div className="px-4 py-3 border-t border-border-subtle bg-black/40 flex items-center gap-4 text-[10px] text-text-muted font-mono font-bold">
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 rounded bg-white/5 border border-border-subtle text-text-secondary font-sans">↑</kbd>
            <kbd className="px-1.5 py-0.5 rounded bg-white/5 border border-border-subtle text-text-secondary font-sans">↓</kbd>
            Navigate
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 rounded bg-white/5 border border-border-subtle text-text-secondary font-sans">↵</kbd>
            Select
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 rounded bg-white/5 border border-border-subtle text-text-secondary font-sans">esc</kbd>
            Close
          </span>
        </div>
      </div>
    </div>
  )
}
