// 창고 구역 관리 페이지
import type { Context } from 'hono'
import type { HonoEnv } from '../types/env'
import { renderPage } from '../layout'
import storageZonesScript from '../scripts/storageZones.js?raw'
import zonePickerScript from '../scripts/zonePicker.js?raw'

export function storageZonesPage(c: Context<HonoEnv>) {
  const pageContent = `
<div class="max-w-7xl mx-auto px-6 pt-6 space-y-6">
  <div class="flex items-center justify-between">
    <div>
      <h2 class="text-xl font-bold text-gray-900">창고 구역 관리</h2>
      <p class="text-sm text-gray-500 mt-1">법인별 창고 구역 및 품목 배정 관리</p>
    </div>
    <div class="flex items-center gap-3">
      <select id="entityFilter" class="border border-gray-300 rounded-lg px-3 py-2 text-sm" onchange="onEntityFilterChange()">
        <option value="0">전체 법인</option>
      </select>
      <button onclick="openAddZoneModal()" class="bg-blue-600 text-white rounded-lg px-4 py-2 text-sm hover:bg-blue-700">
        <i class="fas fa-plus mr-1"></i>구역 추가
      </button>
    </div>
  </div>

  <!-- 탭: 목록 / 배치도 (0440 창고 배치도 독립) -->
  <div class="flex items-center gap-1 border-b border-gray-200">
    <button id="szTabList" onclick="szSwitchTab('list')" class="px-4 py-2 text-sm font-semibold text-blue-600 border-b-2 border-blue-600 -mb-px">
      <i class="fas fa-list mr-1"></i>목록
    </button>
    <button id="szTabLayout" onclick="szSwitchTab('layout')" class="px-4 py-2 text-sm font-medium text-gray-500 border-b-2 border-transparent -mb-px hover:text-gray-700">
      <i class="fas fa-map-marked-alt mr-1"></i>배치도
    </button>
    <button id="szTabAssign" onclick="szSwitchTab('assign')" class="px-4 py-2 text-sm font-medium text-gray-500 border-b-2 border-transparent -mb-px hover:text-gray-700">
      <i class="fas fa-boxes-stacked mr-1"></i>품목 배정
    </button>
  </div>

  <!-- 품목 배정 (2026-09-04) — 「어느 구역에 무엇이 있나」를 여기서만 관리한다.
       종전엔 품목 등록 폼의 「창고 구역」 셀렉트와 재고현황의 「기본창고 일괄 배정」 모달로 갈려 있었고,
       둘 다 items.storage_zone_id(법인 공유 칸)만 바꿔 **실사표가 따라오지 않았다**.
       정본은 inventory 행이고, 그 행을 만들고 없애는 화면이 이것이다.
       ⚠️이 파일은 백틱 템플릿이다 — 주석에도 백틱을 쓰지 말 것(CLAUDE.md 알려진 함정). -->
  <div id="szPanelAssign" class="hidden space-y-3">
    <div class="ds-card p-4">
      <div class="flex items-center gap-3 flex-wrap">
        <label class="text-sm font-semibold text-gray-700">구역</label>
        <select id="szAssignZone" onchange="szAssignLoad()" class="ds-input" style="min-width:200px"></select>
        <span id="szAssignMeta" class="text-xs text-gray-500"></span>
        <button onclick="szAssignStartCount()" class="ds-btn ds-btn-sm ml-auto" title="이 구역을 대상으로 재고 실사를 시작합니다">
          <i class="fas fa-clipboard-check mr-1"></i>이 구역 실사
        </button>
      </div>
    </div>
    <!-- ⚠️2열로 두면 선택기가 **절반 폭**에 갇혀 규격 칩을 가로로 못 편다(용준님 2026-09-04 지적).
         선택기가 주 작업면이므로 **전체 폭**으로 올리고, 보유 목록은 아래에 접어 둔다.
         보유 여부는 선택기 안에서 회색 칩으로 이미 보이므로 아래 목록은 **수량 확인·빼기 전용**이다. -->
    <div class="ds-card p-4">
      <div class="flex items-center justify-between mb-2">
        <h3 class="text-sm font-bold text-gray-800">추가할 품목</h3>
        <button id="szAssignApply" onclick="szAssignApply()" class="ds-btn ds-btn-primary ds-btn-sm">추가</button>
      </div>
      <!-- 선택기 = scripts/zonePicker.js (실사 「품목 추가」와 같은 화면) -->
      <div id="szAssignCand" style="max-height:60vh;overflow-y:auto;"></div>
    </div>

    <div class="ds-card p-4">
      <button onclick="szAssignToggleHeld()" class="w-full flex items-center gap-2 text-left">
        <span id="szAssignHeldCaret" class="text-gray-400 text-xs">▸</span>
        <h3 class="text-sm font-bold text-gray-800">이 구역의 품목</h3>
        <span id="szAssignHeldCount" class="text-xs text-gray-400"></span>
        <span class="ml-auto text-xs text-gray-400">수량 확인 · 빼기</span>
      </button>
      <div id="szAssignHeld" class="hidden mt-2" style="max-height:420px;overflow-y:auto;"></div>
    </div>
  </div>

  <div id="szPanelList">
  <div class="ds-card hover:shadow-md transition-shadow overflow-hidden">
    <table class="w-full text-sm ds-table ds-table-striped ds-table-fixed">
      <thead>
        <tr>
          <th class="col-tag text-left">법인</th>
          <th class="col-name text-left">구역명</th>
          <th class="col-code text-left">코드</th>
          <th class="col-flex text-left">설명</th>
          <th class="col-tag text-left">담당자</th>
          <th class="col-qty text-center">품목 수</th>
          <th class="col-status text-center">상태</th>
          <th class="col-action text-center">동작</th>
        </tr>
      </thead>
      <tbody id="storageZonesBody"></tbody>
    </table>
    <div id="noZonesMsg" class="hidden text-center py-12">
      <i class="fas fa-warehouse text-3xl mb-3 block text-gray-300"></i>
      <div class="text-sm text-gray-500 mb-1">등록된 창고 구역이 없습니다.</div>
      <button onclick="openAddZoneModal()" class="px-3 py-1.5 text-xs bg-blue-600 text-white rounded mt-2 hover:bg-blue-700">+ 구역 추가</button>
    </div>
  </div>
  </div>

  <!-- 배치도 탭 (0440: 창고 전용 도면 위 storage_zones.bounds 직접 배치) -->
  <div id="szPanelLayout" class="hidden">
    <div class="ds-card p-4">
      <div class="flex items-center justify-between mb-3 gap-2 flex-wrap">
        <div class="text-xs text-gray-400">구역 클릭 = 재고 상세 · 편집 모드에서 드래그/리사이즈</div>
        <div class="flex items-center gap-2">
          <input type="file" id="szPlanInput" accept="image/*" class="hidden" onchange="szOnPlanSelected(this)">
          <button id="btnSzUploadPlan" onclick="document.getElementById('szPlanInput').click()" class="hidden px-3 py-1 text-xs rounded border border-gray-300 bg-white text-gray-600 hover:bg-gray-50 items-center gap-1">
            <i class="fas fa-image"></i><span>도면 업로드</span>
          </button>
          <button id="btnSzDeletePlan" onclick="szDeletePlan()" class="hidden px-3 py-1 text-xs rounded border border-red-200 bg-white text-red-500 hover:bg-red-50 items-center gap-1">
            <i class="fas fa-trash"></i><span>도면 삭제</span>
          </button>
          <button id="btnSzEditLayout" onclick="szToggleEdit()" class="px-3 py-1 text-xs rounded border border-gray-300 bg-white text-gray-600 hover:bg-gray-50 flex items-center gap-1">
            <i class="fas fa-lock"></i><span>배치 편집</span>
          </button>
        </div>
      </div>
      <div id="szLayoutCanvas" style="height:580px; position:relative; overflow:hidden; border-radius:8px; background:var(--c-bg); border:1px solid var(--c-border);">
        <div id="szLayoutBg" style="position:absolute;inset:0;z-index:0;background-size:100% 100%;background-position:center;background-repeat:no-repeat;"></div>
        <div id="szLayoutZones" style="position:absolute;inset:0;z-index:1;"></div>
        <div id="szLayoutEmpty" style="position:absolute;inset:0;display:none;align-items:center;justify-content:center;z-index:5;pointer-events:none;">
          <div class="text-center text-gray-400">
            <i class="fas fa-warehouse text-4xl mb-2"></i>
            <p class="text-sm">배치된 창고 구역이 없습니다. 편집 모드에서 아래 미배치 창고를 배치하세요.</p>
          </div>
        </div>
      </div>
      <div id="szUnplacedTray" class="mt-3"></div>
    </div>
  </div>

</div>

<!-- 구역 재고 상세 모달 (배치도 클릭) -->
<div id="szZoneInvModal" class="ds-modal-overlay hidden flex items-center justify-center">
  <div class="ds-modal" style="max-width:34rem">
    <div class="px-5 py-3 border-b border-gray-200 flex items-center justify-between">
      <h3 id="szZoneInvTitle" class="text-base font-bold text-gray-900">구역 재고</h3>
      <button onclick="szCloseZoneInv()" class="text-gray-400 hover:text-gray-600"><i class="fas fa-times"></i></button>
    </div>
    <div id="szZoneInvBody" class="p-5" style="max-height:60vh;overflow-y:auto;"></div>
  </div>
</div>

<!-- 구역 추가/수정 모달 -->
<div id="zoneModal" class="ds-modal-overlay hidden flex items-center justify-center">
  <div class="ds-modal" style="max-width:32rem">
    <div class="px-5 py-3 border-b border-gray-200 flex items-center justify-between">
      <h3 id="zoneModalTitle" class="text-base font-bold text-gray-900">창고 구역 추가</h3>
      <button onclick="closeZoneModal()" class="text-gray-400 hover:text-gray-600"><i class="fas fa-times"></i></button>
    </div>
    <div class="p-5 space-y-3">
      <input type="hidden" id="zoneModalId">
      <div>
        <label class="block text-xs font-semibold text-gray-700 mb-1">구역명 *</label>
        <input type="text" id="zoneModalName" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="예: 원단 창고">
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="block text-xs font-semibold text-gray-700 mb-1">법인 *</label>
          <select id="zoneModalEntity" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"></select>
        </div>
        <div>
          <label class="block text-xs font-semibold text-gray-700 mb-1">코드</label>
          <input type="text" id="zoneModalCode" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="예: FABRIC">
        </div>
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="block text-xs font-semibold text-gray-700 mb-1">담당자</label>
          <select id="zoneModalManager" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
            <option value="">미지정</option>
          </select>
        </div>
        <div>
          <label class="block text-xs font-semibold text-gray-700 mb-1">정렬 순서</label>
          <input type="number" id="zoneModalSort" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-right" value="0">
        </div>
      </div>
      <div>
        <label class="block text-xs font-semibold text-gray-700 mb-1">배치도 색상</label>
        <input type="color" id="zoneModalColor" value="#3B82F6" class="w-16 h-9 border border-gray-300 rounded cursor-pointer p-0.5">
      </div>
      <div>
        <label class="block text-xs font-semibold text-gray-700 mb-1">설명</label>
        <textarea id="zoneModalDesc" rows="2" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="선택"></textarea>
      </div>
      <div class="flex items-center gap-4">
        <label class="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" id="zoneModalActive" class="w-4 h-4" checked>
          활성
        </label>
        <label class="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" id="zoneModalDefault" class="w-4 h-4">
          기본 출고 창고
        </label>
      </div>
    </div>
    <div class="flex justify-end gap-2 px-5 py-3 border-t border-gray-200">
      <button onclick="closeZoneModal()" class="border border-gray-300 bg-white text-gray-700 rounded-lg px-4 py-2 text-sm hover:bg-gray-50">취소</button>
      <button id="zoneModalSaveBtn" onclick="saveZone()" class="ds-btn ds-btn-primary text-sm">저장</button>
    </div>
  </div>
</div>
`
  return renderPage(c, {
    title: '창고 관리',
    activePage: '/storage-zones',
    pageContent,
    // zonePicker 를 먼저 붙인다 — 선언은 호이스팅되지만 `_zp` 초기화가 먼저 돌아야 안전하다.
    pageScript: zonePickerScript + '\n' + storageZonesScript,
  })
}
