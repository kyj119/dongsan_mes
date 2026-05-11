# Phase 3.1 — 대형 파일 리팩토링 계획서

> 작성: 2026-05-09 / 검토 대기: 용준님
> 전제: 사용자 결정 필요한 brainstorming 질문은 §10에 모음. 답변 후 착수.

---

## 1. 목표 (Goals)

- **유지보수성**: 단일 파일 3000~4000줄 → 파일당 500~1000줄 이하
- **변경 영향 범위 축소**: 한 기능 수정이 무관한 영역에 silent fail 일으키는 위험 제거
- **빌드 시간/HMR**: Vite는 단위 파일 변경만 다시 import → 큰 파일 한 줄 수정 시 4MB raw string 재처리 회피
- **AI 작업 효율**: subagent dispatch 시 컨텍스트 윈도우 안에 한 파일이 들어와야 안전한 편집 가능

## 2. 비목표 (Non-goals)

- **기능 변경 금지**: 함수 시그니처, 동작, URL 경로, 전역 변수 이름 모두 그대로
- **테스트 추가 안 함** (별도 Phase 5.3에서 Playwright 도입)
- **TypeScript 변환 안 함** (orderForm.js, items.js는 .js 유지 — 별도 Phase에서 검토)
- **DB 스키마 변경 안 함**

---

## 3. 대상 파일 (Files in scope)

| 파일 | 라인 수 | 종류 | 위험도 |
| --- | --- | --- | --- |
| `src/scripts/orderForm.js` | 3966 | Vanilla JS (?raw import) | 🔴 High |
| `src/scripts/items.js` | 3235 | Vanilla JS (?raw import) | 🟡 Medium |
| `src/routes/cards.ts` | 2121 | Hono route | 🟢 Low (orders.ts 패턴 적용 가능) |
| **합계** | **9322** | | |

위험도 산정 근거:
- **orderForm.js**: 전역 함수 60+, 인라인 onclick 다수, finishing/sheet/AI 로직 강결합
- **items.js**: 함수 80+, 모달이 13가지(media, group, RM, bulk, price, history…), DOM ID 의존성 높음
- **cards.ts**: 라우트 매칭 우선순위만 지키면 안전 (orders.ts에서 검증된 패턴)

---

## 4. 참조 모델 — 기존 `orders.ts` 분할 (성공 사례)

```
src/routes/orders.ts (24줄, aggregator)
├── orders/queries.ts  (341줄) — stats, search, expired, options
├── orders/operations.ts (426줄) — copy, convert, email
└── orders/core.ts      (2090줄) — CRUD + status + billing
```

핵심 원칙 (orders.ts에서 검증됨):
1. **얇은 aggregator**: 진입점 파일은 import + route mount만
2. **구체 경로 우선 mount**: `queries(/stats)` → `ops(/:id/copy)` → `core(/:id)` 순서로 등록 (Hono 매칭)
3. **URL 구조 불변**: `/api/orders/...` 외부에서 보이는 경로 그대로
4. **공통 모듈 export**: 다른 라우터가 쓰던 헬퍼는 그대로 export 유지

이 패턴을 cards.ts에 그대로 적용. orderForm.js / items.js는 ?raw 개념 차이로 변형 필요 (§7).

---

## 5. cards.ts 분할 설계 (2121 → 4개 파일)

### 5.1 분할 경계 및 근거

| 신규 파일 | 책임 | 포함 라우트 | 추정 라인 |
| --- | --- | --- | --- |
| `routes/cards.ts` | **aggregator** | (route mount만) | ~30 |
| `routes/cards/queries.ts` | 읽기 전용 + 통계 | `GET /`, `GET /debug-counts`, `GET /categories`, `GET /kanban-summary`, `GET /stats/daily`, `GET /defects/list`, `GET /defect-stats`, `GET /by-number/:cardNumber`, `GET /:id`, `GET /:id/history`, `GET /:id/defects`, `GET /schedule/queues`, `GET /schedule/unassigned` | ~700 |
| `routes/cards/scheduling.ts` | 일정/큐 변경 | `PUT /schedule/assign/:id`, `PUT /schedule/priority/:id`, `PATCH /bulk/priority`, `PATCH /:id` (notes/priority/delivery_date) | ~250 |
| `routes/cards/lifecycle.ts` | 상태 전환 + 출고 + 불량 | `PATCH /bulk/status`, `PATCH /:id/status`, `PATCH /:id/pp-complete`, `PATCH /bulk/pp-complete`, `POST /:id/ship`, `PATCH /:id/ship`, `PATCH /:id/unship`, `POST /bulk-ship`, `POST /:id/defects`, `PATCH /defects/:defectId`, `PATCH /:cardId/items/:itemId/print-toggle`, `PATCH /:id/complete`, `PATCH /:id/revert`, `POST /generate/:orderId` | ~1100 |

### 5.2 mount 순서 (라우트 매칭)

```ts
// src/routes/cards.ts (aggregator)
const cardsRouter = new Hono<HonoEnv>()
cardsRouter.use('/*', authMiddleware) // 공통 미들웨어 유지

// 매칭 우선순위: 구체 경로 → /:id 패턴
cardsRouter.route('/', cardsQueriesRouter)    // /schedule/*, /defects/*, /by-number/*, /stats/*, /kanban-summary, /debug-counts, /categories
cardsRouter.route('/', cardsSchedulingRouter) // /schedule/assign/:id, /schedule/priority/:id, /bulk/priority
cardsRouter.route('/', cardsLifecycleRouter)  // /bulk/status, /bulk/pp-complete, /bulk-ship, /generate/:orderId, /:id/...

export default cardsRouter
```

### 5.3 위험 포인트
- `/:id` 매칭이 `/defects/list`, `/by-number/:cardNumber` 보다 뒤에 와야 함 → queries.ts 안에서도 순서 유지
- middleware (requireRole) 적용된 라우트가 분리될 때 그대로 옮기기 (예: `/bulk/status`, `/:id/ship`)
- `defect-stats`와 `defects/list`는 다른 파일에 있으면 안 됨 (둘 다 queries.ts)

---

## 6. items.js 분할 설계 (3235 → 5개 파일)

### 6.1 ?raw import 멀티 모듈 패턴

`?raw`는 단일 문자열만 import. 분할 방법:

```ts
// src/pages/items.ts
import scriptsCore from '../scripts/items/core.js?raw'
import scriptsModals from '../scripts/items/modals.js?raw'
import scriptsMedia from '../scripts/items/media.js?raw'
import scriptsRMGroup from '../scripts/items/rmGroup.js?raw'
import scriptsBulk from '../scripts/items/bulk.js?raw'

const pageScript = [scriptsCore, scriptsModals, scriptsMedia, scriptsRMGroup, scriptsBulk].join('\n')
```

→ 런타임에는 단일 IIFE/window-scope 처럼 동작. 모든 함수/변수 동일 스코프 공유.

### 6.2 분할 경계

| 신규 파일 | 책임 | 포함 함수 | 추정 라인 |
| --- | --- | --- | --- |
| `scripts/items/core.js` | 탭/테이블/생성/편집 | sortIcon, sortTabItems, debouncedLoadTab, debouncedLoadOutput, getTypeBadge, updateAutoCodePreview, onCategoryChange, loadLinkedMediaDisplay, loadParentMediaOptions, selectItemType, updateFieldVisibility, populateSubcatSelect, updatePricingLabel, switchMainTab, filterOutputItems, loadOutputItems, loadTabItems, showCreateModalForTab, setCategoryForTab, loadItems(전역), editItem, deleteItem, saveItem | ~900 |
| `scripts/items/modals.js` | 일반 모달 + 그룹 편집 | showCreateModal, closeModal, switchModalTab, showGroupEditModal, populateGroupSubcatSelect, closeGroupEditModal, toggleGroupField, onGroupSelectChange, getSelectedGroup, showGroupMembers, saveGroupEdit | ~450 |
| `scripts/items/media.js` | 인쇄 매체 + 인쇄 방식 | loadPrintMethods, updateMethodPrice, loadPrintMedia, togglePrintMediaGroup, buildPrintMediaTable, renameMediaGroup, openMediaGroupModal, addMediaRowToGroup, saveUnifiedMediaGroup, addMediaSheetSizeRow, showMediaAddModal, closeMediaAddModal, saveMedia, editMedia, deleteMedia, toggleMediaMethod, toggleMediaGroupAll, saveMediaGroup, showGroupPriceModal, closeGroupPriceModal, previewGroupPrice, applyGroupPrice, toggleMediaSpecFields, navigateToRMAdd | ~750 |
| `scripts/items/rmGroup.js` | 원자재 그룹 뷰 | loadRawMaterialGroupView, buildRMGroupTable, toggleRMGroup, toggleRMGroupAll, toggleRMGroupSalesPrice, rmGroupToggleSales, rmGroupBulkRename, rmGroupBulkDelete, unlinkRMFromGroup, restoreRMRow, addRMToGroup, openRMBulkEditByGroup, parseWidthFromSpec, openRMBulkEditModalWithItems, toggleRMBulkAll, toggleRMSalesPrice, rmBulkToggleSales, rmBulkRename, rmBulkDelete, saveRMBulkEdit | ~700 |
| `scripts/items/bulk.js` | 소재 일괄 추가/대량 편집 + 가격 이력 | bulkChangeMethodsForGroup, applyBulkMethods, bulkChangeSizesForGroup, applyBulkSizes, getCheckedMediaIds, renderMethodCheckboxes, _buildMethodCheckboxes, getSelectedMethodIds, addBulkRollWidth, removeBulkRollWidth, renderBulkRollWidths, showMediaBulkAddModal, closeMediaBulkAddModal, onBulkMediaTypeChange, addBulkSheetSize, addBulkAxisValue, renderBulkAxisTags, removeBulkAxisValue, renderBulkPriceTable, previewBulkMedia, saveBulkMedia, sortMaterials, changeMaterialSort, toggleMaterialGroup, displayProductMaterials, buildMaterialTable, addMaterialMapping, addMaterialGroupMapping, removeMaterialMapping, removeMaterialGroupMapping, showBulkModal, closeBulkModal, addBulkWidthRow, updateBulkPreview, saveBulkItems, showPriceHistory, closePriceHistoryModal, loadPriceHistory(if exists) | ~700 |

### 6.3 위험 포인트
- 함수 의존성 순환 가능: A 파일이 B 파일 함수 호출 → 모두 window 스코프이므로 OK
- 단, 같은 변수명을 다른 파일에서 `var` 재선언하면 충돌 → 분할 전에 grep으로 변수명 충돌 검사 필수
- `window.X = X` 명시적 export는 core.js 끝 또는 각 파일 끝에 배치 (현재 items.js line 3156~3181 구조 분리 필요)

---

## 7. orderForm.js 분할 설계 (3966 → 6개 파일)

### 7.1 분할 경계

| 신규 파일 | 책임 | 시작 ~ 끝 (현재 라인) | 추정 |
| --- | --- | --- | --- |
| `scripts/orderForm/client.js` | 거래처 검색·선택·여신 | 1~228 | ~230 |
| `scripts/orderForm/itemRow.js` | 품목 행 빌드/자동완성/추가/삭제/스케일 | 229~427, 933~1063 | ~360 |
| `scripts/orderForm/finishing.js` | 마감(PP/타공/오프셋/주석) | 428~919 | ~490 |
| `scripts/orderForm/calc.js` | 단가·총액 계산 | 1065~1626, 3781~3966 | ~750 |
| `scripts/orderForm/sheet.js` | AI 분석·합판(sheet) 레이아웃·미리보기 | 1814~2689 | ~880 |
| `scripts/orderForm/parent.js` | AI 결과 부모/자식 행, 폼 제출, 후가공 복원 | 2690~3780, 1627~1812 | ~1200 |

### 7.2 ?raw 합치기 (items.js와 동일 패턴)

```ts
// src/pages/orderForm.ts
import sClient from '../scripts/orderForm/client.js?raw'
import sItemRow from '../scripts/orderForm/itemRow.js?raw'
import sFinishing from '../scripts/orderForm/finishing.js?raw'
import sCalc from '../scripts/orderForm/calc.js?raw'
import sSheet from '../scripts/orderForm/sheet.js?raw'
import sParent from '../scripts/orderForm/parent.js?raw'
const pageScript = [sClient, sItemRow, sFinishing, sCalc, sSheet, sParent].join('\n')
```

### 7.3 위험 포인트 (특히 높음)
- **finishing.js → calc.js 호출 순환 위험**: `calculatePPCost` 호출 등은 합쳐진 후 동일 스코프이므로 OK이지만, 분할 단위 안에서 정의된 변수가 다른 파일에서 참조되면 hoisting 차이 발생 가능 → `var`/`function` 선언만 사용 (현재 코드는 그렇게 되어 있음)
- **인라인 onclick 매칭**: HTML에서 `onclick="calcItem(123)"` 호출하는데 함수가 다른 파일에 있어도 OK (window 스코프). 단, 빌드 후 함수가 누락되면 silent fail
- **layout.ts 백틱 이스케이프**: orderForm.js는 layout.ts와 별개 ?raw이므로 영향 없음

### 7.4 검증 요건
- 분할 전 `grep -n "^\s*function " orderForm.js | sort` 백업
- 분할 후 모든 window.* 함수가 build dist에 포함되어 있는지 확인
  ```bash
  grep -c "window.calcItem" dist/_worker.js  # ≥ 1
  grep -c "window.applyFinPresetToOrder" dist/_worker.js  # ≥ 1
  ```

---

## 8. 단계 분할 (Phase 3.1.A / B / C)

CLAUDE.md 규칙 (5+ task → 2~3 세션 분할) 준수.

### Phase 3.1.A — cards.ts (가장 안전)
- **소요 시간**: 1세션
- **단계**:
  1. `routes/cards/queries.ts` 신규 → 13개 GET 라우트 이동 + grep으로 import/middleware 누락 확인
  2. `routes/cards/scheduling.ts` 신규 → 4개 PUT/PATCH 이동
  3. `routes/cards/lifecycle.ts` 신규 → 14개 PATCH/POST 이동
  4. `routes/cards.ts` aggregator로 축소 (~30줄)
  5. `npm run verify` + `npm run smoke` 통과
- **롤백**: git diff로 cards.ts만 되돌리면 끝 (단일 파일 → 단일 파일)

### Phase 3.1.B — items.js (중간 위험)
- **소요 시간**: 1세션
- **단계**:
  1. `scripts/items/` 디렉토리 생성 + 5개 파일 신규
  2. 함수 그룹별 cut & paste (모든 `var`/`function`/`window.X` 선언 보존)
  3. `pages/items.ts` 수정 → 5개 ?raw 합치기
  4. 변수명 충돌 검사: 각 파일 안의 모든 `var` 선언 → 다른 파일에 같은 이름 있는지
  5. `npm run verify` + `npm run smoke` + 페이지 수동 클릭 (sheet/RM 그룹/일괄/모달)
- **롤백**: items.js 원본 복원 + items.ts ?raw 한 줄로 되돌림

### Phase 3.1.C — orderForm.js (최고 위험)
- **소요 시간**: 2세션 권장
  - **세션 1**: 6개 파일로 분할 + verify + 자동 빌드만 통과
  - **세션 2**: 수동 시나리오 검증 (주문서 신규 → 거래처 → 품목 5개 → AI 분석 → 합판 → 후가공 → 견적/주문 제출)
- **단계**:
  1. 백업: 현재 orderForm.js를 별도 git tag (`refactor/orderForm-baseline`)
  2. 6개 파일 분할 (cards 패턴과 달리 Vanilla JS이므로 함수 hoisting/scope 주의)
  3. `pages/orderForm.ts` 수정
  4. `npm run verify` 통과 (typecheck + build)
  5. **수동 검증 시나리오 6가지** (§9.3)
- **롤백**: git tag로 즉시 복원 가능

---

## 9. 검증 프로토콜

### 9.1 자동 검증 (각 phase 끝마다)
```bash
npm run verify   # typecheck + build
npm run smoke    # /api 헬스체크
```

### 9.2 빌드 산출물 검증 (특히 ?raw 분할)
```bash
# 모든 window.* 함수가 dist에 포함되었는지
node -e "
  const fs = require('fs');
  const dist = fs.readFileSync('dist/_worker.js', 'utf8');
  const expected = ['calcItem', 'applyFinPresetToOrder', 'submitAsQuotation', 'calculateAndPreviewSheet', 'addItemRow'];
  expected.forEach(f => console.log(f, dist.includes('window.' + f) ? 'OK' : 'MISSING'));
"
```

### 9.3 orderForm.js 수동 시나리오 (Phase 3.1.C 필수)
1. **거래처 선택**: 검색 → 모달 → 선택 → 여신 배너
2. **품목 추가**: 행 추가 → 자동완성 → 단가 자동 반영
3. **마감 적용**: 1행에 PP+타공 → 다른 행에 일괄 적용 (`applyFinishingAll`)
4. **AI 합판**: 파일 업로드 → 분석 → 그룹 추출 → 합판 미리보기 → 확정
5. **부모-자식**: AI 결과 → 그룹 품목 → 자식 행 추가/제거
6. **제출**: 견적서 vs 주문서 양쪽 모두 제출

### 9.4 items.js 수동 시나리오 (Phase 3.1.B 필수)
1. 탭 전환 (제품/원자재/인쇄방식/인쇄매체/소재)
2. 제품 신규 등록 (기본/그룹/단가 탭)
3. 인쇄매체 그룹 모달 → 가격 일괄 변경
4. 원자재 그룹 → 일괄 편집
5. 가격 이력 보기

---

## 10. 사용자 결정 필요 (Brainstorming Questions)

다음 질문에 (가)/(나)/(다) 중 선택해주시면 그 결정대로 진행합니다.

### Q1. 어느 파일부터 시작할까요?
- **(가) cards.ts 먼저** — 가장 안전 + orders.ts 패턴 검증된 방식 (1세션)
- **(나) items.js 먼저** — 중간 난이도 + 실제 사용 빈도 높음 (1세션)
- **(다) 모두 한 세션에 처리** — Cards + items 동시 진행 (orderForm은 다음 세션)

> 추천: (가). 이유 — 검증된 패턴으로 워밍업 후 위험도 높은 작업 진입.

### Q2. orderForm.js 분할 시점
- **(가) Phase 3.1.B 끝나면 바로** — 모멘텀 살려서 연속 진행
- **(나) Phase 3.1.A/B 검증 + 며칠 운영** — 실제 운영에서 회귀 없는 것 확인 후 시작
- **(다) 일단 건너뛰고 다른 Phase부터** — 너무 위험하니 보류

> 추천: (나). 이유 — orderForm은 매출 직결, 회귀 발생하면 즉시 영향. cards/items에서 회귀 검증된 후에.

### Q3. 디렉토리 명명 규칙
- **(가) `scripts/items/core.js` 형태** — orders.ts 패턴과 동일, 디렉토리로 그룹화
- **(나) `scripts/items.core.js` 형태** — flat, 점 구분
- **(다) `scripts/items-core.js` 형태** — flat, 하이픈 구분

> 추천: (가). 이유 — 기존 `routes/orders/`와 일관성. import 시 디렉토리 자동완성 편함.

### Q4. orderFormDist.js (유통주문서) 처리
- **(가) 같이 분할** — 비슷한 구조라면 동일 패턴 적용
- **(나) 그대로 유지** — 별도 파일이고 작으면 건드리지 않음
- **(다) 합쳐서 하나로** — 두 폼이 90% 같으면 통합

> 추천: (나). orderFormDist.js는 351줄로 작아서 분할 불필요. 그대로 유지.

### Q5. 검증 강도
- **(가) typecheck + build + smoke만** — 자동 통과하면 다음 단계
- **(나) (가) + 수동 시나리오 (§9.3, §9.4)** — 모든 핵심 흐름 직접 클릭
- **(다) (나) + Playwright 자동화 추가** — Phase 5.3 일부를 앞당김

> 추천: cards.ts/items.js는 (가), orderForm.js는 (나). Playwright는 별도 Phase로.

### Q6. 작업 진행 방식
- **(가) 한 번에 한 파일 분할 → verify → commit/push → 다음**
- **(나) 모든 분할 끝낸 후 한 번에 commit**
- **(다) 분할 중간에도 단계별 커밋**

> 추천: (가). 이유 — 회귀 발생 시 정확히 어느 분할에서 발생했는지 git bisect 가능.

---

## 11. 작업 흐름 요약 (결정 후)

```
Q1~Q6 답변
   ↓
Phase 3.1.A 착수 (cards.ts)
   ├─ 4 신규 파일 생성
   ├─ npm run verify
   ├─ npm run smoke
   └─ git commit + push
   ↓
[검증 기간 — 사용자 결정에 따라]
   ↓
Phase 3.1.B 착수 (items.js)
   ├─ 5 신규 파일 생성
   ├─ ?raw 합치기
   ├─ npm run verify + 수동 시나리오
   └─ git commit + push
   ↓
[검증 기간]
   ↓
Phase 3.1.C 착수 (orderForm.js) — 2세션
   ├─ 세션 1: 6 파일 분할 + verify
   └─ 세션 2: 수동 시나리오 6가지 + commit
```

---

## 12. 롤백 전략

각 phase 시작 전 git tag 생성:
```bash
git tag refactor/cards-baseline
git tag refactor/items-baseline
git tag refactor/orderForm-baseline
```

문제 발생 시:
```bash
git revert HEAD                    # 마지막 커밋만
git reset --hard refactor/X-baseline  # 모든 변경 취소
```

Cloudflare Pages는 자동 배포이므로 git push만 하면 5분 내 롤백 완료.

---

## 13. 예상 소요 시간

| Phase | 작업 | 검증 | 합계 |
| --- | --- | --- | --- |
| 3.1.A cards.ts | 30분 | 10분 | 40분 |
| 3.1.B items.js | 60분 | 30분 | 90분 |
| 3.1.C orderForm.js (1) | 90분 | 10분 | 100분 |
| 3.1.C orderForm.js (2 — 검증만) | - | 60분 | 60분 |
| **합계** | **3시간** | **2시간** | **5시간** |

세션당 1~2시간 작업 가정 시 **3~4세션**.

---

## 14. 다음 액션

1. 위 §10 Q1~Q6에 사용자 결정
2. Phase 3.1.A부터 착수 (또는 사용자 선택대로)
3. 매 분할 후 `npm run verify` + `npm run smoke` 통과 확인
4. session-context.md 갱신
