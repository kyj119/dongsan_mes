// src/layout/sidebar.ts — 사이드바 HTML 생성 (layout.ts에서 분리)
import { MENU_ITEMS } from './menu'

export function sidebarHTML(activePage: string): string {
  let html = `<aside class="sidebar" id="sidebar">`

  // Logo area
  html += `
    <div class="sidebar-logo">
      <i class="fas fa-industry"></i>
      <span class="nav-label sidebar-logo-text">동산 MES</span>
      <button class="sidebar-pin-btn" id="sidebarPinBtn" title="사이드바 고정" onclick="toggleSidebarPin()">
        <i class="fas fa-thumbtack"></i>
      </button>
    </div>`

  // Entity switcher (separate row)
  html += `
    <div class="sidebar-entity" id="entitySwitcher">
      <button id="entitySwitcherBtn" class="sidebar-entity-btn" onclick="toggleEntityDropdown()">
        <i class="fas fa-building sidebar-entity-icon"></i>
        <span class="nav-label" id="entityName">로딩중...</span>
        <i class="fas fa-chevron-down nav-label sidebar-entity-arrow" id="entityArrow"></i>
      </button>
      <div id="entityDropdown" class="sidebar-entity-dropdown"></div>
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
