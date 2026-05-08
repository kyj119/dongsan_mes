import type { Context } from 'hono'
import type { HonoEnv } from '../types/env'
import { renderPage } from '../layout'
import pageScript from '../scripts/vatReports.js?raw'

export function vatReportsPage(c: Context<HonoEnv>) {
  return renderPage(c, {
    title: '부가세 신고',
    activePage: '/vat-reports',
    pageContent: `
      <div class="space-y-4">
        <!-- 분기 선택 -->
        <div class="bg-white rounded-lg border shadow-sm p-3 flex items-center gap-2">
          <label class="text-xs text-gray-500">신고 연도</label>
          <select id="vatYear" class="border rounded px-2 py-1 text-xs"></select>
          <label class="text-xs text-gray-500 ml-2">분기</label>
          <select id="vatQuarter" class="border rounded px-2 py-1 text-xs">
            <option value="1">1기 예정 (1~3월)</option>
            <option value="2">1기 확정 (4~6월)</option>
            <option value="3">2기 예정 (7~9월)</option>
            <option value="4">2기 확정 (10~12월)</option>
          </select>
          <button onclick="loadVatSummary()" class="px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 ml-2">
            <i class="fas fa-calculator mr-1"></i>집계
          </button>
          <div class="flex-1"></div>
          <button onclick="saveVatReport()" class="px-3 py-1.5 text-xs border border-gray-300 text-gray-700 bg-white rounded hover:bg-gray-50">
            <i class="fas fa-save mr-1"></i>이력 저장
          </button>
          <button onclick="exportVatExcel()" class="px-3 py-1.5 text-xs border border-gray-300 text-gray-700 bg-white rounded hover:bg-gray-50">
            <i class="fas fa-file-excel mr-1"></i>엑셀
          </button>
        </div>

        <!-- 요약 카드 -->
        <div class="grid grid-cols-2 md:grid-cols-4 gap-2">
          <div class="bg-white rounded-lg border p-3 text-center shadow-sm">
            <div class="text-xs text-gray-400 mb-1">매출 세금계산서</div>
            <div class="text-lg font-bold text-gray-900" style="font-variant-numeric:tabular-nums;" id="vatSalesCount">-</div>
            <div class="text-[10px] text-gray-400 mt-1">건</div>
          </div>
          <div class="bg-white rounded-lg border p-3 text-center shadow-sm">
            <div class="text-xs text-gray-400 mb-1">매출 공급가액</div>
            <div class="text-lg font-bold text-blue-600" style="font-variant-numeric:tabular-nums;" id="vatSalesSupply">-</div>
            <div class="text-[10px] text-gray-400 mt-1" id="vatSalesTax">세액 -</div>
          </div>
          <div class="bg-white rounded-lg border p-3 text-center shadow-sm">
            <div class="text-xs text-gray-400 mb-1">매입 공급가액</div>
            <div class="text-lg font-bold text-amber-600" style="font-variant-numeric:tabular-nums;" id="vatPurchaseSupply">-</div>
            <div class="text-[10px] text-gray-400 mt-1" id="vatPurchaseTax">세액 -</div>
          </div>
          <div class="bg-white rounded-lg border border-red-200 p-3 text-center shadow-sm">
            <div class="text-xs text-red-500 mb-1">납부세액</div>
            <div class="text-lg font-bold text-red-600" style="font-variant-numeric:tabular-nums;" id="vatPayable">-</div>
            <div class="text-[10px] text-gray-400 mt-1">매출세액 - 매입세액</div>
          </div>
        </div>

        <!-- 매출/매입 탭 -->
        <div class="bg-white rounded-lg border shadow-sm">
          <div class="flex border-b">
            <button id="tabVatSales" onclick="switchVatTab('sales')" class="px-4 py-2 text-sm font-medium border-b-2 border-blue-600 text-blue-600">매출 세금계산서</button>
            <button id="tabVatPurchase" onclick="switchVatTab('purchase')" class="px-4 py-2 text-sm font-medium border-b-2 border-transparent text-gray-500 hover:text-gray-700">매입 세금계산서</button>
            <button id="tabVatHistory" onclick="switchVatTab('history')" class="px-4 py-2 text-sm font-medium border-b-2 border-transparent text-gray-500 hover:text-gray-700">신고 이력</button>
          </div>
          <div class="p-4">
            <div id="vatSalesPanel" class="overflow-x-auto"></div>
            <div id="vatPurchasePanel" class="hidden overflow-x-auto"></div>
            <div id="vatHistoryPanel" class="hidden overflow-x-auto"></div>
          </div>
        </div>
      </div>
    `,
    pageScript
  })
}
