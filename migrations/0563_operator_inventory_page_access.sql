-- 0563: 구역 담당자(OPERATOR)에게 재고·창고 페이지 **열람** 권한
--
-- 배경 = 실사 API 권한을 열어도(`inventoryCount.ts` 2026-09-04 재배치) **페이지에 못 들어간다**.
--   OPERATOR 가 접근 가능한 페이지는 `/pack`·`/scan`·`/shipments`·`/shipments-dashboard` 4개뿐이고
--   `/inventory`·`/storage-zones` 는 **ADMIN 행만** 있었다. 구역 담당자 5명이 전부 OPERATOR 다.
--
-- ★`can_edit = 0` 이 핵심이다. 이 값이 세 가지를 동시에 정한다:
--   ① 페이지는 열린다(`requirePagePermission` 은 can_access 만 본다)
--   ② **재고 조정·창고 이동은 막힌다** — 둘 다 `requireEditOrRole('/inventory','ADMIN','MANAGER')` 라
--      ADMIN/MANAGER 가 아니면 `can_edit` 을 요구한다. 조정을 관리자 전용으로 두려던 방침과 일치한다.
--   ③ 실사는 별개 라우터(`/api/inventory-counts`)이고 `can_edit` 을 안 보므로 영향이 없다 —
--      거기서는 「자기 담당 구역인가」(`canTouchZone`)만 판정한다.
--   ⚠️ can_edit 을 1 로 올리면 담당자가 재고 조정·창고 이동까지 하게 된다. 올리지 말 것.
--
-- 구역 생성·수정·삭제는 `storageZones.ts` 가 엔드포인트마다 `requireRole('ADMIN')` 이라 별도로 막힌다.
-- 재고 목록·창고별 조회는 두 라우터 모두 `authMiddleware` 만 걸려 있어 열람에 추가 조치가 필요 없다.
--
-- ⚠️ 반영 지연 = 권한 캐시 TTL **60초**(`middleware/permissions.ts` CACHE_TTL_MS). isolate 별 모듈
--    전역이라 즉시 반영되지 않는다. 배포 직후 실측은 1분 뒤에 한다.
--
-- ⚠️ **코드와 같이 나가야 한다** — 이 행만 먼저 넣으면 담당자가 페이지는 열리는데 실사 API 는
--    구버전 게이트(ADMIN/MANAGER)에 막혀 403 을 본다. 지금보다 나쁜 상태다.
--
-- ⚠️ 되돌리기 = DELETE FROM role_page_permissions
--               WHERE role = 'OPERATOR' AND page_key IN ('/inventory', '/storage-zones');

INSERT INTO role_page_permissions (role, page_key, can_access, can_edit)
VALUES ('OPERATOR', '/inventory', 1, 0),
       ('OPERATOR', '/storage-zones', 1, 0)
-- 충돌 시 can_access 만 보정한다 — 누군가 의도적으로 올린 can_edit 을 되돌리지 않는다.
ON CONFLICT(role, page_key) DO UPDATE SET can_access = 1, updated_at = CURRENT_TIMESTAMP;
