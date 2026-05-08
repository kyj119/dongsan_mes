-- 0133: 0132 시드 검수 템플릿 5종 비활성화
-- 배경: 2026-04-15 수량 중심 검수로 전환. 품질 템플릿은 ADMIN 선택 사항으로.
-- 기존 데이터 보존: 삭제하지 않고 is_active=0. ADMIN이 향후 재활성화 가능.

UPDATE inspection_templates
   SET is_active = 0, updated_at = CURRENT_TIMESTAMP
 WHERE template_name IN (
   '현수막 입고 검수',
   '솔벤시트 입고 검수',
   '래핑시트 입고 검수',
   'UV출력 입고 검수',
   '일반 자재 입고 검수'
 );
