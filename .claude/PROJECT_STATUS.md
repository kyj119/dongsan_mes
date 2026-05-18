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

### Issues #89~#110 — 동시성/N+1/entity_id/FK 일괄 수정 (22건 close)

#### 동시성/Race Condition (2건)
- **#89**: syncOrderStatusFromCards Option B 원자적 조건부 UPDATE
- **#92**: 재고 조정 원자적 UPDATE WHERE (quantity+?)>=0

#### 데이터 정합성 (5건)
- **#99**: HOLD 시 work_records PAUSED 동기화
- **#100**: 전체 카드 HOLD → 주문 HOLD 반영
- **#101**: CONFIRMED+ 주문 delivery_date NULL 서버검증
- **#93**: 결제 삭제 시 bank_transactions 매칭 해제
- **#95**: 이미 #87에서 해결됨 (확인 후 클로즈)

#### entity_id 필터 누락 (4건)
- **#97**: prices.ts 단가 제안 entityFilter 적용
- **#98**: purchaseRequests.ts 공급업체 추천 entityFilter 적용
- **#104/#105**: 5개 테이블 entity_id 컬럼 추가 (migration 0225)
- **#110**: oee.ts entityFilter 전면 적용

#### N+1 쿼리 해소 (2건)
- **#102/#108**: oee.ts 4N→4 일괄 GROUP BY
- **#103/#109**: fixedAssets.ts 2N→일괄 SELECT + Set/Map

#### FK/인덱스 (3건)
- **#94/#96/#106**: FK 인덱스 추가 (migration 0225)

#### 중복 닫기 (4건)
- **#107**(=#105), **#108**(=#102), **#109**(=#103), **#110**(⊂#104)

#### 기타
- postProcessing stats 500 에러 수정 (items.category_name → order_items.category_name)

### [#81] 생산 현황 보드 — 디지털 작업 지시서 (신규 페이지)
- `/production-board` 카드 그리드 뷰 + 썸네일 lazy-load
- 라이트박스: 품목별 썸네일 + 이미지 확대(zoom) + 후가공 오버레이
- 상태 필터 탭 + 정렬 + 풀스크린 모드 + 자동갱신 30초
- 반응형: 모바일 2열 ~ 대형 모니터 6열
- 전용 API: GET /api/cards/board, GET /api/cards/thumbnails

---

## 🟢 이전 완료 (2026-05-15~16)

### 이슈 대량 처리 — 24건 closed (2026-05-15~16)
- #63~#91: 버그/데이터(10건) + Tier1(5건) + Tier2(6건) + Tier3(4건)
- 상세 → git log 참조

---

## 📌 기존 에러 (이번 세션과 무관)
- `/api/hr/employees/12` → 500
- `/api/dashboard/stats/clients` → 500
- `/api/notifications/unread-count` → 500
