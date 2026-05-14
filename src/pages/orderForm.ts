import type { Context } from 'hono'
import type { HonoEnv } from '../types/env'
import { renderPage } from '../layout'
// Phase 3.1.C 분할: orderForm.js (3966줄) → 6개 모듈
import sClient from '../scripts/orderForm/client.js?raw'
import sItemRow from '../scripts/orderForm/itemRow.js?raw'
import sFinishing from '../scripts/orderForm/finishing.js?raw'
import sCalc from '../scripts/orderForm/calc.js?raw'
import sSheet from '../scripts/orderForm/sheet.js?raw'
import sParent from '../scripts/orderForm/parent.js?raw'
const pageScript = [sClient, sItemRow, sFinishing, sCalc, sSheet, sParent].join('\n')
import distPageScript from '../scripts/orderFormDist.js?raw'

export function orderFormPage(c: Context<HonoEnv>) {
  const type = c.req.query('type')
  if (type === 'dist') {
    return orderFormDistPage(c)
  }
  return renderPage(c, {
    title: '주문 등록',
    activePage: '/orders',
    pageCSS: `
            .item-dd { position:absolute; z-index:50; background:white; border:1px solid #d1d5db; border-radius:0.5rem; max-height:220px; overflow-y:auto; width:100%; box-shadow:0 4px 12px rgba(0,0,0,.12); top:100%; left:0; margin-top:2px; }
            .item-dd-entry:hover { background:#eff6ff; }
            .client-dd-entry { padding:8px 12px; cursor:pointer; font-size:13px; }
            .client-dd-entry:hover { background:#eff6ff; }
            .client-modal-overlay { position:fixed; inset:0; background:rgba(0,0,0,.5); z-index:100; display:flex; align-items:center; justify-content:center; }
            .client-modal { background:white; border-radius:0.75rem; width:90%; max-width:500px; max-height:80vh; box-shadow:0 20px 60px rgba(0,0,0,.3); overflow:hidden; }
            .client-modal-row { padding:10px 16px; cursor:pointer; border-bottom:1px solid #f3f4f6; }
            .client-modal-row:hover { background:#eff6ff; }
    `,
    pageContent: `
        <div class="max-w-7xl mx-auto">
            <div class="bg-white rounded-lg shadow-lg p-6">
                <div class="flex items-center justify-between mb-4 pb-3 border-b">
                    <h1 class="text-xl font-bold text-gray-800"><i class="fas fa-industry mr-2 text-blue-600"></i>생산 주문서 등록</h1>
                    <a href="/order-form?type=dist" class="text-sm text-green-600 hover:text-green-800 hover:underline">
                        <i class="fas fa-exchange-alt mr-1"></i>유통(상품) 주문서로 전환
                    </a>
                </div>
                <form id="orderForm">
                    <!-- 기본 정보 -->
                    <div class="mb-6">
                        <h2 class="text-xl font-bold text-gray-800 mb-4 border-b pb-2">
                            <i class="fas fa-info-circle mr-2"></i>기본 정보
                        </h2>
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div style="position:relative">
                                <label class="block text-sm font-medium text-gray-700 mb-2">거래처 <span class="text-red-500">*</span></label>
                                <input type="text" id="clientSearch" placeholder="거래처명 입력 후 Enter" autocomplete="off"
                                    onkeydown="handleClientEnter(event)"
                                    class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">
                                <input type="hidden" id="clientId">
                                <div id="clientModal"></div>
                                <div id="creditBanner" class="hidden mt-2"></div>
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-2">우선순위</label>
                                <select id="priority" class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">
                                    <option value="NORMAL">일반</option>
                                    <option value="URGENT">긴급</option>
                                </select>
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-2">전화번호</label>
                                <input type="tel" id="contactPhone" placeholder="거래처 선택 시 자동 입력"
                                    class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-2">휴대전화</label>
                                <input type="tel" id="contactMobile" placeholder="거래처 선택 시 자동 입력"
                                    class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-2">배송처</label>
                                <input type="text" id="receptionLocation" placeholder="예: 동산인쇄" class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-2">배송처 주소</label>
                                <div class="flex gap-2">
                                    <input type="text" id="deliveryInfo" placeholder="예: 서울시 중구 을지로 123" class="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">
                                    <button type="button" onclick="openPostcodeSearch(function(r){ var el=document.getElementById('deliveryInfo'); el.value=(r.postal?'['+r.postal+'] ':'')+r.address; el.focus(); })" class="px-3 py-2 text-sm font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded border border-blue-200 whitespace-nowrap">
                                        <i class="fas fa-search mr-1"></i>주소 검색
                                    </button>
                                </div>
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-2">출고방법</label>
                                <select id="deliveryMethod" onchange="onDeliveryMethodChange()" class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">
                                    <option value="대신택배">대신택배</option>
                                    <option value="대신화물">대신화물</option>
                                    <option value="한진택배">한진택배</option>
                                    <option value="직배">직배</option>
                                    <option value="용차">용차</option>
                                    <option value="퀵">퀵</option>
                                    <option value="방문수령">방문수령</option>
                                </select>
                            </div>
                            <div>
                                <label id="shippingPaymentLabel" class="block text-sm font-medium text-gray-700 mb-2">선불/착불</label>
                                <select id="shippingPayment" disabled class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">
                                    <option value="">해당없음</option>
                                    <option value="PREPAID">선불</option>
                                    <option value="COLLECT">착불</option>
                                </select>
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-2">납품일 <span class="text-red-500">*</span></label>
                                <input type="date" id="deliveryDate" required class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-2">납품시간</label>
                                <div class="flex items-center gap-2">
                                    <select id="deliveryTimeHour" onchange="onDeliveryTimeHourChange()" class="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">
                                    </select>
                                    <span class="text-gray-500 font-medium">:</span>
                                    <select id="deliveryTimeMinute" class="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">
                                    </select>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- AI 파일 자동 추출 패널 (드래그 앤 드롭 지원) -->
                    <div class="mb-6 bg-blue-50 border border-blue-200 rounded-xl p-4"
                         id="aiDropZone"
                         ondragover="event.preventDefault(); this.classList.add('ring-2','ring-blue-400','bg-blue-100');"
                         ondragleave="this.classList.remove('ring-2','ring-blue-400','bg-blue-100');"
                         ondrop="event.preventDefault(); this.classList.remove('ring-2','ring-blue-400','bg-blue-100'); handleAiFileDrop(event);">
                        <h3 class="font-semibold text-blue-800 mb-3 flex items-center gap-2 text-sm">
                            <i class="fas fa-magic"></i> AI 파일에서 품목 자동 추출
                            <span class="text-xs font-normal text-blue-500">(파일 드래그 앤 드롭 또는 선택)</span>
                        </h3>
                        <div class="flex flex-col gap-2">
                            <div class="flex gap-2 items-center">
                                <label class="flex-1 border-2 border-dashed border-blue-300 rounded-lg px-3 py-3 text-sm bg-white cursor-pointer hover:bg-blue-50 flex items-center justify-center gap-2 min-w-0 transition-colors">
                                    <i class="fas fa-cloud-upload-alt text-blue-500 flex-shrink-0"></i>
                                    <span id="aiFileLabel" class="text-gray-400 truncate">AI/EPS 파일을 여기에 드래그하거나 클릭하여 선택</span>
                                    <input type="file" id="aiFileInput" accept=".ai,.eps" class="hidden" onchange="onAIFileSelected(this)">
                                </label>
                                <button type="button" onclick="requestAIAnalysis()" id="aiAnalysisBtn" disabled
                                    class="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-40 flex items-center gap-1 whitespace-nowrap">
                                    <i class="fas fa-layer-group"></i> 그룹 분석
                                </button>
                            </div>
                            <div class="flex gap-1 items-center text-xs text-blue-500">
                                <span class="flex-shrink-0">또는 경로 입력:</span>
                                <input type="text" id="aiLocalPath"
                                    placeholder="Z:\\123\\04월\\28일\\파일.ai"
                                    oninput="onAILocalPathChanged(this)"
                                    class="flex-1 border border-blue-200 rounded px-2 py-1 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-blue-400 min-w-0">
                            </div>
                        </div>
                        <div id="aiAnalysisStatus" class="mt-2 text-sm text-gray-600 hidden"></div>

                        <!-- 분석 결과 탭 (분석 완료 후 표시) -->
                        <div id="aiResultTabs" class="hidden mt-3">
                            <div class="flex gap-2 mb-2">
                                <button type="button" onclick="switchAiTab('extract')" id="tabExtract"
                                    class="flex-1 px-4 py-3 text-sm font-semibold rounded-lg border-2 border-blue-600 bg-blue-600 text-white hover:bg-blue-700 transition-colors">
                                    <i class="fas fa-list mr-1"></i>품목 추출
                                </button>
                                <button type="button" onclick="switchAiTab('sheet')" id="tabSheet"
                                    class="flex-1 px-4 py-3 text-sm font-semibold rounded-lg border-2 border-blue-300 bg-white text-blue-600 hover:bg-blue-50 transition-colors">
                                    <i class="fas fa-th mr-1"></i>시트 배치
                                </button>
                            </div>

                            <!-- 품목 추출 탭 내용 -->
                            <div id="extractPanel" class="hidden bg-white border border-blue-200 rounded-lg p-4">
                                <div class="text-sm font-medium text-gray-700 mb-2">추출된 그룹</div>
                                <div id="extractGroupsList" class="mb-3"></div>
                                <button type="button" onclick="doExtractToLines()" class="w-full py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700">
                                    <i class="fas fa-plus mr-1"></i> 주문 라인에 추가
                                </button>
                            </div>

                            <!-- 시트 배치 탭 내용 -->
                            <div id="sheetLayoutPanel" class="hidden bg-white border border-blue-200 rounded-lg p-4">
                                <!-- 요소 목록 테이블 -->
                                <div class="mb-4">
                                    <div class="text-sm font-medium text-gray-700 mb-2">추출된 요소</div>
                                    <table class="w-full text-sm">
                                        <thead>
                                            <tr class="border-b text-gray-500">
                                                <th class="text-left py-1 px-2">썸네일</th>
                                                <th class="text-left py-1 px-2">크기 (cm)</th>
                                                <th class="text-center py-1 px-2 w-20">수량</th>
                                                <th class="text-right py-1 px-2">면적</th>
                                            </tr>
                                        </thead>
                                        <tbody id="sheetElementsBody"></tbody>
                                    </table>
                                </div>

                                <!-- 롤 폭 + 재단 옵션 -->
                                <div class="flex flex-wrap gap-4 items-end mb-4 p-3 bg-gray-50 rounded-lg">
                                    <div>
                                        <label class="block text-xs text-gray-500 mb-1">롤 폭</label>
                                        <select id="sheetRollWidth" onchange="onSheetSettingsChange()" class="px-3 py-2 border border-gray-300 rounded-lg text-sm">
                                            <option value="105">105 cm</option>
                                            <option value="127">127 cm</option>
                                            <option value="137">137 cm</option>
                                            <option value="152">152 cm</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label class="block text-xs text-gray-500 mb-1">파일 비율</label>
                                        <select id="sheetScaleFactor" onchange="onSheetScaleChange()" class="px-3 py-2 border border-gray-300 rounded-lg text-sm">
                                            <option value="1">1:1 (원본)</option>
                                            <option value="2">1:2 (2배 축소)</option>
                                            <option value="5">1:5 (5배 축소)</option>
                                            <option value="10" selected>1:10 (10배 축소)</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label class="block text-xs text-gray-500 mb-1">재단선</label>
                                        <label class="flex items-center gap-2 text-sm cursor-pointer">
                                            <input type="checkbox" id="sheetCutMarks" checked onchange="onSheetSettingsChange()" class="accent-blue-600">
                                            추가 (+3cm 여백)
                                        </label>
                                    </div>
                                    <div>
                                        <label class="block text-xs text-gray-500 mb-1">배치 가능 영역</label>
                                        <div id="sheetAvailableWidth" class="text-lg font-bold text-blue-600">124 cm</div>
                                    </div>
                                    <div id="sheetRecommendation" class="text-xs text-green-600"></div>
                                </div>

                                <button type="button" onclick="calculateAndPreviewSheet()" class="w-full py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 mb-4">
                                    <i class="fas fa-th mr-1"></i> 배치 미리보기
                                </button>

                                <!-- 미리보기: 인라인 통계만 (캔버스는 모달) -->
                                <div id="sheetPreviewArea" class="hidden">
                                    <div id="sheetStats" class="flex flex-wrap gap-3 text-sm text-gray-600 mb-3"></div>
                                    <div class="flex gap-3">
                                        <button type="button" onclick="resetSheetPreview()" class="flex-1 py-2 border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50">
                                            <i class="fas fa-arrow-left mr-1"></i> 수량/폭 수정
                                        </button>
                                        <button type="button" onclick="confirmSheetLayout()" class="flex-[2] py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700">
                                            <i class="fas fa-check mr-1"></i> 확정 → 주문 라인에 추가
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- 주문 품목 -->
                    <div class="mb-6">
                        <div class="flex justify-between items-center mb-4 border-b pb-2">
                            <h2 class="text-xl font-bold text-gray-800"><i class="fas fa-box mr-2"></i>주문 품목</h2>
                            <div class="flex gap-2">
                                <button type="button" onclick="togglePrintMethodFilter()" class="w-8 h-8 bg-gray-100 border border-gray-300 rounded text-gray-500 hover:bg-blue-50 hover:border-blue-400 hover:text-blue-600 text-xs" title="출력방식 필터">
                                    <i class="fas fa-filter"></i>
                                </button>
                                <button type="button" id="addItemBtn" class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
                                    <i class="fas fa-plus mr-2"></i>품목 추가
                                </button>
                                <button type="button" id="addBundleBtn" class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
                                    <i class="fas fa-layer-group mr-2"></i>묶음 품목 추가
                                </button>
                                <button type="button" id="bulkPPBtn" class="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700">
                                    <i class="fas fa-cog mr-2"></i>후가공 일괄
                                </button>
                            </div>
                        </div>
                        <div id="printMethodFilter" class="hidden mb-3 p-3 bg-blue-50 border border-blue-200 rounded-lg"></div>
                        <div id="itemsContainer"></div>

                        <!-- 합계 -->
                        <div class="mt-6 pt-6 border-t">
                            <div class="flex flex-wrap justify-end items-center gap-6 text-sm md:text-base">
                                <div><span class="font-medium text-gray-700">공급가액:</span> <span id="totalAmount" class="ml-1 font-bold text-blue-600">0</span>원</div>
                                <div><span class="font-medium text-gray-700">부가세:</span> <span id="totalVat" class="ml-1 font-bold text-blue-600">0</span>원</div>
                                <div><span class="font-medium text-gray-700">후가공:</span> <span id="totalPPCost" class="ml-1 font-bold text-orange-600">0</span>원</div>
                                <div class="flex items-center gap-2">
                                    <span class="font-medium text-gray-700">할인:</span>
                                    <input type="text" inputmode="numeric" data-money id="discountAmount" value="0" class="w-28 px-3 py-1 border border-gray-300 rounded text-right text-sm" oninput="calculateTotal()">
                                    <span>원</span>
                                </div>
                                <div class="text-lg">
                                    <span class="font-bold text-gray-800">최종금액:</span>
                                    <span id="grandTotal" class="ml-2 font-bold text-red-600">0</span>원
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- 비고 -->
                    <div class="mb-6">
                        <label class="block text-sm font-medium text-gray-700 mb-2">비고</label>
                        <textarea id="notes" rows="3" class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" placeholder="특이사항을 입력하세요"></textarea>
                    </div>

                    <!-- 버튼 -->
                    <div class="flex justify-end space-x-4">
                        <button type="button" onclick="history.back()" class="px-6 py-2 border border-gray-300 text-gray-700 rounded hover:bg-gray-100">
                            <i class="fas fa-times mr-2"></i>취소
                        </button>
                        <button type="button" id="quotationBtn" onclick="submitAsQuotation()" class="px-6 py-2 bg-teal-500 text-white rounded hover:bg-teal-600">
                            <i class="fas fa-file-alt mr-2"></i>견적서로 저장
                        </button>
                        <button type="submit" id="submitBtn" class="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
                            <i class="fas fa-save mr-2"></i>등록
                        </button>
                    </div>
                </form>
            </div>
        </div>

        <!-- 시트 배치 미리보기 모달 -->
        <div id="sheetPreviewModal" class="hidden fixed inset-0 z-50 flex items-center justify-center" style="background:rgba(0,0,0,.6)">
            <div class="bg-white rounded-xl shadow-2xl flex flex-col" style="width:90vw;max-width:900px;max-height:90vh;">
                <div class="flex justify-between items-center px-5 py-3 border-b">
                    <h3 class="font-bold text-lg text-gray-800"><i class="fas fa-th mr-2"></i>시트 배치 미리보기</h3>
                    <button onclick="closeSheetPreviewModal()" class="text-gray-400 hover:text-gray-700 text-xl px-2">&times;</button>
                </div>
                <div class="flex-1 overflow-y-auto p-5 bg-gray-50">
                    <canvas id="sheetCanvasModal"></canvas>
                </div>
                <div class="flex flex-wrap items-center gap-3 text-xs text-gray-500 mt-2 px-4 pb-3 border-t pt-2">
                    <span class="flex items-center gap-1"><span style="border-top:3px dashed #ef4444;width:16px;display:inline-block"></span> 스마트 도련 (엣지 색상 자동 판단)</span>
                    <span class="text-gray-400">백색 엣지 → 도련 생략</span>
                </div>
                <div class="px-5 py-3 border-t bg-white rounded-b-xl flex gap-3">
                    <button type="button" onclick="closeSheetPreviewModal()" class="flex-1 py-2 border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50">
                        닫기
                    </button>
                    <button type="button" onclick="closeSheetPreviewModal(); confirmSheetLayout();" class="flex-[2] py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700">
                        <i class="fas fa-check mr-1"></i> 확정 → 주문 라인에 추가
                    </button>
                </div>
            </div>
        </div>
    `,
    pageScript
  })
}

function orderFormDistPage(c: Context<HonoEnv>) {
  return renderPage(c, {
    title: '유통 주문 등록',
    activePage: '/orders',
    pageCSS: `
            .item-dd { position:absolute; z-index:50; background:white; border:1px solid #d1d5db; border-radius:0.5rem; max-height:220px; overflow-y:auto; width:100%; box-shadow:0 4px 12px rgba(0,0,0,.12); top:100%; left:0; margin-top:2px; }
            .item-dd-entry:hover { background:#eff6ff; }
            .client-modal-overlay { position:fixed; inset:0; background:rgba(0,0,0,.5); z-index:100; display:flex; align-items:center; justify-content:center; }
            .client-modal { background:white; border-radius:0.75rem; width:90%; max-width:500px; max-height:80vh; box-shadow:0 20px 60px rgba(0,0,0,.3); overflow:hidden; }
            .client-modal-row { padding:10px 16px; cursor:pointer; border-bottom:1px solid #f3f4f6; }
            .client-modal-row:hover { background:#eff6ff; }
    `,
    pageContent: `
        <div class="max-w-7xl mx-auto">
            <div class="bg-white rounded-lg shadow-lg p-6">
                <div class="flex items-center justify-between mb-6 border-b pb-3">
                    <h1 class="text-xl font-bold text-gray-800">
                        <i class="fas fa-truck mr-2 text-green-600"></i>유통 주문서 등록
                    </h1>
                    <a href="/order-form" class="text-sm text-blue-600 hover:text-blue-800 hover:underline">
                        <i class="fas fa-exchange-alt mr-1"></i>생산 주문서로 전환
                    </a>
                </div>

                <form id="distOrderForm">
                    <!-- 기본 정보 (생산 주문서와 동일 레이아웃) -->
                    <div class="mb-6">
                        <h2 class="text-xl font-bold text-gray-800 mb-4 border-b pb-2">
                            <i class="fas fa-info-circle mr-2"></i>기본 정보
                        </h2>
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div style="position:relative">
                                <label class="block text-sm font-medium text-gray-700 mb-2">거래처 <span class="text-red-500">*</span></label>
                                <input type="text" id="clientSearch" placeholder="거래처명 입력 후 Enter" autocomplete="off"
                                    onkeydown="handleClientEnter(event)"
                                    class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">
                                <input type="hidden" id="clientId">
                                <div id="clientModal"></div>
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-2">우선순위</label>
                                <select id="distPriority" class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">
                                    <option value="NORMAL">일반</option>
                                    <option value="URGENT">긴급</option>
                                </select>
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-2">전화번호</label>
                                <input type="tel" id="contactPhone" placeholder="거래처 선택 시 자동 입력"
                                    class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-2">휴대전화</label>
                                <input type="tel" id="contactMobile" placeholder="거래처 선택 시 자동 입력"
                                    class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-2">배송처</label>
                                <input type="text" id="receptionLocation" placeholder="예: 동산인쇄" class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-2">배송처 주소</label>
                                <div class="flex gap-2">
                                    <input type="text" id="deliveryAddress" placeholder="예: 서울시 중구 을지로 123" class="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">
                                    <button type="button" onclick="openPostcodeSearch(function(r){ var el=document.getElementById('deliveryAddress'); el.value=(r.postal?'['+r.postal+'] ':'')+r.address; el.focus(); })" class="px-3 py-2 text-sm font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded border border-blue-200 whitespace-nowrap">
                                        <i class="fas fa-search mr-1"></i>주소 검색
                                    </button>
                                </div>
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-2">출고방법</label>
                                <select id="distDeliveryMethod" onchange="onDistDeliveryMethodChange()" class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">
                                    <option value="대신택배">대신택배</option>
                                    <option value="대신화물">대신화물</option>
                                    <option value="한진택배">한진택배</option>
                                    <option value="직배">직배</option>
                                    <option value="용차">용차</option>
                                    <option value="퀵">퀵</option>
                                    <option value="방문수령">방문수령</option>
                                </select>
                            </div>
                            <div>
                                <label id="distShippingPaymentLabel" class="block text-sm font-medium text-gray-700 mb-2">선불/착불</label>
                                <select id="distShippingPayment" disabled class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">
                                    <option value="">해당없음</option>
                                    <option value="PREPAID">선불</option>
                                    <option value="COLLECT">착불</option>
                                </select>
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-2">납품일</label>
                                <input type="date" id="distDeliveryDate" class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-2">납품시간</label>
                                <div class="flex items-center gap-2">
                                    <select id="distDeliveryTimeHour" onchange="onDistDeliveryTimeHourChange()" class="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">
                                    </select>
                                    <span class="text-gray-500 font-medium">:</span>
                                    <select id="distDeliveryTimeMinute" class="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">
                                    </select>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- 품목 테이블 -->
                    <div class="mb-6">
                        <div class="flex items-center justify-between mb-4 border-b pb-2">
                            <h2 class="text-xl font-bold text-gray-800"><i class="fas fa-box mr-2"></i>주문 품목</h2>
                            <button type="button" onclick="addItemRow()" class="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
                                <i class="fas fa-plus mr-1"></i>품목 추가
                            </button>
                        </div>
                        <div class="overflow-x-auto">
                            <table class="w-full">
                                <thead>
                                    <tr class="bg-gray-50 border-b border-gray-200">
                                        <th class="text-left py-3 px-3 font-medium text-gray-600" style="min-width:240px">품목명</th>
                                        <th class="text-left py-3 px-3 font-medium text-gray-600" style="min-width:140px">규격</th>
                                        <th class="text-center py-3 px-3 font-medium text-gray-600" style="width:90px">수량</th>
                                        <th class="text-right py-3 px-3 font-medium text-gray-600" style="width:130px">단가</th>
                                        <th class="text-right py-3 px-3 font-medium text-gray-600" style="width:130px">금액</th>
                                        <th class="text-center py-3 px-3 font-medium text-gray-600" style="width:50px"></th>
                                    </tr>
                                </thead>
                                <tbody id="distItemsBody"></tbody>
                            </table>
                        </div>
                    </div>

                    <!-- 합계 -->
                    <div class="mb-6 bg-gray-50 rounded-lg p-4">
                        <div class="flex flex-wrap items-center justify-between gap-4">
                            <div class="flex items-center gap-4">
                                <label class="flex items-center gap-2 text-sm cursor-pointer">
                                    <input type="checkbox" id="distVatIncluded" checked onchange="calculateDistTotal()" class="rounded border-gray-300 text-blue-600">
                                    <span class="text-gray-700 font-medium">부가세 포함</span>
                                </label>
                                <div class="flex items-center gap-2 text-sm">
                                    <span class="text-gray-600">할인:</span>
                                    <input type="text" inputmode="numeric" data-money id="distDiscount" value="0" class="w-24 px-2 py-1 border border-gray-300 rounded text-right text-sm" oninput="calculateDistTotal()">
                                    <span class="text-gray-500">원</span>
                                </div>
                            </div>
                            <div class="flex items-center gap-6 text-sm">
                                <div><span class="text-gray-600">공급가액:</span> <span id="distSubtotal" class="font-bold text-blue-700">0원</span></div>
                                <div><span class="text-gray-600">부가세:</span> <span id="distVatAmount" class="font-bold text-blue-700">0원</span></div>
                                <div class="text-base"><span class="font-bold text-gray-800">최종금액:</span> <span id="distGrandTotal" class="font-bold text-red-600">0원</span></div>
                            </div>
                        </div>
                    </div>

                    <!-- 비고 -->
                    <div class="mb-6">
                        <label class="block text-sm font-medium text-gray-700 mb-1">비고</label>
                        <textarea id="distNotes" rows="3" class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" placeholder="특이사항을 입력하세요"></textarea>
                    </div>

                    <!-- 버튼 -->
                    <div class="flex justify-end space-x-3">
                        <button type="button" onclick="history.back()" class="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100">
                            <i class="fas fa-times mr-2"></i>취소
                        </button>
                        <button type="submit" id="distSubmitBtn" class="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium">
                            <i class="fas fa-save mr-2"></i>등록
                        </button>
                    </div>
                </form>
            </div>
        </div>
    `,
    pageScript: distPageScript
  })
}
