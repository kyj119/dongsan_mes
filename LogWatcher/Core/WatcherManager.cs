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

            foreach (var watcher in Config.Watchers.Where(w => w.Enabled))
            {
                try
                {
                    var parser = ParserFactory.Create(watcher, _positionsDir);
                    _parsers.Add(parser);
                    _lastHeartbeats[watcher.EquipmentId] = DateTime.MinValue;
                    _backoffCounts[watcher.EquipmentId] = 0;
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

            // Retry queued events
            if (_queue.Count > 0)
            {
                var queued = _queue.DequeueAll();
                foreach (var evt in queued)
                {
                    var sent = await _apiClient.SendEventAsync(evt);
                    if (!sent) _queue.Enqueue(evt);
                }
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
                var sent = await _apiClient.SendEventAsync(evt);
                if (!sent) _queue.Enqueue(evt);
            }

            // Heartbeat
            var hbInterval = Config.HeartbeatIntervalSeconds;
            var lastHb = _lastHeartbeats.GetValueOrDefault(eqId, DateTime.MinValue);
            if ((DateTime.Now - lastHb).TotalSeconds >= hbInterval)
            {
                var isPrinting = events.Count > 0;
                var hbOk = await _apiClient.SendHeartbeatForEquipmentAsync(eqId, isPrinting);
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
