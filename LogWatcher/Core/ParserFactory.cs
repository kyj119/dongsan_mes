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
                "flexi_printexp" => new FlexiPrintExpParser(config, positionsDir),
                // TNS 계열: 립(TopazRip) + 실인쇄(PrintExp)가 같은 PC → FIFO+시간창 조인으로 이벤트 1건만 보낸다
                "tns_printexp" => new TnsPrintExpParser(config, positionsDir),
                "text_log" => new TextLogParser(config, positionsDir),
                "neostampa" => new NeoStampaParser(config, positionsDir),
                // 전사 8색: 리핑(neoStampa) + 출력(PrintExp)이 같은 PC → 합쳐서 이벤트 1건만 보낸다
                "neostampa_printexp" => new TransferPressParser(config, positionsDir),
                _ => throw new ArgumentException($"Unknown parser type: '{config.ParserType}' for equipment '{config.EquipmentId}'")
            };
        }
    }
}
