<#
  일러스트레이터 프로세스 자원 추적 — 「자원이 모자라서인가」를 **재서** 답한다.

  ★왜 필요한가 (2026-09-09)
    실기(DESKTOP-6JSH6OL)에서 가공 도중 ExtendScript 의 File.open('w') 이 로컬 temp 와 Z: 에서
    **동시에** I/O 오류를 낸다. 일러 자신의 export 도 실패한다("p0.png 를 내보낼 수 없음").
    「자원 고갈」이 유력해 보였지만 반증이 있다 — 09-07 실패 건은 EPS 1.9MB 로 소형이었고,
    가공 실패 **직후** 환경 점검은 전부 통과했다(즉시 회복). 디스크도 156GB 여유다.
    ⇒ 추측을 멈추고 잰다. 핸들/GDI/USER 는 **용량이 아니라 한도**라 PC 성능과 무관하게 걸린다
      (GDI 는 프로세스당 기본 10,000개 — 레지스트리 상한이지 메모리 문제가 아니다).

  쓰는 법
    1) 일러를 켠 상태에서 이 창을 열어 둔다
    2) .\scripts\probe-illustrator-resources.ps1
    3) 다른 창(일러)에서 가공 1건 → 재단 굽기를 실행한다
    4) Ctrl+C 로 멈추면 요약이 나온다. CSV 는 %TEMP%\ia-resources.csv

  판정
    · 실패 시점에 Handles/GDI 가 **치솟거나 한도(10,000)에 붙어 있으면** → 자원 한도
    · 실패해도 **아무 값도 안 움직이면** → 자원 문제가 아니다(일러 30.3.0 / CEP 엔진 축)
#>
param(
  [int]$IntervalMs = 1000,
  [string]$Out = "$env:TEMP\ia-resources.csv",
  [switch]$Summary   # 이미 찍어 둔 CSV 만 다시 읽어 판정한다(추적 없이)
)

# ★판정은 **중단 방식과 무관**해야 한다 (2026-09-09).
#   Ctrl+C 는 finally 를 돌리지만 강제 종료(작업관리자·Stop-Process)는 건너뛴다 —
#   그러면 55줄을 찍어 놓고도 답을 못 얻는다. CSV 만 있으면 언제든 다시 판정한다.
function Show-Verdict([string]$csv) {
  if (-not (Test-Path $csv)) { Write-Output ("CSV 가 없습니다: " + $csv); return }
  $rows = Import-Csv $csv
  if (-not $rows -or $rows.Count -eq 0) { Write-Output "CSV 가 비었습니다."; return }
  $mH = ($rows | Measure-Object handles -Maximum).Maximum
  $mG = ($rows | Measure-Object gdi -Maximum).Maximum
  $mU = ($rows | Measure-Object user -Maximum).Maximum
  $mM = ($rows | Measure-Object workingSetMB -Maximum).Maximum
  $nH = ($rows | Measure-Object handles -Minimum).Minimum
  $nG = ($rows | Measure-Object gdi -Minimum).Minimum
  Write-Output ""
  Write-Output ("── 판정 (" + $rows.Count + "회 표본, " + $rows[0].time + " ~ " + $rows[-1].time + ") ──")
  Write-Output ("핸들  " + $nH + " → " + $mH + "   (증가 " + ($mH - $nH) + ")")
  Write-Output ("GDI   " + $nG + " → " + $mG + " / 10000")
  Write-Output ("USER  최고 " + $mU + " / 10000")
  Write-Output ("메모리 최고 " + $mM + " MB")
  Write-Output ""
  if ($mG -ge 9000 -or $mU -ge 9000) {
    Write-Output "⚠ GDI/USER 개체가 한도(10,000)에 붙었습니다 — 자원 한도가 원인입니다."
  } elseif (($mH - $nH) -gt 5000) {
    Write-Output "⚠ 핸들이 크게 늘었습니다 — 누적 소비를 의심하세요."
  } else {
    Write-Output "→ 자원 한도에 여유가 있습니다. 이 구간에 실패가 났다면 **자원 문제가 아닙니다**"
    Write-Output "   (다음: 실패 직후 [파일▸스크립트]로 mes-probe.jsx 를 돌려 CEP/메뉴 문맥을 가르세요)"
  }
}

if ($Summary) { Show-Verdict $Out; exit 0 }

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class IaGui {
  [DllImport("user32.dll")] public static extern uint GetGuiResources(IntPtr hProcess, uint uiFlags);
}
"@ -ErrorAction SilentlyContinue

$proc = Get-Process Illustrator -ErrorAction SilentlyContinue
if (-not $proc) { Write-Output "일러스트레이터가 실행 중이 아닙니다. 켠 뒤 다시 실행하세요."; exit 1 }

Write-Output ("추적 시작 — PID {0} · {1}ms 간격" -f $proc.Id, $IntervalMs)
Write-Output ("CSV: {0}" -f $Out)
Write-Output "일러에서 가공 1건 → 재단 굽기를 실행하세요. 멈추려면 Ctrl+C."
Write-Output ""
Write-Output "시각       핸들    GDI    USER   메모리MB  스레드"

"time,handles,gdi,user,workingSetMB,threads" | Out-File -FilePath $Out -Encoding utf8

$peakH = 0; $peakG = 0; $peakU = 0; $peakM = 0
try {
  while ($true) {
    $p = Get-Process -Id $proc.Id -ErrorAction SilentlyContinue
    if (-not $p) { Write-Output "일러가 종료됐습니다."; break }
    $h = $p.HandleCount
    $g = [IaGui]::GetGuiResources($p.Handle, 0)   # 0 = GDI 개체
    $u = [IaGui]::GetGuiResources($p.Handle, 1)   # 1 = USER 개체
    $m = [int]($p.WorkingSet64 / 1MB)
    $t = $p.Threads.Count
    if ($h -gt $peakH) { $peakH = $h }
    if ($g -gt $peakG) { $peakG = $g }
    if ($u -gt $peakU) { $peakU = $u }
    if ($m -gt $peakM) { $peakM = $m }
    $ts = (Get-Date).ToString("HH:mm:ss")
    Write-Output ("{0}   {1,6}  {2,5}  {3,5}   {4,7}   {5,5}" -f $ts, $h, $g, $u, $m, $t)
    "$ts,$h,$g,$u,$m,$t" | Out-File -FilePath $Out -Append -Encoding utf8
    Start-Sleep -Milliseconds $IntervalMs
  }
} finally {
  Show-Verdict $Out
  Write-Output ("CSV: " + $Out)
  Write-Output "다시 보려면:  .\scripts\probe-illustrator-resources.ps1 -Summary"
}
