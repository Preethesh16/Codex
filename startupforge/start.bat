@echo off
setlocal
title StartupForge Launcher
set "ROOT=%~dp0"

where node >nul 2>nul || (echo Node.js is required. & exit /b 1)
where npm >nul 2>nul || (echo npm is required. & exit /b 1)

if not exist "%ROOT%server\.env" (
  copy "%ROOT%server\.env.example" "%ROOT%server\.env" >nul
  echo Created server\.env. Add OPENAI_API_KEY before running Codex builds.
)

cd /d "%ROOT%server"
call npm install || exit /b 1
start "StartupForge Server" cmd /k "cd /d "%ROOT%server" && npm run dev"

cd /d "%ROOT%client"
call npm install || exit /b 1
start "StartupForge Client" cmd /k "cd /d "%ROOT%client" && npm run dev"

echo StartupForge is starting at http://localhost:5173
