# 최근 세션 컨텍스트 (2026-05-11~12)

## 세션 성과 요약

| 지표 | 수치 |
|------|------|
| 커밋 | 14개 |
| E2E 테스트 | 10 → 28개 |
| GitHub Issues | 14개 생성, 14/14 처리 (done 13, rejected 1) |
| 신규 기능 | 10개 (필터 5, KPI 5) |
| 버그 수정 | 5건 (entity_id, LogWatcher, SHIPPED 카드, orders.js 파싱, N+1 x3) |
| 보안 | rate limit 적용, hr.ts 에러 제네릭화 |
| 자동화 | auto-improve 4시간 스케줄 설정 |
| 설계 문서 | 범용 LogWatcher (docs/UNIVERSAL_LOGWATCHER_DESIGN.md) |

## 주요 완료 작업

1. **E2E 쓰기 테스트 18개** — entity_id=99 격리, writeApi fixture
2. **auto-improve 시스템** — 6영역 순환 + GitHub Issues + 코멘트 반영 + 4시간 스케줄
3. **Issues #1~#14 전량 처리** — entity 격리, N+1 제거, 필터 5개, KPI 5개, SHIPPED 카드 확인, rate limit, 에러 제네릭화
4. **LogWatcher 프로덕션 연결** — appsettings URL 수정, install-service.bat 인코딩 수정, RIP 2대 online
5. **orders.js 파싱 에러 수정** — `\\'` 이스케이프 문제 (?raw 파일에서 `&#39;` 사용)
6. **범용 LogWatcher 설계** — config 기반 5가지 파서 타입, equipment.json
7. **문서 동기화** — PROJECT_STATUS/ROADMAP/MEMORY/design-decisions/BACKLOG

## 발견·수정한 회귀

- **orders.js 전체 파싱 실패**: #11 카드 확인 모달에서 `\\'` 사용 → `?raw` 파일에서 "Invalid or unexpected token". `&#39;` HTML entity로 교체.
- **교훈**: `src/scripts/*.js`는 `?raw` import이므로 `\\'` 금지. CLAUDE.md에 명시된 규칙이지만 에이전트가 놓침.

## 설계 결정

- **E2E entity(id=99)**: 법인 선택 UI에서 숨기지 않고 적극 활용 (테스트 샌드박스)
- **SHIPPED 카드 확인**: 미완료 카드 → 확인 모달, 확정→PRINT_DONE, 취소→HOLD
- **범용 LogWatcher**: equipment.json config 기반, 장비당 20분 추가

## auto-improve 스케줄

- Trigger ID: `trig_01SeYWktYw7rSLy4GHypHZVx`
- 스케줄: 4시간 간격 (KST 0/4/8/12/16/20시)
- 모델: claude-sonnet-4-6
- 관리: https://claude.ai/code/scheduled/trig_01SeYWktYw7rSLy4GHypHZVx

## 다음 세션

### 즉시 착수 가능
- auto-improve가 생성한 새 Issues 확인 + 처리
- 범용 LogWatcher Phase 1 (장비 목록 확정 후)
- 카카오톡 알림 마무리 (Phase 5.4)

### 사용자 결정 필요
- 장비 7종 목록 + 로그 샘플 (범용 LogWatcher 착수 조건)
- 한진택배 솔루션 선정

### 새 세션 시작
```powershell
cd C:\Users\user\dongsan_mes
git pull
# "승인된 이슈 처리해줘" 또는 "auto-improve 결과 확인해줘"
```
