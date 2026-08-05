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
        // 파싱 본문은 NeoStampaJobFile 로 공용화했다 — 전사 2축 조인 파서(TransferPressParser)와
        // 같은 규칙을 써야 멤버 판정·미리핑 제외가 갈리지 않는다.

        private PrintEvent? ParseJobFile(string path)
        {
            var job = NeoStampaJobFile.Parse(path);
            if (job == null)
            {
                Console.WriteLine($"[{EquipmentId}] 전량 미리핑/해석불가 — 이벤트 생략: {Path.GetFileName(path)}");
                return null;
            }
            if (job.End == null) return null;   // 완료시각 없으면 멱등키가 안 서므로 버린다

            var evt = new PrintEvent
            {
                EquipmentId = EquipmentId,
                EventKind = "RIP",
                PrinterName = "",
                // 로그 파일 경로 = 잡별 고유(같은 도안 재RIP 은 " - N" 으로 갈린다) → 서버 멱등키로 안전
                FilePath = SafeFullPath(path),
                FileName = job.PrimaryName,
                PrintStatus = job.RipComplete ? "OK" : "CANCEL",
                OutputSize = job.PrintWidthMM > 0 && job.PrintHeightMM > 0
                    ? $"{job.PrintWidthMM.ToString("0.#", CultureInfo.InvariantCulture)} X {job.PrintHeightMM.ToString("0.#", CultureInfo.InvariantCulture)}"
                    : "",
                Dpi = NeoStampaJobFile.ExtractDpi(job.PrintMode),
            };
            if (job.Start != null)
            {
                evt.StartDate = job.Start.Value.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
                evt.StartTime = job.Start.Value.ToString("HH:mm:ss", CultureInfo.InvariantCulture);
            }
            evt.EndDate = job.End.Value.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
            evt.EndTime = job.End.Value.ToString("HH:mm:ss", CultureInfo.InvariantCulture);

            if (job.IsNest)
            {
                evt.IsNest = true;
                evt.NestDeclaredCount = job.Members.Count;
                evt.NestMembers = job.Members;
                evt.CopyColumns = 1; evt.CopyRows = 1;
            }
            else
            {
                evt.CopyColumns = 1;
                evt.CopyRows = Math.Max(1, job.TotalCopies);
            }

            if (!job.RipComplete || job.SkippedItems > 0)
                Console.WriteLine($"[{EquipmentId}] RIP 중단 감지: {job.Document} — {job.PrintHeightMM:0.#}mm, 미리핑 아이템 {job.SkippedItems}개 제외");

            return evt;
        }

        private static string SafeFullPath(string p)
        {
            try { return Path.GetFullPath(p); } catch { return p; }
        }
    }
}
