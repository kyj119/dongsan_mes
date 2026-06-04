-- 0297_drop_order_templates.sql
-- #334: order_templates = UI 미연결 orphan. /api/templates 라우터(templates.ts)·마운트(index.tsx) 제거됨.
--   실제 사용 "템플릿"은 전부 별도 테이블(message_templates / po_templates / inspection / kakao / approval).
--   로컬 D1 기준 0행(미사용) 확인 후 drop. DROP TABLE이 인덱스(idx_order_templates_active)도 함께 제거.
-- ⚠️ prod 적용 전 SELECT COUNT(*) FROM order_templates 로 데이터 부재 재확인 권장(거의 0/테스트).

DROP TABLE IF EXISTS order_templates;
