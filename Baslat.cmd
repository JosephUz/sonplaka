@echo off
cd /d "%~dp0"
rem Docker Desktop varsa oyun konteynerde (Kale Tasima duzeni); yoksa Node ile dogrudan acilir.
where docker >nul 2>nul
if errorlevel 1 goto node
docker compose up -d --build
if errorlevel 1 (
  echo Konteyner baslatilamadi. Docker Desktop acik mi kontrol edin; Node ile deneniyor...
  goto node
)
start "" "http://localhost:5187"
exit /b 0

:node
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js veya Docker Desktop gerekli.
  pause
  exit /b 1
)
if not exist "node_modules\three\build\three.module.js" call npm.cmd install --no-audit --no-fund
node server.mjs --open
pause
