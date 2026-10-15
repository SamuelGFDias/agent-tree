import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { AgentRow, PeerRow } from '../types'

const PANE = 'agent-tree'
const agents = atom({ plugin: 'agent-tree', key: 'agents' } as const, [])
const peers = atom({ plugin: 'agent-tree', key: 'peers' } as const, [])
const now = atom({ plugin: 'agent-tree', key: 'now' } as const, 0)
const tab = atom({ plugin: 'agent-tree', key: 'tab' } as const, 'active')

const ENDED = ['completed', 'failed', 'killed']

const ICON: Record<string, string> = {
  pending: '○',
  running: '●',
  waiting: '◐',
  idle: '◌',
  completed: '✓',
  failed: '✗',
  killed: '■',
}
const COLOR: Record<string, string> = {
  running: 'green',
  waiting: 'yellow',
  idle: 'cyan',
  completed: 'gray',
  failed: 'red',
  killed: 'red',
  pending: 'gray',
}

const short = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s)
const elapsed = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000))
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m${String(s % 60).padStart(2, '0')}s`
}

function notePeer($: any, row: Omit<PeerRow, 'count'>) {
  return update($, peers, (list: PeerRow[]) => {
    const old = list.find(p => p.key === row.key)
    const rest = list.filter(p => p.key !== row.key)
    return [...rest, { ...row, count: (old?.count ?? 0) + 1 }].slice(-30)
  })
}

export const register: Register = on => {
  const lastTool = new Map<string, string>()
  const toolCount = new Map<string, number>()
  const seen = new Map<string, number>()
  let stop: (() => void) | undefined

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'agent-tree',
      description: 'Abre o painel em árvore de subagents e sessões',
    })
    void $.ui.open({ id: PANE, title: 'Agentes' })

    stop?.()
    stop = $.clock.every(1000, () => {
      void (async () => {
        const t = await $.clock.now()
        const list = await $.agent.list()
        const rows: AgentRow[] = list.map(a => {
          if (!seen.has(a.id)) seen.set(a.id, t)
          return {
            id: a.id,
            parentId: a.parentId,
            type: a.type,
            description: a.description,
            status: a.status,
            name: a.name,
            lastTool: lastTool.get(a.id),
            tools: toolCount.get(a.id) ?? 0,
            startedAt: seen.get(a.id) ?? t,
          }
        })
        await update($, agents, (old: AgentRow[]) => {
          const ids = new Set(rows.map(r => r.id))
          const gone = old
            .filter(o => !ids.has(o.id))
            .map(o => (ENDED.includes(o.status) ? o : { ...o, status: 'completed', endedAt: t }))
          const fresh = rows.map(r => {
            const o = old.find(x => x.id === r.id)
            const ended = ENDED.includes(r.status)
            return { ...r, endedAt: ended ? (o?.endedAt ?? t) : undefined }
          })
          return [...gone, ...fresh].slice(-100)
        })
        await update($, now, () => t)
      })()
    })

    return next(e)
  })

  on('command.run', { command: 'agent-tree' }, async $ => {
    await $.ui.open({ id: PANE, title: 'Agentes' })
    return { text: 'Painel de agentes aberto.' }
  })

  on('tool.call', async ($, e, next) => {
    if (e.agentId) {
      lastTool.set(e.agentId, e.tool)
      toolCount.set(e.agentId, (toolCount.get(e.agentId) ?? 0) + 1)
    }
    return next(e)
  })

  on('session.send', async ($, e, next) => {
    await notePeer($, {
      key: `out:${e.to}`,
      label: e.to,
      direction: 'out',
      agentId: e.agentId,
      lastText: short(e.text.replace(/\s+/g, ' '), 60),
      at: await $.clock.now(),
    })
    return next(e)
  })

  on('session.receive', async ($, e, next) => {
    const o = e.origin as { kind: string; teammate?: string }
    const who = o.teammate ?? o.kind
    await notePeer($, {
      key: `in:${who}:${e.agentId ?? 'main'}`,
      label: who,
      direction: 'in',
      agentId: e.agentId,
      lastText: short(e.text.replace(/\s+/g, ' '), 60),
      at: await $.clock.now(),
    })
    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const all = await read($, agents)
    const cur = await read($, tab)
    const nDone = all.filter(a => ENDED.includes(a.status)).length
    const nRun = all.length - nDone
    const list = all.filter(a => (cur === 'done') === ENDED.includes(a.status))
    const links = await read($, peers)
    const t = await read($, now)

    const ids = new Set(list.map(a => a.id))
    const kids = (pid?: string) =>
      list.filter(a => (pid === undefined ? !a.parentId || !ids.has(a.parentId) : a.parentId === pid))
    
    const node = (a: AgentRow, prefix: string, isLast: boolean): any[] => {
      const branch = prefix + (isLast ? '└─ ' : '├─ ')
      const nextPrefix = prefix + (isLast ? '   ' : '│  ')
      const c = kids(a.id)
      const out: any[] = [
        <Box key={a.id}>
          <Text dimColor>{branch}</Text>
          <Text color={COLOR[a.status] ?? 'white'}>{ICON[a.status] ?? '?'} </Text>
          <Text bold>{a.name ?? a.type}</Text>
          <Text dimColor> [{a.type}] {a.status} {elapsed((a.endedAt ?? t) - a.startedAt)}</Text>
        </Box>,
        <Box key={a.id + 'd'}>
          <Text dimColor>{nextPrefix}   </Text>
          <Text>{short(a.description || '(sem descrição)', 70)}</Text>
        </Box>,
      ]
      if (a.lastTool) {
        out.push(
          <Box key={a.id + 't'}>
            <Text dimColor>{nextPrefix}   ↳ {a.lastTool} · {a.tools} chamadas</Text>
          </Box>,
        )
      }
      c.forEach((k, i) => out.push(...node(k, nextPrefix, i === c.length - 1)))
      return out
    }

    const roots = kids()
    const rows: any[] = []
    roots.forEach((r, i) => rows.push(...node(r, '', i === roots.length - 1)))

    const outs = links.filter(l => l.direction === 'out')
    const ins = links.filter(l => l.direction === 'in')

    return (
      <Box flexDirection="column">
        <Text bold>◆ Esta sessão</Text>
        <Box>
          <Button
            key="tab-active"
            label={`${cur === 'done' ? ' ' : '▸'}Em andamento (${nRun})`}
            onPress={() => update($, tab, () => 'active')}
          />
          <Text> </Text>
          <Button
            key="tab-done"
            label={`${cur === 'done' ? '▸' : ' '}Concluídos (${nDone})`}
            onPress={() => update($, tab, () => 'done')}
          />
        </Box>
        {roots.length === 0 && (
          <Text dimColor>
            └─ {cur === 'done' ? 'nenhum agente concluído ainda' : 'nenhum agente em andamento'}
          </Text>
        )}
        {rows}
        {links.length > 0 && <Text bold>Conversa com outras sessões</Text>}
        {outs.map(l => (
          <Text key={l.key}>
            <Text color="blue">→ {l.label}</Text>
            <Text dimColor> ×{l.count} "{l.lastText}"</Text>
          </Text>
        ))}
        {ins.map(l => (
          <Text key={l.key}>
            <Text color="magenta">← {l.label}</Text>
            <Text dimColor> ×{l.count} "{l.lastText}"</Text>
          </Text>
        ))}
      </Box>
    )
  })
}
