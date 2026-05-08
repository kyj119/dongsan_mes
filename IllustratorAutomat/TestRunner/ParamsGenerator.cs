using System.Text.Json;

namespace IATestRunner;

/// <summary>
/// ia_params.json 자동 생성 — NAS 감시 폴더에 복사하면 IA가 감지하여 처리
/// </summary>
public static class ParamsGenerator
{
    /// <summary>
    /// ExtractGroups 모드 파라미터 생성
    /// </summary>
    public static string GenerateExtractParams(string sourceFile, string outputDir, string reqId)
    {
        var p = new
        {
            mode       = "extract",
            source     = Path.GetFullPath(sourceFile),
            output     = Path.GetFullPath(outputDir),
            reqId,
            thumbSize  = 300,
            canvasSize = 1200
        };
        return JsonSerializer.Serialize(p, new JsonSerializerOptions { WriteIndented = true });
    }

    /// <summary>
    /// ProcessOrderItem 모드 파라미터 생성 (바운드 추출 후 EPS 생성)
    /// </summary>
    public static string GenerateProcessParams(
        string sourceFile, string outputDir, string reqId,
        int groupIdx = 0,
        double marginL = 0, double marginR = 0, double marginT = 0, double marginB = 0)
    {
        var fileName = Path.GetFileNameWithoutExtension(sourceFile);
        var p = new
        {
            mode      = "process",
            source    = Path.GetFullPath(sourceFile),
            groupIdx,
            marginL, marginR, marginT, marginB,
            epsOutput = Path.Combine(outputDir, $"{fileName}-G{groupIdx + 1}.eps"),
            pngOutput = Path.Combine(outputDir, $"{fileName}-G{groupIdx + 1}.png"),
            thumbSize = 300
        };
        return JsonSerializer.Serialize(p, new JsonSerializerOptions { WriteIndented = true });
    }

    /// <summary>
    /// ia_params.json 파일로 저장
    /// </summary>
    public static string Write(string content, string targetDir)
    {
        var path = Path.Combine(targetDir, "ia_params.json");
        Directory.CreateDirectory(targetDir);
        File.WriteAllText(path, content);
        return path;
    }
}
