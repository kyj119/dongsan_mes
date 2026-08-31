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
    /// KM전사(Flexi 계열) 2축 조인 파서 — FlexiPRINT(전송) + PrintExp_X64(실인쇄)가 **같은 PC**에 있을 때 쓴다.
    ///
    /// 왜 합치는가 (2026-08-12 KM전사1 현장 취소검증 실측):
    ///   · RIPLOG 의 '인쇄' 블록은 RIP→프린터 **데이터 전송** 단위다. 전송은 1매 5~6초에 끝나고
    ///     실물 인쇄는 몇 분씩 돈다 — 전송 완료 후의 취소(오퍼레이터 대부분의 취소)는 RIPLOG 에 **무흔적**이라
    ///     취소→재전송이 전부 '정상 출력'으로 쌓여 실적이 부풀었다(양구군 5조 주문/25매 기록).
    ///   · PrintExp 본 로그(Log\main\Log[yyyy_MM_dd].txt)는 실인쇄를 pass 단위로 추적하고
    ///     취소를 `打印控制线程---被取消` 로 남긴다. 단 도안이 뭔지 모른다(~section0.prn).
    ///   → RIPLOG = 신원(파일·주문번호·매수·네스트), PrintExp = 결과(실시작/실종료/취소). 완성 이벤트 1건만 보낸다.
    ///
    /// 조인 키는 PrintExp 가 `启动任务：` 뒤에 무엇을 찍는가에 따라 **두 가지**다:
    ///   (A) 14자리 스탬프 `20260812120424151` → 시각 조인. RIPLOG 인쇄 블록의
    ///       '출력 시작 날짜 및 시간' 과 초 단위로 일치한다(KM전사1 실측).
    ///   (B) PRN 파일명 `...（200x180）....prt` → **이름 조인**(확장자 뗀 basename).
    ///       HYB-3200-01·SOLV-3200-01 이 여기 해당(2026-08-26 실측). RIPLOG 는 원본(.eps/.jpg),
    ///       PrintExp 는 RIP 산출물(.prt) 이라 확장자만 다르고 basename 은 같다(실측 6/6 일치).
    ///       이름 조인은 취소 후 재출력에 강하다 — 립핑 1건에 인쇄 시작 3건이 붙는 상황(08-24 실측)에서
    ///       시각 조인은 2·3회차를 놓치지만 이름 조인은 같은 신원을 계속 물린다.
    ///
    /// ⚠ PrintExp 로그는 **코드페이지가 섞인다** — 프로그램 문구는 GBK(cp936), 파일명은 OS ANSI(cp949).
    ///   한 인코딩으로 둘 다 못 읽는다. 마커는 cp936 으로 읽고 파일명만 RecoverAnsiName 으로 되돌린다.
    ///
    /// config:
    ///   log_path               (required) RIPLOG.HTML — 기존 flexi 파서와 같은 키(설정 이관 호환).
    ///   print_log_dir          (required) PrintExp 본 로그 폴더 (Log[yyyy_MM_dd].txt 가 있는 곳, 보통 ...\Log\main)
    ///   join_tolerance_seconds (default 5)
    ///   rip_fallback_hours     (default 6, 0=끄기) — PrintExp 축이 이 시간 동안 잡을 안 가져가면
    ///                          RIPLOG 이벤트를 그대로 송출(전송 기준 = 종전 동작). PrintExp 로그 형식이
    ///                          바뀌어도 생산 기록이 조용히 0 이 되지 않게 하는 안전망.
    ///
    /// 위치 파일: RIPLOG 축 = "{id}.pos"(내장 FlexiHtmlParser 그대로 → 기존 설치에서 이관해도 재적재 없음),
    ///           PrintExp 축 = "{id}.pex.pos", 미결 신원 큐 = "{id}.pexpend.json"(재시작 유실 방지).
    /// </summary>
    public class FlexiPrintExpParser : IEquipmentParser
    {
        private readonly FlexiHtmlParser _flexi;      // RIPLOG 신원 축 (이벤트를 직접 내보내지 않고 큐에 쌓는다)
        private readonly string _printDir;
        private readonly int _tolSec;
        private readonly int _fallbackHours;
        private readonly string _stateFile;
        private readonly string _pendingFile;

        private string _posDate = "";
        private long _lastPosition;
        private bool _stateLoaded;
        private bool _forceAll;
        private bool _secondAxisOk = true;

        private bool _printUtf16;                     // ReadFrom 이 판별 — UTF-16 이면 파일명이 이미 정상
        private Block? _cur;                          // 진행 중 PrintExp 잡 블록 (폴 경계 유지)
        private readonly List<PendingRip> _pending = new();

        public string EquipmentId { get; }
        public string Name { get; }

        // 启动任务：20260812120424151 또는 启动任务：<파일명>.prt (전각/반각 콜론 모두).
        // ★ \S+ 로 끊으면 안 된다 — 실제 파일명에 공백이 들어간다("...상하6개 큰펀칭_24일택배.prt").
        //   스탬프도 .prt 도 아닌 값(Pass·HeadC)은 캘리브레이션이라 버린다.
        private static readonly Regex StartRe = new(@"启动任务[：:]\s*(.+?)\s*$", RegexOptions.Compiled);
        private static readonly Regex SpecRe = new(
            @"任务精度:(\d+)\s*X\s*(\d+),图像大小:([\d.]+)mm\s*X\s*([\d.]+)mm",
            RegexOptions.Compiled);
        private static readonly Regex DoneRe = new(@"_PrintWait---打印完成", RegexOptions.Compiled);
        // 취소 2줄은 같은 초에 함께 나오지만(HYB-3200-01 R3 실측 09:47:48) 버전별 누락 대비로 둘 다 본다.
        // ★ CancelDataSend·Cancel()开始 는 **정상 완료에도** 나오는 정리 호출이다 — 이 둘만 취소로 본다.
        private static readonly Regex CancelRe = new(@"打印控制线程---被取消|_PrintWait---PRINT_RESULT_CANCEL", RegexOptions.Compiled);
        // 줄머리 시각 — KM전사1 실측 [12:04:24.411], 타 버전 대비 날짜 포함형도 지원 (8색 전례)
        private static readonly Regex TimeRe = new(@"\[(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?\]", RegexOptions.Compiled);
        private static readonly Regex DateTimeRe = new(@"\[(\d{4})[/-](\d{2})[/-](\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?\]", RegexOptions.Compiled);
        private static readonly Regex LogDateRe = new(@"Log\[(\d{4})[_-](\d{2})[_-](\d{2})\]", RegexOptions.Compiled);
        private static readonly Regex StampRe = new(@"^(\d{14})", RegexOptions.Compiled);

        static FlexiPrintExpParser()
        {
            try { Encoding.RegisterProvider(CodePagesEncodingProvider.Instance); } catch { /* 이미 등록됨 */ }
        }

        public FlexiPrintExpParser(WatcherConfig config, string positionsDir)
        {
            EquipmentId = config.EquipmentId;
            Name = config.Name;
            _printDir = config.GetConfigString("print_log_dir");
            if (string.IsNullOrEmpty(_printDir))
                throw new ArgumentException($"[{EquipmentId}] print_log_dir is required for flexi_printexp parser");
            _flexi = new FlexiHtmlParser(config, positionsDir);   // log_path 검증은 여기서 된다
            _tolSec = config.GetConfigInt("join_tolerance_seconds", 5);
            _fallbackHours = config.GetConfigInt("rip_fallback_hours", 6);
            _stateFile = Path.Combine(positionsDir, $"{EquipmentId}.pex.pos");
            _pendingFile = Path.Combine(positionsDir, $"{EquipmentId}.pexpend.json");
            LoadPending();
        }

        // ★ 신원 축(RIPLOG)만 본다 — PrintExp 가 사라져도 단축으로 계속 흘린다.
        public bool IsAccessible() => _flexi.IsAccessible();

        public void ResetPosition()
        {
            _flexi.ResetPosition();
            _forceAll = true; _lastPosition = 0; _posDate = ""; _stateLoaded = true; _cur = null;
            _pending.Clear();
            try { if (File.Exists(_stateFile)) File.Delete(_stateFile); } catch { /* best effort */ }
            try { if (File.Exists(_pendingFile)) File.Delete(_pendingFile); } catch { /* best effort */ }
        }

        private sealed class Block
        {
            public DateTime Start;
            public string? Stamp;      // yyyyMMddHHmmss — 시각 조인용 (A안)
            public string? JobKey;     // 확장자 뗀 PRN 파일명 — 이름 조인용 (B안). 한글은 복원된 상태.
            public double W, H;
            public string Dpi = "";
            // Stamp·JobKey 둘 다 null = Pass/HeadC 등 비인쇄 작업 — 마커만 흡수하고 버린다
        }

        private sealed class PendingRip
        {
            public DateTime Start { get; set; }
            public DateTime SeenAt { get; set; }
            // 이름 조인은 큐에서 빼지 않고 이 표시만 세운다(재출력이 같은 신원을 다시 물어야 하므로).
            // 표시된 항목은 폴백 송출 대상에서 빠지고, 보존기간이 지나면 조용히 정리된다.
            public bool Claimed { get; set; }
            public PrintEvent Evt { get; set; } = new();
        }

        public List<PrintEvent> ReadNewEntries()
        {
            var events = new List<PrintEvent>();
            if (!IsAccessible())
            {
                Console.WriteLine($"[{EquipmentId}] 경로 접근 불가 — RIPLOG.HTML");
                return events;
            }

            LoadState();

            // 1) RIPLOG 축 — 신원 이벤트를 미결 큐로 (직접 송출 안 함)
            foreach (var rip in _flexi.ReadNewEntries())
            {
                var start = ParseEvtStart(rip);
                if (start == null)
                {
                    // 시각을 못 읽는 블록은 조인 불가 — 그대로 흘려보낸다 (유실 금지)
                    Console.WriteLine($"[{EquipmentId}] RIPLOG 시작시각 불명 — 전송 기준으로 송출: {rip.FileName}");
                    rip.EquipmentId = EquipmentId;
                    events.Add(rip);
                    continue;
                }
                _pending.Add(new PendingRip { Start = start.Value, SeenAt = DateTime.Now, Evt = rip });
            }

            // 2) PrintExp 축 — 일별 로테이션 (TransferPressParser 와 동일 방식)
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
                    _posDate = today; _lastPosition = 0; _cur = null;
                }
                if (_posDate.Length == 0) _posDate = today;
                if (File.Exists(todayPath)) files.Add((todayPath, _lastPosition, true));
            }

            foreach (var (path, startPos, tracked) in files)
            {
                var (lines, newPos) = ReadFrom(path, startPos);
                if (tracked) _lastPosition = newPos;
                var logDate = LogDateOf(path);
                foreach (var line in lines) ConsumeLine(line, logDate, events);
            }

            // 3) 안전망 — PrintExp 축이 오래 침묵하면 RIPLOG 이벤트를 종전 동작대로 송출
            if (_fallbackHours > 0)
            {
                var cutoff = DateTime.Now.AddHours(-_fallbackHours);
                for (int i = _pending.Count - 1; i >= 0; i--)
                {
                    if (_pending[i].SeenAt > cutoff) continue;
                    if (_pending[i].Claimed) { _pending.RemoveAt(i); continue; }   // 이미 물렸다 — 조용히 정리
                    var rip = _pending[i].Evt;
                    Console.WriteLine($"[{EquipmentId}] ⚠ PrintExp 미조인 {_fallbackHours}h 경과 — 전송 기준 폴백 송출: {rip.FileName}");
                    rip.EquipmentId = EquipmentId;
                    events.Add(rip);
                    _pending.RemoveAt(i);
                }
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

        private void ConsumeLine(string line, DateTime logDate, List<PrintEvent> outEvents)
        {
            var st = StartRe.Match(line);
            if (st.Success)
            {
                if (_cur != null && (_cur.Stamp ?? _cur.JobKey) != null)
                    Console.WriteLine($"[{EquipmentId}] ⚠ 결과 없이 새 작업 시작 — 이전 블록 폐기 ({_cur.Stamp ?? _cur.JobKey})");
                var raw = st.Groups[1].Value;
                var stampMatch = StampRe.Match(raw);
                string? jobKey = null;
                if (!stampMatch.Success && raw.EndsWith(".prt", StringComparison.OrdinalIgnoreCase))
                {
                    try { jobKey = Path.GetFileNameWithoutExtension(RecoverAnsiName(raw)); }
                    catch { jobKey = RecoverAnsiName(raw); }
                }
                _cur = new Block
                {
                    Start = TimeOf(line, logDate) ?? logDate,
                    Stamp = stampMatch.Success ? stampMatch.Groups[1].Value : null,
                    JobKey = string.IsNullOrWhiteSpace(jobKey) ? null : jobKey,
                };
                return;
            }
            if (_cur == null) return;

            var sp = SpecRe.Match(line);
            if (sp.Success && _cur.W == 0)
            {
                _cur.Dpi = $"{sp.Groups[1].Value}x{sp.Groups[2].Value} DPI";
                _cur.W = ParseD(sp.Groups[3].Value);
                _cur.H = ParseD(sp.Groups[4].Value);
                return;
            }

            if (DoneRe.IsMatch(line)) { CloseBlock("OK", TimeOf(line, logDate), outEvents); return; }
            if (CancelRe.IsMatch(line)) { CloseBlock("CANCEL", TimeOf(line, logDate), outEvents); }
        }

        private void CloseBlock(string status, DateTime? endAt, List<PrintEvent> outEvents)
        {
            var b = _cur;
            _cur = null;
            if (b == null || (b.Stamp == null && b.JobKey == null)) return;   // 캘리브레이션 마커는 버린다

            PrintEvent? rip;
            if (b.Stamp != null)
            {
                var at = DateTime.TryParseExact(b.Stamp, "yyyyMMddHHmmss", CultureInfo.InvariantCulture,
                                                DateTimeStyles.None, out var d) ? d : (DateTime?)null;
                rip = at != null ? ClaimRip(at.Value) : null;
            }
            else
            {
                rip = ClaimRipByName(b.JobKey!);
            }
            var key = b.Stamp ?? b.JobKey!;
            if (rip == null)
                Console.WriteLine($"[{EquipmentId}] ⚠ 리핑 잡을 못 찾음 (key={key}) — 도안명 없이 보냅니다");

            var start = b.Start;
            var end = endAt ?? start;

            var evt = new PrintEvent
            {
                EquipmentId = EquipmentId,
                EventKind = "PRINT",
                PrinterName = Name,
                FilePath = rip?.FilePath ?? Path.Combine(_printDir, $"{key}.prt"),
                FileName = rip?.FileName ?? (b.JobKey != null ? b.JobKey : $"UNMATCHED-{key}"),
                PrintStatus = status,
                StartDate = start.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
                StartTime = start.ToString("HH:mm:ss", CultureInfo.InvariantCulture),
                EndDate = end.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
                EndTime = end.ToString("HH:mm:ss", CultureInfo.InvariantCulture),
                // 규격은 PrintExp(실출력) 우선, 없으면 RIPLOG 값
                OutputSize = b.W > 0 && b.H > 0
                    ? $"{b.W.ToString("0.#", CultureInfo.InvariantCulture)} X {b.H.ToString("0.#", CultureInfo.InvariantCulture)}"
                    : rip?.OutputSize ?? "",
                Dpi = b.Dpi.Length > 0 ? b.Dpi : rip?.Dpi ?? "",
                OrderNumber = rip?.OrderNumber,
                FileSeq = rip?.FileSeq,
                CopyColumns = rip?.CopyColumns ?? 1,
                CopyRows = rip?.CopyRows ?? 1,
                IsNest = rip?.IsNest ?? false,
                NestDeclaredCount = rip?.NestDeclaredCount ?? 0,
                NestMembers = rip?.NestMembers ?? new List<NestMember>(),
            };

            var mins = (end - start).TotalMinutes;
            Console.WriteLine($"[{EquipmentId}] {status} {mins:0}분  {evt.FileName}"
                              + (evt.IsNest ? $"  [합판 {evt.NestMembers.Count}종]" : ""));
            outEvents.Add(evt);
        }

        /// <summary>스탬프 시각 ±tolerance 로 미결 RIPLOG 이벤트를 찾아 꺼낸다(가장 가까운 것).</summary>
        private PrintEvent? ClaimRip(DateTime at)
        {
            int best = -1;
            double bestDiff = _tolSec + 1;
            for (int i = 0; i < _pending.Count; i++)
            {
                var diff = Math.Abs((_pending[i].Start - at).TotalSeconds);
                if (diff <= _tolSec && diff < bestDiff) { best = i; bestDiff = diff; }
            }
            if (best < 0) return null;
            var evt = _pending[best].Evt;
            _pending.RemoveAt(best);
            return evt;
        }

        /// <summary>
        /// 파일명(확장자 제외)으로 미결 RIPLOG 신원을 찾는다.
        /// 시각 조인과 달리 **큐에서 빼지 않고 표시만** 한다: 취소 후 같은 .prt 를 다시 걸면
        /// 립핑은 1건인데 인쇄 시작은 여러 번이라(08-24 실측 3회) 빼버리면 2·3회차가 미아가 된다.
        /// 같은 이름이 여럿이면 최신 것 — 재전송된 도안이 맞다.
        /// </summary>
        private PrintEvent? ClaimRipByName(string key)
        {
            for (int i = _pending.Count - 1; i >= 0; i--)
            {
                if (!string.Equals(KeyOf(_pending[i].Evt), key, StringComparison.OrdinalIgnoreCase)) continue;
                _pending[i].Claimed = true;
                return _pending[i].Evt;
            }
            return null;
        }

        /// <summary>RIPLOG 이벤트의 이름 조인키 — 경로·확장자를 뗀 파일명.</summary>
        private static string KeyOf(PrintEvent e)
        {
            var name = !string.IsNullOrEmpty(e.FileName) ? e.FileName : (e.FilePath ?? "");
            name = name.Trim();
            try { return Path.GetFileNameWithoutExtension(name); } catch { return name; }
        }

        /// <summary>
        /// cp936 으로 읽힌 한글 파일명을 되돌린다 (원본은 cp949 바이트인데 로그를 cp936 으로 읽은 결과).
        /// 2026-08-26 HYB-3200-01 실측: 8/8 정확히 복원("贾亥泅荐阜" → "솔벤현수막").
        /// 복원 결과에 한글이 없으면(원래 ASCII 이거나 진짜 중국어면) 원본을 그대로 쓴다 — 멀쩡한 값을 망가뜨리지 않는다.
        /// </summary>
        private string RecoverAnsiName(string raw)
        {
            if (_printUtf16 || string.IsNullOrEmpty(raw)) return raw;
            try
            {
                var ko = Encoding.GetEncoding(949).GetString(Encoding.GetEncoding(936).GetBytes(raw));
                return ko.Any(c => c >= '\uAC00' && c <= '\uD7A3') ? ko : raw;
            }
            catch { return raw; }
        }

        /// <summary>FlexiHtmlParser 이벤트의 시작시각 ("yyyy.MM.dd" + "HH:mm:ss").</summary>
        private static DateTime? ParseEvtStart(PrintEvent evt)
        {
            if (string.IsNullOrEmpty(evt.StartDate) || string.IsNullOrEmpty(evt.StartTime)) return null;
            var s = $"{evt.StartDate.Replace('.', '-')} {evt.StartTime}";
            return DateTime.TryParseExact(s, "yyyy-MM-dd HH:mm:ss", CultureInfo.InvariantCulture,
                                          DateTimeStyles.None, out var d) ? d : (DateTime?)null;
        }

        // ── 파일 읽기 (인코딩 자동판별: UTF-16LE(KM전사1 실측) / GBK(8색 전례)) ──

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

                _printUtf16 = utf16;
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
            var dm = DateTimeRe.Match(line);
            if (dm.Success)
            {
                var g = dm.Groups;
                try
                {
                    return new DateTime(int.Parse(g[1].Value), int.Parse(g[2].Value), int.Parse(g[3].Value),
                                        int.Parse(g[4].Value), int.Parse(g[5].Value), int.Parse(g[6].Value));
                }
                catch (ArgumentOutOfRangeException) { /* 손상 줄 — 짧은 형식 폴백 */ }
            }
            var m = TimeRe.Match(line);
            if (!m.Success) return null;
            return date.Date.AddHours(int.Parse(m.Groups[1].Value))
                            .AddMinutes(int.Parse(m.Groups[2].Value))
                            .AddSeconds(int.Parse(m.Groups[3].Value));
        }

        private static double ParseD(string s) =>
            double.TryParse(s, NumberStyles.Float, CultureInfo.InvariantCulture, out var d) ? d : 0;

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

        /// <summary>미결 신원 큐 영속화 — 재시작 시 전송됐지만 아직 인쇄 안 끝난 잡의 신원이 날아가지 않게.</summary>
        private void SavePending()
        {
            try { File.WriteAllText(_pendingFile, JsonSerializer.Serialize(_pending)); }
            catch (Exception ex) { Console.WriteLine($"[{EquipmentId}] pending save failed: {ex.Message}"); }
        }

        private void LoadPending()
        {
            try
            {
                if (!File.Exists(_pendingFile)) return;
                var items = JsonSerializer.Deserialize<List<PendingRip>>(File.ReadAllText(_pendingFile));
                if (items != null) _pending.AddRange(items);
            }
            catch (Exception ex) { Console.WriteLine($"[{EquipmentId}] pending load failed: {ex.Message}"); }
        }
    }
}
