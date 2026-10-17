@echo off
rem Stops the Backplane hub and the agents it started (closing the window also does this).
taskkill /F /T /IM backplane-serve.exe >nul 2>&1
echo Backplane stopped.
