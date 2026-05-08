using System;
using System.Collections.Generic;
using System.IO;
using System.Text.Json;

namespace LogWatcher
{
    /// <summary>
    /// Offline queue for events that failed to send.
    /// Persists to a JSON file so events survive restarts.
    /// </summary>
    public class EventQueue
    {
        private readonly string _filePath;
        private readonly List<PrintEvent> _queue;
        private readonly object _syncObj = new object();
        private const int MAX_QUEUE_SIZE = 1000;

        public int Count => _queue.Count;

        public EventQueue(string filePath)
        {
            _filePath = filePath;
            _queue = Load();
        }

        public void Enqueue(PrintEvent evt)
        {
            lock (_syncObj)
            {
                if (_queue.Count >= MAX_QUEUE_SIZE)
                {
                    var removed = _queue[0];
                    _queue.RemoveAt(0);
                    Console.WriteLine($"[QUEUE] Overflow: dropped oldest event ({removed.FileName})");
                }
                _queue.Add(evt);
                Save();
                Console.WriteLine($"[QUEUE] Event queued (total: {_queue.Count}): {evt.FileName}");
            }
        }

        public List<PrintEvent> DequeueAll()
        {
            lock (_syncObj)
            {
                var items = new List<PrintEvent>(_queue);
                _queue.Clear();
                Save();
                return items;
            }
        }

        private List<PrintEvent> Load()
        {
            try
            {
                if (File.Exists(_filePath))
                {
                    var json = File.ReadAllText(_filePath);
                    return JsonSerializer.Deserialize<List<PrintEvent>>(json) ?? new List<PrintEvent>();
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[QUEUE] Failed to load queue: {ex.Message}");
            }
            return new List<PrintEvent>();
        }

        private void Save()
        {
            try
            {
                var json = JsonSerializer.Serialize(_queue, new JsonSerializerOptions { WriteIndented = true });
                File.WriteAllText(_filePath, json);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[QUEUE] Failed to save queue: {ex.Message}");
            }
        }
    }
}
