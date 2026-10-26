@echo off
setlocal
cd /d "%~dp0"
title Bharat-Power-Politics - Setup
echo ==============================================
echo   Bharat-Power-Politics - first-time setup
echo ==============================================
where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js was not found. Install the LTS version from https://nodejs.org then run setup.bat again.
  pause & exit /b 1
)
for /f "tokens=1 delims=v." %%a in ('node -v') do set NODEMAJOR=%%a
if %NODEMAJOR% LSS 18 (
  echo [ERROR] Node.js 18 or newer is required. You have:
  node -v
  pause & exit /b 1
)
echo Node version:
node -v
echo.
echo [1/3] Creating .env ...
call node scripts\setup-env.js
if errorlevel 1 goto :fail
echo.
echo [2/3] Installing dependencies (needs internet) ...
call npm install --no-audit --no-fund
if errorlevel 1 goto :fail
echo.
echo [3/3] Creating the database ...
call node scripts\init-db.js
if errorlevel 1 goto :fail
echo.
echo Setup complete!  Start the game with run.bat
echo (Optional) Verify the install with test.bat
pause
exit /b 0
:fail
echo.
echo [ERROR] Setup failed - see the messages above.
pause
exit /b 1
