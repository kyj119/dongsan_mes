import type { Context } from 'hono'
import type { HonoEnv } from '../types/env'
import { renderPage } from '../layout'
import pageScript from '../scripts/yearEndManage.js?raw'

export function yearEndManagePage(c: Context<HonoEnv>) {
  return renderPage(c, {
    title: '연말정산 관리',
    activePage: '/year-end-manage',
    pageContent: `
      <div class="space-y-4">
        <!-- 상단 컨트롤 바 -->
        <div class="bg-white rounded-lg border shadow-sm p-4 flex items-center gap-3 flex-wrap">
          <label class="text-xs font-medium text-gray-600">정산 연도</label>
          <select id="yeYear" class="border rounded px-3 py-1.5 text-sm" onchange="yeLoadList()"></select>
          <button onclick="yeLoadList()" class="px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700">
            <i class="fas fa-sync-alt mr-1"></i>새로고침
          </button>
          <div class="flex-1"></div>
          <span id="yeSummaryBadge" class="text-xs text-gray-500"></span>
        </div>

        <!-- 요약 카드 -->
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div class="bg-white border border-gray-200 rounded-lg p-5">
            <div class="text-xs text-gray-500 font-medium">전체 직원</div>
            <div class="text-3xl font-bold text-gray-900 tabular-nums mt-1" id="yeStatTotal">-</div>
          </div>
          <div class="bg-white border border-gray-200 rounded-lg p-5">
            <div class="text-xs text-gray-500 font-medium">정산 완료</div>
            <div class="text-3xl font-bold text-green-600 tabular-nums mt-1" id="yeStatDone">-</div>
          </div>
          <div class="bg-white border border-gray-200 rounded-lg p-5">
            <div class="text-xs text-gray-500 font-medium">환급 예정</div>
            <div class="text-3xl font-bold text-blue-600 tabular-nums mt-1" id="yeStatRefund">-</div>
          </div>
          <div class="bg-white border border-gray-200 rounded-lg p-5">
            <div class="text-xs text-gray-500 font-medium">추징 예정</div>
            <div class="text-3xl font-bold text-red-600 tabular-nums mt-1" id="yeStatCollect">-</div>
          </div>
        </div>

        <!-- 직원 목록 테이블 -->
        <div class="bg-white rounded-lg border shadow-sm overflow-hidden">
          <div class="overflow-x-auto">
            <table class="w-full text-sm ds-table-striped">
              <thead class="bg-gray-50 text-xs text-gray-600 font-semibold uppercase tracking-wider">
                <tr>
                  <th class="px-4 py-3 text-left">직원</th>
                  <th class="px-4 py-3 text-left">부서</th>
                  <th class="px-4 py-3 text-right">총급여</th>
                  <th class="px-4 py-3 text-right">결정세액</th>
                  <th class="px-4 py-3 text-right">기납부세액</th>
                  <th class="px-4 py-3 text-right">환급/추징</th>
                  <th class="px-4 py-3 text-center">상태</th>
                  <th class="px-4 py-3 text-center">작업</th>
                </tr>
              </thead>
              <tbody id="yeTableBody">
                <tr><td colspan="8" class="text-center text-gray-400 py-10"><i class="fas fa-spinner fa-spin mr-2"></i>불러오는 중...</td></tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- 정산 편집 모달 -->
        <div id="yeModal" class="fixed inset-0 bg-black/40 z-50 hidden flex items-start justify-center pt-8 overflow-y-auto">
          <div class="bg-white rounded-xl shadow-2xl w-full max-w-3xl mx-4 mb-8">
            <div class="flex items-center justify-between px-6 py-4 border-b">
              <h3 class="text-lg font-bold text-gray-900"><i class="fas fa-calculator mr-2 text-blue-600"></i>연말정산 상세</h3>
              <button onclick="yeCloseModal()" class="text-gray-400 hover:text-gray-700"><i class="fas fa-times text-lg"></i></button>
            </div>
            <div class="px-6 py-4 space-y-5 max-h-[75vh] overflow-y-auto">
              <input type="hidden" id="yeEmpId">

              <!-- 직원 정보 -->
              <div class="bg-gray-50 rounded-lg p-4">
                <h4 class="text-sm font-semibold text-gray-700 mb-2"><i class="fas fa-user mr-1"></i>직원 정보</h4>
                <div class="grid grid-cols-3 gap-3 text-sm">
                  <div><span class="text-gray-500">성명:</span> <strong id="yeEmpName">-</strong></div>
                  <div><span class="text-gray-500">부서:</span> <span id="yeEmpDept">-</span></div>
                  <div><span class="text-gray-500">사번:</span> <span id="yeEmpCode">-</span></div>
                </div>
              </div>

              <!-- 급여 집계 (자동) -->
              <div class="bg-blue-50 rounded-lg p-4 border border-blue-100">
                <h4 class="text-sm font-semibold text-blue-800 mb-2"><i class="fas fa-chart-bar mr-1"></i>급여 집계 (자동 계산)</h4>
                <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-sm">
                  <div><span class="text-gray-600">총급여액:</span> <strong id="yeDispTotalSalary" class="tabular-nums">-</strong></div>
                  <div><span class="text-gray-600">비과세 합계:</span> <strong id="yeDispNontax" class="tabular-nums">-</strong></div>
                  <div><span class="text-gray-600">과세 근로소득:</span> <strong id="yeDispGross" class="tabular-nums">-</strong></div>
                </div>
              </div>

              <!-- 인적공제 -->
              <div>
                <h4 class="text-sm font-semibold text-gray-700 mb-3"><i class="fas fa-users mr-1"></i>인적공제</h4>
                <div class="grid grid-cols-2 gap-4">
                  <div>
                    <label class="block text-xs text-gray-600 mb-1">기본공제 대상자 수 (본인 포함) <span class="text-red-500">*</span></label>
                    <input type="number" id="yeDependents" value="1" min="1" class="w-full border rounded px-3 py-2 text-sm" onchange="yePreviewCalc()">
                  </div>
                  <div>
                    <label class="block text-xs text-gray-600 mb-1">경로우대 (70세 이상) 인원</label>
                    <input type="number" id="yeAged" value="0" min="0" class="w-full border rounded px-3 py-2 text-sm" onchange="yePreviewCalc()">
                  </div>
                  <div>
                    <label class="block text-xs text-gray-600 mb-1">장애인 인원</label>
                    <input type="number" id="yeDisabled" value="0" min="0" class="w-full border rounded px-3 py-2 text-sm" onchange="yePreviewCalc()">
                  </div>
                  <div>
                    <label class="block text-xs text-gray-600 mb-1">부녀자/한부모 공제액</label>
                    <input type="number" id="yeSingleParent" value="0" class="w-full border rounded px-3 py-2 text-sm" onchange="yePreviewCalc()">
                  </div>
                </div>
              </div>

              <!-- 특별소득공제 -->
              <div>
                <h4 class="text-sm font-semibold text-gray-700 mb-3"><i class="fas fa-file-invoice-dollar mr-1"></i>특별소득공제</h4>
                <div class="grid grid-cols-2 gap-4">
                  <div>
                    <label class="block text-xs text-gray-600 mb-1">보장성보험료 (최대 100만)</label>
                    <input type="text" inputmode="numeric" data-money id="yeInsurance" value="0" class="w-full border rounded px-3 py-2 text-sm" onchange="yePreviewCalc()">
                  </div>
                  <div>
                    <label class="block text-xs text-gray-600 mb-1">의료비 (총액 입력, 3% 초과분 자동 계산)</label>
                    <input type="text" inputmode="numeric" data-money id="yeMedical" value="0" class="w-full border rounded px-3 py-2 text-sm" onchange="yePreviewCalc()">
                  </div>
                  <div>
                    <label class="block text-xs text-gray-600 mb-1">교육비</label>
                    <input type="text" inputmode="numeric" data-money id="yeEducation" value="0" class="w-full border rounded px-3 py-2 text-sm" onchange="yePreviewCalc()">
                  </div>
                  <div>
                    <label class="block text-xs text-gray-600 mb-1">주택자금</label>
                    <input type="text" inputmode="numeric" data-money id="yeHousing" value="0" class="w-full border rounded px-3 py-2 text-sm" onchange="yePreviewCalc()">
                  </div>
                  <div>
                    <label class="block text-xs text-gray-600 mb-1">기부금</label>
                    <input type="text" inputmode="numeric" data-money id="yeDonation" value="0" class="w-full border rounded px-3 py-2 text-sm" onchange="yePreviewCalc()">
                  </div>
                </div>
              </div>

              <!-- 기타소득공제 -->
              <div>
                <h4 class="text-sm font-semibold text-gray-700 mb-3"><i class="fas fa-credit-card mr-1"></i>기타소득공제</h4>
                <div class="grid grid-cols-2 gap-4">
                  <div>
                    <label class="block text-xs text-gray-600 mb-1">연금저축 (최대 400만)</label>
                    <input type="text" inputmode="numeric" data-money id="yePension" value="0" class="w-full border rounded px-3 py-2 text-sm" onchange="yePreviewCalc()">
                  </div>
                  <div>
                    <label class="block text-xs text-gray-600 mb-1">신용카드 공제액</label>
                    <input type="text" inputmode="numeric" data-money id="yeCreditCard" value="0" class="w-full border rounded px-3 py-2 text-sm" onchange="yePreviewCalc()">
                  </div>
                </div>
              </div>

              <!-- 세액공제 -->
              <div>
                <h4 class="text-sm font-semibold text-gray-700 mb-3"><i class="fas fa-percent mr-1"></i>세액공제</h4>
                <div class="grid grid-cols-2 gap-4">
                  <div>
                    <label class="block text-xs text-gray-600 mb-1">자녀세액공제</label>
                    <input type="text" inputmode="numeric" data-money id="yeChildCredit" value="0" class="w-full border rounded px-3 py-2 text-sm" onchange="yePreviewCalc()">
                  </div>
                </div>
              </div>

              <!-- 비고 -->
              <div>
                <label class="block text-xs text-gray-600 mb-1">비고</label>
                <textarea id="yeNotes" rows="2" class="w-full border rounded px-3 py-2 text-sm" placeholder="특이사항 메모"></textarea>
              </div>

              <!-- 계산 결과 미리보기 -->
              <div id="yePreviewArea" class="bg-gray-50 rounded-lg p-4 border hidden">
                <h4 class="text-sm font-semibold text-gray-700 mb-3"><i class="fas fa-calculator mr-1"></i>계산 결과 미리보기</h4>
                <div class="grid grid-cols-2 gap-2 text-sm" id="yePreviewGrid"></div>
              </div>
            </div>
            <div class="flex items-center justify-end gap-2 px-6 py-4 border-t bg-gray-50 rounded-b-xl">
              <button onclick="yeCloseModal()" class="px-4 py-2 text-sm border border-gray-300 rounded-lg text-gray-700 bg-white hover:bg-gray-50">취소</button>
              <button onclick="yeCalculateAndSave()" class="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                <i class="fas fa-calculator mr-1"></i>계산 및 저장
              </button>
            </div>
          </div>
        </div>
      </div>
    `,
    pageScript,
  })
}
