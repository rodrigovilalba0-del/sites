# Sistema de Gestão de Vendas por Consignação

## Stack
- Frontend: React + Tailwind + Vite
- Backend: Node.js + Express + Prisma
- Banco: PostgreSQL
- Auth: JWT + bcrypt

## Estrutura
- `/frontend`
- `/backend`
- `/database`

## Passo a passo
1. Copie `.env.example` para `.env` e ajuste credenciais.
2. `npm run install:all`
3. `npx prisma migrate dev --schema prisma/schema.prisma`
4. `npm --workspace backend run prisma:generate`
5. `npm --workspace backend run prisma:seed`
6. Inicie backend: `npm run dev:backend`
7. Inicie frontend: `npm run dev:frontend`

## Segurança implementada
- JWT em rotas protegidas
- Hash de senha com bcrypt
- Helmet + rate limit + validação com Zod
- Prisma ORM (proteção contra SQL injection)
- Separação de papéis ADMIN/SELLER

## Funcionalidades
- CRUD de produtos
- Cadastro de vendedoras com comissão
- Criação de consignações
- Prestação de contas com cálculo automático
- Dashboard com total vendido/lucro/ranking
- Exportação de produtos para Excel e PDF
- Filtro por data no endpoint `/api/dashboard?start=YYYY-MM-DD&end=YYYY-MM-DD`

## Sugestão de deploy
- Frontend: Vercel
- Backend + PostgreSQL: Railway/Render

## Dados de teste
- admin@local.com / 123456
