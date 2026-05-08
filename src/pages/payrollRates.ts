// 급여 요율/간이세액표 관리 페이지
import type { Context } from 'hono'
import { renderPage } from '../layout'
import payrollRatesScript from '../scripts/payrollRates.js?raw'

export function payrollRatesPage(c: Context) {
  const pageContent = `
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
      <table class="w-full ds-table-striped">
        <thead class="bg-gray-50">
          <tr class="text-xs font-semibold text-gray-600 uppercase tracking-wider">
            <th class="px-4 py-2 text-left">보험 종류</th>
            <th class="px-4 py-2 text-right">전체 요율</th>
            <th class="px-4 py-2 text-right">근로자 부담</th>
            <th class="px-4 py-2 text-right">회사 부담</th>
            <th class="px-4 py-2 text-left">기준</th>
            <th class="px-4 py-2 text-right">하한/상한</th>
            <th class="px-4 py-2 text-center">액션</th>
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
        <li>국민연금 상·하한 기준소득월액은 2026년 기준 하한 39만원, 상한 617만원입니다 (매년 7월 갱신).</li>
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
          <button onclick="prRGenerateTable()" class="border border-gray-300 bg-white text-gray-700 rounded-lg px-3 py-1.5 text-sm hover:bg-gray-50">
            <i class="fas fa-magic mr-1"></i>전구간 자동생성
          </button>
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
        <table class="w-full ds-table-striped">
          <thead class="bg-gray-50 sticky top-0">
            <tr class="text-xs font-semibold text-gray-600 uppercase tracking-wider">
              <th class="px-3 py-2 text-right">월급여 구간</th>
              <th class="px-3 py-2 text-right">1명</th>
              <th class="px-3 py-2 text-right">2명</th>
              <th class="px-3 py-2 text-right">3명</th>
              <th class="px-3 py-2 text-right">4명</th>
              <th class="px-3 py-2 text-right">5명</th>
              <th class="px-3 py-2 text-right">6명+</th>
              <th class="px-3 py-2 text-center">액션</th>
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
        <li><strong>전구간 자동생성</strong>: 국세청 공식 계산식(근로소득공제 + 인적공제 + 누진세율 + 세액공제)으로 1만원 단위 전체 구간 900행을 자동 생성합니다.</li>
        <li><strong>CSV 임포트</strong>: 국세청 공식 간이세액표를 CSV로 저장 후 업로드하여 정확한 값으로 덮어쓰기 가능.</li>
        <li>CSV 헤더: <code class="bg-white px-1 rounded">monthly_pay_min,monthly_pay_max,dependents_1,...,dependents_11</code></li>
        <li>표에 없는 구간은 공식 계산식으로 자동 fallback 처리됩니다.</li>
      </ul>
    </div>
  </div>
</div>

<!-- 4대보험 요율 편집 모달 -->
<div id="prREditModal" class="fixed inset-0 bg-black bg-opacity-40 z-50 hidden items-center justify-center">
  <div class="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4">
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
          <input type="date" id="prREditFrom" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label class="text-sm font-semibold text-gray-700 mb-1 block">적용 종료일 (선택)</label>
          <input type="date" id="prREditTo" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
        </div>
      </div>
    </div>
    <div class="flex justify-end gap-2 px-5 py-3 border-t border-gray-200">
      <button onclick="prRCloseRateModal()" class="border border-gray-300 bg-white text-gray-700 rounded-lg px-4 py-2 text-sm hover:bg-gray-50">취소</button>
      <button onclick="prRSaveRate()" class="bg-blue-600 text-white rounded-lg px-4 py-2 text-sm hover:bg-blue-700">저장</button>
    </div>
  </div>
</div>

<!-- 간이세액표 행 편집 모달 -->
<div id="prRTaxModal" class="fixed inset-0 bg-black bg-opacity-40 z-50 hidden items-center justify-center">
  <div class="bg-white rounded-lg shadow-xl w-full max-w-2xl mx-4">
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
      <button onclick="prRSaveTaxRow()" class="bg-blue-600 text-white rounded-lg px-4 py-2 text-sm hover:bg-blue-700">저장</button>
    </div>
  </div>
</div>

<!-- 연도 복사 모달 -->
<div id="prRCopyModal" class="fixed inset-0 bg-black bg-opacity-40 z-50 hidden items-center justify-center">
  <div class="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
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
      <button onclick="prRCopyRates()" class="bg-blue-600 text-white rounded-lg px-4 py-2 text-sm hover:bg-blue-700">복사</button>
    </div>
  </div>
</div>
`
  return renderPage(c, {
    title: '급여 요율 관리',
    activePage: '/payroll-rates',
    pageContent,
    pageScript: payrollRatesScript,
  })
}
