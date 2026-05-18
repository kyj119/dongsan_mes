<#
  D1 Daily Backup Script
  Windows Task Scheduler: daily 02:00
  Storage: Z:\Backups\D1\daily\ + monthly\
  Retention: daily 90 days, monthly indefinite
#>

$ErrorActionPreference = "Stop"

$ProjectDir = "C:\Users\user\dongsan_mes"
$BackupRoot = "Z:\Backups\D1"
$DailyDir   = Join-Path $BackupRoot "daily"
$MonthlyDir = Join-Path $BackupRoot "monthly"
$LogFile    = Join-Path $BackupRoot "backup.log"

$Date  = Get-Date -Format "yyyy-MM-dd"
$Month = Get-Date -Format "yyyy-MM"
$Day   = Get-Date -Format "dd"
$Now   = Get-Date -Format "yyyy-MM-dd HH:mm:ss"

function Write-Log {
    param([string]$msg)
    $line = "[$Now] $msg"
    Write-Host $line
    Add-Content -Path $LogFile -Value $line -Encoding UTF8
}

try {
    New-Item -ItemType Directory -Path $DailyDir -Force | Out-Null
    New-Item -ItemType Directory -Path $MonthlyDir -Force | Out-Null

    Write-Log "=== D1 backup start ==="

    Set-Location $ProjectDir
    $ExportFile = Join-Path $BackupRoot "backup_temp.sql"
    Write-Log "Exporting D1 database..."

    $output = & npx wrangler d1 export webapp-production --remote --output=$ExportFile 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "wrangler d1 export failed (exit code: $LASTEXITCODE) $output"
    }

    $FileInfo = Get-Item $ExportFile
    $SizeMB = [math]::Round($FileInfo.Length / 1MB, 2)
    Write-Log "Export done: ${SizeMB}MB"

    if ($FileInfo.Length -lt 1024) {
        throw "Backup file too small ($($FileInfo.Length) bytes)"
    }

    # Daily backup
    $DailyFile = Join-Path $DailyDir "$Date.sql"
    Copy-Item $ExportFile $DailyFile -Force
    Write-Log "Daily saved: $DailyFile"

    # Monthly backup (1st of month)
    if ($Day -eq "01") {
        $MonthlyFile = Join-Path $MonthlyDir "$Month.sql"
        Copy-Item $ExportFile $MonthlyFile -Force
        Write-Log "Monthly saved: $MonthlyFile"
    }

    Remove-Item $ExportFile -Force

    # Cleanup daily backups older than 90 days
    $Cutoff = (Get-Date).AddDays(-90)
    Get-ChildItem $DailyDir -Filter "*.sql" | Where-Object { $_.LastWriteTime -lt $Cutoff } | ForEach-Object {
        Remove-Item $_.FullName -Force
        Write-Log "Deleted old: $($_.Name)"
    }

    # Summary
    $DailyCount = (Get-ChildItem $DailyDir -Filter "*.sql" | Measure-Object).Count
    $MonthlyCount = (Get-ChildItem $MonthlyDir -Filter "*.sql" | Measure-Object).Count
    $TotalSize = [math]::Round(((Get-ChildItem $BackupRoot -Recurse -File | Measure-Object -Property Length -Sum).Sum / 1MB), 1)

    Write-Log "=== Backup complete ==="
    Write-Log "  Daily: ${DailyCount} / Monthly: ${MonthlyCount} / Total: ${TotalSize}MB"

} catch {
    Write-Log "FAILED: $_"
    exit 1
}
