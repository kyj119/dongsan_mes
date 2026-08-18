-- 0535_order_delivery_address_split.sql
-- 주문 배송지를 [우편번호 · 도로명주소 · 상세주소] 3축으로 수집한다.
--
-- 왜: 지금은 orders.delivery_info 한 칸에 전부 우겨넣는다. prod 실측(2026-08-18)
--     — delivery_info 보유 8,758건 중 3,973건(45.4%)이 이미 "층/호"를 본문에 섞어 넣었고,
--     거래처 990곳(활성 2,873 중 34%)이 clients.address_detail 을 갖고 있는데 주문서
--     자동채움이 이를 버린다. 우편번호는 어디에도 남지 않아(`[nnnnn]` 프리픽스 0건)
--       ① shipments 권역 묶음(우편번호 앞 3자리) 상시 무발동
--       ② 한진 대량등록 엑셀 '받는분우편번호' 하드코딩 공란
--     두 기능이 죽어 있었다.
--
-- 설계(파싱 마이그레이션 없음 = 레거시 무손상):
--   delivery_info    기존대로 **합본**(도로명 + ' ' + 상세)을 유지한다. 소비처 12곳 무변경.
--   delivery_postal  우편번호 5자리(숫자만). delivery_info 에는 넣지 않는다.
--   delivery_detail  상세주소. 복원 시 delivery_info 의 **접미**로 매칭해 떼어낸다
--                    (접미가 아니면 전체를 도로명칸에 넣고 상세는 빈칸 — 실패해도 손실 0).
--   레거시 8,758건은 두 컬럼 NULL · delivery_info 그대로 → 표시·출력 전부 종전과 동일.
--
-- 성격: additive(컬럼 2). ALTER 는 멱등 아님 — 신규 1회 적용(feedback-migration-idempotency).
-- 적용: 로컬/원격 모두 `wrangler d1 execute … --file` 직접 실행.

ALTER TABLE orders ADD COLUMN delivery_postal TEXT;
ALTER TABLE orders ADD COLUMN delivery_detail TEXT;
