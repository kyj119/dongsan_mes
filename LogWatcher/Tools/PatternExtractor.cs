using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.RegularExpressions;

namespace LogWatcher.Tools
{
    public class LearnResult
    {
        public bool Found;
        public string CompletionPattern = "";
        public int FilenameGroup = 1;
        public string? TimestampPattern;
        public string? TimestampFormat;
        public string? SizePattern;
        public string MatchedLine = "";
        public string PreviewFileName = "";
        public string? PreviewOrder;
    }

    /// <summary>
    /// Derives a text_log completion pattern from observed log lines (a real print).
    /// Heuristic, not magic: it finds the line that carries both a "done" keyword and a
    /// file-name-ish token, then turns "keyword + separator + filename" into a regex.
    /// The result is a starting point the user reviews — never auto-applied.
    /// </summary>
    public static class PatternExtractor
    {
        // English + Korean completion keywords (longer/more specific first)
        private static readonly string[] DoneKeywords =
        {
            "인쇄완료", "출력완료", "인쇄 완료", "출력 완료", "출력 끝", "프린트완료",
            "completed", "complete", "finished", "finish", "printed", "success", "done", "완료"
        };

        private static readonly string[] FileExts =
        {
            "eps", "pdf", "ai", "tif", "tiff", "jpg", "jpeg", "png", "prn", "ps", "plt", "bmp", "svg"
        };

        private static readonly Regex CardTok = new(@"\d{8}-\d{3}", RegexOptions.Compiled);

        /// <summary>Completion keywords, in priority order — used by --analyze to enumerate candidates.</summary>
        public static IReadOnlyList<string> Keywords => DoneKeywords;

        // timestamp candidates: (regex, .NET format)
        private static readonly (string rx, string fmt)[] TsCandidates =
        {
            (@"\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}", "yyyy-MM-dd HH:mm:ss"),
            (@"\d{4}/\d{2}/\d{2} \d{2}:\d{2}:\d{2}", "yyyy/MM/dd HH:mm:ss"),
            (@"\d{4}\.\d{2}\.\d{2} \d{2}:\d{2}:\d{2}", "yyyy.MM.dd HH:mm:ss"),
            (@"\d{2}:\d{2}:\d{2}", "HH:mm:ss"),
        };

        private static readonly Regex SizeRx =
            new(@"(\d+(?:\.\d+)?)\s*[xX×]\s*(\d+(?:\.\d+)?)\s*(mm|cm|inch|in)?", RegexOptions.IgnoreCase);

        public static LearnResult Extract(IEnumerable<string> lines)
        {
            var res = new LearnResult();

            string? best = null, bestKw = null;
            foreach (var line in lines)
            {
                if (string.IsNullOrWhiteSpace(line)) continue;
                var kw = DoneKeywords.FirstOrDefault(k => line.IndexOf(k, StringComparison.OrdinalIgnoreCase) >= 0);
                if (kw == null || !HasFileToken(line)) continue;
                best = line; bestKw = kw; break; // earliest qualifying line
            }
            if (best == null) return res;

            res.MatchedLine = best;
            var built = BuildPattern(best, bestKw!);
            if (built.pattern == null) return res;

            res.Found = true;
            res.CompletionPattern = built.pattern;
            res.FilenameGroup = 1;
            res.PreviewFileName = built.fileName;
            res.PreviewOrder = built.order;

            foreach (var (rx, fmt) in TsCandidates)
            {
                if (Regex.IsMatch(best, rx)) { res.TimestampPattern = "(" + rx + ")"; res.TimestampFormat = fmt; break; }
            }

            if (SizeRx.IsMatch(best))
                res.SizePattern = @"(\d+(?:\.\d+)?)\s*[xX×]\s*(\d+(?:\.\d+)?)";

            return res;
        }

        private static bool HasFileToken(string line) =>
            CardTok.IsMatch(line) || FileExts.Any(e => line.IndexOf("." + e, StringComparison.OrdinalIgnoreCase) >= 0);

        private static (string? pattern, string fileName, string? order) BuildPattern(string line, string kw)
        {
            int kwEnd = line.IndexOf(kw, StringComparison.OrdinalIgnoreCase) + kw.Length;
            var after = line.Substring(kwEnd);

            var tokens = after.Split(new[] { ' ', '\t' }, StringSplitOptions.RemoveEmptyEntries);
            string? fileTok =
                tokens.FirstOrDefault(t => FileExts.Any(e => t.TrimEnd('"', '\'', ')', ']', '>', ',', ';')
                                                              .EndsWith("." + e, StringComparison.OrdinalIgnoreCase)))
                ?? tokens.FirstOrDefault(t => CardTok.IsMatch(t));
            if (fileTok == null) return (null, "", null);

            int idx = after.IndexOf(fileTok, StringComparison.Ordinal);
            var sep = after.Substring(0, idx);
            string pattern = Regex.Escape(kw) + SepToPattern(sep) + @"(\S+)";

            var clean = fileTok.Trim('"', '\'', '(', ')', '[', ']', '<', '>', ',', ';');
            string fileName = Path.GetFileNameWithoutExtension(clean);
            var cm = CardTok.Match(clean);
            return (pattern, fileName, cm.Success ? cm.Value : null);
        }

        private static string SepToPattern(string sep)
        {
            sep = sep.Trim();
            return sep.Length == 0 ? @"\s+" : @"\s*" + Regex.Escape(sep) + @"\s*";
        }
    }
}
