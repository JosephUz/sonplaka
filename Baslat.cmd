@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js gerekli. Node.js kurup yeniden deneyin.
  pause
  exit /b 1
)
if not exist "node_modules\three\build\three.module.js" goto install
goto run
:install
call npm.cmd install --no-audit --no-fund
if errorlevel 1 (
  pause
  exit /b 1
)
:run
node server.mjs --open
pause
