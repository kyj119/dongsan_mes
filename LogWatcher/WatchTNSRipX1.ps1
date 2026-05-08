# TNSRip-X1 폴더 변화 감시 스크립트
# 사용법: PowerShell에서 .\WatchTNSRipX1.ps1 실행
# 종료: Ctrl+C

$watchPath = "C:\TNSRip-X1"
$logFile = "C:\Users\user\dongsan_mes\LogWatcher\x1_changes.log"

Write-Host "=== TNSRip-X1 폴더 감시 시작 ===" -ForegroundColor Green
Write-Host "감시 경로: $watchPath" -ForegroundColor Cyan
Write-Host "로그 저장: $logFile" -ForegroundColor Cyan
Write-Host "출력 작업을 실행하면 변화가 여기에 표시됩니다." -ForegroundColor Yellow
Write-Host "종료: Ctrl+C" -ForegroundColor Yellow
Write-Host ""

# 초기 상태 스냅샷 (파일 크기, 수정시간)
$snapshot = @{}
Get-ChildItem $watchPath -Recurse -File -ErrorAction SilentlyContinue | ForEach-Object {
    $snapshot[$_.FullName] = @{ Length = $_.Length; LastWrite = $_.LastWriteTime }
}
Write-Host "초기 스냅샷: $($snapshot.Count)개 파일" -ForegroundColor Gray

function Log-Change($type, $path, $detail) {
    $time = Get-Date -Format "HH:mm:ss.fff"
    $rel = $path.Replace($watchPath, "").TrimStart("\")
    $msg = "[$time] $type | $rel | $detail"
    Write-Host $msg -ForegroundColor $(switch($type) {
        "NEW" { "Green" }
        "MOD" { "Yellow" }
        "DEL" { "Red" }
        "SIZE" { "Cyan" }
        default { "White" }
    })
    Add-Content -Path $logFile -Value $msg -Encoding UTF8
}

# 감시 루프 (1초 간격)
try {
    while ($true) {
        Start-Sleep -Seconds 1

        $current = @{}
        Get-ChildItem $watchPath -Recurse -File -ErrorAction SilentlyContinue | ForEach-Object {
            $current[$_.FullName] = @{ Length = $_.Length; LastWrite = $_.LastWriteTime }
        }

        # 새 파일 감지
        foreach ($f in $current.Keys) {
            if (-not $snapshot.ContainsKey($f)) {
                Log-Change "NEW" $f "size=$($current[$f].Length)"
            }
        }

        # 삭제된 파일 감지
        foreach ($f in $snapshot.Keys) {
            if (-not $current.ContainsKey($f)) {
                Log-Change "DEL" $f "was $($snapshot[$f].Length) bytes"
            }
        }

        # 수정된 파일 감지 (크기 또는 수정시간 변경)
        foreach ($f in $current.Keys) {
            if ($snapshot.ContainsKey($f)) {
                $old = $snapshot[$f]
                $new = $current[$f]
                if ($old.Length -ne $new.Length) {
                    $diff = $new.Length - $old.Length
                    $sign = if ($diff -gt 0) { "+" } else { "" }
                    Log-Change "SIZE" $f "$($old.Length) -> $($new.Length) (${sign}${diff} bytes)"
                }
                elseif ($old.LastWrite -ne $new.LastWrite) {
                    Log-Change "MOD" $f "time changed"
                }
            }
        }

        $snapshot = $current
    }
}
catch {
    Write-Host "`n감시 종료" -ForegroundColor Gray
}
