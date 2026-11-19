#!/usr/bin/env python3
"""
Bootstrap da Estação Multiagente para Antigravity / VS Code.
Cria a árvore de diretórios, arquivos de memória compartilhada (AGENTS.md, GEMINI.md, CLAUDE.md, PLAN.md)
e workflows (.agent/workflows/) com proteção contra sobrescrita acidental e backup automático.

Uso:
  python setup_agents.py                  # Instala no diretório atual sem sobrescrever arquivos existentes
  python setup_agents.py --force          # Sobrescreve arquivos existentes (criando backup .bak antes)
  python setup_agents.py --dir ./meu-app  # Instala em um diretório específico
"""

import argparse
import shutil
import sys
from datetime import datetime
from pathlib import Path

FILES: dict[str, str] = {
    "AGENTS.md": """# Protocolo da Estação Multiagente (Antigravity)

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
""",

    "GEMINI.md": """@AGENTS.md

## Instruções Automáticas para Sessões Gemini (Argon, Hydrogen e Flash)
- Sempre consulte `@PLAN.md` antes de iniciar qualquer modificação de código.
- Se estiver atuando como **Gemini 4 Argon**, priorize leitura profunda de contexto e atualize apenas a seção de diagnóstico do `PLAN.md`.
- Se estiver atuando como **Gemini 4 Hydrogen**, foque em implementar os itens do checklist de forma direta, validando no terminal a cada passo.
""",

    "CLAUDE.md": """@AGENTS.md

## Instruções Automáticas para Sessões Claude (Opus 5.5 e Sonnet 5.5)
- Sempre consulte `@PLAN.md` para verificar o contexto mapeado pelo Gemini 4 Argon.
- Ao atuar como **Claude Opus 5.5**, economize tokens evitando reescrever arquivos extensos do zero: foque no planejamento arquitetural (`@2-planejar.md`) ou na auditoria rigorosa do `git diff` (`@4-conselho.md`).
""",

    "PLAN.md": """# Plano de Execução Atual

## 1. Objetivo da Demanda
- **Descrição:** [Descreva aqui a feature, bugfix ou refatoração desejada]
- **Critério de Sucesso:** [O que precisa funcionar ao final da implementação]

---

## 2. Diagnóstico Técnico (Preenchido por: Gemini 4 Argon High — `@1-mapear.md`)
- **Fluxo atual identificado:** 
- **Arquivos que serão afetados:**
  - `src/...`
- **Contratos, Tipos e Banco de Dados:** 
- **Riscos e Efeitos Colaterais:** 

---

## 3. Checklist de Execução (Planejado por: Claude Opus 5.5 — `@2-planejar.md` / Executado por: Gemini 4 Hydrogen ou Sonnet 5.5 — `@3-executar.md`)
> Legenda: `[ ]` Pendente | `[~]` Em andamento | `[x]` Concluído

- [ ] **Tarefa 1:** [Descrição técnica clara]
  - **Arquivos exclusivos:** `src/...`
  - **Agente responsável:** Gemini 4 Hydrogen
  - **Validação:** `npm run build`

- [ ] **Tarefa 2:** [Descrição técnica clara]
  - **Arquivos exclusivos:** `src/...`
  - **Agente responsável:** Gemini 4 Hydrogen / Claude Sonnet 5.5
  - **Validação:** `npx tsc --noEmit`

---

## 4. Parecer do Conselho dos Anciões (Preenchido por: Claude Opus 5.5 High — `@4-conselho.md`)
- **Status da Revisão:** `PENDENTE`
- **Bloqueios Críticos (Bugs / Segurança / Regressão):**
  - Nenhum registrado até o momento.
- **Sugestões Opcionais de Melhoria:**
  - Nenhuma registrada até o momento.
- **Veredito Final:** `[AGUARDANDO AUDITORIA]`
""",

    ".agent/workflows/1-mapear.md": """# Workflow 1: Mapeamento e Diagnóstico de Contexto
**Modelo recomendado:** `Gemini 4 Argon` (Nível `High`)

Você está atuando como **Pesquisador e Analista de Contexto**.
**REGRA CRÍTICA:** Não altere nenhum arquivo de código de produção nesta etapa.

## Passo a Passo:
1. Leia `@AGENTS.md` e o objetivo definido na seção 1 do `@PLAN.md`.
2. Vasculhe o repositório para localizar todos os módulos, rotas, componentes, schemas de banco e utilitários relacionados ao objetivo.
3. Analise como os dados fluem atualmente e quais dependências internas ou externas são afetadas.
4. Atualize **apenas** a seção **2. Diagnóstico Técnico** dentro do arquivo `PLAN.md` contendo:
   - Lista exata de arquivos existentes que precisarão ser modificados e novos arquivos que deverão ser criados.
   - Interfaces, tipos, payloads ou tabelas envolvidas.
   - Riscos de regressão ou pontos críticos de atenção para o Arquiteto.
5. Ao finalizar a edição do `PLAN.md`, apresente um resumo curto no chat informando que o terreno está mapeado para a etapa de planejamento.
""",

    ".agent/workflows/2-planejar.md": """# Workflow 2: Arquitetura e Plano de Execução
**Modelo recomendado:** `Claude Opus 5.5` (ou `Orchestrator (Argon)`)

Você está atuando como **Arquiteto de Software Principal**.
**REGRA CRÍTICA:** Não implemente o código final ainda. Seu trabalho é desenhar a solução técnica perfeita no `PLAN.md`.

## Passo a Passo:
1. Leia `@AGENTS.md` e analise o **Diagnóstico Técnico** preenchido pelo Argon em `@PLAN.md`.
2. Desenhe a solução dividindo o trabalho em tarefas pequenas, atômicas e sequenciais na seção **3. Checklist de Execução** do `PLAN.md`.
3. Para cada tarefa do checklist, especifique obrigatoriamente:
   - **O que fazer:** Instrução técnica direta e sem ambiguidades.
   - **Arquivos exclusivos:** Quais arquivos aquela tarefa pode tocar (separe os arquivos para permitir que dois agentes rodem em paralelo sem conflito de merge).
   - **Agente recomendado:** Indique `Gemini 4 Hydrogen` para implementação padrão/rápida ou `Claude Sonnet 5.5` para refatorações complexas.
   - **Validação:** O comando exato de terminal para provar que a tarefa funcionou.
4. Ao concluir a atualização do `PLAN.md`, avise quais tarefas podem ser executadas imediatamente.
""",

    ".agent/workflows/3-executar.md": """# Workflow 3: Implementação e Validação em Loop
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
""",

    ".agent/workflows/4-conselho.md": """# Workflow 4: Conselho dos Anciões (Auditoria Cirúrgica)
**Modelo recomendado:** `Claude Opus 5.5` (Nível `High`)

Você está atuando como o **Conselho dos Anciões (Auditor Técnico e de Segurança)**.
Sua função não é reescrever o projeto nem discutir preferências estéticas de código, mas impedir que bugs silenciosos, falhas de segurança ou regressões cheguem à branch principal.

## Passo a Passo:
1. Leia `@AGENTS.md` e verifique o que foi planejado e marcado como concluído no `@PLAN.md`.
2. Execute `git status` e `git diff` no terminal para inspecionar **exatamente** as linhas modificadas.
3. Analise o diff procurando de forma rigorosa por:
   - **Bugs de lógica e Edge Cases:** variáveis nulas/indefinidas, condições de corrida, loops infinitos, erros de paginação ou estados inconsistentes.
   - **Segurança:** falta de validação/sanitização de input, exposição de dados sensíveis ou tokens, falhas de autenticação/autorização (IDOR, SQLi, XSS).
   - **Performance e Contratos:** queries N+1, vazamento de memória, quebra de tipagem ou mudança silenciosa no formato de resposta de APIs.
4. Preencha a seção **4. Parecer do Conselho dos Anciões** no `PLAN.md` seguindo esta estrutura:
   - **Bloqueios Críticos (Obrigatório corrigir antes do commit):** Liste o arquivo, a linha aproximada, o problema exato e como o `Gemini 4 Hydrogen` deve corrigir.
   - **Sugestões Opcionais:** Melhorias rápidas que não bloqueiam a entrega.
   - **Veredito Final:** Escreva `APROVADO PARA COMMIT` (se não houver bloqueios críticos) ou `REPROVADO - CORREÇÃO NECESSÁRIA`.
"""
}


def setup_workspace(target_dir: Path, force: bool = False) -> None:
    target_dir = target_dir.resolve()
    print(f"\n[+] Inicializando Estação Multiagente em: {target_dir}")
    print("-" * 65)

    created_count = 0
    skipped_count = 0
    overwritten_count = 0

    for rel_path, content in FILES.items():
        file_path = target_dir / rel_path
        file_path.parent.mkdir(parents=True, exist_ok=True)

        if file_path.exists():
            if not force:
                print(f"  [PULADO]      {rel_path} (já existe — use --force para sobrescrever)")
                skipped_count += 1
                continue
            else:
                timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                backup_path = file_path.with_suffix(f"{file_path.suffix}.{timestamp}.bak")
                shutil.copy2(file_path, backup_path)
                print(f"  [BACKUP]      {rel_path} -> {backup_path.name}")
                overwritten_count += 1
        else:
            created_count += 1

        file_path.write_text(content, encoding="utf-8")
        status_label = "[ATUALIZADO]" if overwritten_count and file_path.exists() else "[CRIADO]    "
        print(f"  {status_label}  {rel_path}")

    print("-" * 65)
    print(
        f"[OK] Concluído! Criados: {created_count} | "
        f"Atualizados: {overwritten_count} | Pulados: {skipped_count}"
    )
    print("\nComo usar no Antigravity agora:")
    print("  1. Edite o objetivo em PLAN.md")
    print("  2. Gemini 4 Argon (High) -> envie: @1-mapear.md")
    print("  3. Claude Opus 5.5       -> envie: @2-planejar.md")
    print("  4. Gemini 4 Hydrogen     -> envie: @3-executar.md")
    print("  5. Claude Opus 5.5 (High)-> envie: @4-conselho.md\n")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Instalador automatizado da Estação Multiagente (Antigravity)."
    )
    parser.add_argument(
        "--dir",
        type=Path,
        default=Path("."),
        help="Diretório raiz do projeto onde os arquivos serão criados (padrão: diretório atual).",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Sobrescreve arquivos existentes criando um backup .bak automático antes.",
    )
    args = parser.parse_args()

    try:
        setup_workspace(args.dir, args.force)
    except Exception as exc:
        print(f"[ERRO] Falha ao configurar estação: {exc}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
