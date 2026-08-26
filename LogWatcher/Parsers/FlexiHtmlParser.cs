using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Text;
using System.Text.RegularExpressions;
using LogWatcher.Config;
using LogWatcher.Core;

namespace LogWatcher.Parsers
{
    /// <summary>
    /// Parses SAi FlexiPRINT RIPLOG.HTML for print completion events.
    /// Tracks "인쇄 시작" ... "출력 끝" blocks (actual prints, not RIP-only jobs).
    /// Append-only HTML file, tracked by byte offset like PrintLogParser.
    /// </summary>
    public class FlexiHtmlParser : IEquipmentParser
    {
        private readonly string _logPath;
        private readonly string _positionFile;
        private long _lastPosition;
        private Encoding? _enc;   // RIPLOG 인코딩 — PC 별로 갈린다. 첫 비ASCII 청크에서 1회 확정 후 고정.
        private long _knownLength = -1;   // 직전 폴에서 본 파일 길이 (‘비워짐’ 과 ‘위치 어긋남’ 을 가르는 유일한 근거)

        public string EquipmentId { get; }
        public string Name { get; }

        // Block delimiters
        private const string PRINT_START = "인쇄 시작";
        private const string PRINT_END = "출력 끝";
        private const string RIP_START = "립핑 작업 개시";   // 립핑(RIP) 블록 — 실제 멤버 파일명 보유

        // 네스팅 역추적 상태 (폴링 호출 간 유지)
        //  - _ripBuffer: 직전 인쇄 이후 누적된 립핑 파일명 (다음 인쇄가 flush)
        //  - _lastNestBySize: 파일크기→멤버 (보류 재출력 시 멤버 상속용)
        private readonly List<RipEntry> _ripBuffer = new();
        private readonly Dictionary<string, List<NestMember>> _lastNestBySize = new();

        // 립핑 블록 1개에서 뽑은 멤버 후보 (파일·규격·수량·프로파일)
        private class RipEntry
        {
            public string File = "";
            public double W;            // mm
            public double H;            // mm
            public int Qty = 1;         // 인쇄매수
            public string Profile = ""; // 출력 ICC 프로파일 (네스트와 매칭용)
        }

        // "네스팅(20개 작업)" 에서 N 추출
        private static readonly Regex NestCountRegex = new(@"네스팅\((\d+)", RegexOptions.Compiled);

        // Field extraction: <TH...>label</TH>\n<TD...>value</TD>
        // Handles multi-line and &nbsp; padding
        private static readonly Regex FieldRegex = new(
            @"<TH[^>]*>\s*(?:&nbsp;\s*)*(.+?)(?:\s*&nbsp;)*\s*</TH>\s*</TR>\s*<TR>\s*" +
            @"(?:(?!</TH>).)*?" +   // skip to next row if needed
            @"<TD[^>]*>(?:<font[^>]*>)?\s*(?:&nbsp;\s*)*(.+?)(?:\s*&nbsp;)*\s*(?:</font>)?\s*</TD>",
            RegexOptions.Compiled | RegexOptions.Singleline | RegexOptions.IgnoreCase);

        // Simpler: just find TH label and next TD value on nearby lines
        private static readonly Regex SimpleFieldRegex = new(
            @"<TH[^>]*>[^<]*(?:&nbsp;[; ]*)*([^<]+?)(?:\s*&nbsp;)*\s*\n?</TH>\s*\n?" +
            @"<TD[^>]*>(?:<font[^>]*>)?[^<]*(?:&nbsp;[; ]*)*([^<&]+)",
            RegexOptions.Compiled | RegexOptions.IgnoreCase);

        // Korean datetime: "오후 12:08:01 2026-04-11" or "오전 9:30:00 2026-04-11"
        private static readonly Regex KoreanDateTimeRegex = new(
            @"(오전|오후)\s+(\d{1,2}):(\d{2}):(\d{2})\s+(\d{4})-(\d{2})-(\d{2})",
            RegexOptions.Compiled);

        // Dimensions: "1100.4 x 600.4mm" or "79.0 x 43.3 in"
        private static readonly Regex DimensionRegex = new(
            @"([\d.]+)\s*x\s*([\d.]+)\s*(mm|in)",
            RegexOptions.Compiled | RegexOptions.IgnoreCase);

        // Order number from filename
        private static readonly Regex FileSeqRegex = new(@"^(\d{8}-\d{3})-(\d{3})-", RegexOptions.Compiled);
        private static readonly Regex OrderNumberRegex = new(@"(\d{8}-\d{3})", RegexOptions.Compiled);

        static FlexiHtmlParser()
        {
            try { Encoding.RegisterProvider(CodePagesEncodingProvider.Instance); } catch { /* 이미 등록됨 */ }
        }

        public FlexiHtmlParser(WatcherConfig config, string positionsDir)
        {
            EquipmentId = config.EquipmentId;
            Name = config.Name;
            _logPath = config.GetConfigString("log_path");

            if (string.IsNullOrEmpty(_logPath))
                throw new ArgumentException($"[{EquipmentId}] config.log_path is required for flexi parser");

            _positionFile = Path.Combine(positionsDir, $"{EquipmentId}.pos");
            _lastPosition = LoadPosition();
        }

        public List<PrintEvent> ReadNewEntries()
        {
            var events = new List<PrintEvent>();

            if (!File.Exists(_logPath))
            {
                Console.WriteLine($"[{EquipmentId}] RIPLOG.HTML not found: {_logPath}");
                return events;
            }

            try
            {
                using var fs = new FileStream(_logPath, FileMode.Open, FileAccess.Read, FileShare.ReadWrite);
                var fileLength = fs.Length;

                // First run: skip to end
                if (_lastPosition < 0)
                {
                    _lastPosition = fileLength;
                    _knownLength = fileLength;
                    SavePosition();
                    Console.WriteLine($"[{EquipmentId}] First run — skipping to end (position: {fileLength})");
                    return events;
                }

                // RIPLOG 는 append-only 다. 위치가 길이를 넘었다면 둘 중 하나다 —
                //  (a) 사용자가 로그를 비웠다  (b) 우리 위치계산이 어긋났다.
                // 예전엔 무조건 0 으로 되돌렸는데, (b)에서는 68MB 를 5초마다 다시 읽고 다시 어긋나는
                // 무한 루프가 된다(2026-08-26 실측: HYB-3200-01 service.log 77,608줄이 전부 이 줄, 실적 0건).
                // ★ 둘을 가르는 근거는 **길이 이력** 하나뿐이다 — 파일이 실제로 줄었는가.
                //   길이를 모르면(구버전 .pos) 끝으로 정렬한다: 그래야 업그레이드 첫 폴에서
                //   1년치 과거가 한꺼번에 재송출되지 않는다. 비움을 놓쳐도 손실은 다음 폴까지의 몇 초뿐.
                if (_lastPosition > fileLength)
                {
                    if (_knownLength >= 0 && fileLength < _knownLength)
                    {
                        Console.WriteLine($"[{EquipmentId}] RIPLOG.HTML 비워짐 ({_knownLength} → {fileLength}) — 0 부터 재시작");
                        _lastPosition = 0;
                        _ripBuffer.Clear();
                        _lastNestBySize.Clear();
                    }
                    else
                    {
                        Console.WriteLine($"[{EquipmentId}] ⚠ 위치가 파일 길이를 넘었습니다 ({_lastPosition} > {fileLength}) — 파일 끝으로 정렬");
                        _lastPosition = fileLength;
                        _knownLength = fileLength;
                        SavePosition();
                        return events;
                    }
                }

                if (_lastPosition >= fileLength)
                    return events;

                // Read new content
                fs.Seek(_lastPosition, SeekOrigin.Begin);
                var newBytes = new byte[fileLength - _lastPosition];
                int bytesRead = fs.Read(newBytes, 0, newBytes.Length);
                if (bytesRead == 0) return events;

                var enc = ResolveEncoding(newBytes, bytesRead);
                var newContent = enc.GetString(newBytes, 0, bytesRead);

                // 모든 <TABLE>...</TABLE> 블록을 순서대로 스캔.
                //  - 립핑(RIP) 블록 → 멤버 파일명을 _ripBuffer 에 누적
                //  - 인쇄(PRINT) 블록 → PrintEvent 생성 (네스트면 멤버로 분해) + 버퍼 flush
                int searchFrom = 0;
                int lastCompleteEnd = -1;

                while (true)
                {
                    int startIdx = newContent.IndexOf("<TABLE", searchFrom, StringComparison.OrdinalIgnoreCase);
                    if (startIdx < 0) break;

                    int tableEnd = newContent.IndexOf("</TABLE>", startIdx, StringComparison.OrdinalIgnoreCase);
                    if (tableEnd < 0) break; // incomplete table — wait for more data
                    tableEnd += "</TABLE>".Length;

                    var block = newContent.Substring(startIdx, tableEnd - startIdx);
                    ProcessBlock(block, events);

                    lastCompleteEnd = tableEnd;
                    searchFrom = tableEnd;
                }

                // 마지막 완료 블록 끝까지 위치 전진 (char index → byte offset).
                // ★ 반드시 **읽을 때 쓴 인코딩**으로 센다. UTF-8 로 고정하면 cp949 파일에서
                //   한글 1자(2바이트)가 U+FFFD 2개(6바이트)로 계산돼 위치가 3배 빨리 달아난다.
                if (lastCompleteEnd >= 0)
                {
                    _lastPosition += enc.GetByteCount(newContent.Substring(0, lastCompleteEnd));
                }

                _knownLength = fileLength;
                SavePosition();

                if (events.Count > 0)
                    Console.WriteLine($"[{EquipmentId}] Found {events.Count} new print events");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[{EquipmentId}] Error reading RIPLOG.HTML: {ex.Message}");
            }

            return events;
        }

        /// <summary>
        /// 단일 TABLE 블록을 분류 처리.
        ///  - 립핑(RIP) 블록: 멤버 파일명을 _ripBuffer 에 누적
        ///  - 인쇄(PRINT) 블록: PrintEvent 생성. 네스트면 _ripBuffer 를 중복제거해 멤버로 분해.
        /// </summary>
        private void ProcessBlock(string block, List<PrintEvent> events)
        {
            bool isPrint = block.Contains(PRINT_START);
            bool isRip = !isPrint && block.Contains(RIP_START);

            if (isRip)
            {
                // 립핑 블록: 멤버 후보를 구조화 캡처 (파일·치수(mm)·인쇄매수·프로파일)
                var rfields = ExtractFields(block);
                var rf = rfields.GetValueOrDefault("파일:", "");
                if (!string.IsNullOrWhiteSpace(rf))
                {
                    var (rw, rh) = ParseDimMm(rfields.GetValueOrDefault("치수:", ""));
                    int.TryParse(rfields.GetValueOrDefault("인쇄 매수:", "").Trim(), out int rqty);
                    if (rqty <= 0) rqty = 1;
                    _ripBuffer.Add(new RipEntry
                    {
                        File = rf.Trim(), W = rw, H = rh, Qty = rqty,
                        Profile = rfields.GetValueOrDefault("출력 ICC 프로파일:", "").Trim()
                    });
                }
                return;
            }

            if (!isPrint) return; // 그 외 테이블(헤더 등) 무시

            var evt = ParsePrintBlock(block);
            if (evt == null) return; // 파일 정보 없는 비정상 블록 — 버퍼 보존

            var fields = ExtractFields(block);
            var fileVal = fields.GetValueOrDefault("파일:", "");
            var jobType = fields.GetValueOrDefault("작업 유형:", "");
            bool nest = jobType.Contains("네스팅") || fileVal.Contains("네스팅");

            if (nest)
            {
                evt.IsNest = true;
                var m = NestCountRegex.Match(fileVal);
                int N = m.Success ? int.Parse(m.Groups[1].Value) : 0;
                evt.NestDeclaredCount = N;

                // 멤버 선택:
                //  1) 네스트와 같은 출력 ICC 프로파일인 립핑만 후보 (다른 설정 작업 배제)
                //  2) 최근(끝)순으로 distinct 파일을 N개까지 채택 (토글/무관 립핑 과다포집 방지)
                var nestProfile = fields.GetValueOrDefault("출력 ICC 프로파일:", "").Trim();
                var candidates = _ripBuffer;
                if (!string.IsNullOrEmpty(nestProfile))
                {
                    var filtered = _ripBuffer.FindAll(r => r.Profile == nestProfile);
                    if (filtered.Count > 0) candidates = filtered; // 일치 후보 없으면 전체로 폴백
                }

                var picked = new List<NestMember>();
                var seenFiles = new HashSet<string>();
                for (int i = candidates.Count - 1; i >= 0; i--) // 최근(끝)부터
                {
                    var r = candidates[i];
                    if (seenFiles.Add(r.File))
                    {
                        picked.Add(new NestMember { file = r.File, w = r.W, h = r.H, qty = r.Qty });
                        if (N > 0 && picked.Count >= N) break;
                    }
                }
                picked.Reverse(); // 립핑 순서로 복원

                var sizeKey = fields.GetValueOrDefault("파일 크기:", "");
                if (picked.Count == 0 && !string.IsNullOrEmpty(sizeKey)
                    && _lastNestBySize.TryGetValue(sizeKey, out var prev))
                {
                    picked = new List<NestMember>(prev); // 보류 재출력 — 직전 동일 파일크기 네스트 멤버 상속
                }
                else if (picked.Count > 0 && !string.IsNullOrEmpty(sizeKey))
                {
                    _lastNestBySize[sizeKey] = picked;
                }

                evt.NestMembers = picked;

                if (N > 0 && picked.Count != N)
                    Console.WriteLine($"[{EquipmentId}] ⚠ 네스트 멤버 불일치: 선언 {N} / 복원 {picked.Count} (멤버 부족 가능)");
            }

            events.Add(evt);
            _ripBuffer.Clear(); // 모든 인쇄는 자신의 립핑 버퍼를 소비(flush)
        }

        /// <summary>
        /// Parse a single "인쇄 시작" ... "출력 끝" block into a PrintEvent.
        /// </summary>
        private PrintEvent? ParsePrintBlock(string block)
        {
            try
            {
                var fields = ExtractFields(block);
                var evt = new PrintEvent();

                // Printer name
                evt.PrinterName = fields.GetValueOrDefault("장치 이름:", "");

                // File name/path
                var filePath = fields.GetValueOrDefault("파일:", "");
                if (!string.IsNullOrEmpty(filePath))
                {
                    evt.FilePath = filePath.Trim();
                    evt.FileName = Path.GetFileNameWithoutExtension(evt.FilePath);
                }

                // Dimensions (mm or inches)
                var dimStr = fields.GetValueOrDefault("치수:", "");
                if (!string.IsNullOrEmpty(dimStr))
                {
                    var dimMatch = DimensionRegex.Match(dimStr);
                    if (dimMatch.Success)
                    {
                        double w = double.Parse(dimMatch.Groups[1].Value, CultureInfo.InvariantCulture);
                        double h = double.Parse(dimMatch.Groups[2].Value, CultureInfo.InvariantCulture);
                        string unit = dimMatch.Groups[3].Value.ToLower();

                        // Convert inches to mm
                        if (unit == "in")
                        {
                            w *= 25.4;
                            h *= 25.4;
                        }

                        evt.OutputSize = $"{w:F1} X {h:F1}";
                    }
                }

                // Resolution (DPI)
                var dpiStr = fields.GetValueOrDefault("해상도:", "");
                if (!string.IsNullOrEmpty(dpiStr))
                    evt.Dpi = dpiStr.Trim();

                // Copy count
                var copiesStr = fields.GetValueOrDefault("인쇄 매수:", "");
                if (int.TryParse(copiesStr?.Trim(), out int copies) && copies > 0)
                {
                    evt.CopyRows = copies;
                    evt.CopyColumns = 1;
                }

                // Print start time
                var startTimeStr = fields.GetValueOrDefault("출력 시작 날짜 및 시간:", "");
                var startDt = ParseKoreanDateTime(startTimeStr);
                if (startDt.HasValue)
                {
                    evt.StartDate = startDt.Value.ToString("yyyy.MM.dd");
                    evt.StartTime = startDt.Value.ToString("HH:mm:ss");
                }

                // Print end time
                var endTimeStr = fields.GetValueOrDefault("출력 종료 날짜 및 시간:", "");
                var endDt = ParseKoreanDateTime(endTimeStr);
                if (endDt.HasValue)
                {
                    evt.EndDate = endDt.Value.ToString("yyyy.MM.dd");
                    evt.EndTime = endDt.Value.ToString("HH:mm:ss");
                }

                // Status: no "정보:" field = success, otherwise check value
                var statusStr = fields.GetValueOrDefault("정보:", "");
                if (string.IsNullOrEmpty(statusStr) || statusStr.Contains("성공"))
                {
                    evt.PrintStatus = "OK";
                }
                else if (statusStr.Contains("중단") || statusStr.Contains("Cancel"))
                {
                    evt.PrintStatus = "CANCEL";
                }
                else if (statusStr.Contains("Abort") || statusStr.Contains("Error") || statusStr.Contains("오류"))
                {
                    evt.PrintStatus = "ERROR";
                }
                else
                {
                    evt.PrintStatus = "OK"; // default to OK for unknown status
                }

                // Extract order/file_seq from filename
                if (!string.IsNullOrEmpty(evt.FileName))
                {
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
                }

                // Skip if no file info at all
                if (string.IsNullOrEmpty(evt.FilePath) && string.IsNullOrEmpty(evt.FileName))
                    return null;

                return evt;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[{EquipmentId}] Failed to parse print block: {ex.Message}");
                return null;
            }
        }

        /// <summary>
        /// Extract key-value pairs from HTML table rows.
        /// </summary>
        private Dictionary<string, string> ExtractFields(string html)
        {
            var fields = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            var lines = html.Split('\n');

            string? currentLabel = null;

            for (int i = 0; i < lines.Length; i++)
            {
                var line = lines[i].Trim();

                // Look for TH labels
                if (line.Contains("<TH") && !line.Contains("colspan"))
                {
                    // Extract label text — strip HTML tags and &nbsp;
                    var label = StripHtml(line).Trim().TrimEnd(':');
                    if (!string.IsNullOrEmpty(label))
                        currentLabel = label + ":";
                }
                // Look for TD values
                else if (currentLabel != null && line.Contains("<TD"))
                {
                    var value = StripHtml(line).Trim();
                    if (!string.IsNullOrEmpty(value))
                    {
                        fields[currentLabel] = value;
                    }
                    currentLabel = null;
                }
            }

            return fields;
        }

        /// <summary>
        /// Strip HTML tags and &amp;nbsp; entities from a string.
        /// </summary>
        private string StripHtml(string html)
        {
            var result = Regex.Replace(html, @"<[^>]+>", "");
            result = result.Replace("&nbsp;", " ").Replace("&amp;", "&").Replace("&lt;", "<").Replace("&gt;", ">");
            return result.Trim();
        }

        /// <summary>
        /// Parse Korean datetime format: "오후 12:08:01 2026-04-11"
        /// </summary>
        private DateTime? ParseKoreanDateTime(string? input)
        {
            if (string.IsNullOrEmpty(input)) return null;

            var match = KoreanDateTimeRegex.Match(input);
            if (!match.Success) return null;

            bool isPm = match.Groups[1].Value == "오후";
            int hour = int.Parse(match.Groups[2].Value);
            int minute = int.Parse(match.Groups[3].Value);
            int second = int.Parse(match.Groups[4].Value);
            int year = int.Parse(match.Groups[5].Value);
            int month = int.Parse(match.Groups[6].Value);
            int day = int.Parse(match.Groups[7].Value);

            // Convert 12-hour to 24-hour
            if (isPm && hour < 12) hour += 12;
            if (!isPm && hour == 12) hour = 0;

            try
            {
                return new DateTime(year, month, day, hour, minute, second);
            }
            catch
            {
                return null;
            }
        }

        /// <summary>"1400.0 x 1900.5mm" / "55.1 x 74.8 in" → (mm, mm). 단위 접미사로 정규화. 없으면 (0,0).</summary>
        private static (double w, double h) ParseDimMm(string? dimStr)
        {
            if (string.IsNullOrEmpty(dimStr)) return (0, 0);
            var mm = DimensionRegex.Match(dimStr);
            if (!mm.Success) return (0, 0);
            double w = double.Parse(mm.Groups[1].Value, CultureInfo.InvariantCulture);
            double h = double.Parse(mm.Groups[2].Value, CultureInfo.InvariantCulture);
            if (mm.Groups[3].Value.ToLower() == "in") { w *= 25.4; h *= 25.4; }
            return (w, h);
        }

        /// <summary>
        /// RIPLOG 인코딩 판별 (UTF-8 / cp949). 같은 FlexiPRINT 19 라도 PC 별로 갈린다 —
        /// 2026-08-26 수거 7대 실측: 5대 UTF-8, HYB-3200-01·SOLV-3200-01 2대는 cp949.
        /// 잘못 고르면 필드 라벨("파일:"·"정보:")이 전부 깨져 이벤트가 0건이 되고,
        /// 위치 전진까지 어긋나 truncated 리셋 루프에 빠진다.
        /// 판정 = UTF-8 로 느슨하게 디코딩해서 U+FFFD 가 나오는가. 청크 끝 문자 잘림을 감안해 2자까지 허용.
        /// ASCII 뿐인 청크는 두 인코딩이 동일하므로 확정을 미룬다(다음 폴에 한글이 들어오면 그때 정한다).
        /// </summary>
        private Encoding ResolveEncoding(byte[] buf, int len)
        {
            if (_enc != null) return _enc;

            bool hasHigh = false;
            for (int i = 0; i < len; i++) { if (buf[i] >= 0x80) { hasHigh = true; break; } }
            if (!hasHigh) return Encoding.UTF8;   // 확정 보류 — ASCII 는 어느 쪽이든 바이트 수가 같다

            var probe = Encoding.UTF8.GetString(buf, 0, len);
            int bad = 0;
            foreach (var ch in probe) { if (ch == '\uFFFD') bad++; }

            _enc = bad > 2 ? Encoding.GetEncoding(949) : Encoding.UTF8;
            Console.WriteLine($"[{EquipmentId}] RIPLOG 인코딩 = {_enc.WebName} (UTF-8 깨짐 {bad}자)");
            return _enc;
        }

        private long LoadPosition()
        {
            try
            {
                if (File.Exists(_positionFile))
                {
                    // 신형 "위치|길이" · 구형 "위치" 둘 다 읽는다. 구형이면 길이는 미상(-1)으로 남는다.
                    string content = File.ReadAllText(_positionFile).Trim();
                    var parts = content.Split('|');
                    if (parts.Length == 2 && long.TryParse(parts[1], out long len)) _knownLength = len;
                    if (long.TryParse(parts[0], out long pos))
                        return pos;
                }
            }
            catch { }
            return -1;
        }

        private void SavePosition()
        {
            try
            {
                File.WriteAllText(_positionFile, $"{_lastPosition}|{_knownLength}");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[{EquipmentId}] Failed to save position: {ex.Message}");
            }
        }

        public void ResetPosition()
        {
            _lastPosition = 0;
            _knownLength = -1;
            _ripBuffer.Clear();
            _lastNestBySize.Clear();
            SavePosition();
        }

        public bool IsAccessible() => File.Exists(_logPath);
    }
}
