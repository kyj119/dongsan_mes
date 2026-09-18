// 급여 요율/간이세액표 관리 페이지
import type { Context } from 'hono'
import { renderPage } from '../layout'
import payrollRatesScript from '../scripts/payrollRates.js?raw'

// 사이드바 통합(2026-07-18): /payroll 허브 '요율 관리' 탭 이식용 단일소스 export. payrollRates.js는 prR* 프리픽스라 payroll(pr*)과 충돌 없음.
export const payrollRatesContent = `
<div class="max-w-7xl mx-auto px-6 pt-6 space-y-6">
  <!-- 헤더 -->
  <div class="flex items-center justify-between">
    <div>
      <h2 class="text-xl font-bold text-gray-900">급여 요율 관리</h2>
      <p class="text-sm text-gray-500 mt-1">4대보험 요율 및 근로소득 간이세액표 관리</p>
    </div>
    <div class="flex items-center gap-2">
      <label class="text-sm text-gray-600">연도</label>
      <select id="prRYear" class="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500" onchange="prRLoadAll()">
        <option value="2024">2024</option>
        <option value="2025">2025</option>
        <option value="2026" selected>2026</option>
        <option value="2027">2027</option>
      </select>
      <button onclick="prROpenCopyModal()" class="border border-gray-300 bg-white text-gray-700 rounded-lg px-3 py-2 text-sm hover:bg-gray-50">
        <i class="fas fa-copy mr-1"></i>연도 복사
      </button>
    </div>
  </div>

  <!-- 탭 -->
  <div class="border-b border-gray-200">
    <div class="flex gap-1">
      <button id="prRTab1" onclick="prRSwitchTab(1)" class="px-4 py-2 text-sm font-semibold border-b-2 border-blue-600 text-blue-600">
        <i class="fas fa-shield-alt mr-1"></i>4대보험 요율
      </button>
      <button id="prRTab2" onclick="prRSwitchTab(2)" class="px-4 py-2 text-sm font-semibold border-b-2 border-transparent text-gray-500 hover:text-gray-700">
        <i class="fas fa-table mr-1"></i>근로소득 간이세액표
      </button>
      <button id="prRTab3" onclick="prRSwitchTab(3)" class="px-4 py-2 text-sm font-semibold border-b-2 border-transparent text-gray-500 hover:text-gray-700">
        <i class="fas fa-calendar-day mr-1"></i>공휴일
      </button>
    </div>
  </div>

  <!-- Tab 1: 4대보험 요율 -->
  <div id="prRPane1">
    <div class="bg-white border border-gray-200 rounded-lg">
      <div class="flex items-center justify-between px-4 py-3 border-b border-gray-200">
        <div class="text-sm font-semibold text-gray-700">
          <span id="prRYearLabel">2026</span>년 4대보험 요율
        </div>
        <button onclick="prROpenRateModal(0)" class="bg-blue-600 text-white rounded-lg px-3 py-1.5 text-sm hover:bg-blue-700">
          <i class="fas fa-plus mr-1"></i>요율 추가
        </button>
      </div>
      <table class="w-full ds-table-striped ds-table-fixed">
        <thead>
          <tr>
            <th class="text-left">보험 종류</th>
            <th class="text-right" style="width:100px">전체 요율</th>
            <th class="text-right" style="width:100px">근로자 부담</th>
            <th class="text-right" style="width:100px">회사 부담</th>
            <th class="text-left" style="width:110px">기준</th>
            <th class="text-right" style="width:130px">하한/상한</th>
            <th class="text-left" style="width:170px">적용기간</th>
            <th class="text-center" style="width:70px">액션</th>
          </tr>
        </thead>
        <tbody id="prRRatesBody" class="text-sm text-gray-900">
          <tr><td colspan="7" class="text-center text-gray-400 py-6">로드 중...</td></tr>
        </tbody>
      </table>
    </div>

    <div class="mt-4 p-4 bg-blue-50 border border-blue-100 rounded-lg text-sm text-blue-900">
      <div class="font-semibold mb-1"><i class="fas fa-info-circle mr-1"></i>요율 업데이트 안내</div>
      <ul class="list-disc ml-5 space-y-1 text-xs text-blue-800">
        <li>요율이 변경되면 <strong>"요율 추가"</strong>로 새 연도 데이터를 등록하거나 기존 행을 수정하세요.</li>
        <li>전년도 요율을 복사하려면 우측 상단 <strong>"연도 복사"</strong> 사용.</li>
        <li>장기요양 보험은 건강보험료(HEALTH_INSURANCE) 기준으로 계산됩니다.</li>
        <li>국민연금 기준소득월액 상·하한은 <strong>매년 7월 갱신</strong>됩니다. 같은 보험이라도 <strong>적용기간이 다르면 행을 나눠</strong> 등록하세요 — 한 행으로 두면 7월 변경값이 상반기 급여에도 소급됩니다. (2026: 상반기 하한 40만·상한 637만 / 하반기 하한 41만·상한 659만)</li>
      </ul>
    </div>
  </div>

  <!-- Tab 2: 간이세액표 -->
  <div id="prRPane2" class="hidden">
    <div class="bg-white border border-gray-200 rounded-lg">
      <div class="flex items-center justify-between px-4 py-3 border-b border-gray-200">
        <div class="text-sm font-semibold text-gray-700">
          <span id="prRYearLabel2">2026</span>년 간이세액표
          (<span id="prRTaxTotal">0</span>행)
        </div>
        <div class="flex items-center gap-2">
          <input type="file" id="prRCsvFile" accept=".csv" class="hidden" onchange="prRImportCsv(event)" />
          <!-- 「전구간 자동생성」 제거(2026-09-17) — 근사 산식이 고시표보다 2~3배 높은 값을 900행 채워 넣었고,
               화면·게이트 어디에도 티가 나지 않아 반년 넘게 그대로 돌았다. 정본은 홈택스 조견표 CSV 임포트뿐이다. -->
          <button onclick="document.getElementById('prRCsvFile').click()" class="border border-gray-300 bg-white text-gray-700 rounded-lg px-3 py-1.5 text-sm hover:bg-gray-50">
            <i class="fas fa-upload mr-1"></i>CSV 임포트
          </button>
          <button onclick="prRDownloadCsvTemplate()" class="border border-gray-300 bg-white text-gray-700 rounded-lg px-3 py-1.5 text-sm hover:bg-gray-50">
            <i class="fas fa-download mr-1"></i>템플릿
          </button>
          <button onclick="prROpenTaxRowModal(0)" class="bg-blue-600 text-white rounded-lg px-3 py-1.5 text-sm hover:bg-blue-700">
            <i class="fas fa-plus mr-1"></i>행 추가
          </button>
        </div>
      </div>
      <div class="max-h-[600px] overflow-auto">
        <table class="w-full ds-table-striped ds-table-fixed">
          <thead class="sticky top-0">
            <tr>
              <th class="text-right" style="width:140px">월급여 구간</th>
              <th class="text-right" style="width:90px">1명</th>
              <th class="text-right" style="width:90px">2명</th>
              <th class="text-right" style="width:90px">3명</th>
              <th class="text-right" style="width:90px">4명</th>
              <th class="text-right" style="width:90px">5명</th>
              <th class="text-right" style="width:90px">6명+</th>
              <th class="text-center" style="width:70px">액션</th>
            </tr>
          </thead>
          <tbody id="prRTaxBody" class="text-sm text-gray-900">
            <tr><td colspan="8" class="text-center text-gray-400 py-6">로드 중...</td></tr>
          </tbody>
        </table>
      </div>
      <div class="px-4 py-2 border-t border-gray-200 flex items-center justify-between text-sm text-gray-600">
        <div>
          <button onclick="prRTaxPrevPage()" class="text-gray-500 hover:text-gray-700 px-2">&larr; 이전</button>
          <span class="mx-2">페이지 <span id="prRTaxPage">1</span> / <span id="prRTaxPages">1</span></span>
          <button onclick="prRTaxNextPage()" class="text-gray-500 hover:text-gray-700 px-2">다음 &rarr;</button>
        </div>
        <div class="text-xs text-gray-400">100행/페이지</div>
      </div>
    </div>

    <div class="mt-4 p-4 bg-amber-50 border border-amber-100 rounded-lg text-sm text-amber-900">
      <div class="font-semibold mb-1"><i class="fas fa-exclamation-triangle mr-1"></i>간이세액표 업데이트 안내</div>
      <ul class="list-disc ml-5 space-y-1 text-xs text-amber-800">
        <li><strong>이 표는 반드시 국세청 원본이어야 합니다.</strong> 홈택스 → 세금신고 → 원천세 신고 → <strong>근로소득 간이세액표</strong> → 「조견표」 <strong>엑셀 다운로드</strong> 후 CSV로 저장해 임포트하세요. 로그인 없이 받을 수 있습니다.</li>
        <li>CSV 헤더: <code class="bg-white px-1 rounded">monthly_pay_min,monthly_pay_max,dependents_1,...,dependents_11</code> (금액은 <strong>원</strong> 단위 — 조견표는 천원 단위라 ×1,000)</li>
        <li><strong>구간 폭이 균일하면 원본이 아닙니다.</strong> 고시표는 5천·1만·2만원 폭이 섞여 있고 2026.3.1 시행분은 <strong>646행</strong>(77만~1,000만원)입니다. 2026-09-17 이전에는 근사 산식으로 만든 900행(1만원 균일)이 들어 있었고 세액이 2~3배 높았습니다.</li>
        <li>8세 이상 20세 이하 자녀가 있으면 표값에서 <strong>자녀수별 금액</strong>을 뺍니다(1명 20,830 · 2명 45,830 · 3명부터 +33,330/명). 직원별 <code class="bg-white px-1 rounded">8~20세 자녀수</code>로 자동 반영됩니다.</li>
        <li>표에 없는 구간(1,000만원 초과 등)은 근사 계산식으로 fallback 되며 <strong>정확하지 않습니다</strong>. 해당자가 생기면 급여대장에서 엑셀 입력으로 덮으세요.</li>
      </ul>
    </div>
  </div>

  <!-- Tab 3: 공휴일 -->
  <div id="prRPane3" class="hidden">
    <div class="bg-white border border-gray-200 rounded-lg">
      <div class="flex items-center justify-between px-4 py-3 border-b border-gray-200 flex-wrap gap-2">
        <div class="font-semibold text-gray-900">휴일 달력 <span class="text-xs font-normal text-gray-400">법정공휴일 + 법인별 휴무</span></div>
        <div class="flex items-center gap-2">
          <input type="number" id="prRHolYearInput" value="2026" class="w-24 border rounded px-2 py-1.5 text-sm text-right" />
          <button onclick="prRLoadHolidays()" class="border border-gray-300 bg-white text-gray-700 rounded-lg px-3 py-1.5 text-sm hover:bg-gray-50"><i class="fas fa-search mr-1"></i>검색</button>
          <button onclick="prRLoadDefaultHolidays()" class="border border-blue-300 bg-blue-50 text-blue-700 rounded-lg px-3 py-1.5 text-sm hover:bg-blue-100"><i class="fas fa-download mr-1"></i>기본 공휴일 불러오기</button>
          <button onclick="prROpenAddHoliday()" class="bg-blue-600 text-white rounded-lg px-3 py-1.5 text-sm hover:bg-blue-700"><i class="fas fa-plus mr-1"></i>추가</button>
        </div>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full ds-table-striped ds-table-fixed text-sm">
          <thead class="bg-gray-50 text-xs text-gray-600">
            <tr><th class="text-left px-4 py-2" style="width:150px">날짜</th><th class="text-left px-4 py-2" style="width:80px">요일</th><th class="text-left px-4 py-2" style="width:130px">적용 범위</th><th class="text-left px-4 py-2">명칭</th><th class="text-center px-4 py-2" style="width:70px">삭제</th></tr>
          </thead>
          <tbody id="prRHolBody"><tr><td colspan="4" class="text-center text-gray-400 py-6">검색을 눌러주세요</td></tr></tbody>
        </table>
      </div>
    </div>
    <div class="mt-4 p-4 bg-amber-50 border border-amber-100 rounded-lg text-sm text-amber-900">
      <div class="font-semibold mb-1"><i class="fas fa-info-circle mr-1"></i>공휴일 사용 안내</div>
      <ul class="list-disc ml-5 space-y-1 text-xs text-amber-800">
        <li>여기 등록된 날짜(+토·일)에 근무하면 <strong>휴일근로</strong>로 분류되어 휴일수당(×1.5)이 지급됩니다.</li>
        <li><strong>기본 공휴일 불러오기</strong>로 표준 공휴일 적재 후, <strong>음력·대체공휴일 날짜는 반드시 검증/수정</strong>하세요.</li>
        <li>달력만 등록/수정하면 <strong>근태 화면에 즉시</strong>, <strong>급여는 [급여 관리 → 근태 불러오기]</strong> 시 자동 반영됩니다(날짜 기준 파생 — 별도 재분류 불필요).</li>
      </ul>
    </div>
  </div>
</div>

<!-- 공휴일 추가 모달 -->
<div id="prRHolModal" class="ds-modal-overlay hidden items-center justify-center">
  <div class="ds-modal mx-4" style="max-width:24rem">
    <div class="flex items-center justify-between px-5 py-3 border-b border-gray-200">
      <h3 class="text-base font-semibold text-gray-900">공휴일 추가</h3>
      <button onclick="prRCloseAddHoliday()" class="text-gray-400 hover:text-gray-700"><i class="fas fa-times"></i></button>
    </div>
    <div class="p-5 space-y-3">
      <div><label class="text-xs text-gray-600">날짜 (YYYY-MM-DD)</label><input type="text" id="prRHolDate" placeholder="2026-08-15" class="w-full border rounded px-2 py-1.5 text-sm" /></div>
      <div><label class="text-xs text-gray-600">명칭</label><input type="text" id="prRHolName" placeholder="광복절" class="w-full border rounded px-2 py-1.5 text-sm" /></div>
      <div>
        <label class="text-xs text-gray-600">적용 범위</label>
        <select id="prRHolEntity" class="w-full border rounded px-2 py-1.5 text-sm">
          <option value="0">전 법인 (법정공휴일)</option>
        </select>
        <p class="text-[11px] text-gray-500 mt-1">특정 법인만 쉬는 날(여름휴가·창립기념일)은 그 법인을 고르세요. 다른 법인 급여에는 영향이 없습니다.</p>
      </div>
    </div>
    <div class="px-5 py-3 border-t border-gray-200 flex justify-end gap-2">
      <button onclick="prRCloseAddHoliday()" class="px-3 py-1.5 text-sm text-gray-600">취소</button>
      <button onclick="prRSaveHoliday()" class="px-3 py-1.5 text-sm bg-blue-600 text-white rounded">저장</button>
    </div>
  </div>
</div>

<!-- 4대보험 요율 편집 모달 -->
<div id="prREditModal" class="ds-modal-overlay hidden items-center justify-center">
  <div class="ds-modal mx-4" style="max-width:32rem">
    <div class="flex items-center justify-between px-5 py-3 border-b border-gray-200">
      <h3 class="text-base font-semibold text-gray-900">4대보험 요율</h3>
      <button onclick="prRCloseRateModal()" class="text-gray-400 hover:text-gray-700"><i class="fas fa-times"></i></button>
    </div>
    <div class="p-5 space-y-3">
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label class="text-sm font-semibold text-gray-700 mb-1 block">연도 <span class="text-red-500">*</span></label>
          <input type="number" id="prREditYear" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label class="text-sm font-semibold text-gray-700 mb-1 block">보험 종류 <span class="text-red-500">*</span></label>
          <select id="prREditType" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" onchange="prRUpdateBaseSelect()">
            <option value="NATIONAL_PENSION">국민연금</option>
            <option value="HEALTH">건강보험</option>
            <option value="LONG_TERM_CARE">장기요양</option>
            <option value="EMPLOYMENT">고용보험</option>
            <option value="INDUSTRIAL_ACCIDENT">산재보험</option>
          </select>
        </div>
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <div>
          <label class="text-sm font-semibold text-gray-700 mb-1 block">전체 요율 (%)</label>
          <input type="number" step="0.01" id="prREditTotal" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-right" />
        </div>
        <div>
          <label class="text-sm font-semibold text-gray-700 mb-1 block">근로자 (%)</label>
          <input type="number" step="0.01" id="prREditEmp" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-right" />
        </div>
        <div>
          <label class="text-sm font-semibold text-gray-700 mb-1 block">회사 (%)</label>
          <input type="number" step="0.01" id="prREditEmployer" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-right" />
        </div>
      </div>
      <div>
        <label class="text-sm font-semibold text-gray-700 mb-1 block">요율 기준</label>
        <select id="prREditBase" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
          <option value="TAXABLE_PAY">과세급여</option>
          <option value="HEALTH_INSURANCE">건강보험료 (장기요양 전용)</option>
        </select>
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="text-sm font-semibold text-gray-700 mb-1 block">하한 (원)</label>
          <input type="text" inputmode="numeric" data-money id="prREditMin" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-right" placeholder="없음" />
        </div>
        <div>
          <label class="text-sm font-semibold text-gray-700 mb-1 block">상한 (원)</label>
          <input type="text" inputmode="numeric" data-money id="prREditMax" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-right" placeholder="없음" />
        </div>
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="text-sm font-semibold text-gray-700 mb-1 block">적용 시작일</label>
          <input type="text" id="prREditFrom" class="js-fp w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" maxlength="10" inputmode="numeric" placeholder="예: 2026-01-15" />
        </div>
        <div>
          <label class="text-sm font-semibold text-gray-700 mb-1 block">적용 종료일 (선택)</label>
          <input type="text" id="prREditTo" class="js-fp w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" maxlength="10" inputmode="numeric" placeholder="예: 2026-01-15" />
        </div>
      </div>
    </div>
    <div class="flex justify-end gap-2 px-5 py-3 border-t border-gray-200">
      <button onclick="prRCloseRateModal()" class="border border-gray-300 bg-white text-gray-700 rounded-lg px-4 py-2 text-sm hover:bg-gray-50">취소</button>
      <button onclick="prRSaveRate()" class="ds-btn ds-btn-primary text-sm">저장</button>
    </div>
  </div>
</div>

<!-- 간이세액표 행 편집 모달 -->
<div id="prRTaxModal" class="ds-modal-overlay hidden items-center justify-center">
  <div class="ds-modal mx-4" style="max-width:42rem">
    <div class="flex items-center justify-between px-5 py-3 border-b border-gray-200">
      <h3 class="text-base font-semibold text-gray-900">간이세액표 행</h3>
      <button onclick="prRCloseTaxRowModal()" class="text-gray-400 hover:text-gray-700"><i class="fas fa-times"></i></button>
    </div>
    <div class="p-5 space-y-3">
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label class="text-sm font-semibold text-gray-700 mb-1 block">월급여 최소 (원) <span class="text-red-500">*</span></label>
          <input type="text" inputmode="numeric" data-money id="prRTaxMin" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-right" />
        </div>
        <div>
          <label class="text-sm font-semibold text-gray-700 mb-1 block">월급여 최대 (원) <span class="text-red-500">*</span></label>
          <input type="text" inputmode="numeric" data-money id="prRTaxMax" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-right" />
        </div>
      </div>
      <div class="text-xs text-gray-500">부양가족수별 소득세 (원) — 본인 포함</div>
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2" id="prRTaxDepsGrid">
        <!-- JS가 1~11 인풋 생성 -->
      </div>
    </div>
    <div class="flex justify-end gap-2 px-5 py-3 border-t border-gray-200">
      <button onclick="prRCloseTaxRowModal()" class="border border-gray-300 bg-white text-gray-700 rounded-lg px-4 py-2 text-sm hover:bg-gray-50">취소</button>
      <button onclick="prRSaveTaxRow()" class="ds-btn ds-btn-primary text-sm">저장</button>
    </div>
  </div>
</div>

<!-- 연도 복사 모달 -->
<div id="prRCopyModal" class="ds-modal-overlay hidden items-center justify-center">
  <div class="ds-modal mx-4" style="max-width:28rem">
    <div class="flex items-center justify-between px-5 py-3 border-b border-gray-200">
      <h3 class="text-base font-semibold text-gray-900">연도 요율 복사</h3>
      <button onclick="prRCloseCopyModal()" class="text-gray-400 hover:text-gray-700"><i class="fas fa-times"></i></button>
    </div>
    <div class="p-5 space-y-3">
      <div>
        <label class="text-sm font-semibold text-gray-700 mb-1 block">복사할 원본 연도</label>
        <input type="number" id="prRCopyFrom" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" value="2025" />
      </div>
      <div>
        <label class="text-sm font-semibold text-gray-700 mb-1 block">복사 대상 연도</label>
        <input type="number" id="prRCopyTo" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" value="2026" />
      </div>
      <p class="text-xs text-gray-500">※ 대상 연도에 요율이 이미 있으면 복사가 거부됩니다.</p>
    </div>
    <div class="flex justify-end gap-2 px-5 py-3 border-t border-gray-200">
      <button onclick="prRCloseCopyModal()" class="border border-gray-300 bg-white text-gray-700 rounded-lg px-4 py-2 text-sm hover:bg-gray-50">취소</button>
      <button onclick="prRCopyRates()" class="ds-btn ds-btn-primary text-sm">복사</button>
    </div>
  </div>
</div>
`

export function payrollRatesPage(c: Context) {
  return renderPage(c, {
    title: '급여 요율 관리',
    activePage: '/payroll-rates',
    pageContent: payrollRatesContent,
    pageScript: payrollRatesScript,
  })
}
