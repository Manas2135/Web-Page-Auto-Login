@echo off
title WIFI-GOD-MODE v3.0
color 0A

:: ── Check Node.js is installed ──────────────────────────────
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed or not in your PATH.
    echo Download it from: https://nodejs.org
    pause
    exit /b 1
)

:: ── Move to script folder (Edit)────────────────────────────────────
cd /d "C:\Users\Manas Shekhar Tiwari\Documents\WIFI" 

:: ── Install dependencies if missing ─────────────────────────
if not exist "node_modules" (
    echo [SETUP] node_modules not found — installing dependencies...
    npm install
    echo.
)

:: ── Auto-restart loop ────────────────────────────────────────
:start
cls
echo ============================================
echo    WIFI-GOD-MODE  --  Auto Login Active
echo    Press Ctrl+C to stop
echo ============================================
echo.
node index.js
echo.
echo [!] Script stopped or crashed. Restarting in 5 seconds...
echo     (Press Ctrl+C now to exit)
timeout /t 5 /nobreak >nul
goto start
