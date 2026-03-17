@echo off
title Gemini App Launcher
echo ===================================================
echo   Starting Gemini Clone (Backend + Frontend)
echo ===================================================

:: 0. Pre-flight Check
echo Running Environment Check...
call venv\Scripts\activate
python check_env.py
if %errorlevel% neq 0 (
    echo [ERROR] Environment check failed. Fix issues above.
    pause
    exit /b
)

:: 1. Start Backend
echo Starting Python Backend (Port 8080)...
start "Gemini Backend" run_backend.bat

:: 2. Wait for Backend
echo Waiting for backend to initialize...
timeout /t 5

:: 3. Run Diagnostics
python diag.py
echo.

:: 4. Choose Frontend
echo Select Frontend to Launch:
echo [1] Streamlit (app.py)
echo [2] Next.js (frontend/)
echo [3] Both
echo [4] None (Backend Only)
set /p choice="Enter choice (1-4): "

if "%choice%"=="1" goto START_STREAMLIT
if "%choice%"=="2" goto START_NEXTJS
if "%choice%"=="3" goto START_BOTH
if "%choice%"=="4" goto END

:START_STREAMLIT
echo Starting Streamlit Frontend...
start "Gemini Streamlit" cmd /k "streamlit run app.py"
goto END

:START_NEXTJS
echo Starting Next.js Frontend (Port 3000)...
cd frontend
start "Gemini Next.js" cmd /k "npm run dev"
goto END

:START_BOTH
echo Starting All Frontends...
start "Gemini Streamlit" cmd /k "streamlit run app.py"
cd frontend
start "Gemini Next.js" cmd /k "npm run dev"
goto END

:END
echo.
echo ===================================================
echo   Launch Sequence Complete!
echo ===================================================
pause
