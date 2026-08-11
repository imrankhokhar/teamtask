@echo off
setlocal
set JAVA_HOME=%~dp0.tools\jdk17
set ANDROID_HOME=%LOCALAPPDATA%\Android\Sdk
set ANDROID_SDK_ROOT=%ANDROID_HOME%
if not exist "%JAVA_HOME%\bin\java.exe" (
  echo JDK missing at %JAVA_HOME%
  exit /b 1
)
cd /d "%~dp0android-wrapper"
call "%~dp0.tools\gradle-8.9\bin\gradle.bat" assembleDebug --no-daemon
if errorlevel 1 exit /b 1
if not exist "%~dp0releases" mkdir "%~dp0releases"
copy /Y "app\build\outputs\apk\debug\app-debug.apk" "%~dp0releases\TeamTask.apk"
echo.
echo APK: %~dp0releases\TeamTask.apk
