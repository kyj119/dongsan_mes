# 세션 컨텍스트 — 2026-09-03 전체 리뷰 결함 수정 + prod 배포

## 완료
- 09-02~03 전체 코드 리뷰(CRITICAL 2·HIGH 89·MEDIUM 143)를 10묶음 오케스트레이션으로 수정→통합→main→prod 배포.
- worktree 11개(fix-*): rebase --onto main → fix-integration 순차 병합 → main c9e48243(172파일) + 3422c646(단가기준). push=자동배포 성공, prod smoke 114/114.
- 원가 백필 POST /costs/backfill 8,779건 prod 실행, 에러 0.
- worktree 11개 end-session 정리 완료(date-filter·sign-estimate 는 타 작업이라 유지).
- 정본: docs/audits/2026-09-03-full-review.md + fix-reports/*.md(10) + VERIFY-REPORT.md.

## owner 결정 (반영됨)
- 에누리 = 과세표준 차감(splitDiscount 부가세법 §29③ 이미 구현, 변경 불요).
- 단가 기준 = 미리보기 방식(base_price)으로 통일(priceSheets computeAppliedPrice, 3422c646).
- 입고/재고 쓰기 게이트 = requireEditOrRole(ADMIN/MANAGER). prod 권한매트릭스상 /receiving·/inventory 는 ADMIN만 edit·타 역할 접근 0 → 실제 차단된 비관리자 0. 비관리자 위임 필요 시 permission_pages can_edit 부여.

## 남은 일 (다음 세션)
1. ~~IA 축2·3·4 ia:deploy~~ **해소(09-03 21:49)** — 축2~5 드리프트 0, 축4 셸 0.10.0/0.71.0 = repo 일치. 별건으로 **축1(에이전트 JSX) 3종이 드리프트**였고(리뷰수정 51120021 + 08-26 도련 경계분할 미반영) `--sync-agent` 로 반영·sha256 4/4 일치. 남은 검증=다음 모아찍기 잡의 SheetLayout 로그.
2. storageZones 재고단위 표시 = 라우트 SELECT 에 base_unit/pack_size 추가 + inventory.ts 외 페이지에 UOM_JS 주입(반쪽 수정 상태).
3. 간판 BOM PER_AREA_ROLL·PER_LED usage_type 소요 산식(골격만).
4. autodeduct prod 실동작 = 첫 출력 뒤 실측.
5. ✅결정됨: 평문비번 폴백·JWT_SECRET AES 겸용 강화 = **실사용 전환 계획에 맞춰 예약**(지금 미착수). 절차·순서 정본=memory/project-security-hardening-golive.md. 순서 1(JWT↔PII 키분리+재암호화)→2(계정 PBKDF2 이관→폴백 제거→admin·테스트계정 정리, ③은 전환 당일).

## 주의
- 세션 도중 main 이력이 2번 재작성됨(다른 세션 amend + S2 커밋 c317e8fe). 재작업 시 origin/main 실측 우선.
- 새 커밋 트레일러 = Claude Opus 4.8(19:30 이후). 브랜치 기존 커밋은 Fable 트레일러.
- 로컬 dev 서버 잔재 없음(백그라운드 wrangler 전부 종료).
