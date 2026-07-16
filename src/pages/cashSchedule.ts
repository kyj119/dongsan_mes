import type { Context } from 'hono'
import type { HonoEnv } from '../types/env'
import { renderPage } from '../layout'
import pageScript from '../scripts/cashSchedule.js?raw'
import cashFlowScript from '../scripts/cashFlow.js?raw'
import bankScript from '../scripts/bank.js?raw'
import { bankPageContent, bankPageCSS } from './bank'

export function cashSchedulePage(c: Context<HonoEnv>) {
  // P3 자금 허브: [계획](cashSchedule, 기본) + [실적](bank, ADMIN·lazy) 통합. /bank 사이드바 은퇴(라우트 보존).
  // 실적 첫 진입까지 bank.js Init 지연(__bankHubDefer). 실적 탭은 ADMIN에게만 노출(bank API=서버 requireRole ADMIN).
  const hubScript = `
    (function(){
      var __hubRole=''; try{ __hubRole=(JSON.parse(localStorage.getItem('user')||'{}').role)||''; }catch(e){}
      // 실적 모드는 ADMIN 전용 — 비관리자는 토글 숨김(서버에서도 bank API 차단)
      var __ab=document.getElementById('hubTabActuals');
      if(__ab && __hubRole!=='ADMIN') __ab.style.display='none';
      window.switchHubMode=function(mode){
        var plan=document.getElementById('hubPlan'), act=document.getElementById('hubActuals');
        var pb=document.getElementById('hubTabPlan'), ab=document.getElementById('hubTabActuals');
        if(!plan||!act||!pb||!ab){ console.warn('[cash-hub] hub nodes not found'); return; }
        if(mode==='actuals' && __hubRole!=='ADMIN'){ return; } // 방어: 비관리자 실적 진입 차단
        if(mode==='actuals'){
          plan.classList.add('hidden'); act.classList.remove('hidden');
          ab.classList.add('border-blue-600','text-blue-600'); ab.classList.remove('border-transparent','text-gray-500');
          pb.classList.remove('border-blue-600','text-blue-600'); pb.classList.add('border-transparent','text-gray-500');
          if(typeof window.__bankHubInit==='function') window.__bankHubInit(); // lazy·멱등
        } else {
          act.classList.add('hidden'); plan.classList.remove('hidden');
          pb.classList.add('border-blue-600','text-blue-600'); pb.classList.remove('border-transparent','text-gray-500');
          ab.classList.remove('border-blue-600','text-blue-600'); ab.classList.add('border-transparent','text-gray-500');
        }
      };
      // P4 표시 일원화: 모드+하위탭 동시 이동(겹치는 위젯 상호 네비게이션)
      window.hubGoto=function(mode, tab){
        if(typeof window.switchHubMode==='function') window.switchHubMode(mode);
        if(mode==='plan' && tab && typeof window.switchScheduleTab==='function') window.switchScheduleTab(tab);
        if(mode==='actuals' && tab && typeof window.switchBankTab==='function') window.switchBankTab(tab);
      };
      // 상호참조 링크 노출: .hub-only(실적↔계획, 허브에서만)·.hub-actuals-link(계획→실적, ADMIN만)
      Array.prototype.forEach.call(document.querySelectorAll('.hub-only'), function(el){ el.classList.remove('hidden'); });
      if(__hubRole==='ADMIN'){
        Array.prototype.forEach.call(document.querySelectorAll('.hub-actuals-link'), function(el){ el.classList.remove('hidden'); });
      }
    })();
  `
  return renderPage(c, {
    title: '자금 관리',
    activePage: '/cash-schedule',
    pageCSS: bankPageCSS,
    pageContent: `
      <!-- 최상위 허브 토글: [계획]/[실적] (P3 자금 허브 통합) -->
      <div class="ds-card flex border-b mb-3">
        <button id="hubTabPlan" onclick="switchHubMode('plan')" class="px-5 py-2.5 text-sm font-semibold border-b-2 border-blue-600 text-blue-600 flex items-center gap-2">
          <i class="fas fa-calendar-alt"></i>계획
        </button>
        <button id="hubTabActuals" onclick="switchHubMode('actuals')" class="px-5 py-2.5 text-sm font-semibold border-b-2 border-transparent text-gray-500 hover:text-gray-700 flex items-center gap-2">
          <i class="fas fa-university"></i>실적 <span class="text-[10px] font-normal text-gray-400">은행·매칭</span>
        </button>
      </div>

      <!-- ===== 계획 모드 (cashSchedule, 기본) ===== -->
      <div id="hubPlan">
      <div class="space-y-4">
        <!-- 탭 버튼 -->
        <div class="ds-card flex border-b">
          <button id="tabSchedule" onclick="switchScheduleTab('schedule')" class="px-4 py-2 text-sm font-medium border-b-2 border-blue-600 text-blue-600 flex items-center gap-2">
            <i class="fas fa-calendar-alt text-sm"></i>자금계획
          </button>
          <button id="tabMonthly" onclick="switchScheduleTab('monthly')" class="px-4 py-2 text-sm font-medium border-b-2 border-transparent text-gray-500 hover:text-gray-700 flex items-center gap-2">
            <i class="fas fa-chart-bar text-sm"></i>월별 요약
          </button>
          <button id="tabFixed" onclick="switchScheduleTab('fixed')" class="px-4 py-2 text-sm font-medium border-b-2 border-transparent text-gray-500 hover:text-gray-700 flex items-center gap-2">
            <i class="fas fa-file-invoice-dollar text-sm"></i>고정비
          </button>
          <button id="tabLoans" onclick="switchScheduleTab('loans')" class="px-4 py-2 text-sm font-medium border-b-2 border-transparent text-gray-500 hover:text-gray-700 flex items-center gap-2">
            <i class="fas fa-university text-sm"></i>대출
          </button>
          <button id="tabForecast" onclick="switchScheduleTab('forecast')" class="px-4 py-2 text-sm font-medium border-b-2 border-transparent text-gray-500 hover:text-gray-700 flex items-center gap-2">
            <i class="fas fa-chart-line text-sm"></i>추정자금일보
          </button>
        </div>

        <!-- 자금계획 탭 -->
        <div id="schedulePanel" class="space-y-4">
          <!-- KPI 카드 -->
          <div class="grid grid-cols-5 gap-2">
            <div class="ds-card p-2.5 text-center hover:shadow-md transition-shadow">
              <div class="text-[10px] text-gray-400 mb-1">이번달 입금예정</div>
              <div class="text-lg font-bold tabular-nums text-gray-900" id="schKpiInTotal">-</div>
            </div>
            <div class="ds-card p-2.5 text-center hover:shadow-md transition-shadow">
              <div class="text-[10px] text-gray-400 mb-1">이번달 지급예정</div>
              <div class="text-lg font-bold tabular-nums text-gray-900" id="schKpiOutTotal">-</div>
            </div>
            <div class="ds-card p-2.5 text-center hover:shadow-md transition-shadow">
              <div class="text-[10px] text-gray-400 mb-1">순 현금흐름</div>
              <div class="text-lg font-bold tabular-nums text-gray-900" id="schKpiNetFlow">-</div>
            </div>
            <div class="ds-card p-2.5 text-center hover:shadow-md transition-shadow">
              <div class="text-[10px] text-gray-400 mb-1">입금 완료</div>
              <div class="text-lg font-bold tabular-nums text-gray-900" id="schKpiInDone">-</div>
            </div>
            <div class="ds-card border-red-200 p-2.5 text-center hover:shadow-md transition-shadow">
              <div class="text-[10px] text-red-500 font-medium mb-1">연체</div>
              <div class="text-lg font-bold text-red-600 tabular-nums" id="schKpiOverdue">-</div>
            </div>
          </div>

          <!-- 제어 바 -->
          <div class="ds-card p-3 flex items-center gap-2">
            <button onclick="schPrevMonth()" class="px-2 py-1.5 text-xs border border-gray-300 text-gray-700 bg-white rounded hover:bg-gray-50">
              <i class="fas fa-chevron-left"></i>
            </button>
            <button onclick="schToday()" class="px-2 py-1.5 text-xs border border-gray-300 text-gray-700 bg-white rounded hover:bg-gray-50">오늘</button>
            <div id="schMonthLabel" class="text-sm font-medium ml-2"></div>
            <button onclick="schNextMonth()" class="px-2 py-1.5 text-xs border border-gray-300 text-gray-700 bg-white rounded hover:bg-gray-50">
              <i class="fas fa-chevron-right"></i>
            </button>
            <div class="flex-1"></div>
            <button onclick="schAutoGenerate()" class="px-3 py-1.5 text-xs border border-amber-300 text-amber-700 bg-amber-50 rounded hover:bg-amber-100">
              <i class="fas fa-magic mr-1"></i>자동생성
            </button>
            <button onclick="schCheckOverdue()" class="px-3 py-1.5 text-xs border border-red-300 text-red-700 bg-red-50 rounded hover:bg-red-100">
              <i class="fas fa-exclamation-triangle mr-1"></i>연체체크
            </button>
            <button onclick="schExportCSV()" class="px-3 py-1.5 text-xs border border-gray-300 text-gray-700 bg-white rounded hover:bg-gray-50" title="현재 월 자금일정 CSV">
              <i class="fas fa-file-csv mr-1"></i>CSV
            </button>
            <button onclick="schOpenAddModal()" class="ds-btn ds-btn-primary text-xs">
              <i class="fas fa-plus mr-1"></i>예정 등록
            </button>
          </div>

          <!-- 캘린더 그리드 -->
          <div class="ds-card p-3">
            <div class="grid grid-cols-7 gap-1 text-[10px]">
              <!-- 요일 헤더 -->
              <div class="text-center font-bold text-gray-600 py-1">일</div>
              <div class="text-center font-bold text-gray-600 py-1">월</div>
              <div class="text-center font-bold text-gray-600 py-1">화</div>
              <div class="text-center font-bold text-gray-600 py-1">수</div>
              <div class="text-center font-bold text-gray-600 py-1">목</div>
              <div class="text-center font-bold text-gray-600 py-1">금</div>
              <div class="text-center font-bold text-gray-600 py-1">토</div>
              <!-- 캘린더 셀 -->
              <div id="schCalendarContainer" class="col-span-7"></div>
            </div>
          </div>
        </div>

        <!-- 추정자금일보 탭 -->
        <div id="forecastPanel" class="hidden space-y-4">
          <!-- 제어 바 -->
          <div class="ds-card p-3 flex items-center gap-2">
            <label class="text-[10px] text-gray-500">시작 잔액</label>
            <input id="fcStartBalance" type="text" inputmode="numeric" data-money value="0" class="border rounded px-2 py-1 text-xs w-32 text-gray-900">
            <label class="text-[10px] text-gray-500 ml-2">기간</label>
            <select id="fcDays" class="border rounded px-2 py-1 text-xs">
              <option value="30">30일</option>
              <option value="60">60일</option>
              <option value="90" selected>90일</option>
              <option value="180">180일</option>
            </select>
            <div class="flex-1"></div>
            <button onclick="loadForecast()" class="ds-btn ds-btn-primary text-xs">
              <i class="fas fa-play mr-1"></i>예측 실행
            </button>
          </div>

          <!-- KPI 카드 -->
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
            <div class="ds-card p-2.5 text-center hover:shadow-md transition-shadow">
              <div class="text-[10px] text-gray-400 mb-1">예상 종료 잔액</div>
              <div class="text-lg font-bold tabular-nums text-gray-900" id="fcKpiEndBalance">-</div>
            </div>
            <div class="ds-card p-2.5 text-center hover:shadow-md transition-shadow">
              <div class="text-[10px] text-gray-400 mb-1">최저 잔액</div>
              <div class="text-lg font-bold tabular-nums text-gray-900" id="fcKpiMinBalance">-</div>
            </div>
            <div class="ds-card p-2.5 text-center hover:shadow-md transition-shadow">
              <div class="text-[10px] text-gray-400 mb-1">최고 잔액</div>
              <div class="text-lg font-bold tabular-nums text-gray-900" id="fcKpiMaxBalance">-</div>
            </div>
            <div class="ds-card border-red-200 p-2.5 text-center hover:shadow-md transition-shadow">
              <div class="text-[10px] text-red-500 font-medium mb-1">위험일</div>
              <div class="text-lg font-bold text-red-600 tabular-nums" id="fcKpiRiskDays">-</div>
            </div>
          </div>

          <!-- 차트 (간단한 HTML 바 차트) -->
          <div class="ds-card p-3">
            <div class="text-xs font-medium mb-2 text-gray-600">일별 잔액 추이</div>
            <div id="fcChartContainer" class="w-full overflow-x-auto" style="max-height: 200px;">
              <div class="flex gap-1" id="fcChart"></div>
            </div>
          </div>

          <!-- 위험일 테이블 -->
          <div class="ds-card p-3">
            <div class="text-xs font-medium mb-2 text-gray-600">음수 잔액 일자</div>
            <div id="fcRiskTable" class="overflow-x-auto"></div>
          </div>

          <!-- 예측 테이블 -->
          <div class="ds-card p-3">
            <div class="text-xs font-medium mb-2 text-gray-600">일별 예측</div>
            <div id="fcForecastTable" class="overflow-x-auto"></div>
          </div>
        </div>
      </div>

        <!-- 월별 요약 탭 (구 캐시플로 현황) -->
        <div id="monthlyPanel" class="hidden space-y-4">
          <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div class="ds-card p-4"><div class="text-sm text-gray-500">이번달 수입</div><div id="kpiIncome" class="text-2xl font-bold text-green-600 mt-1">-</div></div>
            <div class="ds-card p-4"><div class="text-sm text-gray-500">이번달 지출</div><div id="kpiExpense" class="text-2xl font-bold text-red-600 mt-1">-</div></div>
            <div class="ds-card p-4"><div class="text-sm text-gray-500">순 현금흐름</div><div id="kpiNet" class="text-2xl font-bold mt-1">-</div></div>
            <div class="ds-card p-4"><div class="text-sm text-gray-500">대출 잔액 합계</div><div id="kpiLoanBalance" class="text-2xl font-bold mt-1">-</div><button onclick="switchScheduleTab('loans')" class="text-[11px] text-gray-400 hover:text-blue-600 mt-0.5"><i class="fas fa-arrow-right text-[9px] mr-0.5"></i>대출 상세</button></div>
          </div>
          <div class="ds-card p-6">
            <h3 class="text-lg font-bold mb-4">6개월 현금흐름 전망</h3>
            <div id="monthlyChart" class="space-y-3"></div>
          </div>
          <div class="ds-card p-6">
            <h3 class="text-lg font-bold mb-4">월별 상세</h3>
            <div class="overflow-x-auto" style="max-height: calc(100vh - 280px); overflow-y: auto;">
              <table class="w-full text-sm ds-table ds-table-striped">
                <thead>
                  <tr class="bg-gray-50 text-gray-600">
                    <th class="col-name px-3 py-2 text-left">월</th>
                    <th class="col-amount px-3 py-2 text-right">수입</th>
                    <th class="col-amount px-3 py-2 text-right">지출</th>
                    <th class="col-amount px-3 py-2 text-right">순 현금흐름</th>
                    <th class="col-amount px-3 py-2 text-right">누적</th>
                  </tr>
                </thead>
                <tbody id="monthlyTable"></tbody>
              </table>
            </div>
          </div>
        </div>

        <!-- 고정비 탭 -->
        <div id="fixedPanel" class="hidden space-y-4">
          <div class="ds-card p-6">
            <div class="flex items-center justify-between mb-4">
              <h3 class="text-lg font-bold"><i class="fas fa-file-invoice-dollar text-blue-600 mr-2"></i>고정비 목록 <span class="text-xs font-normal text-gray-400">(마스터·계획)</span></h3>
              <div class="flex items-center gap-2">
                <button onclick="hubGoto('actuals','fund')" class="hub-actuals-link hidden text-xs text-gray-500 hover:text-blue-600 border border-gray-200 rounded px-2 py-1" title="실적 모드의 당월 출금 대사로 이동">
                  <i class="fas fa-right-left mr-1"></i>당월 실제 출금현황
                </button>
                <button onclick="openFixedExpenseModal()" class="ds-btn ds-btn-primary ds-btn-sm">
                  <i class="fas fa-plus mr-1"></i>추가
                </button>
              </div>
            </div>
            <div class="overflow-x-auto" style="max-height: calc(100vh - 280px); overflow-y: auto;">
              <table class="w-full text-sm ds-table ds-table-striped">
                <thead>
                  <tr class="bg-gray-50 text-gray-600">
                    <th class="col-name px-3 py-2 text-left">이름</th>
                    <th class="col-tag px-3 py-2 text-left">분류</th>
                    <th class="col-amount px-3 py-2 text-right">금액</th>
                    <th class="col-tag px-3 py-2 text-center">주기</th>
                    <th class="col-qty px-3 py-2 text-center">납부일</th>
                    <th class="col-flex px-3 py-2 text-left">기간</th>
                    <th class="col-status px-3 py-2 text-center">상태</th>
                    <th class="col-action px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody id="fixedExpenseTable"></tbody>
              </table>
            </div>
            <div id="noFixedMsg" class="text-center text-gray-400 py-6 hidden">등록된 고정비가 없습니다.</div>
          </div>
        </div>

        <!-- 대출 탭 -->
        <div id="loansPanel" class="hidden space-y-4">
          <div class="ds-card p-6">
            <div class="flex items-center justify-between mb-4">
              <h3 class="text-lg font-bold"><i class="fas fa-university text-blue-600 mr-2"></i>대출 목록</h3>
              <button onclick="openLoanModal()" class="ds-btn ds-btn-primary ds-btn-sm">
                <i class="fas fa-plus mr-1"></i>추가
              </button>
            </div>
            <div class="overflow-x-auto" style="max-height: calc(100vh - 280px); overflow-y: auto;">
              <table class="w-full text-sm ds-table ds-table-striped">
                <thead>
                  <tr class="bg-gray-50 text-gray-600">
                    <th class="col-name px-3 py-2 text-left">대출기관</th>
                    <th class="col-code px-3 py-2 text-left">대출번호</th>
                    <th class="col-amount px-3 py-2 text-right">원금</th>
                    <th class="col-amount px-3 py-2 text-right">잔액</th>
                    <th class="col-qty px-3 py-2 text-center">금리(%)</th>
                    <th class="col-tag px-3 py-2 text-center">상환방식</th>
                    <th class="col-date px-3 py-2 text-left">만기일</th>
                    <th class="col-action px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody id="loanTable"></tbody>
              </table>
            </div>
            <div id="noLoanMsg" class="text-center text-gray-400 py-6 hidden">등록된 대출이 없습니다.</div>
          </div>

          <!-- 대출 상세 (선택 시 표시) -->
          <div id="loanDetailPanel" class="hidden">
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div class="ds-card p-6">
                <h4 class="font-bold mb-3"><i class="fas fa-chart-line text-orange-500 mr-2"></i>금리 변동 이력</h4>
                <div id="rateHistoryTable"></div>
                <button onclick="openRateChangeModal()" class="mt-3 px-3 py-1.5 border border-gray-300 text-gray-700 bg-white rounded-lg hover:bg-gray-50 text-sm">
                  <i class="fas fa-edit mr-1"></i>금리 변경
                </button>
              </div>
              <div class="ds-card p-6">
                <h4 class="font-bold mb-3"><i class="fas fa-calendar-check text-green-600 mr-2"></i>상환 스케줄</h4>
                <div class="flex gap-2 mb-3">
                  <button onclick="generateSchedule()" class="ds-btn ds-btn-primary ds-btn-sm">
                    <i class="fas fa-sync mr-1"></i>스케줄 생성
                  </button>
                </div>
                <div id="scheduleTable" class="max-h-96 overflow-y-auto"></div>
              </div>
            </div>
          </div>
        </div>

      <!-- 일별 상세 모달 -->
      <div id="schDayModal" class="ds-modal-overlay hidden">
        <div class="ds-modal max-h-96 overflow-y-auto" style="max-width:24rem">
          <div class="flex justify-between items-center px-4 py-3 border-b">
            <h3 class="text-sm font-bold" id="schDayModalTitle"></h3>
            <button onclick="schCloseDayDetail()" class="text-gray-400 hover:text-gray-600">
              <i class="fas fa-times"></i>
            </button>
          </div>
          <div id="schDayModalContent" class="p-4 space-y-2"></div>
        </div>
      </div>

      <!-- 예정 등록 모달 -->
      <div id="schAddModal" class="ds-modal-overlay hidden">
        <div class="ds-modal" style="max-width:24rem">
          <div class="flex justify-between items-center px-4 py-3 border-b">
            <h3 class="text-sm font-bold">예정 등록</h3>
            <button onclick="schCloseAddModal()" class="text-gray-400 hover:text-gray-600">
              <i class="fas fa-times"></i>
            </button>
          </div>
          <div class="p-4 space-y-3">
            <div>
              <label class="text-xs font-medium mb-1 block" style="color:#374151;">거래처 (선택)</label>
              <div class="relative">
                <input id="schAddClientSearch" type="text" autocomplete="off" placeholder="거래처명 입력" class="w-full border rounded px-3 py-2 text-sm text-gray-900" oninput="schSearchClient(this.value)" onfocus="schSearchClient(this.value)">
                <input type="hidden" id="schAddClientId">
                <div id="schAddClientDropdown" class="hidden absolute z-50 left-0 right-0 top-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto"></div>
              </div>
            </div>
            <div>
              <label class="text-xs font-medium mb-1 block" style="color:#374151;">예정일</label>
              <input id="schAddDate" type="date" class="w-full border rounded px-3 py-2 text-sm text-gray-900">
              <div id="schAddDateErr" class="text-[10px] text-red-600 mt-0.5"></div>
            </div>
            <div>
              <label class="text-xs font-medium mb-1 block" style="color:#374151;">유형</label>
              <select id="schAddType" class="w-full border rounded px-3 py-2 text-sm text-gray-900">
                <option value="IN">입금</option>
                <option value="OUT">지급</option>
              </select>
            </div>
            <div>
              <label class="text-xs font-medium mb-1 block" style="color:#374151;">분류</label>
              <select id="schAddSource" class="w-full border rounded px-3 py-2 text-sm text-gray-900">
                <option value="ORDER">매출 주문</option>
                <option value="PURCHASE">구매 발주</option>
                <option value="FIXED">고정비</option>
                <option value="TAX">세금</option>
                <option value="PAYROLL">급여</option>
                <option value="LOAN">차입금</option>
                <option value="OTHER">기타</option>
              </select>
            </div>
            <div>
              <label class="text-xs font-medium mb-1 block" style="color:#374151;">금액</label>
              <input id="schAddAmount" type="text" inputmode="numeric" data-money class="w-full border rounded px-3 py-2 text-sm text-gray-900">
              <div id="schAddAmountErr" class="text-[10px] text-red-600 mt-0.5"></div>
            </div>
            <div>
              <label class="text-xs font-medium mb-1 block" style="color:#374151;">설명</label>
              <input id="schAddDesc" type="text" placeholder="선택사항" class="w-full border rounded px-3 py-2 text-sm text-gray-900">
            </div>
            <div class="flex gap-2 justify-end pt-2">
              <button onclick="schCloseAddModal()" class="px-3 py-1.5 text-xs border border-gray-300 text-gray-700 bg-white rounded hover:bg-gray-50">취소</button>
              <button onclick="schSave()" class="ds-btn ds-btn-primary text-xs">저장</button>
            </div>
          </div>
        </div>
      </div>
      </div><!-- /#hubPlan -->

      <!-- ===== 실적 모드 (bank, ADMIN·lazy) — 단일소스 bankPageContent 이식 ===== -->
      <div id="hubActuals" class="hidden">
        ${bankPageContent}
      </div>
    `,
    // 순서: 프리앰블(__bankHubDefer=true)로 bank.js 자동실행 차단 → cashSchedule/cashFlow → bank → 허브토글
    pageScript: 'window.__bankHubDefer = true;\n;\n' + pageScript + '\n;\n' + cashFlowScript + '\n;\n' + bankScript + '\n;\n' + hubScript
  })
}
