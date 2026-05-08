# IllustratorAutomat

ERP+MES 시스템의 주문/AI 요청을 폴링하여 Adobe Illustrator COM 자동화로 PDF를 생성하는 서비스.

## 빌드 & 실행

```bash
cd C:\Users\user\dongsan_mes\IllustratorAutomat
dotnet publish -c Release -r win-x64 --self-contained true -o publish
# 실행: publish\IllustratorAutomat.exe 더블클릭
```

> **JSX만 수정할 경우**: 재빌드 불필요 — `publish\` 폴더의 JSX 직접 수정 후 Automat 재시작

## JSX 스크립트 3종

| 파일 | 호출 시점 | 출력 |
|------|---------|------|
| `ExtractGroups.jsx` | AI 분석 요청 (pending) | PNG 썸네일 + groups.json |
| `ProcessOrderItem.jsx` | 주문 CONFIRMED | PDF + PNG |
| `PackGroups.jsx` | AI 레이아웃 요청 (pending) | PDF x 2 + 썸네일 PNG |

### 공통 자동 처리
- CMYK 변환: RGB 파일 자동 감지 → `doc-color-cmyk` 실행
- 텍스트 아웃라인: `textFrames` 역순 `createOutline()`
- 파라미터 전달: C#이 `publish\ia_params.json` 기록 → JSX가 읽음

## 폴링 흐름 (5초 주기)

```
PollOrdersAsync()     → GET /api/orders?status=CONFIRMED → ProcessOrderItem.jsx
PollAIAnalysisAsync() → GET /api/ai-analysis?status=pending → ExtractGroups.jsx
PollAILayoutAsync()   → GET /api/ai-layout?status=pending → PackGroups.jsx
```

## 그룹 추출 기준

- **기준**: 레이어 직속 GroupItem (`parent.typename === "Layer"`)
- **크기**: 아트보드가 아닌 그룹 bounds 사용
- **클리핑 마스크**: `clip path (clipping===true)` PathItem의 geometricBounds
- **비클리핑**: `group.visibleBounds`
- **Pass 2 형제 보정**: HIGH confidence 평균 대비 >115% 또는 <50% 이상치 보정

## 로그 파일

| 파일 | 내용 |
|------|------|
| `publish\ia_debug.log` | ProcessOrderItem 파라미터/바운드 |
| `publish\ia_error.log` | ExtractGroups/ProcessOrderItem 예외 |
| `publish\ia_diag.log` | ExtractGroups 클리핑 마스크 진단 |
| `publish\error.log` | PackGroups 예외 |

## 환경

- Windows 10/11 (64bit)
- .NET 8.0 SDK
- Adobe Illustrator CC 2020+
- ERP API: `http://192.168.0.94:3000`
- NAS: `Z:\` → `\\192.168.0.122\...` (PDF 출력 저장)
