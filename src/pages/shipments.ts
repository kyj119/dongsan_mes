import type { Context } from 'hono'
import type { HonoEnv } from '../types/env'
import { renderPage } from '../layout'
import pageScript from '../scripts/shipments.js?raw'

export function shipmentsPage(c: Context<HonoEnv>) {
  return renderPage(c, {
    title: '출고 라벨 관리',
    activePage: '/shipments',
    pageContent: `
      <style>
        @media screen { #printArea { display: none; } #printListArea { display: none; } }
        @media print {
          body, .main-content, .page-body { position: static !important; overflow: visible !important; height: auto !important; margin: 0 !important; padding: 0 !important; }
          .sidebar, .main-content > header { display: none !important; }
          .page-body > *:not(#printArea):not(#printListArea):not(style) { display: none !important; }
        }
        /* 라벨 인쇄 모드 (기본) */
        @media print {
          body:not(.print-list-mode) #printArea { display: block !important; }
          body:not(.print-list-mode) #printListArea { display: none !important; }
          body:not(.print-list-mode) { }
        }
        /* A4 가로형 출고 리스트 모드 */
        @media print {
          body.print-list-mode #printArea { display: none !important; }
          body.print-list-mode #printListArea { display: block !important; }
        }
        #printListArea { font-family: 'Malgun Gothic', sans-serif; }
        #printListArea table { width: 100%; border-collapse: collapse; font-size: 10pt; }
        #printListArea th, #printListArea td { border: 1px solid #333; padding: 4px 8px; text-align: left; }
        #printListArea th { background: #f0f0f0; font-weight: bold; font-size: 9pt; }
        #printListArea h2 { font-size: 14pt; font-weight: bold; margin: 0 0 8px; }
        #printListArea .list-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
        #printListArea .list-date { font-size: 11pt; color: #555; }
        #printListArea .list-section { margin-bottom: 20px; page-break-inside: avoid; }
        /* 라벨 카드 스타일 */
        .label-card {
          width: 100mm; height: 60mm;
          border: 2px solid #000;
          padding: 8mm;
          margin: 5mm auto;
          page-break-inside: avoid;
          display: flex; flex-direction: column; justify-content: space-between;
          font-family: 'Malgun Gothic', sans-serif;
          box-sizing: border-box;
        }
        .label-card * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .label-client {
          font-size: 20pt; font-weight: bold;
          line-height: 1.3;
          border-bottom: 1px solid #999;
          padding-bottom: 3mm;
          color: #000 !important;
        }
        .label-middle {
          font-size: 11pt;
          line-height: 1.4;
          flex: 1;
          display: flex; align-items: center;
          padding: 2mm 0;
          color: #333 !important;
        }
        .label-footer {
          display: flex; justify-content: space-between; align-items: flex-end;
          border-top: 1px solid #999;
          padding-top: 3mm;
        }
        .label-carrier { font-size: 14pt; font-weight: bold; color: #000 !important; }
        .label-date { font-size: 12pt; color: #555 !important; }
        .quick-guide {
          width: 100mm; padding: 8mm; margin: 5mm auto;
          border: 2px solid #000; page-break-inside: avoid;
          font-family: 'Malgun Gothic', sans-serif;
        }
        .quick-guide h2 { font-size: 16pt; font-weight: bold; margin: 0 0 4mm; text-align: center; border-bottom: 2px solid #000; padding-bottom: 3mm; }
        .quick-guide table { width: 100%; border-collapse: collapse; font-size: 11pt; }
        .quick-guide td { padding: 2mm 3mm; border-bottom: 1px solid #ddd; }
        .quick-guide td:first-child { font-weight: bold; width: 25%; color: #555; }
      </style>

      <!-- 헤더: 날짜 탐색 + 배지 -->
      <div class="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div class="flex items-center gap-2">
          <button onclick="changeDate(-1)" class="px-3 py-2 bg-white border rounded hover:bg-gray-50 text-sm">◀</button>
          <input type="date" id="shipDate" onchange="loadShipmentsByDate()"
            class="ds-input px-3 py-2 text-sm font-medium border rounded">
          <button onclick="changeDate(1)" class="px-3 py-2 bg-white border rounded hover:bg-gray-50 text-sm">▶</button>
          <button onclick="goToday()" class="px-3 py-2 bg-blue-50 border border-blue-200 text-blue-700 rounded text-xs hover:bg-blue-100">오늘</button>
        </div>
        <div class="flex gap-2 flex-wrap items-center">
          <span id="badgeFreight" class="px-2.5 py-0.5 rounded-full text-xs bg-blue-50 text-blue-700 font-medium cursor-pointer" onclick="scrollToSection('sectionFreight')"><i class="fas fa-truck mr-1"></i>대신화물 0건</span>
          <span id="badgeDaesintaekbae" class="px-2.5 py-0.5 rounded-full text-xs bg-green-50 text-green-700 font-medium cursor-pointer" onclick="scrollToSection('sectionDaesintaekbae')"><i class="fas fa-box mr-1"></i>대신택배 0건</span>
          <span id="badgeHanjin" class="px-2.5 py-0.5 rounded-full text-xs bg-amber-50 text-amber-700 font-medium cursor-pointer" onclick="scrollToSection('sectionHanjin')"><i class="fas fa-box mr-1"></i>한진택배 0건</span>
          <span id="badgeQuick" class="px-2.5 py-0.5 rounded-full text-xs bg-gray-100 text-gray-700 font-medium cursor-pointer" onclick="scrollToSection('sectionQuick')"><i class="fas fa-bolt mr-1"></i>퀵·용차 0건</span>
          <span class="border-l border-gray-300 h-4 mx-1"></span>
          <button onclick="printShipmentList('daeshin')" class="px-2.5 py-1 text-xs bg-white border border-blue-300 text-blue-700 rounded hover:bg-blue-50" title="대신(화물+택배) 출고 리스트 A4 인쇄">
            <i class="fas fa-list-alt mr-1"></i>대신 리스트
          </button>
          <button onclick="printShipmentList('hanjin')" class="px-2.5 py-1 text-xs bg-white border border-amber-300 text-amber-700 rounded hover:bg-amber-50" title="한진택배 출고 리스트 A4 인쇄">
            <i class="fas fa-list-alt mr-1"></i>한진 리스트
          </button>
        </div>
      </div>

      <!-- 대신화물 섹션 -->
      <div id="sectionFreight" class="mb-6 ds-card overflow-hidden">
        <div class="flex items-center justify-between px-4 py-3 bg-white border-b border-gray-200">
          <h3 class="text-sm font-semibold text-gray-700"><i class="fas fa-truck mr-1"></i>대신화물</h3>
          <div class="flex items-center gap-2">
            <button id="btnSendFreight" onclick="openShipmentSendModal('freight')" class="px-2 py-1 text-xs border border-gray-300 text-gray-600 rounded hover:bg-gray-50 hidden">
              <i class="fas fa-paper-plane mr-1"></i>선택 발송
            </button>
            <button onclick="printAllSection('freight')" class="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700">
              <i class="fas fa-print mr-1"></i>전체 라벨 출력
            </button>
            <button onclick="confirmShipSection('freight')" class="px-3 py-1 text-xs bg-emerald-600 text-white rounded hover:bg-emerald-700">
              <i class="fas fa-truck mr-1"></i>출고 확정
            </button>
          </div>
        </div>
        <table class="ds-table w-full text-sm ds-table-striped">
          <thead>
            <tr>
              <th class="px-3 py-2 w-8"><input type="checkbox" onchange="toggleSectionCheck('freight', this.checked)" class="rounded" title="전체 선택"></th>
              <th class="px-3 py-2 text-left">거래처</th>
              <th class="px-3 py-2 text-left">터미널</th>
              <th class="px-3 py-2 text-left hidden md:table-cell">품목</th>
              <th class="px-3 py-2 text-center w-20">라벨</th>
              <th class="px-3 py-2 text-center w-20">박스</th>
              <th class="px-3 py-2 text-center w-20">출력</th>
            </tr>
          </thead>
          <tbody id="tbody-freight">
            <tr><td colspan="7" class="px-4 py-6 text-center text-gray-400 text-sm">로딩 중...</td></tr>
          </tbody>
        </table>
      </div>

      <!-- 대신택배 섹션 -->
      <div id="sectionDaesintaekbae" class="mb-6 ds-card overflow-hidden">
        <div class="flex items-center justify-between px-4 py-3 bg-white border-b border-gray-200">
          <h3 class="text-sm font-semibold text-gray-700"><i class="fas fa-box mr-1"></i>대신택배</h3>
          <div class="flex items-center gap-2">
            <button id="btnSendDaesintaekbae" onclick="openShipmentSendModal('daesintaekbae')" class="px-2 py-1 text-xs border border-gray-300 text-gray-600 rounded hover:bg-gray-50 hidden">
              <i class="fas fa-paper-plane mr-1"></i>선택 발송
            </button>
            <button onclick="printAllSection('daesintaekbae')" class="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700">
              <i class="fas fa-print mr-1"></i>전체 라벨 출력
            </button>
            <button onclick="confirmShipSection('daesintaekbae')" class="px-3 py-1 text-xs bg-emerald-600 text-white rounded hover:bg-emerald-700">
              <i class="fas fa-truck mr-1"></i>출고 확정
            </button>
          </div>
        </div>
        <table class="ds-table w-full text-sm ds-table-striped">
          <thead>
            <tr>
              <th class="px-3 py-2 w-8"><input type="checkbox" onchange="toggleSectionCheck('daesintaekbae', this.checked)" class="rounded" title="전체 선택"></th>
              <th class="px-3 py-2 text-left">거래처</th>
              <th class="px-3 py-2 text-left">배송주소</th>
              <th class="px-3 py-2 text-left hidden md:table-cell">품목</th>
              <th class="px-3 py-2 text-center w-20">라벨</th>
              <th class="px-3 py-2 text-center w-20">박스</th>
              <th class="px-3 py-2 text-center w-20">출력</th>
            </tr>
          </thead>
          <tbody id="tbody-daesintaekbae">
            <tr><td colspan="7" class="px-4 py-6 text-center text-gray-400 text-sm">로딩 중...</td></tr>
          </tbody>
        </table>
      </div>

      <!-- 한진택배 섹션 -->
      <div id="sectionHanjin" class="mb-6 ds-card overflow-hidden">
        <div class="flex items-center justify-between px-4 py-3 bg-white border-b border-gray-200">
          <h3 class="text-sm font-semibold text-gray-700"><i class="fas fa-shipping-fast mr-1"></i>한진택배</h3>
          <div class="flex items-center gap-2">
            <button id="btnSendHanjin" onclick="openShipmentSendModal('hanjin')" class="px-2 py-1 text-xs border border-gray-300 text-gray-600 rounded hover:bg-gray-50 hidden">
              <i class="fas fa-paper-plane mr-1"></i>선택 발송
            </button>
            <button onclick="confirmShipSection('hanjin')" class="px-3 py-1 text-xs bg-emerald-600 text-white rounded hover:bg-emerald-700">
              <i class="fas fa-truck mr-1"></i>출고 확정
            </button>
          </div>
        </div>
        <table class="ds-table w-full text-sm ds-table-striped">
          <thead>
            <tr>
              <th class="px-3 py-2 w-8"><input type="checkbox" onchange="toggleSectionCheck('hanjin', this.checked)" class="rounded" title="전체 선택"></th>
              <th class="px-3 py-2 text-left">거래처</th>
              <th class="px-3 py-2 text-left">배송주소</th>
              <th class="px-3 py-2 text-left">송장번호</th>
              <th class="px-3 py-2 text-center w-20">저장</th>
            </tr>
          </thead>
          <tbody id="tbody-hanjin">
            <tr><td colspan="5" class="px-4 py-6 text-center text-gray-400 text-sm">로딩 중...</td></tr>
          </tbody>
        </table>
      </div>

      <!-- 퀵·용차 섹션 -->
      <div id="sectionQuick" class="mb-6 ds-card overflow-hidden">
        <div class="flex items-center justify-between px-4 py-3 bg-white border-b border-gray-200">
          <h3 class="text-sm font-semibold text-gray-700"><i class="fas fa-motorcycle mr-1"></i>퀵·용차</h3>
          <button id="btnSendQuick" onclick="openShipmentSendModal('quick')" class="px-2 py-1 text-xs border border-gray-300 text-gray-600 rounded hover:bg-gray-50 hidden">
            <i class="fas fa-paper-plane mr-1"></i>선택 발송
          </button>
        </div>
        <table class="ds-table w-full text-sm ds-table-striped">
          <thead>
            <tr>
              <th class="px-3 py-2 w-8"><input type="checkbox" onchange="toggleSectionCheck('quick', this.checked)" class="rounded" title="전체 선택"></th>
              <th class="px-3 py-2 text-left">거래처</th>
              <th class="px-3 py-2 text-left">배송지</th>
              <th class="px-3 py-2 text-left">연락처</th>
              <th class="px-3 py-2 text-center w-28">안내용지</th>
            </tr>
          </thead>
          <tbody id="tbody-quick">
            <tr><td colspan="5" class="px-4 py-6 text-center text-gray-400 text-sm">로딩 중...</td></tr>
          </tbody>
        </table>
      </div>

      <!-- 기타 섹션 (숨김, 데이터 있으면 표시) -->
      <div id="sectionEtc" class="mb-6 ds-card overflow-hidden hidden">
        <div class="px-4 py-3 bg-gray-50 border-b border-gray-100">
          <h3 class="text-sm font-bold text-gray-700"><i class="fas fa-ellipsis-h mr-1"></i>기타</h3>
        </div>
        <table class="ds-table w-full text-sm ds-table-striped">
          <thead>
            <tr>
              <th class="px-3 py-2 text-left">거래처</th>
              <th class="px-3 py-2 text-left">배송방법</th>
              <th class="px-3 py-2 text-left">택배사</th>
              <th class="px-3 py-2 text-left">배송주소</th>
            </tr>
          </thead>
          <tbody id="tbody-etc">
            <tr><td colspan="4" class="px-4 py-6 text-center text-gray-400 text-sm">로딩 중...</td></tr>
          </tbody>
        </table>
      </div>

      <!-- 배송 중 (출고 처리됨, SHIPPED 대기) -->
      <div id="sectionInTransit" class="mb-6 ds-card overflow-hidden hidden">
        <div class="flex items-center justify-between px-4 py-3 bg-indigo-50 border-b border-indigo-100">
          <h3 class="text-sm font-semibold text-indigo-700"><i class="fas fa-truck-moving mr-1"></i>배송 중 <span id="badgeInTransit" class="ml-1 px-2 py-0.5 rounded-full text-xs bg-indigo-100 text-indigo-700">0건</span></h3>
          <div class="flex items-center gap-2">
            <span id="syncLastTime" class="text-xs text-gray-400"></span>
            <button onclick="runSyncStatuses()" class="px-3 py-1 text-xs bg-indigo-600 text-white rounded hover:bg-indigo-700">
              <i class="fas fa-sync-alt mr-1"></i>상태 동기화
            </button>
          </div>
        </div>
        <table class="ds-table w-full text-sm ds-table-striped">
          <thead>
            <tr>
              <th class="px-3 py-2 text-left">주문번호</th>
              <th class="px-3 py-2 text-left">거래처</th>
              <th class="px-3 py-2 text-center">배송방식</th>
              <th class="px-3 py-2 text-center">출고일</th>
              <th class="px-3 py-2 text-center">예상 완료일</th>
              <th class="px-3 py-2 text-center">상태</th>
            </tr>
          </thead>
          <tbody id="tbody-intransit">
            <tr><td colspan="6" class="px-4 py-6 text-center text-gray-400 text-sm">로딩 중...</td></tr>
          </tbody>
        </table>
      </div>

      <!-- 출고 알림 발송 모달 -->
      <div id="shipmentSendModal" class="hidden fixed inset-0 z-50 flex items-center justify-center bg-black/50">
        <div class="bg-white rounded-lg shadow-xl w-[550px] max-h-[80vh] overflow-y-auto p-6">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-lg font-bold text-gray-800">출고 알림 발송</h3>
            <button onclick="closeShipmentSendModal()" class="text-gray-400 hover:text-gray-600"><i class="fas fa-times"></i></button>
          </div>

          <div class="space-y-4">
            <!-- 채널 선택 -->
            <div class="flex gap-2">
              <button onclick="setShipSendChannel('alimtalk')" id="shipChannelAlimtalk" class="flex-1 px-3 py-2 text-sm rounded-lg border-2 border-blue-500 bg-blue-50 text-blue-700 font-medium">
                <i class="fas fa-comment-dots mr-1"></i>카카오톡
              </button>
              <button onclick="setShipSendChannel('sms')" id="shipChannelSms" class="flex-1 px-3 py-2 text-sm rounded-lg border-2 border-gray-200 text-gray-600">
                <i class="fas fa-sms mr-1"></i>문자
              </button>
            </div>

            <!-- 대상 목록 -->
            <div>
              <label class="text-sm font-semibold text-gray-700 mb-1 block">발송 대상</label>
              <div id="shipSendTargets" class="max-h-32 overflow-y-auto border rounded-lg p-2 text-sm space-y-1"></div>
              <div id="shipSendNoMobile" class="text-xs text-amber-600 mt-1 hidden"></div>
            </div>

            <!-- 알림톡: 템플릿 선택 -->
            <div id="shipAlimtalkArea">
              <label class="text-sm font-semibold text-gray-700 mb-1 block">템플릿</label>
              <select id="shipTemplateSelect" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" onchange="onShipTemplateChange()">
                <option value="">직접 작성</option>
              </select>
            </div>

            <!-- 문자: 직접 입력 -->
            <div id="shipSmsArea" class="hidden">
              <label class="text-sm font-semibold text-gray-700 mb-1 block">제목 <span class="text-xs text-gray-400">(입력 시 LMS)</span></label>
              <input type="text" id="shipSmsSubject" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="제목 (선택)">
            </div>

            <!-- 메시지 내용 -->
            <div>
              <label class="text-sm font-semibold text-gray-700 mb-1 block">메시지 내용</label>
              <textarea id="shipSendContent" rows="6" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="메시지 내용"></textarea>
              <p class="text-xs text-gray-400 mt-1">#{고객명}, #{품목}, #{배송방법}, #{송장번호}, #{터미널}, #{날짜} 변수를 사용할 수 있습니다</p>
            </div>
          </div>

          <div class="flex justify-end gap-2 mt-6">
            <button onclick="closeShipmentSendModal()" class="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50">취소</button>
            <button onclick="sendShipmentBulk()" class="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
              <i class="fas fa-paper-plane mr-1"></i><span id="shipSendBtnText">발송</span>
            </button>
          </div>
        </div>
      </div>

      <!-- 프린트 전용 영역: 라벨 (화면에는 숨김) -->
      <div id="printArea"></div>
      <!-- 프린트 전용 영역: A4 가로 출고 리스트 -->
      <div id="printListArea"></div>
    `,
    pageScript
  })
}
