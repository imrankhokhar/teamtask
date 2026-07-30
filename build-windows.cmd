@echo off
setlocal
set ROOT=%~dp0
cd /d "%ROOT%"

echo [1/5] Exporting web UI...
cd /d "%ROOT%app"
call npx expo export --platform web
if errorlevel 1 exit /b 1

echo [2/5] Installing server dependencies...
cd /d "%ROOT%server"
call npm install
if errorlevel 1 exit /b 1

echo [3/5] Staging server bundle (with node_modules + web UI)...
set BUNDLE=%ROOT%desktop\server-bundle
if exist "%BUNDLE%" rmdir /s /q "%BUNDLE%"
mkdir "%BUNDLE%"
xcopy /E /I /Y "%ROOT%server\src" "%BUNDLE%\src" >nul
xcopy /E /I /Y "%ROOT%server\node_modules" "%BUNDLE%\deps" >nul
copy /Y "%ROOT%server\package.json" "%BUNDLE%\" >nul
xcopy /E /I /Y "%ROOT%app\dist" "%BUNDLE%\web" >nul
if not exist "%BUNDLE%\web\index.html" (
  echo ERROR: web UI not staged
  exit /b 1
)
if not exist "%BUNDLE%\deps\express" (
  echo ERROR: server dependencies not staged
  exit /b 1
)

echo [3b] Staging cloud-config.json for shared mode...
copy /Y "%ROOT%cloud-config.json" "%ROOT%desktop\cloud-config.json" >nul
REM Also keep a copy next to staged web for Docker/cloud deploys
if exist "%ROOT%server\web" rmdir /s /q "%ROOT%server\web"
mkdir "%ROOT%server\web"
xcopy /E /I /Y "%ROOT%app\dist" "%ROOT%server\web" >nul

echo [4/5] Installing desktop builder...
cd /d "%ROOT%desktop"
call npm install
if errorlevel 1 exit /b 1

echo [5/5] Building Windows EXE installers...
call npm run dist
if errorlevel 1 exit /b 1

echo.
echo Copying to releases folder...
if not exist "%ROOT%releases" mkdir "%ROOT%releases"
copy /Y "%ROOT%desktop\dist\TeamTask-Setup-1.0.0.exe" "%ROOT%releases\" >nul
copy /Y "%ROOT%desktop\dist\TeamTask-Portable-1.0.0.exe" "%ROOT%releases\" >nul

echo DONE. Installers:
dir /b "%ROOT%releases\*.exe"
echo.
findstr /C:"\"apiUrl\"" "%ROOT%cloud-config.json"
echo If apiUrl is empty, EXE runs in local-hub mode.
echo If apiUrl is https://..., EXE uses shared cloud data (see CLOUD-SHARED.md).
