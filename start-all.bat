@echo off
title AFL-Platform Unified System Launcher
cd /d "%~dp0"
echo ========================================================
echo   Starting AFL-Platform All-in-One Launcher
echo ========================================================
node scripts/start-all.mjs
pause
