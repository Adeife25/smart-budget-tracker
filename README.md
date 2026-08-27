# Smart Budget Tracker

A personal finance web application that helps individuals log income and expenses, understand their spending patterns, and stay within self-defined budgets.

## Tech Stack

- **Backend:** NestJS 11 + TypeScript
- **Database:** PostgreSQL 16
- **ORM:** Prisma
- **Auth:** JWT (passport-jwt)
- **Caching & Background Jobs:** Redis 7 + BullMQ queues (email, report export, token cleanup)
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
├── mail/             # Email service (Resend)
├── auth/             # JWT auth: register/login, refresh tokens, email verification, password reset
├── categories/       # Income/expense categories
├── accounts/         # User accounts (bank, cash, wallet)
├── transactions/     # Transaction CRUD
├── budgets/          # Budget management
└── dashboard/        # Dashboard summaries & insights
```

## API Reference

The full endpoint reference — methods, paths, auth requirements, request bodies, and query params — lives in [`API_ENDPOINTS.md`](./API_ENDPOINTS.md) (53 endpoints covering auth, transactions, categories, budgets, accounts, dashboard, reports, notifications, emergency fund, settings, profile, and health).

Highlights:

- **Auth:** `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/refresh`, `POST /api/auth/logout`, plus email verification and password-reset flows. All other routes require a `Bearer` access token.
- **Reports:** `GET /api/reports?months=N` returns the full report data, and async exports are queued with `POST /api/reports/export` (`pdf` / `docx` / `csv`) then polled via `GET /api/reports/export/:jobId`.
- **Alerts:** budget (≥80% and >100%) and emergency-fund (50%/100% milestone) alerts are generated automatically when transactions or fund amounts change.

## Environment Variables

See `.env.example` for all required configuration:

| Variable | Description | Default |
|----------|-------------|---------|
| `POSTGRES_USER` | Database username | `postgres` |
| `POSTGRES_PASSWORD` | Database password | `postgres` |
| `POSTGRES_DB` | Database name | `smart_budget_tracker` |
| `DATABASE_URL` | PostgreSQL connection string (host port `5433` for the Docker DB) | — |
| `PORT` | Application port | `3000` |
| `NODE_ENV` | Environment mode (`production` enables strict validation) | `development` |
| `FRONTEND_URL` | Base URL used to build verification/reset links | `http://localhost:3000` |
| `CORS_ORIGINS` | Comma-separated allowed browser origins (falls back to `FRONTEND_URL`) | — |
| `JWT_SECRET` | Secret for access-token signing (**required in production**) | — |
| `JWT_EXPIRES_IN` | Access-token expiry in seconds | `3600` |
| `JWT_REFRESH_SECRET` | Secret for refresh-token signing (**required in production**) | — |
| `JWT_REFRESH_EXPIRES_IN` | Refresh-token expiry in seconds | `2592000` |
| `JWT_VERIFY_SECRET` | Secret for email-verification tokens (**required in production**) | — |
| `RESEND_API_KEY` | Resend API key for sending emails (links are logged instead when unset) | — |
| `EMAIL_FROM` | Sender address for emails | `Smart Budget Tracker <onboarding@resend.dev>` |
| `REDIS_HOST` | Redis host (cache + job queues) | `localhost` |
| `REDIS_PORT` | Redis port | `6379` |
| `REDIS_PASSWORD` | Optional Redis password | — |
| `CACHE_TTL_SECONDS` | How long cached responses are kept before refetch | `300` |
| `TOKEN_CLEANUP_RETENTION_DAYS` | Days expired tokens are kept before the daily purge job deletes them | `7` |

> **Secrets:** `.env` is gitignored. Never commit real secrets. With
> `NODE_ENV=production` the app refuses to start if the JWT secrets or
> `DATABASE_URL` are missing or still set to placeholder values.

## Production behavior

- Swagger UI at `/api/docs` is only enabled outside production.
- Security headers (helmet), a CORS allowlist, and rate limiting
  (100 req/min globally, stricter limits on auth endpoints) are always on.
- Liveness/readiness: `GET /api/health` checks API + database + Redis connectivity.
- Emails and report export generation run on background queues (BullMQ + Redis).
- Expired refresh and password-reset tokens are purged daily by a scheduled queue job.
- Money amounts are stored as `DECIMAL(12,2)` and returned as JSON numbers.

## Docker

**Full stack (app + database + Redis):**

```bash
docker compose up
```

The app container runs `prisma migrate deploy` (via a one-shot `migrate`
service) before starting, restarts automatically, and exposes a health check
on `/api/health`. The database is only reachable from the compose network.

**Database only (local development):**

```bash
docker compose -f docker-compose.dev.yml up -d
```
