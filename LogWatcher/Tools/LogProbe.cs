using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.Encodings.Web;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Threading;

namespace LogWatcher.Tools
{
    /// <summary>
    /// Standalone log-discovery/analysis tools. Run without equipment.json.
    ///   --discover [path...] [--days N] [--depth N] [--all]   scan for log files + detect format
    ///   --learn  &lt;path&gt;   (P3) derive completion pattern from a live print
    ///   --analyze &lt;path&gt;  (P4) static pattern candidates
    /// </summary>
    public static class LogProbe
    {
        private static readonly string[] TargetExts = { ".log", ".txt", ".html", ".htm", ".db", ".csv" };

        private static readonly HashSet<string> ExcludeDirs = new(StringComparer.OrdinalIgnoreCase)
        {
            "windows", "windows.old", "program files", "program files (x86)",
            "$recycle.bin", "system volume information", "recovery", "perflogs",
            "msocache", "node_modules", ".git", "obj", "bin",
            "appdata", "packages", "package cache"
        };

        // Known RIP install locations — scanned deeply even though their parents are excluded.
        private static readonly string[] KnownRipRoots =
        {
            @"C:\TNSRip-X1", @"C:\TNSRip-X11",
            @"C:\ProgramData\Epson", @"C:\ProgramData\Epson\Epson Edge Print",
            @"C:\Program Files\SAi", @"C:\Program Files (x86)\SAi",
        };

        public static void Run(string[] args)
        {
            var mode = args.Length > 0 ? args[0] : "";
            var rest = args.Skip(1).ToArray();
            switch (mode)
            {
                case "--discover": Discover(rest); break;
                case "--learn": Learn(rest); break;
                case "--analyze": Analyze(rest); break;
                case "--init": Init(rest); break;
                default: Console.WriteLine($"[LogProbe] unknown mode: {mode}"); break;
            }
        }

        private static void Discover(string[] args)
        {
            int recentDays = 60;
            int maxDepth = 4;
            bool scanAll = false;
            var paths = new List<string>();

            for (int i = 0; i < args.Length; i++)
            {
                if (args[i] == "--days" && i + 1 < args.Length) int.TryParse(args[++i], out recentDays);
                else if (args[i] == "--depth" && i + 1 < args.Length) int.TryParse(args[++i], out maxDepth);
                else if (args[i] == "--all") scanAll = true;
                else paths.Add(args[i]);
            }

            bool defaultScan = paths.Count == 0;
            if (defaultScan)
            {
                foreach (var r in KnownRipRoots)
                    if (Directory.Exists(r)) paths.Add(r);
                paths.AddRange(GetFixedDriveRoots());
                if (scanAll) maxDepth = Math.Max(maxDepth, 8);
            }

            Console.WriteLine("=== LogProbe --discover ===");
            Console.WriteLine($"PC: {Environment.MachineName}   recent: {recentDays}d   depth: {maxDepth}");
            Console.WriteLine($"Roots: {string.Join("  ", paths)}");
            Console.WriteLine("(스캔 중...)\n");

            var cutoff = DateTime.Now.AddDays(-recentDays);
            var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            var rows = new List<Candidate>();

            foreach (var root in paths)
            {
                if (!Directory.Exists(root)) continue;
                bool known = KnownRipRoots.Any(k => string.Equals(k, root, StringComparison.OrdinalIgnoreCase));
                foreach (var file in SafeEnumerate(root, maxDepth, applyExcludes: !known))
                {
                    var ext = Path.GetExtension(file).ToLowerInvariant();
                    if (!TargetExts.Contains(ext)) continue;
                    if (!seen.Add(file)) continue;

                    FileInfo fi;
                    try { fi = new FileInfo(file); } catch { continue; }
                    if (fi.Length == 0 || fi.LastWriteTime < cutoff) continue;

                    var fmt = LogFormatDetector.Detect(file);
                    if (fmt.Format is "empty" or "unreadable") continue;

                    rows.Add(new Candidate
                    {
                        path = file,
                        format = fmt.Format,
                        encoding = fmt.Encoding,
                        recommended_parser = fmt.RecommendedParser,
                        has_card_pattern = fmt.HasCardPattern,
                        size = fi.Length,
                        last_write = fi.LastWriteTime.ToString("yyyy-MM-dd HH:mm"),
                        note = fmt.Note
                    });
                }
            }

            // Most promising first: has card pattern, then recently written
            var ordered = rows
                .OrderByDescending(r => r.has_card_pattern)
                .ThenByDescending(r => r.last_write)
                .ToList();

            PrintTable(ordered);

            var outPath = Path.Combine(AppContext.BaseDirectory, $"discover-{Environment.MachineName}.json");
            try
            {
                var payload = new
                {
                    machine = Environment.MachineName,
                    scanned_at = DateTime.Now.ToString("s"),
                    recent_days = recentDays,
                    roots = paths,
                    candidates = ordered
                };
                File.WriteAllText(outPath, JsonSerializer.Serialize(payload, new JsonSerializerOptions { WriteIndented = true }));
                Console.WriteLine($"\n[OK] {ordered.Count} candidate(s). Saved → {outPath}");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"\n[WARN] Failed to write JSON: {ex.Message}");
            }

            if (ordered.Count > 0)
            {
                Console.WriteLine("\n다음 단계: 카드패턴 ✓ 이고 parser=text_log 인 로그에 대해");
                Console.WriteLine("  LogWatcher.exe --learn \"<로그경로>\"   (출력 1건으로 완료패턴 자동추출)  ← P3");
            }
        }

        private static void PrintTable(List<Candidate> rows)
        {
            if (rows.Count == 0)
            {
                Console.WriteLine("(발견된 로그 후보 없음 — 경로를 직접 지정하거나 --days 를 늘려보세요)");
                return;
            }

            Console.WriteLine($"{"CARD",-5} {"FORMAT",-8} {"ENCODING",-9} {"PARSER",-17} {"WRITTEN",-17} PATH");
            Console.WriteLine(new string('-', 100));
            foreach (var r in rows)
            {
                var card = r.has_card_pattern ? " ✓ " : "  ·";
                Console.WriteLine($"{card,-5} {r.format,-8} {r.encoding,-9} {r.recommended_parser,-17} {r.last_write,-17} {r.path}");
            }
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

        // ===== --learn: derive a completion pattern from a live print =====

        private static void Learn(string[] args)
        {
            string? path = null, id = null, name = null;
            int timeout = 300;
            for (int i = 0; i < args.Length; i++)
            {
                if (args[i] == "--id" && i + 1 < args.Length) id = args[++i];
                else if (args[i] == "--name" && i + 1 < args.Length) name = args[++i];
                else if (args[i] == "--timeout" && i + 1 < args.Length) int.TryParse(args[++i], out timeout);
                else if (!args[i].StartsWith("--")) path = args[i];
            }

            if (string.IsNullOrEmpty(path))
            {
                Console.WriteLine("사용법: --learn \"<로그경로>\" [--id ID] [--name 이름] [--timeout 초]");
                return;
            }
            if (!File.Exists(path)) { Console.WriteLine($"[LEARN] 파일 없음: {path}"); return; }

            var fmt = LogFormatDetector.Detect(path);
            if (fmt.Format != "text")
            {
                Console.WriteLine($"[LEARN] 이 로그는 '{fmt.Format}' 형식입니다 (추천 파서: {fmt.RecommendedParser}).");
                Console.WriteLine("        --learn 은 일반 텍스트 로그(text_log) 전용입니다.");
                if (fmt.Format == "html") Console.WriteLine("        → parser_type \"flexi\" 로 바로 설정하세요.");
                else if (fmt.Format == "sqlite") Console.WriteLine("        → parser_type \"epson\" + SELECT 쿼리로 설정하세요.");
                else if (fmt.Format == "binary") Console.WriteLine("        → parser_type \"tns\" (TopazRip)일 가능성이 높습니다.");
                return;
            }

            long pos;
            try { using var fs = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite); pos = fs.Length; }
            catch (Exception ex) { Console.WriteLine($"[LEARN] 열기 실패: {ex.Message}"); return; }

            Console.WriteLine("=== LogProbe --learn ===");
            Console.WriteLine($"대상: {path}  (text, {fmt.Encoding})");
            Console.WriteLine($"현재 파일 끝(byte {pos})에서 대기 중.\n");
            Console.WriteLine(">>> 지금 이 장비에서 출력을 1건 실행하세요. <<<");
            Console.WriteLine($"    (완료 로그 감지 시 자동 분석. 최대 {timeout}s 대기, 취소: Ctrl+C)\n");

            var collected = new List<string>();
            var deadline = DateTime.Now.AddSeconds(timeout);
            int grace = 0;
            LearnResult? result = null;

            while (DateTime.Now < deadline)
            {
                Thread.Sleep(1000);
                var newLines = ReadNewLines(path, ref pos);
                foreach (var l in newLines) Console.WriteLine($"  [+] {Trunc(l, 110)}");
                if (newLines.Count > 0) collected.AddRange(newLines);

                var probe = PatternExtractor.Extract(collected);
                if (probe.Found)
                {
                    result = probe;
                    if (grace++ >= 1) break; // one extra poll to catch multi-line events, then finalize
                }
            }

            Console.WriteLine();
            if (result == null || !result.Found)
            {
                Console.WriteLine("[LEARN] 완료 이벤트를 감지하지 못했습니다.");
                Console.WriteLine("        - 출력이 실제로 이 로그에 기록되는지 확인하세요.");
                Console.WriteLine("        - 완료 키워드가 특이하면 --analyze(정적 분석) 또는 수동 패턴이 필요합니다.");
                return;
            }

            PrintResult(result, path, id, name);
        }

        private static void PrintResult(LearnResult r, string path, string? id, string? name)
        {
            Console.WriteLine("[감지] 완료 라인:");
            Console.WriteLine($"   {r.MatchedLine}\n");
            Console.WriteLine("[추출]");
            Console.WriteLine($"   completion_pattern : {r.CompletionPattern}");
            Console.WriteLine($"   filename_group     : {r.FilenameGroup}");
            if (r.TimestampPattern != null) Console.WriteLine($"   timestamp_pattern  : {r.TimestampPattern}  ({r.TimestampFormat})");
            if (r.SizePattern != null) Console.WriteLine($"   size_pattern       : {r.SizePattern}");
            Console.WriteLine($"   미리보기 파일명     : {r.PreviewFileName}");
            Console.WriteLine($"   카드/주문 매칭      : {(r.PreviewOrder != null ? r.PreviewOrder + "  ✓ MES 연동 가능" : "없음 — 파일명에 YYYYMMDD-NNN 패턴 없음(자동 연동 안 됨)")}");
            Console.WriteLine();

            var json = BuildBlockJson(r, path, id, name);

            Console.WriteLine("[생성] equipment.json 의 watchers 배열에 추가하세요 (검토 후):");
            Console.WriteLine("--------------------------------------------------------");
            Console.WriteLine(json);
            Console.WriteLine("--------------------------------------------------------");
            Console.WriteLine(@"주의: 자동 추정값입니다. completion_pattern 의 (\S+) 가 파일명을 정확히 잡는지,");
            Console.WriteLine($"      equipment_id('{id ?? "NEW-01"}')를 equipment 테이블에 등록했는지 확인 후 적용하세요.");
            Console.WriteLine($"      적용 후 검증: LogWatcher.exe --test {id ?? "NEW-01"}");
        }

        private static string BuildBlockJson(LearnResult r, string path, string? id, string? name)
        {
            var cfg = new Dictionary<string, object>
            {
                ["log_path"] = path,
                ["encoding"] = "auto",
                ["completion_pattern"] = r.CompletionPattern,
                ["filename_group"] = r.FilenameGroup,
            };
            if (r.TimestampPattern != null) { cfg["timestamp_pattern"] = r.TimestampPattern; cfg["timestamp_format"] = r.TimestampFormat!; }
            if (r.SizePattern != null) cfg["size_pattern"] = r.SizePattern;

            var block = new Dictionary<string, object>
            {
                ["equipment_id"] = id ?? "NEW-01",
                ["name"] = name ?? "New text RIP",
                ["enabled"] = true,
                ["parser_type"] = "text_log",
                ["config"] = cfg,
            };

            return JsonSerializer.Serialize(block, new JsonSerializerOptions
            {
                WriteIndented = true,
                Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping
            });
        }

        // ===== --analyze: derive completion-pattern candidates from an existing log (no live print) =====

        private static readonly Regex CardTok = new(@"\d{8}-\d{3}", RegexOptions.Compiled);
        private static readonly Regex AnyFileTok =
            new(@"\d{8}-\d{3}|\.(eps|pdf|ai|tif|tiff|jpg|jpeg|png|prn|ps|plt|bmp|svg)\b",
                RegexOptions.Compiled | RegexOptions.IgnoreCase);

        private static void Analyze(string[] args)
        {
            string? path = null;
            int top = 5;
            for (int i = 0; i < args.Length; i++)
            {
                if (args[i] == "--top" && i + 1 < args.Length) int.TryParse(args[++i], out top);
                else if (!args[i].StartsWith("--")) path = args[i];
            }

            if (string.IsNullOrEmpty(path)) { Console.WriteLine("사용법: --analyze \"<로그경로>\" [--top N]"); return; }
            if (!File.Exists(path)) { Console.WriteLine($"[ANALYZE] 파일 없음: {path}"); return; }

            var fmt = LogFormatDetector.Detect(path);
            if (fmt.Format != "text")
            {
                Console.WriteLine($"[ANALYZE] '{fmt.Format}' 형식입니다 (text_log 전용). 추천 파서: {fmt.RecommendedParser}");
                return;
            }

            var lines = ReadTail(path, 2 * 1024 * 1024);
            var fileLines = lines.Where(l => AnyFileTok.IsMatch(l)).ToList();
            Console.WriteLine("=== LogProbe --analyze ===");
            Console.WriteLine($"대상: {path}");
            Console.WriteLine($"분석 라인: {lines.Count}개 중 파일명 포함 {fileLines.Count}개\n");

            if (fileLines.Count == 0)
            {
                Console.WriteLine("[ANALYZE] 파일명을 포함한 라인이 없습니다 — 이 로그로는 출력 이벤트를 식별할 수 없습니다.");
                return;
            }

            var seen = new HashSet<string>();
            var cands = new List<AnalyzeCand>();
            foreach (var kw in PatternExtractor.Keywords)
            {
                var subset = fileLines.Where(l => l.IndexOf(kw, StringComparison.OrdinalIgnoreCase) >= 0).ToList();
                if (subset.Count == 0) continue;

                var ex = PatternExtractor.Extract(subset);
                if (!ex.Found || !seen.Add(ex.CompletionPattern)) continue;

                Regex rx;
                try { rx = new Regex(ex.CompletionPattern); } catch { continue; }
                var matched = fileLines.Where(l => rx.IsMatch(l)).ToList();
                int cards = matched.Count(l => CardTok.IsMatch(l));
                var samples = matched
                    .Select(l => { var m = rx.Match(l); return m.Groups.Count > 1 ? m.Groups[1].Value : ""; })
                    .Where(s => s.Length > 0).Distinct().Take(3).ToList();

                cands.Add(new AnalyzeCand { Pattern = ex.CompletionPattern, Count = matched.Count, Cards = cards, Samples = samples, Result = ex });
            }

            if (cands.Count == 0)
            {
                Console.WriteLine("[ANALYZE] 완료 패턴 후보를 찾지 못했습니다.");
                Console.WriteLine("        완료 키워드가 특이한 RIP일 수 있습니다 → --learn(출력 1건) 을 권장합니다.");
                return;
            }

            cands = cands.OrderByDescending(c => c.Count).ThenByDescending(c => c.Cards).Take(top).ToList();

            Console.WriteLine($"{"#",-3} {"MATCHES",-8} {"CARD",-5} {"PATTERN",-34} SAMPLES");
            Console.WriteLine(new string('-', 100));
            int idx = 1;
            foreach (var c in cands)
                Console.WriteLine($"{idx++,-3} {c.Count,-8} {c.Cards,-5} {Trunc(c.Pattern, 32),-34} {string.Join(", ", c.Samples)}");

            var best = cands[0];
            Console.WriteLine($"\n[추천 #1] (매칭 {best.Count}건, 카드매칭 {best.Cards}건) equipment.json config — 검토 후 적용:");
            Console.WriteLine("--------------------------------------------------------");
            Console.WriteLine(BuildBlockJson(best.Result, path, null, null));
            Console.WriteLine("--------------------------------------------------------");
            Console.WriteLine("여러 후보 중 SAMPLES 가 실제 파일명과 맞는 패턴을 고르세요. 확신이 없으면 --learn 으로 확정하세요.");
        }

        // ===== --init: discover + analyze 로 equipment.json 초안 자동 생성 =====

        private static void Init(string[] args)
        {
            int recentDays = 60, maxDepth = 4;
            var paths = new List<string>();
            for (int i = 0; i < args.Length; i++)
            {
                if (args[i] == "--days" && i + 1 < args.Length) int.TryParse(args[++i], out recentDays);
                else if (args[i] == "--depth" && i + 1 < args.Length) int.TryParse(args[++i], out maxDepth);
                else if (!args[i].StartsWith("--")) paths.Add(args[i]);
            }
            if (paths.Count == 0)
            {
                foreach (var r in KnownRipRoots) if (Directory.Exists(r)) paths.Add(r);
                paths.AddRange(GetFixedDriveRoots());
            }

            Console.WriteLine("=== LogProbe --init (equipment.json 초안 생성) ===");
            Console.WriteLine($"PC: {Environment.MachineName}   recent: {recentDays}d   depth: {maxDepth}");
            Console.WriteLine("(스캔 중...)\n");

            var cutoff = DateTime.Now.AddDays(-recentDays);
            var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            var watchers = new List<Dictionary<string, object>>();
            var idCounts = new Dictionary<string, int>();

            foreach (var root in paths)
            {
                if (!Directory.Exists(root)) continue;
                bool known = KnownRipRoots.Any(k => string.Equals(k, root, StringComparison.OrdinalIgnoreCase));
                foreach (var file in SafeEnumerate(root, maxDepth, applyExcludes: !known))
                {
                    var ext = Path.GetExtension(file).ToLowerInvariant();
                    if (!TargetExts.Contains(ext)) continue;
                    if (!seen.Add(file)) continue;
                    FileInfo fi; try { fi = new FileInfo(file); } catch { continue; }
                    if (fi.Length == 0 || fi.LastWriteTime < cutoff) continue;

                    var fmt = LogFormatDetector.Detect(file);
                    if (fmt.Format is "empty" or "unreadable") continue;

                    // RIP 로그만 채택: 카드패턴 있거나 알려진 RIP 경로/이름 (시스템 노이즈 제외)
                    bool ripLike = known || fmt.HasCardPattern
                        || file.IndexOf("RIPLOG", StringComparison.OrdinalIgnoreCase) >= 0
                        || file.IndexOf("TNSRip", StringComparison.OrdinalIgnoreCase) >= 0
                        || file.IndexOf("Epson Edge", StringComparison.OrdinalIgnoreCase) >= 0
                        || file.IndexOf("PrintExp", StringComparison.OrdinalIgnoreCase) >= 0;
                    if (!ripLike) continue;

                    var parser = MapParser(fmt.RecommendedParser, file);
                    var cfg = new Dictionary<string, object>();
                    bool enabled = true;
                    string note = "";

                    if (parser == "epson")
                    {
                        cfg["db_path"] = file;
                        cfg["query"] = "SELECT j.JobID, j.JobName, l.FinishPrintTime, p.OriginalSizeWidth, p.OriginalSizeHeight FROM Job j JOIN Log l ON j.JobID = l.JobID LEFT JOIN Page p ON j.JobID = p.JobID AND p.PageID = 1 WHERE j.JobStatus = 12 AND j.JobID > @last_id ORDER BY j.JobID";
                        cfg["id_column"] = "JobID"; cfg["filename_column"] = "JobName";
                        cfg["timestamp_column"] = "FinishPrintTime";
                        cfg["size_columns"] = new[] { "OriginalSizeWidth", "OriginalSizeHeight" };
                        cfg["size_unit"] = "pt"; cfg["read_only"] = true;
                    }
                    else if (parser == "printexp")
                    {
                        cfg["log_path"] = Path.GetDirectoryName(file) ?? file; // PrintExp 파서는 폴더 경로
                    }
                    else if (parser == "text_log")
                    {
                        cfg["log_path"] = file; cfg["encoding"] = "auto";
                        var lines = ReadTail(file, 2 * 1024 * 1024);
                        var fileLines = lines.Where(l => AnyFileTok.IsMatch(l)).ToList();
                        var ex = PatternExtractor.Extract(fileLines);
                        if (ex.Found)
                        {
                            cfg["completion_pattern"] = ex.CompletionPattern;
                            cfg["filename_group"] = ex.FilenameGroup;
                            if (ex.TimestampPattern != null) { cfg["timestamp_pattern"] = ex.TimestampPattern; cfg["timestamp_format"] = ex.TimestampFormat!; }
                            if (ex.SizePattern != null) cfg["size_pattern"] = ex.SizePattern;
                        }
                        else
                        {
                            enabled = false; note = "완료패턴 자동추출 실패 → --learn 필요";
                            cfg["completion_pattern"] = ""; cfg["filename_group"] = 1;
                        }
                    }
                    else // flexi, tns
                    {
                        cfg["log_path"] = file;
                    }

                    var prefix = parser.ToUpperInvariant().Replace("_", "-");
                    idCounts.TryGetValue(prefix, out int n); n++; idCounts[prefix] = n;
                    var eqId = $"{prefix}-{n:D2}";

                    watchers.Add(new Dictionary<string, object>
                    {
                        ["equipment_id"] = eqId,
                        ["name"] = eqId,
                        ["enabled"] = enabled,
                        ["parser_type"] = parser,
                        ["config"] = cfg
                    });
                    Console.WriteLine($"  [{(enabled ? "+" : "!")}] {eqId} ({parser})  ← {file}" + (note != "" ? $"   // {note}" : ""));
                }
            }

            if (watchers.Count == 0)
            {
                Console.WriteLine("[INIT] RIP 로그를 찾지 못했습니다. 'LogWatcher.exe --discover' 로 전체 목록을 확인하세요.");
                return;
            }

            var outPath = Path.Combine(AppContext.BaseDirectory, "equipment.json");
            if (File.Exists(outPath))
            {
                try { File.Copy(outPath, outPath + ".bak", true); Console.WriteLine("\n기존 equipment.json → equipment.json.bak 백업"); } catch { }
            }
            var rootObj = new Dictionary<string, object>
            {
                ["poll_interval_seconds"] = 5,
                ["heartbeat_interval_seconds"] = 60,
                ["watchers"] = watchers
            };
            var json = JsonSerializer.Serialize(rootObj, new JsonSerializerOptions { WriteIndented = true, Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping });
            File.WriteAllText(outPath, json);

            Console.WriteLine($"\n[OK] {watchers.Count}개 장비 초안 생성 → {outPath}");
            Console.WriteLine("검토하세요:");
            Console.WriteLine("  1) 같은 장비가 로그 2개로 잡혔으면(예: flexi+printexp) 불필요한 watcher 삭제");
            Console.WriteLine("  2) equipment_id / name 을 원하는 이름으로 수정");
            Console.WriteLine("  3) enabled:false(완료패턴 미설정)는 --learn 으로 패턴 추출 후 채우기");
            Console.WriteLine("  → 그 후 LogWatcher.exe --test, install-service.bat");
        }

        private static string MapParser(string rec, string path)
        {
            if (rec == "epson" || rec == "flexi" || rec == "tns") return rec;
            if (rec.StartsWith("printexp"))
                return Path.GetFileName(path).StartsWith("Log[", StringComparison.OrdinalIgnoreCase) ? "printexp" : "text_log";
            return "text_log";
        }

        private static List<string> ReadTail(string path, long cap)
        {
            var result = new List<string>();
            try
            {
                using var fs = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite);
                long start = Math.Max(0, fs.Length - cap);
                fs.Seek(start, SeekOrigin.Begin);
                var buf = new byte[fs.Length - start];
                int read = fs.Read(buf, 0, buf.Length);
                var text = SmartDecode(buf, read, out _);
                var arr = text.Split('\n');
                int from = start > 0 ? 1 : 0; // drop partial first line if we started mid-file
                for (int i = from; i < arr.Length; i++)
                {
                    var l = arr[i].TrimEnd('\r');
                    if (l.Length > 0) result.Add(l);
                }
            }
            catch { }
            return result;
        }

        private class AnalyzeCand
        {
            public string Pattern = "";
            public int Count;
            public int Cards;
            public List<string> Samples = new();
            public LearnResult Result = new();
        }

        private static List<string> ReadNewLines(string path, ref long pos)
        {
            var lines = new List<string>();
            try
            {
                using var fs = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite);
                var len = fs.Length;
                if (pos > len) pos = 0;       // truncated/rotated
                if (pos >= len) return lines;

                fs.Seek(pos, SeekOrigin.Begin);
                var buf = new byte[len - pos];
                int read = fs.Read(buf, 0, buf.Length);
                if (read == 0) return lines;

                var text = SmartDecode(buf, read, out var enc);
                int lastNl = text.LastIndexOf('\n');
                if (lastNl < 0) return lines; // wait for a complete line
                var complete = text.Substring(0, lastNl + 1);

                foreach (var raw in complete.Split('\n'))
                {
                    var line = raw.TrimEnd('\r');
                    if (line.Length > 0) lines.Add(line);
                }
                pos += enc.GetByteCount(complete);
            }
            catch { }
            return lines;
        }

        private static string SmartDecode(byte[] buf, int len, out Encoding enc)
        {
            var utf8 = new UTF8Encoding(false, false);
            var s = utf8.GetString(buf, 0, len);
            int repl = s.Count(c => c == '�');
            if (repl == 0 || repl <= s.Length / 100) { enc = utf8; return s; }
            try { var k = Encoding.GetEncoding(949); enc = k; return k.GetString(buf, 0, len); }
            catch { enc = utf8; return s; }
        }

        private static string Trunc(string s, int max) => s.Length <= max ? s : s.Substring(0, max) + "…";

        private class Candidate
        {
            public string path { get; set; } = "";
            public string format { get; set; } = "";
            public string encoding { get; set; } = "";
            public string recommended_parser { get; set; } = "";
            public bool has_card_pattern { get; set; }
            public long size { get; set; }
            public string last_write { get; set; } = "";
            public string note { get; set; } = "";
        }
    }
}
