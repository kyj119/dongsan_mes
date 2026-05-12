using System.Collections.Generic;

namespace LogWatcher.Core
{
    /// <summary>
    /// Extended parser interface for the universal LogWatcher.
    /// Each equipment type implements this to parse its specific log format.
    ///
    /// Note: The legacy ILogParser interface (in PrintLogParser.cs) is preserved
    /// for backward compatibility. New parsers implement IEquipmentParser.
    /// </summary>
    public interface IEquipmentParser
    {
        /// <summary>Equipment ID from config (e.g., "EPSON-01")</summary>
        string EquipmentId { get; }

        /// <summary>Human-readable equipment name</summary>
        string Name { get; }

        /// <summary>Read new entries since last position. Returns empty list if nothing new.</summary>
        List<PrintEvent> ReadNewEntries();

        /// <summary>Reset position to start (re-read all)</summary>
        void ResetPosition();

        /// <summary>Check if the data source (file/DB) is accessible</summary>
        bool IsAccessible();
    }
}
