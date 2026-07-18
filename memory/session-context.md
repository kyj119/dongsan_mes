# 세션 핸드오프 — 생산 2축 허브 통합 (사이드바 Level 2 마지막, 2026-07-17)

> 세션별 덮어쓰기 파일. 상세 정본 = [[project-sidebar-consolidation]] (auto-memory).
> 직전 작업(손익 허브 통합)은 prod 배포완료(main `8ce8919c`), [[project-sidebar-consolidation]]·PROJECT_STATUS.md 반영.

## 이번 세션 상태 — ✅ prod 배포완료 (main `b2a05c83`·deploy `8fe3f9ba`, 커밋 `057f73a2`)
생산 현황(/production) + 생산 분석(/production-reports) 통합. 자금허브/손익허브와 동일 패턴.
배포 시 origin/main 봇5건 앞서있어(designer XSS `cced2ce0` 포함) superset 병합(충돌0·verify green) 후 `--branch main`. apex=/production 200·/production-reports 200(보존)·/cost-analysis 302·API 401.
**사이드바 Level 2 3대 허브(자금·손익·생산) 전부 완료 → 통합 프로젝트 종료.**

### 구조
- /production 최상위 토글 `[생산 현황][생산 분석]`. 현황=production(전원·OPERATOR 포함·즉시 로드), 분석=productionReports 흡수(**ADMIN/MANAGER 게이팅·lazy**).
- 단일소스: `productionReports.ts` → `export const productionReportsContent`+`export const productionReportsScript`(tabSwitch+prodReports+costAnalysis) → production.ts `#prodHubAnalysis` 이식.
- `switchProdMode(mode)`(hubScript): 토글+역할게이팅(`localStorage.user.role` ADMIN/MANAGER, 비관리자 토글 숨김+진입차단)+분석 첫진입 `__prodAnaInit` 호출.
- menu.ts: /production-reports 은퇴(페이지·라우트·API·`/cost-analysis`→`?tab=cost` 리다이렉트 전부 보존).

### 충돌 처리 (Explore 정밀맵 기반)
- **하드충돌 = element ID `kpiOk`·`kpiError` 2개뿐**(양쪽 '오늘 OK/에러' KPI·동일 ID·다른 API). → **분석측만** `prodAnaKpiOk`/`prodAnaKpiError` 리네임(productionReports.ts 1줄 + productionReports.js 2줄). production(허브 베이스·OPERATOR 핵심)은 무변경.
- **JS 전역 충돌 0**: 개발자가 production=`switchProdTab`/`production*`, reports=`switchProdAnalysisTab`/`oee*`로 이미 네임스페이스 분리 → ?raw concat 단일스코프에서도 안전. **IIFE 불요**(손익허브보다 단순).

### 지연 init 2종
- `__prodAnaInit`(daily-summary): 단독=즉시(`!__prodAnaDefer`), 허브=분석 첫진입.
- `__costInit`(원가): **항상 lazy**(원가 탭 진입 시). ⚠️**근본이유**=costAnalysis.js가 파싱시점 `loadAnalysis()` auto-run → 허브에서 OPERATOR도 `/api/costs`(requireRole ADMIN/MANAGER) 403. 지연으로 방지.
- production.js는 무변경(현황=기본, 즉시 실행 유지).

## 검증 (완료)
- `npm run verify` green.
- **로컬 Playwright 실측(ADMIN)**: ID 각1개(충돌해소)·기본 현황/분석 hidden·지연 init_done=false(403 미발생)·분석진입 daily-summary 발동·원가 lazy(탭 진입 시만)·OEE·모드왕복·production 서브탭(현황/스케줄/작업실적)·단독 /production-reports 회귀0·콘솔 0 실에러.

## 다음 단계
1. (선택) 프로덕션 육안 확인: 로그인 후 /production에 `[생산 현황][생산 분석]` 토글 노출·분석 진입·원가/OEE.
2. 사이드바 Level 2 3대 허브(자금·손익·생산) 전부 완료 → 통합 프로젝트 종료. 다음 과제는 별건(단가·간판BOM·HR B3/B5 등 마스터플랜).
3. (참고) 생산 현황 KPI vs 분석 일일생산 KPI 위젯 콘텐츠 중복은 잔존(허브 co-location만 완료, de-dup은 범위 밖).

## 주의사항
- 리네임 ID는 **productionReports 측만**(prodAnaKpi*). production.ts/js의 kpiOk/kpiError는 그대로(허브 베이스).
- 분석 스크립트는 허브에서 전원 파싱되지만 init은 게이팅+지연 → 비관리자 API 호출 0.
- 커밋 메시지 한글 OK(git). wrangler `--commit-message`만 ASCII([[feedback-windows-deploy]]).
