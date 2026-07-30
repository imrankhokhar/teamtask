@echo off
setlocal
cd /d "%~dp0server"
echo Starting TeamTask web app locally...
echo Open http://localhost:4000 in your browser
echo (Local only — for shared cloud follow WEB-DEPLOY.md)
echo.
call npm start
