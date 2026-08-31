using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.Json;
using LogWatcher.Config;
using LogWatcher.Parsers;

namespace LogWatcher.Tools
{
    /// <summary>
    /// tns_printexp 조인 자체검증 — `LogWatcher.exe --selftest-pexp`
    ///
    /// 이 파서의 이중계상은 **두 번의 폴에 걸쳐서만** 재현된다(한 폴 안에서는 조인이 폴백보다 먼저
    /// 돌아 정상 결합한다). 그래서 서식지를 합성해 폴을 나눠 돌린다 — 실기 로그 없이 재현되는
    /// 유일한 방법이고, 프린터 PC 를 다시 찾지 않고도 회귀를 잡는다.
    ///
    /// 검사 3건
    ///   A 폴백 송출 뒤 지각 도착한 완료 → 총 1건 (종전 2건: 폴백 + UNMATCHED)
    ///   B 폴백이 없는 진짜 고아 완료   → 1건 UNMATCHED (과잉 억제 방지 — A 를 고치며 이걸 죽이기 쉽다)
    ///   C 정상 조인                     → 1건, 신원(파일명) 보존
    /// </summary>
    public static class PexpSelfTest
    {
        private static int _fail;

        public static void Run(string[] args)
        {
            // 파서의 static ctor 가 등록하지만 그건 파서를 처음 만들 때다 — 로그를 먼저 쓰는 이쪽이 앞선다
            try { Encoding.RegisterProvider(CodePagesEncodingProvider.Instance); } catch { /* 이미 등록됨 */ }

            var root = Path.Combine(Path.GetTempPath(), "pexp-selftest-" + Guid.NewGuid().ToString("N").Substring(0, 8));
            try
            {
                CaseA(Path.Combine(root, "A"));
                CaseB(Path.Combine(root, "B"));
                CaseC(Path.Combine(root, "C"));
            }
            finally
            {
                try { if (Directory.Exists(root)) Directory.Delete(root, true); } catch { /* best effort */ }
            }

            Console.WriteLine();
            Console.WriteLine(_fail == 0 ? "[selftest-pexp] OK — 3건 통과" : $"[selftest-pexp] FAIL — {_fail}건 실패");
            Environment.Exit(_fail == 0 ? 0 : 1);
        }

        // ── A: 폴백 뒤 지각 결과가 또 세지 않는다 ──────────────────────────────
        private static void CaseA(string dir)
        {
            var h = new Habitat(dir);
            // 립은 09:00 에 떴고 7시간째 결과가 없다 → 첫 폴에서 폴백 송출
            h.SeedRip("A.prn", At(9, 0, 0), DateTime.Now.AddHours(-7));
            h.WriteLog(Line(9, 59, 0, "대기"));

            var p1 = h.NewParser();
            var e1 = p1.ReadNewEntries();
            Check("A-1 폴백 1건 송출", e1.Count == 1 && e1[0].FileName == "A.prn", Describe(e1));

            // 두 번째 폴 — 인쇄가 이제야 끝나 결과가 도착한다(같은 물리 인쇄)
            h.AppendLog(Line(10, 0, 0, "启动任务：~section0.prn"));
            h.AppendLog(Line(10, 30, 0, "_PrintWait---打印完成"));
            h.AppendLog(Line(10, 40, 0, "대기"));   // 결과 숙성용 로그시계 전진

            var p2 = h.NewParser();                  // 재시작까지 흉내낸다(상태 영속화 확인)
            var e2 = p2.ReadNewEntries();
            Check("A-2 지각 결과 억제(0건)", e2.Count == 0, Describe(e2));
        }

        // ── B: 폴백이 없으면 고아 완료는 종전대로 나간다 ───────────────────────
        private static void CaseB(string dir)
        {
            var h = new Habitat(dir);
            h.Prime();
            h.AppendLog(Line(10, 0, 0, "启动任务：~section0.prn"));
            h.AppendLog(Line(10, 30, 0, "_PrintWait---打印完成"));
            h.AppendLog(Line(10, 40, 0, "대기"));

            var e = h.NewParser().ReadNewEntries();
            Check("B 고아 완료 미상 송출", e.Count == 1 && e[0].FileName.StartsWith("UNMATCHED-"), Describe(e));
        }

        // ── C: 정상 조인은 그대로 ──────────────────────────────────────────────
        private static void CaseC(string dir)
        {
            var h = new Habitat(dir);
            h.SeedRip("B.prn", At(10, 0, 0), DateTime.Now);
            h.Prime();
            h.AppendLog(Line(10, 0, 10, "启动任务：~section0.prn"));
            h.AppendLog(Line(10, 30, 0, "_PrintWait---打印完成"));
            h.AppendLog(Line(10, 40, 0, "대기"));

            var e = h.NewParser().ReadNewEntries();
            Check("C 정상 조인 신원 보존", e.Count == 1 && e[0].FileName == "B.prn", Describe(e));
        }

        // ── 합성 서식지 ────────────────────────────────────────────────────────
        private sealed class Habitat
        {
            private readonly string _dir;
            private readonly string _printDir;
            private readonly string _posDir;
            private readonly string _logFile;

            public Habitat(string dir)
            {
                _dir = dir;
                _printDir = Path.Combine(dir, "printexp");
                _posDir = Path.Combine(dir, "pos");
                Directory.CreateDirectory(_printDir);
                Directory.CreateDirectory(_posDir);
                // 신원 축(TNS Print.log) — 비어 있어도 IsAccessible 이 통과하고 레코드 0건이면 된다
                File.WriteAllBytes(Path.Combine(dir, "Print.log"), Array.Empty<byte>());
                _logFile = Path.Combine(_printDir, $"Log[{DateTime.Today:yyyy_MM_dd}].txt");
            }

            public void WriteLog(string line) => Write(line, false);
            public void AppendLog(string line) => Write(line, true);

            /// <summary>
            /// 첫 폴은 로그 끝으로 건너뛴다(과거분 재적재 방지) — 실기와 같은 동작이라 시험도 이걸 거쳐야
            /// 한다. 프라이밍 없이 미리 써 둔 줄은 파서가 **한 줄도 보지 않는다**.
            /// </summary>
            public void Prime()
            {
                Write(Line(0, 0, 1, "선행"), false);
                NewParser().ReadNewEntries();
            }

            private void Write(string line, bool append)
            {
                // 실기와 같은 GBK(936) — UTF-8 로 쓰면 中文 정규식이 안 맞아 시험이 통째로 무의미해진다
                var bytes = Encoding.GetEncoding(936).GetBytes(line + "\r\n");
                using var fs = new FileStream(_logFile, append ? FileMode.Append : FileMode.Create, FileAccess.Write);
                fs.Write(bytes, 0, bytes.Length);
            }

            /// <summary>미결 큐에 립을 심는다 — 파서의 private 타입이라 JSON 으로 직접 쓴다.</summary>
            public void SeedRip(string fileName, DateTime start, DateTime seenAt)
            {
                var json = "{\"Rips\":[{\"Start\":\"" + Iso(start) + "\",\"SeenAt\":\"" + Iso(seenAt) + "\"," +
                           "\"Evt\":{\"PrinterName\":\"TEST\",\"FilePath\":\"C:\\\\" + fileName + "\",\"FileName\":\"" + fileName + "\"," +
                           "\"PrintStatus\":\"OK\",\"StartDate\":\"" + start.ToString("yyyy-MM-dd") + "\",\"StartTime\":\"" + start.ToString("HH:mm:ss") + "\"," +
                           "\"EndDate\":\"\",\"EndTime\":\"\",\"OutputSize\":\"\",\"Dpi\":\"\"}}],\"Results\":[],\"FallbackStarts\":[]}";
                File.WriteAllText(Path.Combine(_posDir, "TEST.pexpend.json"), json);
            }

            public TnsPrintExpParser NewParser()
            {
                var cfg = new WatcherConfig
                {
                    EquipmentId = "TEST",
                    Name = "selftest",
                    ParserType = "tns_printexp",
                    Config = JsonDocument.Parse(JsonSerializer.Serialize(new Dictionary<string, object>
                    {
                        ["log_path"] = Path.Combine(_dir, "Print.log"),
                        ["print_log_dir"] = _printDir,
                        ["rip_fallback_hours"] = 6,
                        ["result_wait_seconds"] = 180,
                        ["join_tolerance_seconds"] = 30,
                    })).RootElement.Clone(),
                };
                return new TnsPrintExpParser(cfg, _posDir);
            }

            private static string Iso(DateTime t) => t.ToString("yyyy-MM-ddTHH:mm:ss", CultureInfo.InvariantCulture);
        }

        private static DateTime At(int h, int m, int s) => DateTime.Today.AddHours(h).AddMinutes(m).AddSeconds(s);

        private static string Line(int h, int m, int s, string body) =>
            $"[SM][1][{DateTime.Today:yyyy/MM/dd} {h:00}:{m:00}:{s:00}][000000] {body}";

        private static string Describe(List<PrintEvent> e) =>
            e.Count == 0 ? "(0건)" : string.Join(", ", e.Select(x => $"{x.FileName}/{x.PrintStatus}"));

        private static void Check(string name, bool ok, string detail)
        {
            if (!ok) _fail++;
            Console.WriteLine($"  {(ok ? "PASS" : "FAIL")}  {name}   → {detail}");
        }
    }
}
