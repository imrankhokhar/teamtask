@echo off
setlocal
set JAVA_HOME=C:\Users\Mudassar\teamtask\.tools\jdk17
set ANDROID_HOME=C:\Users\Mudassar\AppData\Local\Android\Sdk
set ANDROID_SDK_ROOT=%ANDROID_HOME%
"%JAVA_HOME%\bin\java.exe" -Xmx64m -Xms64m -cp "C:\Users\Mudassar\teamtask\.tools\gradle-8.9\lib\gradle-launcher-8.9.jar" org.gradle.launcher.GradleMain %*
