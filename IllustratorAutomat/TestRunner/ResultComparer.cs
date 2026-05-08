using System.Text.Json;

namespace IATestRunner;

/// <summary>
/// IA 추출 결과와 expected/ 정답 비교
/// </summary>
public static class ResultComparer
{
    private const double PassThresholdPercent = 10.0;

    /// <summary>
    /// result.json(IA 출력)에서 BoundsInfo 파싱
    /// </summary>
    public static BoundsInfo? ParseResultJson(string resultJsonPath)
    {
        if (!File.Exists(resultJsonPath)) return null;
        try
        {
            var doc = JsonDocument.Parse(File.ReadAllText(resultJsonPath));
            var root = doc.RootElement;

            // groups.json 형식: 최상위가 배열 [{index, name, width_mm, height_mm, ...}, ...]
            if (root.ValueKind == JsonValueKind.Array && root.GetArrayLength() > 0)
            {
                var first = root[0];
                return new BoundsInfo
                {
                    WidthMm     = first.TryGetProperty("width_mm",  out var w) ? w.GetDouble() : 0,
                    HeightMm    = first.TryGetProperty("height_mm", out var h) ? h.GetDouble() : 0,
                    DesignCount = root.GetArrayLength()
                };
            }
            // {"designs": [...]} 객체 형식
            if (root.TryGetProperty("designs", out var designs) && designs.GetArrayLength() > 0)
            {
                var first = designs[0];
                return new BoundsInfo
                {
                    WidthMm     = first.TryGetProperty("width_mm",  out var w) ? w.GetDouble() : 0,
                    HeightMm    = first.TryGetProperty("height_mm", out var h) ? h.GetDouble() : 0,
                    DesignCount = designs.GetArrayLength()
                };
            }
            // canvas.json 형식
            if (root.TryGetProperty("left_pt", out var lp))
            {
                double left   = lp.GetDouble();
                double top    = root.GetProperty("top_pt").GetDouble();
                double right  = root.GetProperty("right_pt").GetDouble();
                double bottom = root.GetProperty("bottom_pt").GetDouble();
                return new BoundsInfo
                {
                    LeftPt   = left,
                    TopPt    = top,
                    RightPt  = right,
                    BottomPt = bottom,
                    WidthMm  = (right - left) / 2.8346,
                    HeightMm = Math.Abs(top - bottom) / 2.8346
                };
            }
            return null;
        }
        catch { return null; }
    }

    /// <summary>
    /// expected/ 폴더의 정답 JSON 로드
    /// </summary>
    public static BoundsInfo? LoadExpected(string expectedDir, string fileName)
    {
        var path = Path.Combine(expectedDir, Path.GetFileNameWithoutExtension(fileName) + ".json");
        if (!File.Exists(path)) return null;
        try
        {
            return JsonSerializer.Deserialize<BoundsInfo>(File.ReadAllText(path));
        }
        catch { return null; }
    }

    /// <summary>
    /// 추출값과 정답의 최대 편차 % 계산
    /// </summary>
    public static double CalcDiff(BoundsInfo extracted, BoundsInfo expected)
    {
        if (expected.WidthMm <= 0 || expected.HeightMm <= 0) return 0;
        double diffW = Math.Abs(extracted.WidthMm  - expected.WidthMm)  / expected.WidthMm  * 100;
        double diffH = Math.Abs(extracted.HeightMm - expected.HeightMm) / expected.HeightMm * 100;
        return Math.Max(diffW, diffH);
    }

    public static bool IsPass(double diffPercent) => diffPercent < PassThresholdPercent;
}
