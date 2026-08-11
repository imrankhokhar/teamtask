# TeamTask Android wrapper

This APK is a full-screen WebView of **https://tt.exodevs.com**.  
Push/deploy website changes and reopen the app — no Play Store rebuild needed.

## Build APK

Needs Android SDK (already on this PC) and JDK 17.

```bat
cd android-wrapper
set JAVA_HOME=C:\Users\Mudassar\teamtask\.tools\jdk17
set ANDROID_HOME=%LOCALAPPDATA%\Android\Sdk
C:\Users\Mudassar\teamtask\.tools\gradle-8.9\bin\gradle.bat assembleDebug
```

Output: `android-wrapper\app\build\outputs\apk\debug\app-debug.apk`  
Copied for sharing: `releases\TeamTask.apk`

Install on a phone: copy the APK, enable **Install unknown apps**, then open it.
