# 동산기획 ERP+MES 안티패턴 레지스트리

실제 발생한 버그를 기록하여 재발 방지. code-reviewer 체크리스트에서 참조.

---

### AP-001: EPSSaveOptions 사용
- **발견**: ia-automat | **횟수**: 1 | **마지막**: 2026-02
- **증상**: ProcessOrderItem.jsx에서 PDF 저장 실패
- **올바른 패턴**: `new PDFSaveOptions()` 사용
- **탐지**: `EPSSaveOptions` grep

### AP-002: parent===doc 루트 그룹 판별
- **발견**: ia-automat | **횟수**: 1 | **마지막**: 2026-02
- **증상**: 그룹 탐색 실패 (doc은 Document 타입)
- **올바른 패턴**: `parent.typename === "Layer"` 사용
- **탐지**: `parent === doc` 또는 `parent===doc` grep

### AP-003: Source/Publish JSX 불일치
- **발견**: ia-automat | **횟수**: 2+ | **마지막**: 2026-02
- **증상**: source 수정 후 publish 미반영 → Illustrator PC에서 구버전 실행
- **올바른 패턴**: source 수정 → publish 복사 → NAS 복사 → Automat 재시작
- **탐지**: `diff` source vs publish JSX 3쌍

### AP-004: parseInt로 금액 처리
- **발견**: frontend | **횟수**: 1 | **마지막**: 2026-02
- **증상**: 소수점 가격(예: 1500.5)이 1500으로 절삭
- **올바른 패턴**: `parseFloat()` 사용
- **탐지**: `parseInt` grep in price/amount 관련 코드

### AP-005: CANCELLED 주문 삭제 시 balance 이중 차감
- **발견**: backend (orders.ts) | **횟수**: 1 | **마지막**: 2026-02
- **증상**: 이미 취소된 주문 삭제 시 잔액이 두 번 차감됨
- **올바른 패턴**: 삭제 전 주문 상태 확인 → CANCELLED면 balance 조정 스킵
- **탐지**: DELETE 핸들러에서 status 체크 로직 존재 여부

### AP-006: 제거된 상태값 참조
- **발견**: frontend + backend | **횟수**: 1 | **마지막**: 2026-02
- **증상**: PRODUCTION, RIP_SENT, CLOSED 등 현재 없는 상태값 사용
- **올바른 패턴**: models.ts의 OrderStatus/CardStatus enum 참조
- **탐지**: 제거된 상태 문자열 grep

### AP-007: DROP TABLE CASCADE
- **발견**: backend (migration) | **횟수**: 1 | **마지막**: 2026-02
- **증상**: D1에서 CASCADE가 연쇄 삭제 유발 → 관련 테이블 데이터 전부 소실
- **올바른 패턴**: `DROP TABLE IF EXISTS` (CASCADE 없이) + 외래키 수동 처리
- **탐지**: `CASCADE` grep in migrations/

### AP-008: falsy 0 기본값 패턴 (`|| default`)
- **발견**: backend (auth, entityFilter, layout) | **횟수**: 4 | **마지막**: 2026-04-22
- **증상**: `entityId || 1` — entityId=0(전체 모드)이 falsy로 처리되어 항상 1로 대체. 멀티사업자 전체 모드 동작 불가.
- **올바른 패턴**: `(val != null) ? val : default` 또는 `val ?? default` (nullish coalescing)
- **적용 범위**: 0이 유효값인 필드 전부 (entityId, page, offset 등)
- **탐지**: `grep -rn '|| 1\b' src/ --include="*.ts"` + 0이 유효값인 변수인지 수동 확인

### AP-009: entity_id 필터 누락 (stats/count/badge 엔드포인트)
- **발견**: backend (purchaseOrders stats, notifications nav-badges, receiving-queue) | **횟수**: 3 | **마지막**: 2026-04-22
- **증상**: 목록(GET /) 쿼리에는 entity 필터가 있지만, 같은 라우트의 stats/count/badge/summary 엔드포인트에 누락 → 법인 전환해도 통계 카드가 전체 합산으로 표시
- **올바른 패턴**: 트랜잭션 테이블(orders, payments, purchase_orders 등)을 조회하는 **모든** 엔드포인트에 entity 필터 적용
- **탐지**: `grep -rn "FROM orders\|FROM payments\|FROM purchase_orders\|FROM tax_invoices\|FROM payroll\|FROM cash_receipts" src/routes/ --include="*.ts" | grep -v entityFilter | grep -v "// shared"`
