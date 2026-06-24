import type { Context } from 'hono'
import type { HonoEnv } from '../types/env'
import { renderPage } from '../layout'
import { deptOptions } from '../constants/hr'
import pageScript from '../scripts/leaves.js?raw'

export function leavesPage(c: Context<HonoEnv>) {
  return renderPage(c, {
    title: '연차 관리',
    activePage: '/leaves',
    pageContent: `
      <div class="space-y-4">
        <!-- 탭 -->
        <div class="ds-card flex">
          <button onclick="leavesSwitchTab('balances')" id="lvTabBalances"
            class="px-4 py-2 text-sm font-medium border-b-2 border-blue-600 text-blue-600">
            <i class="fas fa-user-clock mr-1"></i>직원 잔여 현황
          </button>
          <button onclick="leavesSwitchTab('requests')" id="lvTabRequests"
            class="px-4 py-2 text-sm font-medium border-b-2 border-transparent text-gray-500">
            <i class="fas fa-paper-plane mr-1"></i>휴가 신청 내역
          </button>
          <button onclick="leavesSwitchTab('allowance')" id="lvTabAllowance"
            class="px-4 py-2 text-sm font-medium border-b-2 border-transparent text-gray-500">
            <i class="fas fa-won-sign mr-1"></i>미사용 연차수당
          </button>
          <div class="flex-1"></div>
          <div class="px-3 py-2 flex items-center gap-2">
            <button onclick="leavesRunMonthly()" class="px-3 py-1.5 text-xs border border-gray-300 text-gray-700 bg-white rounded hover:bg-gray-50" title="입사 1년 미만 직원의 월차 자동 적립 (월 1회 실행)">
              <i class="fas fa-sync-alt mr-1"></i>월차 적립 실행
            </button>
            <button onclick="leavesRunYearly()" class="px-3 py-1.5 text-xs border border-gray-300 text-gray-700 bg-white rounded hover:bg-gray-50" title="1년차 이상 직원에게 연간 연차 자동 부여 (연 1회 실행)">
              <i class="fas fa-calendar-plus mr-1"></i>연간 부여 실행
            </button>
          </div>
        </div>

        <!-- 탭 1: 직원 잔여 현황 -->
        <div id="lvPaneBalances">
          <div class="ds-card p-3 flex items-center gap-2">
            <label class="text-xs text-gray-600">기준 연도</label>
            <select id="lvYear" class="border rounded px-2 py-1 text-xs"></select>
            <select id="lvBalanceDept" class="border rounded px-2 py-1 text-xs" onchange="leavesLoadBalances()" title="부서">
              ${deptOptions({ lead: '전체 부서' })}
            </select>
            <button onclick="leavesLoadBalances()" class="ds-btn ds-btn-primary text-xs">
              <i class="fas fa-search mr-1"></i>조회
            </button>
            <div class="flex-1"></div>
            <button onclick="leavesOpenGrantModal()" class="px-3 py-1.5 text-xs border border-gray-300 text-gray-700 bg-white rounded hover:bg-gray-50">
              <i class="fas fa-plus mr-1"></i>특별 부여
            </button>
          </div>

          <div class="ds-card overflow-hidden mt-3">
            <div class="overflow-x-auto">
              <table class="w-full text-sm ds-table ds-table-striped">
                <thead class="bg-gray-50 text-xs text-gray-600 uppercase tracking-wider">
                  <tr>
                    <th class="col-code px-3 py-2 text-left">사번</th>
                    <th class="col-name px-3 py-2 text-left">이름</th>
                    <th class="col-tag px-3 py-2 text-left">부서</th>
                    <th class="col-tag px-3 py-2 text-left">직급</th>
                    <th class="col-date px-3 py-2 text-left">입사일</th>
                    <th class="col-qty px-3 py-2 text-right">부여</th>
                    <th class="col-qty px-3 py-2 text-right">특별</th>
                    <th class="col-qty px-3 py-2 text-right">사용</th>
                    <th class="col-qty px-3 py-2 text-right">잔여</th>
                  </tr>
                </thead>
                <tbody id="lvBalancesBody"><tr><td colspan="9" class="text-center text-gray-400 py-6">로드 중...</td></tr></tbody>
              </table>
            </div>
          </div>
        </div>

        <!-- 탭 2: 휴가 신청 내역 -->
        <div id="lvPaneRequests" class="hidden">
          <div class="ds-card p-3 flex items-center gap-2">
            <select id="lvReqStatus" class="border rounded px-2 py-1 text-xs">
              <option value="">전체 상태</option>
              <option value="PENDING">결재대기</option>
              <option value="APPROVED">승인</option>
              <option value="REJECTED">반려</option>
            </select>
            <input type="date" id="lvReqFrom" class="border rounded px-2 py-1 text-xs" title="시작일(이후)">
            <span class="text-gray-400 text-xs">~</span>
            <input type="date" id="lvReqTo" class="border rounded px-2 py-1 text-xs" title="종료일(이전)">
            <button onclick="leavesLoadRequests()" class="ds-btn ds-btn-primary text-xs">
              <i class="fas fa-search mr-1"></i>검색
            </button>
            <div class="flex-1"></div>
            <button onclick="leavesOpenRequestModal()" class="ds-btn ds-btn-primary text-xs">
              <i class="fas fa-plus mr-1"></i>휴가 신청
            </button>
          </div>

          <div class="ds-card overflow-hidden mt-3">
            <div class="overflow-x-auto">
              <table class="w-full text-sm ds-table ds-table-striped">
                <thead class="bg-gray-50 text-xs text-gray-600 uppercase tracking-wider">
                  <tr>
                    <th class="col-date px-3 py-2 text-left">신청일</th>
                    <th class="col-tag px-3 py-2 text-left">사번/이름</th>
                    <th class="col-tag px-3 py-2 text-left">부서</th>
                    <th class="col-tag px-3 py-2 text-left">유형</th>
                    <th class="col-flex px-3 py-2 text-left">기간</th>
                    <th class="col-qty px-3 py-2 text-right">일수</th>
                    <th class="col-name px-3 py-2 text-left">사유</th>
                    <th class="col-status px-3 py-2 text-center">상태</th>
                    <th class="col-action px-3 py-2 text-center">액션</th>
                  </tr>
                </thead>
                <tbody id="lvRequestsBody"><tr><td colspan="9" class="text-center text-gray-400 py-6">로드 중...</td></tr></tbody>
              </table>
            </div>
          </div>
        </div>
        <!-- 탭 3: 미사용 연차수당 -->
        <div id="lvPaneAllowance" class="hidden">
          <div class="ds-card p-3 flex items-center gap-2">
            <label class="text-xs text-gray-600">기준 연도</label>
            <select id="lvAllowYear" class="border rounded px-2 py-1 text-xs"></select>
            <select id="lvAllowanceDept" class="border rounded px-2 py-1 text-xs" onchange="leavesLoadAllowance()" title="부서">
              ${deptOptions({ lead: '전체 부서' })}
            </select>
            <button onclick="leavesLoadAllowance()" class="ds-btn ds-btn-primary text-xs">
              <i class="fas fa-search mr-1"></i>조회
            </button>
            <div class="flex-1"></div>
            <span id="lvAllowanceTotal" class="text-sm font-bold text-red-600"></span>
          </div>

          <div class="ds-card overflow-hidden mt-3">
            <div class="overflow-x-auto">
              <table class="w-full text-sm ds-table ds-table-striped">
                <thead class="bg-gray-50 text-xs text-gray-600 uppercase tracking-wider">
                  <tr>
                    <th class="col-code px-3 py-2 text-left">사번</th>
                    <th class="col-name px-3 py-2 text-left">이름</th>
                    <th class="col-tag px-3 py-2 text-left">부서</th>
                    <th class="col-qty px-3 py-2 text-right">부여</th>
                    <th class="col-qty px-3 py-2 text-right">사용</th>
                    <th class="col-qty px-3 py-2 text-right">잔여</th>
                    <th class="col-amount px-3 py-2 text-right">일급(원)</th>
                    <th class="col-amount px-3 py-2 text-right">미사용수당(원)</th>
                  </tr>
                </thead>
                <tbody id="lvAllowanceBody"><tr><td colspan="8" class="text-center text-gray-400 py-6">탭 클릭 시 조회됩니다.</td></tr></tbody>
              </table>
            </div>
          </div>
          <div class="text-xs text-gray-500 mt-2">
            <i class="fas fa-info-circle mr-1"></i>미사용 연차수당 = 기본급 ÷ 209시간 × 8시간 × 잔여일수 (통상임금 기준)
          </div>
        </div>
      </div>

      <!-- 휴가 신청 모달 -->
      <div id="lvRequestModal" class="ds-modal-overlay hidden">
        <div class="ds-modal p-5" style="max-width:28rem">
          <div class="flex items-center justify-between mb-3">
            <h3 class="text-base font-semibold">휴가 신청</h3>
            <button onclick="leavesCloseRequestModal()" class="text-gray-400 hover:text-gray-600"><i class="fas fa-times"></i></button>
          </div>
          <div class="space-y-3">
            <div class="relative">
              <label class="text-xs text-gray-600">직원 <span class="text-red-500">*</span></label>
              <input type="text" id="lvReqEmployeeSearch" class="w-full border rounded px-2 py-1.5 text-sm" placeholder="사번 또는 이름 검색..." autocomplete="off" />
              <input type="hidden" id="lvReqEmployee" />
              <div id="lvReqEmployeeDropdown" class="hidden absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-48 overflow-y-auto"></div>
            </div>
            <div>
              <label class="text-xs text-gray-600">유형 <span class="text-red-500">*</span></label>
              <select id="lvReqType" class="w-full border rounded px-2 py-1.5 text-sm" onchange="leavesTypeChanged()">
                <option value="ANNUAL">연차 (1일)</option>
                <option value="HALF_AM">오전반차 (0.5일)</option>
                <option value="HALF_PM">오후반차 (0.5일)</option>
                <option value="QUARTER_1">반반차 08:30~10:00 (0.25일)</option>
                <option value="QUARTER_2">반반차 10:00~12:00 (0.25일)</option>
                <option value="QUARTER_3">반반차 13:00~16:00 (0.25일)</option>
                <option value="QUARTER_4">반반차 16:00~18:00 (0.25일)</option>
                <option value="SICK">병가</option>
                <option value="FAMILY_EVENT">경조휴가</option>
              </select>
            </div>
            <div class="grid grid-cols-2 gap-2">
              <div>
                <label class="text-xs text-gray-600">시작일 <span class="text-red-500">*</span></label>
                <input type="date" id="lvReqStart" class="w-full border rounded px-2 py-1.5 text-sm" onchange="leavesCalcDays()" />
              </div>
              <div>
                <label class="text-xs text-gray-600">종료일 <span class="text-red-500">*</span></label>
                <input type="date" id="lvReqEnd" class="w-full border rounded px-2 py-1.5 text-sm" onchange="leavesCalcDays()" />
              </div>
            </div>
            <div>
              <label class="text-xs text-gray-600">일수 <span class="text-red-500">*</span></label>
              <input type="number" step="0.5" id="lvReqDays" class="w-full border rounded px-2 py-1.5 text-sm" />
            </div>
            <div>
              <label class="text-xs text-gray-600">사유</label>
              <textarea id="lvReqReason" rows="2" class="w-full border rounded px-2 py-1.5 text-sm"></textarea>
            </div>
          </div>
          <div class="mt-4 flex justify-end gap-2">
            <button onclick="leavesCloseRequestModal()" class="px-3 py-1.5 text-xs border border-gray-300 text-gray-700 bg-white rounded hover:bg-gray-50">취소</button>
            <button onclick="leavesSubmitRequest()" class="ds-btn ds-btn-primary text-xs">신청</button>
          </div>
        </div>
      </div>

      <!-- 특별 부여 모달 -->
      <div id="lvGrantModal" class="ds-modal-overlay hidden">
        <div class="ds-modal p-5" style="max-width:28rem">
          <div class="flex items-center justify-between mb-3">
            <h3 class="text-base font-semibold">연차 특별 부여</h3>
            <button onclick="leavesCloseGrantModal()" class="text-gray-400 hover:text-gray-600"><i class="fas fa-times"></i></button>
          </div>
          <div class="space-y-3">
            <div class="relative">
              <label class="text-xs text-gray-600">직원 <span class="text-red-500">*</span></label>
              <input type="text" id="lvGrantEmployeeSearch" class="w-full border rounded px-2 py-1.5 text-sm" placeholder="사번 또는 이름 검색..." autocomplete="off" />
              <input type="hidden" id="lvGrantEmployee" />
              <div id="lvGrantEmployeeDropdown" class="hidden absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-48 overflow-y-auto"></div>
            </div>
            <div class="grid grid-cols-2 gap-2">
              <div>
                <label class="text-xs text-gray-600">연도 <span class="text-red-500">*</span></label>
                <input type="number" id="lvGrantYear" class="w-full border rounded px-2 py-1.5 text-sm" />
              </div>
              <div>
                <label class="text-xs text-gray-600">일수 <span class="text-red-500">*</span></label>
                <input type="number" step="0.5" id="lvGrantDays" class="w-full border rounded px-2 py-1.5 text-sm" />
              </div>
            </div>
            <div>
              <label class="text-xs text-gray-600">사유</label>
              <textarea id="lvGrantReason" rows="2" class="w-full border rounded px-2 py-1.5 text-sm" placeholder="예: 보상휴가, 포상휴가"></textarea>
            </div>
          </div>
          <div class="mt-4 flex justify-end gap-2">
            <button onclick="leavesCloseGrantModal()" class="px-3 py-1.5 text-xs border border-gray-300 text-gray-700 bg-white rounded hover:bg-gray-50">취소</button>
            <button onclick="leavesSubmitGrant()" class="ds-btn ds-btn-primary text-xs">부여</button>
          </div>
        </div>
      </div>
    `,
    pageScript,
  })
}
