@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Please install Node.js 18 or newer, then run this file again.
  pause
  exit /b 1
)
echo Open http://localhost:5173/ in your browser after the server starts.
node server.mjs
pause
