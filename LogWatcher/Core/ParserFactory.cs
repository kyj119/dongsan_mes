using System;
using LogWatcher.Config;
using LogWatcher.Parsers;

namespace LogWatcher.Core
{
    /// <summary>
    /// Creates IEquipmentParser instances based on parser_type in config.
    /// </summary>
    public static class ParserFactory
    {
        public static IEquipmentParser Create(WatcherConfig config, string positionsDir)
        {
            return config.ParserType switch
            {
                "tns" => new TnsParserAdapter(config, positionsDir),
                "printexp" => new PrintExpParserAdapter(config, positionsDir),
                "epson" => new SqliteDbParser(config, positionsDir),
                "flexi" => new FlexiHtmlParser(config, positionsDir),
                _ => throw new ArgumentException($"Unknown parser type: '{config.ParserType}' for equipment '{config.EquipmentId}'")
            };
        }
    }
}
