import type { Context } from 'hono'
import type { HonoEnv } from '../types/env'
import { renderPage } from '../layout'
import pageScript from '../scripts/specGroups.js?raw'

// 규격그룹 관리 페이지 — 호수·판재두께·원단폭 등 규격그룹 + 값 self-service 관리
// spec: docs/superpowers/specs/2026-06-20-spec-group-variant-item-plan.md §5
export function specGroupsPage(c: Context<HonoEnv>) {
  return renderPage(c, {
    title: '규격그룹 관리',
    activePage: '/spec-groups',
    pageContent: `
      <div class="space-y-4">
        <div class="ds-card p-3 flex items-center gap-2 flex-wrap">
          <div>
            <div class="text-sm font-semibold text-gray-800"><i class="fas fa-layer-group mr-1 text-indigo-500"></i>규격그룹 관리</div>
            <div class="text-xs text-gray-500 mt-0.5">호수·판재두께·원단폭 등 변종 규격을 정의합니다. 품목 페이지에서 이 그룹으로 변종을 생성합니다.</div>
          </div>
          <div class="flex-1"></div>
          <button onclick="sgpOpenGroupModal(0)" class="ds-btn ds-btn-primary px-3 py-1.5 text-xs">
            <i class="fas fa-plus mr-1"></i>새 규격그룹
          </button>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <!-- 좌: 그룹 목록 -->
          <div class="ds-card overflow-hidden lg:col-span-1">
            <div class="px-3 py-2 border-b bg-gray-50 text-xs font-semibold text-gray-600">규격그룹</div>
            <div id="sgpGroupList" class="divide-y">
              <div class="p-4 text-center text-gray-400 text-sm">로드 중...</div>
            </div>
          </div>

          <!-- 우: 선택 그룹 상세 (값 목록) -->
          <div class="lg:col-span-2 space-y-4">
            <div id="sgpDetail" class="ds-card p-6 text-center text-gray-400 text-sm">
              왼쪽에서 규격그룹을 선택하세요.
            </div>
          </div>
        </div>
      </div>

      <!-- 그룹 생성/수정 모달 -->
      <div id="sgpGroupModal" class="fixed inset-0 z-50 hidden" style="background:rgba(0,0,0,.4);">
        <div class="flex items-center justify-center min-h-screen p-4">
          <div class="ds-modal w-full" style="max-width:24rem">
            <div class="flex items-center justify-between p-4 border-b">
              <h3 class="text-lg font-semibold" id="sgpGroupModalTitle">새 규격그룹</h3>
              <button onclick="sgpCloseGroupModal()" class="text-gray-400 hover:text-gray-600"><i class="fas fa-times"></i></button>
            </div>
            <div class="p-4 space-y-3">
              <input type="hidden" id="sgpGroupId" value="0">
              <div>
                <label class="text-xs text-gray-600 block mb-1">그룹명 <span class="text-red-500">*</span></label>
                <input type="text" id="sgpGroupName" class="w-full border rounded px-2 py-1 text-sm" placeholder="예: 원단폭">
              </div>
              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="text-xs text-gray-600 block mb-1">단위</label>
                  <input type="text" id="sgpGroupUnit" class="w-full border rounded px-2 py-1 text-sm" placeholder="예: mm / T / 호">
                </div>
                <div>
                  <label class="text-xs text-gray-600 block mb-1">정렬순서</label>
                  <input type="number" id="sgpGroupSort" class="w-full border rounded px-2 py-1 text-sm" value="0">
                </div>
              </div>
            </div>
            <div class="flex justify-end gap-2 p-4 border-t">
              <button onclick="sgpCloseGroupModal()" class="px-4 py-2 text-sm bg-gray-200 text-gray-700 rounded hover:bg-gray-300">취소</button>
              <button onclick="sgpSaveGroup()" class="ds-btn ds-btn-primary text-sm">저장</button>
            </div>
          </div>
        </div>
      </div>

      <!-- 변종 생성 모달 -->
      <div id="sgpVariantModal" class="fixed inset-0 z-50 hidden" style="background:rgba(0,0,0,.4);">
        <div class="flex items-center justify-center min-h-screen p-4">
          <div class="ds-modal w-full max-h-[90vh] overflow-y-auto" style="max-width:30rem">
            <div class="flex items-center justify-between p-4 border-b">
              <h3 class="text-lg font-semibold" id="sgpVariantTitle">변종 생성</h3>
              <button onclick="sgpCloseVariantModal()" class="text-gray-400 hover:text-gray-600"><i class="fas fa-times"></i></button>
            </div>
            <div class="p-4 space-y-3">
              <input type="hidden" id="sgpVariantBaseId" value="0">
              <div class="text-xs text-gray-500" id="sgpVariantHint">생성할 규격값을 선택하세요. 이미 존재하는 변종은 건너뜁니다(멱등).</div>
              <div class="flex items-center gap-3 text-xs">
                <button onclick="sgpVariantCheckAll(true)" class="text-indigo-600 hover:underline">전체 선택</button>
                <button onclick="sgpVariantCheckAll(false)" class="text-gray-500 hover:underline">전체 해제</button>
              </div>
              <div id="sgpVariantValues" class="grid grid-cols-2 gap-1.5 max-h-72 overflow-y-auto"></div>
            </div>
            <div class="flex justify-end gap-2 p-4 border-t">
              <button onclick="sgpCloseVariantModal()" class="px-4 py-2 text-sm bg-gray-200 text-gray-700 rounded hover:bg-gray-300">취소</button>
              <button onclick="sgpGenerateVariants()" class="ds-btn ds-btn-primary text-sm"><i class="fas fa-wand-magic-sparkles mr-1"></i>변종 생성</button>
            </div>
          </div>
        </div>
      </div>

      <!-- base 품목 연결 모달 -->
      <div id="sgpConnectModal" class="fixed inset-0 z-50 hidden" style="background:rgba(0,0,0,.4);">
        <div class="flex items-center justify-center min-h-screen p-4">
          <div class="ds-modal w-full" style="max-width:26rem">
            <div class="flex items-center justify-between p-4 border-b">
              <h3 class="text-lg font-semibold">base 품목 연결</h3>
              <button onclick="sgpCloseConnectModal()" class="text-gray-400 hover:text-gray-600"><i class="fas fa-times"></i></button>
            </div>
            <div class="p-4 space-y-2">
              <div class="text-xs text-gray-500">이 규격그룹으로 변종을 만들 base 품목을 검색해 연결합니다.</div>
              <input type="text" id="sgpConnectSearch" class="w-full border rounded px-2 py-1 text-sm" placeholder="품목명/코드 검색..." oninput="sgpConnectSearchDebounced()" autocomplete="off">
              <div id="sgpConnectResults" class="max-h-72 overflow-y-auto border rounded divide-y"></div>
            </div>
            <div class="flex justify-end gap-2 p-4 border-t">
              <button onclick="sgpCloseConnectModal()" class="px-4 py-2 text-sm bg-gray-200 text-gray-700 rounded hover:bg-gray-300">닫기</button>
            </div>
          </div>
        </div>
      </div>
    `,
    pageScript,
  })
}
