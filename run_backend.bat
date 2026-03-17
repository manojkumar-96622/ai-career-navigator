@echo off
title Gemini Backend Server
echo Starting Gemini Backend...
call venv\Scripts\activate

echo.
echo Cleaning up Port 8080...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :8080') do taskkill /f /pid %%a >nul 2>&1

echo Launching Uvicorn Server (Production Mode)...
python -m uvicorn app_backend:app --host 0.0.0.0 --port 8080 --no-access-log --workers 1

if %errorlevel% neq 0 (
    echo [ERROR] Backend crashed with error code %errorlevel%.
    echo Please screen capture this error.
    pause
    exit /b %errorlevel%
)
pause
