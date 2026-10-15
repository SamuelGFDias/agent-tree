# agent-tree

Mod do Claude Code: painel em árvore com os subagents da sessão e as sessões com que ela conversa.

- Abas **Em andamento** e **Concluídos**
- Para cada agente: tipo, status, tempo, tarefa, última ferramenta e total de chamadas
- Subagents aninhados pelo agente que os criou
- Seção com as sessões/agentes para os quais a sessão enviou ou de quem recebeu mensagens (SendMessage)

## Instalação

No prompt do Claude Code (terminal):

```
/plugin install agent-tree --marketplace SamuelGFDias/agent-tree
```

Ou, num shell:

```
claude plugin install agent-tree --marketplace SamuelGFDias/agent-tree
```

Responda `y` para adicionar o marketplace e escolha o escopo `user`.

## Uso

O painel abre sozinho quando a janela é larga o bastante. Em qualquer largura, digite `/agent-tree`.

Limitação: as sessões pares só aparecem depois que há troca de mensagens com elas.
