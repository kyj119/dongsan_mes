using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Text.Json;
using System.Threading.Tasks;
using LogWatcher.Core;

namespace LogWatcher
{
    class Program
    {
        // Windows 콘솔 QuickEdit 비활성화 (클릭 시 멈춤 방지)
        const uint ENABLE_QUICK_EDIT = 0x0040;
        const uint ENABLE_EXTENDED_FLAGS = 0x0080;
        const int STD_INPUT_HANDLE = -10;

        [DllImport("kernel32.dll", SetLastError = true)]
        static extern IntPtr GetStdHandle(int nStdHandle);

        [DllImport("kernel32.dll", SetLastError = true)]
        static extern bool GetConsoleMode(IntPtr hConsoleHandle, out uint lpMode);

        [DllImport("kernel32.dll", SetLastError = true)]
        static extern bool SetConsoleMode(IntPtr hConsoleHandle, uint dwMode);

        static void DisableQuickEdit()
        {
            try
            {
                var handle = GetStdHandle(STD_INPUT_HANDLE);
                if (GetConsoleMode(handle, out uint mode))
                {
                    mode &= ~ENABLE_QUICK_EDIT;
                    mode |= ENABLE_EXTENDED_FLAGS;
                    SetConsoleMode(handle, mode);
                }
            }
            catch { /* 서비스 모드 등 콘솔 없을 때 무시 */ }
        }

        static async Task Main(string[] args)
        {
            DisableQuickEdit();

            var equipmentConfigPath = Path.Combine(AppContext.BaseDirectory, "equipment.json");

            // Route: equipment.json exists → new universal mode
            if (File.Exists(equipmentConfigPath))
            {
                await RunUniversalMode(args, equipmentConfigPath);
            }
            else
            {
                // Fallback: legacy appsettings.json mode
                await RunLegacyMode(args);
            }
        }

        /// <summary>
        /// New universal mode: equipment.json drives multi-equipment polling.
        /// </summary>
        static async Task RunUniversalMode(string[] args, string equipmentConfigPath)
        {
            Console.WriteLine("=== LogWatcher v2.0 (Universal) ===");
            Console.WriteLine($"PC: {Environment.MachineName}");
            Console.WriteLine($"Time: {DateTime.Now}");
            Console.WriteLine($"Config: {equipmentConfigPath}");

            // Load appsettings.json for API config (MesApiUrl, ApiKey)
            var settingsPath = Path.Combine(AppContext.BaseDirectory, "appsettings.json");
            string mesApiUrl = "http://192.168.0.94:3000";
            string apiKey = "";
            if (File.Exists(settingsPath))
            {
                var settingsJson = File.ReadAllText(settingsPath);
                var settings = JsonSerializer.Deserialize<JsonElement>(settingsJson);
                mesApiUrl = settings.TryGetProperty("MesApiUrl", out var url) ? url.GetString() ?? mesApiUrl : mesApiUrl;
                apiKey = settings.TryGetProperty("ApiKey", out var key) ? key.GetString() ?? "" : "";
            }

            var agentId = Environment.MachineName;
            var apiClient = new MesApiClient(mesApiUrl, apiKey, agentId);
            var queuePath = Path.Combine(AppContext.BaseDirectory, "pending_events.json");
            var queue = new EventQueue(queuePath);
            var positionsDir = Path.Combine(AppContext.BaseDirectory, "positions");

            var manager = new WatcherManager(apiClient, queue, positionsDir);

            try
            {
                manager.LoadConfig(equipmentConfigPath);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[FATAL] Failed to load equipment.json: {ex.Message}");
                return;
            }

            if (manager.ParserCount == 0)
            {
                Console.WriteLine("[FATAL] No enabled equipment found in equipment.json");
                return;
            }

            Console.WriteLine($"API: {mesApiUrl}");
            Console.WriteLine($"Poll: {manager.Config.PollIntervalSeconds}s, Heartbeat: {manager.Config.HeartbeatIntervalSeconds}s");

            // Handle CLI commands
            if (args.Length > 0)
            {
                switch (args[0])
                {
                    case "--test":
                        var testEq = args.Length > 1 ? args[1] : null;
                        manager.TestEquipment(testEq);
                        return;

                    case "--list":
                        manager.ListEquipment();
                        return;

                    case "--validate":
                        Console.WriteLine("[VALIDATE] equipment.json loaded successfully");
                        manager.ListEquipment();
                        return;
                }
            }

            // Main polling loop
            Console.WriteLine($"\n[START] Monitoring {manager.ParserCount} equipment...\n");
            var pollInterval = manager.Config.PollIntervalSeconds;

            while (true)
            {
                try
                {
                    await manager.PollAllAsync();
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"[ERROR] Main loop: {ex.Message}");
                }

                await Task.Delay(pollInterval * 1000);
            }
        }

        /// <summary>
        /// Legacy mode: single-equipment appsettings.json (backward compatible).
        /// </summary>
        static async Task RunLegacyMode(string[] args)
        {
            Console.WriteLine("=== LogWatcher v2.0 (Legacy Mode) ===");
            Console.WriteLine($"PC: {Environment.MachineName}");
            Console.WriteLine($"Time: {DateTime.Now}");

            // Load settings
            var settingsPath = Path.Combine(AppContext.BaseDirectory, "appsettings.json");
            if (!File.Exists(settingsPath))
            {
                Console.WriteLine($"[FATAL] appsettings.json not found at {settingsPath}");
                Console.WriteLine("[HINT] Create equipment.json for multi-equipment mode");
                return;
            }

            var settingsJson = File.ReadAllText(settingsPath);
            var settings = JsonSerializer.Deserialize<JsonElement>(settingsJson);

            var mesApiUrl = settings.GetProperty("MesApiUrl").GetString() ?? "http://192.168.0.94:3000";
            var apiKey = settings.GetProperty("ApiKey").GetString() ?? "";
            var printLogPath = settings.GetProperty("PrintLogPath").GetString() ?? @"C:\TNSRip-X11\Print.log";
            var pollInterval = settings.TryGetProperty("PollIntervalSeconds", out var pi) ? pi.GetInt32() : 5;
            var heartbeatInterval = settings.TryGetProperty("HeartbeatIntervalSeconds", out var hi) ? hi.GetInt32() : 60;
            var queuePath = settings.TryGetProperty("OfflineQueuePath", out var qp)
                ? qp.GetString() ?? "pending_events.json"
                : "pending_events.json";
            var equipmentId = settings.TryGetProperty("EquipmentId", out var ei)
                ? ei.GetString() ?? ""
                : "";

            var ripJobEnabled = settings.TryGetProperty("RipJobEnabled", out var rje) && rje.GetBoolean();
            var ripJobFolder = settings.TryGetProperty("RipJobFolder", out var rjf) ? rjf.GetString() ?? "" : "";
            var ripJobTemplateFolder = settings.TryGetProperty("RipJobTemplateFolder", out var rjtf) ? rjtf.GetString() ?? "" : "";
            var ripJobPollSeconds = settings.TryGetProperty("RipJobPollIntervalSeconds", out var rjps) ? rjps.GetInt32() : 10;

            // Resolve relative paths to exe directory
            if (!Path.IsPathRooted(queuePath))
                queuePath = Path.Combine(AppContext.BaseDirectory, queuePath);

            var positionFile = Path.Combine(AppContext.BaseDirectory, "last_position.txt");

            var parserType = settings.TryGetProperty("ParserType", out var pt) ? pt.GetString() ?? "TNS" : "TNS";

            Console.WriteLine($"API: {mesApiUrl}");
            Console.WriteLine($"PrintLogPath: {printLogPath}");
            Console.WriteLine($"ParserType: {parserType}");
            Console.WriteLine($"Equipment: {(string.IsNullOrEmpty(equipmentId) ? "(hostname)" : equipmentId)}");
            Console.WriteLine($"Poll: {pollInterval}s, Heartbeat: {heartbeatInterval}s");

            // Test mode
            if (args.Length > 0 && args[0] == "--test")
            {
                var testPath = args.Length > 1 ? args[1] : printLogPath;
                Console.WriteLine($"\n[TEST MODE] Parsing: {testPath} (ParserType={parserType})");
                ILogParser testParser;
                if (parserType == "PrintExp")
                    testParser = new PrintExpLogParser(testPath, positionFile);
                else
                    testParser = new PrintLogParser(testPath, positionFile);
                testParser.ResetPosition();
                var testEvents = testParser.ReadNewEntries();
                Console.WriteLine($"Found {testEvents.Count} events:");
                foreach (var e in testEvents)
                {
                    Console.WriteLine($"  [{e.PrintStatus}] {e.FileName}");
                    Console.WriteLine($"    Printer: {e.PrinterName}");
                    Console.WriteLine($"    Path: {e.FilePath}");
                    Console.WriteLine($"    Size: {e.OutputSize}  DPI: {e.Dpi}");
                    Console.WriteLine($"    Time: {e.PrintStartedAt} ~ {e.PrintCompletedAt}");
                    if (e.CopyTotal > 1)
                        Console.WriteLine($"    Copy: {e.CopyColumns}x{e.CopyRows} = {e.CopyTotal}");
                    if (e.TileCount > 0)
                        Console.WriteLine($"    Tile: {e.TileIndex}/{e.TileCount}");
                    if (e.CardNumber != null)
                        Console.WriteLine($"    Card: {e.CardNumber}");
                    if (e.OrderNumber != null)
                        Console.WriteLine($"    Order: {e.OrderNumber}  FileSeq: {e.FileSeq}");
                }
                return;
            }

            var agentId = Environment.MachineName;
            var apiClient = new MesApiClient(mesApiUrl, apiKey, agentId, equipmentId);
            ILogParser parser;
            if (parserType == "PrintExp")
            {
                parser = new PrintExpLogParser(printLogPath, positionFile);
                Console.WriteLine($"[INFO] Parser: PrintExp (folder: {printLogPath})");
            }
            else
            {
                parser = new PrintLogParser(printLogPath, positionFile);
                Console.WriteLine($"[INFO] Parser: TNS (file: {printLogPath})");
            }
            var queue = new EventQueue(queuePath);

            Console.WriteLine("\n[START] Monitoring Print.log...\n");

            var lastHeartbeat = DateTime.MinValue;
            int consecutiveFailures = 0;
            int currentPollInterval = pollInterval;

            // ── 인쇄 상태 추적 ──
            long previousLogSize = -1;
            DateTime lastPrintActivity = DateTime.MinValue;
            const int PRINTING_TIMEOUT_SECONDS = 90;

            // ── RIP Job creator initialisation ──
            RipJobCreator? jobCreator = null;
            DateTime lastJobPoll = DateTime.MinValue;
            if (ripJobEnabled)
            {
                if (string.IsNullOrEmpty(equipmentId))
                {
                    Console.WriteLine("[WARN] RipJobEnabled=true but EquipmentId is empty. Job creation disabled.");
                    ripJobEnabled = false;
                }
                else if (!Directory.Exists(ripJobFolder))
                {
                    Console.WriteLine($"[WARN] RipJobFolder not found: {ripJobFolder}. Job creation disabled.");
                    ripJobEnabled = false;
                }
                else
                {
                    jobCreator = new RipJobCreator(ripJobFolder, ripJobTemplateFolder);
                    Console.WriteLine($"[INFO] RIP Job creation enabled. Equipment={equipmentId}, JobFolder={ripJobFolder}");
                }
            }

            while (true)
            {
                try
                {
                    // Print.log 파일 크기 변화로 인쇄 활동 감지
                    try
                    {
                        var logFileInfo = new FileInfo(printLogPath);
                        if (logFileInfo.Exists)
                        {
                            long currentSize = logFileInfo.Length;
                            if (previousLogSize >= 0 && currentSize > previousLogSize)
                            {
                                lastPrintActivity = DateTime.Now;
                            }
                            previousLogSize = currentSize;
                        }
                    }
                    catch { /* 파일 접근 실패 무시 */ }

                    // Read new events from Print.log
                    var events = parser.ReadNewEntries();

                    // 완료 이벤트 수신도 인쇄 활동으로 간주
                    if (events.Count > 0)
                    {
                        lastPrintActivity = DateTime.Now;
                    }

                    // 현재 인쇄 상태 판단: 마지막 활동 후 90초 이내면 RUNNING
                    bool isPrinting = lastPrintActivity > DateTime.MinValue
                        && (DateTime.Now - lastPrintActivity).TotalSeconds < PRINTING_TIMEOUT_SECONDS;

                    // Send heartbeat
                    if ((DateTime.Now - lastHeartbeat).TotalSeconds >= heartbeatInterval)
                    {
                        var hbOk = await apiClient.SendHeartbeatAsync(printLogPath, isPrinting);
                        if (hbOk)
                        {
                            lastHeartbeat = DateTime.Now;
                            Console.WriteLine($"[HEARTBEAT] Sent OK (printing={isPrinting})");
                        }
                    }

                    // Send new events
                    bool anyFailed = false;
                    foreach (var evt in events)
                    {
                        var sent = await apiClient.SendEventAsync(evt);
                        if (!sent)
                        {
                            queue.Enqueue(evt);
                            anyFailed = true;
                        }
                    }

                    // Retry queued events
                    if (queue.Count > 0)
                    {
                        Console.WriteLine($"[QUEUE] Retrying {queue.Count} queued events...");
                        var queued = queue.DequeueAll();
                        foreach (var evt in queued)
                        {
                            var sent = await apiClient.SendEventAsync(evt);
                            if (!sent)
                            {
                                queue.Enqueue(evt);
                                anyFailed = true;
                            }
                        }
                    }

                    // Backoff
                    if (anyFailed)
                    {
                        consecutiveFailures++;
                        currentPollInterval = consecutiveFailures switch
                        {
                            <= 3 => pollInterval,
                            <= 6 => pollInterval * 2,
                            <= 12 => 30,
                            _ => 60
                        };
                        if (consecutiveFailures == 4 || consecutiveFailures == 7 || consecutiveFailures == 13)
                            Console.WriteLine($"[BACKOFF] Poll interval → {currentPollInterval}s (failures={consecutiveFailures})");
                    }
                    else if (consecutiveFailures > 0)
                    {
                        Console.WriteLine($"[BACKOFF] Recovered after {consecutiveFailures} failures, poll → {pollInterval}s");
                        consecutiveFailures = 0;
                        currentPollInterval = pollInterval;
                    }

                    // ── RIP Job 생성 폴링 ──
                    if (ripJobEnabled && jobCreator != null && (DateTime.Now - lastJobPoll).TotalSeconds >= ripJobPollSeconds)
                    {
                        lastJobPoll = DateTime.Now;
                        try
                        {
                            var pending = await apiClient.GetPendingJobsAsync(equipmentId);
                            if (pending.Count > 0)
                                Console.WriteLine($"[JOB] {pending.Count} pending job(s) found");

                            foreach (var job in pending)
                            {
                                try
                                {
                                    if (string.IsNullOrEmpty(job.SourceFilePath) || !File.Exists(job.SourceFilePath))
                                    {
                                        Console.WriteLine($"[JOB] FAIL {job.CardNumber}: source file not found ({job.SourceFilePath})");
                                        await apiClient.FailItemAsync(job.CardItemId, "source file not found: " + (job.SourceFilePath ?? "null"));
                                        continue;
                                    }

                                    var expectedJobPath = Path.Combine(jobCreator.JobFolder, $"{job.CardNumber}_item{job.CardItemId}.job");
                                    string jobPath;
                                    if (File.Exists(expectedJobPath))
                                    {
                                        Console.WriteLine($"[JOB] RETRY ACK: {expectedJobPath} already exists, skipping CreateJob");
                                        jobPath = expectedJobPath;
                                    }
                                    else
                                    {
                                        jobPath = jobCreator.CreateJob(job);
                                    }

                                    var acked = await apiClient.AckJobAsync(job.CardItemId, jobPath);
                                    if (!acked)
                                        Console.WriteLine($"[JOB] WARN: {job.CardNumber}/{job.ItemName} ACK failed, will retry next poll");
                                }
                                catch (Exception ex)
                                {
                                    Console.WriteLine($"[JOB] ERROR {job.CardNumber}: {ex.Message}");
                                    await apiClient.FailItemAsync(job.CardItemId, ex.Message);
                                }
                            }
                        }
                        catch (Exception ex)
                        {
                            Console.WriteLine($"[JOB] Poll error: {ex.Message}");
                        }
                    }
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"[ERROR] Main loop: {ex.Message}");
                }

                await Task.Delay(currentPollInterval * 1000);
            }
        }
    }
}
