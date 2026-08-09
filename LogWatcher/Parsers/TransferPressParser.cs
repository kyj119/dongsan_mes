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
    /// 전사 8색 2축 조인 파서 — neoStampa(리핑) + PrintExp_X64(출력)가 **같은 PC**에 있을 때 쓴다.
    ///
    /// 왜 합치는가:
    ///   · neoStampa 만 보면 실제 출력 여부를 모른다. 취소는 PrintExp 에서 일어나고,
    ///     리핑 시간(13분)과 출력 시간(55분)은 전혀 다르다.
    ///   · PrintExp 만 보면 **도안이 뭔지조차 모른다.** 넘겨받은 `~sectionN.prn` 만 안다.
    ///   · 둘을 각각 보내면 물리 출력 1건이 print_events 2행이 되어 실적이 이중계상된다.
    ///   → 여기서 합쳐 **완성된 이벤트 1건**만 보낸다. event_kind 는 PRINT(실적 정본).
    ///
    /// 조인 키 = PrintExp 의 temp 폴더 타임스탬프 ≡ neoStampa 잡의 StartTime.
    /// (2026-08-05 실측: 133/133 이 ±2초, 1:N 중복 0)
    ///
    ///   作业ID:1587814906, 删除TCP文件:C:\PrintExp_X64\temp\20260804091715\~section0.prn
    ///                                                    └── 조인 키
    ///
    /// config:
    ///   rip_log_root     (required) neoStampa 잡 로그 루트 (예 "...\neoStampa 10\Log")
    ///   print_log_dir    (required) PrintExp 로그 폴더 (Log[yyyy_MM_dd].txt 가 있는 곳)
    ///   join_tolerance_seconds (default 5)
    ///   emit_rip_only_after_hours (default 0 = 끄기) — 리핑만 하고 출력 안 한 잡을 RIP 이벤트로 낼지
    /// </summary>
    public class TransferPressParser : IEquipmentParser
    {
        private readonly string _ripRoot;
        private readonly string _printDir;
        private readonly int _tolSec;
        private readonly int _ripOnlyHours;
        private readonly string _stateFile;

        private string _posDate = "";      // 현재 추적 중인 PrintExp 로그의 날짜 (일별 로테이션)
        private long _lastPosition;
        private bool _stateLoaded;
        private bool _forceAll;

        // 진행 중인 잡 블록 (폴 경계를 넘어 유지된다)
        private Block? _cur;

        public string EquipmentId { get; }
        public string Name { get; }

        private static readonly Regex StartRe = new(@"启动任务", RegexOptions.Compiled);
        private static readonly Regex SpecRe = new(
            @"任务精度:(\d+)\s*X\s*(\d+),图像大小:([\d.]+)mm\s*X\s*([\d.]+)mm,颜色数量:(\d+),打印模式:(.+)",
            RegexOptions.Compiled);
        private static readonly Regex DoneRe = new(@"_PrintWait---打印完成", RegexOptions.Compiled);
        private static readonly Regex CancelRe = new(@"打印控制线程---被取消", RegexOptions.Compiled);
        private static readonly Regex TempRe = new(@"作业ID:(-?\d+),\s*删除TCP文件:.*?temp\\(\d{14})\\", RegexOptions.Compiled);
        private static readonly Regex TimeRe = new(@"\[(\d{2}):(\d{2}):(\d{2})\]", RegexOptions.Compiled);
        private static readonly Regex LogDateRe = new(@"Log\[(\d{4})[_-](\d{2})[_-](\d{2})\]", RegexOptions.Compiled);

        static TransferPressParser()
        {
            try { Encoding.RegisterProvider(CodePagesEncodingProvider.Instance); } catch { /* 이미 등록됨 */ }
        }

        public TransferPressParser(WatcherConfig config, string positionsDir)
        {
            EquipmentId = config.EquipmentId;
            Name = config.Name;
            _ripRoot = config.GetConfigString("rip_log_root");
            _printDir = config.GetConfigString("print_log_dir");
            if (string.IsNullOrEmpty(_ripRoot) || string.IsNullOrEmpty(_printDir))
                throw new ArgumentException($"[{EquipmentId}] rip_log_root, print_log_dir are required for neostampa_printexp parser");
            _tolSec = config.GetConfigInt("join_tolerance_seconds", 5);
            _ripOnlyHours = config.GetConfigInt("emit_rip_only_after_hours", 0);
            _stateFile = Path.Combine(positionsDir, $"{EquipmentId}.pos");
        }

        public bool IsAccessible() => Directory.Exists(_ripRoot) && Directory.Exists(_printDir);

        public void ResetPosition()
        {
            _forceAll = true; _lastPosition = 0; _posDate = ""; _stateLoaded = true; _cur = null;
            try { if (File.Exists(_stateFile)) File.Delete(_stateFile); } catch { /* best effort */ }
        }

        private sealed class Block
        {
            public DateTime Start;
            public DateTime? EndAt;
            public string? Status;      // OK | CANCEL
            public string? Temp;        // yyyyMMddHHmmss
            public string? JobId;
            public double W, H;
            public string Dpi = "", Mode = "";
        }

        public List<PrintEvent> ReadNewEntries()
        {
            var events = new List<PrintEvent>();
            if (!IsAccessible())
            {
                Console.WriteLine($"[{EquipmentId}] 경로 접근 불가 — rip:{_ripRoot} print:{_printDir}");
                return events;
            }

            LoadState();

            // 오늘자 PrintExp 로그 (일별 로테이션). --test 는 있는 파일 전부.
            // (경로, 시작오프셋, 위치추적대상) — 자정 넘김 때 어제 파일을 0 부터 다시 읽지 않으려면
            // 오프셋을 파일별로 들고 가야 한다. 파일명에 _posDate 가 들어있는지로 판정하면
            // 이미 today 로 바뀐 뒤라 어제 파일이 항상 "미추적=0부터"가 되어 하루치를 통째로 재전송한다.
            var files = new List<(string Path, long Start, bool Tracked)>();

            if (_forceAll)
            {
                foreach (var f in Directory.GetFiles(_printDir, "Log[*].txt").OrderBy(f => f))
                    files.Add((f, 0, false));
            }
            else
            {
                var today = DateTime.Now.ToString("yyyy_MM_dd", CultureInfo.InvariantCulture);
                var todayPath = Path.Combine(_printDir, $"Log[{today}].txt");
                // 날짜가 바뀌었으면 어제 파일의 **남은 꼬리만** 먼저 훑고 새 파일로 넘어간다.
                // _cur 는 여기서 비우되 어제 파일을 먼저 읽으므로 자정을 걸친 잡 블록은 이어진다.
                if (_posDate.Length > 0 && _posDate != today)
                {
                    var prev = Path.Combine(_printDir, $"Log[{_posDate}].txt");
                    if (File.Exists(prev)) files.Add((prev, _lastPosition, false));
                    _posDate = today; _lastPosition = 0; _cur = null;
                }
                if (_posDate.Length == 0) _posDate = today;
                if (File.Exists(todayPath)) files.Add((todayPath, _lastPosition, true));
            }

            foreach (var (path, start, tracked) in files)
            {
                var (lines, newPos) = ReadFrom(path, start);
                if (tracked) _lastPosition = newPos;

                var logDate = LogDateOf(path);
                foreach (var line in lines) ConsumeLine(line, logDate, events);
            }

            if (!_forceAll) SaveState();
            _forceAll = false;

            if (_ripOnlyHours > 0) EmitRipOnly(events);

            return events;
        }

        // ── PrintExp 로그 줄 소비 → 잡 블록 완성 시 조인 ────────────────────

        private void ConsumeLine(string line, DateTime logDate, List<PrintEvent> outEvents)
        {
            if (StartRe.IsMatch(line))
            {
                var t = TimeOf(line, logDate);
                _cur = new Block { Start = t ?? logDate };
                return;
            }
            if (_cur == null) return;

            var sp = SpecRe.Match(line);
            if (sp.Success && _cur.W == 0)
            {
                _cur.Dpi = $"{sp.Groups[1].Value}x{sp.Groups[2].Value} DPI";
                _cur.W = NeoStampaJobFile.ParseDouble(sp.Groups[3].Value);
                _cur.H = NeoStampaJobFile.ParseDouble(sp.Groups[4].Value);
                _cur.Mode = sp.Groups[6].Value.Trim();
            }
            if (_cur.Status == null && DoneRe.IsMatch(line)) { _cur.Status = "OK"; _cur.EndAt = TimeOf(line, logDate); }
            if (_cur.Status == null && CancelRe.IsMatch(line)) { _cur.Status = "CANCEL"; _cur.EndAt = TimeOf(line, logDate); }

            var tp = TempRe.Match(line);
            if (tp.Success && _cur.Temp == null)
            {
                _cur.JobId = tp.Groups[1].Value;
                _cur.Temp = tp.Groups[2].Value;
                // temp 경로 줄은 잡 정리 시점에 나온다 = 블록의 끝
                var evt = Join(_cur);
                if (evt != null) outEvents.Add(evt);
                _cur = null;
            }
        }

        private PrintEvent? Join(Block b)
        {
            // temp 폴더가 없는 블록은 캘리브레이션/노즐체크다 (실측 379블록 중 246건) — 여기 못 온다
            if (b.Temp == null) return null;
            if (b.Status == null)
            {
                Console.WriteLine($"[{EquipmentId}] 결과 미확정 블록 건너뜀 (temp={b.Temp})");
                return null;
            }

            var at = StampToDate(b.Temp);
            if (at == null) return null;

            var job = FindRipJob(at.Value);
            if (job == null)
            {
                Console.WriteLine($"[{EquipmentId}] ⚠ 리핑 잡을 못 찾음 (temp={b.Temp}) — 도안명 없이 보냅니다");
            }

            var start = b.Start;
            var end = b.EndAt ?? b.Start;

            var evt = new PrintEvent
            {
                EquipmentId = EquipmentId,
                EventKind = "PRINT",          // 실적 정본. 리핑 로그를 따로 보내지 않으므로 이중계상 없음
                PrinterName = Name,
                // 조인이 되면 도안 경로를, 안 되면 temp 폴더를 식별자로 쓴다(추적 가능해야 한다)
                FilePath = job?.FilePath ?? Path.Combine(_printDir, $"temp-{b.Temp}"),
                FileName = job?.PrimaryName ?? $"UNMATCHED-{b.Temp}",
                PrintStatus = b.Status,
                StartDate = start.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
                StartTime = start.ToString("HH:mm:ss", CultureInfo.InvariantCulture),
                EndDate = end.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
                EndTime = end.ToString("HH:mm:ss", CultureInfo.InvariantCulture),
                // 규격은 PrintExp 값(실제 출력분)을 쓴다
                OutputSize = b.W > 0 && b.H > 0
                    ? $"{b.W.ToString("0.#", CultureInfo.InvariantCulture)} X {b.H.ToString("0.#", CultureInfo.InvariantCulture)}"
                    : "",
                Dpi = b.Dpi,
            };

            if (job != null && job.IsNest)
            {
                evt.IsNest = true;
                evt.NestDeclaredCount = job.Members.Count;
                evt.NestMembers = job.Members;
                evt.CopyColumns = 1; evt.CopyRows = 1;
            }
            else
            {
                evt.CopyColumns = 1;
                evt.CopyRows = job != null ? Math.Max(1, job.TotalCopies) : 1;
            }

            var mins = (end - start).TotalMinutes;
            Console.WriteLine($"[{EquipmentId}] {b.Status} {mins:0}분  {evt.FileName}"
                              + (evt.IsNest ? $"  [합판 {evt.NestMembers.Count}종]" : ""));
            return evt;
        }

        // ── neoStampa 잡 인덱스 (StartTime → 잡) ────────────────────────────

        private readonly Dictionary<string, NeoStampaJob> _ripIndex = new();   // "yyyyMMddHHmmss" → job
        private DateTime _ripIndexAt = DateTime.MinValue;
        private readonly HashSet<string> _joined = new();                       // 이미 출력에 쓰인 리핑 잡

        private void RefreshRipIndex(bool force = false)
        {
            if (!force && (DateTime.Now - _ripIndexAt).TotalSeconds < 30) return;
            _ripIndexAt = DateTime.Now;
            _ripIndex.Clear();
            string[] files;
            try { files = Directory.GetFiles(_ripRoot, "*.txt", SearchOption.AllDirectories); }
            catch { return; }
            foreach (var f in files)
            {
                // 값싼 선별: 앞부분에 [General] 이 없으면 neoStampa 잡 파일이 아니다.
                // (로그 루트에 다른 SW 로그가 섞여 있으면 통째로 읽느라 폴이 느려진다)
                if (!LooksLikeJobFile(f)) continue;
                NeoStampaJob? j;
                try { j = NeoStampaJobFile.Parse(f); } catch { continue; }
                if (j?.Start == null) continue;
                _ripIndex[j.Start.Value.ToString("yyyyMMddHHmmss", CultureInfo.InvariantCulture)] = j;
            }
        }

        private static bool LooksLikeJobFile(string path)
        {
            try
            {
                using var fs = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete);
                var buf = new byte[64];
                var n = fs.Read(buf, 0, buf.Length);
                if (n <= 0) return false;
                var head = Encoding.ASCII.GetString(buf, 0, n);
                return head.Contains("[General]");
            }
            catch { return false; }
        }

        private NeoStampaJob? FindRipJob(DateTime at)
        {
            RefreshRipIndex();
            // 정확히 같은 초부터 보고, 없으면 ±tolerance 로 넓힌다
            for (int d = 0; d <= _tolSec; d++)
            {
                foreach (var sign in d == 0 ? new[] { 0 } : new[] { -1, 1 })
                {
                    var k = at.AddSeconds(sign * d).ToString("yyyyMMddHHmmss", CultureInfo.InvariantCulture);
                    if (_ripIndex.TryGetValue(k, out var j)) { _joined.Add(k); return j; }
                }
            }
            return null;
        }

        /// <summary>리핑만 하고 출력에 안 쓰인 잡을 RIP 이벤트로 흘려보낸다(선택). 실적엔 안 잡힌다.</summary>
        private void EmitRipOnly(List<PrintEvent> outEvents)
        {
            RefreshRipIndex();
            var cutoff = DateTime.Now.AddHours(-_ripOnlyHours);
            foreach (var kv in _ripIndex)
            {
                if (_joined.Contains(kv.Key)) continue;
                var j = kv.Value;
                if (j.Start == null || j.Start.Value > cutoff) continue;
                _joined.Add(kv.Key);   // 한 번만
                outEvents.Add(new PrintEvent
                {
                    EquipmentId = EquipmentId,
                    EventKind = "RIP",
                    PrinterName = Name,
                    FilePath = j.FilePath,
                    FileName = j.PrimaryName,
                    PrintStatus = j.RipComplete ? "OK" : "CANCEL",
                    StartDate = j.Start.Value.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
                    StartTime = j.Start.Value.ToString("HH:mm:ss", CultureInfo.InvariantCulture),
                    EndDate = (j.End ?? j.Start.Value).ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
                    EndTime = (j.End ?? j.Start.Value).ToString("HH:mm:ss", CultureInfo.InvariantCulture),
                    IsNest = j.IsNest,
                    NestDeclaredCount = j.IsNest ? j.Members.Count : 0,
                    NestMembers = j.IsNest ? j.Members : new List<NestMember>(),
                    Dpi = NeoStampaJobFile.ExtractDpi(j.PrintMode),
                });
            }
        }

        // ── 파일 읽기 / 상태 ────────────────────────────────────────────────

        /// <summary>GBK 로 디코드해 완성된 줄만 반환. 마지막 미완성 줄은 다음 폴로 넘긴다.</summary>
        private (List<string> lines, long newPos) ReadFrom(string path, long from)
        {
            var lines = new List<string>();
            try
            {
                using var fs = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete);
                if (from > fs.Length) from = 0;              // 로테이션/트런케이트 방어
                fs.Seek(from, SeekOrigin.Begin);
                var len = (int)(fs.Length - from);
                if (len <= 0) return (lines, from);
                var buf = new byte[len];
                var read = fs.Read(buf, 0, len);

                // 마지막 개행까지만 소비 (줄 중간에서 끊긴 것은 다음에)
                int lastNl = -1;
                for (int i = read - 1; i >= 0; i--) if (buf[i] == (byte)'\n') { lastNl = i; break; }
                if (lastNl < 0) return (lines, from);

                var text = Encoding.GetEncoding(936).GetString(buf, 0, lastNl + 1);
                lines.AddRange(text.Split('\n').Select(l => l.TrimEnd('\r')).Where(l => l.Length > 0));
                return (lines, from + lastNl + 1);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[{EquipmentId}] read failed ({Path.GetFileName(path)}): {ex.Message}");
                return (lines, from);
            }
        }

        private static DateTime LogDateOf(string path)
        {
            var m = LogDateRe.Match(Path.GetFileName(path));
            return m.Success
                ? new DateTime(int.Parse(m.Groups[1].Value), int.Parse(m.Groups[2].Value), int.Parse(m.Groups[3].Value))
                : DateTime.Today;
        }

        private static DateTime? TimeOf(string line, DateTime date)
        {
            var m = TimeRe.Match(line);
            if (!m.Success) return null;
            return date.Date.AddHours(int.Parse(m.Groups[1].Value))
                            .AddMinutes(int.Parse(m.Groups[2].Value))
                            .AddSeconds(int.Parse(m.Groups[3].Value));
        }

        private static DateTime? StampToDate(string s)
        {
            return DateTime.TryParseExact(s, "yyyyMMddHHmmss", CultureInfo.InvariantCulture, DateTimeStyles.None, out var d)
                ? d : (DateTime?)null;
        }

        private void LoadState()
        {
            if (_stateLoaded) return;
            _stateLoaded = true;
            try
            {
                if (File.Exists(_stateFile))
                {
                    var parts = File.ReadAllText(_stateFile).Trim().Split('|');
                    if (parts.Length == 2 && long.TryParse(parts[1], out var pos)) { _posDate = parts[0]; _lastPosition = pos; return; }
                }
            }
            catch (Exception ex) { Console.WriteLine($"[{EquipmentId}] state load failed: {ex.Message}"); }

            // 최초 실행: 과거 로그를 통째로 밀어넣지 않는다 — 오늘 파일 끝에서 시작
            _posDate = DateTime.Now.ToString("yyyy_MM_dd", CultureInfo.InvariantCulture);
            var today = Path.Combine(_printDir, $"Log[{_posDate}].txt");
            try { _lastPosition = File.Exists(today) ? new FileInfo(today).Length : 0; } catch { _lastPosition = 0; }
            Console.WriteLine($"[{EquipmentId}] first run — start at EOF of Log[{_posDate}].txt ({_lastPosition} bytes)");
            SaveState();
        }

        private void SaveState()
        {
            try
            {
                var dir = Path.GetDirectoryName(_stateFile);
                if (!string.IsNullOrEmpty(dir)) Directory.CreateDirectory(dir);
                File.WriteAllText(_stateFile, $"{_posDate}|{_lastPosition}");
            }
            catch (Exception ex) { Console.WriteLine($"[{EquipmentId}] state save failed: {ex.Message}"); }
        }
    }
}
