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
    /// flexi_printexp 조인 자체검증 — `LogWatcher.exe --selftest-flexi`
    ///
    /// 왜 따로 있나: #616 의 폴백 이중계상 수정은 `TnsPrintExpParser` 에만 들어갔고
    /// `FlexiPrintExpParser` 는 빠져 있었다. 정작 노출이 가장 큰 쪽이 후자였다 —
    /// KM 전사3 은 키트 `9ec2c454` 로 갱신한 **뒤에도** 하루치 13건 중 폴백 8·유령 5 로
    /// 쌍이 그대로 남았다(2026-09-02 실측: 10:12/10:14 · 15:03/15:10 · 15:51/15:52 · 18:26/18:28).
    /// `--selftest-pexp` 는 Tns 축만 보므로 이 회귀를 **통과시킨다** — 그래서 축마다 시험이 따로 있어야 한다.
    ///
    /// Tns 축과 조인 키가 다르다: 저쪽은 시간창, 여기는 **스탬프 또는 .prt 이름**.
    /// 억제 판정도 조인이 쓰던 그 두 축을 그대로 써야 어긋나지 않는다.
    ///
    /// 검사 4건
    ///   A 폴백 뒤 지각 완료(스탬프 조인) → 총 1건 (종전 2건: 폴백 + UNMATCHED)  ← 실기에서 터진 경로
    ///   B 폴백 없는 진짜 고아 완료       → 1건 UNMATCHED (과잉 억제 방지)
    ///   C 폴백 뒤 지각 **취소**          → 취소는 억제하지 않는다(취소 사실이 사라지면 안 된다)
    ///   D 재시작 후에도 억제 유지        → 억제 키가 pexpend.json 에 남는지
    /// </summary>
    public static class FlexiSelfTest
    {
        private static int _fail;

        public static void Run(string[] args)
        {
            try { Encoding.RegisterProvider(CodePagesEncodingProvider.Instance); } catch { /* 이미 등록됨 */ }

            var root = Path.Combine(Path.GetTempPath(), "flexi-selftest-" + Guid.NewGuid().ToString("N").Substring(0, 8));
            try
            {
                CaseA(Path.Combine(root, "A"));
                CaseB(Path.Combine(root, "B"));
                CaseC(Path.Combine(root, "C"));
                CaseD(Path.Combine(root, "D"));
            }
            finally
            {
                try { if (Directory.Exists(root)) Directory.Delete(root, true); } catch { /* best effort */ }
            }

            Console.WriteLine();
            Console.WriteLine(_fail == 0 ? "[selftest-flexi] OK — 4건 통과" : $"[selftest-flexi] FAIL — {_fail}건 실패");
            Environment.Exit(_fail == 0 ? 0 : 1);
        }

        // ── A: 폴백 뒤 지각 결과가 또 세지 않는다 (스탬프 조인 = 실기 경로) ────
        private static void CaseA(string dir)
        {
            var h = new Habitat(dir);
            h.SeedRip("A-도안", At(9, 0, 0), DateTime.Now.AddHours(-7));   // 7시간째 결과 없음 → 폴백
            h.WriteLog(Line(9, 59, 0, "대기"));

            var e1 = h.NewParser().ReadNewEntries();
            Check("A-1 폴백 1건 송출", e1.Count == 1 && e1[0].FileName == "A-도안", Describe(e1));

            // 두 번째 폴 — 인쇄가 이제야 끝나 결과가 도착한다(같은 물리 인쇄)
            h.AppendLog(Line(10, 0, 0, "启动任务：" + Stamp(9, 0, 0)));
            h.AppendLog(Line(10, 30, 0, "_PrintWait---打印完成"));

            var e2 = h.NewParser().ReadNewEntries();
            Check("A-2 지각 결과 억제(0건)", e2.Count == 0, Describe(e2));
        }

        // ── B: 폴백이 없으면 고아 완료는 종전대로 나간다 ───────────────────────
        private static void CaseB(string dir)
        {
            var h = new Habitat(dir);
            h.Prime();
            h.AppendLog(Line(10, 0, 0, "启动任务：" + Stamp(10, 0, 0)));
            h.AppendLog(Line(10, 30, 0, "_PrintWait---打印完成"));

            var e = h.NewParser().ReadNewEntries();
            Check("B 고아 완료 미상 송출", e.Count == 1 && e[0].FileName.StartsWith("UNMATCHED-"), Describe(e));
        }

        // ── C: 폴백 뒤 취소는 억제하지 않는다 ──────────────────────────────────
        private static void CaseC(string dir)
        {
            var h = new Habitat(dir);
            h.SeedRip("C-도안", At(9, 0, 0), DateTime.Now.AddHours(-7));
            h.WriteLog(Line(9, 59, 0, "대기"));
            h.NewParser().ReadNewEntries();                                  // 폴백 송출

            h.AppendLog(Line(10, 0, 0, "启动任务：" + Stamp(9, 0, 0)));
            h.AppendLog(Line(10, 30, 0, "打印控制线程---被取消"));

            var e = h.NewParser().ReadNewEntries();
            Check("C 폴백 뒤 취소는 살린다", e.Count == 1 && e[0].PrintStatus == "CANCEL", Describe(e));
        }

        // ── D: 재시작해도 억제가 유지된다 ──────────────────────────────────────
        private static void CaseD(string dir)
        {
            var h = new Habitat(dir);
            h.SeedRip("D-도안", At(9, 0, 0), DateTime.Now.AddHours(-7));
            h.WriteLog(Line(9, 59, 0, "대기"));
            h.NewParser().ReadNewEntries();                                  // 폴백 송출 → 억제 키 저장

            var saved = File.ReadAllText(Path.Combine(dir, "pos", "TEST.pexpend.json"));
            Check("D-1 억제 키가 파일에 남는다", saved.Contains("FallbackKeys") && saved.Contains("09:00:00"), saved.Length + "B");

            h.AppendLog(Line(10, 0, 0, "启动任务：" + Stamp(9, 0, 0)));
            h.AppendLog(Line(10, 30, 0, "_PrintWait---打印完成"));

            var e = h.NewParser().ReadNewEntries();                          // 새 파서 = 재시작
            Check("D-2 재시작 후에도 억제", e.Count == 0, Describe(e));
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
                // 신원 축(RIPLOG.HTML) — 비어 있어도 IsAccessible 이 통과하고 블록 0건이면 된다
                File.WriteAllBytes(Path.Combine(dir, "RIPLOG.HTML"), Array.Empty<byte>());
                _logFile = Path.Combine(_printDir, $"Log[{DateTime.Today:yyyy_MM_dd}].txt");
            }

            public void WriteLog(string line) => Write(line, false);
            public void AppendLog(string line) => Write(line, true);

            /// <summary>첫 폴은 로그 끝으로 건너뛴다 — 실기와 같은 동작이라 시험도 거쳐야 한다.</summary>
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

            /// <summary>미결 큐에 립을 심는다 — 파서의 private 타입이라 JSON 으로 직접 쓴다(구 형식=맨 배열).</summary>
            public void SeedRip(string fileName, DateTime start, DateTime seenAt)
            {
                var json = "[{\"Start\":\"" + Iso(start) + "\",\"SeenAt\":\"" + Iso(seenAt) + "\",\"Claimed\":false," +
                           "\"Evt\":{\"PrinterName\":\"TEST\",\"FilePath\":\"C:\\\\" + fileName + ".eps\",\"FileName\":\"" + fileName + "\"," +
                           "\"PrintStatus\":\"OK\",\"StartDate\":\"" + start.ToString("yyyy-MM-dd") + "\",\"StartTime\":\"" + start.ToString("HH:mm:ss") + "\"," +
                           "\"EndDate\":\"\",\"EndTime\":\"\",\"OutputSize\":\"\",\"Dpi\":\"\"}}]";
                File.WriteAllText(Path.Combine(_posDir, "TEST.pexpend.json"), json);
            }

            public FlexiPrintExpParser NewParser()
            {
                var cfg = new WatcherConfig
                {
                    EquipmentId = "TEST",
                    Name = "selftest",
                    ParserType = "flexi_printexp",
                    Config = JsonDocument.Parse(JsonSerializer.Serialize(new Dictionary<string, object>
                    {
                        ["log_path"] = Path.Combine(_dir, "RIPLOG.HTML"),
                        ["print_log_dir"] = _printDir,
                        ["rip_fallback_hours"] = 6,
                        ["join_tolerance_seconds"] = 30,
                    })).RootElement.Clone(),
                };
                return new FlexiPrintExpParser(cfg, _posDir);
            }

            private static string Iso(DateTime t) => t.ToString("yyyy-MM-ddTHH:mm:ss", CultureInfo.InvariantCulture);
        }

        private static DateTime At(int h, int m, int s) => DateTime.Today.AddHours(h).AddMinutes(m).AddSeconds(s);

        /// <summary>RIPLOG 시작 시각을 그대로 옮긴 14자리 스탬프 — 실기 PrintExp 가 잡 이름 자리에 찍는 값.</summary>
        private static string Stamp(int h, int m, int s) => At(h, m, s).ToString("yyyyMMddHHmmss");

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
