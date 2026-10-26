@echo off
setlocal
cd /d "%~dp0"
if not exist node_modules call npm install --no-audit --no-fund
call npm test
echo.
echo Optional UI smoke test: npm run test:ui
pause
