@echo off
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Discover-Photos.ps1"
echo.
echo Done. Tell Claude "done".
pause
