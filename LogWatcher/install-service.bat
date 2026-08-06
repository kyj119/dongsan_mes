@echo off
:: 이 파일은 UTF-8 로 저장돼 있다. chcp 를 안 하면 콘솔 기본 코드페이지(949/936)로 읽혀
:: 안내문이 전부 깨진다 — 전사 8색 PC(중국어 SW)에서 오류문이 중국어로 보인 원인.
chcp 65001 >nul 2>&1
:: ================================================================
:: LogWatcher Windows 서비스 설치 스크립트
:: 관리자 권한으로 실행 필요
:: ================================================================

set SERVICE_NAME=LogWatcher
set EXE_PATH=%~dp0LogWatcher.exe
set APP_DIR=%~dp0
:: %~dp0 ends with a backslash; strip it so "AppDirectory" is not corrupted by the trailing \"
if "%APP_DIR:~-1%"=="\" set APP_DIR=%APP_DIR:~0,-1%
set NSSM=%~dp0nssm.exe

:: 관리자 권한 확인
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo [오류] 관리자 권한으로 실행해주세요.
    echo        이 파일을 우클릭 - "관리자 권한으로 실행" 선택
    pause
    exit /b 1
)

:: 필수 파일 확인
if not exist "%EXE_PATH%" (
    echo [오류] LogWatcher.exe를 찾을 수 없습니다: %EXE_PATH%
    pause
    exit /b 1
)
if not exist "%NSSM%" (
    echo [오류] nssm.exe를 찾을 수 없습니다: %NSSM%
    pause
    exit /b 1
)
:: ⚠️ APP_DIR 은 위에서 뒤 백슬래시를 뗐다 → 파일 경로를 붙일 땐 %~dp0 를 쓸 것.
::    "%APP_DIR%appsettings.json" 이라고 쓰면 C:\Logwatcherappsettings.json 이 되어
::    파일이 있어도 항상 "없음"으로 판정, 설치가 여기서 멈춘다(실제 발생).
if not exist "%~dp0appsettings.json" (
    echo [오류] appsettings.json을 찾을 수 없습니다.
    echo        appsettings.json의 EquipmentId를 설정했는지 확인하세요.
    pause
    exit /b 1
)

echo ================================================================
echo  LogWatcher 서비스 설치
echo ================================================================
echo  실행 파일: %EXE_PATH%
echo  작업 디렉토리: %APP_DIR%
echo ================================================================
echo.

:: 기존 서비스 확인 및 제거
sc query %SERVICE_NAME% >nul 2>&1
if %errorlevel% equ 0 (
    echo [INFO] 기존 서비스 발견. 중지 후 제거합니다...
    %NSSM% stop %SERVICE_NAME% >nul 2>&1
    %NSSM% remove %SERVICE_NAME% confirm >nul 2>&1
    timeout /t 2 >nul
)

:: 서비스 설치
echo [1/6] 서비스 설치 중...
%NSSM% install %SERVICE_NAME% "%EXE_PATH%"

echo [2/6] 작업 디렉토리 설정...
%NSSM% set %SERVICE_NAME% AppDirectory "%APP_DIR%"

echo [3/6] 자동 시작 설정...
%NSSM% set %SERVICE_NAME% Start SERVICE_AUTO_START

echo [4/6] 로그 파일 설정...
%NSSM% set %SERVICE_NAME% AppStdout "%~dp0service.log"
%NSSM% set %SERVICE_NAME% AppStderr "%~dp0service.log"
%NSSM% set %SERVICE_NAME% AppStdoutCreationDisposition 4
%NSSM% set %SERVICE_NAME% AppStderrCreationDisposition 4
%NSSM% set %SERVICE_NAME% AppRotateFiles 1
%NSSM% set %SERVICE_NAME% AppRotateBytes 10485760

echo [5/6] 서비스 설명 설정...
%NSSM% set %SERVICE_NAME% Description "동산기획 MES LogWatcher - Print.log 감시 및 RIP Job 생성"

echo [6/6] 서비스 시작...
%NSSM% start %SERVICE_NAME%

echo.
echo ================================================================
echo  설치 완료!
echo ================================================================
echo.
echo  서비스 상태 확인: sc query LogWatcher
echo  서비스 중지:      nssm stop LogWatcher
echo  서비스 시작:      nssm start LogWatcher
echo  서비스 제거:      nssm remove LogWatcher confirm
echo  로그 확인:        type "%~dp0service.log"
echo.
echo  [중요] appsettings.json의 EquipmentId가
echo         이 PC에 맞게 설정되어 있는지 확인하세요.
echo ================================================================
pause
