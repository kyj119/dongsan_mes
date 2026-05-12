using System;
using System.Collections.Generic;
using System.IO;
using LogWatcher.Config;
using LogWatcher.Core;

namespace LogWatcher.Parsers
{
    /// <summary>
    /// Wraps the existing PrintExpLogParser as an IEquipmentParser.
    /// </summary>
    public class PrintExpParserAdapter : IEquipmentParser
    {
        private readonly PrintExpLogParser _inner;
        private readonly string _logFolder;

        public string EquipmentId { get; }
        public string Name { get; }

        public PrintExpParserAdapter(WatcherConfig config, string positionsDir)
        {
            EquipmentId = config.EquipmentId;
            Name = config.Name;
            _logFolder = config.GetConfigString("log_path");

            if (string.IsNullOrEmpty(_logFolder))
                throw new ArgumentException($"[{EquipmentId}] config.log_path is required for printexp parser");

            var positionFile = Path.Combine(positionsDir, $"{EquipmentId}.pos");
            _inner = new PrintExpLogParser(_logFolder, positionFile);
        }

        public List<PrintEvent> ReadNewEntries() => _inner.ReadNewEntries();

        public void ResetPosition() => _inner.ResetPosition();

        public bool IsAccessible() => Directory.Exists(_logFolder);
    }
}
