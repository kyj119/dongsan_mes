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

      /* 규격 = 시안 바로 아래 한 곳(2026-08-10 단일화). 우측 대표 규격(.cd-spec-row)은 제거 —
         첫 품목 기준이라 다품목에서 무엇의 치수인지 모호했다. 현장 가독성 위해 크게 둔다. */
      .cd-item-size { font-size: 18px; font-weight: 800; color: var(--c-text); margin-top: 6px; letter-spacing: -0.5px; }
      .cd-item-size .cd-unit { font-size: 12px; font-weight: 600; color: var(--c-text-muted); margin-left: 2px; }

      /* 부속품 */
      .cd-accessories { text-align: center; padding: 8px 12px; margin: 8px 0; border: 2px solid var(--c-danger); border-radius: 8px; color: var(--c-danger); font-weight: 700; font-size: 14px; }

      /* 다품목(규격·마감 상이) 카드 — 품목별 지시표. 첫 품목 기준 요약은 오작업을 부른다. */
      .cd-mixed-note { padding: 8px 12px; margin: 8px 0; border: 2px solid var(--c-warning); border-radius: 8px; background: var(--c-warning-light); color: var(--c-warning); font-size: 13px; font-weight: 700; }
      /* 전사 라인은 7열이라 현장 태블릿(768px)에서 넘친다 → 표만 가로 스크롤(본문은 안 밀리게).
         인쇄에선 스크롤 컨테이너가 내용을 자르므로 해제한다. */
      .cd-multi-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; }
      .cd-multi { width: 100%; min-width: 520px; border-collapse: collapse; margin: 8px 0; border: 1px solid var(--c-text); }
      .cd-multi th, .cd-multi td { border: 1px solid var(--c-border); padding: 6px 8px; font-size: 12px; text-align: center; }
      .cd-multi th { background: var(--c-border-light); font-weight: 700; }
      .cd-multi td.name { text-align: left; font-weight: 600; }
      .cd-multi td.qty { color: var(--c-danger); font-weight: 700; }

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
      .cd-print-header { text-align: center; position: relative; }
      /* 종이 → 화면 복귀용 QR (이 카드의 /cards/:id). 우상단 고정. */
      .cd-print-qr { position: absolute; right: 0; top: 0; text-align: center; }
      .cd-print-qr img { width: 66px; height: 66px; display: block; }
      .cd-print-qr-no { font-size: 8px; font-family: ui-monospace, monospace; color: #374151; margin-top: 1px; }
      .cd-print-title { font-size: 24px; font-weight: 900; letter-spacing: 10px; margin-bottom: 8px; }
      .cd-print-meta { display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 10px; }

      @media print {
        .cd-multi-wrap { overflow: visible !important; }
        .cd-multi { min-width: 0 !important; }
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
