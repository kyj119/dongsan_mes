# 최근 세션 컨텍스트 (2026-05-11~12)

## 이번 세션 완료 작업 (커밋 12개)

### 인프라 + 점검
- 미커밋 정리 + push (`4784b7d`)
- `/api/auth/entities` 회귀 점검 → 정상 확인
- 문서 동기화 (PROJECT_STATUS/ROADMAP/MEMORY/design-decisions/architecture-flow)

### E2E 확장 (`5af0fed`)
- 마이그레이션 0192: entity_id=99 테스트 entity + e2e_tester user
- 18개 쓰기 테스트 추가 (총 28개): clients CRUD, 견적서→주문, 주문 라이프사이클
- fixtures.ts: writeApi (worker-scoped), playwright.config: workers=3

### auto-improve 시스템 구축 (`71cc3d5` ~ `68dc08e`)
- 6영역 순환 점검 스킬 + IMPROVEMENT_BACKLOG.md
- Area 1~6 전체 1순환 완료: 15건 발견
- GitHub Issues #1~#14 자동 생성 + 전량 처리 (done 14, rejected 1)

### Issue 구현 (2회 커밋 `0960a5a`, `575312d`)
- #1 cards entity_id, #3~5 N+1 제거, #6 clients API 통일
- #7 거래처 필터 5개, #8 주문 필터 해소, #9 대시보드 KPI 5개

### 보안 + 카드 확인 (`44c1f04`, `3dd4274`)
- #11 SHIPPED 전환 시 미완료 카드 확인 모달 (확정/취소 선택)
- #12 cards entity_id NULL 32건 프로덕션 보정
- #13 로그인 rate limit 적용
- #14 hr.ts 에러 메시지 제네릭화

### LogWatcher (`e434d6a`)
- appsettings.json URL 수정 (로컬→프로덕션), NAS 포함 4파일
- install-service.bat 인코딩 수정 (UTF-8→CP949)
- RIP PC 2대 online 확인 (TPM-01, RIP-03)
- 범용 LogWatcher 설계 문서 작성 (docs/UNIVERSAL_LOGWATCHER_DESIGN.md)

---

## 미완료 / 다음 세션

### auto-improve 6시간 스케줄 — 미설정
- 스킬은 완성됐지만 `/schedule`로 자동 실행을 아직 안 걸었음
- 다음 세션에서 설정 필요

### 범용 LogWatcher 구현
- 설계 완료, 장비 7종 목록 + 로그 샘플 대기
- Phase 1~5 (3~4세션)

### 기타 대기
- 카카오톡 알림 마무리 (Phase 5.4)
- 한진택배 Phase A (솔루션 선정 대기)
- CAPS 경리PC 워커 실행 (접속 복구 대기)

---

## 주요 설계 결정

- **E2E 격리**: entity_id=99, writeApi worker-scoped (rate limit 방지)
- **auto-improve**: 6영역 순환, GitHub Issues로 리뷰, 👍 승인 + 코멘트 반영
- **SHIPPED 카드 확인**: 미완료 카드 있으면 모달, 확정→PRINT_DONE, 취소→HOLD
- **범용 LogWatcher**: config-driven 5가지 파서 타입, equipment.json으로 장비 관리
