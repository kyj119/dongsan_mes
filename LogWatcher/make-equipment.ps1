# ==============================================================================
# 전사 8색 equipment.json 생성기
#
# 손으로 JSON 을 고치면 경로 역슬래시가 "\P" 처럼 이스케이프로 먹혀 파서가 죽는다
# (실제 발생: 'P' is an invalid escapable character). 여기서는 경로를 슬래시(/)로
# 써서 그 함정을 원천 제거하고, PrintExp 폴더 이름·로그 위치는 실측해서 채운다.
#
#   powershell -ExecutionPolicy Bypass -File make-equipment.ps1 -Unit 2
#
# -SearchRoot 는 검사용(Z: 사본으로 동작 확인할 때). 현장에서는 지정하지 않는다.
# ==============================================================================
param(
    [Parameter(Mandatory = $true)][ValidateSet('1', '2')][string]$Unit,
    [string]$SearchRoot = 'C:\',
    [string]$RipRoot = 'C:\Users\Public\Documents\neoStampa 10\Log',
    [string]$OutFile = "$PSScriptRoot\equipment.json"
)

$ErrorActionPreference = 'Stop'
$eqId = "TRANS-8C-0$Unit"
$eqName = "전사 8색 ${Unit}호기 (Longyin Q2000)"

Write-Host "=== $eqId 설정 생성 ===" -ForegroundColor Cyan

# --- PrintExp 로그 폴더 실측 -------------------------------------------------
# 설치 폴더 이름에 버전이 붙는 PC 가 있고(2호기), 로그가 Log\ 바로 아래인 PC 와
# Log\main\ 인 PC 가 갈린다. 이름을 가정하지 말고 Log[날짜].txt 가 실제로 있는 곳을 찾는다.
$candidates = @()
foreach ($base in (Get-ChildItem -LiteralPath $SearchRoot -Directory -ErrorAction SilentlyContinue |
                   Where-Object { $_.Name -like 'PrintExp*' })) {
    foreach ($sub in @('Log', 'Log\main')) {
        $dir = Join-Path $base.FullName $sub
        if (-not (Test-Path -LiteralPath $dir)) { continue }
        $newest = Get-ChildItem -LiteralPath $dir -File -ErrorAction SilentlyContinue |
                  Where-Object { $_.Name.StartsWith('Log[') -and $_.Name.EndsWith('.txt') } |
                  Sort-Object LastWriteTime -Descending | Select-Object -First 1
        if ($newest) {
            $candidates += [pscustomobject]@{ Dir = $dir; Last = $newest.LastWriteTime; File = $newest.Name }
        }
    }
}

if ($candidates.Count -eq 0) {
    Write-Host "[실패] PrintExp 로그 폴더를 못 찾았습니다." -ForegroundColor Red
    Write-Host "       dir $SearchRoot /b | findstr /i PrintExp  로 폴더 이름을 확인하세요."
    exit 1
}

foreach ($c in $candidates) { Write-Host ("  후보: {0}   최신 {1} ({2:yyyy-MM-dd})" -f $c.Dir, $c.File, $c.Last) }
$printDir = ($candidates | Sort-Object Last -Descending | Select-Object -First 1).Dir
Write-Host "  선택: $printDir" -ForegroundColor Green

# --- neoStampa 루트 확인 -----------------------------------------------------
if (-not (Test-Path -LiteralPath $RipRoot)) {
    Write-Host "[실패] neoStampa 로그 폴더가 없습니다: $RipRoot" -ForegroundColor Red
    Write-Host "       실제 경로를 -RipRoot 로 넘기세요."
    exit 1
}
Write-Host "  리핑: $RipRoot" -ForegroundColor Green

# --- 쓰기 (경로는 슬래시로 — 역슬래시 이스케이프 사고 방지) -------------------
$cfg = [ordered]@{
    poll_interval_seconds      = 5
    heartbeat_interval_seconds = 60
    watchers                   = @(
        [ordered]@{
            equipment_id = $eqId
            name         = $eqName
            enabled      = $true
            parser_type  = 'neostampa_printexp'
            config       = [ordered]@{
                rip_log_root             = $RipRoot.Replace('\', '/')
                print_log_dir            = $printDir.Replace('\', '/')
                join_tolerance_seconds   = 5
                emit_rip_only_after_hours = 0
            }
        }
    )
}

if (Test-Path -LiteralPath $OutFile) {
    $bak = "$OutFile.bak-" + (Get-Date -Format 'yyyyMMdd-HHmmss')
    Copy-Item -LiteralPath $OutFile -Destination $bak
    Write-Host "  기존 파일 백업: $(Split-Path $bak -Leaf)"
}

$json = $cfg | ConvertTo-Json -Depth 6
[IO.File]::WriteAllText($OutFile, $json, [Text.UTF8Encoding]::new($false))

Write-Host ""
Write-Host "생성 완료: $OutFile" -ForegroundColor Cyan
Write-Host $json
Write-Host ""
Write-Host "다음:  LogWatcher.exe --test $eqId" -ForegroundColor Yellow
