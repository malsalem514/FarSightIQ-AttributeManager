# ==============================================================================
# FarsightIQ Attribute Manager - Development Startup Script
# ==============================================================================
# Usage: .\start-dev.ps1
#        .\start-dev.ps1 -Backend   # Backend only
#        .\start-dev.ps1 -Frontend  # Frontend only
# ==============================================================================

param(
    [switch]$Backend,
    [switch]$Frontend,
    [switch]$Kill  # Kill existing processes
)

$ErrorActionPreference = "Stop"
$host.UI.RawUI.WindowTitle = "FarsightIQ Dev"

Write-Host ""
Write-Host "╔══════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║         FarsightIQ Attribute Manager - Dev Server            ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# Kill existing processes if requested
if ($Kill) {
    Write-Host "[*] Killing existing Node processes on ports 3002, 5173-5175..." -ForegroundColor Yellow
    
    # Kill processes on backend port
    $backendPids = netstat -ano | Select-String ":3002.*LISTENING" | ForEach-Object {
        ($_ -split "\s+")[-1]
    } | Select-Object -Unique
    
    foreach ($pid in $backendPids) {
        if ($pid -match "^\d+$") {
            taskkill /PID $pid /F 2>$null
            Write-Host "    Killed PID $pid (port 3002)" -ForegroundColor Gray
        }
    }
    
    # Kill processes on frontend ports
    foreach ($port in @(5173, 5174, 5175)) {
        $pids = netstat -ano | Select-String ":$port.*LISTENING" | ForEach-Object {
            ($_ -split "\s+")[-1]
        } | Select-Object -Unique
        
        foreach ($pid in $pids) {
            if ($pid -match "^\d+$") {
                taskkill /PID $pid /F 2>$null
                Write-Host "    Killed PID $pid (port $port)" -ForegroundColor Gray
            }
        }
    }
    
    Start-Sleep -Seconds 1
}

# Check for .env files
$backendEnvExists = Test-Path "backend\.env"
$frontendEnvExists = Test-Path "visionmerch-ai-product-enrichment\.env"

if (-not $backendEnvExists) {
    Write-Host "[!] Missing backend\.env - creating from template..." -ForegroundColor Yellow
    if (Test-Path "backend\.env.template") {
        Copy-Item "backend\.env.template" "backend\.env"
        Write-Host "    Created backend\.env - PLEASE EDIT WITH YOUR CREDENTIALS" -ForegroundColor Red
    } else {
        Write-Host "    ERROR: No template found. Create backend\.env manually." -ForegroundColor Red
        exit 1
    }
}

if (-not $frontendEnvExists) {
    Write-Host "[!] Missing frontend .env - creating from template..." -ForegroundColor Yellow
    if (Test-Path "visionmerch-ai-product-enrichment\.env.template") {
        Copy-Item "visionmerch-ai-product-enrichment\.env.template" "visionmerch-ai-product-enrichment\.env"
        Write-Host "    Created frontend .env" -ForegroundColor Green
    }
}

# Determine what to start
$startBackend = $true
$startFrontend = $true

if ($Backend -and -not $Frontend) {
    $startFrontend = $false
}
if ($Frontend -and -not $Backend) {
    $startBackend = $false
}

# Start services
if ($startBackend) {
    Write-Host ""
    Write-Host "[>] Starting Backend (port 3002)..." -ForegroundColor Green
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PWD\backend'; npm run dev" -WindowStyle Normal
}

if ($startFrontend) {
    Write-Host "[>] Starting Frontend (port 5173)..." -ForegroundColor Green
    Start-Sleep -Seconds 2  # Give backend a head start
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PWD\visionmerch-ai-product-enrichment'; npm run dev" -WindowStyle Normal
}

Write-Host ""
Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  Services starting in new windows..." -ForegroundColor White
Write-Host ""
Write-Host "  Frontend:  http://localhost:5173" -ForegroundColor White
Write-Host "  Backend:   http://localhost:3002" -ForegroundColor White
Write-Host "  Settings:  Password is 'nrf2026'" -ForegroundColor Gray
Write-Host ""
Write-Host "  To stop: Close the terminal windows or run:" -ForegroundColor Gray
Write-Host "           .\start-dev.ps1 -Kill" -ForegroundColor Gray
Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Cyan
