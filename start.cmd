@echo off
echo Starting TeamTask free API...
start "TeamTask API" cmd /k "cd /d %~dp0server && node src\index.js"
timeout /t 2 >nul
echo Starting Expo (press w for desktop web, or scan QR in Expo Go)...
cd /d %~dp0app
npx expo start
