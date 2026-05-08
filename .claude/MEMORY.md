# MEMORY.md — 자동 학습 기록

> 실수와 교훈만 기록. 프로젝트 환경/특이사항은 CLAUDE.md에서 관리.

## 실수 & 교훈

| 날짜 | 상황 | 교훈 |
|------|------|------|
| 2026-03-18 | rmdir /S /Q 명령어를 PowerShell에서 실행 → 에러 | PowerShell에서는 `Remove-Item -Recurse -Force` 사용. cmd 문법 절대 금지 |
| 2026-03-18 | 프로젝트를 Django로 잘못 추정 | 먼저 package.json, tsconfig.json 등을 확인하고 기술 스택 판단할 것 |
| 2026-03-18 | C:\dongsan_mes 경로 직접 접근 불가 | 홈 디렉토리 바깥 경로는 Cowork에서 마운트 불가. 심볼릭 링크도 원본으로 해석됨 |
| 2026-03-23 | 이미 논의된 내용을 반복 질문 | 세션 간 정보가 유실되지 않도록 MEMORY.md에 기록. 이미 얘기한 내용 재확인 금지 |
| 2026-03-27 | Cowork에서 파일 직접 삭제 안 될 수 있음 | 사용자에게 PowerShell 명령어 제공 |
| 2026-03-27 | compact 시 대화 내용 유실 | 핵심 기술 결정/데이터 구조는 반드시 MEMORY.md에 기록할 것 |
| 2026-03-29 | 프로젝트 경로를 C:\dongsan_mes로 잘못 안내 | 실제 작업 경로는 `C:\Users\user\dongsan_mes`. 명령어 안내 시 항상 이 경로 사용 |
| 2026-03-29 | JSX 배포 경로를 publish\Scripts\로 잘못 안내 | dotnet publish 결과물의 JSX는 publish 루트에 위치. csproj의 CopyToOutputDirectory 설정 확인 |
| 2026-04-03 | Topaz RIP Temp 폴더에 .job 파일 직접 넣어도 프리뷰 동작 안 함 | RIP 프로그램은 자기가 생성한 Temp 파일만 처리. 외부에서 넣는 건 무시됨. 매뉴얼에 따르면 Queue Setup의 Hot Folder 기능을 사용해야 Input Queue에 자동 등록됨 |
| 2026-04-03 | .job 파일의 WorkType=1(프리뷰), WorkType=3(즉시출력), OutputMode=0(프리뷰), OutputMode=2(출력) | Temp 폴더의 .job은 WorkType=1, Job 폴더의 .job은 WorkType=3 |
| 2026-04-03 | 사용자에게 스크립트 실행 방법을 번거롭게 안내 | 파일을 직접 생성해서 프로젝트 폴더에 넣어주고, 메모장으로 경로만 수정하게 하는 게 훨씬 간단 |
| 2026-04-04 | 병렬 에이전트가 대규모 파일 수정 시 파일 잘림 발생 (index.tsx, ledger.ts, layout.ts 세 파일 잘림) | 병렬 에이전트에게 대규모 파일 수정 시 "파일 끝을 잘르지 말 것" 명시 필요. 빌드 후 잘린 파일 즉시 확인하고 복원할 것 |
| 2026-04-04 | 디자인 개선 시 토글 미리보기로 사용자 선택 → 전체 적용 방식이 효과적 | 15개 항목 중 13개 선택됨 (라운드 코너, 다크 액센트 제외). 사용자가 한번에 전부 적용하는 걸 꺼림 |
| 2026-04-04 | purchaseRequestForm에서 `is_purchase_item=1` 파라미터는 백엔드가 인식 못함 | `type=purchase`가 올바른 필터 파라미터. 백엔드 API 필터 파라미터는 코드에서 확인 후 사용 |
| 2026-04-04 | 발주서 페이지에 납기예정일(expectedDate)과 납품요청일(deliveryDate) 두 필드가 중복 | 하나로 합침 — expectedDate 필드에 통합, DB delivery_date와 동기화 |
| 2026-04-07 | Phase A 4개 스크립트(financialReports/vatReports/paymentRequests/cashSchedule)에서 `(function init(){ loadX(); })()`를 파일 상단에 두고 `window.loadX = ...`를 하단에 정의 → 호이스팅 안 되어 ReferenceError, 그 이후의 `window.switchTab` 등도 정의되지 않아 onclick 전부 깨짐 | **패턴 규칙**: `window.foo = function(){}` 형태의 함수는 호이스팅되지 않으므로 IIFE 초기화 블록은 반드시 파일 **맨 아래** (모든 `window.*` 정의 이후)에 둘 것. 호출도 `window.foo()` 명시. cashFlow.js처럼 IIFE 없이 인라인 호출하거나, 함수 선언(`function foo(){}`) 사용은 안전 |
| 2026-04-07 | cashSchedule.js에 `function showToast(msg, type) { if (window.showToast) window.showToast(...) }` 로컬 fallback 정의 → 함수 선언이 호이스팅되면서 전역 `window.showToast`(layout.ts 제공)를 덮어씀 → 자기 자신을 무한 호출 → `Maximum call stack size exceeded` | **규칙**: `showToast`, `showFieldError` 같은 전역 유틸리티는 layout.ts의 SHARED_AUTH_JS에서 이미 제공되므로 스크립트 파일에서 **절대 재정의 금지**. fallback도 만들지 말 것 |
| 2026-04-07 | cashScheduleRouter를 `/api/cash-schedule`에 마운트했지만 cashSchedule.js 스크립트는 `/api/cash-flow/schedule/*` 호출 → 404 | 라우터 추가 시 **마운트 경로와 스크립트 호출 경로 일치 확인 필수**. Hono는 같은 prefix에 여러 라우터 마운트 가능 (내부 경로 중복 없을 때). cashFlowRouter + cashScheduleRouter를 `/api/cash-flow`에 공유 마운트 |
| 2026-04-07 | vatReports.ts `/summary`에서 `hometax_invoices`를 `invoice_direction='PURCHASE'`, `supplier_name/brn`으로 조회 → 실제 컬럼은 `invoice_type='BUY'`, `issuer_corp_name/num` → 500 | 마이그레이션 0088 스키마 확인 후 컬럼명 수정. 외부 라우트가 다른 테이블의 컬럼을 참조할 때는 마이그레이션 파일로 실제 컬럼명 확인 필수 |
| 2026-04-07 | cashFlow.ts `/fixed-expenses` GET에서 `fe JOIN users u` 후 WHERE `is_active=?`, ORDER BY `category, name` 무수식 컬럼 사용 → SQLite에서 ambiguous 판정되며 500 | JOIN 쿼리에서 컬럼 참조는 **항상 테이블 alias 명시**(`fe.is_active`, `fe.category`, `fe.name`). `u.name` 같이 같은 이름이 양쪽에 있으면 특히 위험 |
| 2026-04-08 | 급여 간이세액표 빈 구간 fallback이 `monthlyPay * 0.03` → 부정확 | 국세청 공식(`calcOfficialMonthlyTax`: 근로소득공제 5구간 + 인적공제 150만×가족수 + 누진세율 8구간 + 근로소득세액공제)으로 교체. 세액표 자동생성 API(`/tax-table/generate`, 1M~10M 10K 스텝 900행)도 함께 제공해 빈 구간 원천 차단 |
| 2026-04-08 | 급여 모달에 기존 `prOvertimeHours`(근태) + `prOvertime`(금액) 중복 존재 → 수동/자동 혼동 | **패턴**: 자동 계산이 기본, 금액 수동 입력은 "수동 입력" 토글로 별도 섹션. 전송 시 `prOvertimeManualMode` 플래그로 `overtime_pay`(금액) vs `overtime_hours`(시간) 중 하나만 포함. 백엔드는 `body.overtime_pay != null` 체크로 분기 |
| 2026-04-08 | 독립 HTML 페이지(payslip, year-end) 생성 시 `pageAuthMiddleware` 붙이면 SPA 요청으로 오인됨 | invoice/quotation 패턴을 따라 **pageAuthMiddleware 제외**, 페이지 내부에서 `localStorage.getItem('token')` → `axios.defaults.headers.common['Authorization'] = 'Bearer ' + token` 직접 설정. 새 창(window.open)으로 열 때 localStorage는 같은 origin이면 공유됨 |
| 2026-04-08 | 급여 목록 쿼리는 `SELECT p.*, e.name, e.employee_code, e.department, e.position`이라 `p.employee_id`가 자동 포함됨 | 클라이언트에서 `r.employee_id`로 바로 연말정산 페이지 링크 생성 가능. 컬럼 누락 없는지 쿼리 직접 확인 필수 |
| 2026-04-09 | `.claude/templates/route.template.ts` 더미 치환 dry-run — 더미 리소스명 + 실제 테이블(`clients`)로 `tsc --noEmit` 통과, `npm run build` 통과(3,146.47 kB, 모듈 244). 템플릿 import 경로(`../types/env`, `../middleware/auth`)와 `HonoEnv` 제네릭 정합성 확인 | 템플릿 실사용 전 검증 패턴: ① `sed`로 토큰 치환 → 임시 파일 생성 → ② `tsc --noEmit`으로 타입 에러 확인 → ③ `npm run build`로 esbuild 통과 확인 → ④ 임시 파일 삭제. cashFlow.ts 같은 기존 tsc 에러는 무시해도 됨 (Vite는 esbuild 사용) |
| 2026-04-09 | 세무사 대행 CSV 세트를 4종으로 확장 (변동사항/월별급여/연간대장/직원명부) | 세무사가 매월 필요로 하는 4가지 포맷을 한 드롭다운에 모아두면 연말정산 시 별도 요청 없이 자체 다운로드 가능. RRN 마스킹은 ADMIN만 원본 표시 원칙 유지 |
| 2026-04-09 | payroll.ts `/tax-agent/annual`에서 `p.taxable_salary`와 `p.long_term_care`를 명시 SELECT → 500 (no such column). payroll 테이블에 `taxable_salary` 컬럼 자체가 없고, 장기요양 컬럼명은 `long_term_care_insurance` (migration 0111) | **payroll 테이블 컬럼 주의**: ① `taxable_salary` 없음 → 과세대상은 `total_salary`로 대체 ② 장기요양은 `long_term_care_insurance` (alias `long_term_care`로 SELECT). `p.*` SELECT는 에러는 안 나지만 JS에서 `r.long_term_care`는 undefined가 되어 0 출력되는 잠복 버그 → 항상 컬럼명 명시 또는 alias 사용. smoke test가 이 버그를 0.6초에 잡아냄 |
| 2026-04-09 | `src/scripts/payroll.js` line 90에 `',\\''`(백슬래시 2개+따옴표) → JS 파서가 `\\` 이스케이프 후 `'`로 문자열 조기 종료 → SyntaxError → **파일 전체 파싱 실패** → 모든 `window.payroll*` 미등록 → "버튼들이 다 작동 안 해" 현상. layout.ts의 백틱 템플릿에서는 `\\'`가 맞지만 **scripts/*.js 파일은 그냥 `\'` 써야 함** (Vite `?raw` 자동 이스케이프 없음 확인) | **스크립트 파일 검증 자동화**: 코드 편집 후 `node -c src/scripts/*.js`로 전체 파일 syntax check. 루프: `for f in src/scripts/*.js; do node -c "$f" 2>&1 \| grep -q SyntaxError && echo "FAIL: $f"; done`. 빌드는 통과해도 런타임 파싱 에러는 잡히지 않으므로 별도 검증 필수. smoke test도 런타임 파싱 에러는 못 잡음 (API 레벨만 테스트) |
| 2026-04-09 | shipments.js가 `prefi`에서 잘림 (508줄, 미완성 문장), purchaseOrders.js `escapeHtml` 중복 선언 — MEMORY.md 2026-04-04 "병렬 에이전트 파일 잘림" 재발 가능성 | 병렬 에이전트가 대규모 파일을 수정할 때 파일 끝이 잘리는 버그가 여전히 존재. 모든 `src/scripts/*.js` 편집 후 `node -c`로 syntax check는 필수. 이 2개 파일은 별도 복원 작업 필요 (이번 세션에선 payroll만 수정) |
| 2026-04-09 | `/hr` 페이지가 `/users`로 리다이렉트되어 직원 목록을 UI에서 볼 수 없었음 | CLAUDE.md에 "HR 페이지는 사실상 미사용"으로 적혀 있었으나 B5 세무사 CSV 기능을 쓰려면 직원 목록/수정 UI가 필요. `src/pages/hr.ts` (482줄) 살아 있어 `index.tsx`의 redirect 제거 + layout.ts 사이드바에 "직원 관리" 메뉴 추가로 복구 |
