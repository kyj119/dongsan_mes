# PROJECT_STATUS_ARCHIVE.md — 완료 이력

> 이 파일은 PROJECT_STATUS.md에서 분리된 완료 항목 아카이브입니다.
> AI 에이전트가 매 세션 읽을 필요 없음. 필요 시 수동 참조.

---

### 2026-04-29 (CAPS on-prem 완료 처리)
- [CAPS] 경리 PC에서 CAPS DB 연동 완료, 자동 시작 + 수동 트리거 모두 작동 확인
- 동기화 하루 3회 (09:00/13:00/19:00) + 근태 페이지 수동 버튼, VBS 래퍼 백그라운드 실행

### 2026-04-25 (재고차감 구조 설계 + 품목 체계 리뷰)
- [설계] 재고차감 통합 설계서 작성: ROLL(yd, 0.1올림) + SHEET(㎡, 면적 기반) 2트랙
- [설계] 품목 체계 전체 리뷰: 코드 범위 현행 유지, category_id TEXT 통일, GOODS 자동설정
- [설계] product_materials 자동 생성 (소재 일괄 등록 시 parent_media_id 매칭)
- [설계] 역할별 기본 품목 필터 (계정 관리 페이지, is_sales/is_purchase 대체)
- [문서] `docs/superpowers/specs/2026-04-25-inventory-deduction-redesign.md` 신규

### 2026-04-24~25 (품목 체계 개편)
- [DB] migration 0154~0158: print_methods/media 테이블, items/order_items 확장, price_change_history
- [API] printSystem.ts 신규: 출력방식/소재/연결 CRUD 12개 엔드포인트
- [UI] items.ts/js: 6탭, 소재 일괄 추가, 단가 이력 모달
- smoke: 60/60 PASS

### 2026-04-23 (이카운트 → MES 거래처 이관)
- [이관] 이카운트 ERP 거래처 2,660건 MES 임포트 완료
- [DB] 마이그레이션 0153, [도구] 변환/검증/보정 스크립트 3개

### 2026-04-22 (코드 리뷰 + 정리 + 멀티사업자 + 리팩토링)
- escapeHtml/금액 포맷 전역 통합, 멀티사업자 인감도장, 고아 정리

### 2026-04-20~21 (메시징 + CAPS + 카드 + PrintExp)
- SMS/카카오톡/이메일 발송 성공, CAPS 동기화, PrintExp 파서

### 2026-04-17 (통합 메시지 + 포털 + UI + 보안 + 검증)
- 4채널 메시지 시스템, 포털 고도화, 보안 감사, smoke 55/55 PASS
- CLAUDE.md 575→121줄 감축

### 2026-04-15 (검수 UI + 타입체크 + 라우트 분할)
- 검수 UI 전체 구현, tsc 타입체크 게이트 구축
- payroll/purchaseOrders/ledger/orders 라우트 분할
- 마이그레이션 0131까지 적용

### 2026-04-10 (심층 검증)
- Track 1 Phase 2 디자인 일관성, 보안 감사, alert→showToast 325건
- Phase B3/B4/B5 완료

### 2026-04-08 (급여/인사 확장 + 개발 환경)
- B1 추가근무/요율, B2 급여명세서, B4 연말정산
- smoke.cjs 신규, templates/ 신규

### 2026-04-05
- 카카오 알림톡 연동, 빌드 에러 수정

### 2026-04-04
- UI/UX 개선 v2 (13항목)

### 2026-03-31
- 주문 무결성 감사, security-audit 스킬

### 2026-03-30
- IA 자동화: ExtractGroups v5, ProcessOrderItem v2, OpenCV, TestRunner

### 2026-03-28
- 설정 페이지 통합

### 2026-03-27
- 문서 정리

### 2026-03-25
- Items 원단폭, 재고실사, 원가 분석

### 2026-03-24
- IA 학습 파이프라인 (이후 폐기)
