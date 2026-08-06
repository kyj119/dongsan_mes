@echo off
rem ============================================================================
rem  MES 가공·재단 패널 설치 ? 디자이너용 더블클릭 실행기
rem
rem  왜 이 파일이 필요한가 (2026-08-03 실측, 재단 패널에서 확인된 것):
rem    · Z: 는 네트워크 드라이브(\\192.168.0.122\공유폴더)라 거기 있는 .ps1 은 "원격"으로 분류된다
rem    · 대부분 PC 의 실행 정책이 RemoteSigned → 서명 없는 원격 스크립트는 차단된다
rem    · 게다가 .ps1 은 연결 프로그램이 없어 더블클릭해도 아무 일도 일어나지 않는다
rem  ⇒ 우클릭 "PowerShell에서 실행" 으로는 안 되고, 정책을 우회해 호출해야 한다.
rem
rem  ★2026-08-06 신설. 병합(08-04) 전에는 재단 패널 쪽에만 이 래퍼가 있었고 A0 쪽엔 없었다.
rem    그래서 "각 PC 에서 설치 실행"이 절차상으로만 존재하고 실제 실행 수단이 없었다.
rem
rem  ★인코딩 = CP949 로 저장할 것. UTF-8 로 두면 cmd 가 다른 바이트로 읽어
rem    괄호 블록 구조가 깨진다(2026-08-06 실측: echo 텍스트가 명령으로 실행됐다).
rem    같은 이유로 아래는 if/else 괄호 블록을 쓰지 않고 goto 로만 분기한다.
rem
rem  이 파일은 install-a0-panel.ps1 과 같은 폴더에 있어야 한다(%~dp0 로 찾는다).
rem ============================================================================
setlocal
echo.
echo   == MES 가공.재단 패널 설치 ==
echo.

set "PS1=%~dp0install-a0-panel.ps1"
if not exist "%PS1%" goto :nops1

rem 일러가 켜져 있으면 구 재단 확장 폴더가 잠겨 제거에 실패한다 - 미리 잡는다.
tasklist /FI "IMAGENAME eq Illustrator.exe" 2>nul | find /I "Illustrator.exe" >nul
if errorlevel 1 goto :run
echo [확인] 일러스트레이터가 실행 중입니다.
echo        완전히 종료한 뒤 진행해야 설치가 깨끗하게 끝납니다.
echo.
choice /C YN /M "그래도 계속할까요"
if errorlevel 2 goto :cancel

:run
echo.
echo [설치] %PS1%
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%PS1%"
set "RC=%ERRORLEVEL%"
echo.
if not "%RC%"=="0" goto :failed
echo 끝났습니다. 일러스트레이터를 완전히 종료했다가 다시 켜세요.
echo   메뉴 - 창(Window) ^> 확장(Extensions) ^> MES 가공.재단
pause
exit /b 0

:failed
echo [실패] 설치가 정상 종료되지 않았습니다. 위 메시지를 관리자에게 보여주세요.
pause
exit /b %RC%

:nops1
echo [오류] install-a0-panel.ps1 을 같은 폴더에서 찾지 못했습니다.
echo        찾은 경로: %PS1%
echo        Z: 드라이브 연결을 확인하세요.
pause
exit /b 1

:cancel
echo 취소했습니다. 일러스트레이터를 끄고 다시 실행하세요.
pause
exit /b 2
