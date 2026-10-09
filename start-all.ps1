# AFL-Platform Unified System Launcher for PowerShell
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptDir

Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "  Starting AFL-Platform All-in-One Launcher" -ForegroundColor Green
Write-Host "========================================================" -ForegroundColor Cyan

node scripts/start-all.mjs
