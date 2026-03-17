# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

FarsightIQ Attribute Manager — an AI-powered product enrichment platform for retail merchandising. Full-stack monorepo: Node.js/Express backend + React 19 frontend, with Oracle Database and pluggable LLM providers (OpenAI GPT-4o / Google Gemini).

**GitHub**: https://github.com/malsalem514/FarSightIQ-AttributeManager
**Sister project**: Shopify Hub at https://github.com/malsalem514/ShopifyConnector (`/Users/musaalsalem/Projects/FarSightIQ-ShopifyHub`) — split out 2026-03-17. These are fully independent repos.

## Commands

```bash
# Development (from root)
npm install              # Install all workspaces
npm run dev              # Run backend + frontend concurrently
npm run dev:backend      # Backend only (tsx watch, port 3002)
npm run dev:frontend     # Frontend only (Vite HMR, port 5173)

# Build
npm run build            # Build both workspaces
npm run build:backend    # TypeScript → backend/dist/
npm run build:frontend   # Vite → visionmerch-ai-product-enrichment/dist/

# Test
npm test                           # Backend unit tests (vitest, 80 tests)
cd backend && npm run test:watch   # Interactive watch mode
cd backend && npm run test:coverage # With coverage (70% threshold target)
cd visionmerch-ai-product-enrichment && npx vitest run  # Frontend tests (15 tests)

# Type checking
cd backend && npm run typecheck                          # tsc --noEmit
cd visionmerch-ai-product-enrichment && npx tsc --noEmit # Frontend typecheck

# Run single test file
cd backend && npx vitest run src/services/__tests__/mapping-engine.test.ts

# Docker
docker compose build     # Multi-stage builds (backend + nginx frontend)
docker compose up -d     # Backend :3002, Frontend :8888
docker compose logs -f   # Stream logs
```

## Environment Setup

Backend requires `backend/.env` (gitignored). Copy from `backend/.env.template`:

```env
PORT=3002
NODE_ENV=development
ORACLE_USER=attr_mgr
ORACLE_PASSWORD=attr_mgr
ORACLE_CONNECT_STRING=100.90.84.20:1521/DEMODB
ORACLE_CLIENT_PATH=/Users/musaalsalem/oracle/instantclient
OPENAI_API_KEY=<from MusaOS daemon/.env>
OPENAI_MODEL=gpt-4o
CORS_ORIGINS=http://localhost:5173,http://localhost:5174,http://localhost:5175
```

**VPN required** to reach Oracle at 100.90.84.20.

## Monorepo Structure

npm workspaces with two packages:
- `backend/` — Express API (TypeScript, ESM via `"type": "module"`)
- `visionmerch-ai-product-enrichment/` — React 19 frontend (Vite + Tailwind CSS 4)

Root `package.json` orchestrates both. Frontend dev server proxies `/api` to `localhost:3002`.

## Architecture

### Backend (`backend/src/`)

**Service-oriented architecture** with clear layering:
- `routes/` → REST endpoint definitions (all wrapped with `asyncHandler`), delegate to services
- `services/` → Business logic, database queries, external integrations
- `services/llm/` → LLM orchestration with pluggable provider pattern (`LLMService` → `ProviderFactory` → `OpenAIProvider` | `GeminiProvider`)
- `prompts/` → LLM prompt templates for extraction, hierarchy discovery, description rewriting
- `middleware/` → Rate limiting (global + per-endpoint), Oracle error handling, tenant isolation, BU validation
- `schemas/` → Zod validation schemas for LLM responses
- `types/` → Shared TypeScript interfaces
- `utils/` → Structured logger (JSON in prod), custom errors (`AppError`), retry logic
- `workers/` → Background LLM batch job worker (graceful shutdown via SIGTERM)

**Key patterns:**
- All async route handlers wrapped with `asyncHandler()` from `middleware/oracle-error-handler.ts`
- Oracle connection pooling via `oracle-pool.ts` (dual-pool: main + media)
- Multi-tenant: `TENANT_ID` and `BUSINESS_UNIT_ID` columns throughout
- Shadow caches: `HIERARCHY_CACHE` and `CATALOG_CACHE_SHADOW` Oracle tables mirror ERP data
- Structured JSON logging in production with request correlation IDs (`X-Request-ID`)
- Helmet security headers, compression, graceful HTTP server shutdown
- CORS fails hard in production if not explicitly configured

### Frontend (`visionmerch-ai-product-enrichment/`)

- `pages/` — Dashboard, ReviewGrid, AttributeConfig, Admin, AdminMonitoring, Settings, TaxonomyMapping, TaxonomyDiscovery
- `components/` — `shared/` (UI primitives), `review/` (grid components), `onboarding/` (upload/draft)
- `hooks/` — Virtualization, WebSocket, library data, attribute groups
- `src/api/client.ts` — Fetch wrapper with 30s timeout, retry with backoff (GET only), AbortController
- Path alias: `@` resolves to the frontend root directory
- Strict TypeScript enabled

### Data Enrichment Flow

```
Image Upload → Onboarding Service → Hierarchy Discovery (AI)
                                   → Attribute Extraction (AI)
                                   → Mapping Engine (rule-based)
                                   → Draft Storage (Oracle)
                                   → User Review (PowerSheet grid)
                                   → Sync to ERP
```

## Database

Oracle schema `ATTR_MGR` on `100.90.84.20:1521/DEMODB`. Key table sets:

- **Product caches**: `HIERARCHY_CACHE`, `CATALOG_CACHE_SHADOW` (shadow copies from MERCH ERP)
- **Onboarding**: `STAGING_STYLES`, `STAGING_IMAGES`, `ONBOARDING_BATCHES`
- **AI**: `AI_ATTRIBUTION_RESULTS`, `AI_BATCH_PROGRESS`, `LLM_CACHE`
- **Sync**: `IRI_STAGING` tables for ERP writeback
- **Config**: `APP_ENVIRONMENTS`, `USER_SESSION_STATE`

Reads from upstream `MERCH.*`, `OMNI.*`, `VSTORE.*` schemas via DB links/synonyms.

**This project does NOT own `SHOPIFY_*` tables** — those belong to the Shopify Hub project.

## TypeScript Conventions

- Backend: ES2022, NodeNext module resolution (ESM — imports require `.js` extensions), strict mode
- Frontend: ES2022, bundler module resolution, strict mode, JSX react-jsx
- Test files: `src/**/*.test.ts` (excluded from compilation), vitest globals enabled
- All `req.params.*` values cast as `string` (Express 5 types return `string | string[]`)

## Production Hardening (completed)

- Helmet security headers (HSTS in production)
- Response compression (gzip/brotli)
- 161 async route handlers wrapped with `asyncHandler()`
- Graceful shutdown (drain HTTP, close Oracle pools)
- Worker graceful shutdown (SIGTERM stops poll loop)
- Structured JSON logging with correlation IDs
- Global API rate limiting
- CORS fails in production without explicit config
- Error handler suppresses stack traces in production
- File upload path traversal fix (`path.basename`)
- Frontend API client with timeout + retry

## CI/CD

- GitHub Actions: typecheck → test → build on push/PR to main
- Docker: multi-stage builds (node:20-slim builder → production, nginx:alpine for frontend)
- Vitest coverage threshold: 70% (target, not yet met)

## Key Dependencies

- **oracledb** (thick mode locally, thin mode in Docker) — Oracle Instant Client at `/Users/musaalsalem/oracle/instantclient`
- **openai** / **@google/generative-ai** — LLM providers, selected via `LLM_PROVIDER` env var
- **multer** — file upload (image + ZIP for bulk onboarding)
- **zod** — schema validation
- **helmet** + **compression** — security headers + response compression
- **Tailwind CSS 4** + **Lucide React** — frontend styling and icons

## Known Remaining Work

- JWT authentication + RBAC (deferred — internal staff still using unauthenticated access for demos)
- Admin password hardcoded (`nrf2026`) — move to env var
- SQL injection in products.service.ts INTERVAL clause (low risk, parseInt provides safety)
- Large file decomposition (ReviewGridPage 1,531 LOC, AdminPage 1,577 LOC)
- React Context for businessUnitId/hierarchy (currently prop drilling)
- Database migration tooling (currently manual SQL scripts in for-dbas/)
- Test coverage ~16% backend (target 70%)
