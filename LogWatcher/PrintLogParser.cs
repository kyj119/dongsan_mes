using System;
using System.Collections.Generic;
using System.IO;
using System.Text;
using System.Text.RegularExpressions;

namespace LogWatcher
{
    /// <summary>
    /// 로그 파서 공통 인터페이스.
    /// PrintLogParser (TNS RIP 바이너리) 와 PrintExpLogParser (중국어 PrintExp 텍스트) 모두 구현.
    /// </summary>
    public interface ILogParser
    {
        List<PrintEvent> ReadNewEntries();
        void ResetPosition();
    }

    public class PrintEvent
    {
        public string PrinterName { get; set; } = "";
        public string FilePath { get; set; } = "";
        public string FileName { get; set; } = "";
        public string PrintStatus { get; set; } = "";  // OK, CANCEL, ERROR
        public string StartDate { get; set; } = "";
        public string StartTime { get; set; } = "";
        public string EndDate { get; set; } = "";
        public string EndTime { get; set; } = "";
        public string OutputSize { get; set; } = "";
        public string Dpi { get; set; } = "";
        public string? CardNumber { get; set; }
        public string? OrderNumber { get; set; }
        public int? FileSeq { get; set; }

        public string PrintStartedAt =>
            !string.IsNullOrEmpty(StartDate) && !string.IsNullOrEmpty(StartTime)
                ? $"{StartDate.Replace('.', '-')} {StartTime}"
                : "";

        public string PrintCompletedAt =>
            !string.IsNullOrEmpty(EndDate) && !string.IsNullOrEmpty(EndTime)
                ? $"{EndDate.Replace('.', '-')} {EndTime}"
                : "";

        public string? OutputWidth
        {
            get
            {
                if (string.IsNullOrEmpty(OutputSize)) return null;
                var parts = OutputSize.Split(" X ", StringSplitOptions.TrimEntries);
                return parts.Length >= 1 ? parts[0] : null;
            }
        }

        public string? OutputHeight
        {
            get
            {
                if (string.IsNullOrEmpty(OutputSize)) return null;
                var parts = OutputSize.Split(" X ", StringSplitOptions.TrimEntries);
                return parts.Length >= 2 ? parts[1] : null;
            }
        }

        // 배열출력 (Copy Layout)
        public int CopyColumns { get; set; } = 1;
        public int CopyRows { get; set; } = 1;
        public int CopyTotal => CopyColumns * CopyRows;

        // 분할출력 (Tile Layout)
        public int TileCount { get; set; } = 0;
        public int TileIndex { get; set; } = 0;
    }

    public class PrintLogParser : ILogParser
    {
        private readonly string _logPath;
        private readonly string _positionFile;
        private long _lastPosition;

        // EUC-KR encoding for Korean filenames
        private static readonly Encoding EucKr;

        // Status markers in ASCII
        private static readonly byte[] OkMarker = Encoding.ASCII.GetBytes("OK!");
        private static readonly byte[] CancelMarker = Encoding.ASCII.GetBytes("Cancel!");
        private static readonly byte[] ErrorMarker = Encoding.ASCII.GetBytes("Error!");

        // Regex for order/file_seq extraction
        // 새 형식: YYYYMMDD-NNN-FFF-거래처-... (FFF = 파일순번 3자리)
        private static readonly Regex FileSeqRegex = new(@"^(\d{8}-\d{3})-(\d{3})-", RegexOptions.Compiled);
        private static readonly Regex OrderNumberRegex = new(@"(\d{8}-\d{3})", RegexOptions.Compiled);
        private static readonly Regex DateRegex = new(@"(\d{4}\.\d{2}\.\d{2})", RegexOptions.Compiled);
        private static readonly Regex TimeRegex = new(@"(\d{1,2}:\d{2}:\d{2})", RegexOptions.Compiled);
        private static readonly Regex DpiRegex = new(@"(\d+x\d+\s*DPI)", RegexOptions.Compiled | RegexOptions.IgnoreCase);

        static PrintLogParser()
        {
            Encoding.RegisterProvider(CodePagesEncodingProvider.Instance);
            EucKr = Encoding.GetEncoding(949);
        }

        public PrintLogParser(string logPath, string positionFile)
        {
            _logPath = logPath;
            _positionFile = positionFile;
            _lastPosition = LoadPosition();
        }

        /// <summary>
        /// Read new entries since last position.
        /// </summary>
        public List<PrintEvent> ReadNewEntries()
        {
            var events = new List<PrintEvent>();

            if (!File.Exists(_logPath))
            {
                Console.WriteLine($"[WARN] Print.log not found: {_logPath}");
                return events;
            }

            try
            {
                using var fs = new FileStream(_logPath, FileMode.Open, FileAccess.Read, FileShare.ReadWrite);
                var fileLength = fs.Length;

                // First run: skip to end of file (only monitor new events)
                if (_lastPosition < 0)
                {
                    _lastPosition = fileLength;
                    SavePosition();
                    Console.WriteLine($"[INFO] First run - skipping to end of file (position: {fileLength})");
                    return events;
                }

                // Handle log file truncation/rotation
                if (_lastPosition > fileLength)
                {
                    Console.WriteLine("[INFO] Print.log appears truncated, resetting position to 0");
                    _lastPosition = 104; // skip header
                }

                // Skip header
                if (_lastPosition < 104)
                    _lastPosition = 104;

                if (_lastPosition >= fileLength)
                    return events;

                fs.Seek(_lastPosition, SeekOrigin.Begin);
                var newBytes = new byte[fileLength - _lastPosition];
                int bytesRead = fs.Read(newBytes, 0, newBytes.Length);

                if (bytesRead == 0)
                    return events;

                // Scan for status markers
                events.AddRange(ScanForEvents(newBytes, _lastPosition));

                _lastPosition = fileLength;
                SavePosition();

                if (events.Count > 0)
                    Console.WriteLine($"[INFO] Found {events.Count} new print events");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[ERROR] Failed to read Print.log: {ex.Message}");
            }

            return events;
        }

        /// <summary>
        /// Scan byte array for status markers and extract surrounding field data.
        /// </summary>
        private List<PrintEvent> ScanForEvents(byte[] data, long baseOffset)
        {
            var events = new List<PrintEvent>();
            int pos = 0;

            while (pos < data.Length - 3)
            {
                string? status = null;
                int markerLen = 0;

                // Check for status markers
                if (pos + 3 <= data.Length && MatchBytes(data, pos, OkMarker))
                {
                    status = "OK";
                    markerLen = OkMarker.Length;
                }
                else if (pos + 7 <= data.Length && MatchBytes(data, pos, CancelMarker))
                {
                    status = "CANCEL";
                    markerLen = CancelMarker.Length;
                }
                else if (pos + 6 <= data.Length && MatchBytes(data, pos, ErrorMarker))
                {
                    status = "ERROR";
                    markerLen = ErrorMarker.Length;
                }

                if (status != null)
                {
                    // Verify this is a field value (preceded by length prefix)
                    // The length prefix should be 4 bytes before the string: XX 00 00 00
                    int expectedLen = markerLen + 1; // +1 for null terminator
                    int prefixPos = pos - 4;
                    if (prefixPos >= 0)
                    {
                        int fieldLen = BitConverter.ToInt32(data, prefixPos);
                        // Verify: the field length should match the marker + null
                        if (fieldLen == expectedLen || fieldLen == markerLen)
                        {
                            var evt = ExtractEvent(data, pos, status);
                            if (evt != null)
                            {
                                events.Add(evt);
                            }
                        }
                    }
                    pos += markerLen;
                }
                else
                {
                    pos++;
                }
            }

            return events;
        }

        /// <summary>
        /// Given a status marker position, extract the full event by reading fields backwards.
        /// </summary>
        private PrintEvent? ExtractEvent(byte[] data, int statusPos, string status)
        {
            try
            {
                // statusPos points to the start of the status string (e.g. "OK!").
                // The status field's length prefix is at (statusPos - 4).
                // We want to read fields BEFORE the status, so start from (statusPos - 4).
                int beforeStatus = statusPos - 4;
                if (beforeStatus < 4) return null;

                var fields = ReadFieldsBackward(data, beforeStatus, 22);
                if (fields.Count < 6)
                    return null;

                // Fields in reverse order BEFORE status:
                // fields[0] = end time (e.g. "19:23:41")
                // fields[1] = end date (e.g. "2021.06.02")
                // fields[2] = start time
                // fields[3] = start date
                // Further back: tile info, color mode, DPI(2), paper, DPI(1), position, size(3x), file_path, enabled, network, printer

                var evt = new PrintEvent { PrintStatus = status };

                // Extract timestamps (closest fields before status)
                if (fields.Count >= 1) evt.EndTime = CleanString(fields[0]);
                if (fields.Count >= 2) evt.EndDate = CleanString(fields[1]);
                if (fields.Count >= 3) evt.StartTime = CleanString(fields[2]);
                if (fields.Count >= 4) evt.StartDate = CleanString(fields[3]);

                // Search all fields for file path, DPI, size, printer
                foreach (var field in fields)
                {
                    var cleaned = CleanString(field);
                    if (string.IsNullOrEmpty(cleaned)) continue;

                    // File path detection (drive letter or UNC)
                    if ((cleaned.Length > 3 && cleaned.Length > 10) &&
                        (cleaned.Contains(":\\") || cleaned.StartsWith("\\\\")))
                    {
                        if (string.IsNullOrEmpty(evt.FilePath) ||
                            cleaned.Length > evt.FilePath.Length) // prefer longer path
                        {
                            evt.FilePath = cleaned;
                        }
                    }

                    // DPI
                    if (cleaned.Contains("DPI", StringComparison.OrdinalIgnoreCase) &&
                        DpiRegex.IsMatch(cleaned) && string.IsNullOrEmpty(evt.Dpi))
                    {
                        evt.Dpi = cleaned;
                    }

                    // Output size (e.g. "800.000 X 1207.333")
                    if (cleaned.Contains(" X ") && cleaned.Contains(".") &&
                        !cleaned.Contains("DPI") && string.IsNullOrEmpty(evt.OutputSize))
                    {
                        evt.OutputSize = cleaned;
                    }

                    // Printer name (contains "Color" or ends with known pattern, or is first long non-path field)
                    if ((cleaned.Contains("Color") || cleaned.Contains("Printer") || cleaned.Contains("H8") || cleaned.Contains("EP ")) &&
                        !cleaned.Contains(":\\") && !cleaned.Contains("DPI") &&
                        string.IsNullOrEmpty(evt.PrinterName))
                    {
                        evt.PrinterName = cleaned;
                    }

                    // CopyLayout: "Yes, Column=2, Space=78.000, Row=10, Space=5.000"
                    // 또는: "No, Column=1, Space=0.000, Row=1, Space=0.000"
                    if (cleaned.Contains("Column=") && cleaned.Contains("Row="))
                    {
                        var colMatch = Regex.Match(cleaned, @"Column=(\d+)");
                        var rowMatch = Regex.Match(cleaned, @"Row=(\d+)");
                        if (colMatch.Success) evt.CopyColumns = int.Parse(colMatch.Groups[1].Value);
                        if (rowMatch.Success) evt.CopyRows = int.Parse(rowMatch.Groups[1].Value);
                    }

                    // TileLayout: "Yes, TileCount=8, TileIndex=3, Overlap=10.000"
                    // 또는: "No, TileCount=0, TileIndex=1, Overlap=0.000"
                    if (cleaned.Contains("TileCount=") && cleaned.Contains("TileIndex="))
                    {
                        var tcMatch = Regex.Match(cleaned, @"TileCount=(\d+)");
                        var tiMatch = Regex.Match(cleaned, @"TileIndex=(\d+)");
                        if (tcMatch.Success) evt.TileCount = int.Parse(tcMatch.Groups[1].Value);
                        if (tiMatch.Success) evt.TileIndex = int.Parse(tiMatch.Groups[1].Value);
                    }
                }

                // Extract filename from path
                if (!string.IsNullOrEmpty(evt.FilePath))
                {
                    evt.FileName = Path.GetFileNameWithoutExtension(evt.FilePath);

                    // 새 형식: YYYYMMDD-NNN-FFF-거래처-... → order_number + file_seq 추출
                    var seqMatch = FileSeqRegex.Match(evt.FileName);
                    if (seqMatch.Success)
                    {
                        evt.OrderNumber = seqMatch.Groups[1].Value;
                        evt.FileSeq = int.Parse(seqMatch.Groups[2].Value);
                    }
                    else
                    {
                        // fallback: 기존 형식에서 order_number만 추출
                        var orderMatch = OrderNumberRegex.Match(evt.FileName);
                        if (orderMatch.Success)
                            evt.OrderNumber = orderMatch.Groups[1].Value;
                    }
                }

                // Skip if no file path found (probably a false positive)
                if (string.IsNullOrEmpty(evt.FilePath))
                    return null;

                return evt;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[WARN] Failed to extract event at position {statusPos}: {ex.Message}");
                return null;
            }
        }

        /// <summary>
        /// Read fields backwards from a given position.
        /// Each field in the binary is: [4-byte uint32 length] [string data of 'length' bytes]
        /// endPos: the byte offset just past the end of the last field to read
        ///         (i.e., the start of the next field's length prefix, or status length prefix).
        /// Returns fields in reverse order (most recent first).
        /// </summary>
        private List<string> ReadFieldsBackward(byte[] data, int endPos, int maxFields)
        {
            var fields = new List<string>();

            for (int i = 0; i < maxFields; i++)
            {
                // endPos is just past the end of the field we want to read.
                // The field's data ends at endPos-1 (should be 0x00 null terminator).
                // Field layout: [len:4][data:len]
                // So: data occupies [endPos - len .. endPos), and len is at [endPos - len - 4].
                // We don't know len yet, so we search for it.

                if (endPos < 5) break; // minimum: 4 bytes length + 1 byte data

                bool found = false;
                for (int tryLen = 1; tryLen <= Math.Min(1024, endPos - 4); tryLen++)
                {
                    int lenPos = endPos - tryLen - 4;
                    if (lenPos < 0) break;

                    int storedLen = BitConverter.ToInt32(data, lenPos);
                    if (storedLen == tryLen)
                    {
                        // Verify null terminator at end of field data
                        if (data[endPos - 1] == 0x00)
                        {
                            int dataStart = lenPos + 4;
                            string fieldValue = DecodeField(data, dataStart, tryLen);
                            fields.Add(fieldValue);
                            endPos = lenPos; // move to just before this field's length prefix
                            found = true;
                            break;
                        }
                    }
                }

                if (!found) break;
            }

            return fields;
        }

        /// <summary>
        /// Decode a field's bytes as EUC-KR string (handles Korean filenames).
        /// </summary>
        private string DecodeField(byte[] data, int offset, int length)
        {
            // Trim null terminator
            int actualLen = length;
            while (actualLen > 0 && (offset + actualLen - 1) < data.Length && data[offset + actualLen - 1] == 0x00)
                actualLen--;

            if (actualLen <= 0)
                return "";

            try
            {
                return EucKr.GetString(data, offset, actualLen);
            }
            catch
            {
                return Encoding.ASCII.GetString(data, offset, actualLen);
            }
        }

        private string CleanString(string s)
        {
            return s.Trim('\0', ' ');
        }

        private bool MatchBytes(byte[] data, int offset, byte[] pattern)
        {
            if (offset + pattern.Length > data.Length)
                return false;
            for (int i = 0; i < pattern.Length; i++)
            {
                if (data[offset + i] != pattern[i])
                    return false;
            }
            return true;
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
            return -1; // First run: signal to skip to end of file
        }

        private void SavePosition()
        {
            try
            {
                File.WriteAllText(_positionFile, _lastPosition.ToString());
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[WARN] Failed to save position: {ex.Message}");
            }
        }

        /// <summary>
        /// Reset position to re-read entire file (for testing).
        /// </summary>
        public void ResetPosition()
        {
            _lastPosition = 0;
            SavePosition();
        }
    }
}
