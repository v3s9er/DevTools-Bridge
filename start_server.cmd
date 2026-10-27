@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 20 or newer is required on PATH.
  pause
  exit /b 1
)
node setup.mjs
if errorlevel 1 (
  echo Dependency setup failed.
  pause
  exit /b 1
)
node server.mjs
pause
