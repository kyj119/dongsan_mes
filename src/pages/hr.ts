import type { Context } from 'hono'
import type { HonoEnv } from '../types/env'
import { renderPage } from '../layout'
import { deptOptions, positionOptions, employmentTypeOptions } from '../constants/hr'
import pageScript from '../scripts/hr.js?raw'
import departmentsScript from '../scripts/departments.js?raw'

export function hrPage(c: Context<HonoEnv>) {
  return renderPage(c, {
    title: '인사 관리',
    activePage: '/hr',
    pageContent: `
      <div class="space-y-6">
        <!-- 탭 -->
        <div class="flex gap-1 border-b border-gray-200">
          <button id="hrTabBtnEmployees" onclick="hrSwitchTab('employees')" class="px-4 py-2 text-sm font-medium border-b-2 border-blue-600 text-blue-600">직원 관리</button>
          <button id="hrTabBtnDepartments" onclick="hrSwitchTab('departments')" class="px-4 py-2 text-sm font-medium border-b-2 border-transparent text-gray-500 hover:text-gray-700">부문 관리</button>
          <button id="hrTabBtnPnl" onclick="hrSwitchTab('pnl')" class="px-4 py-2 text-sm font-medium border-b-2 border-transparent text-gray-500 hover:text-gray-700">부문 손익</button>
        </div>

        <div id="hrTabEmployees" class="space-y-6">
        <!-- 요약 카드 -->
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div class="ds-card p-5">
            <div class="text-xs text-gray-500">총 직원</div>
            <div class="text-3xl font-bold text-gray-900 mt-1" id="hrTotalEmployees">-</div>
            <div class="text-xs text-gray-400 mt-1">재직 중</div>
          </div>
          <div class="ds-card p-5">
            <div class="text-xs text-gray-500">금일 출근</div>
            <div class="text-3xl font-bold text-green-600 mt-1" id="hrTodayAttendance">-</div>
            <div class="text-xs text-gray-400 mt-1">오늘 출근 인원</div>
          </div>
          <div class="ds-card p-5">
            <div class="text-xs text-gray-500">평균 근무시간</div>
            <div class="text-3xl font-bold text-gray-900 mt-1" id="hrAvgWorkHours">-</div>
            <div class="text-xs text-gray-400 mt-1">이번 달 평균</div>
          </div>
          <div class="ds-card p-5">
            <div class="text-xs text-gray-500">월 인건비</div>
            <div class="text-3xl font-bold text-gray-900 mt-1" id="hrMonthlyPayroll">-</div>
            <div class="text-xs text-gray-400 mt-1" id="hrMonthlyPayrollSub">이번 달 총액</div>
          </div>
        </div>

        <!-- 필터 바 -->
        <div class="ds-card p-4">
          <div class="flex flex-wrap items-center gap-3">
            <input id="hrSearch" type="text" placeholder="사번/이름 검색" class="flex-1 min-w-[200px] border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500" />
            <select id="hrFilterDept" class="border border-gray-300 rounded-lg px-3 py-2 text-sm">
              ${deptOptions({ lead: '전체 부서' })}
            </select>
            <select id="hrFilterPosition" class="border border-gray-300 rounded-lg px-3 py-2 text-sm">
              ${positionOptions({ lead: '전체 직급' })}
            </select>
            <select id="hrFilterStatus" class="border border-gray-300 rounded-lg px-3 py-2 text-sm">
              <option value="ACTIVE">재직</option>
              <option value="RESIGNED">퇴사</option>
              <option value="">전체</option>
            </select>
            <button onclick="hrLoadEmployees()" class="ds-btn ds-btn-primary text-sm font-medium">
              <i class="fas fa-search mr-1"></i> 검색
            </button>
            <button onclick="hrOpenEmployeeModal()" class="ds-btn ds-btn-primary text-sm font-medium">
              <i class="fas fa-plus mr-1"></i> 직원 등록
            </button>
          </div>
        </div>

        <!-- 직원 목록 -->
        <div class="ds-card overflow-hidden">
          <div class="overflow-x-auto">
            <table class="w-full text-sm ds-table ds-table-striped">
              <thead class="bg-gray-50 text-xs text-gray-600 uppercase tracking-wider">
                <tr>
                  <!-- 사번은 '코드'가 아니라 6~8자 ID(DS-044) — 실측 필요폭 80px 인데 col-code(148px)를 쓰고 있었다.
                       고정폭 총합이 컨테이너를 넘겨 이름 열이 min-width(140px) 아래인 130px 로 눌렸고
                       (table-layout:fixed 에선 min-width 가 무시된다) 외국인 이름이 잘렸다. 60px 를 이름에 넘긴다. -->
                  <th class="col-code px-4 py-3 text-left" style="width:88px">사번</th>
                  <th class="col-name px-4 py-3 text-left">이름</th>
                  <th class="col-tag px-4 py-3 text-left">소속법인</th>
                  <th class="col-tag px-4 py-3 text-left">부서</th>
                  <th class="col-tag px-4 py-3 text-left">직급</th>
                  <th class="col-phone px-4 py-3 text-left">전화번호</th>
                  <th class="col-date px-4 py-3 text-left">입사일</th>
                  <th class="col-amount px-4 py-3 text-right">기본급</th>
                  <th class="col-status px-4 py-3 text-center">상태</th>
                  <th class="col-action px-4 py-3 text-center">상세</th>
                </tr>
              </thead>
              <tbody id="hrEmployeeBody" class="bg-white">
                <tr><td colspan="10" class="text-center py-12 text-gray-400">
                  <i class="fas fa-users text-4xl text-gray-300 mb-2 block"></i>
                  직원 데이터를 불러오는 중...
                </td></tr>
              </tbody>
            </table>
          </div>
        </div>

        <p class="text-xs text-gray-500">
          <i class="fas fa-info-circle mr-1"></i>
          직원 행을 클릭하면 개인 상세 페이지로 이동합니다 (월별 근태, 연장근무, 급여 이력 확인).
        </p>
        </div><!-- /hrTabEmployees -->

        <!-- 부문 관리 탭 -->
        <div id="hrTabDepartments" class="hidden space-y-6">
          <div class="flex items-center justify-between">
            <div>
              <h3 class="text-base font-bold text-gray-900">부문 구조</h3>
              <p class="text-sm text-gray-500 mt-1">부문별 손익(관리회계)의 조직 그릇 — 매출·자재비·인건비 귀속 기준. PRODUCTION=매출발생 · SUPPORT=공통/지원 · serves=지원 생산부문</p>
            </div>
            <button onclick="openAddDeptModal()" class="ds-btn ds-btn-primary text-sm"><i class="fas fa-plus mr-1"></i>부문 추가</button>
          </div>

          <div class="ds-card overflow-hidden">
            <table class="w-full text-sm ds-table ds-table-striped">
              <thead><tr>
                <th class="text-left" style="width:28%">부문</th>
                <th class="text-center" style="width:14%">유형</th>
                <th class="text-left" style="width:16%">지원 생산부문</th>
                <th class="text-center" style="width:14%">재직/전체</th>
                <th class="text-center" style="width:12%">상태</th>
                <th class="text-center" style="width:16%">동작</th>
              </tr></thead>
              <tbody id="deptTreeBody"></tbody>
            </table>
            <div id="deptTreeEmpty" class="hidden text-center py-10 text-sm text-gray-400">등록된 부문이 없습니다.</div>
          </div>

          <div class="ds-card overflow-hidden">
            <div class="px-5 py-3 border-b border-gray-200 flex items-center justify-between">
              <div class="flex items-center gap-2">
                <i class="fas fa-users text-gray-400"></i>
                <h3 class="text-base font-bold text-gray-900">직원 부문 배정</h3>
                <span id="deptEmpCount" class="text-xs text-gray-400"></span>
              </div>
              <label class="flex items-center gap-2 text-xs text-gray-600">
                <input type="checkbox" id="deptShowResigned" class="w-4 h-4" onchange="deptToggleResigned(this)"> 퇴사자 포함
              </label>
            </div>
            <div class="max-h-96 overflow-y-auto">
              <table class="w-full text-sm ds-table ds-table-striped">
                <thead class="sticky top-0 bg-white"><tr>
                  <th class="text-left" style="width:22%">이름</th>
                  <th class="text-left" style="width:14%">직급</th>
                  <th class="text-left" style="width:14%">법인</th>
                  <th class="text-left" style="width:16%">레거시</th>
                  <th class="text-left" style="width:34%">부문</th>
                </tr></thead>
                <tbody id="deptEmpBody"></tbody>
              </table>
            </div>
            <div id="deptEmpEmpty" class="hidden text-center py-10 text-sm text-gray-400">직원이 없습니다.</div>
          </div>

          <div class="ds-card overflow-hidden">
            <div class="px-5 py-3 border-b border-gray-200 flex items-center gap-2">
              <i class="fas fa-code-branch text-gray-400"></i>
              <h3 class="text-base font-bold text-gray-900">매출 귀속 매핑</h3>
              <span class="text-xs text-gray-400">품목 분류(category) → 부문. 미매핑은 '미분류'로 집계</span>
            </div>
            <div id="deptCatBody" class="p-5 flex flex-wrap gap-2"></div>
            <div id="deptCatEmpty" class="hidden text-center py-8 text-sm text-gray-400">매핑이 없습니다.</div>
          </div>
        </div><!-- /hrTabDepartments -->

        <!-- 부문 손익 탭 -->
        <div id="hrTabPnl" class="hidden space-y-4">
          <div class="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h3 class="text-base font-bold text-gray-900">부문 손익 (관리회계)</h3>
              <p class="text-sm text-gray-500 mt-1">매출·자재비·인건비 → 공헌이익. 매출=주문라인 기준 · 인건비=급여+회사부담 4대보험 · 자재비=소진이력×이동평균단가</p>
            </div>
            <div class="flex items-center gap-2 flex-wrap">
              <select id="deptPnlBasis" onchange="loadDeptPnl()" class="border border-gray-300 rounded-lg px-2 py-2 text-sm" title="공통비 배부 기준">
                <option value="revenue">배부:매출비례</option>
                <option value="headcount">배부:인원비례</option>
                <option value="labor">배부:인건비비례</option>
              </select>
              <input type="text" id="deptPnlFrom" class="js-fp border border-gray-300 rounded-lg px-3 py-2 text-sm" maxlength="10" inputmode="numeric" placeholder="예: 2026-01-15">
              <span class="text-gray-400">~</span>
              <input type="text" id="deptPnlTo" class="js-fp border border-gray-300 rounded-lg px-3 py-2 text-sm" maxlength="10" inputmode="numeric" placeholder="예: 2026-01-15">
              <button onclick="loadDeptPnl()" class="ds-btn ds-btn-primary text-sm"><i class="fas fa-search mr-1"></i>검색</button>
            </div>
          </div>

          <div class="ds-card overflow-hidden">
            <div class="overflow-x-auto">
              <table class="w-full text-sm ds-table ds-table-striped">
                <thead><tr>
                  <th class="text-left" style="width:16%">부문</th>
                  <th class="text-right" style="width:14%">매출</th>
                  <th class="text-right" style="width:12%">자재비</th>
                  <th class="text-right" style="width:12%">인건비</th>
                  <th class="text-right" style="width:12%">공헌이익</th>
                  <th class="text-right" style="width:11%" title="이 부문에 직접 지정된 고정자산의 월별 감가상각비. 부문 미지정 자산은 공통풀로 들어가 배분원가에 섞입니다.">감가상각</th>
                  <th class="text-right" style="width:12%" title="지원부문 직접귀속 + 공통비 안분">배분원가</th>
                  <th class="text-right" style="width:11%">영업이익</th>
                  <th class="text-right" style="width:8%">이익률</th>
                </tr></thead>
                <tbody id="deptPnlBody"></tbody>
                <tfoot id="deptPnlFoot" class="font-semibold bg-gray-50"></tfoot>
              </table>
            </div>
            <div id="deptPnlEmpty" class="hidden text-center py-10 text-sm text-gray-400">데이터를 조회하세요.</div>
          </div>

          <!-- 공통비/지원부문 배부 풀 -->
          <div id="deptPnlPool" class="ds-card p-4 hidden"></div>

          <p class="text-xs text-gray-400">
            <i class="fas fa-info-circle mr-1"></i>영업이익 = 공헌이익(매출−자재비−직접인건비) − <b>감가상각</b> − 배분원가. <b>감가상각</b> = 고정자산에 지정된 부문으로 직접 귀속(<a href="/accounting" class="text-blue-600 hover:underline">/accounting 고정자산 탭</a>에서 지정) — 미지정 자산은 공통풀로 들어가 배분원가에 섞인다. <b>배분원가</b> = 지원 하위부문(디자인-출력/전사/간판) 인건비 직접귀속 + 공통풀(봉제·관리 인건비 + 고정비 임대·통신·전기 + 미지정 감가상각) 안분(배부기준 선택). 배부는 리포트 계산 단계만 — 원장 불변. 자재비=0은 소진 자동차감 미가동 구간.
          </p>
        </div>
      </div>

      <!-- 직원 등록 모달 (직원 상세와 동일 필드 구성) -->
      <div id="hrEmployeeModal" class="ds-modal-overlay hidden items-center justify-center">
        <div class="ds-modal w-full max-h-[92vh] overflow-y-auto" style="max-width:56rem">
          <div class="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center z-10">
            <h3 class="text-lg font-bold">
              <i class="fas fa-user-plus text-blue-600 mr-2"></i>
              직원 등록
            </h3>
            <button onclick="hrCloseEmployeeModal()" class="text-gray-400 hover:text-gray-600">
              <i class="fas fa-times text-xl"></i>
            </button>
          </div>

          <form id="hrEmployeeForm" class="px-6 py-4 space-y-6">
            <!-- 1) 기본 정보 -->
            <section>
              <h4 class="text-sm font-semibold text-gray-700 border-b border-gray-200 pb-1.5 mb-3">기본 정보</h4>
              <div class="grid grid-cols-3 gap-3">
                <div><label class="block text-xs text-gray-500 mb-1">사원번호 <span class="text-red-500">*</span> <span class="text-[10px] text-gray-400">(자동 생성)</span></label><input type="text" name="employee_code" required readonly class="w-full border border-gray-300 bg-gray-50 rounded px-2 py-1.5 text-sm text-gray-700 tabular-nums"></div>
                <div><label class="block text-xs text-gray-500 mb-1">성명 <span class="text-red-500">*</span></label><input type="text" name="name" required class="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:ring-2 focus:ring-blue-500"></div>
                <div><label class="block text-xs text-gray-500 mb-1">영문명</label><input type="text" name="name_eng" class="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"></div>
                <div><label class="block text-xs text-gray-500 mb-1">생년월일</label><input type="text" name="birth_date" maxlength="10" inputmode="numeric" placeholder="예: 1990-01-15" class="js-fp w-full border border-gray-300 rounded px-2 py-1.5 text-sm tabular-nums"></div>
                <div><label class="block text-xs text-gray-500 mb-1">주민등록번호</label><input type="text" name="resident_number" maxlength="14" placeholder="000000-0000000" class="w-full border border-gray-300 rounded px-2 py-1.5 text-sm tabular-nums"></div>
                <div><label class="block text-xs text-gray-500 mb-1">고용 유형 <span class="text-red-500">*</span></label>
                  <select name="employment_type" required class="w-full border border-gray-300 rounded px-2 py-1.5 text-sm">
                    ${employmentTypeOptions()}
                  </select>
                </div>
                <div><label class="block text-xs text-gray-500 mb-1">소속법인</label>
                  <select name="entity_id" class="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"></select>
                </div>
                <div><label class="block text-xs text-gray-500 mb-1">부서 <span class="text-red-500">*</span> <span class="text-[10px] text-gray-400">(레거시)</span></label>
                  <select name="department" required class="w-full border border-gray-300 rounded px-2 py-1.5 text-sm">
                    ${deptOptions({ lead: '선택' })}
                  </select>
                </div>
                <div><label class="block text-xs text-gray-500 mb-1">부문 <span class="text-[10px] text-gray-400">(손익 귀속)</span></label>
                  <select name="department_id" id="hrEmpDeptId" class="w-full border border-gray-300 rounded px-2 py-1.5 text-sm">
                    <option value="">(부문 미배정)</option>
                  </select>
                </div>
                <div><label class="block text-xs text-gray-500 mb-1">직급 <span class="text-red-500">*</span></label>
                  <select name="position" required class="w-full border border-gray-300 rounded px-2 py-1.5 text-sm">
                    ${positionOptions({ lead: '선택' })}
                  </select>
                </div>
                <div><label class="block text-xs text-gray-500 mb-1">직책</label><input type="text" name="job_title" class="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"></div>
                <div><label class="block text-xs text-gray-500 mb-1">입사일자 <span class="text-red-500">*</span></label><input type="text" name="hire_date" required maxlength="10" inputmode="numeric" placeholder="예: 2020-01-15" class="js-fp w-full border border-gray-300 rounded px-2 py-1.5 text-sm tabular-nums"></div>
                <div><label class="block text-xs text-gray-500 mb-1">퇴사일자</label><input type="text" name="resignation_date" maxlength="10" inputmode="numeric" placeholder="예: 2026-06-30" class="js-fp w-full border border-gray-300 rounded px-2 py-1.5 text-sm tabular-nums"></div>
                <div><label class="block text-xs text-gray-500 mb-1">이메일</label><input type="email" name="email" class="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"></div>
                <div><label class="block text-xs text-gray-500 mb-1">전화번호</label><input type="tel" name="phone" placeholder="02-1234-5678" class="w-full border border-gray-300 rounded px-2 py-1.5 text-sm tabular-nums"></div>
                <div><label class="block text-xs text-gray-500 mb-1">휴대폰</label><input type="tel" name="mobile" placeholder="010-1234-5678" class="w-full border border-gray-300 rounded px-2 py-1.5 text-sm tabular-nums"></div>
              </div>

              <!-- 주소 -->
              <div class="mt-3">
                <label class="block text-xs text-gray-500 mb-1">주소</label>
                <div class="grid grid-cols-12 gap-2">
                  <input type="text" name="postal_code" id="hrNewPostal" maxlength="5" placeholder="우편번호" class="col-span-2 border border-gray-300 rounded px-2 py-1.5 text-sm tabular-nums">
                  <input type="text" name="address" id="hrNewAddress" placeholder="기본주소" class="col-span-7 border border-gray-300 rounded px-2 py-1.5 text-sm">
                  <button type="button" onclick="openPostcodeSearch({ postalId: 'hrNewPostal', addressId: 'hrNewAddress', detailFocusId: 'hrNewAddrDetail' })" class="col-span-3 px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded border border-blue-200">
                    <i class="fas fa-search mr-1"></i>주소 검색
                  </button>
                  <input type="text" name="address_detail" id="hrNewAddrDetail" placeholder="상세주소 (예: 101동 1502호)" class="col-span-12 border border-gray-300 rounded px-2 py-1.5 text-sm">
                </div>
              </div>
            </section>

            <!-- 2) 급여통장 -->
            <section>
              <h4 class="text-sm font-semibold text-gray-700 border-b border-gray-200 pb-1.5 mb-3">급여통장</h4>
              <div class="grid grid-cols-3 gap-3">
                <div><label class="block text-xs text-gray-500 mb-1">은행</label><input type="text" name="bank_name" class="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"></div>
                <div><label class="block text-xs text-gray-500 mb-1">계좌번호</label><input type="text" name="bank_account" class="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"></div>
                <div><label class="block text-xs text-gray-500 mb-1">예금주</label><input type="text" name="bank_holder" class="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"></div>
              </div>
            </section>

            <!-- 3) 급여 (고정급) -->
            <section>
              <h4 class="text-sm font-semibold text-gray-700 border-b border-gray-200 pb-1.5 mb-3">급여 (고정)</h4>
              <div class="mb-2 flex gap-4 text-sm">
                <label class="flex items-center gap-1.5"><input type="radio" name="pay_type" value="VARIABLE" checked class="accent-blue-600"> 변동급</label>
                <label class="flex items-center gap-1.5"><input type="radio" name="pay_type" value="FIXED" class="accent-blue-600"> 고정급</label>
              </div>
              <div class="grid grid-cols-3 gap-3">
                <div><label class="block text-xs text-gray-500 mb-1">기본급 (원)</label><input type="text" inputmode="numeric" data-money name="base_salary" class="w-full border border-gray-300 rounded px-2 py-1.5 text-sm text-right tabular-nums"></div>
                <div><label class="block text-xs text-gray-500 mb-1">시급 (원/시간제)</label><input type="text" inputmode="numeric" data-money name="hourly_rate" class="w-full border border-gray-300 rounded px-2 py-1.5 text-sm text-right tabular-nums"></div>
                <div class="flex items-center gap-2 pt-5">
                  <input type="checkbox" id="hrNewOvertimeToggle" class="w-4 h-4 rounded accent-blue-600">
                  <label for="hrNewOvertimeToggle" class="text-sm text-gray-700 cursor-pointer">고정연장 적용 <span class="text-gray-400">(아침 30분)</span></label>
                </div>
                <div><label class="block text-xs text-gray-500 mb-1">직책수당 (원)</label><input type="text" inputmode="numeric" data-money name="position_allowance" class="w-full border border-gray-300 rounded px-2 py-1.5 text-sm text-right tabular-nums"></div>
                <div><label class="block text-xs text-gray-500 mb-1">차량유지비 (원)</label><input type="text" inputmode="numeric" data-money name="vehicle_allowance" class="w-full border border-gray-300 rounded px-2 py-1.5 text-sm text-right tabular-nums"></div>
                <div><label class="block text-xs text-gray-500 mb-1">식대 (원)</label><input type="text" inputmode="numeric" data-money name="meal_allowance_fixed" class="w-full border border-gray-300 rounded px-2 py-1.5 text-sm text-right tabular-nums"></div>
                <div><label class="block text-xs text-gray-500 mb-1">특별상여 (고정·원)</label><input type="text" inputmode="numeric" data-money name="special_bonus_fixed" class="w-full border border-gray-300 rounded px-2 py-1.5 text-sm text-right tabular-nums"></div>
                <div><label class="block text-xs text-gray-500 mb-1">기타수당 (원)</label><input type="text" inputmode="numeric" data-money name="other_allowance_fixed" class="w-full border border-gray-300 rounded px-2 py-1.5 text-sm text-right tabular-nums"></div>
              </div>
            </section>

            <!-- 4) 고정 공제 -->
            <section>
              <h4 class="text-sm font-semibold text-gray-700 border-b border-gray-200 pb-1.5 mb-3">고정 공제</h4>
              <div class="grid grid-cols-3 gap-3">
                <div><label class="block text-xs text-gray-500 mb-1">상조회비 (원)</label><input type="text" inputmode="numeric" data-money name="mutual_aid_fee" class="w-full border border-gray-300 rounded px-2 py-1.5 text-sm text-right tabular-nums"></div>
                <div><label class="block text-xs text-gray-500 mb-1">기타공제 (원)</label><input type="text" inputmode="numeric" data-money name="other_deduction_fixed" class="w-full border border-gray-300 rounded px-2 py-1.5 text-sm text-right tabular-nums"></div>
              </div>
            </section>

            <!-- 5) 세금 / 부양가족 -->
            <section>
              <h4 class="text-sm font-semibold text-gray-700 border-b border-gray-200 pb-1.5 mb-3">세금 / 부양가족</h4>
              <div class="grid grid-cols-3 gap-3">
                <div><label class="block text-xs text-gray-500 mb-1">부양가족수 (본인 포함)</label><input type="number" name="dependents_count" min="0" class="w-full border border-gray-300 rounded px-2 py-1.5 text-sm text-right"></div>
                <div><label class="block text-xs text-gray-500 mb-1">20세 이하 자녀수</label><input type="number" name="children_under_20_count" min="0" class="w-full border border-gray-300 rounded px-2 py-1.5 text-sm text-right"></div>
                <div><label class="block text-xs text-gray-500 mb-1">근로소득세 적용</label>
                  <select name="income_tax_table_option" class="w-full border border-gray-300 rounded px-2 py-1.5 text-sm">
                    <option value="">기본 (100%)</option>
                    <option value="80">80%</option>
                    <option value="100">100%</option>
                    <option value="120">120%</option>
                  </select>
                </div>
                <div><label class="block text-xs text-gray-500 mb-1">건강보험 등급 (선택)</label><input type="text" name="insurance_grade" class="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"></div>
              </div>
            </section>

            <!-- 6) 4대보험 -->
            <section>
              <h4 class="text-sm font-semibold text-gray-700 border-b border-gray-200 pb-1.5 mb-3">4대보험 적용</h4>
              <div class="flex flex-wrap gap-x-6 gap-y-2 text-sm">
                <label class="flex items-center gap-1.5"><input type="checkbox" name="insurance_apply_national_pension" value="1" checked class="accent-blue-600"> 국민연금</label>
                <label class="flex items-center gap-1.5"><input type="checkbox" name="insurance_apply_health" value="1" checked class="accent-blue-600"> 건강보험</label>
                <label class="flex items-center gap-1.5"><input type="checkbox" name="insurance_apply_long_term_care" value="1" checked class="accent-blue-600"> 장기요양</label>
                <label class="flex items-center gap-1.5"><input type="checkbox" name="insurance_apply_employment" value="1" checked class="accent-blue-600"> 고용보험</label>
                <label class="flex items-center gap-1.5"><input type="checkbox" name="insurance_apply_industrial_accident" value="1" checked class="accent-blue-600"> 산재보험</label>
              </div>
            </section>

            <!-- 7) CAPS 매핑 -->
            <section>
              <h4 class="text-sm font-semibold text-gray-700 border-b border-gray-200 pb-1.5 mb-3">CAPS 매핑</h4>
              <div class="grid grid-cols-4 gap-3 items-end">
                <div><label class="block text-xs text-gray-500 mb-1">CAPS 사이트</label>
                  <select name="caps_site_id" class="w-full border border-gray-300 rounded px-2 py-1.5 text-sm">
                    <option value="">— 미설정 —</option>
                    <option value="DJ">대전 (DJ)</option>
                    <option value="SM">선명 (SM)</option>
                  </select>
                </div>
                <div><label class="block text-xs text-gray-500 mb-1">CAPS 번호</label><input type="text" name="caps_id" placeholder="ACServer fpid" class="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"></div>
                <label class="flex items-center gap-1.5 text-sm pb-2"><input type="checkbox" name="caps_sync_enabled" value="1" class="accent-blue-600"> CAPS 동기화 대상</label>
              </div>
            </section>

            <!-- 8) 비상연락망 / 메모 -->
            <section>
              <h4 class="text-sm font-semibold text-gray-700 border-b border-gray-200 pb-1.5 mb-3">비상연락망 / 메모</h4>
              <div class="grid grid-cols-2 gap-3">
                <div><label class="block text-xs text-gray-500 mb-1">비상연락처 이름</label><input type="text" name="emergency_contact" class="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"></div>
                <div><label class="block text-xs text-gray-500 mb-1">비상연락처 전화</label><input type="tel" name="emergency_phone" class="w-full border border-gray-300 rounded px-2 py-1.5 text-sm tabular-nums"></div>
                <div class="col-span-2"><label class="block text-xs text-gray-500 mb-1">메모</label><textarea name="notes" rows="2" class="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"></textarea></div>
              </div>
            </section>

            <div class="sticky bottom-0 bg-white border-t border-gray-200 -mx-6 px-6 py-3 flex justify-end gap-2">
              <button type="button" onclick="hrCloseEmployeeModal()" class="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">취소</button>
              <button type="submit" class="ds-btn ds-btn-primary text-sm font-medium">
                <i class="fas fa-save mr-1"></i> 저장
              </button>
            </div>
          </form>
        </div>
      </div>

      <!-- 부문 추가/수정 모달 -->
      <div id="deptModal" class="ds-modal-overlay hidden flex items-center justify-center">
        <div class="ds-modal" style="max-width:32rem">
          <div class="px-5 py-3 border-b border-gray-200 flex items-center justify-between">
            <h3 id="deptModalTitle" class="text-base font-bold text-gray-900">부문 추가</h3>
            <button onclick="closeDeptModal()" class="text-gray-400 hover:text-gray-600"><i class="fas fa-times"></i></button>
          </div>
          <div class="p-5 space-y-3">
            <input type="hidden" id="deptModalId">
            <div>
              <label class="block text-xs font-semibold text-gray-700 mb-1">부문명 *</label>
              <input type="text" id="deptModalName" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-xs font-semibold text-gray-700 mb-1">유형 *</label>
                <select id="deptModalType" onchange="deptSyncServesVisibility()" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                  <option value="PRODUCTION">생산(매출발생)</option>
                  <option value="SUPPORT">지원/공통</option>
                </select>
              </div>
              <div>
                <label class="block text-xs font-semibold text-gray-700 mb-1">상위 부문</label>
                <select id="deptModalParent" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"></select>
              </div>
            </div>
            <div id="deptServesWrap">
              <label class="block text-xs font-semibold text-gray-700 mb-1">지원 생산부문 (인건비 직접귀속 대상)</label>
              <select id="deptModalServes" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"></select>
              <p class="text-xs text-gray-400 mt-1">지원 부문 인건비를 이 생산부문 원가로 직접 귀속(P4). 비우면 공통(P5 배부).</p>
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-xs font-semibold text-gray-700 mb-1">정렬</label>
                <input type="number" id="deptModalSort" value="0" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
              </div>
              <label class="flex items-center gap-2 text-sm text-gray-700 mt-5">
                <input type="checkbox" id="deptModalActive" class="w-4 h-4" checked> 활성
              </label>
            </div>
          </div>
          <div class="flex justify-end gap-2 px-5 py-3 border-t border-gray-200">
            <button onclick="closeDeptModal()" class="border border-gray-300 bg-white text-gray-700 rounded-lg px-4 py-2 text-sm hover:bg-gray-50">취소</button>
            <button id="deptModalSaveBtn" onclick="saveDept()" class="ds-btn ds-btn-primary text-sm">저장</button>
          </div>
        </div>
      </div>
    `,
    pageScript: pageScript + '\n;\n' + departmentsScript,
  })
}
