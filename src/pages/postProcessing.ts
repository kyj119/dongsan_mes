import type { Context } from 'hono'
import type { HonoEnv } from '../types/env'
import { renderPage } from '../layout'
import pageScript from '../scripts/postProcessing.js?raw'

export function postProcessingPage(c: Context<HonoEnv>) {
  return renderPage(c, {
    title: '후가공 관리',
    activePage: '/post-processing',
    pageContent: `
        <div class="container mx-auto px-4 py-6">
            <!-- 탭 네비게이션 -->
            <div class="flex gap-1 mb-4 border-b">
                <button onclick="switchTab('list')" id="tab-list" class="px-4 py-2 text-sm font-medium border-b-2 border-pink-600 text-pink-700">후가공 관리</button>
                <button onclick="switchTab('finishing')" id="tab-finishing" class="px-4 py-2 text-sm font-medium border-b-2 border-transparent text-gray-500 hover:text-gray-700">마감 방식</button>
                <button onclick="switchTab('stats')" id="tab-stats" class="px-4 py-2 text-sm font-medium border-b-2 border-transparent text-gray-500 hover:text-gray-700">사용 통계</button>
            </div>

            <!-- 탭1: 후가공 관리 -->
            <div id="panel-list">
                <div class="flex justify-between items-center mb-4">
                    <h2 class="text-xl font-bold">후가공 종류 목록</h2>
                    <button onclick="openAddModal()" class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
                        <i class="fas fa-plus mr-2"></i>후가공 추가
                    </button>
                </div>
                <div class="bg-white rounded-lg shadow overflow-x-auto">
                    <table class="w-full text-sm ds-table-striped">
                        <thead class="bg-gray-50 border-b">
                            <tr>
                                <th class="px-4 py-3 text-left">코드</th>
                                <th class="px-4 py-3 text-left">이름</th>
                                <th class="px-4 py-3 text-left">단가 방식</th>
                                <th class="px-4 py-3 text-left">파라미터</th>
                                <th class="px-4 py-3 text-left">여백 (상/하/좌/우 cm)</th>
                                <th class="px-4 py-3 text-left">적용 소분류</th>
                                <th class="px-4 py-3 text-center">상태</th>
                                <th class="px-4 py-3 text-center" title="현장 카드에 표시 여부">카드</th>
                                <th class="px-4 py-3 text-center">관리</th>
                            </tr>
                        </thead>
                        <tbody id="ppTableBody">
                            <tr><td colspan="9" class="text-center py-8 text-gray-400">로딩 중...</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>

            <!-- 탭2: 사용 통계 -->
            <div id="panel-stats" class="hidden">
                <div class="flex justify-between items-center mb-4">
                    <h2 class="text-xl font-bold">후가공 사용 통계</h2>
                    <select id="statsMonths" onchange="loadStats()" class="border rounded px-3 py-2 text-sm">
                        <option value="3">최근 3개월</option>
                        <option value="6" selected>최근 6개월</option>
                        <option value="12">최근 12개월</option>
                    </select>
                </div>

                <!-- 전체 누적 통계 -->
                <div class="bg-white rounded-lg shadow p-4 mb-4">
                    <h3 class="font-bold text-gray-700 mb-3"><i class="fas fa-chart-bar mr-2 text-pink-500"></i>전체 누적 통계</h3>
                    <div class="overflow-x-auto" style="max-height: calc(100vh - 280px); overflow-y: auto;">
                        <table class="w-full text-sm ds-table-striped">
                            <thead class="bg-gray-50 border-b">
                                <tr>
                                    <th class="px-4 py-2 text-left">후가공</th>
                                    <th class="px-4 py-2 text-right">적용 건수</th>
                                    <th class="px-4 py-2 text-right">수량 합계</th>
                                    <th class="px-4 py-2 text-right">면적 합계</th>
                                    <th class="px-4 py-2 text-right">주문 수</th>
                                    <th class="px-4 py-2 text-right">거래처 수</th>
                                    <th class="px-4 py-2 text-left">비율</th>
                                </tr>
                            </thead>
                            <tbody id="totalStatsBody">
                                <tr><td colspan="7" class="text-center py-6 text-gray-400">로딩 중...</td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>

                <!-- 월별 추이 -->
                <div class="bg-white rounded-lg shadow p-4 mb-4">
                    <h3 class="font-bold text-gray-700 mb-3"><i class="fas fa-calendar-alt mr-2 text-blue-500"></i>월별 추이</h3>
                    <div id="monthlyChart" class="overflow-x-auto"></div>
                </div>

                <!-- 소분류별 통계 -->
                <div class="bg-white rounded-lg shadow p-4">
                    <h3 class="font-bold text-gray-700 mb-3"><i class="fas fa-layer-group mr-2 text-green-500"></i>소분류별 후가공 사용 빈도</h3>
                    <div id="subcatStatsBody" class="space-y-3">
                        <p class="text-center py-6 text-gray-400">로딩 중...</p>
                    </div>
                </div>
            </div>

            <!-- 마감 방식 탭 -->
            <div id="panel-finishing" class="hidden">
                <div class="grid grid-cols-2 gap-6">
                    <!-- 마감 방식 목록 -->
                    <div class="bg-white rounded-lg shadow-sm border p-4">
                        <div class="flex items-center justify-between mb-3">
                            <h2 class="text-lg font-bold">마감 방식</h2>
                            <button onclick="showFinMethodModal()" class="px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700">
                                <i class="fas fa-plus mr-1"></i>추가
                            </button>
                        </div>
                        <div id="finMethodList" class="space-y-2">로딩 중...</div>
                    </div>
                    <!-- 프리셋 -->
                    <div class="bg-white rounded-lg shadow-sm border p-4">
                        <div class="flex items-center justify-between mb-3">
                            <h2 class="text-lg font-bold">프리셋</h2>
                            <button onclick="showFinPresetModal()" class="px-3 py-1.5 text-xs bg-green-600 text-white rounded hover:bg-green-700">
                                <i class="fas fa-plus mr-1"></i>추가
                            </button>
                        </div>
                        <div id="finPresetList" class="space-y-2">로딩 중...</div>
                    </div>
                </div>

                <!-- 방식 모달 -->
                <div id="finMethodModal" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 hidden">
                    <div class="bg-white rounded-lg shadow-xl w-full max-w-sm mx-4">
                        <div class="flex justify-between items-center p-4 border-b">
                            <h3 id="finMethodTitle" class="text-lg font-bold">마감 방식</h3>
                            <button onclick="document.getElementById('finMethodModal').classList.add('hidden')" class="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
                        </div>
                        <div class="p-6 space-y-3">
                            <input type="hidden" id="finMethodId">
                            <div><label class="block text-sm font-medium mb-1">이름 *</label>
                                <input id="finMethodName" type="text" class="w-full border rounded px-3 py-2 text-sm" placeholder="예: 접어미싱"></div>
                            <div><label class="block text-sm font-medium mb-1">여백 (cm)</label>
                                <input id="finMethodMargin" type="number" step="0.1" min="0" value="0" class="w-full border rounded px-3 py-2 text-sm"></div>
                            <div><label class="block text-sm font-medium mb-1">설명</label>
                                <input id="finMethodDesc" type="text" class="w-full border rounded px-3 py-2 text-sm"></div>
                        </div>
                        <div class="flex justify-end gap-2 p-4 border-t">
                            <button onclick="document.getElementById('finMethodModal').classList.add('hidden')" class="px-4 py-2 border rounded">취소</button>
                            <button onclick="saveFinMethod()" class="px-4 py-2 bg-blue-600 text-white rounded">저장</button>
                        </div>
                    </div>
                </div>
                <!-- 프리셋 모달 -->
                <div id="finPresetModal" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 hidden">
                    <div class="bg-white rounded-lg shadow-xl w-full max-w-sm mx-4">
                        <div class="flex justify-between items-center p-4 border-b">
                            <h3 id="finPresetTitle" class="text-lg font-bold">프리셋</h3>
                            <button onclick="document.getElementById('finPresetModal').classList.add('hidden')" class="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
                        </div>
                        <div class="p-6 space-y-3">
                            <input type="hidden" id="finPresetId">
                            <div><label class="block text-sm font-medium mb-1">이름 *</label>
                                <input id="finPresetName" type="text" class="w-full border rounded px-3 py-2 text-sm" placeholder="예: 사방 접어미싱"></div>
                            <div class="grid grid-cols-2 gap-2">
                                <div><label class="text-xs text-gray-500">상</label><select id="finPreTop" class="w-full border rounded px-2 py-1.5 text-sm"></select></div>
                                <div><label class="text-xs text-gray-500">하</label><select id="finPreBot" class="w-full border rounded px-2 py-1.5 text-sm"></select></div>
                                <div><label class="text-xs text-gray-500">좌</label><select id="finPreLeft" class="w-full border rounded px-2 py-1.5 text-sm"></select></div>
                                <div><label class="text-xs text-gray-500">우</label><select id="finPreRight" class="w-full border rounded px-2 py-1.5 text-sm"></select></div>
                            </div>
                            <button type="button" onclick="finPreApplyAll()" class="text-xs text-blue-600 hover:underline">상단 값을 사방 동일 적용</button>
                        </div>
                        <div class="flex justify-end gap-2 p-4 border-t">
                            <button onclick="document.getElementById('finPresetModal').classList.add('hidden')" class="px-4 py-2 border rounded">취소</button>
                            <button onclick="saveFinPreset()" class="px-4 py-2 bg-green-600 text-white rounded">저장</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- 추가/수정 모달 -->
        <div id="ppModal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 hidden">
            <div class="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-screen overflow-y-auto mx-4">
                <div class="flex justify-between items-center p-4 border-b">
                    <h3 id="modalTitle" class="text-lg font-bold">후가공 추가</h3>
                    <button onclick="closeModal()" class="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
                </div>
                <div class="p-6 space-y-4">
                    <input type="hidden" id="editId">

                    <!-- 빠른 시작 프리셋 -->
                    <div id="presetSection" class="bg-blue-50 border border-blue-200 rounded-lg p-3">
                        <p class="text-xs font-medium text-blue-700 mb-2"><i class="fas fa-bolt mr-1"></i>빠른 시작 (프리셋 선택)</p>
                        <div class="flex flex-wrap gap-2">
                            <button type="button" onclick="applyPreset('HOLE_PUNCH')" class="px-3 py-1.5 bg-white border border-blue-300 rounded text-sm hover:bg-blue-100 font-medium text-gray-700"><i class="fas fa-dot-circle mr-1 text-blue-600"></i>타공</button>
                            <button type="button" onclick="applyPreset('STRAP_LOOP')" class="px-3 py-1.5 bg-white border border-blue-300 rounded text-sm hover:bg-blue-100 font-medium text-gray-700"><i class="fas fa-link mr-1 text-blue-600"></i>끈고리/리벳</button>
                            <button type="button" onclick="applyPreset('MARGIN_ADD')" class="px-3 py-1.5 bg-white border border-blue-300 rounded text-sm hover:bg-blue-100 font-medium text-gray-700"><i class="fas fa-ruler-combined mr-1 text-blue-600"></i>여백추가</button>
                            <button type="button" onclick="applyPreset('DOMBO_MARK')" class="px-3 py-1.5 bg-white border border-blue-300 rounded text-sm hover:bg-blue-100 font-medium text-gray-700"><i class="fas fa-bullseye mr-1 text-blue-600"></i>돔보마크</button>
                            <button type="button" onclick="applyPreset('CUT_LINE')" class="px-3 py-1.5 bg-white border border-blue-300 rounded text-sm hover:bg-blue-100 font-medium text-gray-700"><i class="fas fa-cut mr-1 text-blue-600"></i>재단라인</button>
                        </div>
                    </div>

                    <!-- 기본 정보 -->
                    <div class="grid grid-cols-2 gap-4">
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">코드 <span class="text-red-500">*</span></label>
                            <input id="fCode" type="text" placeholder="예: HOLE_PUNCH" class="w-full border rounded px-3 py-2 text-sm uppercase" oninput="this.value=this.value.toUpperCase()">
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">이름 <span class="text-red-500">*</span></label>
                            <input id="fName" type="text" placeholder="예: 타공" class="w-full border rounded px-3 py-2 text-sm">
                        </div>
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">설명</label>
                        <input id="fDesc" type="text" placeholder="선택 입력" class="w-full border rounded px-3 py-2 text-sm">
                    </div>

                    <!-- 단가 설정 -->
                    <div class="border-t pt-4">
                        <p class="font-medium text-gray-700 mb-3">단가 설정</p>
                        <div class="grid grid-cols-2 gap-4">
                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-1">단가 방식</label>
                                <select id="fPricingType" onchange="onPricingTypeChange()" class="w-full border rounded px-3 py-2 text-sm">
                                    <option value="fixed">고정 금액</option>
                                    <option value="per_count">개수 × 단가</option>
                                    <option value="per_length">여백 합계 cm × 단가</option>
                                    <option value="per_sqm">면적(sqm)×단가</option>
                                    <option value="per_meter">둘레(m)×단가</option>
                                    <option value="per_unit">수량×단가</option>
                                </select>
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-1">
                                    <span id="priceLabel">추가 금액 (원)</span>
                                    <span class="text-xs text-gray-400 ml-1">(음수=차감)</span>
                                </label>
                                <input id="fPrice" type="number" step="1" value="0" class="w-full border rounded px-3 py-2 text-sm">
                            </div>
                        </div>
                    </div>

                    <!-- 여백 기본값 (IllustratorAutomat 연동) -->
                    <div class="border-t pt-4">
                        <p class="font-medium text-gray-700 mb-1">기본 여백 <span class="text-xs text-gray-500">(IllustratorAutomat 자동 확장용, cm)</span></p>
                        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                            <div><label class="text-xs text-gray-600">상</label><input id="fMarginTop" type="number" step="0.1" min="0" max="15" value="0" class="w-full border rounded px-2 py-1 text-sm"></div>
                            <div><label class="text-xs text-gray-600">하</label><input id="fMarginBottom" type="number" step="0.1" min="0" max="15" value="0" class="w-full border rounded px-2 py-1 text-sm"></div>
                            <div><label class="text-xs text-gray-600">좌</label><input id="fMarginLeft" type="number" step="0.1" min="0" max="15" value="0" class="w-full border rounded px-2 py-1 text-sm"></div>
                            <div><label class="text-xs text-gray-600">우</label><input id="fMarginRight" type="number" step="0.1" min="0" max="15" value="0" class="w-full border rounded px-2 py-1 text-sm"></div>
                        </div>
                    </div>

                    <!-- 적용 소분류 -->
                    <div class="border-t pt-4">
                        <p class="font-medium text-gray-700 mb-2">적용 소분류 <span class="text-xs text-gray-400">(선택된 소분류로 주문 시 후가공 항목 표시)</span></p>
                        <div id="subcatCheckboxes" class="space-y-2">
                            <p class="text-sm text-gray-400">로딩 중...</p>
                        </div>
                    </div>

                    <!-- 주문 시 입력 항목 설정 -->
                    <div class="border-t pt-4">
                        <div class="flex justify-between items-center mb-3">
                            <div>
                                <p class="font-medium text-gray-700">주문 시 입력 항목 설정</p>
                                <p class="text-xs text-gray-400">주문 생성 시 현장에서 입력하는 값 (위치, 개수 등)</p>
                            </div>
                            <button type="button" onclick="addParamField()" class="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700">
                                <i class="fas fa-plus mr-1"></i>항목 추가
                            </button>
                        </div>
                        <div id="paramFields" class="space-y-3">
                            <!-- 동적으로 추가됨 -->
                        </div>
                        <p id="noParamsMsg" class="text-sm text-gray-400 text-center py-3">입력 항목 없음 (비용만 고정으로 발생)</p>
                    </div>
                </div>
                <div class="flex justify-end gap-3 p-4 border-t">
                    <button onclick="closeModal()" class="px-4 py-2 border rounded hover:bg-gray-50">취소</button>
                    <button onclick="savePP()" class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">저장</button>
                </div>
            </div>
        </div>
    `,
    pageScript,
  })
}
