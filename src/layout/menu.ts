// src/layout/menu.ts — 사이드바 메뉴 구성 (layout.ts에서 분리)
export interface MenuItem {
  path: string
  icon: string
  label: string
  roles: string[]
  badgeId?: string
}

export interface MenuGroup {
  group: string
  items: MenuItem[]
}

export const MENU_ITEMS: MenuGroup[] = [
  {
    group: '운영',
    items: [
      { path: '/dashboard', icon: 'fa-chart-line', label: '대시보드', roles: ['ADMIN', 'MANAGER'] },
      { path: '/orders', icon: 'fa-file-alt', label: '주문 관리', roles: ['ADMIN', 'MANAGER', 'DESIGNER'], badgeId: 'nav-badge-orders' },
      { path: '/quotations', icon: 'fa-file-invoice', label: '견적서 관리', roles: ['ADMIN', 'MANAGER'] },
      { path: '/cards', icon: 'fa-th-large', label: '현장 카드', roles: ['ADMIN', 'MANAGER', 'DESIGNER', 'OPERATOR'] },
      { path: '/shipments', icon: 'fa-truck', label: '출고/배송', roles: ['ADMIN', 'MANAGER', 'DESIGNER', 'OPERATOR'] },
      // /shipments-dashboard 사이드바 은퇴 (2026-07-17): '준비상태' 뷰를 /shipments 탭으로 흡수(③).
      // OPERATOR 에 /shipments 접근 부여(0465)+진입 시 준비상태 탭 전용 게이팅. 페이지·라우트·API 보존(직접 URL). 되살릴 경우 이 줄 복원.
      // { path: '/shipments-dashboard', icon: 'fa-clipboard-check', label: '출고 대시보드', roles: ['ADMIN', 'MANAGER', 'OPERATOR'] },
      { path: '/pack', icon: 'fa-box-open', label: '출고 검수', roles: ['ADMIN', 'MANAGER', 'OPERATOR'] },
      // /delivery-analytics 제거 (2026-06-26): 납기준수율·평균처리시간은 orders.shipped_at 부재로 작동 불가,
      // 오늘출고예정=/dashboard·지연=/orders·체류시간=/production-reports와 전부 중복. 페이지·라우트 삭제됨.
      { path: '/quality', icon: 'fa-triangle-exclamation', label: '품질/클레임', roles: ['ADMIN', 'MANAGER'] },
      { path: '/approvals', icon: 'fa-stamp', label: '전자결재', roles: ['ADMIN', 'MANAGER', 'DESIGNER', 'OPERATOR'], badgeId: 'nav-badge-approvals' },
    ],
  },
  {
    group: '구매',
    items: [
      { path: '/purchase-orders', icon: 'fa-shopping-cart', label: '발주 관리', roles: ['ADMIN', 'MANAGER'] },
      { path: '/purchase-requests', icon: 'fa-clipboard-list', label: '발주 요청', roles: ['ADMIN', 'MANAGER'], badgeId: 'nav-badge-pr' },
      { path: '/weekly-purchase', icon: 'fa-calendar-week', label: '주간 일괄 발주', roles: ['ADMIN', 'MANAGER'] },
      { path: '/inspections', icon: 'fa-clipboard-check', label: '검수 템플릿 (고급)', roles: ['ADMIN'], badgeId: 'nav-badge-insp' },
      { path: '/receiving', icon: 'fa-truck-loading', label: '입고 관리', roles: ['ADMIN', 'MANAGER', 'OPERATOR'], badgeId: 'nav-badge-my-receiving' },
      { path: '/purchase-invoices', icon: 'fa-file-invoice-dollar', label: '매입확정', roles: ['ADMIN', 'MANAGER'] },
    ],
  },
  {
    group: '기준정보',
    items: [
      { path: '/clients', icon: 'fa-building', label: '거래처', roles: ['ADMIN', 'MANAGER'] },
      { path: '/items', icon: 'fa-tags', label: '품목', roles: ['ADMIN', 'MANAGER'] },
      // /spec-groups 사이드바 은퇴 (2026-06-26): 규격그룹/변종 폐기 설계(신 품목모델 product_materials 대체)·prod 데이터 0.
      // 페이지·API는 보존(직접 URL만 접근). 되살릴 경우 이 줄 복원.
      // { path: '/spec-groups', icon: 'fa-layer-group', label: '규격그룹 관리', roles: ['ADMIN', 'MANAGER'] },
      { path: '/price-list', icon: 'fa-won-sign', label: '단가 관리', roles: ['ADMIN', 'MANAGER'] },
      { path: '/post-processing', icon: 'fa-cut', label: '후가공·마감', roles: ['ADMIN', 'MANAGER'] },
    ],
  },
  {
    group: '재무',
    items: [
      { path: '/accounting', icon: 'fa-coins', label: '회계 허브', roles: ['ADMIN', 'MANAGER'] },
      { path: '/ledger', icon: 'fa-file-invoice-dollar', label: '거래처 원장', roles: ['ADMIN', 'MANAGER'], badgeId: 'nav-badge-receivables' },
      { path: '/tax-invoices', icon: 'fa-file-invoice', label: '세금 증빙', roles: ['ADMIN', 'MANAGER'] },
      // /bank 사이드바 은퇴 (P3 자금 허브 통합, 2026-07-17): /cash-schedule '실적' 탭으로 흡수.
      // 페이지·라우트·API는 보존(직접 URL만 접근). 되살릴 경우 이 줄 복원.
      // { path: '/bank', icon: 'fa-university', label: '자금 관리', roles: ['ADMIN'] },
      { path: '/cash-schedule', icon: 'fa-wallet', label: '자금 관리', roles: ['ADMIN', 'MANAGER'] },
      { path: '/payment-requests', icon: 'fa-money-check-alt', label: '지출결의서', roles: ['ADMIN', 'MANAGER'] },
      { path: '/card-expenses', icon: 'fa-credit-card', label: '법인카드', roles: ['ADMIN', 'MANAGER'] },
      { path: '/vat-reports', icon: 'fa-file-invoice', label: '부가세 신고', roles: ['ADMIN', 'MANAGER'] },
      // /financial-reports 사이드바 은퇴 (손익허브 통합, 2026-07-17): /reports '손익계산서' 탭으로 흡수.
      // 페이지·라우트·API 보존(직접 URL만 접근). 되살릴 경우 이 줄 복원.
      // { path: '/financial-reports', icon: 'fa-chart-bar', label: '손익계산서', roles: ['ADMIN', 'MANAGER'] },
      { path: '/reports', icon: 'fa-chart-line', label: '손익·경영 분석', roles: ['ADMIN', 'MANAGER'] },
      { path: '/management-report', icon: 'fa-stethoscope', label: '경영진단', roles: ['ADMIN', 'MANAGER'] },
    ],
  },
  {
    group: '생산',
    items: [
      { path: '/production', icon: 'fa-industry', label: '생산 현황', roles: ['ADMIN', 'MANAGER', 'DESIGNER', 'OPERATOR'] },
      { path: '/equipment', icon: 'fa-server', label: '장비 관리', roles: ['ADMIN', 'MANAGER', 'DESIGNER'] },
      { path: '/maintenance', icon: 'fa-wrench', label: '정비 관리', roles: ['ADMIN', 'MANAGER'] },
      { path: '/production-reports', icon: 'fa-chart-bar', label: '생산 분석', roles: ['ADMIN', 'MANAGER'] },
      // #318: GET /api/forecast/material-consumption 백엔드 미구현(빈 화면). productionReports /consumption은
      // yd 환산·status·trend 미제공으로 비호환 → 구현 전까지 네비 숨김. 구현 시 이 줄 복원.
      // { path: '/material-forecast', icon: 'fa-chart-line', label: '원단 소모 예측', roles: ['ADMIN', 'MANAGER'] },
      { path: '/bom', icon: 'fa-sitemap', label: '자재명세(BOM)', roles: ['ADMIN', 'MANAGER'] },
      { path: '/tasks', icon: 'fa-tasks', label: '작업 큐', roles: ['ADMIN', 'MANAGER'], badgeId: 'nav-badge-tasks' },
      { path: '/scan', icon: 'fa-qrcode', label: 'QR 스캔', roles: ['ADMIN', 'MANAGER', 'OPERATOR'] },
      { path: '/workbench', icon: 'fa-object-group', label: '시안 검수', roles: ['ADMIN', 'MANAGER', 'DESIGNER'] },
      { path: '/ia-editor', icon: 'fa-layer-group', label: 'IA 편집기', roles: ['ADMIN', 'MANAGER', 'DESIGNER'] },
    ],
  },
  {
    group: '인사',
    items: [
      { path: '/hr', icon: 'fa-id-badge', label: '직원 관리', roles: ['ADMIN', 'MANAGER'] },
      { path: '/labor-contracts', icon: 'fa-file-contract', label: '근로계약', roles: ['ADMIN', 'MANAGER'] },
      { path: '/attendance', icon: 'fa-user-clock', label: '근태 관리', roles: ['ADMIN', 'MANAGER'] },
      { path: '/leaves', icon: 'fa-umbrella-beach', label: '연차 관리', roles: ['ADMIN', 'MANAGER'] },
      { path: '/payroll', icon: 'fa-money-check-alt', label: '급여 관리', roles: ['ADMIN', 'MANAGER'] },
      { path: '/settings/payroll-rates', icon: 'fa-percentage', label: '급여 요율 관리', roles: ['ADMIN', 'MANAGER'] },
      { path: '/year-end-manage', icon: 'fa-file-invoice', label: '연말정산', roles: ['ADMIN', 'MANAGER'] },
      { path: '/insurance-reports', icon: 'fa-shield-alt', label: '4대보험 신고', roles: ['ADMIN', 'MANAGER'] },
    ],
  },
  {
    group: '관리',
    items: [
      { path: '/inventory', icon: 'fa-boxes', label: '재고 관리', roles: ['ADMIN', 'MANAGER'] },
      // /inventory-dashboard 사이드바 은퇴 (2026-07-16): '창고별' 뷰를 /inventory 3번째 탭으로 흡수(중복 제거).
      // 실질 ADMIN 전용이었음(permission_pages 행 없음→비ADMIN 숨김). 페이지·라우트·API 보존(직접 URL). 되살릴 경우 이 줄 복원.
      // { path: '/inventory-dashboard', icon: 'fa-chart-bar', label: '창고별 재고', roles: ['ADMIN', 'MANAGER', 'OPERATOR'] },
      { path: '/storage-zones', icon: 'fa-warehouse', label: '창고 관리', roles: ['ADMIN'] },
      { path: '/users', icon: 'fa-users', label: '사용자 관리', roles: ['ADMIN'] },
      { path: '/permissions', icon: 'fa-user-shield', label: '권한 관리', roles: ['ADMIN'] },
      { path: '/activity-log', icon: 'fa-history', label: '시스템 로그', roles: ['ADMIN', 'MANAGER'] },
      { path: '/messages', icon: 'fa-comment-dots', label: '메시지 관리', roles: ['ADMIN', 'MANAGER'] },
      { path: '/settings', icon: 'fa-cog', label: '설정', roles: ['ADMIN'] },
      { path: '/migration', icon: 'fa-file-import', label: '데이터 이관', roles: ['ADMIN'] },
    ],
  },
]
