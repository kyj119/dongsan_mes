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
        // 재전송 중인 이벤트 — 파일에는 계속 남는다(Complete 로 하나씩 빠진다). 2026-09-26 리뷰 #42:
        //   예전 DequeueAll 은 큐를 비우고 **빈 파일을 먼저 저장**해, 스윕 도중 프로세스가 죽거나 PC 가 꺼지면
        //   아직 안 보낸 이벤트가 전부 사라졌다. 다시 보내는 중복은 서버가 (file_path, print_completed_at)로 거른다.
        private readonly List<PrintEvent> _inFlight = new List<PrintEvent>();
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
                _inFlight.AddRange(items);   // 파일에는 그대로 남긴다 — 처리한 것만 Complete 로 뺀다
                _queue.Clear();
                Save();
                return items;
            }
        }

        /// <summary>재전송 1건 처리 끝(성공·폐기·재큐 무엇이든) — 파일의 in-flight 목록에서 뺀다.</summary>
        public void Complete(PrintEvent evt)
        {
            lock (_syncObj)
            {
                if (_inFlight.Remove(evt)) Save();
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
                var all = new List<PrintEvent>(_inFlight);
                all.AddRange(_queue);
                var json = JsonSerializer.Serialize(all, new JsonSerializerOptions { WriteIndented = true });
                File.WriteAllText(_filePath, json);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[QUEUE] Failed to save queue: {ex.Message}");
            }
        }
    }
}
