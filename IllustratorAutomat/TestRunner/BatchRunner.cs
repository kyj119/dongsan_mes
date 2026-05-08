using System.Diagnostics;
using System.Text.Json;

namespace IATestRunner;

/// <summary>
/// 배치 테스트 실행 — NAS 감시 폴더(ia_params.json) 기반 원격 실행
/// Illustrator PC가 별도인 경우: NAS 공유 폴더 경유
/// </summary>
public class BatchRunner
{
    private readonly string _inputDir;
    private readonly string _expectedDir;
    private readonly string _outputDir;
    private readonly string _reportsDir;
    private readonly string _nasWatchDir;   // IA가 감시하는 NAS 폴더
    private readonly int    _timeoutSec;

    public BatchRunner(string testDataRoot, string nasWatchDir, int timeoutSec = 120)
    {
        _inputDir    = Path.Combine(testDataRoot, "input");
        _expectedDir = Path.Combine(testDataRoot, "expected");
        _outputDir   = Path.Combine(testDataRoot, "output");
        _reportsDir  = Path.Combine(testDataRoot, "reports");
        _nasWatchDir = nasWatchDir;
        _timeoutSec  = timeoutSec;
    }

    /// <summary>
    /// input/ 폴더의 모든 AI/EPS 파일 배치 실행
    /// </summary>
    public async Task<List<TestResult>> RunAllAsync(string? singleFile = null)
    {
        var files = Directory.GetFiles(_inputDir, "*.*")
            .Where(f => f.EndsWith(".ai", StringComparison.OrdinalIgnoreCase)
                     || f.EndsWith(".eps", StringComparison.OrdinalIgnoreCase))
            .OrderBy(f => f)
            .ToList();

        if (singleFile != null)
        {
            var target = Path.Combine(_inputDir, singleFile);
            files = files.Where(f => f.Equals(target, StringComparison.OrdinalIgnoreCase)).ToList();
        }

        if (files.Count == 0)
        {
            Console.WriteLine($"⚠️  input/ 폴더에 AI/EPS 파일 없음: {_inputDir}");
            return new List<TestResult>();
        }

        Console.WriteLine($"📂 테스트 파일: {files.Count}건");
        var results = new List<TestResult>();

        foreach (var file in files)
        {
            var result = await RunSingleAsync(file);
            results.Add(result);

            var icon = result.Success ? "✅" : "❌";
            var diff = result.HasExpected ? $" (diff {result.DiffPercent:F1}%)" : "";
            Console.WriteLine($"  {icon} {result.FileName}{diff} [{result.ElapsedMs}ms]");
            if (!result.Success && !string.IsNullOrEmpty(result.ErrorMessage))
                Console.WriteLine($"     ↳ {result.ErrorMessage}");
        }

        return results;
    }

    private async Task<TestResult> RunSingleAsync(string sourceFile)
    {
        var fileName = Path.GetFileName(sourceFile);
        var baseName = Path.GetFileNameWithoutExtension(sourceFile);

        // NAS 경로 기반 (Illustrator PC도 접근 가능해야 함)
        var nasReqDir    = Path.Combine(_nasWatchDir, baseName);
        var nasOutputDir = Path.Combine(nasReqDir, "output");
        var nasSourceFile = Path.Combine(nasReqDir, fileName);
        Directory.CreateDirectory(nasOutputDir);

        // 로컬 output 폴더 (리포트/파싱용)
        var localOutputDir = Path.Combine(_outputDir, baseName);
        Directory.CreateDirectory(localOutputDir);

        var result = new TestResult
        {
            FileName  = fileName,
            OutputDir = localOutputDir
        };

        var sw = Stopwatch.StartNew();
        try
        {
            // 0. 이전 실행 아티팩트 정리 (stale done.json + groups.json 있으면 즉시 완료로 오인)
            var nasDoneFile  = Path.Combine(nasReqDir, "ia_params.done.json");
            var nasErrorFile = Path.Combine(nasReqDir, "ia_params.error.json");
            if (File.Exists(nasDoneFile))  File.Delete(nasDoneFile);
            if (File.Exists(nasErrorFile)) File.Delete(nasErrorFile);
            // output 폴더 내 이전 결과 삭제
            if (Directory.Exists(nasOutputDir))
                foreach (var f in Directory.GetFiles(nasOutputDir))
                    try { File.Delete(f); } catch { }

            // 1. 소스 EPS를 NAS watch 폴더로 복사 (Illustrator PC가 읽을 수 있도록)
            File.Copy(sourceFile, nasSourceFile, overwrite: true);

            // 2. ia_params.json 생성 (NAS 경로 사용) → NAS 감시 폴더에 저장
            var paramsJson = ParamsGenerator.GenerateExtractParams(nasSourceFile, nasOutputDir, baseName);
            ParamsGenerator.Write(paramsJson, nasReqDir);

            // 3. IA 처리 완료 대기 — NAS output 폴더에 groups.json 생성 확인
            var nasResultJson = Path.Combine(nasOutputDir, $"{baseName}-groups.json");
            var completed     = await WaitForOutputAsync(nasResultJson, _timeoutSec);

            if (!completed)
            {
                result.ErrorMessage = $"타임아웃 ({_timeoutSec}s) — IA 응답 없음";
                return result;
            }

            // 4. NAS 결과를 로컬 output 폴더로 복사
            foreach (var f in Directory.GetFiles(nasOutputDir))
                File.Copy(f, Path.Combine(localOutputDir, Path.GetFileName(f)), overwrite: true);

            var resultJson = Path.Combine(localOutputDir, $"{baseName}-groups.json");

            // 5. 결과 파싱
            result.Extracted = ResultComparer.ParseResultJson(resultJson);
            if (result.Extracted == null)
            {
                result.ErrorMessage = "result.json 파싱 실패";
                return result;
            }

            // 6. 정답 비교
            result.Expected   = ResultComparer.LoadExpected(_expectedDir, fileName);
            result.HasExpected = result.Expected != null;
            if (result.HasExpected)
            {
                result.DiffPercent = ResultComparer.CalcDiff(result.Extracted, result.Expected!);
                result.Success     = ResultComparer.IsPass(result.DiffPercent);
            }
            else
            {
                // 정답 없으면 파일 생성 자체가 성공
                result.Success = true;
            }
        }
        catch (Exception ex)
        {
            result.ErrorMessage = ex.Message;
        }
        finally
        {
            sw.Stop();
            result.ElapsedMs = sw.ElapsedMilliseconds;
        }

        return result;
    }

    private static async Task<bool> WaitForOutputAsync(string path, int timeoutSec)
    {
        var deadline = DateTime.Now.AddSeconds(timeoutSec);
        while (DateTime.Now < deadline)
        {
            if (File.Exists(path)) return true;
            await Task.Delay(2000);
        }
        return false;
    }
}
