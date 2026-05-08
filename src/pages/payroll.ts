import type { Context } from 'hono'
import type { HonoEnv } from '../types/env'
import { renderPage } from '../layout'
import pageScript from '../scripts/payroll.js?raw'

export function payrollPage(c: Context<HonoEnv>) {
  return renderPage(c, {
    title: '급여 관리',
    activePage: '/payroll',
    pageContent: `
      <div class="space-y-4">
        <!-- 상단 컨트롤 바 -->
        <div class="bg-white rounded-lg border shadow-sm p-3 flex items-center gap-2 flex-wrap">
          <label class="text-xs text-gray-600">급여 월</label>
          <input type="month" id="prPeriod" class="border rounded px-2 py-1 text-xs" />
          <select id="prStatus" class="border rounded px-2 py-1 text-xs">
            <option value="">전체 상태</option>
            <option value="PENDING">작성중</option>
            <option value="APPROVED">승인</option>
            <option value="PAID">지급완료</option>
          </select>
          <button onclick="payrollLoad()" class="px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700">
            <i class="fas fa-search mr-1"></i>조회
          </button>
          <div class="flex-1"></div>
          <button onclick="payrollOpenRatesModal()" class="px-3 py-1.5 text-xs border border-gray-300 text-gray-700 bg-white rounded hover:bg-gray-50" title="4대보험 요율 확인">
            <i class="fas fa-percentage mr-1"></i>요율
          </button>
          <button onclick="payrollBatch()" class="px-3 py-1.5 text-xs border border-gray-300 text-gray-700 bg-white rounded hover:bg-gray-50" title="해당 월 전 직원 급여를 기본급 기준으로 일괄 생성 (PENDING)">
            <i class="fas fa-bolt mr-1"></i>일괄 생성
          </button>
          <button onclick="payrollSyncAttendance()" class="px-3 py-1.5 text-xs border border-blue-300 text-blue-700 bg-blue-50 rounded hover:bg-blue-100" title="해당 월 attendance 테이블의 연장근무/근무일수/지각/결근을 급여에 반영">
            <i class="fas fa-sync-alt mr-1"></i>근태 불러오기
          </button>
          <button onclick="payrollOpenBatchSlip()" class="px-3 py-1.5 text-xs border border-gray-300 text-gray-700 bg-white rounded hover:bg-gray-50" title="해당 월 전 직원 급여명세서를 새 창에서 일괄 인쇄">
            <i class="fas fa-print mr-1"></i>일괄 명세서
          </button>
          <button onclick="sendPayslipBulk()" class="px-3 py-1.5 text-xs bg-green-600 text-white rounded hover:bg-green-700" title="현재 조회된 직원에게 급여명세서 SMS 일괄 발송">
            <i class="fas fa-paper-plane mr-1"></i>일괄 명세서 발송
          </button>
          <div class="relative inline-block">
            <button onclick="payrollToggleTaxMenu()" id="prTaxBtn" class="px-3 py-1.5 text-xs border border-gray-300 text-gray-700 bg-white rounded hover:bg-gray-50" title="세무사 대행 전달용 CSV 다운로드">
              <i class="fas fa-file-csv mr-1"></i>세무사 CSV <i class="fas fa-caret-down ml-1"></i>
            </button>
            <div id="prTaxMenu" class="hidden absolute right-0 mt-1 w-56 bg-white border border-gray-200 rounded shadow-lg z-10">
              <button onclick="payrollDownloadTaxChanges()" class="w-full text-left px-3 py-2 text-xs hover:bg-gray-50 flex items-center">
                <i class="fas fa-exchange-alt mr-2 text-gray-500"></i>월별 변동사항 (취득/상실)
              </button>
              <button onclick="payrollDownloadTaxPayroll()" class="w-full text-left px-3 py-2 text-xs hover:bg-gray-50 flex items-center border-t">
                <i class="fas fa-list mr-2 text-gray-500"></i>월별 급여내역 (전직원)
              </button>
              <button onclick="payrollDownloadTaxAnnual()" class="w-full text-left px-3 py-2 text-xs hover:bg-gray-50 flex items-center border-t">
                <i class="fas fa-calendar-alt mr-2 text-gray-500"></i>연간 급여대장 (연말정산)
              </button>
              <button onclick="payrollDownloadTaxRoster()" class="w-full text-left px-3 py-2 text-xs hover:bg-gray-50 flex items-center border-t">
                <i class="fas fa-address-book mr-2 text-gray-500"></i>직원 명부 (재직자)
              </button>
            </div>
          </div>
          <button onclick="payrollOpenEditModal(0)" class="px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700">
            <i class="fas fa-plus mr-1"></i>급여 작성
          </button>
        </div>

        <!-- 요약 카드 -->
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div class="bg-white rounded-lg border shadow-sm p-4">
            <div class="text-xs text-gray-500">총 인원</div>
            <div class="text-2xl font-bold text-gray-900 mt-1" id="prSumCount">-</div>
          </div>
          <div class="bg-white rounded-lg border shadow-sm p-4">
            <div class="text-xs text-gray-500">지급 총액</div>
            <div class="text-2xl font-bold text-gray-900 mt-1" id="prSumGross">-</div>
          </div>
          <div class="bg-white rounded-lg border shadow-sm p-4">
            <div class="text-xs text-gray-500">공제 총액</div>
            <div class="text-2xl font-bold text-red-600 mt-1" id="prSumDeduct">-</div>
          </div>
          <div class="bg-white rounded-lg border shadow-sm p-4">
            <div class="text-xs text-gray-500">실지급 총액</div>
            <div class="text-2xl font-bold text-green-600 mt-1" id="prSumNet">-</div>
          </div>
        </div>

        <!-- 일괄 액션 바 -->
        <div class="bg-amber-50 border border-amber-200 rounded-lg p-3 flex flex-wrap items-center gap-2">
          <span class="text-sm font-semibold text-amber-800">
            <i class="fas fa-check-square mr-1"></i> 일괄 액션
          </span>
          <span id="prSelectedCount" class="text-xs text-gray-600">선택: 0명</span>
          <div class="flex-1"></div>
          <button onclick="payrollBulkApprove()" class="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700">
            <i class="fas fa-check mr-1"></i>선택 승인
          </button>
          <button onclick="payrollBulkPay()" class="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700">
            <i class="fas fa-dollar-sign mr-1"></i>선택 지급완료
          </button>
          <button onclick="payrollBulkSyncAttendance()" class="px-3 py-1 bg-amber-600 text-white rounded text-sm hover:bg-amber-700">
            <i class="fas fa-sync-alt mr-1"></i>선택 근태 동기화
          </button>
        </div>

        <!-- 급여 목록 테이블 -->
        <div class="bg-white rounded-lg border shadow-sm overflow-hidden">
          <div class="overflow-x-auto">
            <table class="w-full text-sm ds-table-striped">
              <thead class="bg-gray-50 text-xs text-gray-600 uppercase tracking-wider">
                <tr>
                  <th class="px-2 py-2 text-center w-8"><input type="checkbox" id="prSelectAll" onchange="payrollToggleAll(this.checked)"></th>
                  <th class="px-3 py-2 text-left">사번</th>
                  <th class="px-3 py-2 text-left">이름</th>
                  <th class="px-3 py-2 text-left">부서/직급</th>
                  <th class="px-3 py-2 text-right">기본급</th>
                  <th class="px-3 py-2 text-right">연장(h)</th>
                  <th class="px-3 py-2 text-right">연장급여</th>
                  <th class="px-3 py-2 text-right">수당</th>
                  <th class="px-3 py-2 text-right">총급여</th>
                  <th class="px-3 py-2 text-right">공제</th>
                  <th class="px-3 py-2 text-right">실지급</th>
                  <th class="px-3 py-2 text-center">상태</th>
                  <th class="px-3 py-2 text-center">액션</th>
                </tr>
              </thead>
              <tbody id="prBody">
                <tr><td colspan="13" class="text-center text-gray-400 py-6">조회 버튼을 눌러주세요</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- 급여 작성/수정 모달 -->
      <div id="prEditModal" class="hidden fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div class="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
          <div class="px-5 py-3 border-b flex items-center justify-between sticky top-0 bg-white z-10">
            <h3 class="text-base font-semibold">급여 명세 작성</h3>
            <button onclick="payrollCloseEditModal()" class="text-gray-400 hover:text-gray-600"><i class="fas fa-times"></i></button>
          </div>
          <div class="p-5 space-y-4">
            <!-- 직원 + 기간 -->
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <div>
                <label class="text-xs text-gray-600">직원 <span class="text-red-500">*</span></label>
                <select id="prEmpSelect" class="w-full border rounded px-2 py-1.5 text-sm" onchange="payrollOnEmployeeChange()"></select>
                <div class="flex items-center gap-2 mt-1 flex-wrap">
                  <span id="prInsuranceBadge" class="hidden"></span>
                  <button type="button" onclick="payrollResetToEmployeeDefaults()" class="text-xs text-blue-600 hover:text-blue-800 hover:underline" title="선택한 직원의 기본값(기본급/고정수당/고정공제)으로 덮어쓰기">
                    <i class="fas fa-rotate-left mr-1"></i>직원 기본값으로 초기화
                  </button>
                </div>
              </div>
              <div>
                <label class="text-xs text-gray-600">급여 월 <span class="text-red-500">*</span></label>
                <input type="month" id="prEditPeriod" class="w-full border rounded px-2 py-1.5 text-sm" />
              </div>
              <div>
                <label class="text-xs text-gray-600">지급일</label>
                <input type="date" id="prEditPayDate" class="w-full border rounded px-2 py-1.5 text-sm" placeholder="비우면 자동" />
              </div>
            </div>

            <!-- 지급 항목 -->
            <div>
              <div class="text-xs font-semibold text-gray-700 mb-2 flex items-center justify-between">
                <span><i class="fas fa-plus-circle mr-1 text-blue-600"></i>지급 항목</span>
                <span class="text-xs text-gray-500 font-normal">통상시급: <span id="prHourlyWage" class="font-semibold text-gray-700">-</span> 원/시간 (월 <span id="prWorkHoursStd">209</span>시간)</span>
              </div>
              <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <div>
                  <label class="text-xs text-gray-500">기본급</label>
                  <input type="text" inputmode="numeric" data-money id="prBase" class="w-full border rounded px-2 py-1.5 text-sm text-right" oninput="payrollPreview()" />
                </div>
                <div>
                  <label class="text-xs text-gray-500">연차수당</label>
                  <input type="text" inputmode="numeric" data-money id="prAnnualPay" class="w-full border rounded px-2 py-1.5 text-sm text-right" oninput="payrollPreview()" />
                </div>
                <div>
                  <label class="text-xs text-gray-500">상여금</label>
                  <input type="text" inputmode="numeric" data-money id="prBonus" class="w-full border rounded px-2 py-1.5 text-sm text-right" oninput="payrollPreview()" />
                </div>
              </div>

              <!-- 추가근로 (시간 입력 → 금액 자동) -->
              <div class="mt-3 p-3 bg-blue-50 border border-blue-100 rounded-lg">
                <div class="text-xs font-semibold text-blue-900 mb-2"><i class="fas fa-clock mr-1"></i>추가근로 (시간 입력 시 금액 자동 계산)</div>
                <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  <div>
                    <label class="text-xs text-gray-600">연장근로 시간 (×1.5)</label>
                    <input type="number" step="0.5" id="prOvertimeHrs" class="w-full border rounded px-2 py-1.5 text-sm text-right" oninput="payrollPreview()" />
                    <div class="text-xs text-gray-500 mt-1">금액: <span id="prOvertimeAmt" class="font-semibold text-gray-800">0</span></div>
                  </div>
                  <div>
                    <label class="text-xs text-gray-600">야간근로 시간 (+0.5 가산)</label>
                    <input type="number" step="0.5" id="prNightHrs" class="w-full border rounded px-2 py-1.5 text-sm text-right" oninput="payrollPreview()" />
                    <div class="text-xs text-gray-500 mt-1">금액: <span id="prNightAmt" class="font-semibold text-gray-800">0</span></div>
                  </div>
                  <div>
                    <label class="text-xs text-gray-600">휴일근로 시간 (×1.5/8h초과×2)</label>
                    <input type="number" step="0.5" id="prHolidayHrs" class="w-full border rounded px-2 py-1.5 text-sm text-right" oninput="payrollPreview()" />
                    <div class="text-xs text-gray-500 mt-1">금액: <span id="prHolidayAmt" class="font-semibold text-gray-800">0</span></div>
                  </div>
                </div>
                <div class="mt-2 text-xs text-gray-500">
                  <i class="fas fa-info-circle mr-1"></i>금액을 직접 입력하고 싶으면
                  <button type="button" onclick="payrollToggleOvertimeMode()" class="text-blue-600 hover:underline font-medium">여기를 클릭</button>
                  하여 수동 입력 모드로 전환하세요.
                </div>

                <!-- 수동 입력 모드 (숨김 기본) -->
                <div id="prOvertimeManual" class="hidden mt-3 pt-3 border-t border-blue-200">
                  <div class="text-xs font-semibold text-blue-900 mb-2">수동 입력 (시간 자동계산 덮어쓰기)</div>
                  <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    <div>
                      <label class="text-xs text-gray-500">연장근로수당</label>
                      <input type="text" inputmode="numeric" data-money id="prOvertime" class="w-full border rounded px-2 py-1.5 text-sm text-right" oninput="payrollPreview()" />
                    </div>
                    <div>
                      <label class="text-xs text-gray-500">야간근로수당</label>
                      <input type="text" inputmode="numeric" data-money id="prNight" class="w-full border rounded px-2 py-1.5 text-sm text-right" oninput="payrollPreview()" />
                    </div>
                    <div>
                      <label class="text-xs text-gray-500">휴일근로수당</label>
                      <input type="text" inputmode="numeric" data-money id="prHoliday" class="w-full border rounded px-2 py-1.5 text-sm text-right" oninput="payrollPreview()" />
                    </div>
                  </div>
                </div>
              </div>

              <div class="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <div>
                  <label class="text-xs text-gray-500">식대 (20만 비과세)</label>
                  <input type="text" inputmode="numeric" data-money id="prMeal" class="w-full border rounded px-2 py-1.5 text-sm text-right" oninput="payrollPreview()" />
                </div>
                <div>
                  <label class="text-xs text-gray-500">자가운전 (20만 비과세)</label>
                  <input type="text" inputmode="numeric" data-money id="prTransport" class="w-full border rounded px-2 py-1.5 text-sm text-right" oninput="payrollPreview()" />
                </div>
                <div>
                  <label class="text-xs text-gray-500">기타수당</label>
                  <input type="text" inputmode="numeric" data-money id="prOther" class="w-full border rounded px-2 py-1.5 text-sm text-right" oninput="payrollPreview()" />
                </div>
              </div>
            </div>

            <!-- 근태 -->
            <div>
              <div class="text-xs font-semibold text-gray-700 mb-2"><i class="fas fa-calendar-check mr-1 text-gray-600"></i>근태 (CAPS 동기화 가능)</div>
              <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <div>
                  <label class="text-xs text-gray-500">근무일수</label>
                  <input type="number" step="0.5" id="prWorkDays" class="w-full border rounded px-2 py-1.5 text-sm text-right" />
                </div>
                <div>
                  <label class="text-xs text-gray-500">결근일</label>
                  <input type="number" step="0.5" id="prAbsent" class="w-full border rounded px-2 py-1.5 text-sm text-right" />
                </div>
                <div>
                  <label class="text-xs text-gray-500">지각</label>
                  <input type="number" id="prLate" class="w-full border rounded px-2 py-1.5 text-sm text-right" />
                </div>
              </div>
            </div>

            <!-- 미리계산 결과 -->
            <div class="bg-gray-50 rounded-lg border p-4">
              <div class="text-xs font-semibold text-gray-700 mb-2"><i class="fas fa-calculator mr-1 text-blue-600"></i>공제 (자동 계산)</div>
              <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-1.5 text-sm">
                <div class="flex justify-between"><span class="text-gray-600">국민연금</span><span id="prCalcNP">-</span></div>
                <div class="flex justify-between"><span class="text-gray-600">건강보험</span><span id="prCalcHI">-</span></div>
                <div class="flex justify-between"><span class="text-gray-600">장기요양</span><span id="prCalcLTC">-</span></div>
                <div class="flex justify-between"><span class="text-gray-600">고용보험</span><span id="prCalcEI">-</span></div>
                <div class="flex justify-between"><span class="text-gray-600">소득세</span><span id="prCalcTax">-</span></div>
                <div class="flex justify-between"><span class="text-gray-600">지방세</span><span id="prCalcLocal">-</span></div>
              </div>
              <div class="mt-2 flex items-center gap-2">
                <label class="text-xs text-gray-500">기타공제</label>
                <input type="text" inputmode="numeric" data-money id="prOtherDed" class="border rounded px-2 py-1 text-xs text-right w-32" oninput="payrollPreview()" />
              </div>
              <hr class="my-3" />
              <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 text-sm">
                <div class="flex justify-between"><span class="text-gray-600">총 급여</span><span id="prCalcGross" class="font-semibold">-</span></div>
                <div class="flex justify-between"><span class="text-gray-600">총 공제</span><span id="prCalcDeduct" class="font-semibold text-red-600">-</span></div>
                <div class="flex justify-between"><span class="text-gray-700 font-semibold">실지급액</span><span id="prCalcNet" class="font-bold text-green-600 text-base">-</span></div>
              </div>
            </div>

            <div>
              <label class="text-xs text-gray-600">비고</label>
              <textarea id="prNotes" rows="2" class="w-full border rounded px-2 py-1.5 text-sm"></textarea>
            </div>
          </div>
          <div class="px-5 py-3 border-t flex justify-end gap-2 sticky bottom-0 bg-white">
            <button onclick="payrollCloseEditModal()" class="px-3 py-1.5 text-xs border border-gray-300 text-gray-700 bg-white rounded hover:bg-gray-50">취소</button>
            <button onclick="payrollSave()" class="px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"><i class="fas fa-save mr-1"></i>저장</button>
          </div>
        </div>
      </div>

      <!-- 4대보험 요율 모달 -->
      <div id="prRatesModal" class="hidden fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div class="bg-white rounded-lg shadow-xl w-full max-w-2xl">
          <div class="px-5 py-3 border-b flex items-center justify-between">
            <h3 class="text-base font-semibold">4대보험 요율</h3>
            <button onclick="payrollCloseRatesModal()" class="text-gray-400 hover:text-gray-600"><i class="fas fa-times"></i></button>
          </div>
          <div class="p-5">
            <div class="flex items-center gap-2 mb-3">
              <label class="text-xs text-gray-600">연도</label>
              <input type="number" id="prRatesYear" value="2026" class="border rounded px-2 py-1 text-xs w-24" />
              <button onclick="payrollLoadRates()" class="px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700">조회</button>
            </div>
            <table class="w-full text-sm">
              <thead class="bg-gray-50 text-xs text-gray-600 uppercase">
                <tr>
                  <th class="px-3 py-2 text-left">보험</th>
                  <th class="px-3 py-2 text-right">전체</th>
                  <th class="px-3 py-2 text-right">근로자</th>
                  <th class="px-3 py-2 text-right">사용자</th>
                  <th class="px-3 py-2 text-left">기준</th>
                </tr>
              </thead>
              <tbody id="prRatesBody"><tr><td colspan="5" class="text-center text-gray-400 py-4">로드 중...</td></tr></tbody>
            </table>
          </div>
        </div>
      </div>
    `,
    pageScript,
  })
}
