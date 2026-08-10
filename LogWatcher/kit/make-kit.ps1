# ================================================================
# MES LogWatcher 현장 키트 — 개발 PC 전용 빌드/조립/배포
#
# 사용:  .\make-kit.ps1                  # publish + Z:\Designs\LogWatcher-kit 조립
#        .\make-kit.ps1 -SkipBuild       # 빌드 생략, 조립만
#        .\make-kit.ps1 -OutDir <경로>   # 다른 위치로 조립 (로컬 테스트용)
#
# 조립 시 인코딩 계약을 강제한다:
#  - kit.ps1 / kit-admin.ps1 → UTF-8 BOM (PS5.1 이 BOM 없는 ps1 을 ANSI 로 읽는 함정)
#  - START.bat → ASCII + CRLF (비 ASCII 발견 시 조립 중단 — 콘솔 코드페이지 사고 방지)
#  - equipment*.json 은 키트 bin 에 절대 포함하지 않는다 (장비별 설정은 config\<PC명>\)
# ================================================================
param(
    [switch]$SkipBuild,
    [string]$OutDir = "Z:\Designs\LogWatcher-kit"
)
$ErrorActionPreference = "Stop"
$KitSrc   = Split-Path -Parent $MyInvocation.MyCommand.Path
$LwDir    = Split-Path -Parent $KitSrc
$BuildOut = Join-Path $KitSrc "out\bin"

# ── 1. 빌드 ──
if (-not $SkipBuild) {
    Write-Host "== dotnet publish (Release, win-x64 self-contained 다중파일) =="
    dotnet publish (Join-Path $LwDir "LogWatcher.csproj") -c Release -o $BuildOut
    if ($LASTEXITCODE -ne 0) { throw "dotnet publish 실패" }
}
if (-not (Test-Path (Join-Path $BuildOut "LogWatcher.exe"))) { throw "빌드 산출물이 없습니다: $BuildOut" }

# ── 2. 버전 지문 (현장에서 어느 빌드인지 식별) ──
$rev = ""
try { $rev = (& git -C $LwDir rev-parse --short HEAD) } catch {}
$ver = "kit git={0} built={1}" -f $rev, (Get-Date -Format "yyyy-MM-dd HH:mm")
Set-Content (Join-Path $BuildOut "version.txt") $ver -Encoding ASCII

# ── 3. bin 조립 ──
Write-Host "== 키트 조립 → $OutDir =="
if (-not (Test-Path $OutDir)) { New-Item -ItemType Directory -Force -Path $OutDir | Out-Null }
robocopy $BuildOut (Join-Path $OutDir "bin") /MIR /R:2 /W:2 /NFL /NDL /NJH /XF equipment.json equipment.*.json | Out-Null
if ($LASTEXITCODE -ge 8) { throw "robocopy bin 실패 ($LASTEXITCODE)" }
Copy-Item (Join-Path $LwDir "publish\nssm.exe") (Join-Path $OutDir "bin\nssm.exe") -Force
Copy-Item (Join-Path $LwDir "install-service.bat") (Join-Path $OutDir "bin\install-service.bat") -Force

# ── 4. 키트 스크립트 (인코딩 강제) ──
$utf8bom = New-Object System.Text.UTF8Encoding($true)
foreach ($f in @("kit.ps1", "kit-admin.ps1")) {
    $c = [IO.File]::ReadAllText((Join-Path $KitSrc $f))
    [IO.File]::WriteAllText((Join-Path $OutDir $f), $c, $utf8bom)
}
$bat = [IO.File]::ReadAllText((Join-Path $KitSrc "START.bat"))
if ($bat -match "[^\u0000-\u007F]") { throw "START.bat 에 비 ASCII 문자가 있습니다 — 규칙 위반 (install-service.bat 헤더 참조)" }
$bat = $bat -replace "`r?`n", "`r`n"
[IO.File]::WriteAllText((Join-Path $OutDir "START.bat"), $bat, [System.Text.Encoding]::ASCII)

$readme = [IO.File]::ReadAllText((Join-Path $KitSrc "README-field.txt"))
[IO.File]::WriteAllText((Join-Path $OutDir "README.txt"), $readme, $utf8bom)

$cfgDir = Join-Path $OutDir "config"
if (-not (Test-Path $cfgDir)) { New-Item -ItemType Directory -Force -Path $cfgDir | Out-Null }
$cfgReadme = [IO.File]::ReadAllText((Join-Path $KitSrc "config-README.txt"))
[IO.File]::WriteAllText((Join-Path $cfgDir "README.txt"), $cfgReadme, $utf8bom)

# ── 5. 마커 템플릿 (JPG — 대부분의 RIP 이 바로 연다. --probe 가 바탕화면에 복사해 쓴다) ──
Add-Type -AssemblyName System.Drawing
$bmp = New-Object System.Drawing.Bitmap(800, 500)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.Clear([System.Drawing.Color]::White)
$pen = New-Object System.Drawing.Pen([System.Drawing.Color]::Black, 8)
$g.DrawRectangle($pen, 10, 10, 779, 479)
$font1 = New-Object System.Drawing.Font("Arial", 72, [System.Drawing.FontStyle]::Bold)
$g.DrawString("MES PROBE", $font1, [System.Drawing.Brushes]::Black, 40, 170)
$font2 = New-Object System.Drawing.Font("Arial", 20)
$g.DrawString("test print - discard after use", $font2, [System.Drawing.Brushes]::Black, 45, 320)
$bmp.Save((Join-Path $OutDir "marker-template.jpg"), [System.Drawing.Imaging.ImageFormat]::Jpeg)
$g.Dispose(); $bmp.Dispose(); $pen.Dispose(); $font1.Dispose(); $font2.Dispose()

# ── 6. 결과 ──
Write-Host ""
Write-Host "== 조립 완료 =="
Write-Host ("   " + $ver)
Get-ChildItem $OutDir | ForEach-Object { Write-Host ("   " + $_.Name) }
Write-Host ""
Write-Host "현장 사용: 폴더째 복사(또는 Z: 직접) → START.bat 더블클릭"
exit 0   # robocopy 성공코드(1~7)가 스크립트 종료코드로 전파되는 것 차단
