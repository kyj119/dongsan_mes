using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Text.RegularExpressions;
using LogWatcher.Config;
using LogWatcher.Core;
using Microsoft.Data.Sqlite;

namespace LogWatcher.Parsers
{
    /// <summary>
    /// Polls a SQLite database for new completed print jobs.
    /// Designed for Epson Edge Print and similar RIP software that uses SQLite internally.
    /// </summary>
    public class SqliteDbParser : IEquipmentParser
    {
        private readonly string _dbPath;
        private readonly string _query;
        private readonly string _idColumn;
        private readonly string _filenameColumn;
        private readonly string _timestampColumn;
        private readonly string[] _sizeColumns;
        private readonly string _sizeUnit;
        private readonly string _statusColumn;
        private readonly string[] _statusCancel;
        private readonly string[] _statusError;
        private readonly string[] _statusOk;
        private readonly string _startColumn;
        private readonly string _recheckQuery;
        private readonly string _positionFile;
        private readonly string _watchFile;
        private long _lastId;

        // 취소로 정착시킨 JobID 감시 목록 — Edge Print 는 잡을 「재출력」하면 새 잡을 만들지 않고
        // 같은 JobID 의 상태만 2→12 로 뒤집는다. 워터마크(last_id)는 이미 지나갔으므로 재확인이
        // 없으면 재출력 완료가 영영 안 보인다(2026-08-12 미소약국 3건 실증 — 취소만 남고 완료 없음).
        private readonly Dictionary<long, DateTime> _cancelWatch = new();
        private const int WATCH_MAX = 200;
        private const int WATCH_EXPIRE_DAYS = 30;

        // Order number extraction (YYYYMMDD-NNN pattern from IA naming)
        private static readonly Regex OrderNumberRegex = new(@"(\d{8}-\d{3})", RegexOptions.Compiled);
        private static readonly Regex FileSeqRegex = new(@"^(\d{8}-\d{3})-(\d{3})-", RegexOptions.Compiled);

        private const int MAX_RETRIES = 3;
        private const int RETRY_DELAY_MS = 1000;

        public string EquipmentId { get; }
        public string Name { get; }

        public SqliteDbParser(WatcherConfig config, string positionsDir)
        {
            EquipmentId = config.EquipmentId;
            Name = config.Name;

            _dbPath = config.GetConfigString("db_path");
            _query = config.GetConfigString("query");
            _idColumn = config.GetConfigString("id_column", "JobID");
            _filenameColumn = config.GetConfigString("filename_column", "JobName");
            _timestampColumn = config.GetConfigString("timestamp_column", "FinishPrintTime");
            _sizeColumns = config.GetConfigStringArray("size_columns");
            _sizeUnit = config.GetConfigString("size_unit", "mm");

            // 상태 매핑(취소/실패 기록): status_column 값 → CANCEL/ERROR, 그 외 OK.
            // EPSON Edge는 JobStatus enum이 비공개라 실제 값을 status_cancel/status_error(문자열 배열)로 설정.
            _statusColumn = config.GetConfigString("status_column", "");
            _statusCancel = config.GetConfigStringArray("status_cancel");
            _statusError = config.GetConfigStringArray("status_error");
            _statusOk = config.GetConfigStringArray("status_ok");

            // 시작시각 컬럼(선택) — 없으면 종전처럼 완료시각만. 쿼리 SELECT 에 같은 별칭 컬럼이 있어야 한다.
            _startColumn = config.GetConfigString("start_column", "");
            // 재출력 감지 쿼리(선택) — @cancel_ids 자리에 감시 중 JobID 목록이 치환된다.
            _recheckQuery = config.GetConfigString("recheck_query", "");

            if (string.IsNullOrEmpty(_dbPath))
                throw new ArgumentException($"[{EquipmentId}] config.db_path is required for epson parser");
            if (string.IsNullOrEmpty(_query))
                throw new ArgumentException($"[{EquipmentId}] config.query is required for epson parser");

            _positionFile = Path.Combine(positionsDir, $"{EquipmentId}.pos");
            _watchFile = Path.Combine(positionsDir, $"{EquipmentId}.cancelwatch.json");
            _lastId = LoadPosition();
            LoadWatch();
        }

        public List<PrintEvent> ReadNewEntries()
        {
            var events = new List<PrintEvent>();

            for (int attempt = 1; attempt <= MAX_RETRIES; attempt++)
            {
                try
                {
                    events = QueryDatabase();
                    break;
                }
                catch (SqliteException ex) when (ex.SqliteErrorCode == 5) // SQLITE_BUSY
                {
                    if (attempt < MAX_RETRIES)
                    {
                        Console.WriteLine($"[{EquipmentId}] DB busy, retry {attempt}/{MAX_RETRIES}...");
                        System.Threading.Thread.Sleep(RETRY_DELAY_MS);
                    }
                    else
                    {
                        Console.WriteLine($"[{EquipmentId}] DB busy after {MAX_RETRIES} retries, skipping this poll");
                    }
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"[{EquipmentId}] DB error: {ex.Message}");
                    break;
                }
            }

            return events;
        }

        private List<PrintEvent> QueryDatabase()
        {
            var events = new List<PrintEvent>();
            var connStr = new SqliteConnectionStringBuilder
            {
                DataSource = _dbPath,
                Mode = SqliteOpenMode.ReadOnly,
                Pooling = false
            }.ToString();

            using var conn = new SqliteConnection(connStr);
            conn.Open();

            using var cmd = conn.CreateCommand();
            cmd.CommandText = _query;
            cmd.Parameters.AddWithValue("@last_id", _lastId);

            using (var reader = cmd.ExecuteReader())
            {
                long maxId = _lastId;
                while (reader.Read())
                {
                    var built = BuildEvent(reader);
                    if (built == null) continue;
                    var (id, evt) = built.Value;
                    events.Add(evt);

                    // 취소로 정착한 잡은 감시 목록에 — 재출력(같은 JobID 상태 2→12)을 나중에 잡는다
                    if (evt.PrintStatus == "CANCEL" && !string.IsNullOrEmpty(_recheckQuery))
                        _cancelWatch[id] = DateTime.Now;

                    if (id > maxId) maxId = id;
                }
                if (maxId > _lastId)
                {
                    _lastId = maxId;
                    SavePosition();
                }
            }

            // ── 재출력 감지: 감시 중 JobID 가 완료 상태로 뒤집혔는지 재확인 ──
            if (!string.IsNullOrEmpty(_recheckQuery) && _cancelWatch.Count > 0)
            {
                PruneWatch();
                if (_cancelWatch.Count > 0)
                {
                    var idList = string.Join(",", _cancelWatch.Keys);
                    using var recheckCmd = conn.CreateCommand();
                    recheckCmd.CommandText = _recheckQuery.Replace("@cancel_ids", idList);
                    using var recheckReader = recheckCmd.ExecuteReader();
                    while (recheckReader.Read())
                    {
                        var built = BuildEvent(recheckReader);
                        if (built == null) continue;
                        var (id, evt) = built.Value;
                        Console.WriteLine($"[{EquipmentId}] 재출력 완료 감지 (JobID={id}): {evt.FileName}");
                        events.Add(evt);
                        _cancelWatch.Remove(id);
                    }
                }
            }
            SaveWatch();

            return events;
        }

        /// <summary>리더의 현재 행을 이벤트로 변환. 본 쿼리와 재출력 재확인 쿼리가 같은 규칙을 쓴다.</summary>
        private (long id, PrintEvent evt)? BuildEvent(SqliteDataReader reader)
        {
            var idOrdinal = reader.GetOrdinal(_idColumn);
            var fnOrdinal = reader.GetOrdinal(_filenameColumn);

            if (reader.IsDBNull(idOrdinal) || reader.IsDBNull(fnOrdinal))
                return null;

            var id = reader.GetInt64(idOrdinal);
            var filename = reader.GetString(fnOrdinal);

            // Parse timestamps (완료 필수 취급, 시작은 선택)
            string completedAt = "";
            if (!string.IsNullOrEmpty(_timestampColumn))
            {
                var tsOrdinal = reader.GetOrdinal(_timestampColumn);
                if (!reader.IsDBNull(tsOrdinal))
                    completedAt = ParseTimestamp(reader.GetString(tsOrdinal));
            }
            string startedAt = "";
            if (!string.IsNullOrEmpty(_startColumn))
            {
                int sOrdinal = -1;
                try { sOrdinal = reader.GetOrdinal(_startColumn); } catch { sOrdinal = -1; }
                if (sOrdinal >= 0 && !reader.IsDBNull(sOrdinal))
                    startedAt = ParseTimestamp(reader.GetString(sOrdinal));
            }

            // Parse size
            double widthMm = 0, heightMm = 0;
            if (_sizeColumns.Length >= 2)
            {
                var wOrdinal = reader.GetOrdinal(_sizeColumns[0]);
                var hOrdinal = reader.GetOrdinal(_sizeColumns[1]);
                if (!reader.IsDBNull(wOrdinal)) widthMm = ConvertToMm(reader.GetDouble(wOrdinal));
                if (!reader.IsDBNull(hOrdinal)) heightMm = ConvertToMm(reader.GetDouble(hOrdinal));
            }

            // Extract order number from filename (if IA naming is used)
            string? orderNumber = null;
            int? fileSeq = null;
            var seqMatch = FileSeqRegex.Match(filename);
            if (seqMatch.Success)
            {
                orderNumber = seqMatch.Groups[1].Value;
                fileSeq = int.Parse(seqMatch.Groups[2].Value);
            }
            else
            {
                var orderMatch = OrderNumberRegex.Match(filename);
                if (orderMatch.Success)
                    orderNumber = orderMatch.Groups[1].Value;
            }

            // 상태 판정: status_column 설정 시 값 매핑(미설정이면 기존대로 OK)
            string printStatus = "OK";
            if (!string.IsNullOrEmpty(_statusColumn))
            {
                int stOrdinal = -1;
                try { stOrdinal = reader.GetOrdinal(_statusColumn); } catch { stOrdinal = -1; }
                if (stOrdinal >= 0 && !reader.IsDBNull(stOrdinal))
                {
                    var stVal = reader.GetValue(stOrdinal)?.ToString() ?? "";
                    if (System.Array.IndexOf(_statusError, stVal) >= 0) printStatus = "ERROR";
                    else if (System.Array.IndexOf(_statusCancel, stVal) >= 0) printStatus = "CANCEL";
                    else if (_statusOk.Length > 0 && System.Array.IndexOf(_statusOk, stVal) < 0)
                        Console.WriteLine($"[{EquipmentId}] unknown {_statusColumn}={stVal} for '{filename}' → defaulting OK");
                }
            }

            var evt = new PrintEvent
            {
                PrinterName = EquipmentId,
                FileName = filename,
                FilePath = filename,
                PrintStatus = printStatus,
                OutputSize = widthMm > 0 && heightMm > 0
                    ? $"{widthMm:F0} X {heightMm:F0}"
                    : "",
                OrderNumber = orderNumber,
                FileSeq = fileSeq
            };

            if (!string.IsNullOrEmpty(completedAt))
            {
                var parts = completedAt.Split(' ');
                if (parts.Length >= 2) { evt.EndDate = parts[0]; evt.EndTime = parts[1]; }
            }
            if (!string.IsNullOrEmpty(startedAt))
            {
                var parts = startedAt.Split(' ');
                if (parts.Length >= 2) { evt.StartDate = parts[0]; evt.StartTime = parts[1]; }
            }

            return (id, evt);
        }

        public void ResetPosition()
        {
            _lastId = 0;
            SavePosition();
            _cancelWatch.Clear();
            SaveWatch();
        }

        private void PruneWatch()
        {
            var expire = DateTime.Now.AddDays(-WATCH_EXPIRE_DAYS);
            var stale = new List<long>();
            foreach (var kv in _cancelWatch)
                if (kv.Value < expire) stale.Add(kv.Key);
            foreach (var k in stale) _cancelWatch.Remove(k);
            // 상한 초과 시 오래된 것부터 정리 (IN 절 비대 방지)
            while (_cancelWatch.Count > WATCH_MAX)
            {
                long oldest = 0; var oldestAt = DateTime.MaxValue;
                foreach (var kv in _cancelWatch)
                    if (kv.Value < oldestAt) { oldest = kv.Key; oldestAt = kv.Value; }
                _cancelWatch.Remove(oldest);
            }
        }

        private void LoadWatch()
        {
            try
            {
                if (!File.Exists(_watchFile)) return;
                var map = System.Text.Json.JsonSerializer.Deserialize<Dictionary<long, DateTime>>(File.ReadAllText(_watchFile));
                if (map != null) foreach (var kv in map) _cancelWatch[kv.Key] = kv.Value;
            }
            catch (Exception ex) { Console.WriteLine($"[{EquipmentId}] cancel-watch load failed: {ex.Message}"); }
        }

        private void SaveWatch()
        {
            try { File.WriteAllText(_watchFile, System.Text.Json.JsonSerializer.Serialize(_cancelWatch)); }
            catch (Exception ex) { Console.WriteLine($"[{EquipmentId}] cancel-watch save failed: {ex.Message}"); }
        }

        public bool IsAccessible() => File.Exists(_dbPath);

        private double ConvertToMm(double value)
        {
            return _sizeUnit switch
            {
                "pt" => value / 2.835,   // 1mm = 2.835pt
                "inch" => value * 25.4,
                _ => value               // already mm
            };
        }

        private string ParseTimestamp(string raw)
        {
            // Epson format: "2026-05-11 오후 5:11:59" (Korean AM/PM)
            // Or standard: "2026-05-11 17:11:59"
            if (string.IsNullOrEmpty(raw) || raw.StartsWith("0001-01-01"))
                return "";

            // Try Korean AM/PM format
            var koreanMatch = Regex.Match(raw, @"(\d{4}-\d{2}-\d{2})\s*(오전|오후)\s*(\d{1,2}):(\d{2}):(\d{2})");
            if (koreanMatch.Success)
            {
                var date = koreanMatch.Groups[1].Value;
                var ampm = koreanMatch.Groups[2].Value;
                var hour = int.Parse(koreanMatch.Groups[3].Value);
                var min = koreanMatch.Groups[4].Value;
                var sec = koreanMatch.Groups[5].Value;

                if (ampm == "오후" && hour < 12) hour += 12;
                else if (ampm == "오전" && hour == 12) hour = 0;

                return $"{date} {hour:D2}:{min}:{sec}";
            }

            // Try standard datetime
            if (DateTime.TryParse(raw, out var dt))
                return dt.ToString("yyyy-MM-dd HH:mm:ss");

            return raw;
        }

        private long LoadPosition()
        {
            try
            {
                if (File.Exists(_positionFile))
                {
                    var text = File.ReadAllText(_positionFile).Trim();
                    if (long.TryParse(text, out var pos))
                        return pos;
                    Console.WriteLine($"[{EquipmentId}] Position file corrupt, starting from 0");
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[{EquipmentId}] Failed to load position: {ex.Message}, starting from 0");
            }
            return 0;
        }

        private void SavePosition()
        {
            try
            {
                // Atomic write: temp file → rename to prevent corruption on crash
                var tempFile = _positionFile + ".tmp";
                File.WriteAllText(tempFile, _lastId.ToString());
                File.Move(tempFile, _positionFile, overwrite: true);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[{EquipmentId}] Failed to save position: {ex.Message}");
            }
        }
    }
}
