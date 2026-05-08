using OpenCvSharp;
using System;
using System.Collections.Generic;
using System.IO;
using System.Text;

namespace IllustratorAutomation
{
    /// <summary>
    /// 디자인 PNG 썸네일의 4변 가장자리 평균 색상 추출기.
    /// 시트 배치 시 인접 디자인 엣지 색상 비교 → 도련 필요 여부 자동 판단에 사용.
    /// </summary>
    internal static class EdgeColorExtractor
    {
        private const int STRIP_PX = 3; // 가장자리 스트립 두께 (px)

        public struct EdgeColors
        {
            public int Index;
            public int[] Top;    // [R, G, B]
            public int[] Bottom;
            public int[] Left;
            public int[] Right;
        }

        /// <summary>
        /// ExtractGroups가 생성한 PNG 썸네일들에서 4변 엣지 색상을 추출하고 JSON으로 저장한다.
        /// </summary>
        public static List<EdgeColors> Extract(string outputDir, string reqId, int groupCount)
        {
            var results = new List<EdgeColors>();

            for (int i = 0; i < groupCount; i++)
            {
                string pngPath = Path.Combine(outputDir, $"{reqId}-{i}.png");
                var edge = new EdgeColors { Index = i };

                if (!File.Exists(pngPath))
                {
                    // PNG 없으면 기본 흰색
                    edge.Top = edge.Bottom = edge.Left = edge.Right = new[] { 255, 255, 255 };
                    results.Add(edge);
                    continue;
                }

                try
                {
                    using var img = Cv2.ImRead(pngPath, ImreadModes.Unchanged);
                    if (img.Empty())
                    {
                        edge.Top = edge.Bottom = edge.Left = edge.Right = new[] { 255, 255, 255 };
                        results.Add(edge);
                        continue;
                    }

                    int h = img.Height, w = img.Width;
                    int stripH = Math.Min(STRIP_PX, h);
                    int stripW = Math.Min(STRIP_PX, w);
                    bool hasAlpha = img.Channels() == 4;

                    // 상단 스트립
                    using var topStrip = new Mat(img, new Rect(0, 0, w, stripH));
                    edge.Top = MeanColor(topStrip, hasAlpha);

                    // 하단 스트립
                    using var bottomStrip = new Mat(img, new Rect(0, h - stripH, w, stripH));
                    edge.Bottom = MeanColor(bottomStrip, hasAlpha);

                    // 좌측 스트립
                    using var leftStrip = new Mat(img, new Rect(0, 0, stripW, h));
                    edge.Left = MeanColor(leftStrip, hasAlpha);

                    // 우측 스트립
                    using var rightStrip = new Mat(img, new Rect(w - stripW, 0, stripW, h));
                    edge.Right = MeanColor(rightStrip, hasAlpha);
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"   ⚠️ [EdgeColor] PNG 분석 실패 [{i}]: {ex.Message}");
                    edge.Top = edge.Bottom = edge.Left = edge.Right = new[] { 255, 255, 255 };
                }

                results.Add(edge);
            }

            // JSON 저장
            string jsonPath = Path.Combine(outputDir, $"{reqId}-edges.json");
            try
            {
                var sb = new StringBuilder("[");
                for (int i = 0; i < results.Count; i++)
                {
                    if (i > 0) sb.Append(',');
                    var e = results[i];
                    sb.Append($"{{\"index\":{e.Index}");
                    sb.Append($",\"top\":[{e.Top[0]},{e.Top[1]},{e.Top[2]}]");
                    sb.Append($",\"bottom\":[{e.Bottom[0]},{e.Bottom[1]},{e.Bottom[2]}]");
                    sb.Append($",\"left\":[{e.Left[0]},{e.Left[1]},{e.Left[2]}]");
                    sb.Append($",\"right\":[{e.Right[0]},{e.Right[1]},{e.Right[2]}]}}");
                }
                sb.Append(']');
                File.WriteAllText(jsonPath, sb.ToString(), Encoding.UTF8);
                Console.WriteLine($"   🎨 [EdgeColor] {results.Count}개 디자인 엣지 색상 → {Path.GetFileName(jsonPath)}");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"   ⚠️ [EdgeColor] JSON 저장 실패: {ex.Message}");
            }

            return results;
        }

        /// <summary>
        /// Mat 영역의 평균 색상을 [R, G, B]로 반환. 투명 영역은 흰색 처리.
        /// </summary>
        private static int[] MeanColor(Mat strip, bool hasAlpha)
        {
            Scalar mean = Cv2.Mean(strip);

            if (hasAlpha && mean[3] < 128)
            {
                // 투명 → 용지색(흰색)
                return new[] { 255, 255, 255 };
            }

            // OpenCV: BGRA → RGB
            return new[]
            {
                Math.Clamp((int)Math.Round(mean[2]), 0, 255), // R
                Math.Clamp((int)Math.Round(mean[1]), 0, 255), // G
                Math.Clamp((int)Math.Round(mean[0]), 0, 255)  // B
            };
        }
    }
}
