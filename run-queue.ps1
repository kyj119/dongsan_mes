# run-queue.ps1 — Claude 작업 큐 러너 (headless, 작업당 새 세션)
# spec: docs/superpowers/specs/2026-06-11-claude-queue-runner.md
# 사용:
#   .\run-queue.ps1            # pending 큐 순차 실행
#   .\run-queue.ps1 -DryRun    # 실행 순서만 표시
#   .\run-queue.ps1 -StopOnFail# 실패 시 전체 중단 (기본: 계속 진행)
# 정책(2026-06-11 확정): 실패해도 계속(D1) / 커밋 금지=사람 커밋(D2) / 기본 opus(D3)
# ⚠️ 러너 실행 중 대화형 세션(로컬 Claude Code/Cowork)으로 코드 작업 금지 (충돌)

param(
  [switch]$DryRun,
  [switch]$StopOnFail
)

$ErrorActionPreference = 'Stop'
$root     = $PSScriptRoot
$qPending = Join-Path $root 'queue\pending'
$qRunning = Join-Path $root 'queue\running'
$qDone    = Join-Path $root 'queue\done'
$qFailed  = Join-Path $root 'queue\failed'
$qLogs    = Join-Path $root 'queue\logs'
$lock     = Join-Path $root '.claude\.queue-runner.lock'

foreach ($d in @($qPending, $qRunning, $qDone, $qFailed, $qLogs)) {
  if (!(Test-Path $d)) { New-Item -ItemType Directory -Path $d -Force | Out-Null }
}

# ── 락 (이중 실행 방지) ──
if (Test-Path $lock) {
  Write-Host "[중단] 락 파일 존재: $lock" -ForegroundColor Red
  Write-Host "다른 러너가 실행 중이거나 비정상 종료입니다. 확인 후 락 파일을 삭제하고 재실행하세요."
  exit 1
}

$tasks = Get-ChildItem $qPending -Filter *.md -ErrorAction SilentlyContinue | Sort-Object Name
if (-not $tasks -or $tasks.Count -eq 0) {
  Write-Host "큐가 비어 있습니다: queue\pending\NN-작업명.md 형식으로 추가하세요." -ForegroundColor Yellow
  exit 0
}

if ($DryRun) {
  Write-Host "=== DryRun — 실행 순서 ===" -ForegroundColor Cyan
  $tasks | ForEach-Object { Write-Host ("  {0}" -f $_.Name) }
  exit 0
}

New-Item -ItemType File -Path $lock -Force | Out-Null
$results = @()
$startAll = Get-Date

try {
  foreach ($t in $tasks) {
    $name    = $t.BaseName
    $runPath = Join-Path $qRunning $t.Name
    Move-Item $t.FullName $runPath

    # ── frontmatter 파싱 (model / max_turns) ──
    $raw      = Get-Content $runPath -Raw -Encoding UTF8
    $model    = 'opus'
    $maxTurns = 60
    $body     = $raw
    if ($raw -match '(?s)^---\s*\r?\n(.*?)\r?\n---\s*\r?\n(.*)$') {
      $fm = $Matches[1]; $body = $Matches[2]
      if ($fm -match 'model:\s*(\S+)')     { $model    = $Matches[1] }
      if ($fm -match 'max_turns:\s*(\d+)') { $maxTurns = [int]$Matches[1] }
    }

    $logPath = Join-Path $qLogs ("{0}_{1}.log" -f (Get-Date -Format 'yyyyMMdd-HHmm'), $name)
    Write-Host ""
    Write-Host ("=== [{0}] 시작 — model={1}, max_turns={2} ===" -f $name, $model, $maxTurns) -ForegroundColor Cyan
    $startTask = Get-Date

    # ── headless 실행 (새 세션) — stdin으로 지시문 전달 ──
    $body | claude -p --model $model --max-turns $maxTurns --permission-mode acceptEdits 2>&1 |
      Tee-Object -FilePath $logPath
    $code = $LASTEXITCODE
    $dur  = [math]::Round(((Get-Date) - $startTask).TotalMinutes, 1)

    if ($code -eq 0) {
      Move-Item $runPath (Join-Path $qDone $t.Name) -Force
      $results += [pscustomobject]@{ Task = $name; Result = 'OK'; Min = $dur }
      Write-Host ("=== [{0}] 완료 ({1}분) ===" -f $name, $dur) -ForegroundColor Green
    } else {
      Move-Item $runPath (Join-Path $qFailed $t.Name) -Force
      $results += [pscustomobject]@{ Task = $name; Result = "FAIL($code)"; Min = $dur }
      Write-Host ("=== [{0}] 실패 exit={1} ({2}분) — 로그: {3} ===" -f $name, $code, $dur, $logPath) -ForegroundColor Red
      if ($StopOnFail) { Write-Host "[정책] -StopOnFail — 전체 중단"; break }
    }
  }
}
finally {
  Remove-Item $lock -Force -ErrorAction SilentlyContinue
}

# ── 요약 ──
$durAll = [math]::Round(((Get-Date) - $startAll).TotalMinutes, 1)
Write-Host ""
Write-Host ("=== 큐 종료 — 총 {0}분 ===" -f $durAll) -ForegroundColor Cyan
$results | Format-Table -AutoSize
$fail = @($results | Where-Object { $_.Result -ne 'OK' })
if ($fail.Count -gt 0) {
  Write-Host ("실패 {0}건 → queue\failed\ 확인 후 수정해 pending\으로 재투입" -f $fail.Count) -ForegroundColor Yellow
} else {
  Write-Host "전건 성공 — diff 검토 후 커밋하세요 (커밋은 사람이, D2 정책)" -ForegroundColor Green
}
