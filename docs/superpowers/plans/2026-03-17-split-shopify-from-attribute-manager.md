# Split Shopify Hub from Attribute Manager — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the FarSightIQ monolith into two independent projects: Attribute Manager (core AI enrichment) and Shopify Hub (e-commerce integration). Each project gets its own repo, its own backend, its own frontend, and can be built, started, and deployed even if the other repo is absent.

**Architecture:** Copy shared infrastructure (oracle-pool, logger, config, errors, middleware) into each project — no shared package or monorepo. Both may connect to the same Oracle instance, but the Shopify Hub must not depend on Attribute Manager-owned tables, caches, or PL/SQL packages. Shared read access is limited to upstream enterprise source schemas/views (`MERCH.*`, `OMNI.*`, `VSTORE.*`) plus explicit Shopify-owned tables. The Shopify Hub backend runs on a separate port (3003) with its own Express server and its own Shopify-owned read model (`SHOPIFY_TENANTS`, `SHOPIFY_PRODUCT_SNAPSHOT`, `SHOPIFY_PUBLICATION_QUEUE`, `SHOPIFY_CONFIG`, `SHOPIFY_SYNC_LOG`, `SHOPIFY_HIERARCHY_MAP`).

**Tech Stack:** Node.js 20+, Express 4, TypeScript (ESM), React 19, Vite 6, Oracle DB (oracledb thick mode), Tailwind CSS 4

---

## Pre-Split File Inventory

### Files staying in Attribute Manager (no changes needed)
```
backend/src/routes/           → products, attributes, library, sync, dashboard,
                                business-units, settings, autocomplete, images,
                                taxonomy, jobs, quality, export, admin, session
backend/src/services/         → products, attributes, onboarding, settings, sync,
                                user-session, hierarchy-cache, llm-config,
                                mapping-engine, oracle-pool, autocomplete
backend/src/services/llm/     → ALL (LLMService, providers, cache, etc.)
backend/src/services/attributes/ → ALL
backend/src/services/library/    → ALL
backend/src/services/db/         → job-queue-db
backend/src/services/sync/       → sync-db
backend/src/prompts/          → ALL except shopify-mapping.ts
backend/src/middleware/        → ALL
backend/src/schemas/           → ALL
backend/src/types/             → ALL
backend/src/utils/             → ALL
backend/src/workers/           → ALL
frontend/pages/               → Dashboard, ReviewGrid, AttributeConfig, Admin,
                                AdminMonitoring, Settings, TaxonomyMapping,
                                TaxonomyDiscovery
frontend/components/          → shared/, review/, onboarding/
frontend/hooks/               → ALL
frontend/src/api/             → client.ts (minus Shopify functions)
```

### Files moving to Shopify Hub (will be removed from Attribute Manager)
```
backend/src/routes/shopify.route.ts
backend/src/services/shopify.service.ts
backend/src/services/shopify-actions.service.ts
backend/src/services/shopify-discounts.service.ts
backend/src/services/shopify-media.service.ts
backend/src/services/shopify-live-test.service.ts
backend/inspect_shopify.mjs                    (Shopify taxonomy inspector script)
backend/import_shopify_taxonomy.mjs            (Shopify taxonomy import script)
backend/src/prompts/shopify-mapping.ts
frontend/pages/ShopifyHubPage.tsx
frontend/components/shopify/ShopifyActions.tsx
frontend/components/shopify/ShopifyScopePublisher.tsx
frontend/components/shopify/VisionSuitePublisher.tsx
frontend/components/shopify/StoreHealthDashboard.tsx
frontend/components/shopify/SyncHistoryPanel.tsx
frontend/components/shopify/DiscountManagementPanel.tsx
frontend/components/shopify/WebhookManagementPanel.tsx
frontend/components/shopify/BulkOperationsPanel.tsx
frontend/components/shopify/orders/OrderCard.tsx
frontend/components/shopify/orders/OrderOriginFilter.tsx
frontend/components/shopify/index.ts
frontend/components/shopify/theme.ts
for-dbas/scripts/V067__shopify_hub_objects.sql
for-dbas/scripts/V068__shopify_hub_synonyms.sql
for-dbas/scripts/V069__shopify_cross_schema_access.sql
for-dbas/scripts/check_shopify_access.sql
for-dbas/scripts/DBA_REQUEST_SHOPIFY_GRANTS.sql
for-dbas/scripts/run_shopify_grants.bat
```

### Files staying in Attribute Manager but requiring Shopify cleanup
```
backend/src/services/llm/enriched-context.service.ts  → remove Shopify category enrichment branch
backend/src/services/llm/openai-provider.ts           → remove Shopify category fields from payloads
backend/src/services/llm/types.ts                     → remove Shopify category type fields
backend/src/services/user-session.service.ts          → remove 'shopify' session type
```

### Infrastructure copied to Shopify Hub (stays in both projects)
```
backend/src/services/oracle-pool.ts       → copy (Shopify gets its own pool)
backend/src/utils/logger.ts               → copy
backend/src/utils/errors.ts               → copy
backend/src/utils/api-response.ts         → copy (if exists)
backend/src/utils/retry.ts                → copy (if exists)
backend/src/middleware/oracle-error-handler.ts → copy
backend/src/middleware/rate-limit.ts       → copy
frontend/components/shared/UI.tsx         → copy (Button, Select, StatusBadge)
```

---

## Task 1: Create Shopify Hub Backend Project

**Files:**
- Create: `../FarSightIQ-ShopifyHub/backend/package.json`
- Create: `../FarSightIQ-ShopifyHub/backend/tsconfig.json`
- Create: `../FarSightIQ-ShopifyHub/backend/vitest.config.ts`
- Create: `../FarSightIQ-ShopifyHub/backend/.env.template`
- Create: `../FarSightIQ-ShopifyHub/backend/src/config.ts`

- [ ] **Step 1: Create project directory structure**

```bash
mkdir -p ../FarSightIQ-ShopifyHub/backend/src/{routes,services,middleware,utils,types,prompts}
mkdir -p ../FarSightIQ-ShopifyHub/frontend/{pages,components,components/shared,src/api}
mkdir -p ../FarSightIQ-ShopifyHub/for-dbas/scripts
```

- [ ] **Step 2: Create backend package.json**

Write `../FarSightIQ-ShopifyHub/backend/package.json`:
```json
{
  "name": "farsightiq-shopify-hub-backend",
  "version": "1.0.0",
  "description": "FarsightIQ Shopify Hub - E-Commerce Integration API",
  "author": "Musa Al-Salem",
  "license": "UNLICENSED",
  "private": true,
  "type": "module",
  "main": "dist/index.js",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "start:prod": "NODE_ENV=production node dist/index.js",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "typecheck": "tsc --noEmit",
    "clean": "rm -rf dist node_modules"
  },
  "dependencies": {
    "compression": "^1.8.1",
    "cors": "^2.8.5",
    "dotenv": "^16.4.7",
    "express": "^4.21.2",
    "helmet": "^8.1.0",
    "oracledb": "^6.8.0"
  },
  "devDependencies": {
    "@types/compression": "^1.8.1",
    "@types/cors": "^2.8.17",
    "@types/express": "^5.0.0",
    "@types/node": "^22.10.2",
    "@types/oracledb": "^6.5.2",
    "tsx": "^4.19.2",
    "typescript": "^5.7.2",
    "vitest": "^4.0.3"
  },
  "engines": {
    "node": ">=20.0.0"
  }
}
```

Note: No `openai`, `@google/generative-ai`, `multer`, `adm-zip` — Shopify doesn't need LLM or file upload.

- [ ] **Step 3: Create tsconfig.json**

Copy from `FarSightIQ-master/backend/tsconfig.json` — identical config.

- [ ] **Step 4: Create vitest.config.ts**

Copy from `FarSightIQ-master/backend/vitest.config.ts` — identical config.

- [ ] **Step 5: Create Shopify-specific config.ts**

Write `../FarSightIQ-ShopifyHub/backend/src/config.ts`:
```typescript
/**
 * Shopify Hub Configuration
 */
import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3003', 10),  // Different port from Attribute Manager
  nodeEnv: process.env.NODE_ENV || 'development',

  oracle: {
    user: process.env.ORACLE_USER || '',
    password: process.env.ORACLE_PASSWORD || '',
    connectString: process.env.ORACLE_CONNECT_STRING || '',
    clientPath: process.env.ORACLE_CLIENT_PATH || undefined,
    poolMin: parseInt(process.env.ORACLE_POOL_MIN || '2', 10),
    poolMax: parseInt(process.env.ORACLE_POOL_MAX || '50', 10),  // Smaller pool for Shopify
    poolIncrement: 5,
    poolTimeout: 300,
    queueMax: parseInt(process.env.ORACLE_QUEUE_MAX || '200', 10),
    queueTimeout: 60000,
    stmtCacheSize: 30
  },

  corsOrigins: parseCorsOrigins(process.env.CORS_ORIGINS),

  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX || '1000', 10)
  }
};

function parseCorsOrigins(envValue?: string): string[] {
  if (!envValue) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('CORS_ORIGINS must be explicitly set in production.');
    }
    return ['http://localhost:5174', 'http://localhost:5175'];  // Shopify frontend ports
  }
  const origins = envValue.split(',').map(o => o.trim()).filter(Boolean);
  if (origins.includes('*') && process.env.NODE_ENV === 'production') {
    throw new Error('CORS wildcard (*) is not allowed in production.');
  }
  return origins;
}

export function validateConfig(): { valid: boolean; missing: string[] } {
  const required = ['ORACLE_USER', 'ORACLE_PASSWORD', 'ORACLE_CONNECT_STRING'];
  const missing = required.filter(key => !process.env[key]);
  return { valid: missing.length === 0, missing };
}
```

Note: No LLM config — Shopify Hub can keep the prompt file for future AI mapping, but the current service remains deterministic/demo-only.

- [ ] **Step 6: Create .env.template**

Write `../FarSightIQ-ShopifyHub/backend/.env.template`:
```env
# Server
PORT=3003
NODE_ENV=development

# Oracle Database (same instance as Attribute Manager)
ORACLE_USER=attr_mgr
ORACLE_PASSWORD=
ORACLE_CONNECT_STRING=
ORACLE_CLIENT_PATH=

# Pool (smaller for Shopify — doesn't need as many connections)
ORACLE_POOL_MIN=2
ORACLE_POOL_MAX=50

# Shopify tenant bootstrap
SHOPIFY_TENANT_ID=DEFAULT
SHOPIFY_TENANT_NAME=Default Shopify Hub

# CORS
CORS_ORIGINS=http://localhost:5174
```

- [ ] **Step 7: Commit**

```bash
cd ../FarSightIQ-ShopifyHub
git init
git add backend/package.json backend/tsconfig.json backend/vitest.config.ts backend/.env.template backend/src/config.ts
git commit -m "feat: scaffold Shopify Hub backend project"
```

---

## Task 2: Copy Shared Infrastructure to Shopify Hub

**Files:**
- Copy: `backend/src/utils/logger.ts` → `../FarSightIQ-ShopifyHub/backend/src/utils/logger.ts`
- Copy: `backend/src/utils/errors.ts` → `../FarSightIQ-ShopifyHub/backend/src/utils/errors.ts`
- Copy: `backend/src/utils/retry.ts` → `../FarSightIQ-ShopifyHub/backend/src/utils/retry.ts`
- Copy: `backend/src/services/oracle-pool.ts` → `../FarSightIQ-ShopifyHub/backend/src/services/oracle-pool.ts`
- Copy: `backend/src/middleware/oracle-error-handler.ts` → `../FarSightIQ-ShopifyHub/backend/src/middleware/oracle-error-handler.ts`
- Copy: `backend/src/middleware/rate-limit.ts` → `../FarSightIQ-ShopifyHub/backend/src/middleware/rate-limit.ts`
- Create: `../FarSightIQ-ShopifyHub/backend/src/services/tenant-context.service.ts`

- [ ] **Step 1: Copy utility files**

```bash
cp backend/src/utils/logger.ts ../FarSightIQ-ShopifyHub/backend/src/utils/
cp backend/src/utils/errors.ts ../FarSightIQ-ShopifyHub/backend/src/utils/
cp backend/src/utils/retry.ts ../FarSightIQ-ShopifyHub/backend/src/utils/ 2>/dev/null || true
```

- [ ] **Step 2: Copy oracle-pool**

```bash
cp backend/src/services/oracle-pool.ts ../FarSightIQ-ShopifyHub/backend/src/services/
```

- [ ] **Step 3: Copy middleware**

```bash
cp backend/src/middleware/oracle-error-handler.ts ../FarSightIQ-ShopifyHub/backend/src/middleware/
cp backend/src/middleware/rate-limit.ts ../FarSightIQ-ShopifyHub/backend/src/middleware/
```

- [ ] **Step 4: Create a Shopify-owned TenantContextService**

Write `../FarSightIQ-ShopifyHub/backend/src/services/tenant-context.service.ts`.

This service replaces `SettingsService` entirely for Shopify Hub. It must resolve tenant context from Shopify-owned configuration, not from Attribute Manager tables.

Required methods:
- `getInstance()`
- `initialize()` — validate that a tenant exists in `SHOPIFY_TENANTS` or seed a default record from env
- `getActiveTenantId()` — read from `SHOPIFY_TENANTS`
- `getSettings()` / `getMode()` if still needed by copied Shopify services

Explicitly do not copy or call any Attribute Manager-specific behavior:
- No `APP_ENVIRONMENTS`
- No `ENV_SWITCHER_PKG.*`
- No `SYNC_HIERARCHY_CACHE`
- No `REFRESH_CATALOG_CACHE`
- No `REFRESH_CATALOG_MEDIA`
- No `STYLE_CHARACTERISTICS`

Goal: Shopify Hub boots against its own config and Shopify-owned tables only.

- [ ] **Step 5: Commit**

```bash
cd ../FarSightIQ-ShopifyHub
git add backend/src/utils/ backend/src/services/ backend/src/middleware/
git commit -m "feat: add shared infrastructure (oracle-pool, logger, errors, middleware)"
```

---

## Task 3: Move Shopify Backend Services & Route

**Files:**
- Move: `backend/src/services/shopify.service.ts` → Shopify Hub
- Move: `backend/src/services/shopify-actions.service.ts` → Shopify Hub
- Move: `backend/src/services/shopify-discounts.service.ts` → Shopify Hub
- Move: `backend/src/services/shopify-media.service.ts` → Shopify Hub
- Move: `backend/src/services/shopify-live-test.service.ts` → Shopify Hub
- Move: `backend/src/routes/shopify.route.ts` → Shopify Hub

- [ ] **Step 1: Copy Shopify services and prompt to new project**

```bash
cp backend/src/services/shopify.service.ts ../FarSightIQ-ShopifyHub/backend/src/services/
cp backend/src/services/shopify-actions.service.ts ../FarSightIQ-ShopifyHub/backend/src/services/
cp backend/src/services/shopify-discounts.service.ts ../FarSightIQ-ShopifyHub/backend/src/services/
cp backend/src/services/shopify-media.service.ts ../FarSightIQ-ShopifyHub/backend/src/services/
cp backend/src/services/shopify-live-test.service.ts ../FarSightIQ-ShopifyHub/backend/src/services/
cp backend/src/routes/shopify.route.ts ../FarSightIQ-ShopifyHub/backend/src/routes/
cp backend/src/prompts/shopify-mapping.ts ../FarSightIQ-ShopifyHub/backend/src/prompts/
```

- [ ] **Step 2: Refactor copied services for the hard split**

Keep the relative import structure where it still applies, but do not carry over Attribute Manager data dependencies unchanged.

Required service refactors:
- Replace `SettingsService` imports with `tenant-context.service.ts`
- Replace reads from `APP_ENVIRONMENTS` with `SHOPIFY_TENANTS`
- Replace reads from `CATALOG_CACHE_SHADOW` with `SHOPIFY_PRODUCT_SNAPSHOT`
- Replace publication writes to `STYLE_CHARACTERISTICS` with inserts/merges into `SHOPIFY_PUBLICATION_QUEUE`
- Replace any fallback reads of `MERCH.CATALOG_CACHE_SHADOW` with direct `MERCH.*` source queries or the Shopify snapshot refresh flow
- Keep `MERCH.*`, `OMNI.*`, and `VSTORE.*` as the only allowed non-Shopify upstream sources

- [ ] **Step 3: Fix shopify.route.ts import paths**

The route file imports services with relative paths like `'../services/shopify.service.js'` — these should remain correct. Verify the `asyncHandler` import points to `'../middleware/oracle-error-handler.js'` and remove any route descriptions that still describe `STYLE_CHARACTERISTICS` as the publication SSOT.

- [ ] **Step 4: Commit in Shopify Hub**

```bash
cd ../FarSightIQ-ShopifyHub
git add backend/src/services/ backend/src/routes/
git commit -m "feat: add Shopify services and route"
```

---

## Task 4: Create Shopify Hub Backend Entry Point

**Files:**
- Create: `../FarSightIQ-ShopifyHub/backend/src/index.ts`
- Create: `../FarSightIQ-ShopifyHub/backend/src/routes/index.ts`

- [ ] **Step 1: Create routes/index.ts**

Write `../FarSightIQ-ShopifyHub/backend/src/routes/index.ts`:
```typescript
/**
 * Shopify Hub API Routes
 */
import { Router } from 'express';
import shopifyRouter from './shopify.route.js';
import { getPoolStats, pingOracle } from '../services/oracle-pool.js';
import { asyncHandler } from '../middleware/oracle-error-handler.js';
import { apiLimiter } from '../middleware/rate-limit.js';

const router = Router();

router.use(apiLimiter);

// Health check
router.get('/health', asyncHandler(async (req, res) => {
  const poolStats = getPoolStats();
  const oraclePing = await pingOracle();
  const isHealthy = oraclePing.ok;

  res.status(isHealthy ? 200 : 503).json({
    success: isHealthy,
    status: isHealthy ? 'ok' : 'degraded',
    service: 'shopify-hub',
    timestamp: new Date().toISOString(),
    oracle: {
      connected: oraclePing.ok,
      latencyMs: oraclePing.latencyMs,
      pool: poolStats
    }
  });
}));

router.get('/health/live', (req, res) => {
  res.json({ status: 'alive' });
});

router.get('/health/ready', asyncHandler(async (req, res) => {
  const oraclePing = await pingOracle();
  res.status(oraclePing.ok ? 200 : 503).json({
    ready: oraclePing.ok,
    oracle: oraclePing.ok
  });
}));

// Mount Shopify routes
router.use('/shopify', shopifyRouter);

export default router;
```

- [ ] **Step 2: Create index.ts (Express server)**

Write `../FarSightIQ-ShopifyHub/backend/src/index.ts` — modeled after the Attribute Manager's `index.ts` but simplified (no LLM worker, no image fallback):

```typescript
/**
 * Shopify Hub Backend
 *
 * Express.js API server for FarsightIQ Shopify Integration
 */
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { config, validateConfig } from './config.js';
import { createPool, closePool } from './services/oracle-pool.js';
import { TenantContextService } from './services/tenant-context.service.js';
import { logger } from './utils/logger.js';
import { formatErrorResponse, AppError } from './utils/errors.js';
import routes from './routes/index.js';

const app = express();

app.set('trust proxy', 1);

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  hsts: config.nodeEnv === 'production' ? { maxAge: 31536000, includeSubDomains: true } : false,
}));

app.use(compression());

app.use(cors({
  origin: config.corsOrigins,
  credentials: true,
  maxAge: 86400
}));

app.use(express.json({ limit: '10mb' }));

// Request correlation ID + logging
app.use((req, res, next) => {
  const requestId = (req.headers['x-request-id'] as string) || logger.correlationId();
  res.setHeader('X-Request-ID', requestId);
  (req as any).requestId = requestId;

  const start = Date.now();
  res.on('finish', () => {
    logger.info(`${req.method} ${req.path}`, {
      requestId,
      status: res.statusCode,
      duration: `${Date.now() - start}ms`
    });
  });
  next();
});

app.use('/api', routes);

// Error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  const isDev = config.nodeEnv === 'development';
  logger.error('Request error', {
    path: req.path,
    method: req.method,
    error: err.message,
    ...(isDev && { stack: err.stack }),
    code: err.code
  });
  if (res.headersSent) return next(err);
  if (err instanceof AppError) {
    res.status(err.statusCode).json(err.toJSON());
    return;
  }
  res.status(500).json(formatErrorResponse(err, isDev));
});

let isShuttingDown = false;
let server: ReturnType<typeof app.listen> | null = null;

async function start(): Promise<void> {
  const { valid, missing } = validateConfig();
  if (!valid) {
    logger.error('Missing required configuration', { missing });
    process.exit(1);
  }

  try {
    await createPool();
    const tenantContext = await TenantContextService.getInstance();
    await tenantContext.initialize();
  } catch (error: any) {
    logger.error('Failed to connect to Oracle', { error: error.message });
    process.exit(1);
  }

  server = app.listen(config.port, () => {
    logger.info(`Shopify Hub API running on http://localhost:${config.port}`);
  });
}

async function shutdown(): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;
  logger.info('Shutting down gracefully...');
  if (server) {
    await new Promise<void>((resolve) => {
      server!.close(() => resolve());
      setTimeout(resolve, 10000);
    });
  }
  await closePool();
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

start().catch((error) => {
  logger.error('Failed to start server', { error: error.message });
  process.exit(1);
});
```

- [ ] **Step 3: Verify backend compiles**

```bash
cd ../FarSightIQ-ShopifyHub/backend
npm install
npx tsc --noEmit
```

Expected: 0 errors

- [ ] **Step 4: Commit**

```bash
git add backend/src/index.ts backend/src/routes/index.ts
git commit -m "feat: add Shopify Hub Express server entry point"
```

---

## Task 5: Create Shopify Hub Frontend

**Files:**
- Create: `../FarSightIQ-ShopifyHub/frontend/package.json`
- Create: `../FarSightIQ-ShopifyHub/frontend/vite.config.ts`
- Create: `../FarSightIQ-ShopifyHub/frontend/tsconfig.json`
- Create: `../FarSightIQ-ShopifyHub/frontend/index.html`
- Create: `../FarSightIQ-ShopifyHub/frontend/index.tsx`
- Create: `../FarSightIQ-ShopifyHub/frontend/index.css`
- Create: `../FarSightIQ-ShopifyHub/frontend/App.tsx`
- Move: All `components/shopify/*` files
- Move: `pages/ShopifyHubPage.tsx`
- Copy: `components/shared/UI.tsx` (shared UI components used by Shopify)

- [ ] **Step 1: Create frontend package.json**

Write `../FarSightIQ-ShopifyHub/frontend/package.json` — same deps as core frontend:
```json
{
  "name": "farsightiq-shopify-hub-frontend",
  "version": "1.0.0",
  "description": "FarsightIQ Shopify Hub - E-Commerce Dashboard",
  "author": "Musa Al-Salem",
  "license": "UNLICENSED",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "clean": "rm -rf dist node_modules"
  },
  "dependencies": {
    "lucide-react": "^0.562.0",
    "react": "^19.2.3",
    "react-dom": "^19.2.3"
  },
  "devDependencies": {
    "@tailwindcss/postcss": "^4.1.18",
    "@types/node": "^22.14.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^5.0.0",
    "autoprefixer": "^10.4.23",
    "postcss": "^8.5.6",
    "tailwindcss": "^4.1.18",
    "typescript": "~5.8.2",
    "vite": "^6.2.0"
  }
}
```

- [ ] **Step 2: Copy Vite/TS/PostCSS/Tailwind config**

```bash
cp visionmerch-ai-product-enrichment/vite.config.ts ../FarSightIQ-ShopifyHub/frontend/
cp visionmerch-ai-product-enrichment/tsconfig.json ../FarSightIQ-ShopifyHub/frontend/
cp visionmerch-ai-product-enrichment/postcss.config.js ../FarSightIQ-ShopifyHub/frontend/
cp visionmerch-ai-product-enrichment/tailwind.config.js ../FarSightIQ-ShopifyHub/frontend/
cp visionmerch-ai-product-enrichment/index.css ../FarSightIQ-ShopifyHub/frontend/
```

Then edit `../FarSightIQ-ShopifyHub/frontend/vite.config.ts` — change proxy target to port 3003:
```typescript
proxy: {
  '/api': {
    target: 'http://localhost:3003',  // Shopify Hub backend
    changeOrigin: true,
  }
}
```

Remove `GEMINI_API_KEY` define block — not needed for Shopify.

- [ ] **Step 3: Copy Shopify frontend files**

```bash
# Pages
cp visionmerch-ai-product-enrichment/pages/ShopifyHubPage.tsx ../FarSightIQ-ShopifyHub/frontend/pages/

# Components
cp -r visionmerch-ai-product-enrichment/components/shopify ../FarSightIQ-ShopifyHub/frontend/components/

# Shared UI (needed by Shopify components)
cp visionmerch-ai-product-enrichment/components/shared/UI.tsx ../FarSightIQ-ShopifyHub/frontend/components/shared/

# API config
cp visionmerch-ai-product-enrichment/src/api/config.ts ../FarSightIQ-ShopifyHub/frontend/src/api/
```

- [ ] **Step 4: Create Shopify Hub App.tsx**

Write `../FarSightIQ-ShopifyHub/frontend/App.tsx` — a standalone shell that renders ShopifyHubPage directly (no admin navigation needed):

```tsx
import React from 'react';
import { ShopifyHubPage } from './pages/ShopifyHubPage';

export default function App() {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="h-14 bg-white border-b border-gray-200 px-6 flex items-center">
        <h1 className="text-lg font-bold tracking-tight text-gray-900">
          FarsightIQ <span className="text-green-600">Shopify Hub</span>
        </h1>
      </header>
      <main className="flex-1">
        <ShopifyHubPage />
      </main>
    </div>
  );
}
```

- [ ] **Step 5: Create index.html and index.tsx**

Copy `index.html` and `index.tsx` from the core frontend. Update the `<title>` to "FarsightIQ Shopify Hub".

- [ ] **Step 6: Fix ShopifyHubPage imports**

ShopifyHubPage.tsx imports from `../src/api/config` and `../components/shared/UI`. After moving, these paths need updating to match the new directory structure. Fix the relative paths.

Also remove any imports of non-Shopify components (if ShopifyHubPage imports anything from core pages/components that weren't copied).

- [ ] **Step 7: Verify frontend builds**

```bash
cd ../FarSightIQ-ShopifyHub/frontend
npm install
npx tsc --noEmit
npm run build
```

Expected: Clean compile + successful Vite build

- [ ] **Step 8: Commit**

```bash
cd ../FarSightIQ-ShopifyHub
git add frontend/
git commit -m "feat: add Shopify Hub frontend with all components"
```

---

## Task 6: Create Shopify Hub Root Project

**Files:**
- Create: `../FarSightIQ-ShopifyHub/package.json`
- Create: `../FarSightIQ-ShopifyHub/.gitignore`
- Create: `../FarSightIQ-ShopifyHub/README.md`
- Create: `../FarSightIQ-ShopifyHub/for-dbas/scripts/V070__shopify_hub_read_model.sql`
- Move: Shopify DB scripts to `for-dbas/`

- [ ] **Step 1: Create root package.json**

Write `../FarSightIQ-ShopifyHub/package.json`:
```json
{
  "name": "farsightiq-shopify-hub",
  "version": "1.0.0",
  "description": "FarsightIQ Shopify Hub - E-Commerce Integration Platform",
  "author": "Musa Al-Salem",
  "license": "UNLICENSED",
  "private": true,
  "workspaces": ["backend", "frontend"],
  "scripts": {
    "dev": "concurrently \"npm run dev:backend\" \"npm run dev:frontend\"",
    "dev:backend": "cd backend && npm run dev",
    "dev:frontend": "cd frontend && npm run dev",
    "build": "npm run build:backend && npm run build:frontend",
    "build:backend": "cd backend && npm run build",
    "build:frontend": "cd frontend && npm run build",
    "start": "cd backend && npm start",
    "test": "cd backend && npm test",
    "clean": "rm -rf node_modules backend/node_modules frontend/node_modules backend/dist frontend/dist"
  },
  "devDependencies": {
    "concurrently": "^9.0.0"
  },
  "engines": {
    "node": ">=20.0.0"
  }
}
```

- [ ] **Step 2: Copy .gitignore**

```bash
cp .gitignore ../FarSightIQ-ShopifyHub/
```

- [ ] **Step 3: Create README.md**

Write `../FarSightIQ-ShopifyHub/README.md` with:
- project purpose
- dev ports (`3003` backend, `5174` frontend)
- required env vars
- startup commands
- note that Shopify Hub owns `SHOPIFY_*` tables and does not depend on Attribute Manager caches/packages

- [ ] **Step 4: Create Shopify Hub read-model DDL**

Write `../FarSightIQ-ShopifyHub/for-dbas/scripts/V070__shopify_hub_read_model.sql`.

This migration must create the Shopify-owned tables introduced by this split:
- `SHOPIFY_TENANTS`
- `SHOPIFY_PRODUCT_SNAPSHOT`
- `SHOPIFY_PUBLICATION_QUEUE`
- `SHOPIFY_INVENTORY_ALERTS`

Minimum requirements:
- primary keys and foreign keys where appropriate
- indexes for the main query paths used by `shopify.service.ts`
- audit columns (`CREATED_AT`, `UPDATED_AT`, optional `CREATED_BY`, `UPDATED_BY`)
- tenant scoping on all read-model tables
- idempotent guards or clear rerun behavior consistent with the existing migration style

Purpose of each table:
- `SHOPIFY_TENANTS`: Shopify-owned tenant registry and active tenant resolution
- `SHOPIFY_PRODUCT_SNAPSHOT`: denormalized product read model for Shopify UI queries and publishing
- `SHOPIFY_PUBLICATION_QUEUE`: Shopify publication intent/work queue replacing `STYLE_CHARACTERISTICS`
- `SHOPIFY_INVENTORY_ALERTS`: Shopify-owned persisted inventory alert state

- [ ] **Step 5: Move existing Shopify DB scripts**

```bash
cp for-dbas/scripts/V067__shopify_hub_objects.sql ../FarSightIQ-ShopifyHub/for-dbas/scripts/
cp for-dbas/scripts/V068__shopify_hub_synonyms.sql ../FarSightIQ-ShopifyHub/for-dbas/scripts/
cp for-dbas/scripts/V069__shopify_cross_schema_access.sql ../FarSightIQ-ShopifyHub/for-dbas/scripts/
cp for-dbas/scripts/check_shopify_access.sql ../FarSightIQ-ShopifyHub/for-dbas/scripts/
cp for-dbas/scripts/DBA_REQUEST_SHOPIFY_GRANTS.sql ../FarSightIQ-ShopifyHub/for-dbas/scripts/
cp for-dbas/scripts/run_shopify_grants.bat ../FarSightIQ-ShopifyHub/for-dbas/scripts/
cp backend/inspect_shopify.mjs ../FarSightIQ-ShopifyHub/backend/ 2>/dev/null || true
cp backend/import_shopify_taxonomy.mjs ../FarSightIQ-ShopifyHub/backend/ 2>/dev/null || true
```

- [ ] **Step 6: Full install and verify**

```bash
cd ../FarSightIQ-ShopifyHub
npm install
npm run build
```

Expected: Both backend and frontend build successfully

- [ ] **Step 7: Commit**

```bash
git add package.json .gitignore for-dbas/ README.md
git commit -m "feat: complete Shopify Hub project scaffold"
```

---

## Task 7: Clean Shopify from Attribute Manager

**Files:**
- Modify: `backend/src/routes/index.ts` — remove Shopify route mount
- Modify: `visionmerch-ai-product-enrichment/pages/AdminPage.tsx` — remove Shopify section
- Modify: `backend/src/services/llm/enriched-context.service.ts` — remove Shopify category enrichment
- Modify: `backend/src/services/llm/openai-provider.ts` — remove Shopify category fields
- Modify: `backend/src/services/llm/types.ts` — remove Shopify category types
- Modify: `backend/src/services/user-session.service.ts` — remove `shopify` session type
- Delete: `backend/src/routes/shopify.route.ts`
- Delete: `backend/src/services/shopify.service.ts`
- Delete: `backend/src/services/shopify-actions.service.ts`
- Delete: `backend/src/services/shopify-discounts.service.ts`
- Delete: `backend/src/services/shopify-media.service.ts`
- Delete: `backend/src/services/shopify-live-test.service.ts`
- Delete: `backend/src/prompts/shopify-mapping.ts`
- Delete: `visionmerch-ai-product-enrichment/pages/ShopifyHubPage.tsx`
- Delete: `visionmerch-ai-product-enrichment/components/shopify/` (entire directory)
- Delete: `for-dbas/scripts/V067-V069` Shopify SQL scripts
- Delete: `backend/inspect_shopify.mjs`, `backend/import_shopify_taxonomy.mjs`

- [ ] **Step 1: Remove Shopify route mount from routes/index.ts**

In `backend/src/routes/index.ts`:
- Remove line: `import shopifyRouter from './shopify.route.js';`
- Remove line: `router.use('/shopify', shopifyRouter);`

- [ ] **Step 2: Remove Shopify section from AdminPage.tsx**

In `visionmerch-ai-product-enrichment/pages/AdminPage.tsx`:
- Remove import: `import { ShopifyHubPage } from './ShopifyHubPage';`
- Remove the `'ecommerce-shopify'` entry from the navigation sections array
- Remove the conditional render: `{activeSection === 'ecommerce-shopify' && (<ShopifyHubPage />)}`

- [ ] **Step 3: Delete all Shopify backend files**

```bash
rm backend/src/routes/shopify.route.ts
rm backend/src/services/shopify.service.ts
rm backend/src/services/shopify-actions.service.ts
rm backend/src/services/shopify-discounts.service.ts
rm backend/src/services/shopify-media.service.ts
rm backend/src/services/shopify-live-test.service.ts
```

- [ ] **Step 4: Delete all Shopify frontend files**

```bash
rm visionmerch-ai-product-enrichment/pages/ShopifyHubPage.tsx
rm -rf visionmerch-ai-product-enrichment/components/shopify/
```

- [ ] **Step 5: Delete Shopify DB scripts from Attribute Manager**

```bash
rm for-dbas/scripts/V067__shopify_hub_objects.sql
rm for-dbas/scripts/V068__shopify_hub_synonyms.sql
rm for-dbas/scripts/V069__shopify_cross_schema_access.sql
rm for-dbas/scripts/check_shopify_access.sql
rm for-dbas/scripts/DBA_REQUEST_SHOPIFY_GRANTS.sql
rm for-dbas/scripts/run_shopify_grants.bat
rm backend/inspect_shopify.mjs 2>/dev/null || true
rm backend/import_shopify_taxonomy.mjs 2>/dev/null || true
```

- [ ] **Step 6: Remove remaining Shopify-specific AI/session references from Attribute Manager**

In Attribute Manager:
- remove Shopify category enrichment from `backend/src/services/llm/enriched-context.service.ts`
- remove `shopifyCategory` payload fields from `backend/src/services/llm/openai-provider.ts`
- remove Shopify-specific type fields from `backend/src/services/llm/types.ts`
- remove `'shopify'` from `backend/src/services/user-session.service.ts`

- [ ] **Step 7: Verify Attribute Manager still compiles and tests pass**

```bash
cd backend && npx tsc --noEmit
npm test
cd ../visionmerch-ai-product-enrichment && npx tsc --noEmit
npm run build
```

Expected: 0 type errors, tests pass, frontend builds

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "refactor: remove Shopify Hub code (moved to separate project)"
```

---

## Task 8: Final Verification — Both Projects Run Independently

- [ ] **Step 1: Start Attribute Manager**

```bash
cd FarSightIQ-master
npm run dev
```

Expected: Backend on :3002, Frontend on :5173. All core features work. No Shopify references in UI.

- [ ] **Step 2: Start Shopify Hub**

```bash
cd FarSightIQ-ShopifyHub
npm run dev
```

Expected: Backend on :3003, Frontend on :5174. Shopify Hub UI loads. Health check at `http://localhost:3003/api/health` returns OK.

- [ ] **Step 3: Verify no cross-dependencies**

```bash
# In Attribute Manager — no Shopify references should remain
rg -n "shopify|Shopify" backend/src visionmerch-ai-product-enrichment --glob '*.ts' --glob '*.tsx'
# Expected: 0 results
```

- [ ] **Step 4: Verify both build for production**

```bash
cd FarSightIQ-master && npm run build
cd ../FarSightIQ-ShopifyHub && npm run build
```

Expected: Both produce clean builds with no errors.

---

## Port / URL Summary

| Service | Dev Port | API Base | Frontend |
|---------|----------|----------|----------|
| Attribute Manager Backend | 3002 | http://localhost:3002/api | — |
| Attribute Manager Frontend | 5173 | proxies /api → :3002 | http://localhost:5173 |
| Shopify Hub Backend | 3003 | http://localhost:3003/api | — |
| Shopify Hub Frontend | 5174 | proxies /api → :3003 | http://localhost:5174 |

## Database Ownership

| Table Set | Owner Project |
|-----------|--------------|
| `ATTR_MGR.HIERARCHY_CACHE`, `CATALOG_CACHE_SHADOW`, `STAGING_*`, `AI_*`, `APP_ENVIRONMENTS`, `STYLE_CHARACTERISTICS` | Attribute Manager |
| `ATTR_MGR.SHOPIFY_TENANTS`, `SHOPIFY_PRODUCT_SNAPSHOT`, `SHOPIFY_PUBLICATION_QUEUE`, `SHOPIFY_CONFIG`, `SHOPIFY_SYNC_LOG`, `SHOPIFY_HIERARCHY_MAP`, `SHOPIFY_INVENTORY_ALERTS` | Shopify Hub |
| `MERCH.*`, `OMNI.*`, `VSTORE.*` (read-only views) | Shared Oracle (both read) |
