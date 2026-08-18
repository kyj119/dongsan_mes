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
import sIntake from '../scripts/orderForm/intake.js?raw'
const pageScript = [sClient, sItemRow, sFinishing, sCalc, sSheet, sParent, sIntake].join('\n')
import distPageScript from '../scripts/orderFormDist.js?raw'

export async function orderFormPage(c: Context<HonoEnv>) {
  const type = c.req.query('type')
  if (type === 'dist') {
    return orderFormDistPage(c)
  }
  // 부가세율 = settings 단일 정본을 화면에 주입한다(2026-07-30).
  //   전엔 calc.js 가 0.1 을 하드코딩해, 서버(create.ts 는 settings.vat_rate 를 읽는다)와
  //   **정본이 둘**이었다. 값이 같아 안 보였지만 설정을 바꾸는 순간 화면과 저장이 갈린다.
  //   실패해도 화면은 떠야 하므로 조회 실패 시 서버와 같은 기본값(0.10)으로 폴백한다.
  let vatRate = 0.1
  try {
    const row = await c.env.DB.prepare(
      `SELECT setting_value FROM settings WHERE setting_key = 'vat_rate'`
    ).first<{ setting_value: string }>()
    const parsed = row ? parseFloat(row.setting_value) : NaN
    if (Number.isFinite(parsed) && parsed >= 0) vatRate = parsed
  } catch { /* 설정 조회 실패 → 기본값 유지 */ }
  // 웹 AI추출·합판(시트배치) 진입점 게이트 — JSX 디자이너 세션 루프로 전환 (IA web sunset Phase 0).
  // false=숨김. 하부구조(ai_analysis_requests·ProcessOrderItem -3 passthrough·카드 썸네일)는 존치.
  // ③직접연결(itemRow '파일 연결')은 이행기 fallback으로 무관·유지.
  const IA_WEB_INTAKE_ENABLED = false
  return renderPage(c, {
    title: '주문 등록',
    activePage: '/orders',
    pageCSS: `
            .item-dd { position:absolute; z-index:50; background:var(--c-surface); border:1px solid var(--c-border); border-radius:0.5rem; max-height:220px; overflow-y:auto; width:100%; box-shadow:0 4px 12px rgba(0,0,0,.12); top:100%; left:0; margin-top:2px; }
            .item-dd-entry:hover { background:var(--c-primary-light); }
            .client-dd-entry { padding:8px 12px; cursor:pointer; font-size:13px; }
            .client-dd-entry:hover { background:var(--c-primary-light); }
            .client-modal-overlay { position:fixed; inset:0; background:rgba(0,0,0,.5); z-index:100; display:flex; align-items:center; justify-content:center; }
            .client-modal { background:var(--c-surface); border-radius:0.75rem; width:90%; max-width:500px; max-height:80vh; box-shadow:0 20px 60px rgba(0,0,0,.3); overflow:hidden; }
            .client-modal-row { padding:10px 16px; cursor:pointer; border-bottom:1px solid var(--c-border-light); }
            .client-modal-row:hover { background:var(--c-primary-light); }
    `,
    pageContent: `
        <div class="max-w-7xl mx-auto">
            <div class="ds-card p-6">
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
                                <label class="block text-sm font-medium text-gray-700 mb-2">청구 법인 <span class="text-gray-400 text-xs font-normal">(품목 담당별 자동 분할)</span></label>
                                <div id="billingGroupsHint" class="w-full px-4 py-2 border border-gray-200 rounded-lg bg-gray-50 min-h-[42px] flex flex-wrap items-center gap-1.5 text-sm">
                                    <span class="text-gray-400">품목을 추가하면 청구 법인이 표시됩니다</span>
                                </div>
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-2">담당자 <span class="text-gray-400 text-xs font-normal">(법인 귀속·실적 기준)</span></label>
                                <select id="salesRepId" class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">
                                    <option value="">(미지정)</option>
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
                                <label id="deliveryInfoLabel" class="block text-sm font-medium text-gray-700 mb-2">배송처 주소</label>
                                <!-- 좁은 화면: [우편번호][주소검색] / [도로명] 2줄 · sm+: 한 줄.
                                     basis-full+min-w-0 이 없으면 도로명이 축소되지 않아 버튼이 화면 밖으로 밀린다. -->
                                <div class="flex flex-wrap gap-2">
                                    <input type="text" id="deliveryPostal" maxlength="5" inputmode="numeric" placeholder="우편번호" oninput="this.value=this.value.replace(/[^0-9]/g,'')" class="w-24 px-3 py-2 border border-gray-300 rounded-lg text-center text-sm focus:ring-2 focus:ring-blue-500">
                                    <button type="button" onclick="openPostcodeSearch({ postalId: 'deliveryPostal', addressId: 'deliveryInfo', detailFocusId: 'deliveryDetail' })" class="px-3 py-2 text-sm font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded border border-blue-200 whitespace-nowrap">
                                        <i class="fas fa-search mr-1"></i>주소 검색
                                    </button>
                                    <input type="text" id="deliveryInfo" placeholder="예: 서울시 중구 을지로 123" class="basis-full sm:basis-0 sm:flex-1 min-w-0 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">
                                </div>
                                <input type="text" id="deliveryDetail" placeholder="상세주소 (예: 3층 301호, 동산인쇄 앞)" class="w-full mt-2 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">
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
                                <input type="text" maxlength="10" inputmode="numeric" placeholder="예: 2026-01-15" id="deliveryDate" required class="js-fp w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">
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
                        <!-- 합배송 예약 배너 (배송 후속 P1): 같은 거래처 미출고 주문 존재 시 표시 -->
                        <div id="ofConsolidationBanner" class="hidden mt-4 border border-amber-200 bg-amber-50 rounded-lg overflow-hidden">
                            <div class="px-4 py-2 border-b border-amber-200 flex items-center justify-between">
                                <span class="text-sm font-semibold text-amber-800"><i class="fas fa-box mr-1"></i>이 거래처의 미출고 주문 <span id="ofConsolidationCount"></span>건</span>
                                <span class="text-xs text-amber-700">합배송 예약 시 출고확정 때 자동으로 한 박스로 묶입니다 · 주문서·청구서는 각각 유지</span>
                            </div>
                            <div id="ofConsolidationList" class="px-4 py-2 text-sm divide-y divide-amber-100"></div>
                        </div>
                    </div>

                    ${IA_WEB_INTAKE_ENABLED ? `
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
                                    <span id="aiFileLabel" class="text-gray-400 truncate">AI/EPS 파일을 여기에 드래그하거나 클릭하여 선택 (여러 파일 가능)</span>
                                    <input type="file" id="aiFileInput" accept=".ai,.eps" multiple class="hidden" onchange="onAIFileSelected(this)">
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

                        <!-- 분석 결과: 아트보드 그리드 + 시트배치 패널 -->
                        <div id="aiResultTabs" class="hidden mt-3">
                            <!-- 아트보드 선택 그리드 -->
                            <div id="artboardGridPanel" class="bg-white border border-blue-200 rounded-lg p-4">
                                <div class="flex items-center justify-between mb-3">
                                    <div class="text-sm font-medium text-gray-700">
                                        <i class="fas fa-th-large text-blue-500 mr-1"></i>분석 완료 — <span id="gridTotalCount">0</span>개 아트보드
                                    </div>
                                    <label class="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer select-none">
                                        <input type="checkbox" id="gridCheckAll" onchange="gridToggleAll(this.checked)" class="rounded border-gray-300 text-blue-600"> 전체선택
                                    </label>
                                </div>
                                <div id="gridItems" class="space-y-1 max-h-72 overflow-y-auto"></div>
                                <div class="flex items-center gap-2 mt-3 pt-3 border-t border-gray-200">
                                    <span id="gridSelectedInfo" class="text-xs text-gray-500 flex-1">0개 선택</span>
                                    <button type="button" onclick="gridExtractSelected()" class="px-3 py-2 text-sm font-medium bg-white border border-blue-300 text-blue-600 rounded-lg hover:bg-blue-50 disabled:opacity-40" id="gridBtnExtract" disabled>
                                        <i class="fas fa-list mr-1"></i>선택 → 개별 등록
                                    </button>
                                    <button type="button" onclick="gridSheetSelected()" class="px-3 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40" id="gridBtnSheet" disabled>
                                        <i class="fas fa-th mr-1"></i>선택 → 시트배치
                                    </button>
                                    <button type="button" onclick="gridExtractAll()" class="px-3 py-2 text-sm font-medium bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200">
                                        전체 개별 등록
                                    </button>
                                </div>
                            </div>

                            <!-- 시트 배치 패널 (그리드에서 시트배치 클릭 시 표시) -->
                            <div id="sheetLayoutPanel" class="hidden bg-white border border-blue-200 rounded-lg p-4 mt-2">
                                <button type="button" onclick="backToArtboardGrid()" class="mb-3 text-sm text-blue-600 hover:text-blue-800">
                                    <i class="fas fa-arrow-left mr-1"></i>아트보드 선택으로 돌아가기
                                </button>
                                <!-- 요소 목록 테이블 -->
                                <div class="mb-4">
                                    <div class="text-sm font-medium text-gray-700 mb-2">시트배치 요소</div>
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
                    ` : ''}

                    <!-- 주문 품목 -->
                    <div class="mb-6">
                        <div class="flex justify-between items-center mb-4 border-b pb-2">
                            <h2 class="text-xl font-bold text-gray-800"><i class="fas fa-box mr-2"></i>주문 품목</h2>
                            <div class="flex gap-2">
                                <button type="button" id="addItemBtn" class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
                                    <i class="fas fa-plus mr-2"></i>품목 추가
                                </button>
                                <button type="button" id="addBundleBtn" class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
                                    <i class="fas fa-layer-group mr-2"></i>묶음 품목 추가
                                </button>
                                <button type="button" id="bulkPPBtn" class="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700">
                                    <i class="fas fa-cog mr-2"></i>후가공 일괄
                                </button>
                                <button type="button" onclick="addAccessoryRow()" class="px-3 py-2 bg-amber-100 text-amber-700 rounded hover:bg-amber-200" title="부속품(깃대, 삼발이 등) 추가">
                                    <i class="fas fa-puzzle-piece mr-1"></i>부속품
                                </button>
                            </div>
                        </div>
                        <label class="flex items-center gap-1.5 text-xs text-gray-500 mb-2 cursor-pointer w-fit">
                            <input type="checkbox" id="includeMaterials" class="rounded border-gray-300"> 품목 검색에 <b class="text-gray-700">원자재</b> 포함 (기본: 제품·상품만)
                        </label>
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
                        <button type="button" id="quotationBtn" onclick="submitAsQuotation()" class="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
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
    // 스크립트보다 앞서 주입해야 calc.js 가 로드 시점부터 올바른 세율을 쓴다
    pageScript: `window.VAT_RATE = ${vatRate};\n` + pageScript
  })
}

function orderFormDistPage(c: Context<HonoEnv>) {
  return renderPage(c, {
    title: '유통 주문 등록',
    activePage: '/orders',
    pageCSS: `
            .item-dd { position:absolute; z-index:50; background:var(--c-surface); border:1px solid var(--c-border); border-radius:0.5rem; max-height:220px; overflow-y:auto; width:100%; box-shadow:0 4px 12px rgba(0,0,0,.12); top:100%; left:0; margin-top:2px; }
            .item-dd-entry:hover { background:var(--c-primary-light); }
            .client-modal-overlay { position:fixed; inset:0; background:rgba(0,0,0,.5); z-index:100; display:flex; align-items:center; justify-content:center; }
            .client-modal { background:var(--c-surface); border-radius:0.75rem; width:90%; max-width:500px; max-height:80vh; box-shadow:0 20px 60px rgba(0,0,0,.3); overflow:hidden; }
            .client-modal-row { padding:10px 16px; cursor:pointer; border-bottom:1px solid var(--c-border-light); }
            .client-modal-row:hover { background:var(--c-primary-light); }
    `,
    pageContent: `
        <div class="max-w-7xl mx-auto">
            <div class="ds-card p-6">
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
                                <label id="deliveryAddressLabel" class="block text-sm font-medium text-gray-700 mb-2">배송처 주소</label>
                                <div class="flex flex-wrap gap-2">
                                    <input type="text" id="distDeliveryPostal" maxlength="5" inputmode="numeric" placeholder="우편번호" oninput="this.value=this.value.replace(/[^0-9]/g,'')" class="w-24 px-3 py-2 border border-gray-300 rounded-lg text-center text-sm focus:ring-2 focus:ring-blue-500">
                                    <button type="button" onclick="openPostcodeSearch({ postalId: 'distDeliveryPostal', addressId: 'deliveryAddress', detailFocusId: 'distDeliveryDetail' })" class="px-3 py-2 text-sm font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded border border-blue-200 whitespace-nowrap">
                                        <i class="fas fa-search mr-1"></i>주소 검색
                                    </button>
                                    <input type="text" id="deliveryAddress" placeholder="예: 서울시 중구 을지로 123" class="basis-full sm:basis-0 sm:flex-1 min-w-0 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">
                                </div>
                                <input type="text" id="distDeliveryDetail" placeholder="상세주소 (예: 3층 301호, 동산인쇄 앞)" class="w-full mt-2 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">
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
                                <input type="text" maxlength="10" inputmode="numeric" placeholder="예: 2026-01-15" id="distDeliveryDate" class="js-fp w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">
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
                            <div class="flex gap-2">
                                <button type="button" onclick="addItemRow()" class="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
                                    <i class="fas fa-plus mr-1"></i>품목 추가
                                </button>
                                <button type="button" onclick="addAccessoryRow()" class="px-3 py-2 bg-amber-100 text-amber-700 rounded-lg text-sm hover:bg-amber-200" title="부속품(깃대, 삼발이 등) 추가">
                                    <i class="fas fa-puzzle-piece mr-1"></i>부속품
                                </button>
                            </div>
                        </div>
                        <div class="overflow-x-auto">
                            <table class="w-full" style="table-layout:fixed;min-width:920px">
                                <colgroup><col><col style="width:20%"><col style="width:130px"><col style="width:90px"><col style="width:130px"><col style="width:130px"><col style="width:50px"></colgroup>
                                <thead>
                                    <tr class="bg-gray-50 border-b border-gray-200">
                                        <th class="text-left py-3 px-3 font-medium text-gray-600">품목명</th>
                                        <th class="text-left py-3 px-3 font-medium text-gray-600">규격</th>
                                        <th class="text-left py-3 px-3 font-medium text-gray-600">담당</th>
                                        <th class="text-center py-3 px-3 font-medium text-gray-600">수량</th>
                                        <th class="text-right py-3 px-3 font-medium text-gray-600">단가</th>
                                        <th class="text-right py-3 px-3 font-medium text-gray-600">금액</th>
                                        <th class="text-center py-3 px-3 font-medium text-gray-600"></th>
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
