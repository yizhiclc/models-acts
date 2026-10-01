@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Please install Node.js from https://nodejs.org/ first.
  pause
  exit /b 1
)
if not exist "node_modules\vite" (
  call npm.cmd ci
  if errorlevel 1 (
    pause
    exit /b 1
  )
)
echo Open the Local URL printed below in your browser.
call npm.cmd run dev
