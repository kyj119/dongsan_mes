import type { Context } from 'hono'
import type { HonoEnv } from '../types/env'
import { renderPage } from '../layout'
import pageScript from '../scripts/hr.js?raw'

export function hrPage(c: Context<HonoEnv>) {
  return renderPage(c, {
    title: '인사 관리',
    activePage: '/hr',
    pageContent: `
      <div class="space-y-6">
        <!-- 요약 카드 -->
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div class="bg-white rounded-lg border border-gray-200 p-5">
            <div class="text-xs text-gray-500">총 직원</div>
            <div class="text-3xl font-bold text-gray-900 mt-1" id="hrTotalEmployees">-</div>
            <div class="text-xs text-gray-400 mt-1">재직 중</div>
          </div>
          <div class="bg-white rounded-lg border border-gray-200 p-5">
            <div class="text-xs text-gray-500">금일 출근</div>
            <div class="text-3xl font-bold text-green-600 mt-1" id="hrTodayAttendance">-</div>
            <div class="text-xs text-gray-400 mt-1">오늘 출근 인원</div>
          </div>
          <div class="bg-white rounded-lg border border-gray-200 p-5">
            <div class="text-xs text-gray-500">평균 근무시간</div>
            <div class="text-3xl font-bold text-gray-900 mt-1" id="hrAvgWorkHours">-</div>
            <div class="text-xs text-gray-400 mt-1">이번 달 평균</div>
          </div>
          <div class="bg-white rounded-lg border border-gray-200 p-5">
            <div class="text-xs text-gray-500">월 인건비</div>
            <div class="text-3xl font-bold text-gray-900 mt-1" id="hrMonthlyPayroll">-</div>
            <div class="text-xs text-gray-400 mt-1">이번 달 총액</div>
          </div>
        </div>

        <!-- 필터 바 -->
        <div class="bg-white rounded-lg border border-gray-200 p-4">
          <div class="flex flex-wrap items-center gap-3">
            <input id="hrSearch" type="text" placeholder="사번/이름 검색" class="flex-1 min-w-[200px] border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500" />
            <select id="hrFilterDept" class="border border-gray-300 rounded-lg px-3 py-2 text-sm">
              <option value="">전체 부서</option>
              <option value="OFFICE">사무직</option>
              <option value="DESIGN">디자인</option>
              <option value="PRODUCTION">생산직</option>
              <option value="UV_SIGN">UV/사인</option>
              <option value="FINISHING">후가공</option>
              <option value="ASSEMBLY">조립</option>
              <option value="SALES">영업</option>
              <option value="EXECUTIVE">임원</option>
            </select>
            <select id="hrFilterPosition" class="border border-gray-300 rounded-lg px-3 py-2 text-sm">
              <option value="">전체 직급</option>
              <option value="STAFF">사원</option>
              <option value="ASSISTANT_MANAGER">대리</option>
              <option value="MANAGER">과장</option>
              <option value="DEPUTY_GENERAL_MANAGER">차장</option>
              <option value="GENERAL_MANAGER">부장</option>
            </select>
            <select id="hrFilterStatus" class="border border-gray-300 rounded-lg px-3 py-2 text-sm">
              <option value="ACTIVE">재직</option>
              <option value="RESIGNED">퇴사</option>
              <option value="">전체</option>
            </select>
            <button onclick="hrLoadEmployees()" class="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
              <i class="fas fa-search mr-1"></i> 검색
            </button>
            <button onclick="hrOpenEmployeeModal()" class="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
              <i class="fas fa-plus mr-1"></i> 직원 등록
            </button>
          </div>
        </div>

        <!-- 직원 목록 -->
        <div class="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div class="overflow-x-auto">
            <table class="w-full text-sm ds-table-striped">
              <thead class="bg-gray-50 text-xs text-gray-600 uppercase tracking-wider">
                <tr>
                  <th class="px-4 py-3 text-left">사번</th>
                  <th class="px-4 py-3 text-left">이름</th>
                  <th class="px-4 py-3 text-left">소속법인</th>
                  <th class="px-4 py-3 text-left">부서</th>
                  <th class="px-4 py-3 text-left">직급</th>
                  <th class="px-4 py-3 text-left">전화번호</th>
                  <th class="px-4 py-3 text-left">입사일</th>
                  <th class="px-4 py-3 text-right">기본급</th>
                  <th class="px-4 py-3 text-center">상태</th>
                  <th class="px-4 py-3 text-center">상세</th>
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
      </div>

      <!-- 직원 등록 모달 (직원 상세와 동일 필드 구성) -->
      <div id="hrEmployeeModal" class="fixed inset-0 bg-black bg-opacity-50 hidden items-center justify-center z-50">
        <div class="bg-white rounded-lg w-full max-w-4xl max-h-[92vh] overflow-y-auto">
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
                <div><label class="block text-xs text-gray-500 mb-1">생년월일</label><input type="date" name="birth_date" class="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"></div>
                <div><label class="block text-xs text-gray-500 mb-1">주민등록번호</label><input type="text" name="resident_number" maxlength="14" placeholder="000000-0000000" class="w-full border border-gray-300 rounded px-2 py-1.5 text-sm tabular-nums"></div>
                <div><label class="block text-xs text-gray-500 mb-1">고용 유형 <span class="text-red-500">*</span></label>
                  <select name="employment_type" required class="w-full border border-gray-300 rounded px-2 py-1.5 text-sm">
                    <option value="FULL_TIME">정규직</option>
                    <option value="CONTRACT">계약직</option>
                    <option value="PART_TIME">시간제</option>
                  </select>
                </div>
                <div><label class="block text-xs text-gray-500 mb-1">소속법인</label>
                  <select name="entity_id" class="w-full border border-gray-300 rounded px-2 py-1.5 text-sm">
                    <option value="1">동산기획</option>
                    <option value="2">선명</option>
                    <option value="3">동산기획 청주</option>
                  </select>
                </div>
                <div><label class="block text-xs text-gray-500 mb-1">부서 <span class="text-red-500">*</span></label>
                  <select name="department" required class="w-full border border-gray-300 rounded px-2 py-1.5 text-sm">
                    <option value="">선택</option>
                    <option value="OFFICE">사무직</option>
                    <option value="DESIGN">디자인</option>
                    <option value="PRODUCTION">생산직</option>
                    <option value="UV_SIGN">UV/사인</option>
                    <option value="FINISHING">후가공</option>
                    <option value="ASSEMBLY">조립</option>
                    <option value="SALES">영업</option>
                    <option value="EXECUTIVE">임원</option>
                  </select>
                </div>
                <div><label class="block text-xs text-gray-500 mb-1">직급 <span class="text-red-500">*</span></label>
                  <select name="position" required class="w-full border border-gray-300 rounded px-2 py-1.5 text-sm">
                    <option value="">선택</option>
                    <option value="STAFF">사원</option>
                    <option value="ASSISTANT_MANAGER">대리</option>
                    <option value="MANAGER">과장</option>
                    <option value="DEPUTY_GENERAL_MANAGER">차장</option>
                    <option value="GENERAL_MANAGER">부장</option>
                  </select>
                </div>
                <div><label class="block text-xs text-gray-500 mb-1">직책</label><input type="text" name="job_title" class="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"></div>
                <div><label class="block text-xs text-gray-500 mb-1">입사일자 <span class="text-red-500">*</span></label><input type="date" name="hire_date" required class="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"></div>
                <div><label class="block text-xs text-gray-500 mb-1">퇴사일자</label><input type="date" name="resignation_date" class="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"></div>
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
              <div class="grid grid-cols-3 gap-3 items-end">
                <div><label class="block text-xs text-gray-500 mb-1">CAPS 번호</label><input type="text" name="caps_id" placeholder="ACServer 사원번호" class="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"></div>
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
              <button type="submit" class="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
                <i class="fas fa-save mr-1"></i> 저장
              </button>
            </div>
          </form>
        </div>
      </div>
    `,
    pageScript,
  })
}
