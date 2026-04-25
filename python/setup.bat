@echo off
REM Double-click this file to install the venv (same as running setup.ps1 in PowerShell).
setlocal
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup.ps1"
if errorlevel 1 (
  echo.
  echo Setup failed. See messages above.
  pause
  exit /b 1
)
endlocal
