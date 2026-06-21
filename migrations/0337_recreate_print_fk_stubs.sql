-- 0337: print_media/print_methods 스텁 재생성 — 0335 회귀 긴급 수정
--
-- 배경: items가 print_method_id/print_media_id/parent_media_id를 inline FK로 참조한다
--       (REFERENCES print_methods(id) / print_media(id)). 0335가 이 부모 테이블들을 DROP하자
--       SQLite가 "부모 테이블 소멸 시 자식 테이블 수정 차단" 규칙에 따라 items의 INSERT/UPDATE를
--       전부 "no such table: print_media" 로 거부 → 품목 생성/수정 전면 불능 (SELECT만 동작).
--
-- 근본 제약: items의 FK 컬럼은 D1에서 제거 불가하다.
--   - DROP COLUMN: FK 컬럼(+parent_media_id 인덱스)이라 SQLite가 차단.
--   - 테이블 재빌드(DROP+RENAME): items를 20개 테이블이 inbound FK로 참조 → D1(workerd) FK가드가
--     defer_foreign_keys 무력화하며 롤백(local·remote 동일 실측).
--   → 따라서 부모 테이블(print_media/print_methods)은 items 쓰기 가능성을 위해 영구 존재해야 한다.
--     실제 데이터는 없으므로 id PK만 가진 스텁으로 유지(과거 컬럼/시스템은 코드·라우터·UI에서 제거 완료).
--
-- 멱등: IF NOT EXISTS. junction(print_method_media/media_material_groups)은 items 미참조라 0335의 DROP 유지.
CREATE TABLE IF NOT EXISTS print_methods (id INTEGER PRIMARY KEY);
CREATE TABLE IF NOT EXISTS print_media (id INTEGER PRIMARY KEY);
