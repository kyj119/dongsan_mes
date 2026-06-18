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
        <button id="iaeViewCanvas" class="px-4 py-2 rounded-lg text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50"><i class="fas fa-vector-square mr-1"></i>대지 편집</button>
        <button id="iaeViewNest" class="px-4 py-2 rounded-lg text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50"><i class="fas fa-layer-group mr-1"></i>네스팅 <span id="iaeNestCount" class="ml-1 rounded-full bg-gray-200 text-gray-700 px-2 text-xs">0</span></button>
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

      <!-- 대지 편집 뷰 (N1: 자유 대지 캔버스 — 그룹=객체, 실제크기, 드래그/리사이즈/회전) -->
      <div id="iaeCanvasView" class="hidden">
        <div class="ds-card flex flex-col" style="height: 620px;">
          <div class="flex items-center gap-2 px-3 py-2 border-b border-gray-200 bg-gray-50/60 text-xs flex-wrap">
            <button id="iaeCanFit" class="px-2 py-1 rounded-md border border-gray-200 hover:bg-gray-100"><i class="fas fa-expand mr-1"></i>전체보기</button>
            <button id="iaeCanZoomOut" class="px-2 py-1 rounded-md border border-gray-200 hover:bg-gray-100 w-7">−</button>
            <span id="iaeCanZoom" class="w-12 text-center text-gray-500">100%</span>
            <button id="iaeCanZoomIn" class="px-2 py-1 rounded-md border border-gray-200 hover:bg-gray-100 w-7">+</button>
            <span class="mx-1 text-gray-300">|</span>
            <label class="inline-flex items-center gap-1 text-gray-600 cursor-pointer"><input type="checkbox" id="iaeCanRatio" checked class="accent-blue-600">비율잠금</label>
            <button id="iaeCanPlaceAll" class="px-2 py-1 rounded-md bg-blue-600 text-white hover:bg-blue-700"><i class="fas fa-table-cells mr-1"></i>모두 배치</button>
            <button id="iaeCanNestBtn" class="px-2 py-1 rounded-md border border-blue-200 text-blue-600 hover:bg-blue-50"><i class="fas fa-layer-group mr-1"></i>시트 네스팅</button>
            <button id="iaeCanClear" class="px-2 py-1 rounded-md border border-gray-200 text-gray-500 hover:bg-gray-100">대지 비우기</button>
            <span class="ml-auto text-gray-400 hidden md:inline">R 회전 · D 복제 · Del 제거 · ←↑↓→ 이동(Shift=10mm) · 휠 줌 · Space+드래그 팬 · Esc 해제</span>
          </div>
          <div class="flex flex-1 min-h-0">
            <div id="iaeCanPalette" class="w-44 flex-shrink-0 border-r border-gray-200 overflow-y-auto p-2 bg-white"></div>
            <div id="iaeCanHost" tabindex="0" class="flex-1 bg-gray-100 relative overflow-hidden outline-none"></div>
            <div id="iaeCanInspector" class="w-72 flex-shrink-0 border-l border-gray-200 overflow-y-auto p-3 bg-white hidden"></div>
          </div>
          <div id="iaeCanStatus" class="px-3 py-1.5 border-t border-gray-200 bg-gray-50/60 text-[11px] text-gray-500">팔레트에서 그룹을 클릭해 대지에 추가하세요</div>
        </div>
      </div>

      <!-- 네스팅 뷰 -->
      <div id="iaeNestView" class="hidden">
        <div class="ds-card p-4" style="min-height: 520px;">
          <div id="iaeNestBody"></div>
        </div>
      </div>
    `,
    pageScript
  })
}
