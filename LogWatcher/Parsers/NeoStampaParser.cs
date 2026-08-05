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
    /// neoStampa (Longyin Q2000 등) RIP 로그 파서.
    ///
    /// 다른 파서와 달리 **폴더 감시형**이다 — neoStampa 는 잡이 끝날 때 INI 형식 txt 를
    /// `<log_root>\YYYY-MM-DD\<Document>.txt` 로 **1회 생성**하고 그 뒤 append 하지 않는다.
    /// 따라서 바이트 오프셋(.pos)이 아니라 **처리한 파일의 최대 mtime**을 상태로 저장한다.
    /// 서버가 `file_path + print_completed_at` 으로 멱등 처리하므로 중복 전송은 무해하다.
    ///
    /// 이 로그는 **리핑만** 기록한다. 실제 출력·취소는 하류 Topaz-RIP 에서 일어나므로
    /// 이벤트는 EventKind="RIP" 로 전송되고, 서버는 이것으로 카드를 PRINT_DONE 시키지 않는다.
    ///
    /// config 키:
    ///   log_root        (required) 예 "C:\\Users\\Public\\Documents\\neoStampa 10\\Log"
    ///   settle_seconds  (default 5)  — mtime 이 이보다 최근이면 쓰기 중으로 보고 다음 폴로 미룸
    ///   backfill_days   (default 0)  — 최초 실행 시 소급할 일수. 0 = 과거분 무시
    /// </summary>
    public class NeoStampaParser : IEquipmentParser
    {
        private readonly string _logRoot;
        private readonly string _stateFile;
        private readonly int _settleSeconds;
        private readonly int _backfillDays;

        private DateTime _lastSeenUtc = DateTime.MinValue;
        private bool _stateLoaded;
        private bool _forceAll;   // ResetPosition() → --test 용 전량 재읽기

        /// <summary>중복 전송 여유. 같은 초에 몰린 파일이 경계에서 새지 않도록 뒤로 조금 물러선다.</summary>
        private static readonly TimeSpan Overlap = TimeSpan.FromSeconds(30);

        public string EquipmentId { get; }
        public string Name { get; }

        private static readonly Regex KDotsRegex =
            new(@"^KDots\[[A-Za-z]\]\[\d\]\s*=\s*(\d+)", RegexOptions.Compiled | RegexOptions.Multiline);

        static NeoStampaParser()
        {
            try { Encoding.RegisterProvider(CodePagesEncodingProvider.Instance); } catch { /* already registered */ }
        }

        public NeoStampaParser(WatcherConfig config, string positionsDir)
        {
            EquipmentId = config.EquipmentId;
            Name = config.Name;

            _logRoot = config.GetConfigString("log_root");
            if (string.IsNullOrEmpty(_logRoot))
                throw new ArgumentException($"[{EquipmentId}] config.log_root is required for neostampa parser");

            _settleSeconds = config.GetConfigInt("settle_seconds", 5);
            _backfillDays = config.GetConfigInt("backfill_days", 0);
            _stateFile = Path.Combine(positionsDir, $"{EquipmentId}.pos");
        }

        public bool IsAccessible() => Directory.Exists(_logRoot);

        public void ResetPosition()
        {
            _forceAll = true;
            _lastSeenUtc = DateTime.MinValue;
            _stateLoaded = true;
            try { if (File.Exists(_stateFile)) File.Delete(_stateFile); } catch { /* best effort */ }
        }

        public List<PrintEvent> ReadNewEntries()
        {
            var events = new List<PrintEvent>();
            if (!Directory.Exists(_logRoot))
            {
                Console.WriteLine($"[{EquipmentId}] log_root not found: {_logRoot}");
                return events;
            }

            LoadState();

            var now = DateTime.UtcNow;
            var settleCutoff = now.AddSeconds(-_settleSeconds);
            var since = _forceAll ? DateTime.MinValue : _lastSeenUtc - Overlap;
            var maxSeen = _lastSeenUtc;

            string[] files;
            try { files = Directory.GetFiles(_logRoot, "*.txt", SearchOption.AllDirectories); }
            catch (Exception ex)
            {
                Console.WriteLine($"[{EquipmentId}] enumerate failed: {ex.Message}");
                return events;
            }

            foreach (var path in files)
            {
                DateTime mtime;
                try { mtime = File.GetLastWriteTimeUtc(path); }
                catch { continue; }

                if (mtime <= since) continue;
                if (mtime > settleCutoff) continue;   // 아직 쓰는 중일 수 있다 — 다음 폴에서

                PrintEvent? evt;
                try { evt = ParseJobFile(path); }
                catch (Exception ex)
                {
                    Console.WriteLine($"[{EquipmentId}] parse failed ({Path.GetFileName(path)}): {ex.Message}");
                    continue;
                }

                if (evt != null) events.Add(evt);
                if (mtime > maxSeen) maxSeen = mtime;
            }

            if (maxSeen > _lastSeenUtc)
            {
                _lastSeenUtc = maxSeen;
                SaveState();
            }
            _forceAll = false;

            return events.OrderBy(e => e.PrintCompletedAt, StringComparer.Ordinal).ToList();
        }

        // ── 상태 저장: 마지막으로 처리한 파일의 mtime(UTC ticks) ────────────────

        private void LoadState()
        {
            if (_stateLoaded) return;
            _stateLoaded = true;

            try
            {
                if (File.Exists(_stateFile))
                {
                    var raw = File.ReadAllText(_stateFile).Trim();
                    if (long.TryParse(raw, out var ticks) && ticks > 0)
                    {
                        _lastSeenUtc = new DateTime(ticks, DateTimeKind.Utc);
                        return;
                    }
                }
            }
            catch (Exception ex) { Console.WriteLine($"[{EquipmentId}] state load failed: {ex.Message}"); }

            // 최초 실행: 과거 로그를 통째로 prod 에 밀어넣지 않는다 (PrintLogParser 의 EOF 스킵과 동일 방침).
            _lastSeenUtc = DateTime.UtcNow.AddDays(-Math.Max(0, _backfillDays));
            Console.WriteLine($"[{EquipmentId}] first run — backfill {_backfillDays}d, start from {_lastSeenUtc:u}");
            SaveState();
        }

        private void SaveState()
        {
            try
            {
                var dir = Path.GetDirectoryName(_stateFile);
                if (!string.IsNullOrEmpty(dir)) Directory.CreateDirectory(dir);
                File.WriteAllText(_stateFile, _lastSeenUtc.Ticks.ToString(CultureInfo.InvariantCulture));
            }
            catch (Exception ex) { Console.WriteLine($"[{EquipmentId}] state save failed: {ex.Message}"); }
        }

        // ── INI 파싱 ────────────────────────────────────────────────────────

        private sealed class Item
        {
            public string Name = "";
            public double WidthMM;
            public double HeightMM;
            public double VPositionMM;
            public int Copies = 1;
            public long KDotsSum;
        }

        private PrintEvent? ParseJobFile(string path)
        {
            var text = ReadText(path);
            if (string.IsNullOrWhiteSpace(text)) return null;

            var general = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            var costs = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            var printSettings = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            var items = new List<Item>();

            string section = "";
            Item? cur = null;

            foreach (var rawLine in text.Split('\n'))
            {
                var line = rawLine.Trim('\r', ' ', '\t');
                if (line.Length == 0) continue;

                if (line[0] == '[' && line[line.Length - 1] == ']')
                {
                    section = line.Substring(1, line.Length - 2).Trim();
                    if (int.TryParse(section, NumberStyles.Integer, CultureInfo.InvariantCulture, out _))
                    {
                        cur = new Item();
                        items.Add(cur);
                    }
                    else cur = null;
                    continue;
                }

                var eq = line.IndexOf('=');
                if (eq <= 0) continue;
                var key = line.Substring(0, eq).Trim();
                var val = line.Substring(eq + 1).Trim();

                if (cur != null)
                {
                    switch (key)
                    {
                        case "Name": cur.Name = val; break;
                        case "WidthMM": cur.WidthMM = ParseDouble(val); break;
                        case "HeightMM": cur.HeightMM = ParseDouble(val); break;
                        case "VPositionMM": cur.VPositionMM = ParseDouble(val); break;
                        case "Copies": cur.Copies = Math.Max(1, (int)ParseDouble(val)); break;
                        default:
                            if (key.StartsWith("KDots", StringComparison.Ordinal) && KDotsRegex.IsMatch(line))
                                cur.KDotsSum += ParseLong(val);
                            break;
                    }
                    continue;
                }

                if (section.Equals("General", StringComparison.OrdinalIgnoreCase)) general[key] = val;
                else if (section.Equals("Costs", StringComparison.OrdinalIgnoreCase)) costs[key] = val;
                else if (section.Equals("PrintSettings", StringComparison.OrdinalIgnoreCase)) printSettings[key] = val;
            }

            if (items.Count == 0) return null;

            var document = general.GetValueOrDefault("Document", "").Trim();
            if (string.IsNullOrEmpty(document)) document = Path.GetFileNameWithoutExtension(path);

            var start = ParseTimestamp(general.GetValueOrDefault("StartTime", ""));
            var end = ParseTimestamp(general.GetValueOrDefault("EndTime", ""));
            if (end == null) return null;   // 완료시각 없으면 멱등키가 안 서므로 버린다

            var printW = ParseDouble(costs.GetValueOrDefault("PrintWidthMM", "0"));
            var printH = ParseDouble(costs.GetValueOrDefault("PrintHeightMM", "0"));

            // ── RIP 완료 판정: 실제 리핑 길이 vs 배치 의도 총높이 ──
            //    neoStampa 에는 상태 필드가 없다. 중간에 끊긴 잡은 PrintHeightMM 이 배치보다 짧게 남는다.
            double extent = 0;
            foreach (var it in items)
            {
                var e = it.VPositionMM + it.HeightMM;
                if (e > extent) extent = e;
            }
            var ripComplete = extent <= 0 || printH >= extent * 0.995;

            // ── 멤버 집계: 정본은 [N] 섹션의 Name (Document 의 " + " 를 파싱하지 않는다 —
            //    도안명 자체에 " + " 가 들어갈 수 있다) ──
            //    KDots 합이 0 인 아이템은 리핑되지 않았다 → 판에 안 들어갔으므로 제외한다.
            //    (제외하지 않으면 출력되지도 않은 주문에 실적이 찍힌다)
            var byName = new Dictionary<string, NestMember>(StringComparer.OrdinalIgnoreCase);
            var order = new List<string>();
            int skipped = 0;
            foreach (var it in items)
            {
                if (string.IsNullOrEmpty(it.Name)) continue;
                if (it.KDotsSum <= 0) { skipped++; continue; }

                if (!byName.TryGetValue(it.Name, out var m))
                {
                    m = new NestMember { file = it.Name, w = it.WidthMM, h = it.HeightMM, qty = 0 };
                    byName[it.Name] = m;
                    order.Add(it.Name);
                }
                m.qty += it.Copies;
            }

            if (byName.Count == 0)
            {
                Console.WriteLine($"[{EquipmentId}] 전량 미리핑 — 이벤트 생략: {document}");
                return null;
            }

            var evt = new PrintEvent
            {
                EquipmentId = EquipmentId,
                EventKind = "RIP",
                PrinterName = general.GetValueOrDefault("Driver", ""),
                // 로그 파일 경로 = 잡별 고유(같은 도안 재RIP 은 " - N" 으로 갈린다) → 서버 멱등키로 안전
                FilePath = path,
                FileName = document,
                PrintStatus = ripComplete ? "OK" : "CANCEL",
                OutputSize = printW > 0 && printH > 0
                    ? $"{printW.ToString("0.#", CultureInfo.InvariantCulture)} X {printH.ToString("0.#", CultureInfo.InvariantCulture)}"
                    : "",
                Dpi = ExtractDpi(printSettings.GetValueOrDefault("PrintMode", "")),
            };

            if (start != null)
            {
                evt.StartDate = start.Value.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
                evt.StartTime = start.Value.ToString("HH:mm:ss", CultureInfo.InvariantCulture);
            }
            evt.EndDate = end.Value.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
            evt.EndTime = end.Value.ToString("HH:mm:ss", CultureInfo.InvariantCulture);

            var members = order.Select(n => byName[n]).ToList();
            if (members.Count >= 2)
            {
                // 서로 다른 도안 ≥2 = 합판. 같은 이름 반복/Copies 는 스텝앤리피트이므로 네스트가 아니다.
                evt.IsNest = true;
                evt.NestDeclaredCount = members.Count;
                evt.NestMembers = members;
                evt.CopyColumns = 1;
                evt.CopyRows = 1;
            }
            else
            {
                evt.CopyColumns = 1;
                evt.CopyRows = Math.Max(1, members[0].qty);   // 스텝앤리피트 매수
                // 합판이 중간에 끊겨 한 도안만 리핑된 경우, Document 는 "A + B + C" 결합 문자열이라
                // 어디에도 매칭되지 않는다. 실제로 리핑된 도안명을 file_name 으로 보낸다.
                evt.FileName = members[0].file;
            }

            if (!ripComplete || skipped > 0)
            {
                var pct = extent > 0 ? (printH / extent * 100) : 100;
                Console.WriteLine($"[{EquipmentId}] RIP 중단 감지: {document} — {pct:0.#}% ({printH:0.#}/{extent:0.#}mm), 미리핑 아이템 {skipped}개 제외");
            }

            return evt;
        }

        private static string ReadText(string path)
        {
            // 잡 로그는 UTF-8. BOM 없는 cp949 대비로 폴백을 둔다.
            using var fs = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete);
            using var ms = new MemoryStream();
            fs.CopyTo(ms);
            var bytes = ms.ToArray();
            if (bytes.Length == 0) return "";

            if (bytes.Length >= 3 && bytes[0] == 0xEF && bytes[1] == 0xBB && bytes[2] == 0xBF)
                return Encoding.UTF8.GetString(bytes, 3, bytes.Length - 3);

            try { return new UTF8Encoding(false, true).GetString(bytes); }
            catch (DecoderFallbackException)
            {
                try { return Encoding.GetEncoding(949).GetString(bytes); }
                catch { return Encoding.UTF8.GetString(bytes); }
            }
        }

        /// <summary>neoStampa 시각: "04/08/2026 9:17:14" (dd/MM/yyyy H:mm:ss, 현장 로컬시각=KST)</summary>
        private static DateTime? ParseTimestamp(string raw)
        {
            raw = (raw ?? "").Trim();
            if (raw.Length == 0) return null;

            string[] formats = { "dd/MM/yyyy H:mm:ss", "dd/MM/yyyy HH:mm:ss", "d/M/yyyy H:mm:ss" };
            if (DateTime.TryParseExact(raw, formats, CultureInfo.InvariantCulture, DateTimeStyles.None, out var dt))
                return dt;
            if (DateTime.TryParse(raw, CultureInfo.InvariantCulture, DateTimeStyles.None, out dt))
                return dt;
            return null;
        }

        /// <summary>"720x2400 8pass" → "720x2400 DPI"</summary>
        private static string ExtractDpi(string printMode)
        {
            var m = Regex.Match(printMode ?? "", @"(\d+x\d+)");
            return m.Success ? $"{m.Groups[1].Value} DPI" : "";
        }

        private static double ParseDouble(string s)
            => double.TryParse((s ?? "").Trim(), NumberStyles.Float, CultureInfo.InvariantCulture, out var d) ? d : 0;

        private static long ParseLong(string s)
            => long.TryParse((s ?? "").Trim(), NumberStyles.Integer, CultureInfo.InvariantCulture, out var l) ? l : 0;
    }
}
