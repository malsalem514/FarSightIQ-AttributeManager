# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

FarsightIQ Attribute Manager — an AI-powered product enrichment platform for retail merchandising. Full-stack monorepo: Node.js/Express backend + React 19 frontend, with Oracle Database and pluggable LLM providers (OpenAI GPT-4o / Google Gemini).

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
npm test                 # Backend unit tests (vitest run)
cd backend && npm run test:watch    # Interactive watch mode
cd backend && npm run test:coverage # With coverage report
npm run test:e2e         # Playwright E2E tests

# Type checking & lint (backend)
cd backend && npm run typecheck   # tsc --noEmit
cd backend && npm run lint        # eslint src --ext .ts

# Run single test file
cd backend && npx vitest run src/services/__tests__/mapping-engine.test.ts
```

## Monorepo Structure

npm workspaces with two packages:
- `backend/` — Express API (TypeScript, ESM via `"type": "module"`)
- `visionmerch-ai-product-enrichment/` — React 19 frontend (Vite + Tailwind CSS 4)

Root `package.json` orchestrates both. Frontend dev server proxies `/api` requests to `localhost:3002`.

## Architecture

### Backend (`backend/src/`)

**Service-oriented architecture** with clear layering:
- `routes/` → REST endpoint definitions, delegate to services
- `services/` → Business logic, database queries, external integrations
- `services/llm/` → LLM orchestration with pluggable provider pattern (`LLMService` → `ProviderFactory` → `OpenAIProvider` | `GeminiProvider`)
- `prompts/` → LLM prompt templates for extraction, hierarchy discovery, description rewriting
- `middleware/` → Rate limiting, Oracle error handling, tenant isolation, BU validation
- `schemas/` → Zod validation schemas for LLM responses
- `types/` → Shared TypeScript interfaces
- `utils/` → Logger, custom errors (`AppError`), API response formatting, retry logic
- `workers/` → Background LLM batch job worker

**Key patterns:**
- Oracle connection pooling via `oracle-pool.ts` (thick mode with Instant Client)
- Multi-tenant: `TENANT_ID` and `BUSINESS_UNIT_ID` columns throughout; middleware enforces isolation
- Shadow caches: `HIERARCHY_CACHE` and `CATALOG_CACHE` Oracle tables mirror ERP data
- Zod validates LLM responses at the boundary
- Custom `AppError` class carries HTTP status codes

### Frontend (`visionmerch-ai-product-enrichment/`)

- `pages/` — Page-level components (Dashboard, ReviewGrid, Admin, Settings, ShopifyHub, etc.)
- `components/` — Reusable UI split by domain (`shared/`, `review/`, `onboarding/`, `shopify/`)
- `hooks/` — Custom hooks (virtualization, WebSocket, library data, attribute groups)
- `src/api/client.ts` — Axios HTTP client for all backend calls
- Path alias: `@` resolves to the frontend root directory

### Data Enrichment Flow

```
Image Upload → Onboarding Service → Hierarchy Discovery (AI)
                                   → Attribute Extraction (AI)
                                   → Mapping Engine (rule-based)
                                   → Draft Storage (Oracle)
                                   → User Review (PowerSheet grid)
                                   → Sync to ERP
```

## TypeScript Conventions

- Backend targets ES2022, uses NodeNext module resolution (ESM — imports require `.js` extensions)
- Strict mode enabled in both workspaces
- Backend test files: `src/**/*.test.ts` (excluded from compilation)
- Vitest globals enabled — no need to import `describe`/`it`/`expect`

## Environment Configuration

Backend requires `backend/.env` with Oracle connection, LLM API keys, CORS origins, and pool settings. Frontend requires `visionmerch-ai-product-enrichment/.env` with `VITE_API_URL`. See README.md for full variable list.

## Key Dependencies

- **oracledb** (thick mode) — requires Oracle Instant Client installed locally
- **openai** / **@google/generative-ai** — LLM providers, selected via `LLM_PROVIDER` env var
- **multer** — file upload (image + ZIP for bulk onboarding)
- **zod** — schema validation
- **node-cache** — in-memory LLM result caching
- **Tailwind CSS 4** + **Lucide React** — frontend styling and icons
