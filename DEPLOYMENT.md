# 🚀 FarsightIQ Attribute Manager - Deployment Guide

Quick and robust setup for deployment teams.

---

## ⚡ 5-Minute Quick Start

```powershell
# 1. Clone repository
git clone <repo-url>
cd Attrinute-Center

# 2. Copy environment templates
copy backend\.env.template backend\.env
copy visionmerch-ai-product-enrichment\.env.template visionmerch-ai-product-enrichment\.env

# 3. Edit .env files with your values (see sections below)

# 4. Install dependencies
npm install

# 5. Start development
npm run dev
```

---

## 📋 Prerequisites Checklist

| Requirement | Version | How to Verify |
|-------------|---------|---------------|
| Node.js | 20+ LTS | `node --version` |
| npm | 10+ | `npm --version` |
| Oracle Instant Client | 19c+ | Check install path |
| Oracle Database | 19c+ / 23ai | DBA provides connection string |
| OpenAI API Key | - | Get from https://platform.openai.com |

### Installing Oracle Instant Client (Windows)

1. Download from [Oracle Downloads](https://www.oracle.com/database/technologies/instant-client/winx64-64-downloads.html)
2. Extract to `C:\oracle\instantclient_19_23` (or your preferred path)
3. Add to system PATH
4. Note the path for `ORACLE_CLIENT_PATH` in `.env`

---

## 🔧 Configuration

### Backend Configuration (`backend/.env`)

Create from template and fill in values:

```env
# ═══════════════════════════════════════════════════════════════════
# SERVER CONFIGURATION
# ═══════════════════════════════════════════════════════════════════
PORT=3002                          # API server port
NODE_ENV=production                # production | development

# ═══════════════════════════════════════════════════════════════════
# DATABASE CONNECTION (Required)
# ═══════════════════════════════════════════════════════════════════
ORACLE_USER=attr_mgr               # Schema username
ORACLE_PASSWORD=YourPasswordHere   # Schema password
ORACLE_CONNECT_STRING=hostname:1521/servicename  # TNS connect string

# Windows only - path to Oracle Instant Client
ORACLE_CLIENT_PATH=C:\oracle\instantclient_19_23

# ═══════════════════════════════════════════════════════════════════
# AI/LLM CONFIGURATION (Required)
# ═══════════════════════════════════════════════════════════════════
OPENAI_API_KEY=sk-your-key-here    # Get from platform.openai.com
OPENAI_MODEL=gpt-4o                # Recommended: gpt-4o (fast, reliable)

# ═══════════════════════════════════════════════════════════════════
# SECURITY
# ═══════════════════════════════════════════════════════════════════
# Comma-separated allowed origins for CORS
CORS_ORIGINS=http://localhost:5173,http://localhost:5174,http://localhost:5175

# Read-only mode (set to 'true' to prevent database writes)
READ_ONLY_MODE=false
```

### Frontend Configuration (`visionmerch-ai-product-enrichment/.env`)

```env
# Backend API URL - adjust for production
VITE_API_URL=http://localhost:3002/api
```

---

## 🗄️ Database Setup

### Option A: Quick Setup (Demo/Dev)

Run the onboarding tables script as ATTR_MGR user:

```sql
@database/quick-setup/setup-onboarding-tables.sql
```

### Option B: Full Schema Migration

Apply all migrations in order:

```bash
cd database/standalone
sqlplus attr_mgr/password@//host:1521/service

-- Run in order:
@V001__attr_mgr_standalone.sql
@V002__...
-- Continue through all V0XX files
```

### Required Tables

The application needs these core tables:

| Table | Purpose |
|-------|---------|
| `STAGING_STYLES` | New product drafts |
| `STAGING_IMAGES` | Image BLOB storage |
| `ONBOARDING_BATCHES` | Bulk upload tracking |
| `AI_BATCH_PROGRESS` | AI enrichment progress |
| `USER_SESSION_STATE` | User session persistence |

---

## 🏃 Running the Application

### Development Mode

```powershell
# From project root - starts both frontend and backend
npm run dev

# Or run separately:
# Terminal 1
cd backend
npm run dev

# Terminal 2
cd visionmerch-ai-product-enrichment
npm run dev
```

### Production Mode

```powershell
# Build both packages
npm run build

# Start backend
cd backend
$env:NODE_ENV="production"
npm start

# Serve frontend (use any static file server)
# The built files are in: visionmerch-ai-product-enrichment/dist/
```

### Using PM2 (Recommended for Production)

```bash
# Install PM2
npm install -g pm2

# Start backend
cd backend
pm2 start dist/index.js --name "farsightiq-api"

# Monitor
pm2 logs farsightiq-api
```

---

## 🌐 Production Deployment

### Nginx Configuration (Reverse Proxy)

```nginx
server {
    listen 80;
    server_name your-domain.com;

    # Frontend static files
    location / {
        root /path/to/visionmerch-ai-product-enrichment/dist;
        try_files $uri $uri/ /index.html;
    }

    # API proxy
    location /api {
        proxy_pass http://localhost:3002;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### IIS Configuration (Windows)

1. Create website pointing to `visionmerch-ai-product-enrichment/dist`
2. Add URL Rewrite rule for SPA routing
3. Configure reverse proxy to backend on port 3002

---

## ✅ Verification Steps

### 1. Check Backend Health

```bash
curl http://localhost:3002/api/health
# Expected: {"status":"ok","timestamp":"..."}
```

### 2. Check Database Connection

```bash
curl http://localhost:3002/api/dashboard/pulse
# Expected: {"total":...,"funnel":{...}}
```

### 3. Check AI Connection

Settings → LLM Configuration → Test Model button

### 4. Access Frontend

Open http://localhost:5173 in browser

---

## 🔒 Security Notes

- **Admin Password**: Settings console requires password `nrf2026` (hardcoded for demo)
- **API Keys**: Never commit `.env` files with real credentials
- **CORS**: Restrict `CORS_ORIGINS` to actual frontend URLs in production
- **Read-Only Mode**: Set `READ_ONLY_MODE=true` to prevent accidental data changes

---

## 🐛 Troubleshooting

### "ORA-12541: TNS:no listener"
- Verify Oracle service is running
- Check `ORACLE_CONNECT_STRING` format: `hostname:port/service`

### "DPI-1047: Cannot locate Oracle Client library"
- Install Oracle Instant Client
- Set `ORACLE_CLIENT_PATH` to installation directory
- Restart terminal/IDE after setting

### "CORS blocked"
- Add frontend URL to `CORS_ORIGINS` in backend `.env`
- Multiple origins: `CORS_ORIGINS=http://localhost:5173,http://localhost:5174`

### "EADDRINUSE: address already in use"
- Port 3002 is taken. Kill existing process:
  ```powershell
  # Windows
  netstat -ano | findstr :3002
  taskkill /PID <pid> /F
  ```

### Frontend shows "Connection Failed"
- Verify backend is running on correct port
- Check `VITE_API_URL` matches backend URL
- Check browser console for CORS errors

---

## 📁 Project Structure

```
Attrinute-Center/
├── backend/                    # Node.js Express API
│   ├── src/
│   │   ├── routes/            # API endpoints
│   │   ├── services/          # Business logic
│   │   │   ├── llm/           # OpenAI/Gemini providers
│   │   │   └── onboarding.service.ts
│   │   └── prompts/           # AI prompt templates
│   ├── .env                   # ⚠️ Your local config (gitignored)
│   └── .env.template          # Template to copy
│
├── visionmerch-ai-product-enrichment/  # React Frontend
│   ├── pages/                 # Main views
│   ├── components/            # Reusable UI
│   ├── src/api/               # API client
│   ├── .env                   # ⚠️ Your local config (gitignored)
│   └── .env.template          # Template to copy
│
├── database/
│   ├── quick-setup/           # Demo setup scripts
│   └── standalone/            # Full migration files
│
└── DEPLOYMENT.md              # This file
```

---

## 📞 Support

- Architecture: See `ATTRIBUTE-MANAGER-ARCHITECTURE-SPEC.md`
- API Reference: See `README.md`

---

*Last updated: January 2026 | Version 9.3.x*
