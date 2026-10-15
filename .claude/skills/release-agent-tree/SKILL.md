---
name: release-agent-tree
description: Publica uma nova versão do plugin agent-tree (bump de versão, commit, push e atualização local)
disable-model-invocation: true
---

Publique o plugin agent-tree. Argumento opcional: nova versão (padrão: incrementa o minor).

1. `git status`: confirme que só há mudanças esperadas; commite-as com mensagem descritiva.
2. Edite `version` em `.claude-plugin/plugin.json` lendo e gravando com `[IO.File]` em UTF-8 sem BOM (nunca `Set-Content`, que corrompe acentos e adiciona BOM). Confira com `git diff` que só a versão mudou.
3. Commit "Sobe versão para X.Y.Z" e `git push origin main`.
4. Rode `claude plugin marketplace update agent-tree` e `claude plugin update agent-tree@agent-tree`.
5. Avise que é preciso reiniciar o Claude Code para aplicar. Só remova versões antigas em `~/.claude/plugins/cache/agent-tree/agent-tree/` se o usuário pedir (podem estar em uso).