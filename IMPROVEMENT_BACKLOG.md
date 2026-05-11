# Improvement Backlog
<!-- last_run_area: 6 -->
<!-- last_run_at: 2026-05-11T16:30:00+09:00 -->

> 자율 점검·개선 에이전트(auto-improve)가 6개 영역을 순환하며 발견한 항목.
> 용준님이 주기적으로 리뷰하여 상태를 변경 (new → approved → done, 또는 rejected).

## 통계
| 상태 | 건수 |
|------|------|
| 🆕 new | 0 |
| ✔️ done | 14 |
| ❌ rejected | 1 |

> **Area 6 자기진화 평가** (2026-05-11T16:00):
> - 전체 6개 영역 1순환 완료. 총 15건 발견 (done 10, new 4, rejected 1)
> - 학습: entity_id 누락 패턴 유효, API 응답 형식 통일은 연쇄 변경 큼
> - 오탐 방지: SELECT * 스캔 시 views/migrations 제외 필요

---

## 🔴 Bugs / Issues

(모두 처리 완료 — Done 섹션 참조)

---

## ✔️ Done (처리 완료)

| ID | 제목 | 커밋 | Issue |
|----|------|------|-------|
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
