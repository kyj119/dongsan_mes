-- 0303: clients.delivery_method 영문 잔존값 → 한글 정리 (0290 후속)
--
-- 배경: clients.delivery_method 컬럼 DEFAULT가 'SAME'(영문, 0153)이고,
--   생성 라우트 POST /api/clients(clients.ts) + 레거시 임포트(migration.ts /clients/import)가
--   INSERT에서 delivery_method를 누락 → DEFAULT 'SAME'으로 저장됨.
--   0290(영문→한글 변환)은 데이터만 바꿨고 DEFAULT/코드 경로는 그대로라, 이후 생성분이 다시 'SAME'.
--   2026-06-09 prod 227건('SAME') 잔존 확인.
--
-- 코드 수정(동일 커밋): clients.ts 생성 INSERT에 delivery_method('방문수령' 기본) 추가,
--   migration.ts 임포트 INSERT에 delivery_method 추가, clients.js 'SAME' 폴백 2곳 → '방문수령'.
--
-- ⚠️ 컬럼 DEFAULT 'SAME'→'방문수령' 변경은 SQLite상 clients 테이블 재생성이 필요한데,
--   clients를 참조하는 자식 테이블 FK ON DELETE CASCADE로 orders/order_items 등이 삭제될 위험
--   (2026-05-26 migration 0262 사고: order_items 452 + card_items 279 삭제)이 있어 수행하지 않는다.
--   대신 모든 INSERT 경로를 명시화하여 DEFAULT가 트리거되지 않도록 했다.
--   본 마이그는 기존 잔존 데이터만 정리한다(멱등 — WHERE가 영문값에만 매칭).

UPDATE clients SET delivery_method = '대신화물' WHERE delivery_method = 'FREIGHT';
UPDATE clients SET delivery_method = '직배'     WHERE delivery_method = 'DIRECT';
UPDATE clients SET delivery_method = '방문수령' WHERE delivery_method IN ('SAME', 'PICKUP');
