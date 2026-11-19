# Plano de Execução Atual

## 1. Objetivo da Demanda
- **Descrição:** Desenvolver do zero um **Sistema Web de Gerenciamento de Estoque** full-stack para substituir controles manuais em planilhas Excel. O sistema deve centralizar o catálogo de produtos com saldo em tempo real e alertas visuais (estoque baixo/zerado), registrar entradas/pedidos de compra, oferecer um fluxo ultrarrápido de retiradas/saídas (quem pegou, qual produto, quantidade, data/hora automática e motivo/destino opcional, sem login obrigatório no MVP e com cadastro/seleção rápida de colaboradores), manter log de auditoria filtrável e disponibilizar importação de planilhas `.xlsx`/`.csv`.
- **Critério de Sucesso:**
  1. Aplicação rodando localmente com um comando (`npm run setup && npm run dev`) usando banco relacional local (`SQLite` via Prisma).
  2. Todas as entradas, retiradas e importações de saldo executam dentro de transações atômicas (`prisma.$transaction`) com trava condicional contra saldo negativo em acessos simultâneos.
  3. Interface responsiva (computador do escritório e celular no almoxarifado) cobrindo Catálogo/Saldo, Entradas/Pedidos, Retirada Rápida, Log de Auditoria, Colaboradores e Importação Excel/CSV.
  4. Tipagem (`tsc --noEmit`), lint, build de produção e testes automatizados (incluindo teste de concorrência) passando integralmente.

---

## 2. Diagnóstico Técnico (Preenchido por: Gemini 4 Argon High — `@1-mapear.md`)
- **Fluxo atual identificado:**
  - Trata-se de um projeto **greenfield** na raiz `c:\Users\Mauro\Desktop\atividade faculdade\`.
  - Ambiente validado no terminal: **Node.js `v22.14.0`**, **npm `11.6.2`**, **Python `3.13.4`**, **Git `2.49.0`**. Docker **não** está instalado na máquina, tornando **SQLite + Prisma** a opção mais enxuta, determinística e aderente ao requisito de rodar localmente com um único comando.
  - A raiz contém arquivos pré-existentes não relacionados ao sistema de estoque (`automarket/`, `*.pdf`, backups `.bak` gerados pelo `setup_agents.py --force`) que devem permanecer intocados.
  - A infraestrutura multiagente (`AGENTS.md`, `GEMINI.md`, `CLAUDE.md`, `PLAN.md`, `.agent/workflows/1-mapear.md`..`4-conselho.md`) já foi instalada na raiz.

- **Stack Arquitetural Proposta:**
  - **Front-end & Back-end unificados:** Next.js 14 (App Router) + React 18 + TypeScript 5 (`strict`) + Tailwind CSS 3 + `lucide-react`.
  - **Banco de Dados & ORM:** SQLite (`prisma/dev.db`) + Prisma 5 (`@prisma/client` + `prisma`), com `PRAGMA journal_mode = WAL;` e `PRAGMA busy_timeout = 5000;` para suportar acessos simultâneos com segurança.
  - **Validação & Planilhas:** `zod` para contratos de API e `exceljs` para leitura/geração de arquivos `.xlsx`, combinado a parser CSV tolerante a delimitadores `,` e `;` (padrão Excel PT-BR) com remoção de BOM UTF-8.
  - **Testes:** `vitest` executado sobre banco SQLite isolado de testes (`prisma/test.db`).

- **Arquivos que serão criados (estrutura do projeto na raiz):**
  - **Configuração e Banco:** `package.json`, `tsconfig.json`, `next.config.mjs`, `tailwind.config.ts`, `postcss.config.js`, `.eslintrc.json`, `.gitignore`, `.env.example`, `.env`, `README.md`, `prisma/schema.prisma`, `prisma/seed.ts`, `src/lib/prisma.ts`
  - **Contratos e Utilitários:** `src/types/inventory.ts`, `src/lib/validators.ts`, `src/lib/format.ts`
  - **Serviços Transacionais:** `src/lib/services/inventory-service.ts`, `src/lib/services/collaborator-service.ts`, `src/lib/services/import-service.ts`
  - **Rotas API (App Router):** `src/app/api/health/route.ts`, `src/app/api/products/route.ts`, `src/app/api/products/[id]/route.ts`, `src/app/api/collaborators/route.ts`, `src/app/api/collaborators/[id]/route.ts`, `src/app/api/entries/route.ts`, `src/app/api/withdrawals/route.ts`, `src/app/api/movements/route.ts`, `src/app/api/import/route.ts`
  - **Shell & Componentes UI:** `src/app/globals.css`, `src/app/layout.tsx`, `src/components/AppShell.tsx`, `src/components/StatusBadge.tsx`, `src/components/ProductFormModal.tsx`, `src/components/QuickEntryModal.tsx`, `src/components/QuickWithdrawalModal.tsx`
  - **Páginas & Views:** `src/app/page.tsx`, `src/components/CatalogDashboard.tsx`, `src/app/entradas/page.tsx`, `src/components/EntriesHistoryView.tsx`, `src/app/movimentacoes/page.tsx`, `src/components/AuditTimelineView.tsx`, `src/app/importacao/page.tsx`, `src/components/ExcelImportView.tsx`, `src/app/colaboradores/page.tsx`, `src/components/CollaboratorsView.tsx`
  - **Testes:** `vitest.config.ts`, `tests/inventory-transactions.test.ts`, `tests/audit-and-import.test.ts`

- **Contratos, Tipos e Banco de Dados (`prisma/schema.prisma`):**
  - `Product`: `id`, `sku` (unique, normalizado uppercase), `name`, `category`, `unit`, `supplier`, `minStock` (Float >= 0), `currentStock` (Float >= 0), `active` (Boolean), `createdAt`, `updatedAt`.
  - `Collaborator`: `id`, `name`, `department` (setor/cargo opcional), `badgeCode` (matrícula/código opcional, unique quando informado), `active` (Boolean), `createdAt`, `updatedAt`.
  - `PurchaseEntry`: `id`, `supplier`, `referenceCode` (NF/pedido), `notes`, `receivedAt`, `responsibleId` -> `Collaborator`, `createdAt`.
  - `StockMovement`: `id`, `type` (`"ENTRY" | "EXIT" | "IMPORT"`), `quantity` (Float > 0), `previousStock` (Float), `newStock` (Float), `reason` (motivo/destino opcional), `productId` -> `Product`, `collaboratorId` -> `Collaborator`, `purchaseEntryId` (nullable -> `PurchaseEntry`), `createdAt`.
  - *Nota de modelagem:* Uso de `String` validado por enum/Zod em `StockMovement.type` para máxima portabilidade no SQLite, mantendo `StockMovement` imutável (append-only) e produtos com soft-archive (`active: false`) para nunca quebrar o histórico de auditoria.

- **Riscos e Efeitos Colaterais:**
  - **Condição de corrida em retiradas simultâneas:** Leitura seguida de escrita (`if (stock >= qty) update(stock - qty)`) pode gerar saldo negativo sob concorrência. **Mitigação obrigatória:** executar toda retirada dentro de `prisma.$transaction` com `tx.product.updateMany({ where: { id, active: true, currentStock: { gte: qty } }, data: { currentStock: { decrement: qty } } })` checando `count === 1` antes de gravar `StockMovement`.
  - **Precisão decimal em unidades fracionárias (`kg`, `L`, `m`):** Somar/subtrair `Float` em JS pode gerar ruído (`0.30000000000000004`). **Mitigação:** normalizar todas as quantidades com helper `roundQuantity(n, 3)` antes de persistir e comparar.
  - **Planilhas Excel PT-BR e segurança de parsing:** Arquivos `.csv` exportados pelo Excel em português usam `;` como separador e podem conter BOM UTF-8; além disso, a biblioteca legada `xlsx` possui CVEs conhecidos. **Mitigação:** usar `exceljs` para `.xlsx` e parser CSV próprio com auto-detecção de `;`/`,` e sanitização contra CSV/Formula Injection na exportação.
  - **Isolamento da raiz:** Não alterar arquivos em `automarket/`, PDFs da faculdade ou backups `.bak`.

---

## 3. Checklist de Execução (Planejado por: Claude Opus 5.5 — `@2-planejar.md` / Executado por: Gemini 4 Hydrogen ou Sonnet 5.5 — `@3-executar.md`)
> Legenda: `[ ]` Pendente | `[~]` Em andamento | `[x]` Concluído
> **Nota de paralelismo:** Após concluir as Tarefas 1, 2 e 3 em sequência, as **Tarefas 4 e 5** possuem arquivos 100% disjuntos e podem ser executadas em paralelo.

- [x] **Tarefa 1 (Fundação do Projeto, Config & Schema Prisma/SQLite):**
  - **O que fazer:** Inicializar o projeto Next.js 14 + TypeScript + Tailwind CSS na raiz com scripts `dev`, `build`, `start`, `lint`, `typecheck`, `test`, `setup` (`prisma generate && prisma db push && tsx prisma/seed.ts`), `db:push`, `db:seed`, `db:reset`. Configurar `.gitignore` (ignorando `.next`, `node_modules`, `.env`, `prisma/*.db*`, `*.bak`), `.env`/`.env.example`, `tsconfig.json`, `next.config.mjs`, `tailwind.config.ts`, `postcss.config.js`, `.eslintrc.json`. Criar `prisma/schema.prisma` (`Product`, `Collaborator`, `PurchaseEntry`, `StockMovement` com índices em `sku`, `createdAt`, `productId`, `collaboratorId`, `type`), `src/lib/prisma.ts` (singleton com WAL e `busy_timeout=5000`), `prisma/seed.ts` (idempotente com categorias, fornecedores, colaboradores e itens OK / Estoque Baixo / Zerado) e `README.md`.
  - **Arquivos exclusivos:** `package.json`, `tsconfig.json`, `next.config.mjs`, `tailwind.config.ts`, `postcss.config.js`, `.eslintrc.json`, `.gitignore`, `.env.example`, `.env`, `README.md`, `prisma/schema.prisma`, `prisma/seed.ts`, `src/lib/prisma.ts`
  - **Agente responsável:** Gemini 4 Hydrogen
  - **Validação:** `npm install && npm run setup && npx tsc --noEmit`

- [x] **Tarefa 2 (Contratos TypeScript, Schemas Zod e Helpers de Domínio):**
  - **O que fazer:** Definir todos os DTOs e interfaces compartilhadas em `src/types/inventory.ts` (`StockStatus`, `MovementType`, `ProductDTO`, `CollaboratorDTO`, `PurchaseEntryDTO`, `StockMovementDTO`, `DashboardSummary`, `ImportPreviewRow`, `ImportPreviewResponse`, `ImportCommitPayload`). Criar em `src/lib/validators.ts` os schemas Zod para criação/edição de produto, criação/edição de colaborador, registro de entrada (1..N itens), registro de retirada rápida, filtros de auditoria e confirmação de importação, além dos helpers `roundQuantity`, `normalizeSku` e `computeStockStatus`. Criar em `src/lib/format.ts` formatadores `pt-BR` de data/hora, quantidade/unidade e escape seguro de CSV (incluindo proteção contra formula injection).
  - **Arquivos exclusivos:** `src/types/inventory.ts`, `src/lib/validators.ts`, `src/lib/format.ts`
  - **Agente responsável:** Gemini 4 Hydrogen
  - **Validação:** `npx tsc --noEmit`

- [x] **Tarefa 3 (Camada de Serviços Transacionais & Importador Excel/CSV):**
  - **O que fazer:**
    1. Em `src/lib/services/collaborator-service.ts`, implementar `listCollaborators`, `createCollaborator` (com normalização e detecção de duplicidade) e `updateCollaborator`.
    2. Em `src/lib/services/inventory-service.ts`, implementar `listProducts`, `getDashboardSummary`, `createProduct`, `updateProduct`, `archiveProduct`, `registerPurchaseEntry` (transação única criando `PurchaseEntry`, incrementando saldos e gravando `StockMovement` tipo `ENTRY`), `registerWithdrawal` (transação única com `tx.product.updateMany({ where: { id, active: true, currentStock: { gte: qty } }, data: { currentStock: { decrement: qty } } })` + erro `InsufficientStockError`/`NotFoundError` e gravação de `StockMovement` tipo `EXIT`), `listPurchaseEntries` e `listMovements` (filtros por produto, colaborador, tipo, período e exportação CSV).
    3. Em `src/lib/services/import-service.ts`, implementar leitura de `.xlsx` (via `exceljs`) e `.csv` (auto-detecção `;` e `,`), auto-mapeamento inteligente de colunas, geração de preview com erros/avisos por linha, execução transacional em lote (`SKIP | REPLACE_STOCK | ADD_STOCK`) gravando movimentações de auditoria tipo `IMPORT`, e gerador de planilha modelo `.xlsx` e `.csv`.
  - **Arquivos exclusivos:** `src/lib/services/inventory-service.ts`, `src/lib/services/collaborator-service.ts`, `src/lib/services/import-service.ts`
  - **Agente responsável:** Claude Sonnet 5.5 (ou Gemini 4 Hydrogen)
  - **Validação:** `npx tsc --noEmit`

- [x] **Tarefa 4 (Rotas REST API App Router — *pode rodar em paralelo com a Tarefa 5*):**
  - **O que fazer:** Expor todas as rotas HTTP com validação Zod, tratamento consistente de erros (`400`, `404`, `409 Conflict` para SKU duplicado ou saldo insuficiente, `500`) e `dynamic = "force-dynamic"` nas rotas GET para evitar cache indevido de saldo:
    - `GET /api/health`
    - `GET/POST /api/products` e `GET/PATCH/DELETE /api/products/[id]`
    - `GET/POST /api/collaborators` e `PATCH /api/collaborators/[id]`
    - `GET/POST /api/entries`
    - `POST /api/withdrawals`
    - `GET /api/movements` (suportando `?format=csv`)
    - `GET /api/import` (download de modelo `.xlsx`/`.csv`) e `POST /api/import` (`multipart/form-data` para preview ou JSON para commit)
  - **Arquivos exclusivos:** `src/app/api/health/route.ts`, `src/app/api/products/route.ts`, `src/app/api/products/[id]/route.ts`, `src/app/api/collaborators/route.ts`, `src/app/api/collaborators/[id]/route.ts`, `src/app/api/entries/route.ts`, `src/app/api/withdrawals/route.ts`, `src/app/api/movements/route.ts`, `src/app/api/import/route.ts`
  - **Agente responsável:** Gemini 4 Hydrogen
  - **Validação:** `npx tsc --noEmit && npm run lint`

- [x] **Tarefa 5 (Design System, Shell Responsivo e Modais Operacionais — *pode rodar em paralelo com a Tarefa 4*):**
  - **O que fazer:** Construir a identidade visual limpa, de alto contraste e responsiva (desktop + mobile no almoxarifado) com `globals.css`, `layout.tsx` (carregando `AppShell` e notificações toast), `AppShell.tsx` (navegação lateral/superior + barra inferior fixa no mobile com atalhos diretos para **Retirada Rápida** e **Nova Entrada**), `StatusBadge.tsx` (badges visuais `OK`, `Estoque Baixo`, `Zerado`, `Entrada`, `Saída`, `Importação`), `QuickWithdrawalModal.tsx` (seleção/busca de produto com saldo ao vivo, stepper `+/-`, colaborador com criação inline rápida, timestamp automático e motivo/destino opcional), `QuickEntryModal.tsx` (fornecedor, nota/referência, responsável e 1..N itens) e `ProductFormModal.tsx` (cadastro/edição de produto).
  - **Arquivos exclusivos:** `src/app/globals.css`, `src/app/layout.tsx`, `src/components/AppShell.tsx`, `src/components/StatusBadge.tsx`, `src/components/QuickWithdrawalModal.tsx`, `src/components/QuickEntryModal.tsx`, `src/components/ProductFormModal.tsx`
  - **Agente responsável:** Gemini 4 Hydrogen
  - **Validação:** `npx tsc --noEmit && npm run lint`

- [x] **Tarefa 6 (Páginas Principais e Fluxos Completos do MVP):**
  - **O que fazer:** Implementar as 5 telas operacionais conectadas às APIs reais e aos modais compartilhados:
    1. **Visão Geral & Catálogo (`/`)**: KPIs em tempo real (Total SKUs, Estoque Baixo, Zerados, Movimentações Hoje), faixa de alerta rápido, busca por nome/SKU/fornecedor, filtros por categoria e status, tabela responsiva / cards mobile com botões de 1 clique (`Retirar`, `Entrada`, `Editar`, `Arquivar`).
    2. **Entradas & Pedidos (`/entradas`)**: Histórico de pedidos/entradas exibindo data, fornecedor, nota/referência, lista de itens recebidos e responsável pelo lançamento + botão para novo lançamento.
    3. **Auditoria & Movimentações (`/movimentacoes`)**: Linha do tempo completa com filtros combinados (produto, colaborador, tipo Entrada/Saída/Importação e período inicial/final), exibição de saldo anterior -> saldo novo e botão de exportar CSV filtrado.
    4. **Importação Excel (`/importacao`)**: Assistente de migração em etapas (download do modelo `.xlsx`/`.csv`, upload, mapeamento flexível de colunas, pré-visualização com validação de linhas, escolha de estratégia para SKUs existentes e confirmação transacional).
    5. **Colaboradores (`/colaboradores`)**: Cadastro, edição e ativação/desativação rápida de colaboradores para aparecerem nas retiradas e entradas.
  - **Arquivos exclusivos:** `src/app/page.tsx`, `src/components/CatalogDashboard.tsx`, `src/app/entradas/page.tsx`, `src/components/EntriesHistoryView.tsx`, `src/app/movimentacoes/page.tsx`, `src/components/AuditTimelineView.tsx`, `src/app/importacao/page.tsx`, `src/components/ExcelImportView.tsx`, `src/app/colaboradores/page.tsx`, `src/components/CollaboratorsView.tsx`
  - **Agente responsável:** Gemini 4 Hydrogen
  - **Validação:** `npx tsc --noEmit && npm run lint && npm run build`

- [x] **Tarefa 7 (Suíte de Testes Automatizados & Verificação Ponta a Ponta):**
  - **O que fazer:** Configurar `vitest.config.ts` (apontando `DATABASE_URL` para um SQLite isolado de teste com reset limpo entre suites) e implementar testes cobrindo:
    1. Criação de produto, entrada simples e entrada multi-item incrementando saldo e gerando `PurchaseEntry` + `StockMovement`.
    2. Retirada normal decrementando saldo, bloqueio de retirada maior que o saldo disponível e **teste de concorrência (`Promise.all`)** disparando múltiplas retiradas simultâneas sobre o mesmo item para comprovar que a transação impede saldo negativo.
    3. Filtros de auditoria (produto, colaborador, tipo, período) e escape de CSV.
    4. Parsing de `.xlsx` (via `exceljs`) e `.csv` (delimitador `;` PT-BR), tratamento de linhas inválidas e importação em lote (`SKIP`, `ADD_STOCK`, `REPLACE_STOCK`).
    Ao final, validar lint, typecheck, testes e build completo no terminal.
  - **Arquivos exclusivos:** `vitest.config.ts`, `tests/inventory-transactions.test.ts`, `tests/audit-and-import.test.ts`
  - **Agente responsável:** Gemini 4 Hydrogen
  - **Validação:** `npm run typecheck && npm run lint && npm test && npm run build`

---

## 4. Parecer do Conselho dos Anciões (Preenchido por: Claude Opus 5.5 High — `@4-conselho.md`)
- **Status da Revisão:** `APROVADO`
- **Bloqueios Críticos (Bugs / Segurança / Regressão):**
  - Nenhum pendente. Durante a auditoria e testes de concorrência, foi identificado e corrigido um deadlock de upgrade de leitura para escrita no SQLite sob múltiplas retiradas simultâneas (`runWithSqliteWriteLock` + validação prévia do colaborador antes de abrir `$transaction`), além de ajuste de fuso horário local no filtro por data e remoção de fetch externo do `next/font/google` no build.
- **Sugestões Opcionais de Melhoria:**
  - Para uso em produção multi-instância no futuro, migrar o `datasource` do Prisma de SQLite para PostgreSQL mantendo os mesmos serviços e contratos.
- **Veredito Final:** `APROVADO PARA COMMIT`
