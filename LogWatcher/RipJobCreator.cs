using System;
using System.Collections.Generic;
using System.IO;
using System.Text;

namespace LogWatcher
{
    /// <summary>
    /// Creates TOPAZ RIP .job files from a template and a PendingJob descriptor.
    /// Templates are INI-style files with a [JobSetting] section.
    /// Output encoding: EUC-KR (required by TNSRip-X11).
    /// </summary>
    public class RipJobCreator
    {
        private readonly string _jobFolder;
        private readonly string _templateFolder;

        public string JobFolder => _jobFolder;

        public RipJobCreator(string jobFolder, string templateFolder)
        {
            _jobFolder = jobFolder;
            _templateFolder = templateFolder;
        }

        /// <summary>
        /// Creates a .job file in the RIP Job folder from the given PendingJob.
        /// Returns the full path of the created file.
        /// </summary>
        public string CreateJob(PendingJob job)
        {
            // 1. Load template
            var templatePath = Path.Combine(_templateFolder, job.RipPreset + ".job");
            if (!File.Exists(templatePath))
                throw new FileNotFoundException($"Job template not found: {templatePath}");

            Encoding.RegisterProvider(CodePagesEncodingProvider.Instance);
            var encoding = Encoding.GetEncoding("euc-kr");
            List<string> lines;
            try
            {
                lines = new List<string>(File.ReadAllLines(templatePath, encoding));
            }
            catch (Exception ex)
            {
                throw new IOException($"템플릿 파일 읽기 실패 ({templatePath}): {ex.Message}", ex);
            }

            // 2. Prepare replacement values (scale_factor 반영, Width/Height는 cm 단위)
            var sf = job.ScaleFactor > 0 ? job.ScaleFactor : 1.0;
            if (job.ScaleFactor <= 0)
                Console.WriteLine($"[JOB] WARN: ScaleFactor={job.ScaleFactor} for {job.CardNumber}, using default 1.0");
            var widthMm  = job.Width  * sf * 10;   // cm → mm
            var heightMm = job.Height * sf * 10;
            if (widthMm <= 0 || heightMm <= 0)
                Console.WriteLine($"[JOB] WARN: Invalid dimensions {widthMm:F0}x{heightMm:F0}mm for {job.CardNumber}");
            var jobId    = DateTimeOffset.UtcNow.ToUnixTimeSeconds().ToString();

            var replacements = new Dictionary<string, string>
            {
                ["File"]        = job.SourceFilePath,
                ["PrintSetup"]  = job.RipPreset + ".tps",
                ["JobID"]       = jobId,
                ["WorkType"]    = "3",
                ["SourceSizeX"] = widthMm.ToString("F6"),
                ["SourceSizeY"] = heightMm.ToString("F6"),
                ["DestSizeX"]   = widthMm.ToString("F6"),
                ["DestSizeY"]   = heightMm.ToString("F6"),
                ["CopyOption"]  = job.Quantity > 1 ? "1" : "0",
                ["CopyColNum"]  = "1",
                ["CopyRowNum"]  = job.Quantity.ToString()
            };

            // 3. Walk lines and replace keys inside [JobSetting]
            bool inJobSetting = false;
            for (int i = 0; i < lines.Count; i++)
            {
                var trimmed = lines[i].Trim();
                if (trimmed == "[JobSetting]")  { inJobSetting = true;  continue; }
                if (trimmed.StartsWith("[") && trimmed.EndsWith("]")) { inJobSetting = false; continue; }
                if (!inJobSetting) continue;

                var eqIdx = lines[i].IndexOf('=');
                if (eqIdx < 0) continue;
                var key = lines[i].Substring(0, eqIdx).Trim();
                if (replacements.ContainsKey(key))
                {
                    lines[i] = $"{key}={replacements[key]}";
                    replacements.Remove(key);
                }
            }

            // 4. Append any keys that were not found in the template
            if (replacements.Count > 0)
            {
                var insertIdx = lines.FindIndex(l => l.Trim() == "[JobSetting]") + 1;
                if (insertIdx <= 0)
                {
                    // [JobSetting] section missing entirely — append it
                    lines.Add("[JobSetting]");
                    insertIdx = lines.Count;
                }
                foreach (var kv in replacements)
                {
                    lines.Insert(insertIdx, $"{kv.Key}={kv.Value}");
                    insertIdx++;
                }
            }

            // 5. Write to Job folder
            try
            {
                Directory.CreateDirectory(_jobFolder);
            }
            catch (Exception ex)
            {
                throw new IOException($"Job 폴더 생성 실패 ({_jobFolder}): {ex.Message}", ex);
            }

            var jobFileName = $"{job.CardNumber}_item{job.CardItemId}.job";
            var jobPath     = Path.Combine(_jobFolder, jobFileName);
            try
            {
                File.WriteAllLines(jobPath, lines, encoding);
            }
            catch (Exception ex)
            {
                throw new IOException($"Job 파일 쓰기 실패 ({jobPath}): {ex.Message}", ex);
            }

            Console.WriteLine($"[JOB] Created: {jobFileName} " +
                              $"(Item={job.ItemName}, File={job.SourceFilePath}, Preset={job.RipPreset}, " +
                              $"Size={widthMm:F0}x{heightMm:F0}mm, Qty={job.Quantity})");
            return jobPath;
        }
    }
}
