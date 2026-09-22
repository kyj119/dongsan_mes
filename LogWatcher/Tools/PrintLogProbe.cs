using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Text;

namespace LogWatcher.Tools
{
    /// <summary>
    /// TNS Print.log 읽기 전용 진단 — `LogWatcher.exe --probe-printlog [경로]`
    ///
    /// 왜 만들었나 (2026-09-22):
    ///   HSM-05 는 TNSRip 을 쓰는데 립 축 실적이 **전 기간 0건**이었다. 원인 후보가 셋인데
    ///   (①파일이 안 자란다 ②마커가 다른 판이다 ③구조가 달라 파싱이 0건이다) 셋을 가르는
    ///   재료가 아무 데도 없었다 — 파서는 0건일 때 **아무 말도 하지 않는다.**
    ///
    /// ★ `--test` 를 대신 쓰면 안 된다: 그건 `ResetPosition()` 을 해서 **서비스가 쓰는 위치 파일을
    ///   건드리고**, 돌아온 뒤 최근 며칠치를 재전송할 수 있다. 이 진단은 **아무것도 쓰지 않는다** —
    ///   파일을 공유 모드로 열어 읽기만 하므로 인쇄 중에 돌려도 안전하다.
    ///
    /// 읽는 법:
    ///   마커 0개              → 그 PC 의 TNSRip 은 다른 판이다(우리 파서가 애초에 못 읽는다)
    ///   마커는 있는데 레코드 0 → 레코드 구조가 다르다(마커 주변 필드 배치가 우리 전제와 다름)
    ///   레코드는 있는데 옛날   → 파일이 안 자란다 = 그 경로가 지금 쓰는 TNSRip 이 아니다
    /// </summary>
    public static class PrintLogProbe
    {
        private const string DefaultPath = @"C:\TNSRip-X1\Print.log";

        public static void Run(string[] args)
        {
            try { Encoding.RegisterProvider(CodePagesEncodingProvider.Instance); } catch { /* 이미 등록됨 */ }

            var path = args.Length > 1 && !string.IsNullOrWhiteSpace(args[1]) ? args[1] : DefaultPath;
            Console.WriteLine($"== Print.log 진단 ==  {path}");

            if (!File.Exists(path))
            {
                Console.WriteLine("  ✗ 파일이 없습니다 — 이 경로는 이 PC 의 TNSRip 이 아닙니다.");
                Console.WriteLine("    같은 드라이브·다른 드라이브에서 TNSRip 폴더를 찾아 다시 지정하세요.");
                Console.WriteLine("    (실측 변종: TNSRip-X1 · TNSRip-X11 · TNSRip-X · D:/E:/F: 설치)");
                Environment.Exit(2);
                return;
            }

            var fi = new FileInfo(path);
            var age = DateTime.Now - fi.LastWriteTime;
            Console.WriteLine($"  크기      : {fi.Length:N0} bytes");
            Console.WriteLine($"  마지막 기록: {fi.LastWriteTime:yyyy-MM-dd HH:mm:ss}  ({age.TotalDays:0.0}일 전)");
            if (age.TotalDays >= 2)
                Console.WriteLine("  ⚠ 이틀 넘게 안 자랐습니다 — 지금 쓰는 RIP 이 이 파일이 맞는지 확인하세요.");

            byte[] data;
            try
            {
                using var fs = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete);
                using var ms = new MemoryStream();
                fs.CopyTo(ms);
                data = ms.ToArray();
            }
            catch (Exception ex)
            {
                Console.WriteLine($"  ✗ 읽기 실패: {ex.Message}");
                Environment.Exit(2);
                return;
            }

            // 헤더 — 판이 다르면 여기부터 다르다
            Console.WriteLine($"  헤더(104B): {Hex(data, 0, Math.Min(32, data.Length))}");
            Console.WriteLine($"  헤더 ASCII: {Ascii(data, 0, Math.Min(64, data.Length))}");

            // 마커 — 우리 파서가 레코드를 찾는 유일한 단서
            var ok = Count(data, "OK!");
            var cancel = Count(data, "Cancel!");
            var error = Count(data, "Error!");
            Console.WriteLine($"  마커      : OK!={ok}  Cancel!={cancel}  Error!={error}   (합계 {ok + cancel + error})");
            if (ok + cancel + error == 0)
                Console.WriteLine("  ✗ 상태 마커가 하나도 없습니다 — 이 TNSRip 은 우리 파서가 아는 판이 아닙니다.");

            // 실제 파싱 — 위치 파일을 건드리지 않으려고 임시 위치 파일을 쓴다
            var tmpPos = Path.Combine(Path.GetTempPath(), "probe-pos-" + Guid.NewGuid().ToString("N").Substring(0, 8) + ".txt");
            List<PrintEvent> events;
            try
            {
                var parser = new PrintLogParser(path, tmpPos);
                parser.ResetPosition();          // ★ 임시 위치 파일이므로 서비스 상태에 영향 없음
                events = parser.ReadNewEntries();
            }
            finally
            {
                try { if (File.Exists(tmpPos)) File.Delete(tmpPos); } catch { /* best effort */ }
            }

            Console.WriteLine($"  파싱 결과 : 레코드 {events.Count}건");
            if (events.Count == 0 && ok + cancel + error > 0)
                Console.WriteLine("  ✗ 마커는 있는데 레코드가 0건 — 레코드 구조가 우리 전제와 다릅니다.");

            var dated = events.Where(e => !string.IsNullOrEmpty(e.PrintCompletedAt)).ToList();
            if (dated.Count > 0)
            {
                Console.WriteLine($"  기간      : {dated.First().PrintCompletedAt}  ~  {dated.Last().PrintCompletedAt}");
                Console.WriteLine("  마지막 3건:");
                foreach (var e in dated.Skip(Math.Max(0, dated.Count - 3)))
                    Console.WriteLine($"    [{e.PrintStatus}] {e.PrintCompletedAt}  {e.FileName}  {e.OutputSize}");
            }

            Console.WriteLine();
            Console.WriteLine(events.Count > 0 && age.TotalDays < 2
                ? "  → 립 축 정상. 실적이 안 보이면 조인·전송 축을 보세요(service.log)."
                : "  → 이 결과를 그대로 복사해 담당자에게 보내세요.");
        }

        private static int Count(byte[] data, string marker)
        {
            var m = Encoding.ASCII.GetBytes(marker);
            int n = 0;
            for (int i = 0; i + m.Length <= data.Length; i++)
            {
                bool hit = true;
                for (int j = 0; j < m.Length; j++) if (data[i + j] != m[j]) { hit = false; break; }
                if (hit) n++;
            }
            return n;
        }

        private static string Hex(byte[] d, int from, int len) =>
            string.Join(" ", Enumerable.Range(from, Math.Max(0, len)).Select(i => d[i].ToString("X2", CultureInfo.InvariantCulture)));

        private static string Ascii(byte[] d, int from, int len) =>
            new string(Enumerable.Range(from, Math.Max(0, len)).Select(i => d[i] >= 32 && d[i] < 127 ? (char)d[i] : '.').ToArray());
    }
}
