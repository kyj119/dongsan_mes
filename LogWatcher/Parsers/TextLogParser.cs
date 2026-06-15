using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.RegularExpressions;
using LogWatcher.Config;
using LogWatcher.Core;

namespace LogWatcher.Parsers
{
    /// <summary>
    /// Generic regex-based text log parser. Covers most RIP software that writes
    /// plain-text logs (one event per line). Configured entirely via equipment.json —
    /// adding a new text-log RIP needs only a config block, no code changes.
    ///
    /// MVP scope: single-line events, encoding auto-detect (BOM → utf-8 → cp949),
    /// optional daily file rotation (daily_suffix_format).
    ///
    /// config keys:
    ///   log_path             (required) — file path; folder path when daily_suffix_format is set
    ///   completion_pattern   (required) — regex; a match means a successful print
    ///   filename_group       (default 1) — capture group holding the file name/path
    ///   encoding             (default "auto") — auto | utf-8 | utf-16le | cp949 | ...
    ///   error_pattern        (optional) — regex → PrintStatus ERROR
    ///   cancel_pattern       (optional) — regex → PrintStatus CANCEL
    ///   timestamp_pattern    (optional) — regex; group 1 (or whole match) = completion time
    ///   timestamp_format     (optional) — .NET format for ParseExact (else loose parse)
    ///   size_pattern         (optional) — regex; groups 1,2 = width,height
    ///   size_unit            (default "mm") — mm | in | pt
    ///   daily_suffix_format  (optional) — e.g. "print_{yyyy_MM_dd}.txt" (rotates daily)
    /// </summary>
    public class TextLogParser : IEquipmentParser
    {
        private readonly string _logPath;
        private readonly string _positionFile;
        private readonly string _encodingName;
        private readonly string _dailySuffixFormat;

        private readonly Regex _completionRegex;
        private readonly int _filenameGroup;
        private readonly Regex? _errorRegex;
        private readonly Regex? _cancelRegex;
        private readonly Regex? _timestampRegex;
        private readonly string _timestampFormat;
        private readonly Regex? _sizeRegex;
        private readonly string _sizeUnit;

        private string _posDate = "";   // tracks the file's date for daily rotation
        private long _lastPosition;
        private long _prevLen = -1;       // file length seen last poll (stable-EOF detection)
        private bool _forceEofFlush;      // set by ResetPosition: treat EOF as a finished line (for --test)

        public string EquipmentId { get; }
        public string Name { get; }

        // IA naming: YYYYMMDD-NNN[-FFF]. Seq is variable-width to tolerate pre-IA file names.
        private static readonly Regex FileSeqRegex = new(@"(\d{8}-\d{3})-(\d+)", RegexOptions.Compiled);
        private static readonly Regex OrderNumberRegex = new(@"(\d{8}-\d{3})", RegexOptions.Compiled);

        static TextLogParser()
        {
            // Enable legacy code pages (cp949/euc-kr) on .NET Core
            try { Encoding.RegisterProvider(CodePagesEncodingProvider.Instance); } catch { /* already registered */ }
        }

        public TextLogParser(WatcherConfig config, string positionsDir)
        {
            EquipmentId = config.EquipmentId;
            Name = config.Name;

            _logPath = config.GetConfigString("log_path");
            if (string.IsNullOrEmpty(_logPath))
                throw new ArgumentException($"[{EquipmentId}] config.log_path is required for text_log parser");

            var completionPattern = config.GetConfigString("completion_pattern");
            if (string.IsNullOrEmpty(completionPattern))
                throw new ArgumentException($"[{EquipmentId}] config.completion_pattern is required for text_log parser");
            _completionRegex = new Regex(completionPattern, RegexOptions.Compiled);
            _filenameGroup = config.GetConfigInt("filename_group", 1);

            _encodingName = config.GetConfigString("encoding", "auto");
            _dailySuffixFormat = config.GetConfigString("daily_suffix_format", "");

            var errorPattern = config.GetConfigString("error_pattern");
            _errorRegex = string.IsNullOrEmpty(errorPattern) ? null : new Regex(errorPattern, RegexOptions.Compiled);
            var cancelPattern = config.GetConfigString("cancel_pattern");
            _cancelRegex = string.IsNullOrEmpty(cancelPattern) ? null : new Regex(cancelPattern, RegexOptions.Compiled);

            var timestampPattern = config.GetConfigString("timestamp_pattern");
            _timestampRegex = string.IsNullOrEmpty(timestampPattern) ? null : new Regex(timestampPattern, RegexOptions.Compiled);
            _timestampFormat = config.GetConfigString("timestamp_format", "");

            var sizePattern = config.GetConfigString("size_pattern");
            _sizeRegex = string.IsNullOrEmpty(sizePattern) ? null : new Regex(sizePattern, RegexOptions.Compiled);
            _sizeUnit = config.GetConfigString("size_unit", "mm").ToLowerInvariant();

            _positionFile = Path.Combine(positionsDir, $"{EquipmentId}.pos");
            LoadPosition();
        }

        public List<PrintEvent> ReadNewEntries()
        {
            var events = new List<PrintEvent>();
            var file = ResolveLogFile();
            var today = DateTime.Now.ToString("yyyy-MM-dd");

            // Daily rotation: roll position when the day changes.
            if (!string.IsNullOrEmpty(_dailySuffixFormat) && _posDate != today)
            {
                bool firstEver = string.IsNullOrEmpty(_posDate);
                _posDate = today;
                _lastPosition = firstEver ? -1 : 0; // first install → skip to end; new day → read from start
            }

            if (!File.Exists(file))
                return events; // file may not exist yet (e.g. today's log not created)

            try
            {
                using var fs = new FileStream(file, FileMode.Open, FileAccess.Read, FileShare.ReadWrite);
                var len = fs.Length;

                // First run on a single file: skip history, watch from end.
                if (_lastPosition < 0)
                {
                    _lastPosition = len;
                    SavePosition();
                    Console.WriteLine($"[{EquipmentId}] First run — skipping to end (position: {len})");
                    return events;
                }

                if (_lastPosition > len) _lastPosition = 0; // truncated or rotated
                if (_lastPosition >= len) return events;

                fs.Seek(_lastPosition, SeekOrigin.Begin);
                var buf = new byte[len - _lastPosition];
                int read = fs.Read(buf, 0, buf.Length);
                if (read == 0) return events;

                var enc = ResolveEncoding(buf, read, out int bomLen);
                int skip = _lastPosition == 0 ? bomLen : 0; // BOM only at file start
                var text = enc.GetString(buf, skip, read - skip);

                // Stable-EOF: only treat a trailing newline-less line as "finished" when the file
                // has stopped growing (len unchanged since last poll) or on a forced flush (--test).
                // Consuming a partial line mid-write would lose the event permanently, so otherwise hold it.
                bool flushTail = _forceEofFlush || (len == _prevLen);
                _forceEofFlush = false;
                _prevLen = len;

                int lastNl = text.LastIndexOf('\n');
                string complete;
                if (lastNl < 0)
                {
                    if (!flushTail) return events;  // no complete line yet — wait
                    complete = text;                // file stable → trailing line is final
                }
                else
                {
                    complete = flushTail ? text : text.Substring(0, lastNl + 1);
                }

                foreach (var rawLine in complete.Split('\n'))
                {
                    var line = rawLine.TrimEnd('\r');
                    if (line.Length == 0) continue;
                    var evt = ParseLine(line);
                    if (evt != null) events.Add(evt);
                }

                _lastPosition += skip + enc.GetByteCount(complete);
                SavePosition();

                if (events.Count > 0)
                    Console.WriteLine($"[{EquipmentId}] Found {events.Count} new print events");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[{EquipmentId}] Error reading text log: {ex.Message}");
            }

            return events;
        }

        private PrintEvent? ParseLine(string line)
        {
            string status;
            Match m;
            if ((m = _completionRegex.Match(line)).Success) status = "OK";
            else if (_errorRegex != null && (m = _errorRegex.Match(line)).Success) status = "ERROR";
            else if (_cancelRegex != null && (m = _cancelRegex.Match(line)).Success) status = "CANCEL";
            else return null;

            var evt = new PrintEvent { PrintStatus = status };

            // File name from the matched group
            if (_filenameGroup >= 0 && _filenameGroup < m.Groups.Count && m.Groups[_filenameGroup].Success)
            {
                var raw = m.Groups[_filenameGroup].Value.Trim();
                evt.FilePath = raw;
                evt.FileName = Path.GetFileNameWithoutExtension(raw);
            }
            if (string.IsNullOrEmpty(evt.FileName)) return null; // a print event must carry a file name

            // Completion timestamp (optional)
            if (_timestampRegex != null)
            {
                var tm = _timestampRegex.Match(line);
                if (tm.Success)
                {
                    var ts = tm.Groups.Count > 1 && tm.Groups[1].Success ? tm.Groups[1].Value : tm.Value;
                    bool ok = !string.IsNullOrEmpty(_timestampFormat)
                        ? DateTime.TryParseExact(ts, _timestampFormat, CultureInfo.InvariantCulture, DateTimeStyles.None, out var dt)
                        : DateTime.TryParse(ts, CultureInfo.InvariantCulture, DateTimeStyles.None, out dt);
                    if (ok)
                    {
                        evt.EndDate = dt.ToString("yyyy.MM.dd");
                        evt.EndTime = dt.ToString("HH:mm:ss");
                    }
                }
            }

            // Output size (optional)
            if (_sizeRegex != null)
            {
                var sm = _sizeRegex.Match(line);
                if (sm.Success && sm.Groups.Count >= 3 &&
                    double.TryParse(sm.Groups[1].Value, NumberStyles.Float, CultureInfo.InvariantCulture, out double w) &&
                    double.TryParse(sm.Groups[2].Value, NumberStyles.Float, CultureInfo.InvariantCulture, out double h))
                {
                    if (_sizeUnit is "in" or "inch") { w *= 25.4; h *= 25.4; }
                    else if (_sizeUnit == "pt") { w /= 2.835; h /= 2.835; }
                    evt.OutputSize = $"{w:F1} X {h:F1}";
                }
            }

            // Order/card number from file name (IA naming)
            var seqMatch = FileSeqRegex.Match(evt.FileName);
            if (seqMatch.Success)
            {
                evt.OrderNumber = seqMatch.Groups[1].Value;
                evt.FileSeq = int.Parse(seqMatch.Groups[2].Value);
            }
            else
            {
                var om = OrderNumberRegex.Match(evt.FileName);
                if (om.Success) evt.OrderNumber = om.Groups[1].Value;
            }

            return evt;
        }

        // ----- encoding -----

        private Encoding ResolveEncoding(byte[] buf, int len, out int bomLen)
        {
            bomLen = DetectBomLength(buf, len);

            if (_encodingName != "auto" && !string.IsNullOrEmpty(_encodingName))
                return GetEncodingByName(_encodingName);

            // BOM wins
            if (bomLen == 3) return new UTF8Encoding(false, false);
            if (bomLen == 2)
            {
                if (buf[0] == 0xFF && buf[1] == 0xFE) return Encoding.Unicode;          // UTF-16 LE
                if (buf[0] == 0xFE && buf[1] == 0xFF) return Encoding.BigEndianUnicode;  // UTF-16 BE
            }

            // No BOM: prefer UTF-8, fall back to cp949 if it produces many replacement chars
            var utf8 = new UTF8Encoding(false, false);
            var s = utf8.GetString(buf, 0, len);
            int repl = s.Count(ch => ch == '�');
            if (repl == 0 || repl <= s.Length / 100) return utf8; // tolerate 1% (buffer-edge truncation)
            return GetEncodingByName("cp949");
        }

        private static int DetectBomLength(byte[] buf, int len)
        {
            if (len >= 3 && buf[0] == 0xEF && buf[1] == 0xBB && buf[2] == 0xBF) return 3;
            if (len >= 2 && ((buf[0] == 0xFF && buf[1] == 0xFE) || (buf[0] == 0xFE && buf[1] == 0xFF))) return 2;
            return 0;
        }

        private static Encoding GetEncodingByName(string name)
        {
            switch (name.ToLowerInvariant().Replace("-", "").Replace("_", ""))
            {
                case "utf8": return new UTF8Encoding(false, false);
                case "utf16": case "utf16le": case "unicode": return Encoding.Unicode;
                case "utf16be": return Encoding.BigEndianUnicode;
                case "cp949": case "euckr": case "ksc5601": case "korean": return Encoding.GetEncoding(949);
                case "cp1252": case "latin1": case "windows1252": return Encoding.GetEncoding(1252);
                default:
                    try { return Encoding.GetEncoding(name); }
                    catch { return new UTF8Encoding(false, false); }
            }
        }

        // ----- file resolution & position -----

        private string ResolveLogFile()
        {
            if (string.IsNullOrEmpty(_dailySuffixFormat))
                return _logPath;
            var name = ExpandDateTokens(_dailySuffixFormat, DateTime.Now);
            return Path.Combine(_logPath, name);
        }

        private static string ExpandDateTokens(string pattern, DateTime dt)
        {
            // "{yyyy_MM_dd}" → formatted date
            return Regex.Replace(pattern, @"\{([^}]+)\}",
                mm => dt.ToString(mm.Groups[1].Value, CultureInfo.InvariantCulture));
        }

        public bool IsAccessible()
        {
            if (!string.IsNullOrEmpty(_dailySuffixFormat))
                return Directory.Exists(_logPath); // today's file may not exist yet; folder must
            return File.Exists(_logPath);
        }

        public void ResetPosition()
        {
            _lastPosition = 0;       // read from the start (used by --test)
            _prevLen = -1;
            _forceEofFlush = true;   // one-shot full read → include the final newline-less line
            _posDate = string.IsNullOrEmpty(_dailySuffixFormat) ? "" : DateTime.Now.ToString("yyyy-MM-dd");
            SavePosition();
        }

        private void LoadPosition()
        {
            try
            {
                if (!File.Exists(_positionFile)) { _lastPosition = -1; _posDate = ""; return; }
                var content = File.ReadAllText(_positionFile).Trim();
                if (!string.IsNullOrEmpty(_dailySuffixFormat) && content.Contains('|'))
                {
                    var parts = content.Split('|');
                    _posDate = parts[0];
                    long.TryParse(parts[1], out _lastPosition);
                }
                else
                {
                    if (!long.TryParse(content, out _lastPosition)) _lastPosition = -1;
                }
            }
            catch { _lastPosition = -1; }
        }

        private void SavePosition()
        {
            try
            {
                var dir = Path.GetDirectoryName(_positionFile);
                if (!string.IsNullOrEmpty(dir)) Directory.CreateDirectory(dir);
                var content = !string.IsNullOrEmpty(_dailySuffixFormat)
                    ? $"{_posDate}|{_lastPosition}"
                    : _lastPosition.ToString();
                File.WriteAllText(_positionFile, content);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[{EquipmentId}] Failed to save position: {ex.Message}");
            }
        }
    }
}
