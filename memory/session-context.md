# 세션 핸드오프 — UI/UX 전수감사→P0~P2→공유화→백로그①④③ 완주 (2026-07-21~22)

> 세션별 덮어쓰기 파일. 이전 핸드오프(원장 3열)의 durable 내용은 [[design-ledger-line-vat-columns]]에 보존됨.

## 완료 상태 (전부 prod 배포·main 동기·worktree 정리 완료)
- **prod 배포 4회**: P0+P1(`338f0e0b`) → P2+공유화1~4(`86799860`) → (중간 XSS 봇픽스 병합) → 백로그①④③(`19a3a434`). origin/main tip=`c292250d`. worktree `ui-p0`=end-session으로 제거, 원격 `session/ui-p0` 브랜치=백업 잔존.
- **P0**: XSS ~20곳 escape·모달 ESC 실결함(인라인 display→hidden)·employeeSelf 접근성·cashFlow data-money·깨진한글
- **P1**: 매입원장 tabular-nums+인쇄명세서 3열(ledgerAllocVat)·금액표 fixed 6곳·accounting CSV(페이지루프 5000캡)·AREA 청구치수 힌트·팔레트 스윕 24파일(SHIPPED=green·PRINTING=blue·입금방법 뱃지 시맨틱화)
- **P2**: "검색" 라벨 통일·뱃지 3요소 아이콘·이모지→FA·로컬 esc 위임 (35파일)
- **공유화 1~4**: 전역 헬퍼 신설(dsDownloadCsv/dsBuildCsv·fmtNum·fmtDateOnly·dsPaginate·dsOpenModal/dsCloseModal·openClientSearchModal·MES_STATUS 색/아이콘 SSOT=dsStatusBadge)+채택 스윕+동명 전역 충돌 전멸(switchTab 5·renderPagination 5 페이지-prefix)+**정본 명문화**(ui-consistency §9 헬퍼 카탈로그·review-checklist §14 재구현 반려 게이트)
- **백로그①**: native date→flatpickr js-fp 109곳/36파일 전멸. shell.js DOMContentLoaded+**SPA fast-path** 양쪽 자동 init(SPA 경로 누락은 에이전트가 발견한 잠복버그였음). 동적모달 4곳 배선·valueAsDate 5곳 변환
- **백로그④**: 거래처 picker 4벌→openClientSearchModal(1건 자동선택·부수효과 보존·죽은 함수 16개 제거. bank=복합UI 의도적 스킵)+상태뱃지 SSOT 2건(productionReports·scan, 시각회귀0 정책)
- **백로그③**: design-token.md 실코드 재생성(--fs-*·--space-xs..2xl 실명·z-index 실측표·사이드바==모달 50 동률 경고)+3문서 상충 정정(버튼 rounded-lg·amber-600·ds-card 정본)

## 판단기준 (이 세션 결정 — 번복 금지)
- **상태색 정본**: SHIPPED=green·PRINTING=blue·HOLD/QUOTATION=amber (statusLabels.ts TONES가 유일 소스. 색 변경=그 파일만)
- **입금방법 뱃지**: 카드=gray·현금=green·계좌이체=blue·수표=amber·어음=red (ledger↔accounting 동일)
- **entity(법인) 뱃지 인디고**(#eef2ff/#4338ca)=의도적 별도 체계로 보존
- **포털(portal*) 상태색**=의도적 로컬 설계(고객대면) — SSOT 위임 금지
- **시각회귀 0 정책**: SSOT 위임은 픽셀 동일하거나 드리프트 교정일 때만. 음영 불일치(cardDetail bg-*-100 등)는 스킵됨
- **AP client_type 필터 금지** 등 기존 정책 불변

## 다음 세션 TODO (우선순위)
1. **감사 잔여 소항목 일괄** (반나절): approvals 탭 pill→밑줄 통일 · settings/purchaseOrderForm Lucide SVG→FA · 요약카드 숫자 text-3xl 통일(payroll/laborContracts 2xl 혼용) · orders 행 액션버튼 상시노출→호버 · 빈상태 CTA(quotations.js:82·clients.js:166) · clientDetail 성공동작 warning 토스트색(416,446) · showToast 로컬 중복 3파일(iaScan/invoice/quotation — invoice/quotation은 독립렌더라 폴백 필요 확인) · 임의 z-[60]×4/z-[70]×2 정리(품목·거래처검색 모달 70)
2. **장비상태 SSOT 확장** (~1h, ★사용자 결정 필요: IDLE 음영 amber(equipment.js) vs gray(production/schedule.js) 중 택1): statusLabels.ts에 equip kind 추가 → equipment.js:15-31·production.js:742-748·schedule.js:74-80·dashboard.js:443-444 위임
3. **다크모드 인라인 hex 345곳/29파일** (★착수 전 사용자에게 다크모드 실사용 여부 확인 — 미사용이면 보류): 최다=productionReports 22·equipment 18·production 16·quality 15·inventory 13
4. **점진 이관** (페이지 손댈 때 자연 이관, 별도 스윕 불요 — §14 게이트가 신규 차단 중): 수제 뱃지 44파일→ds-badge · ds-input/ds-filter-bar/ds-empty/스켈레톤 채택 · dsPaginate 실전환 · dsOpenModal 이관 · printHtml/collectFilters/initTabs 공용화(미구현 잔여 헬퍼)

## 주의사항
- **정본**: 디자인=`.claude/skills/mes-ui-consistency/`(SKILL §9 헬퍼 카탈로그 필독)·리뷰=`review-checklist` §14. design-token.md=2026-07-22 실코드 스냅샷
- **로컬 D1 드리프트**: 스모크 1FAIL(activity-logs 500)=`actor_entity_id` 컬럼 미적용 — `npm run db:migrate:local`로 해소 (prod 무관)
- **배포 게이트**: 배포는 명시 "배포 진행" 확인 필수. push-to-main FIRST(superset — origin/main 봇커밋 수시 전진, fetch→merge 후 push)→`deploy:prod`(--branch main 포함됨)→apex 15페이지/13API(401)/필드마커
- **멀티세션**: 새 작업=`.\scripts\new-session.ps1 <이름>` worktree 격리. 메인 체크아웃(feat/dept-pnl)=상태판용
- 검증 명령: `npm run verify` / 스모크=`npm run dev:d1` 백그라운드 기동 후 `npm run smoke`(포트 3000 단일)
