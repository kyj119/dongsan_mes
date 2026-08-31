# ================================================================
# MES LogWatcher 현장 키트 — 관리자 승격 파트 (C: 로컬 전용)
#
# 승격 세션에는 네트워크 드라이브(Z:)가 없다 → kit.ps1 이 이 파일과 바이너리를
# C:\Users\Public\LogWatcher-stage 로 복사한 뒤 여기서 승격 실행한다.
# 이 파일은 C: 바깥을 절대 참조하지 않는다.
#
# 동작:
#  - 서비스 있음 → 중지 → 바이너리 교체(설정 4종 보존) → (config 있으면 반영+백업)
#      → ★tns 단일 watcher 면 PrintExp 자동 탐지 → tns_printexp 자동 전환 (2026-08-19)
#        · 서식지 = 드라이브 루트·Program Files(x86)의 PrintExp_X64* 폴더 (5변종 실측 기반)
#        · 검증 = 최근 30일 내 Log[yyyy_MM_dd].txt + 启动任务 마커(GBK/UTF-16 양쪽 디코드)
#        · 검증된 후보가 정확히 1개일 때만 적용, 0개/복수면 보고만 (손목록 배제·오탐 방지)
#        · 기동 로그에 FATAL 이 뜨면 백업으로 자동 롤백
#  - 서비스 없음 + stage-config 있음 → C:\Logwatcher 신규 설치 + nssm 서비스 등록
#    (nssm 설정은 install-service.bat 과 동일. AppDirectory 는 뒤 백슬래시 금지 — CreateProcess exit 3 전례)
#  - 서비스 없음 + config 없음 → 중단 안내 (진단 먼저)
#
# -FunctionsOnly: 함수 정의만 하고 종료 (개발 PC 단위 테스트용 — 현장 동작 아님)
# ================================================================
param([switch]$FunctionsOnly)

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

# ── PrintExp 서식지 탐지 ──────────────────────────────────────────
# 실측 5변종: D:\PrintExp_X64\Log\main · C:\PrintExp_X64\PrintExp_X64\Log\main
#            · Program Files (x86)\PrintExp_X64_V5.7.6.5.14.BS\Log
#            · ...V5.7.6.5.70.BS_U50\Log · C:\PrintExp_X64_V...(1)\PrintExp_X64_V...\Log
# 반환: 루트(설치본)당 최신 활동 Log 폴더 1개씩 — 활성 설치본이 2개면 모호(호출부가 보류).
function Get-PrintExpCandidates {
    param([string[]]$ScanBases = $null, [int]$RecentDays = 30)

    $bases = @()
    if ($ScanBases) { $bases = $ScanBases }
    else {
        foreach ($dv in [IO.DriveInfo]::GetDrives()) {
            if ($dv.DriveType -ne "Fixed") { continue }
            $r = $dv.RootDirectory.FullName
            $bases += $r
            foreach ($pf in @("Program Files", "Program Files (x86)")) {
                $p = Join-Path $r $pf
                if (Test-Path -LiteralPath $p) { $bases += $p }
            }
        }
    }

    $roots = @()
    foreach ($b in $bases) {
        # "*PrintExp*" = 접두사가 붙은 변종까지 잡는다 — RIC_PrintExp_X64(HSM-04 실측 2026-08-31) · PrintExp_XSJ(UV-1800).
        # ★ 앞을 고정하면 RIC_ 같은 접두사 설치본을 통째로 놓쳐 자동 전환이 조용히 안 된다. 마커 검증이 오탐을 걸러준다.
        try { $roots += [IO.Directory]::GetDirectories($b, "*PrintExp*") } catch { }
    }

    $script:PexRejects = @()   # 이름은 맞는데 탈락한 설치본 — 호출부가 admin-install.log 로 회수해 원인 진단
    $cands = @()
    foreach ($root in ($roots | Sort-Object -Unique)) {
        $logDirs = @()
        try { $logDirs = [IO.Directory]::GetDirectories($root, "Log", [IO.SearchOption]::AllDirectories) } catch { }
        $dirCands = @()
        $reason = "Log 폴더 없음"
        foreach ($ld in $logDirs) {
            foreach ($d in @($ld, (Join-Path $ld "main"))) {
                if (-not (Test-Path -LiteralPath $d)) { continue }
                $files = @()
                try { $files = [IO.Directory]::GetFiles($d, "Log[*].txt") } catch { }
                if ($files.Count -eq 0) { if ($reason -eq "Log 폴더 없음") { $reason = "일자 로그(Log[날짜].txt) 없음" }; continue }
                $infos = @($files | ForEach-Object { [IO.FileInfo]$_ } | Sort-Object LastWriteTime -Descending)
                if ($infos[0].LastWriteTime -lt (Get-Date).AddDays(-$RecentDays)) { $reason = ("최근 {0}일 기록 없음 (마지막 {1:yyyy-MM-dd})" -f $RecentDays, $infos[0].LastWriteTime); continue }
                # 마커 검증 — 오늘 파일에 아직 출력이 없을 수 있어 최신 3개까지 본다
                $hit = $false
                foreach ($fi in ($infos | Select-Object -First 3)) {
                    try {
                        $fs = [IO.File]::Open($fi.FullName, "Open", "Read", "ReadWrite")
                        try {
                            $take = [Math]::Min($fs.Length, 8MB)
                            $buf = New-Object byte[] $take
                            [void]$fs.Read($buf, 0, $take)
                        } finally { $fs.Close() }
                        foreach ($enc in @([Text.Encoding]::GetEncoding(936), [Text.Encoding]::Unicode)) {
                            if ($enc.GetString($buf).Contains("启动任务")) { $hit = $true; break }
                        }
                    } catch { }
                    if ($hit) { break }
                }
                if (-not $hit) { $reason = "마커(启动任务) 없음 — 로그 형식 상이"; continue }
                $dirCands += [pscustomobject]@{ Dir = $d; LastWrite = $infos[0].LastWriteTime }
            }
        }
        if ($dirCands.Count -gt 0) {
            $cands += ($dirCands | Sort-Object LastWrite -Descending | Select-Object -First 1)
        } else {
            $script:PexRejects += [pscustomobject]@{ Root = $root; Reason = $reason }
        }
    }
    return ,@($cands | Sort-Object LastWrite -Descending)
}

# ── 현재 설정에서 자동 전환 대상(tns 단일 watcher) 판정 ───────────
function Resolve-TnsWatcher {
    param([string]$AppDir)

    $eqPath = Join-Path $AppDir "equipment.json"
    if (Test-Path -LiteralPath $eqPath) {
        $eq = $null
        try { $eq = Get-Content -LiteralPath $eqPath -Raw | ConvertFrom-Json } catch { }
        if (-not $eq) { return @{ Ok = $false; Reason = "equipment.json 파싱 실패" } }
        $ws = @($eq.watchers)
        if ($ws.Count -ne 1) { return @{ Ok = $false; Reason = ("watcher " + $ws.Count + "개 — 단일 tns 구성만 자동 전환") } }
        $w = $ws[0]
        if ($w.parser_type -eq "tns_printexp") { return @{ Ok = $false; Already = $true; Reason = "이미 tns_printexp" } }
        if ($w.parser_type -ne "tns") { return @{ Ok = $false; Reason = ("parser_type=" + $w.parser_type + " — 대상 아님") } }
        if (-not $w.config.log_path) { return @{ Ok = $false; Reason = "config.log_path 없음" } }
        return @{ Ok = $true; EquipmentId = $w.equipment_id; Name = $w.name; LogPath = $w.config.log_path; Source = "equipment.json" }
    }

    $asPath = Join-Path $AppDir "appsettings.json"
    if (-not (Test-Path -LiteralPath $asPath)) { return @{ Ok = $false; Reason = "설정 파일 없음" } }
    $as = $null
    try { $as = Get-Content -LiteralPath $asPath -Raw | ConvertFrom-Json } catch { }
    if (-not $as) { return @{ Ok = $false; Reason = "appsettings.json 파싱 실패" } }
    $pt = $as.ParserType; if (-not $pt) { $pt = "TNS" }
    if ($pt -ne "TNS") { return @{ Ok = $false; Reason = ("ParserType=" + $pt + " — 대상 아님") } }
    $lp = $as.PrintLogPath
    if (-not $lp -or ($lp -notmatch "TNSRip")) { return @{ Ok = $false; Reason = ("PrintLogPath 가 TNSRip 계열이 아님: " + $lp) } }
    $eid = $as.EquipmentId
    if (-not $eid) { return @{ Ok = $false; Reason = "EquipmentId 미지정(호스트명 폴백 상태) — 자동 전환 보류" } }
    return @{ Ok = $true; EquipmentId = $eid; Name = $eid; LogPath = $lp; Source = "appsettings.json(레거시)" }
}

# ── tns_printexp equipment.json 생성 ─────────────────────────────
function New-TnsPrintExpJson {
    param([string]$EquipmentId, [string]$Name, [string]$LogPath, [string]$PrintDir)
    $obj = [ordered]@{
        poll_interval_seconds      = 5
        heartbeat_interval_seconds = 60
        watchers                   = @([ordered]@{
            _comment     = ("kit [2] auto-convert tns->tns_printexp " + (Get-Date -Format "yyyy-MM-dd HH:mm") + " — PrintExp autodetect. rollback=equipment.json.bak-*")
            equipment_id = $EquipmentId
            name         = $Name
            enabled      = $true
            parser_type  = "tns_printexp"
            config       = [ordered]@{
                log_path               = $LogPath
                print_log_dir          = $PrintDir
                join_tolerance_seconds = 30
                result_wait_seconds    = 180
                rip_fallback_hours     = 6
            }
        })
    }
    return ($obj | ConvertTo-Json -Depth 6)
}

# ── 서비스 시작 + 기동 검증 (+자동 전환분 FATAL 롤백) ─────────────
function Start-AndVerify {
    param([string]$AppDir, [bool]$AutoApplied, [string]$BackupStamp)

    $slog = Join-Path $AppDir "service.log"
    $before = 0
    try { if (Test-Path -LiteralPath $slog) { $before = (Get-Item -LiteralPath $slog).Length } } catch { }

    L "서비스 시작 중..."
    try { Start-Service $SvcName -ErrorAction Stop } catch { L ("  시작 실패: " + $_.Exception.Message) }
    Start-Sleep -Seconds 8
    L ("서비스 상태: " + (Get-Service $SvcName).Status)

    # 이번 기동으로 새로 붙은 로그만 본다 (과거 FATAL 오탐 방지)
    $appended = ""
    try {
        if (Test-Path -LiteralPath $slog) {
            $fs = [IO.File]::Open($slog, "Open", "Read", "ReadWrite")
            try {
                if ($fs.Length -gt $before) {
                    if ($before -gt 0) { [void]$fs.Seek($before, "Begin") }
                    $buf = New-Object byte[] ($fs.Length - $before)
                    [void]$fs.Read($buf, 0, $buf.Length)
                    $appended = [Text.Encoding]::UTF8.GetString($buf)
                }
            } finally { $fs.Close() }
        }
    } catch { L ("  service.log 확인 실패: " + $_.Exception.Message) }

    if ($appended -match "FATAL|Unknown parser") {
        if ($AutoApplied) {
            L "[오류] 기동 로그에 FATAL — 자동 전환 설정을 롤백합니다."
            $eqBak = Join-Path $AppDir ("equipment.json.bak-" + $BackupStamp)
            if (Test-Path -LiteralPath $eqBak) {
                Copy-Item $eqBak (Join-Path $AppDir "equipment.json") -Force
                L "  복원: equipment.json"
            } else {
                # 레거시 PC 에 새로 만든 파일 — 제거해 appsettings 단일 모드로 복귀
                Remove-Item -LiteralPath (Join-Path $AppDir "equipment.json") -Force -ErrorAction SilentlyContinue
                L "  equipment.json 제거 (레거시 모드 복귀)"
            }
            try { Restart-Service $SvcName -Force -ErrorAction Stop } catch { L ("  재시작 실패: " + $_.Exception.Message) }
            Start-Sleep -Seconds 3
            L ("롤백 후 서비스 상태: " + (Get-Service $SvcName).Status)
        } else {
            L "[경고] 기동 로그에 FATAL 감지 — service.log 확인 필요"
        }
    } else {
        if ($appended -match "first run") { L "  기동 확인: 새 파서 초기화(first run) 감지" }
        if ($appended -match "Monitoring") { L "  기동 확인: 감시 루프 진입(Monitoring) 감지" }
    }

    $verFile = Join-Path $AppDir "version.txt"
    if (Test-Path $verFile) { L ("배포 버전: " + (Get-Content $verFile -First 1)) }
    if (Test-Path $slog) {
        L "── service.log 마지막 5줄 ──"
        Get-Content $slog -Tail 5 -ErrorAction SilentlyContinue | ForEach-Object { L ("  " + $_) }
    }
}

if ($FunctionsOnly) { return }

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

    # ── tns → tns_printexp 자동 전환 (드롭인 적용 결과가 tns 여도 수행 — 손목록 배제) ──
    $autoApplied = $false
    try {
        $tw = Resolve-TnsWatcher -AppDir $appDir
        if ($tw.Ok) {
            L ("tns 구성 감지(" + $tw.Source + ", " + $tw.EquipmentId + ") — PrintExp 자동 탐지...")
            $cands = Get-PrintExpCandidates
            if ($cands.Count -eq 1) {
                L ("  PrintExp 확정: " + $cands[0].Dir + " (최근 기록 " + $cands[0].LastWrite.ToString("yyyy-MM-dd HH:mm") + ")")
                foreach ($c in @("appsettings.json", "equipment.json")) {
                    $t = Join-Path $appDir $c
                    if (Test-Path $t) { Copy-Item $t ($t + ".bak-" + $Stamp) -Force; L ("  기존 설정 백업: {0} → {0}.bak-{1}" -f $c, $Stamp) }
                }
                $json = New-TnsPrintExpJson -EquipmentId $tw.EquipmentId -Name $tw.Name -LogPath $tw.LogPath -PrintDir $cands[0].Dir
                [IO.File]::WriteAllText((Join-Path $appDir "equipment.json"), $json, (New-Object Text.UTF8Encoding($false)))
                L ("  ★ tns_printexp 자동 전환 적용 (" + $tw.EquipmentId + ") — 취소 감지+실소요 활성")
                $autoApplied = $true
            } elseif ($cands.Count -eq 0) {
                L "  PrintExp 미발견 — 기존 설정 유지 (키트가 이어서 서식지 센서스를 자동 수거합니다)"
                foreach ($rj in $script:PexRejects) { L ("    이름 일치·탈락: " + $rj.Root + " — " + $rj.Reason) }
            } else {
                L ("  PrintExp 활성 설치본 " + $cands.Count + "개(모호) — 자동 전환 보류, 목록:")
                foreach ($c2 in $cands) { L ("    - " + $c2.Dir) }
            }
        } elseif ($tw.Already) {
            L "tns_printexp 이미 적용됨 — 자동 전환 불필요"
        } else {
            L ("자동 전환 대상 아님: " + $tw.Reason)
        }
    } catch { L ("[경고] 자동 전환 중 오류(설정 불변): " + $_.Exception.Message) }

    Start-AndVerify -AppDir $appDir -AutoApplied $autoApplied -BackupStamp $Stamp
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

    Start-AndVerify -AppDir $appDir -AutoApplied $false -BackupStamp $Stamp
}

L "완료."
Read-Host "Enter 로 닫기"
