using System.Collections.Generic;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace LogWatcher.Config
{
    /// <summary>
    /// Root configuration loaded from equipment.json
    /// </summary>
    public class EquipmentConfig
    {
        [JsonPropertyName("poll_interval_seconds")]
        public int PollIntervalSeconds { get; set; } = 5;

        [JsonPropertyName("heartbeat_interval_seconds")]
        public int HeartbeatIntervalSeconds { get; set; } = 60;

        [JsonPropertyName("watchers")]
        public List<WatcherConfig> Watchers { get; set; } = new();
    }

    /// <summary>
    /// Per-equipment watcher configuration
    /// </summary>
    public class WatcherConfig
    {
        [JsonPropertyName("equipment_id")]
        public string EquipmentId { get; set; } = "";

        [JsonPropertyName("name")]
        public string Name { get; set; } = "";

        [JsonPropertyName("enabled")]
        public bool Enabled { get; set; } = true;

        [JsonPropertyName("parser_type")]
        public string ParserType { get; set; } = "";

        [JsonPropertyName("config")]
        public JsonElement Config { get; set; }

        /// <summary>
        /// Helper to get a string value from the config object
        /// </summary>
        public string GetConfigString(string key, string defaultValue = "")
        {
            if (Config.ValueKind != JsonValueKind.Object) return defaultValue;
            return Config.TryGetProperty(key, out var val) && val.ValueKind == JsonValueKind.String
                ? val.GetString() ?? defaultValue
                : defaultValue;
        }

        /// <summary>
        /// Helper to get an int value from the config object
        /// </summary>
        public int GetConfigInt(string key, int defaultValue = 0)
        {
            if (Config.ValueKind != JsonValueKind.Object) return defaultValue;
            return Config.TryGetProperty(key, out var val) && val.ValueKind == JsonValueKind.Number
                ? val.GetInt32()
                : defaultValue;
        }

        /// <summary>
        /// Helper to get a bool value from the config object
        /// </summary>
        public bool GetConfigBool(string key, bool defaultValue = false)
        {
            if (Config.ValueKind != JsonValueKind.Object) return defaultValue;
            if (!Config.TryGetProperty(key, out var val)) return defaultValue;
            if (val.ValueKind == JsonValueKind.True) return true;
            if (val.ValueKind == JsonValueKind.False) return false;
            return defaultValue;
        }

        /// <summary>
        /// Helper to get a string array from the config object
        /// </summary>
        public string[] GetConfigStringArray(string key)
        {
            if (Config.ValueKind != JsonValueKind.Object) return System.Array.Empty<string>();
            if (!Config.TryGetProperty(key, out var val) || val.ValueKind != JsonValueKind.Array)
                return System.Array.Empty<string>();
            var list = new List<string>();
            foreach (var item in val.EnumerateArray())
            {
                if (item.ValueKind == JsonValueKind.String)
                    list.Add(item.GetString() ?? "");
            }
            return list.ToArray();
        }
    }
}
