import type { Context } from 'hono'
import type { HonoEnv } from '../types/env'
import { renderPage } from '../layout'
import pageScript from '../scripts/shipments.js?raw'
import shipmentsDashboardScript from '../scripts/shipmentsDashboard.js?raw'

export function shipmentsPage(c: Context<HonoEnv>) {
  // ③ 흡수(2026-07-17): 실행/준비상태 탭 전환 + 역할 게이팅(OPERATOR=준비상태 전용)
  const tabScript = `
    (function(){
      var __shipRole = ''; try { __shipRole = (JSON.parse(localStorage.getItem('user')||'{}').role) || ''; } catch(e){}
      window.__shipPrepLoaded = false;
      window.switchShipTab = function(tab){
        var defs = [ {k:'exec',btn:'shipExecTab',c:'shipExecContent'}, {k:'prep',btn:'shipPrepTab',c:'shipPrepContent'}, {k:'hist',btn:'shipHistTab',c:'shipHistContent'} ];
        defs.forEach(function(d){
          var b = document.getElementById(d.btn), ct = document.getElementById(d.c);
          if(!b || !ct){ console.warn('[shipments] tab not found: ' + d.k); return; }
          if(d.k === tab){
            b.classList.remove('border-transparent','text-gray-500'); b.classList.add('border-blue-600','text-blue-600'); ct.classList.remove('hidden');
          } else {
            b.classList.remove('border-blue-600','text-blue-600'); b.classList.add('border-transparent','text-gray-500'); ct.classList.add('hidden');
          }
        });
        // 준비상태 탭 최초 진입 시에만 lazy-load (shipmentsDashboard.js)
        if(tab === 'prep' && typeof window.loadDashboard === 'function' && !window.__shipPrepLoaded){
          window.__shipPrepLoaded = true; window.loadDashboard();
        }
        // 이력 탭도 최초 진입 시 1회 — 표가 hidden 이면 도구모음(열 선택)이 붙지 않는다
        if(tab === 'hist' && typeof window.initShipHistory === 'function'){ window.initShipHistory(); }
      };
      document.addEventListener('DOMContentLoaded', function(){
        // OPERATOR(현장): 사무실 라벨 '실행' 탭 숨기고 '준비상태' 전용
        if(__shipRole === 'OPERATOR'){
          var et = document.getElementById('shipExecTab'); if(et) et.style.display = 'none';
          window.switchShipTab('prep');
        }
      });
    })();
  `;
  const combinedScript = pageScript + '\n' + shipmentsDashboardScript + '\n' + tabScript;
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

      <!-- ③ 흡수(2026-07-17): 택배사별 실행 / 준비상태(구 /shipments-dashboard) 탭 -->
      <div class="flex border-b mb-4" id="shipTabNav">
        <button id="shipExecTab" onclick="switchShipTab('exec')" class="px-5 py-3 text-sm font-medium border-b-2 border-blue-600 text-blue-600"><i class="fas fa-truck mr-1"></i>택배사별 실행</button>
        <button id="shipPrepTab" onclick="switchShipTab('prep')" class="px-5 py-3 text-sm font-medium border-b-2 border-transparent text-gray-500 hover:text-gray-700"><i class="fas fa-clipboard-check mr-1"></i>준비상태</button>
        <button id="shipHistTab" onclick="switchShipTab('hist')" class="px-5 py-3 text-sm font-medium border-b-2 border-transparent text-gray-500 hover:text-gray-700"><i class="fas fa-clock-rotate-left mr-1"></i>이력</button>
      </div>

      <div id="shipExecContent">
      <!-- 헤더: 날짜 탐색 + 배지 -->
      <div class="ds-filter-bar">
        <div class="ds-filter-field">
          <label class="ds-label">날짜</label>
          <div class="flex items-center gap-1">
            <button onclick="changeDate(-1)" class="ds-btn ds-btn-secondary ds-btn-sm" style="min-width:32px">◀</button>
            <input type="text" maxlength="10" inputmode="numeric" placeholder="예: 2026-01-15" id="shipDate" onchange="loadShipmentsByDate()" class="js-fp ds-input" style="min-width:140px">
            <button onclick="changeDate(1)" class="ds-btn ds-btn-secondary ds-btn-sm" style="min-width:32px">▶</button>
            <button onclick="goToday()" class="ds-btn ds-btn-sm" style="background:var(--c-primary-light);color:var(--c-primary);border:1px solid var(--c-primary)">오늘</button>
          </div>
        </div>
        <div class="ds-filter-divider"></div>
        <div class="ds-filter-chips">
          <span id="badgeFreight" class="ds-chip" onclick="scrollToSection('sectionFreight')"><i class="fas fa-truck" style="margin-right:4px"></i>대신화물 0건</span>
          <span id="badgeDaesintaekbae" class="ds-chip" onclick="scrollToSection('sectionDaesintaekbae')"><i class="fas fa-box" style="margin-right:4px"></i>대신택배 0건</span>
          <span id="badgeHanjin" class="ds-chip" onclick="scrollToSection('sectionHanjin')"><i class="fas fa-box" style="margin-right:4px"></i>한진택배 0건</span>
          <span id="badgeQuick" class="ds-chip" onclick="scrollToSection('sectionQuick')"><i class="fas fa-bolt" style="margin-right:4px"></i>퀵·용차 0건</span>
          <span id="badgeJikbae" class="ds-chip" onclick="scrollToSection('sectionJikbae')"><i class="fas fa-truck-pickup" style="margin-right:4px"></i>직접배송 0건</span>
        </div>
        <div class="ds-filter-actions">
          <button onclick="printShipmentList('daeshin')" class="ds-btn ds-btn-secondary ds-btn-sm" title="대신(화물+택배) 출고 리스트 A4 인쇄">
            <i class="fas fa-list-alt" style="margin-right:4px"></i>대신 리스트
          </button>
          <button onclick="printShipmentList('hanjin')" class="ds-btn ds-btn-secondary ds-btn-sm" title="한진택배 출고 리스트 A4 인쇄">
            <i class="fas fa-list-alt" style="margin-right:4px"></i>한진 리스트
          </button>
        </div>
      </div>

      <!-- 합배송 후보 (법인 통합, P2) — 후보 있을 때만 표시 -->
      <div id="consolidationCard" class="mb-6 ds-card overflow-hidden hidden">
        <div class="flex items-center justify-between px-4 py-3 bg-amber-50 border-b border-amber-200">
          <h3 class="text-sm font-semibold text-amber-800">
            <i class="fas fa-object-group mr-1"></i>합배송 후보 <span id="consolidationCount" class="ml-1 text-xs font-normal"></span>
          </h3>
          <span class="text-xs text-amber-700">같은 날 출고가 같은 거래처·권역으로 겹치는 건 (법인 통합)</span>
        </div>
        <div id="consolidationBody" class="p-4 text-sm space-y-2"></div>
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
              <i class="fas fa-print mr-1"></i>선택 라벨 출력
            </button>
            <button onclick="confirmShipSection('freight')" class="px-3 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700">
              <i class="fas fa-truck mr-1"></i>출고 확정
            </button>
          </div>
        </div>
        <table class="ds-table w-full text-sm ds-table-striped ds-table-fixed">
          <thead>
            <tr>
              <th class="col-check text-center" style="width:40px"><input type="checkbox" onchange="toggleSectionCheck('freight', this.checked)" class="rounded" title="전체 선택"></th>
              <th class="col-name text-left">거래처</th>
              <th class="text-left" style="width:140px">터미널</th>
              <th class="col-flex text-left hidden md:table-cell">품목</th>
              <th class="col-qty text-center" style="width:70px">라벨</th>
              <th class="col-qty text-center" style="width:70px">박스</th>
              <th class="col-action text-center" style="width:70px">출력</th>
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
              <i class="fas fa-print mr-1"></i>선택 라벨 출력
            </button>
            <button onclick="confirmShipSection('daesintaekbae')" class="px-3 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700">
              <i class="fas fa-truck mr-1"></i>출고 확정
            </button>
          </div>
        </div>
        <table class="ds-table w-full text-sm ds-table-striped ds-table-fixed">
          <thead>
            <tr>
              <th class="col-check text-center" style="width:40px"><input type="checkbox" onchange="toggleSectionCheck('daesintaekbae', this.checked)" class="rounded" title="전체 선택"></th>
              <th class="col-name text-left">거래처</th>
              <th class="col-flex text-left">배송주소</th>
              <th class="col-flex text-left hidden md:table-cell">품목</th>
              <th class="col-qty text-center" style="width:70px">라벨</th>
              <th class="col-qty text-center" style="width:70px">박스</th>
              <th class="col-action text-center" style="width:70px">출력</th>
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
            <button onclick="downloadHanjinExcel()" class="px-2 py-1 text-xs border border-gray-300 text-gray-600 rounded hover:bg-gray-50" title="선택(없으면 전체) 한진 출고건을 한진 대량등록 양식 엑셀로 다운로드">
              <i class="fas fa-file-excel mr-1"></i>한진 업로드 엑셀
            </button>
            <button id="btnSendHanjin" onclick="openShipmentSendModal('hanjin')" class="px-2 py-1 text-xs border border-gray-300 text-gray-600 rounded hover:bg-gray-50 hidden">
              <i class="fas fa-paper-plane mr-1"></i>선택 발송
            </button>
            <button onclick="confirmShipSection('hanjin')" class="px-3 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700">
              <i class="fas fa-truck mr-1"></i>출고 확정
            </button>
          </div>
        </div>
        <table class="ds-table w-full text-sm ds-table-striped ds-table-fixed">
          <thead>
            <tr>
              <th class="col-check text-center" style="width:40px"><input type="checkbox" onchange="toggleSectionCheck('hanjin', this.checked)" class="rounded" title="전체 선택"></th>
              <th class="col-name text-left">거래처</th>
              <th class="col-flex text-left">배송주소</th>
              <th class="text-left" style="width:220px">송장번호</th>
              <th class="col-action text-center" style="width:70px">저장</th>
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
        <table class="ds-table w-full text-sm ds-table-striped ds-table-fixed">
          <thead>
            <tr>
              <th class="col-check text-center" style="width:40px"><input type="checkbox" onchange="toggleSectionCheck('quick', this.checked)" class="rounded" title="전체 선택"></th>
              <th class="col-name text-left">거래처</th>
              <th class="col-flex text-left">배송지</th>
              <th class="col-phone text-left" style="width:120px">연락처</th>
              <th class="col-action text-center" style="width:90px">안내용지</th>
            </tr>
          </thead>
          <tbody id="tbody-quick">
            <tr><td colspan="5" class="px-4 py-6 text-center text-gray-400 text-sm">로딩 중...</td></tr>
          </tbody>
        </table>
      </div>

      <!-- 직접배송 섹션 (자사 기사 배송, 배송 후속 P2). 내부 키 jikbae 는 그대로 — 식별자라 바꿀 이유가 없다 -->
      <div id="sectionJikbae" class="mb-6 ds-card overflow-hidden">
        <div class="flex items-center justify-between px-4 py-3 bg-white border-b border-gray-200">
          <h3 class="text-sm font-semibold text-gray-700"><i class="fas fa-truck-pickup mr-1"></i>직접배송</h3>
          <div class="flex items-center gap-2">
            <button id="btnSendJikbae" onclick="openShipmentSendModal('jikbae')" class="px-2 py-1 text-xs border border-gray-300 text-gray-600 rounded hover:bg-gray-50 hidden">
              <i class="fas fa-paper-plane mr-1"></i>선택 발송
            </button>
            <button onclick="confirmShipSection('jikbae')" class="px-3 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700">
              <i class="fas fa-truck mr-1"></i>출고 확정
            </button>
          </div>
        </div>
        <table class="ds-table w-full text-sm ds-table-striped ds-table-fixed">
          <thead>
            <tr>
              <th class="col-check text-center" style="width:40px"><input type="checkbox" onchange="toggleSectionCheck('jikbae', this.checked)" class="rounded" title="전체 선택"></th>
              <th class="col-name text-left">거래처</th>
              <th class="col-flex text-left">배송지</th>
              <th class="col-phone text-left" style="width:120px">연락처</th>
              <th class="text-center" style="width:80px">시간</th>
              <th class="col-action text-center" style="width:90px">안내용지</th>
            </tr>
          </thead>
          <tbody id="tbody-jikbae">
            <tr><td colspan="6" class="px-4 py-6 text-center text-gray-400 text-sm">로딩 중...</td></tr>
          </tbody>
        </table>
      </div>

      <!-- 기타 섹션 (숨김, 데이터 있으면 표시) -->
      <div id="sectionEtc" class="mb-6 ds-card overflow-hidden hidden">
        <div class="px-4 py-3 bg-gray-50 border-b border-gray-100">
          <h3 class="text-sm font-bold text-gray-700"><i class="fas fa-ellipsis-h mr-1"></i>기타</h3>
        </div>
        <table class="ds-table w-full text-sm ds-table-striped ds-table-fixed">
          <thead>
            <tr>
              <th class="col-name text-left">거래처</th>
              <th class="col-tag text-left" style="width:100px">배송방법</th>
              <th class="col-tag text-left" style="width:100px">택배사</th>
              <th class="col-flex text-left">배송주소</th>
            </tr>
          </thead>
          <tbody id="tbody-etc">
            <tr><td colspan="4" class="px-4 py-6 text-center text-gray-400 text-sm">로딩 중...</td></tr>
          </tbody>
        </table>
      </div>

      <!-- 배송 중 (출고 처리됨, SHIPPED 대기) -->
      <div id="sectionInTransit" class="mb-6 ds-card overflow-hidden hidden">
        <div class="flex items-center justify-between px-4 py-3 bg-blue-50 border-b border-blue-100">
          <h3 class="text-sm font-semibold text-blue-700"><i class="fas fa-truck-moving mr-1"></i>배송 중 <span id="badgeInTransit" class="ml-1 px-2 py-0.5 rounded-full text-xs bg-blue-100 text-blue-700">0건</span></h3>
          <div class="flex items-center gap-2">
            <span id="syncLastTime" class="text-xs text-gray-400"></span>
            <button onclick="runSyncStatuses()" class="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700">
              <i class="fas fa-sync-alt mr-1"></i>상태 동기화
            </button>
          </div>
        </div>
        <table class="ds-table w-full text-sm ds-table-striped ds-table-fixed">
          <thead>
            <tr>
              <th class="col-code text-left" style="width:100px">주문번호</th>
              <th class="col-name text-left">거래처</th>
              <th class="col-tag text-center" style="width:90px">배송방식</th>
              <th class="col-date text-center" style="width:100px">출고일</th>
              <th class="col-date text-center" style="width:100px">예상 완료일</th>
              <th class="col-status text-center" style="width:80px">상태</th>
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

      <!-- 포장 검수 모달 (출고관리 v2 P1) -->
      <div id="shipCheckModal" class="hidden fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
        <div class="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col">
          <div class="flex items-center justify-between px-5 py-3 border-b">
            <h3 class="text-base font-bold text-gray-800"><i class="fas fa-clipboard-check mr-1 text-green-600"></i>포장 검수 <span id="shipCheckClientName" class="ml-1 text-sm font-normal text-gray-500"></span></h3>
            <button onclick="closeShipCheckModal()" class="text-gray-400 hover:text-gray-600"><i class="fas fa-times"></i></button>
          </div>
          <div id="shipCheckBody" class="flex-1 overflow-y-auto px-5 py-3 text-sm"></div>
          <div class="px-5 py-3 border-t flex flex-wrap items-center justify-between gap-2">
            <div class="flex items-center gap-2">
              <button onclick="printShipCheckSheet()" class="ds-btn ds-btn-secondary ds-btn-sm" title="포장대 검수용 체크박스 명세서 (QR 포함)"><i class="fas fa-print mr-1"></i>검수 체크지</button>
              <button onclick="printShipDeliveryNote()" class="ds-btn ds-btn-secondary ds-btn-sm" title="박스 동봉 거래처용 납품명세서 (가격 제외)"><i class="fas fa-file-alt mr-1"></i>납품명세서</button>
            </div>
            <div class="flex items-center gap-2">
              <button onclick="closeShipCheckModal()" class="ds-btn ds-btn-sm">닫기</button>
              <button onclick="saveShipCheckModal()" class="ds-btn ds-btn-sm" style="background:#16a34a;color:#fff"><i class="fas fa-check mr-1"></i>검수 저장</button>
            </div>
          </div>
        </div>
      </div>
      </div><!-- /shipExecContent -->

      <!-- 준비상태 탭 (구 /shipments-dashboard 흡수) -->
      <!-- ===== 이력 탭 (설계: docs/specs/2026-08-09-shipment-history-list.md) =====
           정본 = 주문 출고완료(orders.status=SHIPPED). shipments 테이블은 prod 0건이라 쓰지 않는다.
           조회는 /api/orders 를 그대로 쓴다 — 전용 엔드포인트를 만들면 조회조건이 또 두 벌이 된다. -->
      <div id="shipHistContent" class="hidden">
        <div class="ds-filter-bar">
          <div class="ds-filter-field">
            <label class="ds-label">출고일 from</label>
            <input type="text" maxlength="10" inputmode="numeric" placeholder="예: 2026-01-15" id="histDateFrom" class="js-fp ds-input" onchange="loadShipHistory(1)">
          </div>
          <div class="ds-filter-field">
            <label class="ds-label">~ to</label>
            <input type="text" maxlength="10" inputmode="numeric" placeholder="예: 2026-01-15" id="histDateTo" class="js-fp ds-input" onchange="loadShipHistory(1)">
          </div>
          <div class="ds-filter-field" style="flex:1;min-width:180px">
            <label class="ds-label">검색</label>
            <input type="text" id="histSearch" placeholder="주문번호, 거래처명, 품목명..." class="ds-input"
              onkeydown="if(event.key==='Enter')loadShipHistory(1)">
          </div>
          <div class="ds-filter-field" style="min-width:120px">
            <label class="ds-label">배송방법</label>
            <select id="histMethod" class="ds-input" onchange="loadShipHistory(1)">
              <option value="">전체</option>
              <option value="대신택배">대신택배</option>
              <option value="대신화물">대신화물</option>
              <option value="한진택배">한진택배</option>
              <option value="직접배송">직접배송</option>
              <option value="용차">용차</option>
              <option value="퀵">퀵</option>
              <option value="방문수령">방문수령</option>
            </select>
          </div>
          <!-- 정렬은 13개 목록 중 여기만 없었다(서버는 지원하는데 클라가 ship_date_desc 로 고정 전송).
               옵션은 ORDER_SORT_OPTIONS 에 이미 있는 키만 쓴다 — 없는 키를 보내면 조용히 기본 정렬로 떨어진다. -->
          <div class="ds-filter-field" style="min-width:150px">
            <label class="ds-label">정렬</label>
            <select id="histSort" class="ds-input" onchange="loadShipHistory(1)">
              <option value="ship_date_desc">출고일 최신순</option>
              <option value="ship_date_asc">출고일 오래된순</option>
              <option value="final_amount_desc">금액 큰순</option>
              <option value="final_amount_asc">금액 작은순</option>
              <option value="client_name_asc">거래처명 가나다순</option>
              <option value="order_date_desc">주문일 최신순</option>
            </select>
          </div>
          <div class="ds-filter-actions">
            <button onclick="resetShipHistoryFilters()" class="ds-btn ds-btn-secondary ds-btn-sm"><i class="fas fa-undo" style="margin-right:4px"></i>초기화</button>
            <button onclick="loadShipHistory(1)" class="ds-btn ds-btn-primary ds-btn-sm"><i class="fas fa-search" style="margin-right:4px"></i>검색</button>
          </div>
        </div>

        <div id="histFilterChips" class="ds-conds mb-2"></div>
        <div id="histListToolbar"></div>

        <style>
          /* 「주문일 대체」 배지가 좁은 셀에서 '...' 로 잘리면 대체 사실이 안 보인다 — 이 열만 넘침 허용 */
          .ds-table.hist-tbl td.hist-date { overflow: visible; white-space: nowrap; }
        </style>
        <div class="ds-card" style="padding:0;overflow:hidden;">
          <div class="ds-table-wrap" style="max-height: calc(100vh - 340px); overflow-y: auto;">
            <table class="ds-table ds-table-striped hist-tbl">
              <thead>
                <tr>
                  <!-- data-col = '열 선택'(dsListToolbar) 대상 -->
                  <th style="width:158px" data-col="ship_date">출고일</th>
                  <th style="width:108px" data-col="order_number">주문번호</th>
                  <th style="width:150px" data-col="client">거래처</th>
                  <th data-col="item">품목</th>
                  <th style="width:100px" data-col="method">배송방법</th>
                  <th style="width:96px" data-col="delivery_date">납기일</th>
                  <th style="width:104px;text-align:right" data-col="amount">금액</th>
                  <th style="width:82px;text-align:center" data-col="billing">회계반영</th>
                </tr>
              </thead>
              <tbody id="histTableBody">
                <tr><td colspan="8" class="px-4 py-8 text-center" style="color:var(--c-text-muted)">이력 탭을 열면 조회합니다.</td></tr>
              </tbody>
            </table>
          </div>
          <div id="histSummaryBar" class="ds-summary"></div>
          <div id="histPagination" class="px-6 py-3 flex items-center gap-2 flex-wrap" style="border-top:1px solid var(--c-border)"></div>
        </div>
      </div>

      <div id="shipPrepContent" class="hidden">
        <div class="ds-container space-y-4">
          <!-- 필터 영역 -->
          <div class="ds-card p-3">
            <div class="flex flex-wrap items-end gap-3">
              <div>
                <label class="block text-[10px] text-gray-400 mb-1">날짜</label>
                <input type="text" maxlength="10" inputmode="numeric" placeholder="예: 2026-01-15" id="dashDate" class="js-fp border rounded px-2 py-1 text-xs" style="color:var(--c-text);" />
              </div>
              <div>
                <label class="block text-[10px] text-gray-400 mb-1">배송방법</label>
                <select id="dashMethod" class="border rounded px-2 py-1 text-xs" style="color:var(--c-text);">
                  <option value="">전체</option>
                  <option value="택배">택배</option>
                  <option value="방문수령">방문수령</option>
                  <option value="퀵">퀵</option>
                  <option value="직접배송">직접배송</option>
                  <option value="화물">화물</option>
                </select>
              </div>
              <div>
                <label class="block text-[10px] text-gray-400 mb-1">상태</label>
                <select id="dashStatus" class="border rounded px-2 py-1 text-xs" style="color:var(--c-text);">
                  <option value="all">전체</option>
                  <option value="ready">출고 가능</option>
                  <option value="pending">미완료</option>
                </select>
              </div>
              <div class="ml-auto flex items-center gap-2">
                <button onclick="window.resetDashFilters()" class="text-gray-500 text-xs">초기화</button>
                <button onclick="window.loadDashboard()" class="px-3 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 transition-all">
                  <i class="fas fa-search mr-1"></i>검색
                </button>
              </div>
            </div>
          </div>

          <!-- 요약 카드 -->
          <div class="grid grid-cols-3 gap-2">
            <div class="ds-card p-2.5 text-center hover:shadow-md transition-shadow">
              <div id="dashTotal" class="text-xl font-bold tabular-nums" style="color:var(--c-text);">-</div>
              <div class="text-[10px] text-gray-400">전체</div>
            </div>
            <div class="ds-card p-2.5 text-center hover:shadow-md transition-shadow">
              <div id="dashReady" class="text-xl font-bold tabular-nums text-green-600">-</div>
              <div class="text-[10px] text-gray-400">출고 가능</div>
            </div>
            <div class="ds-card border-amber-200 p-2.5 text-center hover:shadow-md transition-shadow">
              <div id="dashPending" class="text-xl font-bold tabular-nums text-amber-600">-</div>
              <div class="text-[10px] text-amber-500 font-medium">미완료</div>
            </div>
          </div>

          <!-- 대시보드 콘텐츠 -->
          <div id="dashContent">
            <div class="space-y-2">
              <div class="ds-skeleton ds-skeleton-card"></div>
              <div class="ds-skeleton ds-skeleton-card"></div>
              <div class="ds-skeleton ds-skeleton-card"></div>
            </div>
          </div>
        </div>
      </div>

      <!-- 프린트 전용 영역: 라벨 (화면에는 숨김) -->
      <div id="printArea"></div>
      <!-- 프린트 전용 영역: A4 가로 출고 리스트 -->
      <div id="printListArea"></div>
    `,
    pageScript: combinedScript
  })
}
