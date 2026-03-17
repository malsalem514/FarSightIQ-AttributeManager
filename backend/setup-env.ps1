# Setup .env file for Attribute Manager Backend
# Run this script once to configure the environment

$envContent = @"
# ============================================================
# VisionMerch Attribute Manager - Backend Configuration
# ============================================================

# ============================================================
# Server Configuration
# ============================================================
PORT=3002
NODE_ENV=development

# ============================================================
# Oracle Database (REQUIRED)
# ============================================================
ORACLE_USER=attr_mgr
ORACLE_PASSWORD=Dora*2024
ORACLE_CONNECT_STRING=10.100.100.45:1521/DEMODB
ORACLE_CLIENT_PATH=

# Oracle Connection Pool Settings
ORACLE_POOL_MIN=2
ORACLE_POOL_MAX=10
ORACLE_QUEUE_MAX=500

# ============================================================
# LLM Provider Configuration
# ============================================================
# Choose LLM provider: "openai" or "gemini"
LLM_PROVIDER=openai

# ------------------------------------------------------------
# OpenAI Configuration
# ------------------------------------------------------------
OPENAI_API_KEY=sk-CHANGE_ME
OPENAI_MODEL=gpt-4o-mini
OPENAI_TEMPERATURE=0.2

# ------------------------------------------------------------
# LLM Cache Configuration
# ------------------------------------------------------------
LLM_CACHE_ENABLED=true
LLM_CACHE_TTL_SECONDS=2592000  # 30 days

# ============================================================
# CORS Configuration
# ============================================================
CORS_ORIGINS=http://localhost:5173

# ============================================================
# Rate Limiting
# ============================================================
RATE_LIMIT_WINDOW_MS=900000    # 15 minutes
RATE_LIMIT_MAX=1000            # Max requests per window
"@

# Write to .env file
$envContent | Out-File -FilePath ".env" -Encoding UTF8 -NoNewline

Write-Host "✅ .env file created successfully!" -ForegroundColor Green
Write-Host ""
Write-Host "Configuration:" -ForegroundColor Cyan
Write-Host "  - LLM Provider: OpenAI (gpt-4o-mini)" -ForegroundColor Yellow
Write-Host "  - Oracle: 10.100.100.45:1521/DEMODB" -ForegroundColor Yellow
Write-Host "  - Port: 3002" -ForegroundColor Yellow
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "  1. npm run dev" -ForegroundColor Yellow
Write-Host "  2. Test: http://localhost:3002/api/health" -ForegroundColor Yellow

