-- 0138: 페이지 마스터 멱등 재-sync (UPSERT 패턴 정착)
-- 0137 적용 후 향후 신규 페이지 추가 시 이 마이그레이션을 복사해서 page_key 만 추가/수정.
-- ON CONFLICT UPSERT 라 기존 47개 데이터 동일하면 영향 없음. label/icon/section/sort_order 변경 시 자동 반영.

INSERT INTO permission_pages (page_key, page_label, page_section, page_icon, badge_id, sort_order) VALUES
  -- 운영
  ('/dashboard',           '대시보드',         '운영', 'fa-chart-line',         NULL,                          10),
  ('/orders',              '주문 관리',         '운영', 'fa-file-alt',            'nav-badge-orders',           20),
  ('/quotations',          '견적서 관리',       '운영', 'fa-file-invoice',        NULL,                          30),
  ('/cards',               '현장 카드',         '운영', 'fa-th-large',            NULL,                          40),
  ('/shipments',           '출고/배송',         '운영', 'fa-truck',               NULL,                          50),
  ('/delivery-analytics',  '납기 분석',         '운영', 'fa-chart-line',         NULL,                          60),
  ('/approvals',           '전자결재',          '운영', 'fa-stamp',               'nav-badge-approvals',         70),
  -- 구매
  ('/purchase-orders',     '발주 관리',         '구매', 'fa-shopping-cart',       NULL,                          110),
  ('/purchase-requests',   '발주 요청',         '구매', 'fa-clipboard-list',      'nav-badge-pr',                120),
  ('/inspections',         '검수 템플릿 (고급)','구매', 'fa-clipboard-check',     'nav-badge-insp',              130),
  ('/receiving',           '입고 관리',         '구매', 'fa-truck-loading',       'nav-badge-my-receiving',      140),
  -- 기준정보
  ('/clients',             '거래처',            '기준정보', 'fa-building',         NULL,                          210),
  ('/items',               '품목',              '기준정보', 'fa-tags',             NULL,                          220),
  ('/price-lists',         '단가 관리',         '기준정보', 'fa-layer-group',     NULL,                          230),
  -- 재무
  ('/ledger',              '정산 관리',         '재무', 'fa-file-invoice-dollar', 'nav-badge-receivables',       310),
  ('/tax-invoices',        '세금 증빙',         '재무', 'fa-file-invoice',        NULL,                          320),
  ('/bank',                '자금 관리',         '재무', 'fa-university',          NULL,                          330),
  ('/cash-schedule',       '자금계획',          '재무', 'fa-calendar-alt',        NULL,                          340),
  ('/payment-requests',    '지출결의서',        '재무', 'fa-money-check-alt',     NULL,                          350),
  ('/vat-reports',         '부가세 신고',       '재무', 'fa-file-invoice',        NULL,                          360),
  ('/financial-reports',   '손익계산서',        '재무', 'fa-chart-bar',           NULL,                          370),
  ('/reports',             '경영 분석',         '재무', 'fa-chart-line',          NULL,                          380),
  -- 생산
  ('/production',          '생산 관리',         '생산', 'fa-industry',            NULL,                          410),
  ('/schedule',            '작업 스케줄',       '생산', 'fa-calendar-alt',        NULL,                          420),
  ('/rip',                 'RIP 모니터',        '생산', 'fa-print',               NULL,                          430),
  ('/equipment',           '장비 관리',         '생산', 'fa-server',              NULL,                          440),
  ('/post-processing',     '후가공',            '생산', 'fa-cut',                 NULL,                          450),
  ('/production-reports',  '생산 분석',         '생산', 'fa-chart-bar',           NULL,                          460),
  ('/production-daily',    '일일 생산',         '생산', 'fa-clipboard-list',      NULL,                          470),
  ('/material-forecast',   '원단 소모 예측',    '생산', 'fa-chart-line',          NULL,                          480),
  ('/bom',                 '자재명세(BOM)',     '생산', 'fa-sitemap',             NULL,                          490),
  -- 인사
  ('/hr',                  '직원 관리',         '인사', 'fa-id-badge',            NULL,                          510),
  ('/attendance',          '근태 관리',         '인사', 'fa-user-clock',          NULL,                          520),
  ('/leaves',              '연차 관리',         '인사', 'fa-umbrella-beach',      NULL,                          530),
  ('/payroll',             '급여 관리',         '인사', 'fa-money-check-alt',     NULL,                          540),
  ('/settings/payroll-rates', '급여 요율 관리', '인사', 'fa-percentage',         NULL,                          550),
  ('/year-end-manage',     '연말정산',          '인사', 'fa-file-invoice',        NULL,                          560),
  ('/insurance-reports',   '4대보험 신고',      '인사', 'fa-shield-alt',          NULL,                          570),
  -- 관리
  ('/inventory',           '재고 관리',         '관리', 'fa-boxes',               NULL,                          610),
  ('/storage-zones',       '창고 관리',         '관리', 'fa-warehouse',           NULL,                          620),
  ('/users',               '사용자 관리',       '관리', 'fa-users',               NULL,                          630),
  ('/permissions',         '권한 관리',         '관리', 'fa-user-shield',         NULL,                          640),
  ('/activity-log',        '시스템 로그',       '관리', 'fa-history',             NULL,                          650),
  ('/kakao',               '알림톡',            '관리', 'fa-comment-dots',        NULL,                          660),
  ('/settings',            '설정',              '관리', 'fa-cog',                 NULL,                          670),
  ('/migration',           '데이터 이관',       '관리', 'fa-file-import',         NULL,                          680),
  -- 시스템 문서
  ('/workflow',            '시스템 워크플로우', '시스템 문서', 'fa-diagram-project', NULL,                       710)
ON CONFLICT(page_key) DO UPDATE SET
  page_label   = excluded.page_label,
  page_section = excluded.page_section,
  page_icon    = excluded.page_icon,
  badge_id     = excluded.badge_id,
  sort_order   = excluded.sort_order;

-- ADMIN seed 멱등화: 신규 page_key 자동 추가 (기존 권한은 보존)
INSERT OR IGNORE INTO role_page_permissions (role, page_key, can_access)
SELECT 'ADMIN', page_key, 1 FROM permission_pages;
