import type { Context } from 'hono'
import type { HonoEnv } from '../types/env'
import { renderPage } from '../layout'
import pageScript from '../scripts/hrDetail.js?raw'

export function hrDetailPage(c: Context<HonoEnv>) {
  const id = c.req.param('id') || '0'
  return renderPage(c, {
    title: '직원 상세',
    activePage: '/hr',
    pageContent: `
      <!-- 직원 삭제 2차 확인 모달 -->
      <div id="hrdDeleteModal" class="hidden fixed inset-0 z-50 flex items-center justify-center bg-black/50">
        <div class="bg-white rounded-lg shadow-xl w-[460px] max-w-[92vw] overflow-hidden">
          <div class="px-5 py-4 border-b border-gray-200 flex items-center gap-2 bg-red-50">
            <i class="fas fa-exclamation-triangle text-red-600"></i>
            <h3 class="text-base font-bold text-red-700">직원 하드 삭제 (복구 불가)</h3>
          </div>
          <div class="px-5 py-4 space-y-3">
            <div class="text-sm text-gray-700">
              <div class="mb-1">대상: <span id="hrdDelTargetName" class="font-semibold text-gray-900">-</span> <span id="hrdDelTargetCode" class="text-xs text-gray-500">-</span></div>
              <div class="text-xs text-gray-500">출근/급여/휴가 등 관련 이력이 모두 함께 삭제됩니다.</div>
            </div>
            <div class="bg-amber-50 border border-amber-200 rounded p-3 text-xs text-amber-800">
              아래 문구를 그대로 입력해야 삭제됩니다:
              <div class="mt-1.5 font-mono text-sm text-amber-900">
                <span id="hrdDelExpectPhrase">-</span>
              </div>
            </div>
            <input id="hrdDelInput" type="text" autocomplete="off" placeholder="확인 문구 입력"
              class="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-red-500 focus:border-red-500" />
            <div id="hrdDelHint" class="text-xs text-red-600 hidden">문구가 일치하지 않습니다.</div>
          </div>
          <div class="px-5 py-3 bg-gray-50 border-t border-gray-200 flex justify-end gap-2">
            <button onclick="hrdCloseDeleteModal()" class="px-4 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50">취소</button>
            <button id="hrdDelConfirmBtn" onclick="hrdConfirmDelete()" disabled class="px-4 py-2 text-sm text-white bg-red-600 rounded hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed">
              <i class="fas fa-trash mr-1"></i> 영구 삭제
            </button>
          </div>
        </div>
      </div>

      <div class="space-y-6" data-employee-id="${id}">
        <!-- 헤더 -->
        <div class="bg-white rounded-lg border border-gray-200 p-5 flex items-start gap-4">
          <div class="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 text-2xl font-bold" id="hrdAvatar">-</div>
          <div class="flex-1">
            <div class="flex items-center gap-3">
              <h2 class="text-2xl font-bold text-gray-900" id="hrdName">로드 중...</h2>
              <span id="hrdStatus" class="px-2.5 py-0.5 text-xs rounded-full bg-gray-100 text-gray-700">-</span>
            </div>
            <div class="text-sm text-gray-600 mt-1">
              <span id="hrdCode">-</span> ·
              <span id="hrdDept">-</span> ·
              <span id="hrdPosition">-</span>
            </div>
            <div class="text-xs text-gray-500 mt-2 flex flex-wrap gap-4">
              <span><i class="fas fa-phone mr-1"></i><span id="hrdPhone">-</span></span>
              <span><i class="fas fa-envelope mr-1"></i><span id="hrdEmail">-</span></span>
              <span><i class="fas fa-calendar mr-1"></i>입사 <span id="hrdHireDate">-</span></span>
              <span><i class="fas fa-briefcase mr-1"></i><span id="hrdEmploymentType">-</span></span>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <button id="hrdDeleteBtn" onclick="hrdDeleteEmployee()" class="hidden px-3 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded">
              <i class="fas fa-trash mr-1"></i> 직원 삭제
            </button>
            <button onclick="history.back()" class="px-3 py-2 text-sm text-gray-600 hover:text-gray-800">
              <i class="fas fa-arrow-left mr-1"></i> 목록으로
            </button>
          </div>
        </div>

        <!-- ============================================================ -->
        <!-- 직원 관리 섹션 (기본정보 / 급여통장 / 급여상세 / 세금 / 4대보험) -->
        <!-- ============================================================ -->
        <div class="bg-white rounded-lg border border-gray-200 overflow-hidden" id="hrdManageCard">
          <div class="px-5 py-3 border-b border-gray-200 flex items-center justify-between">
            <h3 class="text-sm font-semibold text-gray-700">
              <i class="fas fa-user-cog text-blue-600 mr-1"></i>
              직원 상세 정보
            </h3>
            <div class="flex items-center gap-2">
              <button id="hrdEditBtn" onclick="hrdToggleEdit(true)" class="px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded">
                <i class="fas fa-pen mr-1"></i>편집
              </button>
              <button id="hrdSaveBtn" onclick="hrdSave()" class="hidden px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded">
                <i class="fas fa-save mr-1"></i>저장
              </button>
              <button id="hrdCancelBtn" onclick="hrdToggleEdit(false)" class="hidden px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded">
                취소
              </button>
            </div>
          </div>

          <div class="p-5 space-y-6">
            <!-- 기본 정보 -->
            <section>
              <h4 class="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">기본 정보</h4>
              <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <div><label class="block text-xs text-gray-500 mb-1">성명</label><input data-field="name" class="hrd-input w-full border border-gray-200 rounded px-2 py-1.5 text-sm" disabled></div>
                <div><label class="block text-xs text-gray-500 mb-1">생년월일</label><input data-field="birth_date" type="date" class="hrd-input w-full border border-gray-200 rounded px-2 py-1.5 text-sm" disabled></div>
                <div><label class="block text-xs text-gray-500 mb-1">주민등록번호</label><input data-field="resident_number" data-format="rrn" maxlength="14" class="hrd-input w-full border border-gray-200 rounded px-2 py-1.5 text-sm tabular-nums" placeholder="000000-0000000" disabled></div>
                <div><label class="block text-xs text-gray-500 mb-1">소속법인</label>
                  <select data-field="entity_id" class="hrd-input w-full border border-gray-200 rounded px-2 py-1.5 text-sm" disabled>
                    <option value="1">동산기획</option>
                    <option value="2">선명</option>
                    <option value="3">동산기획 청주</option>
                  </select>
                </div>
                <div><label class="block text-xs text-gray-500 mb-1">부서</label>
                  <select data-field="department" class="hrd-input w-full border border-gray-200 rounded px-2 py-1.5 text-sm" disabled>
                    <option value="">-</option>
                    <option value="ADMIN_DEPT">사무직</option>
                    <option value="DESIGN">디자인</option>
                    <option value="SALES">영업</option>
                    <option value="TRANSFER">전사</option>
                    <option value="SIGN">간판</option>
                    <option value="PRINTING">출력</option>
                    <option value="PRODUCTION">생산직</option>
                    <option value="EXECUTIVE">임원</option>
                  </select>
                </div>
                <div><label class="block text-xs text-gray-500 mb-1">직위</label>
                  <select data-field="position" class="hrd-input w-full border border-gray-200 rounded px-2 py-1.5 text-sm" disabled>
                    <option value="">-</option>
                    <option value="STAFF">사원</option>
                    <option value="SENIOR_STAFF">주임</option>
                    <option value="ASSISTANT_MANAGER">대리</option>
                    <option value="MANAGER">과장</option>
                    <option value="DEPUTY_GENERAL_MANAGER">차장</option>
                    <option value="GENERAL_MANAGER">부장</option>
                    <option value="DIRECTOR">이사</option>
                    <option value="CEO">대표이사</option>
                  </select>
                </div>
                <div><label class="block text-xs text-gray-500 mb-1">직책</label><input data-field="job_title" class="hrd-input w-full border border-gray-200 rounded px-2 py-1.5 text-sm" disabled></div>
                <div><label class="block text-xs text-gray-500 mb-1">이메일</label><input data-field="email" type="email" class="hrd-input w-full border border-gray-200 rounded px-2 py-1.5 text-sm" disabled></div>
                <div><label class="block text-xs text-gray-500 mb-1">전화번호</label><input data-field="phone" data-format="phone" maxlength="13" class="hrd-input w-full border border-gray-200 rounded px-2 py-1.5 text-sm tabular-nums" placeholder="02-1234-5678" disabled></div>
                <div><label class="block text-xs text-gray-500 mb-1">휴대폰</label><input data-field="mobile" data-format="mobile" maxlength="13" class="hrd-input w-full border border-gray-200 rounded px-2 py-1.5 text-sm tabular-nums" placeholder="010-1234-5678" disabled></div>
                <div class="col-span-3">
                  <label class="block text-xs text-gray-500 mb-1">주소</label>
                  <div class="grid grid-cols-12 gap-2">
                    <input id="hrdPostalCode" data-field="postal_code" maxlength="5" placeholder="우편번호" class="hrd-input col-span-2 border border-gray-200 rounded px-2 py-1.5 text-sm tabular-nums" disabled>
                    <input id="hrdAddress" data-field="address" placeholder="기본주소" class="hrd-input col-span-7 border border-gray-200 rounded px-2 py-1.5 text-sm" disabled>
                    <button type="button" id="hrdAddressSearchBtn" onclick="openPostcodeSearch({ postalId: 'hrdPostalCode', addressId: 'hrdAddress', detailFocusId: 'hrdAddressDetail' })" class="col-span-3 px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded border border-blue-200 hidden">
                      <i class="fas fa-search mr-1"></i>주소 검색
                    </button>
                    <input id="hrdAddressDetail" data-field="address_detail" placeholder="상세주소 (예: 101동 1502호)" class="hrd-input col-span-12 border border-gray-200 rounded px-2 py-1.5 text-sm" disabled>
                  </div>
                </div>
                <div><label class="block text-xs text-gray-500 mb-1">입사일자</label><input data-field="hire_date" type="date" class="hrd-input w-full border border-gray-200 rounded px-2 py-1.5 text-sm" disabled></div>
                <div><label class="block text-xs text-gray-500 mb-1">퇴사일자</label><input data-field="resignation_date" type="date" class="hrd-input w-full border border-gray-200 rounded px-2 py-1.5 text-sm" disabled></div>
                <div><label class="block text-xs text-gray-500 mb-1">고용형태</label>
                  <select data-field="employment_type" class="hrd-input w-full border border-gray-200 rounded px-2 py-1.5 text-sm" disabled>
                    <option value="FULL_TIME">정규직</option>
                    <option value="CONTRACT">계약직</option>
                    <option value="PART_TIME">시간제</option>
                  </select>
                </div>
              </div>
            </section>

            <!-- 급여 통장 -->
            <section>
              <h4 class="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">급여 통장</h4>
              <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <div><label class="block text-xs text-gray-500 mb-1">은행</label><input data-field="bank_name" class="hrd-input w-full border border-gray-200 rounded px-2 py-1.5 text-sm" disabled></div>
                <div><label class="block text-xs text-gray-500 mb-1">계좌번호</label><input data-field="bank_account" class="hrd-input w-full border border-gray-200 rounded px-2 py-1.5 text-sm" disabled></div>
                <div><label class="block text-xs text-gray-500 mb-1">예금주</label><input data-field="bank_holder" class="hrd-input w-full border border-gray-200 rounded px-2 py-1.5 text-sm" disabled></div>
              </div>
            </section>

            <!-- 급여 유형 -->
            <section>
              <h4 class="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">급여 유형</h4>
              <div class="flex items-center gap-4">
                <label class="flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="pay_type" value="VARIABLE" data-field="pay_type" class="hrd-input accent-blue-600" disabled checked>
                  <span class="text-sm font-medium text-gray-700">변동급</span>
                  <span class="text-xs text-gray-400">(근태관리 O · 연장수당 O)</span>
                </label>
                <label class="flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="pay_type" value="FIXED" data-field="pay_type" class="hrd-input accent-blue-600" disabled>
                  <span class="text-sm font-medium text-gray-700">고정급</span>
                  <span class="text-xs text-gray-400">(포괄임금 · 근태관리 X · 연장수당 X)</span>
                </label>
              </div>
            </section>

            <!-- 급여 상세 (고정급) -->
            <section>
              <h4 class="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">급여 상세 — 고정 지급 항목 <span class="text-gray-400 font-normal normal-case">(매월 payroll 생성 시 기본값으로 사용)</span></h4>
              <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div><label class="block text-xs text-gray-500 mb-1">기본급 <span class="text-gray-400">(원)</span></label><input data-field="base_salary" data-money="1" type="text" inputmode="numeric" class="hrd-input w-full border border-gray-200 rounded px-2 py-1.5 text-sm text-right tabular-nums" disabled></div>
                <div><label class="block text-xs text-gray-500 mb-1">시급 <span class="text-gray-400">(원/시간제)</span></label><input data-field="hourly_rate" data-money="1" type="text" inputmode="numeric" class="hrd-input w-full border border-gray-200 rounded px-2 py-1.5 text-sm text-right tabular-nums" disabled></div>
                <div class="flex items-center gap-2 pt-5">
                  <input data-field="overtime_daily_hours" type="checkbox" id="hrdOvertimeToggle" class="hrd-input w-4 h-4 rounded" disabled>
                  <input data-field="overtime_work_days" type="hidden" value="22">
                  <label for="hrdOvertimeToggle" class="text-sm text-gray-700 cursor-pointer">고정연장 적용 <span class="text-gray-400">(아침 30분)</span></label>
                </div>
              </div>
              <div id="hrdOvertimePreview" class="mt-2"></div>
              <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
                <div><label class="block text-xs text-gray-500 mb-1">직책수당 <span class="text-gray-400">(원)</span></label><input data-field="position_allowance" data-money="1" type="text" inputmode="numeric" class="hrd-input w-full border border-gray-200 rounded px-2 py-1.5 text-sm text-right tabular-nums" disabled></div>
                <div><label class="block text-xs text-gray-500 mb-1">차량유지비 <span class="text-gray-400">(원)</span></label><input data-field="vehicle_allowance" data-money="1" type="text" inputmode="numeric" class="hrd-input w-full border border-gray-200 rounded px-2 py-1.5 text-sm text-right tabular-nums" disabled></div>
                <div><label class="block text-xs text-gray-500 mb-1">식대 <span class="text-gray-400">(원)</span></label><input data-field="meal_allowance_fixed" data-money="1" type="text" inputmode="numeric" class="hrd-input w-full border border-gray-200 rounded px-2 py-1.5 text-sm text-right tabular-nums" disabled></div>
                <div><label class="block text-xs text-gray-500 mb-1">특별상여(고정) <span class="text-gray-400">(원)</span></label><input data-field="special_bonus_fixed" data-money="1" type="text" inputmode="numeric" class="hrd-input w-full border border-gray-200 rounded px-2 py-1.5 text-sm text-right tabular-nums" disabled></div>
                <div><label class="block text-xs text-gray-500 mb-1">기타수당 <span class="text-gray-400">(원)</span></label><input data-field="other_allowance_fixed" data-money="1" type="text" inputmode="numeric" class="hrd-input w-full border border-gray-200 rounded px-2 py-1.5 text-sm text-right tabular-nums" disabled></div>
              </div>
              <p class="text-xs text-gray-400 mt-2">※ 추가근무수당은 매월 근태에 따라 변동 계산되므로 여기에 입력하지 않습니다.</p>
            </section>

            <!-- 급여 상세 (고정 공제) -->
            <section>
              <h4 class="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">고정 공제 항목</h4>
              <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div><label class="block text-xs text-gray-500 mb-1">상조회비 <span class="text-gray-400">(원)</span></label><input data-field="mutual_aid_fee" data-money="1" type="text" inputmode="numeric" class="hrd-input w-full border border-gray-200 rounded px-2 py-1.5 text-sm text-right tabular-nums" disabled></div>
                <div><label class="block text-xs text-gray-500 mb-1">기타공제 <span class="text-gray-400">(원)</span></label><input data-field="other_deduction_fixed" data-money="1" type="text" inputmode="numeric" class="hrd-input w-full border border-gray-200 rounded px-2 py-1.5 text-sm text-right tabular-nums" disabled></div>
              </div>
              <p class="text-xs text-gray-400 mt-2">※ 장기요양보험/감봉/연말정산은 payroll 생성 시 자동 또는 월별로 입력합니다.</p>
            </section>

            <!-- 세금 설정 -->
            <section>
              <h4 class="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">세금 / 부양가족 설정</h4>
              <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div><label class="block text-xs text-gray-500 mb-1">부양가족수 <span class="text-gray-400">(본인 포함)</span></label><input data-field="dependents_count" type="number" min="0" class="hrd-input w-full border border-gray-200 rounded px-2 py-1.5 text-sm text-right" disabled></div>
                <div><label class="block text-xs text-gray-500 mb-1">20세 이하 자녀수</label><input data-field="children_under_20_count" type="number" min="0" class="hrd-input w-full border border-gray-200 rounded px-2 py-1.5 text-sm text-right" disabled></div>
                <div><label class="block text-xs text-gray-500 mb-1">간이세액 적용비율</label>
                  <select data-field="income_tax_table_option" class="hrd-input w-full border border-gray-200 rounded px-2 py-1.5 text-sm" disabled>
                    <option value="80">80%</option>
                    <option value="100">100%</option>
                    <option value="120">120%</option>
                  </select>
                </div>
                <div><label class="block text-xs text-gray-500 mb-1">건강보험 등급 <span class="text-gray-400">(선택)</span></label><input data-field="insurance_grade" class="hrd-input w-full border border-gray-200 rounded px-2 py-1.5 text-sm" disabled></div>
              </div>
            </section>

            <!-- 4대보험 적용 토글 -->
            <section>
              <h4 class="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">4대보험 적용 여부</h4>
              <div class="grid grid-cols-5 gap-4">
                <label class="flex items-center gap-2 text-sm"><input type="checkbox" data-field="insurance_apply_national_pension" class="hrd-check" disabled> 국민연금</label>
                <label class="flex items-center gap-2 text-sm"><input type="checkbox" data-field="insurance_apply_health" class="hrd-check" disabled> 건강보험</label>
                <label class="flex items-center gap-2 text-sm"><input type="checkbox" data-field="insurance_apply_long_term_care" class="hrd-check" disabled> 장기요양</label>
                <label class="flex items-center gap-2 text-sm"><input type="checkbox" data-field="insurance_apply_employment" class="hrd-check" disabled> 고용보험</label>
                <label class="flex items-center gap-2 text-sm"><input type="checkbox" data-field="insurance_apply_industrial_accident" class="hrd-check" disabled> 산재보험</label>
              </div>
            </section>

            <!-- CAPS 연동 -->
            <section>
              <h4 class="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">CAPS 근태 연동</h4>
              <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div><label class="block text-xs text-gray-500 mb-1">CAPS 사이트</label>
                  <select data-field="caps_site_id" class="hrd-input w-full border border-gray-200 rounded px-2 py-1.5 text-sm" disabled>
                    <option value="">— 미설정 —</option>
                    <option value="DJ">대전 (DJ)</option>
                    <option value="SM">선명 (SM)</option>
                  </select>
                </div>
                <div><label class="block text-xs text-gray-500 mb-1">CAPS 번호</label><input data-field="caps_id" class="hrd-input w-full border border-gray-200 rounded px-2 py-1.5 text-sm" placeholder="ACServer fpid" disabled></div>
                <div class="flex items-end">
                  <label class="flex items-center gap-2 text-sm"><input type="checkbox" data-field="caps_sync_enabled" class="hrd-check" disabled> CAPS 동기화 대상</label>
                </div>
              </div>
            </section>
          </div>
        </div>

        <!-- ============================================================ -->
        <!-- 근태 영역 (직원 상세 정보와 분리)                              -->
        <!-- ============================================================ -->
        <div class="pt-2">
          <div class="flex items-center gap-2 mb-3">
            <div class="h-px flex-1 bg-gray-200"></div>
            <h3 class="text-xs font-bold text-gray-500 uppercase tracking-wider">
              <i class="fas fa-calendar-check text-blue-600 mr-1"></i>근태 이력
            </h3>
            <div class="h-px flex-1 bg-gray-200"></div>
          </div>

          <div class="space-y-4">
            <!-- 월 선택 -->
            <div class="bg-white rounded-lg border border-gray-200 p-4 flex items-center gap-3 shadow-sm">
              <label class="text-sm font-semibold text-gray-900">조회 월</label>
              <input id="hrdMonth" type="month" class="border border-gray-300 rounded px-3 py-2 text-sm focus:border-gray-400 focus:shadow-[0_0_0_3px_rgba(156,163,175,0.15)] focus:outline-none" />
              <button onclick="hrdLoadDetail()" class="px-4 py-2 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700 transition-colors">
                <i class="fas fa-search mr-1"></i>검색
              </button>
            </div>

            <!-- 근태 요약 카드 -->
            <div class="grid grid-cols-5 gap-2">
              <div class="bg-white rounded-lg border p-2.5 text-center shadow-sm hover:shadow-md transition-shadow">
                <div class="text-xl font-bold tabular-nums text-gray-900" id="hrdTotalDays">-</div>
                <div class="text-[10px] text-gray-400 mt-0.5">근무일수</div>
              </div>
              <div class="bg-white rounded-lg border p-2.5 text-center shadow-sm hover:shadow-md transition-shadow">
                <div class="text-xl font-bold tabular-nums text-gray-900" id="hrdTotalHours">-</div>
                <div class="text-[10px] text-gray-400 mt-0.5">근무시간(h)</div>
              </div>
              <div class="bg-white rounded-lg border p-2.5 text-center shadow-sm hover:shadow-md transition-shadow">
                <div class="text-xl font-bold tabular-nums text-gray-900" id="hrdOtHours">-</div>
                <div class="text-[10px] text-gray-400 mt-0.5">연장근무(h)</div>
              </div>
              <div class="bg-white rounded-lg border p-2.5 text-center shadow-sm hover:shadow-md transition-shadow">
                <div class="text-xl font-bold tabular-nums text-gray-900" id="hrdLateCount">-</div>
                <div class="text-[10px] text-gray-400 mt-0.5">지각 횟수</div>
              </div>
              <div class="bg-white rounded-lg border border-red-200 p-2.5 text-center shadow-sm hover:shadow-md transition-shadow">
                <div class="text-xl font-bold text-red-600 tabular-nums" id="hrdAbsentDays">-</div>
                <div class="text-[10px] text-red-500 font-medium mt-0.5">결근 일수</div>
              </div>
            </div>

            <!-- 근태 달력 -->
            <div class="bg-white rounded-lg border border-gray-200 p-5 shadow-sm">
              <div class="flex items-center justify-between mb-4">
                <h3 class="text-sm font-semibold text-gray-900">
                  <i class="fas fa-calendar-alt text-blue-600 mr-1"></i>
                  월별 근태 달력
                </h3>
                <div class="flex items-center gap-3 text-[11px] text-gray-500">
                  <span class="inline-flex items-center gap-1"><span class="inline-block w-2.5 h-2.5 rounded-sm bg-green-50 border border-green-200"></span>정상</span>
                  <span class="inline-flex items-center gap-1"><span class="inline-block w-2.5 h-2.5 rounded-sm bg-amber-50 border border-amber-200"></span>지각/조퇴</span>
                  <span class="inline-flex items-center gap-1"><span class="inline-block w-2.5 h-2.5 rounded-sm bg-red-50 border border-red-200"></span>결근</span>
                  <span class="inline-flex items-center gap-1"><span class="inline-block w-2.5 h-2.5 rounded-sm bg-blue-50 border border-blue-200"></span>연차</span>
                  <span class="inline-flex items-center gap-1"><span class="inline-block w-2.5 h-2.5 rounded-sm bg-gray-100 border border-gray-200"></span>휴일</span>
                </div>
              </div>
              <div id="hrdCalendar" class="grid grid-cols-7 gap-2 bg-gray-50 p-2 rounded-md border border-gray-200"></div>
            </div>
          </div>
        </div>

        <!-- 급여 이력 -->
        <div class="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div class="px-5 py-3 border-b border-gray-200 flex items-center justify-between">
            <h3 class="text-sm font-semibold text-gray-700">
              <i class="fas fa-money-bill-wave text-blue-600 mr-1"></i>
              연간 급여 이력
            </h3>
            <div class="text-xs text-gray-500">
              합계: <span id="hrdPaySum">-</span>
            </div>
          </div>
          <div class="overflow-x-auto">
            <table class="w-full text-sm ds-table-striped">
              <thead class="bg-gray-50 text-xs text-gray-600 uppercase tracking-wider">
                <tr>
                  <th class="px-4 py-2 text-left">귀속월</th>
                  <th class="px-4 py-2 text-right">기본급</th>
                  <th class="px-4 py-2 text-right">연장(h)</th>
                  <th class="px-4 py-2 text-right">연장급여</th>
                  <th class="px-4 py-2 text-right">총급여</th>
                  <th class="px-4 py-2 text-right">공제</th>
                  <th class="px-4 py-2 text-right">실지급</th>
                  <th class="px-4 py-2 text-center">상태</th>
                </tr>
              </thead>
              <tbody id="hrdPayBody">
                <tr><td colspan="8" class="text-center py-8 text-gray-400">급여 데이터 로드 중...</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `,
    pageScript,
  })
}
