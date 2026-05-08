import type { Context } from 'hono'
import type { HonoEnv } from '../types/env'
import { renderPage } from '../layout'
import migrationScript from '../scripts/migration.js?raw'

export function migrationPage(c: Context<HonoEnv>) {
  const pageContent = `
    <div class="space-y-4">
      <!-- 탭 헤더 -->
      <div class="bg-white rounded-lg border shadow-sm">
        <div class="flex border-b">
          <button id="tabImport" onclick="switchMigTab('import')"
            class="px-4 py-2.5 text-sm font-medium border-b-2 border-blue-600 text-blue-600">
            <i class="fas fa-file-import mr-1"></i>데이터 이관
          </button>
          <button id="tabVerify" onclick="switchMigTab('verify')"
            class="px-4 py-2.5 text-sm font-medium border-b-2 border-transparent text-gray-500 hover:text-gray-700">
            <i class="fas fa-check-double mr-1"></i>대사 검증
          </button>
          <button id="tabStatus" onclick="switchMigTab('status')"
            class="px-4 py-2.5 text-sm font-medium border-b-2 border-transparent text-gray-500 hover:text-gray-700">
            <i class="fas fa-chart-pie mr-1"></i>전환 현황
          </button>
        </div>
      </div>

      <!-- 탭 1: 데이터 이관 -->
      <div id="importContent">
        <!-- 대상 법인 선택 -->
        <div class="bg-white rounded-lg border shadow-sm p-4">
          <div class="flex items-center gap-3">
            <h3 class="text-sm font-semibold" style="color:#212529;">대상 법인</h3>
            <select id="migrationEntitySelect" onchange="onMigrationEntityChange()"
              class="border rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500">
            </select>
            <span class="text-xs text-gray-400" id="migrationEntityHint">거래처/품목은 공유 데이터로 법인 무관</span>
          </div>
        </div>

        <!-- 이관 유형 선택 -->
        <div class="bg-white rounded-lg border shadow-sm p-4 space-y-4">
          <h3 class="text-sm font-semibold" style="color:#212529;">이관 유형 선택</h3>
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            <button onclick="selectImportType('clients')" data-type="clients"
              class="import-type-btn border rounded-lg p-3 text-center hover:border-blue-400 transition-colors">
              <i class="fas fa-building text-lg text-gray-400 mb-1 block"></i>
              <span class="text-xs text-gray-600">거래처</span>
            </button>
            <button onclick="selectImportType('items')" data-type="items"
              class="import-type-btn border rounded-lg p-3 text-center hover:border-blue-400 transition-colors">
              <i class="fas fa-box text-lg text-gray-400 mb-1 block"></i>
              <span class="text-xs text-gray-600">품목</span>
            </button>
            <button onclick="selectImportType('orders')" data-type="orders"
              class="import-type-btn border rounded-lg p-3 text-center hover:border-blue-400 transition-colors">
              <i class="fas fa-file-invoice text-lg text-gray-400 mb-1 block"></i>
              <span class="text-xs text-gray-600">주문 이력</span>
            </button>
            <button onclick="selectImportType('payments')" data-type="payments"
              class="import-type-btn border rounded-lg p-3 text-center hover:border-blue-400 transition-colors">
              <i class="fas fa-won-sign text-lg text-gray-400 mb-1 block"></i>
              <span class="text-xs text-gray-600">입금 이력</span>
            </button>
            <button onclick="selectImportType('tax_invoices')" data-type="tax_invoices"
              class="import-type-btn border rounded-lg p-3 text-center hover:border-blue-400 transition-colors">
              <i class="fas fa-receipt text-lg text-gray-400 mb-1 block"></i>
              <span class="text-xs text-gray-600">세금계산서</span>
            </button>
            <button onclick="selectImportType('opening_balances')" data-type="opening_balances"
              class="import-type-btn border rounded-lg p-3 text-center hover:border-blue-400 transition-colors">
              <i class="fas fa-balance-scale text-lg text-gray-400 mb-1 block"></i>
              <span class="text-xs text-gray-600">기초잔액</span>
            </button>
          </div>
        </div>

        <!-- 헤더 매핑 설정 (이관 유형 선택 후 표시) -->
        <div id="mappingSection" class="bg-white rounded-lg border shadow-sm p-4 space-y-3 hidden">
          <div class="flex items-center justify-between">
            <h3 class="text-sm font-semibold" style="color:#212529;">
              <span id="mappingTitle">CSV 헤더 매핑</span>
            </h3>
            <span class="text-xs text-gray-400" id="mappingDesc"></span>
          </div>
          <div id="mappingTable" class="overflow-x-auto"></div>
        </div>

        <!-- CSV 업로드 영역 -->
        <div id="uploadSection" class="bg-white rounded-lg border shadow-sm p-4 space-y-3 hidden">
          <div class="flex items-center justify-between">
            <h3 class="text-sm font-semibold" style="color:#212529;">
              <i class="fas fa-upload mr-1 text-gray-400"></i>CSV 파일 업로드
            </h3>
            <div class="flex items-center gap-1">
              <span class="text-[10px] text-gray-400">인코딩:</span>
              <select id="encodingSelect" class="border rounded px-1.5 py-0.5 text-xs">
                <option value="EUC-KR" selected>EUC-KR (이카운트 기본)</option>
                <option value="UTF-8">UTF-8</option>
              </select>
            </div>
          </div>
          <div id="dropZone"
            class="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer hover:border-blue-400 transition-colors">
            <i class="fas fa-cloud-upload-alt text-3xl text-gray-300 mb-2 block"></i>
            <p class="text-sm text-gray-500">Excel/CSV 파일을 드래그하거나 클릭하여 선택</p>
            <p class="text-xs text-gray-400 mt-1">이카운트에서 내보낸 .xlsx, .xls, .csv 파일</p>
            <input type="file" id="csvFileInput" accept=".csv,.xlsx,.xls" class="hidden">
          </div>
          <div id="fileInfo" class="hidden text-sm text-gray-600">
            <i class="fas fa-file-csv mr-1 text-green-500"></i>
            <span id="fileName"></span>
            <span id="fileRows" class="ml-2 text-gray-400"></span>
          </div>
        </div>

        <!-- 미리보기 -->
        <div id="previewSection" class="bg-white rounded-lg border shadow-sm p-4 space-y-3 hidden">
          <div class="flex items-center justify-between">
            <h3 class="text-sm font-semibold" style="color:#212529;">미리보기</h3>
            <div class="flex items-center gap-2">
              <span id="previewStats" class="text-xs text-gray-400"></span>
              <button onclick="executeImport()" id="importBtn"
                class="px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700">
                <i class="fas fa-file-import mr-1"></i>가져오기
              </button>
            </div>
          </div>
          <div id="previewTable" class="overflow-x-auto max-h-96"></div>
        </div>

        <!-- 진행률 -->
        <div id="progressSection" class="bg-white rounded-lg border shadow-sm p-4 space-y-3 hidden">
          <h3 class="text-sm font-semibold" style="color:#212529;">이관 진행</h3>
          <div class="w-full bg-gray-200 rounded-full h-2.5">
            <div id="progressBar" class="bg-blue-600 h-2.5 rounded-full transition-all" style="width:0%"></div>
          </div>
          <div class="flex justify-between text-xs text-gray-500">
            <span id="progressText">준비 중...</span>
            <span id="progressPercent">0%</span>
          </div>
        </div>

        <!-- 결과 -->
        <div id="resultSection" class="bg-white rounded-lg border shadow-sm p-4 space-y-3 hidden">
          <h3 class="text-sm font-semibold" style="color:#212529;">이관 결과</h3>
          <div id="resultContent"></div>
        </div>

        <!-- 이관 이력 -->
        <div class="bg-white rounded-lg border shadow-sm p-4 space-y-3">
          <h3 class="text-sm font-semibold" style="color:#212529;">이관 이력</h3>
          <div id="migrationLogs" class="overflow-x-auto">
            <p class="text-sm text-gray-400 text-center py-4">로딩 중...</p>
          </div>
        </div>
      </div>

      <!-- 탭 2: 대사 검증 -->
      <div id="verifyContent" class="hidden space-y-4">
        <div class="bg-white rounded-lg border shadow-sm p-4 space-y-4">
          <h3 class="text-sm font-semibold" style="color:#212529;">검증 유형 선택</h3>
          <div class="grid grid-cols-3 gap-2">
            <button onclick="selectVerifyType('clients')"
              class="verify-type-btn border rounded-lg p-3 text-center hover:border-blue-400 transition-colors">
              <i class="fas fa-building text-lg text-gray-400 mb-1 block"></i>
              <span class="text-xs text-gray-600">거래처 대사</span>
            </button>
            <button onclick="selectVerifyType('balances')"
              class="verify-type-btn border rounded-lg p-3 text-center hover:border-blue-400 transition-colors">
              <i class="fas fa-balance-scale text-lg text-gray-400 mb-1 block"></i>
              <span class="text-xs text-gray-600">미수금 대사</span>
            </button>
            <button onclick="selectVerifyType('orders')"
              class="verify-type-btn border rounded-lg p-3 text-center hover:border-blue-400 transition-colors">
              <i class="fas fa-exchange-alt text-lg text-gray-400 mb-1 block"></i>
              <span class="text-xs text-gray-600">주문 누락 대사</span>
            </button>
          </div>
        </div>

        <!-- 대사용 CSV 업로드 -->
        <div id="verifyUploadSection" class="bg-white rounded-lg border shadow-sm p-4 space-y-3 hidden">
          <div class="flex items-center justify-between">
            <h3 class="text-sm font-semibold" style="color:#212529;" id="verifyUploadTitle">CSV 업로드</h3>
            <div class="flex items-center gap-2">
              <div id="verifyDatePicker" class="hidden">
                <input type="date" id="verifyDate" class="border rounded px-2 py-1 text-xs">
              </div>
              <div class="flex items-center gap-1">
                <span class="text-[10px] text-gray-400">인코딩:</span>
                <select id="verifyEncodingSelect" class="border rounded px-1.5 py-0.5 text-xs">
                  <option value="EUC-KR" selected>EUC-KR</option>
                  <option value="UTF-8">UTF-8</option>
                </select>
              </div>
            </div>
          </div>
          <div id="verifyDropZone"
            class="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center cursor-pointer hover:border-blue-400 transition-colors">
            <i class="fas fa-cloud-upload-alt text-2xl text-gray-300 mb-2 block"></i>
            <p class="text-sm text-gray-500">비교할 이카운트 CSV 업로드</p>
            <input type="file" id="verifyCsvInput" accept=".csv,.xlsx,.xls" class="hidden">
          </div>
        </div>

        <!-- 대사 결과 -->
        <div id="verifyResultSection" class="bg-white rounded-lg border shadow-sm p-4 space-y-3 hidden">
          <div class="flex items-center justify-between">
            <h3 class="text-sm font-semibold" style="color:#212529;">대사 결과</h3>
            <div id="verifyResultSummary" class="text-xs text-gray-400"></div>
          </div>
          <div id="verifyResultContent" class="overflow-x-auto"></div>
        </div>
      </div>

      <!-- 탭 3: 전환 현황 -->
      <div id="statusContent" class="hidden space-y-4">
        <!-- 이관 현황 요약 카드 -->
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2" id="statusCards">
          <div class="bg-white rounded-lg border p-2.5 text-center shadow-sm">
            <div class="text-xl font-bold" style="color:#212529;font-variant-numeric:tabular-nums;" id="statClients">-</div>
            <div class="text-[10px] text-gray-400">거래처</div>
          </div>
          <div class="bg-white rounded-lg border p-2.5 text-center shadow-sm">
            <div class="text-xl font-bold" style="color:#212529;font-variant-numeric:tabular-nums;" id="statItems">-</div>
            <div class="text-[10px] text-gray-400">품목</div>
          </div>
          <div class="bg-white rounded-lg border p-2.5 text-center shadow-sm">
            <div class="text-xl font-bold" style="color:#212529;font-variant-numeric:tabular-nums;" id="statOrders">-</div>
            <div class="text-[10px] text-gray-400">주문</div>
          </div>
          <div class="bg-white rounded-lg border p-2.5 text-center shadow-sm">
            <div class="text-xl font-bold" style="color:#212529;font-variant-numeric:tabular-nums;" id="statPayments">-</div>
            <div class="text-[10px] text-gray-400">입금</div>
          </div>
        </div>

        <!-- 이관 로그 요약 -->
        <div class="bg-white rounded-lg border shadow-sm p-4 space-y-3">
          <div class="flex items-center justify-between">
            <h3 class="text-sm font-semibold" style="color:#212529;">이관 작업 요약</h3>
            <button onclick="loadStatusReport()" class="text-xs text-blue-600 hover:underline">
              <i class="fas fa-sync-alt mr-1"></i>새로고침
            </button>
          </div>
          <div id="statusLogSummary"></div>
        </div>

        <!-- go/no-go 체크리스트 -->
        <div class="bg-white rounded-lg border shadow-sm p-4 space-y-3">
          <h3 class="text-sm font-semibold" style="color:#212529;">
            <i class="fas fa-clipboard-check mr-1 text-gray-400"></i>전환 체크리스트
          </h3>
          <div id="checklistContent" class="space-y-2">
            <div class="flex items-center gap-2 text-sm">
              <i class="far fa-square text-gray-300" id="chkClients"></i>
              <span class="text-gray-600">거래처 100% 이관 + 검증 완료</span>
            </div>
            <div class="flex items-center gap-2 text-sm">
              <i class="far fa-square text-gray-300" id="chkItems"></i>
              <span class="text-gray-600">품목 100% 이관 + 검증 완료</span>
            </div>
            <div class="flex items-center gap-2 text-sm">
              <i class="far fa-square text-gray-300" id="chkBalance"></i>
              <span class="text-gray-600">미수금 잔액 대사 통과 (99%+ 1,000원 이내)</span>
            </div>
            <div class="flex items-center gap-2 text-sm">
              <i class="far fa-square text-gray-300" id="chkOrders"></i>
              <span class="text-gray-600">이중 운영 7일+ 주문 누락 0건</span>
            </div>
            <div class="flex items-center gap-2 text-sm">
              <i class="far fa-square text-gray-300" id="chkTax"></i>
              <span class="text-gray-600">세금계산서 발행 정상 동작 확인</span>
            </div>
            <div class="flex items-center gap-2 text-sm">
              <i class="far fa-square text-gray-300" id="chkApproval"></i>
              <span class="text-gray-600">경리 2명 승인</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  `

  return renderPage(c, {
    title: '데이터 이관',
    pageContent,
    pageScript: migrationScript,
    activePage: 'migration'
  })
}