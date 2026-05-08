# 시트배치 인터랙티브 도련 설계서

> 작성일: 2026-04-29
> 상태: Draft

## 1. 개요

### 목적
시트배치 미리보기에서 디자이너가 인접 경계의 도련(간격) 추가/제거와 아이템 180° 회전을 직접 판단하고 적용할 수 있는 인터랙티브 UI 추가.

### 배경
- 시트 재단 시 인접 아이템 경계에서 색상이 다르면 백지/색상 침범 문제 발생
- 같은 색 경계: 간격 불필요 (소재 절약)
- 다른 색 경계: 3mm 간격 + 양쪽 도련 필요
- 180° 회전으로 경계 색상을 맞출 수 있는 경우도 있음
- **이 판단은 디자이너가 가장 정확** → UI로 지원

### 핵심 원칙
- 기존 배치 알고리즘(shelf, 공간 최적) 변경 없음
- 디자이너가 미리보기에서 클릭으로 간격/회전 결정
- 외곽 도련은 항상 자동 적용
- 간격이 있는 경계에 양쪽 도련 스트립 자동 생성

## 2. 현재 시스템 구조

```
주문서 (orderForm.js)
  ├─ "시트 배치" 탭
  │   ├─ 품목 리스트 + 수량 설정
  │   ├─ 롤 폭 / 스케일 설정
  │   ├─ calculateAndPreviewSheet() → shelf bin-packing
  │   ├─ 캔버스 미리보기 (canvas 렌더링)
  │   └─ confirmSheetLayout() → sheet_layout_params JSON 저장
  │
  ├─ 저장 시: orders.sheet_layout_params (TEXT)
  └─ IA 처리: ai_layout_requests → Program.cs → SheetLayout.jsx
```

### 관련 파일
| 파일 | 역할 |
|------|------|
| `src/pages/orderForm.ts` | 시트배치 탭 HTML (line 140~228) |
| `src/scripts/orderForm.js` | 시트배치 로직 (line 1685~2316) |
| `src/routes/orders/core.ts` | 주문 저장/조회 (sheet_layout_params) |
| `src/routes/aiLayout.ts` | IA 레이아웃 태스크 큐 |
| `IllustratorAutomat/SheetLayout.jsx` | 시트 EPS/DXF/JPG 생성 |
| `IllustratorAutomat/Program.cs` | SheetLayout.jsx 호출 |

## 3. UI 설계

### 3.1 시트배치 미리보기 인터랙션

기존 캔버스 미리보기에 인터랙티브 기능 추가:

```
┌─────────────────────────────────────────────────┐
│  시트 배치 미리보기                    [적용] [리셋]│
│                                                  │
│  ┌──────────╫──────────╫────────────┐            │
│  │    A     ║    B     ║     C      │            │
│  │          ║          ║            │            │
│  │    [↻]   ║   [↻]    ║    [↻]     │            │
│  ├──────────╬──────────╬────────────┤            │
│  │    D     ║          E            │            │
│  │    [↻]   ║         [↻]           │            │
│  └──────────╩───────────────────────┘            │
│                                                  │
│  ╫ = 경계 클릭 → 간격 토글                         │
│  [↻] = 아이템 클릭 → 180° 회전                    │
│                                                  │
│  범례: ─── 간격 없음  ┃┃┃ 3mm 간격 (도련 적용)      │
│         외곽: 자동 도련 (3mm)                      │
│                                                  │
│  도련 크기: [3] mm                                │
└─────────────────────────────────────────────────┘
```

### 3.2 경계 클릭 동작

- 경계선 위에 마우스 호버 → 하이라이트 (색상 변경)
- 클릭 → 토글:
  - 기본(간격 없음): 얇은 회색 선
  - 간격 추가: 두꺼운 빨간 점선 + "3mm" 표시
- 경계 상태는 `gaps` 배열로 관리

### 3.3 아이템 회전 동작

- 아이템 영역 클릭 → 180° 회전 토글
- 회전된 아이템: 썸네일이 180° 회전되어 표시
- 회전 상태는 `placements[i].rotated_180` 플래그로 관리
- 회전해도 크기 불변 (재배치 불필요)

### 3.4 외곽 도련

- 시트 외곽 4변은 항상 도련 적용 (사용자 선택 불필요)
- 미리보기에 외곽 도련 영역을 연한 색으로 표시

## 4. 데이터 구조

### 4.1 sheet_layout_params 확장

기존 `sheet_layout_params` JSON에 도련 정보 추가:

```json
{
  "mode": "sheet_layout",
  "roll_width_cm": 127,
  "total_height_cm": 55,
  "margin_cm": 1.5,
  "cut_marks": true,
  "scale_factor": 1,
  "bleed_mm": 3,
  "placements": [
    {
      "group_index": 0,
      "x_cm": 0,
      "y_cm": 0,
      "width_cm": 30,
      "height_cm": 20,
      "rotated": false,
      "rotated_180": false
    }
  ],
  "gaps": [
    {
      "placement_a": 0,
      "placement_b": 1,
      "side": "right",
      "gap_mm": 3
    }
  ]
}
```

### 4.2 gaps 배열

각 gap 항목:
- `placement_a`: 왼쪽/위 아이템 인덱스
- `placement_b`: 오른쪽/아래 아이템 인덱스
- `side`: "right" (수평 인접) 또는 "bottom" (수직 인접)
- `gap_mm`: 간격 크기 (기본 3)

### 4.3 인접 판단

두 placement가 인접하려면:
- 수평: `A.x_cm + A.width_cm ≈ B.x_cm` (±1mm) AND 수직 겹침 존재
- 수직: `A.y_cm + A.height_cm ≈ B.y_cm` (±1mm) AND 수평 겹침 존재

## 5. 구현 범위

### 5.1 프론트엔드 (orderForm.js)

1. **캔버스 미리보기 개선**
   - 기존 canvas 렌더링에 인터랙션 추가
   - 아이템 영역 클릭 → 180° 회전 토글
   - 경계 영역 클릭 → 간격 토글
   - 시각적 피드백 (색상, 점선, 라벨)

2. **인접 경계 계산**
   - `findAdjacentBoundaries(placements)` 함수
   - placements 좌표에서 인접 쌍 자동 추출

3. **간격 적용 시 좌표 재계산**
   - 간격 추가 시 → 해당 경계 이후의 아이템들 x_cm += gap
   - 간격 제거 시 → 반대로
   - 총 시트 폭 초과 여부 검증

4. **썸네일 회전 표시**
   - `rotated_180` 플래그에 따라 canvas에 180° 회전 렌더링

### 5.2 SheetLayout.jsx

1. **gaps 파라미터 읽기**
   - ia_params.json에서 gaps 배열 파싱

2. **간격 반영 배치**
   - gap이 있는 경계에서 아이템 좌표 조정

3. **도련 스트립 생성**
   - 새 레이어 "Bleed" (Layer A 아래)
   - 외곽 4변: 항상 도련 스트립
   - gap 경계: 양쪽 아이템에서 각각 도련 스트립
   - 도련 스트립: 가장자리 1mm 클리핑 → bleed_mm으로 스트레칭

4. **180° 회전**
   - `rotated_180` 플래그 시 `copied.rotate(180)` 추가
   - 기존 `rotated` (90°)와 독립적으로 적용

### 5.3 Program.cs

1. **sheet_layout_params에서 gaps/rotated_180 읽기**
2. **ia_params.json에 전달**

## 6. 도련 스트립 생성 로직 (SheetLayout.jsx)

ProcessOrderItem.jsx에서 이미 구현한 에지 스트립 기법 재사용:

```javascript
function createBleedStrip(layer, sourceGroup, side, bleedPt, stripPt) {
    // 1. sourceGroup의 가장자리 1mm를 클리핑 마스크로 추출
    // 2. 추출한 스트립을 bleedPt 크기로 스트레칭
    // 3. layer에 배치 (원본 뒤)
}

// 외곽 도련: 시트 가장자리 전체에 적용
// 간격 도련: gap이 있는 각 아이템의 해당 변에 적용
```

### 외곽 도련 처리

시트 외곽은 개별 아이템이 아닌 **시트 전체 디자인 레이어**의 에지를 기준으로 도련:

```
방법: Layer A 전체를 소스로 4변 에지 스트립 생성
  - 상단: Layer A 최상단 1mm → 위로 bleed_mm 스트레칭
  - 하단: Layer A 최하단 1mm → 아래로 bleed_mm 스트레칭
  - 좌측: Layer A 최좌측 1mm → 왼쪽으로 bleed_mm 스트레칭
  - 우측: Layer A 최우측 1mm → 오른쪽으로 bleed_mm 스트레칭
```

### 간격 경계 도련 처리

```
A와 B 사이 3mm 간격:
┌────┐ 3mm ┌────┐
│ A  │ gap │ B  │
│    │     │    │
└────┘     └────┘

A의 오른쪽 1mm 에지 → 오른쪽으로 1.5mm 스트레칭
B의 왼쪽 1mm 에지 → 왼쪽으로 1.5mm 스트레칭
각각 간격의 절반씩 채움
```

## 7. 리뷰 반영 — 추가 고려사항

### 7.1 Program.cs 수정 범위 (Critical)

Program.cs:1483-1514에서 placement 속성을 명시적으로 열거하여 ia_params.json을 구성함. 다음 필드를 추가 전달해야 함:
- `rotated_180` (per placement)
- `gaps` 배열 (top-level)
- `bleed_mm` (top-level)

### 7.2 간격 추가 시 폭 초과 처리

간격 삽입으로 시트 폭 초과 시:
- 경고 표시: "간격 추가로 폭 초과 (현재 X cm / 최대 Y cm)"
- 간격 추가 차단 (초과 시 토글 불가)
- 디자이너가 다른 경계의 간격을 제거하거나 레이아웃 조정

### 7.3 외곽 도련의 비직사각형 에지

shelf 배치에서 행 높이가 다르면 좌/우측 외곽이 계단형:
```
┌──────────────┐
│ Row 1 (20cm) │
├─────────┐    │
│ Row 2   │    │  ← 우측 에지가 계단형
│ (15cm)  │    │
└─────────┘    │
```
처리: 각 행별로 독립적으로 좌/우측 도련 스트립 생성 (행 높이 범위 내에서)

### 7.4 Scale factor × gap_mm

gap_mm는 실물 크기(mm). Program.cs에서 scaleFactor로 나누어 파일 좌표계로 변환 후 SheetLayout.jsx에 전달.
```
ia_params의 gap: gap_mm / scaleFactor
```
SheetLayout.jsx는 받은 값을 그대로 사용 (이미 파일 좌표계).

### 7.5 수직 간격 처리

수직 인접 경계에 간격 삽입 시: 해당 행 이하 전체를 gap_mm만큼 아래로 이동 (per-shelf 방식). 개별 아이템이 아닌 행 단위로 이동.

### 7.6 DXF 재단선

- 간격 있는 경계: 원래 아이템 경계에 재단선 유지 (CutLine 레이어)
- 간격 영역 자체에는 재단선 없음 (간격 = 폐기 영역)
- DXF에 간격이 포함되므로 커터가 자연스럽게 간격을 건너뜀

### 7.7 rotated + rotated_180 합성

- `rotated: true` (90°, 배치 알고리즘) + `rotated_180: true` (색상 최적화) = 총 270°
- SheetLayout.jsx에서 독립적으로 적용: `if (rotated) rotate(-90); if (rotated_180) rotate(180);`

### 7.8 캔버스 인터랙션 구현

현재 캔버스는 순수 렌더링 (이벤트 없음). 구현 필요:
- canvas `click` 이벤트 리스너
- 클릭 좌표 → placement/boundary 영역 히트 테스트
- 상태 변경 시 캔버스 재렌더링
- 경계 영역: 아이템 간 ±5px 범위를 클릭 가능 영역으로 설정

## 8. OFFSET/BLEED 병합

### 8.1 병합 이유
OFFSET(다이컷)과 BLEED(도련)은 본질적으로 같은 기능: "원본 경계 너머로 콘텐츠 확장."
차이는 확장 방법(scale vs edge_strip)과 재단선(cut_line) 유무뿐.

### 8.2 통합 파라미터

```json
{
  "code": "OFFSET",
  "params": {
    "offset_top": 3, "offset_bottom": 3,
    "offset_left": 3, "offset_right": 3,
    "method": "edge_strip",
    "cut_line": false
  }
}
```

| 용도 | method | cut_line |
|------|--------|----------|
| 다이컷 | `"scale"` | `true` |
| 도련(블리드) | `"edge_strip"` | `false` |

### 8.3 구현 변경

**ProcessOrderItem.jsx:**
- 기존 OFFSET 로직(scale + duplicate)을 `method: "scale"` 분기로 유지
- `method: "edge_strip"` 분기에 현재 BLEED 로직(에지 스트립) 사용
- `cut_line: true` 시 M100 재단선 추가 (기존 동작)
- `cut_line: false` 시 재단선 생략

**orderForm.js:**
- BLEED 섹션 제거
- OFFSET 섹션에 확장 방식/재단선 옵션 추가

**Program.cs:**
- BLEED 후가공 파싱 제거
- OFFSET 파싱에 method/cut_line 추가
- 시트 카테고리 자동 설정: `{ method: "edge_strip", cut_line: false, offset_*: 3 }`

**마이그레이션:**
- 0166_bleed_post_processing.sql의 BLEED 옵션 제거
- OFFSET 옵션의 parameter_schema에 method/cut_line 필드 추가

### 8.4 하위 호환
- 기존 OFFSET (method 미지정): `method: "scale"`, `cut_line: true` 기본값 적용
- 기존 BLEED 데이터: OFFSET으로 마이그레이션 또는 무시 (신규 기능)

## 9. 미구현 / 향후

- Claude API 자동 판단: 현재는 수동, 추후 자동 추천 가능
- 간격 크기 커스텀: 현재 3mm 고정, 추후 경계별 조정
- 배치 순서 최적화: 색상 기반 자동 재배열
