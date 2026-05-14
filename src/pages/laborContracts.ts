import type { Context } from 'hono'
import type { HonoEnv } from '../types/env'
import { renderPage } from '../layout'
import pageScript from '../scripts/laborContracts.js?raw'

export function laborContractsPage(c: Context<HonoEnv>) {
  return renderPage(c, {
    title: '근로계약 관리',
    activePage: '/labor-contracts',
    pageContent: `
      <div class="space-y-4">
        <!-- KPI 카드 -->
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div class="bg-white rounded-lg border shadow-sm p-4">
            <div class="text-xs text-gray-500">전체 계약</div>
            <div class="text-2xl font-bold text-gray-900 mt-1" id="lcKpiTotal">-</div>
          </div>
          <div class="bg-white rounded-lg border shadow-sm p-4">
            <div class="text-xs text-gray-500">서명 대기</div>
            <div class="text-2xl font-bold text-amber-600 mt-1" id="lcKpiPending">-</div>
          </div>
          <div class="bg-white rounded-lg border shadow-sm p-4">
            <div class="text-xs text-gray-500">만료 임박 (30일)</div>
            <div class="text-2xl font-bold text-red-600 mt-1" id="lcKpiExpiring">-</div>
          </div>
        </div>

        <!-- 필터 바 -->
        <div class="bg-white rounded-lg border shadow-sm p-3 flex items-center gap-2 flex-wrap">
          <input type="text" id="lcSearch" placeholder="직원 검색..." class="border rounded px-2 py-1 text-xs w-40" onkeydown="if(event.key==='Enter')lcLoad()">
          <select id="lcStatusFilter" class="border rounded px-2 py-1 text-xs">
            <option value="">전체 상태</option>
            <option value="DRAFT">작성중</option>
            <option value="PENDING_SIGNATURE">서명 대기</option>
            <option value="SIGNED">서명 완료</option>
            <option value="EXPIRED">만료</option>
          </select>
          <button onclick="lcLoad()" class="px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700">
            <i class="fas fa-search mr-1"></i>조회
          </button>
          <div class="flex-1"></div>
          <button onclick="lcOpenEditModal(0)" class="px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700">
            <i class="fas fa-plus mr-1"></i>계약서 작성
          </button>
        </div>

        <!-- 테이블 -->
        <div class="bg-white rounded-lg border shadow-sm overflow-hidden">
          <div class="overflow-x-auto">
            <table class="w-full text-sm ds-table-striped">
              <thead class="bg-gray-50 text-xs text-gray-600 uppercase tracking-wider">
                <tr>
                  <th class="px-3 py-2 text-left">직원명</th>
                  <th class="px-3 py-2 text-left">소속법인</th>
                  <th class="px-3 py-2 text-left">계약유형</th>
                  <th class="px-3 py-2 text-left">계약기간</th>
                  <th class="px-3 py-2 text-right">시급</th>
                  <th class="px-3 py-2 text-center">상태</th>
                  <th class="px-3 py-2 text-center">서명일</th>
                  <th class="px-3 py-2 text-center">액션</th>
                </tr>
              </thead>
              <tbody id="lcBody">
                <tr><td colspan="8" class="text-center text-gray-400 py-6">로드 중...</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- 계약서 생성/수정 모달 -->
      <div id="lcEditModal" class="fixed inset-0 z-50 hidden" style="background:rgba(0,0,0,.4);">
        <div class="flex items-center justify-center min-h-screen p-4">
          <div class="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div class="flex items-center justify-between p-4 border-b">
              <h3 class="text-lg font-semibold" id="lcEditTitle">계약서 작성</h3>
              <button onclick="lcCloseEditModal()" class="text-gray-400 hover:text-gray-600"><i class="fas fa-times"></i></button>
            </div>
            <div class="p-4 space-y-3">
              <div>
                <label class="text-xs text-gray-600 block mb-1">직원 <span class="text-red-500">*</span></label>
                <div style="position:relative">
                  <input id="lcEmpSearch" type="text" placeholder="이름 또는 사번 검색..." class="w-full border rounded px-2 py-1 text-sm" autocomplete="off">
                  <div id="lcEmpDropdown" class="hidden" style="position:absolute;top:100%;left:0;right:0;max-height:200px;overflow-y:auto;background:#fff;border:1px solid #d1d5db;border-top:0;border-radius:0 0 6px 6px;z-index:50;box-shadow:0 4px 12px rgba(0,0,0,.1)"></div>
                  <input id="lcEmpSelect" type="hidden" value="">
                </div>
                <div id="lcEmpPreview" class="hidden mt-2 p-2 rounded-lg text-xs" style="background:var(--c-surface-secondary);border:1px solid var(--c-border)"></div>
              </div>
              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="text-xs text-gray-600 block mb-1">계약유형</label>
                  <select id="lcContractType" class="w-full border rounded px-2 py-1 text-sm">
                    <option value="HOURLY">시급제</option>
                    <option value="MONTHLY">월급제</option>
                    <option value="DAILY">일급제</option>
                  </select>
                </div>
                <div>
                  <label class="text-xs text-gray-600 block mb-1">근무형태</label>
                  <select id="lcWorkType" class="w-full border rounded px-2 py-1 text-sm">
                    <option value="REGULAR">통상근무</option>
                    <option value="SHIFT">교대제</option>
                  </select>
                </div>
              </div>
              <div>
                <label class="text-xs text-gray-600 block mb-1">계약일 <span class="text-red-500">*</span></label>
                <input type="date" id="lcContractDate" class="w-full border rounded px-2 py-1 text-sm">
              </div>
              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="text-xs text-gray-600 block mb-1">계약 시작일 <span class="text-red-500">*</span></label>
                  <input type="date" id="lcStartDate" class="w-full border rounded px-2 py-1 text-sm">
                </div>
                <div>
                  <label class="text-xs text-gray-600 block mb-1">계약 종료일</label>
                  <input type="date" id="lcEndDate" class="w-full border rounded px-2 py-1 text-sm">
                </div>
              </div>
              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="text-xs text-gray-600 block mb-1">임금 시작일</label>
                  <input type="date" id="lcWageStart" class="w-full border rounded px-2 py-1 text-sm">
                </div>
                <div>
                  <label class="text-xs text-gray-600 block mb-1">임금 종료일</label>
                  <input type="date" id="lcWageEnd" class="w-full border rounded px-2 py-1 text-sm">
                </div>
              </div>
              <div class="grid grid-cols-3 gap-3">
                <div>
                  <label class="text-xs text-gray-600 block mb-1" id="lcRateLabel">기본급 (원)</label>
                  <input type="number" id="lcBaseSalary" class="w-full border rounded px-2 py-1 text-sm" placeholder="0" oninput="lcCalcWage()">
                  <input type="hidden" id="lcHourlyRate" value="0">
                </div>
                <div class="flex items-center gap-2 pt-5">
                  <input type="checkbox" id="lcOvertimeDaily" onchange="lcCalcWage()" class="w-4 h-4 rounded">
                  <label for="lcOvertimeDaily" class="text-xs text-gray-600 cursor-pointer">고정연장 (아침 30분)</label>
                </div>
                <div>
                  <label class="text-xs text-gray-600 block mb-1">수습기간 (개월)</label>
                  <input type="number" id="lcProbation" class="w-full border rounded px-2 py-1 text-sm" value="3" min="0" max="12">
                </div>
              </div>
              <div id="lcWagePreview" class="hidden p-2 rounded text-xs" style="background:var(--c-surface-secondary);border:1px solid var(--c-border)"></div>
              <div>
                <label class="text-xs text-gray-600 block mb-1">담당업무</label>
                <input type="text" id="lcJobDesc" class="w-full border rounded px-2 py-1 text-sm" placeholder="현수막 제작 보조 등">
              </div>
            </div>
            <div class="flex justify-end gap-2 p-4 border-t">
              <button onclick="lcCloseEditModal()" class="px-4 py-2 text-sm bg-gray-200 text-gray-700 rounded hover:bg-gray-300">취소</button>
              <button onclick="lcSave()" class="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700">저장</button>
            </div>
          </div>
        </div>
      </div>

      <!-- 서명 캔버스 모달 -->
      <div id="lcSignModal" class="fixed inset-0 z-50 hidden" style="background:rgba(0,0,0,.4);">
        <div class="flex items-center justify-center min-h-screen p-4">
          <div class="bg-white rounded-lg shadow-xl w-full max-w-md">
            <div class="flex items-center justify-between p-4 border-b">
              <h3 class="text-lg font-semibold">근로자 서명</h3>
              <button onclick="lcCloseSignModal()" class="text-gray-400 hover:text-gray-600"><i class="fas fa-times"></i></button>
            </div>
            <div class="p-4 space-y-3">
              <p class="text-sm text-gray-600">아래 영역에 서명해 주세요.</p>
              <div class="border-2 border-dashed border-gray-300 rounded-lg" style="touch-action:none;">
                <canvas id="signatureCanvas" width="400" height="200" style="width:100%;cursor:crosshair;display:block;"></canvas>
              </div>
              <div class="flex gap-2">
                <button onclick="lcClearSignature()" class="px-3 py-1.5 text-xs border border-gray-300 text-gray-700 rounded hover:bg-gray-50">
                  <i class="fas fa-eraser mr-1"></i>지우기
                </button>
              </div>
            </div>
            <div class="flex justify-end gap-2 p-4 border-t">
              <button onclick="lcCloseSignModal()" class="px-4 py-2 text-sm bg-gray-200 text-gray-700 rounded hover:bg-gray-300">취소</button>
              <button onclick="lcSubmitSignature()" class="px-4 py-2 text-sm bg-green-600 text-white rounded hover:bg-green-700">서명 완료</button>
            </div>
          </div>
        </div>
      </div>
    `,
    pageScript,
  })
}
