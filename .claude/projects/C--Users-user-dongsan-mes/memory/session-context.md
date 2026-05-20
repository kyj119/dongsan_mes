---
name: session-context
description: 2026-05-20 세션 컨텍스트 — 원장 개선 + 팩스 + 로그인 + 법인카드 + CODEF
type: project
---

## 완료 작업 (커밋 4개)

### 거래처 원장 전면 개선 (e930fa5)
- 분석 탭 신규: 월말 마감, 손익 요약, 평균 회수 기간
- 거래 내역: 품목 항상 펼침, 매출/입금 2컬럼, 어음 추가, 미BILLED 제외
- 수정 모달 통일, 발송 모달 채널 토글, 복식부기 제거, 인쇄/팩스 추가

### 법인카드 Phase 1 (72ad9eb)
- DB 3테이블 (corporate_cards, card_transactions, expense_categories)
- 경비 분류 15개, 카드 CRUD, 내역 관리, CSV 가져오기, 지출결의 연동
- 페이지: /card-expenses (3탭)

### CODEF API 확장 (0a75434)
- codef.ts: fetchCardApprovals, fetchInsurancePayments, fetchEmploymentInfo, fetchTaxInvoices, checkBusinessStatus
- cardExpenses: CODEF 카드 연결(connect) + 동기화(sync) API
- 카드사 기관 코드 매핑 10개사

### 로그인 안정화 (e930fa5에 포함)
- Rate limit 10회, JWT 시계 오차 60초, corrupt 토큰 정리, CORS 10.x

## 주의사항
- order_items `content` = 내용 (specification 칼럼 없음)
- 프로덕션 admin 비밀번호: "password" (PBKDF2 해시)
- CODEF 멤버십 가입 신청 완료, 승인 대기 중

## 다음 세션 TODO
- **CODEF 승인 후**: client_id/secret 설정 → 카드/보험/홈택스 실제 연동 테스트
- **법인카드 Phase 2**: CODEF 카드 동기화 UI (버튼, 로그인 모달, 자동 스케줄)
- **법인카드 Phase 3~5**: 영수증 첨부, 결재 강화, 분석 대시보드
- **급여 연동**: 고용산재 보험료 자동 반영 (CODEF API 활용)
- **원장 Tier 2**: 미수금 카카오톡 자동발송, 세금계산서 대조, PDF 출력
- **현장 로그인 테스트 결과 확인**
