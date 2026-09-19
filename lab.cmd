@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Install Node.js 24 and Docker Desktop first. See Day 0.
  pause
  exit /b 1
)
node scripts/lab/index.mjs
pause
