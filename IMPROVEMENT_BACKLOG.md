# Improvement Backlog
<!-- last_run_area: 1 -->
<!-- last_run_at: 2026-05-12T10:00:00+09:00 -->

> 자율 점검·개선 에이전트(auto-improve)가 6개 영역을 순환하며 발견한 항목.
> 용준님이 주기적으로 리뷰하여 상태를 변경 (new → approved → done, 또는 rejected).

## 통계
| 상태 | 건수 |
|------|------|
| 🆕 new | 1 |
| ✔️ done | 15 |
| ❌ rejected | 1 |

> **Area 1 프로덕션 헬스** (2026-05-12T10:00):
> - 전체 77개 ?raw JS 파일 syntax check 통과
> - 최근 커밋 `cd04d93`: orders.js `\'` 이스케이프 버그(전체 주문페이지 함수 실패) 수정 확인
> - 자동 수정: smoke.cjs에 quotations/hometax-invoices/search 3개 엔드포인트 추가
> - 이슈 생성: #15 스모크 커버리지 확대 (34개 미등록 라우트)
> - Playwright 미설치/외부 HTTP 차단으로 실시간 API 응답 직접 확인 불가

---

## 🆕 New

### [I-007] 스모크 테스트 커버리지 확대 — 미등록 라우트 34개 (Area 1, 2026-05-12)
- **현재**: `/api/quotations`, `/api/hometax-invoices` 등 34개 라우트 스모크 미등록
- **자동 수정**: quotations/hometax-invoices/search 3개 추가 완료
- **잔여**: bom/prices/facility/costs/tasks 등 8개 추가 필요
- **영향**: 핵심 기능 회귀를 스모크로 탐지 못함
- **공수**: 1시간
- **상태**: 🆕 (GitHub #15)

---

## 🔴 Bugs / Issues

(모두 처리 완료 — Done 섹션 참조)

---

## ✔️ Done (처리 완료)

| ID | 제목 | 커밋 | Issue |
|----|------|------|-------|
| A-002 | smoke.cjs 3개 엔드포인트 추가 (quotations/hometax/search) | 256e37c | #15 |
| A-001 | entity_id INSERT 14건 누락 | c7c20d3 | - |
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

| ID | 제목 | 사유 |
|----|------|------|
| F-004 | 납품시간 disabled 이유 표시 | 용준님: "필요 없음" | #10 |

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
