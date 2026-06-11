# 시트 배치 기능 설계 (Sheet Layout)

> 작성일: 2026-04-27  
> 상태: 설계 확정 대기

## 1. 개요

### 1.1 목적
디자이너가 주문서 작성 시, 하나의 AI/EPS 파일 안에 포함된 여러 디자인 요소를 **출력기 롤 폭에 맞춰 자동 배치**하고, **출력용 EPS + 재단용 EPS + JPG** 3개 파일을 생성하는 기능.

### 1.2 사용자
- **디자이너** (8명): 주문서 작성 중 시트 배치 실행
- 주로 솔벤 시트, 솔벤 그레이시트, UV시트, 솔벤 조명용시트, 솔벤 클리어필름 등 출력 후 재단 품목

### 1.3 현재 상태
- 디자이너가 Illustrator에서 수동으로 배치 작업 수행
- 기존 IA 품목 자동 추출 기능은 그룹당 개별 order_item 생성 (시트 배치 아님)

### 1.4 아키텍처 결정
**A안 채택**: MES 서버에서 좌표 계산 + 미리보기, IA PC는 최종 파일 생성만 담당.
- 이유: 디자이너가 수량/폭 변경 시 즉시 재계산 가능, IA PC 대기 불필요

## 2. UI/UX 워크플로우

### 2.1 전체 흐름

```
① 파일 분석 (기존 ExtractGroups)
     ↓
② [품목 추출] / [시트 배치] 탭 전환
     ↓
③ 시트 배치 탭:
   - 요소별 수량 지정
   - 롤 폭 선택 (자동 추천)
   - 재단선 체크
     ↓
④ [배치 미리보기] 클릭 → 캔버스 렌더링
     ↓
⑤ [확정] → 주문 라인에 부모-자식 추가
     ↓
⑥ 주문서 저장 시 → auto_process_jobs 생성 → IA PC 실행
```

### 2.2 Step 1: 파일 분석 (변경 없음)

기존 `requestAIAnalysis()` 그대로 사용:
- 파일 선택 (피커 또는 Z드라이브 경로 입력)
- `POST /api/ai-analysis` → 청크 업로드 → `PATCH status='pending'`
- 2초 간격 폴링 → `status='done'` → `groups_json` 수신

### 2.3 Step 2: 모드 전환

분석 완료 후 탭 2개 표시:
- **[품목 추출]**: 기존 `populateRowsFromGroups()` / `populateAsGroupedItem()`
- **[시트 배치]**: 신규 UI

탭 전환은 DOM 표시/숨김 (가벼운 처리). 탭 전환 시 이전 탭에서 생성한 행이 있으면 제거 확인.

### 2.4 Step 3: 시트 배치 설정

#### 요소 목록 테이블
| 열 | 내용 |
|----|------|
| 썸네일 | `group.thumbnail_base64` |
| 크기 | `width_mm / 10` × `height_mm / 10` cm |
| 수량 | `<input type="number" min="1" max="99" value="1">` |
| 면적 | 가로 × 세로 × 수량 (참고용) |

#### 롤 폭 선택
- 드롭다운: 105 / 127 / 137 / 152 cm
- 자동 추천 로직: 모든 요소의 배치에 필요한 최소 폭 계산 → 그보다 큰 가장 작은 롤 폭 선택
- 재단선 체크박스: 체크 시 배치 가능 영역 = 롤 폭 - 3cm (양쪽 1.5cm)
- 배치 가능 영역 실시간 표시

### 2.5 Step 4: 배치 미리보기

**[배치 미리보기] 버튼 클릭 시**:
1. 프론트엔드에서 bin-packing 알고리즘 실행 (서버 호출 불필요)
2. Canvas 또는 HTML div로 배치 결과 렌더링
3. 표시 정보:
   - 각 요소의 위치, 크기, 회전 여부
   - 요소별 색상 구분 (썸네일 또는 라벨)
   - 여백 영역 표시 (양쪽 1.5cm)
   - 총 길이, 배치 효율(%)
   - 회전된 요소 개수

**수량/폭 변경 시**: [← 수량/폭 수정] 버튼으로 돌아가서 재설정 → 다시 미리보기

### 2.6 Step 5: 확정 → 주문 라인 추가

**[확정] 버튼 클릭 시**:

부모-자식 구조로 주문 라인 생성 (기존 `populateAsGroupedItem()` 패턴 재활용):

```
[부모 라인]
  - 품목: 디자이너가 선택 (솔벤시트, UV시트 등)
  - 규격: 배치 결과 전체 크기 (롤 폭 × 총 길이)
  - 수량: 1
  - 금액: 디자이너가 입력
  - hidden: sheet_layout_params (배치 좌표 JSON)

[자식 라인 × N]
  - 각 그룹별 1개
  - 규격: 개별 크기
  - 수량: 지정한 수량
  - ai_group_index: 그룹 인덱스
  - ai_analysis_id: 분석 요청 ID
```

사용처별 표시:
| 사용처 | 표시 범위 |
|--------|----------|
| 계산서 / 원장 | 부모 라인만 |
| 명세서 / 카드 | 부모 + 자식 라인 |

### 2.7 Step 6: 주문 저장 → IA PC 작업 생성

주문서 `POST /api/orders` 시 기존 `auto_process_jobs` 생성 로직에 시트 배치 분기 추가:

- `sheet_layout_params`가 있는 부모 order_item → `mode: "sheet_layout"` 작업 1개 생성
- IA PC가 폴링하여 `SheetLayout.jsx` 실행
- 결과: 3개 파일 (출력 EPS, 재단 EPS, JPG) → Z드라이브 저장

## 3. 배치 알고리즘 (Bin Packing)

### 3.1 입력
- `items[]`: 각 요소의 `{ width_cm, height_cm, count }` (count만큼 복제)
- `available_width_cm`: 롤 폭 - (재단 시 3cm, 미재단 시 0cm)

### 3.2 알고리즘: Shelf Best-Fit with Rotation

Strip packing 변형. 단순하고 예측 가능한 결과.

```
1. 모든 요소 펼치기 (count에 따라 복제)
2. 면적 기준 내림차순 정렬
3. 각 요소에 대해:
   a. 기존 shelf(줄)에 넣을 수 있는지 확인
      - 원래 방향으로 들어가면 → 배치
      - 90도 회전해서 들어가면 → 회전 후 배치
   b. 어떤 shelf에도 안 들어가면 → 새 shelf 생성
4. shelf 높이 = 해당 줄에서 가장 높은 요소
```

### 3.3 출력
```javascript
{
  placements: [
    { group_index, x_cm, y_cm, width_cm, height_cm, rotated: boolean },
    ...
  ],
  total_width_cm,   // = available_width_cm
  total_height_cm,  // = 모든 shelf 높이 합
  efficiency,       // = 요소 총면적 / (total_width × total_height) × 100
}
```

### 3.4 제약 조건
- 간격 없음 (딱 붙여서 배치)
- 90도 회전만 허용 (임의 각도 X)
- 요소가 available_width보다 크면 → 에러 표시 ("이 요소는 선택한 롤 폭에 배치할 수 없습니다")

### 3.5 롤 폭 자동 추천
```
available_rolls = [105, 127, 137, 152]

for each roll in available_rolls (오름차순):
  available = roll - (재단 ? 3 : 0)
  if 모든 요소가 available 안에 배치 가능:
    bin-pack 실행 → efficiency 계산
    candidates.push({ roll, efficiency, total_height })

추천 = candidates 중 efficiency 최고 (동률이면 total_height 최소)
```

## 4. 데이터 구조

### 4.1 DB 변경 — order_items 테이블

기존 컬럼 활용 (신규 컬럼 불필요):
- `ai_analysis_id`: 분석 요청 ID (기존)
- `ai_group_index`: 그룹 인덱스 (기존, 자식 라인에서 사용)
- `parent_item_id`: 부모-자식 관계 (기존)

### 4.2 DB 변경 — auto_process_jobs 테이블

기존 컬럼 활용 + `ia_params` JSON에 시트 배치 데이터 포함:
- `ia_params.mode = "sheet_layout"` 으로 구분
- 별도 마이그레이션 불필요 (ia_params가 이미 JSON 컬럼)

### 4.3 ia_params.json (시트 배치 모드)

```json
{
  "mode": "sheet_layout",
  "source": "Z:\\123\\04월\\27일\\시트_샘플.ai",
  "canvas": {
    "width_cm": 127,
    "height_cm": 55,
    "margin_cm": 1.5
  },
  "placements": [
    {
      "group_index": 0,
      "x_cm": 1.5,
      "y_cm": 0,
      "width_cm": 30,
      "height_cm": 20,
      "rotated": false
    },
    {
      "group_index": 0,
      "x_cm": 31.5,
      "y_cm": 0,
      "width_cm": 30,
      "height_cm": 20,
      "rotated": false
    },
    {
      "group_index": 3,
      "x_cm": 106.5,
      "y_cm": 0,
      "width_cm": 50,
      "height_cm": 20,
      "rotated": true
    }
  ],
  "outputs": {
    "print_eps": "Z:\\Designs\\IllustratorAutomat\\_auto_output\\시트_샘플_print_170001.eps",
    "cut_eps": "Z:\\Designs\\IllustratorAutomat\\_auto_output\\시트_샘플_cut_170001.eps",
    "jpg": "Z:\\Designs\\IllustratorAutomat\\_auto_output\\시트_샘플_preview_170001.jpg"
  }
}
```

## 5. API 변경

### 5.1 기존 API 변경 없음
- `POST /api/ai-analysis` — 그대로 (파일 분석)
- `GET /api/ai-analysis/:id` — 그대로 (폴링)

### 5.2 POST /api/orders 변경

주문 생성 시 시트 배치 분기 추가:

```
기존 로직:
  각 order_item에 ai_analysis_id가 있으면
    → auto_process_jobs INSERT (mode: "process")

추가 로직:
  부모 order_item에 sheet_layout_params가 있으면
    → auto_process_jobs INSERT (mode: "sheet_layout")
    → ia_params에 placements 배열 포함
    → 자식 order_items는 개별 auto_process_jobs 생성하지 않음
```

### 5.3 신규 API 없음

bin-packing 계산은 프론트엔드(orderForm.js)에서 수행. 서버 호출 불필요.

## 6. IA PC 변경

### 6.1 C# (IllustratorAutomat.exe)

`ia_params.mode` 분기 추가:
```csharp
if (iaParams.mode == "sheet_layout")
    RunJsx("SheetLayout.jsx", iaParams);
else
    RunJsx("ProcessOrderItem.jsx", iaParams);
```

### 6.2 SheetLayout.jsx (신규)

JSX 스크립트 핵심 로직:

```
1. 원본 파일 열기 (source)
2. 새 문서 생성 (canvas.width_cm × canvas.height_cm)
3. 각 placement에 대해:
   a. 원본에서 group_index에 해당하는 그룹 복사
   b. rotated=true이면 90도 회전
   c. (x_cm, y_cm) 좌표에 배치
4. 외곽 윤곽선 레이어 추가:
   - 각 배치된 요소의 바운딩박스에 stroke 추가
5. 돔보 마크 추가:
   - 양쪽 margin_cm 영역에 레지스트레이션 마크

6. 출력용 EPS 저장:
   - 전체 레이어 인쇄 ON → EPS 저장

7. 재단용 EPS 저장:
   - 디자인 요소 레이어 삭제
   - 외곽 윤곽선 레이어 인쇄 OFF
   - EPS 저장

8. JPG 저장:
   - 전체 표시 상태로 JPG export
```

## 7. 출력 파일 사양

### 7.1 출력용 EPS (print)
| 항목 | 내용 |
|------|------|
| 크기 | 롤 폭 × 총 길이 |
| 디자인 | O (배치된 모든 요소) |
| 외곽 윤곽선 | O (각 요소의 바운딩박스) |
| 돔보 마크 | O (양쪽 여백) |
| 레이어 인쇄 | 전부 ON |

### 7.2 재단용 EPS (cut)
| 항목 | 내용 |
|------|------|
| 크기 | 출력용과 동일 |
| 디자인 | X (없음) |
| 외곽 윤곽선 | O |
| 돔보 마크 | O |
| 레이어 인쇄 | 외곽선 레이어 OFF |

### 7.3 JPG (preview)
| 항목 | 내용 |
|------|------|
| 해상도 | 72~150 DPI (확인용) |
| 내용 | 디자인 + 외곽선 + 돔보 (전체 표시) |

## 8. 프론트엔드 변경 범위

### 8.1 orderForm.ts
- 분석 결과 영역에 [품목 추출] / [시트 배치] 탭 HTML 추가
- 시트 배치 탭 내부: 요소 목록 테이블 + 롤 폭 선택 + 미리보기 캔버스 영역

### 8.2 orderForm.js
- `populateSheetLayoutTab(groups)`: 시트 배치 탭 초기화
- `calculateSheetLayout()`: bin-packing 알고리즘 실행
- `renderSheetPreview(result)`: 캔버스에 배치 결과 렌더링
- `confirmSheetLayout()`: 부모-자식 주문 라인 생성
- `recommendRollWidth(groups, quantities)`: 최적 롤 폭 추천

### 8.3 orders/core.ts
- `POST /api/orders` 내 auto_process_jobs 생성 로직에 `sheet_layout` 분기 추가

## 9. 변경하지 않는 것

- 기존 품목 추출 기능 (populateRowsFromGroups, populateAsGroupedItem) — 그대로 유지
- 기존 단일 가공 (ProcessOrderItem.jsx) — 그대로 유지
- 기존 IA 테스트 페이지 3개 (/ia-auto, /ia-batch-test, /ia-scan) — 그대로 유지
- ai_analysis_requests, auto_process_jobs 테이블 스키마 — 변경 없음
- DB 마이그레이션 — 불필요

## 10. 검증 계획

### 10.1 프론트엔드 테스트
- [ ] 파일 분석 후 [품목 추출] ↔ [시트 배치] 탭 전환
- [ ] 요소별 수량 변경 → 면적 업데이트
- [ ] 롤 폭 변경 → 배치 가능 영역 업데이트 → 자동 추천
- [ ] 배치 미리보기 캔버스 렌더링 (회전 요소 표시)
- [ ] 확정 → 부모-자식 주문 라인 정상 생성
- [ ] 수량/폭 수정 → 돌아가기 → 재미리보기

### 10.2 백엔드 테스트
- [ ] 주문 저장 시 sheet_layout mode auto_process_jobs 정상 생성
- [ ] ia_params에 placements 배열 정상 포함
- [ ] 자식 order_items에 개별 auto_process_jobs 미생성 확인

### 10.3 IA PC 테스트 (후속)
- [ ] SheetLayout.jsx: 그룹 추출 + 좌표 배치 + 회전
- [ ] 출력 EPS: 디자인 + 윤곽선 + 돔보
- [ ] 재단 EPS: 윤곽선만 + 인쇄 OFF
- [ ] JPG: 미리보기 이미지
