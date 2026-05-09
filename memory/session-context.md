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
