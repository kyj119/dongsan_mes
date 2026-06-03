# Improvement Backlog
<!-- last_run_area: 3 -->
<!-- last_run_at: 2026-06-03T18:00:00+09:00 -->

> 자율 점검·개선 에이전트(auto-improve)가 6개 영역을 순환하며 발견한 항목.
> 용준님이 주기적으로 리뷰하여 상태를 변경 (new → approved → done, 또는 rejected).

## 통계
| 상태 | 건수 |
|------|------|
| 🆕 new | 12 (I-025~I-036, 전부 open) |
| ✔️ done | 44 |
| ❌ rejected | 2 |

> **Area 3 UX/기능 감사 (2026-06-03T18:00):**
> - **방법**: 병렬 에이전트 3개 — 영업·회계 / 생산·재고·구매 / 대시보드·HR·포털. 75+ 페이지 .ts(HTML)↔.js(동작) 대조로 검색·필터·빈상태·페이지네이션·journey 링크·KPI 점검
> - **🔧 자동 수정 A-011 (재고 집계 버그)**: `inventory.js:160` "총 N개 품목"이 페이지 slice 건수(`items.length`, 최대 20)를 표시 → 품목 수백개여도 항상 20 표시. API는 이미 `pagination.total` 반환 중. `renderInventoryTable(items, total)`로 전체 COUNT 전달하도록 수정. verify(typecheck+build, 351 modules) 통과
> - **핵심 패턴 발견 — Dead-filter 3건 (#343, I-033)**: **백엔드 라우트가 필터 파라미터를 이미 WHERE 처리하는데 프론트가 안 보내 도달 불가**. paymentRequests 날짜(routes:21-22)·production 출력이력 장비/상태/날짜(printEvents:574)·portal orders 상태(portal:329, +count쿼리 status 누락 버그). input만 붙이면 즉시 가치 → ROI 최고
> - **포털 셀프서비스 갭 (#344, I-034)**: 세금계산서 다운로드 부재+50건 하드캡(portal:451)·미수금 aging 부재(사내 대시보드는 30/60/90 풀제공)·재주문 native `prompt()`(고객대면 모바일 UX). 포털 도입 목적 약화
> - **회계 CSV/검색 (#345, I-035)**: taxInvoices CSV 부재(ledger/bank/financialReports엔 다 있음)·cashSchedule CSV·paymentRequests 지급처/사유 검색
> - **필터·드릴다운 (#346, I-036)**: 연차 부서 필터 부재(잔여현황/미사용수당)·불량률 리포트→검수 상세 드릴다운 단절
> - **이상 없음 확인**: orders/clients/quotations/taxInvoices 필터·CSV·페이지네이션·empty-state·journey 체인 완비. 대시보드 KPI 8종+aging/저재고/설비부하 충실. 급여·근태·activityLog·messages 양호. HR limit:500은 SMB 직원규모상 무해. **silent-fail(깨진 getElementById) 미발견**
> - 자동 수정 1건(A-011), 신규 이슈 4건(#343~#346)
>
> **Area 2 코드 품질 (2026-06-03T14:30):**
> - **방법**: 병렬 에이전트 2개 — entity_id 격리 / N+1·auth·타입. 의존성 설치 후 `tsc --noEmit` PASS·라우트 등록 83/83·utils 미사용 export 0건 직접 확인
> - **authMiddleware 누락 0건**: 83 라우터 전수 — portal/hrSelf/auth/webhooks 공개는 의도적, 집계 라우터는 서브라우터 위임. 신규 없음
> - **타입 에러 0**: tsc 통과. `as any`는 45→70(routes)이나 신규분 전부 외부입력(`req.json() as any`)/env 바인딩/D1 결과 관행 캐스트 — 위험 패턴 아님(타입 우회 버그 은폐 없음). `(c.env as any)` 4건만 타입 보강 후보(저우선, 이슈화 보류)
> - **신규 이슈 #341(I-031, N+1 미전환)**: cashFlow.ts:456 현금흐름 예측 핫패스(12개월×6쿼리=72) 최우선 + purchaseRequests read N+1 + import 루프(clients/cardExpenses/kakao/attendance) + child INSERT 루프들. **자동수정 안 함**: read 집계 재작성은 정합성 검증 필요, INSERT 루프는 leaves.ts 행별 try-catch 에러수집/2-pass last_row_id 의존이라 batch 전환 시 에러·트랜잭션 시맨틱 변경(런타임 검증 불가 환경)
> - **신규 이슈 #342(I-032, rip.ts entity_id 미배선)**: equipment_consumables·maintenance_schedules가 0237에서 entity_id 추가됐으나 rip.ts 전체 entity 처리 전무. 단 **부모 equipment가 전역 공유(entity_id 없음)** → 자식만 격리는 반쪽 정합, 설비 전역공유 유지/법인분리 정책 판단 필요(owner 결정). 현재 전부 entity 1로 수렴해 실질 위협 낮음
> - **오탐 차단 4건**(엄밀 재검): activity_logs.entity_id(다형성 참조), attendance/employees(동적컬럼+getEntityId fallback/#322 서버강제), migration_logs(ADMIN 운영로그), 채번/2-pass parent 루프(순차 불가피)
> - 자동 수정 0건(안전+런타임검증 기준 미충족), 신규 이슈 2건(#341, #342)
>
> **Area 1 프로덕션 헬스 (2026-06-03T10:30):**
> - **방법**: GitHub Actions 최근 15런 분석 + 프로덕션 헬스(샌드박스 egress는 Cloudflare 엣지 403 차단으로 직접 호출 불가 → CI 로그 기반 판정)
> - **🔴 자동 수정 A-010 (배포 파이프라인 복구)**: 최근 2개 push(Area 5·6 docs)의 **Deploy 실패**. Cloudflare API `Invalid commit message, must be valid UTF-8 [8000111]`. **근본 원인 = byte 길이**: Area 4(98B) 성공 / Area 5(119B)·6(106B) 실패 — 모두 유효 UTF-8이나 Cloudflare가 ~100B에서 commit message를 절단하며 **한글 멀티바이트 절단** → 깨진 UTF-8. wrangler가 git 메시지를 자동 전송하던 것을 `--commit-message="${{ github.sha }}"`(ASCII 고정)로 차단. `deploy.yml:62`. verify(typecheck+build) 통과
>   - **기능 영향 없음 재확인**: Area 5·6은 docs-only 커밋이라 dist/ 동일 → 실제 프로덕션 기능은 마지막 코드 배포(A-009/e8c8992) 기준 정상. 다만 파이프라인 RED라 **다음 실코드 변경도 배포 불가** 상태였음 (구조적 차단 해소)
> - **신규 이슈 #340 (I-030, E2E CI 신뢰도)**: E2E 프로덕션 테스트 다수 날짜 연속 RED — `fixtures.ts:59` authedPage `waitForURL` 30s 타임아웃(cold start, flaky) + `crud-order-lifecycle.spec.ts:57` 주문생성 `res.success=false`(hard fail, 프로덕션 직접 주문생성=데이터 오염 설계). 안전 자동수정 불가 → 이슈
> - **E2E 게이팅 확인**: e2e.yml은 deploy 성공 시에만 실행(`workflow_run conclusion==success`) → 배포가 막혀 최근 E2E run들이 `skipped`로 표시되던 것. A-010으로 deploy 복구되면 E2E도 재가동됨
> - typecheck PASS·build PASS(351 modules, 4.9MB worker)·npm ci 정상. Daily D1 Backup 정상 success
> - 자동 수정 1건(A-010), 신규 이슈 1건(#340)
>
> **Area 6 자기 진화 (2026-06-02T17:00):**
> - **GitHub ↔ 백로그 동기화 완료**: open auto-improve 이슈는 5건(#334~#338)뿐, 나머지 전부 closed 재확인
> - **I-013~I-024 (11건, #32~#46) → done 확정**: 각 이슈 코멘트/코드 교차검증
>   - 완료 코멘트 명시: #32(보안헤더 3종, HSTS/CSP는 근거와 함께 보류)·#33(change-pw rate limit)·#34(XSS escapeHtml 39개소)·#35(dashboard e2e spec)
>   - 코멘트無 → 코드로 구현 확인: #39(SELECT* 157→8)·#37(printSystem batch 적용, 채번부 순차는 주석 근거)·#38·#45
>   - owner 논의로 기능 확장 후 closed: #43(결재 연계)·#44(작업큐 통합)·#46(가동시간 기반 가동률, 코멘트 👍)
> - **신규 open 3건 new 표 편입**: #335(I-027 저장형 XSS)·#336(I-028 CI 폴백 자격증명)·#337(I-029 debug+error.message) — 이전 세션 last_run_area 미동기로 누락됐던 잔여
> - **탐지 규칙 강화 (스킬 2개 업데이트)**:
>   - security-audit + auto-improve: 시크릿 폴백 grep 규칙 `c.env.X || '리터럴'` 명문화 (#314가 놓치고 #338이 net-new로 잡은 패턴)
>   - auto-improve Area 4: ground-truth 기법(로컬 D1에 migrations 적용→실제 스키마 교차검증) 문서화
> - **오탐 패턴 2건 추가**: CORS `!origin→'*'`(Bearer 인증), rate limiter in-memory Map(아키텍처 제약) — 양 스킬 + 하단 표 갱신
> - 자동 수정 0건(메타 정리), 신규 이슈 0건(정리 전용)
>
> **Area 5 보안 (2026-06-02T15:30):**
> - **방법**: 백엔드/프론트 3개 에이전트 병렬 — SQLi+인증 / XSS+에러노출+rate / 보안헤더+시크릿+CORS
> - **SQLi 0건**: 1,206개 `DB.prepare` 전수 — entityFilter·`.bind()`·ORDER BY 화이트리스트(`cards/queries.ts:302,802`)·`PRAGMA table_info` ALLOWED_TABLES(`attendance.ts:31`) 전부 안전
> - **인증 누락 0건**: 전 라우터 authMiddleware/portalAuth/agentKey/verifySelfToken 적절 보호
> - **rate limit 누락 0건**: login/change-password/refresh/self-auth/verify-document/verify-token 8개 커버(`index.tsx:239-246`)
> - **신규 이슈 #338(I-026)**: 하드코딩/약한 자격증명 2건 — hr.ts 주민번호 AES 키 `'fallback-dev-key'` 폴백 4곳(HIGH-data) + users.ts reset-password 기본값 `'password'`(MED). **이전 Area 5(#314) "하드코딩 시크릿 없음" 단언이 놓친 net-new**
> - **#335에 코멘트 추가**: 서버사이드 템플릿 XSS(laborContract.ts/employmentCertificate.ts `c.html()` 무이스케이프) — 클라이언트 escapeHtml과 다른 코드경로라 #335가 놓침. 잔여 클라이언트 누락분(invoice/quotation 인쇄빌더, activityLog, hr.js)도 함께 기재
> - **동기화 메모**: 오늘 더 이른 Area 5 산출물 = #335(저장형 XSS, open) / #336(CI 폴백 자격증명, open) / #337(debug 엔드포인트+error.message, open). 백로그 last_run_area가 4로 미동기였음 → 이번 실행에서 정정. #314(closed)는 직전 Area 5 자동수정(XSS 11건+SQLi cashFlow)
> - **오탐 차단**: CORS `!origin → '*'`(`index.tsx:213`) — Bearer 토큰 인증(쿠키 미사용)이라 브라우저 CORS만 영향+브라우저는 항상 Origin 전송 → 실질 무해, 이슈화 보류. rate limiter in-memory Map(`rateLimit.ts:6`) isolate 분산 한계 — 기존 인지 사항
> - 자동 수정 0건(전부 동작/정책 변경 또는 #335 검토 대기 XSS), 신규 이슈 1건(#338), 코멘트 1건(#335)
>
> **Area 4 데이터 정합성 (2026-06-02T13:30):**
> - **방법**: 프로덕션 D1 직접접근 불가(API 토큰 없음) → 278개 마이그레이션을 로컬 D1에 적용해 **실제 해석 스키마**(169테이블·424인덱스) ground truth 확보 + 코드 정적분석 병행
> - **자동 수정 A-009**: PO 번호 생성 entity 필터 누락 3곳(core.ts reorder/quick + templates.ts) → 정규 시퀀스 경로(getNextSeqNumber+getEntityId)로 정렬, 0281 복합 UNIQUE 정합. verify 통과, commit e8c8992
> - **신규 이슈 #334(I-025)**: order_templates entity_id 부재 — 주문 템플릿 전 법인 공유 (격리 갭)
> - **오탐 차단 2건**(에이전트 보고 → ground truth 반증): tax_invoices `idx_ti_number_entity` UNIQUE 이미 존재 / shipments `shipment_number` 전역 UNIQUE(복합보다 강함)
> - **인덱스 후보 37건 교차검증**: 대부분 오탐(컬럼 존재하나 실제 hot query path 아님). print_file_map·returns·cash_receipts hot path는 이미 인덱스 보유 확인. inventory_receipts.po_id만 저빈도 WHERE(core.ts:445) — 영향 미미로 이슈화 보류
> - 자동 수정 1건(A-009), 신규 이슈 1건(#334)
>
> **Area 3 UX/기능 감사 (2026-05-14T13:30):**
> - 75개 페이지/스크립트 전수 UX 패턴 분석 (검색·필터·페이지네이션·빈상태·로딩)
> - approvals.js 3탭 결재 목록 검색·필터·페이지네이션 전무 → #43 등록 (MEDIUM, 2~3h)
> - tasks.js 작업 큐 limit:200 하드코딩 (API max:500) — 200건+ 실패 태스크 미표시 → #44 등록 (SMALL, 30m)
> - deliveryAnalytics + financialReports CSV 내보내기 없음 (productionReports와 불일치) → #45 등록 (MEDIUM, 2h)
> - 대시보드 장비 가동률 % KPI 부재 — 생산 용량 즉시 파악 불가 → #46 등록 (SMALL, 1~2h)
> - 자동 수정 0건 (안전 기준 미충족), 신규 이슈 4건 (#43~#46)
>
> **Area 2 코드 품질 (2026-05-14T11:00):**
> - authMiddleware: 84개 라우트 파일 전수 확인 — 모두 적절히 보호됨 ✓
> - try-catch 누락 17핸들러 자동 수정 (A-008): permissions(5) + finishing(7) + messageTemplates(4) + iaAuto(1)
> - N+1 신규 패턴 3건 발견: printSystem.ts rebuildItemPrices/대량생성 → #37 등록, settings.ts+priceLists.ts → #38 등록
> - SELECT * 잔여 157건 (이전 수정 범위 플랫 파일 한정) → #39 등록
> - floating HEAD 18개 커밋 main fast-forward 통합 완료
> - 자동 수정 1건 (A-008), 신규 이슈 3건 (#37/#38/#39)
>
> **Area 1 프로덕션 헬스 (2026-05-14T09:15):**
> - TypeScript typecheck: PASS ✓, Vite build: PASS ✓ (4.2MB worker, 307 modules)
> - 65개 라우트 등록 전수 확인 — 누락·충돌 없음 ✓
> - npm audit: esbuild GHSA-67mh (SSRF) — 기존 거절 패턴 (#23), 신규 조치 없음
> - 신규 발견 2건 (#35 대시보드 E2E 커버리지 부재, #36 try-catch 누락 4개 라우트)
> - 자동 수정 0건 (자동 수정 가능 항목 없음)
>
> **Area 6 자기 진화 (2026-05-13T16:00):**
> - GitHub 실제 상태 ↔ 백로그 대조: 18개 "new" 중 14개 완료·1개 거절 확인 → 동기화
> - 오탐 패턴 2건 문서화: dev server SSRF(#23 거절), webhooks.ts Popbill IP 화이트리스트(의도적 보안 제어 → 하드코딩 아님)
> - F-004 패턴 확장: 비활성 필드 UI 힌트 등 미세 UX 제안 금지 규칙 추가
> - 스킬 파일 3개 업데이트: auto-improve(오탐 제외 목록), security-audit(dev-server 제외), review-checklist(§13 N+1 패턴)
> - 미추적 완료 이슈 2건 추가: #24(inventory.ts N+1), #25(priceList+inspections N+1)
> - 신규 이슈 0건 (기존 발견 사항 정리 완료, 다음 Area 1부터 신규 탐지)
>
> **Area 5 보안 (2026-05-13T13:30):**
> - SQL Injection 전수 검사: entityFilter() + 파라미터 바인딩 확인 → 취약점 없음
> - XSS 5건 자동 수정 (A-006): approvals.js:380, invoice.js:203, purchaseInvoice.js:193, quotation.js:202, clients.js:463 → escapeHtml() 적용
> - XSS 잔여 (approvals.js:119-276, cards.js document.write) → #34 등록 (HIGH)
> - 보안 헤더 (CSP/X-Frame-Options/HSTS) 전무 → #32 등록 (HIGH)
> - /api/portal/auth/change-password rate limit 누락 → #33 등록 (MEDIUM)
> - CI 폴백 자격증명 (admin/password) 낮은 위험, GitHub Secrets 분리 권고
> - Popbill IP 화이트리스트 하드코딩 → #32 포함 기재 *(이후 오탐으로 재분류: 의도적 보안 제어)*
>
> **Area 4 데이터 정합성 (2026-05-13T11:30):**
> - tax_invoice_items/tax_invoice_orders tax_invoice_id 인덱스 누락 → A-005 자동 수정 (0193 migration)
> - shipment_items UNIQUE(shipment_id, card_id) 없음 → #31 등록 → 완료 (0194 migration)
> - order 삭제 캐스케이드, 상태 머신, 트랜잭션 경계 등 검토 → 기존 코드에서 대부분 적절 처리됨
> - bank_transactions, inventory_transactions 인덱스 이미 존재 확인 → 추가 조치 불필요
>
> **Area 3 UX/기능 감사 (2026-05-13T10:00):**
> - 출고 → 세금계산서 이동 링크 없음 → #27 등록 → 완료
> - 주문 상세 → 카드 현황 버튼 없음 → #28 등록 → 완료
> - 납기 준수율 KPI 없음 → #29 등록 → 완료 (대시보드 전면 재설계)
> - 원단 소모 예측 검색/필터 없음 → #30 등록 → 완료
>
> **Area 2 코드 품질 (2026-05-13T00:00):**
> - authMiddleware 전수 검사 (73개 라우트): 전부 적절히 보호됨 — 이슈 없음
> - models.ts 미사용 타입 8개 자동 제거 → A-004
> - SELECT * 178건 발견 → #26 등록 → 완료 (145건 제거 96%)
>
> **Area 1 헬스체크 (2026-05-12T16:30):**
> - hono JWT CVE + postcss XSS — 즉시 자동 패치 (A-003)
> - esbuild/vite dev server SSRF → #23 등록 → 거절 (로컬 서버 전용)
>
> **Area 2 코드 품질 (2026-05-12T12:15):**
> - N+1 쿼리 6건 발견 (#16~#22) → 전량 완료
> - entity_id 누락 테이블 11개 (#18) → 완료 (0193 마이그레이션)
> - as any 270건 (#17) → 완료 (902→45, 95% 제거)

---

## 🆕 New (미검토)

> 전부 GitHub open + 👍 미수신. 용준님 리뷰 대기.

| ID | 제목 | 영역 | Issue | 공수 |
|----|------|------|-------|------|
| I-025 | order_templates entity_id 부재 — 주문 템플릿 전 법인 공유 | Area 4 | #334 | ~1일 |
| I-026 | 하드코딩/약한 자격증명: hr.ts 주민번호 키 폴백 + reset-password 기본값 | Area 5 | #338 | 30분~반나절 |
| I-027 | 저장형 XSS — escapeHtml 누락 다수 (포털 등 7개 스크립트) | Area 5 | #335 | 2~3h |
| I-028 | CI 폴백 자격증명 admin/password — 프로덕션 대상 (deploy/e2e yml) | Area 5 | #336 | 30분 |
| I-029 | 프로덕션 debug 엔드포인트 잔존 + error.message 노출 (admin 전용 LOW) | Area 5 | #337 | 30분 |
| I-030 | E2E 프로덕션 테스트 연속 RED — auth 픽스처 cold-start 타임아웃 + crud-order 주문생성 실패 | Area 1 | #340 | 2~3h |
| I-031 | N+1 쿼리 batch 미전환 다수 — cashFlow 예측 핫패스(72쿼리) 우선 + import/child INSERT 루프 | Area 2 | #341 | 3h~ |
| I-032 | rip.ts 설비 자식 entity_id 미배선 (equipment 전역공유, 격리 정책 판단 필요) | Area 2 | #342 | 1일 or 갭아님 |
| I-033 | Dead-filter 3건 — 백엔드 기구현 필터 UI 미노출 (지출결의서 날짜/생산 출력이력/포털 주문 상태+count버그) | Area 3 | #343 | ~3h |
| I-034 | 포털 셀프서비스 갭 — 세금계산서 다운로드+50캡 / 미수금 aging / 재주문 prompt() | Area 3 | #344 | 3~4h |
| I-035 | 회계 CSV·검색 — taxInvoices CSV / cashSchedule CSV / 지출결의서 지급처·사유 검색 | Area 3 | #345 | ~2h |
| I-036 | 필터·드릴다운 — 연차 부서 필터 / 불량률 리포트→검수 드릴다운 | Area 3 | #346 | 3~4h |

---

## 🔧 Auto-fixed (자동 수정 완료)

| ID | 제목 | 커밋 | 날짜 |
|----|------|------|------|
| A-011 | 재고 목록 "총 N개 품목" 집계 버그 — 페이지 slice 건수(최대 20) 대신 `pagination.total` 전체 COUNT 표시 | (이번 커밋) | 2026-06-03 |
| A-010 | Deploy 차단 복구 — wrangler `--commit-message=<sha>` 고정 (한글 커밋메시지 100B 절단→UTF-8 깨짐 차단) | e396f2e | 2026-06-03 |
| A-009 | PO 번호 생성 entity 필터 누락 3곳 → 정규 시퀀스 경로 정렬 (reorder/quick/templates) | e8c8992 | 2026-06-02 |
| A-008 | try-catch 누락 17핸들러 (permissions/finishing/messageTemplates/iaAuto) | 60ee8b8 | 2026-05-14 |
| A-006 | XSS escapeHtml 5건 (approvals/invoice/purchaseInvoice/quotation/clients) | e099b20 | 2026-05-13 |
| A-005 | tax_invoice_items/orders tax_invoice_id 인덱스 추가 (0193 migration) | 1b3a698 | 2026-05-13 |
| A-004 | models.ts 미사용 타입 8개 제거 (UserSession 등) | 2f94080 | 2026-05-13 |
| A-003 | hono 4.12.18 + postcss 8.5.14 보안 패치 (JWT CVE 등 7건) | 16b1482 | 2026-05-12 |

---

## ✔️ Done (처리 완료)

| ID | 제목 | 커밋/Issue | 날짜 |
|----|------|-----------|------|
| I-013 | 보안 헤더 추가 (X-Frame-Options/X-Content-Type/Referrer-Policy, HSTS/CSP 보류) | #32 | 2026-05-13 |
| I-014 | /api/portal/auth/change-password rate limit 적용 | #33 | 2026-05-13 |
| I-015 | XSS 잔여 escapeHtml 39개소 (approvals.js 24 + cards.js 15) | #34 | 2026-05-13 |
| I-016 | 대시보드 E2E 추가 (e2e/dashboard.spec.ts, 0e67ac6) | #35 | 2026-05-14 |
| I-018 | N+1 printSystem.ts batch 적용 (채번 필요부는 순차 유지) | #37 | 2026-05-14 |
| I-019 | N+1 settings.ts + priceLists.ts assign-clients | #38 | 2026-05-14 |
| I-020 | SELECT * 잔여 정리 (157→8건) | #39 | 2026-05-14 |
| I-021 | approvals 결재 페이지 — 기존 업무흐름 결재 연계로 확장 (owner 논의) | #43 | 2026-05-14 |
| I-022 | tasks.js 작업큐 — 사이드바 통합 검토 (owner 논의) | #44 | 2026-05-14 |
| I-023 | deliveryAnalytics + financialReports CSV 내보내기 | #45 | 2026-05-14 |
| I-024 | 장비 가동률 KPI — 근무시간 기반 가동시간 측정으로 확장 (owner 👍) | #46 | 2026-05-14 |
| I-017 | try-catch 누락 17핸들러 자동 수정 (permissions/finishing/messageTemplates/iaAuto) | A-008 / 60ee8b8 | 2026-05-14 |
| D-001 | shipment_items UNIQUE(shipment_id, card_id) 제약 추가 (0194 migration) | #31 | 2026-05-13 |
| I-015partial | 스모크 커버리지 55→88 엔드포인트 확대 | #15 | 2026-05-13 |
| I-012 | 원단 소모 예측 페이지 검색+상태 필터 추가 | #30 | 2026-05-13 |
| I-011 | 대시보드 전면 재설계: 납기 준수율 KPI + 생산 파이프라인 + KPI 클릭 연결 7개 | #29 | 2026-05-13 |
| F-006 | 주문 상세 모달 "카드 현황" 버튼 추가 | #28 | 2026-05-13 |
| F-005 | 출고 목록 거래처 헤더에 "계산서 발행" 링크 추가 | #27 | 2026-05-13 |
| I-010 | SELECT * 145건 제거 (178→6건, 96%) | #26 | 2026-05-13 |
| A-008 | priceList.ts + inspections.ts N+1 → db.batch() 전환 | #25 | 2026-05-13 |
| A-007 | inventory.ts 입고/출고/취소 N+1 3패턴 → batch 전환 | #24 | 2026-05-13 |
| B-010 | inventoryCount.ts 재고 실사 N+1 → db.batch() 전환 | #22 | 2026-05-13 |
| B-009 | taxInvoices.ts O(N×M×K) 중첩 N+1 → batch 전환 | #21 | 2026-05-13 |
| B-008 | shipments.ts N+1 → db.batch() 전환 | #20 | 2026-05-13 |
| B-007 | prices.ts + rip.ts Promise.all N+1 → IN절 일괄 조회 | #19 | 2026-05-13 |
| B-006 | entity_id 누락 10테이블 (0193 migration + INSERT 16건) | #18 | 2026-05-13 |
| I-007 | as any 902→45 (95% 제거, 9 커밋) | #17 | 2026-05-13 |
| B-005 | printEvents.ts N+1 → 이벤트당 5~7→3~4 쿼리 축소 | #16 | 2026-05-13 |
| I-008 | 스모크 커버리지 확대 (3개 자동 추가) | #15 | 2026-05-12 |
| A-002 | smoke.cjs 3개 엔드포인트 추가 (quotations/hometax/search) | 256e37c | 2026-05-12 |
| A-001 | entity_id INSERT 14건 누락 | c7c20d3 | — |
| B-001 | cards entity_id 격리 | 0960a5a | #1 |
| B-002 | LogWatcher URL + 서비스 실행 | (설정 수정) | #2 |
| B-003 | SHIPPED 카드 확인 모달 | 3dd4274 | #11 |
| B-004 | cards entity_id NULL 32건 보정 | (prod SQL) | #12 |
| I-001 | bank.ts N+1 제거 | 0960a5a | #3 |
| I-002 | autoProcess.ts N+1 제거 | 0960a5a | #4 |
| I-003 | approvals.ts N+1 제거 | 0960a5a | #5 |
| I-004 | clients API 응답 통일 | 0960a5a | #6 |
| I-005 | 로그인 rate limit 적용 | 44c1f04 | #13 |
| I-006 | hr.ts 에러 메시지 제네릭화 | 44c1f04 | #14 |
| F-001 | 거래처 필터 5개 | 575312d | #7 |
| F-002 | 주문 필터 CANCELLED 해소 | 575312d | #8 |
| F-003 | 대시보드 KPI 5개 | 575312d | #9 |

## ❌ Rejected

| ID | 제목 | 사유 | Issue |
|----|------|------|-------|
| I-009 | vite/esbuild dev server SSRF (GHSA-67mh) | "로컬 서버 전용이라 크게 문제 없음" — 프로덕션 영향 없음 | #23 |
| F-004 | 납품시간 disabled 이유 표시 | 용준님: "필요 없음" | #10 |

---

## 오탐(False Positive) 패턴 — 탐지 제외 목록

> auto-improve 및 security-audit 실행 시 이하 패턴은 이슈 등록 금지.

| 패턴 | 이유 | 첫 발견 |
|------|------|----------|
| `webhooks.ts` `allowedPrefixes` Popbill IP 목록 | 의도적 보안 화이트리스트, 하드코딩 아님 | Area 5 (#20) |
| dev server 전용 취약점 (vite/esbuild SSRF 등) | 프로덕션 영향 없음, 개발자 PC 전용 | Area 1 (#23 거절) |
| disabled 필드에 이유 힌트 없음 | 용준님: 불필요 (F-004 거절 패턴) | Area 3 (#10 거절) |
| CORS `!origin → '*'` (`index.tsx:213`) | Bearer 토큰 인증(쿠키 미사용) — 브라우저는 항상 Origin 전송, 실질 무해 | Area 5 (2026-06-02) |
| rate limiter in-memory `Map` (`rateLimit.ts:6`) | isolate 분산 한계는 기존 인지 아키텍처 제약, 신규 이슈 아님 | Area 5 (2026-06-02) |
| 인덱스/UNIQUE 누락 후보 (ground-truth 미확인) | 로컬 D1 실제 스키마로 반증 필수 — 대부분 이미 존재하거나 hot path 아님 | Area 4 (2026-06-02) |

---

## 상태 변경 가이드

| 상태 | 의미 | 누가 변경 |
|------|------|----------|
| 🆕 new | 에이전트가 발견, 미검토 | auto-improve |
| 👀 reviewed | 용준님이 봄, 판단 보류 | 용준님 |
| ✅ approved | 진행 허가 | 용준님 |
| 🔨 in-progress | 구현 중 | Claude |
| ✔️ done | 완료, 배포됨 | Claude |
| ❌ rejected | 불필요 / 부적절 | 용준님 |
