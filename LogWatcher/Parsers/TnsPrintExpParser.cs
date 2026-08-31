using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using LogWatcher.Config;
using LogWatcher.Core;

namespace LogWatcher.Parsers
{
    /// <summary>
    /// TNS(TopazRip) 계열 2축 조인 파서 — TNS 립 + PrintExp_X64(실인쇄)가 **같은 PC**에 있을 때 쓴다.
    ///
    /// 왜 합치는가 (2026-08-19 TOPM-01·HSM-03 수거 실측):
    ///   · TNS Print.log 레코드의 시각 2개는 **립핑 구간**이다(1510×3430mm 가 85초로 기록되는 물리 불가).
    ///     립 완료 후의 인쇄 취소는 무흔적 — TOPM-01 08-18 09:31 건이 prod 에 OK 78초로 적재됐지만
    ///     PrintExp 에는 09:32:11 被取消. KM전사(flexi_printexp)와 같은 구조의 맹점.
    ///   · PrintExp 일자 로그(Log[yyyy_MM_dd].txt)는 실인쇄 시작(启动任务)·완료(_PrintWait---打印完成)·
    ///     취소(打印控制线程---被取消)를 남긴다. 단 도안이 뭔지 모른다(~section0.prn — 스탬프 없음).
    ///   → TNS = 신원(파일·주문번호·규격·매수), PrintExp = 결과(실시작/실종료/취소). 완성 이벤트 1건만 보낸다.
    ///
    /// 조인 = **FIFO 순서 + 시간창** (flexi_printexp 의 스탬프 조인과 다르다 — 여기는 스탬프가 없다):
    ///   · 립-동시-인쇄(边RIP边打)라 즉시 시작 건은 启动任务 ≈ 립 시작 +4~12초 (TOPM·HSM 실측).
    ///   · 대기열에 쌓인 건은 앞 건 인쇄가 끝나야 启动 — 립 시작과 몇 분 이상 벌어질 수 있다.
    ///   → 후보 = 미결 립 중 립시작 ∈ [启动 − rip_fallback_hours, 启动 + tol], 그중 **가장 오래된 것**(FIFO).
    ///   · 결과는 순서대로만 소비한다 — 선두 결과가 미조인·미숙성이면 뒷 결과를 먼저 조인하지 않는다
    ///     (TOPM 실측: 취소 마커(09:32:11)가 립 레코드 완성(09:32:31)보다 **먼저** 나온다 — 결과를 잠깐 기다려야 한다).
    ///
    /// 취소 두 갈래:
    ///   · 립 단계 취소 = TNS 가 Cancel! 레코드를 직접 남김 → 종전대로 즉시 송출(조인 풀에 안 넣는다).
    ///   · 인쇄 단계 취소 = PrintExp 被取消. 립이 중단돼 레코드가 아예 없을 수 있다(HSM-03 08-18 09:37 실측)
    ///     → 숙성 후 신원 미상으로 송출. 단 직전 립 취소 통과와 ±5분 이내면 같은 건으로 보고 억제(이중계상 방지).
    ///
    /// config:
    ///   log_path               (required) TNS Print.log — 기존 tns 파서와 같은 키(설정 이관 호환).
    ///   print_log_dir          (required) PrintExp 일자 로그 폴더 (Log[yyyy_MM_dd].txt 가 있는 곳, 보통 ...\PrintExp_X64...\Log)
    ///   join_tolerance_seconds (default 30) — 启动任务 가 립 시작보다 이만큼까지 앞서도 허용(시계 지터).
    ///   result_wait_seconds    (default 180) — 미조인 결과를 로그시계 기준 이만큼 숙성 후 미상 송출.
    ///   rip_fallback_hours     (default 6, 0=끄기) — 이 시간 동안 결과가 안 붙은 립 레코드는 종전 동작(립 기준)으로 송출.
    ///                          조인 시간창의 하한도 겸한다(과거 립 오매칭 방지).
    ///
    /// 위치 파일: TNS 축 = "{id}.pos"(내장 PrintLogParser 그대로 → 기존 tns 설치에서 이관해도 재적재 없음),
    ///           PrintExp 축 = "{id}.pex.pos", 미결 큐(립+결과) = "{id}.pexpend.json"(재시작 유실 방지).
    /// </summary>
    public class TnsPrintExpParser : IEquipmentParser
    {
        private readonly PrintLogParser _rip;         // TNS 바이너리 신원 축 (이벤트를 직접 내보내지 않고 큐에 쌓는다)
        private readonly string _logPath;
        private readonly string _printDir;
        private readonly int _tolSec;
        private readonly int _resultWaitSec;
        private readonly int _fallbackHours;
        private readonly string _stateFile;
        private readonly string _pendingFile;

        private string _posDate = "";
        private long _lastPosition;
        private bool _stateLoaded;
        private bool _forceAll;
        private bool _secondAxisOk = true;

        private DateTime? _curStart;                  // 진행 중 启动任务 시각 (폴 경계 유지)
        private DateTime _logClock = DateTime.MinValue; // 마지막으로 본 PrintExp 줄 시각(결과 숙성 기준)
        private DateTime? _lastRipCancelAt;           // 립 취소 통과 시각 — 고아 인쇄취소 이중계상 억제
        // 폴백으로 이미 내보낸 립의 시작 시각 — 뒤늦게 도착한 결과가 같은 인쇄를 또 세지 않게 한다.
        // 취소 축의 _lastRipCancelAt 와 같은 역할이지만 **목록**이다: 폴백은 대기열이 길수록
        // 여러 건이 연달아 걸리므로 한 칸짜리 상태로는 두 번째부터 새어 나간다.
        private readonly List<DateTime> _fallbackStarts = new();

        private readonly List<PendingRip> _rips = new();
        private readonly List<PendingResult> _results = new();

        public string EquipmentId { get; }
        public string Name { get; }

        // [SM][1][2026/08/18 08:54:28][000000] 启动任务：~section0.prn  (TOPM 5.7.6.5.14 · HSM 5.7.6.5.70 실측, GBK)
        private static readonly Regex StartRe = new(@"启动任务[：:]", RegexOptions.Compiled);
        // 완료 = _PrintWait 줄이 정본. 점선 줄(打印完成......)은 버전별 누락 대비 폴백 — 블록이 이미 닫혔으면 무시된다.
        // (작업상태 줄 「作业【..】打印完成.作业ID..」는 점이 1개라 \.{6} 에 안 걸린다 — HSM 5.7.6.5.70 실측)
        private static readonly Regex DoneRe = new(@"_PrintWait---打印完成|打印完成\.{6}", RegexOptions.Compiled);
        private static readonly Regex CancelRe = new(@"打印控制线程---被取消|_PrintWait---PRINT_RESULT_CANCEL", RegexOptions.Compiled);
        private static readonly Regex LineTimeRe = new(@"\[(\d{4})[/-](\d{2})[/-](\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?\]", RegexOptions.Compiled);
        private static readonly Regex LogDateRe = new(@"Log\[(\d{4})[_-](\d{2})[_-](\d{2})\]", RegexOptions.Compiled);

        static TnsPrintExpParser()
        {
            try { Encoding.RegisterProvider(CodePagesEncodingProvider.Instance); } catch { /* 이미 등록됨 */ }
        }

        public TnsPrintExpParser(WatcherConfig config, string positionsDir)
        {
            EquipmentId = config.EquipmentId;
            Name = config.Name;
            _logPath = config.GetConfigString("log_path");
            if (string.IsNullOrEmpty(_logPath))
                throw new ArgumentException($"[{EquipmentId}] config.log_path is required for tns_printexp parser");
            _printDir = config.GetConfigString("print_log_dir");
            if (string.IsNullOrEmpty(_printDir))
                throw new ArgumentException($"[{EquipmentId}] print_log_dir is required for tns_printexp parser");

            _rip = new PrintLogParser(_logPath, Path.Combine(positionsDir, $"{EquipmentId}.pos"));
            _tolSec = config.GetConfigInt("join_tolerance_seconds", 30);
            _resultWaitSec = config.GetConfigInt("result_wait_seconds", 180);
            _fallbackHours = config.GetConfigInt("rip_fallback_hours", 6);
            _stateFile = Path.Combine(positionsDir, $"{EquipmentId}.pex.pos");
            _pendingFile = Path.Combine(positionsDir, $"{EquipmentId}.pexpend.json");
            LoadPending();
        }

        // ★ 신원 축(Print.log)만 본다 — PrintExp 가 사라져도 단축으로 계속 흘린다.
        public bool IsAccessible() => File.Exists(_logPath);

        public void ResetPosition()
        {
            _rip.ResetPosition();
            _forceAll = true; _lastPosition = 0; _posDate = ""; _stateLoaded = true;
            _curStart = null; _logClock = DateTime.MinValue; _lastRipCancelAt = null;
            _rips.Clear(); _results.Clear(); _fallbackStarts.Clear();
            try { if (File.Exists(_stateFile)) File.Delete(_stateFile); } catch { /* best effort */ }
            try { if (File.Exists(_pendingFile)) File.Delete(_pendingFile); } catch { /* best effort */ }
        }

        private sealed class PendingRip
        {
            public DateTime Start { get; set; }
            public DateTime SeenAt { get; set; }
            public PrintEvent Evt { get; set; } = new();
        }

        private sealed class PendingResult
        {
            public DateTime Start { get; set; }
            public DateTime End { get; set; }
            public string Status { get; set; } = "OK";
            public DateTime SeenAt { get; set; }
        }

        public List<PrintEvent> ReadNewEntries()
        {
            var events = new List<PrintEvent>();
            if (!IsAccessible())
            {
                Console.WriteLine($"[{EquipmentId}] 경로 접근 불가 — Print.log: {_logPath}");
                return events;
            }

            LoadState();

            // 1) TNS 축 — OK 레코드만 조인 풀에. 립 단계 취소/에러는 종전대로 즉시 통과.
            foreach (var rip in _rip.ReadNewEntries())
            {
                rip.EquipmentId = EquipmentId;
                var start = ParseRipStart(rip);
                if (rip.PrintStatus != "OK")
                {
                    _lastRipCancelAt = start ?? DateTime.Now;
                    events.Add(rip);
                    continue;
                }
                if (start == null)
                {
                    // 시각을 못 읽는 레코드는 조인 불가 — 그대로 흘려보낸다 (유실 금지)
                    Console.WriteLine($"[{EquipmentId}] 립 시작시각 불명 — 립 기준으로 송출: {rip.FileName}");
                    events.Add(rip);
                    continue;
                }
                _rips.Add(new PendingRip { Start = start.Value, SeenAt = DateTime.Now, Evt = rip });
            }

            // 2) PrintExp 축 — 일별 로테이션 (flexi_printexp 와 동일 방식)
            var files = new List<(string Path, long StartPos, bool Tracked)>();
            if (!ProbeSecondAxis(Directory.Exists(_printDir), "PrintExp 로그 폴더")) files.Clear();
            else if (_forceAll)
            {
                foreach (var f in Directory.GetFiles(_printDir, "Log[*].txt").OrderBy(f => f))
                    files.Add((f, 0, false));
            }
            else
            {
                var today = DateTime.Now.ToString("yyyy_MM_dd", CultureInfo.InvariantCulture);
                var todayPath = Path.Combine(_printDir, $"Log[{today}].txt");
                if (_posDate.Length > 0 && _posDate != today)
                {
                    var prev = Path.Combine(_printDir, $"Log[{_posDate}].txt");
                    if (File.Exists(prev)) files.Add((prev, _lastPosition, false));
                    _posDate = today; _lastPosition = 0;
                }
                if (_posDate.Length == 0) _posDate = today;
                if (File.Exists(todayPath)) files.Add((todayPath, _lastPosition, true));
            }

            foreach (var (path, startPos, tracked) in files)
            {
                var (lines, newPos) = ReadFrom(path, startPos);
                if (tracked) _lastPosition = newPos;
                var logDate = LogDateOf(path);
                foreach (var line in lines) ConsumeLine(line, logDate);
            }

            // 3) 조인 — 결과를 시간순으로만 소비 (FIFO). 선두가 미조인·미숙성이면 정지.
            MatchResults(events);

            // 4) 안전망 — 결과가 오래 안 붙는 립 레코드는 종전 동작(립 기준)으로 송출
            if (_fallbackHours > 0)
            {
                var cutoff = DateTime.Now.AddHours(-_fallbackHours);
                for (int i = _rips.Count - 1; i >= 0; i--)
                {
                    if (_rips[i].SeenAt > cutoff) continue;
                    var rip = _rips[i].Evt;
                    Console.WriteLine($"[{EquipmentId}] ⚠ PrintExp 미조인 {_fallbackHours}h 경과 — 립 기준 폴백 송출: {rip.FileName}");
                    events.Add(rip);
                    // 이 립은 큐에서 사라지므로, 나중에 결과가 도착하면 조인 후보를 못 찾아 UNMATCHED 로
                    // **한 번 더** 나간다(같은 물리 인쇄가 실적 2건). 시작 시각을 남겨 그때 억제한다.
                    _fallbackStarts.Add(_rips[i].Start);
                    _rips.RemoveAt(i);
                }
                // 정리 — 조인 시간창(fallback) 의 두 배를 넘긴 항목은 다시 붙을 일이 없다.
                // 기준은 **로그 시계**다: _fallbackStarts 와 조인 창(lowCut) 이 둘 다 로그 시각 축이라
                // DateTime.Now 로 자르면 로그 시계가 밀린 PC 에서 멀쩡한 항목을 지운다.
                if (_fallbackStarts.Count > 0 && _logClock > DateTime.MinValue)
                {
                    var fbCut = _logClock.AddHours(-_fallbackHours * 2.0);
                    _fallbackStarts.RemoveAll(s => s < fbCut);
                }
                // 로그가 조용해 _logClock 이 안 움직여도 무한히 자라지 않게 한다(하드 상한).
                if (_fallbackStarts.Count > 500) _fallbackStarts.RemoveRange(0, _fallbackStarts.Count - 500);
            }

            if (!_forceAll) SaveState();
            _forceAll = false;
            SavePending();

            return events;
        }

        // ── PrintExp 로그 줄 소비 ───────────────────────────────────────────


        // 둘째 축이 사라져도 장비를 멈추지 않는다 — 신원 축만으로 종전(단축) 동작을 계속한다.
        // ★ 사라진 것을 조용히 넘기지 않는다: 상태가 바뀔 때마다 한 번씩 남긴다.
        private bool ProbeSecondAxis(bool present, string what)
        {
            if (present == _secondAxisOk) return present;
            _secondAxisOk = present;
            Console.WriteLine(present
                ? $"[{EquipmentId}] {what} 복구 — 2축 조인 재개"
                : $"[{EquipmentId}] ⚠ {what} 없음 — 2축 조인 중단, 립 기준으로만 송출합니다 (취소·실소요 미반영)");
            return present;
        }

        private void ConsumeLine(string line, DateTime logDate)
        {
            var t = TimeOf(line, logDate);
            if (t != null && t.Value > _logClock) _logClock = t.Value;

            if (StartRe.IsMatch(line))
            {
                if (_curStart != null)
                    Console.WriteLine($"[{EquipmentId}] ⚠ 결과 없이 새 작업 시작 — 이전 블록 폐기 (start={_curStart:HH:mm:ss})");
                _curStart = t ?? _logClock;
                return;
            }
            if (_curStart == null) return;

            if (DoneRe.IsMatch(line)) { CloseBlock("OK", t); return; }
            if (CancelRe.IsMatch(line)) { CloseBlock("CANCEL", t); }
        }

        private void CloseBlock(string status, DateTime? endAt)
        {
            var start = _curStart!.Value;
            _curStart = null;
            _results.Add(new PendingResult
            {
                Start = start,
                End = endAt ?? start,
                Status = status,
                SeenAt = DateTime.Now,
            });
        }

        // ── FIFO 조인 ──────────────────────────────────────────────────────

        private void MatchResults(List<PrintEvent> outEvents)
        {
            while (_results.Count > 0)
            {
                var r = _results[0];

                // 후보 = 립시작 ∈ [启动 − fallback, 启动 + tol] 중 가장 오래된 것 (FIFO)
                int best = -1;
                var lowCut = _fallbackHours > 0 ? r.Start.AddHours(-_fallbackHours) : DateTime.MinValue;
                var highCut = r.Start.AddSeconds(_tolSec);
                for (int i = 0; i < _rips.Count; i++)
                {
                    if (_rips[i].Start < lowCut || _rips[i].Start > highCut) continue;
                    if (best < 0 || _rips[i].Start < _rips[best].Start) best = i;
                }

                if (best >= 0)
                {
                    Emit(r, _rips[best].Evt, outEvents);
                    _rips.RemoveAt(best);
                    _results.RemoveAt(0);
                    continue;
                }

                // 미조인 — 립 레코드가 결과보다 늦게 완성될 수 있다(TOPM 취소 실측 +20초) → 숙성 대기
                bool aged = (_logClock > r.End.AddSeconds(_resultWaitSec))
                            || (DateTime.Now > r.SeenAt.AddSeconds(_resultWaitSec * 2));
                if (!aged) break;   // 선두 유지 — 뒷 결과가 립을 가로채지 않게

                // ⚠ 폴백 뒤에 도착한 **취소**는 억제하지 않는다 — 억제하면 폴백이 내보낸 "인쇄했다"만
                //   남아 취소 사실이 통째로 사라진다. 건수는 2건이 되지만 어느 쪽도 거짓이 아니다.
                if (r.Status == "CANCEL")
                {
                    if (_lastRipCancelAt != null && Math.Abs((_lastRipCancelAt.Value - r.Start).TotalMinutes) <= 5)
                        Console.WriteLine($"[{EquipmentId}] 고아 인쇄취소 억제 — 립 취소({_lastRipCancelAt:HH:mm:ss})와 같은 건으로 판정");
                    else
                        Emit(r, null, outEvents);
                }
                else
                {
                    // 립 후보가 없는 완료. 두 갈래다 —
                    //   ① 폴백이 이미 그 립을 내보낸 뒤 결과가 늦게 도착한 것 → 같은 인쇄, 억제한다.
                    //      판정 창은 위 후보 탐색과 **같은** [lowCut, highCut] 을 쓴다. 립이 아직
                    //      큐에 있었다면 잡혔을 바로 그 범위라, 창을 따로 정할 필요가 없다.
                    //   ② 진짜로 립 기록이 없는 완료(정비 출력·노즐체크 등) → 종전대로 미상 송출.
                    int fb = _fallbackStarts.FindIndex(s => s >= lowCut && s <= highCut);
                    if (fb >= 0)
                    {
                        Console.WriteLine($"[{EquipmentId}] 고아 완료 억제 — 폴백 송출(립 {_fallbackStarts[fb]:MM-dd HH:mm:ss})과 같은 건으로 판정");
                        _fallbackStarts.RemoveAt(fb);
                    }
                    else
                    {
                        Console.WriteLine($"[{EquipmentId}] ⚠ 립 기록 없는 완료 ({r.Start:HH:mm:ss}~{r.End:HH:mm:ss}) — 미상 송출");
                        Emit(r, null, outEvents);
                    }
                }
                _results.RemoveAt(0);
            }
        }

        private void Emit(PendingResult r, PrintEvent? rip, List<PrintEvent> outEvents)
        {
            var evt = new PrintEvent
            {
                EquipmentId = EquipmentId,
                EventKind = "PRINT",
                PrinterName = rip?.PrinterName ?? Name,
                FilePath = rip?.FilePath ?? Path.Combine(_printDir, $"unmatched-{r.Start:yyyyMMddHHmmss}"),
                FileName = rip?.FileName ?? $"UNMATCHED-{r.Start:yyyyMMddHHmmss}",
                PrintStatus = r.Status,
                StartDate = r.Start.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
                StartTime = r.Start.ToString("HH:mm:ss", CultureInfo.InvariantCulture),
                EndDate = r.End.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
                EndTime = r.End.ToString("HH:mm:ss", CultureInfo.InvariantCulture),
                OutputSize = rip?.OutputSize ?? "",
                Dpi = rip?.Dpi ?? "",
                OrderNumber = rip?.OrderNumber,
                FileSeq = rip?.FileSeq,
                CopyColumns = rip?.CopyColumns ?? 1,
                CopyRows = rip?.CopyRows ?? 1,
                TileCount = rip?.TileCount ?? 0,
                TileIndex = rip?.TileIndex ?? 0,
            };

            var mins = (r.End - r.Start).TotalMinutes;
            Console.WriteLine($"[{EquipmentId}] {r.Status} {mins:0}분  {evt.FileName}");
            outEvents.Add(evt);
        }

        /// <summary>PrintLogParser 이벤트의 립 시작시각 ("yyyy.MM.dd" + "H:mm:ss").</summary>
        private static DateTime? ParseRipStart(PrintEvent evt)
        {
            if (string.IsNullOrEmpty(evt.StartDate) || string.IsNullOrEmpty(evt.StartTime)) return null;
            return DateTime.TryParseExact($"{evt.StartDate} {evt.StartTime}", "yyyy.MM.dd H:mm:ss",
                                          CultureInfo.InvariantCulture, DateTimeStyles.None, out var d)
                ? d : (DateTime?)null;
        }

        // ── 파일 읽기 (인코딩 자동판별: GBK(TOPM·HSM 실측) / UTF-16LE(KM전사 전례)) ──

        private (List<string> lines, long newPos) ReadFrom(string path, long from)
        {
            var lines = new List<string>();
            try
            {
                using var fs = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete);

                bool utf16 = false;
                if (fs.Length >= 2)
                {
                    var bom = new byte[2];
                    fs.Read(bom, 0, 2);
                    utf16 = bom[0] == 0xFF && bom[1] == 0xFE;
                }

                if (from > fs.Length) from = 0;                       // 로테이션/트런케이트 방어
                if (utf16)
                {
                    if (from < 2) from = 2;                            // BOM 건너뜀
                    if ((from & 1) == 1) from++;                       // 2바이트 정렬
                }
                fs.Seek(from, SeekOrigin.Begin);
                var len = (int)(fs.Length - from);
                if (len <= 0) return (lines, from);
                var buf = new byte[len];
                var read = fs.Read(buf, 0, len);

                // 마지막 완성된 줄까지만 소비 (줄 중간에서 끊긴 것은 다음 폴에)
                int cut = -1;
                if (utf16)
                {
                    for (int i = read - 2; i >= 0; i -= 2)
                        if (buf[i] == (byte)'\n' && buf[i + 1] == 0x00) { cut = i + 2; break; }
                }
                else
                {
                    for (int i = read - 1; i >= 0; i--)
                        if (buf[i] == (byte)'\n') { cut = i + 1; break; }
                }
                if (cut < 0) return (lines, from);

                var enc = utf16 ? Encoding.Unicode : Encoding.GetEncoding(936);
                var text = enc.GetString(buf, 0, cut);
                lines.AddRange(text.Split('\n').Select(l => l.TrimEnd('\r')).Where(l => l.Length > 0));
                return (lines, from + cut);
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
            var m = LineTimeRe.Match(line);
            if (!m.Success) return null;
            try
            {
                return new DateTime(int.Parse(m.Groups[1].Value), int.Parse(m.Groups[2].Value), int.Parse(m.Groups[3].Value),
                                    int.Parse(m.Groups[4].Value), int.Parse(m.Groups[5].Value), int.Parse(m.Groups[6].Value));
            }
            catch (ArgumentOutOfRangeException) { return null; }   // 손상 줄
        }

        // ── 상태 저장/복원 ─────────────────────────────────────────────────

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

            // 최초 실행: 과거 PrintExp 로그를 통째로 밀어넣지 않는다 — 오늘 파일 끝에서 시작
            _posDate = DateTime.Now.ToString("yyyy_MM_dd", CultureInfo.InvariantCulture);
            var today = Path.Combine(_printDir, $"Log[{_posDate}].txt");
            try { _lastPosition = File.Exists(today) ? new FileInfo(today).Length : 0; } catch { _lastPosition = 0; }
            Console.WriteLine($"[{EquipmentId}] first run — start at EOF of Log[{_posDate}].txt ({_lastPosition} bytes)");
            SaveState();
        }

        private void SaveState()
        {
            try { File.WriteAllText(_stateFile, $"{_posDate}|{_lastPosition}"); }
            catch (Exception ex) { Console.WriteLine($"[{EquipmentId}] state save failed: {ex.Message}"); }
        }

        private sealed class PendingState
        {
            public List<PendingRip> Rips { get; set; } = new();
            public List<PendingResult> Results { get; set; } = new();
            // 폴백 억제 상태도 같이 남긴다 — 재시작이 이걸 잊으면 그 순간 대기 중인 결과가
            // 전부 UNMATCHED 로 새로 나가, 억제를 넣은 의미가 없어진다.
            public List<DateTime> FallbackStarts { get; set; } = new();
        }

        /// <summary>미결 큐 영속화 — 재시작 시 립은 끝났지만 아직 인쇄 안 끝난 잡의 신원이 날아가지 않게.</summary>
        private void SavePending()
        {
            try
            {
                File.WriteAllText(_pendingFile, JsonSerializer.Serialize(
                    new PendingState { Rips = _rips, Results = _results, FallbackStarts = _fallbackStarts }));
            }
            catch (Exception ex) { Console.WriteLine($"[{EquipmentId}] pending save failed: {ex.Message}"); }
        }

        private void LoadPending()
        {
            try
            {
                if (!File.Exists(_pendingFile)) return;
                var s = JsonSerializer.Deserialize<PendingState>(File.ReadAllText(_pendingFile));
                if (s == null) return;
                _rips.AddRange(s.Rips);
                _results.AddRange(s.Results);
                _fallbackStarts.AddRange(s.FallbackStarts);
            }
            catch (Exception ex) { Console.WriteLine($"[{EquipmentId}] pending load failed: {ex.Message}"); }
        }
    }
}
