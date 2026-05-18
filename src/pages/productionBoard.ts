import type { Context } from 'hono'
import type { HonoEnv } from '../types/env'
import { renderPage } from '../layout'
import pageScript from '../scripts/productionBoard.js?raw'

export function productionBoardPage(c: Context<HonoEnv>) {
  return renderPage(c, {
    title: '생산 현황 보드',
    activePage: '/production-board',
    pageCSS: `
      /* ── 보드 레이아웃 ─────────────────────────────── */
      .board-container { padding: 0; }
      .board-header {
        display: flex; align-items: center; justify-content: space-between;
        padding: 12px 20px; gap: 12px; flex-wrap: wrap;
        border-bottom: 1px solid var(--c-border);
        background: var(--c-bg);
        position: sticky; top: 0; z-index: 10;
      }
      .board-filters { display: flex; gap: 6px; flex-wrap: wrap; }
      .board-actions { display: flex; gap: 8px; align-items: center; }

      /* ── 상태 탭 ───────────────────────────────────── */
      .status-tab {
        padding: 6px 14px; border-radius: 20px; font-size: 13px; font-weight: 600;
        cursor: pointer; border: 1px solid var(--c-border); background: var(--c-bg);
        transition: all 0.15s; white-space: nowrap;
      }
      .status-tab:hover { background: var(--c-border-light); }
      .status-tab.active { background: var(--c-primary); color: white; border-color: var(--c-primary); }
      .status-tab .badge {
        display: inline-block; min-width: 20px; text-align: center;
        padding: 1px 6px; border-radius: 10px; font-size: 11px;
        background: rgba(0,0,0,0.1); margin-left: 4px;
      }
      .status-tab.active .badge { background: rgba(255,255,255,0.3); }

      /* ── 카드 그리드 ───────────────────────────────── */
      .board-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
        gap: 12px; padding: 16px 20px;
      }

      /* ── 카드 타일 ─────────────────────────────────── */
      .board-tile {
        background: var(--c-bg); border: 1px solid var(--c-border);
        border-radius: var(--radius-lg); overflow: hidden;
        cursor: pointer; transition: all 0.2s;
        display: flex; flex-direction: column;
      }
      .board-tile:hover { box-shadow: 0 4px 16px rgba(0,0,0,0.1); transform: translateY(-2px); }
      .board-tile.status-HOLD { border-left: 4px solid #f59e0b; }
      .board-tile.status-PRINTING { border-left: 4px solid #3b82f6; }
      .board-tile.status-PRINT_DONE { border-left: 4px solid #10b981; }

      .tile-thumb {
        width: 100%; aspect-ratio: 4/3; object-fit: cover;
        background: #f1f5f9; display: flex; align-items: center; justify-content: center;
        font-size: 48px; color: #94a3b8;
      }
      .tile-thumb img { width: 100%; height: 100%; object-fit: cover; }
      .tile-body { padding: 10px 12px; flex: 1; display: flex; flex-direction: column; gap: 4px; }
      .tile-client { font-size: 14px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .tile-item { font-size: 12px; color: var(--c-text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .tile-meta { display: flex; justify-content: space-between; align-items: center; font-size: 11px; margin-top: auto; padding-top: 6px; }
      .tile-size { color: var(--c-text-muted); }

      /* 납기 뱃지 */
      .dday { padding: 2px 8px; border-radius: 10px; font-weight: 700; font-size: 11px; }
      .dday-overdue { background: #fee2e2; color: #dc2626; }
      .dday-today { background: #fef3c7; color: #d97706; }
      .dday-soon { background: #dbeafe; color: #2563eb; }
      .dday-ok { background: #d1fae5; color: #059669; }

      /* 상태 뱃지 */
      .tile-status {
        display: flex; gap: 4px; align-items: center; flex-wrap: wrap;
        padding-top: 6px; border-top: 1px solid var(--c-border-light);
      }
      .s-badge { padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: 600; }
      .s-printing { background: #dbeafe; color: #1d4ed8; }
      .s-done { background: #d1fae5; color: #047857; }
      .s-hold { background: #fef3c7; color: #92400e; }
      .s-pending { background: #f1f5f9; color: #64748b; }

      /* 진행률 바 */
      .progress-bar { height: 4px; background: #e2e8f0; border-radius: 2px; overflow: hidden; }
      .progress-fill { height: 100%; border-radius: 2px; background: #3b82f6; transition: width 0.3s; }
      .progress-fill.complete { background: #10b981; }

      /* PP 뱃지 */
      .pp-badge { font-size: 10px; padding: 1px 5px; border-radius: 3px; }
      .pp-pending { background: #fef3c7; color: #92400e; }
      .pp-done { background: #d1fae5; color: #047857; }
      .pp-na { background: #f1f5f9; color: #94a3b8; }

      /* ── 라이트박스 ────────────────────────────────── */
      .lb-overlay {
        position: fixed; inset: 0; background: rgba(0,0,0,0.6);
        z-index: 1000; display: flex; align-items: center; justify-content: center;
        padding: 20px; opacity: 0; transition: opacity 0.2s;
      }
      .lb-overlay.show { opacity: 1; }
      .lb-modal {
        background: var(--c-bg); border-radius: var(--radius-xl);
        max-width: 720px; width: 100%; max-height: 90vh; overflow-y: auto;
        box-shadow: 0 20px 60px rgba(0,0,0,0.3);
      }
      .lb-header {
        display: flex; justify-content: space-between; align-items: center;
        padding: 16px 20px; border-bottom: 1px solid var(--c-border);
      }
      .lb-header h3 { margin: 0; font-size: 16px; }
      .lb-close { background: none; border: none; font-size: 24px; cursor: pointer; color: var(--c-text-muted); padding: 4px 8px; }
      .lb-body { padding: 16px 20px; }
      .lb-items-grid {
        display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
        gap: 10px; margin-bottom: 16px;
      }
      .lb-item {
        border: 1px solid var(--c-border); border-radius: var(--radius);
        overflow: hidden; text-align: center;
      }
      .lb-item img { width: 100%; aspect-ratio: 4/3; object-fit: cover; background: #f1f5f9; }
      .lb-item-info { padding: 6px 8px; font-size: 11px; }
      .lb-item-name { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .lb-item-size { color: var(--c-text-muted); }
      .lb-item .done-check { color: #10b981; font-weight: 700; }
      .lb-item .pending-check { color: #94a3b8; }
      .lb-detail-grid {
        display: grid; grid-template-columns: 1fr 1fr; gap: 8px;
        font-size: 13px; padding: 12px; background: var(--c-border-light);
        border-radius: var(--radius);
      }
      .lb-detail-grid dt { color: var(--c-text-muted); }
      .lb-detail-grid dd { margin: 0; font-weight: 600; }
      .lb-no-thumb { display: flex; align-items: center; justify-content: center;
        width: 100%; aspect-ratio: 4/3; background: #f1f5f9; color: #94a3b8; font-size: 24px; }

      /* ── 풀스크린 ──────────────────────────────────── */
      .fullscreen-mode .board-header { padding: 8px 16px; }
      .fullscreen-mode .board-grid { padding: 12px 16px; }
      .auto-refresh-indicator {
        display: inline-flex; align-items: center; gap: 4px;
        font-size: 12px; color: var(--c-text-muted);
      }
      .auto-refresh-indicator .dot {
        width: 6px; height: 6px; border-radius: 50%; background: #10b981;
        animation: pulse 2s infinite;
      }
      @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }

      /* ── 빈 상태 ───────────────────────────────────── */
      .board-empty {
        display: flex; flex-direction: column; align-items: center;
        justify-content: center; padding: 80px 20px; color: var(--c-text-muted);
      }
      .board-empty i { font-size: 48px; margin-bottom: 16px; }

      /* ── 반응형 ────────────────────────────────────── */
      @media (max-width: 768px) {
        .board-grid { grid-template-columns: repeat(2, 1fr); gap: 8px; padding: 8px; }
        .board-header { padding: 8px 12px; }
        .tile-body { padding: 8px 10px; }
        .tile-client { font-size: 13px; }
        .lb-items-grid { grid-template-columns: repeat(2, 1fr); }
      }
      @media (min-width: 1400px) {
        .board-grid { grid-template-columns: repeat(5, 1fr); }
      }
      @media (min-width: 1800px) {
        .board-grid { grid-template-columns: repeat(6, 1fr); }
      }
    `,
    pageContent: `
      <div class="board-container" id="boardContainer">
        <div class="board-header">
          <div class="board-filters" id="statusTabs"></div>
          <div class="board-actions">
            <select id="sortSelect" class="text-sm border rounded px-2 py-1">
              <option value="priority_desc">긴급순</option>
              <option value="delivery_asc">납기순</option>
              <option value="status_group">상태별</option>
            </select>
            <div class="auto-refresh-indicator" id="refreshIndicator">
              <span class="dot"></span> <span id="refreshCountdown">30s</span>
            </div>
            <button onclick="toggleFullscreen()" class="text-sm border rounded px-3 py-1 hover:bg-gray-100" title="전체화면">
              <i class="fas fa-expand"></i>
            </button>
          </div>
        </div>
        <div class="board-grid" id="boardGrid"></div>
      </div>
      <div class="lb-overlay" id="lightbox" style="display:none" onclick="closeLightbox(event)">
        <div class="lb-modal" onclick="event.stopPropagation()">
          <div class="lb-header">
            <h3 id="lbTitle"></h3>
            <button class="lb-close" onclick="closeLightbox()">&times;</button>
          </div>
          <div class="lb-body" id="lbBody"></div>
        </div>
      </div>
    `,
    pageScript
  })
}
