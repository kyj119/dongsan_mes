import type { Context } from 'hono'
import type { HonoEnv } from '../types/env'
import { renderPage } from '../layout'
import iaeScript from '../scripts/iaEditor.js?raw'
// Phase 7b: /workbench(시안 검수) 페이지를 이 화면의 3번째 뷰로 흡수.
//   전역 스코프 충돌 없음 — 검수는 wb* , 편집기는 iae* 프리픽스([[feedback-raw-concat-global-scope]]).
import wbScript from '../scripts/workbench.js?raw'

const pageScript = iaeScript + '\n' + wbScript

// IA 편집·네스팅·접수 워크벤치
// spec: docs/superpowers/specs/2026-06-16-ia-editor-nesting-intake.md
//   P1a 업로드·탭·그룹 · P1b 원본 아카이브 · P2 처리설정 인스펙터+근사 미리보기 · P3 시트 네스팅
export function iaEditorPage(c: Context<HonoEnv>) {
  return renderPage(c, {
    title: 'IA 편집기',
    activePage: '/ia-editor',
    pageContent: `
      <div class="mb-4">
        <p class="text-sm text-gray-500">고객 AI 시안 업로드 → 그룹 추출(ExtractGroups) → 처리 설정(크기·마감·회전) → 시트 네스팅 · 여러 파일 모아찍기(임포지션). <span class="text-gray-400">주문 연결은 이후 단계.</span></p>
      </div>

      <!-- 뷰 토글 -->
      <div class="flex gap-2 mb-4">
        <button id="iaeViewEdit" class="px-4 py-2 rounded-lg text-sm font-medium border border-blue-500 bg-blue-50 text-blue-700"><i class="fas fa-object-group mr-1"></i>파일 처리</button>
        <button id="iaeViewCanvas" class="px-4 py-2 rounded-lg text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50"><i class="fas fa-layer-group mr-1"></i>네스팅/모아찍기</button>
        <button id="iaeViewReview" class="px-4 py-2 rounded-lg text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50"><i class="fas fa-clipboard-check mr-1"></i>시안 검수</button>
      </div>

      <!-- 파일 처리 뷰 -->
      <div id="iaeEditView">
        <div id="iaeDrop" class="border-2 border-dashed border-gray-300 rounded-xl p-6 text-center cursor-pointer transition-colors hover:border-blue-400 hover:bg-blue-50 mb-4">
          <i class="fas fa-cloud-arrow-up text-3xl text-gray-300 mb-2"></i>
          <div class="text-sm text-gray-600 font-medium">AI/EPS/PDF 파일을 끌어다 놓거나 클릭해 선택</div>
          <div class="text-xs text-gray-400 mt-1">여러 파일 동시 업로드 · 최대 50MB</div>
          <div class="text-[11px] text-amber-500 mt-1"><i class="fas fa-circle-info mr-1"></i>텍스트는 <b>아웃라인</b> 후 업로드 권장 — 레거시 텍스트·미설치 폰트 등 '열기 경고'가 있는 파일은 처리되지 않습니다</div>
          <input id="iaeFileInput" type="file" multiple accept=".ai,.eps,.pdf,image/*" class="hidden">
        </div>
        <div class="mb-4">
          <button id="iaeNasBtn" class="text-xs px-3 py-1.5 rounded-md border border-gray-300 text-gray-600 hover:bg-gray-50"><i class="fas fa-folder-open mr-1"></i>NAS에서 분석 <span class="text-gray-400">(대용량·업로드 없이 · Z:\\Designs\\IA-입력)</span></button>
          <button id="iaeIntakeBtn" class="text-xs px-3 py-1.5 rounded-md border border-amber-300 text-amber-700 hover:bg-amber-50 ml-1"><i class="fas fa-inbox mr-1"></i>모아찍기 대기함 <span class="text-amber-400">(일러 MES 패널 등록분)</span></button>
          <!-- 에이전트 상태 배지: 렌더(EPS 출력) 가능 여부를 알려준다. Phase 7a 이전엔 가공 이력 보드
               헤더가 이 span 을 만들었는데 그 보드를 제거하면서 페이지 템플릿의 고정 자리로 옮겼다
               (JS 주입 → 정적 배치. check:dom 이 ID 를 찾을 수 있어 silent-fail 위험도 사라진다). -->
          <span id="iaeAgentBadge" class="text-[11px] rounded-full px-2 py-0.5 bg-gray-100 text-gray-500 ml-2"><i class="fas fa-circle-notch fa-spin mr-1"></i>에이전트 확인 중</span>
          <div id="iaeNasPanel" class="hidden mt-2 border border-gray-200 rounded-lg p-3 bg-white"></div>
          <div id="iaeIntakePanel" class="hidden mt-2 border border-amber-200 rounded-lg p-3 bg-white"></div>
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

      <!-- 시안 검수 뷰 (Phase 7b: 구 /workbench 흡수 — AI 그룹 ↔ 주문 품목 매칭) -->
      <div id="iaeReviewView" class="hidden">
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
          <div class="ds-card p-4">
            <div class="text-sm text-gray-600 mb-1">검수 대상 주문</div>
            <div class="text-2xl font-bold text-gray-900" id="statTotal">-</div>
          </div>
          <div class="ds-card p-4">
            <div class="text-sm text-gray-600 mb-1">매칭 완료</div>
            <div class="text-2xl font-bold text-green-600" id="statMatched">-</div>
          </div>
          <div class="ds-card p-4">
            <div class="text-sm text-gray-600 mb-1">미매칭 품목 보유</div>
            <div class="text-2xl font-bold text-amber-500" id="statUnmatched">-</div>
          </div>
          <div class="ds-card p-4">
            <div class="text-sm text-gray-600 mb-1">분석 실패</div>
            <div class="text-2xl font-bold text-red-600" id="statFailed">-</div>
          </div>
        </div>

        <div class="flex gap-4" style="min-height: 600px;">
          <!-- 좌: 주문 목록 -->
          <div class="flex-shrink-0 w-80 ds-card flex flex-col">
            <div class="p-3 border-b border-gray-200">
              <div class="flex gap-2">
                <input id="wbSearch" type="text" placeholder="주문번호/거래처 검색"
                       class="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                <button id="wbSearchBtn" class="bg-blue-600 text-white rounded-lg px-3 py-2 text-sm hover:bg-blue-700">
                  <i class="fas fa-search"></i>
                </button>
              </div>
            </div>
            <div id="wbOrderList" class="flex-1 overflow-y-auto divide-y divide-gray-100">
              <div class="text-center text-gray-400 py-8 text-sm">주문을 불러오는 중...</div>
            </div>
          </div>

          <!-- 우: 검수 패널 -->
          <div class="flex-1 ds-card flex flex-col">
            <div id="wbDetailHeader" class="p-4 border-b border-gray-200">
              <div class="text-sm text-gray-500">좌측에서 주문을 선택하세요</div>
            </div>
            <div id="wbDetailBody" class="flex-1 overflow-y-auto p-4">
              <div class="flex flex-col items-center justify-center h-full text-gray-300">
                <i class="fas fa-object-group text-5xl mb-3"></i>
                <div class="text-gray-400 text-sm">주문을 선택하면 AI 그룹과 품목 매칭을 검수할 수 있습니다</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `,
    pageScript
  })
}
