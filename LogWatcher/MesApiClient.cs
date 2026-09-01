using System;
using System.IO;
using System.Collections.Generic;
using System.Net.Http;
using System.Net.Http.Json;
using System.Text.Json;
using System.Threading.Tasks;

namespace LogWatcher
{
    /// <summary>
    /// 이벤트 전송 결과. bool(성공/실패)로는 "영영 안 될 실패(4xx)"와 "나중에 될 실패(서버다운)"를
    /// 구분 못 해 4xx/5xx 이벤트가 5초 큐 루프를 영구 회전시켰다(2026-08 Cloudflare 과금 사고:
    /// 서버의 D1 LIKE 50바이트 한도 500 응답 × 재시도 큐 = 일 270만 요청). 반드시 구분해 처리할 것.
    /// </summary>
    public enum SendResult
    {
        Sent,             // 2xx — 완료
        Rejected,         // 4xx(429 제외) — 재시도해도 영영 안 됨 → 폐기
        RetryServerError, // 5xx·429 — 재시도하되 독성 이벤트 상한(RetryCount) 적용
        RetryNetwork      // 네트워크/타임아웃 — 서버 다운은 이벤트 잘못이 아님 → 상한 미적용
    }

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
        public async Task<SendResult> SendEventAsync(PrintEvent evt)
        {
            try
            {
                var payload = new
                {
                    agent_id = _agentId,
                    // universal 모드: 공유 클라이언트의 _equipmentId가 비어 NULL로 가던 회귀 수정 → 이벤트 귀속 장비 우선
                    equipment_id = !string.IsNullOrEmpty(evt.EquipmentId) ? evt.EquipmentId
                                   : (string.IsNullOrEmpty(_equipmentId) ? null : _equipmentId),
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
                    file_seq = evt.FileSeq,
                    // 네스팅 분해 (Flexi 자체 RIP 네스팅) — 멤버 파일명 목록
                    nest_members = evt.IsNest ? evt.NestMembers : null,
                    nest_declared_count = evt.IsNest ? evt.NestDeclaredCount : (int?)null,
                    // RIP 전용 이벤트 구분 — 서버가 PRINT_DONE·리포트 집계에서 제외한다(이중계상 방지)
                    event_kind = evt.EventKind
                };

                var response = await _http.PostAsJsonAsync($"{_baseUrl}/api/print-events", payload);

                if (response.IsSuccessStatusCode)
                {
                    Console.WriteLine($"[API] Sent: {evt.FileName} ({evt.PrintStatus})");
                    return SendResult.Sent;
                }

                var body = await response.Content.ReadAsStringAsync();
                var code = (int)response.StatusCode;
                if (code >= 400 && code < 500 && code != 429)
                {
                    // 유효성 거부 — 몇 번을 다시 보내도 결과가 같다. 큐에 넣으면 영구 루프.
                    Console.WriteLine($"[API] Rejected ({response.StatusCode}) — dropping: {evt.FileName} / {body}");
                    return SendResult.Rejected;
                }
                Console.WriteLine($"[API] Server error ({response.StatusCode}), will retry: {evt.FileName} / {body}");
                return SendResult.RetryServerError;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[API] Network error, will retry: {ex.Message}");
                return SendResult.RetryNetwork;
            }
        }

        // 키트 지문 — bin\version.txt("kit git=<sha> built=<시각>") 를 한 번만 읽어 둔다.
        // ★ 이게 없으면 「그 PC 에 [2] 가 돌았는가」를 Z: 수거 폴더로 추측해야 하고, 그 추측은 틀린다
        //   (2026-09-01: 폴더가 비어도 갱신된 PC 3대 / 실행했다는데 흔적 없는 PC 1대).
        private static string? _kitVersion;
        private static string KitVersion
        {
            get
            {
                if (_kitVersion != null) return _kitVersion;
                try
                {
                    var p = Path.Combine(AppContext.BaseDirectory, "version.txt");
                    _kitVersion = File.Exists(p) ? File.ReadAllText(p).Trim() : "";
                }
                catch { _kitVersion = ""; }
                if (_kitVersion.Length > 120) _kitVersion = _kitVersion.Substring(0, 120);
                return _kitVersion;
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
                    kit_version = KitVersion,
                    parser_type = "legacy",
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
        public async Task<bool> SendHeartbeatForEquipmentAsync(string equipmentId, string? equipmentName, string? printLogPath, bool isPrinting = false, string? parserType = null)
        {
            try
            {
                var payload = new
                {
                    agent_id = _agentId,
                    equipment_id = equipmentId,
                    equipment_name = equipmentName,
                    print_log_path = printLogPath,
                    agent_version = "2.0.0",
                    kit_version = KitVersion,
                    parser_type = parserType ?? "",
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
