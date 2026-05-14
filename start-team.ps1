# 동산기획 ERP+MES — 에이전트 팀 작업 환경 기동
# Windows Terminal을 3-pane 레이아웃으로 실행:
#   왼쪽(50%)       : Claude Code PM 세션
#   오른쪽 위(25%)  : dev 서버 (npm run dev:d1)
#   오른쪽 아래(25%): 검증용 PowerShell (smoke/build/git)

$ProjectDir = "C:\Users\user\dongsan_mes"

if (-not (Get-Command wt.exe -ErrorAction SilentlyContinue)) {
    Write-Error "Windows Terminal(wt.exe)이 PATH에 없습니다. Microsoft Store에서 설치하세요."
    exit 1
}

# 탭 제목은 set-title로, 분할은 split-pane으로 체이닝 (`;`는 PowerShell에서 backtick 필요)
wt.exe -w 0 `
    new-tab     --title "PM"     -d "$ProjectDir" powershell -NoExit -Command "claude" `;  `
    split-pane  -V --size 0.5    --title "dev:d1" -d "$ProjectDir" powershell -NoExit -Command "npm run dev:d1" `;  `
    split-pane  -H --size 0.5    --title "verify" -d "$ProjectDir" powershell -NoExit
