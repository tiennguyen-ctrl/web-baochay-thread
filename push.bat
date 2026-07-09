@echo off
cd /d "%~dp0"
git add index.html style.css script.js
git commit -m "Update web dashboard"
git push origin main
echo.
echo === DONE - Code da duoc push len GitHub ===
pause
