import type { Context } from 'hono'
import type { HonoEnv } from '../types/env'
import { renderPage } from '../layout'
import pageScript from '../scripts/pack.js?raw'

// 출고 포장 검수 — 모바일 우선 (출고관리 v2 P4)
// 진입: 검수 체크지 QR(/pack?order=N) 스캔 또는 사이드바. 권한 = permission_pages '/pack' (0439)
export function packPage(c: Context<HonoEnv>) {
  return renderPage(c, {
    title: '출고 검수',
    activePage: '/pack',
    pageContent: `
      <div class="max-w-xl mx-auto">
        <!-- 주문 열기: 번호 입력 + 카메라 스캔 -->
        <div class="ds-card p-3 mb-3">
          <div class="flex items-center gap-2">
            <input type="text" id="packOrderInput" class="ds-input flex-1 px-3 py-2 text-base" placeholder="주문번호 또는 주문 ID" inputmode="search">
            <button id="packOpenBtn" onclick="packOpenFromInput()" class="ds-btn ds-btn-primary" style="min-width:64px"><i class="fas fa-folder-open mr-1"></i>열기</button>
            <button id="packScanBtn" onclick="packStartScan()" class="ds-btn ds-btn-secondary" title="검수 체크지 QR 스캔" style="min-width:52px"><i class="fas fa-qrcode"></i></button>
          </div>
          <div id="pack-qr-reader" class="hidden mt-3 rounded overflow-hidden" style="max-width:400px;margin:0 auto"></div>
          <button id="packScanStopBtn" onclick="packStopScan()" class="ds-btn ds-btn-sm w-full mt-2 hidden">스캔 중지</button>
        </div>

        <!-- 검수 카드 -->
        <div id="packCard" class="ds-card overflow-hidden hidden">
          <div class="px-4 py-3 bg-gray-50 border-b">
            <div class="flex items-center justify-between">
              <div>
                <div id="packClientName" class="text-base font-bold text-gray-800"></div>
                <div id="packOrderMeta" class="text-xs text-gray-500 mt-0.5"></div>
              </div>
              <div class="text-right">
                <div id="packProgressText" class="text-lg font-bold text-gray-700">0/0</div>
                <div class="text-[10px] text-gray-400">검수 라인</div>
              </div>
            </div>
            <div class="mt-2 h-2 bg-gray-200 rounded-full overflow-hidden">
              <div id="packProgressBar" class="h-full bg-green-500 transition-all" style="width:0%"></div>
            </div>
          </div>
          <!-- 갭4: 합포장 파트너 칩 — 같은 박스로 나가는 형제 주문 (칩 탭 = 이어서 검수) -->
          <div id="packPartners" class="hidden px-4 py-2 bg-blue-50 border-b border-blue-100"></div>
          <div id="packDoneBanner" class="hidden px-4 py-2 text-sm font-semibold text-green-700 bg-green-50 border-b border-green-200">
            <i class="fas fa-check-circle mr-1"></i>전 라인 검수 완료 — 출고 확정 가능
          </div>
          <div id="packLines"></div>
          <div class="px-4 py-3 border-t flex items-center justify-between">
            <button onclick="packCheckAll()" class="ds-btn ds-btn-sm ds-btn-secondary"><i class="fas fa-check-double mr-1"></i>전체 체크</button>
            <span class="text-xs text-gray-400">탭 = 담음 체크 (즉시 저장)</span>
          </div>
        </div>

        <div id="packEmpty" class="text-center text-gray-400 py-12">
          <i class="fas fa-clipboard-check text-4xl mb-3 block text-gray-300"></i>
          <div class="text-sm">검수 체크지의 QR을 스캔하거나<br>주문번호를 입력해 검수를 시작하세요.</div>
        </div>
      </div>
    `,
    pageScript
  })
}
