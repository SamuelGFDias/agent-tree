import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { AgentRow, PeerRow, PreviewLine } from '../types'

const PANE = 'agent-tree'
const agents = atom({ plugin: 'agent-tree', key: 'agents' } as const, [])
const peers = atom({ plugin: 'agent-tree', key: 'peers' } as const, [])
const now = atom({ plugin: 'agent-tree', key: 'now' } as const, 0)
const tab = atom({ plugin: 'agent-tree', key: 'tab' } as const, 'active')
const collapsed = atom({ plugin: 'agent-tree', key: 'collapsed' } as const, false)
const selected = atom({ plugin: 'agent-tree', key: 'selected' } as const, '')
const preview = atom({ plugin: 'agent-tree', key: 'preview' } as const, [])

// Atalho global: ação de teclado do engine cujo chord o usuário pode religar em keybindings.json.
const TOGGLE_ACTION = 'app:toggleBrief'
const PREVIEW_LINES = 14

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

const oneLine = (s: string) => s.replace(/\s+/g, ' ').trim()

// Últimos comandos e saídas de um agente, como um "terminal" de leitura.
function buildPreview(msgs: any[]): PreviewLine[] {
  const out: PreviewLine[] = []
  for (const m of msgs) {
    if (m.role === 'assistant' && m.text) out.push({ k: 'txt', s: oneLine(m.text) })
    for (const u of m.toolUses ?? []) {
      const inp = (u.input ?? {}) as Record<string, unknown>
      const arg =
        (inp.command as string) ??
        (inp.file_path as string) ??
        (inp.pattern as string) ??
        (inp.description as string) ??
        (inp.prompt as string) ??
        Object.values(inp).find(v => typeof v === 'string') ??
        ''
      out.push({ k: 'cmd', s: `${u.tool === 'Bash' ? '$' : u.tool + ' ›'} ${oneLine(String(arg))}` })
      const res = typeof u.text === 'string' ? u.text : typeof u.result === 'string' ? u.result : ''
      const lines = res.split(String.fromCharCode(10)).map((l: string) => l.trimEnd()).filter((l: string) => l.trim())
      for (const l of lines.slice(-3)) out.push({ k: u.isError ? 'err' : 'out', s: l })
    }
  }
  return out.slice(-PREVIEW_LINES)
}

function notePeer($: any, row: Omit<PeerRow, 'count'>) {
  return update($, peers, (list: PeerRow[]) => {
    const old = list.find(p => p.key === row.key)
    const rest = list.filter(p => p.key !== row.key)
    return [...rest, { ...row, count: (old?.count ?? 0) + 1 }].slice(-30)
  })
}

// Envelope de mensagem entre sessões: <cross-session-message from="uds:..." from-name="nome" ...>
const envelope = (text: string) => ({
  from: /\bfrom="([^"]+)"/.exec(text)?.[1],
  name: /\bfrom-name="([^"]+)"/.exec(text)?.[1],
})
// Endereço cru (uds:\\.\pipe\...) vira algo legível quando o nome da sessão não é conhecido.
const bodyOf = (t: string) => t.replace(/<\/?cross-session-message[^>]*>/g, '').replace(/\s+/g, ' ').trim()
const readable = (addr: string) => (/^(uds:|bridge:|\w+:\/\/)/.test(addr) ? `sessão …${addr.slice(-6)}` : addr)

export const register: Register = on => {
  // endereço da sessão -> nome, aprendido nas mensagens recebidas; vale também para os envios.
  const names = new Map<string, string>()
  const lastTool = new Map<string, string>()
  const toolCount = new Map<string, number>()
  const seen = new Map<string, number>()
  let stop: (() => void) | undefined

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'agent-tree',
      description: 'Abre o painel em árvore de subagents e sessões',
    })
    await $.command.register({
      name: 'agent-tree-toggle',
      description: 'Recolhe/expande o painel de agentes',
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

        const sel = await read($, selected)
        if (sel) {
          try {
            const msgs = await $.session.messages({ agentId: sel })
            if (!('deny' in msgs)) await update($, preview, () => buildPreview(msgs as any[]))
          } catch {}
        }
      })()
    })

    return next(e)
  })

  on('command.run', { command: 'agent-tree' }, async $ => {
    await $.ui.open({ id: PANE, title: 'Agentes' })
    await update($, collapsed, () => false)
    return { text: 'Painel de agentes aberto.' }
  })

  on('command.run', { command: 'agent-tree-toggle' }, async $ => {
    await $.ui.open({ id: PANE, title: 'Agentes' })
    const now = await update($, collapsed, (c: boolean) => !c)
    return { text: now ? 'Painel recolhido.' : 'Painel expandido.' }
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
      label: names.get(e.to) ?? readable(e.to),
      direction: 'out',
      agentId: e.agentId,
      lastText: short(bodyOf(e.text), 80),
      at: await $.clock.now(),
    })
    return next(e)
  })

  on('session.receive', async ($, e, next) => {
    const o = e.origin as { kind: string; teammate?: string }
    const env = envelope(e.text)
    if (env.from && env.name) names.set(env.from, env.name)
    const who = o.teammate ?? env.name ?? (env.from ? readable(env.from) : o.kind)
    // Envios anteriores a este endereço ganham o nome agora que ele é conhecido.
    if (env.from && env.name) {
      await update($, peers, (list: PeerRow[]) =>
        list.map(p => (p.key === `out:${env.from}` ? { ...p, label: env.name as string } : p)),
      )
    }
    await notePeer($, {
      key: `in:${who}:${e.agentId ?? 'main'}`,
      label: who,
      direction: 'in',
      agentId: e.agentId,
      lastText: short(bodyOf(e.text), 80),
      at: await $.clock.now(),
    })
    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const all = await read($, agents)
    const cur = await read($, tab)
    const isCollapsed = await read($, collapsed)
    const sel = await read($, selected)
    const lines = await read($, preview)
    const nDone = all.filter(a => ENDED.includes(a.status)).length
    const nRun = all.length - nDone
    const list = all.filter(a => (cur === 'done') === ENDED.includes(a.status))
    const links = await read($, peers)
    const t = await read($, now)

    // Largura útil: a do corpo do painel, senão a do terminal. Tudo é truncado a ela.
    const cols = Math.max(20, (e.props as any).bodyColumns ?? e.viewport?.columns ?? 80)
    const narrow = cols < 50
    const fit = (s: string, used = 0) => short(s, Math.max(4, cols - used))
    const rule = (label: string) => <Text dimColor>{('── ' + label + ' ').padEnd(cols, '─').slice(0, cols)}</Text>

    const toggle = (
      <Button key="toggle" plain hotkey="c" action={TOGGLE_ACTION} onPress={() => update($, collapsed, (c: boolean) => !c)}>
        <Text dimColor>{isCollapsed ? '▸ expandir' : '▾ recolher'}</Text>
      </Button>
    )

    // Resumo em fichas coloridas: dá para ler o estado da sessão num relance.
    const summary = (
      <Text>
        <Text color={nRun > 0 ? 'green' : 'gray'} bold>● {nRun}</Text>
        <Text dimColor> {narrow ? '' : 'ativos'}  </Text>
        <Text color="gray">✓ {nDone}</Text>
        <Text dimColor> {narrow ? '' : 'concluídos'}</Text>
      </Text>
    )

    if (isCollapsed) {
      return (
        <Box>
          <Text bold color="cyan">◆ </Text>
          {summary}
          <Text> </Text>
          {toggle}
        </Box>
      )
    }

    const ids = new Set(list.map(a => a.id))
    const kids = (pid?: string) =>
      list.filter(a => (pid === undefined ? !a.parentId || !ids.has(a.parentId) : a.parentId === pid))

    const node = (a: AgentRow, prefix: string, isLast: boolean): any[] => {
      const branch = prefix + (isLast ? '└ ' : '├ ')
      const nextPrefix = prefix + (isLast ? '  ' : '│ ')
      const c = kids(a.id)
      const title = a.name ?? a.type
      const live = !ENDED.includes(a.status)
      const quiet = a.status === 'running' || a.status === 'completed'
      const room = cols - branch.length - 2
      const shownTitle = short(title, Math.max(6, room - 12))
      const isSel = sel === a.id
      const out: any[] = [
        <Box key={a.id}>
          <Text dimColor>{branch}</Text>
          <Text color={COLOR[a.status] ?? 'white'} bold>{ICON[a.status] ?? '?'} </Text>
          <Button key={'sel:' + a.id} plain onPress={() => pick(a.id)}>
            <Text bold inverse={isSel} dimColor={!live && !isSel}>{shownTitle}</Text>
          </Button>
          <Text color={live ? 'green' : 'gray'}> {elapsed((a.endedAt ?? t) - a.startedAt)}</Text>
          {!quiet && <Text color={COLOR[a.status] ?? 'white'}> {a.status}</Text>}
        </Box>,
      ]
      if (!narrow) {
        const sub = [a.description, a.name && a.name !== a.type ? a.type : ''].filter(Boolean).join(' · ')
        out.push(
          <Box key={a.id + 'd'}>
            <Text dimColor>{nextPrefix}  </Text>
            <Text>{fit(sub || '(sem descrição)', nextPrefix.length + 2)}</Text>
          </Box>,
        )
      }
      if (a.lastTool) {
        out.push(
          <Box key={a.id + 't'}>
            <Text dimColor>{fit(`${nextPrefix}  ↳ ${a.lastTool} · ${a.tools}×`)}</Text>
          </Box>,
        )
      }
      c.forEach((k, i) => out.push(...node(k, nextPrefix, i === c.length - 1)))
      return out
    }

    const pick = async (id: string) => {
      const same = (await read($, selected)) === id
      await update($, selected, () => (same ? '' : id))
      await update($, preview, () => [])
      if (!same) {
        try {
          const msgs = await $.session.messages({ agentId: id })
          if (!('deny' in msgs)) await update($, preview, () => buildPreview(msgs as any[]))
          await $.ui.scroll({ to: { key: 'preview' } as any, in: PANE, block: 'nearest' })
        } catch {}
      }
    }

    const roots = kids()
    const rows: any[] = []
    roots.forEach((r, i) => rows.push(...node(r, '', i === roots.length - 1)))

    const outs = links.filter(l => l.direction === 'out')
    const ins = links.filter(l => l.direction === 'in')
    const selAgent = all.find(a => a.id === sel)

    const lineColor = (k: string) => (k === 'cmd' ? 'green' : k === 'err' ? 'red' : k === 'txt' ? 'cyan' : undefined)

    const tabBtn = (key: string, id: string, label: string, n: number) => (
      <Button key={key} plain onPress={() => update($, tab, () => id)}>
        <Text bold={cur === id} inverse={cur === id} dimColor={cur !== id}>{` ${label} ${n} `}</Text>
      </Button>
    )

    const peerRow = (l: PeerRow) => (
      <Box key={l.key} flexDirection="column">
        <Text>
          <Text color={l.direction === 'out' ? 'blue' : 'magenta'} bold>{l.direction === 'out' ? '→ ' : '← '}</Text>
          <Text bold>{fit(l.label, 12)}</Text>
          <Text dimColor> ×{l.count}</Text>
        </Text>
        {!narrow && <Text dimColor>{fit(`  “${l.lastText}”`)}</Text>}
      </Box>
    )

    return (
      <Box flexDirection="column">
        <Box>
          <Text bold color="cyan">◆ Agentes </Text>
          {summary}
          <Text> </Text>
          {toggle}
        </Box>
        <Box>
          {tabBtn('tab-active', 'active', narrow ? 'Ativos' : 'Em andamento', nRun)}
          <Text> </Text>
          {tabBtn('tab-done', 'done', narrow ? 'Fim' : 'Concluídos', nDone)}
        </Box>
        {roots.length === 0 && (
          <Text dimColor>{fit(cur === 'done' ? '  nenhum agente concluído ainda' : '  nada rodando agora')}</Text>
        )}
        {rows}
        {selAgent && (
          <Box key="preview" flexDirection="column">
            {rule(`Terminal · ${selAgent.name ?? selAgent.type}`)}
            {lines.length === 0 && <Text dimColor>  (sem saída ainda)</Text>}
            {lines.map((l, i) => (
              <Text key={'pv' + i} color={lineColor(l.k)} dimColor={l.k === 'out'}>
                {fit(l.k === 'out' ? '  ' + l.s : l.s)}
              </Text>
            ))}
            <Box>
              <Button key="pv-open" plain onPress={() => $.ui.view({ agentId: selAgent.id })}>
                <Text color="cyan">↗ transcrição</Text>
              </Button>
              <Text>  </Text>
              <Button key="pv-close" plain onPress={() => update($, selected, () => '')}>
                <Text dimColor>✕ fechar</Text>
              </Button>
            </Box>
          </Box>
        )}
        {links.length > 0 && (
          <Box flexDirection="column">
            {rule(narrow ? 'Sessões' : 'Outras sessões')}
            {outs.map(peerRow)}
            {ins.map(peerRow)}
          </Box>
        )}
        {e.props.isFocused && <Text dimColor>{fit('↑↓ rolar · c recolher · Tab navegar')}</Text>}
      </Box>
    )
  })
}