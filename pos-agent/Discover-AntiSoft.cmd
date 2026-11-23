@echo off
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Discover-AntiSoft.ps1"
echo.
echo Done. Tell Claude "done".
pause
