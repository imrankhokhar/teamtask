@echo off
setlocal
set ROOT=%~dp0
cd /d "%ROOT%app"
echo Exporting web UI for cloud deploy...
call npx expo export --platform web
if errorlevel 1 exit /b 1
if exist "%ROOT%server\web" rmdir /s /q "%ROOT%server\web"
mkdir "%ROOT%server\web"
xcopy /E /I /Y "%ROOT%app\dist" "%ROOT%server\web" >nul

REM Inject PWA / mobile-install meta into index.html
powershell -NoProfile -Command ^
  "$p='%ROOT%server\web\index.html';" ^
  "$c=Get-Content -Raw $p;" ^
  "if($c -notmatch 'manifest.webmanifest'){" ^
  "$inject='<meta name=\"mobile-web-app-capable\" content=\"yes\">`n<meta name=\"apple-mobile-web-app-capable\" content=\"yes\">`n<meta name=\"apple-mobile-web-app-status-bar-style\" content=\"black-translucent\">`n<meta name=\"apple-mobile-web-app-title\" content=\"TeamTask\">`n<link rel=\"manifest\" href=\"/manifest.webmanifest\">';" ^
  "$c=$c -replace '</head>',($inject+'</head>');" ^
  "Set-Content -Path $p -Value $c -NoNewline }"

cd /d "%ROOT%server"
call npm install
if errorlevel 1 exit /b 1
if not exist "%ROOT%server\public" mkdir "%ROOT%server\public"
echo.
echo Web UI staged in server\web
echo Next: follow WEB-DEPLOY.md (MongoDB Atlas + GitHub + Render)
echo Then share your https://….onrender.com link for phone + desktop.
