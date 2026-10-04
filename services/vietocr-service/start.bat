@echo off
title VietOCR Microservice (Port 8000)
echo ========================================================
echo   Starting VietOCR Microservice for AFL-Platform
echo   Endpoint: http://127.0.0.1:8000/predict
echo ========================================================
cd /d "%~dp0"
if not exist ".venv\Scripts\python.exe" (
    echo [ERROR] Virtual environment not found. Please set up .venv first.
    pause
    exit /b 1
)
.venv\Scripts\python.exe -m uvicorn app:app --host 127.0.0.1 --port 8000
set "serviceExitCode=%ERRORLEVEL%"
pause
exit /b %serviceExitCode%
