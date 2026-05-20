---
name: session-context
description: 2026-05-20 세션 컨텍스트 — 원장 개선 + 팩스 + 로그인 + 법인카드
type: project
---

## 완료 작업

### 거래처 원장 전면 개선
- 분석 탭 신규: 월말 마감, 손익 요약, 평균 회수 기간
- 거래 내역: 품목 항상 펼침, 매출/입금 2컬럼, 어음 추가, 미BILLED 제외
- 수정 모달 통일, 발송 모달 채널 토글, 복식부기 제거

### 팩스 기능 확장
- 단가표/거래처 원장에 인쇄+팩스 추가 (html2canvas 방식)

### 로그인 안정화
- Rate limit 완화(10회), JWT 시계 오차 여유, corrupt 토큰 정리, CORS 10.x 추가

### 법인카드 Phase 1
- DB 3테이블, 경비 분류 15개, 카드 CRUD, 내역 관리, CSV 가져오기, 지출결의 연동

## 주의사항
- order_items의 `content` = 내용 (specification 칼럼 없음)
- 프로덕션 admin 비밀번호: "password" (PBKDF2 해시)

## 다음 세션 TODO
- 법인카드 Phase 2~5: CODEF 연동, 영수증 첨부, 결재 강화, 분석 대시보드
- 원장 Tier 2: 미수금 카카오톡 자동발송, 세금계산서 대조, PDF 출력
