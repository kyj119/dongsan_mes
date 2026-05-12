using System;
using System.Collections.Generic;
using System.Net.Http;
using System.Net.Http.Json;
using System.Text.Json;
using System.Threading.Tasks;

namespace LogWatcher
{
    public class MesApiClient
    {
        private readonly HttpClient _http;
        private readonly string _baseUrl;
        private readonly string _agentId;
        private readonly string _equipmentId;

        public MesApiClient(string baseUrl, string apiKey, string agentId, string equipmentId = "")
        {
            _baseUrl = baseUrl.TrimEnd('/');
            _agentId = agentId;
            _equipmentId = equipmentId;
            _http = new HttpClient();
            _http.DefaultRequestHeaders.Add("X-Agent-Key", apiKey);
            _http.Timeout = TimeSpan.FromSeconds(10);
        }

        /// <summary>
        /// Send a single print event to MES.
        /// </summary>
        public async Task<bool> SendEventAsync(PrintEvent evt)
        {
            try
            {
                var payload = new
                {
                    agent_id = _agentId,
                    equipment_id = string.IsNullOrEmpty(_equipmentId) ? null : _equipmentId,
                    file_path = evt.FilePath,
                    file_name = evt.FileName,
                    printer_name = evt.PrinterName,
                    print_status = evt.PrintStatus,
                    print_started_at = evt.PrintStartedAt,
                    print_completed_at = evt.PrintCompletedAt,
                    output_width = evt.OutputWidth,
                    output_height = evt.OutputHeight,
                    dpi = evt.Dpi,
                    copy_columns = evt.CopyColumns,
                    copy_rows = evt.CopyRows,
                    copy_total = evt.CopyTotal,
                    tile_count = evt.TileCount,
                    tile_index = evt.TileIndex,
                    file_seq = evt.FileSeq
                };

                var response = await _http.PostAsJsonAsync($"{_baseUrl}/api/print-events", payload);

                if (response.IsSuccessStatusCode)
                {
                    Console.WriteLine($"[API] Sent: {evt.FileName} ({evt.PrintStatus})");
                    return true;
                }
                else
                {
                    var body = await response.Content.ReadAsStringAsync();
                    Console.WriteLine($"[API] Failed ({response.StatusCode}): {body}");
                    return false;
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[API] Error: {ex.Message}");
                return false;
            }
        }

        /// <summary>
        /// Send heartbeat to MES.
        /// </summary>
        public async Task<bool> SendHeartbeatAsync(string printLogPath, bool isPrinting = false)
        {
            try
            {
                var payload = new
                {
                    agent_id = _agentId,
                    equipment_id = string.IsNullOrEmpty(_equipmentId) ? null : _equipmentId,
                    agent_version = "1.1.0",
                    ip_address = GetLocalIp(),
                    print_log_path = printLogPath,
                    is_printing = isPrinting
                };

                using var cts = new System.Threading.CancellationTokenSource(TimeSpan.FromSeconds(5));
                var response = await _http.PostAsJsonAsync($"{_baseUrl}/api/print-events/heartbeat", payload, cts.Token);
                return response.IsSuccessStatusCode;
            }
            catch (OperationCanceledException)
            {
                Console.WriteLine("[HEARTBEAT] Timeout (5s)");
                return false;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[HEARTBEAT] Error: {ex.Message}");
                return false;
            }
        }

        private string GetLocalIp()
        {
            try
            {
                var host = System.Net.Dns.GetHostEntry(System.Net.Dns.GetHostName());
                foreach (var ip in host.AddressList)
                {
                    if (ip.AddressFamily == System.Net.Sockets.AddressFamily.InterNetwork)
                        return ip.ToString();
                }
            }
            catch { }
            return "unknown";
        }

        /// <summary>
        /// Send heartbeat for a specific equipment (used by WatcherManager).
        /// </summary>
        public async Task<bool> SendHeartbeatForEquipmentAsync(string equipmentId, bool isPrinting = false)
        {
            try
            {
                var payload = new
                {
                    agent_id = _agentId,
                    equipment_id = equipmentId,
                    agent_version = "2.0.0",
                    ip_address = GetLocalIp(),
                    is_printing = isPrinting
                };

                using var cts = new System.Threading.CancellationTokenSource(TimeSpan.FromSeconds(5));
                var response = await _http.PostAsJsonAsync($"{_baseUrl}/api/print-events/heartbeat", payload, cts.Token);
                return response.IsSuccessStatusCode;
            }
            catch (OperationCanceledException)
            {
                Console.WriteLine($"[HEARTBEAT] {equipmentId}: Timeout (5s)");
                return false;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[HEARTBEAT] {equipmentId}: {ex.Message}");
                return false;
            }
        }

        /// <summary>
        /// Fetch pending RIP jobs (item-level) for the given equipment from MES.
        /// Uses /api/rip/pending-items endpoint (아이템 단위 전송).
        /// </summary>
        public async Task<List<PendingJob>> GetPendingJobsAsync(string equipmentId)
        {
            try
            {
                var response = await _http.GetAsync($"{_baseUrl}/api/rip/pending-items?equipment_id={Uri.EscapeDataString(equipmentId)}");
                if (!response.IsSuccessStatusCode) return new List<PendingJob>();
                var json = await response.Content.ReadAsStringAsync();
                var doc = JsonDocument.Parse(json);
                var result = new List<PendingJob>();
                if (doc.RootElement.TryGetProperty("data", out var dataArr) && dataArr.ValueKind == JsonValueKind.Array)
                {
                    foreach (var item in dataArr.EnumerateArray())
                    {
                        result.Add(new PendingJob
                        {
                            CardItemId = item.GetProperty("card_item_id").GetInt32(),
                            CardId = item.GetProperty("card_id").GetInt32(),
                            CardNumber = item.GetProperty("card_number").GetString() ?? "",
                            SourceFilePath = item.TryGetProperty("source_file_path", out var sfp) ? sfp.GetString() ?? "" : "",
                            RipPreset = item.TryGetProperty("rip_preset", out var rp) ? rp.GetString() ?? "" : "",
                            RipFilename = item.TryGetProperty("rip_filename", out var rf) ? rf.GetString() ?? "" : "",
                            ItemName = item.TryGetProperty("item_name", out var iname) ? iname.GetString() ?? "" : "",
                            Width = item.TryGetProperty("width", out var w) ? w.GetDouble() : 0,
                            Height = item.TryGetProperty("height", out var h) ? h.GetDouble() : 0,
                            ScaleFactor = item.TryGetProperty("scale_factor", out var sf) ? sf.GetDouble() : 1,
                            Quantity = item.TryGetProperty("quantity", out var q) ? q.GetInt32() : 1
                        });
                    }
                }
                return result;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[API] GetPendingJobs error: {ex.Message}");
                return new List<PendingJob>();
            }
        }

        /// <summary>
        /// Notify MES that a .job file has been created for the given card item.
        /// Uses /api/rip/ack-item endpoint (아이템 단위 ACK).
        /// </summary>
        public async Task<bool> AckJobAsync(int cardItemId, string jobPath)
        {
            try
            {
                var payload = new { job_path = jobPath };
                var response = await _http.PostAsJsonAsync($"{_baseUrl}/api/rip/ack-item/{cardItemId}", payload);
                return response.IsSuccessStatusCode;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[API] AckJob error: {ex.Message}");
                return false;
            }
        }

        /// <summary>
        /// Report a job creation failure to MES (increments retry_count, marks ERROR after 5 failures).
        /// Uses /api/rip/fail-item endpoint.
        /// </summary>
        public async Task<bool> FailItemAsync(int cardItemId, string reason)
        {
            try
            {
                var payload = new { reason = reason ?? "unknown" };
                var response = await _http.PostAsJsonAsync($"{_baseUrl}/api/rip/fail-item/{cardItemId}", payload);
                return response.IsSuccessStatusCode;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[API] FailItem error: {ex.Message}");
                return false;
            }
        }
    }

    public class PendingJob
    {
        public int CardItemId { get; set; }
        public int CardId { get; set; }
        public string CardNumber { get; set; } = "";
        public string ItemName { get; set; } = "";
        public string SourceFilePath { get; set; } = "";
        public string RipPreset { get; set; } = "";
        public string RipFilename { get; set; } = "";
        public double Width { get; set; }
        public double Height { get; set; }
        public double ScaleFactor { get; set; } = 1;
        public int Quantity { get; set; } = 1;
    }
}
