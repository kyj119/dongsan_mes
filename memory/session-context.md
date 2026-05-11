# 최근 세션 컨텍스트 (2026-05-09)

## 이번 세션 (2026-05-09)에서 완료된 작업

### Phase 0 — 인프라 안정화 ✅ 완료
- 거래처 정책 UI (가격 정책 드롭다운) — 마이그레이션 0187 활용
- GitHub Actions 자동 배포 (deploy.yml + verify.yml)
- GitHub Secrets 등록 (CLOUDFLARE_API_TOKEN/ACCOUNT_ID)
- git history squash 7GB → 2.5MB (1700배 감소, .gitignore 보강)

### Phase 1 — 회계·재무 정합성 ✅ 완료
- **1.1 즉시수금 증빙 유형 분류**: 마이그레이션 0189 (`orders.receipt_type`), 회계반영 모달에 select 추가 (세금계산서/현금영수증/카드/간이), bulk-bill API에서 receipt_type 수용 (snake/camelCase 양쪽 호환)
- **1.2 멀티사업자 이메일**: 마이그레이션 0190 (`entities.email_from_address`, `email_from_name`), `emailProvider.sendEmail({meta: {entityId}})`로 entity별 발신 우선, 법인 정보 설정에 입력 필드 추가
- **1.3 팝빌 LinkedID**: 사용자가 직접 settings에서 입력 완료 (코드 변경 없음)

### Phase 3.3 — TypeScript 인터페이스 갱신 ✅ 완료
- `src/types/models.ts`: Client/Order에 누락 컬럼 다수 추가 (price_list_id, price_policy_id, auto_billing, billing_status, receipt_type, cancel_reason 등)
- 신규 인터페이스: Entity, PricePolicy, PricePolicyRule
- 신규 타입 alias: BillingStatus, ReceiptType, OrderType

### Phase 3.1 — 대형 파일 리팩토링 ✅ 완료 (3 파일 → 15 파일)

**Phase 3.1.A — cards.ts** (2121줄 → aggregator 30줄 + 3 파일 2180줄)
- `src/routes/cards.ts` (30줄): 얇은 aggregator (route mount만)
- `src/routes/cards/queries.ts` (836줄): 13 GET 라우트 + entityFilter
- `src/routes/cards/scheduling.ts` (166줄): 4 PUT/PATCH (assign/priority/bulk-priority/notes)
- `src/routes/cards/lifecycle.ts` (1178줄): 14 라우트 (status/ship/defects/generate/etc) + syncOrderStatusFromCards 헬퍼
- 매칭 우선순위: queries(구체 경로) → scheduling(/schedule/:id) → lifecycle(/:id/*) — orders.ts 패턴

**Phase 3.1.B — items.js** (3235줄 → 5 파일 3245줄, ?raw concat)
- `src/scripts/items/core.js` (504줄): 상수, 캐시, 로딩 유틸, 그룹 편집 모달
- `src/scripts/items/modals.js` (506줄): 품목 CRUD 모달 + 자재 매핑
- `src/scripts/items/tabs.js` (467줄): 메인 탭, 출력/원자재 그룹 뷰, 인쇄방식
- `src/scripts/items/media.js` (1190줄): 인쇄매체 단일/그룹 CRUD, RM 그룹 일괄
- `src/scripts/items/bulk.js` (578줄): 일괄 추가, 가격 이력, window exports, 초기화
- `src/pages/items.ts`: 5 ?raw → `[a,b,c,d,e].join('\n')`

**Phase 3.1.C — orderForm.js** (3966줄 → 6 파일 3979줄, ?raw concat)
- `src/scripts/orderForm/client.js` (230줄): 거래처 + 배송시간
- `src/scripts/orderForm/itemRow.js` (334줄): 품목 행 빌드/자동완성/추가/삭제/스케일
- `src/scripts/orderForm/finishing.js` (507줄): 마감 PP/타공/오프셋/주석
- `src/scripts/orderForm/calc.js` (564줄): 단가·총액 계산
- `src/scripts/orderForm/sheet.js` (1065줄): 폼 제출 + AI tabs + 합판 레이아웃
- `src/scripts/orderForm/parent.js` (1279줄): AI 파일/결과 + 부모/자식 + 후가공 복원
- `src/pages/orderForm.ts`: 6 ?raw concat (orderFormDist.js는 그대로 — 351줄, 통합 무가치)

**검증 결과**:
- typecheck (tsc --noEmit) 통과 ✓
- vite build 통과: 297 → 306 modules (+9 신규 모듈), 4.17MB
- dist 검증: cards 31 라우트 + items 14개 핵심 window.* + orderForm 26개 핵심 window.* + 7개 인라인 함수 모두 존재 ✓
- 변수명 충돌 검사 통과 (top-level var 모두 unique)
- 백업: `src/scripts/items.js.refactor-baseline`, `src/scripts/orderForm.js.refactor-baseline` (gitignore 후 삭제 권장)

**미완료 (다음 세션)**:
- 수동 시나리오 검증 (`refactor/PHASE_3_1_VERIFICATION.md` 체크리스트 참고)
- Playwright E2E 도입 (Phase 5.3로 이월) — ✅ 같은 세션에서 완료됨

### Phase 5.3 — Playwright E2E ✅ 완료
- **인프라**: `@playwright/test` devDep + `playwright.config.ts` (production URL, ko-KR/Asia/Seoul, headless, screenshot/video/trace on failure)
- **fixtures.ts**: `authedPage` (E2E_USER/PASS 자동 로그인) + `consoleErrors` (page.on('console'/'pageerror') 감시)
- **5개 spec (read-only, 데이터 오염 0)**:
  - `auth.spec.ts`: 로그인 → /cards + 사이드바 href 검증 (a[href="/clients"] 등)
  - `clients.spec.ts`: editClient(1) async + 가격 정책 드롭다운 option 로드 검증
  - `order-form.spec.ts`: 9개 핵심 window.* + 거래처 검색 + 단가 계산 (56,000/61,600)
  - `items.spec.ts`: 6개 핵심 함수 + 메인 탭 전환 (output→sign→rawMaterial)
  - `cards-api.spec.ts`: 10개 API 200 (defect-stats 포함) + /:id/history + /:id/defects
- **워크플로우 `.github/workflows/e2e.yml`**:
  - workflow_run (deploy 성공 후 자동)
  - schedule cron `0 0 * * *` (KST 9시)
  - workflow_dispatch (수동 실행)
  - HTML report + trace/screenshot/video 14일 보관
- **`@rollup/rollup-linux-x64-gnu`** → `optionalDependencies` 이동 (Windows에서 npm install 가능)
- **e2e scripts에 `npx` prefix** (wrangler가 PATH의 `playwright` 명령 가로채는 충돌 회피)
- **검증 결과**: 7/7 통과 (production https://webapp-9i0.pages.dev 대상)

### Phase 3.2 — 견적서 → 주문 전환 재설계 🟡 진행중
**결정사항** (사용자 답변):
- Q1 1:N (한 견적서 → 여러 주문 가능)
- Q2 별도 `quotations` 테이블 신설
- Q3 immutable snapshot 복사 (변환 시 모두 복사)
- Q4 quotations.first_converted_at + orders.quotation_id FK (1:N 호환 조정)
- Q5 기존 데이터 그대로
- Q6 "주문 생성" 버튼 + 양쪽 연결 표시 + prefill (검토 후 저장)

**작업 완료**:
- 마이그레이션 `0191_quotations_separated.sql`: quotations + quotation_items + orders.quotation_id
- `src/routes/quotations.ts` 신규 (GET list/detail/orders, POST create/convert-to-order, PUT update, DELETE cancel)
- `src/types/models.ts`: Quotation + QuotationItem + QuotationStatus 타입
- `src/index.tsx`: `app.route('/api/quotations', quotationsRouter)` 등록
- `src/scripts/quotations.js`: 신규 API 사용 (axios endpoint 5곳 변경), 상태 매핑 변경 (ACTIVE/EXPIRED/CANCELLED + partial)
- `src/scripts/quotationForm.js`: POST/PUT/GET → /api/quotations (구 orders API fallback 유지)
- `src/scripts/orderForm/parent.js`: `?quotation_id=X` prefill 흐름 + 견적서 연결 배너
- `src/routes/orders/core.ts`: POST /api/orders가 `source_quotation_id` 받아 orders.quotation_id 저장 + quotations.converted_count 자동 증가
- 견적서 상세 모달에 "이 견적서로 생성된 주문" 표시
- `e2e/quotations.spec.ts` 추가 (3개 시나리오)

**대기 (다음 세션 또는 검증 후)**:
- 마이그레이션 prod 적용 (`npm run db:migrate:prod` 필요)
- 주문 상세 페이지에 "이 주문은 견적서 #N에서 옴" 표시 (orders 페이지 UI 변경 — 다음에)
- 구 데이터 (orders.status='QUOTATION') 마이그레이션 — 사용자 결정상 그대로 둠

### 이번 세션에서 발견·수정한 실제 회귀
- **`/api/cards/defect-stats` 404 → 200**: Phase 3.1.A 분할 후 cards/queries.ts에서 `/:id` 라우트가 `defect-stats`를 카드 ID로 가로채는 라우트 매칭 순서 버그. Claude in Chrome으로 수동 검증 중 발견 → `/defect-stats`를 `/:id` 앞으로 이동.
- **commit message UTF-8 이슈**: 한글 commit message가 Cloudflare Pages API에서 "Invalid UTF-8" 거부 → `git config --global i18n.commitEncoding utf-8` 영구 설정 + 영어 commit message로 amend.

---

## 이전 세션 (2026-05-08) 컨텍스트

### 1. 거래처 편집 모달에 가격 정책 드롭다운 추가
- **결정**: UI는 거래처 편집 모달에만 추가 (상세 페이지 아님), 기존 `price_list_id`/`client_price_rates`와 공존
- **변경 파일 3개**:
  - `src/pages/clients.ts`: `clientModalPricePolicy` select 추가 (단가표 옆)
  - `src/scripts/clients.js`: `loadPricePolicyOptions()` 추가, editClient/saveClient/showAddClientModal 갱신
  - `src/routes/clients.ts`: POST /api/clients가 `price_policy_id` 받음 + 기본 정책(is_default=1) 자동 할당
- **검증**: 샌드박스에서 typecheck (exit 0) + build (294 modules, 4.16MB) 통과
- **수동 UI 검증**: 자동 배포 셋업 후 production URL에서 확인

### 2. GitHub Actions 자동 배포 셋업 (CI/CD)
- **결정**: typecheck/build/deploy/smoke를 한 워크플로우에 묶어 main push 트리거
- **신규 파일 2개**:
  - `.github/workflows/deploy.yml` — main push → typecheck + build + Cloudflare Pages 배포 + smoke 헬스체크
  - `.github/workflows/verify.yml` — PR 시 typecheck + build (현재 PR 흐름 없으면 미작동, 미래용)
- **사용자 액션 필요**: GitHub Secrets에 `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` 등록
  - SMOKE_USER/SMOKE_PASS는 선택 (기본 admin/password)

## 다음 세션 주의사항

1. **GitHub Secrets 셋업 후 첫 push 동작 확인 필수**: 토큰 권한 부족 시 배포 실패. Cloudflare API Token은 "Edit Cloudflare Workers" 템플릿 사용.
2. **smoke의 admin/password 기본값**: 프로덕션 admin 계정 비번이 다르면 SMOKE_PASS 시크릿 등록 필요. 안 하면 smoke 401로 실패.
3. **거래처 정책 UI 수동 검증 시나리오**:
   - `/clients` → 거래처 수정 → "가격 정책" 드롭다운 노출 확인
   - 정책 선택 → 저장 → 재진입 시 값 유지 확인
   - 새 주문 작성 → 해당 거래처 + 정책 적용된 품목 → 단가 자동 반영 확인
4. **다음 후보 작업**: 즉시수금 증빙 유형 분류 (receipt_type 컬럼 추가 + 회계반영 UI)

## 기존 미해결 이슈 (이전 세션 이월)

### 오프셋 버그 (SheetLayout 3mm 확장 미작동)
- 코드 분석 완료, MCP로 SheetLayout.jsx 직접 실행 디버깅 필요
- 관련 파일: `IllustratorAutomat/SheetLayout.jsx` (line 168~197, 322~344), `Program.cs` (line 1419~1544)

### CAPS 경리PC 워커 실행
- .env 배포 완료, 경리 PC에서 `node src/index.js` 실행 대기
- **현재 경리 PC 접속 불가 상태** (사용자 보고, 2026-05-08)

---

# 이전 세션 컨텍스트 (2026-04-29)

## 이번 세션에서 확정된 결정

### 1. 서버PC = IA PC 통합
- **결정**: 192.168.0.94 (서버PC)에서 IllustratorAutomat.exe를 직접 실행
- **왜**: 일러스트 사용자가 1명만 남아서 별도 IA PC 불필요
- **코드 변경 불필요**: `ERP_API_URL = "http://192.168.0.94:3000"` 그대로 사용 (자기 자신에게 연결)
- **해야 할 것**: publish/IllustratorAutomat.exe 이 PC에서 실행 + Windows 작업 스케줄러 자동시작 등록

### 2. Illustrator MCP 연결 확인
- **결정**: mcp__illustrator__* 툴 정상 작동 확인 (view로 스크린샷 성공)
- **활용 방향**: JSX 직접 실행 → 결과 확인 → 수정 루프로 개발 속도 대폭 향상
- **다음 세션에서**: MCP로 JSX 테스트 워크플로우 구축

### 3. PROJECT_STATUS.md 정리
- **CAPS on-prem** → 🟢 완료로 이동
- **통합 메시지 발송** → 🟡 유지 (SMS/카카오 완료, 이메일/팩스 미확인)

## 오프셋 버그 현황 (미해결)

### 증상
- SheetLayout → 주문 처리 흐름에서 3mm 확장이 안 됨

### 코드 분석 결과
- `SheetLayout.jsx`에 `createEdgeStrip` 함수 있음 (line 168~197)
- `bleed_mm = _params.bleed_mm || 3` — 기본값 3mm
- C#(Program.cs line 1512)에서 `bleed_mm = sheetBleedMm` 넘김 ✅
- **미확인**: `allDesignItems`가 `createEdgeStrip` 호출 시 실제로 채워져 있는지 (SheetLayout.jsx line 322-344 부근)
- **다음 단계**: MCP로 SheetLayout.jsx를 test.eps에 직접 실행해서 edge_strip 작동 여부 확인

### 관련 파일
- `IllustratorAutomat/SheetLayout.jsx` (line 168~197: createEdgeStrip, line 322~344: bleed 적용)
- `IllustratorAutomat/Program.cs` (line 1419~1544: SheetLayout 파라미터 구성)
- `IllustratorAutomat/ProcessOrderItem.jsx` (별도 오프셋 로직 — SheetLayout과 무관)

## 다음 세션 주의사항

1. **오프셋 디버깅은 MCP로**: `_ia_params_override_path` 변수 활용해서 파라미터 파일 직접 지정 가능
   ```javascript
   // SheetLayout.jsx line 40-41에 이미 구현됨
   var _cfgPathSL = (typeof _ia_params_override_path !== "undefined" && _ia_params_override_path)
       ? _ia_params_override_path : ...
   ```
2. **IllustratorAutomat 자동시작**: 작업 스케줄러 설정 시 "로그인 시 실행" + Illustrator 실행 대기 필요
3. **brainstorming 미완료**: (가)(나)(다) 모두 필요하다고 했으나 (가) 디버깅 먼저 진행 예정
