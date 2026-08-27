# Smart Budget Tracker — API Endpoints

Base URL: `http://localhost:3000/api`

All responses follow NestJS conventions. Protected endpoints require an `Authorization: Bearer <accessToken>` header.

---

## Auth

| # | Method | Route | Auth | Body / Query | Description |
|---|--------|-------|------|--------------|-------------|
| 1 | POST | `/api/auth/register` | No | `{ name, email, password }` | Register a new account |
| 2 | POST | `/api/auth/login` | No | `{ email, password }` | Login, returns access + refresh tokens |
| 3 | POST | `/api/auth/refresh` | No | `{ refreshToken }` | Exchange refresh token for new access token |
| 4 | POST | `/api/auth/logout` | No | `{ refreshToken }` | Revoke a refresh token |
| 5 | POST | `/api/auth/verify-email` | No | `{ token }` | Verify email address |
| 6 | POST | `/api/auth/resend-verification` | No | `{ email }` | Resend email verification link |
| 7 | POST | `/api/auth/forgot-password` | No | `{ email }` | Request password reset link |
| 8 | POST | `/api/auth/reset-password` | No | `{ token, newPassword }` | Reset password with token |
| 9 | GET | `/api/auth/profile` | Yes | — | Get authenticated user's profile |

---

## Transactions

| # | Method | Route | Auth | Body / Query | Description |
|---|--------|-------|------|--------------|-------------|
| 10 | GET | `/api/transactions` | Yes | Query: `search?, type?, categoryId?, accountId?, status?, paymentMethod?, startDate?, endDate?, page?, limit?` | List transactions with filters and pagination |
| 11 | GET | `/api/transactions/:id` | Yes | — | Get single transaction |
| 12 | POST | `/api/transactions` | Yes | `{ type, date, categoryId, subcategory?, accountId, amount, paymentMethod?, notes?, status?, isRecurring? }` | Create transaction |
| 13 | PUT | `/api/transactions/:id` | Yes | Partial create body | Update transaction |
| 14 | DELETE | `/api/transactions/:id` | Yes | — | Soft-delete transaction |

---

## Categories

| # | Method | Route | Auth | Body / Query | Description |
|---|--------|-------|------|--------------|-------------|
| 15 | GET | `/api/categories` | Yes | Query: `type?` (INCOME / EXPENSE) | List categories grouped by income/expense with selection state |
| 16 | GET | `/api/categories/:id` | Yes | — | Get single category |
| 17 | POST | `/api/categories` | Yes | `{ name, type, group }` | Create custom category |
| 18 | PUT | `/api/categories/selections` | Yes | `{ incomeCategoryIds?, expenseCategoryIds? }` | Replace user's selected categories |
| 19 | DELETE | `/api/categories/:id` | Yes | — | Delete custom category |

---

## Budgets

| # | Method | Route | Auth | Body / Query | Description |
|---|--------|-------|------|--------------|-------------|
| 20 | GET | `/api/budgets` | Yes | — | List budgets with spend totals |
| 21 | GET | `/api/budgets/:id` | Yes | — | Get single budget |
| 22 | POST | `/api/budgets` | Yes | `{ categoryId, payCycle, amount }` | Create budget |
| 23 | PUT | `/api/budgets/:id` | Yes | `{ categoryId?, payCycle?, amount? }` (all optional) | Update budget |
| 24 | DELETE | `/api/budgets/:id` | Yes | — | Delete budget |

---

## Accounts

| # | Method | Route | Auth | Body / Query | Description |
|---|--------|-------|------|--------------|-------------|
| 25 | GET | `/api/accounts` | Yes | — | List all accounts |
| 26 | GET | `/api/accounts/:id` | Yes | — | Get single account |
| 27 | POST | `/api/accounts` | Yes | `{ name, type, currency? }` | Create account |
| 28 | DELETE | `/api/accounts/:id` | Yes | — | Delete account |

---

## Dashboard

| # | Method | Route | Auth | Body / Query | Description |
|---|--------|-------|------|--------------|-------------|
| 29 | GET | `/api/dashboard/summary` | Yes | Query: `startDate?, endDate?` | Financial summary for date range |
| 30 | GET | `/api/dashboard/spend-by-category` | Yes | Query: `startDate?, endDate?` | Spending breakdown by category |
| 31 | GET | `/api/dashboard/budget-vs-actual` | Yes | — | Budget vs actual per pay cycle |
| 32 | GET | `/api/dashboard/trend` | Yes | Query: `months?` (1–24, default 6) | Monthly income/expense/net trend |
| 33 | GET | `/api/dashboard/recent-transactions` | Yes | Query: `limit?` (1–20, default 5) | Most recent transactions |
| 34 | GET | `/api/dashboard/alerts` | Yes | — | Budget and spending alerts |
| 35 | GET | `/api/dashboard/export` | Yes | Query: `startDate?, endDate?` | Download transactions as CSV |

---

## Reports

| # | Method | Route | Auth | Body / Query | Description |
|---|--------|-------|------|--------------|-------------|
| 36 | GET | `/api/reports` | Yes | Query: `months?` (1–24, default 6) | Full report data for last N months |
| 37 | POST | `/api/reports/export` | Yes | Body: `months?, format?` (pdf / docx / csv) | Queue a background report export; returns `{ jobId, status }` |
| 38 | GET | `/api/reports/export/:jobId` | Yes | Path: `jobId` | Poll the export: `202 { jobId, status }` while processing, downloads the file when ready |

---

## Notifications

| # | Method | Route | Auth | Body / Query | Description |
|---|--------|-------|------|--------------|-------------|
| 38 | GET | `/api/notifications` | Yes | Query: `page?, limit?, unreadOnly?` | List notifications with pagination |
| 39 | GET | `/api/notifications/unread-count` | Yes | — | Get unread notification count |
| 40 | PATCH | `/api/notifications/:id/read` | Yes | — | Mark notification as read |
| 41 | POST | `/api/notifications/mark-all-read` | Yes | — | Mark all notifications as read |
| 42 | DELETE | `/api/notifications/:id` | Yes | — | Delete a notification |

---

## Emergency Fund

| # | Method | Route | Auth | Body / Query | Description |
|---|--------|-------|------|--------------|-------------|
| 43 | GET | `/api/emergency-fund` | Yes | — | Get emergency fund progress |
| 44 | PUT | `/api/emergency-fund` | Yes | `{ targetAmount?, currentAmount? }` | Set or update emergency fund |

---

## Settings

| # | Method | Route | Auth | Body / Query | Description |
|---|--------|-------|------|--------------|-------------|
| 45 | GET | `/api/settings` | Yes | — | Get user preferences |
| 46 | PATCH | `/api/settings` | Yes | `{ currencyPreference?, payCyclePreference? }` | Update preferences |
| 47 | PUT | `/api/settings/password` | Yes | `{ currentPassword, newPassword }` | Change password |
| 48 | GET | `/api/settings/notifications` | Yes | — | Get notification preferences |
| 49 | PATCH | `/api/settings/notifications` | Yes | `{ budgetAlerts?, weeklyDigest?, moneyTips? }` | Update notification preferences |
| 50 | DELETE | `/api/settings/account` | Yes | — | Permanently delete account and all data |

---

## Profile

| # | Method | Route | Auth | Body / Query | Description |
|---|--------|-------|------|--------------|-------------|
| 51 | GET | `/api/profile` | Yes | — | Get user profile |
| 52 | PATCH | `/api/profile` | Yes | `{ name?, email? }` | Update name or email |

---

## Health

| # | Method | Route | Auth | Body / Query | Description |
|---|--------|-------|------|--------------|-------------|
| 53 | GET | `/api/health` | No | — | Liveness check (pings DB + Redis) |

---

## Rate Limits

- Global: 100 req / 60s
- Auth endpoints: 10–30 req / 60s (varies by route)
- Category creation: 20 req / 60s
