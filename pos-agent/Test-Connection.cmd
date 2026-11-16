@echo off
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0MyCatalogueAgent.ps1" -Ping
pause
