@echo off
REM ============================================================
REM  Smart Inspection Report - run script (Windows)
REM  Starts backend (3000) and frontend (5173) in separate windows
REM ============================================================

cd /d "%~dp0"

echo.
echo  [Smart Inspection Report] starting backend + frontend
echo  ----------------------------------------------------------

if not exist "backend\node_modules" goto need_setup
if not exist "frontend\node_modules" goto need_setup
if not exist "backend\app.db" goto need_setup

REM A stale node process holding port 3000 would serve old data
echo  stopping old node processes...
taskkill /F /IM node.exe >nul 2>&1
timeout /t 1 /nobreak >nul

echo  starting BACKEND window...   http://localhost:3000
start "BACKEND (3000)" /d "%~dp0backend" cmd /k npm run dev

echo  starting FRONTEND window...  http://localhost:5173
start "FRONTEND (5173)" /d "%~dp0frontend" cmd /k npm run dev

echo.
echo  Two windows opened. Open http://localhost:5173 in your browser.
echo  (You can close this window.)
echo.
pause
exit /b 0

:need_setup
echo.
echo  [!] First-time setup required. Run these first:
echo.
echo      cd backend
echo      npm install
echo      copy .env.example .env
echo      npm run db:init
echo      cd ..\frontend
echo      npm install
echo.
echo  See the run guide (sil-haeng-bang-beob.md) for details.
echo.
pause
exit /b 1
