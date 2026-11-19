# Sistema Web de Gerenciamento de Estoque

Aplicação full-stack para controle centralizado de inventário, registro rápido de retiradas (quem pegou, o quê, quanto e quando), recebimento de pedidos/entradas, auditoria filtrável e importação de planilhas Excel/CSV.

## Stack Tecnológica
- **Framework:** Next.js 14 (App Router) + React 18 + TypeScript
- **Estilização:** Tailwind CSS + Lucide Icons
- **Banco de Dados:** SQLite + Prisma ORM (com transações atômicas e WAL mode)
- **Planilhas:** ExcelJS (`.xlsx`) + Parser CSV nativo (`,` e `;`)

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

## Comandos Úteis
- `npm run dev` — Inicia a aplicação em desenvolvimento
- `npm run build` — Compila o build de produção
- `npm run lint` — Executa ESLint
- `npm run typecheck` — Verifica tipagem TypeScript
- `npm test` — Executa a suíte de testes automatizados (Vitest)
- `npm run db:reset` — Reseta o banco SQLite local e reaplica o seed
- `npm run db:studio` — Abre o Prisma Studio para inspeção visual do banco
