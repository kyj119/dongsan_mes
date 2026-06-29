import type { Context } from 'hono'
import type { HonoEnv } from '../types/env'
import { renderPage } from '../layout'
import pageScript from '../scripts/iaEditor.js?raw'

// IA 편집·네스팅·접수 워크벤치
// spec: docs/superpowers/specs/2026-06-16-ia-editor-nesting-intake.md
//   P1a 업로드·탭·그룹 · P1b 원본 아카이브 · P2 처리설정 인스펙터+근사 미리보기 · P3 시트 네스팅
export function iaEditorPage(c: Context<HonoEnv>) {
  return renderPage(c, {
    title: 'IA 편집기',
    activePage: '/ia-editor',
    pageContent: `
      <div class="mb-4">
        <p class="text-sm text-gray-500">고객 AI 시안 업로드 → 그룹 추출(ExtractGroups) → 처리 설정(크기·마감·회전) → 동일 품목 시트 네스팅. <span class="text-gray-400">주문 연결은 이후 단계.</span></p>
      </div>

      <!-- 뷰 토글 -->
      <div class="flex gap-2 mb-4">
        <button id="iaeViewEdit" class="px-4 py-2 rounded-lg text-sm font-medium border border-blue-500 bg-blue-50 text-blue-700"><i class="fas fa-object-group mr-1"></i>파일 처리</button>
        <button id="iaeViewCanvas" class="px-4 py-2 rounded-lg text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50"><i class="fas fa-layer-group mr-1"></i>네스팅</button>
      </div>

      <!-- 파일 처리 뷰 -->
      <div id="iaeEditView">
        <div id="iaeDrop" class="border-2 border-dashed border-gray-300 rounded-xl p-6 text-center cursor-pointer transition-colors hover:border-blue-400 hover:bg-blue-50 mb-4">
          <i class="fas fa-cloud-arrow-up text-3xl text-gray-300 mb-2"></i>
          <div class="text-sm text-gray-600 font-medium">AI/EPS/PDF 파일을 끌어다 놓거나 클릭해 선택</div>
          <div class="text-xs text-gray-400 mt-1">여러 파일 동시 업로드 · 최대 50MB</div>
          <input id="iaeFileInput" type="file" multiple accept=".ai,.eps,.pdf,image/*" class="hidden">
        </div>
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
      </div>

      <!-- 네스팅 뷰 (동일 품목 시트 자동 배치 → 정적 미리보기 → EPS/주문). 자유드래그 없음. -->
      <div id="iaeCanvasView" class="hidden">
        <div class="ds-card flex" style="min-height: 620px;">
          <!-- 좌: 네스팅 설정 폼 (iaeCanRenderNestPanel이 렌더) -->
          <div id="iaeCanInspector" class="w-80 flex-shrink-0 border-r border-gray-200 overflow-y-auto p-3 bg-white"></div>
          <!-- 우: 자동 배치 정적 미리보기 (SVG) -->
          <div class="flex-1 min-w-0 p-4 bg-gray-50 overflow-auto">
            <div id="iaeNestPreview" class="min-h-[480px] flex items-center justify-center text-gray-300 text-sm text-center">
              왼쪽에서 그룹·수량·시트 규격을 설정하고 <b class="mx-1">자동 배치</b>를 누르면<br>시트 배치 미리보기가 표시됩니다.
            </div>
          </div>
        </div>
      </div>
    `,
    pageScript
  })
}
