# AI Privacy Pipeline - Hackathon Demo
# Kullanim: .\demo.ps1 [STREET_VIEW_API_KEY]
#
# API key olmadan (offline demo):
#   .\demo.ps1
#
# Gercek Street View ile:
#   .\demo.ps1 YOUR_GOOGLE_API_KEY
#
# Veya .env dosyasindan:
#   $env:STREET_VIEW_API_KEY = "YOUR_KEY"; .\demo.ps1

param(
    [string]$ApiKey = $env:STREET_VIEW_API_KEY
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Python = (Get-Command python -ErrorAction SilentlyContinue)?.Source

# Python executable bul
if (-not $Python) {
    $Python = "C:\Users\ASUS\AppData\Local\Programs\Python\Python314\python.exe"
}
if (-not (Test-Path $Python)) {
    Write-Error "Python bulunamadi. PATH'e ekleyin veya scripti duzenleyin."
    exit 1
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  AI Privacy Pipeline - Hackathon Demo  " -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

Set-Location $ScriptDir

# ── Adim 1: Demo video olustur ────────────────────────────────────────────────
Write-Host "[1/4] Sentetik demo video olusturuluyor..." -ForegroundColor Yellow
& $Python scripts\create_demo_video.py --output data\input\hackathon_demo.mp4 --seconds 5 --fps 10
if ($LASTEXITCODE -ne 0) { Write-Error "Demo video olusturulamadi."; exit 1 }
Write-Host "      OK: data\input\hackathon_demo.mp4" -ForegroundColor Green

# ── Adim 2: Pipeline (anonymize + detect + dedupe) ────────────────────────────
Write-Host ""
Write-Host "[2/4] Pipeline calistiriliyor (anonymize -> detect -> dedupe)..." -ForegroundColor Yellow

$PipelineArgs = @(
    "scripts\run_pipeline.py",
    "--input", "data\input\hackathon_demo.mp4",
    "--lat", "41.0430",
    "--lng", "29.0057",
    "--demo-fallback",
    "--output-dir", "output",
    "--report-dir", "reports"
)

if ($ApiKey) {
    Write-Host "      Mod: Street View API (gercek veri)" -ForegroundColor Cyan
    $PipelineArgs = @(
        "scripts\streetview_pipeline.py",
        "--lat", "41.0430",
        "--lng", "29.0057",
        "--api-key", $ApiKey,
        "--demo-fallback",
        "--output-dir", "output",
        "--report-dir", "reports"
    )
}

& $Python @PipelineArgs
if ($LASTEXITCODE -ne 0) { Write-Error "Pipeline basarisiz."; exit 1 }

Write-Host "      OK: output\detections.json" -ForegroundColor Green
Write-Host "      OK: output\anonymized_demo.mp4" -ForegroundColor Green
Write-Host "      OK: reports\pipeline_report.json" -ForegroundColor Green

# ── Adim 3: JSON ozeti goster ─────────────────────────────────────────────────
Write-Host ""
Write-Host "[3/4] Tespit sonuclari:" -ForegroundColor Yellow
$Detections = Get-Content "output\detections.json" -Raw | ConvertFrom-Json
Write-Host "      Toplam tespit: $($Detections.Count)" -ForegroundColor Green
$Detections | ForEach-Object {
    Write-Host ("      - {0} @ ({1}, {2})  conf={3}  t={4}" -f `
        $_.type, $_.latitude, $_.longitude, $_.confidence, $_.timestamp) -ForegroundColor White
}

# ── Adim 4: HTTP API sunucusunu baslat ───────────────────────────────────────
Write-Host ""
Write-Host "[4/4] HTTP API sunucusu baslatiliyor..." -ForegroundColor Yellow
Write-Host "      Go backend su adresleri kullanabilir:" -ForegroundColor Cyan
Write-Host "        GET  http://localhost:8000/api/detections" -ForegroundColor White
Write-Host "        POST http://localhost:8000/api/scan" -ForegroundColor White
Write-Host "        GET  http://localhost:8000/health" -ForegroundColor White
Write-Host ""
Write-Host "      Durdurmak icin Ctrl+C" -ForegroundColor Gray
Write-Host ""

& $Python scripts\serve.py --port 8000
