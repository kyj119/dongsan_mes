import type { Context } from 'hono'
import type { HonoEnv } from '../types/env'
import { renderPage } from '../layout'
import pageScript from '../scripts/items.js?raw'

export function itemsPage(c: Context<HonoEnv>) {
  return renderPage(c, {
    title: '품목 관리',
    activePage: '/items',
    pageContent: `
        <div class="container mx-auto px-4 py-8">
            <!-- 메인 탭 (7탭) -->
            <div class="flex border-b border-gray-200 mb-4 overflow-x-auto">
                <button class="px-4 py-2 font-medium text-sm border-b-2 border-blue-600 text-blue-600 whitespace-nowrap" onclick="switchMainTab('output')" id="tabBtnOutput">출력</button>
                <button class="px-4 py-2 font-medium text-sm text-gray-500 hover:text-gray-700 border-b-2 border-transparent whitespace-nowrap" onclick="switchMainTab('transfer')" id="tabBtnTransfer">전사</button>
                <button class="px-4 py-2 font-medium text-sm text-gray-500 hover:text-gray-700 border-b-2 border-transparent whitespace-nowrap" onclick="switchMainTab('flag')" id="tabBtnFlag">태극기</button>
                <button class="px-4 py-2 font-medium text-sm text-gray-500 hover:text-gray-700 border-b-2 border-transparent whitespace-nowrap" onclick="switchMainTab('sign')" id="tabBtnSign">간판</button>
                <button class="px-4 py-2 font-medium text-sm text-gray-500 hover:text-gray-700 border-b-2 border-transparent whitespace-nowrap" onclick="switchMainTab('goods')" id="tabBtnGoods">상품</button>
                <button class="px-4 py-2 font-medium text-sm text-gray-500 hover:text-gray-700 border-b-2 border-transparent whitespace-nowrap" onclick="switchMainTab('rawMaterial')" id="tabBtnRawMaterial">원자재</button>
                <button class="px-4 py-2 font-medium text-sm text-gray-500 hover:text-gray-700 border-b-2 border-transparent whitespace-nowrap" onclick="switchMainTab('settings')" id="tabBtnSettings">설정</button>
            </div>

            <!-- 출력 탭 -->
            <div id="tabOutput">
                <div class="bg-white rounded-lg shadow-sm border p-4">
                    <div class="flex items-center justify-between mb-3">
                        <div class="flex items-center gap-3">
                            <h3 class="text-lg font-bold">출력 품목</h3>
                            <div class="flex gap-1">
                                <button onclick="filterOutputItems('')" class="output-filter-btn px-2 py-1 text-xs rounded bg-blue-600 text-white">전체</button>
                                <button onclick="filterOutputItems('AQ')" class="output-filter-btn px-2 py-1 text-xs rounded bg-gray-200 text-gray-700 hover:bg-gray-300">수성</button>
                                <button onclick="filterOutputItems('SL')" class="output-filter-btn px-2 py-1 text-xs rounded bg-gray-200 text-gray-700 hover:bg-gray-300">솔벤</button>
                                <button onclick="filterOutputItems('UV')" class="output-filter-btn px-2 py-1 text-xs rounded bg-gray-200 text-gray-700 hover:bg-gray-300">UV</button>
                                <button onclick="filterOutputItems('FB')" class="output-filter-btn px-2 py-1 text-xs rounded bg-gray-200 text-gray-700 hover:bg-gray-300">평판</button>
                            </div>
                        </div>
                        <div class="flex items-center gap-2">
                            <input type="text" id="outputSearch" placeholder="품목명/코드 검색..." class="w-48 px-3 py-1.5 border rounded text-sm" oninput="debouncedLoadOutput()">
                            <span class="text-sm text-gray-500" id="outputItemCount"></span>
                        </div>
                    </div>
                    <div id="outputItemsList"></div>
                </div>
            </div>

            <!-- 전사 탭 -->
            <div id="tabTransfer" class="hidden">
                <div class="bg-white rounded-lg shadow-sm border p-4">
                    <div class="flex items-center justify-between mb-3">
                        <h3 class="text-lg font-bold">전사</h3>
                        <div class="flex gap-2">
                            <input type="text" id="transferSearch" placeholder="검색..." class="w-48 px-3 py-1.5 border rounded text-sm" oninput="debouncedLoadTab('transfer')">
                            <button onclick="showCreateModalForTab('transfer')" class="px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700">
                                <i class="fas fa-plus mr-1"></i>추가
                            </button>
                        </div>
                    </div>
                    <div id="transferItemsList"></div>
                </div>
            </div>

            <!-- 태극기 탭 -->
            <div id="tabFlag" class="hidden">
                <div class="bg-white rounded-lg shadow-sm border p-4">
                    <div class="flex items-center justify-between mb-3">
                        <h3 class="text-lg font-bold">태극기</h3>
                        <div class="flex gap-2">
                            <input type="text" id="flagSearch" placeholder="검색..." class="w-48 px-3 py-1.5 border rounded text-sm" oninput="debouncedLoadTab('flag')">
                            <button onclick="showCreateModalForTab('flag')" class="px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700">
                                <i class="fas fa-plus mr-1"></i>추가
                            </button>
                        </div>
                    </div>
                    <div id="flagItemsList"></div>
                </div>
            </div>

            <!-- 간판 탭 -->
            <div id="tabSign" class="hidden">
                <div class="bg-white rounded-lg shadow-sm border p-4">
                    <div class="flex items-center justify-between mb-3">
                        <h3 class="text-lg font-bold">간판</h3>
                        <div class="flex gap-2">
                            <input type="text" id="signSearch" placeholder="검색..." class="w-48 px-3 py-1.5 border rounded text-sm" oninput="debouncedLoadTab('sign')">
                            <button onclick="showCreateModalForTab('sign')" class="px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700">
                                <i class="fas fa-plus mr-1"></i>추가
                            </button>
                        </div>
                    </div>
                    <div id="signItemsList"></div>
                </div>
            </div>

            <!-- 상품 탭 -->
            <div id="tabGoods" class="hidden">
                <div class="bg-white rounded-lg shadow-sm border p-4">
                    <div class="flex items-center justify-between mb-3">
                        <h3 class="text-lg font-bold">상품</h3>
                        <div class="flex gap-2">
                            <input type="text" id="goodsSearch" placeholder="검색..." class="w-48 px-3 py-1.5 border rounded text-sm" oninput="debouncedLoadTab('goods')">
                            <button onclick="showCreateModalForTab('goods')" class="px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700">
                                <i class="fas fa-plus mr-1"></i>추가
                            </button>
                        </div>
                    </div>
                    <div id="goodsItemsList"></div>
                </div>
            </div>

            <!-- 원자재 탭 -->
            <div id="tabRawMaterial" class="hidden">
                <div class="bg-white rounded-lg shadow-sm border p-4">
                    <div class="flex items-center justify-between mb-3">
                        <h3 class="text-lg font-bold">원자재</h3>
                        <div class="flex gap-2">
                            <select id="rmSubCatFilter" class="px-3 py-1.5 border rounded text-sm" onchange="loadTabItems('rawMaterial')">
                                <option value="">전체 분류</option>
                                <option value="RM-F">원단류</option>
                                <option value="RM-P">판재류</option>
                                <option value="RM-S">시트류</option>
                                <option value="RM-I">잉크</option>
                                <option value="RM-T">전사자재</option>
                                <option value="RM-G">간판자재</option>
                                <option value="RM-B">부자재</option>
                                <option value="RM-E">배너대</option>
                            </select>
                            <select id="rmMediaFilter" class="px-3 py-1.5 border rounded text-sm" onchange="loadTabItems('rawMaterial')">
                                <option value="">소재 연결: 전체</option>
                                <option value="linked">연결됨</option>
                                <option value="unlinked">미연결</option>
                            </select>
                            <input type="text" id="rmSearch" placeholder="검색..." class="w-48 px-3 py-1.5 border rounded text-sm" oninput="debouncedLoadTab('rawMaterial')">
                            <button onclick="showCreateModalForTab('rawMaterial')" class="px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700">
                                <i class="fas fa-plus mr-1"></i>추가
                            </button>
                        </div>
                    </div>
                    <div id="rmItemsList"></div>
                </div>
            </div>

            <!-- 설정 탭 (기존 출력방식·소재 내용) -->
            <div id="tabSettings" class="hidden">
                <!-- 출력방식 단가 -->
                <div class="bg-white rounded-lg shadow-sm border p-4 mb-4">
                    <h3 class="text-sm font-semibold text-gray-700 mb-3">출력방식 단가</h3>
                    <div id="printMethodsList" class="space-y-2">
                        <div class="text-center py-4 text-gray-400 text-sm"><i class="fas fa-spinner fa-spin mr-1"></i>로딩 중...</div>
                    </div>
                </div>

                <!-- 소재 관리 -->
                <div class="bg-white rounded-lg shadow-sm border p-4">
                    <div class="flex items-center justify-between mb-3">
                        <h3 class="text-sm font-semibold text-gray-700">소재 관리</h3>
                        <div class="flex gap-2">
                            <button onclick="showMediaBulkAddModal()" class="px-3 py-1.5 text-xs bg-green-600 text-white rounded hover:bg-green-700">일괄 추가</button>
                            <button onclick="showMediaAddModal()" class="px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700">소재 추가</button>
                        </div>
                    </div>
                    <div id="printMediaList" class="space-y-3">
                        <div class="text-center py-4 text-gray-400 text-sm"><i class="fas fa-spinner fa-spin mr-1"></i>로딩 중...</div>
                    </div>
                </div>
            </div>

            <!-- 카테고리 필터 (그룹 편집 모달에서 참조, 화면에 표시 안 함) -->
            <select id="itemCategoryFilter" class="hidden">
                <option value="">전체 카테고리</option>
            </select>

        <!-- 소재 추가 모달 -->
        <div id="mediaAddModal" class="hidden fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60]">
            <div class="bg-white rounded-lg shadow-xl max-w-lg w-full mx-4 max-h-screen overflow-y-auto">
                <div class="p-4 border-b flex justify-between items-center">
                    <h2 class="text-lg font-bold" id="mediaModalTitle">소재 추가</h2>
                    <button onclick="closeMediaAddModal()" class="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
                </div>
                <div class="p-6 space-y-4">
                    <input type="hidden" id="mediaEditId">
                    <div>
                        <label class="block text-sm font-semibold text-gray-700 mb-1">소재명 <span class="text-red-500">*</span></label>
                        <input type="text" id="mediaName" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" placeholder="예: 백색 솔벤트 720">
                    </div>
                    <div class="grid grid-cols-2 gap-4">
                        <div>
                            <label class="block text-sm font-semibold text-gray-700 mb-1">소재 유형 <span class="text-red-500">*</span></label>
                            <select id="mediaType" onchange="toggleMediaSpecFields()" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                                <option value="ROLL">롤</option>
                                <option value="SHEET">판재</option>
                            </select>
                        </div>
                        <div>
                            <label class="block text-sm font-semibold text-gray-700 mb-1">단가 (원/㎡)</label>
                            <input type="text" inputmode="numeric" data-money id="mediaPrice" value="0" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                        </div>
                    </div>
                    <div id="mediaRollFields">
                        <label class="block text-sm font-semibold text-gray-700 mb-1">롤 폭 (cm)</label>
                        <input type="number" id="mediaRollWidth" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" placeholder="예: 160">
                    </div>
                    <div id="mediaSheetFields" class="hidden">
                        <label class="block text-sm font-semibold text-gray-700 mb-1">판 규격 (cm, 복수 가능)</label>
                        <div id="mediaSheetSizesList" class="space-y-1"></div>
                        <button type="button" onclick="addMediaSheetSizeRow()" class="mt-1 text-xs text-blue-600 hover:text-blue-800"><i class="fas fa-plus mr-1"></i>규격 추가</button>
                    </div>
                    <div>
                        <label class="block text-sm font-semibold text-gray-700 mb-1">소재 그룹</label>
                        <input type="text" id="mediaGroup" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" placeholder="예: 솔벤트 미디어">
                    </div>
                    <div>
                        <label class="block text-sm font-semibold text-gray-700 mb-1">후가공 소분류</label>
                        <select id="mediaSubcategory" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                            <option value="">미지정</option>
                        </select>
                        <p class="text-xs text-gray-400 mt-1">출력품목의 후가공 옵션 연결에 사용됩니다</p>
                    </div>
                    <div>
                        <label class="block text-sm font-semibold text-gray-700 mb-1">사용 출력방식</label>
                        <div id="mediaMethodCheckboxes" class="flex flex-wrap gap-2 mt-1">
                            <span class="text-gray-400 text-xs">로딩 중...</span>
                        </div>
                    </div>
                    <!-- 연결 원자재 (수정 시만 표시) -->
                    <div id="mediaRMSection" class="hidden">
                        <label class="block text-sm font-semibold text-gray-700 mb-1">연결된 원자재</label>
                        <div id="mediaRMList" class="space-y-1 text-xs"></div>
                        <button type="button" onclick="navigateToRMAdd()" class="mt-1 text-xs text-blue-600 hover:text-blue-800">
                            <i class="fas fa-plus mr-1"></i>원자재 추가 (원자재 탭으로 이동)
                        </button>
                    </div>
                    <div class="flex gap-2 pt-2">
                        <button onclick="saveMedia()" class="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm">저장</button>
                        <button onclick="closeMediaAddModal()" class="px-4 py-2 border border-gray-300 text-gray-700 bg-white rounded-lg hover:bg-gray-50 text-sm">취소</button>
                    </div>
                </div>
            </div>
        </div>

        <!-- 소재 일괄 추가 모달 -->
        <div id="mediaBulkAddModal" class="hidden fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div class="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
                <div class="p-4 border-b flex justify-between items-center">
                    <h2 class="text-lg font-bold">소재 일괄 추가 (교차 생성)</h2>
                    <button onclick="closeMediaBulkAddModal()" class="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
                </div>
                <div class="p-6 space-y-4">
                    <p class="text-sm text-gray-500">축(두께, 색상 등)의 교차곱으로 소재를 한번에 생성합니다.</p>
                    <div class="grid grid-cols-2 gap-4">
                        <div>
                            <label class="block text-sm font-semibold text-gray-700 mb-1">기본 소재명 <span class="text-red-500">*</span></label>
                            <input type="text" id="bulkMediaBaseName" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" placeholder="예: 포맥스">
                        </div>
                        <div>
                            <label class="block text-sm font-semibold text-gray-700 mb-1">소재 유형</label>
                            <select id="bulkMediaType" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" onchange="onBulkMediaTypeChange()">
                                <option value="ROLL">롤</option>
                                <option value="SHEET">판재</option>
                            </select>
                        </div>
                    </div>
                    <!-- ═══ 유형별 규격 설정 ═══ -->
                    <!-- 판재: 판 규격 + RM 자동 생성 -->
                    <div id="bulkSheetSizesArea" class="hidden bg-orange-50 rounded-lg p-3">
                        <label class="block text-sm font-semibold text-gray-700 mb-1"><i class="fas fa-th-large mr-1 text-orange-500"></i>판 규격</label>
                        <div id="bulkSheetSizes" class="space-y-1"></div>
                        <button type="button" onclick="addBulkSheetSize()" class="mt-1 text-xs text-blue-600 hover:text-blue-800"><i class="fas fa-plus mr-1"></i>규격 추가</button>
                        <label class="flex items-center gap-2 text-xs text-gray-500 mt-2">
                            <input type="checkbox" id="bulkSheetRMAutoCheck" checked class="rounded">
                            판 규격별 원자재(RM) 자동 생성
                        </label>
                    </div>
                    <!-- 롤: 원단 폭 목록 + RM 자동 생성 -->
                    <div id="bulkRollWidthsArea" class="bg-cyan-50 rounded-lg p-3">
                        <label class="block text-sm font-semibold text-gray-700 mb-1"><i class="fas fa-grip-lines mr-1 text-cyan-500"></i>원단 폭 (cm)</label>
                        <div class="flex flex-wrap gap-1 min-h-[28px]" id="bulkRollWidths"></div>
                        <div class="flex gap-1 mt-1">
                            <input type="number" id="bulkRollWidthNewVal" class="w-24 px-2 py-1 border rounded text-sm" placeholder="폭(cm)"
                                   onkeydown="if(event.key==='Enter'){event.preventDefault();addBulkRollWidth()}">
                            <button type="button" onclick="addBulkRollWidth()" class="px-2 py-1 text-xs bg-gray-200 rounded hover:bg-gray-300">추가</button>
                        </div>
                        <p class="text-xs text-gray-400 mt-1">입력한 폭별로 원자재(RM)가 자동 생성됩니다</p>
                    </div>
                    <!-- ═══ 소재 변형 축 ═══ -->
                    <div class="bg-gray-50 rounded-lg p-3 space-y-3">
                        <p class="text-xs text-gray-500">두께, 색상 등 변형이 있으면 축을 추가하세요. 없으면 비워두세요.</p>
                        <!-- 축1 -->
                        <div>
                            <label class="block text-xs font-semibold text-gray-600 mb-1">축1</label>
                            <div class="flex items-center gap-2 mb-1">
                                <input type="text" id="bulkAxis1Name" value="두께" class="w-24 px-2 py-1 border rounded text-sm" placeholder="축 이름">
                                <div class="flex flex-wrap gap-1 flex-1" id="bulkAxis1Values"></div>
                            </div>
                            <div class="flex gap-1">
                                <input type="text" id="bulkAxis1NewVal" class="w-24 px-2 py-1 border rounded text-sm" placeholder="값 추가" onkeydown="if(event.key==='Enter'){event.preventDefault();addBulkAxisValue(1)}">
                                <button type="button" onclick="addBulkAxisValue(1)" class="px-2 py-1 text-xs bg-gray-200 rounded hover:bg-gray-300">추가</button>
                            </div>
                        </div>
                    <!-- 축2 (색상 등, 선택) -->
                    <div>
                        <label class="block text-sm font-semibold text-gray-700 mb-1">축2 (선택)</label>
                        <input type="text" id="bulkAxis2Name" value="색상" class="w-32 px-2 py-1 border rounded text-sm mb-1" placeholder="축 이름">
                        <div class="flex flex-wrap gap-1" id="bulkAxis2Values"></div>
                        <div class="flex gap-1 mt-1">
                            <input type="text" id="bulkAxis2NewVal" class="w-24 px-2 py-1 border rounded text-sm" placeholder="값 추가" onkeydown="if(event.key==='Enter'){event.preventDefault();addBulkAxisValue(2)}">
                            <button type="button" onclick="addBulkAxisValue(2)" class="px-2 py-1 text-xs bg-gray-200 rounded hover:bg-gray-300">추가</button>
                        </div>
                    </div>
                    <!-- 단가 설정 -->
                    <div>
                        <div class="flex items-center justify-between mb-1">
                            <label class="block text-sm font-semibold text-gray-700">단가 (원/㎡)</label>
                            <label class="flex items-center gap-1 text-xs">
                                <input type="checkbox" id="bulkMatrixPrice" onchange="renderBulkPriceTable()"> 축2별 단가 다름
                            </label>
                        </div>
                        <div id="bulkPriceTable"></div>
                    </div>
                    <!-- 출력방식 -->
                    <div>
                        <label class="block text-sm font-semibold text-gray-700 mb-1">사용 출력방식</label>
                        <div id="bulkMediaMethodCheckboxes" class="flex flex-wrap gap-2 mt-1">
                            <span class="text-gray-400 text-xs">로딩 중...</span>
                        </div>
                    </div>
                    <!-- 미리보기 -->
                    <div id="bulkPreview" class="bg-gray-50 rounded-lg p-3 text-xs hidden">
                        <div class="font-semibold text-gray-600 mb-1">미리보기</div>
                        <div id="bulkPreviewContent"></div>
                    </div>
                    <div class="flex gap-2 pt-2">
                        <button onclick="previewBulkMedia()" class="px-4 py-2 border border-blue-300 text-blue-700 bg-blue-50 rounded-lg hover:bg-blue-100 text-sm">미리보기</button>
                        <button onclick="saveBulkMedia()" class="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm">일괄 생성</button>
                        <button onclick="closeMediaBulkAddModal()" class="px-4 py-2 border border-gray-300 text-gray-700 bg-white rounded-lg hover:bg-gray-50 text-sm">취소</button>
                    </div>
                </div>
            </div>
        </div>
        </div>
        </div>

        <!-- 그룹 단가 조정 모달 -->
        <div id="groupPriceModal" class="hidden fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center" style="z-index:60">
            <div class="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
                <div class="p-4 border-b flex justify-between items-center">
                    <h2 class="text-lg font-bold" id="groupPriceTitle">그룹 단가 조정</h2>
                    <button onclick="closeGroupPriceModal()" class="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
                </div>
                <div class="p-6 space-y-4">
                    <input type="hidden" id="groupPriceName">
                    <div>
                        <label class="block text-sm font-semibold text-gray-700 mb-1">조정 방식</label>
                        <select id="groupPriceAdjustType" onchange="previewGroupPrice()" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                            <option value="PERCENT">비율 (%)</option>
                            <option value="AMOUNT">금액 (원)</option>
                        </select>
                    </div>
                    <div>
                        <label class="block text-sm font-semibold text-gray-700 mb-1">조정 값</label>
                        <input type="number" id="groupPriceValue" value="0" onchange="previewGroupPrice()" oninput="previewGroupPrice()" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" placeholder="예: 10 (10% 인상) 또는 -500 (500원 인하)">
                        <p class="text-xs text-gray-400 mt-1">양수: 인상, 음수: 인하</p>
                    </div>
                    <div id="groupPricePreview" class="hidden bg-gray-50 rounded-lg p-3 text-xs"></div>
                    <div class="flex gap-2 pt-2">
                        <button onclick="applyGroupPrice()" class="flex-1 px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 text-sm">적용</button>
                        <button onclick="closeGroupPriceModal()" class="px-4 py-2 border border-gray-300 text-gray-700 bg-white rounded-lg hover:bg-gray-50 text-sm">취소</button>
                    </div>
                </div>
            </div>
        </div>

        <!-- Price History Modal -->
        <div id="priceHistoryModal" class="hidden fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div class="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
                <div class="p-4 border-b flex justify-between items-center">
                    <h2 class="text-sm font-bold" id="priceHistoryTitle">단가 이력</h2>
                    <button onclick="closePriceHistoryModal()" class="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
                </div>
                <div id="priceHistoryBody" class="p-4 max-h-80 overflow-y-auto"></div>
            </div>
        </div>

        <!-- Create/Edit Modal -->
        <div id="itemModal" class="hidden fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div class="bg-white rounded-lg shadow-xl max-w-3xl w-full mx-4 max-h-screen overflow-y-auto">
                <div class="p-4 border-b flex justify-between items-center">
                    <h2 class="text-xl font-bold" id="modalTitle">품목 추가</h2>
                    <button onclick="closeModal()" class="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
                </div>
                <!-- 탭 -->
                <div class="border-b bg-gray-50">
                    <div class="flex">
                        <button type="button" onclick="switchModalTab('basic')" class="itemModalTab flex-1 px-4 py-3 text-sm font-medium text-gray-700 hover:text-gray-900 border-b-2 border-transparent active" data-tab="basic">
                            기본정보
                        </button>
                        <button type="button" id="materialsTabBtn" onclick="switchModalTab('materials')" class="itemModalTab flex-1 px-4 py-3 text-sm font-medium text-gray-700 hover:text-gray-900 border-b-2 border-transparent" data-tab="materials" style="display: none;">
                            사용원단
                        </button>
                    </div>
                </div>
                <!-- 폼 -->
                <div class="p-6">
                    <div id="basicTab" class="modalTabContent">
                        <form id="itemForm" onsubmit="saveItem(event)">
                            <input type="hidden" id="itemId">
                            <div class="space-y-4">
                                <!-- 0. 품목 타입 선택 -->
                                <div>
                                    <label class="block text-sm font-semibold text-gray-700 mb-2">품목 타입 <span class="text-red-500">*</span></label>
                                    <div class="flex gap-2" id="itemTypeSelector">
                                        <button type="button" onclick="selectItemType('PRODUCT')" data-type="PRODUCT"
                                            class="item-type-btn flex-1 px-4 py-3 border-2 rounded-lg text-center transition-all border-blue-600 bg-blue-50 text-blue-700">
                                            <div class="font-semibold text-sm">제품</div>
                                            <div class="text-xs mt-0.5 opacity-75">직접 생산하는 품목</div>
                                        </button>
                                        <button type="button" onclick="selectItemType('GOODS')" data-type="GOODS"
                                            class="item-type-btn flex-1 px-4 py-3 border-2 rounded-lg text-center transition-all border-gray-200 text-gray-500 hover:border-gray-400">
                                            <div class="font-semibold text-sm">상품</div>
                                            <div class="text-xs mt-0.5 opacity-75">외부 구매 후 재판매</div>
                                        </button>
                                        <button type="button" onclick="selectItemType('MATERIAL')" data-type="MATERIAL"
                                            class="item-type-btn flex-1 px-4 py-3 border-2 rounded-lg text-center transition-all border-gray-200 text-gray-500 hover:border-gray-400">
                                            <div class="font-semibold text-sm">원자재</div>
                                            <div class="text-xs mt-0.5 opacity-75">생산에 소모되는 자재</div>
                                        </button>
                                    </div>
                                    <input type="hidden" id="itemType" value="PRODUCT">
                                    <div class="mt-2 text-xs text-blue-600" id="autoCodePreview">자동 배정: PM-XXXX</div>
                                </div>

                                <!-- 1. 품목명 -->
                                <div>
                                    <label class="block text-sm font-semibold text-gray-700 mb-1">품목명 <span class="text-red-500">*</span></label>
                                    <input type="text" id="itemName" required class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                                </div>

                                <!-- 2. 규격 (모든 타입, 원자재 원단폭도 여기서 입력) -->
                                <div id="fieldSpecification">
                                    <label class="block text-sm font-semibold text-gray-700 mb-1">규격</label>
                                    <input type="text" id="itemSpecification" placeholder="예: 900x1800, 3T, 1600mm" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                                    <p id="specHint" class="text-xs text-gray-400 mt-1 hidden"></p>
                                </div>

                                <!-- 3. 단위 -->
                                <div>
                                    <label class="block text-sm font-semibold text-gray-700 mb-1">단위</label>
                                    <input type="text" id="itemUnit" value="EA" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                                </div>

                                <!-- 4. 원자재 분류 (MATERIAL만) -->
                                <div id="rmSubCategoryArea" class="hidden">
                                    <label class="block text-sm font-semibold text-gray-700 mb-1">원자재 분류 <span class="text-red-500">*</span></label>
                                    <select id="rmSubCategory" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" onchange="updateAutoCodePreview()">
                                        <option value="">선택...</option>
                                        <option value="원단류">원단류 (RM-F)</option>
                                        <option value="판재류">판재류 (RM-P)</option>
                                        <option value="시트류">시트류 (RM-S)</option>
                                        <option value="잉크">잉크 (RM-I)</option>
                                        <option value="전사자재">전사자재 (RM-T)</option>
                                        <option value="간판자재">간판자재 (RM-G)</option>
                                        <option value="부자재">부자재 (RM-B)</option>
                                        <option value="배너대">배너대 (RM-E)</option>
                                    </select>
                                </div>

                                <!-- 5. 대분류 (PRODUCT만 표시) -->
                                <div id="categoryArea">
                                    <label class="block text-sm font-semibold text-gray-700 mb-1">대분류 <span class="text-red-500">*</span></label>
                                    <select id="itemCategory" required class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" onchange="onCategoryChange()">
                                        <option value="">선택...</option>
                                    </select>
                                    <p id="categoryHint" class="text-xs text-gray-400 mt-1 hidden"></p>
                                </div>

                                <!-- 6. 소분류 — 후가공 연결 (PRODUCT만) -->
                                <div id="fieldSubCategory" class="type-field type-PRODUCT">
                                    <label class="block text-sm font-semibold text-gray-700 mb-1">소분류 <span class="text-xs text-gray-400 font-normal">(후가공 연결)</span></label>
                                    <select id="itemSubCategory" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                                        <option value="">-- 해당 없음 --</option>
                                    </select>
                                </div>

                                <!-- 7. 단가 방식 (PRODUCT만) -->
                                <div id="fieldPricingMethod" class="type-field type-PRODUCT">
                                    <label class="block text-sm font-semibold text-gray-700 mb-1">단가 방식</label>
                                    <select id="itemPricingMethod" onchange="updatePricingLabel()" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                                        <option value="FIXED">개수 단위 (단가 x 수량)</option>
                                        <option value="AREA">면적 단위 (원/㎡)</option>
                                    </select>
                                </div>

                                <!-- 8. 기본 단가 -->
                                <div>
                                    <label id="itemPriceLabel" class="block text-sm font-semibold text-gray-700 mb-1">기본 단가 (원)</label>
                                    <input type="text" inputmode="numeric" data-money id="itemPrice" value="0" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                                </div>

                                <!-- 9. 창고 구역 (GOODS/MATERIAL만) -->
                                <div id="fieldStorageZone">
                                    <label class="block text-sm font-semibold text-gray-700 mb-1">창고 구역</label>
                                    <select id="itemStorageZone" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                                        <option value="">미지정</option>
                                    </select>
                                </div>

                                <!-- 10. 연결된 소재 (MATERIAL만, 읽기전용) -->
                                <div id="parentMediaArea" class="hidden">
                                    <label class="block text-sm font-semibold text-gray-700 mb-1">연결된 소재</label>
                                    <div id="linkedMediaDisplay" class="flex flex-wrap gap-1.5 min-h-[32px] px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg">
                                        <span class="text-xs text-gray-400">저장 후 표시됩니다</span>
                                    </div>
                                    <p class="text-xs text-gray-400 mt-1">소재 관리 → 원자재 연결에서 설정합니다</p>
                                    <input type="hidden" id="parentMediaId" value="">
                                </div>

                                <!-- 11. 판매 가능 토글 (MATERIAL만) -->
                                <div id="rmSalesToggleArea" class="hidden">
                                    <label class="flex items-center gap-2 px-3 py-2 bg-amber-50 rounded-lg cursor-pointer">
                                        <input type="checkbox" id="rmSalesToggle" class="h-4 w-4 rounded">
                                        <span class="text-sm font-medium text-amber-800">판매 가능</span>
                                        <span class="text-xs text-amber-600">(주문서에서 검색 가능 — 유통 판매하는 원자재)</span>
                                    </label>
                                </div>

                                <!-- 12. 품목 그룹 -->
                                <div class="border-t pt-4 mt-4">
                                    <label class="block text-sm font-semibold text-gray-700 mb-1">품목 그룹</label>
                                    <div class="flex gap-2 items-center">
                                        <select id="itemGroupSelect" class="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" onchange="onGroupSelectChange()">
                                            <option value="">그룹 없음</option>
                                            <option value="__new__">+ 새 그룹 만들기</option>
                                        </select>
                                        <input type="number" id="itemGroupSort" value="0" min="0" placeholder="순서" class="w-20 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" title="그룹 내 정렬순서">
                                    </div>
                                    <div id="newGroupArea" class="hidden mt-2">
                                        <input type="text" id="itemGroupNew" placeholder="새 그룹명 입력..." class="w-full px-3 py-2 border border-blue-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 bg-blue-50">
                                    </div>
                                    <input type="hidden" id="itemGroup">
                                    <div id="groupMembersInfo" class="hidden mt-2 text-xs text-gray-500 bg-gray-50 rounded-lg p-2"></div>
                                </div>
                            </div>
                            <div class="mt-6 flex gap-2">
                                <button type="submit" class="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm">저장</button>
                                <button type="button" onclick="closeModal()" class="px-4 py-2 border border-gray-300 text-gray-700 bg-white rounded-lg hover:bg-gray-50 text-sm">취소</button>
                            </div>
                        </form>
                    </div>

                    <div id="materialsTab" class="modalTabContent hidden">
                        <div class="space-y-4">
                            <div class="flex gap-2">
                                <div class="flex-1 relative">
                                    <input type="text" id="materialSearch" placeholder="원단명 검색..." class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                                    <div id="materialSearchDropdown" class="hidden absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto z-10">
                                    </div>
                                </div>
                                <button type="button" onclick="showMaterialSearchDropdown()" class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm">원단 추가</button>
                            </div>
                            <div id="materialsListContainer" class="border border-gray-200 rounded-lg p-4 bg-gray-50">
                                <div class="text-center py-4 text-gray-500 text-sm"><p>로딩 중...</p></div>
                            </div>
                            <div class="flex gap-2 mt-4">
                                <button type="button" onclick="closeModal()" class="flex-1 px-4 py-2 border border-gray-300 text-gray-700 bg-white rounded-lg hover:bg-gray-50 text-sm">닫기</button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        <!-- 그룹 일괄 수정 모달 -->
        <div id="groupEditModal" class="hidden fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div class="bg-white rounded-lg shadow-xl max-w-lg w-full mx-4">
                <div class="p-4 border-b flex justify-between items-center">
                    <h2 class="text-lg font-bold" id="groupEditTitle">그룹 일괄 수정</h2>
                    <button onclick="closeGroupEditModal()" class="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
                </div>
                <div class="p-6">
                    <p class="text-sm text-gray-500 mb-4" id="groupEditDesc">이 그룹의 모든 품목에 공통 적용됩니다.</p>
                    <input type="hidden" id="groupEditName">
                    <div class="space-y-4">
                        <div>
                            <label class="flex items-center gap-2">
                                <input type="checkbox" id="groupEditCategoryCheck" class="h-4 w-4" onchange="toggleGroupField('Category')">
                                <span class="text-sm font-medium text-gray-700">대분류 변경</span>
                            </label>
                            <select id="groupEditCategory" disabled class="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-gray-50">
                                <option value="">선택...</option>
                            </select>
                        </div>
                        <div>
                            <label class="flex items-center gap-2">
                                <input type="checkbox" id="groupEditSubCategoryCheck" class="h-4 w-4" onchange="toggleGroupField('SubCategory')">
                                <span class="text-sm font-medium text-gray-700">소분류 변경</span>
                            </label>
                            <select id="groupEditSubCategory" disabled class="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-gray-50">
                                <option value="">-- 해당 없음 --</option>
                            </select>
                        </div>
                        <div>
                            <label class="flex items-center gap-2">
                                <input type="checkbox" id="groupEditUnitCheck" class="h-4 w-4" onchange="toggleGroupField('Unit')">
                                <span class="text-sm font-medium text-gray-700">단위 변경</span>
                            </label>
                            <input type="text" id="groupEditUnit" disabled value="EA" class="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-gray-50">
                        </div>
                        <div>
                            <label class="flex items-center gap-2">
                                <input type="checkbox" id="groupEditPricingCheck" class="h-4 w-4" onchange="toggleGroupField('Pricing')">
                                <span class="text-sm font-medium text-gray-700">단가방식 변경</span>
                            </label>
                            <select id="groupEditPricing" disabled class="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-gray-50">
                                <option value="FIXED">개수 단위</option>
                                <option value="AREA">면적 단위</option>
                            </select>
                        </div>
                    </div>
                    <div class="mt-6 flex gap-2">
                        <button onclick="saveGroupEdit()" class="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm">일괄 저장</button>
                        <button onclick="closeGroupEditModal()" class="px-4 py-2 border border-gray-300 text-gray-700 bg-white rounded-lg hover:bg-gray-50 text-sm">취소</button>
                    </div>
                </div>
            </div>
        </div>
        <!-- 일괄 등록 모달 -->
        <div id="bulkModal" class="hidden fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div class="bg-white rounded-lg shadow-xl max-w-lg w-full mx-4">
                <div class="p-4 border-b flex justify-between items-center">
                    <h2 class="text-lg font-bold">원자재 일괄 등록</h2>
                    <button onclick="closeBulkModal()" class="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
                </div>
                <div class="p-6 space-y-4">
                    <p class="text-sm text-gray-500">같은 품목의 규격만 다른 여러 품목을 한 번에 등록합니다. 품목 그룹이 자동 설정됩니다.</p>
                    <div>
                        <label class="block text-sm font-semibold text-gray-700 mb-1">품목명 (공통) <span class="text-red-500">*</span></label>
                        <input type="text" id="bulkItemName" placeholder="예: 솔벤트 미디어" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                        <p class="text-xs text-gray-400 mt-1">각 품목은 동일 품목명으로 생성되고, 규격(mm)으로 구분됩니다</p>
                    </div>
                    <div>
                        <label class="block text-sm font-semibold text-gray-700 mb-1">대분류 <span class="text-red-500">*</span></label>
                        <select id="bulkCategory" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                            <option value="">선택...</option>
                        </select>
                    </div>
                    <div>
                        <label class="block text-sm font-semibold text-gray-700 mb-1">단위</label>
                        <input type="text" id="bulkUnit" value="YD" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                    </div>
                    <div>
                        <label class="block text-sm font-semibold text-gray-700 mb-1">기본 단가 (원)</label>
                        <input type="text" inputmode="numeric" data-money id="bulkPrice" value="0" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                    </div>
                    <div>
                        <label class="block text-sm font-semibold text-gray-700 mb-1">규격 목록 (mm) <span class="text-red-500">*</span></label>
                        <div id="bulkWidthList" class="space-y-2">
                            <div class="flex gap-2 items-center">
                                <input type="number" class="bulk-width-input flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm" placeholder="예: 914">
                                <span class="text-xs text-gray-400">mm</span>
                            </div>
                        </div>
                        <button type="button" onclick="addBulkWidthRow()" class="mt-2 text-sm text-blue-600 hover:text-blue-800">
                            <i class="fas fa-plus mr-1"></i>폭 추가
                        </button>
                    </div>
                    <div id="bulkItemPreview" class="hidden bg-gray-50 rounded-lg p-3 text-xs text-gray-600"></div>
                    <div class="flex gap-2 pt-2">
                        <button onclick="saveBulkItems()" class="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm">일괄 생성</button>
                        <button onclick="closeBulkModal()" class="px-4 py-2 border border-gray-300 text-gray-700 bg-white rounded-lg hover:bg-gray-50 text-sm">취소</button>
                    </div>
                </div>
            </div>
        </div>
    `,
    pageScript,
  })
}
