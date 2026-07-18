# 세션 핸드오프 — 사이드바 Level 3 추가 통합 4건 (2026-07-18)

> 세션별 덮어쓰기 파일. 상세 정본 = [[project-sidebar-consolidation]] (auto-memory).
> 직전(생산 2축)은 prod 배포완료(main `b2a05c83`).

## 이번 세션 상태 — 완료·검증·커밋, ⚠️ 프로덕션 배포 대기
2차 진단으로 발굴한 잔여 기능중복 4건 통합. 전부 흡수-탭 패턴(단일소스 export·지연 init·사이드바 은퇴, 페이지·라우트·API 보존). Explore 2에이전트로 충돌 사전매핑.

### #1 장비(/equipment) + 정비(/maintenance)
- 근거: 동일 API(`/api/rip/maintenance/dashboard`)·equipment가 이미 정비모달 내장 = 실중복.
- 정비를 **equipment 5번째 탭**(list/layout/dashboard/queue/**maintenance**). maintenance.js는 **완전 IIFE**(전역 0)라 충돌 없음 → `__maintDefer`로 auto-init 차단 + `window.__maintInit` 노출(멱등, 클로저 플래그 `__maintInited`)→switchTab('maintenance') 진입 호출.
- **정비 탭 ADMIN/MANAGER 게이팅**(equipment은 DESIGNER 포함, maintenance API=authMiddleware라 클라 게이팅이 경계 보존). 기본 hidden → maintGateScript가 관리자만 노출.
- CSS: equipment가 이미 `.summary-card` 보유 → maintenanceCSS 미추가(override 방지).

### #2 급여(/payroll) + 요율(/settings/payroll-rates)
- payroll에 **상위 탭 없어 신설**([급여 관리][요율 관리], `prSwitchHubTab`). payrollRates(prR*) vs payroll(pr*) 충돌 0.
- `__prRDefer`로 요율 auto-init(2 API) 차단 → 요율 탭 진입 시 `__prRInit`(멱등). 권한 동일(ADMIN/MANAGER)→게이팅 불요.
- **중복 요율모달 버튼 제거**(payrollOpenRatesModal). 모달 DOM/함수는 dead 잔존(무해, pr* 충돌 없음).

### #3 경영진단(/management-report) → /reports 탭
- management-report=**순수 정적 HTML**(pageScript:''·스크립트·API·id 0, .mr-root 스코프) → `switchAnalyticsTab` 배열에 `mgmt` 추가·`anaTabMgmt` 버튼·`anaMgmtContent` 정적삽입. 지연·격리 전부 불요(가장 단순).

### #4 세금증빙(/tax-invoices) + 부가세(/vat-reports)
- tax-invoices=이미 3탭 허브(`switchTaxTab` tax/cash/hometax) → **vat 4번째 탭**. `__vatDefer`로 vat auto-init(2 API) 차단 → 부가세 탭 진입 시 `__vatInit`.
- **fmt 충돌 1건**(무해하나 방어적) → vat `fmt`→`vatFmt` 리네임(17개소). 권한 동일→게이팅 불요.

## 검증 (완료)
- `npm run verify` green.
- **로컬 Playwright 실측(ADMIN)**: 4허브 전부 탭 노출·지연 init(로드 시 미발생→탭 진입 발동)·콘텐츠 이식·탭 전환 정상. 단독 4페이지(/maintenance·/settings/payroll-rates·/management-report·/vat-reports) 즉시 init·허브요소 부재·회귀 0. 콘솔 실에러 0(179건 ERR_CONNECTION_REFUSED=notification 폴링 환경노이즈·무관).

## 다음 단계
1. **⚠️ 프로덕션 배포 = 사용자 명시 확인 대기** ([[feedback-deploy-needs-explicit-request]]). 마이그레이션 없음(순수 코드).
2. 배포 시: **origin/main 분기 먼저 확인**(직전 2회 모두 봇이 앞서 있었음) → superset 병합 → `--branch main` → apex 검증(/equipment·/payroll·/reports·/tax-invoices 200 + 단독 4페이지 200 보존).
3. 사이드바 통합 프로젝트 사실상 종료(Level 1·2·3 완료). 다음은 별건 마스터플랜(단가·간판BOM·HR B3/B5 등).

## 주의사항
- payroll-rates 실제 라우트=`/settings/payroll-rates`(메뉴 path와 동일, 페이지 activePage만 `/payroll-rates`).
- 리네임/제거: vat `fmt`→`vatFmt`(vatReports.js), payroll 요율모달 버튼 제거(모달 DOM 잔존).
- 커밋 메시지 한글 OK(git). wrangler `--commit-message`만 ASCII([[feedback-windows-deploy]]).
