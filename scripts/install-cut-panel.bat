@echo off
chcp 65001 >nul
rem ============================================================================
rem  MES 재단 패널 설치 — **더블클릭용 래퍼**
rem
rem  왜 필요한가 (2026-08-03 실측):
rem    · Z: 는 네트워크 드라이브(\\192.168.0.122\공유폴더)라 거기 있는 .ps1 은 "원격"으로 분류된다
rem    · 이 PC 실행 정책이 RemoteSigned → **서명 없는 원격 스크립트는 차단**된다
rem    · 게다가 .ps1 은 연결 프로그램이 없어 더블클릭해도 아무 일도 일어나지 않는다
rem  ⇒ 우클릭 "PowerShell에서 실행" 으로는 안 되고, 정책을 우회해 호출해야 한다.
rem
rem  이 파일은 install-cut-panel.ps1 **과 같은 폴더**에 있어야 한다(%~dp0 로 찾는다).
rem ============================================================================
setlocal
set "PS1=%~dp0install-cut-panel.ps1"
if not exist "%PS1%" (
  echo [오류] install-cut-panel.ps1 을 같은 폴더에서 찾지 못했습니다.
  echo        찾은 경로: %PS1%
  pause
  exit /b 1
)
echo [설치] %PS1%
powershell -NoProfile -ExecutionPolicy Bypass -File "%PS1%"
echo.
echo 끝났습니다. 일러스트레이터를 완전히 종료했다가 다시 켜세요.
pause
