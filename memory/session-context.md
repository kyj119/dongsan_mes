# 세션 컨텍스트 (2026-06-09) — 코드리뷰 8건 처리

## 완료 작업
리뷰 항목 #1~#8 + entity 감사 전건 처리. 커밋 `eefc94eb`~`ce89bbec`, origin `ce89bbec` 푸시 완료.

| # | 항목 | 결과 |
|---|---|---|
| 1 | PII 22MB 히스토리 추적 | **git filter-repo로 8건 전 히스토리 제거** + force-push. 백업 `../dongsan_mes_backup.git`(7.3G) |
| 2 | layout.ts 3,259줄 | **전면 분할 3259→228줄**: layout/{menu,sidebar,topbar,shared-styles}.ts + scripts/layout/shell.js(?raw) |
| 3 | getElementById 가드 | 전수 가드 **반려**(4,521개·로직파괴) → `npm run check:dom` lint 신설(8건 후보) |
| 4 | hooks 공유 | 이식성 6개 → settings.json(공유), 경로의존 3개 local 유지 |
| 5 | 문서 단일소스 | 완료문서 3건 docs/archive/ 이동. 루트 .md 8→5 |
| 6 | CLAUDE.md 중복 | 작업원칙 3중복 1불릿 통합 + layout 함정노트 #2 동기화 |
| 7 | 루트 난립 | seed_*.sql 9개 → seed/(package.json 경로갱신), 정크 3건 삭제(NUL/tatus/h--force…) |
| 8 | migration 번호갭 | 정보성(조치 불필요) — 신규는 순번 엄수 |
| 감사 | entity_id | **이상 없음** — 8개 테이블 다행 SELECT 전부 entityFilter 적용 |

## 결정 + 이유
- **#1 히스토리 제거(force-push) 선택**: tmp_clients.csv(거래처 18MB)·근로계약서.hwp = PII 확실 → rm--cached만으론 히스토리 잔존. 사용자가 "나)완전제거" 승인. **추가 발견 2건(품목정보.xlsx·근로계약서.hwp)** 포함해 8건 일괄(재작성 반복 방지).
- **#1 안전장치**: mirror 백업 선행 → filter-repo → blob 부재 SHA검증 → force-push 직전 재확인. `--force-with-lease=main:<oid>`로 fetch 없이(옛 PII blob 재유입 방지) 푸시.
- **#1 원격 분기 처리**: force-push 시 원격이 봇커밋 999ec26(IMPROVEMENT_BACKLOG Area4) 1건 앞섬 발견 → GitHub API로 파일만 받아 재반영(유실 방지) 후 푸시.
- **#2 무손실 추출**: SHARED_AUTH_JS는 `${}`보간 0·내부백틱 0·`\\`쌍 25개뿐 → eval 평가값 = 브라우저 수신 JS 동일. **old/new 빌드 번들 바이트 완전 동일(5,318,811) 증명**.
- **#3 전수 가드 반려**: 4,521 호출 대부분 즉시 `.value` 사용 → 일괄 early-return은 로직 파괴. CLAUDE.md 진짜 위험(?raw ID 미정의 silent-fail)만 교차검증 lint로 대체.
- **#4 부분 이동**: 경로 하드코딩(`C:/Users/user/dongsan_mes`) 3개는 Windows bash에서 `$CLAUDE_PROJECT_DIR` 이식 불안정 → local 유지, 이식성 6개만 공유.

## 주의사항 (다음 세션 필수 확인)
- ⚠️ **협업자(kyj119) re-clone 필수** — 히스토리 재작성으로 전 커밋 SHA 변경. `git pull` 금지.
- ✅ **백업 미러 삭제됨**: 검증 완료 후 7.23G 회수(2026-06-09). 롤백 소스 없음 — 원격 `0d7fea21`이 정본.
- ⚠️ **GitHub dangling**: 원격 옛 커밋이 일정기간 dangling 보관 → 완전삭제 필요 시 GitHub Support. 저장소 public이면 과거 캐시 잔존 가능.
- ⚠️ **`.git` 7.3G**: 우리가 지운 8건(~22MB) 아닌 **다른 대량 바이너리(publish/exe/tools 등)가 히스토리에 박힘** — 별도 다이어트 미승인 이슈.
- ⚠️ **settings.json hooks 재승인**: 공유 이동된 6개 hook은 다음 세션 시작 시 Claude Code 승인 프롬프트 가능.
- ⚠️ Bash 작업디렉토리가 세션 중 `cd src/routes`로 이동했었음 — 절대경로/`git -C` 사용 권장.

## 다음 세션 TODO
- ✅ **(완료) equipment(0302) partial-miss 4곳 전부 격리** — equipmentQueue /workload·cards/queries /schedule/queues·dashboard /equipment-load·aiInsights /bottleneck. equipment WHERE(entity_id) + cards(requesting_entity_id, JOIN/queue_count 서브쿼리) 적용. dashboard는 로컬 cardEntityFilter 사용. (zero-filter 라우트 caps/hrSelf/payroll-shared는 다른 유효 스코핑=정상)
- (#3 후속) `npm run check:dom` 8건 후보 개별 검토: pendingTableBody(#328 dead 확인)·token-login-note·itemSearch·pPaymentsBody 실 silent-fail 여부.
- (#5 후속) 활성 상태 PROJECT_STATUS 일원화는 부분만 — ROADMAP/HANJIN/IMPROVEMENT_BACKLOG는 유지. 추가 통합 검토.
- (선택) `.git` 7.3G 다이어트 — 히스토리 바이너리 제거 여부 사용자 결정 필요(또 force-push 동반).
