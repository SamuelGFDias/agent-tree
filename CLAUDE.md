# agent-tree

Mod do Claude Code (painel em árvore de subagents e sessões). Código em `hooks/register.tsx`, testes em `hooks/register.test.ts`, tipos em `types/index.d.ts`.

## Regras
- Arquivos em UTF-8 **sem BOM**. No PowerShell 5.1 não use `Set-Content`/`Get-Content` sem encoding em arquivos com acento: use `[IO.File]::ReadAllText/WriteAllText` com `UTF8Encoding($false)`.
- `.claude-plugin/types/` é gerado pelo Claude Code e ignorado pelo git: nunca editar.
- O Claude Code só atualiza o plugin quando a `version` em `.claude-plugin/plugin.json` muda. Toda mudança publicada exige bump de versão (use `/release-agent-tree`).
- Typecheck: `npx tsc --noEmit -p .` (exige `.claude-plugin/types/` presente).
- O painel precisa caber em terminal estreito (o teste cobre 30 colunas).