---
name: session-context
description: 2026-05-31 세션 컨텍스트 — 근태 레이아웃 개편 + 법인카드 캐시플로 연동 + 영수증
type: project
---

## 완료 작업 (2026-05-29~31)

### 근태관리 페이지 레이아웃 전면 개편
- 집계 11→5열 (결근/연차/지각/연장/휴일), 연장=조기+연장 합산
- table-layout:fixed + 명시적 열 너비, 셀 div width:100%
- 31일 고정 렌더링, 연차 반차 0.5/반반차 0.25 정확 카운트
- fmtNum() 유틸 추가, 0값 "-" 표시

### 근태 유형별 기준시간 지각/조퇴 처리
- 서버+프론트 양쪽에 scheduleIn/scheduleOut 맵
- 오전반차→지각면제, 오후반차→조퇴면제
- 저장 시 check_in/check_out 기반 late_minutes/early_leave_hours 자동 재계산

### 법인카드 마감일 + 캐시플로 연동
- DB 마이그레이션 0273: corporate_cards.cutoff_day
- 카드 관리 UI에 마감일 필드 추가
- 캐시플로 달력 API에 CARD 타입 추가 (보라색, 카드사별 합산)

### 법인카드 영수증 바로 첨부
- 테이블 행에 카메라 아이콘 → 파일 선택 즉시 업로드
- quickReceipt() 함수, 첨부 완료 시 체크 아이콘 전환

## 주의사항
- transaction_date 형식: YYYYMMDD (하이픈 없음) — 마감 기간 쿼리 시 주의
- cashFlow calendar의 카드 결제 쿼리는 cutoff_day 칼럼 미존재 시 try-catch 무시
- shortHM() 함수가 for 루프 밖으로 이동됨
- attendance.js에 fmtNum() 추가됨 (정수→정수, 소수→소수점 유지)

## 다음 세션 TODO
- 자금계획 ↔ 캐시플로 통합 (사용자 결정 대기)
- 할부 거래 캐시플로 분할 반영 (현재 전액 다음달)
- 커밋 정리 (미커밋 변경분 다수)
