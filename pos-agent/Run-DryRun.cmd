@echo off
cd /d "%~dp0"
echo DRY RUN - nothing will be saved. Results go to logs\last-dryrun.csv
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0MyCatalogueAgent.ps1" -DryRun
pause
