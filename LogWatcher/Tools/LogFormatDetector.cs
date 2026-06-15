using System;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.RegularExpressions;

namespace LogWatcher.Tools
{
    /// <summary>
    /// Result of sniffing a single log file.
    /// </summary>
    public class FormatInfo
    {
        public string Format = "unknown";          // sqlite | html | csv | text | binary | empty | unreadable
        public string Encoding = "";               // utf-8 | utf-16le | utf-16be | binary
        public string RecommendedParser = "";      // epson | flexi | printexp | tns | text_log | csv_log
        public bool HasCardPattern = false;        // contains an IA order number (YYYYMMDD-NNN)
        public string Note = "";
    }

    /// <summary>
    /// Sniffs a log file's format from its header bytes — magic numbers, BOM, and content.
    /// Maps the format to a recommended parser. Detection is deterministic (no guessing):
    /// the only soft call is plain-text vs CSV, which is just a recommendation.
    /// </summary>
    public static class LogFormatDetector
    {
        private static readonly Regex CardPattern = new(@"\d{8}-\d{3}", RegexOptions.Compiled);

        static LogFormatDetector()
        {
            try { Encoding.RegisterProvider(CodePagesEncodingProvider.Instance); } catch { }
        }

        public static FormatInfo Detect(string path)
        {
            var info = new FormatInfo();

            byte[] head;
            try
            {
                using var fs = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite);
                int n = (int)Math.Min(8192, fs.Length);
                head = new byte[n];
                int read = fs.Read(head, 0, n);
                if (read < n) Array.Resize(ref head, read);
            }
            catch (Exception ex) { info.Format = "unreadable"; info.Note = ex.Message; return info; }

            if (head.Length == 0) { info.Format = "empty"; return info; }

            // SQLite database (magic header)
            if (head.Length >= 16 && Encoding.ASCII.GetString(head, 0, 15) == "SQLite format 3")
            {
                info.Format = "sqlite";
                info.Encoding = "binary";
                info.RecommendedParser = "epson";
                info.Note = "SQLite DB — epson parser; needs a SELECT query in config";
                return info;
            }

            // BOM
            string enc = "utf-8";
            int bom = 0;
            if (head.Length >= 3 && head[0] == 0xEF && head[1] == 0xBB && head[2] == 0xBF) { enc = "utf-8"; bom = 3; }
            else if (head.Length >= 2 && head[0] == 0xFF && head[1] == 0xFE) { enc = "utf-16le"; bom = 2; }
            else if (head.Length >= 2 && head[0] == 0xFE && head[1] == 0xFF) { enc = "utf-16be"; bom = 2; }

            // Binary vs text
            if (!IsMostlyText(head, bom, enc))
            {
                info.Format = "binary";
                info.Encoding = "binary";
                info.RecommendedParser = "tns";
                info.HasCardPattern = CardPattern.IsMatch(SafeDecode(head, 949));
                info.Note = "binary log — likely TopazRip (tns); custom parser if not";
                return info;
            }

            string sample = DecodeSample(head, bom, enc);
            info.Encoding = enc;
            info.HasCardPattern = CardPattern.IsMatch(sample);

            // HTML
            var low = sample.ToLowerInvariant();
            if (low.Contains("<html") || low.Contains("<table") || low.Contains("<!doctype"))
            {
                info.Format = "html";
                info.RecommendedParser = "flexi";
                info.Note = "HTML log — likely SAi FlexiPRINT RIPLOG.HTML";
                return info;
            }

            // CSV (soft)
            if (LooksCsv(sample))
            {
                info.Format = "csv";
                info.RecommendedParser = "csv_log";
                info.Note = "CSV-like — csv_log parser (not yet implemented)";
                return info;
            }

            // Plain text
            info.Format = "text";
            if (enc is "utf-16le" or "utf-16be")
            {
                info.RecommendedParser = "printexp/text_log";
                info.Note = "UTF-16 text — PrintExp-style or generic; run --learn to derive pattern";
            }
            else
            {
                info.RecommendedParser = "text_log";
                info.Note = "plain text — run --learn to derive completion pattern";
            }
            return info;
        }

        private static bool IsMostlyText(byte[] b, int bom, string enc)
        {
            if (enc.StartsWith("utf-16")) return true; // BOM already says it's text

            int printable = 0, total = 0;
            for (int i = bom; i < b.Length; i++)
            {
                byte c = b[i];
                total++;
                if (c == 9 || c == 10 || c == 13 || (c >= 32 && c != 127)) printable++; // ascii printable + ws
                else if (c >= 128) printable++;                                          // multibyte (utf-8/euc-kr)
            }
            return total == 0 || printable * 100 / total >= 85;
        }

        private static string DecodeSample(byte[] b, int bom, string enc)
        {
            try
            {
                return enc switch
                {
                    "utf-16le" => Encoding.Unicode.GetString(b, bom, b.Length - bom),
                    "utf-16be" => Encoding.BigEndianUnicode.GetString(b, bom, b.Length - bom),
                    _ => Encoding.UTF8.GetString(b, bom, b.Length - bom),
                };
            }
            catch { return Encoding.ASCII.GetString(b); }
        }

        private static string SafeDecode(byte[] b, int codepage)
        {
            try { return Encoding.GetEncoding(codepage).GetString(b); }
            catch { return ""; }
        }

        private static bool LooksCsv(string sample)
        {
            var lines = sample.Split('\n').Select(l => l.TrimEnd('\r'))
                              .Where(l => l.Trim().Length > 0).Take(5).ToArray();
            if (lines.Length < 2) return false;

            int Commas(string s) => s.Count(c => c == ',');
            int Tabs(string s) => s.Count(c => c == '\t');

            int c0 = Commas(lines[0]);
            if (c0 >= 2 && lines.All(l => Math.Abs(Commas(l) - c0) <= 1)) return true;
            int t0 = Tabs(lines[0]);
            if (t0 >= 2 && lines.All(l => Math.Abs(Tabs(l) - t0) <= 1)) return true;
            return false;
        }
    }
}
