@echo off
chcp 65001 >nul
title MarketBoard Launcher
color 0A

cd /d "%~dp0"

echo ========================================================
echo          STARTING MARKETBOARD APPLICATION...
echo ========================================================
echo.

echo [1/3] Starting PostgreSQL and Redis (WSL Ubuntu, if installed)...
where wsl >nul 2>&1
if %ERRORLEVEL%==0 (
    wsl -u root service postgresql start >nul 2>&1
    wsl -u root sh -c "pkill redis-server 2>/dev/null; redis-server --bind 0.0.0.0 --protected-mode no --daemonize yes" >nul 2>&1
    for /f "tokens=1" %%i in ('wsl hostname -I 2^>nul') do set "WSL_IP=%%i"
    echo       WSL services started.
    if defined WSL_IP echo       WSL IP: %WSL_IP%
    timeout /t 2 /nobreak >nul
) else (
    echo       WSL not detected; assuming PostgreSQL and Redis are running locally.
)
echo.

echo [2/3] Starting Backend Server (FastAPI - Port 8000)...
if exist ".venv\Scripts\activate.bat" (
    start "MarketBoard - Backend (FastAPI)" cmd /k "cd /d %~dp0 && call .venv\Scripts\activate.bat && python -m uvicorn app:app --reload --host 0.0.0.0 --port 8000"
) else if exist "venv\Scripts\activate.bat" (
    start "MarketBoard - Backend (FastAPI)" cmd /k "cd /d %~dp0 && call venv\Scripts\activate.bat && python -m uvicorn app:app --reload --host 0.0.0.0 --port 8000"
) else (
    start "MarketBoard - Backend (FastAPI)" cmd /k "cd /d %~dp0 && python -m uvicorn app:app --reload --host 0.0.0.0 --port 8000"
)
echo       Backend started in a new terminal window.
echo.

echo [3/3] Opening Browser (http://127.0.0.1:8000/)...
timeout /t 4 /nobreak >nul
start http://127.0.0.1:8000/

echo.
echo ========================================================
echo   MarketBoard is running at http://127.0.0.1:8000/
echo   API Docs: http://127.0.0.1:8000/docs
echo   Run Stop_App.bat to stop all services.
echo ========================================================
timeout /t 3 >nul
exit
