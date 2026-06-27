-- 0393: 주문 접수 알림톡 기본 템플릿 매핑 시드 (context='orders')
--
-- 주문서 메시지 모달(sendOrderNotice)이 template-defaults/resolve(context=orders)로
-- 등록된 기본 템플릿을 해석하도록 변경됨(과거 가짜 코드 'order_received' 제거).
-- 빈 template_code 행을 시드해 설정 UI(발송 위치별 기본 템플릿)에 노출 → 관리자가
-- 승인된 주문 접수 템플릿을 선택 매핑할 수 있게 함. ''이면 resolve가 ''(수동 작성) 반환.
INSERT INTO kakao_template_defaults (context, match_key, entity_id, template_code) VALUES
  ('orders', '', 1, ''),
  ('orders', '', 2, '')
ON CONFLICT(context, match_key, entity_id) DO NOTHING;
