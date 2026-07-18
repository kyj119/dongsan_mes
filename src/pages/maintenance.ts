import type { Context } from 'hono'
import type { HonoEnv } from '../types/env'
import { renderPage } from '../layout'
import pageScript from '../scripts/maintenance.js?raw'

// 사이드바 통합(2026-07-18): /equipment 허브 '정비' 탭 이식용 단일소스 export. maintenance.js는 완전 IIFE(전역 0)라 충돌 없음.
export const maintenanceCSS = `
      .summary-card .label { font-size: var(--fs-xs); color: var(--c-text-secondary); margin-bottom: 4px; }
      .summary-card .value { font-size: 22px; font-weight: 700; }
    `

export const maintenanceContent = `
      <div class="page-header">
        <h1 class="page-title"><i class="fas fa-wrench mr-2"></i>정비 관리</h1>
        <p class="text-secondary">예방정비 스케줄 · 소모품 · 정비 이력 · 비용 분석</p>
      </div>
      <div id="maintenanceContent"></div>
    `

export function maintenancePage(c: Context<HonoEnv>) {
  return renderPage(c, {
    title: '정비 관리',
    activePage: '/maintenance',
    pageCSS: maintenanceCSS,
    pageContent: maintenanceContent,
    pageScript
  })
}
