# 바코드 입출고(스캔) 재고관리 — 구체화 대기 (Spec Pending)

> 상태: **구체화 대기** — 추가 요구사항 정의 후 구현/검증 진행
> 출처: GitHub #412 (auto-improve Area 4), owner 지시(2026-06-16): "추가로 구체화 한 이후에 검증 진행"
> 최종 업데이트: 2026-06-18

## 배경 — 현재 코드 상태 (작동 불가)

`src/routes/scan.ts` `POST /api/scan/action`의 품목 스캔 입출고가 **현재 100% 실패**한다.

- `ITEM:stock-in`(scan.ts:231)·`ITEM:stock-out`(scan.ts:252)이 `UPDATE items SET current_stock = ...`를 수행.
- 그러나 **`items` 테이블에 `current_stock` 컬럼이 없음**. 재고는 별도 `inventory` 테이블의 `quantity`로 관리되며, 코드베이스 전역(inventory.ts·dashboard.ts·items.ts 등 20+곳)이 `COALESCE(inv.quantity, 0) AS current_stock` JOIN 별칭을 사용.
- SQLite prepare 단계에서 `no such column: current_stock` throw → `DB.batch([...])` 전체 실패 → 프론트 "처리 실패" 토스트.
- 도달성 LIVE: `scan.js:272` `axios.post('/api/scan/action')` ← 스캔 결과 액션 버튼. 도입 이래 영구 깨짐(회귀 아님).
- **데이터 손상은 없음**(throw로 아무 write도 일어나지 않음) — 단 스캔 입출고 기능이 전혀 동작하지 않음. (별도 `inventory.ts` 입출고 경로는 정상)

## 구현 전 구체화 필요 항목 (owner 결정 대기)

스캔 입출고를 `inventory` 테이블 기준으로 정상화하려면 단순 컬럼명 교체가 아니라 **write 대상 테이블 변경 + 다음 비즈니스 규칙 정의**가 선행되어야 한다:

1. **법인(entity) 처리**: 스캔 시 `entity_id`를 어디서 얻을지 (스캔 사용자의 현재 법인? 품목 소속 법인?). `inventory`는 `(item_id, entity_id)` 키.
2. **창고/구역(zone) 처리**: `inventory_locations`/`storage_zones`와의 연계 여부 — 스캔 입출고가 특정 구역으로 들어가는지, 단일 재고만 갱신하는지.
3. **재고 행 부재 시(upsert)**: stock-in 시 해당 품목의 inventory 행이 없을 수 있음 → `ON CONFLICT(item_id, entity_id) DO UPDATE` upsert 필요(inventory.ts:304-306 패턴).
4. **출고 부족 가드**: stock-out 시 음수 방지(`AND quantity >= ?` 또는 `MAX(0, quantity - ?)`) 및 부족 시 사용자 피드백 정의.
5. **트랜잭션 이력**: `inventory_transactions`의 `balance_after` 산출을 `(SELECT quantity FROM inventory WHERE item_id=? AND entity_id=?)`로 교체. `handled_by`는 `users(id)` FK이므로 유효 user id 바인딩 필수(#394 클래스).
6. **기존 inventory.ts 입출고와의 관계**: 스캔 경로와 수기 입출고 경로의 역할 구분(중복/충돌 방지).
7. **바코드/QR 페이로드 규격**: 스캔 코드 포맷(`ITEM:`, `CARD:` prefix 등)과 식별자 매핑 규칙 확정.

## 다음 단계

- [ ] 위 1~7 항목 owner 구체화
- [ ] `inventory` 테이블 기준 write 경로 구현 (#412 수정 방향 참조)
- [ ] 로컬 D1 + 스캔 E2E 검증 (입고→재고 증가→출고→차감→부족 가드)
- [ ] 구현·검증 후 #412 close

---
*auto-improve: owner 지시(#412)에 따른 구체화 대기 문서. 코드 수정은 구체화 완료 후 진행.*
