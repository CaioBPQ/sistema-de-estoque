# Workflow 1: Mapeamento e Diagnóstico de Contexto
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
