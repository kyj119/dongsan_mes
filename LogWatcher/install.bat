@echo off
echo === LogWatcher Service Installer ===

set NSSM=C:\Users\user\dongsan_mes\nssm-2.24\win64\nssm.exe
set SERVICE_NAME=LogWatcher
set EXE_PATH=%~dp0publish\LogWatcher.exe

if not exist "%NSSM%" (
    echo [ERROR] NSSM not found at %NSSM%
    pause
    exit /b 1
)

if not exist "%EXE_PATH%" (
    echo [ERROR] LogWatcher.exe not found at %EXE_PATH%
    echo Please run: dotnet publish -c Release -r win-x64 --self-contained true -o publish
    pause
    exit /b 1
)

echo Installing service: %SERVICE_NAME%
echo Executable: %EXE_PATH%

%NSSM% install %SERVICE_NAME% "%EXE_PATH%"
%NSSM% set %SERVICE_NAME% AppDirectory "%~dp0publish"
%NSSM% set %SERVICE_NAME% DisplayName "LogWatcher - Print.log Monitor"
%NSSM% set %SERVICE_NAME% Description "Monitors TNSRip Print.log and reports to MES"
%NSSM% set %SERVICE_NAME% Start SERVICE_AUTO_START
%NSSM% set %SERVICE_NAME% AppStdout "%~dp0publish\logwatcher_stdout.log"
%NSSM% set %SERVICE_NAME% AppStderr "%~dp0publish\logwatcher_stderr.log"
%NSSM% set %SERVICE_NAME% AppRotateFiles 1
%NSSM% set %SERVICE_NAME% AppRotateBytes 5242880

echo.
echo Service installed. Starting...
%NSSM% start %SERVICE_NAME%

echo.
echo Done! Service status:
%NSSM% status %SERVICE_NAME%
pause
