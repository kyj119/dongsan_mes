using System.Text;

namespace IATestRunner;

/// <summary>
/// 테스트 결과 마크다운 리포트 생성
/// </summary>
public static class ReportGenerator
{
    public static string Generate(List<TestResult> results, string reportsDir)
    {
        var ts        = DateTime.Now;
        var fileName  = $"{ts:yyyy-MM-dd_HHmmss}.md";
        var reportPath = Path.Combine(reportsDir, fileName);

        int total    = results.Count;
        int success  = results.Count(r => r.Success);
        int failed   = total - success;
        double avgMs = total > 0 ? results.Average(r => r.ElapsedMs) : 0;

        var sb = new StringBuilder();
        sb.AppendLine($"# IA 테스트 리포트 ({ts:yyyy-MM-dd HH:mm:ss})");
        sb.AppendLine();
        sb.AppendLine("## 요약");
        sb.AppendLine("| 항목 | 값 |");
        sb.AppendLine("|------|-----|");
        sb.AppendLine($"| 총 파일 | {total}건 |");
        sb.AppendLine($"| 성공 | {success}건 ({(total > 0 ? success * 100 / total : 0)}%) |");
        sb.AppendLine($"| 실패 | {failed}건 |");
        sb.AppendLine($"| 평균 처리 시간 | {avgMs / 1000.0:F1}초 |");
        sb.AppendLine();

        var failedList = results.Where(r => !r.Success).ToList();
        if (failedList.Count > 0)
        {
            sb.AppendLine("## 실패 목록");
            sb.AppendLine("| 파일 | 추출 크기 | 정답 크기 | 차이 | 오류 |");
            sb.AppendLine("|------|----------|----------|------|------|");
            foreach (var r in failedList)
            {
                var extracted = r.Extracted != null ? $"{r.Extracted.WidthMm:F0}×{r.Extracted.HeightMm:F0}mm" : "-";
                var expected  = r.Expected  != null ? $"{r.Expected.WidthMm:F0}×{r.Expected.HeightMm:F0}mm"  : "-";
                var diff      = r.HasExpected ? $"{r.DiffPercent:F1}%" : "-";
                var err       = string.IsNullOrEmpty(r.ErrorMessage) ? "" : r.ErrorMessage[..Math.Min(50, r.ErrorMessage.Length)];
                sb.AppendLine($"| {r.FileName} | {extracted} | {expected} | {diff} | {err} |");
            }
            sb.AppendLine();
        }

        var successList = results.Where(r => r.Success).ToList();
        if (successList.Count > 0)
        {
            sb.AppendLine("## 성공 목록");
            sb.AppendLine("| 파일 | 추출 크기 | 차이 | 처리 시간 |");
            sb.AppendLine("|------|----------|------|----------|");
            foreach (var r in successList)
            {
                var extracted = r.Extracted != null ? $"{r.Extracted.WidthMm:F0}×{r.Extracted.HeightMm:F0}mm" : "-";
                var diff      = r.HasExpected ? $"{r.DiffPercent:F1}%" : "정답없음";
                sb.AppendLine($"| {r.FileName} | {extracted} | {diff} | {r.ElapsedMs / 1000.0:F1}초 |");
            }
        }

        Directory.CreateDirectory(reportsDir);
        File.WriteAllText(reportPath, sb.ToString(), System.Text.Encoding.UTF8);
        return reportPath;
    }

    /// <summary>
    /// 최신 리포트 경로 반환
    /// </summary>
    public static string? GetLatest(string reportsDir)
    {
        if (!Directory.Exists(reportsDir)) return null;
        return Directory.GetFiles(reportsDir, "*.md")
            .OrderByDescending(f => f)
            .FirstOrDefault();
    }
}
