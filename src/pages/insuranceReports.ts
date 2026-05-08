import type { Context } from 'hono'
import type { HonoEnv } from '../types/env'
import { renderPage } from '../layout'
import pageScript from '../scripts/insuranceReports.js?raw'

export function insuranceReportsPage(c: Context<HonoEnv>) {
  return renderPage(c, {
    title: '4대보험 신고서',
    activePage: '/insurance-reports',
    pageContent: `
      <div class="space-y-4">
        <!-- 상단 컨트롤 바 -->
        <div class="bg-white rounded-lg border shadow-sm p-4 flex items-center gap-3 flex-wrap">
          <label class="text-xs font-medium text-gray-600">연도</label>
          <select id="irYear" class="border rounded px-3 py-1.5 text-sm" onchange="irLoadList()"></select>
          <label class="text-xs font-medium text-gray-600 ml-2">월</label>
          <select id="irMonth" class="border rounded px-3 py-1.5 text-sm" onchange="irLoadList()">
            <option value="">전체</option>
          </select>
          <button onclick="irLoadList()" class="px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700">
            <i class="fas fa-search mr-1"></i>검색
          </button>
          <div class="flex-1"></div>
          <button onclick="irOpenGenerateModal()" class="px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700">
            <i class="fas fa-plus mr-1"></i>신고서 생성
          </button>
        </div>

        <!-- 요약 카드 -->
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div class="bg-white border border-gray-200 rounded-lg p-5">
            <div class="text-xs text-gray-500 font-medium">신고서 수</div>
            <div class="text-3xl font-bold text-gray-900 tabular-nums mt-1" id="irStatCount">-</div>
          </div>
          <div class="bg-white border border-gray-200 rounded-lg p-5">
            <div class="text-xs text-gray-500 font-medium">근로자 부담 합계</div>
            <div class="text-3xl font-bold text-blue-600 tabular-nums mt-1" id="irStatEmployee">-</div>
          </div>
          <div class="bg-white border border-gray-200 rounded-lg p-5">
            <div class="text-xs text-gray-500 font-medium">회사 부담 합계</div>
            <div class="text-3xl font-bold text-amber-600 tabular-nums mt-1" id="irStatEmployer">-</div>
          </div>
          <div class="bg-white border border-gray-200 rounded-lg p-5">
            <div class="text-xs text-gray-500 font-medium">전체 합계</div>
            <div class="text-3xl font-bold text-gray-900 tabular-nums mt-1" id="irStatTotal">-</div>
          </div>
        </div>

        <!-- 신고서 목록 테이블 -->
        <div class="bg-white rounded-lg border shadow-sm overflow-hidden">
          <div class="overflow-x-auto">
            <table class="w-full text-sm ds-table-striped">
              <thead class="bg-gray-50 text-xs text-gray-600 font-semibold uppercase tracking-wider">
                <tr>
                  <th class="px-4 py-3 text-center">월</th>
                  <th class="px-4 py-3 text-center">유형</th>
                  <th class="px-4 py-3 text-right">인원</th>
                  <th class="px-4 py-3 text-right">국민연금</th>
                  <th class="px-4 py-3 text-right">건강보험</th>
                  <th class="px-4 py-3 text-right">장기요양</th>
                  <th class="px-4 py-3 text-right">고용보험</th>
                  <th class="px-4 py-3 text-right">전체 합계</th>
                  <th class="px-4 py-3 text-center">상태</th>
                  <th class="px-4 py-3 text-center">작업</th>
                </tr>
              </thead>
              <tbody id="irTableBody">
                <tr><td colspan="10" class="text-center text-gray-400 py-10"><i class="fas fa-spinner fa-spin mr-2"></i>불러오는 중...</td></tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- 신고서 생성 모달 -->
        <div id="irGenModal" class="fixed inset-0 bg-black/40 z-50 hidden flex items-center justify-center">
          <div class="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4">
            <div class="flex items-center justify-between px-6 py-4 border-b">
              <h3 class="text-lg font-bold text-gray-900"><i class="fas fa-plus-circle mr-2 text-blue-600"></i>4대보험 신고서 생성</h3>
              <button onclick="irCloseGenModal()" class="text-gray-400 hover:text-gray-700"><i class="fas fa-times"></i></button>
            </div>
            <div class="px-6 py-5 space-y-4">
              <p class="text-sm text-gray-600">해당 월의 급여 데이터를 기반으로 4대보험 신고서를 자동 생성합니다. 기존 신고서가 있으면 재생성됩니다.</p>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label class="block text-xs text-gray-600 mb-1">연도</label>
                  <select id="irGenYear" class="w-full border rounded px-3 py-2 text-sm"></select>
                </div>
                <div>
                  <label class="block text-xs text-gray-600 mb-1">월</label>
                  <select id="irGenMonth" class="w-full border rounded px-3 py-2 text-sm"></select>
                </div>
              </div>
            </div>
            <div class="flex items-center justify-end gap-2 px-6 py-4 border-t bg-gray-50 rounded-b-xl">
              <button onclick="irCloseGenModal()" class="px-4 py-2 text-sm border border-gray-300 rounded-lg text-gray-700 bg-white hover:bg-gray-50">취소</button>
              <button onclick="irGenerate()" class="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                <i class="fas fa-cogs mr-1"></i>생성
              </button>
            </div>
          </div>
        </div>

        <!-- 상세 모달 -->
        <div id="irDetailModal" class="fixed inset-0 bg-black/40 z-50 hidden flex items-start justify-center pt-8 overflow-y-auto">
          <div class="bg-white rounded-xl shadow-2xl w-full max-w-5xl mx-4 mb-8">
            <div class="flex items-center justify-between px-6 py-4 border-b">
              <h3 class="text-lg font-bold text-gray-900"><i class="fas fa-file-alt mr-2 text-blue-600"></i>신고서 상세</h3>
              <button onclick="irCloseDetail()" class="text-gray-400 hover:text-gray-700"><i class="fas fa-times text-lg"></i></button>
            </div>
            <div class="px-6 py-4">
              <!-- 요약 -->
              <div class="grid grid-cols-3 gap-4 mb-4" id="irDetailSummary"></div>
              <!-- 직원별 테이블 -->
              <div class="overflow-x-auto border rounded-lg">
                <table class="w-full text-xs ds-table-striped">
                  <thead class="bg-gray-50 text-gray-600 font-semibold uppercase tracking-wider">
                    <tr>
                      <th class="px-3 py-2 text-left">직원</th>
                      <th class="px-3 py-2 text-right">보수월액</th>
                      <th class="px-3 py-2 text-right">국민연금</th>
                      <th class="px-3 py-2 text-right">건강보험</th>
                      <th class="px-3 py-2 text-right">장기요양</th>
                      <th class="px-3 py-2 text-right">고용보험</th>
                      <th class="px-3 py-2 text-right">소계(근로자)</th>
                      <th class="px-3 py-2 text-right">소계(회사)</th>
                    </tr>
                  </thead>
                  <tbody id="irDetailTable"></tbody>
                </table>
              </div>
            </div>
            <div class="flex items-center justify-end gap-2 px-6 py-4 border-t bg-gray-50 rounded-b-xl">
              <button onclick="irCloseDetail()" class="px-4 py-2 text-sm border border-gray-300 rounded-lg text-gray-700 bg-white hover:bg-gray-50">닫기</button>
              <button id="irSubmitBtn" onclick="irSubmit()" class="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 hidden">
                <i class="fas fa-paper-plane mr-1"></i>제출 완료
              </button>
              <button id="irConfirmBtn" onclick="irConfirmReport()" class="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 hidden">
                <i class="fas fa-check-circle mr-1"></i>확정
              </button>
            </div>
          </div>
        </div>
      </div>
    `,
    pageScript,
  })
}
