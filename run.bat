@echo off
setlocal
cd /d "%~dp0"
title Bharat-Power-Politics Server
if not exist node_modules (
  echo Dependencies missing - running setup first...
  call setup.bat
)
if not exist .env call node scripts\setup-env.js
for /f %%p in ('node scripts\print-port.js') do set GAMEPORT=%%p
echo Starting Bharat-Power-Politics on http://localhost:%GAMEPORT%
echo Friends on your Wi-Fi/LAN can join at http://YOUR-PC-IP:%GAMEPORT%  (allow Node.js through Windows Firewall when asked)
echo Press Ctrl+C to stop the server.
start "" /min cmd /c "timeout /t 3 >nul & start http://localhost:%GAMEPORT%"
node server\index.js
pause
