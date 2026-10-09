$ErrorActionPreference = 'Stop'
$serviceDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$pythonExe = Join-Path $serviceDir '.venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $pythonExe)) {
    python -m venv (Join-Path $serviceDir '.venv')
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

& $pythonExe -m pip install 'torch==2.6.0' 'torchvision==0.21.0' --index-url https://download.pytorch.org/whl/cpu
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
& $pythonExe -m pip install -r (Join-Path $serviceDir 'requirements.txt')
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
& $pythonExe -c "import torch, torchvision, cv2; from vietocr.tool.predictor import Predictor; print('VietOCR runtime imports OK')"
if ($LASTEXITCODE -ne 0) {
    Write-Error 'VietOCR runtime cannot load. Check Code Integrity if WinError 4551 is reported. No Windows policy was changed.'
    exit $LASTEXITCODE
}

$cacheDir = Join-Path $serviceDir '.cache'
New-Item -ItemType Directory -Path $cacheDir -Force | Out-Null
$weightsPath = Join-Path $cacheDir 'vgg_transformer.pth'
$existingWeights = Join-Path ([System.IO.Path]::GetTempPath()) 'vgg_transformer.pth'
if (-not (Test-Path -LiteralPath $weightsPath)) {
    if (Test-Path -LiteralPath $existingWeights) {
        Copy-Item -LiteralPath $existingWeights -Destination $weightsPath
    } else {
        $partialPath = Join-Path $cacheDir 'vgg_transformer.pth.partial'
        Invoke-WebRequest -Uri 'https://vocr.vn/data/vietocr/vgg_transformer.pth' -OutFile $partialPath -TimeoutSec 300
        Move-Item -LiteralPath $partialPath -Destination $weightsPath
    }
}
Write-Host 'Dependencies and local model weights are ready. Start with npm run dev:all.'
