@echo off
REM Run as Administrator. Creates a Windows scheduled task that syncs every 15 minutes.
REM The task only APPLIES changes when "autoApply": true in config.json (otherwise it dry-runs).
schtasks /Create /F /SC MINUTE /MO 15 /TN "MyCatalogue POS Sync" /RL HIGHEST /RU SYSTEM /TR "powershell -NoProfile -ExecutionPolicy Bypass -File \"%~dp0MyCatalogueAgent.ps1\" -Scheduled"
if errorlevel 1 (echo Failed - right-click and choose Run as administrator.) else (echo Scheduled task created: MyCatalogue POS Sync, every 15 minutes.)
pause
