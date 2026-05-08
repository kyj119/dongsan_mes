import type { Context } from 'hono'
import type { HonoEnv } from '../types/env'
import { renderPage } from '../layout'
import pageScript from '../scripts/attendance.js?raw'

export function attendancePage(c: Context<HonoEnv>) {
  return renderPage(c, {
    title: '근태 관리',
    activePage: '/attendance',
    pageContent: `
      <div class="max-w-full mx-auto space-y-4">
        <!-- 필터 바 -->
        <div class="bg-white rounded-lg border border-gray-200 p-4">
          <div class="flex flex-wrap items-center gap-3">
            <div class="flex items-center gap-2">
              <label class="text-sm font-semibold text-gray-700">월</label>
              <input id="attMonth" type="month" class="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500" />
            </div>
            <div class="flex items-center gap-2">
              <label class="text-sm font-semibold text-gray-700">부서</label>
              <select id="attDept" class="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500">
                <option value="">전체</option>
                <option value="OFFICE">사무직</option>
                <option value="PRODUCTION">생산직</option>
                <option value="SALES">영업</option>
              </select>
            </div>
            <button onclick="attendanceLoadMonth()" class="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
              <i class="fas fa-search mr-1"></i> 검색
            </button>
            <button onclick="attendanceSyncCaps()" id="attCapsSyncBtn" class="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700">
              <i class="fas fa-sync-alt mr-1"></i> CAPS 동기화
            </button>
            <div class="flex-1"></div>
            <div id="attAnomalyCount" class="text-xs text-gray-500"></div>
            <div id="attLastSync" class="text-xs text-gray-500 tabular-nums"></div>
            <button onclick="attendanceSaveAll()" id="attSaveBtn" class="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50" disabled>
              <i class="fas fa-save mr-1"></i> <span id="attSaveLabel">저장</span>
            </button>
          </div>
        </div>

        <!-- 일괄 액션 바 -->
        <div class="bg-amber-50 border border-amber-200 rounded-lg p-3 flex flex-wrap items-center gap-2">
          <span class="text-sm font-semibold text-amber-800">
            <i class="fas fa-check-square mr-1"></i> 일괄 액션
          </span>
          <span id="attSelectedCount" class="text-xs text-gray-600">선택: 0명</span>
          <div class="flex-1"></div>
          <input id="attBulkDate" type="date" class="border border-amber-300 rounded px-2 py-1 text-sm" />
          <select id="attBulkType" class="border border-amber-300 rounded px-2 py-1 text-sm">
            <option value="NORMAL">정상</option>
            <option value="ABSENT">결근</option>
            <option value="VACATION">연차</option>
            <option value="HALF_AM">오전반차</option>
            <option value="HALF_PM">오후반차</option>
            <option value="SICK">병가</option>
            <option value="HOLIDAY">휴일</option>
          </select>
          <input id="attBulkOvertime" type="number" step="0.5" placeholder="연장 +h" class="border border-amber-300 rounded px-2 py-1 text-sm w-24" />
          <button onclick="attendanceApplyBulk()" class="px-3 py-1 bg-amber-600 text-white rounded text-sm hover:bg-amber-700">
            선택 직원에 적용
          </button>
        </div>

        <!-- 스프레드시트 -->
        <div class="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div class="overflow-x-auto" style="max-height:70vh;">
            <table id="attGrid" class="min-w-full text-xs ds-table-striped">
              <thead class="bg-gray-50 sticky top-0 z-10">
                <tr id="attHeaderRow">
                  <!-- dynamically generated -->
                </tr>
              </thead>
              <tbody id="attBody">
                <tr><td colspan="40" class="text-center py-12 text-gray-400">월을 선택하고 검색 버튼을 눌러주세요.</td></tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- 범례 -->
        <div class="bg-white rounded-lg border border-gray-200 p-3 space-y-2 text-xs text-gray-600">
          <div class="flex flex-wrap gap-3">
            <span class="font-semibold text-gray-700">유형:</span>
            <span><span class="inline-block w-3 h-3 rounded bg-green-50 border border-green-200 align-middle mr-1"></span>정상(정)</span>
            <span><span class="inline-block w-3 h-3 rounded bg-red-50 border border-red-200 align-middle mr-1"></span>결근(결)</span>
            <span><span class="inline-block w-3 h-3 rounded bg-blue-50 border border-blue-200 align-middle mr-1"></span>연차(연)</span>
            <span><span class="inline-block w-3 h-3 rounded bg-cyan-50 border border-cyan-200 align-middle mr-1"></span>반차(반)/반반차(¼)</span>
            <span><span class="inline-block w-3 h-3 rounded bg-purple-50 border border-purple-200 align-middle mr-1"></span>병가(병)</span>
            <span><span class="inline-block w-3 h-3 rounded bg-amber-50 border border-amber-200 align-middle mr-1"></span>경조(경)</span>
            <span><span class="inline-block w-3 h-3 rounded bg-gray-100 border border-gray-300 align-middle mr-1"></span>휴일(휴)</span>
          </div>
          <div class="flex flex-wrap gap-3">
            <span class="font-semibold text-gray-700">뱃지:</span>
            <span class="ml-2"><span class="inline-block text-[8px] bg-amber-500 text-white px-1 rounded align-middle mr-1">지15</span>지각(분)</span>
            <span class="ml-2"><span class="inline-block text-[8px] bg-amber-600 text-white px-1 rounded align-middle mr-1">조1</span>조퇴(h)</span>
            <span class="ml-2"><span class="inline-block text-[8px] bg-blue-600 text-white px-1 rounded align-middle mr-1">1.5</span>조기출근</span>
            <span class="ml-2"><span class="inline-block text-[8px] bg-red-600 text-white px-1 rounded align-middle mr-1">+2</span>연장시간</span>
          </div>
          <div class="flex flex-wrap gap-3">
            <span class="font-semibold text-gray-700">출처:</span>
            <span><span class="inline-block w-2 h-2 rounded-full bg-blue-500 align-middle mr-1"></span>CAPS 자동</span>
            <span><span class="inline-block w-2 h-2 rounded-full bg-amber-500 align-middle mr-1"></span>CAPS 수정됨</span>
            <span><span class="inline-block w-2 h-2 rounded-full bg-gray-400 align-middle mr-1"></span>수동 입력</span>
            <span class="ml-2"><span class="inline-block w-2 h-2 rounded-full bg-red-500 align-middle mr-1"></span>이상 감지</span>
          </div>
          <div class="text-gray-500"><i class="fas fa-info-circle mr-1"></i>셀 클릭: 상세 보기/편집 · 체크박스 선택 후 일괄 적용 가능 · 수정 후 저장 버튼 클릭</div>
        </div>

        <!-- 상세 편집 모달 -->
        <div id="attDetailModal" class="fixed inset-0 bg-black bg-opacity-50 hidden items-center justify-center z-50">
          <div class="bg-white rounded-lg w-[420px] p-5 shadow-xl">
            <h3 class="text-lg font-bold mb-1"><i class="fas fa-clock text-blue-600 mr-2"></i>근태 상세</h3>
            <div id="attDetailInfo" class="text-sm text-gray-600 mb-2"></div>
            <div id="attDetailAnomaly" class="text-xs text-red-600 bg-red-50 rounded px-2 py-1 mb-2" style="display:none;"></div>
            <div id="attDetailSource" class="text-xs text-gray-500 mb-3" style="display:none;"></div>
            <div class="space-y-3">
              <div>
                <label class="text-sm font-semibold text-gray-700">유형</label>
                <select id="attDetailType" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1">
                  <option value="NORMAL">정상</option>
                  <option value="ABSENT">결근</option>
                  <option value="VACATION">연차</option>
                  <option value="HALF_AM">오전반차</option>
                  <option value="HALF_PM">오후반차</option>
                  <option value="QUARTER_1">반반차(08:30~10:00)</option>
                  <option value="QUARTER_2">반반차(10:00~12:00)</option>
                  <option value="QUARTER_3">반반차(13:00~16:00)</option>
                  <option value="QUARTER_4">반반차(16:00~18:00)</option>
                  <option value="SICK">병가</option>
                  <option value="FAMILY_EVENT">경조휴가</option>
                  <option value="HOLIDAY">휴일</option>
                </select>
              </div>
              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="text-sm font-semibold text-gray-700">출근</label>
                  <input id="attDetailIn" type="time" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1" />
                </div>
                <div>
                  <label class="text-sm font-semibold text-gray-700">퇴근</label>
                  <input id="attDetailOut" type="time" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1" />
                </div>
              </div>
              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="text-sm font-semibold text-gray-700">근무시간(h)</label>
                  <input id="attDetailHours" type="number" step="0.5" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1" />
                </div>
                <div>
                  <label class="text-sm font-semibold text-gray-700">지각(분)</label>
                  <input id="attDetailLateMin" type="number" step="1" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1" />
                </div>
              </div>
              <div class="grid grid-cols-3 gap-3">
                <div>
                  <label class="text-sm font-semibold text-gray-700">조기출근(h)</label>
                  <input id="attDetailEarly" type="number" step="0.5" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1" />
                </div>
                <div>
                  <label class="text-sm font-semibold text-gray-700">연장근무(h)</label>
                  <input id="attDetailOt" type="number" step="0.5" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1" />
                </div>
                <div>
                  <label class="text-sm font-semibold text-gray-700">조퇴(h)</label>
                  <input id="attDetailEarlyLeave" type="number" step="0.5" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1" />
                </div>
              </div>
              <div>
                <label class="text-sm font-semibold text-gray-700">휴일근무(h)</label>
                <input id="attDetailHolidayWork" type="number" step="0.5" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1" />
              </div>
              <div>
                <label class="text-sm font-semibold text-gray-700">비고</label>
                <input id="attDetailNotes" type="text" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mt-1" placeholder="선택사항" />
              </div>
            </div>
            <div class="flex justify-end gap-2 mt-5">
              <button onclick="attendanceCloseDetail()" class="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">닫기</button>
              <button onclick="attendanceApplyDetail()" class="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">수정 적용</button>
            </div>
          </div>
        </div>
      </div>
    `,
    pageScript,
  })
}
