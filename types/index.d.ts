export type AgentRow = {
  id: string
  parentId?: string
  type: string
  description: string
  status: string
  name?: string
  lastTool?: string
  tools: number
  startedAt: number
  endedAt?: number
}
export type PeerRow = {
  key: string
  label: string
  direction: 'out' | 'in'
  agentId?: string
  count: number
  lastText: string
  at: number
}

export type PreviewLine = { k: 'cmd' | 'out' | 'err' | 'txt'; s: string }

declare module 'claude-code' {
  interface PluginState {
    'agent-tree': { agents: AgentRow[]; peers: PeerRow[]; now: number; tab: string; collapsed: boolean; selected: string; preview: PreviewLine[] }
  }
}
