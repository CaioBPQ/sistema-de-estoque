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

### Fase 2 — Especialização Exclusiva para Estoque de Volantes (Base Garfer)

- [x] **Tarefa 8 (Modelo `weightGrams`, Base Garfer 235 Volantes & Importador Inteligente):**
  - **O que fazer:** Adicionar campo `weightGrams` em `prisma/schema.prisma`, atualizar `prisma/seed.ts` com os 235 volantes de `prisma/data/volantes-garfer.json` (todos com `currentStock: 0`, `supplier: "Garfer"`, `minStock: 2`, preservando os códigos sem usar quantidades de pedido como saldo), atualizar DTOs/validadores/formatadores e aprimorar `import-service.ts` para pular linhas de cabeçalho prévio, reconhecer `CÓDIGO`/`PESO`/`DESCRIÇÃO`, inferir montadora (`VOL <MARCA>`) e ignorar rodapés (`TOTAIS`/`STATUS`).
  - **Arquivos exclusivos:** `prisma/schema.prisma`, `prisma/seed.ts`, `prisma/data/volantes-garfer.json`, `src/types/inventory.ts`, `src/lib/validators.ts`, `src/lib/format.ts`, `src/lib/services/inventory-service.ts`, `src/lib/services/import-service.ts`
  - **Agente responsável:** Gemini 4 Hydrogen
  - **Validação:** `npm run db:reset && npm run typecheck`

- [x] **Tarefa 9 (UI Especializada em Volantes, Busca Rápida e Testes Garfer):**
  - **O que fazer:** Atualizar terminologia de UI para estoque exclusivo de volantes (Montadora, Peso em gramas, filtro `Com Saldo > 0`, banner orientativo quando saldo total ainda estiver zerado, busca de volante no modal de entrada e `Garfer` pré-preenchido como fornecedor padrão). Atualizar/adicionar teste para parsing do layout Garfer e validar suíte completa + build.
  - **Arquivos exclusivos:** `src/app/layout.tsx`, `src/components/AppShell.tsx`, `src/components/CatalogDashboard.tsx`, `src/components/ProductFormModal.tsx`, `src/components/QuickEntryModal.tsx`, `src/components/QuickWithdrawalModal.tsx`, `src/components/ExcelImportView.tsx`, `tests/audit-and-import.test.ts`
  - **Agente responsável:** Gemini 4 Hydrogen
  - **Validação:** `npm run typecheck && npm run lint && npm test && npm run build`

### Fase 3 — Regras de Negócio: Importação em Lote no Pedido, Perfis/Devoluções e Assistente IA

- [x] **Tarefa 10 (Schema `ProductCustody` + `Collaborator.role`, Seed Nominal & Serviços de Devolução/Posse):**
  - **O que fazer:** Adicionar `role` (`"MANAGER" | "EMPLOYEE"`) em `Collaborator` e modelo `ProductCustody` (`productId`, `collaboratorId`, `quantity`) no `prisma/schema.prisma`. Atualizar `prisma/seed.ts` com o gestor **Luiz** (`MANAGER`) e os funcionários **Mauro**, **Jean**, **Guilherme** e **Carlinho** (`EMPLOYEE`). Atualizar `src/types/inventory.ts` e `src/lib/validators.ts` (`returnCreateSchema`, `MovementType` incluindo `"RETURN"`, DTOs de posse, relatórios gerenciais, importação em pedido e chat IA). Em `inventory-service.ts`, atualizar `registerWithdrawal` para incrementar `ProductCustody` atomicamente, criar `registerReturn` (decrementando `ProductCustody` atomicamente e incrementando `Product.currentStock` com `StockMovement.type = "RETURN"`), `listCustodies`, `getManagerReport`, e `exportMovementsCsv` incluindo `"Devolução"`.
  - **Arquivos exclusivos:** `prisma/schema.prisma`, `prisma/seed.ts`, `src/types/inventory.ts`, `src/lib/validators.ts`, `src/lib/services/collaborator-service.ts`, `src/lib/services/inventory-service.ts`
  - **Agente responsável:** Claude Sonnet 5.5 / Gemini 4 Hydrogen
  - **Validação:** `npm run db:reset && npm run typecheck`

- [x] **Tarefa 11 (Importação em Lote de Pedidos, Assistente Virtual IA & Rotas API com RBAC):**
  - **O que fazer:**
    1. Em `src/lib/services/import-service.ts`, adicionar `parseEntryOrderPreview` (mapeando `Modelo do Volante / Código` e `Quantidade` — incluindo suporte a coluna `PED`/`SUB`/`QTD` e resolução por SKU ou descrição — retornando itens validados + linhas não casadas para conferência antes da confirmação do pedido).
    2. Criar `src/lib/services/ai-assistant-service.ts` (`queryInventoryAssistant`) cruzando `Product.currentStock` e `ProductCustody` para classificar com exatidão cada modelo consultado em **Disponível** (unidades livres), **Em uso** (em posse de Mauro, Jean, Guilherme, Carlinho ou Luiz) ou **Indisponível** (sem saldo e sem posse na equipe), além de consultas gerais de posse por funcionário.
    3. Criar `src/app/api/_lib/actor-auth.ts` e atualizar as rotas API (`products`, `entries`, `entries/import`, `withdrawals`, `returns`, `custodies`, `reports`, `import`, `collaborators`, `ai/chat`) aplicando RBAC (`Luiz` acesso completo; `Mauro/Jean/Guilherme/Carlinho` livres para retiradas e devoluções vinculadas ao próprio nome).
  - **Arquivos exclusivos:** `src/lib/services/import-service.ts`, `src/lib/services/ai-assistant-service.ts`, `src/app/api/_lib/actor-auth.ts`, `src/app/api/products/route.ts`, `src/app/api/products/[id]/route.ts`, `src/app/api/collaborators/route.ts`, `src/app/api/collaborators/[id]/route.ts`, `src/app/api/entries/route.ts`, `src/app/api/entries/import/route.ts`, `src/app/api/withdrawals/route.ts`, `src/app/api/returns/route.ts`, `src/app/api/custodies/route.ts`, `src/app/api/reports/route.ts`, `src/app/api/import/route.ts`, `src/app/api/ai/chat/route.ts`
  - **Agente responsável:** Gemini 4 Hydrogen
  - **Validação:** `npm run typecheck && npm run lint`

- [x] **Tarefa 12 (UI: Seletor de Perfil, Devoluções, Importação no Pedido, Relatórios do Gestor e Chat IA):**
  - **O que fazer:**
    1. Atualizar `AppShell.tsx` com seletor de usuário ativo (**Luiz [Gestor]** e **Mauro/Jean/Guilherme/Carlinho [Funcionário]**), sincronizando header/cookie `stockflow-actor-id`, filtrando menus por permissão e adicionando atalho de **Devolução** + **AIAssistantWidget** exclusivo para o gestor (`Luiz`).
    2. Criar `QuickReturnModal.tsx` (listando os volantes atualmente em posse do colaborador selecionado/ativo, permitindo devolução parcial ou total) e `AIAssistantWidget.tsx` (chat flutuante do gestor com chips rápidos e cards de status `Disponível` / `Em uso` / `Indisponível`).
    3. Atualizar `QuickWithdrawalModal.tsx` (vinculando automaticamente ao funcionário ativo quando `EMPLOYEE`), `QuickEntryModal.tsx` (adicionando botão **Importar Excel** com mapeamento de `Modelo/Código` + `Quantidade` preenchendo a lista do pedido antes da confirmação), `StatusBadge.tsx` (badge `Devolução`), `CatalogDashboard.tsx` (seção "Em posse / Em uso" + ações por perfil), `EntriesHistoryView.tsx`, `AuditTimelineView.tsx` (painel de relatórios gerais e movimentações/posse por funcionário para o gestor + filtro `Devolução`) e `CollaboratorsView.tsx` (exibição/edição de perfil `Gestor` vs `Funcionário`).
  - **Arquivos exclusivos:** `src/components/AppShell.tsx`, `src/components/StatusBadge.tsx`, `src/components/QuickWithdrawalModal.tsx`, `src/components/QuickReturnModal.tsx`, `src/components/QuickEntryModal.tsx`, `src/components/AIAssistantWidget.tsx`, `src/components/CatalogDashboard.tsx`, `src/components/EntriesHistoryView.tsx`, `src/components/AuditTimelineView.tsx`, `src/components/CollaboratorsView.tsx`
  - **Agente responsável:** Gemini 4 Hydrogen
  - **Validação:** `npm run typecheck && npm run lint && npm run build`

- [x] **Tarefa 13 (Testes das Novas Regras de Negócio: Devoluções, RBAC, Importação no Pedido e IA):**
  - **O que fazer:** Expandir `tests/inventory-transactions.test.ts`, `tests/audit-and-import.test.ts` e criar `tests/roles-and-ai.test.ts` cobrindo: retiradas + devoluções parciais/totais e bloqueio de devolução acima da posse, importação em lote de pedido (`parseEntryOrderPreview` por código e por modelo), cruzamento do Assistente IA (`Disponível`, `Em uso` com funcionário ou Luiz, `Indisponível`) e validação de permissões HTTP (`EMPLOYEE` bloqueado em rotas administrativas e vinculado ao próprio nome vs `MANAGER` com acesso total). Validar `typecheck`, `lint`, `test` e `build`.
  - **Arquivos exclusivos:** `tests/db-helper.ts`, `tests/inventory-transactions.test.ts`, `tests/audit-and-import.test.ts`, `tests/roles-and-ai.test.ts`
  - **Agente responsável:** Gemini 4 Hydrogen
  - **Validação:** `npm run typecheck && npm run lint && npm test && npm run build`

### Fase 4 — Identidade Visual "Grupo Volantes Vitória" (UI/UX Redesign)

- [x] **Tarefa 14 (Design System, Logo e Reestilização Completa Grupo Volantes Vitória):**
  - **O que fazer:** Aplicar a identidade visual da marca **Grupo Volantes Vitória** (`#FFD700`/`#FFDE00` amarelo primário com texto preto `#111111`, `#FFFFFF`/`#F8F9FA` superfícies, `#009C3B` disponível/entrada, `#D97706` em uso com texto escuro, `#DC2626` indisponível/saída) mantendo 100% das regras de negócio intactas. Integrar o logotipo oficial em `public/brand/grupo-volantes-vitoria.jpg` + `BrandLogo.tsx`, atualizar `tailwind.config.ts`, `globals.css`, `layout.tsx`, `AppShell.tsx` (topo/navegação e modal de troca rápida de perfil com logo em destaque), `StatusBadge.tsx`, `CatalogDashboard.tsx`, `EntriesHistoryView.tsx`, `AuditTimelineView.tsx`, `ExcelImportView.tsx`, `CollaboratorsView.tsx`, `AIAssistantWidget.tsx` e os modais (`QuickWithdrawalModal`, `QuickReturnModal`, `QuickEntryModal`, `ProductFormModal`) com cabeçalhos de tabela de alto contraste (preto + amarelo/branco), linhas alternadas e contraste WCAG estrito.
  - **Arquivos exclusivos:** `public/brand/grupo-volantes-vitoria.jpg`, `tailwind.config.ts`, `src/app/globals.css`, `src/app/layout.tsx`, `src/components/BrandLogo.tsx`, `src/components/AppShell.tsx`, `src/components/StatusBadge.tsx`, `src/components/CatalogDashboard.tsx`, `src/components/EntriesHistoryView.tsx`, `src/components/AuditTimelineView.tsx`, `src/components/ExcelImportView.tsx`, `src/components/CollaboratorsView.tsx`, `src/components/AIAssistantWidget.tsx`, `src/components/QuickWithdrawalModal.tsx`, `src/components/QuickReturnModal.tsx`, `src/components/QuickEntryModal.tsx`, `src/components/ProductFormModal.tsx`
  - **Agente responsável:** Gemini 4 Hydrogen
  - **Validação:** `npm run typecheck && npm run lint && npm test && npm run build`

---

## 4. Parecer do Conselho dos Anciões (Preenchido por: Claude Opus 5.5 High — `@4-conselho.md`)
- **Status da Revisão:** `APROVADO`
- **Bloqueios Críticos (Bugs / Segurança / Regressão):**
  - Nenhum pendente. Durante a auditoria e testes de concorrência, foi identificado e corrigido um deadlock de upgrade de leitura para escrita no SQLite sob múltiplas retiradas simultâneas (`runWithSqliteWriteLock` + validação prévia do colaborador antes de abrir `$transaction`), além de ajuste de fuso horário local no filtro por data e remoção de fetch externo do `next/font/google` no build.
- **Sugestões Opcionais de Melhoria:**
  - Para uso em produção multi-instância no futuro, migrar o `datasource` do Prisma de SQLite para PostgreSQL mantendo os mesmos serviços e contratos.
- **Veredito Final:** `APROVADO PARA COMMIT` (Fases 1 a 4 validadas: 12/12 testes passando, build limpo e identidade visual Grupo Volantes Vitória com contraste WCAG aplicada)
