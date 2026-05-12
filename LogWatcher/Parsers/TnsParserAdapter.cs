using System;
using System.Collections.Generic;
using System.IO;
using LogWatcher.Config;
using LogWatcher.Core;

namespace LogWatcher.Parsers
{
    /// <summary>
    /// Wraps the existing PrintLogParser (TNS binary) as an IEquipmentParser.
    /// </summary>
    public class TnsParserAdapter : IEquipmentParser
    {
        private readonly PrintLogParser _inner;
        private readonly string _logPath;

        public string EquipmentId { get; }
        public string Name { get; }

        public TnsParserAdapter(WatcherConfig config, string positionsDir)
        {
            EquipmentId = config.EquipmentId;
            Name = config.Name;
            _logPath = config.GetConfigString("log_path");

            if (string.IsNullOrEmpty(_logPath))
                throw new ArgumentException($"[{EquipmentId}] config.log_path is required for tns parser");

            var positionFile = Path.Combine(positionsDir, $"{EquipmentId}.pos");
            _inner = new PrintLogParser(_logPath, positionFile);
        }

        public List<PrintEvent> ReadNewEntries() => _inner.ReadNewEntries();

        public void ResetPosition() => _inner.ResetPosition();

        public bool IsAccessible() => File.Exists(_logPath);
    }
}
