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
        private readonly string _positionFile;
        private long _lastId;

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

            if (string.IsNullOrEmpty(_dbPath))
                throw new ArgumentException($"[{EquipmentId}] config.db_path is required for epson parser");
            if (string.IsNullOrEmpty(_query))
                throw new ArgumentException($"[{EquipmentId}] config.query is required for epson parser");

            _positionFile = Path.Combine(positionsDir, $"{EquipmentId}.pos");
            _lastId = LoadPosition();
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

            using var reader = cmd.ExecuteReader();
            long maxId = _lastId;

            while (reader.Read())
            {
                var idOrdinal = reader.GetOrdinal(_idColumn);
                var fnOrdinal = reader.GetOrdinal(_filenameColumn);

                if (reader.IsDBNull(idOrdinal) || reader.IsDBNull(fnOrdinal))
                    continue;

                var id = reader.GetInt64(idOrdinal);
                var filename = reader.GetString(fnOrdinal);

                // Parse timestamp
                string completedAt = "";
                if (!string.IsNullOrEmpty(_timestampColumn))
                {
                    var tsOrdinal = reader.GetOrdinal(_timestampColumn);
                    if (!reader.IsDBNull(tsOrdinal))
                    {
                        var tsRaw = reader.GetString(tsOrdinal);
                        completedAt = ParseTimestamp(tsRaw);
                    }
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

                var evt = new PrintEvent
                {
                    PrinterName = EquipmentId,
                    FileName = filename,
                    FilePath = filename,
                    PrintStatus = "OK",
                    OutputSize = widthMm > 0 && heightMm > 0
                        ? $"{widthMm:F0} X {heightMm:F0}"
                        : "",
                    OrderNumber = orderNumber,
                    FileSeq = fileSeq
                };

                // Set timestamps
                if (!string.IsNullOrEmpty(completedAt))
                {
                    var parts = completedAt.Split(' ');
                    if (parts.Length >= 2)
                    {
                        evt.EndDate = parts[0];
                        evt.EndTime = parts[1];
                    }
                }

                events.Add(evt);

                if (id > maxId) maxId = id;
            }

            // Save position
            if (maxId > _lastId)
            {
                _lastId = maxId;
                SavePosition();
            }

            return events;
        }

        public void ResetPosition()
        {
            _lastId = 0;
            SavePosition();
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
