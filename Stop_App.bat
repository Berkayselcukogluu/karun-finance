@echo off
chcp 65001 >nul
title MarketBoard Shutdown
color 0C

echo ========================================================
echo          STOPPING MARKETBOARD APPLICATION...
echo ========================================================
echo.

echo [1/3] Stopping Backend and Frontend Processes...
taskkill /FI "WindowTitle eq MarketBoard - Backend (FastAPI)*" /T /F >nul 2>&1
taskkill /FI "WindowTitle eq MarketBoard - Frontend (Vite)*" /T /F >nul 2>&1

for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":8000" ^| findstr "LISTENING"') do taskkill /F /PID %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":5173" ^| findstr "LISTENING"') do taskkill /F /PID %%a >nul 2>&1
echo       Servers stopped.
echo.

echo [2/3] Stopping WSL Ubuntu Services (PostgreSQL and Redis)...
where wsl >nul 2>&1
if %ERRORLEVEL%==0 (
    wsl -u root pkill redis-server >nul 2>&1
    wsl -u root service postgresql stop >nul 2>&1
    echo       WSL services stopped.
) else (
    echo       WSL not detected; skipping WSL service stop.
)
echo.

echo [3/3] Cleanup Complete!
echo ========================================================
echo      ALL SERVICES HAVE BEEN SAFELY TERMINATED.
echo ========================================================
timeout /t 3 >nul
exit
