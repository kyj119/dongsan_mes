using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Threading.Tasks;
using LogWatcher.Config;

namespace LogWatcher.Core
{
    /// <summary>
    /// Manages multiple equipment parsers, polls them, and dispatches events.
    /// </summary>
    public class WatcherManager
    {
        private readonly List<IEquipmentParser> _parsers = new();
        private readonly MesApiClient _apiClient;
        private readonly EventQueue _queue;
        private readonly string _positionsDir;
        private readonly Dictionary<string, DateTime> _lastHeartbeats = new();
        private readonly Dictionary<string, int> _backoffCounts = new();
        private readonly Dictionary<string, WatcherConfig> _configs = new();

        // 재시도 큐 백오프 — 전송이 하나도 성공 못 한 스윕이 이어지면 다음 스윕을 지수적으로 미룬다.
        // (5초 폴링 주기 그대로 큐를 돌리면 서버 장애 동안 초당 수십 요청이 나가 과금·부하를 키운다)
        private const int POISON_RETRY_LIMIT = 300;   // 서버 5xx 재시도 상한 — 초과 = 독성 이벤트로 폐기
        private DateTime _nextRetrySweepAt = DateTime.MinValue;
        private int _retrySweepFailStreak = 0;

        public EquipmentConfig Config { get; private set; } = new();
        public int ParserCount => _parsers.Count;

        public WatcherManager(MesApiClient apiClient, EventQueue queue, string positionsDir)
        {
            _apiClient = apiClient;
            _queue = queue;
            _positionsDir = positionsDir;

            if (!Directory.Exists(_positionsDir))
                Directory.CreateDirectory(_positionsDir);
        }

        /// <summary>
        /// Load equipment.json and create parser instances for enabled watchers.
        /// </summary>
        public void LoadConfig(string configPath)
        {
            if (!File.Exists(configPath))
                throw new FileNotFoundException($"equipment.json not found: {configPath}");

            var json = File.ReadAllText(configPath);
            Config = JsonSerializer.Deserialize<EquipmentConfig>(json)
                ?? throw new InvalidOperationException("Failed to parse equipment.json");

            _parsers.Clear();
            _lastHeartbeats.Clear();
            _backoffCounts.Clear();
            _configs.Clear();

            foreach (var watcher in Config.Watchers.Where(w => w.Enabled))
            {
                try
                {
                    var parser = ParserFactory.Create(watcher, _positionsDir);
                    _parsers.Add(parser);
                    _lastHeartbeats[watcher.EquipmentId] = DateTime.MinValue;
                    _backoffCounts[watcher.EquipmentId] = 0;
                    _configs[watcher.EquipmentId] = watcher;
                    Console.WriteLine($"[INIT] {watcher.EquipmentId}: {watcher.Name} ({watcher.ParserType})");
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"[INIT] FAILED {watcher.EquipmentId}: {ex.Message}");
                }
            }

            Console.WriteLine($"[INIT] {_parsers.Count} equipment parser(s) loaded");
        }

        /// <summary>
        /// Poll all parsers once, send events and heartbeats.
        /// </summary>
        public async Task PollAllAsync()
        {
            foreach (var parser in _parsers)
            {
                try
                {
                    await PollSingleAsync(parser);
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"[{parser.EquipmentId}] Poll error: {ex.Message}");
                    IncrementBackoff(parser.EquipmentId);
                }
            }

            // Retry queued events (백오프 창 안이면 이번 폴링은 건너뛴다)
            if (_queue.Count > 0 && DateTime.Now >= _nextRetrySweepAt)
            {
                var queued = _queue.DequeueAll();
                var anySent = false;
                foreach (var evt in queued)
                {
                    if (HandleSendResult(evt, await _apiClient.SendEventAsync(evt))) anySent = true;
                }

                if (anySent)
                {
                    _retrySweepFailStreak = 0;
                    _nextRetrySweepAt = DateTime.MinValue;
                }
                else
                {
                    // 전부 실패 — 5s → 10s → 20s … 최대 10분 간격으로 물러난다
                    _retrySweepFailStreak = Math.Min(_retrySweepFailStreak + 1, 7);
                    var delaySec = Math.Min(5 * Math.Pow(2, _retrySweepFailStreak), 600);
                    _nextRetrySweepAt = DateTime.Now.AddSeconds(delaySec);
                    if (_queue.Count > 0)
                        Console.WriteLine($"[QUEUE] All retries failed ({_queue.Count} queued) — next sweep in {delaySec:F0}s");
                }
            }
        }

        /// <summary>
        /// 전송 결과 공통 처리. true = 성공. 실패는 종류별로:
        /// 4xx = 폐기(재시도 무의미), 5xx = 상한부 재큐(독성 이벤트 차단), 네트워크 = 무상한 재큐.
        /// </summary>
        private bool HandleSendResult(PrintEvent evt, SendResult result)
        {
            switch (result)
            {
                case SendResult.Sent:
                    return true;
                case SendResult.Rejected:
                    Console.WriteLine($"[QUEUE] Dropped (server rejected): {evt.FileName}");
                    return false;
                case SendResult.RetryServerError:
                    evt.RetryCount++;
                    if (evt.RetryCount > POISON_RETRY_LIMIT)
                    {
                        Console.WriteLine($"[QUEUE] Dropped (poison, {evt.RetryCount} server errors): {evt.FileName}");
                        return false;
                    }
                    _queue.Enqueue(evt);
                    return false;
                default: // RetryNetwork — 서버 다운은 이벤트 잘못이 아니므로 상한 없이 보존
                    _queue.Enqueue(evt);
                    return false;
            }
        }

        private async Task PollSingleAsync(IEquipmentParser parser)
        {
            var eqId = parser.EquipmentId;

            // Check accessibility
            if (!parser.IsAccessible())
            {
                if (_backoffCounts.GetValueOrDefault(eqId) == 0)
                    Console.WriteLine($"[{eqId}] Data source not accessible, skipping");
                IncrementBackoff(eqId);
                return;
            }

            // Read new entries
            var events = parser.ReadNewEntries();

            if (events.Count > 0)
            {
                Console.WriteLine($"[{eqId}] {events.Count} new event(s)");
                ResetBackoff(eqId);
            }

            // Send events
            foreach (var evt in events)
            {
                evt.EquipmentId = eqId; // universal 모드: 이벤트에 장비 귀속 (페이로드 equipment_id)
                HandleSendResult(evt, await _apiClient.SendEventAsync(evt));
            }

            // Heartbeat
            var hbInterval = Config.HeartbeatIntervalSeconds;
            var lastHb = _lastHeartbeats.GetValueOrDefault(eqId, DateTime.MinValue);
            if ((DateTime.Now - lastHb).TotalSeconds >= hbInterval)
            {
                var isPrinting = events.Count > 0;
                var cfg = _configs.GetValueOrDefault(eqId);
                // 파서마다 config 키 이름이 다르다. 없는 키만 보면 /equipment 의 로그경로가 빈칸이 되어
                // "경로 설정이 안 됐나" 로 오독된다 → 폴더감시형 파서의 키도 폴백에 넣는다.
                var logPath = cfg?.GetConfigString("log_path") ?? "";
                if (string.IsNullOrEmpty(logPath)) logPath = cfg?.GetConfigString("db_path") ?? "";
                if (string.IsNullOrEmpty(logPath)) logPath = cfg?.GetConfigString("print_log_dir") ?? "";
                if (string.IsNullOrEmpty(logPath)) logPath = cfg?.GetConfigString("log_root") ?? "";
                if (string.IsNullOrEmpty(logPath)) logPath = cfg?.GetConfigString("rip_log_root") ?? "";
                var hbOk = await _apiClient.SendHeartbeatForEquipmentAsync(eqId, parser.Name, logPath, isPrinting);
                if (hbOk) _lastHeartbeats[eqId] = DateTime.Now;
            }
        }

        /// <summary>
        /// Test mode: parse and display events for a specific equipment without sending.
        /// </summary>
        public void TestEquipment(string? equipmentId = null)
        {
            var parsers = equipmentId == null
                ? _parsers
                : _parsers.Where(p => p.EquipmentId.Equals(equipmentId, StringComparison.OrdinalIgnoreCase)).ToList();

            if (parsers.Count == 0)
            {
                Console.WriteLine($"[TEST] No parser found for equipment: {equipmentId ?? "(all)"}");
                return;
            }

            foreach (var parser in parsers)
            {
                Console.WriteLine($"\n=== {parser.EquipmentId}: {parser.Name} ===");
                Console.WriteLine($"  Accessible: {parser.IsAccessible()}");

                parser.ResetPosition();
                var events = parser.ReadNewEntries();
                Console.WriteLine($"  Events found: {events.Count}");

                foreach (var evt in events)
                {
                    Console.WriteLine($"  [{evt.PrintStatus}] {evt.FileName}");
                    if (!string.IsNullOrEmpty(evt.OutputSize))
                        Console.WriteLine($"    Size: {evt.OutputSize}");
                    if (!string.IsNullOrEmpty(evt.PrintCompletedAt))
                        Console.WriteLine($"    Completed: {evt.PrintCompletedAt}");
                    if (evt.OrderNumber != null)
                        Console.WriteLine($"    Order: {evt.OrderNumber}  FileSeq: {evt.FileSeq}");
                    if (evt.IsNest)
                    {
                        var ok = evt.NestDeclaredCount == evt.NestMembers.Count ? "OK" : "MISMATCH";
                        Console.WriteLine($"    [NEST] 선언 {evt.NestDeclaredCount} / 복원 {evt.NestMembers.Count}  → {ok}");
                        foreach (var m in evt.NestMembers)
                            Console.WriteLine($"       - {System.IO.Path.GetFileName(m.file)}  [{m.w:F0}x{m.h:F0}mm ×{m.qty}]");
                    }
                }
            }
        }

        /// <summary>
        /// List all configured equipment and their status.
        /// </summary>
        public void ListEquipment()
        {
            Console.WriteLine($"\n{"ID",-12} {"Name",-30} {"Type",-12} {"Status",-10}");
            Console.WriteLine(new string('-', 70));
            foreach (var parser in _parsers)
            {
                var status = parser.IsAccessible() ? "OK" : "OFFLINE";
                Console.WriteLine($"{parser.EquipmentId,-12} {parser.Name,-30} {"",-12} {status,-10}");
            }
        }

        private void IncrementBackoff(string eqId)
        {
            _backoffCounts[eqId] = _backoffCounts.GetValueOrDefault(eqId) + 1;
        }

        private void ResetBackoff(string eqId)
        {
            if (_backoffCounts.GetValueOrDefault(eqId) > 0)
            {
                Console.WriteLine($"[{eqId}] Recovered after {_backoffCounts[eqId]} failures");
                _backoffCounts[eqId] = 0;
            }
        }
    }
}
