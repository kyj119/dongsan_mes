# 세션 핸드오프 — 사이드바 중복통합 완결 (2026-07-18)

> 세션별 덮어쓰기 파일. 상세 정본 = [[project-sidebar-consolidation]] (auto-memory).

## 이번 세션 요약 — 전부 prod 배포완료, 워킹트리 clean
사이드바 기능중복 통합을 **완결**. 이번 세션 배포 커밋 순서(main):
- `8ce8919c` 손익 허브 미수금 aging 일원화(Phase 2) — ledger/reports/bank 채권나이 SSOT
- `b2a05c83` 생산 2축(생산 현황+분석 토글)
- `a3119af9` 기능중복 4건 흡수-탭(장비+정비·급여+요율·경영진단→reports·세금+부가세)
- `d075dfd9` 요율 모달 dead 코드 제거
- 최종 HEAD=origin/main=`9409e03f` (docs). 최종 deploy `197b78b6`.

**사이드바 통합 프로젝트 종료**: Level 1(3건)·Level 2(자금·손익·생산 3대 허브)·Level 3(추가 4건) 전부 prod. 은퇴한 모든 페이지는 라우트·API·직접 URL 보존.

## 핵심 결정 + 이유 (재사용 패턴)
- **흡수-탭 패턴**(모든 통합 공통): 허브 페이지에 흡수 페이지를 탭으로. **단일소스 export**(흡수 페이지 `export const xContent`+스크립트)→허브 이식(HTML 중복 0), **지연 init**(`__xDefer` 프리앰블로 auto-init 차단→탭 첫 진입 시 `__xInit` 멱등 호출, 단독 페이지는 flag 없어 즉시), **사이드바만 은퇴**(페이지·라우트·API 보존).
- **충돌 회피 우선순위**: ①element ID 교집합=흡수측만 프리픽스 리네임 ②JS 전역=이미 네임스페이스 분리면 IIFE 불요, `fmt` 등 동명은 방어적 리네임 ③완전 IIFE 스크립트(maintenance.js)는 충돌 0이나 init 호출 위해 `window.__xInit` 노출 필요.
- **역할 게이팅**: 흡수 페이지 권한 < 허브 권한일 때만 필요(예 #1 정비는 ADMIN/MANAGER, equipment는 DESIGNER 포함 → 탭 기본 hidden+`localStorage.user.role` 관리자만 노출). 권한 동일이면 불요.
- **미수금 aging 일원화**(손익 Phase 2): 3화면 서로 다른 aging → ledger의 채권나이(`oldest_unpaid_date`) SSOT로 통일. `ar-helpers.ts` `buildOldestUnpaidJoin`/`agingDaysFromOldest` 공유. **법인 스코프는 각 현행 유지**(무단 반전 배제).

## 판단 기준 (다음 세션용)
- **배포 규칙**: 커밋 후 사용자 "배포 진행" 명시 확인 필수([[feedback-deploy-needs-explicit-request]]). 배포=**origin/main 분기 먼저 fetch**(이 세션 3회 중 3회 봇이 앞서 있었음)→superset 병합→verify→`npm run deploy:prod`(=`--branch main`)→apex 검증→docs 커밋 push.
- **구조 무결 검증**: HTML 블록 제거/이식 후 `grep -oE '<div|</div>' \| wc -l`로 개폐 카운트 + 브라우저 `parent.contains(child)`·`offsetParent`(class hidden만 보면 놓침)로 형제/자식·계산 visibility 재검.
- **로컬 D1은 AR 데이터 0**: 미수금 검증은 seed 필요(clients 2·3=결제 0). LOCAL은 폐기가능, 검증 후 원복.

## 검증 명령 (PowerShell)
```powershell
npm run verify                 # typecheck + build (backend)
npm run build; npm run smoke   # 전체
# 로컬 서버: $env:BROWSER='none'; npm run dev:d1  (127.0.0.1:3000, admin/password)
# 종료: Get-Process workerd -EA SilentlyContinue | Stop-Process -Force
```

## 다음 세션 TODO (사이드바 외 — 마스터플랜)
1. **HR B5**: 4대보험 7월 요율 적용(상한 637만→**659만**·하한 40만→**41만** 리서치완료, prod insurance_rates 반영 확인). 산재 고지서 확인. → [[payroll-insurance-rates-2026]]
2. **HR B3**: 직원 셀프서비스(급여명세서·전자서명 hrSelf).
3. **품목 단가 전역 0**(블로커): 매입/매출 단가 미입력 → 원가·손익 정확도 제약.
4. **간판 BOM**: brainstorming 후 보류 상태.
5. (선택) 국민연금 기준소득월액 필드([[payroll-calc-ecount-diff]]).
6. (참고) accounting 미수금 탭도 aging 미러 가능 → 손익 Phase 2 `buildOldestUnpaidJoin` 재사용.

## 주의사항
- payroll-rates 실제 라우트=`/settings/payroll-rates`(페이지 activePage만 `/payroll-rates`).
- 커밋 메시지 한글 OK(git). wrangler `--commit-message`만 ASCII([[feedback-windows-deploy]]). PS5.1 heredoc은 Bash 도구로.
- 미추적 `docs/superpowers/specs/2026-07-10-role-expansion-rw-permissions.local-copy.md`=로컬 참조 사본(커밋 대상 아님).
