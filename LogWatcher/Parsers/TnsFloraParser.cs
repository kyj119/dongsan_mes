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
    /// 평판(Flora) 2축 조인 파서 — TopazRip(전송) + Flora 프린터 소프트웨어(실인쇄)가 **같은 PC**에 있을 때.
    ///
    /// 왜 합치는가 (2026-08-26 출력실2 현장 취소 3라운드 실측):
    ///   · TNSRip `Print.log` 의 블록은 RIP→프린터 **전송** 단위다. 전송 중 취소는 `Cancel!` 로 잡히지만
    ///     **전송이 끝난 뒤 프린터에서 누른 취소는 무흔적**이라 정상 OK 로 쌓인다(유령 OK).
    ///     실측: R1 정상=OK · R2 전송중 취소=CANCEL · **R3 전송후 취소=OK(오판)**.
    ///   · Flora 는 실인쇄를 `REC\print_rec.dat` 에 **고정 크기 레코드**로 append 한다.
    ///     여기엔 중단 플래그와 실제 시작/종료 시각이 들어 있다.
    ///   → Print.log = 신원(파일명·주문번호·규격), print_rec.dat = 결과(실시작/실종료/취소). 이벤트 1건만 보낸다.
    ///
    /// 규모(출력실2 print_rec.dat 20,137 레코드 = 2019-11-21~2026-08-26 전량):
    ///   완주 17,636 · **중단 2,501 = 12.4%**(최근 20영업일은 약 20%). 같은 기간 Print.log 가 본 취소는 0.3%뿐.
    ///
    /// 레코드 구조 (2,376바이트 고정. 2026-08-26 실측으로 확정, 시각 파싱 20,137/20,137 성공):
    ///   0x0000 매직 5C A3 F0 F0 · 0x0008 uint16 레코드ID(단조증가)
    ///   0x0024 .prt 전체 경로 (OS ANSI = 한국어 Windows 면 cp949, NUL 종료)
    ///   0x0910 SYSTEMTIME 시작 · 0x0920 SYSTEMTIME 종료
    ///   0x0933 중단 플래그 (0=완주 / 1=취소)  ← 정본
    ///   0x0938 pass 수(진행량) — 판정에 쓰지 않는다. 방향성 확인용일 뿐(완주 중앙값 403초 vs 취소 79초).
    ///
    /// 조인 = **파일명**. print_rec 는 RIP 산출물(`&lt;잡명&gt;NNNN_M.prt`), Print.log 는 원본(.eps/.jpg) 이라
    ///        꼬리 `NNNN_M.prt` 만 떼면 basename 이 같다(프로브 5건·업무잡 전수 일치).
    ///        시각 조인보다 강하다 — 취소 후 재출력이 잦아(1,123종) 시간창은 어느 회차인지 못 가린다.
    ///
    /// config:
    ///   log_path            (required) TNSRip Print.log — 기존 `tns` 와 같은 키(설정 이관 호환).
    ///   print_rec_path      (required) ...\REC\print_rec.dat
    ///   record_size         (default 2376) — 기종별로 다를 수 있어 열어 둔다. 파일 길이로 검증한다.
    ///   rip_fallback_hours  (default 6, 0=끄기) — Flora 축이 이 시간 동안 안 물면 Print.log 이벤트를
    ///                       그대로 송출(전송 기준 = 종전 동작). 형식이 바뀌어도 실적이 조용히 0 이 되지 않게.
    ///
    /// 위치 파일: TNS 축 = "{id}.pos"(내장 PrintLogParser 그대로 → 기존 tns 설치에서 이관해도 재적재 없음),
    ///           Flora 축 = "{id}.rec.pos", 미결 신원 큐 = "{id}.recpend.json".
    /// </summary>
    public class TnsFloraParser : IEquipmentParser
    {
        private readonly PrintLogParser _rip;      // 신원 축 (이벤트를 직접 내보내지 않고 큐에 쌓는다)
        private readonly string _logPath;
        private readonly string _recPath;
        private readonly int _recSize;
        private readonly int _fallbackHours;
        private readonly string _stateFile;
        private readonly string _pendingFile;

        private long _lastOffset = -1;             // print_rec.dat 소비 위치 (레코드 경계)
        private bool _stateLoaded;
        private bool _forceAll;
        private bool _warnedMagic;

        private readonly List<PendingRip> _pending = new();

        public string EquipmentId { get; }
        public string Name { get; }

        // 레코드 내 오프셋 (위 표 참조)
        private const int OffMagic = 0x0000;
        private const int OffPath = 0x0024;
        private const int OffStart = 0x0910;
        private const int OffEnd = 0x0920;
        private const int OffFlag = 0x0933;
        private const int PathMax = 260;
        private static readonly byte[] Magic = { 0x5C, 0xA3, 0xF0, 0xF0 };

        // "<잡명>0000_0.prt" 의 꼬리 — 이것만 떼면 Print.log 의 잡 이름과 같아진다
        private static readonly Regex PrtTailRe = new(@"\d{4}_\d+\.prt$", RegexOptions.Compiled | RegexOptions.IgnoreCase);

        static TnsFloraParser()
        {
            try { Encoding.RegisterProvider(CodePagesEncodingProvider.Instance); } catch { /* 이미 등록됨 */ }
        }

        public TnsFloraParser(WatcherConfig config, string positionsDir)
        {
            EquipmentId = config.EquipmentId;
            Name = config.Name;
            _logPath = config.GetConfigString("log_path");
            if (string.IsNullOrEmpty(_logPath))
                throw new ArgumentException($"[{EquipmentId}] log_path is required for tns_flora parser");
            _recPath = config.GetConfigString("print_rec_path");
            if (string.IsNullOrEmpty(_recPath))
                throw new ArgumentException($"[{EquipmentId}] print_rec_path is required for tns_flora parser");

            _recSize = config.GetConfigInt("record_size", 2376);
            if (_recSize < 0x0940) throw new ArgumentException($"[{EquipmentId}] record_size 가 너무 작습니다: {_recSize}");
            _fallbackHours = config.GetConfigInt("rip_fallback_hours", 6);

            _rip = new PrintLogParser(_logPath, Path.Combine(positionsDir, $"{EquipmentId}.pos"));
            _stateFile = Path.Combine(positionsDir, $"{EquipmentId}.rec.pos");
            _pendingFile = Path.Combine(positionsDir, $"{EquipmentId}.recpend.json");
            LoadPending();
        }

        public bool IsAccessible() => File.Exists(_logPath) && File.Exists(_recPath);

        public void ResetPosition()
        {
            _rip.ResetPosition();
            _forceAll = true; _lastOffset = 0; _stateLoaded = true;
            _pending.Clear();
            try { if (File.Exists(_stateFile)) File.Delete(_stateFile); } catch { /* best effort */ }
            try { if (File.Exists(_pendingFile)) File.Delete(_pendingFile); } catch { /* best effort */ }
        }

        private sealed class PendingRip
        {
            public DateTime SeenAt { get; set; }
            // 이름 조인은 큐에서 빼지 않고 표시만 한다 — 취소 후 재출력이 같은 신원을 다시 물어야 하므로.
            public bool Claimed { get; set; }
            public PrintEvent Evt { get; set; } = new();
        }

        public List<PrintEvent> ReadNewEntries()
        {
            var events = new List<PrintEvent>();
            if (!IsAccessible())
            {
                Console.WriteLine($"[{EquipmentId}] 경로 접근 불가 — Print.log 또는 print_rec_path: {_recPath}");
                return events;
            }

            LoadState();

            // 1) TNS 축 — 신원을 미결 큐로. 립 단계 취소·에러는 프린터까지 못 갔으니 종전대로 즉시 통과.
            foreach (var rip in _rip.ReadNewEntries())
            {
                rip.EquipmentId = EquipmentId;
                if (rip.PrintStatus != "OK") { events.Add(rip); continue; }
                _pending.Add(new PendingRip { SeenAt = DateTime.Now, Evt = rip });
            }

            // 2) Flora 축 — 고정 크기 레코드 append
            ReadRecords(events);

            // 3) 안전망 — Flora 축이 오래 침묵하면 Print.log 이벤트를 종전 동작대로 송출
            if (_fallbackHours > 0)
            {
                var cutoff = DateTime.Now.AddHours(-_fallbackHours);
                for (int i = _pending.Count - 1; i >= 0; i--)
                {
                    if (_pending[i].SeenAt > cutoff) continue;
                    if (_pending[i].Claimed) { _pending.RemoveAt(i); continue; }   // 이미 물렸다 — 조용히 정리
                    var rip = _pending[i].Evt;
                    Console.WriteLine($"[{EquipmentId}] ⚠ Flora 미조인 {_fallbackHours}h 경과 — 전송 기준 폴백 송출: {rip.FileName}");
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

        // ── print_rec.dat 소비 ─────────────────────────────────────────────

        private void ReadRecords(List<PrintEvent> outEvents)
        {
            long len;
            try { len = new FileInfo(_recPath).Length; }
            catch (Exception ex) { Console.WriteLine($"[{EquipmentId}] print_rec 크기 확인 실패: {ex.Message}"); return; }

            if (len % _recSize != 0)
            {
                // 기종이 다르면 레코드 크기가 다르다. 억지로 읽으면 전 레코드가 어긋나므로 아예 읽지 않는다
                // (립 폴백이 살아 있어 실적은 종전대로 흐른다).
                Console.WriteLine($"[{EquipmentId}] ⚠ print_rec 길이 {len} 가 record_size {_recSize} 의 배수가 아닙니다 — Flora 축 건너뜀");
                return;
            }

            if (_lastOffset < 0) { _lastOffset = len; SaveState(); Console.WriteLine($"[{EquipmentId}] 첫 실행 — print_rec 끝에서 시작 ({len / _recSize} 레코드)"); return; }

            if (_lastOffset > len)
            {
                // append-only 인데 줄었다 = 비워졌거나 교체됐다. 0 으로 되돌리면 2만 건이 한꺼번에 재송출되므로
                // 끝으로 정렬한다 (RIPLOG 인코딩 사고와 같은 교훈).
                Console.WriteLine($"[{EquipmentId}] ⚠ print_rec 가 줄었습니다 ({_lastOffset} > {len}) — 파일 끝으로 정렬");
                _lastOffset = len; SaveState(); return;
            }
            if (_lastOffset == len) return;

            try
            {
                using var fs = new FileStream(_recPath, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete);
                fs.Seek(_lastOffset, SeekOrigin.Begin);
                var buf = new byte[_recSize];
                while (_lastOffset + _recSize <= len)
                {
                    int read = 0;
                    while (read < _recSize)
                    {
                        int n = fs.Read(buf, read, _recSize - read);
                        if (n <= 0) break;
                        read += n;
                    }
                    if (read < _recSize) break;      // 쓰는 중 — 다음 폴에
                    _lastOffset += _recSize;
                    var evt = ParseRecord(buf);
                    if (evt != null) outEvents.Add(evt);
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[{EquipmentId}] print_rec 읽기 실패: {ex.Message}");
            }
        }

        private PrintEvent? ParseRecord(byte[] b)
        {
            for (int i = 0; i < Magic.Length; i++)
            {
                if (b[OffMagic + i] == Magic[i]) continue;
                if (!_warnedMagic)
                {
                    _warnedMagic = true;
                    Console.WriteLine($"[{EquipmentId}] ⚠ print_rec 레코드 매직 불일치 — 형식이 다를 수 있습니다 (record_size={_recSize})");
                }
                return null;
            }

            var start = ReadSystemTime(b, OffStart);
            var end = ReadSystemTime(b, OffEnd);
            if (start == null) return null;                 // 시각을 못 읽는 레코드는 버린다(캘리브레이션 등)

            var full = ReadAnsiString(b, OffPath, PathMax);
            if (string.IsNullOrWhiteSpace(full)) return null;

            var key = PrtTailRe.Replace(Path.GetFileName(full), "");
            var status = b[OffFlag] == 1 ? "CANCEL" : "OK";
            var rip = ClaimRipByName(key);
            if (rip == null)
                Console.WriteLine($"[{EquipmentId}] ⚠ 립 잡을 못 찾음 (key={key}) — 도안명 없이 보냅니다");

            var s = start.Value;
            var e = end ?? s;
            if (e < s) e = s;

            var evt = new PrintEvent
            {
                EquipmentId = EquipmentId,
                EventKind = "PRINT",
                PrinterName = Name,
                // 조인 실패해도 .prt 이름 자체가 진짜 도안명이다 — UNMATCHED- 를 붙이면 주문번호 매칭까지 잃는다
                FilePath = rip?.FilePath ?? full,
                FileName = rip?.FileName ?? key,
                PrintStatus = status,
                StartDate = s.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
                StartTime = s.ToString("HH:mm:ss", CultureInfo.InvariantCulture),
                EndDate = e.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
                EndTime = e.ToString("HH:mm:ss", CultureInfo.InvariantCulture),
                OutputSize = rip?.OutputSize ?? "",
                Dpi = rip?.Dpi ?? "",
                OrderNumber = rip?.OrderNumber,
                FileSeq = rip?.FileSeq,
                CardNumber = rip?.CardNumber,
                CopyColumns = rip?.CopyColumns ?? 1,
                CopyRows = rip?.CopyRows ?? 1,
                TileCount = rip?.TileCount ?? 0,
                TileIndex = rip?.TileIndex ?? 0,
            };

            Console.WriteLine($"[{EquipmentId}] {status} {(e - s).TotalMinutes:0}분  {evt.FileName}");
            return evt;
        }

        /// <summary>
        /// 파일명(꼬리 제외)으로 미결 신원을 찾는다. **큐에서 빼지 않고 표시만** 한다 —
        /// 취소 후 같은 .prt 를 다시 걸면 립은 1건인데 인쇄는 여러 번이라(실측 1,123종) 빼면 2회차부터 미아가 된다.
        /// 같은 이름이 여럿이면 최신 것.
        /// </summary>
        private PrintEvent? ClaimRipByName(string key)
        {
            if (string.IsNullOrEmpty(key)) return null;
            for (int i = _pending.Count - 1; i >= 0; i--)
            {
                if (!string.Equals(KeyOf(_pending[i].Evt), key, StringComparison.OrdinalIgnoreCase)) continue;
                _pending[i].Claimed = true;
                return _pending[i].Evt;
            }
            return null;
        }

        private static string KeyOf(PrintEvent e)
        {
            var name = !string.IsNullOrEmpty(e.FileName) ? e.FileName : (e.FilePath ?? "");
            name = name.Trim();
            try { return Path.GetFileNameWithoutExtension(name); } catch { return name; }
        }

        /// <summary>Win32 SYSTEMTIME (uint16 × 8, little-endian). 값이 이상하면 null.</summary>
        private static DateTime? ReadSystemTime(byte[] b, int off)
        {
            int y = b[off] | (b[off + 1] << 8);
            int mo = b[off + 2] | (b[off + 3] << 8);
            int d = b[off + 6] | (b[off + 7] << 8);
            int h = b[off + 8] | (b[off + 9] << 8);
            int mi = b[off + 10] | (b[off + 11] << 8);
            int s = b[off + 12] | (b[off + 13] << 8);
            if (y < 2000 || y > 2100 || mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || s > 59) return null;
            try { return new DateTime(y, mo, d, h, mi, s); }
            catch (ArgumentOutOfRangeException) { return null; }
        }

        /// <summary>NUL 종료 OS ANSI 문자열. 한국어 Windows 는 cp949 — 실패하면 시스템 기본으로 폴백.</summary>
        private static string ReadAnsiString(byte[] b, int off, int max)
        {
            int end = off;
            int limit = Math.Min(off + max, b.Length);
            while (end < limit && b[end] != 0) end++;
            int len = end - off;
            if (len <= 0) return "";
            try { return Encoding.GetEncoding(949).GetString(b, off, len).Trim(); }
            catch { return Encoding.Default.GetString(b, off, len).Trim(); }
        }

        // ── 상태 저장/복원 ─────────────────────────────────────────────────

        private void LoadState()
        {
            if (_stateLoaded) return;
            _stateLoaded = true;
            try
            {
                if (File.Exists(_stateFile) && long.TryParse(File.ReadAllText(_stateFile).Trim(), out var off))
                {
                    _lastOffset = off;
                    return;
                }
            }
            catch (Exception ex) { Console.WriteLine($"[{EquipmentId}] state load failed: {ex.Message}"); }
            _lastOffset = -1;   // 첫 실행 — ReadRecords 가 파일 끝으로 맞춘다
        }

        private void SaveState()
        {
            try { File.WriteAllText(_stateFile, _lastOffset.ToString(CultureInfo.InvariantCulture)); }
            catch (Exception ex) { Console.WriteLine($"[{EquipmentId}] state save failed: {ex.Message}"); }
        }

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
