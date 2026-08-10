# ================================================================
# MES LogWatcher 현장 키트 — 관리자 승격 파트 (C: 로컬 전용)
#
# 승격 세션에는 네트워크 드라이브(Z:)가 없다 → kit.ps1 이 이 파일과 바이너리를
# C:\Users\Public\LogWatcher-stage 로 복사한 뒤 여기서 승격 실행한다.
# 이 파일은 C: 바깥을 절대 참조하지 않는다.
#
# 동작:
#  - 서비스 있음 → 중지 → 바이너리 교체(설정 4종 보존) → (config 있으면 반영+백업) → 시작
#  - 서비스 없음 + stage-config 있음 → C:\Logwatcher 신규 설치 + nssm 서비스 등록
#    (nssm 설정은 install-service.bat 과 동일. AppDirectory 는 뒤 백슬래시 금지 — CreateProcess exit 3 전례)
#  - 서비스 없음 + config 없음 → 중단 안내 (진단 먼저)
# ================================================================
$ErrorActionPreference = "Continue"
$Stage    = "C:\Users\Public\LogWatcher-stage"
$StageCfg = "C:\Users\Public\LogWatcher-stage-config"
$LogFile  = Join-Path $Stage "admin-install.log"
$SvcName  = "LogWatcher"
$Stamp    = Get-Date -Format "yyyyMMdd-HHmm"

function L([string]$m) {
    $line = "{0}  {1}" -f (Get-Date -Format "HH:mm:ss"), $m
    Write-Host $line
    Add-Content -Path $LogFile -Value $line -Encoding UTF8
}

Set-Content -Path $LogFile -Value ("== LogWatcher 설치/업데이트  " + (Get-Date -Format "yyyy-MM-dd HH:mm:ss") + "  PC=" + $env:COMPUTERNAME) -Encoding UTF8

$id = [Security.Principal.WindowsIdentity]::GetCurrent()
if (-not (New-Object Security.Principal.WindowsPrincipal($id)).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    L "[오류] 관리자 권한이 아닙니다. START.bat → [2] 로 다시 실행하세요."
    Read-Host "Enter 로 닫기"; exit 1
}
if (-not (Test-Path (Join-Path $Stage "LogWatcher.exe"))) {
    L "[오류] 스테이지에 LogWatcher.exe 가 없습니다: $Stage"
    Read-Host "Enter 로 닫기"; exit 1
}

$svc = Get-Service $SvcName -ErrorAction SilentlyContinue

if ($svc) {
    # ── 업데이트 모드 ──
    $appDir = $null
    try { $appDir = (Get-ItemProperty "HKLM:\SYSTEM\CurrentControlSet\Services\$SvcName\Parameters" -ErrorAction Stop).AppDirectory } catch {}
    if (-not $appDir) { $appDir = "C:\Logwatcher" }
    L "업데이트 모드 — 대상: $appDir (appsettings/equipment.json/재전송큐 보존)"

    L "서비스 중지 중..."
    try { Stop-Service $SvcName -Force -ErrorAction Stop } catch { L ("  중지 실패: " + $_.Exception.Message) }
    $deadline = (Get-Date).AddSeconds(30)
    while ((Get-Service $SvcName).Status -ne "Stopped" -and (Get-Date) -lt $deadline) { Start-Sleep -Milliseconds 500 }
    L ("  서비스 상태: " + (Get-Service $SvcName).Status)

    robocopy $Stage $appDir /E /R:2 /W:2 /NFL /NDL /NJH `
        /XF appsettings.json equipment.json equipment.*.json pending_events.json service.log kit-admin.ps1 admin-install.log | Out-Null
    if ($LASTEXITCODE -ge 8) { L "[오류] 바이너리 교체 실패 (robocopy $LASTEXITCODE)"; Read-Host "Enter 로 닫기"; exit 1 }
    L "바이너리 교체 완료 (robocopy $LASTEXITCODE)"

    if (Test-Path $StageCfg) {
        foreach ($c in @("appsettings.json", "equipment.json")) {
            $t = Join-Path $appDir $c
            if (Test-Path $t) { Copy-Item $t ($t + ".bak-" + $Stamp) -Force; L ("  기존 설정 백업: {0} → {0}.bak-{1}" -f $c, $Stamp) }
        }
        Copy-Item (Join-Path $StageCfg "*") $appDir -Force
        L ("신규 설정 반영 (config\" + $env:COMPUTERNAME + ")")
    }

    L "서비스 시작 중..."
    try { Start-Service $SvcName -ErrorAction Stop } catch { L ("  시작 실패: " + $_.Exception.Message) }
    Start-Sleep -Seconds 3
    L ("서비스 상태: " + (Get-Service $SvcName).Status)
    $verFile = Join-Path $appDir "version.txt"
    if (Test-Path $verFile) { L ("배포 버전: " + (Get-Content $verFile -First 1)) }
    $slog = Join-Path $appDir "service.log"
    if (Test-Path $slog) {
        L "── service.log 마지막 5줄 ──"
        Get-Content $slog -Tail 5 -ErrorAction SilentlyContinue | ForEach-Object { L ("  " + $_) }
    }
} else {
    # ── 신규 설치 모드 ──
    if (-not (Test-Path $StageCfg)) {
        L "[중단] 서비스가 없고 이 PC 용 설정(config)도 없습니다."
        L "       → START.bat [1] 진단을 먼저 실행해 수거물을 개발자에게 전달하세요."
        Read-Host "Enter 로 닫기"; exit 1
    }
    $appDir = "C:\Logwatcher"
    L "신규 설치 모드 — $appDir"
    robocopy $Stage $appDir /E /R:2 /W:2 /NFL /NDL /NJH /XF kit-admin.ps1 admin-install.log | Out-Null
    if ($LASTEXITCODE -ge 8) { L "[오류] 복사 실패 (robocopy $LASTEXITCODE)"; Read-Host "Enter 로 닫기"; exit 1 }
    Copy-Item (Join-Path $StageCfg "*") $appDir -Force
    L ("설정 반영 (config\" + $env:COMPUTERNAME + ")")

    $nssm = Join-Path $appDir "nssm.exe"
    $exe  = Join-Path $appDir "LogWatcher.exe"
    if (-not (Test-Path $nssm)) { L "[오류] nssm.exe 가 없습니다 (키트 bin 에 포함되어야 함)"; Read-Host "Enter 로 닫기"; exit 1 }

    # install-service.bat 과 동일 구성. $appDir 은 뒤 백슬래시 없는 리터럴이라 안전.
    & $nssm install $SvcName $exe | Out-Null
    & $nssm set $SvcName AppDirectory $appDir | Out-Null
    & $nssm set $SvcName Start SERVICE_AUTO_START | Out-Null
    & $nssm set $SvcName AppStdout (Join-Path $appDir "service.log") | Out-Null
    & $nssm set $SvcName AppStderr (Join-Path $appDir "service.log") | Out-Null
    & $nssm set $SvcName AppStdoutCreationDisposition 4 | Out-Null
    & $nssm set $SvcName AppStderrCreationDisposition 4 | Out-Null
    & $nssm set $SvcName AppRotateFiles 1 | Out-Null
    & $nssm set $SvcName AppRotateBytes 10485760 | Out-Null
    & $nssm set $SvcName Description "Dongsan MES LogWatcher - print log monitor" | Out-Null
    & $nssm start $SvcName | Out-Null
    Start-Sleep -Seconds 3
    $st = Get-Service $SvcName -ErrorAction SilentlyContinue
    if ($st) { L ("서비스 상태: " + $st.Status) } else { L "[오류] 서비스 등록 실패" }
    $verFile = Join-Path $appDir "version.txt"
    if (Test-Path $verFile) { L ("배포 버전: " + (Get-Content $verFile -First 1)) }
}

L "완료."
Read-Host "Enter 로 닫기"
