import type { Context } from 'hono'
import type { HonoEnv } from '../types/env'
import { renderPage } from '../layout'
import pageScript from '../scripts/payroll.js?raw'
import payrollRatesScript from '../scripts/payrollRates.js?raw'
import { payrollRatesContent } from './payrollRates'

export function payrollPage(c: Context<HonoEnv>) {
  // 사이드바 통합(2026-07-18): [급여 관리](기본)+[요율 관리](payrollRates 흡수·lazy) 최상위 탭. /payroll-rates 은퇴.
  //   권한 동일(ADMIN/MANAGER)이라 게이팅 불요. __prRDefer로 요율 auto-init(2 API) 차단 → 요율 탭 첫 진입 시 __prRInit. payroll(pr*)↔rates(prR*) 충돌 0.
  const hubScript = `
    (function(){
      window.prSwitchHubTab = function(mode){
        var pay=document.getElementById('prHubPayroll'), rate=document.getElementById('prHubRates');
        if(pay) pay.classList.toggle('hidden', mode!=='payroll');
        if(rate) rate.classList.toggle('hidden', mode!=='rates');
        function act(b,on){ if(!b)return; if(on){b.classList.remove('border-transparent','text-gray-500');b.classList.add('border-blue-600','text-blue-600');}else{b.classList.remove('border-blue-600','text-blue-600');b.classList.add('border-transparent','text-gray-500');} }
        act(document.getElementById('prHubTabPayroll'), mode==='payroll');
        act(document.getElementById('prHubTabRates'), mode==='rates');
        if(mode==='rates' && typeof window.__prRInit==='function') window.__prRInit();
      };
    })();
  `
  const combinedScript = 'window.__prRDefer = true;\n;\n' + pageScript + '\n;\n' + payrollRatesScript + '\n;\n' + hubScript
  return renderPage(c, {
    title: '급여 관리',
    activePage: '/payroll',
    pageContent: `
      <div class="space-y-4">
        <!-- 최상위 탭 (급여 2축 통합): 급여 관리 | 요율 관리 -->
        <div class="flex border-b mb-2">
          <button id="prHubTabPayroll" onclick="prSwitchHubTab('payroll')" class="px-5 py-2.5 text-sm font-semibold border-b-2 border-blue-600 text-blue-600 flex items-center gap-2">
            <i class="fas fa-money-check-alt"></i>급여 관리
          </button>
          <button id="prHubTabRates" onclick="prSwitchHubTab('rates')" class="px-5 py-2.5 text-sm font-semibold border-b-2 border-transparent text-gray-500 hover:text-gray-700 flex items-center gap-2">
            <i class="fas fa-percentage"></i>요율 관리
          </button>
        </div>
        <div id="prHubPayroll">
        <!-- 상단 컨트롤 바 -->
        <div class="ds-card p-3 flex items-center gap-2 flex-wrap">
          <label class="text-xs text-gray-600">급여 월</label>
          <input type="month" id="prPeriod" class="border rounded px-2 py-1 text-xs" />
          <select id="prStatus" class="border rounded px-2 py-1 text-xs">
            <option value="">전체 상태</option>
            <option value="PENDING">작성중</option>
            <option value="APPROVED">승인</option>
            <option value="PAID">지급완료</option>
          </select>
          <button onclick="payrollLoad()" class="ds-btn ds-btn-primary text-xs">
            <i class="fas fa-search mr-1"></i>검색
          </button>
          <div class="flex-1"></div>
          <button onclick="payrollBatch()" class="px-3 py-1.5 text-xs border border-gray-300 text-gray-700 bg-white rounded hover:bg-gray-50" title="해당 월 전 직원 급여를 기본급 기준으로 일괄 생성 (PENDING)">
            <i class="fas fa-bolt mr-1"></i>일괄 생성
          </button>
          <button onclick="payrollSyncAttendance()" class="px-3 py-1.5 text-xs border border-blue-300 text-blue-700 bg-blue-50 rounded hover:bg-blue-100" title="해당 월 attendance 테이블의 연장근무/근무일수/지각/결근을 급여에 반영">
            <i class="fas fa-sync-alt mr-1"></i>근태 불러오기
          </button>
          <button onclick="payrollOpenBatchSlip()" class="px-3 py-1.5 text-xs border border-gray-300 text-gray-700 bg-white rounded hover:bg-gray-50" title="해당 월 전 직원 급여명세서를 새 창에서 일괄 인쇄">
            <i class="fas fa-print mr-1"></i>일괄 명세서
          </button>
          <div class="relative inline-block">
            <button onclick="payrollTogglePublishMenu()" id="prPublishBtn" class="px-3 py-1.5 text-xs border border-blue-200 text-blue-700 bg-blue-50 rounded hover:bg-blue-100" title="직원 셀프서비스에 급여명세서 공개(교부)">
              <i class="fas fa-share-square mr-1"></i>직원 교부 <i class="fas fa-caret-down ml-1"></i>
            </button>
            <div id="prPublishMenu" class="hidden absolute right-0 mt-1 w-56 bg-white border border-gray-200 rounded shadow-lg z-10">
              <button onclick="payrollPublishPeriod()" class="w-full text-left px-3 py-2 text-xs hover:bg-gray-50 flex items-center">
                <i class="fas fa-unlock mr-2 text-indigo-500"></i>이 달 명세서 교부(직원 공개)
              </button>
              <button onclick="payrollUnpublishPeriod()" class="w-full text-left px-3 py-2 text-xs hover:bg-gray-50 flex items-center border-t">
                <i class="fas fa-lock mr-2 text-gray-500"></i>교부 취소(비공개)
              </button>
            </div>
          </div>
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
        </div>

        <!-- 요약 카드 -->
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div class="ds-card p-4">
            <div class="text-xs text-gray-500">총 인원</div>
            <div class="text-2xl font-bold text-gray-900 mt-1" id="prSumCount">-</div>
          </div>
          <div class="ds-card p-4">
            <div class="text-xs text-gray-500">지급 총액</div>
            <div class="text-2xl font-bold text-gray-900 mt-1" id="prSumGross">-</div>
          </div>
          <div class="ds-card p-4">
            <div class="text-xs text-gray-500">공제 총액</div>
            <div class="text-2xl font-bold text-red-600 mt-1" id="prSumDeduct">-</div>
          </div>
          <div class="ds-card p-4">
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
          <button onclick="payrollOpenBulkEdit()" class="px-3 py-1 bg-white border border-amber-400 text-amber-800 rounded text-sm hover:bg-amber-100" title="선택한 작성중(PENDING) 급여의 공통 항목을 한번에 수정 — 공제는 자동 재계산">
            <i class="fas fa-pen mr-1"></i>선택 일괄수정
          </button>
          <button onclick="payrollBulkApprove()" class="ds-btn ds-btn-primary text-sm">
            <i class="fas fa-check mr-1"></i>선택 승인
          </button>
          <button onclick="payrollBulkPay()" class="ds-btn ds-btn-primary text-sm">
            <i class="fas fa-dollar-sign mr-1"></i>선택 지급완료
          </button>
          <button onclick="payrollBulkSyncAttendance()" class="px-3 py-1 bg-amber-600 text-white rounded text-sm hover:bg-amber-700">
            <i class="fas fa-sync-alt mr-1"></i>선택 근태 동기화
          </button>
        </div>

        <!-- 급여대장 (고정형 표 + 탭) — 단일 뷰 (compact 표 제거, 선택/상태/액션 통합) -->
        <div id="prLedgerCard" class="ds-card overflow-hidden">
          <div class="flex items-center justify-between px-4 py-2 border-b border-gray-200 bg-gray-50 flex-wrap gap-2">
            <div class="flex items-end gap-1">
              <button id="prLedgerTabMain" onclick="payrollSwitchLedgerTab('main')" class="px-3 py-1.5 text-xs font-semibold border-b-2 border-blue-600 text-blue-700">급여대장</button>
              <button id="prLedgerTabEmp" onclick="payrollSwitchLedgerTab('emp')" class="px-3 py-1.5 text-xs font-semibold border-b-2 border-transparent text-gray-500 hover:text-gray-700">회사부담금</button>
              <span id="prLedgerPeriod" class="text-xs font-normal text-gray-400 ml-2 pb-1"></span>
            </div>
            <div class="flex items-center gap-2">
              <button onclick="payrollLedgerPrint()" class="px-2 py-1 text-xs border border-gray-300 rounded hover:bg-gray-100"><i class="fas fa-print mr-1"></i>인쇄</button>
              <button onclick="payrollLedgerExportCsv()" class="px-2 py-1 text-xs border border-gray-300 rounded hover:bg-gray-100"><i class="fas fa-file-csv mr-1"></i>CSV</button>
            </div>
          </div>
          <div class="overflow-x-auto">
            <table id="prLedgerTable" class="ds-ledger"></table>
          </div>
        </div>

        <style>
          /* 급여대장: 고정형(table-layout:fixed) — 값이 바뀌어도 컬럼 폭 불변 */
          .ds-ledger { border-collapse: collapse; table-layout: fixed; font-variant-numeric: tabular-nums; }
          .ds-ledger th, .ds-ledger td { border: 1px solid #e5e7eb; padding: 3px 6px; box-sizing: border-box; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11px; line-height: 1.35; }
          .ds-ledger thead th { background: #f1f5f9; font-weight: 600; }
          .ds-ledger td.num, .ds-ledger th.num { text-align: right; }
          .ds-ledger td.lft, .ds-ledger th.lft { text-align: left; }
          .ds-ledger td.ctr, .ds-ledger th.ctr { text-align: center; }
          .ds-ledger td.z { color: #c8d0da; }                          /* 0원 값 흐리게 (구조상 표시는 유지) */
          .ds-ledger tr.band-b td { border-bottom: 2px solid #cbd5e1; } /* 직원(지급/공제 2행) 블록 구분선 */
          .ds-ledger .stick { position: sticky; background: #fff; z-index: 1; }
          .ds-ledger thead .stick { z-index: 3; background: #f1f5f9; }
          .ds-ledger .grp-pay { background: #eff6ff; }
          .ds-ledger .grp-ded { background: #fef2f2; }
          /* 4단 구조: 라벨+금액 셀 / 병합 계 셀 / 근태 메타 */
          .ds-ledger td.lv .lv-l { float: left; color: #94a3b8; font-size: 10px; }
          .ds-ledger td.lv .lv-v { float: right; font-variant-numeric: tabular-nums; }
          .ds-ledger td.sumcell { font-size: 12.5px; font-weight: 700; text-align: right; }
          .ds-ledger td.meta { color: #94a3b8; font-size: 10px; }
          .ds-ledger .grp-emp { background: #f0fdf4; }
          .ds-ledger .grp-sum { background: #fefce8; }
          .ds-ledger .b { font-weight: 600; }
          .ds-ledger tbody tr.subtotal td { background: #eef2f7; font-weight: 600; }
          .ds-ledger tbody tr.subtotal .stick { background: #eef2f7; }
          .ds-ledger tbody tr.grandtotal td { background: #dbe3ec; font-weight: 700; }
          .ds-ledger tbody tr.grandtotal .stick { background: #dbe3ec; }
          .ds-ledger tbody tr:hover td { background: #fafafa; }
          .ds-ledger tbody tr:hover .stick { background: #fafafa; }
        </style>
      </div>

      <!-- 급여 작성/수정 모달 -->
      <div id="prEditModal" class="ds-modal-overlay hidden">
        <div class="ds-modal max-h-[90vh] overflow-y-auto" style="max-width:48rem">
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
                <input type="text" id="prEditPayDate" class="js-fp w-full border rounded px-2 py-1.5 text-sm" maxlength="10" inputmode="numeric" placeholder="비우면 자동" />
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
                    <label class="text-xs text-gray-600">연장근로 시간 (×1.5, 고정+추가)</label>
                    <input type="number" step="0.5" id="prOvertimeHrs" class="w-full border rounded px-2 py-1.5 text-sm text-right" oninput="payrollPreview()" />
                    <div class="text-xs text-gray-500 mt-1">금액: <span id="prOvertimeAmt" class="font-semibold text-gray-800">0</span></div>
                    <div class="text-[11px] text-gray-500 mt-0.5" id="prOvertimeBreakdown"></div>
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
            <button onclick="payrollSave()" class="ds-btn ds-btn-primary text-xs"><i class="fas fa-save mr-1"></i>저장</button>
          </div>
        </div>
      </div>

      <!-- 선택 일괄수정 모달 -->
      <div id="prBulkModal" class="ds-modal-overlay hidden">
        <div class="ds-modal" style="max-width:32rem">
          <div class="px-5 py-3 border-b flex items-center justify-between">
            <h3 class="text-base font-semibold"><i class="fas fa-pen mr-1 text-amber-600"></i>선택 일괄수정</h3>
            <button onclick="payrollCloseBulkEdit()" class="text-gray-400 hover:text-gray-600"><i class="fas fa-times"></i></button>
          </div>
          <div class="p-5 space-y-3">
            <div class="text-xs text-gray-600 bg-amber-50 border border-amber-200 rounded p-2.5">
              <i class="fas fa-info-circle mr-1 text-amber-600"></i>빈칸은 변경하지 않습니다. <b>작성중(PENDING)</b> 상태만 수정되며(승인·지급완료는 잠금 스킵),
              변경 시 공제액(4대보험·소득세)은 자동 재계산됩니다.
              <div id="prBulkCount" class="font-semibold mt-1"></div>
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="text-xs text-gray-600">지급일</label>
                <input type="text" id="prBulkPayDate" class="js-fp w-full border rounded px-2 py-1.5 text-sm" maxlength="10" inputmode="numeric" placeholder="예: 2026-01-15" />
              </div>
              <div>
                <label class="text-xs text-gray-600">식대 (20만 비과세)</label>
                <input type="text" inputmode="numeric" data-money id="prBulkMeal" class="w-full border rounded px-2 py-1.5 text-sm text-right" placeholder="유지" />
              </div>
              <div>
                <label class="text-xs text-gray-600">자가운전 (20만 비과세)</label>
                <input type="text" inputmode="numeric" data-money id="prBulkTransport" class="w-full border rounded px-2 py-1.5 text-sm text-right" placeholder="유지" />
              </div>
              <div>
                <label class="text-xs text-gray-600">상여금</label>
                <input type="text" inputmode="numeric" data-money id="prBulkBonus" class="w-full border rounded px-2 py-1.5 text-sm text-right" placeholder="유지" />
              </div>
              <div>
                <label class="text-xs text-gray-600">기타수당</label>
                <input type="text" inputmode="numeric" data-money id="prBulkOther" class="w-full border rounded px-2 py-1.5 text-sm text-right" placeholder="유지" />
              </div>
              <div>
                <label class="text-xs text-gray-600">기타공제</label>
                <input type="text" inputmode="numeric" data-money id="prBulkOtherDed" class="w-full border rounded px-2 py-1.5 text-sm text-right" placeholder="유지" />
              </div>
            </div>
          </div>
          <div class="px-5 py-3 border-t flex justify-end gap-2">
            <button onclick="payrollCloseBulkEdit()" class="px-3 py-1.5 text-xs border border-gray-300 text-gray-700 bg-white rounded hover:bg-gray-50">취소</button>
            <button onclick="payrollBulkEditApply()" class="ds-btn ds-btn-primary text-xs"><i class="fas fa-pen mr-1"></i>적용</button>
          </div>
        </div>
      </div><!-- /prHubPayroll -->

        <!-- 요율 관리 탭 (payrollRates 단일소스 이식, lazy) -->
        <div id="prHubRates" class="hidden">${payrollRatesContent}</div>
      </div>
    `,
    pageScript: combinedScript,
  })
}
