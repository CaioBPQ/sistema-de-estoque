# Protocolo da Estação Multiagente (Antigravity)

Este repositório utiliza uma arquitetura multiagente com papéis divididos por modelo. Todos os agentes devem respeitar as regras e limites de escopo definidos abaixo.

---

## 1. Matriz de Modelos e Responsabilidades

| Modelo no Seletor | Nível Recomendado | Papel Oficial | Escopo de Atuação |
| :--- | :--- | :--- | :--- |
| **Orchestrator (Argon)** | Padrão | **Coordenador de Fluxo** | Quebra demandas complexas em etapas e coordena subtarefas. |
| **Gemini 4 Argon** | `High` | **Pesquisador & Analista** | Leitura ampla do repositório, mapeamento de arquitetura, logs e dependências. Não altera código de produção na fase de mapeamento (`@1-mapear.md`). |
| **Claude Opus 5.5** | `High` | **Conselho dos Anciões (Arquiteto & Auditor)** | Desenho de arquitetura crítica no `PLAN.md` (`@2-planejar.md`) e revisão cirúrgica (`git diff`) de segurança, lógica e regressões antes do commit (`@4-conselho.md`). |
| **Claude Sonnet 5.5** | `Medium` / `High` | **Engenheiro Sênior** | Refatorações estruturais entre múltiplos arquivos e regras de negócio complexas. |
| **Gemini 4 Hydrogen** | `Medium` | **Construtor Principal** | Execução rápida das tarefas do `PLAN.md`, criação de módulos, ajustes de UI/API e execução de testes no terminal (`@3-executar.md`). |
| **Gemini 3.8 Flash** | `Medium` | **Assistente Utilitário** | Tarefas rápidas: mensagens de commit, documentação, regex, tipagens simples e scripts auxiliares. |
| **GPT-OSS 120B** | `Medium` | **Agente de Contingência** | Reserva técnica caso algum modelo principal atinja limite temporário de requisições. |

---

## 2. Regras de Ouro de Engenharia

1. **Fonte Única da Verdade:** O arquivo `PLAN.md` centraliza o estado atual do trabalho. Sempre leia o `PLAN.md` antes de agir e atualize o status das tarefas (`[ ]` pendente, `[~]` em andamento, `[x]` concluído).
2. **Isolamento de Arquivos (Execução Paralela):** Nunca edite arquivos que estejam atribuídos a outra tarefa em andamento no `PLAN.md`.
3. **Reaproveitamento:** Antes de criar helpers, hooks, serviços ou componentes novos, verifique os utilitários já existentes no projeto.
4. **Validação Obrigatória:** Nenhuma tarefa pode ser marcada como `[x]` sem antes rodar o linter, build ou suíte de testes correspondente no terminal.
5. **Alterações Cirúrgicas:** Evite reformatar arquivos inteiros sem necessidade para manter o `git diff` limpo para a auditoria do Conselho (`Claude Opus 5.5`).
