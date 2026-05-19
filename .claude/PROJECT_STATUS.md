# PROJECT_STATUS.md — 프로젝트 현황판

> **최종 업데이트**: 2026-05-18

---

## 🔒 편집 중 (충돌 방지)

- (없음)

---

## 🔴 현재 진행 중

- (없음)

---

## 🟡 대기 중 (사용자 선택/승인 필요)

### [#65] 후가공 단계별 추적 — 방안 A/B/C 선택 대기
- A: QR 원터치, B: Zone 기반, C: 최소 2단계. 코멘트 제안 완료, 답변 대기

### [#75] 견적 적정 단가 제안 — 방향 수정 답변 완료
- 매입단가 미노출, 평균 판매가 기반 추천 방식으로 전환

### [#79] 로트 추적 → 기간 역추적 축소 — 답변 완료
- lot 테이블 불필요, 기존 receipts 기반 기간별 역추적 쿼리만 추가 (S)

### [#80] 바코드/QR 시스템 — 모바일 설계 답변 완료
- HTTPS + html5-qrcode + 모바일 우선 레이아웃 계획

### [배송 관리 최적화] — 출고 대기 보드
- 배송방법별 그룹화 + 마감시간 카운트다운 + 일괄 출고 + 카카오톡 자동 발송
### [기존 계약 일괄 등록] — 엑셀 import 스크립트 제공 대기
### [라벨 프린터 인쇄] — 프린터 모델 확인 필요 (외부 의존)
### [RIP 전송] — 코드 완료, 현장 테스트 대기 (외부 의존)
### [LogWatcher PrintExp] — 구현 완료, 현장 배포 대기 (외부 의존)
### [한진택배 자동화] — 솔루션 선정 대기 (사용자 결정 필요)

---

## 🟢 최근 완료 (2026-05-18)

### 생산 현황 보드 대규모 개편
- 기본 필터: 출력 전 (PRINT_PENDING), 탭: 전체/출력전/출력중/출력완료/출고완료/HOLD
- 긴급도 정렬 (납기초과→당일→임박→PP미완료→납기순)
- 20건 페이지네이션 + 더보기 버튼
- 수량·후가공 상세 표시, 모달 확장 버튼
- SPA 내비게이션 버그 수정 (DOMContentLoaded→IIFE)
- 모달 닫기 버그 수정 (layout.ts ESC handler hidden 충돌)
- 스마트 자동갱신 (summary 30초, full 2분)

### Issues #111~#117 — 6건 close
- **#111**: returns.ts RESTOCK balance_after + entity_id
- **#112**: generalLedger 결제 자동분개 중복 방지 (409)
- **#114**: fixedAssets depreciate + GET /:id entityFilter
- **#115**: budgets LABOR + MAINTENANCE entityFilter
- **#116**: 주문 하드삭제 cascade 8개 테이블 추가
- **#117**: FK 미강제 → 옵션B (수동 cascade 유지, #116에서 보완)

### DB 일일 백업 자동화 구축
- GitHub Actions → R2 버킷 (`dongsan-backups`) 일일 자동 백업
- Windows 작업 스케줄러 → NAS (`Z:\Backups\D1\`) 일일 자동 백업
- 보존 정책: 일별 90일 + 월별 무기한
- `npm run db:backup` / `db:backup:nas` 수동 명령 추가

### 소재관리 연동 버그 수정
- PUT /media/:id: 소재명 변경 → 출력 품목명 자동 전파
- media_group 변경 → 원자재 item_group 연쇄 업데이트
- PATCH /items/:id: item_group, is_purchase_item 필드 허용

---

## 🟢 이전 완료 (2026-05-15~17)

### Issues #89~#110 — 22건 close (2026-05-17)
- 동시성, 데이터 정합성, entity_id 필터, N+1 해소, FK/인덱스

### [#81] 생산 현황 보드 — 디지털 작업 지시서 (2026-05-17)
- 카드 그리드 뷰 + 라이트박스 + 자동갱신 + 풀스크린

### 이슈 대량 처리 — 24건 closed (2026-05-15~16)
- #63~#91: 버그/데이터(10건) + Tier1(5건) + Tier2(6건) + Tier3(4건)

---

## 📌 기존 에러
- (없음) — 2026-05-19 확인: 3건 모두 200 정상 (employees/12, stats/clients, unread-count)
