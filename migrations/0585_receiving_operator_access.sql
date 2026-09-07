-- 0585: 입고 관리(`/receiving`)를 **구역 담당자(OPERATOR)** 에게 연다
--
-- 왜 (2026-09-08):
--   입고가 **한 번도 돌지 않았다** — `inventory_receipts` 0행. 화면(`/receiving`)도 API
--   (`POST /purchase-orders/:id/receive`)도 완성돼 있는데, 정작 **물건을 받는 사람이 못 들어갔다**.
--   `role_page_permissions` 에 `/receiving` 은 ADMIN 만 있고 OPERATOR 행이 없었다.
--   그런데 구역 담당자 5명(출력실 한두선·전사출력실 최재영·UV실 모니르·현수막실 정보람·선명2 강지영)이
--   **전부 OPERATOR** 다. 큐의 기본 범위도 `scope=mine`(= `sz.manager_id = 나`)이라
--   담당자에게는 입고 대기가 구조적으로 0건이었다.
--
-- ⚠️ **권한만 열면 구멍이 된다** — `POST /:id/receive` 에는 구역 검증이 없어 페이지 권한만 있으면
--   남의 구역 자재도 입고할 수 있었다. 같은 커밋에서 `canTouchZone` 게이트를 넣었다
--   (실사 `inventoryCount.loadOwnedCount` 와 같은 헬퍼·같은 규칙).
--   ⇒ 이 마이그레이션만 따로 적용하지 말 것.
--
-- `can_edit` 은 1 — 입고는 쓰기 행위다. 열람만 주면 큐는 보이는데 입고 버튼이 죽는다.
INSERT OR IGNORE INTO role_page_permissions (role, page_key, can_access, can_edit)
VALUES ('OPERATOR', '/receiving', 1, 1),
       ('MANAGER',  '/receiving', 1, 1);
