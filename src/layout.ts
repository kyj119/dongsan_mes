// src/layout.ts — 공유 레이아웃 (사이드바 + 상단 바)
import type { Context } from 'hono'
import type { HonoEnv } from './types/env'

interface MenuItem {
  path: string
  icon: string
  label: string
  roles: string[]
  badgeId?: string
}

interface MenuGroup {
  group: string
  items: MenuItem[]
}

const MENU_ITEMS: MenuGroup[] = [
  {
    group: '운영',
    items: [
      { path: '/dashboard', icon: 'fa-chart-line', label: '대시보드', roles: ['ADMIN', 'MANAGER'] },
      { path: '/orders', icon: 'fa-file-alt', label: '주문 관리', roles: ['ADMIN', 'MANAGER', 'DESIGNER'], badgeId: 'nav-badge-orders' },
      { path: '/quotations', icon: 'fa-file-invoice', label: '견적서 관리', roles: ['ADMIN', 'MANAGER'] },
      { path: '/cards', icon: 'fa-th-large', label: '현장 카드', roles: ['ADMIN', 'MANAGER', 'DESIGNER', 'OPERATOR'] },
      { path: '/shipments', icon: 'fa-truck', label: '출고/배송', roles: ['ADMIN', 'MANAGER', 'DESIGNER'] },
      { path: '/shipments-dashboard', icon: 'fa-clipboard-check', label: '출고 대시보드', roles: ['ADMIN', 'MANAGER', 'OPERATOR'] },
      { path: '/delivery-analytics', icon: 'fa-chart-line', label: '납기 분석', roles: ['ADMIN', 'MANAGER'] },
      { path: '/approvals', icon: 'fa-stamp', label: '전자결재', roles: ['ADMIN', 'MANAGER', 'DESIGNER', 'OPERATOR'], badgeId: 'nav-badge-approvals' },
    ],
  },
  {
    group: '구매',
    items: [
      { path: '/purchase-orders', icon: 'fa-shopping-cart', label: '발주 관리', roles: ['ADMIN', 'MANAGER'] },
      { path: '/purchase-requests', icon: 'fa-clipboard-list', label: '발주 요청', roles: ['ADMIN', 'MANAGER'], badgeId: 'nav-badge-pr' },
      { path: '/inspections', icon: 'fa-clipboard-check', label: '검수 템플릿 (고급)', roles: ['ADMIN'], badgeId: 'nav-badge-insp' },
      { path: '/receiving', icon: 'fa-truck-loading', label: '입고 관리', roles: ['ADMIN', 'MANAGER', 'OPERATOR'], badgeId: 'nav-badge-my-receiving' },
    ],
  },
  {
    group: '기준정보',
    items: [
      { path: '/clients', icon: 'fa-building', label: '거래처', roles: ['ADMIN', 'MANAGER'] },
      { path: '/items', icon: 'fa-tags', label: '품목', roles: ['ADMIN', 'MANAGER'] },
      { path: '/price-list', icon: 'fa-won-sign', label: '단가 관리', roles: ['ADMIN', 'MANAGER'] },
    ],
  },
  {
    group: '재무',
    items: [
      { path: '/ledger', icon: 'fa-file-invoice-dollar', label: '거래처 원장', roles: ['ADMIN', 'MANAGER'], badgeId: 'nav-badge-receivables' },
      { path: '/tax-invoices', icon: 'fa-file-invoice', label: '세금 증빙', roles: ['ADMIN', 'MANAGER'] },
      { path: '/bank', icon: 'fa-university', label: '자금 관리', roles: ['ADMIN'] },
      { path: '/cash-schedule', icon: 'fa-calendar-alt', label: '자금계획', roles: ['ADMIN', 'MANAGER'] },
      { path: '/payment-requests', icon: 'fa-money-check-alt', label: '지출결의서', roles: ['ADMIN', 'MANAGER'] },
      { path: '/vat-reports', icon: 'fa-file-invoice', label: '부가세 신고', roles: ['ADMIN', 'MANAGER'] },
      { path: '/financial-reports', icon: 'fa-chart-bar', label: '손익계산서', roles: ['ADMIN', 'MANAGER'] },
      { path: '/reports', icon: 'fa-chart-line', label: '경영 분석', roles: ['ADMIN', 'MANAGER'] },
    ],
  },
  {
    group: '생산',
    items: [
      { path: '/production', icon: 'fa-industry', label: '생산 현황', roles: ['ADMIN', 'MANAGER', 'DESIGNER', 'OPERATOR'] },
      { path: '/equipment', icon: 'fa-server', label: '장비 관리', roles: ['ADMIN', 'MANAGER', 'DESIGNER'] },
      { path: '/post-processing', icon: 'fa-cut', label: '후가공', roles: ['ADMIN', 'MANAGER', 'DESIGNER', 'OPERATOR'] },
      { path: '/production-reports', icon: 'fa-chart-bar', label: '생산 분석', roles: ['ADMIN', 'MANAGER'] },
      { path: '/material-forecast', icon: 'fa-chart-line', label: '원단 소모 예측', roles: ['ADMIN', 'MANAGER'] },
      { path: '/bom', icon: 'fa-sitemap', label: '자재명세(BOM)', roles: ['ADMIN', 'MANAGER'] },
    ],
  },
  {
    group: '인사',
    items: [
      { path: '/hr', icon: 'fa-id-badge', label: '직원 관리', roles: ['ADMIN', 'MANAGER'] },
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

function sidebarHTML(activePage: string): string {
  let html = `<aside class="sidebar" id="sidebar">`

  // Logo area + entity switcher + pin toggle
  html += `
    <div class="sidebar-logo">
      <i class="fas fa-industry"></i>
      <div class="nav-label" id="entitySwitcher" style="position:relative;flex:1;min-width:0;">
        <button id="entitySwitcherBtn" onclick="toggleEntityDropdown()"
          style="background:none;border:none;cursor:pointer;display:flex;align-items:center;gap:4px;padding:0;font-size:13px;font-weight:600;color:#e2e8f0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%;">
          <span id="entityName" style="overflow:hidden;text-overflow:ellipsis;">로딩중...</span>
          <i class="fas fa-chevron-down" id="entityArrow" style="font-size:9px;flex-shrink:0;transition:transform 0.2s;"></i>
        </button>
        <div id="entityDropdown" style="display:none;position:absolute;top:100%;left:0;margin-top:4px;background:#1e293b;border:1px solid #334155;border-radius:6px;min-width:180px;z-index:9999;box-shadow:0 4px 12px rgba(0,0,0,0.3);overflow:hidden;"></div>
      </div>
      <button class="sidebar-pin-btn" id="sidebarPinBtn" title="사이드바 고정" onclick="toggleSidebarPin()">
        <i class="fas fa-thumbtack"></i>
      </button>
    </div>`

  // Favorites section (rendered by JS)
  html += `<div class="sidebar-favorites" id="sidebarFavorites"></div>`

  // Menu groups
  html += `<nav class="sidebar-nav">`
  MENU_ITEMS.forEach((group, gi) => {
    if (gi > 0) {
      html += `<div class="group-sep"></div>`
    }
    html += `<div class="group-header" onclick="toggleSidebarGroup(${gi})">
      <span class="group-label">${group.group}</span>
      <i class="fas fa-chevron-down group-chevron nav-label" id="groupChevron${gi}"></i>
    </div>`
    html += `<div class="group-items" id="groupItems${gi}">`

    group.items.forEach((item) => {
      const isActive = activePage === item.path
      const activeClass = isActive ? ' active' : ''
      const badgeHtml = item.badgeId ? `<span class="nav-badge" id="${item.badgeId}"></span>` : ''
      html += `
        <a href="${item.path}" class="nav-item${activeClass}" data-page-key="${item.path}" data-path="${item.path}" title="${item.label}">
          <i class="fas ${item.icon}"></i>
          <span class="nav-label">${item.label}</span>
          ${badgeHtml}
          <button class="fav-star" onclick="event.preventDefault();event.stopPropagation();toggleFavorite('${item.path}')" title="즐겨찾기">
            <i class="fas fa-star"></i>
          </button>
        </a>`
    })
    html += `</div>`
  })
  html += `</nav>`

  // User section (bottom)
  html += `
    <div class="sidebar-user">
      <div class="nav-item" id="sidebarUserItem" style="cursor:default;">
        <i class="fas fa-user-circle"></i>
        <span class="nav-label" id="sidebarUserName">-</span>
      </div>
      <a href="#" class="nav-item" id="logoutBtn" title="로그아웃">
        <i class="fas fa-sign-out-alt"></i>
        <span class="nav-label">로그아웃</span>
      </a>
    </div>`

  html += `</aside>`
  return html
}

function topBarHTML(title: string): string {
  return `
    <div class="sidebar-overlay" id="sidebarOverlay" onclick="closeMobileSidebar()"></div>
    <header class="top-bar">
      <button class="mobile-menu-btn" onclick="toggleMobileSidebar()" aria-label="메뉴">
        <i class="fas fa-bars"></i>
      </button>
      <h1 class="top-bar-title">${title}</h1>
      <div class="topbar-search" id="globalSearchWrap">
        <input type="text" id="globalSearchInput" class="topbar-search-input" placeholder="검색... (Ctrl+K)"
          oninput="debounceGlobalSearch()" onkeydown="if(event.key==='Escape'){closeSearchResults();}">
        <i class="fas fa-search topbar-search-icon"></i>
        <kbd class="topbar-search-kbd">Ctrl+K</kbd>
        <div id="searchResults" class="topbar-search-results"></div>
      </div>
      <div class="top-bar-right">
        <button id="darkModeToggle" onclick="toggleDarkMode()" class="p-2 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors" title="다크 모드 전환" style="background:none;border:none;cursor:pointer;font-size:16px;color:var(--c-text-secondary);padding:4px 8px;border-radius:6px;">
          <i id="darkModeIcon" class="fas fa-moon"></i>
        </button>
        <div class="notif-wrap" id="notifWrap">
          <button onclick="toggleNotifPanel()" class="notif-btn">
            <i class="fas fa-bell"></i>
            <span id="notifBadge" class="notif-badge-count">0</span>
          </button>
          <div id="notifPanel" class="notif-panel">
            <div class="notif-panel-header">
              <span>알림</span>
              <button onclick="markAllNotifRead()" class="notif-readall-btn">모두 읽음</button>
            </div>
            <div id="notifList" class="notif-panel-body">
              <div class="ds-empty" style="padding:24px;"><p>알림이 없습니다.</p></div>
            </div>
          </div>
        </div>
        <span id="topBarUserName" class="top-bar-user"></span>
      </div>
    </header>
    <!-- Command Palette -->
    <div class="ds-cmd-overlay" id="cmdPalette" style="display:none;">
      <div class="ds-cmd-backdrop" onclick="closeCmdPalette()"></div>
      <div class="ds-cmd-dialog">
        <div class="ds-cmd-input-wrap">
          <i class="fas fa-search"></i>
          <input type="text" id="cmdInput" class="ds-cmd-input" placeholder="페이지 이동, 검색..." autocomplete="off"
            oninput="filterCmdResults()" onkeydown="cmdKeyHandler(event)">
          <kbd>ESC</kbd>
        </div>
        <div class="ds-cmd-results" id="cmdResults"></div>
      </div>
    </div>`
}

const SHARED_CSS = `
<style>
  /* === Design Tokens === */
  :root {
    --c-primary: #3b82f6;
    --c-primary-hover: #2563eb;
    --c-primary-light: #eff6ff;
    --c-primary-dark: #1e40af;
    --c-success: #16a34a;
    --c-success-light: #dcfce7;
    --c-warning: #d97706;
    --c-warning-light: #fef3c7;
    --c-danger: #dc2626;
    --c-danger-light: #fee2e2;
    --c-info: #2563eb;
    --c-info-light: #dbeafe;
    --c-bg: #F0F1F3;
    --c-surface: #ffffff;
    --c-border: #e2e8f0;
    --c-border-light: #f1f5f9;
    --c-text: #1e293b;
    --c-text-secondary: #64748b;
    --c-text-muted: #94a3b8;
    --c-sidebar: #1e293b;
    --c-sidebar-hover: #334155;
    --c-sidebar-border: #334155;
    --c-sidebar-text: #94a3b8;
    --c-sidebar-text-active: #ffffff;
    --sidebar-w: 60px;
    --sidebar-w-expanded: 240px;
    --topbar-h: 48px;
    --font-family: 'Inter', 'Pretendard Variable', Pretendard, -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
    --fs-xs: 11px; --fs-sm: 13px; --fs-base: 14px; --fs-lg: 16px; --fs-xl: 18px; --fs-2xl: 24px; --fs-3xl: 30px;
    --space-xs: 4px; --space-sm: 8px; --space-md: 12px; --space-lg: 16px; --space-xl: 24px; --space-2xl: 32px;
    --radius-sm: 6px; --radius-md: 8px; --radius-lg: 12px; --radius-full: 9999px;
    --shadow-sm: 0 1px 2px rgba(0,0,0,0.05);
    --shadow-md: 0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04);
    --shadow-lg: 0 4px 12px rgba(0,0,0,0.1);
    --shadow-xl: 0 8px 24px rgba(0,0,0,0.12);
    --transition-fast: 0.15s ease;
    --transition-normal: 0.2s ease;
  }
  html.dark {
    color-scheme: dark;
    --c-bg: #0f172a;
    --c-surface: #1e293b;
    --c-text: #e2e8f0;
    --c-text-secondary: #94a3b8;
    --c-text-muted: #64748b;
    --c-border: #334155;
    --c-border-light: #1e293b;
    --c-primary: #60a5fa;
    --c-primary-hover: #3b82f6;
    --c-primary-light: rgba(96,165,250,0.1);
    --c-primary-dark: #2563eb;
    --c-success: #4ade80;
    --c-success-light: rgba(74,222,128,0.1);
    --c-warning: #fbbf24;
    --c-warning-light: rgba(251,191,36,0.1);
    --c-danger: #f87171;
    --c-danger-light: rgba(248,113,113,0.1);
    --c-info: #60a5fa;
    --c-info-light: rgba(96,165,250,0.1);
    --c-sidebar: #0c1222;
    --c-sidebar-hover: rgba(255,255,255,0.08);
    --c-sidebar-border: #1e293b;
    --c-sidebar-text: #94a3b8;
    --c-sidebar-text-active: #f1f5f9;
    --shadow-sm: 0 1px 2px rgba(0,0,0,0.3);
    --shadow-md: 0 4px 6px rgba(0,0,0,0.4);
    --shadow-lg: 0 10px 15px rgba(0,0,0,0.5);
    --shadow-xl: 0 20px 25px rgba(0,0,0,0.6);
  }
  body { font-family: var(--font-family); color: var(--c-text); -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; }

  /* === Sidebar === */
  .sidebar {
    position: fixed;
    top: 0; left: 0; bottom: 0;
    width: var(--sidebar-w);
    background: var(--c-sidebar);
    transition: width var(--transition-normal);
    overflow-x: hidden;
    overflow-y: auto;
    z-index: 50;
    display: flex;
    flex-direction: column;
  }
  .sidebar:hover { width: var(--sidebar-w-expanded); }
  .sidebar::-webkit-scrollbar { width: 0; }
  .sidebar { -ms-overflow-style: none; scrollbar-width: none; }

  .sidebar-logo {
    display: flex;
    align-items: center;
    padding: 16px 18px;
    color: #e2e8f0;
    font-size: var(--fs-xl);
    font-weight: 700;
    border-bottom: 1px solid var(--c-sidebar-border);
    white-space: nowrap;
    min-height: 56px;
  }
  .sidebar-logo i { width: 24px; text-align: center; font-size: 20px; }

  .sidebar-nav {
    flex: 1;
    padding: 8px 0;
  }

  .nav-label {
    opacity: 0;
    white-space: nowrap;
    margin-left: var(--space-md);
    transition: opacity var(--transition-fast);
    font-size: var(--fs-base);
  }
  .sidebar:hover .nav-label { opacity: 1; }

  .nav-item {
    display: flex;
    align-items: center;
    padding: 10px 18px;
    color: var(--c-sidebar-text);
    text-decoration: none;
    transition: background var(--transition-fast), color var(--transition-fast);
    font-size: var(--fs-base);
    border-left: 3px solid transparent;
  }
  .nav-item:hover {
    background: var(--c-sidebar-hover);
    color: #e2e8f0;
  }
  .nav-item.active {
    background: var(--c-sidebar-hover);
    color: var(--c-sidebar-text-active);
    border-left-color: var(--c-primary);
  }
  .nav-item i { width: 24px; text-align: center; font-size: 16px; flex-shrink: 0; }

  .group-label {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--c-text-secondary);
    padding: 12px 18px 4px;
    opacity: 0;
    height: 0;
    overflow: hidden;
    transition: opacity var(--transition-fast), height var(--transition-fast);
  }
  .sidebar:hover .group-label {
    opacity: 1;
    height: auto;
  }

  .group-sep {
    height: 1px;
    background: var(--c-sidebar-border);
    margin: 6px 14px;
  }
  .sidebar:hover .group-sep { display: none; }

  .sidebar-user {
    margin-top: auto;
    border-top: 1px solid var(--c-sidebar-border);
    padding: 4px 0;
  }

  /* Sidebar pin */
  .sidebar.pinned { width: var(--sidebar-w-expanded); }
  .sidebar.pinned .nav-label { opacity: 1; }
  .sidebar.pinned .group-label { opacity: 1; height: auto; }
  .sidebar.pinned .group-sep { display: none; }
  .sidebar.pinned ~ .main-content { margin-left: var(--sidebar-w-expanded); }
  .sidebar-pin-btn {
    background: none; border: none; color: var(--c-sidebar-text); cursor: pointer;
    padding: 4px; font-size: 12px; margin-left: auto;
    opacity: 0; transition: opacity var(--transition-fast), transform var(--transition-fast);
    transform: rotate(-45deg);
  }
  .sidebar:hover .sidebar-pin-btn, .sidebar.pinned .sidebar-pin-btn { opacity: 0.7; }
  .sidebar-pin-btn:hover { opacity: 1 !important; }
  .sidebar.pinned .sidebar-pin-btn { color: var(--c-primary); transform: rotate(0deg); opacity: 1; }

  /* Collapsible groups */
  .group-header { cursor: pointer; display: flex; align-items: center; justify-content: space-between; padding-right: 14px; }
  .group-chevron { font-size: 10px !important; width: auto !important; transition: transform var(--transition-fast); margin-left: 0 !important; }
  .group-items.collapsed { display: none; }
  .group-items.collapsed + .group-sep { margin-top: 2px; }
  .group-header.collapsed .group-chevron { transform: rotate(-90deg); }

  /* Favorites */
  .sidebar-favorites { border-bottom: 1px solid var(--c-sidebar-border); padding: 4px 0; }
  .sidebar-favorites:empty { display: none; border: none; padding: 0; }
  .sidebar-favorites .nav-item { padding: 8px 18px; font-size: 13px; }

  /* Favorite star */
  .fav-star {
    background: none; border: none; font-size: 10px; color: var(--c-text-muted);
    margin-left: auto; opacity: 0; cursor: pointer; padding: 2px 4px;
    transition: opacity var(--transition-fast);
  }
  .sidebar:hover .nav-item:hover .fav-star, .sidebar.pinned .nav-item:hover .fav-star { opacity: 0.5; }
  .fav-star:hover { opacity: 1 !important; color: #eab308; }
  .nav-item.is-fav .fav-star { color: #eab308; }
  .sidebar:hover .nav-item.is-fav .fav-star, .sidebar.pinned .nav-item.is-fav .fav-star { opacity: 1; }

  /* Nav badges */
  .nav-badge {
    margin-left: auto; background: var(--c-danger); color: #fff;
    font-size: 10px; font-weight: 700; min-width: 18px; height: 18px;
    border-radius: var(--radius-full); display: none;
    align-items: center; justify-content: center;
    padding: 0 4px; line-height: 18px; text-align: center;
  }
  .nav-badge.visible { display: inline-flex; }
  /* Hide badges & stars when sidebar collapsed (icons only) */
  .sidebar:not(:hover):not(.pinned) .nav-badge, .sidebar:not(:hover):not(.pinned) .fav-star { display: none !important; }

  /* === Top Bar (Glasstop) === */
  .top-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: var(--topbar-h);
    padding: 0 var(--space-xl);
    background: rgba(255, 255, 255, 0.85);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border-bottom: 1px solid var(--c-border);
    position: sticky;
    top: 0;
    z-index: 40;
  }
  .top-bar-title {
    font-size: var(--fs-lg);
    font-weight: 600;
    color: var(--c-text);
  }
  .top-bar-right {
    display: flex;
    align-items: center;
    gap: var(--space-md);
  }
  .top-bar-user {
    font-size: var(--fs-sm);
    color: var(--c-text-secondary);
  }

  /* Top bar search */
  .topbar-search { position: relative; flex: 1; max-width: 400px; margin: 0 var(--space-xl); }
  .topbar-search-input {
    width: 100%; padding: 6px 56px 6px 32px;
    border: 1px solid var(--c-border); border-radius: var(--radius-md);
    font-size: var(--fs-sm); font-family: inherit;
    background: var(--c-bg); outline: none;
    transition: border-color var(--transition-fast), box-shadow var(--transition-fast), background var(--transition-fast);
  }
  .topbar-search-input:focus { border-color: var(--c-primary); box-shadow: 0 0 0 3px rgba(59,130,246,0.1); background: var(--c-surface); }
  .topbar-search-icon { position: absolute; left: 10px; top: 50%; transform: translateY(-50%); color: var(--c-text-muted); font-size: 13px; pointer-events: none; }
  .topbar-search-kbd {
    position: absolute; right: 8px; top: 50%; transform: translateY(-50%);
    font-size: 10px; color: var(--c-text-muted); font-family: inherit;
    background: var(--c-surface); border: 1px solid var(--c-border); border-radius: 4px;
    padding: 1px 6px; pointer-events: none;
  }
  .topbar-search-input:focus ~ .topbar-search-kbd { display: none; }
  .topbar-search-results {
    display: none; position: absolute; top: 38px; left: 0; right: 0;
    background: var(--c-surface); border: 1px solid var(--c-border);
    border-radius: var(--radius-lg); box-shadow: var(--shadow-xl);
    z-index: 100; max-height: 400px; overflow-y: auto;
  }

  /* Notification panel */
  .notif-wrap { position: relative; }
  .notif-btn { background: none; border: none; cursor: pointer; font-size: 18px; color: var(--c-text-secondary); position: relative; padding: var(--space-xs) var(--space-sm); }
  .notif-btn:hover { color: var(--c-text); }
  .notif-badge-count {
    display: none; position: absolute; top: -2px; right: 0;
    background: var(--c-danger); color: #fff;
    font-size: 10px; font-weight: 700;
    min-width: 16px; height: 16px; border-radius: 8px;
    line-height: 16px; text-align: center; padding: 0 4px;
  }
  .notif-panel {
    display: none; position: absolute; right: 0; top: 40px;
    width: 360px; max-height: 420px;
    background: var(--c-surface); border: 1px solid var(--c-border);
    border-radius: var(--radius-lg); box-shadow: var(--shadow-xl);
    z-index: 100; overflow: hidden;
  }
  .notif-panel-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 12px 16px; border-bottom: 1px solid var(--c-border);
    font-weight: 600; font-size: var(--fs-base);
  }
  .notif-readall-btn { background: none; border: none; cursor: pointer; font-size: 12px; color: var(--c-primary); }
  .notif-panel-body { max-height: 360px; overflow-y: auto; }

  /* Command Palette */
  .ds-cmd-overlay { position: fixed; inset: 0; z-index: 200; display: flex; align-items: flex-start; justify-content: center; padding-top: 15vh; }
  .ds-cmd-backdrop { position: absolute; inset: 0; background: rgba(0,0,0,0.4); backdrop-filter: blur(4px); }
  .ds-cmd-dialog {
    position: relative; width: 100%; max-width: 540px;
    background: var(--c-surface); border-radius: var(--radius-lg);
    box-shadow: var(--shadow-xl); overflow: hidden;
    animation: ds-slideUp 0.15s ease;
  }
  .ds-cmd-input-wrap {
    display: flex; align-items: center; gap: 12px;
    padding: 16px 20px; border-bottom: 1px solid var(--c-border-light);
  }
  .ds-cmd-input-wrap i { color: var(--c-text-muted); font-size: 16px; flex-shrink: 0; }
  .ds-cmd-input-wrap kbd {
    font-size: 11px; color: var(--c-text-muted); font-family: inherit;
    border: 1px solid var(--c-border); border-radius: 4px; padding: 2px 6px; flex-shrink: 0;
  }
  .ds-cmd-input { flex: 1; border: none; outline: none; font-size: var(--fs-lg); font-family: inherit; background: transparent; color: var(--c-text); }
  .ds-cmd-input::placeholder { color: var(--c-text-muted); }
  .ds-cmd-results { max-height: 360px; overflow-y: auto; padding: var(--space-sm); }
  .ds-cmd-group { padding: 8px 12px 4px; font-size: var(--fs-xs); font-weight: 600; color: var(--c-text-muted); text-transform: uppercase; letter-spacing: 0.05em; }
  .ds-cmd-item {
    display: flex; align-items: center; gap: 12px;
    padding: 10px 12px; border-radius: var(--radius-md);
    cursor: pointer; font-size: var(--fs-sm); color: var(--c-text);
    transition: background var(--transition-fast);
  }
  .ds-cmd-item:hover, .ds-cmd-item.active { background: var(--c-primary-light); }
  .ds-cmd-item i { width: 20px; text-align: center; color: var(--c-text-muted); font-size: 14px; }
  .ds-cmd-item .cmd-shortcut { margin-left: auto; font-size: var(--fs-xs); color: var(--c-text-muted); }

  /* === Main Content === */
  .main-content {
    margin-left: var(--sidebar-w);
    min-height: 100vh;
    background: var(--c-bg);
  }
  .page-body { padding: var(--space-xl); }

  /* === Mobile Hamburger === */
  .mobile-menu-btn {
    display: none;
    background: none;
    border: none;
    font-size: 20px;
    color: var(--c-text-secondary);
    cursor: pointer;
    padding: var(--space-xs) var(--space-sm);
  }
  .sidebar-overlay {
    display: none;
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.4);
    z-index: 45;
  }

  /* === Responsive === */
  @media (max-width: 768px) {
    .sidebar, .sidebar.pinned {
      width: var(--sidebar-w-expanded);
      transform: translateX(-100%);
      transition: transform 0.25s ease;
    }
    .sidebar:hover { width: var(--sidebar-w-expanded); }
    .sidebar.open { transform: translateX(0); }
    .sidebar.open .nav-label { opacity: 1; }
    .sidebar.open .group-label { opacity: 1; height: auto; }
    .sidebar.open .group-sep { display: none; }
    .sidebar-overlay.open { display: block; }
    .mobile-menu-btn { display: inline-block; }
    .main-content, .sidebar.pinned ~ .main-content { margin-left: 0; }
    .sidebar-pin-btn { display: none; }
    .top-bar { padding: 0 12px; }
    .top-bar-title { font-size: 14px; }
    .top-bar-user { display: none; }
    #globalSearchWrap { max-width: 200px !important; margin: 0 8px !important; }
    #notifPanel { width: 300px !important; right: -40px !important; }
  }

  @media (max-width: 480px) {
    #globalSearchWrap { display: none !important; }
    .top-bar-title { font-size: 13px; max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  }

  /* === Touch-friendly targets (mobile) === */
  @media (max-width: 768px) {
    button, a.px-4, a.px-3, .nav-item, select, input[type="text"], input[type="date"] {
      min-height: 44px;
    }
    table th, table td { padding: 8px 6px; font-size: 12px; }
    .grid.grid-cols-4 { grid-template-columns: repeat(2, 1fr); }
    .grid.grid-cols-5 { grid-template-columns: repeat(2, 1fr); }
    .grid.grid-cols-3 { grid-template-columns: 1fr; }
  }

  /* === Toast System === */
  #toast-container {
    position: fixed;
    bottom: 20px;
    right: 20px;
    z-index: 9999;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 8px;
  }
  .toast-item {
    padding: 10px 20px;
    border-radius: var(--radius-md);
    color: #fff;
    font-size: var(--fs-base);
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    transition: all 0.3s;
    opacity: 0;
    transform: translateY(10px);
  }
  .toast-item.show { opacity: 1; transform: translateY(0); }
  .toast-item.success { background: var(--c-success); }
  .toast-item.error { background: var(--c-danger); }
  .toast-item.info { background: var(--c-info); }
  .toast-item.warning { background: var(--c-warning); }

  /* === Field Error === */
  .field-error {
    border-color: var(--c-danger) !important;
    box-shadow: 0 0 0 3px rgba(220, 38, 38, 0.15) !important;
    outline: none !important;
  }

  /* === Notifications === */
  #notifPanel .notif-item {
    display: flex;
    gap: 10px;
    padding: 10px 16px;
    border-bottom: 1px solid var(--c-border-light);
    cursor: pointer;
    transition: background var(--transition-fast);
    font-size: var(--fs-sm);
  }
  #notifPanel .notif-item:hover { background: var(--c-bg); }
  #notifPanel .notif-item.unread { background: var(--c-primary-light); }
  #notifPanel .notif-item .notif-dot {
    width: 8px; height: 8px; border-radius: 50%; background: var(--c-primary);
    flex-shrink: 0; margin-top: 5px;
  }
  #notifPanel .notif-item.read .notif-dot { background: transparent; }
  #notifPanel .notif-item .notif-body { flex: 1; min-width: 0; }
  #notifPanel .notif-item .notif-title { font-weight: 500; color: var(--c-text); }
  #notifPanel .notif-item .notif-msg { color: var(--c-text-secondary); font-size: 12px; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  #notifPanel .notif-item .notif-time { color: var(--c-text-muted); font-size: var(--fs-xs); margin-top: 2px; }

  /* === DS Card === */
  .ds-card { background: var(--c-surface); border-radius: var(--radius-lg); box-shadow: var(--shadow-md); padding: var(--space-xl); border: 1px solid var(--c-border-light); transition: box-shadow var(--transition-fast); }
  .ds-card:hover { box-shadow: var(--shadow-lg); }
  .ds-card-compact { padding: var(--space-lg); }
  .ds-card-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--space-lg); padding-bottom: var(--space-md); border-bottom: 1px solid var(--c-border-light); }
  .ds-card-title { font-size: var(--fs-lg); font-weight: 600; color: var(--c-text); }

  /* === DS Button === */
  .ds-btn {
    display: inline-flex; align-items: center; justify-content: center; gap: 6px;
    padding: 8px 16px; font-size: var(--fs-sm); font-weight: 500;
    border-radius: var(--radius-md); border: 1px solid transparent;
    cursor: pointer; transition: all var(--transition-fast); white-space: nowrap; min-height: 36px;
    font-family: inherit; line-height: 1.4;
  }
  .ds-btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .ds-btn-primary { background: var(--c-primary); color: #fff; border-color: var(--c-primary); }
  .ds-btn-primary:hover:not(:disabled) { background: var(--c-primary-hover); }
  .ds-btn-secondary { background: var(--c-surface); color: var(--c-text); border-color: var(--c-border); }
  .ds-btn-secondary:hover:not(:disabled) { background: var(--c-bg); }
  .ds-btn-danger { background: var(--c-danger); color: #fff; }
  .ds-btn-danger:hover:not(:disabled) { background: #b91c1c; }
  .ds-btn-ghost { background: transparent; color: var(--c-text-secondary); }
  .ds-btn-ghost:hover:not(:disabled) { background: var(--c-bg); color: var(--c-text); }
  .ds-btn-sm { padding: 4px 10px; font-size: var(--fs-xs); min-height: 28px; }
  .ds-btn-lg { padding: 10px 20px; font-size: var(--fs-base); min-height: 44px; }

  /* === DS Badge === */
  .ds-badge { display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; font-size: var(--fs-xs); font-weight: 600; border-radius: var(--radius-full); line-height: 1.4; }
  .ds-badge-blue { background: var(--c-info-light); color: var(--c-primary-dark); }
  .ds-badge-green { background: var(--c-success-light); color: #166534; }
  .ds-badge-yellow { background: var(--c-warning-light); color: #92400e; }
  .ds-badge-red { background: var(--c-danger-light); color: #991b1b; }
  .ds-badge-gray { background: var(--c-border-light); color: var(--c-text-secondary); }
  .ds-badge-purple { background: #f3e8ff; color: #6b21a8; }
  .ds-badge-orange { background: #fff7ed; color: #c2410c; }

  /* === DS Table === */
  .ds-table-wrap { overflow-x: auto; border-radius: var(--radius-lg); border: 1px solid var(--c-border-light); background: var(--c-surface); }
  .ds-table { width: 100%; border-collapse: collapse; font-size: var(--fs-sm); }
  .ds-table thead th {
    position: sticky; top: 0; z-index: 5;
    background: #f9fafb; padding: 10px 12px; font-size: var(--fs-xs); font-weight: 600;
    color: var(--c-text-secondary); text-align: left; border-bottom: 1px solid var(--c-border); white-space: nowrap;
  }
  .ds-table tbody td { padding: 10px 12px; border-bottom: 1px solid var(--c-border-light); vertical-align: middle; }
  .ds-table tbody tr { transition: background var(--transition-fast); }
  .ds-table tbody tr:hover { background: var(--c-bg); }
  .ds-table tbody tr:last-child td { border-bottom: none; }
  .ds-table-compact thead th { padding: 6px 8px; }
  .ds-table-compact tbody td { padding: 6px 8px; font-size: var(--fs-xs); }
  .ds-table-striped tbody tr:nth-child(even) { background: #f8fafc; }
  .ds-table-striped tbody tr:nth-child(even):hover { background: var(--c-bg); }

  /* === Utility: tabular-nums === */
  .tabular-nums { font-variant-numeric: tabular-nums; }

  /* === DS Input === */
  .ds-input {
    width: 100%; padding: 8px 12px; font-size: var(--fs-sm); font-family: inherit;
    border: 1px solid var(--c-border); border-radius: var(--radius-md);
    background: var(--c-surface); color: var(--c-text);
    transition: border-color var(--transition-fast), box-shadow var(--transition-fast); outline: none;
  }
  .ds-input:focus { border-color: #9ca3af; box-shadow: 0 0 0 3px rgba(156,163,175,0.15); }
  .ds-input::placeholder { color: var(--c-text-muted); }
  select.ds-input { appearance: auto; }
  .ds-label { display: block; font-size: var(--fs-xs); font-weight: 500; color: var(--c-text-secondary); margin-bottom: 4px; }

  /* === DS Modal === */
  .ds-modal-overlay {
    position: fixed; inset: 0; background: rgba(0,0,0,0.4); backdrop-filter: blur(2px);
    z-index: 50; display: flex; align-items: center; justify-content: center; padding: var(--space-lg);
    animation: ds-fadeIn 0.15s ease;
  }
  .ds-modal {
    background: var(--c-surface); border-radius: var(--radius-lg); box-shadow: var(--shadow-xl);
    width: 100%; max-width: 560px; max-height: 90vh; overflow-y: auto;
    animation: ds-slideUp 0.2s ease;
  }
  .ds-modal-wide { max-width: 800px; }
  .ds-modal-header { display: flex; align-items: center; justify-content: space-between; padding: var(--space-lg) var(--space-xl); border-bottom: 1px solid var(--c-border-light); }
  .ds-modal-header h3 { font-size: var(--fs-lg); font-weight: 600; margin: 0; }
  .ds-modal-body { padding: var(--space-xl); }
  .ds-modal-footer { display: flex; justify-content: flex-end; gap: var(--space-sm); padding: var(--space-lg) var(--space-xl); border-top: 1px solid var(--c-border-light); }

  /* === DS Chip (Filter) === */
  .ds-chip {
    display: inline-flex; align-items: center; gap: 4px;
    padding: 4px 12px; font-size: var(--fs-xs); font-weight: 500;
    border-radius: var(--radius-full); border: 1px solid var(--c-border);
    background: var(--c-surface); color: var(--c-text-secondary);
    cursor: pointer; transition: all var(--transition-fast);
  }
  .ds-chip:hover { border-color: var(--c-primary); color: var(--c-primary); }
  .ds-chip.active { background: var(--c-primary-light); border-color: var(--c-primary); color: var(--c-primary); }

  /* === DS Skeleton Loading === */
  .ds-skeleton { background: linear-gradient(90deg, #f1f5f9 25%, #e2e8f0 50%, #f1f5f9 75%); background-size: 200% 100%; animation: ds-shimmer 1.5s infinite; border-radius: var(--radius-sm); }
  .ds-skeleton-text { height: 14px; margin-bottom: 8px; width: 80%; }
  .ds-skeleton-title { height: 24px; margin-bottom: 12px; width: 60%; }
  .ds-skeleton-card { height: 80px; border-radius: var(--radius-lg); }
  .ds-skeleton-row { height: 44px; margin-bottom: 4px; }

  /* === DS Empty State === */
  .ds-empty { text-align: center; padding: 48px 24px; color: var(--c-text-muted); }
  .ds-empty i { font-size: 48px; margin-bottom: 16px; display: block; opacity: 0.4; }
  .ds-empty p { font-size: var(--fs-sm); }

  /* === DS Alert Banner === */
  .ds-alert { display: flex; align-items: center; gap: 12px; padding: 12px 16px; border-radius: var(--radius-md); font-size: var(--fs-sm); margin-bottom: var(--space-lg); }
  .ds-alert-warning { background: var(--c-warning-light); border: 1px solid var(--c-warning); color: #92400e; }
  .ds-alert-error { background: var(--c-danger-light); border: 1px solid var(--c-danger); color: #991b1b; }
  .ds-alert-info { background: var(--c-info-light); border: 1px solid var(--c-info); color: var(--c-primary-dark); }
  .ds-alert-success { background: var(--c-success-light); border: 1px solid var(--c-success); color: #166534; }

  /* === DS Animations === */
  @keyframes ds-shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
  @keyframes ds-fadeIn { from { opacity: 0; } to { opacity: 1; } }
  @keyframes ds-slideUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
  .page-body { animation: ds-fadeIn 0.15s ease; }
  /* FOUC 방지: 권한 체크 중에는 콘텐츠 숨김 (비-ADMIN). ADMIN/체크 완료 시 즉시 노출. */
  body.perm-checking .page-body { visibility: hidden; }

  /* === Dark Mode: Glasstop top-bar === */
  html.dark .top-bar { background: rgba(15,23,42,0.85); }

  /* === Dark Mode: Modal backdrop === */
  html.dark .bg-black.bg-opacity-50 { background-color: rgba(0,0,0,0.7) !important; }

  /* === Dark Mode: Tailwind utility overrides === */
  html.dark .bg-white { background-color: var(--c-surface) !important; }
  html.dark .bg-gray-50 { background-color: #1e293b !important; }
  html.dark .bg-gray-100 { background-color: #334155 !important; }
  html.dark .text-gray-900 { color: var(--c-text) !important; }
  html.dark .text-gray-800 { color: #e2e8f0 !important; }
  html.dark .text-gray-700 { color: #cbd5e1 !important; }
  html.dark .text-gray-600 { color: #94a3b8 !important; }
  html.dark .text-gray-500 { color: #64748b !important; }
  html.dark .text-gray-400 { color: #475569 !important; }
  html.dark .border-gray-200,
  html.dark .border-gray-100,
  html.dark .border-gray-300 { border-color: #334155 !important; }
  html.dark .border { border-color: #334155 !important; }
  html.dark input:not([type="checkbox"]):not([type="radio"]):not([type="range"]),
  html.dark select,
  html.dark textarea { background-color: #0f172a; color: var(--c-text); border-color: #475569; }
  html.dark .shadow-sm { box-shadow: var(--shadow-sm) !important; }
  html.dark .shadow { box-shadow: var(--shadow-md) !important; }
  html.dark .shadow-lg { box-shadow: var(--shadow-lg) !important; }
  html.dark .ds-table-striped tbody tr:nth-child(even) { background: #1a2332; }
  html.dark .ds-table-striped tbody tr:nth-child(even):hover { background: #1e293b; }
  html.dark .ds-table thead th { background: #162032; }
  html.dark .hover\\:bg-gray-50:hover { background-color: #1e293b !important; }
  html.dark .hover\\:bg-blue-50\\/30:hover { background-color: rgba(96,165,250,0.1) !important; }
</style>`

const SHARED_AUTH_JS = `
// === Dark Mode Initialization (FOUC prevention — runs immediately) ===
(function() {
  var theme = localStorage.getItem('theme');
  if (theme === 'dark' || (!theme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
    document.documentElement.classList.add('dark');
  }
})();

// Dark mode toggle function
window.toggleDarkMode = function() {
  var isDark = document.documentElement.classList.toggle('dark');
  localStorage.setItem('theme', isDark ? 'dark' : 'light');
  var icon = document.getElementById('darkModeIcon');
  if (icon) icon.className = isDark ? 'fas fa-sun text-amber-400' : 'fas fa-moon';
};

// Sync icon on initial load
(function() {
  var icon = document.getElementById('darkModeIcon');
  if (icon && document.documentElement.classList.contains('dark')) {
    icon.className = 'fas fa-sun text-amber-400';
  }
})();

// === Global ESC → close topmost modal ===
document.addEventListener('keydown', function(e) {
  if (e.key !== 'Escape') return;
  // fixed overlay 중 보이는 것만 수집
  var modals = Array.from(document.querySelectorAll('.fixed.inset-0')).filter(function(el) {
    if (el.classList.contains('hidden')) return false;
    if (el.style.display === 'none') return false;
    // 실제로 화면에 보이는지 확인
    var rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  });
  if (!modals.length) return;
  // z-index 높은 순 → 같으면 DOM 뒤쪽(나중에 열림)이 우선
  modals.sort(function(a, b) {
    var za = parseInt(getComputedStyle(a).zIndex) || 0;
    var zb = parseInt(getComputedStyle(b).zIndex) || 0;
    if (zb !== za) return zb - za;
    // 같은 z-index면 DOM 순서 (뒤가 위)
    var all = Array.from(document.querySelectorAll('.fixed.inset-0'));
    return all.indexOf(b) - all.indexOf(a);
  });
  var top = modals[0];
  e.preventDefault();
  e.stopImmediatePropagation();
  // hidden 토글 방식 모달 (id가 있고 원래 HTML에 존재)
  if (top.id && document.querySelector('#' + top.id + '.hidden') === null && top.parentElement === document.querySelector('.main-content')?.parentElement) {
    top.classList.add('hidden');
  } else if (top.id && !top.dataset.dynamic) {
    top.classList.add('hidden');
  } else {
    // createElement 방식 동적 모달
    top.remove();
  }
});

// === XSS Protection: Global HTML Escape Function ===
window.escapeHtml = function(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
};

// === Chart Color Constants (표준 차트 팔레트) ===
window.CHART_COLORS = ['#2563eb', '#16a34a', '#f59e0b', '#dc2626', '#9333ea', '#ec4899', '#06b6d4', '#84cc16'];
window.CHART_BG_CLASSES = ['bg-blue-600', 'bg-green-600', 'bg-amber-500', 'bg-red-600', 'bg-purple-600', 'bg-pink-500', 'bg-cyan-500', 'bg-lime-500'];

// === 금액/숫자 포맷 헬퍼 (전역) ===
// 시스템 전체 금액 표시·입력의 단일 진실 소스
// 자세한 정책: .claude/skills/mes-ui-consistency/SKILL.md §8.5
window.fmtMoney = function(n) {
  if (n === null || n === undefined || n === '') return '-';
  var v = parseInt(n, 10);
  return isNaN(v) ? '-' : v.toLocaleString('ko-KR');
};

window.parseMoney = function(str) {
  if (str === null || str === undefined) return null;
  var s = String(str).replace(/[^\\d-]/g, '');
  if (s === '' || s === '-') return null;
  var n = parseInt(s, 10);
  return isNaN(n) ? null : n;
};

// input 채우기용 금액 포맷 (빈값 → '', 유효값 → 콤마 포맷)
window.fmtMoneyInput = function(v) {
  if (v === null || v === undefined || v === '') return '';
  var n = Number(v);
  if (!isFinite(n)) return '';
  return n.toLocaleString('ko-KR');
};

// input에서 금액 읽기 (element ID → 숫자)
window.readMoney = function(id) {
  var el = document.getElementById(id);
  if (!el) return 0;
  return window.parseMoney(el.value) || 0;
};

// === 테이블 빈 상태 행 (전역) ===
window.emptyRow = function(colspan, msg, icon) {
  return '<tr><td colspan="' + colspan + '" class="text-center py-8 text-gray-400">'
    + (icon ? '<i class="fas ' + icon + ' text-2xl block mb-2"></i>' : '')
    + '<div class="text-sm">' + (msg || '데이터가 없습니다') + '</div></td></tr>';
};

// === API 에러 핸들러 (전역) ===
window.handleApiError = function(error, fallbackMsg) {
  var msg = fallbackMsg || '오류가 발생했습니다.';
  if (error && error.response && error.response.data) {
    msg = error.response.data.error || error.response.data.message || msg;
  }
  showToast(msg, 'error');
  console.error(msg, error);
};

// 단일 input에 자동 콤마 포맷 바인딩
window.attachMoneyInput = function(el) {
  if (!el || el.dataset.moneyBound) return;
  el.dataset.moneyBound = '1';
  el.setAttribute('inputmode', 'numeric');
  el.classList.add('text-right', 'tabular-nums');
  // 초기 값 포맷
  if (el.value !== '' && el.value != null) {
    var initN = window.parseMoney(el.value);
    el.value = initN == null ? '' : initN.toLocaleString('ko-KR');
  }
  el.addEventListener('input', function() {
    var n = window.parseMoney(el.value);
    el.value = n == null ? '' : n.toLocaleString('ko-KR');
  });
  el.addEventListener('blur', function() {
    var n = window.parseMoney(el.value);
    el.value = n == null ? '' : n.toLocaleString('ko-KR');
  });
};

// 폼 안의 모든 [data-money] input을 자동 바인딩
// NOTE: data-money-bound 속성은 attachMoneyInput 내부에서 세팅한다.
// 바깥에서 먼저 세팅하면 attachMoneyInput의 가드가 발동해 리스너가 붙지 않는 버그가 생긴다.
window.bindMoneyInputs = function(rootEl) {
  var root = rootEl || document;
  var nodes = root.querySelectorAll('input[data-money]:not([data-money-bound])');
  nodes.forEach(function(el) {
    window.attachMoneyInput(el);
  });
};

// 폼 제출 직전: data-money input 값을 정수로 정규화하여 객체에 반영
window.collectMoneyFields = function(formEl, dataObj) {
  formEl.querySelectorAll('input[data-money]').forEach(function(el) {
    if (el.name) dataObj[el.name] = window.parseMoney(el.value);
  });
};

// 페이지 로드 시 자동 1회 바인딩
document.addEventListener('DOMContentLoaded', function() { window.bindMoneyInputs(); });
// SPA 네비게이션 후에도 다시 바인딩되도록 — spaNavigate에서도 호출됨

// === 다음(카카오) 우편번호 검색 헬퍼 ===
// 사용법: openPostcodeSearch(function(result) { ... })
//   result = { postal: '12345', address: '서울시 강남구 ...' }
// 또는 input id를 직접 넘기는 방식:
//   openPostcodeSearch({ postalId: 'inputPostal', addressId: 'inputAddress', detailFocusId: 'inputDetail' })
window.openPostcodeSearch = function(arg) {
  if (typeof daum === 'undefined' || !daum.Postcode) {
    alert('우편번호 서비스를 불러오는 중입니다. 잠시 후 다시 시도해 주세요.');
    return;
  }
  new daum.Postcode({
    oncomplete: function(data) {
      // 도로명주소 우선, 없으면 지번주소
      var addr = data.roadAddress || data.jibunAddress || data.address || '';
      // 참고항목 (건물명 등) 추가
      var extra = '';
      if (data.bname && /[동|로|가]$/g.test(data.bname)) extra += data.bname;
      if (data.buildingName && data.apartment === 'Y') {
        extra += (extra ? ', ' : '') + data.buildingName;
      }
      if (extra) addr += ' (' + extra + ')';

      var result = { postal: data.zonecode, address: addr };
      if (typeof arg === 'function') {
        arg(result);
      } else if (arg && typeof arg === 'object') {
        var pEl = arg.postalId ? document.getElementById(arg.postalId) : null;
        var aEl = arg.addressId ? document.getElementById(arg.addressId) : null;
        if (pEl) pEl.value = result.postal;
        if (aEl) aEl.value = result.address;
        // 변경 이벤트 발생 (다른 리스너용)
        if (pEl) pEl.dispatchEvent(new Event('input', { bubbles: true }));
        if (aEl) aEl.dispatchEvent(new Event('input', { bubbles: true }));
        // 상세주소 입력칸으로 포커스 이동
        if (arg.detailFocusId) {
          var dEl = document.getElementById(arg.detailFocusId);
          if (dEl) setTimeout(function() { dEl.focus(); }, 100);
        }
      }
    },
    width: '100%',
    height: '100%',
  }).open({ popupTitle: '우편번호 검색', popupKey: 'postcodePopup' });
};

// === Auth Check ===
var __authExpiredShown = false;
var __redirecting = false;
function handleAuthExpired() {
    if (__authExpiredShown || __redirecting) return;
    __authExpiredShown = true;
    __redirecting = true;
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/login';
}

const token = localStorage.getItem('token');
if (!token) {
    handleAuthExpired();
    throw new Error('No auth token');
}
// 로컬 exp 빠른 체크
try {
    var __parts = token.split('.');
    if (__parts.length === 3) {
        var __payload = JSON.parse(atob(__parts[1]));
        if (__payload.exp && __payload.exp <= Math.floor(Date.now() / 1000)) {
            handleAuthExpired();
            throw new Error('Token expired');
        }
    }
} catch(e) {
    if (e.message === 'Token expired' || e.message === 'No auth token') throw e;
}

axios.defaults.headers.common['Authorization'] = 'Bearer ' + token;

// 로컬 체크 통과 → 페이지 즉시 로드. 서버 무효 시 첫 API 호출에서 401 인터셉터가 처리.

// === authFetch: fetch() wrapper with auto token ===
window.authFetch = function(url, options) {
    options = options || {};
    var t = localStorage.getItem('token');
    if (!t) { handleAuthExpired(); return Promise.reject(new Error('No token')); }
    options.headers = Object.assign({ 'Authorization': 'Bearer ' + t }, options.headers || {});
    return fetch(url, options).then(function(res) {
        if (res.status === 401 && window.location.pathname !== '/login') {
            handleAuthExpired();
            return Promise.reject(new Error('Unauthorized'));
        }
        return res;
    });
};

// === Mobile Sidebar ===
function toggleMobileSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('sidebarOverlay').classList.toggle('open');
}
function closeMobileSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebarOverlay').classList.remove('open');
}
// Close sidebar on nav link click (mobile)
document.querySelectorAll('.sidebar .nav-item').forEach(function(el) {
  el.addEventListener('click', function() {
    if (window.innerWidth <= 768) closeMobileSidebar();
  });
});

// === Sidebar Pin / Groups / Favorites ===
function toggleSidebarPin() {
  var sb = document.getElementById('sidebar');
  sb.classList.toggle('pinned');
  localStorage.setItem('sidebar-pinned', sb.classList.contains('pinned') ? '1' : '0');
}

function toggleSidebarGroup(gi) {
  var items = document.getElementById('groupItems' + gi);
  var header = items.previousElementSibling;
  if (!items || !header) return;
  var collapsed = items.classList.toggle('collapsed');
  if (collapsed) header.classList.add('collapsed');
  else header.classList.remove('collapsed');
  // Save state
  var state = {};
  try { state = JSON.parse(localStorage.getItem('sidebar-groups') || '{}'); } catch(e) {}
  state['g' + gi] = collapsed;
  localStorage.setItem('sidebar-groups', JSON.stringify(state));
}

function toggleFavorite(path) {
  var favs = [];
  try { favs = JSON.parse(localStorage.getItem('sidebar-favorites') || '[]'); } catch(e) {}
  var idx = favs.indexOf(path);
  if (idx >= 0) favs.splice(idx, 1);
  else favs.push(path);
  localStorage.setItem('sidebar-favorites', JSON.stringify(favs));
  renderFavorites();
  updateFavStars();
}

function renderFavorites() {
  var container = document.getElementById('sidebarFavorites');
  if (!container) return;
  var favs = [];
  try { favs = JSON.parse(localStorage.getItem('sidebar-favorites') || '[]'); } catch(e) {}
  if (favs.length === 0) { container.innerHTML = ''; return; }
  var html = '<div class="group-label" style="opacity:1;height:auto;font-size:9px;color:#eab308;padding:8px 18px 2px;"><i class="fas fa-star" style="margin-right:4px;"></i>즐겨찾기</div>';
  var allItems = document.querySelectorAll('.sidebar-nav .nav-item[data-path]');
  var itemMap = {};
  allItems.forEach(function(el) { itemMap[el.getAttribute('data-path')] = el; });
  favs.forEach(function(path) {
    var orig = itemMap[path];
    if (!orig || orig.style.display === 'none') return;
    var icon = orig.querySelector('i.fas');
    var label = orig.querySelector('.nav-label');
    if (!icon || !label) return;
    var isActive = window.location.pathname === path ? ' active' : '';
    html += '<a href="' + path + '" class="nav-item' + isActive + '" title="' + label.textContent + '"><i class="fas ' + icon.className.replace('fas ', '') + '"></i><span class="nav-label">' + label.textContent + '</span></a>';
  });
  container.innerHTML = html;
}

function updateFavStars() {
  var favs = [];
  try { favs = JSON.parse(localStorage.getItem('sidebar-favorites') || '[]'); } catch(e) {}
  document.querySelectorAll('.sidebar-nav .nav-item[data-path]').forEach(function(el) {
    var path = el.getAttribute('data-path');
    if (favs.indexOf(path) >= 0) el.classList.add('is-fav');
    else el.classList.remove('is-fav');
  });
}

function initSidebarState() {
  // Pin state
  if (localStorage.getItem('sidebar-pinned') === '1') {
    document.getElementById('sidebar').classList.add('pinned');
  }
  // Group collapse state
  try {
    var state = JSON.parse(localStorage.getItem('sidebar-groups') || '{}');
    Object.keys(state).forEach(function(key) {
      if (!state[key]) return;
      var gi = key.replace('g', '');
      var items = document.getElementById('groupItems' + gi);
      var header = items ? items.previousElementSibling : null;
      if (items) items.classList.add('collapsed');
      if (header) header.classList.add('collapsed');
    });
  } catch(e) {}
  // Favorites
  renderFavorites();
  updateFavStars();
}
initSidebarState();

// === Nav Badge Polling ===
async function pollNavBadges() {
  try {
    var res = await fetch('/api/notifications/nav-badges', {
      headers: { 'Authorization': 'Bearer ' + localStorage.getItem('token') }
    });
    var data = await res.json();
    if (!data.success) return;
    var badges = data.data || {};
    Object.keys(badges).forEach(function(id) {
      var el = document.getElementById(id);
      if (!el) return;
      var count = badges[id];
      if (count > 0) {
        el.textContent = count > 99 ? '99+' : String(count);
        el.classList.add('visible');
      } else {
        el.classList.remove('visible');
      }
    });
  } catch(e) {}
}
pollNavBadges();
setInterval(pollNavBadges, 60000); // 1분

// 401 interceptor — delegates to handleAuthExpired
axios.interceptors.response.use(
    response => response,
    error => {
        if (error.response && error.response.status === 401 && window.location.pathname !== '/login') {
            handleAuthExpired();
        }
        return Promise.reject(error);
    }
);

// User info + role filtering
const __userStr = localStorage.getItem('user');
let currentUserRole = null;
if (__userStr) {
    try {
        const __user = JSON.parse(__userStr);
        currentUserRole = __user.role;
        const __roleMap = { 'ADMIN': '관리자', 'MANAGER': '매니저', 'DESIGNER': '디자이너', 'OPERATOR': '작업자' };

        const sidebarUserName = document.getElementById('sidebarUserName');
        if (sidebarUserName) sidebarUserName.textContent = __user.name || __user.username || '-';

        const topBarUserName = document.getElementById('topBarUserName');
        if (topBarUserName) topBarUserName.textContent =
            (__user.name || __user.username || '-') + ' (' + (__roleMap[__user.role] || __user.role) + ')';

    } catch(e) { console.error('User parse error:', e); }
}

// ═══ Entity Switcher (법인 전환) ═══
var __currentEntityId = 1;
(function initEntitySwitcher() {
    try {
        var t = localStorage.getItem('token');
        if (t) {
            var parts = t.split('.');
            if (parts.length === 3) {
                var p = JSON.parse(atob(parts[1]));
                __currentEntityId = (p.entityId != null) ? p.entityId : 1;
            }
        }
    } catch(e) {}
    localStorage.setItem('entityId', String(__currentEntityId));

    var __et = localStorage.getItem('token');
    if (!__et) {
        var n = document.getElementById('entityName');
        if (n) n.textContent = '-';
        return;
    }
    fetch('/api/auth/entities', {
        headers: { 'Authorization': 'Bearer ' + __et }
    }).then(function(r) { return r.json(); }).then(function(data) {
        if (!data.success || !data.data || data.data.length === 0) {
            var n2 = document.getElementById('entityName');
            if (n2) n2.textContent = '-';
            return;
        }
        var entities = data.data;
        var nameEl = document.getElementById('entityName');
        var ddEl = document.getElementById('entityDropdown');
        var arrowEl = document.getElementById('entityArrow');

        var current = entities.find(function(e) { return e.id === __currentEntityId; });
        if (nameEl) nameEl.textContent = __currentEntityId === 0 ? '전체 (합산)' : (current ? current.short_name : (entities[0] ? entities[0].short_name : '-'));

        if (ddEl) {
            var html = '';
            entities.forEach(function(e) {
                var isActive = e.id === __currentEntityId;
                html += '<div onclick="switchEntity(' + e.id + ')" style="padding:8px 14px;font-size:12px;cursor:pointer;color:' + (isActive ? '#60a5fa' : '#cbd5e1') + ';font-weight:' + (isActive ? '600' : '400') + ';display:flex;align-items:center;gap:6px;" onmouseover="this.style.background=\\'#334155\\'" onmouseout="this.style.background=\\'transparent\\'">'
                    + (isActive ? '<i class="fas fa-check" style="font-size:10px;"></i>' : '<span style="width:10px;"></span>')
                    + escapeHtml(e.short_name)
                    + '</div>';
            });
            if (currentUserRole === 'ADMIN') {
                html += '<div style="border-top:1px solid #334155;margin:2px 0;"></div>';
                var allActive = __currentEntityId === 0;
                html += '<div onclick="switchEntity(0)" style="padding:8px 14px;font-size:12px;cursor:pointer;color:' + (allActive ? '#60a5fa' : '#94a3b8') + ';font-weight:' + (allActive ? '600' : '400') + ';display:flex;align-items:center;gap:6px;" onmouseover="this.style.background=\\'#334155\\'" onmouseout="this.style.background=\\'transparent\\'">'
                    + (allActive ? '<i class="fas fa-check" style="font-size:10px;"></i>' : '<span style="width:10px;"></span>')
                    + '전체 (합산)</div>';
            }
            ddEl.innerHTML = html;
        }

        // 일반 직원은 드롭다운 비활성
        var btn = document.getElementById('entitySwitcherBtn');
        if (btn && currentUserRole && !['ADMIN','MANAGER'].includes(currentUserRole)) {
            btn.style.cursor = 'default';
            if (arrowEl) arrowEl.style.display = 'none';
        }
    }).catch(function(err) {
        var nameEl = document.getElementById('entityName');
        if (nameEl) nameEl.textContent = '-';
    });
})();

window.toggleEntityDropdown = function() {
    if (currentUserRole && !['ADMIN','MANAGER'].includes(currentUserRole)) return;
    var dd = document.getElementById('entityDropdown');
    var arrow = document.getElementById('entityArrow');
    if (dd) {
        var show = dd.style.display === 'none';
        dd.style.display = show ? 'block' : 'none';
        if (arrow) arrow.style.transform = show ? 'rotate(180deg)' : '';
    }
};

window.switchEntity = function(entityId) {
    var dd = document.getElementById('entityDropdown');
    var arrow = document.getElementById('entityArrow');
    if (dd) dd.style.display = 'none';
    if (arrow) arrow.style.transform = '';
    if (entityId === __currentEntityId) return;

    axios.post('/api/auth/switch-entity', { entity_id: entityId })
        .then(function(res) {
            if (res.data.success) {
                localStorage.setItem('token', res.data.data.token);
                localStorage.setItem('entityId', String(entityId));
                axios.defaults.headers.common['Authorization'] = 'Bearer ' + res.data.data.token;
                window.location.reload();
            }
        })
        .catch(function(err) {
            showToast('법인 전환 실패: ' + (err.response && err.response.data && err.response.data.error || err.message), 'error');
        });
};

// 드롭다운 외부 클릭 시 닫기
document.addEventListener('click', function(e) {
    var wrap = document.getElementById('entitySwitcher');
    var dd = document.getElementById('entityDropdown');
    if (wrap && dd && !wrap.contains(e.target)) {
        dd.style.display = 'none';
        var arrow = document.getElementById('entityArrow');
        if (arrow) arrow.style.transform = '';
    }
});

// Filter sidebar by page permissions (DB-driven, via /api/permissions/me)
// ADMIN: 모두 표시. 그 외: API 로 받은 page_key 만 표시. 빈 그룹은 헤더도 숨김.
(function applyPagePermissions() {
    if (!currentUserRole) {
        document.body.classList.remove('perm-checking');
        return;
    }
    const navItems = document.querySelectorAll('.nav-item[data-page-key]');
    if (currentUserRole === 'ADMIN') {
        // ADMIN 은 모두 표시 (그룹 정리도 불필요) — FOUC 가드 즉시 해제
        document.body.classList.remove('perm-checking');
        return;
    }
    // FOUC 가드: 권한 fetch 완료 전까지 페이지 본문 숨김 (CSS body.perm-checking)
    document.body.classList.add('perm-checking');
    // 우선 사이드바 모두 숨김 → API 응답 후 허용된 것만 노출
    navItems.forEach(el => { el.style.display = 'none'; });
    const __token = localStorage.getItem('token') || sessionStorage.getItem('token') || '';
    fetch('/api/permissions/me', {
        headers: __token ? { 'Authorization': 'Bearer ' + __token } : {}
    }).then(r => r.json()).then(res => {
        if (!res || !res.success) return;
        const allowedSet = new Set((res.data && res.data.pages) || []);
        navItems.forEach(el => {
            const key = el.getAttribute('data-page-key');
            if (allowedSet.has(key)) el.style.display = '';
        });
        // 빈 그룹 헤더 숨김
        document.querySelectorAll('.group-items').forEach(group => {
            const items = Array.from(group.querySelectorAll('.nav-item[data-page-key]'));
            const anyVisible = items.some(el => el.style.display !== 'none');
            if (!anyVisible) {
                group.style.display = 'none';
                const header = group.previousElementSibling;
                if (header && header.classList.contains('group-header')) header.style.display = 'none';
                const sep = header && header.previousElementSibling;
                if (sep && sep.classList.contains('group-sep')) sep.style.display = 'none';
            }
        });
        // 현재 페이지가 허용 안 된 페이지면 차단 (비-SPA 초기 로드에서 서버는 통과시킴 → 클라이언트 가드)
        const currentPath = window.location.pathname;
        // 권한 마스터에 등록된 페이지인지 + 허용되지 않았는지
        const navItemForCurrent = document.querySelector('.nav-item[data-page-key="' + currentPath + '"]');
        const isManagedPage = !!navItemForCurrent;
        if (isManagedPage && !allowedSet.has(currentPath)) {
            // /no-permission 안내 페이지로 이동 — ?from 으로 차단된 경로 전달
            window.location.href = '/no-permission?from=' + encodeURIComponent(currentPath);
            return;
        }
        // 권한 0개 사용자가 사이드바를 모두 잃은 경우, /no-permission 으로 유도 (무한 루프 방지)
        if (allowedSet.size === 0 && currentPath !== '/no-permission' && currentPath !== '/login') {
            window.location.href = '/no-permission';
            return;
        }
        // 허용된 페이지면 본문 노출. 차단되어 redirect 예정이면 가드 유지 (300ms 후 setTimeout 으로 이동).
        if (!isManagedPage || allowedSet.has(currentPath)) {
            document.body.classList.remove('perm-checking');
        }
    }).catch(e => {
        console.error('permissions fetch error:', e);
        // 에러 시 일단 본문은 노출 (사용자 잠금 방지)
        document.body.classList.remove('perm-checking');
    });
})();

// Logout
document.getElementById('logoutBtn')?.addEventListener('click', async (e) => {
    e.preventDefault();
    if (confirm('로그아웃 하시겠습니까?')) {
        try { await axios.post('/api/auth/logout'); } catch(e) {}
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        sessionStorage.removeItem('token');
        window.location.href = '/login';
    }
});

// === Token Refresh ===
async function checkTokenRefresh() {
    var t = localStorage.getItem('token');
    if (!t) return;
    try {
        var parts = t.split('.');
        if (parts.length !== 3) return;
        var payload = JSON.parse(atob(parts[1]));
        var now = Math.floor(Date.now() / 1000);
        var timeLeft = payload.exp - now;

        if (timeLeft <= 0) {
            handleAuthExpired();
            return;
        }
        if (timeLeft < 7200) {
            var res = await fetch('/api/auth/refresh', {
                method: 'POST',
                headers: { 'Authorization': 'Bearer ' + t }
            });
            var data = await res.json();
            if (data.success && data.refreshed && data.data && data.data.token) {
                localStorage.setItem('token', data.data.token);
                axios.defaults.headers.common['Authorization'] = 'Bearer ' + data.data.token;
                console.log('[Auth] Token refreshed, new expiry:', new Date((Math.floor(Date.now()/1000) + 28800) * 1000).toLocaleTimeString());
            }
        }
    } catch(e) {
        console.warn('[Auth] Token refresh check failed:', e);
    }
}
checkTokenRefresh();
setInterval(checkTokenRefresh, 1800000); // 30분마다

// === 글로벌 더블클릭 방지 헬퍼 ===
// 사용법: safeSubmit(btn, async () => { await axios.post(...) })
async function safeSubmit(btn, asyncFn) {
    if (!btn || btn.disabled) return;
    btn.disabled = true;
    var origText = btn.textContent;
    btn.textContent = '처리중...';
    try {
        await asyncFn();
    } finally {
        btn.disabled = false;
        btn.textContent = origText;
    }
}

// === Toast utility ===
function showToast(message, type = 'info', duration = 3000) {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    toast.className = 'toast-item ' + type;
    toast.innerHTML = '<i class="fas ' +
        (type === 'success' ? 'fa-check-circle' : type === 'error' ? 'fa-exclamation-circle' : 'fa-info-circle') +
        ' mr-2"></i>' + message;
    container.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

// === Field Error utility ===
// 입력 검증 실패 시 toast + 필드 포커스 + 빨간 테두리 (blur/input/change 시 자동 해제)
// 사용: showFieldError('qtyInput', '수량을 입력하세요') 또는 showFieldError(element, msg)
function showFieldError(fieldOrId, message) {
    showToast(message, 'error');
    if (!fieldOrId) return;
    var el = typeof fieldOrId === 'string' ? document.getElementById(fieldOrId) : fieldOrId;
    if (!el) return;
    el.classList.add('field-error');
    try { el.focus(); } catch (e) {}
    var clear = function() {
        el.classList.remove('field-error');
        el.removeEventListener('blur', clear);
        el.removeEventListener('input', clear);
        el.removeEventListener('change', clear);
    };
    el.addEventListener('blur', clear);
    el.addEventListener('input', clear);
    el.addEventListener('change', clear);
}
window.showFieldError = showFieldError;
window.showToast = showToast;

// === Confirm Modal (confirm() 대체) ===
window.showConfirm = function(message, options) {
  options = options || {};
  var title = options.title || '확인';
  var confirmText = options.confirmText || '확인';
  var cancelText = options.cancelText || '취소';
  var danger = options.danger || false;

  return new Promise(function(resolve) {
    var overlay = document.createElement('div');
    overlay.className = 'ds-modal-overlay';
    overlay.style.zIndex = '9999';
    overlay.innerHTML =
      '<div class="ds-modal" style="max-width:420px">' +
        '<div class="ds-modal-header">' +
          '<h3 style="font-size:15px">' + title + '</h3>' +
        '</div>' +
        '<div class="ds-modal-body" style="padding:20px 24px">' +
          '<p style="font-size:14px;color:#374151;white-space:pre-line;margin:0">' + message + '</p>' +
        '</div>' +
        '<div class="ds-modal-footer">' +
          '<button class="ds-btn ds-btn-ghost" id="__confirmCancel">' + cancelText + '</button>' +
          '<button class="ds-btn ' + (danger ? 'ds-btn-danger' : 'ds-btn-primary') + '" id="__confirmOk">' + confirmText + '</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(overlay);

    function cleanup(result) {
      overlay.remove();
      resolve(result);
    }

    overlay.querySelector('#__confirmOk').addEventListener('click', function() { cleanup(true); });
    overlay.querySelector('#__confirmCancel').addEventListener('click', function() { cleanup(false); });
    overlay.addEventListener('click', function(e) { if (e.target === overlay) cleanup(false); });

    // ESC 키로 취소
    function escHandler(e) {
      if (e.key === 'Escape') { document.removeEventListener('keydown', escHandler); cleanup(false); }
    }
    document.addEventListener('keydown', escHandler);

    // 포커스 설정
    setTimeout(function() { overlay.querySelector('#__confirmOk').focus(); }, 50);
  });
};

// === Table Density Toggle ===
function toggleTableDensity(btn) {
  var wrap = btn.closest('.ds-card, .bg-white, [class*="rounded"]');
  if (!wrap) wrap = btn.parentElement;
  var table = wrap.querySelector('.ds-table') || wrap.parentElement.querySelector('.ds-table');
  if (!table) return;
  table.classList.toggle('ds-table-compact');
  var icon = btn.querySelector('i');
  if (icon) {
    if (table.classList.contains('ds-table-compact')) {
      icon.className = 'fas fa-th text-xs';
      btn.title = '기본 밀도';
    } else {
      icon.className = 'fas fa-th-list text-xs';
      btn.title = '컴팩트 밀도';
    }
  }
}

// === Loading Skeleton Helpers ===
function showTableSkeleton(containerId, rows) {
  rows = rows || 5;
  var el = document.getElementById(containerId);
  if (!el) return;
  var html = '';
  for (var i = 0; i < rows; i++) {
    html += '<div class="ds-skeleton ds-skeleton-row"></div>';
  }
  el.innerHTML = html;
}
function showCardSkeleton(containerId, count) {
  count = count || 4;
  var el = document.getElementById(containerId);
  if (!el) return;
  var html = '';
  for (var i = 0; i < count; i++) {
    html += '<div class="ds-skeleton ds-skeleton-card"></div>';
  }
  el.innerHTML = html;
}

// === Global Search ===
var _searchTimer = null;
function debounceGlobalSearch() {
  if (_searchTimer) clearTimeout(_searchTimer);
  _searchTimer = setTimeout(doGlobalSearch, 300);
}

async function doGlobalSearch() {
  var q = document.getElementById('globalSearchInput')?.value || '';
  var panel = document.getElementById('searchResults');
  if (q.length < 2) { panel.style.display = 'none'; return; }
  try {
    var res = await fetch('/api/search?q=' + encodeURIComponent(q), {
      headers: { 'Authorization': 'Bearer ' + localStorage.getItem('token') }
    });
    var data = await res.json();
    if (!data.success) return;
    var d = data.data;
    var html = '';
    var statusLabels = { CONFIRMED:'확정', PRINTING:'출력중', PRINT_DONE:'출력완료', SHIPPED:'출고완료', HOLD:'보류' };
    if (d.orders.length > 0) {
      html += '<div style="padding:8px 12px;font-size:11px;color:#64748b;font-weight:600;border-bottom:1px solid #f1f5f9;">주문</div>';
      html += d.orders.map(function(o) {
        return '<a href="/orders" style="display:flex;justify-content:space-between;padding:8px 12px;text-decoration:none;color:#1e293b;font-size:13px;border-bottom:1px solid #f8fafc;cursor:pointer;" onmouseover="this.style.background=\\'#f8fafc\\'" onmouseout="this.style.background=\\'\\'">'
          + '<div><span style="font-weight:500;">' + o.order_number + '</span> <span style="color:#64748b;font-size:12px;">' + (o.client_name || '') + '</span></div>'
          + '<span style="font-size:11px;color:#94a3b8;">' + (statusLabels[o.status] || o.status) + '</span></a>';
      }).join('');
    }
    if (d.clients.length > 0) {
      html += '<div style="padding:8px 12px;font-size:11px;color:#64748b;font-weight:600;border-bottom:1px solid #f1f5f9;">거래처</div>';
      html += d.clients.map(function(c) {
        return '<a href="/clients/' + c.id + '" style="display:flex;justify-content:space-between;padding:8px 12px;text-decoration:none;color:#1e293b;font-size:13px;border-bottom:1px solid #f8fafc;cursor:pointer;" onmouseover="this.style.background=\\'#f8fafc\\'" onmouseout="this.style.background=\\'\\'">'
          + '<span style="font-weight:500;">' + c.client_name + '</span>'
          + (c.balance > 0 ? '<span style="font-size:12px;color:#ef4444;">' + Number(c.balance).toLocaleString() + '원</span>' : '')
          + '</a>';
      }).join('');
    }
    if (d.cards.length > 0) {
      html += '<div style="padding:8px 12px;font-size:11px;color:#64748b;font-weight:600;border-bottom:1px solid #f1f5f9;">카드</div>';
      html += d.cards.map(function(ca) {
        return '<a href="/cards" style="display:flex;justify-content:space-between;padding:8px 12px;text-decoration:none;color:#1e293b;font-size:13px;border-bottom:1px solid #f8fafc;cursor:pointer;" onmouseover="this.style.background=\\'#f8fafc\\'" onmouseout="this.style.background=\\'\\'">'
          + '<span style="font-weight:500;">' + (ca.card_number || 'Card #' + ca.id) + '</span>'
          + '<span style="font-size:11px;color:#94a3b8;">' + (statusLabels[ca.status] || ca.status) + '</span></a>';
      }).join('');
    }
    if (!html) html = '<div style="text-align:center;color:#9ca3af;padding:16px;font-size:13px;">검색 결과 없음</div>';
    panel.innerHTML = html;
    panel.style.display = 'block';
  } catch(e) { console.error('Search error:', e); }
}

function closeSearchResults() {
  document.getElementById('searchResults').style.display = 'none';
  document.getElementById('globalSearchInput').value = '';
}

document.addEventListener('click', function(e) {
  if (!e.target.closest('#globalSearchWrap')) {
    var sr = document.getElementById('searchResults');
    if (sr) sr.style.display = 'none';
  }
});

// === Notification System ===
var _notifOpen = false;

function toggleNotifPanel() {
  _notifOpen = !_notifOpen;
  document.getElementById('notifPanel').style.display = _notifOpen ? 'block' : 'none';
  if (_notifOpen) loadNotifications();
}

// Close panel on outside click
document.addEventListener('click', function(e) {
  if (_notifOpen && !e.target.closest('#notifWrap')) {
    _notifOpen = false;
    document.getElementById('notifPanel').style.display = 'none';
  }
});

async function loadNotifications() {
  try {
    var res = await fetch('/api/notifications?limit=20', {
      headers: { 'Authorization': 'Bearer ' + localStorage.getItem('token') }
    });
    var data = await res.json();
    if (!data.success) return;
    updateNotifBadge(data.unread_count);
    var list = document.getElementById('notifList');
    if (!data.data || data.data.length === 0) {
      list.innerHTML = '<div style="text-align:center;color:#9ca3af;padding:24px;font-size:13px;">알림이 없습니다.</div>';
      return;
    }
    list.innerHTML = data.data.map(function(n) {
      var cls = n.is_read ? 'notif-item read' : 'notif-item unread';
      var ago = timeAgo(n.created_at);
      return '<div class="' + cls + '" onclick="clickNotif(' + n.id + ', ' + JSON.stringify(n.link || '').replace(/"/g, '&quot;') + ')">'
        + '<div class="notif-dot"></div>'
        + '<div class="notif-body">'
        + '<div class="notif-title">' + escHtml(n.title) + '</div>'
        + (n.message ? '<div class="notif-msg">' + escHtml(n.message) + '</div>' : '')
        + '<div class="notif-time">' + ago + '</div>'
        + '</div></div>';
    }).join('');
  } catch(e) { console.error('Load notifications error:', e); }
}

function escHtml(s) {
  return window.escapeHtml(s);
}

async function clickNotif(id, link) {
  try {
    await fetch('/api/notifications/' + id + '/read', {
      method: 'PATCH',
      headers: { 'Authorization': 'Bearer ' + localStorage.getItem('token') }
    });
  } catch(e) {}
  _notifOpen = false;
  document.getElementById('notifPanel').style.display = 'none';
  if (link) window.location.href = link;
  else pollNotifCount();
}

async function markAllNotifRead() {
  try {
    await fetch('/api/notifications/read-all', {
      method: 'PATCH',
      headers: { 'Authorization': 'Bearer ' + localStorage.getItem('token') }
    });
    updateNotifBadge(0);
    loadNotifications();
  } catch(e) {}
}

function updateNotifBadge(count) {
  var badge = document.getElementById('notifBadge');
  if (!badge) return;
  if (count > 0) {
    badge.style.display = '';
    badge.textContent = count > 99 ? '99+' : String(count);
  } else {
    badge.style.display = 'none';
  }
}

function timeAgo(dateStr) {
  if (!dateStr) return '';
  var now = new Date();
  var d = new Date(dateStr);
  var diff = Math.floor((now - d) / 1000);
  if (diff < 60) return '방금 전';
  if (diff < 3600) return Math.floor(diff / 60) + '분 전';
  if (diff < 86400) return Math.floor(diff / 3600) + '시간 전';
  if (diff < 604800) return Math.floor(diff / 86400) + '일 전';
  return d.toLocaleDateString('ko-KR');
}

async function pollNotifCount() {
  try {
    var res = await fetch('/api/notifications/unread-count', {
      headers: { 'Authorization': 'Bearer ' + localStorage.getItem('token') }
    });
    var data = await res.json();
    if (data.success) updateNotifBadge(data.count);
  } catch(e) {}
}

// Generate scheduled alerts then poll count
async function generateAndPoll() {
  try {
    await fetch('/api/notifications/generate', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + localStorage.getItem('token') }
    });
  } catch(e) {}
  pollNotifCount();
}

// Initial generate + poll, then every 5 minutes for count, every 10 minutes for generate
// (기존 60초/300초에서 변경 — 45명 동시접속 시 D1 부하 80% 감소)
generateAndPoll();
setInterval(pollNotifCount, 300000);
setInterval(generateAndPoll, 600000);

// === Command Palette (Ctrl+K) ===
var _cmdActive = -1;
var _cmdItems = [];

function openCmdPalette() {
  var el = document.getElementById('cmdPalette');
  el.style.display = 'flex';
  var inp = document.getElementById('cmdInput');
  inp.value = '';
  inp.focus();
  buildCmdResults('');
}

function closeCmdPalette() {
  document.getElementById('cmdPalette').style.display = 'none';
  _cmdActive = -1;
}

function buildCmdResults(query) {
  var results = document.getElementById('cmdResults');
  var html = '';
  _cmdItems = [];
  var q = (query || '').toLowerCase().trim();

  // Collect all nav items visible to current user
  var allLinks = document.querySelectorAll('.sidebar-nav .nav-item[data-path]');
  var pages = [];
  allLinks.forEach(function(el) {
    if (el.style.display === 'none') return;
    var label = el.querySelector('.nav-label');
    var icon = el.querySelector('i.fas');
    if (!label) return;
    pages.push({
      path: el.getAttribute('data-path'),
      label: label.textContent,
      icon: icon ? icon.className.replace('fas ', '') : 'fa-circle'
    });
  });

  // Recent pages
  var recent = [];
  try { recent = JSON.parse(localStorage.getItem('recent-pages') || '[]'); } catch(e) {}

  if (!q) {
    // Show recent + all
    if (recent.length > 0) {
      html += '<div class="ds-cmd-group">최근 방문</div>';
      recent.slice(0, 5).forEach(function(path) {
        var pg = pages.find(function(p) { return p.path === path; });
        if (pg) {
          html += '<div class="ds-cmd-item" data-path="' + pg.path + '" onclick="cmdNavigate(\\'' + pg.path + '\\')"><i class="fas ' + pg.icon + '"></i>' + pg.label + '</div>';
          _cmdItems.push(pg.path);
        }
      });
    }
    html += '<div class="ds-cmd-group">전체 메뉴</div>';
    pages.forEach(function(pg) {
      html += '<div class="ds-cmd-item" data-path="' + pg.path + '" onclick="cmdNavigate(\\'' + pg.path + '\\')"><i class="fas ' + pg.icon + '"></i>' + pg.label + '</div>';
      _cmdItems.push(pg.path);
    });
  } else {
    // Filter
    var matched = pages.filter(function(pg) { return pg.label.toLowerCase().indexOf(q) >= 0 || pg.path.toLowerCase().indexOf(q) >= 0; });
    if (matched.length === 0) {
      html = '<div style="text-align:center;padding:24px;color:var(--c-text-muted);font-size:13px;">결과 없음</div>';
    } else {
      matched.forEach(function(pg) {
        html += '<div class="ds-cmd-item" data-path="' + pg.path + '" onclick="cmdNavigate(\\'' + pg.path + '\\')"><i class="fas ' + pg.icon + '"></i>' + pg.label + '</div>';
        _cmdItems.push(pg.path);
      });
    }
  }
  results.innerHTML = html;
  _cmdActive = -1;
}

function filterCmdResults() {
  var q = document.getElementById('cmdInput').value;
  buildCmdResults(q);
}

function cmdKeyHandler(e) {
  var items = document.querySelectorAll('#cmdResults .ds-cmd-item');
  if (e.key === 'Escape') { closeCmdPalette(); return; }
  if (e.key === 'ArrowDown') { e.preventDefault(); _cmdActive = Math.min(_cmdActive + 1, items.length - 1); highlightCmd(items); }
  if (e.key === 'ArrowUp') { e.preventDefault(); _cmdActive = Math.max(_cmdActive - 1, 0); highlightCmd(items); }
  if (e.key === 'Enter' && _cmdActive >= 0 && _cmdActive < _cmdItems.length) {
    e.preventDefault();
    cmdNavigate(_cmdItems[_cmdActive]);
  }
}

function highlightCmd(items) {
  items.forEach(function(el, i) {
    if (i === _cmdActive) { el.classList.add('active'); el.scrollIntoView({ block: 'nearest' }); }
    else el.classList.remove('active');
  });
}

function cmdNavigate(path) {
  closeCmdPalette();
  // Track recent
  var recent = [];
  try { recent = JSON.parse(localStorage.getItem('recent-pages') || '[]'); } catch(e) {}
  recent = recent.filter(function(p) { return p !== path; });
  recent.unshift(path);
  if (recent.length > 10) recent = recent.slice(0, 10);
  localStorage.setItem('recent-pages', JSON.stringify(recent));
  // Navigate (use SPA if available)
  if (typeof spaNavigate === 'function') {
    // SPA navigate is inside IIFE, so we click the sidebar link instead
  }
  window.location.href = path;
}

// Keyboard shortcut
document.addEventListener('keydown', function(e) {
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault();
    var el = document.getElementById('cmdPalette');
    if (el.style.display === 'none' || !el.style.display) openCmdPalette();
    else closeCmdPalette();
  }
});

// Track page visits for "recent"
(function() {
  var path = window.location.pathname;
  if (path === '/login') return;
  var recent = [];
  try { recent = JSON.parse(localStorage.getItem('recent-pages') || '[]'); } catch(e) {}
  recent = recent.filter(function(p) { return p !== path; });
  recent.unshift(path);
  if (recent.length > 10) recent = recent.slice(0, 10);
  localStorage.setItem('recent-pages', JSON.stringify(recent));
})();

// === Skeleton Loading Helpers ===
window.dsSkeleton = {
  cards: function(count, cols) {
    cols = cols || 4;
    var html = '<div class="grid grid-cols-' + cols + ' gap-4">';
    for (var i = 0; i < count; i++) html += '<div class="ds-card"><div class="ds-skeleton ds-skeleton-title" style="width:40%;"></div><div class="ds-skeleton ds-skeleton-text" style="width:70%;"></div></div>';
    return html + '</div>';
  },
  table: function(rows, cols) {
    rows = rows || 5; cols = cols || 5;
    var html = '<div class="ds-table-wrap"><table class="ds-table"><thead><tr>';
    for (var c = 0; c < cols; c++) html += '<th><div class="ds-skeleton" style="height:12px;width:' + (50 + Math.random()*40) + 'px;"></div></th>';
    html += '</tr></thead><tbody>';
    for (var r = 0; r < rows; r++) {
      html += '<tr>';
      for (var c = 0; c < cols; c++) html += '<td><div class="ds-skeleton ds-skeleton-text" style="width:' + (50 + Math.random()*50) + '%;"></div></td>';
      html += '</tr>';
    }
    return html + '</tbody></table></div>';
  },
  stat: function(count) {
    count = count || 4;
    var html = '<div class="grid grid-cols-' + count + ' gap-4">';
    for (var i = 0; i < count; i++) html += '<div class="ds-card" style="text-align:center;"><div class="ds-skeleton ds-skeleton-text" style="width:50%;margin:0 auto 8px;"></div><div class="ds-skeleton ds-skeleton-title" style="width:40%;margin:0 auto;"></div></div>';
    return html + '</div>';
  }
};

// === SPA Navigation (Hybrid) ===
// Intercept sidebar link clicks → fetch page → swap content only
(function() {
    let _spaTimers = []; // track setInterval IDs for cleanup
    const _origSetInterval = window.setInterval;
    window.setInterval = function() {
        const id = _origSetInterval.apply(window, arguments);
        _spaTimers.push(id);
        return id;
    };

    function spaCleanup() {
        // Clear all intervals registered by page scripts
        _spaTimers.forEach(id => clearInterval(id));
        _spaTimers = [];
        // Remove dynamic toast container
        const tc = document.getElementById('toast-container');
        if (tc) tc.innerHTML = '';
    }

    async function spaNavigate(url, pushState = true) {
        try {
            const topTitle = document.querySelector('.top-bar-title');
            if (topTitle) topTitle.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>로딩 중...';

            var __t = localStorage.getItem('token');
            const resp = await fetch(url, {
                headers: {
                    'X-SPA-Request': '1',
                    'Authorization': __t ? ('Bearer ' + __t) : ''
                }
            });
            if (!resp.ok) {
                if (resp.status === 401) { handleAuthExpired(); return; }
                window.location.href = url;
                return;
            }

            // Cleanup old page
            spaCleanup();
            const oldPageCSS = document.getElementById('page-css');
            if (oldPageCSS) oldPageCSS.remove();
            const oldPageScript = document.getElementById('page-script');
            if (oldPageScript) oldPageScript.remove();

            const contentType = resp.headers.get('Content-Type') || '';

            if (contentType.includes('application/json')) {
                // Fast path: JSON response from renderPage()
                const data = await resp.json();

                const pageBody = document.querySelector('.page-body');
                if (pageBody) pageBody.innerHTML = data.pageContent;

                if (topTitle) topTitle.textContent = data.title;
                document.title = data.title + ' - ERP+MES';

                if (data.pageCSS) {
                    const style = document.createElement('style');
                    style.id = 'page-css';
                    style.textContent = data.pageCSS;
                    document.head.appendChild(style);
                }

                if (data.pageScript) {
                    const s = document.createElement('script');
                    s.id = 'page-script';
                    s.textContent = data.pageScript;
                    document.body.appendChild(s);
                }
            } else {
                // Non-JSON response — clean full navigation instead of fragile HTML parsing
                console.warn('[SPA] Non-JSON response for', url, '- falling back to full navigation');
                window.location.href = url;
                return;
            }

            // Update active sidebar item
            document.querySelectorAll('.nav-item').forEach(el => {
                el.classList.remove('active');
                if (el.getAttribute('href') === url) el.classList.add('active');
            });

            // SPA 페이지 전환 후 금액 input 자동 바인딩
            if (typeof window.bindMoneyInputs === 'function') {
                try { window.bindMoneyInputs(); } catch(e) {}
            }

            if (pushState) {
                history.pushState({ spaUrl: url }, '', url);
            }

            document.querySelector('.main-content')?.scrollTo(0, 0);

        } catch (err) {
            console.error('[SPA] Navigation failed:', err);
            window.location.href = url;
        }
    }

    // Intercept sidebar navigation clicks
    document.addEventListener('click', function(e) {
        const link = e.target.closest('.sidebar .nav-item[href]');
        if (!link) return;
        const href = link.getAttribute('href');
        if (!href || href === '#' || href.startsWith('http')) return;
        e.preventDefault();
        spaNavigate(href);
    });

    // Handle browser back/forward
    window.addEventListener('popstate', function(e) {
        if (e.state && e.state.spaUrl) {
            spaNavigate(e.state.spaUrl, false);
        }
    });

    // Set initial state
    history.replaceState({ spaUrl: window.location.pathname + window.location.search }, '', window.location.pathname + window.location.search);
})();

// ===================================================
// === 통합 메시지 발송 모달 (전역) ===
// ===================================================
var _msgChannel = 'kakao';
var _msgContext = {};
var _msgTemplates = [];
var _msgQuill = null;

window.openSendMessage = function(opts) {
  opts = opts || {};
  _msgContext = opts.context || {};
  var receiver = opts.receiver || {};

  // 수신자 정보 채우기
  document.getElementById('msgRecvName').value = receiver.name || '';
  document.getElementById('msgRecvAddr').value = receiver.phone || receiver.email || receiver.fax || '';
  _msgContext._receiver = receiver;
  _msgContext._templateVars = opts.templateVars || {};

  // 기본 채널 설정
  setMsgChannel(opts.defaultChannel || 'kakao');

  // 수신자 연락처에 따라 가용 채널 표시 (카카오톡/SMS는 항상 활성 — 번호 직접 입력 가능)
  var btnKakao = document.getElementById('msgChKakao');
  var btnSms   = document.getElementById('msgChSms');
  var btnEmail = document.getElementById('msgChEmail');
  var btnFax   = document.getElementById('msgChFax');
  if (btnKakao) btnKakao.disabled = false;
  if (btnSms)   btnSms.disabled   = false;
  if (btnEmail) btnEmail.disabled = !receiver.email;
  if (btnFax)   btnFax.disabled   = !receiver.fax;

  // 비활성 채널 스타일
  ['Kakao','Sms','Email','Fax'].forEach(function(ch) {
    var btn = document.getElementById('msgCh' + ch);
    if (!btn) return;
    if (btn.disabled) btn.classList.add('opacity-40');
    else btn.classList.remove('opacity-40');
  });

  // 채널에 따라 적절한 수신 주소 자동 설정
  updateMsgRecvAddr(receiver);

  // 기본 내용
  document.getElementById('msgBody').value = opts.defaultContent || '';
  document.getElementById('msgSubject').value = opts.defaultSubject || '';

  // 카카오톡 템플릿 로드
  var _autoTpl = opts.autoTemplate || '';
  function applyAutoTemplate() {
    if (!_autoTpl) return;
    var sel = document.getElementById('msgTemplate');
    if (sel) { sel.value = _autoTpl; onMsgTemplateChange(); }
  }
  if (_msgTemplates.length === 0) {
    axios.get('/api/kakao/templates').then(function(res) {
      if (res.data.success) {
        _msgTemplates = (res.data.data || []).filter(function(t) { return t.state === 'S' || t.state === '3'; });
        fillMsgTemplates();
        applyAutoTemplate();
      }
    }).catch(function(){});
  } else {
    fillMsgTemplates();
    applyAutoTemplate();
  }

  document.getElementById('msgSendStatus').textContent = '';
  document.getElementById('msgSendStatus').className = 'text-xs text-gray-400';
  document.getElementById('msgSendBtn').disabled = false;
  var modal = document.getElementById('msgSendModal');
  modal.classList.remove('hidden');
  modal.onclick = function(e) {
    if (e.target === this) closeMsgSendModal();
  };
  // 미리보기 초기화
  if (typeof updateMsgPreview === 'function') updateMsgPreview();
};

function closeMsgSendModal() {
  document.getElementById('msgSendModal').classList.add('hidden');
}

function setMsgChannel(ch) {
  _msgChannel = ch;
  var channelKeys = {kakao:'Kakao', sms:'Sms', email:'Email', fax:'Fax'};
  var colors      = {kakao:'blue',  sms:'green', email:'purple', fax:'gray'};

  Object.keys(channelKeys).forEach(function(c) {
    var btn = document.getElementById('msgCh' + channelKeys[c]);
    if (!btn) return;
    var disabledCls = btn.disabled ? ' opacity-40' : '';
    var pillColors = {kakao:'bg-blue-50 border-2 border-blue-500 text-blue-700', sms:'bg-green-50 border-2 border-green-500 text-green-700', email:'bg-purple-50 border-2 border-purple-500 text-purple-700', fax:'bg-gray-100 border-2 border-gray-400 text-gray-700'};
    if (c === ch) {
      btn.className = 'px-3 py-1.5 rounded-full text-xs font-medium ' + pillColors[c] + disabledCls;
    } else {
      btn.className = 'px-3 py-1.5 rounded-full text-xs font-medium bg-white border border-gray-300 text-gray-600' + disabledCls;
    }
  });

  // 채널별 폼 전환
  var kakaoArea   = document.getElementById('msgKakaoArea');
  var subjectArea = document.getElementById('msgSubjectArea');
  var subjectHint = document.getElementById('msgSubjectHint');
  var recvLabel   = document.getElementById('msgRecvLabel');
  var byteCounter = document.getElementById('msgByteCounter');
  var channelInfo = document.getElementById('msgChannelInfo');
  var sendBtn     = document.getElementById('msgSendBtn');
  var recvAddr    = document.getElementById('msgRecvAddr');

  if (ch === 'kakao') {
    kakaoArea.classList.remove('hidden');
    subjectArea.classList.add('hidden');
    byteCounter.classList.add('hidden');
    recvLabel.textContent = '수신번호';
    recvAddr.placeholder  = '010-0000-0000';
    channelInfo.textContent = '카카오톡';
    channelInfo.className = 'text-xs text-blue-600 font-medium';
    sendBtn.className = 'px-5 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700';
  } else if (ch === 'sms') {
    kakaoArea.classList.add('hidden');
    subjectArea.classList.remove('hidden');
    if (subjectHint) subjectHint.textContent = '(입력 시 LMS 전환)';
    byteCounter.classList.remove('hidden');
    recvLabel.textContent = '수신번호';
    recvAddr.placeholder  = '010-0000-0000';
    channelInfo.textContent = 'SMS';
    channelInfo.className = 'text-xs text-green-600 font-medium';
    sendBtn.className = 'px-5 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700';
    updateMsgByteCounter();
  } else if (ch === 'email') {
    kakaoArea.classList.add('hidden');
    subjectArea.classList.remove('hidden');
    if (subjectHint) subjectHint.textContent = '';
    byteCounter.classList.add('hidden');
    recvLabel.textContent = '수신 이메일';
    recvAddr.placeholder  = 'email@example.com';
    channelInfo.textContent = '이메일';
    channelInfo.className = 'text-xs text-purple-600 font-medium';
    sendBtn.className = 'px-5 py-2 bg-purple-600 text-white rounded-lg text-sm hover:bg-purple-700';
    // Quill 에디터 활성화
    initMsgQuill();
  } else if (ch === 'fax') {
    kakaoArea.classList.add('hidden');
    subjectArea.classList.remove('hidden');
    if (subjectHint) subjectHint.textContent = '';
    byteCounter.classList.add('hidden');
    recvLabel.textContent = '수신 팩스번호';
    recvAddr.placeholder  = '042-000-0000';
    channelInfo.textContent = '팩스 (준비 중)';
    channelInfo.className = 'text-xs text-gray-500 font-medium';
    sendBtn.className = 'px-5 py-2 bg-gray-400 text-white rounded-lg text-sm cursor-not-allowed';
  }

  // 수신 주소 자동 전환
  if (_msgContext._receiver) updateMsgRecvAddr(_msgContext._receiver);

  // textarea ↔ Quill 에디터 전환
  var textAreaWrap = document.getElementById('msgBodyTextArea');
  var editorWrap = document.getElementById('msgBodyEditorArea');
  if (ch === 'email') {
    if (textAreaWrap) textAreaWrap.classList.add('hidden');
    if (editorWrap) editorWrap.classList.remove('hidden');
  } else {
    if (textAreaWrap) textAreaWrap.classList.remove('hidden');
    if (editorWrap) editorWrap.classList.add('hidden');
  }

  // 포털 링크: client_id가 있을 때만 표시
  var portalArea = document.getElementById('msgPortalLinkArea');
  if (portalArea) {
    portalArea.classList.toggle('hidden', !_msgContext || !_msgContext.client_id);
  }

  // 예약 발송: 카카오톡/SMS만 지원
  var scheduleArea = document.getElementById('msgScheduleArea');
  if (scheduleArea) {
    scheduleArea.classList.toggle('hidden', ch !== 'kakao' && ch !== 'sms');
  }

  // 미리보기 전환
  ['Kakao','Sms','Email','Fax'].forEach(function(name) {
    var preview = document.getElementById('msgPreview' + name);
    if (preview) preview.classList.toggle('hidden', name.toLowerCase() !== ch);
  });
  updateMsgPreview();
}

function updateMsgRecvAddr(receiver) {
  if (!receiver) return;
  _msgContext._receiver = receiver;
  var addr = document.getElementById('msgRecvAddr');
  if (!addr) return;
  if (_msgChannel === 'kakao' || _msgChannel === 'sms') addr.value = receiver.phone || '';
  else if (_msgChannel === 'email') addr.value = receiver.email || '';
  else if (_msgChannel === 'fax')   addr.value = receiver.fax   || '';
}

function fillMsgTemplates() {
  var sel = document.getElementById('msgTemplate');
  if (!sel) return;
  sel.innerHTML = '<option value="">직접 작성</option>' + _msgTemplates.map(function(t) {
    return '<option value="' + (t.templateCode || '') + '">' + (t.templateName || t.templateCode || '') + '</option>';
  }).join('');
}

function onMsgTemplateChange() {
  var code = document.getElementById('msgTemplate').value;
  if (!code) return;
  var tpl = _msgTemplates.find(function(t) { return t.templateCode === code; });
  if (!tpl) return;
  var body = tpl.template || tpl.content || '';
  // 템플릿 변수 자동 치환 (openSendMessage에서 전달된 templateVars)
  var vars = _msgContext._templateVars || {};
  Object.keys(vars).forEach(function(key) {
    body = body.replace(new RegExp('#\\{' + key + '\\}', 'g'), vars[key] || '');
  });
  document.getElementById('msgBody').value = body;
}

function updateMsgByteCounter() {
  var bodyEl = document.getElementById('msgBody');
  var subjEl = document.getElementById('msgSubject');
  if (!bodyEl) return;
  var body  = bodyEl.value;
  var bytes = 0;
  for (var i = 0; i < body.length; i++) bytes += body.charCodeAt(i) > 127 ? 2 : 1;
  var subj  = subjEl ? subjEl.value.trim() : '';
  var isLms = bytes > 90 || subj.length > 0;
  var infoEl   = document.getElementById('msgChannelInfo');
  var counterEl = document.getElementById('msgByteCounter');
  if (infoEl)    infoEl.textContent    = isLms ? 'LMS' : 'SMS';
  if (counterEl) counterEl.textContent = bytes + ' / ' + (isLms ? '2000' : '90') + ' byte';
}

function initMsgQuill() {
  if (_msgQuill) return;
  if (typeof Quill === 'undefined') return;
  _msgQuill = new Quill('#msgQuillEditor', {
    theme: 'snow',
    placeholder: '이메일 내용을 작성하세요...',
    modules: {
      toolbar: [
        [{ 'header': [1, 2, 3, false] }],
        ['bold', 'italic', 'underline', 'strike'],
        [{ 'color': [] }, { 'background': [] }],
        [{ 'list': 'ordered' }, { 'list': 'bullet' }],
        [{ 'align': [] }],
        ['link', 'image'],
        ['clean']
      ]
    }
  });
  _msgQuill.on('text-change', function() { updateMsgPreview(); });
}

function getMsgBody() {
  if (_msgChannel === 'email' && _msgQuill) {
    return _msgQuill.root.innerHTML;
  }
  return document.getElementById('msgBody').value.trim();
}

function toggleScheduleInput() {
  var checked = document.getElementById('msgScheduleToggle').checked;
  document.getElementById('msgScheduleInput').classList.toggle('hidden', !checked);
  if (checked) {
    // 기본값: 1시간 후
    var d = new Date(Date.now() + 3600000);
    d.setMinutes(Math.ceil(d.getMinutes() / 10) * 10, 0, 0);
    document.getElementById('msgScheduleAt').value = d.toISOString().slice(0, 16);
  }
}

function updateMsgPreview() {
  var textBody = document.getElementById('msgBody').value || '';
  var subject = document.getElementById('msgSubject') ? document.getElementById('msgSubject').value : '';

  // 카카오톡/SMS 미리보기 (평문)
  var displayText = textBody || '메시지 내용이 여기에 표시됩니다';
  var kakaoBody = document.getElementById('msgPreviewKakaoBody');
  if (kakaoBody) kakaoBody.textContent = displayText;
  var smsBody = document.getElementById('msgPreviewSmsBody');
  if (smsBody) smsBody.textContent = displayText;

  // 이메일 미리보기 (HTML)
  var emailSubj = document.getElementById('msgPreviewEmailSubject');
  var emailBody = document.getElementById('msgPreviewEmailBody');
  if (emailSubj) emailSubj.textContent = subject || '(제목 없음)';
  if (emailBody) {
    if (_msgChannel === 'email' && _msgQuill) {
      emailBody.innerHTML = _msgQuill.root.innerHTML;
    } else {
      emailBody.textContent = displayText;
    }
  }
}

async function execMsgSend() {
  var channel    = _msgChannel;
  var recvAddr   = document.getElementById('msgRecvAddr').value.trim();
  var recvName   = document.getElementById('msgRecvName').value.trim();
  var body       = getMsgBody();
  var subject    = document.getElementById('msgSubject').value.trim();
  var templateCode = document.getElementById('msgTemplate').value;

  if (!recvAddr) { if (window.showToast) showToast('수신 주소를 입력해주세요', 'warning'); return; }
  if (!body && channel !== 'fax') { if (window.showToast) showToast('내용을 입력해주세요', 'warning'); return; }
  if (channel === 'kakao' && !templateCode) { if (window.showToast) showToast('카카오톡은 템플릿을 선택해주세요', 'warning'); return; }
  if (channel === 'fax') { if (window.showToast) showToast('팩스는 명세서/견적서 페이지에서 발송해주세요', 'warning'); return; }

  // 이메일 평문일 경우 줄바꿈 → <br> 변환
  if (channel === 'email' && !_msgQuill) {
    body = body.split(String.fromCharCode(10)).join('<br>');
  }

  var statusEl = document.getElementById('msgSendStatus');
  statusEl.textContent = '발송 중...';
  statusEl.className = 'text-xs text-gray-500';
  document.getElementById('msgSendBtn').disabled = true;

  try {
    var payload = {
      channel: channel,
      receiver: { name: recvName },
      content:  { body: body },
      context:  { type: _msgContext.type, id: _msgContext.id, client_id: _msgContext.client_id }
    };

    if (channel === 'kakao' || channel === 'sms') payload.receiver.phone = recvAddr;
    else if (channel === 'email') payload.receiver.email = recvAddr;
    else if (channel === 'fax')   payload.receiver.fax   = recvAddr;

    if (subject) payload.content.subject = subject;
    if (templateCode && channel === 'kakao') payload.content.template_code = templateCode;

    var btnData = _msgContext.buttons;
    if (btnData && channel === 'kakao') payload.content.buttons = btnData;

    // 포털 링크 포함
    var portalToggle = document.getElementById('msgPortalLinkToggle');
    if (portalToggle && portalToggle.checked && _msgContext.client_id) {
      payload.include_portal_link = true;
    }

    // 예약 발송
    var scheduleToggle = document.getElementById('msgScheduleToggle');
    if (scheduleToggle && scheduleToggle.checked && (channel === 'kakao' || channel === 'sms')) {
      var scheduleAt = document.getElementById('msgScheduleAt').value;
      if (scheduleAt) {
        if (new Date(scheduleAt) <= new Date()) {
          showToast('예약 시간은 현재 시간 이후여야 합니다.', 'error');
          document.getElementById('msgSendBtn').disabled = false;
          return;
        }
        // datetime-local → yyyyMMddHHmmss (초 보정: 12자리면 '00' 추가)
        var raw = scheduleAt.replace(/[-T:]/g, '').substring(0, 14);
        payload.content.sndDT = raw.length < 14 ? raw + '00000000'.substring(0, 14 - raw.length) : raw;
      }
    }

    var res = await axios.post('/api/messages/send', payload);
    if (res.data.success) {
      var d = res.data.data;
      if (d && d.status === 'FAILED') {
        statusEl.textContent = '발송 실패: ' + (d.message || '');
        statusEl.className   = 'text-xs text-red-600';
      } else {
        var msg = channel === 'email' ? '이메일이 발송되었습니다'
                : channel === 'sms'   ? '문자가 발송되었습니다'
                :                       '카카오톡이 발송되었습니다';
        if (window.showToast) showToast(msg, 'success');
        closeMsgSendModal();
      }
    } else {
      statusEl.textContent = res.data.error || '발송 실패';
      statusEl.className   = 'text-xs text-red-600';
    }
  } catch(e) {
    statusEl.textContent = (e.response && e.response.data ? e.response.data.error : e.message) || '오류';
    statusEl.className   = 'text-xs text-red-600';
  }
  document.getElementById('msgSendBtn').disabled = false;
}

// ═══ 품목 검색 모달 (주문서/발주서/견적서 공통) ═══
var _itemSearchCb = null;
var _itemSearchType = 'sales';
var _itemSearchTimer = null;

window.openItemSearchModal = function(opts) {
  opts = opts || {};
  _itemSearchCb = opts.onSelect || null;
  _itemSearchType = opts.type || 'sales';
  var initialSearch = opts.search || '';

  var existing = document.getElementById('itemSearchModal');
  if (existing) existing.remove();

  var modal = document.createElement('div');
  modal.id = 'itemSearchModal';
  modal.className = 'fixed inset-0 bg-black/40 flex items-center justify-center z-[70]';
  modal.innerHTML = '<div class="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col mx-4">'
    + '<div class="p-4 border-b">'
    + '<div class="flex items-center justify-between mb-3">'
    + '<h2 class="text-lg font-bold"><i class="fas fa-search text-blue-600 mr-2"></i>품목 검색</h2>'
    + '<button onclick="document.getElementById(\\'itemSearchModal\\').remove()" class="p-2 text-gray-400 hover:text-gray-600"><i class="fas fa-times text-lg"></i></button>'
    + '</div>'
    + '<input type="text" id="itemSearchModalInput" placeholder="품목명 또는 코드로 검색..." value="' + (initialSearch || '').replace(/"/g, '') + '"'
    + ' class="w-full px-4 py-3 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" autofocus>'
    + '</div>'
    + '<div class="flex-1 overflow-auto" id="itemSearchModalBody">'
    + '<div class="text-center py-12 text-gray-400 text-sm">검색어를 입력하세요</div>'
    + '</div>'
    + '<div class="border-t p-3 bg-gray-50 rounded-b-xl flex items-center justify-between">'
    + '<span class="text-xs text-gray-400" id="itemSearchModalCount"></span>'
    + '<button onclick="document.getElementById(\\'itemSearchModal\\').remove()" class="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">닫기</button>'
    + '</div></div>';

  document.body.appendChild(modal);
  modal.addEventListener('click', function(e) { if (e.target === modal) modal.remove(); });

  var input = document.getElementById('itemSearchModalInput');
  input.addEventListener('input', function() {
    clearTimeout(_itemSearchTimer);
    var q = this.value.trim();
    if (!q) {
      document.getElementById('itemSearchModalBody').innerHTML = '<div class="text-center py-12 text-gray-400 text-sm">검색어를 입력하세요</div>';
      document.getElementById('itemSearchModalCount').textContent = '';
      return;
    }
    _itemSearchTimer = setTimeout(function() { _doItemSearch(q); }, 250);
  });
  input.focus();

  if (initialSearch) {
    setTimeout(function() { _doItemSearch(initialSearch); }, 100);
  }
};

function _doItemSearch(q) {
  var url = '/api/items?search=' + encodeURIComponent(q) + '&type=' + _itemSearchType + '&limit=50';
  var body = document.getElementById('itemSearchModalBody');
  if (!body) return;
  body.innerHTML = '<div class="text-center py-8 text-gray-400"><i class="fas fa-spinner fa-spin mr-1"></i>검색 중...</div>';

  axios.get(url).then(function(res) {
    var items = res.data.data || [];
    var countEl = document.getElementById('itemSearchModalCount');
    if (countEl) countEl.textContent = items.length + '건';

    if (!items.length) {
      body.innerHTML = '<div class="text-center py-12 text-gray-400 text-sm">검색 결과가 없습니다</div>';
      return;
    }

    var favItems = items.filter(function(it) { return it.is_favorite; });
    var normalItems = items.filter(function(it) { return !it.is_favorite; });
    var sorted = favItems.concat(normalItems);

    var html = '<table class="w-full text-sm"><thead class="sticky top-0 bg-gray-50 z-10">'
      + '<tr class="text-left text-xs text-gray-500">'
      + '<th class="px-4 py-2">코드</th>'
      + '<th class="px-4 py-2">품목명</th>'
      + '<th class="px-4 py-2">분류</th>'
      + '<th class="px-4 py-2">단위</th>'
      + '<th class="px-4 py-2 text-right">단가</th>'
      + '</tr></thead><tbody>';

    if (favItems.length > 0) {
      html += '<tr><td colspan="5" class="px-4 py-1 text-xs font-semibold text-amber-600 bg-amber-50/50 border-b border-amber-100"><i class="fas fa-star text-amber-400 mr-1"></i>즐겨찾기</td></tr>';
    }

    sorted.forEach(function(it, i) {
      if (i === favItems.length && favItems.length > 0) {
        html += '<tr><td colspan="5" class="border-b-2 border-gray-200"></td></tr>';
      }
      var pm = it.pricing_method || 'FIXED';
      var pmBadge = pm === 'AREA' ? ' <span class="text-xs text-purple-600 font-medium">[㎡]</span>' : '';
      var cat = it.category || it.category_direct || it.category_name || '';
      var subcat = it.sub_category || it.sub_category_direct || '';
      var catStr = cat + (subcat ? ' > ' + subcat : '');
      var priceStr = (it.base_price || 0).toLocaleString() + '원' + (pm === 'AREA' ? '/㎡' : '');

      html += '<tr class="border-t hover:bg-blue-50 cursor-pointer item-search-row" '
        + 'data-id="' + it.id + '" data-name="' + (it.item_name || '').replace(/"/g, '') + '" '
        + 'data-price="' + (it.base_price || 0) + '" data-unit="' + (it.unit || 'EA') + '" '
        + 'data-cat="' + (cat || '').replace(/"/g, '') + '" '
        + 'data-subcat="' + (subcat || '').replace(/"/g, '') + '" '
        + 'data-pricing-method="' + pm + '" '
        + 'data-spec="' + (it.specification || '').replace(/"/g, '') + '" '
        + 'data-width-mm="' + (it.width_mm || '') + '">'
        + '<td class="px-4 py-2 font-mono text-xs text-blue-600">' + (it.item_code || '') + '</td>'
        + '<td class="px-4 py-2 font-medium">' + (it.item_name || '') + pmBadge + '</td>'
        + '<td class="px-4 py-2 text-xs text-gray-500">' + catStr + '</td>'
        + '<td class="px-4 py-2 text-gray-500">' + (it.unit || 'EA') + '</td>'
        + '<td class="px-4 py-2 text-right tabular-nums">' + priceStr + '</td>'
        + '</tr>';
    });
    html += '</tbody></table>';
    body.innerHTML = html;

    body.querySelectorAll('.item-search-row').forEach(function(row) {
      row.addEventListener('click', function() {
        if (_itemSearchCb) {
          _itemSearchCb({
            id: this.dataset.id,
            name: this.dataset.name,
            price: this.dataset.price,
            unit: this.dataset.unit,
            category: this.dataset.cat,
            sub_category: this.dataset.subcat,
            pricing_method: this.dataset.pricingMethod,
            specification: this.dataset.spec,
            width_mm: this.dataset.widthMm
          });
        }
        document.getElementById('itemSearchModal').remove();
      });
    });
  }).catch(function() {
    body.innerHTML = '<div class="text-center py-8 text-red-500">검색 실패</div>';
  });
}
`

interface AppLayoutOptions {
  title: string
  activePage: string
  pageCSS?: string
  pageContent: string
  pageScript: string
  pageHeadExtra?: string
}

export function renderPage(c: Context<HonoEnv>, opts: AppLayoutOptions) {
  c.header('Cache-Control', 'no-store, no-cache, must-revalidate')
  if (c.req.header('X-SPA-Request') === '1') {
    return c.json({
      title: opts.title,
      pageCSS: opts.pageCSS || '',
      pageContent: opts.pageContent,
      pageScript: opts.pageScript,
    })
  }
  return c.html(appLayout(opts))
}

export function appLayout(opts: AppLayoutOptions): string {
  return `<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="build-time" content="${new Date().toISOString()}">
    <title>${opts.title} - ERP+MES</title>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css">
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap">
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
    <script src="https://cdn.jsdelivr.net/npm/axios@1.6.0/dist/axios.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/qrcode@1.5.4/build/qrcode.min.js"></script>
    <script src="//t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js"></script>
    <link href="https://cdn.jsdelivr.net/npm/quill@2.0.3/dist/quill.snow.css" rel="stylesheet">
    <script src="https://cdn.jsdelivr.net/npm/quill@2.0.3/dist/quill.js"></script>
    ${SHARED_CSS}
    ${opts.pageCSS ? `<style id="page-css">${opts.pageCSS}</style>` : ''}
    ${opts.pageHeadExtra || ''}
</head>
<body class="perm-checking">
    ${sidebarHTML(opts.activePage)}
    <div class="main-content">
        ${topBarHTML(opts.title)}
        <div class="page-body">
            ${opts.pageContent}
        </div>
    </div>
    <!-- 통합 메시지 발송 모달 (전역) -->
    <div id="msgSendModal" class="hidden fixed inset-0 z-[60] flex items-center justify-center bg-black/50">
      <div class="bg-white rounded-lg shadow-xl w-[720px] max-h-[85vh] overflow-y-auto p-6">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-lg font-bold text-gray-800">메시지 발송</h3>
          <button onclick="closeMsgSendModal()" class="text-gray-400 hover:text-gray-600"><i class="fas fa-times"></i></button>
        </div>
        <div class="flex gap-6">
          <div class="flex-1 space-y-3">
            <div class="flex gap-1.5 flex-wrap">
              <button onclick="setMsgChannel(&apos;kakao&apos;)" id="msgChKakao" class="px-3 py-1.5 rounded-full text-xs font-medium bg-blue-50 border-2 border-blue-500 text-blue-700"><i class="fas fa-comment mr-1"></i>카카오톡</button>
              <button onclick="setMsgChannel(&apos;sms&apos;)" id="msgChSms" class="px-3 py-1.5 rounded-full text-xs font-medium bg-white border border-gray-300 text-gray-600"><i class="fas fa-sms mr-1"></i>문자</button>
              <button onclick="setMsgChannel(&apos;email&apos;)" id="msgChEmail" class="px-3 py-1.5 rounded-full text-xs font-medium bg-white border border-gray-300 text-gray-600"><i class="fas fa-envelope mr-1"></i>이메일</button>
              <button onclick="setMsgChannel(&apos;fax&apos;)" id="msgChFax" class="px-3 py-1.5 rounded-full text-xs font-medium bg-white border border-gray-300 text-gray-600"><i class="fas fa-fax mr-1"></i>팩스</button>
            </div>
            <div class="flex gap-2">
              <div class="flex-1">
                <label class="text-xs font-semibold text-gray-600 mb-1 block">수신자</label>
                <input type="text" id="msgRecvName" class="w-full border rounded-lg px-3 py-2 text-sm bg-gray-50" readonly>
              </div>
              <div class="flex-1">
                <label class="text-xs font-semibold text-gray-600 mb-1 block" id="msgRecvLabel">수신번호</label>
                <input type="text" id="msgRecvAddr" class="w-full border rounded-lg px-3 py-2 text-sm">
              </div>
            </div>
            <div id="msgKakaoArea">
              <label class="text-xs font-semibold text-gray-600 mb-1 block">카카오톡 템플릿</label>
              <select id="msgTemplate" class="w-full border rounded-lg px-3 py-2 text-sm" onchange="onMsgTemplateChange()">
                <option value="">직접 작성</option>
              </select>
            </div>
            <div id="msgSubjectArea" class="hidden">
              <label class="text-xs font-semibold text-gray-600 mb-1 block">제목 <span id="msgSubjectHint" class="text-gray-400 font-normal"></span></label>
              <input type="text" id="msgSubject" class="w-full border rounded-lg px-3 py-2 text-sm" placeholder="제목">
            </div>
            <div>
              <label class="text-xs font-semibold text-gray-600 mb-1 block">내용</label>
              <!-- 일반 텍스트 (카카오/SMS/팩스) -->
              <div id="msgBodyTextArea">
                <textarea id="msgBody" rows="5" class="w-full border rounded-lg px-3 py-2 text-sm" placeholder="메시지 내용" oninput="if(_msgChannel===&apos;sms&apos;)updateMsgByteCounter();updateMsgPreview()"></textarea>
              </div>
              <!-- 이메일 HTML 에디터 -->
              <div id="msgBodyEditorArea" class="hidden">
                <div id="msgQuillEditor" style="min-height:120px;"></div>
              </div>
              <div class="flex justify-between mt-1">
                <span id="msgChannelInfo" class="text-xs text-blue-600 font-medium">카카오톡</span>
                <span id="msgByteCounter" class="text-xs text-gray-400 hidden">0 / 90 byte</span>
              </div>
            </div>
            <!-- 포털 링크 -->
            <div id="msgPortalLinkArea">
              <label class="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" id="msgPortalLinkToggle" class="w-4 h-4 text-blue-600 rounded">
                <span class="text-xs font-semibold text-gray-600">거래 내역 확인 링크 포함</span>
              </label>
            </div>
            <!-- 예약 발송 -->
            <div id="msgScheduleArea" class="hidden">
              <label class="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" id="msgScheduleToggle" class="w-4 h-4 text-blue-600 rounded" onchange="toggleScheduleInput()">
                <span class="text-xs font-semibold text-gray-600">예약 발송</span>
              </label>
              <div id="msgScheduleInput" class="hidden mt-2">
                <input type="datetime-local" id="msgScheduleAt" class="w-full border rounded-lg px-3 py-2 text-sm">
                <div class="text-xs text-gray-400 mt-1">지정한 시간에 자동 발송됩니다 (카카오톡/SMS만 지원)</div>
              </div>
            </div>
            <div class="flex items-center justify-between pt-3 border-t">
              <div id="msgSendStatus" class="text-xs text-gray-400"></div>
              <div class="flex gap-2">
                <button onclick="closeMsgSendModal()" class="px-4 py-2 border text-gray-700 rounded-lg text-sm hover:bg-gray-50">취소</button>
                <button onclick="execMsgSend()" id="msgSendBtn" class="px-5 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
                  <i class="fas fa-paper-plane mr-1"></i>발송
                </button>
              </div>
            </div>
          </div>
          <div class="w-[220px] flex-shrink-0">
            <div class="text-xs font-semibold text-gray-600 mb-2 text-center">미리보기</div>
            <div id="msgPreviewArea">
              <div id="msgPreviewKakao" class="bg-[#b2c7d9] rounded-2xl p-3 min-h-[260px]">
                <div class="bg-white rounded-xl p-3 shadow-sm">
                  <div class="text-xs font-bold text-gray-800 mb-1">동산현수막</div>
                  <div id="msgPreviewKakaoBody" class="text-xs text-gray-600 whitespace-pre-wrap leading-relaxed" style="min-height:80px;">메시지 내용이 여기에 표시됩니다</div>
                  <div class="mt-2 border-t pt-2">
                    <div class="text-center text-xs text-blue-600 bg-blue-50 rounded py-1.5">확인하기</div>
                  </div>
                </div>
              </div>
              <div id="msgPreviewSms" class="hidden bg-gray-900 rounded-2xl p-3 min-h-[260px]">
                <div class="bg-green-500 rounded-xl p-3">
                  <div id="msgPreviewSmsBody" class="text-xs text-white whitespace-pre-wrap leading-relaxed" style="min-height:80px;">메시지 내용</div>
                </div>
                <div class="text-center text-xs text-gray-400 mt-2">SMS</div>
              </div>
              <div id="msgPreviewEmail" class="hidden bg-white border rounded-xl min-h-[260px]">
                <div class="bg-gray-100 rounded-t-xl px-3 py-2 border-b">
                  <div class="text-xs text-gray-400">제목</div>
                  <div id="msgPreviewEmailSubject" class="text-xs font-medium text-gray-800">(제목 없음)</div>
                </div>
                <div class="p-3">
                  <div id="msgPreviewEmailBody" class="text-xs text-gray-600 whitespace-pre-wrap leading-relaxed" style="min-height:80px;">내용</div>
                </div>
              </div>
              <div id="msgPreviewFax" class="hidden bg-white border-2 border-dashed border-gray-300 rounded-xl p-3 min-h-[260px] flex items-center justify-center">
                <div class="text-center text-gray-400">
                  <i class="fas fa-fax text-2xl mb-2"></i>
                  <div class="text-xs">준비 중</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    <script>
${SHARED_AUTH_JS}
    </script>
    <script>
// === Global ESC key handler ===
document.addEventListener('keydown', function(e) {
  if (e.key !== 'Escape') return;

  // 우선순위: 최상위 z-index 모달부터 닫기
  var closers = [
    // 명세서 이메일 모달 (z:20000)
    function() { var el = document.getElementById('invoiceEmailModal'); if (el) { el.remove(); return true; } },
    // 명세서 iframe 패널 (z:10000)
    function() { var el = document.getElementById('invoicePanel'); if (el) { el.remove(); return true; } },
    // 커맨드 팔레트
    function() { var el = document.getElementById('cmdPalette'); if (el && el.style.display !== 'none') { el.style.display = 'none'; return true; } },
    // 품목 검색 모달 (z:70, DOM remove 방식)
    function() { var el = document.getElementById('itemSearchModal'); if (el) { el.remove(); return true; } },
    // 원자재 연결 모달 (z:60, DOM remove 방식)
    function() { var el = document.getElementById('rmConnectionModal'); if (el) { el.remove(); return true; } },
    // 전역 검색
    function() { var el = document.getElementById('globalSearchResults'); if (el && el.style.display !== 'none') { el.style.display = 'none'; return true; } },
    // display:flex 모달 (사용자 모달, 비번 초기화 등)
    function() {
      var modals = document.querySelectorAll('[id$="Modal"],[id$="modal"],[id$="ModalOverlay"]');
      for (var i = modals.length - 1; i >= 0; i--) {
        var m = modals[i];
        var st = window.getComputedStyle(m);
        if (st.display !== 'none' && st.visibility !== 'hidden') {
          if (m.classList.contains('active')) { m.classList.remove('active'); return true; }
          if (m.classList.contains('hidden')) continue;
          // hidden 클래스 방식 통일 (인라인 style.display='none' 금지 — 재오픈 시 클래스 제거로 복구 불가)
          m.classList.add('hidden'); return true;
        }
      }
      return false;
    }
  ];

  for (var i = 0; i < closers.length; i++) {
    try { if (closers[i]()) return; } catch (err) {}
  }
});
    </script>
    ${opts.pageScript ? `<script id="page-script">${opts.pageScript}</script>` : ''}
</body>
</html>`
}

