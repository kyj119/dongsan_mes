import type { Context } from 'hono'
import type { HonoEnv } from '../types/env'
import { renderPage } from '../layout'
import pageScript from '../scripts/cardDetail.js?raw'

export function cardDetailPage(c: Context<HonoEnv>) {
  return renderPage(c, {
    title: '카드 상세',
    activePage: '/cards',
    pageCSS: `
      /* ── 카드 상세 레이아웃 ── */
      .cd-header { display: flex; justify-content: space-between; align-items: center; padding: 12px 0; margin-bottom: 16px; border-bottom: 2px solid var(--c-border); }
      .cd-section { background: var(--c-surface); border: 1px solid var(--c-border); border-radius: 12px; padding: 20px; margin-bottom: 16px; }
      .cd-section-header { display: flex; justify-content: space-between; align-items: center; cursor: pointer; user-select: none; padding-bottom: 12px; }
      .cd-section-body { transition: max-height 0.3s; overflow: hidden; }
      .cd-section.collapsed .cd-section-body { max-height: 0 !important; padding: 0; overflow: hidden; }
      .cd-section.collapsed .cd-collapse-icon { transform: rotate(180deg); }
      .cd-collapse-icon { transition: transform 0.2s; color: var(--c-text-muted); }

      /* 디자인 썸네일 영역 */
      .cd-designs { display: flex; gap: 20px; justify-content: center; flex-wrap: wrap; padding: 16px 0; }
      .cd-design-item { text-align: center; }
      .cd-design-thumb { width: 160px; height: 160px; object-fit: contain; border: 1px solid var(--c-border); border-radius: 8px; background: var(--c-surface-secondary); cursor: pointer; }
      .cd-design-placeholder { display: flex; align-items: center; justify-content: center; }

      /* 원단+규격 */
      .cd-spec-row { display: flex; justify-content: space-between; align-items: baseline; padding: 8px 0; margin: 8px 0; }
      .cd-fabric { font-size: 22px; font-weight: 700; color: var(--c-info); }
      .cd-size { font-size: 28px; font-weight: 900; color: var(--c-text); }

      /* 부속품 */
      .cd-accessories { text-align: center; padding: 8px 12px; margin: 8px 0; border: 2px solid var(--c-danger); border-radius: 8px; color: var(--c-danger); font-weight: 700; font-size: 14px; }

      /* 생산 상세 테이블 */
      .cd-production-table { border: 1px solid var(--c-text); border-radius: 4px; margin: 12px 0; }
      .cd-prod-row { display: grid; grid-template-columns: 80px 1fr 80px 1fr; border-bottom: 1px solid var(--c-border); }
      .cd-prod-row:last-child { border-bottom: none; }
      .cd-prod-label { padding: 6px 10px; font-size: 12px; font-weight: 700; background: var(--c-border-light); text-align: center; border-right: 1px solid var(--c-border); }
      .cd-prod-value { padding: 6px 10px; font-size: 13px; }

      /* 배송 정보 */
      .cd-shipping { border: 1px solid var(--c-text); border-radius: 4px; margin: 12px 0; }
      .cd-ship-row { display: grid; grid-template-columns: 80px 1fr 80px 1fr; border-bottom: 1px solid var(--c-border); }
      .cd-ship-row:last-child { border-bottom: none; }
      .cd-ship-label { padding: 5px 10px; font-size: 11px; font-weight: 700; background: var(--c-border-light); text-align: center; border-right: 1px solid var(--c-border); }
      .cd-ship-value { padding: 5px 10px; font-size: 12px; }

      /* 비고 */
      .cd-notes { display: flex; gap: 8px; align-items: center; padding: 8px 12px; margin: 8px 0; border: 1px solid var(--c-border); border-radius: 4px; }

      /* ── 인쇄 스타일 ── */
      .print-only { display: none; }
      .cd-print-header { text-align: center; }
      .cd-print-title { font-size: 24px; font-weight: 900; letter-spacing: 10px; margin-bottom: 8px; }
      .cd-print-meta { display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 10px; }

      @media print {
        .no-print { display: none !important; }
        .print-only { display: block !important; }
        .cd-section { border: none; padding: 0; margin-bottom: 8px; box-shadow: none; }
        .cd-work-order { border: none; }
        .cd-designs { gap: 12px; }
        .cd-design-thumb { width: 140px; height: 140px; }
        .cd-header { display: none !important; }
        body { padding: 8px; }
        @page { size: A4; margin: 8mm; }
      }
    `,
    pageScript,
    pageContent: `
      <div id="cdRoot" class="max-w-3xl mx-auto">
        <div class="text-center py-20 text-gray-400"><i class="fas fa-spinner fa-spin mr-2"></i>로딩 중...</div>
      </div>
    `
  })
}
