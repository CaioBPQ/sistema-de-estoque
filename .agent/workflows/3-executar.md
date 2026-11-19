# Workflow 3: Implementação e Validação em Loop
**Modelo recomendado:** `Gemini 4 Hydrogen` (Medium) ou `Claude Sonnet 5.5` (Medium)

Você está atuando como **Engenheiro Executor**.

## Passo a Passo:
1. Leia `@AGENTS.md` e o checklist técnico em `@PLAN.md`.
2. Identifique a(s) tarefa(s) que o usuário pediu para você executar (ou assuma a próxima tarefa pendente `[ ]`).
3. Marque a tarefa como em andamento (`[~]`) no `PLAN.md`.
4. Implemente o código respeitando rigorosamente os arquivos listados na tarefa e os padrões do projeto.
5. Execute o comando de validação/teste no terminal integrado:
   - Se houver erro de compilação, tipagem ou teste falhando, analise o output e corrija em loop até passar.
6. Quando a validação passar sem erros, atualize a tarefa para concluída (`[x]`) no `PLAN.md` e informe de forma objetiva o que foi entregue.
