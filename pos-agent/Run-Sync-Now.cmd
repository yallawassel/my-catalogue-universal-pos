@echo off
cd /d "%~dp0"
echo This will APPLY changes to your online catalogue (never to the POS).
set /p ok=Type YES to continue: 
if /I not "%ok%"=="YES" exit /b
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0MyCatalogueAgent.ps1" -Apply
pause
