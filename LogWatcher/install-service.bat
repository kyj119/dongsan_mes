@echo off
:: ================================================================
:: LogWatcher Windows 서비스 설치 스크립트
:: 관리자 권한으로 실행 필요
:: ================================================================

set SERVICE_NAME=LogWatcher
set EXE_PATH=%~dp0LogWatcher.exe
set APP_DIR=%~dp0
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
if not exist "%APP_DIR%appsettings.json" (
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
%NSSM% set %SERVICE_NAME% AppStdout "%APP_DIR%service.log"
%NSSM% set %SERVICE_NAME% AppStderr "%APP_DIR%service.log"
%NSSM% set %SERVICE_NAME% AppStdoutCreationDisposition 4
%NSSM% set %SERVICE_NAME% AppStderrCreationDisposition 4
%NSSM% set %SERVICE_NAME% AppRotateFiles 1
%NSSM% set %SERVICE_NAME% AppRotateBytes 10485760

echo [5/6] 서비스 설명 설정...
%NSSM% set %SERVICE_NAME% Description "동산현수막 MES LogWatcher - Print.log 감시 및 RIP Job 생성"

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
echo  로그 확인:        type "%APP_DIR%service.log"
echo.
echo  [중요] appsettings.json의 EquipmentId가
echo         이 PC에 맞게 설정되어 있는지 확인하세요.
echo ================================================================
pause
