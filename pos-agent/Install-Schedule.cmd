@echo off
REM Creates a Windows scheduled task that syncs every 15 minutes as THIS Windows user
REM (the user that can read the POS database). It runs while this user is logged in.
REM The task only APPLIES changes when "autoApply": true in config.json (otherwise it dry-runs).
schtasks /Create /F /SC MINUTE /MO 15 /TN "MyCatalogue POS Sync" /IT /TR "wscript.exe \"%~dp0Run-Hidden.vbs\""
if errorlevel 1 (echo Failed to create the task.) else (echo Scheduled task created: MyCatalogue POS Sync, every 15 minutes.)
pause
