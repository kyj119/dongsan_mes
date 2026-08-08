// src/layout/shared-styles.ts — 공유 CSS (layout.ts에서 분리, verbatim)
export const SHARED_CSS = `
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
    --c-purple: #7c3aed;
    --c-purple-light: #f5f3ff;
    --c-orange: #ea580c;
    --c-orange-light: #fff7ed;
    --c-teal: #0d9488;
    --c-teal-light: #f0fdfa;
    --c-bg: #F0F1F3;
    --c-surface: #ffffff;
    --c-surface-secondary: #f9fafb;
    --c-surface-stripe: #f8fafc;
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
    --c-surface-secondary: #162032;
    --c-surface-stripe: #1a2332;
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
    --c-purple: #a78bfa;
    --c-purple-light: rgba(167,139,250,0.1);
    --c-orange: #fb923c;
    --c-orange-light: rgba(251,146,60,0.1);
    --c-teal: #2dd4bf;
    --c-teal-light: rgba(45,212,191,0.1);
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
  html, body { background: var(--c-bg); overscroll-behavior: none; }
  /* 스크롤바 유무에 따른 가로 layout shift 방지: 스크롤바 거터 항상 예약 (전역) */
  html { scrollbar-gutter: stable; }
  body { font-family: var(--font-family); color: var(--c-text); -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; min-height: 100vh; }

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
  .sidebar-logo i { width: 24px; text-align: center; font-size: 20px; flex-shrink: 0; }
  .sidebar-logo-text { font-size: 15px; }

  /* Entity Switcher */
  .sidebar-entity {
    position: relative;
    border-bottom: 1px solid var(--c-sidebar-border);
    padding: 0;
  }
  .sidebar-entity-btn {
    display: flex; align-items: center;
    width: 100%; padding: 10px 18px;
    background: none; border: none; cursor: pointer;
    color: var(--c-sidebar-text); font-size: var(--fs-sm);
    font-family: inherit; text-align: left;
    transition: background var(--transition-fast), color var(--transition-fast);
  }
  .sidebar-entity-btn:hover { background: var(--c-sidebar-hover); color: #e2e8f0; }
  .sidebar-entity-icon { width: 24px; text-align: center; font-size: 14px; flex-shrink: 0; }
  .sidebar-entity-arrow { font-size: 9px !important; width: auto !important; margin-left: auto; transition: transform 0.2s; }
  .sidebar-entity-dropdown {
    display: none; position: absolute; top: 100%; left: 8px; right: 8px;
    margin-top: 2px; background: var(--c-sidebar); border: 1px solid var(--c-sidebar-border);
    border-radius: var(--radius-md); z-index: 9999;
    box-shadow: 0 4px 16px rgba(0,0,0,0.4); overflow: hidden;
  }
  .sidebar-entity-item {
    padding: 8px 14px; font-size: var(--fs-xs); cursor: pointer;
    color: #cbd5e1; font-weight: 400;
    display: flex; align-items: center; gap: 6px;
    transition: background var(--transition-fast);
  }
  .sidebar-entity-item:hover { background: var(--c-sidebar-hover); }
  .sidebar-entity-item.active { color: var(--c-primary); font-weight: 600; }
  .sidebar-entity-item i { font-size: 10px; width: 10px; text-align: center; }
  .sidebar-entity-spacer { width: 10px; }
  .sidebar-entity-sep { border-top: 1px solid var(--c-sidebar-border); margin: 2px 0; }
  /* Entity section: show icon-only when sidebar collapsed */
  .sidebar:not(:hover):not(.pinned) .sidebar-entity .nav-label { opacity: 0; }
  .sidebar:not(:hover):not(.pinned) .sidebar-entity-arrow { display: none; }
  .sidebar:not(:hover):not(.pinned) .sidebar-entity-dropdown { display: none !important; }

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
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #cbd5e1;
    padding: 12px 18px 4px;
    opacity: 0;
    height: 0;
    overflow: hidden;
    transition: opacity var(--transition-fast), height var(--transition-fast), color var(--transition-fast);
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
  .group-header { cursor: pointer; display: flex; align-items: center; justify-content: space-between; padding-right: 14px; transition: background var(--transition-fast); }
  .group-header:hover { background: var(--c-sidebar-hover); }
  .group-header:hover .group-label, .group-header:hover .group-chevron { color: var(--c-sidebar-text-active); }
  .group-chevron { font-size: 11px !important; width: auto !important; color: var(--c-text-muted); transition: transform var(--transition-fast), color var(--transition-fast); margin-left: 0 !important; }
  .group-items.collapsed { display: none; }
  .group-items.collapsed + .group-sep { margin-top: 2px; }
  .group-header.collapsed .group-chevron { transform: rotate(-90deg); color: var(--c-sidebar-text); }
  .group-header.collapsed .group-label { opacity: 0.55; }

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
    box-shadow: none;
    transition: box-shadow var(--transition-normal);
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
  .ds-badge-purple { background: var(--c-purple-light); color: #6b21a8; }
  .ds-badge-orange { background: var(--c-orange-light); color: #c2410c; }

  /* === DS Table === */
  .ds-table-wrap { overflow-x: auto; border-radius: var(--radius-lg); border: 1px solid var(--c-border-light); background: var(--c-surface); }
  .ds-table { width: 100%; border-collapse: collapse; font-size: var(--fs-sm); table-layout: fixed; }
  .ds-table thead th {
    position: sticky; top: 0; z-index: 5;
    background: var(--c-surface-secondary); padding: 10px 12px; font-size: var(--fs-xs); font-weight: 600;
    color: var(--c-text-secondary); text-align: left; border-bottom: 1px solid var(--c-border); white-space: nowrap;
    overflow: hidden; text-overflow: ellipsis;
  }
  .ds-table tbody td { padding: 10px 12px; border-bottom: 1px solid var(--c-border-light); vertical-align: middle; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .ds-table tbody td.ds-wrap { white-space: normal; overflow: visible; }
  .ds-table tbody td[title] { cursor: default; }
  .ds-table tbody tr { transition: background var(--transition-fast); }
  .ds-table tbody tr:nth-child(even) { background: var(--c-surface-stripe); }
  .ds-table tbody tr:hover { background: var(--c-bg); }
  .ds-table tbody tr:last-child td { border-bottom: none; }
  .ds-table-compact thead th { padding: 6px 8px; }
  .ds-table-compact tbody td { padding: 6px 8px; font-size: var(--fs-xs); }
  .ds-table-striped { width: 100%; border-collapse: collapse; }
  .ds-table-striped thead th {
    padding: 10px 12px; font-size: var(--fs-xs); font-weight: 600;
    color: var(--c-text-secondary); text-align: left; white-space: nowrap;
    background: var(--c-surface-secondary); border-bottom: 1px solid var(--c-border);
    position: sticky; top: 0; z-index: 5;
  }
  .ds-table-striped tbody td {
    padding: 8px 12px; vertical-align: middle;
    border-bottom: 1px solid var(--c-border-light);
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .ds-table-striped tbody td.ds-wrap { white-space: normal; overflow: visible; }
  .ds-table-striped tbody tr { transition: background var(--transition-fast); }
  .ds-table-striped tbody tr:nth-child(even) { background: var(--c-surface-stripe); }
  .ds-table-striped tbody tr:hover { background: var(--c-bg); }
  .ds-table-striped tbody tr:nth-child(even):hover { background: var(--c-bg); }
  .ds-table-striped tbody tr:last-child td { border-bottom: none; }
  /* [전역] 표 헤더 정렬 유틸 복원: .ds-table(-striped) thead th의 강제 text-align:left가
     th의 .text-right/.text-center/.text-left 유틸(특정성 0,1,0)을 (0,1,2)로 덮어써
     숫자·상태 헤더가 값과 어긋나는 문제 → 유틸 우선(0,2,2)으로 모든 페이지 일괄 정렬. */
  .ds-table thead th.text-right, .ds-table-striped thead th.text-right { text-align: right; }
  .ds-table thead th.text-center, .ds-table-striped thead th.text-center { text-align: center; }
  .ds-table thead th.text-left, .ds-table-striped thead th.text-left { text-align: left; }
  /* 고정 열너비 모드 — th에 width/style 지정 시 사용 */
  .ds-table-fixed { table-layout: fixed; }
  /* === 표 열 폭 표준 (table-layout:fixed 전제 = .ds-table 또는 .ds-table-fixed 동반) ===
     콘텐츠 유형별 적정 규격. 가변 주열(.col-name/.col-flex)만 남는 폭 흡수, 나머지는 고정폭
     → 한 열이 일방적으로 커지지 않음. 긴 값은 td의 ellipsis(…) + title(마우스오버 풀텍스트).
     specificity (0,2,0)으로 Tailwind w-* (0,1,0)을 덮어씀. width 전용(정렬은 기존 text-* 유틸 유지). */
  .ds-table .col-check, .ds-table-striped .col-check, .ds-table-fixed .col-check { width: 36px; }
  .ds-table .col-no, .ds-table-striped .col-no, .ds-table-fixed .col-no { width: 50px; }
  .ds-table .col-date, .ds-table-striped .col-date, .ds-table-fixed .col-date { width: 112px; }
  .ds-table .col-datetime, .ds-table-striped .col-datetime, .ds-table-fixed .col-datetime { width: 148px; }
  .ds-table .col-amount, .ds-table-striped .col-amount, .ds-table-fixed .col-amount { width: 120px; }
  .ds-table .col-qty, .ds-table-striped .col-qty, .ds-table-fixed .col-qty { width: 76px; }
  .ds-table .col-status, .ds-table-striped .col-status, .ds-table-fixed .col-status { width: 96px; }
  .ds-table .col-code, .ds-table-striped .col-code, .ds-table-fixed .col-code { width: 132px; }
  .ds-table .col-tag, .ds-table-striped .col-tag, .ds-table-fixed .col-tag { width: 92px; }
  .ds-table .col-phone, .ds-table-striped .col-phone, .ds-table-fixed .col-phone { width: 124px; }
  .ds-table .col-action, .ds-table-striped .col-action, .ds-table-fixed .col-action { width: 100px; }
  .ds-table .col-name, .ds-table-striped .col-name, .ds-table-fixed .col-name { width: auto; min-width: 140px; }
  .ds-table .col-flex, .ds-table-striped .col-flex, .ds-table-fixed .col-flex { width: auto; min-width: 120px; }
  /* 컴팩트 변형 (재무보고, IA 등 밀집 테이블) */
  .ds-table-striped.ds-compact thead th { padding: 6px 8px; }
  .ds-table-striped.ds-compact tbody td { padding: 4px 8px; font-size: var(--fs-xs); }

  /* === DS Bento Grid (Dashboard KPI) === */
  .ds-bento {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: var(--space-lg);
  }
  .ds-bento-hero {
    grid-column: span 2;
    grid-row: span 2;
    padding: var(--space-xl);
    display: flex;
    flex-direction: column;
  }
  @media (max-width: 1024px) {
    .ds-bento { grid-template-columns: repeat(3, 1fr); }
    .ds-bento-hero { grid-column: span 1; grid-row: span 1; }
  }
  @media (max-width: 768px) {
    .ds-bento { grid-template-columns: repeat(2, 1fr); }
  }
  @media (max-width: 480px) {
    .ds-bento { grid-template-columns: 1fr; }
  }

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
  .ds-input-sm { min-height: 32px; padding: 4px 10px; font-size: var(--fs-xs); }

  /* === DS Input Group (with suffix/prefix) === */
  .ds-input-group {
    display: flex; align-items: stretch; width: 100%;
  }
  .ds-input-group .ds-input {
    border-radius: var(--radius-md) 0 0 var(--radius-md);
    border-right: none;
    min-width: 0; flex: 1;
  }
  .ds-input-group-suffix {
    display: flex; align-items: center;
    padding: 0 10px;
    background: var(--c-bg);
    border: 1px solid var(--c-border);
    border-left: none;
    border-radius: 0 var(--radius-md) var(--radius-md) 0;
    font-size: var(--fs-xs);
    color: var(--c-text-muted);
    white-space: nowrap;
    user-select: none;
  }
  .ds-input-group .ds-input:focus + .ds-input-group-suffix {
    border-color: #9ca3af;
    box-shadow: 0 0 0 3px rgba(156,163,175,0.15);
  }
  .ds-input-group-prefix {
    display: flex; align-items: center;
    padding: 0 10px;
    background: var(--c-bg);
    border: 1px solid var(--c-border);
    border-right: none;
    border-radius: var(--radius-md) 0 0 var(--radius-md);
    font-size: var(--fs-xs);
    color: var(--c-text-muted);
    white-space: nowrap;
    user-select: none;
  }
  .ds-input-group-prefix + .ds-input {
    border-radius: 0 var(--radius-md) var(--radius-md) 0;
    border-left: none;
  }
  html.dark .ds-input-group-suffix,
  html.dark .ds-input-group-prefix { background: #0f172a; border-color: #475569; }

  /* === Skip Link (Accessibility) === */
  .ds-skip-link {
    position: absolute; top: -100px; left: 16px;
    background: var(--c-primary); color: #fff;
    padding: 8px 16px; border-radius: 0 0 var(--radius-md) var(--radius-md);
    font-size: var(--fs-sm); font-weight: 600; z-index: 999;
    text-decoration: none; transition: top 0.2s ease;
  }
  .ds-skip-link:focus { top: 0; }

  /* === DS Modal === */
  .ds-modal-overlay {
    position: fixed; inset: 0; background: rgba(0,0,0,0.4); backdrop-filter: blur(2px);
    z-index: 50; display: flex; align-items: center; justify-content: center; padding: var(--space-lg);
    animation: ds-fadeIn 0.15s ease;
  }
  /* 모달 위 모달(검색·라이트박스·결과 오버레이) 전용 층 — 임의 z-[60]/z-[70] 금지, 이 클래스만 사용 */
  .ds-z-stack { z-index: 60; }
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

  /* === DS Filter Bar === */
  .ds-filter-bar {
    display: flex; flex-wrap: wrap; align-items: flex-end; gap: var(--space-md);
    padding: var(--space-lg); margin-bottom: var(--space-lg);
    background: var(--c-surface); border-radius: var(--radius-lg);
    border: 1px solid var(--c-border-light);
  }
  .ds-filter-chips { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
  .ds-filter-field { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .ds-filter-field .ds-label { margin-bottom: 0; }
  .ds-filter-field .ds-input { min-height: 32px; padding: 4px 10px; font-size: var(--fs-xs); }
  .ds-filter-actions { display: flex; gap: 6px; align-items: flex-end; margin-left: auto; }
  .ds-filter-divider { width: 1px; height: 28px; background: var(--c-border); align-self: center; flex-shrink: 0; }
  .ds-filter-toggle {
    display: inline-flex; align-items: center; gap: 4px;
    font-size: var(--fs-xs); color: var(--c-text-muted); cursor: pointer;
    background: none; border: none; padding: 4px 8px; font-family: inherit;
    transition: color var(--transition-fast);
  }
  .ds-filter-toggle:hover { color: var(--c-primary); }
  .ds-filter-expand { display: none; width: 100%; padding-top: var(--space-md); border-top: 1px solid var(--c-border-light); margin-top: var(--space-sm); }
  .ds-filter-expand.open { display: flex; flex-wrap: wrap; gap: var(--space-md); align-items: flex-end; }
  @media (max-width: 768px) {
    .ds-filter-bar { gap: var(--space-sm); padding: var(--space-md); }
    .ds-filter-actions { margin-left: 0; width: 100%; }
    .ds-filter-actions .ds-btn { flex: 1; }
  }

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

  /* === DS Bulk Action Bar === */
  .ds-bulk-bar {
    position: fixed; bottom: 0; right: 0;
    left: var(--sidebar-w);
    background: var(--c-surface);
    border-top: 1px solid var(--c-border);
    padding: 12px var(--space-xl);
    display: flex; align-items: center; gap: var(--space-md); flex-wrap: wrap;
    box-shadow: 0 -4px 12px rgba(0,0,0,0.08);
    z-index: 35;
    transform: translateY(100%);
    transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  }
  .ds-bulk-bar.visible { transform: translateY(0); }
  .sidebar.pinned ~ .main-content .ds-bulk-bar { left: var(--sidebar-w-expanded); }
  .ds-bulk-bar-count {
    font-size: var(--fs-sm); font-weight: 600; color: var(--c-primary);
    display: flex; align-items: center; gap: 6px;
  }
  .ds-bulk-bar-count i { font-size: 14px; }
  .ds-bulk-bar-divider { width: 1px; height: 28px; background: var(--c-border); flex-shrink: 0; }
  .ds-bulk-bar-actions { display: flex; align-items: center; gap: 8px; }
  .ds-bulk-bar-end { margin-left: auto; }
  .ds-bulk-bar-spacer { height: 60px; display: none; }
  .ds-bulk-bar-spacer.visible { display: block; }
  @media (max-width: 768px) {
    .ds-bulk-bar { left: 0; padding: 10px var(--space-lg); }
  }
  html.dark .ds-bulk-bar { box-shadow: 0 -4px 12px rgba(0,0,0,0.3); }

  /* === DS List UX: 통계카드 드릴다운 · 조회조건 칩 · 합계 바 ===
     목록 화면 공통 3종. 렌더러는 shell.js 의 window.dsListUx (마크업·클래스를 페이지마다 다시 적지 않는다).
     설계 근거 = docs/audits/2026-08-08-list-ux-ecount-gap.md */
  /* 클릭 가능한 통계 카드 — 누르면 해당 조건으로 목록을 좁힌다 */
  .ds-stat { width: 100%; text-align: center; cursor: pointer; border: 1px solid var(--c-border); background: var(--c-surface);
             transition: border-color var(--transition-fast), box-shadow var(--transition-fast); }
  .ds-stat:hover { border-color: var(--c-primary); box-shadow: var(--shadow-md); }
  .ds-stat-active { border-color: var(--c-primary); box-shadow: 0 0 0 2px rgba(37,99,235,.18); }
  .ds-stat-active .ds-stat-label::after { content: ' · 조회중'; font-size: 11px; color: var(--c-primary); font-weight: 600; }

  /* 활성 조회조건 칩 — 접힌 필터 안의 조건(기본 기간 포함)을 항상 보이게 하고 원클릭 해제.
     ⚠️ 이름이 ds-cond 인 이유: ds-chip 은 이미 위에서 '클릭하는 필터 토글 칩'으로 정의돼 쓰이고 있다
     (출고 페이지의 택배사 배지 등). 같은 이름을 쓰면 뒤에 온 정의가 그것들을 덮어쓴다.
     (이 파일은 템플릿 리터럴이라 주석에도 백틱을 쓰면 안 된다 — 문자열이 끊긴다) */
  .ds-conds { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-top: 8px; }
  .ds-conds-label { font-size: var(--fs-xs); color: var(--c-text-secondary); margin-right: 2px; }
  .ds-cond { display: inline-flex; align-items: center; gap: 5px; padding: 3px 8px; border-radius: 999px;
             font-size: var(--fs-xs); line-height: 1.5; background: #eef2ff; color: #3730a3; border: 1px solid #c7d2fe; }
  .ds-cond-static { background: var(--c-surface-secondary); color: var(--c-text-secondary); border-color: var(--c-border); }
  .ds-cond-warn { background: #fef2f2; color: #b91c1c; border-color: #fecaca; }
  .ds-cond-x { cursor: pointer; border: none; background: none; padding: 0 0 0 1px; margin: 0; color: inherit; opacity: .65; font-size: var(--fs-xs); line-height: 1; }
  .ds-cond-x:hover { opacity: 1; }
  html.dark .ds-cond { background: #312e81; color: #c7d2fe; border-color: #4338ca; }
  html.dark .ds-cond-warn { background: #450a0a; color: #fecaca; border-color: #991b1b; }

  /* 합계 바 — 조회조건 전체 기준(현재 페이지 아님). 표 스크롤 영역 밖에 둬 항상 보이게 한다 */
  .ds-summary { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: flex-end; gap: 4px 18px;
                padding: 9px 16px; border-top: 2px solid var(--c-border); background: var(--c-surface-secondary); font-size: var(--fs-sm); }
  .ds-summary-scope { margin-right: auto; color: var(--c-text-secondary); font-size: var(--fs-xs); }
  .ds-summary-item { color: var(--c-text-secondary); }
  .ds-summary-item b { margin-left: 5px; color: var(--c-text); font-variant-numeric: tabular-nums; }
  .ds-summary-total b { color: var(--c-primary); font-size: var(--fs-lg); }

  /* === DS Sheet (Right Drawer) === */
  .ds-sheet-overlay {
    position: fixed; inset: 0; background: rgba(0,0,0,0.3); backdrop-filter: blur(2px);
    z-index: 50; opacity: 0; transition: opacity 0.25s ease;
    pointer-events: none;
  }
  .ds-sheet-overlay.open { opacity: 1; pointer-events: auto; }
  .ds-sheet {
    position: fixed; top: 0; right: 0; bottom: 0;
    width: 560px; max-width: 92vw;
    background: var(--c-surface);
    box-shadow: -8px 0 24px rgba(0,0,0,0.12);
    z-index: 51;
    transform: translateX(100%);
    transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);
    display: flex; flex-direction: column;
    overflow: hidden;
  }
  .ds-sheet.open { transform: translateX(0); }
  .ds-sheet-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: var(--space-lg) var(--space-xl);
    border-bottom: 1px solid var(--c-border-light);
    flex-shrink: 0;
  }
  .ds-sheet-header h3 { font-size: var(--fs-lg); font-weight: 600; margin: 0; }
  .ds-sheet-body { flex: 1; overflow-y: auto; padding: var(--space-xl); }
  .ds-sheet-footer {
    display: flex; justify-content: flex-end; gap: var(--space-sm);
    padding: var(--space-lg) var(--space-xl);
    border-top: 1px solid var(--c-border-light);
    flex-shrink: 0;
  }
  .ds-sheet-wide { width: 720px; }
  .ds-sheet-narrow { width: 420px; }

  /* === DS Animations === */
  @keyframes ds-shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
  @keyframes ds-fadeIn { from { opacity: 0; } to { opacity: 1; } }
  @keyframes ds-slideUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes ds-pageIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
  .page-body { animation: ds-pageIn 0.2s ease-out; }
  /* FOUC 방지: 권한 체크 중에는 콘텐츠 숨김 (비-ADMIN). ADMIN/체크 완료 시 즉시 노출. */
  body.perm-checking .page-body { visibility: hidden; }

  /* === Dark Mode: Glasstop top-bar === */
  .top-bar.scrolled { box-shadow: 0 1px 8px rgba(0,0,0,0.08); border-bottom-color: transparent; }
  html.dark .top-bar { background: rgba(15,23,42,0.85); }
  html.dark .top-bar.scrolled { box-shadow: 0 1px 8px rgba(0,0,0,0.3); }

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
  html.dark .ds-table tbody tr:nth-child(even) { background: var(--c-surface-stripe); }
  html.dark .ds-table-striped tbody tr:nth-child(even) { background: var(--c-surface-stripe); }
  html.dark .ds-table-striped tbody tr:nth-child(even):hover { background: var(--c-bg); }
  html.dark .ds-table thead th { background: var(--c-surface-secondary); }
  html.dark .ds-table-striped thead th { background: var(--c-surface-secondary); }
  html.dark .hover\\:bg-gray-50:hover { background-color: #1e293b !important; }
  html.dark .hover\\:bg-blue-50\\/30:hover { background-color: rgba(96,165,250,0.1) !important; }

  /* === 인쇄 = 항상 라이트 팔레트 (다크모드 중 인쇄 시 흰 종이·검정 글자 보장) === */
  @media print {
    html.dark {
      color-scheme: light;
      --c-bg: #F0F1F3; --c-surface: #ffffff; --c-surface-secondary: #f9fafb; --c-surface-stripe: #f8fafc;
      --c-text: #1e293b; --c-text-secondary: #64748b; --c-text-muted: #94a3b8;
      --c-border: #e2e8f0; --c-border-light: #f1f5f9;
      --c-primary: #3b82f6; --c-primary-hover: #2563eb; --c-primary-light: #eff6ff; --c-primary-dark: #1e40af;
      --c-success: #16a34a; --c-success-light: #dcfce7;
      --c-warning: #d97706; --c-warning-light: #fef3c7;
      --c-danger: #dc2626; --c-danger-light: #fee2e2;
      --c-info: #2563eb; --c-info-light: #dbeafe;
      --c-purple: #7c3aed; --c-purple-light: #f5f3ff;
      --c-orange: #ea580c; --c-orange-light: #fff7ed;
      --c-teal: #0d9488; --c-teal-light: #f0fdfa;
    }
    html.dark .bg-white { background-color: #ffffff !important; }
    html.dark .bg-gray-50 { background-color: #f9fafb !important; }
    html.dark .bg-gray-100 { background-color: #f3f4f6 !important; }
    html.dark .text-gray-900 { color: #111827 !important; }
    html.dark .text-gray-800 { color: #1f2937 !important; }
    html.dark .text-gray-700 { color: #374151 !important; }
    html.dark .text-gray-600 { color: #4b5563 !important; }
    html.dark .text-gray-500 { color: #6b7280 !important; }
    html.dark .text-gray-400 { color: #9ca3af !important; }
    html.dark .border, html.dark .border-gray-100, html.dark .border-gray-200, html.dark .border-gray-300 { border-color: #e5e7eb !important; }
  }
</style>`
