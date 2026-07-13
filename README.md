# Smart Budget Tracker

A personal finance web application that helps individuals log income and expenses, understand their spending patterns, and stay within self-defined budgets.

## Tech Stack

- **Backend:** NestJS 11 + TypeScript
- **Database:** PostgreSQL 16
- **ORM:** Prisma
- **Auth:** JWT (passport-jwt)
- **API Docs:** Swagger/OpenAPI
- **Containerization:** Docker + Docker Compose

## Prerequisites

- Node.js 20+
- Docker & Docker Compose
- npm

## Getting Started

1. **Clone the repository**

   ```bash
   git clone <repo-url>
   cd smart-budget-tracker
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Set up environment**

   ```bash
   cp .env.example .env
   ```

   Edit `.env` with your preferred values.

4. **Start the database**

   ```bash
   docker compose -f docker-compose.dev.yml up -d
   ```

5. **Run migrations**

   ```bash
   npx prisma migrate dev
   ```

6. **Seed default categories**

   ```bash
   npx prisma db seed
   ```

7. **Start the application**

   ```bash
   npm run start:dev
   ```

The API will be available at `http://localhost:3000`.

## API Documentation

Once running, visit `http://localhost:3000/api/docs` for interactive Swagger documentation.

## Available Scripts

| Command | Description |
|---------|-------------|
| `npm run start:dev` | Start in development mode (watch) |
| `npm run build` | Build the application |
| `npm run start:prod` | Start in production mode |
| `npm run lint` | Run ESLint |
| `npm run format` | Format code with Prettier |
| `npm run test` | Run unit tests |
| `npm run test:e2e` | Run end-to-end tests |
| `npm run test:cov` | Run tests with coverage |

## Project Structure

```
src/
├── prisma/           # Global Prisma service
├── auth/             # JWT authentication
├── categories/       # Income/expense categories
├── accounts/         # User accounts (bank, cash, wallet)
├── transactions/     # Transaction CRUD
├── budgets/          # Budget management
└── dashboard/        # Dashboard summaries & insights
```

## Docker

**Full stack (app + database):**

```bash
docker compose up
```

**Database only (local development):**

```bash
docker compose -f docker-compose.dev.yml up -d
```

## Environment Variables

See `.env.example` for all required configuration:

| Variable | Description | Default |
|----------|-------------|---------|
| `POSTGRES_USER` | Database username | `postgres` |
| `POSTGRES_PASSWORD` | Database password | `postgres` |
| `POSTGRES_DB` | Database name | `smart_budget_tracker` |
| `DATABASE_URL` | PostgreSQL connection string | — |
| `PORT` | Application port | `3000` |
| `NODE_ENV` | Environment mode | `development` |
| `JWT_SECRET` | Secret for JWT signing | — |
| `JWT_EXPIRES_IN` | JWT token expiry | `7d` |
