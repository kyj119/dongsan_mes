@echo off
rem ================================================================
rem MES LogWatcher field kit launcher.
rem Messages are ASCII on purpose - a UTF-8 .bat rendered under
rem codepage 936/949 turns into mojibake and an abort reads as
rem "it ran" (see install-service.bat header). Do not localize.
rem Korean UI lives in kit.ps1 (UTF-8 BOM, PowerShell renders it fine).
rem ================================================================
cd /d "%~dp0"
if not exist "%~dp0kit.ps1" (
    echo [ERROR] kit.ps1 not found next to this file.
    echo         Copy the WHOLE kit folder, not just this .bat.
    pause
    exit /b 1
)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0kit.ps1"
echo.
pause
