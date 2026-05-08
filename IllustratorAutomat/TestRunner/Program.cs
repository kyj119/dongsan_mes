using IATestRunner;

// ─── 경로 설정 ────────────────────────────────────────────────────────────
var testDataRoot = Path.GetFullPath(
    Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", "test-data"));

// NAS 감시 폴더: 환경변수로 오버라이드 가능
var nasWatchDir = Environment.GetEnvironmentVariable("IA_WATCH_DIR")
    ?? @"Z:\Designs\IllustratorAutomat\test-watch";

// ─── CLI 파싱 ─────────────────────────────────────────────────────────────
string? singleFile = null;
bool reportOnly    = false;
bool failedOnly    = false;
int  timeoutSec    = 120;

for (int i = 0; i < args.Length; i++)
{
    switch (args[i])
    {
        case "--file"    when i + 1 < args.Length: singleFile = args[++i]; break;
        case "--report": reportOnly = true;  break;
        case "--failed": failedOnly = true;  break;
        case "--timeout" when i + 1 < args.Length: timeoutSec = int.Parse(args[++i]); break;
    }
}

var reportsDir = Path.Combine(testDataRoot, "reports");

// ─── --report: 최신 리포트만 출력 ────────────────────────────────────────
if (reportOnly)
{
    var latest = ReportGenerator.GetLatest(reportsDir);
    if (latest == null) { Console.WriteLine("리포트 없음"); return 1; }
    Console.WriteLine(File.ReadAllText(latest));
    return 0;
}

// ─── 배치 실행 ────────────────────────────────────────────────────────────
Console.WriteLine("🧪 IA 배치 테스트 러너 시작");
Console.WriteLine($"   testDataRoot : {testDataRoot}");
Console.WriteLine($"   nasWatchDir  : {nasWatchDir}");
Console.WriteLine($"   timeout      : {timeoutSec}s");
Console.WriteLine();

var runner  = new BatchRunner(testDataRoot, nasWatchDir, timeoutSec);
var results = await runner.RunAllAsync(singleFile);

if (results.Count == 0) return 0;

if (failedOnly)
    results = results.Where(r => !r.Success).ToList();

// ─── 리포트 생성 ──────────────────────────────────────────────────────────
Console.WriteLine();
var reportPath = ReportGenerator.Generate(results, reportsDir);
Console.WriteLine($"📄 리포트: {reportPath}");
Console.WriteLine();
Console.WriteLine(File.ReadAllText(reportPath));

return results.Count(r => !r.Success) == 0 ? 0 : 1;
