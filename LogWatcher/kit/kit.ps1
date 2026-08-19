# ================================================================
# MES LogWatcher 현장 키트 — 메뉴형 진단/설치/수거 (비관리자 파트)
#
# 실행: START.bat 더블클릭 (현장) | 인코딩: UTF-8 BOM 필수 (PS5.1 ANSI 오독 방지)
# 설계:
#  - 관리자 승격 세션은 네트워크 드라이브(Z:)가 안 보인다 → C: 작업(서비스 설치/교체)은
#    kit-admin.ps1 을 C:\Users\Public 스테이지로 복사한 뒤 승격 실행한다.
#  - 진단 수거물은 키트 폴더 옆 "수거\<PC명>-<시각>\" 에 쌓인다. 키트를 Z: 에서
#    실행하면 그 자체로 전달 완료, USB 면 USB 를 회수하면 된다.
#  - 판단이 필요한 일(파서 결정·equipment.json 작성)은 전부 개발자 몫 — 현장은
#    번호 선택과 y/n 만 한다.
# ================================================================
param(
    [string]$Action = "",          # 무인 테스트용: sweep | info
    [string]$TestRoot = ""         # sweep 테스트 시 스캔 루트 재정의
)

$ErrorActionPreference = "Continue"
$KitRoot  = Split-Path -Parent $MyInvocation.MyCommand.Path
$BinDir   = Join-Path $KitRoot "bin"
$Exe      = Join-Path $BinDir "LogWatcher.exe"
$PcName   = $env:COMPUTERNAME
$Stamp    = Get-Date -Format "yyyyMMdd-HHmm"
$Collect  = Join-Path $KitRoot ("수거\" + $PcName + "-" + $Stamp)
$StageDir = "C:\Users\Public\LogWatcher-stage"
$StageCfg = "C:\Users\Public\LogWatcher-stage-config"
$Utf8Bom  = New-Object System.Text.UTF8Encoding($true)

function Ensure-Collect {
    if (-not (Test-Path $Collect)) { New-Item -ItemType Directory -Force -Path $Collect | Out-Null }
    return $Collect
}

# ── PC 정보 수거 (RIP SW 식별의 1차 재료) ─────────────────────────
function Save-PcInfo {
    param([string]$EquipName = "", [string]$ProcessLabel = "")
    $dir = Ensure-Collect
    $sb = New-Object System.Text.StringBuilder
    [void]$sb.AppendLine("PC        : $PcName")
    [void]$sb.AppendLine("사용자    : $env:USERNAME")
    [void]$sb.AppendLine("일시      : " + (Get-Date -Format "yyyy-MM-dd HH:mm:ss"))
    if ($EquipName)    { [void]$sb.AppendLine("장비명(안): $EquipName") }
    if ($ProcessLabel) { [void]$sb.AppendLine("공정      : $ProcessLabel") }
    $ips = @()
    try {
        $ips = @(Get-NetIPAddress -AddressFamily IPv4 -ErrorAction Stop |
                 Where-Object { $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.254.*" } |
                 ForEach-Object { $_.IPAddress })
    } catch {
        $ips = @(ipconfig | Select-String "IPv4" | ForEach-Object { $_.ToString().Trim() })
    }
    [void]$sb.AppendLine("IP        : " + ($ips -join ", "))
    try { [void]$sb.AppendLine("OS        : " + (Get-CimInstance Win32_OperatingSystem).Caption) } catch {}
    [IO.File]::WriteAllText((Join-Path $dir "info.txt"), $sb.ToString(), $Utf8Bom)

    # 설치 프로그램 목록 — RIP/제어 SW 가 뭔지 이 목록에서 드러난다
    $keys = @("HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*",
              "HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*")
    $progs = foreach ($k in $keys) {
        try {
            Get-ItemProperty $k -ErrorAction SilentlyContinue |
                Where-Object { $_.DisplayName } |
                ForEach-Object { "{0}  [{1}]  {2}" -f $_.DisplayName, $_.DisplayVersion, $_.InstallLocation }
        } catch {}
    }
    $progs | Sort-Object -Unique | Set-Content (Join-Path $dir "installed-programs.txt") -Encoding UTF8

    # 실행 중 프로세스(경로 포함) — 장비 SW 가 떠 있으면 설치 위치가 여기 걸린다
    Get-Process -ErrorAction SilentlyContinue | ForEach-Object {
        $p = ""; try { $p = $_.Path } catch {}
        "{0}  {1}" -f $_.ProcessName, $p
    } | Sort-Object -Unique | Set-Content (Join-Path $dir "running-processes.txt") -Encoding UTF8

    # Program Files 폴더명 (레지스트리에 안 잡히는 무설치형 SW 대비)
    $pf = @()
    foreach ($p in @("C:\Program Files", "C:\Program Files (x86)")) {
        if (Test-Path $p) { $pf += @(Get-ChildItem $p -Directory -ErrorAction SilentlyContinue | ForEach-Object { $_.FullName }) }
    }
    $pf | Set-Content (Join-Path $dir "program-files.txt") -Encoding UTF8
    Write-Host "   PC 정보 수거 완료 (info / installed-programs / running-processes / program-files)"
}

# ── 최근 로그 파일 일괄 수거 — probe/discover 가 놓쳐도 원본이 남게 하는 안전망 ──
function Invoke-LogSweep {
    param([int]$Days = 3, [string[]]$Roots = @())
    $dir = Ensure-Collect
    $outLogs = Join-Path $dir "logs"
    $exts = @(".log", ".txt", ".html", ".htm", ".db", ".csv")
    $cut  = (Get-Date).AddDays(-$Days)
    $maxBytes = 50MB
    # 시스템/무관 경로 제외 (AppData 는 소음 대비 제외 — 확정 탐지는 --probe 가 담당)
    $excludeRe = '\\Windows\\|\\WinSxS\\|\\Package Cache\\|\\ProgramData\\Microsoft\\|\\ProgramData\\Packages|\\node_modules\\|\$Recycle|\\AppData\\|\\LogWatcher-stage'

    $driveScan = @()
    if ($Roots.Count -eq 0) {
        # 깊게 볼 곳(알려진 RIP 서식지) + 고정 드라이브 루트(얕게) — MarkerProbe.KnownRoots 와 정합
        $Roots = @("C:\TNSRip-X1", "C:\TNSRip-X11", "C:\ProgramData", "C:\Users\Public\Documents",
                   "C:\Program Files\SAi", "C:\Program Files (x86)\SAi", "C:\PrintExp_X64")
        try { $driveScan = @(Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3" -ErrorAction Stop | ForEach-Object { $_.DeviceID + "\" }) }
        catch { $driveScan = @("C:\") }
    }

    $files = @()
    foreach ($r in $Roots) {
        if (Test-Path $r) {
            $files += @(Get-ChildItem $r -Recurse -Depth 6 -File -ErrorAction SilentlyContinue |
                Where-Object { $exts -contains $_.Extension.ToLower() -and $_.LastWriteTime -gt $cut -and $_.FullName -notmatch $excludeRe })
        }
    }
    foreach ($d in $driveScan) {
        $files += @(Get-ChildItem $d -Recurse -Depth 3 -File -ErrorAction SilentlyContinue |
            Where-Object { $exts -contains $_.Extension.ToLower() -and $_.LastWriteTime -gt $cut -and $_.FullName -notmatch $excludeRe })
        # RIP 서식지가 C: 가 아닌 드라이브에 있으면(D:\PrintExp_X64 실측) 얕은 스캔(Depth 3)이
        # 하위 로그를 놓친다 → 알려진 폴더는 드라이브마다 깊게 훑는다.
        # Flora* = UV/실사 프린터 실구동 SW(RYPC, 출력실1 실측 D:\Flora XTRA3300S_KM1024I_N) — 이름 변형이
        # 많아(공백/언더스코어) 와일드카드로 루트 폴더를 열거한다.
        foreach ($kr in @("PrintExp_X64", "PrintExp_XSJ", "SAi", "TNSRip-X", "TNSRip-X1", "TNSRip-X11")) {
            $krPath = Join-Path $d $kr
            if (Test-Path $krPath) {
                $files += @(Get-ChildItem $krPath -Recurse -Depth 6 -File -ErrorAction SilentlyContinue |
                    Where-Object { $exts -contains $_.Extension.ToLower() -and $_.LastWriteTime -gt $cut -and $_.FullName -notmatch $excludeRe })
            }
        }
        foreach ($fd in @(Get-ChildItem $d -Directory -Filter "Flora*" -ErrorAction SilentlyContinue)) {
            $files += @(Get-ChildItem $fd.FullName -Recurse -Depth 6 -File -ErrorAction SilentlyContinue |
                Where-Object { $exts -contains $_.Extension.ToLower() -and $_.LastWriteTime -gt $cut -and $_.FullName -notmatch $excludeRe })
        }
    }

    $seen = @{}; $copied = @(); $skipped = @()
    foreach ($f in $files) {
        if ($seen.ContainsKey($f.FullName)) { continue }
        $seen[$f.FullName] = 1
        $rel = $f.FullName -replace "^([A-Za-z]):\\", '$1\'
        $dst = Join-Path $outLogs $rel
        $dp = Split-Path -Parent $dst
        if (-not (Test-Path $dp)) { New-Item -ItemType Directory -Force -Path $dp | Out-Null }
        if ($f.Length -gt $maxBytes) {
            # 대용량 로그는 통째 대신 꼬리 20MB 를 뜬다 — 실구동 로그(rp.log 1.18GB)가 통째 스킵돼
            # 취소검증 분석이 불가능했다(2026-08-12). 최근 기록은 꼬리에 있다.
            try {
                $tailBytes = 20MB
                $in = [IO.File]::Open($f.FullName, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::ReadWrite)
                try {
                    $in.Seek($f.Length - $tailBytes, [IO.SeekOrigin]::Begin) | Out-Null
                    $out = [IO.File]::Create($dst + ".tail")
                    try { $in.CopyTo($out) } finally { $out.Close() }
                } finally { $in.Close() }
                $copied += ("{0}  ({1:N0} bytes - 꼬리 20MB 만 수거)" -f $f.FullName, $f.Length)
            }
            catch { $skipped += ($f.FullName + "  (꼬리 수거 실패: " + $_.Exception.Message + ")") }
            continue
        }
        # ⚠️Copy-Item 금지: 파일명의 대괄호([2026-08-12])를 와일드카드로 해석해 조용히 아무것도
        #   안 복사하고, 비종결 오류라 catch 에도 안 걸려 "복사 성공" 목록에 오른다(2026-08-12 실측
        #   — PrintExp cld 일별 로그 전부 유실). .NET 스트림 = 리터럴 경로 + 잠긴 파일 공유읽기.
        try {
            $in = [IO.File]::Open($f.FullName, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::ReadWrite)
            try {
                $out = [IO.File]::Create($dst)
                try { $in.CopyTo($out) } finally { $out.Close() }
            } finally { $in.Close() }
            $copied += $f.FullName
        }
        catch { $skipped += ($f.FullName + "  (복사실패: " + $_.Exception.Message + ")") }
    }
    # 빈 배열이어도 파일이 남아야 "수거 안 됨"과 "수거할 게 없었음"이 구분된다
    [IO.File]::WriteAllLines((Join-Path $dir "collected-files.txt"), [string[]]$copied, $Utf8Bom)
    [IO.File]::WriteAllLines((Join-Path $dir "skipped-files.txt"),   [string[]]$skipped, $Utf8Bom)
    Write-Host ("   로그 수거: {0}개 복사, {1}개 건너뜀 (skipped-files.txt 참조)" -f $copied.Count, $skipped.Count)
}

# ── 제어 SW 서식지 센서스 — 확장자 무관 전체 파일 목록 + 최근 파일 수거 ──
# 스윕·discover 는 「로그 확장자 + 최근 3일 + AppData 제외」 필터라, 로그를 특이 확장자나
# AppData 에 쓰는 제어 SW(Flora RYPC 실측: 서식지에서 로그 0건)를 못 본다.
# 여기서는 ①실행 중 제어 SW 프로세스의 폴더 ②서식지 와일드카드 ③AppData/ProgramData 흔적을
# 확장자 무관으로 전수 목록화하고, 최근 변경된 작은 파일은 내용까지 수거한다 (2026-08-19).
function Invoke-HabitatCensus {
    param([int]$CollectDays = 7)
    $dir = Ensure-Collect
    $outDir = Join-Path $dir "census"

    $roots = New-Object System.Collections.Generic.List[string]
    # ① 실행 중인 제어/립 SW 프로세스의 설치 폴더 — RYPC 처럼 중첩 폴더(D:\220304\Flora_...)에
    #    살아도 프로세스 경로가 정확한 서식지를 알려준다
    foreach ($pr in @(Get-Process -ErrorAction SilentlyContinue)) {
        $pp = ""; try { $pp = $pr.Path } catch {}
        if (-not $pp) { continue }
        if ($pp -match '\\Windows\\|\\Microsoft') { continue }
        if ($pr.ProcessName -match 'RYPC|RipMain|PrintExp|Flora|TNS|Topaz|Rip|SOL|SPT') { [void]$roots.Add((Split-Path -Parent $pp)) }
    }
    # ② 서식지 와일드카드 (드라이브 루트 + Program Files)
    foreach ($dv in [IO.DriveInfo]::GetDrives()) {
        if ($dv.DriveType -ne "Fixed") { continue }
        $r = $dv.RootDirectory.FullName
        foreach ($base in @($r, (Join-Path $r "Program Files"), (Join-Path $r "Program Files (x86)"))) {
            if (-not (Test-Path -LiteralPath $base)) { continue }
            foreach ($pat in @("Flora*", "PrintExp*", "TNSRip*", "SOL-SPT*")) {
                try { foreach ($g in [IO.Directory]::GetDirectories($base, $pat)) { [void]$roots.Add($g) } } catch {}
            }
        }
    }
    # ③ AppData/ProgramData — 스윕이 제외하는 영역의 제어 SW 흔적
    foreach ($base in @($env:APPDATA, $env:LOCALAPPDATA, ($env:SystemDrive + "\ProgramData"))) {
        if (-not $base -or -not (Test-Path -LiteralPath $base)) { continue }
        foreach ($pat in @("Flora*", "RY*", "PrintExp*", "*Rip*", "Topaz*")) {
            try { foreach ($g in [IO.Directory]::GetDirectories($base, $pat)) { [void]$roots.Add($g) } } catch {}
        }
    }
    # 중복·중첩 루트 제거 (상위 루트가 이미 있으면 하위는 뺀다)
    $uniq = @($roots | Sort-Object -Unique)
    $tops = @()
    foreach ($r in $uniq) {
        $isChild = $false
        foreach ($t in $uniq) {
            if ($t -ne $r -and $r.StartsWith($t.TrimEnd('\') + '\', [StringComparison]::OrdinalIgnoreCase)) { $isChild = $true; break }
        }
        if (-not $isChild) { $tops += $r }
    }

    $noiseExt = @(".exe", ".dll", ".sys", ".ocx", ".drv", ".bpl", ".chm", ".cab", ".msi", ".ttf", ".otf", ".fon",
                  ".jpg", ".jpeg", ".png", ".bmp", ".gif", ".ico", ".tif", ".tiff", ".pdf", ".ai", ".eps", ".psd",
                  ".zip", ".rar", ".7z")
    $cut = (Get-Date).AddDays(-$CollectDays)
    $lines = New-Object System.Collections.Generic.List[string]
    $collected = 0; $maxCollect = 200
    $bigCollected = 0; $maxBigCollect = 5   # 대형 기록 파일(rec/history)은 별도 소량 상한

    function Copy-CensusFile([IO.FileInfo]$fi, [string]$dstPath, [long]$TailBytes = 0) {
        # 확장자 무관 수거 — Copy-Item 대괄호 함정 회피(.NET 공유읽기 스트림). TailBytes>0 = 꼬리만.
        $in = [IO.File]::Open($fi.FullName, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::ReadWrite)
        try {
            if ($TailBytes -gt 0 -and $fi.Length -gt $TailBytes) { $in.Seek($fi.Length - $TailBytes, [IO.SeekOrigin]::Begin) | Out-Null }
            $out = [IO.File]::Create($dstPath)
            try { $in.CopyTo($out) } finally { $out.Close() }
        } finally { $in.Close() }
    }

    foreach ($root in $tops) {
        $lines.Add("== " + $root + " ==")
        $files = @()
        try { $files = @([IO.Directory]::GetFiles($root, "*", [IO.SearchOption]::AllDirectories) | Select-Object -First 4000) }
        catch { $lines.Add("  (열람 실패: " + $_.Exception.Message + ")") }
        foreach ($f in $files) {
            $fi = $null; try { $fi = [IO.FileInfo]$f } catch { continue }
            $lines.Add(("  {0}`t{1}`t{2:yyyy-MM-dd HH:mm:ss}" -f $fi.FullName, $fi.Length, $fi.LastWriteTime))
            if ($fi.LastWriteTime -le $cut -or $fi.Length -eq 0) { continue }
            try {
                if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Force -Path $outDir | Out-Null }
                $safe = ($fi.FullName -replace "[:\\]", "_")
                if ($fi.Length -lt 5MB) {
                    if ($collected -ge $maxCollect) { continue }
                    if ($noiseExt -contains $fi.Extension.ToLower()) { continue }
                    Copy-CensusFile $fi (Join-Path $outDir $safe)
                    $collected++
                } elseif ($fi.Name -match "(?i)rec|history") {
                    # 대형 기록 파일 — Flora print_rec.dat(33~48MB) 실측(2026-08-19). 60MB 까지 통째,
                    # 그 이상은 꼬리 20MB (기록은 뒤에 쌓인다) + 구조 판독용 머리 2MB.
                    if ($bigCollected -ge $maxBigCollect) { continue }
                    if ($fi.Length -le 60MB) {
                        Copy-CensusFile $fi (Join-Path $outDir $safe)
                    } else {
                        Copy-CensusFile $fi ((Join-Path $outDir $safe) + ".tail") 20MB
                        $head = New-Object byte[] 2MB
                        $in2 = [IO.File]::Open($fi.FullName, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::ReadWrite)
                        try { $n2 = $in2.Read($head, 0, $head.Length) } finally { $in2.Close() }
                        [IO.File]::WriteAllBytes(((Join-Path $outDir $safe) + ".head"), $head[0..($n2-1)])
                    }
                    $bigCollected++
                }
            } catch { $lines.Add("    (수거 실패: " + $_.Exception.Message + ")") }
        }
    }
    [IO.File]::WriteAllLines((Join-Path $dir ("census-" + $PcName + ".txt")), $lines, $Utf8Bom)
    Write-Host ("   서식지 센서스: 루트 {0}곳 목록화, 최근 {1}일 파일 {2}개 + 대형 기록 {3}개 수거 (census 폴더)" -f $tops.Count, $CollectDays, $collected, $bigCollected)
}

# ── [1] 신규 장비 진단 ────────────────────────────────────────────
function Invoke-Diagnose {
    if (-not (Test-Path $Exe)) { Write-Host " [오류] bin\LogWatcher.exe 가 없습니다 — 키트 폴더를 통째로 복사했는지 확인하세요."; return }
    Write-Host ""
    Write-Host "── 신규 장비 진단 ─────────────────────────────────"
    Write-Host "  공정 선택:  1)수성  2)솔벤  3)UV  4)평판  5)간판  6)전사  7)기타"
    $p = Read-Host "  번호"
    $map = @{ "1" = @("AQUA", "수성"); "2" = @("SOLV", "솔벤"); "3" = @("UV", "UV");
              "4" = @("FLAT", "평판"); "5" = @("SIGN", "간판"); "6" = @("TRANS", "전사"); "7" = @("ETC", "기타") }
    if (-not $map.ContainsKey($p)) { Write-Host "  잘못된 번호입니다."; return }
    $prefix = $map[$p][0]; $label = $map[$p][1]
    $unit = Read-Host "  호기 번호 (그냥 Enter = 01)"
    if (-not $unit) { $unit = "01" }
    $equip = "$prefix-$unit"
    Write-Host ("  장비명(안): {0}  ({1}) — 최종 확정은 개발자가 합니다" -f $equip, $label)
    Save-PcInfo -EquipName $equip -ProcessLabel $label

    $ans = Read-Host "  지금 이 장비에서 실제 출력 1건이 가능합니까? 원단·잉크가 소모됩니다 (y/n)"
    if ($ans -match "^[yY]") {
        Write-Host "  → 마커 진단(--probe): 화면 안내에 따라 바탕화면에 생긴 마커 파일을 평소처럼 출력하세요."
        $probeOut = Join-Path (Ensure-Collect) "probe-output.txt"
        & $Exe --probe --template (Join-Path $KitRoot "marker-template.jpg") | Tee-Object -FilePath $probeOut
    } else {
        Write-Host "  → 최근 로그 자동 탐색(--discover)만 수행합니다."
        $discOut = Join-Path (Ensure-Collect) "discover-output.txt"
        & $Exe --discover --days 3 | Tee-Object -FilePath $discOut
        Get-ChildItem $BinDir -Filter "discover-*.json" -ErrorAction SilentlyContinue |
            Copy-Item -Destination (Ensure-Collect) -Force
    }

    Write-Host "  → 최근 3일 로그 파일 수거 중... (수 분 걸릴 수 있습니다)"
    Invoke-LogSweep -Days 3
    Write-Host "  → 제어 SW 서식지 센서스 중... (확장자 무관 목록+최근 파일)"
    Invoke-HabitatCensus -CollectDays 7
    Write-Host ""
    Write-Host "  [완료] 수거 폴더: $Collect"
    Write-Host "         Z: 에서 실행했다면 이미 전달된 것입니다. USB 라면 USB 를 회수해 주세요."
}

# ── [2] 설치/업데이트 ─────────────────────────────────────────────
function Invoke-InstallUpdate {
    if (-not (Test-Path $Exe)) { Write-Host " [오류] bin\LogWatcher.exe 가 없습니다 — 키트 폴더를 통째로 복사했는지 확인하세요."; return }
    Write-Host ""
    Write-Host "── LogWatcher 설치/업데이트 ───────────────────────"
    $svc = Get-Service LogWatcher -ErrorAction SilentlyContinue
    $cfgSrc = Join-Path $KitRoot ("config\" + $PcName)
    if ($svc) {
        Write-Host ("  기존 서비스 발견 (상태: {0}) → 새 버전으로 교체합니다. 설정(appsettings/equipment.json)은 보존됩니다." -f $svc.Status)
    } elseif (Test-Path $cfgSrc) {
        Write-Host "  신규 설치: 키트에 이 PC 용 설정(config\$PcName)이 준비되어 있습니다."
    } else {
        Write-Host "  이 PC 에는 서비스도 없고 키트에 config\$PcName 설정도 없습니다."
        Write-Host "  → 먼저 [1] 진단을 실행해 수거물을 개발자에게 전달하세요."
        Write-Host "    (개발자가 설정을 만들어 키트에 넣으면 이 메뉴가 신규 설치를 진행합니다)"
        return
    }
    $go = Read-Host "  진행할까요? (y/n)"
    if ($go -notmatch "^[yY]") { return }

    Write-Host "  → C: 스테이징 복사 (관리자 창은 Z:/USB 를 못 보므로 먼저 로컬로 옮깁니다)"
    robocopy $BinDir $StageDir /MIR /R:2 /W:2 /NFL /NDL /NJH | Out-Null
    if ($LASTEXITCODE -ge 8) { Write-Host "  [오류] 스테이징 복사 실패 (robocopy $LASTEXITCODE)"; return }
    Copy-Item (Join-Path $KitRoot "kit-admin.ps1") $StageDir -Force
    if (Test-Path $StageCfg) { Remove-Item $StageCfg -Recurse -Force }
    if (Test-Path $cfgSrc) { Copy-Item $cfgSrc $StageCfg -Recurse -Force }

    Write-Host "  → 관리자 권한 창이 뜨면 [예] 를 누르세요."
    try {
        Start-Process powershell -ArgumentList "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "$StageDir\kit-admin.ps1" -Verb RunAs -Wait
    } catch {
        Write-Host ("  [오류] 관리자 실행이 거부되었습니다: " + $_.Exception.Message)
        return
    }
    $alog = Join-Path $StageDir "admin-install.log"
    if (Test-Path $alog) {
        Copy-Item $alog (Ensure-Collect) -Force
        Write-Host "  ── 설치 로그 (마지막 25줄 — 자동 전환 결과 포함) ──"
        Get-Content $alog -Tail 25 | ForEach-Object { Write-Host ("    " + $_) }
        # PrintExp 미발견 PC = 제어 SW 정체 미상 — 별도 [1] 방문 없이 이 자리에서 센서스로 수거한다
        if (([IO.File]::ReadAllText($alog)) -match "미발견") {
            Write-Host "  → PrintExp 미발견 — 제어 SW 서식지 센서스 자동 수거 중..."
            Invoke-HabitatCensus -CollectDays 7
        }
    } else {
        Write-Host "  [경고] 설치 로그가 없습니다 — 관리자 창에서 작업이 실행되지 않았을 수 있습니다."
    }
}

# ── [3] EPSON 취소코드 수거 ───────────────────────────────────────
function Invoke-EpsonCollect {
    Write-Host ""
    Write-Host "── EPSON 취소코드 수거 (EPSON Edge Print PC 전용) ──"
    $db = "C:\ProgramData\Epson\Epson Edge Print\DB\Data.db"
    if (-not (Test-Path $db)) {
        $found = $null
        if (Test-Path "C:\ProgramData\Epson") {
            $found = Get-ChildItem "C:\ProgramData\Epson" -Recurse -Filter "Data.db" -ErrorAction SilentlyContinue | Select-Object -First 1
        }
        if ($found) { $db = $found.FullName }
        else { Write-Host "  이 PC 에서 EPSON Edge Print DB(Data.db)를 찾지 못했습니다."; return }
    }
    Write-Host "  DB: $db"
    Write-Host ""
    Write-Host "  ★ 목적: 취소가 DB 에 어떤 코드로 남는지 확정하기 위한 수거입니다."
    Write-Host "    1. Edge Print 에서 작은 잡 1건을 출력 시작하세요."
    Write-Host "    2. 시작 직후 그 잡을 [취소] 하세요."
    Read-Host  "    취소를 완료했으면 Enter"
    $cancelAt = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $dir = Join-Path (Ensure-Collect) "epson"
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
    foreach ($f in @($db, "$db-wal", "$db-shm")) {
        if (Test-Path $f) {
            try { Copy-Item $f $dir -Force; Write-Host ("    복사: " + $f) }
            catch { Write-Host ("    복사 실패: " + $f + " — " + $_.Exception.Message) }
        }
    }
    [IO.File]::WriteAllText((Join-Path $dir "epson-info.txt"),
        ("취소 실행 시각: {0}`r`nDB 원본: {1}`r`n" -f $cancelAt, $db), $Utf8Bom)
    Write-Host "  [완료] $dir"
}

# ── [4] FLEXI 취소검증 (KM전사 등 FlexiPRINT PC) ──────────────────
# RIPLOG 는 "전송" 로그다 — 전송 완료 후의 취소(프린터에서)가 기록에 남는지,
# 전송 중 취소(Production Manager 에서)와 어떻게 다른지 실측하는 안내 절차.
function Invoke-FlexiCancelTest {
    Write-Host ""
    Write-Host "── FLEXI 취소검증 (FlexiPRINT / Production Manager PC 전용) ──"
    Write-Host "  ★ 목적: 전송이 끝난 뒤의 취소가 RIPLOG 에 남는지 실측합니다."

    # RIPLOG 위치 — 이 PC 에 설치된 LogWatcher 설정에서 우선 확보, 없으면 SAi 폴더 검색
    $ripLogs = @()
    $eqJson = "C:\Logwatcher\equipment.json"
    if (Test-Path $eqJson) {
        try {
            $cfg = Get-Content $eqJson -Raw | ConvertFrom-Json
            foreach ($w in @($cfg.watchers)) {
                if ($w.parser_type -eq "flexi" -and $w.config.log_path) { $ripLogs += $w.config.log_path }
            }
        } catch {}
    }
    if ($ripLogs.Count -eq 0) {
        foreach ($root in @("C:\Program Files\SAi", "C:\Program Files (x86)\SAi", "C:\ProgramData\SAi")) {
            if (Test-Path $root) {
                $ripLogs += @(Get-ChildItem $root -Recurse -Filter "RIPLOG.HTML" -ErrorAction SilentlyContinue |
                              ForEach-Object { $_.FullName })
            }
        }
    }
    if ($ripLogs.Count -eq 0) {
        Write-Host "  [중단] RIPLOG.HTML 을 찾지 못했습니다 — FlexiPRINT 가 있는 PC 에서 실행하세요."
        return
    }
    Write-Host ("  RIPLOG: " + ($ripLogs -join ", "))

    Write-Host ""
    Write-Host "  실험 1 — 전송이 끝난 뒤 취소 (프린터 본체에서)"
    Write-Host "    1. 작은 테스트 작업(1~2매)을 평소처럼 출력하세요."
    Write-Host "    2. Production Manager 에서 그 작업의 립핑/전송이 [완료] 로 바뀐 걸 확인하세요."
    Write-Host "    3. 1분쯤 기다렸다가 (인쇄는 아직 진행 중일 때) ★프린터 본체 조작부★ 에서 취소하세요."
    Read-Host  "    취소를 완료했으면 Enter"
    $t1 = Get-Date -Format "yyyy-MM-dd HH:mm:ss"

    Write-Host ""
    Write-Host "  실험 2 — 전송 중 취소 (Production Manager 화면에서)"
    Write-Host "    4. 같은 작업을 다시 출력하세요."
    Write-Host "    5. 이번엔 시작 직후 (전송 진행 중일 때) ★Production Manager 화면★ 에서 작업을 취소하세요."
    Read-Host  "    취소를 완료했으면 Enter"
    $t2 = Get-Date -Format "yyyy-MM-dd HH:mm:ss"

    Write-Host ""
    Read-Host  "  기록이 로그에 쓰이도록 2분쯤 기다렸다가 Enter"

    $dir = Join-Path (Ensure-Collect) "flexi-cancel"
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
    $i = 0
    foreach ($rl in $ripLogs) {
        if (Test-Path $rl) {
            $i++
            try { Copy-Item $rl (Join-Path $dir ("RIPLOG-" + $i + ".HTML")) -Force; Write-Host ("    복사: " + $rl) }
            catch { Write-Host ("    복사 실패: " + $rl + " — " + $_.Exception.Message) }
        }
    }
    [IO.File]::WriteAllText((Join-Path $dir "cancel-info.txt"),
        ("실험1(전송 후·프린터 취소): {0}`r`n실험2(전송 중·PM 취소): {1}`r`nRIPLOG: {2}`r`n" -f $t1, $t2, ($ripLogs -join "; ")), $Utf8Bom)

    Write-Host "  프린터 상태/드라이버 로그가 따로 있는지 함께 수거합니다 (최근 3일)..."
    Save-PcInfo -ProcessLabel "FLEXI 취소검증"
    Invoke-LogSweep
    Write-Host ""
    Write-Host ("  [완료] 수거 폴더를 개발자에게 전달하세요: " + $Collect)
}

# ── 무인 테스트 진입점 ────────────────────────────────────────────
if ($Action -eq "sweep") {
    if ($TestRoot) { Invoke-LogSweep -Days 3650 -Roots @($TestRoot) } else { Invoke-LogSweep }
    exit 0
}
if ($Action -eq "info") { Save-PcInfo; exit 0 }
if ($Action -eq "census") { Invoke-HabitatCensus; exit 0 }

# ── 메인 메뉴 ─────────────────────────────────────────────────────
while ($true) {
    Write-Host ""
    Write-Host "===================================================="
    Write-Host ("  MES LogWatcher 현장 키트    PC: " + $PcName)
    $verFile = Join-Path $BinDir "version.txt"
    if (Test-Path $verFile) { Write-Host ("  버전: " + (Get-Content $verFile -First 1)) }
    Write-Host "===================================================="
    Write-Host "  [1] 신규 장비 진단   (로그 위치 찾기 + 수거)"
    Write-Host "  [2] LogWatcher 설치/업데이트"
    Write-Host "  [3] EPSON 취소코드 수거   (EPSON PC 전용)"
    Write-Host "  [4] FLEXI 취소검증        (KM전사 등 FlexiPRINT PC 전용)"
    Write-Host "  [0] 종료"
    $sel = Read-Host "  선택"
    if ($sel -eq "0") { break }
    switch ($sel) {
        "1" { Invoke-Diagnose }
        "2" { Invoke-InstallUpdate }
        "3" { Invoke-EpsonCollect }
        "4" { Invoke-FlexiCancelTest }
        default { Write-Host "  1/2/3/4/0 중에서 선택하세요." }
    }
}
