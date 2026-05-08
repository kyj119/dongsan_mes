using System;
using System.Collections.Generic;
using System.IO;
using System.Text;
using System.Text.RegularExpressions;

namespace LogWatcher
{
    /// <summary>
    /// 중국어 PrintExp 텍스트 로그 파서.
    /// 로그 형식: [HH:MM:SS][모듈][레벨][코드] 메시지
    /// 인코딩: UTF-16LE, 일별 파일: Log[YYYY_MM_DD].txt
    /// </summary>
    public class PrintExpLogParser : ILogParser
    {
        private readonly string _logFolder;
        private readonly string _positionFile;
        private string _currentDate;  // "yyyy_MM_dd" 형식
        private long _lastPosition;
        private PendingJob? _pendingJob;

        // 상태 머신용 내부 클래스
        private class PendingJob
        {
            public string FileName { get; set; } = "";
            public string JobId { get; set; } = "";
            public string StartTime { get; set; } = "";
            public string DpiX { get; set; } = "";
            public string DpiY { get; set; } = "";
            public string WidthMm { get; set; } = "";
            public string HeightMm { get; set; } = "";
            public string PrintMode { get; set; } = "";
            public int ColorCount { get; set; } = 0;
        }

        // Regex: 로그 줄 시간 추출
        private static readonly Regex TimeRegex = new(@"^\[(\d{2}:\d{2}:\d{2})\]", RegexOptions.Compiled);

        // Regex: 인쇄 시작 (界面操作 모듈에서 启动打印)
        private static readonly Regex PrintStartRegex = new(@"\[(\d{2}:\d{2}:\d{2})\].*\[界面操作\]-启动打印", RegexOptions.Compiled);

        // Regex: 작업 정보 (파일명, 작업ID, 상태코드)
        private static readonly Regex JobInfoRegex = new(
            @"\[(\d{2}:\d{2}:\d{2})\].*作业【(.+?)】打印完成\.作业ID:\s*(-?\d+),\s*作业状态\s*:\s*(\d+)",
            RegexOptions.Compiled);

        // Regex: 규격 정보 (DPI, 크기, 색상, 모드)
        private static readonly Regex SpecRegex = new(
            @"任务精度:(\d+)\s*X\s*(\d+),图像大小:([\d.]+)mm\s*X\s*([\d.]+)mm,颜色数量:(\d+),打印模式:(.+)",
            RegexOptions.Compiled);

        // Regex: 인쇄 완료
        private static readonly Regex PrintDoneRegex = new(@"_PrintWait---打印完成", RegexOptions.Compiled);

        // Regex: 누적 횟수 (선택적 — 현재는 파싱만 하고 이벤트 생성 안 함)
        private static readonly Regex CumulativeRegex = new(
            @"作业【(.+?)】打印完成\.作业ID[：:]\s*(-?\d+),\s*总次数:(\d+),\s*调用次数:(\d+)",
            RegexOptions.Compiled);

        // Regex: 통신 에러
        private static readonly Regex CommErrorRegex = new(@"接收数据包失败", RegexOptions.Compiled);

        // Regex: OrderNumber + FileSeq 추출 (기존 PrintLogParser와 동일)
        private static readonly Regex FileSeqRegex = new(@"^(\d{8}-\d{3})-(\d{3})-", RegexOptions.Compiled);
        private static readonly Regex OrderNumberRegex = new(@"(\d{8}-\d{3})", RegexOptions.Compiled);

        public PrintExpLogParser(string logFolder, string positionFile)
        {
            _logFolder = logFolder;
            _positionFile = positionFile;
            _currentDate = DateTime.Now.ToString("yyyy_MM_dd");
            (_lastPosition, _currentDate) = LoadPosition();
        }

        /// <summary>
        /// 현재 날짜의 로그 파일 경로를 반환.
        /// </summary>
        private string GetLogFilePath(string date)
        {
            return Path.Combine(_logFolder, $"Log[{date}].txt");
        }

        /// <summary>
        /// 새 로그 엔트리를 읽어 PrintEvent 목록을 반환.
        /// </summary>
        public List<PrintEvent> ReadNewEntries()
        {
            var events = new List<PrintEvent>();

            try
            {
                string today = DateTime.Now.ToString("yyyy_MM_dd");

                // 날짜가 바뀌면 position 리셋
                if (today != _currentDate)
                {
                    Console.WriteLine($"[INFO] PrintExp: date changed {_currentDate} → {today}, resetting position");
                    _currentDate = today;
                    _lastPosition = 0;
                    _pendingJob = null;
                    SavePosition();
                }

                var logPath = GetLogFilePath(_currentDate);

                if (!File.Exists(logPath))
                {
                    Console.WriteLine($"[WARN] PrintExp log not found: {logPath}");
                    return events;
                }

                using var fs = new FileStream(logPath, FileMode.Open, FileAccess.Read, FileShare.ReadWrite);
                var fileLength = fs.Length;

                // 첫 실행: 파일 끝으로 이동 (새 이벤트만 모니터링)
                if (_lastPosition < 0)
                {
                    _lastPosition = fileLength;
                    SavePosition();
                    Console.WriteLine($"[INFO] PrintExp: first run, skipping to end (position: {fileLength})");
                    return events;
                }

                // 파일 축소(로테이션) 감지
                if (_lastPosition > fileLength)
                {
                    Console.WriteLine("[INFO] PrintExp: log file truncated, resetting to 0");
                    _lastPosition = 0;
                }

                if (_lastPosition >= fileLength)
                    return events;

                // UTF-16LE: BOM(2바이트) 건너뜀
                if (_lastPosition == 0 && fileLength >= 2)
                    _lastPosition = 2;

                if (_lastPosition >= fileLength)
                    return events;

                fs.Seek(_lastPosition, SeekOrigin.Begin);
                var newBytes = new byte[fileLength - _lastPosition];
                int bytesRead = fs.Read(newBytes, 0, newBytes.Length);

                if (bytesRead == 0)
                    return events;

                // UTF-16LE로 디코딩
                var text = Encoding.Unicode.GetString(newBytes, 0, bytesRead);
                var lines = text.Split('\n');

                foreach (var rawLine in lines)
                {
                    var line = rawLine.TrimEnd('\r');
                    if (string.IsNullOrWhiteSpace(line))
                        continue;

                    var newEvents = ProcessLine(line);
                    events.AddRange(newEvents);
                }

                _lastPosition = fileLength;
                SavePosition();

                if (events.Count > 0)
                    Console.WriteLine($"[INFO] PrintExp: found {events.Count} new print events");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[ERROR] PrintExp: failed to read log: {ex.Message}");
            }

            return events;
        }

        /// <summary>
        /// 한 줄을 파싱하여 상태 머신 업데이트 및 이벤트 생성.
        /// </summary>
        private List<PrintEvent> ProcessLine(string line)
        {
            var events = new List<PrintEvent>();

            // 1. 인쇄 시작: 启动打印
            var startMatch = PrintStartRegex.Match(line);
            if (startMatch.Success)
            {
                _pendingJob = new PendingJob
                {
                    StartTime = startMatch.Groups[1].Value
                };
                Console.WriteLine($"[PrintExp] Print start detected at {_pendingJob.StartTime}");
                return events;
            }

            // 2. 작업 정보: 作业【file】...作业状态 :10
            var jobMatch = JobInfoRegex.Match(line);
            if (jobMatch.Success)
            {
                string jobStatus = jobMatch.Groups[4].Value;
                // 작업 상태 10 = 정상 완료
                if (jobStatus == "10" && _pendingJob != null)
                {
                    // 파일명에서 .prt 확장자 제거
                    string rawName = jobMatch.Groups[2].Value;
                    _pendingJob.FileName = rawName.EndsWith(".prt", StringComparison.OrdinalIgnoreCase)
                        ? rawName[..^4]
                        : rawName;
                    _pendingJob.JobId = jobMatch.Groups[3].Value;
                    Console.WriteLine($"[PrintExp] Job info: {_pendingJob.FileName} (id={_pendingJob.JobId})");
                }
                return events;
            }

            // 3. 규격 정보: 任务精度
            var specMatch = SpecRegex.Match(line);
            if (specMatch.Success && _pendingJob != null)
            {
                _pendingJob.DpiX = specMatch.Groups[1].Value;
                _pendingJob.DpiY = specMatch.Groups[2].Value;
                _pendingJob.WidthMm = specMatch.Groups[3].Value;
                _pendingJob.HeightMm = specMatch.Groups[4].Value;
                if (int.TryParse(specMatch.Groups[5].Value, out int cc))
                    _pendingJob.ColorCount = cc;
                _pendingJob.PrintMode = specMatch.Groups[6].Value.Trim();
                return events;
            }

            // 4. 인쇄 완료: _PrintWait---打印完成
            if (PrintDoneRegex.IsMatch(line) && _pendingJob != null)
            {
                var timeMatch = TimeRegex.Match(line);
                string endTime = timeMatch.Success ? timeMatch.Groups[1].Value : DateTime.Now.ToString("HH:mm:ss");

                var evt = BuildPrintEvent(_pendingJob, endTime, "OK");
                if (evt != null)
                {
                    events.Add(evt);
                    Console.WriteLine($"[PrintExp] Print complete: {evt.FileName}");
                }
                _pendingJob = null;
                return events;
            }

            // 5. 통신 에러: 接收数据包失败
            if (CommErrorRegex.IsMatch(line) && _pendingJob != null)
            {
                var timeMatch = TimeRegex.Match(line);
                string endTime = timeMatch.Success ? timeMatch.Groups[1].Value : DateTime.Now.ToString("HH:mm:ss");

                var evt = BuildPrintEvent(_pendingJob, endTime, "ERROR");
                if (evt != null)
                {
                    events.Add(evt);
                    Console.WriteLine($"[PrintExp] Comm error during: {evt.FileName}");
                }
                _pendingJob = null;
                return events;
            }

            return events;
        }

        /// <summary>
        /// PendingJob 정보로 PrintEvent를 생성.
        /// </summary>
        private PrintEvent? BuildPrintEvent(PendingJob job, string endTime, string status)
        {
            if (string.IsNullOrEmpty(job.FileName))
            {
                Console.WriteLine("[WARN] PrintExp: BuildPrintEvent called with empty FileName, skipping");
                return null;
            }

            string dateStr = DateTime.Now.ToString("yyyy.MM.dd");

            var evt = new PrintEvent
            {
                PrintStatus = status,
                FileName = job.FileName,
                FilePath = Path.Combine(_logFolder, job.FileName),
                StartDate = dateStr,
                StartTime = job.StartTime,
                EndDate = dateStr,
                EndTime = endTime,
                PrinterName = job.PrintMode,
                OutputSize = (!string.IsNullOrEmpty(job.WidthMm) && !string.IsNullOrEmpty(job.HeightMm))
                    ? $"{job.WidthMm} X {job.HeightMm}"
                    : "",
                Dpi = (!string.IsNullOrEmpty(job.DpiX) && !string.IsNullOrEmpty(job.DpiY))
                    ? $"{job.DpiX} x {job.DpiY} DPI"
                    : ""
            };

            // OrderNumber + FileSeq 추출 (기존 PrintLogParser와 동일한 regex)
            var seqMatch = FileSeqRegex.Match(evt.FileName);
            if (seqMatch.Success)
            {
                evt.OrderNumber = seqMatch.Groups[1].Value;
                evt.FileSeq = int.Parse(seqMatch.Groups[2].Value);
            }
            else
            {
                var orderMatch = OrderNumberRegex.Match(evt.FileName);
                if (orderMatch.Success)
                    evt.OrderNumber = orderMatch.Groups[1].Value;
            }

            return evt;
        }

        /// <summary>
        /// position 파일에서 날짜|오프셋 형태로 읽기.
        /// </summary>
        private (long position, string date) LoadPosition()
        {
            try
            {
                if (File.Exists(_positionFile))
                {
                    string content = File.ReadAllText(_positionFile).Trim();
                    var parts = content.Split('|');
                    if (parts.Length == 2)
                    {
                        string savedDate = parts[0];
                        if (long.TryParse(parts[1], out long pos))
                            return (pos, savedDate);
                    }
                    // 구버전 포맷(숫자만) 처리: 날짜는 오늘로
                    if (long.TryParse(content, out long legacyPos))
                        return (legacyPos, DateTime.Now.ToString("yyyy_MM_dd"));
                }
            }
            catch { }
            return (-1, DateTime.Now.ToString("yyyy_MM_dd")); // 첫 실행: 파일 끝으로 이동
        }

        private void SavePosition()
        {
            try
            {
                File.WriteAllText(_positionFile, $"{_currentDate}|{_lastPosition}");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[WARN] PrintExp: failed to save position: {ex.Message}");
            }
        }

        /// <summary>
        /// 처음부터 재파싱 (테스트 모드용).
        /// </summary>
        public void ResetPosition()
        {
            _lastPosition = 0;
            _pendingJob = null;
            SavePosition();
        }
    }
}
