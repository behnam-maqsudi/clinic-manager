@echo off
cd /d "%~dp0"
title Clinic Manager - Dr. Bahamin Jahanian

powershell -NoProfile -Command "$c = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue; if ($c) { Stop-Process -Id $c.OwningProcess -Force -ErrorAction SilentlyContinue }"

set OPEN_FLAG=--open

:loop
node dist-server\server.js %OPEN_FLAG%
set OPEN_FLAG=
if %errorlevel% equ 42 (
  timeout /t 1 /nobreak >nul
  goto loop
)

pause
