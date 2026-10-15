import { test, expect } from 'claude-code/testing'

test('o painel mostra a árvore vazia', async $ => {
  const ui = await $.ui.mount({
    plugin: 'agent-tree',
    surface: 'terminal',
    component: 'Pane',
    props: {},
    requestId: 'agent-tree',
    viewport: { columns: 100, rows: 30 },
  })
  expect(await ui.find({ type: 'Text', text: /Esta sessão/ })).toBeDefined()
  await ui.unmount()
})
