// src/layout/topbar.ts — 상단 바 HTML 생성 (layout.ts에서 분리)

export function topBarHTML(title: string): string {
  return `
    <a href="#mainContent" class="ds-skip-link">본문으로 건너뛰기</a>
    <div class="sidebar-overlay" id="sidebarOverlay" onclick="closeMobileSidebar()"></div>
    <header class="top-bar" role="banner">
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
