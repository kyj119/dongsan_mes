import type { Context } from 'hono'
import type { HonoEnv } from '../types/env'
import { renderPage } from '../layout'
import pageScript from '../scripts/scan.js?raw'

export function scanPage(c: Context<HonoEnv>) {
  return renderPage(c, {
    title: 'QR 스캔',
    activePage: '/scan',
    pageCSS: `.modal-overlay { display:none; position:fixed; inset:0; z-index:50; background:rgba(0,0,0,.45); justify-content:center; align-items:center; }
      .modal-overlay.show { display:flex; }
      .modal-box { background:white; border-radius:12px; padding:20px; width:90%; max-width:400px; }`,
    pageContent: `
      <div class="max-w-lg mx-auto">
        <!-- 카메라 스캔 영역 -->
        <div class="bg-white rounded-xl shadow-sm border border-gray-200 mb-4 overflow-hidden">
          <div class="p-4 border-b border-gray-100 flex items-center justify-between">
            <h2 class="text-sm font-bold text-gray-700 flex items-center gap-2">
              <i class="fas fa-qrcode text-blue-500"></i> QR/바코드 스캔
            </h2>
            <div>
              <button id="startScanBtn" class="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors min-h-[44px]">
                <i class="fas fa-camera mr-1"></i>카메라 시작
              </button>
              <button id="stopScanBtn" class="hidden bg-red-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-600 transition-colors min-h-[44px]">
                <i class="fas fa-stop mr-1"></i>중지
              </button>
            </div>
          </div>

          <!-- 카메라 뷰 -->
          <div id="scanPlaceholder" class="flex flex-col items-center justify-center py-12 px-4 text-gray-400">
            <i class="fas fa-camera text-5xl mb-3"></i>
            <p class="text-sm text-center">카메라 버튼을 눌러 QR 코드를 스캔하세요</p>
            <p class="text-xs text-gray-300 mt-1">HTTPS 환경에서만 카메라 접근이 가능합니다</p>
          </div>
          <div id="qr-reader" class="hidden" style="width:100%;"></div>
        </div>

        <!-- 수동 입력 -->
        <div class="bg-white rounded-xl shadow-sm border border-gray-200 mb-4 p-4">
          <label class="block text-xs font-medium text-gray-500 mb-2">
            <i class="fas fa-keyboard mr-1"></i>수동 입력 (코드 또는 번호)
          </label>
          <div class="flex gap-2">
            <input type="text" id="manualCodeInput"
              class="form-input flex-1 text-sm min-h-[44px]"
              placeholder="CARD:CARD-20260521-001 또는 PM-5001">
            <button id="manualLookupBtn"
              class="bg-gray-800 text-white px-4 rounded-lg text-sm font-medium hover:bg-gray-900 transition-colors min-h-[44px] whitespace-nowrap">
              <i class="fas fa-search mr-1"></i>조회
            </button>
          </div>
        </div>

        <!-- 스캔 결과 패널 -->
        <div id="resultPanel" class="hidden bg-white rounded-xl shadow-sm border border-gray-200 mb-4 p-4">
          <h3 class="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
            <i class="fas fa-check-circle text-green-500"></i> 스캔 결과
          </h3>
          <div id="resultContent"></div>
        </div>

        <!-- 최근 스캔 이력 (로컬) -->
        <div class="text-center text-xs text-gray-400 mt-6">
          <p><i class="fas fa-info-circle mr-1"></i>지원 코드: CARD:번호, ITEM:품목코드, EQ:장비코드, ORDER:주문번호</p>
        </div>
      </div>

      <!-- 수량 입력 모달 -->
      <div class="modal-overlay" id="quantityModal">
        <div class="modal-box" style="width:340px;">
          <h3 id="qtyModalTitle" class="text-base font-bold text-gray-800 mb-4">수량 입력</h3>
          <input type="number" id="qtyInput" class="form-input text-lg text-center min-h-[48px]" min="1" placeholder="수량"
            inputmode="numeric" pattern="[0-9]*">
          <div class="flex gap-2 mt-4">
            <button onclick="closeQuantityModal()" class="btn-secondary flex-1 min-h-[44px]">취소</button>
            <button onclick="confirmQuantity()" class="btn-primary flex-1 min-h-[44px]">확인</button>
          </div>
        </div>
      </div>
    `,
    pageScript: pageScript
  })
}
