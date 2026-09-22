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
    /// neostampa_printexp(전사 8색 2축) 규격 축 자체검증 — `LogWatcher.exe --selftest-transfer`
    ///
    /// 왜 만들었나 (2026-09-22 prod 실측):
    ///   TRANS-8C-02 는 **전 기간 114건 전부 규격이 비어 있었다.** 같은 기종 1호기는 356건 중 0건.
    ///   이름·매수·취소는 정상이라 화면이 멀쩡해 보였고, 200 이라 어떤 게이트도 안 걸렸다.
    ///   원인은 스펙 줄 정규식이 형제 파서(FlexiPrintExpParser)보다 엄격해 PrintExp 버전이 다르면
    ///   매치가 통째로 실패한 것 — 실패하면 **규격만 조용히 빠지고 이벤트는 나간다.**
    ///
    /// ★ 검사하는 것은 「정규식이 이렇게 생겼나」가 **아니라** 「그 성질이 지켜지나」다.
    ///   철자를 못박으면 다음 개선이 게이트에 막힌다(§게이트가 구현을 못박으면 개선을 막는다).
    ///
    /// 검사 4건
    ///   A 스펙 줄 뒷부분(颜色数量·打印模式)이 없어도 규격을 읽는다   ← 이번에 터진 경로
    ///   B 완전형 스펙 줄은 그대로 읽고 打印模式 도 보존한다          ← A 를 고치며 죽이기 쉽다
    ///   C 스펙 줄을 아예 못 읽으면 립 잡의 배치 규격으로 폴백한다
    ///   D 양쪽 다 없으면 비운다 — 없는 값을 지어내지 않는다
    /// </summary>
    public static class TransferSelfTest
    {
        private static int _fail;

        public static void Run(string[] args)
        {
            // 파서 static ctor 가 등록하지만 그건 파서를 처음 만들 때다 — 로그를 먼저 쓰는 이쪽이 앞선다
            try { Encoding.RegisterProvider(CodePagesEncodingProvider.Instance); } catch { /* 이미 등록됨 */ }

            var root = Path.Combine(Path.GetTempPath(), "transfer-selftest-" + Guid.NewGuid().ToString("N").Substring(0, 8));
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
            Console.WriteLine(_fail == 0 ? "[selftest-transfer] OK — 4건 통과" : $"[selftest-transfer] FAIL — {_fail}건 실패");
            Environment.Exit(_fail == 0 ? 0 : 1);
        }

        // 스펙 줄 앞부분만 — PrintExp 버전에 따라 뒤가 없거나 다르다(TRANS-8C-02 실물)
        private const string SpecShort = "任务精度:720 X 2400,图像大小:1500.5mm X 4514.9mm";
        private const string SpecFull = SpecShort + ",颜色数量:8,打印模式:8PASS High";

        // ── A: 뒷부분이 없어도 규격을 읽는다 ───────────────────────────────────
        private static void CaseA(string dir)
        {
            var h = new Habitat(dir);
            var stamp = h.SeedRipJob("JOB-A.eps", 1294, 3000);
            h.Prime();
            h.Block(stamp, SpecShort, cancel: false);

            var e = h.NewParser().ReadNewEntries();
            Check("A 뒷부분 없는 스펙 줄에서 규격 판독",
                  e.Count == 1 && e[0].OutputSize == "1500.5 X 4514.9", Describe(e));
        }

        // ── B: 완전형도 그대로 (과잉 완화 방지) ────────────────────────────────
        private static void CaseB(string dir)
        {
            var h = new Habitat(dir);
            var stamp = h.SeedRipJob("JOB-B.eps", 1294, 3000);
            h.Prime();
            h.Block(stamp, SpecFull, cancel: false);

            var e = h.NewParser().ReadNewEntries();
            Check("B 완전형 스펙 줄 그대로 판독",
                  e.Count == 1 && e[0].OutputSize == "1500.5 X 4514.9" && e[0].Dpi == "720x2400 DPI", Describe(e));
        }

        // ── C: 스펙 줄이 없으면 립 규격으로 폴백 ───────────────────────────────
        private static void CaseC(string dir)
        {
            var h = new Habitat(dir);
            var stamp = h.SeedRipJob("JOB-C.eps", 1294, 3000);
            h.Prime();
            h.Block(stamp, spec: null, cancel: false);

            var e = h.NewParser().ReadNewEntries();
            Check("C 스펙 줄 미판독 → 립 규격 폴백",
                  e.Count == 1 && e[0].OutputSize == "1294 X 3000", Describe(e));
        }

        // ── D: 근거가 없으면 비운다 ────────────────────────────────────────────
        private static void CaseD(string dir)
        {
            var h = new Habitat(dir);
            h.Prime();
            // 립 잡을 심지 않는다 → 조인 실패 + 스펙 줄 없음
            h.Block(DateTime.Now.ToString("yyyyMMddHHmmss", CultureInfo.InvariantCulture), spec: null, cancel: false);

            var e = h.NewParser().ReadNewEntries();
            Check("D 근거 없으면 규격 공백(추정 금지)",
                  e.Count == 1 && string.IsNullOrEmpty(e[0].OutputSize), Describe(e));
        }

        // ── 합성 서식지 ────────────────────────────────────────────────────────
        private sealed class Habitat
        {
            private readonly string _dir;
            private readonly string _printDir;
            private readonly string _ripDir;
            private readonly string _posDir;
            private readonly string _logFile;

            public Habitat(string dir)
            {
                _dir = dir;
                _printDir = Path.Combine(dir, "printexp");
                _ripDir = Path.Combine(dir, "rip");
                _posDir = Path.Combine(dir, "pos");
                Directory.CreateDirectory(_printDir);
                Directory.CreateDirectory(_ripDir);
                Directory.CreateDirectory(_posDir);
                _logFile = Path.Combine(_printDir, $"Log[{DateTime.Today:yyyy_MM_dd}].txt");
            }

            /// <summary>
            /// 첫 폴은 로그 끝으로 건너뛴다(과거분 재적재 방지) — 실기와 같은 동작이라 시험도 이걸 거친다.
            /// 프라이밍 없이 미리 써 둔 줄은 파서가 한 줄도 보지 않는다.
            /// </summary>
            public void Prime()
            {
                Write(Line(0, 0, 1, "선행"), false);
                NewParser().ReadNewEntries();
            }

            /// <summary>잡 블록 1개 — 启动任务 → (스펙) → 완료/취소 → temp 정리(=블록의 끝, 조인 시점).</summary>
            public void Block(string stamp, string? spec, bool cancel)
            {
                Write(Line(10, 0, 0, "启动任务：~section0.prn"), true);
                if (spec != null) Write(Line(10, 0, 1, spec), true);
                Write(Line(10, 30, 0, cancel ? "打印控制线程---被取消" : "_PrintWait---打印完成"), true);
                Write(Line(10, 30, 1, $"作业ID:1587814906, 删除TCP文件:C:\\PrintExp_X64\\temp\\{stamp}\\~section0.prn"), true);
            }

            /// <summary>neoStampa 잡 파일(INI)을 심고 조인 키(StartTime 스탬프)를 돌려준다.</summary>
            public string SeedRipJob(string name, double printWidthMM, double printHeightMM)
            {
                var start = DateTime.Today.AddHours(10);   // 블록 시작과 같은 초
                var sb = new StringBuilder();
                sb.Append("[General]\r\n");                 // ★ 앞 64바이트 안에 있어야 잡 파일로 선별된다
                sb.Append($"Document={name}\r\n");
                // ⚠ 포맷의 `/` 는 **현재 로케일의 날짜 구분자로 치환된다** — ko-KR 에서는 `-` 가 되어
                //   neoStampa 형식(dd/MM/yyyy)과 어긋나고, 그러면 잡이 인덱스에 안 들어가
                //   **조인이 통째로 실패하는데 시험은 그걸 폴백 성공으로 오독한다.** Invariant 를 명시한다.
                sb.Append($"StartTime={start.ToString("dd/MM/yyyy HH:mm:ss", CultureInfo.InvariantCulture)}\r\n");
                sb.Append($"EndTime={start.AddMinutes(13).ToString("dd/MM/yyyy HH:mm:ss", CultureInfo.InvariantCulture)}\r\n");
                sb.Append("[Costs]\r\n");
                sb.Append($"PrintWidthMM={printWidthMM.ToString(CultureInfo.InvariantCulture)}\r\n");
                sb.Append($"PrintHeightMM={printHeightMM.ToString(CultureInfo.InvariantCulture)}\r\n");
                sb.Append("[PrintSettings]\r\n");
                sb.Append("PrintMode=720x2400 8pass\r\n");
                sb.Append("[0]\r\n");
                sb.Append($"Name={name}\r\n");
                sb.Append("WidthMM=600\r\n");
                sb.Append("HeightMM=1800\r\n");
                sb.Append("VPositionMM=0\r\n");
                sb.Append("Copies=1\r\n");
                sb.Append("KDots[C][0]=12345\r\n");
                File.WriteAllText(Path.Combine(_ripDir, name + ".txt"), sb.ToString(), new UTF8Encoding(false));
                return start.ToString("yyyyMMddHHmmss", CultureInfo.InvariantCulture);
            }

            private void Write(string line, bool append)
            {
                // 실기와 같은 GBK(936) — UTF-8 로 쓰면 中文 정규식이 안 맞아 시험이 통째로 무의미해진다
                var bytes = Encoding.GetEncoding(936).GetBytes(line + "\r\n");
                using var fs = new FileStream(_logFile, append ? FileMode.Append : FileMode.Create, FileAccess.Write);
                fs.Write(bytes, 0, bytes.Length);
            }

            public TransferPressParser NewParser()
            {
                var cfg = new WatcherConfig
                {
                    EquipmentId = "TEST",
                    Name = "selftest",
                    ParserType = "neostampa_printexp",
                    Config = JsonDocument.Parse(JsonSerializer.Serialize(new Dictionary<string, object>
                    {
                        ["rip_log_root"] = _ripDir,
                        ["print_log_dir"] = _printDir,
                        ["join_tolerance_seconds"] = 5,
                        ["emit_rip_only_after_hours"] = 0,
                    })).RootElement.Clone(),
                };
                return new TransferPressParser(cfg, _posDir);
            }
        }

        private static string Line(int h, int m, int s, string body) =>
            $"[SM][1][{DateTime.Today:yyyy/MM/dd} {h:00}:{m:00}:{s:00}][000000] {body}";

        private static string Describe(List<PrintEvent> e) =>
            e.Count == 0 ? "(0건)" : string.Join(", ", e.Select(x => $"{x.FileName}/{x.PrintStatus}/size=[{x.OutputSize}]/dpi=[{x.Dpi}]"));

        private static void Check(string name, bool ok, string detail)
        {
            if (!ok) _fail++;
            Console.WriteLine($"  {(ok ? "PASS" : "FAIL")}  {name}   → {detail}");
        }
    }
}
