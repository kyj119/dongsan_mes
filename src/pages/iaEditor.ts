import type { Context } from 'hono'
import type { HonoEnv } from '../types/env'
import { renderPage } from '../layout'
import pageScript from '../scripts/iaEditor.js?raw'

// IA 편집·네스팅·접수 워크벤치 (P1a: 업로드·파일 탭·그룹 썸네일)
// spec: docs/superpowers/specs/2026-06-16-ia-editor-nesting-intake.md §5.1
export function iaEditorPage(c: Context<HonoEnv>) {
  return renderPage(c, {
    title: 'IA 편집기',
    activePage: '/ia-editor',
    pageContent: `
      <div class="mb-4">
        <p class="text-sm text-gray-500">고객 AI 시안을 업로드 → 그룹 추출(ExtractGroups) → 그룹 선택 후 처리 설정(목표 크기·마감·회전)을 지정합니다. <span class="text-gray-400">시트 네스팅·주문 연결은 이후 단계.</span></p>
      </div>

      <!-- 업로드 드롭존 -->
      <div id="iaeDrop" class="border-2 border-dashed border-gray-300 rounded-xl p-6 text-center cursor-pointer transition-colors hover:border-blue-400 hover:bg-blue-50 mb-4">
        <i class="fas fa-cloud-arrow-up text-3xl text-gray-300 mb-2"></i>
        <div class="text-sm text-gray-600 font-medium">AI/EPS/PDF 파일을 끌어다 놓거나 클릭해 선택</div>
        <div class="text-xs text-gray-400 mt-1">여러 파일 동시 업로드 · 최대 50MB</div>
        <input id="iaeFileInput" type="file" multiple accept=".ai,.eps,.pdf,image/*" class="hidden">
      </div>

      <!-- 파일 탭 + 작업 영역 -->
      <div class="ds-card flex flex-col" style="min-height: 520px;">
        <div id="iaeTabs" class="flex items-stretch overflow-x-auto border-b border-gray-200 bg-gray-50/60" style="min-height: 44px;"></div>
        <div class="flex-1 p-4 relative">
          <div id="iaeEmpty" class="flex flex-col items-center justify-center text-gray-300 py-16">
            <i class="fas fa-layer-group text-5xl mb-3"></i>
            <div class="text-gray-400 text-sm">위에서 파일을 업로드하면 탭으로 추가되고 추출 그룹이 표시됩니다</div>
          </div>
          <div id="iaePanel"></div>
        </div>
      </div>
    `,
    pageScript
  })
}
