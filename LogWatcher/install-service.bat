@echo off
:: ================================================================
:: LogWatcher Windows Service installer  (run as Administrator)
::
:: Messages are ASCII on purpose. Field PCs run mixed locales (the
:: transfer-8c press PC uses Chinese-locale control software), and a
:: UTF-8 .bat rendered under codepage 936/949 turns every message into
:: mojibake - an abort then reads as "it ran". Do not localize this file.
:: ================================================================

set SERVICE_NAME=LogWatcher
set APP_DIR=%~dp0
:: %~dp0 always ends with a backslash. Keep APP_DIR (WITH backslash) for file paths.
:: nssm AppDirectory must NOT end with a backslash: a trailing "\" inside quotes
:: ("...\") escapes the closing quote and corrupts the arg (CreateProcess exit 3).
:: So build a stripped copy (APP_DIR_NS) used ONLY for AppDirectory.
set APP_DIR_NS=%~dp0
if "%APP_DIR_NS:~-1%"=="\" set APP_DIR_NS=%APP_DIR_NS:~0,-1%

set EXE_PATH=%APP_DIR%LogWatcher.exe
set NSSM=%APP_DIR%nssm.exe

:: --- require administrator ---
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Run this file as Administrator.
    echo         Right-click -^> "Run as administrator".
    pause
    exit /b 1
)

:: --- required files (note: %APP_DIR% keeps its trailing backslash) ---
if not exist "%EXE_PATH%" (
    echo [ERROR] LogWatcher.exe not found: %EXE_PATH%
    pause
    exit /b 1
)
if not exist "%NSSM%" (
    echo [ERROR] nssm.exe not found: %NSSM%
    pause
    exit /b 1
)
if not exist "%APP_DIR%appsettings.json" (
    echo [ERROR] appsettings.json not found in: %APP_DIR%
    echo         Copy the WHOLE package folder here, not just this .bat.
    pause
    exit /b 1
)

echo ================================================================
echo  LogWatcher service install
echo  EXE : %EXE_PATH%
echo  DIR : %APP_DIR_NS%
echo ================================================================
echo.

:: --- remove existing service if present ---
sc query %SERVICE_NAME% >nul 2>&1
if %errorlevel% equ 0 (
    echo [INFO] Existing service found - stopping and removing...
    "%NSSM%" stop %SERVICE_NAME% >nul 2>&1
    "%NSSM%" remove %SERVICE_NAME% confirm >nul 2>&1
    timeout /t 2 >nul
)

echo [1/6] Installing service...
"%NSSM%" install %SERVICE_NAME% "%EXE_PATH%"

echo [2/6] Working directory...
"%NSSM%" set %SERVICE_NAME% AppDirectory "%APP_DIR_NS%"

echo [3/6] Auto-start...
"%NSSM%" set %SERVICE_NAME% Start SERVICE_AUTO_START

echo [4/6] Log files...
"%NSSM%" set %SERVICE_NAME% AppStdout "%APP_DIR%service.log"
"%NSSM%" set %SERVICE_NAME% AppStderr "%APP_DIR%service.log"
"%NSSM%" set %SERVICE_NAME% AppStdoutCreationDisposition 4
"%NSSM%" set %SERVICE_NAME% AppStderrCreationDisposition 4
"%NSSM%" set %SERVICE_NAME% AppRotateFiles 1
"%NSSM%" set %SERVICE_NAME% AppRotateBytes 10485760

echo [5/6] Description...
"%NSSM%" set %SERVICE_NAME% Description "Dongsan MES LogWatcher - print log monitor"

echo [6/6] Starting service...
"%NSSM%" start %SERVICE_NAME%

echo.
echo ================================================================
echo  Done.  Check:  sc query LogWatcher   (STATE should be RUNNING)
echo  Stop:   nssm stop LogWatcher
echo  Start:  nssm start LogWatcher
echo  Remove: nssm remove LogWatcher confirm
echo  Log:    type "%APP_DIR%service.log"
echo ================================================================
pause
