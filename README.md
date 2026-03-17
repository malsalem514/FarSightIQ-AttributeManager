# FarsightIQ Attribute Manager

**AI-Powered Product Enrichment Platform** for retail merchandising teams.

Version: 9.4.0 | [Deployment Guide](./DEPLOYMENT.md)

---

## Overview

FarsightIQ Attribute Manager enables retail teams to:

- 🤖 **AI Enrichment**: Extract product attributes from images using GPT-4o/Gemini
- 📦 **New Product Onboarding**: Upload images → AI classifies hierarchy → Review & approve
- 📊 **Bulk Management**: Power Sheet for rapid review of 50+ styles at once
- 🔗 **ERP Sync**: Push enriched data to Oracle MerchPlus via IRI staging tables
- 📋 **Hierarchy Rules**: Define mandatory attributes per Dept/Class/Subclass

---

## Quick Start

### Prerequisites

- **Node.js** 20+ (LTS recommended)
- **Oracle Instant Client** 19c+ (for oracledb thick mode)
- **Oracle Database** with ATTR_MGR schema deployed
- **OpenAI API Key** (or Gemini API key)

### 1. Clone & Install

```bash
git clone <repository-url>
cd Attrinute-Center

# Install all dependencies (root + workspaces)
npm install
```

### 2. Configure Environment

**Backend** (`backend/.env`):
```env
# Server
PORT=3002
NODE_ENV=production

# Oracle Database
ORACLE_USER=attr_mgr
ORACLE_PASSWORD=<your-password>
ORACLE_CONNECT_STRING=<host>:1521/<service>
ORACLE_CLIENT_PATH=C:\oracle\instantclient_19_23

# OpenAI (Primary LLM)
OPENAI_API_KEY=sk-...

# CORS (adjust for production)
CORS_ORIGINS=http://localhost:5173
```

**Frontend** (`visionmerch-ai-product-enrichment/.env`):
```env
VITE_API_URL=http://localhost:3002/api
```

### 3. Run Development

```bash
# Terminal 1: Backend
cd backend && npm run dev

# Terminal 2: Frontend
cd visionmerch-ai-product-enrichment && npm run dev
```

Or use the root script:
```bash
npm run dev  # Runs both concurrently
```

### 4. Access Application

- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:3002

---

## Production Deployment

### Build

```bash
# Build both packages
npm run build

# Output:
# - backend/dist/        (compiled TypeScript)
# - visionmerch.../dist/ (static frontend assets)
```

### Deploy Backend

```bash
cd backend
NODE_ENV=production npm start
```

**Process Manager (recommended):**
```bash
pm2 start dist/index.js --name "farsightiq-backend"
```

### Deploy Frontend

Serve the `visionmerch-ai-product-enrichment/dist/` folder with any static file server:

```bash
# Nginx example
server {
    listen 80;
    root /path/to/dist;
    
    location / {
        try_files $uri $uri/ /index.html;
    }
    
    location /api {
        proxy_pass http://localhost:3002;
    }
}
```

### Database Setup

Apply migrations from `database/standalone/`:
```bash
sqlplus attr_mgr/password@//host:1521/service @database/standalone/V001__attr_mgr_standalone.sql
# ... continue with V002, V003, etc.
```

---

## Project Structure

```
Attrinute-Center/
├── backend/                              # Express.js API (Node.js 20+)
│   ├── src/
│   │   ├── routes/                       # REST endpoints
│   │   ├── services/                     # Business logic
│   │   │   ├── onboarding.service.ts     # New product upload & AI discovery
│   │   │   ├── attributes.service.ts     # AI enrichment orchestration
│   │   │   ├── products.service.ts       # Catalog queries
│   │   │   └── llm/                      # OpenAI/Gemini providers
│   │   ├── prompts/                      # AI prompt templates
│   │   └── middleware/                   # Rate limiting, error handling
│   └── package.json
│
├── visionmerch-ai-product-enrichment/    # React 19 Frontend
│   ├── pages/                            # Main views
│   │   ├── DashboardPage.tsx             # Wizard-style entry point
│   │   ├── CatalogFactoryPage.tsx        # Product review grid
│   │   └── AdminPage.tsx                 # Admin console
│   ├── components/
│   │   ├── onboarding/                   # Bulk upload, drafts manager
│   │   └── review/                       # Power Sheet, Style Drawer
│   └── package.json
│
├── database/                             # Oracle schema migrations
│   └── standalone/                       # V001 → V065+ SQL files
│
└── docs/                                 # Additional documentation
```

---

## Key Features

### 1. Dashboard (Wizard-Style)
Pre-flight checks and workflow phase selection with department tiles showing status breakdown.

### 2. Catalog Factory
High-scale review grid with:
- Smart filters (Dept/Class/Subclass)
- Bulk "Enrich with AI" action
- Purple row highlighting for AI-pending approval
- Context banner showing active filters

### 3. Power Sheet
Excel-like bulk review with dynamic AI attribute columns.

### 4. New Product Onboarding
- Upload single images, folders, or ZIP files
- AI classifies into retailer's hierarchy
- Edit drafts with cascading dropdowns
- Delete unwanted drafts

### 5. Admin Console
- AI Activity logs with request/response details
- LLM provider configuration
- Batch progress monitoring
- System health metrics

---

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /api/products` | Product catalog with filtering |
| `POST /api/products/onboard/bulk` | Upload images for new products |
| `GET /api/products/drafts` | List new product drafts |
| `PUT /api/products/draft/:id` | Update draft hierarchy |
| `DELETE /api/products/draft/:id` | Delete draft |
| `POST /api/attributes/extract/batch` | Batch AI enrichment |
| `GET /api/attributes/compare/bulk` | 3-way attribute comparison |
| `GET /api/dashboard/pulse` | Dashboard metrics |
| `GET /api/hierarchy` | Full hierarchy tree |

---

## Technology Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Frontend | React | 19.x |
| Styling | Tailwind CSS | 4.x |
| Icons | Lucide React | 0.562 |
| Backend | Node.js + Express | 22.x / 4.x |
| Database | Oracle | 19c+ |
| AI | OpenAI GPT-4o-mini | Latest |
| Alt AI | Google Gemini | 1.5 Flash |

---

## Environment Variables Reference

### Backend

| Variable | Required | Description |
|----------|----------|-------------|
| `ORACLE_USER` | Yes | Oracle schema username |
| `ORACLE_PASSWORD` | Yes | Oracle schema password |
| `ORACLE_CONNECT_STRING` | Yes | TNS connect string |
| `ORACLE_CLIENT_PATH` | Yes* | Path to Instant Client (*Windows) |
| `OPENAI_API_KEY` | Yes | OpenAI API key |
| `PORT` | No | Server port (default: 3002) |
| `NODE_ENV` | No | Environment (development/production) |
| `CORS_ORIGINS` | No | Allowed origins (default: *) |

### Frontend

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_API_URL` | Yes | Backend API base URL |

---

## Troubleshooting

### Oracle Connection Issues

1. Verify Oracle Instant Client is installed and `ORACLE_CLIENT_PATH` is set
2. Check TNS connectivity: `tnsping <connect_string>`
3. Verify ATTR_MGR schema exists with proper grants

### AI Enrichment Errors

1. Check OpenAI API key validity
2. Verify rate limits (default: 200 requests/min in dev)
3. Check Admin Console → AI Activity for detailed error logs

### Frontend Build Issues

1. Clear node_modules: `npm run clean`
2. Reinstall: `npm install`
3. Verify Node.js version: `node --version` (needs 20+)

---

## License

Proprietary - Client Delivery

© 2026 FarsightIQ
