Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "  Starting VietOCR Microservice for AFL-Platform" -ForegroundColor Green
Write-Host "  Endpoint: http://localhost:8000/predict" -ForegroundColor Yellow
Write-Host "========================================================" -ForegroundColor Cyan

$serviceDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$pythonExe = Join-Path $serviceDir ".venv\Scripts\python.exe"

if (-not (Test-Path $pythonExe)) {
    Write-Error "Virtual environment python.exe not found at $pythonExe"
    exit 1
}

& $pythonExe -m uvicorn app:app --app-dir $serviceDir --host 0.0.0.0 --port 8000 --reload
