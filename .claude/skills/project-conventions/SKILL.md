---
name: project-conventions
description: Convenções do agent-tree (encoding, versão, tipos gerados, largura do painel). Consulte ao editar qualquer arquivo do repositório.
user-invocable: false
---

- UTF-8 sem BOM; acentos são corrompidos por `Set-Content`/`Get-Content` sem encoding no PowerShell 5.1.
- `.claude-plugin/types/` é gerado e ignorado: não editar.
- Mudança publicada exige bump de `version` em `.claude-plugin/plugin.json`, senão o Claude Code não atualiza o plugin.
- O componente `Pane` deve caber em 30 colunas e mostrar só o resumo quando recolhido.
- Testes usam `claude-code/testing` (`$.ui.mount` com `plugin: 'agent-tree'`).