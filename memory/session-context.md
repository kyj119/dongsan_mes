# 세션 핸드오프 — 자금 허브 통합 P3·P4 (2026-07-17)

> 세션별 덮어쓰기 파일. 상세 정본 = [[project-sidebar-consolidation]] (auto-memory).

## 이번 세션 완료 (전부 prod 배포·main 반영)
### Level 2 자금 허브 P3 — /cash-schedule를 자금 관리 허브로 통합
- **최상위 [계획]/[실적] 토글**: 계획=cashSchedule(기존 5탭·기본), 실적=bank(5탭·ADMIN·lazy).
- **단일소스 이식**: `bank.ts`→`export const bankPageContent`·`bankPageCSS` 추출→cashSchedule.ts `#hubActuals`에 이식(HTML 중복 0).
- **lazy-load·지연 init**: 프리앰블 `window.__bankHubDefer=true`로 bank.js 자동실행 차단→`window.__bankHubInit`(멱등)을 실적 첫 진입 시 호출. 계획은 기본 로드.
- **ADMIN 게이팅**: 실적 토글은 `localStorage.user.role==='ADMIN'`만 노출+`switchHubMode` 서버·클라 이중 차단(bank API 29개 이미 requireRole ADMIN).
- **사이드바**: /bank 은퇴(라우트·API·페이지 보존, /spec-groups 선례), /cash-schedule 라벨 '자금계획'→'자금 관리'(fa-wallet). 11→10.
- **충돌 사전검증**: element ID·window.* 교집합 0(bank54/cash19/cashFlow16).

### P4 — 표시 일원화(겹치는 위젯 상호 네비게이션)
- 대출잔액 두 소스(bank fund-summary:89·cashFlow /summary:803) **동일 쿼리 확인**(SUM current_balance FROM loans is_active=1)→데이터 정합, UX만 정비.
- `window.hubGoto(mode,tab)` 헬퍼(모드+하위탭 동시 이동). 크로스링크:
  - 계획>고정비 → 실적 당월 출금현황(`.hub-actuals-link`, ADMIN만)
  - 실적>자금현황 고정비 → 계획 고정비 마스터 편집(`.hub-only`, 허브에서만·단독 /bank 숨김)
  - 계획>월별 kpiLoanBalance → 대출 탭 / 실적 fundLoanNote → 계획 대출 관리(hubGoto 있을 때만 클릭링크)

## 검증 (로컬 D1 + Playwright 실측, admin/ADMIN)
- verify green(typecheck+build) ×2 / 페이지 콘솔 에러 0
- 계획 기본로드·실적 지연(deferFlag·initDone=false) / 실적 첫클릭 lazy-load(잔액 2,990,000원)
- bank 하위탭·계획↔실적 왕복·멱등 / P4 크로스링크 4종 hubGoto 네비 동작
- **단독 /bank 회귀 없음**: deferFlag 없음→즉시 init·hub-only 숨김·fundLoanNote plain

## 다음 세션 TODO — Level 2 잔여(미착수)
- **손익/경영분석 허브**: financial-reports(실시간 P&L)+reports 수익성·미수금 탭. ④미수금 aging 4중복(ledger 정본, reports·bank·accounting 미러) 딸림.
- **생산 2축**: production(실시간)+production-reports(집계) '오늘 생산 스냅샷' 중복.
- accounting은 이미 "조회통합+링크아웃" 허브 패턴 확립(정답 템플릿).

## 배포 (완료)
- FF merge origin/main(ia-designer-loop 3커밋 superset) → 커밋 → push HEAD:main → `deploy:prod`(--branch main).

## 주의
- 사이드바 필터 정본 = DB `/api/permissions/me`(shell.js:687~), menu.ts roles는 decorative. ADMIN 전 메뉴 노출.
- bank.js는 /bank(단독)·/cash-schedule(허브) 양쪽 로드 — Init 지연은 `__bankHubDefer`로만 분기. 단독은 즉시.
