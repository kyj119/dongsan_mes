# 법인간 거래 기록 (Inter-Entity Transactions) — 회계허브 탭

날짜: 2026-07-18 | 세션: bank-ap-link | 상태: P1 구현

## 배경
- 서울경금속 3,069만(동산기획이 선명 매입채무 대납+계산서 이전발행), 위드무주 건(선명이 동산 외상대 지급) 등
  **법인 사이 대납·대여·계산서 이전** 기록이 갈 곳이 없음.
- 사용자 결정: 회계허브(/accounting)에 탭 추가 (독립 페이지 아님).

## 핵심 규약
- **방향 = 돈(가치)이 from → to 로 흘렀다.** 대납=대납한 법인이 from. 상환=갚는 법인이 from.
- **법인간 잔액 = Σ(A→B) − Σ(B→A)** (affects_balance=1인 기록만). 상환은 역방향 기록으로 자연 상계.
- `affects_balance`: 계산서이전(INVOICE_TRANSFER)처럼 채권이 생기지 않는 기록용 항목은 0 (UI에서 유형 선택 시 자동, 수동 변경 가능).
- 유형: SUBROGATION(대납)·LOAN(자금대여)·REPAYMENT(상환)·INTERNAL_TRADE(내부거래대금)·INVOICE_TRANSFER(계산서이전)·OTHER(기타).
  유형은 라벨이며 잔액 계산은 방향+affects_balance만 사용.

## 스키마 (0467)
`inter_entity_transactions`: transaction_date, from_entity_id, to_entity_id, transaction_type(CHECK),
amount, affects_balance(DEFAULT 1), client_id(관련 외부 거래처), description,
from_bank_transaction_id/to_bank_transaction_id(은행 연결 — P1은 컬럼만, UI 연결은 P2), created_by, timestamps.
FK 없음(D1 FK 제거 불가 함정 회피).

## API (routes/accounting.ts — 기존 라우터 가드 승계: /accounting 열람권 or MANAGER)
- GET  /api/accounting/inter-entity           — 목록 (start/end/type/search + 페이지네이션)
- GET  /api/accounting/inter-entity/summary   — 법인 페어별 순잔액 (기간 무관 전체 누적)
- POST /api/accounting/inter-entity           — 등록 (from≠to, amount>0, 유형 검증, 법인 존재 검증)
- PUT  /api/accounting/inter-entity/:id       — 수정
- DELETE /api/accounting/inter-entity/:id     — 삭제
- 가시성: 전체모드(entityId=0)=전체, 특정 법인 세션=당사자(from/to) 기록만.

## UI (/accounting 법인간 탭)
- 상단: 법인 페어별 잔액 카드 (채권 방향 표시, 기간 무관).
- 목록: 일자·방향(법인→법인)·유형 배지·금액·잔액반영·거래처·내용·등록자·수정/삭제.
- 등록/수정 모달: 일자(kstToday 기본)·from/to 법인(GET /api/auth/entities)·유형·금액·잔액반영 체크·
  관련 거래처(경량 검색 드롭다운, /api/clients?search=)·내용.
- 목록은 상단 기간 필터 공유. 잔액 요약은 기간 무관(누적).

## P2 후보 (미착수)
- bank 페이지 출금 적용 시 "내부거래" 옵션 → 자동 생성+양쪽 은행거래 링크.
- 서울경금속 건 원장 이전(선명 AP 제거+동산 매입·지급 등록) 결정 시 1호 데이터 등록.
