@echo off
chcp 65001 >nul
title DineroYa - Arranque local
cd /d "%~dp0"

node scripts\local.mjs start
if errorlevel 1 (
  echo.
  echo No se pudo arrancar DineroYa. Revisa el mensaje de arriba.
  echo.
  pause
  exit /b 1
)

echo Cerrando esta ventana en 10 segundos...
ping -n 11 127.0.0.1 >nul
exit /b 0
