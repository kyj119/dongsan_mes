using OpenCvSharp;
using System;
using System.Collections.Generic;
using System.IO;

namespace IllustratorAutomation
{
    /// <summary>
    /// OpenCV 기반 디자인 바운드 추출기 (Option B: 검증 모드)
    ///
    /// ExtractGroups.jsx가 내보낸 전체 캔버스 PNG를 분석하여
    /// 디자인 그룹의 위치/크기를 추출한다.
    /// JSX Union-Find 결과와 비교·검증하는 용도로 사용.
    /// </summary>
    internal static class BoundsExtractor
    {
        public struct DesignRect
        {
            /// <summary>픽셀 좌표 (PNG 기준, 좌상단 원점)</summary>
            public int X, Y, Width, Height;
            /// <summary>Illustrator 포인트 좌표 (변환 후)</summary>
            public double LeftPt, TopPt, RightPt, BottomPt;
            /// <summary>면적 비율 (0~1)</summary>
            public double AreaRatio;
        }

        /// <summary>
        /// 전체 캔버스 PNG에서 디자인 바운드를 추출한다.
        /// </summary>
        /// <param name="canvasPngPath">전체 캔버스 PNG 경로</param>
        /// <param name="canvasLeftPt">PNG가 커버하는 영역의 Illustrator 좌표 (left)</param>
        /// <param name="canvasTopPt">PNG가 커버하는 영역의 Illustrator 좌표 (top)</param>
        /// <param name="canvasRightPt">PNG가 커버하는 영역의 Illustrator 좌표 (right)</param>
        /// <param name="canvasBottomPt">PNG가 커버하는 영역의 Illustrator 좌표 (bottom, top > bottom)</param>
        /// <param name="debugOutputDir">디버그 이미지 저장 폴더 (null이면 저장 안 함)</param>
        /// <returns>검출된 디자인 목록 (면적 큰 순서)</returns>
        public static List<DesignRect> Extract(
            string canvasPngPath,
            double canvasLeftPt, double canvasTopPt,
            double canvasRightPt, double canvasBottomPt,
            string? debugOutputDir = null)
        {
            var results = new List<DesignRect>();

            if (!File.Exists(canvasPngPath))
            {
                Console.WriteLine($"   ⚠️ [OpenCV] 캔버스 PNG 없음: {canvasPngPath}");
                return results;
            }

            // 4채널(BGRA) 로드 - 알파 채널 활용
            using var src = Cv2.ImRead(canvasPngPath, ImreadModes.Unchanged);
            if (src.Empty())
            {
                Console.WriteLine($"   ⚠️ [OpenCV] PNG 로드 실패: {canvasPngPath}");
                return results;
            }

            int imgW = src.Width;
            int imgH = src.Height;
            Console.WriteLine($"   🔬 [OpenCV] 캔버스: {imgW}x{imgH}px");

            Mat binary;

            if (src.Channels() == 4)
            {
                // 알파 채널 분리 → 불투명 영역 = 디자인
                Mat[] channels = Cv2.Split(src);
                binary = new Mat();
                Cv2.Threshold(channels[3], binary, 1, 255, ThresholdTypes.Binary);
                foreach (var ch in channels) ch.Dispose();
            }
            else
            {
                // 알파 없으면 그레이스케일 → 역이진화 (흰 배경 가정)
                using var gray = new Mat();
                Cv2.CvtColor(src, gray, ColorConversionCodes.BGR2GRAY);
                binary = new Mat();
                Cv2.Threshold(gray, binary, 250, 255, ThresholdTypes.BinaryInv);
            }

            // 모폴로지 팽창: 인접한 요소 연결 (10pt ≈ 3.5mm, 300dpi 기준 ~42px)
            // 실제 DPI: imgW / (canvasWidthPt / 72)
            double canvasWidthPt  = Math.Abs(canvasRightPt - canvasLeftPt);
            double canvasHeightPt = Math.Abs(canvasTopPt - canvasBottomPt);
            double dpiX = canvasWidthPt  > 0 ? imgW / (canvasWidthPt  / 72.0) : 96;
            double dpiY = canvasHeightPt > 0 ? imgH / (canvasHeightPt / 72.0) : 96;
            int kernelPx = Math.Max(3, (int)(10 * dpiX / 72.0)); // 10pt 기준
            Console.WriteLine($"   🔬 [OpenCV] DPI: {dpiX:F0}x{dpiY:F0}, kernel: {kernelPx}px");

            using var kernel = Cv2.GetStructuringElement(
                MorphShapes.Rect, new Size(kernelPx, kernelPx));
            using var dilated = new Mat();
            Cv2.Dilate(binary, dilated, kernel);

            // 컨투어 추출
            Cv2.FindContours(dilated, out Point[][] contours, out _,
                RetrievalModes.External, ContourApproximationModes.ApproxSimple);

            double totalArea = (double)imgW * imgH;
            int margin = (int)(Math.Min(imgW, imgH) * 0.05); // 가장자리 5%

            // 좌표 변환 계수 (픽셀 → Illustrator 포인트)
            // Illustrator: X는 오른쪽 증가, Y는 위쪽 증가 (canvasTop > canvasBottom)
            double scaleX = canvasWidthPt  / imgW;
            double scaleY = canvasHeightPt / imgH;

            foreach (var contour in contours)
            {
                Rect r = Cv2.BoundingRect(contour);
                double areaRatio = (double)(r.Width * r.Height) / totalArea;

                // 면적 필터: 전체의 1%~95%
                if (areaRatio < 0.01 || areaRatio > 0.95) continue;

                // 가장자리 소형 요소 제거 (크롭마크, 재단선 등)
                bool isEdge = r.X < margin || r.Y < margin
                    || r.X + r.Width  > imgW - margin
                    || r.Y + r.Height > imgH - margin;
                if (isEdge && areaRatio < 0.03) continue;

                // 극단적 종횡비 제거 (>20:1 → 재단선)
                double aspect = Math.Max(r.Width, r.Height) / (double)Math.Max(1, Math.Min(r.Width, r.Height));
                if (aspect > 20 && areaRatio < 0.05) continue;

                // 픽셀 → Illustrator 포인트 변환
                // Illustrator Y: top이 크고 bottom이 작음 (위 방향이 양수)
                double leftPt   = canvasLeftPt + r.X * scaleX;
                double topPt    = canvasTopPt  - r.Y * scaleY;        // Y 반전
                double rightPt  = canvasLeftPt + (r.X + r.Width)  * scaleX;
                double bottomPt = canvasTopPt  - (r.Y + r.Height) * scaleY;

                results.Add(new DesignRect
                {
                    X = r.X, Y = r.Y, Width = r.Width, Height = r.Height,
                    LeftPt = leftPt, TopPt = topPt, RightPt = rightPt, BottomPt = bottomPt,
                    AreaRatio = areaRatio
                });
            }

            // 면적 큰 순서로 정렬
            results.Sort((a, b) => b.AreaRatio.CompareTo(a.AreaRatio));

            // 디버그 이미지 저장
            if (debugOutputDir != null && results.Count > 0)
            {
                try
                {
                    using var debug = src.Clone();
                    foreach (var dr in results)
                    {
                        Cv2.Rectangle(debug,
                            new Rect(dr.X, dr.Y, dr.Width, dr.Height),
                            new Scalar(0, 0, 255, 255), 3);
                    }
                    string debugPath = Path.Combine(debugOutputDir, "debug_bounds.png");
                    Cv2.ImWrite(debugPath, debug);
                    Console.WriteLine($"   🔬 [OpenCV] 디버그 이미지: {debugPath}");
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"   ⚠️ [OpenCV] 디버그 이미지 저장 실패: {ex.Message}");
                }
            }

            binary.Dispose();
            return results;
        }

        /// <summary>
        /// OpenCV 결과와 JSX 결과를 비교하여 불일치 비율을 반환한다.
        /// </summary>
        public static double CompareWithJsx(
            DesignRect opencv,
            double jsxWidthPt, double jsxHeightPt)
        {
            double ocvW = Math.Abs(opencv.RightPt  - opencv.LeftPt);
            double ocvH = Math.Abs(opencv.TopPt    - opencv.BottomPt);
            if (jsxWidthPt <= 0 || jsxHeightPt <= 0) return 1.0;

            double diffW = Math.Abs(ocvW - jsxWidthPt)  / jsxWidthPt;
            double diffH = Math.Abs(ocvH - jsxHeightPt) / jsxHeightPt;
            return Math.Max(diffW, diffH); // 최대 편차
        }
    }
}
