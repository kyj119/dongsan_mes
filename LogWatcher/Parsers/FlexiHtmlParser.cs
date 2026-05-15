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

        public string EquipmentId { get; }
        public string Name { get; }

        // Block delimiters
        private const string PRINT_START = "인쇄 시작";
        private const string PRINT_END = "출력 끝";

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
                    SavePosition();
                    Console.WriteLine($"[{EquipmentId}] First run — skipping to end (position: {fileLength})");
                    return events;
                }

                // Handle truncation
                if (_lastPosition > fileLength)
                {
                    Console.WriteLine($"[{EquipmentId}] RIPLOG.HTML truncated, resetting to 0");
                    _lastPosition = 0;
                }

                if (_lastPosition >= fileLength)
                    return events;

                // Read new content
                fs.Seek(_lastPosition, SeekOrigin.Begin);
                var newBytes = new byte[fileLength - _lastPosition];
                int bytesRead = fs.Read(newBytes, 0, newBytes.Length);
                if (bytesRead == 0) return events;

                var newContent = Encoding.UTF8.GetString(newBytes, 0, bytesRead);

                // Find complete print blocks: "인쇄 시작" ... "출력 끝"
                int searchFrom = 0;
                int lastCompleteEnd = -1;

                while (true)
                {
                    int startIdx = newContent.IndexOf(PRINT_START, searchFrom, StringComparison.Ordinal);
                    if (startIdx < 0) break;

                    int endIdx = newContent.IndexOf(PRINT_END, startIdx, StringComparison.Ordinal);
                    if (endIdx < 0) break; // incomplete block — wait for more data

                    // Include the closing </TABLE> after "출력 끝"
                    int tableEnd = newContent.IndexOf("</TABLE>", endIdx, StringComparison.OrdinalIgnoreCase);
                    if (tableEnd < 0) break;
                    tableEnd += "</TABLE>".Length;

                    var block = newContent.Substring(startIdx, tableEnd - startIdx);
                    var evt = ParsePrintBlock(block);
                    if (evt != null) events.Add(evt);

                    lastCompleteEnd = tableEnd;
                    searchFrom = tableEnd;
                }

                // Update position to end of last complete block (or keep current if no complete blocks)
                if (lastCompleteEnd >= 0)
                {
                    _lastPosition += lastCompleteEnd;
                }
                else
                {
                    // No complete print blocks found, but advance past any complete non-print blocks
                    // to avoid re-scanning RIP-only content
                    int lastTable = newContent.LastIndexOf("</TABLE>", StringComparison.OrdinalIgnoreCase);
                    if (lastTable >= 0)
                        _lastPosition += lastTable + "</TABLE>".Length;
                }

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

        private long LoadPosition()
        {
            try
            {
                if (File.Exists(_positionFile))
                {
                    string content = File.ReadAllText(_positionFile).Trim();
                    if (long.TryParse(content, out long pos))
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
                File.WriteAllText(_positionFile, _lastPosition.ToString());
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[{EquipmentId}] Failed to save position: {ex.Message}");
            }
        }

        public void ResetPosition()
        {
            _lastPosition = 0;
            SavePosition();
        }

        public bool IsAccessible() => File.Exists(_logPath);
    }
}
