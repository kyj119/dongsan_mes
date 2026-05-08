using System;
using System.IO;
using System.Net.Http;
using System.Net.Http.Json;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using System.Collections.Generic;
using System.Linq;
using System.Diagnostics;
using System.Runtime.InteropServices;
using Microsoft.Extensions.Configuration;

namespace IllustratorAutomation
{
    class Program
    {
        // Configuration — Override via appsettings.json sitting next to the exe.
        private static string ERP_API_URL = "http://192.168.0.94:3000";
        private static string USERNAME = "admin";
        private static string PASSWORD = "password";
        private static string OUTPUT_FOLDER = @"C:\TNSRip-X11\Preview";
        private static string ZDRIVE_PATH = @"Z:\";
        private static string TEMP_FOLDER = Path.Combine(Path.GetTempPath(), "IllustratorAutomat");
        private static int POLL_INTERVAL_MS = 10000; // 10 seconds (workerd 과부하 방지)
        private static int _backoffMs = 0; // 503 발생 시 추가 대기

        // When true, orders come from POST /api/tasks/claim?type=AI_PROCESS
        // (atomic claim + retry tracking). When false, fall back to the legacy
        // GET /api/orders?status=CONFIRMED polling path.
        private static bool USE_TASK_QUEUE = true;

        private static HttpClient httpClient = new HttpClient();
        private static string? authToken = null;
        private static DateTime _lastZDriveWarnTime = DateTime.MinValue;
        // finishing_methods 캐시: name → margin_cm (세션 1회 로드)
        private static Dictionary<string, double>? _finishingMethodsCache = null;
        // key: orderId, value: updated_at 타임스탬프 — 수정 후 재확인(CONFIRMED 복귀)을 감지하기 위해 Dictionary 사용
        private static Dictionary<int, string> processedOrders = new Dictionary<int, string>();
        private static HashSet<int> processedAnalyses = new HashSet<int>();
        private static HashSet<int> processedLayouts = new HashSet<int>();

        // Map of orderId → current task id (set when we claim a task so the
        // ProcessOrderAsync path can report COMPLETED/FAILED back to /tasks).
        private static Dictionary<int, int> orderToTaskId = new Dictionary<int, int>();

        // ── 핫폴더(테스트 감시) ──────────────────────────────────────────────
        // TestRunner가 ia_params.json을 이 폴더 하위에 쓰면 IA가 감지해 처리
        // 처리 여부는 ia_params.done.json / ia_params.error.json 존재 여부로 판단 (메모리 캐시 없음)
        private static string WATCH_FOLDER = @"Z:\Designs\IllustratorAutomat\test-watch";

        // COM 자동화: Illustrator 상시 실행 인스턴스 (보안 다이얼로그 우회)
        private static dynamic? _ilApp = null;

        // ── Windows API: 콘솔 QuickEdit 모드 비활성화 ────────────────────────
        // QuickEdit 모드: 콘솔 창 클릭 시 선택 모드로 진입 → stdout 블로킹 → 프로그램 멈춤
        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern IntPtr GetStdHandle(uint nStdHandle);
        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool GetConsoleMode(IntPtr hConsoleHandle, out uint lpMode);
        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool SetConsoleMode(IntPtr hConsoleHandle, uint dwMode);

        private static void DisableQuickEdit()
        {
            const uint STD_INPUT_HANDLE = unchecked((uint)-10);
            const uint ENABLE_QUICK_EDIT = 0x0040;
            const uint ENABLE_EXTENDED_FLAGS = 0x0080;
            try
            {
                IntPtr consoleHandle = GetStdHandle(STD_INPUT_HANDLE);
                if (GetConsoleMode(consoleHandle, out uint consoleMode))
                {
                    consoleMode &= ~ENABLE_QUICK_EDIT;
                    consoleMode |= ENABLE_EXTENDED_FLAGS;
                    SetConsoleMode(consoleHandle, consoleMode);
                }
            }
            catch { /* 콘솔이 없는 환경에서 무시 */ }
        }
        // ──────────────────────────────────────────────────────────────────────

        static async Task Main(string[] args)
        {
            DisableQuickEdit(); // 콘솔 클릭으로 인한 일시정지 방지
            Console.WriteLine("================================================");
            Console.WriteLine("   Illustrator Automation Service v2.1");
            Console.WriteLine("   ERP+MES Integration (Task Queue)");
            Console.WriteLine("================================================\n");

            LoadConfig();

            Console.WriteLine($"ERP Server: {ERP_API_URL}");
            Console.WriteLine($"Output Folder: {OUTPUT_FOLDER}");
            Console.WriteLine($"Z Drive Path: {ZDRIVE_PATH}");
            Console.WriteLine($"Temp Folder: {TEMP_FOLDER}");
            Console.WriteLine($"Task Queue: {(USE_TASK_QUEUE ? "ENABLED" : "disabled (legacy polling)")}\n");

            // Z드라이브 확인
            if (!Directory.Exists(ZDRIVE_PATH))
                Console.WriteLine($"⚠️  Z Drive not found: {ZDRIVE_PATH} — Z: 드라이브가 \\\\192.168.0.122\\[share]에 매핑되었는지 확인하세요.");

            // 출력 폴더 확인
            if (!Directory.Exists(OUTPUT_FOLDER))
            {
                Console.WriteLine($"⚠️  Output folder not found: {OUTPUT_FOLDER}");
                Console.WriteLine("Creating folder...");
                Directory.CreateDirectory(OUTPUT_FOLDER);
            }

            // 임시 폴더 생성
            if (!Directory.Exists(TEMP_FOLDER))
                Directory.CreateDirectory(TEMP_FOLDER);

            // 로그인
            Console.WriteLine("🔐 Logging in...");
            if (!await LoginAsync())
            {
                Console.WriteLine("❌ Login failed. Press any key to exit...");
                Console.ReadKey();
                return;
            }
            Console.WriteLine("✅ Login successful!\n");

            // 폴링 시작
            Console.WriteLine("🔄 Polling for orders and AI analysis requests...");
            Console.WriteLine("Press Ctrl+C to stop.\n");

            while (true)
            {
                try
                {
                    if (_backoffMs > 0)
                    {
                        await Task.Delay(_backoffMs);
                        _backoffMs = 0;
                    }

                    if (USE_TASK_QUEUE)
                        await ClaimAndProcessTasksAsync();
                    else
                        await PollOrdersAsync();

                    await Task.Delay(500); // workerd 요청 간 여유
                    await PollAIAnalysisAsync();
                    await Task.Delay(500);
                    await PollAILayoutAsync();
                    await PollTestWatchAsync();
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"[{DateTime.Now:HH:mm:ss}] Main loop error: {ex.Message}");
                }
                await Task.Delay(POLL_INTERVAL_MS);
            }
        }

        // Reads appsettings.json next to the exe; missing file / keys keep
        // the hardcoded defaults so a botched config never bricks the agent.
        private static void LoadConfig()
        {
            try
            {
                string baseDir = AppContext.BaseDirectory;
                string cfgPath = Path.Combine(baseDir, "appsettings.json");
                if (!File.Exists(cfgPath))
                {
                    Console.WriteLine($"ℹ️  appsettings.json not found at {cfgPath} — using defaults.");
                    return;
                }

                var cfg = new ConfigurationBuilder()
                    .SetBasePath(baseDir)
                    .AddJsonFile("appsettings.json", optional: true, reloadOnChange: false)
                    .Build();

                ERP_API_URL    = cfg["ErpApiUrl"]    ?? ERP_API_URL;
                USERNAME       = cfg["Username"]     ?? USERNAME;
                PASSWORD       = cfg["Password"]     ?? PASSWORD;
                OUTPUT_FOLDER  = cfg["OutputFolder"] ?? OUTPUT_FOLDER;
                ZDRIVE_PATH    = cfg["ZDrivePath"]   ?? ZDRIVE_PATH;

                if (int.TryParse(cfg["PollIntervalMs"], out var poll) && poll > 0)
                    POLL_INTERVAL_MS = poll;
                if (bool.TryParse(cfg["UseTaskQueue"], out var useq))
                    USE_TASK_QUEUE = useq;

                Console.WriteLine($"✓ Loaded config from {cfgPath}");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"⚠️  Config load failed ({ex.Message}) — using defaults.");
            }
        }

        // ── Task-queue path (Step 4.5) ─────────────────────────────────────
        // 1. POST /api/tasks/claim?type=AI_PROCESS — atomically flips up to N
        //    PENDING tasks to PROCESSING and returns them.
        // 2. For each claimed task: fetch the order, run ProcessOrderAsync,
        //    then PATCH the task row COMPLETED (or FAILED on exception).
        // 3. Server auto-requeues FAILED while retry_count < max_retries.
        private static async Task ClaimAndProcessTasksAsync()
        {
            HttpResponseMessage claimRes;
            try
            {
                var claimBody = new StringContent(
                    "{\"type\":\"AI_PROCESS\",\"limit\":5}",
                    System.Text.Encoding.UTF8,
                    "application/json"
                );
                claimRes = await httpClient.PostAsync($"{ERP_API_URL}/api/tasks/claim", claimBody);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[{DateTime.Now:HH:mm:ss}] /tasks/claim error: {ex.Message}");
                return;
            }

            if (!claimRes.IsSuccessStatusCode)
            {
                // 401 → token expired; let the main loop re-login next cycle.
                if (claimRes.StatusCode == System.Net.HttpStatusCode.Unauthorized)
                {
                    authToken = null;
                    return;
                }
                // 503 → workerd 과부하; 다음 사이클 전 추가 대기
                if ((int)claimRes.StatusCode == 503)
                {
                    _backoffMs = Math.Min(_backoffMs + 5000, 30000);
                    Console.WriteLine($"[{DateTime.Now:HH:mm:ss}] /tasks/claim 503 → backoff {_backoffMs}ms");
                    return;
                }
                // 404 is fine if the server is an older revision without /tasks.
                if (claimRes.StatusCode != System.Net.HttpStatusCode.NotFound)
                    Console.WriteLine($"[{DateTime.Now:HH:mm:ss}] /tasks/claim {(int)claimRes.StatusCode}");
                return;
            }
            _backoffMs = 0; // 성공 시 백오프 리셋

            var claimJson = await claimRes.Content.ReadFromJsonAsync<JsonElement>();
            if (!claimJson.TryGetProperty("data", out var tasksEl) ||
                tasksEl.ValueKind != JsonValueKind.Array ||
                tasksEl.GetArrayLength() == 0)
                return;

            Console.WriteLine($"[{DateTime.Now:HH:mm:ss}] Claimed {tasksEl.GetArrayLength()} AI_PROCESS task(s)");

            foreach (var task in tasksEl.EnumerateArray())
            {
                int taskId = task.GetProperty("id").GetInt32();
                int? orderId = task.TryGetProperty("order_id", out var oidEl) && oidEl.ValueKind == JsonValueKind.Number
                    ? oidEl.GetInt32()
                    : null;

                if (orderId == null)
                {
                    await PatchTaskAsync(taskId, "FAILED", null, "Task has no order_id");
                    continue;
                }

                try
                {
                    // Fetch full order detail (with items).
                    var detailRes = await httpClient.GetAsync($"{ERP_API_URL}/api/orders/{orderId}");
                    if (!detailRes.IsSuccessStatusCode)
                    {
                        await PatchTaskAsync(taskId, "FAILED", null, $"GET order {orderId}: {(int)detailRes.StatusCode}");
                        continue;
                    }
                    var detail = await detailRes.Content.ReadFromJsonAsync<JsonElement>();
                    if (!detail.TryGetProperty("data", out var orderData))
                    {
                        await PatchTaskAsync(taskId, "FAILED", null, "order detail has no data field");
                        continue;
                    }

                    // Remember the task so ProcessOrderAsync (which uses static state)
                    // can cross-reference. The existing ProcessOrderAsync signature
                    // isn't changed — we keep the mapping on the side.
                    orderToTaskId[orderId.Value] = taskId;

                    await ProcessOrderAsync(orderData);
                    // 로컬: processedOrders는 Dictionary<int, string> (updated_at 추적).
                    // task queue에서 처리된 건은 updated_at을 타임스탬프로 기록.
                    processedOrders[orderId.Value] = DateTime.UtcNow.ToString("O");

                    await PatchTaskAsync(taskId, "COMPLETED", new { order_id = orderId.Value }, null);
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"   ❌ Task {taskId} (order {orderId}) failed: {ex.Message}");
                    await PatchTaskAsync(taskId, "FAILED", null, ex.Message);
                }
                finally
                {
                    if (orderId.HasValue) orderToTaskId.Remove(orderId.Value);
                }
            }
        }

        private static async Task PatchTaskAsync(int taskId, string status, object? output, string? errorMessage)
        {
            try
            {
                var payload = new Dictionary<string, object?>
                {
                    ["status"] = status,
                    ["output_payload"] = output,
                    ["error_message"] = errorMessage
                };
                var content = new StringContent(
                    JsonSerializer.Serialize(payload),
                    System.Text.Encoding.UTF8,
                    "application/json"
                );
                var res = await httpClient.PatchAsync($"{ERP_API_URL}/api/tasks/{taskId}", content);
                if (!res.IsSuccessStatusCode)
                {
                    var body = await res.Content.ReadAsStringAsync();
                    Console.WriteLine($"   ⚠️  PATCH /tasks/{taskId} {(int)res.StatusCode}: {body}");
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"   ⚠️  PATCH /tasks/{taskId} exception: {ex.Message}");
            }
        }

        private static async Task<bool> LoginAsync()
        {
            try
            {
                var loginData = new
                {
                    username = USERNAME,
                    password = PASSWORD
                };

                var response = await httpClient.PostAsJsonAsync($"{ERP_API_URL}/api/auth/login", loginData);

                if (!response.IsSuccessStatusCode)
                {
                    var errorContent = await response.Content.ReadAsStringAsync();
                    Console.WriteLine($"❌ HTTP {response.StatusCode}: {errorContent}");
                    return false;
                }

                var result = await response.Content.ReadFromJsonAsync<JsonElement>();

                if (result.TryGetProperty("data", out var dataElement) &&
                    dataElement.TryGetProperty("token", out var tokenElement))
                {
                    authToken = tokenElement.GetString();
                    httpClient.DefaultRequestHeaders.Authorization =
                        new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", authToken);
                    return true;
                }

                Console.WriteLine("❌ Token not found in response");
                return false;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"❌ Login error: {ex.GetType().Name} - {ex.Message}");
                if (ex.InnerException != null)
                    Console.WriteLine($"   Inner: {ex.InnerException.Message}");
                return false;
            }
        }

        // ── OpenCV 검증 및 override ────────────────────────────────────────
        /// <summary>
        /// JSX가 생성한 groups.json을 OpenCV 결과로 검증/교체.
        /// 그룹 수 다름 또는 크기 편차 >10% 시 override + 썸네일 재생성.
        /// 실패해도 JSX 결과 유지 (안전 래퍼).
        /// </summary>
        private static void OverrideWithOpenCV(string outputDir, string reqId, int thumbSize = 150,
            double hintWidthMm = 0, double hintHeightMm = 0)
        {
            var canvasJsonPath = Path.Combine(outputDir, $"{reqId}-canvas.json");
            var groupsJsonPath = Path.Combine(outputDir, $"{reqId}-groups.json");
            // Illustrator ExportFile은 파일명 공백을 대시로 변환하므로 PNG 경로는 sanitize
            var ilSafeReqId   = reqId.Replace(' ', '-');
            var canvasPngPath  = Path.Combine(outputDir, $"{ilSafeReqId}-canvas.png");

            if (!File.Exists(canvasPngPath) || !File.Exists(canvasJsonPath)) return;
            if (!File.Exists(groupsJsonPath)) return;

            // 1. canvas.json에서 pt 좌표 읽기
            var canvasDoc = JsonDocument.Parse(File.ReadAllText(canvasJsonPath));
            double leftPt   = canvasDoc.RootElement.GetProperty("left_pt").GetDouble();
            double topPt    = canvasDoc.RootElement.GetProperty("top_pt").GetDouble();
            double rightPt  = canvasDoc.RootElement.GetProperty("right_pt").GetDouble();
            double bottomPt = canvasDoc.RootElement.GetProperty("bottom_pt").GetDouble();

            // 1.5. Fix5 pre-check: JSX 단일 디자인이 canvas(=artboard) 1.4배 이상 크면 직접 교정
            // (배열 파일에서 artboard-bounded canvas를 생성했을 때 OCV가 full-canvas region을
            //  areaRatio > 0.95 필터로 제거하는 문제를 우회)
            {
                var jsxTextPre = File.ReadAllText(groupsJsonPath, System.Text.Encoding.UTF8);
                using var jsxDocPre  = JsonDocument.Parse(jsxTextPre);
                var jsxGroupsPre = jsxDocPre.RootElement;
                if (jsxGroupsPre.GetArrayLength() == 1)
                {
                    double canvasWMm = Math.Abs(rightPt - leftPt)  / 2.834645669;
                    double canvasHMm = Math.Abs(topPt   - bottomPt) / 2.834645669;
                    var g0pre   = jsxGroupsPre[0];
                    double jsxWMm = g0pre.GetProperty("width_mm").GetDouble();
                    double jsxHMm = g0pre.GetProperty("height_mm").GetDouble();

                    if (canvasWMm > 50 && canvasHMm > 50 &&
                        (jsxWMm > canvasWMm * 1.4 || jsxHMm > canvasHMm * 1.4))
                    {
                        Console.WriteLine($"   🔄 [Fix5] 배열 파일: JSX {jsxWMm:F0}×{jsxHMm:F0}mm > artboard {canvasWMm:F0}×{canvasHMm:F0}mm → artboard 크기로 교정");
                        // canvas.png(= artboard 범위)를 -0.png 썸네일로 축소 저장
                        // Illustrator가 공백을 대시로 변환하므로 ilSafeReqId 사용
                        string thumbFile = $"{ilSafeReqId}-0.png";
                        try
                        {
                            using var canvMat = OpenCvSharp.Cv2.ImRead(canvasPngPath, OpenCvSharp.ImreadModes.Unchanged);
                            if (!canvMat.Empty())
                            {
                                int longSide = Math.Max(canvMat.Width, canvMat.Height);
                                double sc = longSide > 0 ? Math.Min((double)thumbSize / longSide, 1.0) : 1.0;
                                int nW = Math.Max(1, (int)(canvMat.Width  * sc));
                                int nH = Math.Max(1, (int)(canvMat.Height * sc));
                                using var thumb = new OpenCvSharp.Mat();
                                OpenCvSharp.Cv2.Resize(canvMat, thumb, new OpenCvSharp.Size(nW, nH));
                                OpenCvSharp.Cv2.ImWrite(Path.Combine(outputDir, thumbFile), thumb);
                            }
                        }
                        catch (Exception ex) { Console.WriteLine($"   ⚠️  [Fix5] 썸네일 생성 실패: {ex.Message}"); }

                        int finalWmm = (int)Math.Round(canvasWMm);
                        int finalHmm = (int)Math.Round(canvasHMm);
                        var newGroupFix5 = new[] { new { index = 0, name = "디자인 1",
                            width_mm = finalWmm, height_mm = finalHmm, thumbnail_file = thumbFile } };
                        File.WriteAllText(groupsJsonPath,
                            System.Text.Json.JsonSerializer.Serialize(newGroupFix5),
                            System.Text.Encoding.UTF8);
                        Console.WriteLine($"   ✅ [Fix5] groups.json 교정: {finalWmm}×{finalHmm}mm");
                        return;
                    }
                }
            }

            // 2. OpenCV 추출
            var ocvResults = BoundsExtractor.Extract(canvasPngPath, leftPt, topPt, rightPt, bottomPt,
                                                      debugOutputDir: outputDir);
            if (ocvResults.Count == 0)
            {
                Console.WriteLine($"   ⚠️  [OpenCV] 검출 결과 없음 — JSX 결과 유지");
                return;
            }

            // 3. JSX groups.json 읽기
            var jsxText   = File.ReadAllText(groupsJsonPath, System.Text.Encoding.UTF8);
            var jsxGroups = JsonDocument.Parse(jsxText).RootElement;
            int jsxCount  = jsxGroups.GetArrayLength();
            const double MM_PER_PT = 1.0 / 2.834645669;

            // 3.5. OCV 어노테이션 스트립 제외 (countMismatch 계산 전)
            // ocvResults는 면적 내림차순 정렬 → [0]이 주 디자인
            // 소형(주 영역의 20% 미만) + 고종횡비(5:1 이상) → 어노테이션 텍스트 스트립으로 판단
            if (ocvResults.Count > 1)
            {
                double domPx = ocvResults[0].Width * (double)ocvResults[0].Height;
                var trimmed  = new System.Collections.Generic.List<BoundsExtractor.DesignRect> { ocvResults[0] };
                foreach (var r in ocvResults.Skip(1))
                {
                    double rPx = r.Width * (double)r.Height;
                    double ar  = (double)Math.Max(r.Width, r.Height) / Math.Max(1, Math.Min(r.Width, r.Height));
                    if (rPx < domPx * 0.20 && ar > 5.0)
                        Console.WriteLine($"   ✂️  [OCV] 어노테이션 스트립 제외: {Math.Round(Math.Abs(r.RightPt - r.LeftPt) * MM_PER_PT):F0}×{Math.Round(Math.Abs(r.TopPt - r.BottomPt) * MM_PER_PT):F0}mm (종횡비 {ar:F1}:1)");
                    else
                        trimmed.Add(r);
                }
                if (trimmed.Count < ocvResults.Count)
                    ocvResults = trimmed;
            }

            // 3.6. OCV dominant region에 포함된(contained) 소형 region 제거
            // 배너 내부의 아이콘·텍스트가 별도 OCV region으로 감지되는 케이스 처리
            // (예: 453×81mm 배너 안의 48×47mm 아이콘, 71×29mm 텍스트)
            if (ocvResults.Count > 1)
            {
                var dom = ocvResults[0]; // 면적 최대 = 주 디자인
                const double CONTAIN_MARGIN_PT = 10.0; // ±10pt 오차 허용
                var trimmed2 = new System.Collections.Generic.List<BoundsExtractor.DesignRect> { dom };
                foreach (var r in ocvResults.Skip(1))
                {
                    bool contained = r.LeftPt   >= dom.LeftPt   - CONTAIN_MARGIN_PT
                                  && r.RightPt  <= dom.RightPt  + CONTAIN_MARGIN_PT
                                  && r.TopPt    <= dom.TopPt    + CONTAIN_MARGIN_PT
                                  && r.BottomPt >= dom.BottomPt - CONTAIN_MARGIN_PT;
                    if (contained)
                        Console.WriteLine($"   ✂️  [OCV] contained region 제거: {Math.Round(Math.Abs(r.RightPt - r.LeftPt) * MM_PER_PT):F0}×{Math.Round(Math.Abs(r.TopPt - r.BottomPt) * MM_PER_PT):F0}mm (dom 내부)");
                    else
                        trimmed2.Add(r);
                }
                if (trimmed2.Count < ocvResults.Count)
                    ocvResults = trimmed2;
            }

            // 4. 판정: 그룹 수 다름 OR 크기 편차 >10%
            bool countMismatch = (ocvResults.Count != jsxCount);
            bool sizeMismatch  = false;

            if (!countMismatch && jsxCount == 1)
            {
                // 단일 그룹: OCV vs JSX 크기 직접 비교
                var g0    = jsxGroups[0];
                double jW = g0.GetProperty("width_mm").GetDouble()  * 2.834645669;
                double jH = g0.GetProperty("height_mm").GetDouble() * 2.834645669;
                sizeMismatch = BoundsExtractor.CompareWithJsx(ocvResults[0], jW, jH) > 0.10;
            }
            else if (!countMismatch && jsxCount > 1)
            {
                // 다중 그룹: OCV 크기 분포가 균일할 때 JSX 이상치 감지
                // OCV 그룹들이 모두 비슷한 크기면 → 동일 규격 반복 디자인 (배너 등)
                // JSX 그룹 중 OCV 중앙값에서 20% 이상 벗어난 것이 있으면 override
                var ocvHsMm = ocvResults.Select(d => Math.Abs(d.TopPt - d.BottomPt) * MM_PER_PT).OrderBy(x => x).ToList();
                var ocvWsMm = ocvResults.Select(d => Math.Abs(d.RightPt - d.LeftPt)  * MM_PER_PT).OrderBy(x => x).ToList();
                double ocvMedH = ocvHsMm[jsxCount / 2];
                double ocvMedW = ocvWsMm[jsxCount / 2];

                // OCV 균일성 확인: 모든 OCV 그룹이 중앙값의 ±15% 이내
                bool ocvUniform = ocvHsMm.All(h => ocvMedH > 0 && Math.Abs(h - ocvMedH) / ocvMedH < 0.15)
                               && ocvWsMm.All(w => ocvMedW > 0 && Math.Abs(w - ocvMedW) / ocvMedW < 0.15);

                if (ocvUniform)
                {
                    // JSX 중 OCV 중앙값에서 20% 이상 벗어난 그룹이 있으면 override
                    for (int gi = 0; gi < jsxCount; gi++)
                    {
                        var g  = jsxGroups[gi];
                        double jW = g.GetProperty("width_mm").GetDouble();
                        double jH = g.GetProperty("height_mm").GetDouble();
                        if ((ocvMedW > 0 && Math.Abs(jW - ocvMedW) / ocvMedW > 0.20) ||
                            (ocvMedH > 0 && Math.Abs(jH - ocvMedH) / ocvMedH > 0.20))
                        {
                            sizeMismatch = true;
                            Console.WriteLine($"   ⚠️  [OpenCV] 다중그룹 이상치: JSX[{gi}]={jW:F0}×{jH:F0}mm vs OCV중앙={ocvMedW:F0}×{ocvMedH:F0}mm");
                            break;
                        }
                    }
                }
            }

            if (!countMismatch && !sizeMismatch)
            {
                Console.WriteLine($"   ✅ [OpenCV] JSX 결과 일치 ({jsxCount}그룹) — override 불필요");
                return;
            }

            // JSX가 OCV보다 많은 디자인 검출: OCV가 불규칙 형태(윈드배너·원형) 사이 간격을 병합했을 가능성
            // → 모든 JSX 디자인이 100mm 이상이면 JSX 구조 신뢰 (override 생략)
            if (countMismatch && jsxCount > ocvResults.Count)
            {
                bool allJsxLarge = true;
                for (int gi2 = 0; gi2 < jsxCount; gi2++)
                {
                    var g2  = jsxGroups[gi2];
                    double jW2 = g2.TryGetProperty("width_mm",  out var wp2) ? wp2.GetDouble() : 0;
                    double jH2 = g2.TryGetProperty("height_mm", out var hp2) ? hp2.GetDouble() : 0;
                    if (jW2 < 100 || jH2 < 100) { allJsxLarge = false; break; }
                }
                if (allJsxLarge)
                {
                    Console.WriteLine($"   ℹ️  [OpenCV] JSX({jsxCount}) > OCV({ocvResults.Count}), 모든 JSX 디자인 ≥100mm → JSX 신뢰 (불규칙 형태 겹침 추정)");
                    return;
                }
            }

            Console.WriteLine($"   🔄 [OpenCV] override: JSX={jsxCount}그룹 → OCV={ocvResults.Count}그룹");

            // 5. canvas.png에서 개별 썸네일 크롭 + groups.json 재작성
            using var canvasMat = OpenCvSharp.Cv2.ImRead(canvasPngPath, OpenCvSharp.ImreadModes.Unchanged);
            var newGroups = new System.Collections.Generic.List<object>();
            for (int i = 0; i < ocvResults.Count; i++)
            {
                var d = ocvResults[i];
                var roi = new OpenCvSharp.Rect(d.X, d.Y, d.Width, d.Height);
                // 이미지 범위 클램핑
                int clampX = Math.Max(0, roi.X);
                int clampY = Math.Max(0, roi.Y);
                int clampW = Math.Min(roi.Width,  canvasMat.Width  - clampX);
                int clampH = Math.Min(roi.Height, canvasMat.Height - clampY);
                if (clampW <= 0 || clampH <= 0) continue;

                using var cropped = new OpenCvSharp.Mat(canvasMat,
                    new OpenCvSharp.Rect(clampX, clampY, clampW, clampH));

                int longSide = Math.Max(cropped.Width, cropped.Height);
                double scale = longSide > 0 ? Math.Min((double)thumbSize / longSide, 1.0) : 1.0;
                int newW = Math.Max(1, (int)(cropped.Width  * scale));
                int newH = Math.Max(1, (int)(cropped.Height * scale));
                using var thumb = new OpenCvSharp.Mat();
                OpenCvSharp.Cv2.Resize(cropped, thumb, new OpenCvSharp.Size(newW, newH));

                string thumbFile = $"{reqId}-{i}.png";
                OpenCvSharp.Cv2.ImWrite(Path.Combine(outputDir, thumbFile), thumb);

                double finalW = Math.Round(Math.Abs(d.RightPt  - d.LeftPt)  * MM_PER_PT);
                double finalH = Math.Round(Math.Abs(d.TopPt    - d.BottomPt) * MM_PER_PT);

                // 단일 그룹 + 파일명 힌트 있음 + OCV가 힌트와 ±15mm 이내 → 힌트 사이즈 채택 (블리드 제거)
                if (ocvResults.Count == 1 && hintWidthMm > 0 && hintHeightMm > 0
                    && Math.Abs(finalW - hintWidthMm) <= 15
                    && Math.Abs(finalH - hintHeightMm) <= 15)
                {
                    Console.WriteLine($"   📐 [힌트] {finalW:F0}×{finalH:F0}mm → {hintWidthMm:F0}×{hintHeightMm:F0}mm (파일명 기준)");
                    finalW = hintWidthMm;
                    finalH = hintHeightMm;
                }

                newGroups.Add(new
                {
                    index          = i,
                    name           = $"디자인 {i + 1}",
                    width_mm       = (int)finalW,
                    height_mm      = (int)finalH,
                    thumbnail_file = thumbFile
                });
            }

            File.WriteAllText(groupsJsonPath,
                System.Text.Json.JsonSerializer.Serialize(newGroups),
                System.Text.Encoding.UTF8);
            Console.WriteLine($"   ✅ [OpenCV] groups.json 재작성: {newGroups.Count}그룹");
        }

        /// <summary>
        /// 파일명에서 "NNNxMMM" 패턴으로 정사이즈 힌트 파싱.
        /// 예: "백제간판(400x240-1장).eps" → (400, 240). 없으면 (0, 0).
        /// </summary>
        private static (double w, double h) ParseSizeHintFromFilename(string filePath)
        {
            var name = Path.GetFileNameWithoutExtension(filePath);
            var matches = System.Text.RegularExpressions.Regex.Matches(name, @"(\d+)[xX×](\d+)");
            if (matches.Count == 0) return (0, 0);
            var last = matches[matches.Count - 1];
            if (!double.TryParse(last.Groups[1].Value, out double w)) return (0, 0);
            if (!double.TryParse(last.Groups[2].Value, out double h)) return (0, 0);
            if (w < 10 || h < 10 || w > 10000 || h > 10000) return (0, 0);
            return (w, h);
        }

        // ── 핫폴더(테스트 감시) 폴링 ──────────────────────────────────────
        /// <summary>
        /// WATCH_FOLDER 하위 디렉터리에 ia_params.json이 있으면 ExtractGroups/ProcessOrderItem.jsx 실행.
        /// 처리 완료 후 ia_params.json → ia_params.done.json으로 이름 변경.
        /// </summary>
        private static async Task PollTestWatchAsync()
        {
            if (!Directory.Exists(WATCH_FOLDER)) return;

            string[] subDirs;
            try { subDirs = Directory.GetDirectories(WATCH_FOLDER); }
            catch { return; }

            foreach (var dir in subDirs)
            {
                var paramsFile = Path.Combine(dir, "ia_params.json");
                var doneFile   = Path.Combine(dir, "ia_params.done.json");
                var errorFile  = Path.Combine(dir, "ia_params.error.json");

                if (!File.Exists(paramsFile)) continue;
                if (File.Exists(doneFile) || File.Exists(errorFile)) continue;

                var jobName = Path.GetFileName(dir);
                Console.WriteLine($"[{DateTime.Now:HH:mm:ss}] 🧪 [TestWatch] 잡 감지: {jobName}");

                try
                {
                    var paramsJson = File.ReadAllText(paramsFile, System.Text.Encoding.UTF8);
                    var doc        = JsonDocument.Parse(paramsJson);
                    var root       = doc.RootElement;

                    string mode      = root.TryGetProperty("mode",   out var mEl) ? mEl.GetString() ?? "extract" : "extract";
                    string source    = root.GetProperty("source").GetString()!;
                    string outputDir = root.GetProperty("output").GetString()!;
                    var (hintW, hintH) = ParseSizeHintFromFilename(source);
                    string reqId     = root.TryGetProperty("reqId",     out var rEl) ? rEl.GetString() ?? "" : "";
                    int    thumbSize = root.TryGetProperty("thumbSize",  out var tEl) ? tEl.GetInt32() : 150;

                    Directory.CreateDirectory(outputDir);

                    string scriptName;
                    switch (mode)
                    {
                        case "process":
                            scriptName = "ProcessOrderItem.jsx";
                            break;
                        case "analyze":
                            scriptName = "AnalyzeStructure.jsx";
                            break;
                        case "sheet_layout":
                            scriptName = "SheetLayout.jsx";
                            break;
                        default: // "extract"
                            scriptName = "ExtractGroups.jsx";
                            break;
                    }
                    string scriptPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, scriptName);
                    if (!File.Exists(scriptPath))
                        throw new FileNotFoundException($"{scriptName} 없음: {scriptPath}");

                    // 스크립트 디렉터리에 ia_params.json 기록 (기존 RunJsxScript 패턴)
                    string scriptDir      = Path.GetDirectoryName(scriptPath)!;
                    string localParamsPath = Path.Combine(scriptDir, "ia_params.json");
                    File.WriteAllText(localParamsPath, paramsJson, System.Text.Encoding.UTF8);

                    Console.WriteLine($"   📄 Source : {source}");
                    Console.WriteLine($"   📁 Output : {outputDir}");
                    Console.WriteLine($"   🖥️  Script : {scriptName} (mode={mode})");

                    RunJsxScript(scriptPath, localParamsPath, timeoutMinutes: 3);

                    // OpenCV 검증 및 override (extract 모드에서만)
                    if (mode == "extract" && !string.IsNullOrEmpty(reqId))
                    {
                        try { OverrideWithOpenCV(outputDir, reqId, thumbSize, hintW, hintH); }
                        catch (Exception ex) { Console.WriteLine($"   ⚠️  [OpenCV] 실패 무시: {ex.Message}"); }
                    }

                    // diag.log를 publish 폴더로 복사
                    try
                    {
                        string diagSrc = Path.Combine(outputDir, "ia_diag.log");
                        string diagDst = Path.Combine(scriptDir, "ia_diag.log");
                        if (File.Exists(diagSrc)) File.Copy(diagSrc, diagDst, overwrite: true);
                    }
                    catch { /* 진단 로그 복사 실패는 무시 */ }

                    // 완료 마킹
                    File.Move(paramsFile, doneFile, overwrite: true);
                    Console.WriteLine($"   ✅ [TestWatch] 완료: {jobName}");
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"   ❌ [TestWatch] 실패 ({jobName}): {ex.Message}");
                    try { File.WriteAllText(errorFile, ex.ToString()); } catch { }
                }

                await Task.Yield(); // 다른 폴링 메서드와 CPU 공유
            }
        }

        // ── 기존: 주문 폴링 ────────────────────────────────────────────
        private static async Task PollOrdersAsync()
        {
            try
            {
                var response = await GetWithAuthAsync($"{ERP_API_URL}/api/orders?status=CONFIRMED&limit=10");

                if (!response.IsSuccessStatusCode)
                {
                    Console.WriteLine($"[{DateTime.Now:HH:mm:ss}] Orders API failed: {response.StatusCode}");
                    return;
                }

                var result = await response.Content.ReadFromJsonAsync<JsonElement>();

                Console.WriteLine($"[{DateTime.Now:HH:mm:ss}] Checking for confirmed orders... (Tracked: {processedOrders.Count})");

                if (!result.TryGetProperty("data", out var dataElement))
                    return;

                // API가 {"data": [...]} 형태로 배열 직접 반환하는 경우 처리
                JsonElement ordersElement;
                if (dataElement.ValueKind == JsonValueKind.Array)
                {
                    ordersElement = dataElement;
                }
                else if (dataElement.TryGetProperty("orders", out var nestedOrders))
                {
                    ordersElement = nestedOrders;
                }
                else
                {
                    return;
                }

                var orderCount = ordersElement.GetArrayLength();
                if (orderCount == 0)
                    return;

                Console.WriteLine($"[{DateTime.Now:HH:mm:ss}] Found {orderCount} confirmed order(s)");

                foreach (var order in ordersElement.EnumerateArray())
                {
                    int orderId = order.GetProperty("id").GetInt32();
                    string orderNumber = order.GetProperty("order_number").GetString() ?? "";
                    string updatedAt = order.TryGetProperty("updated_at", out var uaEl) ? (uaEl.GetString() ?? "") : "";

                    if (processedOrders.TryGetValue(orderId, out string? lastProcessedAt) && lastProcessedAt == updatedAt)
                    {
                        Console.WriteLine($"[{DateTime.Now:HH:mm:ss}] Order {orderNumber} already processed (updated_at={updatedAt}), skipping");
                        continue;
                    }

                    if (processedOrders.ContainsKey(orderId))
                        Console.WriteLine($"\n[{DateTime.Now:HH:mm:ss}] 재처리 감지: orderId={orderId}, orderNumber={orderNumber}, 이전 updated_at={lastProcessedAt}, 새 updated_at={updatedAt}");
                    else
                        Console.WriteLine($"\n[{DateTime.Now:HH:mm:ss}] New Order: {orderNumber} (ID: {orderId})");

                    var detailResponse = await GetWithAuthAsync($"{ERP_API_URL}/api/orders/{orderId}");

                    if (!detailResponse.IsSuccessStatusCode)
                    {
                        Console.WriteLine($"❌ Failed to get order details: {detailResponse.StatusCode}");
                        continue;
                    }

                    var orderDetail = await detailResponse.Content.ReadFromJsonAsync<JsonElement>();

                    if (orderDetail.TryGetProperty("data", out var orderData))
                    {
                        await ProcessOrderAsync(orderData);
                        processedOrders[orderId] = updatedAt;
                        Console.WriteLine($"[{DateTime.Now:HH:mm:ss}] Order {orderNumber} processed successfully (updated_at={updatedAt})");
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[{DateTime.Now:HH:mm:ss}] Orders polling error: {ex.Message}");

                if (ex.Message.Contains("401") || ex.Message.Contains("Unauthorized"))
                {
                    Console.WriteLine("🔐 Re-authenticating...");
                    authToken = null;
                    bool reLoginOk = await LoginAsync();
                    if (!reLoginOk)
                        Console.WriteLine($"[{DateTime.Now:HH:mm:ss}] ⚠️ 재인증 실패 — 이번 사이클 스킵");
                }
            }
        }

        // ── 신규: AI 분석 요청 폴링 ────────────────────────────────────
        private static async Task PollAIAnalysisAsync()
        {
            if (!Directory.Exists(ZDRIVE_PATH))
            {
                if ((DateTime.Now - _lastZDriveWarnTime).TotalMinutes >= 1)
                {
                    Console.WriteLine($"[{DateTime.Now:HH:mm:ss}] ⚠️ AI 분석 스킵 — Z 드라이브 없음 ({ZDRIVE_PATH})");
                    _lastZDriveWarnTime = DateTime.Now;
                }
                return;
            }
            try
            {
                var response = await GetWithAuthAsync($"{ERP_API_URL}/api/ai-analysis?status=pending");

                if (!response.IsSuccessStatusCode)
                {
                    // 조용히 실패 (ai-analysis 엔드포인트가 없을 수도 있음)
                    return;
                }

                var result = await response.Content.ReadFromJsonAsync<JsonElement>();

                if (!result.TryGetProperty("data", out var dataElement))
                    return;

                var requestCount = dataElement.GetArrayLength();
                if (requestCount == 0)
                    return;

                Console.WriteLine($"[{DateTime.Now:HH:mm:ss}] Found {requestCount} pending AI analysis request(s)");

                foreach (var req in dataElement.EnumerateArray())
                {
                    int reqId = req.GetProperty("id").GetInt32();
                    string filePath = req.GetProperty("file_path").GetString() ?? "";

                    if (processedAnalyses.Contains(reqId))
                        continue;

                    Console.WriteLine($"\n🎨 AI Analysis Request #{reqId}: {filePath}");
                    await ProcessAIAnalysisAsync(reqId, filePath);
                    processedAnalyses.Add(reqId);
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[{DateTime.Now:HH:mm:ss}] AI analysis polling error: {ex.Message}");
            }
        }

        private static async Task ProcessAIAnalysisAsync(int requestId, string filePath)
        {
            // processing 상태로 업데이트
            await PatchAnalysisStatus(requestId, "processing", null, null, null);

            try
            {
                // 임시 출력 폴더 생성 (먼저 생성해야 파일 저장 가능)
                string reqTempFolder = Path.Combine(TEMP_FOLDER, $"req_{requestId}");
                if (!Directory.Exists(reqTempFolder))
                    Directory.CreateDirectory(reqTempFolder);

                // 파일 경로 결정: 로컬 파일 → R2 다운로드 → 청크 조립 순서
                string actualFilePath = filePath;
                if (File.Exists(filePath))
                {
                    // 로컬 경로 직접 사용 (같은 PC 시나리오)
                    Console.WriteLine($"   📂 로컬 파일 직접 사용: {filePath}");
                }
                else if (filePath.StartsWith("r2://"))
                {
                    // R2 파일 다운로드
                    Console.WriteLine($"   ☁️  R2 파일 다운로드: {ERP_API_URL}/api/ai-analysis/{requestId}/download");
                    var r2Res = await httpClient.GetAsync($"{ERP_API_URL}/api/ai-analysis/{requestId}/download");
                    if (r2Res.IsSuccessStatusCode)
                    {
                        string ext = Path.GetExtension(filePath.Replace("r2://", ""));
                        if (string.IsNullOrEmpty(ext)) ext = ".ai";
                        string tempPath = Path.Combine(reqTempFolder, $"source{ext}");
                        var fileBytes = await r2Res.Content.ReadAsByteArrayAsync();
                        File.WriteAllBytes(tempPath, fileBytes);
                        actualFilePath = tempPath;
                        Console.WriteLine($"   📄 R2 → 임시 파일: {tempPath} ({fileBytes.Length / 1024}KB)");
                    }
                    else
                    {
                        Console.WriteLine($"   ❌ R2 다운로드 실패: {(int)r2Res.StatusCode}");
                    }
                }
                else
                {
                    // 청크 조립 시도 (레거시)
                    Console.WriteLine($"   🌐 청크 조립 시도: {ERP_API_URL}/api/ai-analysis/{requestId}/chunks");
                    var chunksRes = await httpClient.GetAsync($"{ERP_API_URL}/api/ai-analysis/{requestId}/chunks");
                    if (chunksRes.IsSuccessStatusCode)
                    {
                        var chunksData = await chunksRes.Content.ReadFromJsonAsync<JsonElement>();
                        if (chunksData.TryGetProperty("data", out var chunksEl) && chunksEl.GetArrayLength() > 0)
                        {
                            var sb = new System.Text.StringBuilder();
                            foreach (var chunk in chunksEl.EnumerateArray()
                                .OrderBy(ch => ch.GetProperty("chunk_index").GetInt32()))
                            {
                                sb.Append(chunk.GetProperty("chunk_data").GetString());
                            }
                            string ext = Path.GetExtension(filePath);
                            if (string.IsNullOrEmpty(ext)) ext = ".ai";
                            string tempAiPath = Path.Combine(reqTempFolder, $"source{ext}");
                            byte[] fileBytes = Convert.FromBase64String(sb.ToString());
                            File.WriteAllBytes(tempAiPath, fileBytes);
                            actualFilePath = tempAiPath;
                            Console.WriteLine($"   📄 청크 조립: {tempAiPath} ({fileBytes.Length / 1024}KB)");
                        }
                    }
                }

                // 파일 존재 확인
                if (!File.Exists(actualFilePath))
                {
                    var errMsg = $"파일을 찾을 수 없음: {actualFilePath}";
                    Console.WriteLine($"   ❌ {errMsg}");
                    await PatchAnalysisStatus(requestId, "error", null, errMsg, null);
                    return;
                }

                // Illustrator 경로 확인
                var illustratorPath = FindIllustratorPath();
                if (string.IsNullOrEmpty(illustratorPath))
                {
                    var errMsg = "Adobe Illustrator를 찾을 수 없습니다.";
                    Console.WriteLine($"   ❌ {errMsg}");
                    await PatchAnalysisStatus(requestId, "error", null, errMsg, null);
                    return;
                }

                // ExtractGroups.jsx 경로
                string scriptPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "ExtractGroups.jsx");
                if (!File.Exists(scriptPath))
                {
                    var errMsg = $"ExtractGroups.jsx 없음: {scriptPath}";
                    Console.WriteLine($"   ❌ {errMsg}");
                    await PatchAnalysisStatus(requestId, "error", null, errMsg, null);
                    return;
                }

                // ── EPS %%BoundingBox 파싱 (JSX에 힌트로 전달) ──────────────
                double? epsBbWidthMm = null, epsBbHeightMm = null;
                string fileExt = Path.GetExtension(actualFilePath).ToLower();
                if (fileExt == ".eps")
                {
                    try
                    {
                        using var stream = File.OpenRead(actualFilePath);
                        using var reader = new StreamReader(stream, System.Text.Encoding.ASCII);
                        string? bbLine = null;
                        for (int lineNum = 0; lineNum < 100; lineNum++)
                        {
                            var line = reader.ReadLine();
                            if (line == null) break;
                            if (line.StartsWith("%%HiResBoundingBox:"))
                            {
                                bbLine = line; // 고해상도 우선
                                break;
                            }
                            if (line.StartsWith("%%BoundingBox:") && !line.Contains("atend"))
                            {
                                bbLine = line; // 일반 BB (HiRes 없을 때 사용)
                            }
                        }
                        if (bbLine != null)
                        {
                            var parts = bbLine.Split(new[] { ' ', '\t' }, StringSplitOptions.RemoveEmptyEntries);
                            // %%BoundingBox: llx lly urx ury  또는  %%HiResBoundingBox: ...
                            if (parts.Length >= 5)
                            {
                                double llx = double.Parse(parts[parts.Length - 4], System.Globalization.CultureInfo.InvariantCulture);
                                double lly = double.Parse(parts[parts.Length - 3], System.Globalization.CultureInfo.InvariantCulture);
                                double urx = double.Parse(parts[parts.Length - 2], System.Globalization.CultureInfo.InvariantCulture);
                                double ury = double.Parse(parts[parts.Length - 1], System.Globalization.CultureInfo.InvariantCulture);
                                const double mmPerPt = 25.4 / 72.0; // 1pt = 0.3528mm
                                epsBbWidthMm = (urx - llx) * mmPerPt;
                                epsBbHeightMm = (ury - lly) * mmPerPt;
                                Console.WriteLine($"   📐 EPS BoundingBox: {Math.Round(epsBbWidthMm.Value)}x{Math.Round(epsBbHeightMm.Value)}mm");
                            }
                        }
                    }
                    catch (Exception exBb)
                    {
                        Console.WriteLine($"   ⚠️ EPS BB 파싱 실패 (무시): {exBb.Message}");
                    }
                }

                // 파라미터를 ia_params.json에 기록 ($.getenv() 대신 파일 기반 전달)
                string reqIdStr = $"req{requestId}";
                string scriptDir = Path.GetDirectoryName(scriptPath)!;
                string iaParamsJson = System.Text.Json.JsonSerializer.Serialize(new
                {
                    source        = actualFilePath,
                    output        = reqTempFolder,
                    reqId         = reqIdStr,
                    thumbSize     = 1200,
                    eps_width_mm  = epsBbWidthMm,
                    eps_height_mm = epsBbHeightMm
                });
                File.WriteAllText(Path.Combine(scriptDir, "ia_params.json"), iaParamsJson, System.Text.Encoding.UTF8);

                Console.WriteLine($"   🖥️  Running Illustrator: ExtractGroups.jsx (COM)");
                Console.WriteLine($"   📁 Output: {reqTempFolder}");

                string paramsPath1 = Path.Combine(scriptDir, "ia_params.json");
                RunJsxScript(scriptPath, paramsPath1, timeoutMinutes: 2);

                // ia_diag.log를 output 폴더 → publish 폴더로 복사
                // (Illustrator ExtendScript는 네트워크 드라이브에 직접 쓰기 불가할 수 있음)
                try
                {
                    string diagSrc = Path.Combine(reqTempFolder, "ia_diag.log");
                    string diagDst = Path.Combine(scriptDir, "ia_diag.log");
                    if (File.Exists(diagSrc))
                        File.Copy(diagSrc, diagDst, true);
                }
                catch { /* 진단 로그 복사 실패는 무시 */ }

                // JSON 결과 파일 읽기
                string jsonFilePath = Path.Combine(reqTempFolder, $"{reqIdStr}-groups.json");
                if (!File.Exists(jsonFilePath))
                {
                    // error.log 확인 (출력 폴더 우선, 스크립트 폴더 폴백)
                    string logPath1 = Path.Combine(reqTempFolder, "error.log");
                    string logPath2 = Path.Combine(scriptDir, "ia_error.log");
                    string errDetail = File.Exists(logPath1)
                        ? File.ReadAllText(logPath1, System.Text.Encoding.UTF8)
                        : File.Exists(logPath2)
                            ? File.ReadAllText(logPath2, System.Text.Encoding.UTF8)
                            : "JSX 내부 오류 로그 없음";
                    var errMsg = $"그룹 추출 실패: {errDetail}";
                    Console.WriteLine($"   ❌ {errMsg}");
                    await PatchAnalysisStatus(requestId, "error", null, errMsg, null);
                    return;
                }

                string jsonText = File.ReadAllText(jsonFilePath, System.Text.Encoding.UTF8);
                var groupsDoc = JsonSerializer.Deserialize<JsonElement>(jsonText);

                // 각 그룹의 PNG를 base64로 변환하여 groups_json에 포함
                var groupsWithThumbs = new List<Dictionary<string, object>>();

                foreach (var group in groupsDoc.EnumerateArray())
                {
                    var groupDict = new Dictionary<string, object>();
                    groupDict["index"] = group.GetProperty("index").GetInt32();
                    groupDict["name"] = group.GetProperty("name").GetString() ?? "";
                    groupDict["width_mm"] = group.GetProperty("width_mm").GetInt32();
                    groupDict["height_mm"] = group.GetProperty("height_mm").GetInt32();

                    // v3.2 메타데이터 (JSX에서 추가, 없으면 기본값)
                    if (group.TryGetProperty("item_count", out var ic)) groupDict["item_count"] = ic.GetInt32();
                    if (group.TryGetProperty("has_image", out var hi)) groupDict["has_image"] = hi.GetBoolean();
                    if (group.TryGetProperty("has_group", out var hg)) groupDict["has_group"] = hg.GetBoolean();
                    if (group.TryGetProperty("item_types", out var it)) groupDict["item_types"] = it.GetString() ?? "";

                    // PNG 파일을 base64로 읽기
                    string thumbFile = group.GetProperty("thumbnail_file").GetString() ?? "";
                    string thumbPath = Path.Combine(reqTempFolder, thumbFile);

                    if (File.Exists(thumbPath))
                    {
                        byte[] pngBytes = File.ReadAllBytes(thumbPath);
                        groupDict["thumbnail_base64"] = Convert.ToBase64String(pngBytes);
                        Console.WriteLine($"   📸 Group {groupDict["index"]}: {thumbFile} ({pngBytes.Length / 1024}KB)");
                    }
                    else
                    {
                        groupDict["thumbnail_base64"] = "";
                        Console.WriteLine($"   ⚠️  PNG not found: {thumbPath}");
                    }

                    groupsWithThumbs.Add(groupDict);
                }

                string groupsJson = JsonSerializer.Serialize(groupsWithThumbs);
                Console.WriteLine($"   ✅ {groupsWithThumbs.Count}개 그룹 추출 완료");

                // ── OpenCV 검증 (Option B: 검증 모드) ─────────────────────────────
                // canvas.json이 있으면 OpenCV로 바운드 재추출하여 JSX 결과와 비교
                string canvasJsonPath = Path.Combine(reqTempFolder, $"{reqIdStr}-canvas.json");
                if (File.Exists(canvasJsonPath))
                {
                    try
                    {
                        var canvasInfo = JsonSerializer.Deserialize<JsonElement>(
                            File.ReadAllText(canvasJsonPath, System.Text.Encoding.UTF8));
                        string canvasPngFile = canvasInfo.GetProperty("canvas_file").GetString() ?? "";
                        string canvasPngPath = Path.Combine(reqTempFolder, canvasPngFile);

                        if (File.Exists(canvasPngPath))
                        {
                            double leftPt   = canvasInfo.GetProperty("left_pt").GetDouble();
                            double topPt    = canvasInfo.GetProperty("top_pt").GetDouble();
                            double rightPt  = canvasInfo.GetProperty("right_pt").GetDouble();
                            double bottomPt = canvasInfo.GetProperty("bottom_pt").GetDouble();

                            var ocvResults = BoundsExtractor.Extract(
                                canvasPngPath, leftPt, topPt, rightPt, bottomPt,
                                debugOutputDir: reqTempFolder);

                            Console.WriteLine($"   🔬 [OpenCV] {ocvResults.Count}개 디자인 검출 / JSX: {groupsWithThumbs.Count}개");

                            // 디자인 수 일치 여부 확인
                            if (ocvResults.Count != groupsWithThumbs.Count)
                            {
                                Console.WriteLine($"   ⚠️ [OpenCV] 디자인 수 불일치 → JSX 결과 유지 (검증 모드)");
                            }
                            else
                            {
                                // 각 디자인의 크기 비교
                                const double PT_PER_MM = 2.834645669;
                                for (int gi = 0; gi < ocvResults.Count && gi < groupsWithThumbs.Count; gi++)
                                {
                                    double jsxW = (int)groupsWithThumbs[gi]["width_mm"]  * PT_PER_MM;
                                    double jsxH = (int)groupsWithThumbs[gi]["height_mm"] * PT_PER_MM;
                                    double diff = BoundsExtractor.CompareWithJsx(ocvResults[gi], jsxW, jsxH);
                                    double diffPct = diff * 100;

                                    if (diffPct > 10)
                                        Console.WriteLine($"   ⚠️ [OpenCV] design[{gi}] JSX vs OpenCV 불일치 {diffPct:F1}% → JSX 유지 (검증 모드)");
                                    else
                                        Console.WriteLine($"   ✅ [OpenCV] design[{gi}] 일치 (diff={diffPct:F1}%)");
                                }
                            }
                        }
                    }
                    catch (Exception ocvEx)
                    {
                        Console.WriteLine($"   ⚠️ [OpenCV] 검증 실패 (JSX 결과 유지): {ocvEx.Message}");
                    }
                }

                // ── 엣지 색상 추출 (스마트 도련) ─────────────────────────────
                try
                {
                    var edgeColors = EdgeColorExtractor.Extract(reqTempFolder, reqIdStr, groupsWithThumbs.Count);
                    // 엣지 색상을 각 그룹 데이터에 병합
                    for (int ei = 0; ei < edgeColors.Count && ei < groupsWithThumbs.Count; ei++)
                    {
                        var ec = edgeColors[ei];
                        groupsWithThumbs[ei]["edge_colors"] = new Dictionary<string, int[]>
                        {
                            ["top"] = ec.Top, ["bottom"] = ec.Bottom,
                            ["left"] = ec.Left, ["right"] = ec.Right
                        };
                    }
                    groupsJson = JsonSerializer.Serialize(groupsWithThumbs);
                }
                catch (Exception ecEx)
                {
                    Console.WriteLine($"   ⚠️ [EdgeColor] 추출 실패 (도련 기본값 사용): {ecEx.Message}");
                }

                // 결과 업데이트 + file_path를 actualFilePath(temp 경로)로 업데이트
                // 임시 파일은 주문 처리 시 ProcessOrderItem.jsx가 사용하므로 삭제하지 않음
                Console.WriteLine($"   📁 임시 파일 보관: {actualFilePath}");
                await PatchAnalysisStatus(requestId, "done", groupsJson, null, actualFilePath);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"   ❌ AI Analysis error: {ex.Message}");
                await PatchAnalysisStatus(requestId, "error", null, ex.Message, null);
            }
        }

        private static async Task PatchAnalysisStatus(int requestId, string status, string? groupsJson, string? errorMessage, string? filePath)
        {
            try
            {
                var payload = new Dictionary<string, object?>
                {
                    ["status"] = status,
                    ["groups_json"] = groupsJson,
                    ["error_message"] = errorMessage,
                    ["file_path"] = filePath
                };
                await PatchWithAuthAsync(
                    $"{ERP_API_URL}/api/ai-analysis/{requestId}",
                    JsonSerializer.Serialize(payload));
            }
            catch (Exception ex)
            {
                Console.WriteLine($"   ⚠️  PATCH ai-analysis error: {ex.Message}");
            }
        }

        // ── 신규: AI 레이아웃 요청 폴링 ─────────────────────────────────
        private static async Task PollAILayoutAsync()
        {
            if (!Directory.Exists(ZDRIVE_PATH))
                return; // PollAIAnalysisAsync에서 이미 경고 출력
            try
            {
                var response = await GetWithAuthAsync($"{ERP_API_URL}/api/ai-layout?status=pending");
                if (!response.IsSuccessStatusCode)
                    return;

                var result = await response.Content.ReadFromJsonAsync<JsonElement>();
                if (!result.TryGetProperty("data", out var dataElement))
                    return;

                var count = dataElement.GetArrayLength();
                if (count == 0) return;

                Console.WriteLine($"[{DateTime.Now:HH:mm:ss}] Found {count} pending layout request(s)");

                foreach (var req in dataElement.EnumerateArray())
                {
                    int reqId = req.GetProperty("id").GetInt32();
                    if (processedLayouts.Contains(reqId)) continue;

                    string mode = req.GetProperty("mode").GetString() ?? "individual";
                    string filePath = req.GetProperty("file_path").GetString() ?? "";
                    string groupsJson = req.GetProperty("groups_json").GetString() ?? "[]";

                    Console.WriteLine($"\n🎨 Layout Request #{reqId} [{mode}]: {filePath}");
                    await ProcessLayoutJobAsync(reqId, mode, filePath, groupsJson);
                    processedLayouts.Add(reqId);
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[{DateTime.Now:HH:mm:ss}] Layout polling error: {ex.Message}");
            }
        }

        private static async Task ProcessLayoutJobAsync(int layoutId, string mode, string filePath, string groupsJson)
        {
            await PatchLayoutStatus(layoutId, "processing", null, null);

            try
            {
                // 파일 경로 확인 (청크 조립 필요 여부)
                string actualFilePath = filePath;
                if (!File.Exists(filePath))
                {
                    // ai_analysis_requests에서 analysis_id를 통해 청크 조립 시도는 복잡하므로
                    // 파일이 없으면 오류 처리
                    await PatchLayoutStatus(layoutId, "error", null, $"소스 파일 없음: {filePath}");
                    return;
                }

                // Illustrator 경로 확인
                var illustratorPath = FindIllustratorPath();
                if (string.IsNullOrEmpty(illustratorPath))
                {
                    await PatchLayoutStatus(layoutId, "error", null, "Adobe Illustrator를 찾을 수 없습니다.");
                    return;
                }

                // PackGroups.jsx 경로
                string scriptPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "PackGroups.jsx");
                if (!File.Exists(scriptPath))
                {
                    await PatchLayoutStatus(layoutId, "error", null, $"PackGroups.jsx 없음: {scriptPath}");
                    return;
                }

                // 출력 폴더 생성
                string layoutFolder = Path.Combine(TEMP_FOLDER, $"layout_{layoutId}");
                Directory.CreateDirectory(layoutFolder);

                string output1Path = Path.Combine(layoutFolder, $"layout_{layoutId}_1.eps");
                string output2Path = Path.Combine(layoutFolder, $"layout_{layoutId}_2.eps");
                string thumbPath   = Path.Combine(layoutFolder, $"layout_{layoutId}_thumb.png");
                string resultJsonPath = Path.Combine(layoutFolder, $"layout_{layoutId}_result.json");

                // 그룹 인덱스 추출 (전체 그룹 인덱스 목록)
                var groupIndices = new List<int>();
                try
                {
                    using var doc = JsonDocument.Parse(groupsJson);
                    foreach (var g in doc.RootElement.EnumerateArray())
                    {
                        if (g.TryGetProperty("index", out var idxEl))
                            groupIndices.Add(idxEl.GetInt32());
                    }
                }
                catch { groupIndices.Add(-1); } // 파싱 실패 시 전체 처리

                Console.WriteLine($"   Mode: {mode}, Groups: [{string.Join(",", groupIndices)}]");
                Console.WriteLine($"   Output1: {output1Path}");
                Console.WriteLine($"   Output2: {output2Path}");

                // 파라미터를 ia_params.json에 기록 ($.getenv() 대신 파일 기반 전달)
                string scriptDir2 = Path.GetDirectoryName(scriptPath)!;
                string layoutParamsJson = System.Text.Json.JsonSerializer.Serialize(new
                {
                    source       = actualFilePath,
                    mode         = mode,
                    groupIndices = JsonSerializer.Serialize(groupIndices),
                    widths       = "[105,127,152]",
                    output1      = output1Path,
                    output2      = output2Path,
                    outputThumb  = thumbPath,
                    resultJson   = resultJsonPath,
                    thumbSize    = 300
                });
                File.WriteAllText(Path.Combine(scriptDir2, "ia_params.json"), layoutParamsJson, System.Text.Encoding.UTF8);

                Console.WriteLine($"   🖥️  Running Illustrator: PackGroups.jsx (COM)");
                string paramsPath2 = Path.Combine(scriptDir2, "ia_params.json");
                RunJsxScript(scriptPath, paramsPath2, timeoutMinutes: 5);

                // 결과 JSON 읽기
                if (!File.Exists(resultJsonPath))
                {
                    string logPath2a = Path.Combine(layoutFolder, "error.log");
                    string logPath2b = Path.Combine(scriptDir2, "ia_error.log");
                    string errDetail2 = File.Exists(logPath2a)
                        ? File.ReadAllText(logPath2a, System.Text.Encoding.UTF8)
                        : File.Exists(logPath2b)
                            ? File.ReadAllText(logPath2b, System.Text.Encoding.UTF8)
                            : "JSX 내부 오류 로그 없음";
                    await PatchLayoutStatus(layoutId, "error", null, $"PackGroups.jsx 실패: {errDetail2}");
                    return;
                }

                string resultText = File.ReadAllText(resultJsonPath, System.Text.Encoding.UTF8);
                using var resultDoc = JsonDocument.Parse(resultText);

                // 썸네일 base64 추가
                var resultDict = new Dictionary<string, object?>();
                foreach (var prop in resultDoc.RootElement.EnumerateObject())
                    resultDict[prop.Name] = prop.Value;

                if (File.Exists(thumbPath))
                {
                    byte[] thumbBytes = File.ReadAllBytes(thumbPath);
                    resultDict["thumbnail_base64"] = Convert.ToBase64String(thumbBytes);
                    Console.WriteLine($"   📸 썸네일: {thumbBytes.Length / 1024}KB");
                }
                else
                {
                    resultDict["thumbnail_base64"] = "";
                }

                // output 경로 포함
                resultDict["output_1_path"] = output1Path;
                resultDict["output_2_path"] = output2Path;

                string finalResultJson = JsonSerializer.Serialize(resultDict);
                Console.WriteLine($"   ✅ 레이아웃 완료");

                await PatchLayoutStatus(layoutId, "done", finalResultJson, null);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"   ❌ Layout error: {ex.Message}");
                await PatchLayoutStatus(layoutId, "error", null, ex.Message);
            }
        }

        private static async Task PatchLayoutStatus(int layoutId, string status, string? resultJson, string? errorMessage)
        {
            try
            {
                var payload = new Dictionary<string, object?>
                {
                    ["status"]        = status,
                    ["result_json"]   = resultJson,
                    ["error_message"] = errorMessage
                };
                await PatchWithAuthAsync(
                    $"{ERP_API_URL}/api/ai-layout/{layoutId}",
                    JsonSerializer.Serialize(payload));
            }
            catch (Exception ex)
            {
                Console.WriteLine($"   ⚠️  PATCH ai-layout error: {ex.Message}");
            }
        }

        // ── 주문 처리 ────────────────────────────────────────────────────
        private static async Task ProcessOrderAsync(JsonElement order)
        {
            try
            {
                int orderId = order.TryGetProperty("id", out var idEl) ? idEl.GetInt32() : 0;
                string orderNumber = order.GetProperty("order_number").GetString() ?? "";
                string clientName  = (order.TryGetProperty("client_name", out var cnEl) && cnEl.ValueKind != JsonValueKind.Null)
                    ? cnEl.GetString() ?? "고객" : "고객";

                // AI 파일 경로 확인
                string? aiFilePath = null;
                if (order.TryGetProperty("ai_file_path", out var afEl) && afEl.ValueKind != JsonValueKind.Null)
                    aiFilePath = afEl.GetString();

                // 레이아웃 ID 확인 (묶음 모드)
                int? layoutId = null;
                if (order.TryGetProperty("layout_id", out var lidEl) && lidEl.ValueKind != JsonValueKind.Null)
                {
                    if (lidEl.TryGetInt32(out int lid))
                        layoutId = lid;
                }

                Console.WriteLine($"   Client: {clientName}");
                Console.WriteLine($"   AI File: {aiFilePath ?? "(없음)"}");
                Console.WriteLine($"   Layout ID: {(layoutId.HasValue ? layoutId.ToString() : "(없음)")}");

                if (!order.TryGetProperty("items", out var itemsElement))
                {
                    Console.WriteLine($"   ⚠️  품목 없음");
                    return;
                }

                int itemCount = itemsElement.GetArrayLength();
                Console.WriteLine($"   Items: {itemCount}개");

                // ── 시트 배치 모드: sheet_layout_params가 있으면 SheetLayout.jsx 실행 ──
                string? sheetLayoutParams = null;
                if (order.TryGetProperty("sheet_layout_params", out var slpEl) && slpEl.ValueKind != JsonValueKind.Null)
                    sheetLayoutParams = slpEl.GetString();

                if (!string.IsNullOrEmpty(sheetLayoutParams) && !string.IsNullOrEmpty(aiFilePath))
                {
                    Console.WriteLine($"   📐 시트 배치 모드 감지 → SheetLayout.jsx 실행");
                    string scriptPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "SheetLayout.jsx");
                    if (!File.Exists(scriptPath))
                    {
                        Console.WriteLine($"      ❌ SheetLayout.jsx 없음: {scriptPath}");
                    }
                    else
                    {
                        var slParams = System.Text.Json.JsonSerializer.Deserialize<JsonElement>(sheetLayoutParams);

                        // ── Z드라이브 올바른 경로 구성 ──
                        // 부모 품목의 카테고리에서 대분류 추출
                        string slCategory = "기타";
                        if (itemsElement.GetArrayLength() > 0)
                        {
                            foreach (var slIt in itemsElement.EnumerateArray())
                            {
                                // parent_item_id가 없는 행 = 부모 행
                                if (!slIt.TryGetProperty("parent_item_id", out var slPid) || slPid.ValueKind == JsonValueKind.Null)
                                {
                                    if (slIt.TryGetProperty("category_name", out var slCatEl) && slCatEl.ValueKind != JsonValueKind.Null)
                                    {
                                        slCategory = SanitizeFilename(slCatEl.GetString() ?? "기타");
                                        if (string.IsNullOrWhiteSpace(slCategory)) slCategory = "기타";
                                    }
                                    break;
                                }
                            }
                        }

                        string slYear  = orderNumber.Length >= 8 ? orderNumber.Substring(0, 4) : DateTime.Now.Year.ToString();
                        string slMonth = orderNumber.Length >= 8 ? orderNumber.Substring(4, 2) : DateTime.Now.Month.ToString("D2");
                        string slDay   = orderNumber.Length >= 8 ? orderNumber.Substring(6, 2) : DateTime.Now.Day.ToString("D2");

                        string orderFolder = Path.Combine(ZDRIVE_PATH, "DESIGN", slCategory, slYear, slMonth, slDay, orderNumber);
                        Directory.CreateDirectory(orderFolder);

                        // scale_factor: 파일이 1/N 비율이면 좌표도 1/N로 축소
                        var scaleFactor = slParams.TryGetProperty("scale_factor", out var sfEl) ? sfEl.GetDouble() : 1;
                        if (scaleFactor < 1) scaleFactor = 1;

                        var rollW = slParams.TryGetProperty("roll_width_cm", out var rwEl) ? rwEl.GetDouble() : 127;
                        var totalH = slParams.TryGetProperty("total_height_cm", out var thEl) ? thEl.GetDouble() : 50;
                        int placementCount = slParams.TryGetProperty("placements", out var plCntEl) ? plCntEl.GetArrayLength() : 0;

                        // 파일명: {주문번호}-001-{거래처}-{롤폭}x{총길이}-시트배치{건수}건-1EA
                        string wStr = ((int)Math.Round(rollW)).ToString();
                        string hStr = ((int)Math.Round(totalH)).ToString();
                        string sheetBaseName = $"{orderNumber}-001-{SanitizeFilename(clientName)}-{wStr}x{hStr}-시트배치{placementCount}건-1EA";
                        var marginVal = slParams.TryGetProperty("margin_cm", out var mcEl) ? mcEl.GetDouble() : 1.5;

                        // placements 좌표 축소 (Illustrator 문서 크기 한계 대응)
                        var scaledPlacements = new List<object>();
                        if (slParams.TryGetProperty("placements", out var plEl))
                        {
                            foreach (var p in plEl.EnumerateArray())
                            {
                                // bleed 필드 전달 (프론트엔드에서 cm 단위로 설정됨 → scaleFactor로 나눔)
                                object? bleedObj = null;
                                // bleed: 프론트엔드 값은 실제 출력 cm → scaleFactor로 나눠서 파일 스케일에 맞춤
                                if (p.TryGetProperty("bleed", out var blEl) && blEl.ValueKind == JsonValueKind.Object)
                                {
                                    bleedObj = new
                                    {
                                        top    = blEl.TryGetProperty("top",    out var btEl) ? btEl.GetDouble() / scaleFactor : 0,
                                        bottom = blEl.TryGetProperty("bottom", out var bbEl) ? bbEl.GetDouble() / scaleFactor : 0,
                                        left   = blEl.TryGetProperty("left",   out var blLEl) ? blLEl.GetDouble() / scaleFactor : 0,
                                        right  = blEl.TryGetProperty("right",  out var brEl) ? brEl.GetDouble() / scaleFactor : 0,
                                    };
                                }

                                scaledPlacements.Add(new
                                {
                                    group_index = p.GetProperty("group_index").GetInt32(),
                                    x_cm = p.GetProperty("x_cm").GetDouble() / scaleFactor,
                                    y_cm = p.GetProperty("y_cm").GetDouble() / scaleFactor,
                                    width_cm = p.GetProperty("width_cm").GetDouble() / scaleFactor,
                                    height_cm = p.GetProperty("height_cm").GetDouble() / scaleFactor,
                                    rotated = p.TryGetProperty("rotated", out var rEl) && rEl.GetBoolean(),
                                    bleed = bleedObj,
                                });
                            }
                        }

                        // gaps 읽기
                        var gapsList = new List<object>();
                        if (slParams.TryGetProperty("gaps", out var gapsEl) && gapsEl.ValueKind == System.Text.Json.JsonValueKind.Array)
                        {
                            foreach (var g in gapsEl.EnumerateArray())
                            {
                                gapsList.Add(new
                                {
                                    placement_a = g.GetProperty("placement_a").GetInt32(),
                                    placement_b = g.GetProperty("placement_b").GetInt32(),
                                    side = g.GetProperty("side").GetString(),
                                    gap_mm = g.TryGetProperty("gap_mm", out var gmEl) ? gmEl.GetDouble() : 3.0
                                });
                            }
                        }

                        double sheetBleedMm = slParams.TryGetProperty("bleed_mm", out var sbmEl) ? sbmEl.GetDouble() : 3.0;

                        // edge_colors 추출: sheet_layout_params 또는 analysis groups에서
                        var edgeColorsList = new List<object>();
                        if (slParams.TryGetProperty("edge_colors", out var ecArrayEl) && ecArrayEl.ValueKind == JsonValueKind.Array)
                        {
                            foreach (var ecItem in ecArrayEl.EnumerateArray())
                                edgeColorsList.Add(ecItem);
                        }

                        // ia_params 구성 (파일 스케일 기준, 올바른 Z드라이브 경로)
                        var iaParamsObj = new
                        {
                            mode = "sheet_layout",
                            source = aiFilePath,
                            scale_factor = scaleFactor,
                            canvas = new
                            {
                                width_cm = rollW / scaleFactor,
                                height_cm = totalH / scaleFactor,
                                margin_cm = marginVal / scaleFactor,
                            },
                            placements = scaledPlacements,
                            bleed_mm = sheetBleedMm,
                            gaps = gapsList,
                            edge_colors = edgeColorsList,
                            outputs = new
                            {
                                eps = Path.Combine(orderFolder, sheetBaseName + ".eps"),
                                dxf = Path.Combine(orderFolder, sheetBaseName + ".dxf"),
                                jpg = Path.Combine(orderFolder, sheetBaseName + ".jpg"),
                            }
                        };

                        string scriptDir = Path.GetDirectoryName(scriptPath)!;
                        string iaParamsJson = System.Text.Json.JsonSerializer.Serialize(iaParamsObj);
                        File.WriteAllText(Path.Combine(scriptDir, "ia_params.json"), iaParamsJson, System.Text.Encoding.UTF8);

                        Console.WriteLine($"      🖥️  Running Illustrator: SheetLayout.jsx");
                        Console.WriteLine($"      📁 Output: {orderFolder}");
                        string paramsPath = Path.Combine(scriptDir, "ia_params.json");
                        RunJsxScript(scriptPath, paramsPath, timeoutMinutes: 5);

                        // 결과 JSON 검증 경고 체크
                        try
                        {
                            string resultJsonPath = Path.Combine(orderFolder, "sheet_layout_result.json");
                            if (File.Exists(resultJsonPath))
                            {
                                var resultDoc = JsonDocument.Parse(File.ReadAllText(resultJsonPath));
                                if (resultDoc.RootElement.TryGetProperty("verify_warnings", out var vwEl))
                                {
                                    string warnings = vwEl.GetString() ?? "";
                                    if (!string.IsNullOrEmpty(warnings))
                                        Console.WriteLine($"      ⚠️  SheetLayout 검증 경고: {warnings}");
                                }
                            }
                        }
                        catch { /* 검증 JSON 파싱 실패 무시 */ }

                        // 결과 확인 + MES에 저장 경로 기록
                        if (File.Exists(iaParamsObj.outputs.eps))
                        {
                            Console.WriteLine($"      ✅ EPS: {iaParamsObj.outputs.eps}");

                            // MES API로 주문에 output_folder 기록
                            try
                            {
                                var folderPatchReq = new HttpRequestMessage(HttpMethod.Patch,
                                    $"{ERP_API_URL}/api/orders/{orderId}/output-folder");
                                folderPatchReq.Content = new StringContent(
                                    System.Text.Json.JsonSerializer.Serialize(new { output_folder = orderFolder }),
                                    System.Text.Encoding.UTF8, "application/json");
                                folderPatchReq.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", authToken);
                                await httpClient.SendAsync(folderPatchReq);
                                Console.WriteLine($"      📋 output_folder 기록: {orderFolder}");
                            }
                            catch (Exception ex)
                            {
                                Console.WriteLine($"      ⚠️  output_folder 기록 실패: {ex.Message}");
                            }
                        }
                        else
                            Console.WriteLine($"      ⚠️ EPS 생성 안됨");

                        if (File.Exists(iaParamsObj.outputs.dxf))
                            Console.WriteLine($"      ✅ DXF: {iaParamsObj.outputs.dxf}");

                        if (File.Exists(iaParamsObj.outputs.jpg))
                            Console.WriteLine($"      ✅ JPG: {iaParamsObj.outputs.jpg}");
                    }

                    Console.WriteLine($"   ✅ 시트 배치 처리 완료");
                }

                bool hasLayout = layoutId.HasValue;
                bool hasAiFile = !string.IsNullOrEmpty(aiFilePath) && File.Exists(aiFilePath);

                if (hasLayout || hasAiFile)
                {
                    // 묶음 모드(layout_id 있음): AI 파일 없어도 처리 (이미 생성된 EPS 복사)
                    // 개별 모드(aiFilePath 있음): ProcessOrderItem.jsx 실행
                    var tempFoldersToDelete = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

                    // ── 묶음 부모-자식 구조 파악 ──────────────────────────────────────
                    int fileSeqCounter = 0;

                    var allItems = itemsElement.EnumerateArray().ToList();
                    var bundleParentIds = new HashSet<int>();
                    var itemById = new Dictionary<int, JsonElement>();

                    // 시트 배치 부모 ID 수집 (시트 배치 자식은 개별 처리 건너뛰기)
                    var sheetLayoutParentIds = new HashSet<int>();
                    if (!string.IsNullOrEmpty(sheetLayoutParams))
                    {
                        foreach (var it in allItems)
                        {
                            // parent_item_id가 없는 행 = 부모 행 → 시트 배치 부모
                            if (it.TryGetProperty("id", out var slIdEl) && slIdEl.TryGetInt32(out int slIdVal))
                            {
                                if (!it.TryGetProperty("parent_item_id", out var slPidEl) || slPidEl.ValueKind == JsonValueKind.Null)
                                {
                                    // 이 부모의 자식들이 시트 배치 대상인지 확인
                                    bool hasSheetChildren = allItems.Any(c =>
                                        c.TryGetProperty("parent_item_id", out var cpid)
                                        && cpid.ValueKind != JsonValueKind.Null
                                        && cpid.TryGetInt32(out int cpidVal)
                                        && cpidVal == slIdVal);
                                    if (hasSheetChildren) sheetLayoutParentIds.Add(slIdVal);
                                }
                            }
                        }
                        Console.WriteLine($"   📐 시트 배치 부모 ID: [{string.Join(",", sheetLayoutParentIds)}]");
                    }

                    foreach (var it in allItems)
                    {
                        if (it.TryGetProperty("id", out var itIdEl) && itIdEl.TryGetInt32(out int itIdVal))
                            itemById[itIdVal] = it;
                        if (it.TryGetProperty("parent_item_id", out var itPidEl) && itPidEl.ValueKind != JsonValueKind.Null)
                            if (itPidEl.TryGetInt32(out int pidVal)) bundleParentIds.Add(pidVal);
                    }

                    foreach (var item in allItems)
                    {
                        // 부모 행(자식이 있는 행): EPS 생성 불필요 — 자식 행들이 실제 출력
                        int itemId = (item.TryGetProperty("id", out var iiEl) && iiEl.TryGetInt32(out int iiVal)) ? iiVal : -1;
                        if (bundleParentIds.Contains(itemId))
                        {
                            Console.WriteLine($"      ⏭️  묶음 부모 행 (id={itemId}) → 자식 행이 출력 담당, 건너뜀");
                            continue;
                        }

                        // 시트 배치 자식 행: SheetLayout.jsx에서 이미 처리됨 → 건너뛰기
                        if (sheetLayoutParentIds.Count > 0 && item.TryGetProperty("parent_item_id", out var slCheckPid) && slCheckPid.ValueKind != JsonValueKind.Null)
                        {
                            if (slCheckPid.TryGetInt32(out int slParentId) && sheetLayoutParentIds.Contains(slParentId))
                            {
                                Console.WriteLine($"      ⏭️  시트 배치 자식 (id={itemId}, parent={slParentId}) → SheetLayout에서 처리됨, 건너뜀");
                                continue;
                            }
                        }

                        // 자식 행: 부모 행 정보 조회 (category_name 상속용)
                        JsonElement? parentItemEl = null;
                        if (item.TryGetProperty("parent_item_id", out var pidEl2) && pidEl2.ValueKind != JsonValueKind.Null)
                            if (pidEl2.TryGetInt32(out int parentIdVal) && itemById.TryGetValue(parentIdVal, out var piEl))
                                parentItemEl = piEl;

                        // 품목별 ai_file_path가 있으면 우선 사용, 없으면 주문 수준 ai_file_path로 fallback
                        // (여러 파일을 하나의 주문에 업로드한 경우 각 품목이 올바른 파일을 참조)
                        string itemFilePath = aiFilePath ?? "";
                        if (item.TryGetProperty("ai_file_path", out var itemFpEl)
                            && itemFpEl.ValueKind != JsonValueKind.Null)
                        {
                            string perItemPath = itemFpEl.GetString() ?? "";
                            if (!string.IsNullOrEmpty(perItemPath) && File.Exists(perItemPath))
                                itemFilePath = perItemPath;
                        }

                        // 처리 후 삭제할 temp 폴더 수집
                        if (!string.IsNullOrEmpty(itemFilePath))
                        {
                            string folder = Path.GetDirectoryName(itemFilePath) ?? "";
                            if (!string.IsNullOrEmpty(folder) &&
                                folder.StartsWith(TEMP_FOLDER, StringComparison.OrdinalIgnoreCase))
                                tempFoldersToDelete.Add(folder);
                        }

                        fileSeqCounter++;
                        await ProcessItemAsync(orderNumber, clientName, item, itemFilePath, layoutId, parentItemEl, fileSeqCounter);
                    }

                    // 모든 품목 처리 완료 후 temp 폴더 일괄 정리 (이중 저장 방지)
                    foreach (var reqFolder in tempFoldersToDelete)
                    {
                        if (Directory.Exists(reqFolder))
                        {
                            try
                            {
                                Directory.Delete(reqFolder, recursive: true);
                                Console.WriteLine($"   🗑  Temp 정리 완료: {reqFolder}");
                            }
                            catch (Exception ex)
                            {
                                Console.WriteLine($"   ⚠️  Temp 정리 실패: {ex.Message}");
                            }
                        }
                    }
                }
                else if (!string.IsNullOrEmpty(aiFilePath))
                {
                    Console.WriteLine($"   ⚠️  AI 파일 없음: {aiFilePath}");
                }
                else
                {
                    Console.WriteLine($"   ℹ️  AI 파일 미지정 (PDF 주문 등) — 파일 처리 건너뜀");
                }

                // 주문 상태를 PRINTING으로 업데이트 (EPS 생성 완료, 출력 진행)
                if (orderId > 0)
                    await PatchOrderStatusAsync(orderId, "PRINTING");

                Console.WriteLine($"   Order {orderNumber} → PRINTING");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"   ❌ Error processing order: {ex.Message}");
            }
        }

        private static async Task ProcessItemAsync(string orderNumber, string clientName, JsonElement item, string aiFilePath, int? layoutId = null, JsonElement? parentItem = null, int fileSeq = 1)
        {
            try
            {
                // AI 파일 없는 품목은 처리 건너뜀 (수동 주문 등)
                if (string.IsNullOrEmpty(aiFilePath) || !File.Exists(aiFilePath))
                {
                    Console.WriteLine($"      ⏭️ AI 파일 없음 — 건너뜀");
                    return;
                }

                // 품목 기본 정보
                double width  = (item.TryGetProperty("width",  out var wEl) && wEl.ValueKind != JsonValueKind.Null) ? wEl.GetDouble() : 0;
                double height = (item.TryGetProperty("height", out var hEl) && hEl.ValueKind != JsonValueKind.Null) ? hEl.GetDouble() : 0;
                int    qty    = (item.TryGetProperty("quantity", out var qEl)) ? qEl.GetInt32() : 1;

                string content = "";
                if (item.TryGetProperty("content", out var contEl) && contEl.ValueKind != JsonValueKind.Null)
                    content = contEl.GetString() ?? "";
                if (string.IsNullOrWhiteSpace(content) && item.TryGetProperty("item_name", out var nameEl) && nameEl.ValueKind != JsonValueKind.Null)
                    content = nameEl.GetString() ?? "작업물";
                if (string.IsNullOrWhiteSpace(content)) content = "작업물";

                // AI 그룹 인덱스 (-2 = 묶음 전체, -1 = 전체 문서, 0+ = 특정 그룹)
                int groupIdx = -1;
                if (item.TryGetProperty("ai_group_index", out var giEl) && giEl.ValueKind != JsonValueKind.Null)
                    giEl.TryGetInt32(out groupIdx);

                // post_processing에서 블리드 마진 파싱 (cm 단위)
                // 자식 행은 부모의 post_processing 상속 (묶음 품목 블리드 마진)
                double marginL = 0, marginR = 0, marginT = 0, marginB = 0;
                object? punchingConfig = null;
                object? annotationConfig = null;
                object? offsetConfig = null;
                List<string>? annotationPositions = null;
                var ppSource = item;
                if (parentItem.HasValue && parentItem.Value.ValueKind == JsonValueKind.Object)
                {
                    bool hasOwnPP = item.TryGetProperty("post_processing", out var _checkPP)
                                    && _checkPP.ValueKind == JsonValueKind.String
                                    && !string.IsNullOrEmpty(_checkPP.GetString());
                    if (!hasOwnPP) ppSource = parentItem.Value;
                }
                if (ppSource.TryGetProperty("post_processing", out var ppEl) && ppEl.ValueKind == JsonValueKind.String)
                {
                    var ppStr = ppEl.GetString();
                    if (!string.IsNullOrEmpty(ppStr))
                    {
                        try
                        {
                            using var ppDoc = JsonDocument.Parse(ppStr);
                            var ppArr = ppDoc.RootElement;
                            if (ppArr.ValueKind == JsonValueKind.Array && ppArr.GetArrayLength() > 0)
                            {
                                foreach (var ppEntry in ppArr.EnumerateArray())
                                {
                                    // PP 코드 파싱
                                    string ppCode2 = "";
                                    if (ppEntry.TryGetProperty("code", out var codeEl2) && codeEl2.ValueKind == JsonValueKind.String)
                                        ppCode2 = codeEl2.GetString() ?? "";

                                    // FINISH 계열 PP만 블리드 마진에 반영 (PUNCHING/ANNOTATION/OFFSET은 제외)
                                    // PUNCHING: 마크가 디자인 안쪽에 배치되므로 블리드 불필요
                                    // ANNOTATION: 아래에서 별도로 최소 마진 보장
                                    // OFFSET: JSX에서 자체 처리, 아래에서 별도로 최소 마진 보장
                                    if (ppCode2 != "PUNCHING" && ppCode2 != "ANNOTATION" && ppCode2 != "OFFSET")
                                    {
                                        if (ppEntry.TryGetProperty("margin_left",   out var ml2)) marginL = Math.Max(marginL, ml2.GetDouble());
                                        if (ppEntry.TryGetProperty("margin_right",  out var mr2)) marginR = Math.Max(marginR, mr2.GetDouble());
                                        if (ppEntry.TryGetProperty("margin_top",    out var mt2)) marginT = Math.Max(marginT, mt2.GetDouble());
                                        if (ppEntry.TryGetProperty("margin_bottom", out var mb2)) marginB = Math.Max(marginB, mb2.GetDouble());
                                    }

                                    // Check PP code for feature-specific configs
                                    if (ppCode2 == "PUNCHING" && ppEntry.TryGetProperty("params", out var punchParams))
                                    {
                                        punchingConfig = new
                                        {
                                            corner_tl = punchParams.TryGetProperty("corner_tl", out var ctl) && (ctl.ValueKind == JsonValueKind.True || (ctl.ValueKind == JsonValueKind.Number && ctl.GetDouble() > 0)),
                                            corner_tr = punchParams.TryGetProperty("corner_tr", out var ctr) && (ctr.ValueKind == JsonValueKind.True || (ctr.ValueKind == JsonValueKind.Number && ctr.GetDouble() > 0)),
                                            corner_bl = punchParams.TryGetProperty("corner_bl", out var cbl) && (cbl.ValueKind == JsonValueKind.True || (cbl.ValueKind == JsonValueKind.Number && cbl.GetDouble() > 0)),
                                            corner_br = punchParams.TryGetProperty("corner_br", out var cbr) && (cbr.ValueKind == JsonValueKind.True || (cbr.ValueKind == JsonValueKind.Number && cbr.GetDouble() > 0)),
                                            side_top    = punchParams.TryGetProperty("side_top",    out var st) ? (int)st.GetDouble() : 0,
                                            side_bottom = punchParams.TryGetProperty("side_bottom", out var sb) ? (int)sb.GetDouble() : 0,
                                            side_left   = punchParams.TryGetProperty("side_left",   out var sl) ? (int)sl.GetDouble() : 0,
                                            side_right  = punchParams.TryGetProperty("side_right",  out var sr) ? (int)sr.GetDouble() : 0,
                                        };
                                    }

                                    if (ppCode2 == "ANNOTATION" && ppEntry.TryGetProperty("params", out var annoParams))
                                    {
                                        var positions = new List<string>();
                                        if (annoParams.TryGetProperty("positions", out var posArr) && posArr.ValueKind == JsonValueKind.Array)
                                        {
                                            foreach (var pos in posArr.EnumerateArray())
                                            {
                                                if (pos.ValueKind == JsonValueKind.String)
                                                    positions.Add(pos.GetString() ?? "하");
                                            }
                                        }
                                        else
                                        {
                                            // 하위 호환: 단일 position 문자열
                                            string annoPosition = annoParams.TryGetProperty("position", out var posEl) && posEl.ValueKind == JsonValueKind.String
                                                ? posEl.GetString() ?? "하" : "하";
                                            positions.Add(annoPosition);
                                        }
                                        string? customAnnoText = null;
                                        if (annoParams.TryGetProperty("customText", out var ctEl) && ctEl.ValueKind == JsonValueKind.String)
                                            customAnnoText = ctEl.GetString();

                                        annotationPositions = positions;
                                        annotationConfig = new
                                        {
                                            positions = positions.ToArray(),
                                            text = $"{content}-{(int)Math.Round(width)}x{(int)Math.Round(height)}-{qty}개",
                                            customText = customAnnoText
                                        };
                                    }

                                    if (ppCode2 == "OFFSET" && ppEntry.TryGetProperty("params", out var offsetParams))
                                    {
                                        // 4방향 개별 오프셋 (신규) — 하위호환: offset_distance → 4방향 동일
                                        double oTop = 0, oBottom = 0, oLeft = 0, oRight = 0;
                                        if (offsetParams.TryGetProperty("offset_top", out var otEl) && otEl.ValueKind == JsonValueKind.Number)
                                        {
                                            oTop = otEl.GetDouble();
                                            oBottom = offsetParams.TryGetProperty("offset_bottom", out var obEl) && obEl.ValueKind == JsonValueKind.Number ? obEl.GetDouble() : 0;
                                            oLeft = offsetParams.TryGetProperty("offset_left", out var olEl) && olEl.ValueKind == JsonValueKind.Number ? olEl.GetDouble() : 0;
                                            oRight = offsetParams.TryGetProperty("offset_right", out var orEl) && orEl.ValueKind == JsonValueKind.Number ? orEl.GetDouble() : 0;
                                        }
                                        else
                                        {
                                            // 하위호환: 기존 offset_distance
                                            double d = offsetParams.TryGetProperty("offset_distance", out var odEl) && odEl.ValueKind == JsonValueKind.Number ? odEl.GetDouble() : 3.0;
                                            oTop = oBottom = oLeft = oRight = d;
                                        }
                                        string method = "scale";
                                        if (offsetParams.TryGetProperty("method", out var methodEl) && methodEl.ValueKind == JsonValueKind.String)
                                            method = methodEl.GetString() ?? "scale";
                                        bool cutLine = true;
                                        if (offsetParams.TryGetProperty("cut_line", out var clEl))
                                            cutLine = clEl.ValueKind != JsonValueKind.False;

                                        offsetConfig = new
                                        {
                                            offset_top = oTop,
                                            offset_bottom = oBottom,
                                            offset_left = oLeft,
                                            offset_right = oRight,
                                            method = method,
                                            cut_line = cutLine
                                        };
                                    }
                                }
                            }
                        }
                        catch (Exception exPP) { Console.WriteLine($"   ⚠️ PP 파싱 실패 (기본 마진 사용): {exPP.Message}"); }
                    }
                }

                // ANNOTATION 최소 마진 보장: 주석 배치 방향에 최소 1.5cm 여백 확보
                // (30pt 실물 폰트 + 패딩 ≈ 15mm = 1.5cm)
                if (annotationConfig != null && annotationPositions != null)
                {
                    const double annoMinMargin = 1.5; // cm (실물 기준)
                    foreach (var pos in annotationPositions)
                    {
                        if (pos == "상") marginT = Math.Max(marginT, annoMinMargin);
                        if (pos == "하") marginB = Math.Max(marginB, annoMinMargin);
                        if (pos == "좌") marginL = Math.Max(marginL, annoMinMargin);
                        if (pos == "우") marginR = Math.Max(marginR, annoMinMargin);
                    }
                }

                // OFFSET 최소 마진 보장: 오프셋 거리만큼 방향별 여백 확보
                if (offsetConfig != null)
                {
                    marginT = Math.Max(marginT, ((dynamic)offsetConfig).offset_top / 10.0);
                    marginB = Math.Max(marginB, ((dynamic)offsetConfig).offset_bottom / 10.0);
                    marginL = Math.Max(marginL, ((dynamic)offsetConfig).offset_left / 10.0);
                    marginR = Math.Max(marginR, ((dynamic)offsetConfig).offset_right / 10.0);
                }

                // OFFSET 자동 설정: 후가공에 OFFSET이 없어도 시트/전사/깃발 카테고리는 기본 3mm edge_strip
                // category_name 미리 추출 (정식 선언은 아래 파일명 생성 시)
                var _catSrc = (parentItem.HasValue && parentItem.Value.ValueKind == JsonValueKind.Object)
                    ? parentItem.Value : item;
                string _earlyCategory = (_catSrc.TryGetProperty("category_name", out var _ecEl) && _ecEl.ValueKind != JsonValueKind.Null)
                    ? (_ecEl.GetString() ?? "기타") : "기타";
                if (offsetConfig == null)
                {
                    string catLower = _earlyCategory.ToLowerInvariant();
                    bool isSheetType = catLower.Contains("시트") || catLower.Contains("sheet")
                        || catLower.Contains("전사") || catLower.Contains("transfer")
                        || catLower.Contains("깃발") || catLower.Contains("태극기") || catLower.Contains("flag")
                        || catLower.Contains("간판") || catLower.Contains("sign");
                    if (isSheetType)
                    {
                        offsetConfig = new {
                            offset_top = 3.0, offset_bottom = 3.0,
                            offset_left = 3.0, offset_right = 3.0,
                            method = "edge_strip", cut_line = false
                        };
                        Console.WriteLine($"      🔲 도련 자동 설정: 3mm edge_strip (카테고리: {_earlyCategory})");
                    }
                }

                // ── 마감방식(finishing) 파싱: 빈 여백 확장 + 접는/재단 선 ──
                // finishing은 bleed(디자인 확장)과 다름: 빈 여백 추가 + 경계에 M100 0.6pt 선
                object? finishingConfig = null;
                var finSource = item;
                if (parentItem.HasValue && parentItem.Value.ValueKind == JsonValueKind.Object)
                {
                    bool hasOwnFin = item.TryGetProperty("finishing", out var _chkFin)
                                     && _chkFin.ValueKind == JsonValueKind.String
                                     && !string.IsNullOrEmpty(_chkFin.GetString());
                    if (!hasOwnFin) finSource = parentItem.Value;
                }
                if (finSource.TryGetProperty("finishing", out var finEl) && finEl.ValueKind == JsonValueKind.String)
                {
                    var finStr = finEl.GetString();
                    if (!string.IsNullOrEmpty(finStr))
                    {
                        try
                        {
                            using var finDoc = JsonDocument.Parse(finStr);
                            var fin = finDoc.RootElement;
                            var finMethods = await GetFinishingMethodsAsync();

                            string finTop = fin.TryGetProperty("top", out var ftEl) ? ftEl.GetString() ?? "" : "";
                            string finBottom = fin.TryGetProperty("bottom", out var fbEl) ? fbEl.GetString() ?? "" : "";
                            string finLeft = fin.TryGetProperty("left", out var flEl) ? flEl.GetString() ?? "" : "";
                            string finRight = fin.TryGetProperty("right", out var frEl) ? frEl.GetString() ?? "" : "";

                            // cm 오버라이드 우선, 없으면 방식 기본값
                            double fmT = fin.TryGetProperty("top_cm", out var tcEl) && tcEl.ValueKind == JsonValueKind.Number
                                ? tcEl.GetDouble() : (!string.IsNullOrEmpty(finTop) && finMethods.TryGetValue(finTop, out var mt) ? mt : 0);
                            double fmB = fin.TryGetProperty("bottom_cm", out var bcEl) && bcEl.ValueKind == JsonValueKind.Number
                                ? bcEl.GetDouble() : (!string.IsNullOrEmpty(finBottom) && finMethods.TryGetValue(finBottom, out var mb) ? mb : 0);
                            double fmL = fin.TryGetProperty("left_cm", out var lcEl) && lcEl.ValueKind == JsonValueKind.Number
                                ? lcEl.GetDouble() : (!string.IsNullOrEmpty(finLeft) && finMethods.TryGetValue(finLeft, out var ml) ? ml : 0);
                            double fmR = fin.TryGetProperty("right_cm", out var rcEl) && rcEl.ValueKind == JsonValueKind.Number
                                ? rcEl.GetDouble() : (!string.IsNullOrEmpty(finRight) && finMethods.TryGetValue(finRight, out var mr) ? mr : 0);

                            bool hasAny = !string.IsNullOrEmpty(finTop) || !string.IsNullOrEmpty(finBottom)
                                        || !string.IsNullOrEmpty(finLeft) || !string.IsNullOrEmpty(finRight);
                            if (hasAny)
                            {
                                finishingConfig = new
                                {
                                    top = new { method = finTop, margin_cm = fmT },
                                    bottom = new { method = finBottom, margin_cm = fmB },
                                    left = new { method = finLeft, margin_cm = fmL },
                                    right = new { method = finRight, margin_cm = fmR }
                                };
                                Console.WriteLine($"      ✂️ 마감: 상={finTop}({fmT}cm) 하={finBottom}({fmB}cm) 좌={finLeft}({fmL}cm) 우={finRight}({fmR}cm)");
                            }
                        }
                        catch (Exception exFin) { Console.WriteLine($"      ⚠️ finishing 파싱 실패: {exFin.Message}"); }
                    }
                }

                // 스케일 팩터 적용: 실제 마진(cm) ÷ 파일_스케일 = 파일 좌표 마진
                // 예: 실제 3cm 블리드 + scale_factor=5(1/5 축소 파일) → JSX에 0.6cm 전달
                double scaleFactor = 1.0;
                if (item.TryGetProperty("scale_factor", out var sfEl) && sfEl.ValueKind != JsonValueKind.Null)
                    sfEl.TryGetDouble(out scaleFactor);
                if (scaleFactor <= 0) scaleFactor = 1.0;
                if (scaleFactor != 1.0)
                {
                    // 모든 마진을 scaleFactor로 나눔 (실물 cm → 파일 좌표계 cm)
                    marginL /= scaleFactor;
                    marginR /= scaleFactor;
                    marginT /= scaleFactor;
                    marginB /= scaleFactor;
                    Console.WriteLine($"      ScaleFactor: 1/{(int)scaleFactor} → 마진 조정됨 L/R/T/B: {marginL:F3}/{marginR:F3}/{marginT:F3}/{marginB:F3} cm");

                    // finishing 마진도 scaleFactor 적용
                    if (finishingConfig != null)
                    {
                        var fc = (dynamic)finishingConfig;
                        finishingConfig = new
                        {
                            top    = new { method = (string)fc.top.method,    margin_cm = (double)fc.top.margin_cm    / scaleFactor },
                            bottom = new { method = (string)fc.bottom.method, margin_cm = (double)fc.bottom.margin_cm / scaleFactor },
                            left   = new { method = (string)fc.left.method,   margin_cm = (double)fc.left.margin_cm   / scaleFactor },
                            right  = new { method = (string)fc.right.method,  margin_cm = (double)fc.right.margin_cm  / scaleFactor }
                        };
                    }
                }

                // 파일명 생성: [오더번호]-[FFF]-[거래처명]-[규격]-[품목]-[수량]EA
                // FFF: 주문 내 파일 순번 (001~, 3자리 zero-pad) — LogWatcher 카드 매칭용
                string wStr = ((int)Math.Round(width)).ToString();
                string hStr = ((int)Math.Round(height)).ToString();
                string fileSeqStr = fileSeq.ToString("D3"); // 001, 002, ...
                string baseName = $"{orderNumber}-{fileSeqStr}-{SanitizeFilename(clientName)}-{wStr}x{hStr}-{SanitizeFilename(content)}-{qty}EA";

                // 카테고리, 연도, 월 추출
                // 자식 행은 부모의 category_name 상속 (묶음 품목에서 올바른 Z드라이브 폴더 사용)
                var catSource = (parentItem.HasValue && parentItem.Value.ValueKind == JsonValueKind.Object)
                    ? parentItem.Value : item;
                string category = (catSource.TryGetProperty("category_name", out var catEl) && catEl.ValueKind != JsonValueKind.Null)
                    ? SanitizeFilename(catEl.GetString() ?? "기타") : "기타";
                if (string.IsNullOrWhiteSpace(category)) category = "기타";

                // 주문번호에서 연도/월/일 파싱 (형식: YYYYMMDD-NNN)
                string year  = orderNumber.Length >= 8 ? orderNumber.Substring(0, 4) : DateTime.Now.Year.ToString();
                string month = orderNumber.Length >= 8 ? orderNumber.Substring(4, 2) : DateTime.Now.Month.ToString("D2");
                string day   = orderNumber.Length >= 8 ? orderNumber.Substring(6, 2) : DateTime.Now.Day.ToString("D2");

                // Z드라이브 출력 경로: Z:\DESIGN\[대분류]\YYYY\MM\DD\ORDER-NO
                string orderFolder = Path.Combine(ZDRIVE_PATH, "DESIGN", category, year, month, day, orderNumber);
                Directory.CreateDirectory(orderFolder);
                string epsOutputPath = Path.Combine(orderFolder, baseName + ".eps");
                string pngOutputPath = Path.Combine(orderFolder, baseName + ".png");

                string groupLabel = groupIdx == -2 ? "묶음" : groupIdx >= 0 ? groupIdx.ToString() : "전체 문서";
                Console.WriteLine($"      Item: {wStr}x{hStr}cm | {content} | {qty}EA");
                Console.WriteLine($"      Margin L/R/T/B: {marginL}/{marginR}/{marginT}/{marginB} cm");
                if (offsetConfig != null) Console.WriteLine($"      Offset: {((dynamic)offsetConfig).method} {((dynamic)offsetConfig).offset_top}mm");
                Console.WriteLine($"      Group: {groupLabel}");

                // 묶음 모드: 이미 생성된 레이아웃 EPS를 Z드라이브로 복사
                if (groupIdx == -2 && layoutId.HasValue)
                {
                    Console.WriteLine($"      📦 묶음 모드 → Layout #{layoutId} EPS 복사");
                    await CopyLayoutFilesToZDriveAsync(layoutId.Value, orderFolder, baseName);
                    // 묶음 모드에서도 file-map 등록
                    await RegisterFileMapAsync(orderNumber, fileSeq, fileSeqStr, baseName, item);
                    return;
                }

                Console.WriteLine($"      Output: {epsOutputPath}");

                var illustratorPath = FindIllustratorPath();
                if (string.IsNullOrEmpty(illustratorPath))
                {
                    Console.WriteLine($"      ❌ Illustrator 경로를 찾을 수 없음");
                    return;
                }

                string scriptPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "ProcessOrderItem.jsx");
                if (!File.Exists(scriptPath))
                {
                    Console.WriteLine($"      ❌ 스크립트 없음: {scriptPath}");
                    return;
                }

                // 파라미터를 ia_params.json에 기록 ($.getenv() 대신 파일 기반 전달)
                // widthCm, heightCm, scale 제거 — 아트보드 조작 방식에서는 그룹 바운드로 자동 계산
                string scriptDir3 = Path.GetDirectoryName(scriptPath)!;
                string itemParamsJson = System.Text.Json.JsonSerializer.Serialize(new
                {
                    source    = aiFilePath,
                    groupIdx  = groupIdx,
                    artboardIndex = groupIdx,  // ExtractGroups v5가 생성한 아트보드 인덱스
                    marginL   = marginL,
                    marginR   = marginR,
                    marginT   = marginT,
                    marginB   = marginB,
                    epsOutput = epsOutputPath,
                    pngOutput = pngOutputPath,
                    thumbSize = 300,
                    scaleFactor = scaleFactor,
                    punching    = punchingConfig,
                    annotation  = annotationConfig,
                    offset      = offsetConfig,
                    finishing   = finishingConfig
                });
                File.WriteAllText(Path.Combine(scriptDir3, "ia_params.json"), itemParamsJson, System.Text.Encoding.UTF8);

                Console.WriteLine($"      🖥️  Running Illustrator: ProcessOrderItem.jsx (COM)");
                string paramsPath3 = Path.Combine(scriptDir3, "ia_params.json");
                RunJsxScript(scriptPath, paramsPath3, timeoutMinutes: 2);

                // 생성 검증: 파일이 실제로 존재하는지 확인 (DoJavaScript는 JSX 내부 오류를 숨길 수 있음)
                if (!File.Exists(epsOutputPath))
                {
                    string errLogPath = Path.Combine(scriptDir3, "ia_error.log");
                    string errDetail = File.Exists(errLogPath)
                        ? File.ReadAllText(errLogPath, System.Text.Encoding.UTF8)
                        : "ia_error.log 없음 (JSX 실행 실패 또는 파라미터 경로 오류)";
                    throw new Exception($"EPS 미생성: {errDetail}");
                }
                Console.WriteLine($"      ✅ EPS 생성 완료: {Path.GetFileName(epsOutputPath)}");
                if (!string.IsNullOrEmpty(pngOutputPath) && File.Exists(pngOutputPath))
                    Console.WriteLine($"      ✅ PNG 생성 완료: {Path.GetFileName(pngOutputPath)}");

                // file-map API 호출: LogWatcher 카드 매칭용 파일명 ↔ 카드 매핑 등록
                await RegisterFileMapAsync(orderNumber, fileSeq, fileSeqStr, baseName, item);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"      ❌ 품목 처리 오류: {ex.Message}");
            }
        }

        // ── finishing_methods 캐시 로드 ─────────────────────────────────
        private static async Task<Dictionary<string, double>> GetFinishingMethodsAsync()
        {
            if (_finishingMethodsCache != null) return _finishingMethodsCache;
            _finishingMethodsCache = new Dictionary<string, double>();
            try
            {
                var req = new HttpRequestMessage(HttpMethod.Get, $"{ERP_API_URL}/api/finishing/methods");
                if (!string.IsNullOrEmpty(authToken))
                    req.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", authToken);
                var resp = await httpClient.SendAsync(req);
                if (resp.IsSuccessStatusCode)
                {
                    var json = await resp.Content.ReadFromJsonAsync<JsonElement>();
                    if (json.TryGetProperty("data", out var arr) && arr.ValueKind == JsonValueKind.Array)
                    {
                        foreach (var m in arr.EnumerateArray())
                        {
                            string name = m.TryGetProperty("name", out var nEl) ? nEl.GetString() ?? "" : "";
                            double margin = m.TryGetProperty("margin_cm", out var mcEl) ? mcEl.GetDouble() : 0;
                            if (!string.IsNullOrEmpty(name))
                                _finishingMethodsCache[name] = margin;
                        }
                    }
                    Console.WriteLine($"   📐 마감방식 {_finishingMethodsCache.Count}건 로드: {string.Join(", ", _finishingMethodsCache.Select(kv => $"{kv.Key}={kv.Value}cm"))}");
                }
            }
            catch (Exception ex) { Console.WriteLine($"   ⚠️ finishing methods 로드 실패: {ex.Message}"); }
            return _finishingMethodsCache;
        }

        // ── file-map 등록 헬퍼 ──────────────────────────────────────────
        // EPS 생성 후 MES API에 파일명 ↔ 카드 매핑 등록 (LogWatcher 카드 매칭용)
        private static async Task RegisterFileMapAsync(string orderNumber, int fileSeq, string fileSeqStr, string baseName, JsonElement item)
        {
            try
            {
                int orderItemId = (item.TryGetProperty("id", out var oiIdEl) && oiIdEl.TryGetInt32(out int oiIdVal)) ? oiIdVal : 0;
                int? cardId = (item.TryGetProperty("card_id", out var ciEl) && ciEl.ValueKind != JsonValueKind.Null && ciEl.TryGetInt32(out int ciVal)) ? ciVal : null;
                string? cardNumber = (item.TryGetProperty("card_number", out var cnEl2) && cnEl2.ValueKind != JsonValueKind.Null) ? cnEl2.GetString() : null;

                var fileMapPayload = new
                {
                    order_number = orderNumber,
                    file_seq = fileSeq,
                    card_id = cardId,
                    card_number = cardNumber,
                    file_name = baseName + ".eps",
                    order_item_id = orderItemId > 0 ? orderItemId : (int?)null
                };
                var fmReq = new HttpRequestMessage(HttpMethod.Post, $"{ERP_API_URL}/api/print-events/file-map");
                fmReq.Headers.Add("X-Agent-Key", "dongsan-rip-agent-2026");
                fmReq.Content = new StringContent(
                    JsonSerializer.Serialize(fileMapPayload),
                    System.Text.Encoding.UTF8, "application/json");
                var fmResp = await httpClient.SendAsync(fmReq);
                Console.WriteLine($"      📋 file-map 등록: seq={fileSeqStr}, card={cardNumber ?? "N/A"}, status={fmResp.StatusCode}");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"      ⚠️  file-map 등록 실패 (계속 진행): {ex.Message}");
            }
        }

        private static async Task PatchOrderStatusAsync(int orderId, string status)
        {
            try
            {
                var payload = new Dictionary<string, object?> { ["status"] = status };
                var resp = await PatchWithAuthAsync(
                    $"{ERP_API_URL}/api/orders/{orderId}/status",
                    JsonSerializer.Serialize(payload));
                if (!resp.IsSuccessStatusCode)
                    Console.WriteLine($"   ⚠️  PATCH order status 실패: {resp.StatusCode}");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"   ⚠️  PATCH order status 오류: {ex.Message}");
            }
        }

        private static string SanitizeFilename(string name)
        {
            var invalid = Path.GetInvalidFileNameChars();
            return new string(name.Where(c => !invalid.Contains(c)).ToArray()).Trim();
        }

        // ── COM 자동화 (P/Invoke) ─────────────────────────────────────────────
        // .NET 8에서 Marshal.GetActiveObject 제거됨 → ole32/oleaut32 직접 호출
        [System.Runtime.InteropServices.DllImport("ole32.dll")]
        private static extern int CLSIDFromProgID(
            [System.Runtime.InteropServices.MarshalAs(System.Runtime.InteropServices.UnmanagedType.LPWStr)] string lpszProgID,
            out Guid lpclsid);

        [System.Runtime.InteropServices.DllImport("oleaut32.dll", PreserveSig = false)]
        private static extern void OleGetActiveObject(
            ref Guid rclsid,
            IntPtr pvReserved,
            [System.Runtime.InteropServices.MarshalAs(System.Runtime.InteropServices.UnmanagedType.IUnknown)] out object ppunk);

        private static object? TryGetActiveComObject(string progId)
        {
            try
            {
                if (CLSIDFromProgID(progId, out Guid clsid) != 0) return null;
                OleGetActiveObject(ref clsid, IntPtr.Zero, out object obj);
                return obj;
            }
            catch { return null; }
        }

        /// <summary>
        /// 실행 중인 Illustrator COM 인스턴스를 반환하거나, 없으면 실행 후 대기.
        /// 보안 경고 다이얼로그 없이 스크립트를 실행할 수 있음.
        /// </summary>
        private static dynamic GetOrStartIllustrator()
        {
            // 1. 기존 COM 인스턴스 유효성 확인
            if (_ilApp != null)
            {
                try { var _ = _ilApp.Version; return _ilApp; }
                catch { _ilApp = null; }
            }
            // 2. 이미 실행 중인 Illustrator에 연결 시도 (P/Invoke GetActiveObject)
            var running = TryGetActiveComObject("Illustrator.Application");
            if (running != null)
            {
                _ilApp = running;
                Console.WriteLine("   ✅ Illustrator COM 연결됨 (실행 중인 인스턴스)");
                return _ilApp;
            }
            // 3. COM으로 새 Illustrator 인스턴스 생성 (Type.GetTypeFromProgID)
            Type? aiType = Type.GetTypeFromProgID("Illustrator.Application");
            if (aiType != null)
            {
                Console.WriteLine("   🚀 Illustrator COM 시작 중...");
                _ilApp = Activator.CreateInstance(aiType)!;
                Console.WriteLine("   ✅ Illustrator COM 시작됨");
                return _ilApp;
            }
            // 4. 최후 수단: 직접 실행 후 COM 연결 대기 (최대 60초)
            string ilPath = FindIllustratorPath() ?? throw new Exception("Illustrator 설치 경로를 찾을 수 없음");
            Console.WriteLine($"   🚀 Illustrator 직접 시작: {ilPath}");
            Process.Start(new ProcessStartInfo { FileName = ilPath, UseShellExecute = true });
            for (int i = 0; i < 30; i++)
            {
                Thread.Sleep(2000);
                var obj = TryGetActiveComObject("Illustrator.Application");
                if (obj != null)
                {
                    _ilApp = obj;
                    Console.WriteLine("   ✅ Illustrator COM 연결됨 (새 인스턴스)");
                    return _ilApp;
                }
            }
            throw new Exception("Illustrator 시작 시간 초과 (60초)");
        }

        /// <summary>
        /// ia_params.json 경로를 스크립트 프리앰블로 주입하고 COM을 통해 실행.
        /// DoJavaScript()는 동기(blocking) — 스크립트 완료까지 대기.
        /// </summary>
        private static void RunJsxScript(string scriptPath, string paramsJsonPath, int timeoutMinutes = 5)
        {
            var ai = GetOrStartIllustrator();
            string paramsEscaped = paramsJsonPath.Replace("\\", "\\\\");
            string preamble = $"var _ia_params_override_path = \"{paramsEscaped}\";\n";
            string scriptContent = preamble + File.ReadAllText(scriptPath, System.Text.Encoding.UTF8);

            // DoJavaScript는 동기이지만 Task로 감싸 타임아웃 처리
            var task = Task.Run(() => { ai.DoJavaScript(scriptContent); });
            if (!task.Wait(TimeSpan.FromMinutes(timeoutMinutes)))
                throw new TimeoutException($"JSX 스크립트 시간 초과 ({timeoutMinutes}분): {Path.GetFileName(scriptPath)}");
        }

        private static string? FindIllustratorPath()
        {
            var possiblePaths = new[]
            {
                @"C:\Program Files\Adobe\Adobe Illustrator 2024\Support Files\Contents\Windows\Illustrator.exe",
                @"C:\Program Files\Adobe\Adobe Illustrator 2023\Support Files\Contents\Windows\Illustrator.exe",
                @"C:\Program Files\Adobe\Adobe Illustrator 2022\Support Files\Contents\Windows\Illustrator.exe",
                @"C:\Program Files\Adobe\Adobe Illustrator CC 2021\Support Files\Contents\Windows\Illustrator.exe",
                @"C:\Program Files\Adobe\Adobe Illustrator CC 2020\Support Files\Contents\Windows\Illustrator.exe"
            };

            foreach (var path in possiblePaths)
            {
                if (File.Exists(path))
                    return path;
            }

            var programFiles = @"C:\Program Files\Adobe";
            if (Directory.Exists(programFiles))
            {
                var dirs = Directory.GetDirectories(programFiles, "Adobe Illustrator*");
                foreach (var dir in dirs)
                {
                    var exePath = Path.Combine(dir, @"Support Files\Contents\Windows\Illustrator.exe");
                    if (File.Exists(exePath))
                        return exePath;
                }
            }

            return null;
        }

        // ── 인증 재시도 헬퍼 ────────────────────────────────────────────
        private static async Task<HttpResponseMessage> GetWithAuthAsync(string url)
        {
            var resp = await httpClient.GetAsync(url);
            if (resp.StatusCode == System.Net.HttpStatusCode.Unauthorized)
            {
                Console.WriteLine($"   🔐 Token expired, re-logging in...");
                if (await LoginAsync())
                    resp = await httpClient.GetAsync(url);
            }
            return resp;
        }

        private static async Task<HttpResponseMessage> PatchWithAuthAsync(string url, string payloadJson)
        {
            StringContent MakeContent() =>
                new StringContent(payloadJson, System.Text.Encoding.UTF8, "application/json");

            var resp = await httpClient.PatchAsync(url, MakeContent());
            if (resp.StatusCode == System.Net.HttpStatusCode.Unauthorized)
            {
                Console.WriteLine($"   🔐 Token expired, re-logging in...");
                if (await LoginAsync())
                    resp = await httpClient.PatchAsync(url, MakeContent());
            }
            return resp;
        }

        // ── 묶음 모드: 기존 레이아웃 EPS를 Z드라이브로 복사 ──────────────
        private static async Task CopyLayoutFilesToZDriveAsync(int layoutId, string orderFolder, string baseName)
        {
            try
            {
                var resp = await GetWithAuthAsync($"{ERP_API_URL}/api/ai-layout/{layoutId}");
                if (!resp.IsSuccessStatusCode)
                {
                    Console.WriteLine($"      ❌ Layout 결과 조회 실패: {resp.StatusCode}");
                    return;
                }

                var json = await resp.Content.ReadFromJsonAsync<JsonElement>();
                if (!json.TryGetProperty("data", out var data) ||
                    !data.TryGetProperty("result_json", out var rjEl) ||
                    rjEl.ValueKind == JsonValueKind.Null)
                {
                    Console.WriteLine($"      ❌ result_json 없음 (레이아웃이 완료되지 않았거나 오류 발생)");
                    return;
                }

                string? resultJsonStr = rjEl.GetString();
                if (string.IsNullOrEmpty(resultJsonStr))
                {
                    Console.WriteLine($"      ❌ result_json이 비어 있음");
                    return;
                }

                using var resultDoc = JsonDocument.Parse(resultJsonStr);
                var result = resultDoc.RootElement;

                string? src1 = result.TryGetProperty("output_1_path", out var o1) ? o1.GetString() : null;
                string? src2 = result.TryGetProperty("output_2_path", out var o2) ? o2.GetString() : null;

                Directory.CreateDirectory(orderFolder);

                if (!string.IsNullOrEmpty(src1) && File.Exists(src1))
                {
                    string dst1 = Path.Combine(orderFolder, baseName + "_1.eps");
                    File.Copy(src1, dst1, overwrite: true);
                    Console.WriteLine($"      ✅ Layout EPS 1번 복사: {Path.GetFileName(dst1)}");
                }
                else
                {
                    Console.WriteLine($"      ⚠️  Layout EPS 1번 없음: {src1 ?? "(경로 없음)"}");
                }

                if (!string.IsNullOrEmpty(src2) && File.Exists(src2))
                {
                    string dst2 = Path.Combine(orderFolder, baseName + "_2.eps");
                    File.Copy(src2, dst2, overwrite: true);
                    Console.WriteLine($"      ✅ Layout EPS 2번 복사: {Path.GetFileName(dst2)}");
                }
                else
                {
                    Console.WriteLine($"      ⚠️  Layout EPS 2번 없음: {src2 ?? "(경로 없음)"}");
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"      ❌ Layout EPS 복사 오류: {ex.Message}");
            }
        }
    }
}
