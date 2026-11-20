# Sistema Web de Controle de Estoque — Grupo Volantes Vitória

Aplicação full-stack para controle centralizado do estoque de volantes do **Grupo Volantes Vitória**, com catálogo oficial de 235 modelos, controle de retiradas e devoluções por colaborador, histórico auditável, importação de planilhas, assistente virtual de disponibilidade e módulo completo de **Criação e Exportação de Pedidos** usando o molde oficial `.xlsx`.

## Funcionalidades Principais

- **Catálogo de Volantes (`/`)**: Visualização em tempo real do saldo livre, itens em uso por funcionário, estoque mínimo, status (`Disponível`, `Estoque Baixo`, `Indisponível`) e edição de modelos.
- **Criação e Exportação de Pedidos (`/pedidos`)**:
  - Carrega os **235 modelos oficiais** (`linhas 7 a 241`) do arquivo molde `prisma/templates/REMANUFATURADO NOVEMBRO 2026 ATUALIZADO.xlsx`.
  - Formulário completo para o cabeçalho do pedido (`Cliente`, `Tipo`, `OBS.`, `Data Inicial`, `Data Final`, `Comercial`, `Expedição` e `Hora`).
  - Busca instantânea por código (`VI0487`) ou descrição, filtro para visualizar todos os itens ou apenas itens com quantidade `> 0`, inputs editáveis (`PED`, `RET`, `REAL`, `VALOR`) e totais dinâmicos em tempo real (peças, peso estimado em `kg` e valor total).
  - Exportação fiel para `.xlsx` via `ExcelJS`, preservando estilos, larguras, células mescladas (`A2:K2`), aba secundária `CONFERÊNCIA` e fórmulas originais (`G`, `I`, `K` e linha `243`).
- **Perfis de Acesso e Movimentações**:
  - **Funcionários (`Mauro`, `Jean`, `Guilherme`, `Carlinho`)**: Registram retiradas e devoluções vinculadas ao próprio nome.
  - **Gestor (`Luiz`)**: Acesso administrativo completo em `/entradas`, `/movimentacoes`, `/importacao`, `/colaboradores`, importação em lote de entrada via Excel e acesso ao **Assistente Virtual de Estoque (IA)**.

## Stack Tecnológica

- **Framework:** Next.js 14 (App Router) + React 18 + TypeScript
- **Estilização:** Tailwind CSS + Lucide Icons
- **Banco de Dados:** SQLite + Prisma ORM (transações atômicas + WAL mode)
- **Planilhas:** ExcelJS (`.xlsx` preservando template e fórmulas) + Parser CSV nativo (`,` e `;`)

## Rodando Localmente em 1 Comando

1. Instale as dependências:
   ```bash
   npm install
   ```
2. Configure o banco SQLite e popule os dados iniciais:
   ```bash
   npm run setup
   ```
3. Inicie o servidor de desenvolvimento:
   ```bash
   npm run dev
   ```
4. Acesse [http://localhost:3000](http://localhost:3000).

## Abrindo Direto pelo GitHub (Codespaces) ou Publicação Web

Como a aplicação utiliza API routes do Next.js, banco SQLite (Prisma) e manipulação binária `.xlsx` no servidor (`ExcelJS`), ela **não executa em hospedagem puramente estática** como o GitHub Pages sem adaptação de backend. Para abrir online:

- **GitHub Codespaces (direto no GitHub):** Abra `<> Code` → `Codespaces` → `Create codespace on main`, execute `npm run setup && npm run dev` e abra a porta `3000` fornecida pelo próprio navegador.
- **Publicação Contínua (Railway / Render / VPS Node):** Conecte este repositório como serviço Web Node.js (`npm install && npm run setup && npm run build` com start em `npm run start`).

## Comandos Úteis

- `npm run dev` — Inicia a aplicação em desenvolvimento
- `npm run build` — Compila o build de produção
- `npm run start` — Inicia o servidor de produção compilado
- `npm run lint` — Executa ESLint
- `npm run typecheck` — Verifica tipagem TypeScript
- `npm test` — Executa a suíte de testes automatizados (Vitest)
- `npm run db:reset` — Reseta o banco SQLite local e reaplica o seed
- `npm run db:studio` — Abre o Prisma Studio para inspeção visual do banco
