using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;

namespace LogWatcher.Tools
{
    /// <summary>
    /// --probe : 마커 파일을 한 번 출력시켜 **어느 로그가 이 장비의 로그인지 증명**한다.
    ///
    /// --discover 는 "최근 수정된 로그"를 나열하는 추정이라 무관한 로그가 걸리고 특이한 위치는 놓친다.
    /// --learn 은 로그 경로를 이미 알아야 쓰는데, 모르는 게 바로 문제다.
    /// 마커는 다르다 — 출력한 파일명이 로그 안에 있으면 그 로그가 정답이라는 **증거**다.
    ///
    /// 덤으로 세 가지가 같이 나온다:
    ///   · 인코딩   — 마커를 UTF-8/UTF-16LE/cp949 로 각각 인코딩해 찾으므로 걸린 인코딩이 곧 로그 인코딩.
    ///                TNS 바이너리도 EUC-KR 바이트로 잡히고, SQLite 도 문자열이 그대로 들어 있어 잡힌다.
    ///   · 로그 형태 — 출력 전후 스냅샷 비교. 파일이 커졌으면 append(tail 계열),
    ///                새로 생겼으면 잡별 파일 생성형(neostampa 계열). **파서 타입을 가르는 핵심 갈림길**이다.
    ///   · 축 개수   — RIP SW 와 제어 SW 가 분리된 장비(전사 8색)는 **두 로그가 동시에 걸린다**.
    ///
    /// 한계: 실제 출력 1건이 필요하다(원단·잉크). RIP 에서 잡 이름을 새로 지정하는 워크플로면
    /// 마커명이 로그에 안 남을 수 있는데, 그때도 스냅샷 diff 로 파일 자체는 특정된다(내용 매칭만 실패).
    /// </summary>
    public static class MarkerProbe
    {
        private static readonly string[] TargetExts = { ".log", ".txt", ".html", ".htm", ".db", ".csv", ".xml", ".json" };

        private static readonly HashSet<string> ExcludeDirs = new(StringComparer.OrdinalIgnoreCase)
        {
            "windows", "windows.old", "$recycle.bin", "system volume information",
            "recovery", "perflogs", "msocache", "node_modules", ".git", "obj",
            "packages", "package cache", "installer", "assembly", "winsxs",
        };

        /// 부모가 제외 대상이어도 깊게 훑는 곳 (RIP 로그가 실제로 사는 위치)
        private static readonly string[] KnownRoots =
        {
            @"C:\TNSRip-X1", @"C:\TNSRip-X11",
            @"C:\ProgramData\Epson", @"C:\Program Files\SAi", @"C:\Program Files (x86)\SAi",
            @"C:\Users\Public\Documents", @"C:\ProgramData",
        };

        private sealed class Snap
        {
            public long Length;
            public DateTime Mtime;
        }

        private sealed class Hit
        {
            public string Path = "";
            public string Encoding = "";
            public bool IsNew;          // 스냅샷 A 에 없던 파일 = 잡별 생성형
            public long Grew;           // 커진 바이트 수 (append 형)
            public FormatInfo Fmt = new();
            public string LogRoot = ""; // 잡별 생성형일 때 감시할 최상위 폴더
        }

        static MarkerProbe()
        {
            try { Encoding.RegisterProvider(CodePagesEncodingProvider.Instance); } catch { /* 이미 등록됨 */ }
        }

        public static void Run(string[] args)
        {
            string? marker = null;
            string? template = null;
            var roots = new List<string>();
            int depth = 6;
            bool noWait = false;

            for (int i = 0; i < args.Length; i++)
            {
                switch (args[i])
                {
                    case "--marker" when i + 1 < args.Length: marker = args[++i]; break;
                    case "--template" when i + 1 < args.Length: template = args[++i]; break;
                    case "--path" when i + 1 < args.Length: roots.Add(args[++i]); break;
                    case "--depth" when i + 1 < args.Length: int.TryParse(args[++i], out depth); break;
                    case "--no-wait": noWait = true; break;
                }
            }

            marker ??= $"MESPROBE-{Environment.MachineName}-{DateTime.Now:yyyyMMddHHmmss}";

            Console.WriteLine("=== LogProbe --probe (마커 출력 기반 자동 탐지) ===");
            Console.WriteLine($"PC     : {Environment.MachineName}");
            Console.WriteLine($"마커   : {marker}");
            Console.WriteLine();

            if (roots.Count == 0)
            {
                foreach (var r in KnownRoots) if (Directory.Exists(r)) roots.Add(r);
                roots.AddRange(GetFixedDriveRoots());
            }
            Console.WriteLine($"스캔 대상: {string.Join("  ", roots)}   (depth {depth})");

            // ── 마커 파일 준비 ───────────────────────────────────────────────
            string? probeFile = null;
            if (!string.IsNullOrEmpty(template))
            {
                if (!File.Exists(template))
                {
                    Console.WriteLine($"[오류] 템플릿 파일이 없습니다: {template}");
                    return;
                }
                var desktop = Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);
                probeFile = Path.Combine(desktop, marker + Path.GetExtension(template));
                try
                {
                    File.Copy(template, probeFile, overwrite: true);
                    Console.WriteLine($"[생성] {probeFile}");
                }
                catch (Exception ex) { Console.WriteLine($"[경고] 마커 파일 생성 실패: {ex.Message}"); probeFile = null; }
            }

            // ── 스냅샷 A ────────────────────────────────────────────────────
            Console.WriteLine("\n[1/4] 출력 전 스냅샷...");
            var before = Snapshot(roots, depth);
            Console.WriteLine($"      파일 {before.Count}개 기록");

            // ── 출력 대기 ──────────────────────────────────────────────────
            Console.WriteLine();
            Console.WriteLine("──────────────────────────────────────────────────────────");
            Console.WriteLine(">>> 지금 이 장비에서 아래 파일을 평소대로 출력하세요. <<<");
            if (probeFile != null) Console.WriteLine($"    {probeFile}");
            else
            {
                Console.WriteLine($"    아무 작은 파일이나 **이 이름으로 저장해서** 출력하면 됩니다:");
                Console.WriteLine($"    {marker}");
            }
            Console.WriteLine("    (작은 크기로 — 원단·잉크가 실제로 소모됩니다)");
            Console.WriteLine("──────────────────────────────────────────────────────────");

            if (noWait) Console.WriteLine("\n[--no-wait] 대기 없이 바로 스캔합니다.");
            else
            {
                Console.WriteLine("\n출력이 끝나면 Enter 를 누르세요...");
                Console.ReadLine();
            }

            // ── 스냅샷 B → diff ────────────────────────────────────────────
            Console.WriteLine("[2/4] 출력 후 스냅샷...");
            var after = Snapshot(roots, depth);
            Console.WriteLine($"      파일 {after.Count}개");

            var changed = new List<(string path, bool isNew, long grew)>();
            foreach (var kv in after)
            {
                if (!before.TryGetValue(kv.Key, out var prev)) changed.Add((kv.Key, true, kv.Value.Length));
                else if (kv.Value.Length > prev.Length) changed.Add((kv.Key, false, kv.Value.Length - prev.Length));
                else if (kv.Value.Mtime > prev.Mtime) changed.Add((kv.Key, false, 0));   // 크기 동일 갱신(SQLite 등)
            }

            Console.WriteLine($"[3/4] 변화한 파일 {changed.Count}개 — 이 안에서만 마커를 찾습니다 (전체 스캔 아님)");
            if (changed.Count == 0)
            {
                Console.WriteLine("\n[결과] 변화한 파일이 없습니다.");
                Console.WriteLine("       - 출력이 실제로 실행됐는지 확인하세요.");
                Console.WriteLine("       - 로그가 스캔 범위 밖일 수 있습니다 → --path \"D:\\어딘가\" 로 지정하세요.");
                return;
            }

            // ── 마커 검색 ──────────────────────────────────────────────────
            Console.WriteLine("[4/4] 마커 검색 (utf-8 / utf-16le / cp949)...");
            var hits = new List<Hit>();
            foreach (var (path, isNew, grew) in changed)
            {
                var enc = FindMarker(path, marker);
                if (enc == null) continue;
                var full = SafeFullPath(path);
                hits.Add(new Hit
                {
                    Path = full, Encoding = enc, IsNew = isNew, Grew = grew,
                    Fmt = SafeDetect(path),
                    LogRoot = isNew ? LogRootOf(full) : ""
                });
            }

            Report(marker, hits, changed);
        }

        // ── 결과 출력 ──────────────────────────────────────────────────────

        private static void Report(string marker, List<Hit> hits, List<(string path, bool isNew, long grew)> changed)
        {
            Console.WriteLine();
            if (hits.Count == 0)
            {
                Console.WriteLine("=== 결과: 마커를 포함한 로그를 찾지 못했습니다 ===");
                Console.WriteLine();
                Console.WriteLine("이 RIP 은 잡 이름을 자체적으로 다시 붙이는 것으로 보입니다.");
                Console.WriteLine("그래도 **변화한 파일 목록 자체가 단서**입니다 — 아래에서 로그로 보이는 것을 고르세요:");
                Console.WriteLine();
                foreach (var (path, isNew, grew) in changed.OrderByDescending(c => c.grew).Take(15))
                {
                    var tag = isNew ? "신규" : (grew > 0 ? $"+{grew}B" : "갱신");
                    Console.WriteLine($"  [{tag,7}] {path}");
                }
                Console.WriteLine();
                Console.WriteLine("고른 뒤:  LogWatcher.exe --analyze \"<경로>\"");
                return;
            }

            Console.WriteLine($"=== 결과: 마커가 들어 있는 로그 {hits.Count}개 확정 ===");
            Console.WriteLine();

            foreach (var h in hits)
            {
                // 잡별 파일 생성형인지 append 형인지 — 파서 선택의 핵심
                var shape = h.IsNew ? "잡별 파일 생성형" : "append 형";
                var parser = RecommendParser(h);

                Console.WriteLine($"  ● {h.Path}");
                Console.WriteLine($"      형태     : {shape}   인코딩: {h.Encoding}   포맷: {h.Fmt.Format}");
                Console.WriteLine($"      파서 추천: {parser}");
                if (h.IsNew) Console.WriteLine($"      log_root : {h.LogRoot}");
                Console.WriteLine();
            }

            if (hits.Count >= 2)
            {
                Console.WriteLine("  ⚠ 로그가 2개 이상 = 이 PC 에 **리핑 SW 와 출력 제어 SW 가 같이** 있습니다.");
                Console.WriteLine("    (전사 8색이 이 경우 — neoStampa 가 리핑, PrintExp_X64 가 실제 출력·취소)");
                Console.WriteLine();
                Console.WriteLine("    → watcher 를 2개 만들지 말고 **합쳐서 1개**로 두세요:");
                Console.WriteLine("       parser_type: \"neostampa_printexp\"  (rip_log_root + print_log_dir)");
                Console.WriteLine("       리핑 로그만으로는 출력 여부를 모르고(취소는 제어 SW 에서 발생),");
                Console.WriteLine("       제어 로그만으로는 도안이 뭔지 모릅니다. 따로 보내면 실적이 2배가 됩니다.");
                Console.WriteLine();
            }

            Console.WriteLine("── equipment.json 초안 (검토 후 사용) ─────────────────────");
            Console.WriteLine(BuildJson(hits));
            Console.WriteLine("───────────────────────────────────────────────────────────");
            Console.WriteLine();
            Console.WriteLine("다음: equipment_id 를 실제 장비 id 로 바꾸고 서버에 같은 id 를 등록한 뒤");
            Console.WriteLine("      LogWatcher.exe --test <equipment_id>   (전송 없이 파싱 확인)");
            Console.WriteLine();
            Console.WriteLine($"※ 마커 잡({marker})은 서버가 무시하므로 실적에 잡히지 않습니다.");
        }

        private static string RecommendParser(Hit h)
        {
            if (h.IsNew) return "neostampa   (잡마다 파일이 생기는 형식 — 폴더 감시)";
            if (!string.IsNullOrEmpty(h.Fmt.RecommendedParser)) return h.Fmt.RecommendedParser;
            return h.Fmt.Format switch
            {
                "sqlite" => "epson       (SELECT 쿼리 작성 필요)",
                "html" => "flexi",
                "binary" => "tns         (TopazRip 계열)",
                "csv" => "csv_log     (미구현 — 코드 필요)",
                _ => "text_log    (완료패턴 정규식 필요 → --analyze)"
            };
        }

        /// <summary>
        /// 잡별 생성형의 감시 루트. neoStampa 는 `Log\YYYY-MM-DD\<잡>.txt` 라 **날짜 폴더 위**가 루트다.
        /// 날짜꼴 폴더가 아니면 파일이 있는 폴더 자체가 루트.
        /// </summary>
        private static string LogRootOf(string filePath)
        {
            var dir = Path.GetDirectoryName(filePath);
            if (string.IsNullOrEmpty(dir)) return filePath;
            var name = Path.GetFileName(dir);
            bool looksLikeDate = name.Count(char.IsDigit) >= 6
                                 && (name.Contains('-') || name.Contains('_') || name.Contains('.') || name.All(char.IsDigit));
            if (!looksLikeDate) return dir;
            return Path.GetDirectoryName(dir) ?? dir;
        }

        private static string SafeFullPath(string p)
        {
            try { return Path.GetFullPath(p); } catch { return p; }
        }

        private static string BuildJson(List<Hit> hits)
        {
            var sb = new StringBuilder();
            sb.AppendLine("{");
            sb.AppendLine("  \"poll_interval_seconds\": 5,");
            sb.AppendLine("  \"heartbeat_interval_seconds\": 60,");
            sb.AppendLine("  \"watchers\": [");

            for (int i = 0; i < hits.Count; i++)
            {
                var h = hits[i];
                var id = $"CHANGE-ME-{i + 1}";
                sb.AppendLine("    {");
                sb.AppendLine($"      \"equipment_id\": \"{id}\",");
                sb.AppendLine($"      \"name\": \"{Environment.MachineName} 장비 {i + 1}\",");
                sb.AppendLine("      \"enabled\": true,");
                if (h.IsNew)
                {
                    sb.AppendLine("      \"parser_type\": \"neostampa\",");
                    sb.AppendLine("      \"config\": {");
                    sb.AppendLine($"        \"log_root\": \"{Esc(h.LogRoot)}\",");
                    sb.AppendLine("        \"settle_seconds\": 5,");
                    sb.AppendLine("        \"backfill_days\": 0");
                    sb.AppendLine("      }");
                }
                else
                {
                    var p = string.IsNullOrEmpty(h.Fmt.RecommendedParser) ? "text_log" : h.Fmt.RecommendedParser;
                    sb.AppendLine($"      \"parser_type\": \"{p}\",");
                    sb.AppendLine("      \"config\": {");
                    sb.AppendLine($"        \"log_path\": \"{Esc(h.Path)}\"");
                    if (p == "text_log")
                        sb.AppendLine("        , \"completion_pattern\": \"(--analyze 로 뽑아 넣으세요)\"");
                    sb.AppendLine("      }");
                }
                sb.AppendLine(i == hits.Count - 1 ? "    }" : "    },");
            }

            sb.AppendLine("  ]");
            sb.Append('}');
            return sb.ToString();
        }

        private static string Esc(string s) => s.Replace("\\", "\\\\");

        // ── 스냅샷 / 검색 ──────────────────────────────────────────────────

        private static Dictionary<string, Snap> Snapshot(List<string> roots, int depth)
        {
            var map = new Dictionary<string, Snap>(StringComparer.OrdinalIgnoreCase);
            foreach (var root in roots)
            {
                if (!Directory.Exists(root)) continue;
                bool known = KnownRoots.Any(k => string.Equals(k, root, StringComparison.OrdinalIgnoreCase));
                foreach (var f in SafeEnumerate(root, depth, applyExcludes: !known))
                {
                    if (!TargetExts.Contains(Path.GetExtension(f).ToLowerInvariant())) continue;
                    if (map.ContainsKey(f)) continue;
                    try
                    {
                        var fi = new FileInfo(f);
                        map[f] = new Snap { Length = fi.Length, Mtime = fi.LastWriteTimeUtc };
                    }
                    catch { /* 접근 불가 파일은 건너뛴다 */ }
                }
            }
            return map;
        }

        /// <summary>마커 문자열을 여러 인코딩의 바이트열로 만들어 파일 내에서 찾는다. 걸린 인코딩명을 반환.</summary>
        private static string? FindMarker(string path, string marker)
        {
            byte[] bytes;
            try
            {
                using var fs = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete);
                if (fs.Length > 64L * 1024 * 1024) return null;   // 과대 파일은 건너뛴다
                using var ms = new MemoryStream();
                fs.CopyTo(ms);
                bytes = ms.ToArray();
            }
            catch { return null; }

            var candidates = new List<(string name, byte[] pat)>
            {
                ("utf-8", Encoding.UTF8.GetBytes(marker)),
                ("utf-16le", Encoding.Unicode.GetBytes(marker)),
            };
            try { candidates.Add(("cp949", Encoding.GetEncoding(949).GetBytes(marker))); } catch { /* 미등록 환경 */ }

            foreach (var (name, pat) in candidates)
                if (IndexOf(bytes, pat) >= 0) return name;

            return null;
        }

        private static int IndexOf(byte[] hay, byte[] needle)
        {
            if (needle.Length == 0 || hay.Length < needle.Length) return -1;
            var first = needle[0];
            var last = hay.Length - needle.Length;
            for (int i = 0; i <= last; i++)
            {
                if (hay[i] != first) continue;
                int j = 1;
                while (j < needle.Length && hay[i + j] == needle[j]) j++;
                if (j == needle.Length) return i;
            }
            return -1;
        }

        private static FormatInfo SafeDetect(string path)
        {
            try { return LogFormatDetector.Detect(path); }
            catch { return new FormatInfo(); }
        }

        private static IEnumerable<string> SafeEnumerate(string root, int maxDepth, bool applyExcludes)
        {
            var stack = new Stack<(string dir, int depth)>();
            stack.Push((root, 0));
            while (stack.Count > 0)
            {
                var (dir, depth) = stack.Pop();
                string[] files;
                try { files = Directory.GetFiles(dir); } catch { files = Array.Empty<string>(); }
                foreach (var f in files) yield return f;

                if (depth >= maxDepth) continue;
                string[] subs;
                try { subs = Directory.GetDirectories(dir); } catch { continue; }
                foreach (var s in subs)
                {
                    if (applyExcludes && ExcludeDirs.Contains(Path.GetFileName(s))) continue;
                    stack.Push((s, depth + 1));
                }
            }
        }

        private static IEnumerable<string> GetFixedDriveRoots()
        {
            DriveInfo[] drives;
            try { drives = DriveInfo.GetDrives(); } catch { yield break; }
            foreach (var d in drives)
            {
                bool ok;
                try { ok = d.DriveType == DriveType.Fixed && d.IsReady; } catch { ok = false; }
                if (ok) yield return d.RootDirectory.FullName;
            }
        }
    }
}
