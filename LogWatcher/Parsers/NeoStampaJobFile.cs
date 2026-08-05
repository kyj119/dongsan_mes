using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.RegularExpressions;

namespace LogWatcher.Parsers
{
    /// <summary>neoStampa 잡 로그 1개(INI)를 읽은 결과.</summary>
    public sealed class NeoStampaJob
    {
        public string Document = "";
        public string FilePath = "";
        public DateTime? Start;
        public DateTime? End;
        public double PrintWidthMM;
        public double PrintHeightMM;
        public string PrintMode = "";
        /// <summary>리핑이 끝까지 갔는가 (PrintHeightMM 이 배치 총높이에 도달했는가)</summary>
        public bool RipComplete;
        /// <summary>KDots 가 0 인(=리핑 안 된) 아이템 수</summary>
        public int SkippedItems;
        /// <summary>실제 리핑된 도안들. 2개 이상이면 합판.</summary>
        public List<NestMember> Members = new();

        public bool IsNest => Members.Count >= 2;
        /// <summary>단일 도안이면 그 이름, 합판이면 결합 문자열(Document).</summary>
        public string PrimaryName => Members.Count == 1 ? Members[0].file : Document;
        public int TotalCopies => Members.Sum(m => Math.Max(1, m.qty));
    }

    /// <summary>
    /// neoStampa 잡 파일(INI) 파싱. `neostampa` 파서와 전사 2축 조인 파서가 함께 쓴다.
    ///
    /// ⚠️ 멤버 정본은 `[N]` 섹션의 `Name` 이다 — `Document` 의 " + " 를 파싱하면 안 된다
    ///    (도안명 자체에 " + " 가 들어갈 수 있다).
    /// ⚠️ `KDots` 합이 0 인 아이템은 리핑되지 않았다 → 제외한다. 안 그러면 판에 들어가지도 않은
    ///    주문에 실적이 찍힌다.
    /// </summary>
    public static class NeoStampaJobFile
    {
        private static readonly Regex KDotsRegex =
            new(@"^KDots\[[A-Za-z]\]\[\d\]\s*=\s*(\d+)", RegexOptions.Compiled | RegexOptions.Multiline);

        static NeoStampaJobFile()
        {
            try { Encoding.RegisterProvider(CodePagesEncodingProvider.Instance); } catch { /* 이미 등록됨 */ }
        }

        private sealed class Item
        {
            public string Name = "";
            public double WidthMM, HeightMM, VPositionMM;
            public int Copies = 1;
            public long KDotsSum;
        }

        public static NeoStampaJob? Parse(string path)
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
                    { cur = new Item(); items.Add(cur); }
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

            var job = new NeoStampaJob
            {
                FilePath = path,
                Document = general.GetValueOrDefault("Document", "").Trim(),
                Start = ParseTimestamp(general.GetValueOrDefault("StartTime", "")),
                End = ParseTimestamp(general.GetValueOrDefault("EndTime", "")),
                PrintWidthMM = ParseDouble(costs.GetValueOrDefault("PrintWidthMM", "0")),
                PrintHeightMM = ParseDouble(costs.GetValueOrDefault("PrintHeightMM", "0")),
                PrintMode = printSettings.GetValueOrDefault("PrintMode", ""),
            };
            if (string.IsNullOrEmpty(job.Document)) job.Document = Path.GetFileNameWithoutExtension(path);

            // RIP 완료 판정 — 상태 필드가 없으므로 실제 리핑 길이 vs 배치 의도 총높이로 본다
            double extent = 0;
            foreach (var it in items)
            {
                var e = it.VPositionMM + it.HeightMM;
                if (e > extent) extent = e;
            }
            job.RipComplete = extent <= 0 || job.PrintHeightMM >= extent * 0.995;

            var byName = new Dictionary<string, NestMember>(StringComparer.OrdinalIgnoreCase);
            var order = new List<string>();
            foreach (var it in items)
            {
                if (string.IsNullOrEmpty(it.Name)) continue;
                if (it.KDotsSum <= 0) { job.SkippedItems++; continue; }
                if (!byName.TryGetValue(it.Name, out var m))
                {
                    m = new NestMember { file = it.Name, w = it.WidthMM, h = it.HeightMM, qty = 0 };
                    byName[it.Name] = m; order.Add(it.Name);
                }
                m.qty += it.Copies;
            }
            job.Members = order.Select(n => byName[n]).ToList();

            return job.Members.Count == 0 ? null : job;   // 전량 미리핑이면 잡으로 치지 않는다
        }

        /// <summary>잡 로그는 UTF-8. BOM 없는 cp949 대비로 폴백을 둔다.</summary>
        public static string ReadText(string path)
        {
            byte[] bytes;
            try
            {
                using var fs = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete);
                using var ms = new MemoryStream();
                fs.CopyTo(ms);
                bytes = ms.ToArray();
            }
            catch { return ""; }
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
        public static DateTime? ParseTimestamp(string raw)
        {
            raw = (raw ?? "").Trim();
            if (raw.Length == 0) return null;
            string[] formats = { "dd/MM/yyyy H:mm:ss", "dd/MM/yyyy HH:mm:ss", "d/M/yyyy H:mm:ss" };
            if (DateTime.TryParseExact(raw, formats, CultureInfo.InvariantCulture, DateTimeStyles.None, out var dt)) return dt;
            if (DateTime.TryParse(raw, CultureInfo.InvariantCulture, DateTimeStyles.None, out dt)) return dt;
            return null;
        }

        /// <summary>"720x2400 8pass" → "720x2400 DPI"</summary>
        public static string ExtractDpi(string printMode)
        {
            var m = Regex.Match(printMode ?? "", @"(\d+x\d+)");
            return m.Success ? $"{m.Groups[1].Value} DPI" : "";
        }

        public static double ParseDouble(string s)
            => double.TryParse((s ?? "").Trim(), NumberStyles.Float, CultureInfo.InvariantCulture, out var d) ? d : 0;

        public static long ParseLong(string s)
            => long.TryParse((s ?? "").Trim(), NumberStyles.Integer, CultureInfo.InvariantCulture, out var l) ? l : 0;
    }
}
