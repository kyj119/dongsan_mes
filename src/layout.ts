// src/layout.ts — 공유 레이아웃 조립 (메뉴/사이드바/상단바/CSS/JS 분리됨)
import type { Context } from 'hono'
import type { HonoEnv } from './types/env'
import { STATUS_LABELS_JS } from './utils/statusLabels'
import { sidebarHTML } from './layout/sidebar'
import { topBarHTML } from './layout/topbar'
import { SHARED_CSS } from './layout/shared-styles'
// shell.js는 워커 인라인(?raw). 정적 /static 서빙은 CF Pages 자동빌드에서 _routes.json 제외가
// 불안정해 prod 2회 장애(2026-06-11) → 인라인 복귀. 재시도 시 [[feedback-static-asset-mime]] 참조.
import SHARED_AUTH_JS from './scripts/layout/shell.js?raw'

interface AppLayoutOptions {
  title: string
  activePage: string
  pageCSS?: string
  pageContent: string
  pageScript: string
  pageHeadExtra?: string
}

export function renderPage(c: Context<HonoEnv>, opts: AppLayoutOptions) {
  c.header('Cache-Control', 'no-store, no-cache, must-revalidate')
  if (c.req.header('X-SPA-Request') === '1') {
    return c.json({
      title: opts.title,
      pageCSS: opts.pageCSS || '',
      pageContent: opts.pageContent,
      pageScript: opts.pageScript,
    })
  }
  return c.html(appLayout(opts))
}

export function appLayout(opts: AppLayoutOptions): string {
  return `<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="build-time" content="${new Date().toISOString()}">
    <title>${opts.title} - ERP+MES</title>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css">
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap">
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
    <script src="https://cdn.jsdelivr.net/npm/axios@1.6.0/dist/axios.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/qrcode@1.5.4/build/qrcode.min.js"></script>
    <script src="//t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js"></script>
    <link href="https://cdn.jsdelivr.net/npm/quill@2.0.3/dist/quill.snow.css" rel="stylesheet">
    <script src="https://cdn.jsdelivr.net/npm/quill@2.0.3/dist/quill.js"></script>
    ${SHARED_CSS}
    ${opts.pageCSS ? `<style id="page-css">${opts.pageCSS}</style>` : ''}
    ${opts.pageHeadExtra || ''}
</head>
<body class="perm-checking">
    ${sidebarHTML(opts.activePage)}
    <div class="main-content" role="main">
        ${topBarHTML(opts.title)}
        <div class="page-body" id="mainContent">
            ${opts.pageContent}
        </div>
    </div>
    <!-- 통합 메시지 발송 모달 (전역) -->
    <div id="msgSendModal" class="hidden fixed inset-0 z-[60] flex items-center justify-center bg-black/50">
      <div class="bg-white rounded-lg shadow-xl w-[720px] max-h-[85vh] overflow-y-auto p-6">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-lg font-bold text-gray-800">메시지 발송</h3>
          <button onclick="closeMsgSendModal()" class="text-gray-400 hover:text-gray-600"><i class="fas fa-times"></i></button>
        </div>
        <div class="flex gap-6">
          <div class="flex-1 space-y-3">
            <div class="flex gap-1.5 flex-wrap">
              <button onclick="setMsgChannel(&apos;kakao&apos;)" id="msgChKakao" class="px-3 py-1.5 rounded-full text-xs font-medium bg-blue-50 border-2 border-blue-500 text-blue-700"><i class="fas fa-comment mr-1"></i>카카오톡</button>
              <button onclick="setMsgChannel(&apos;sms&apos;)" id="msgChSms" class="px-3 py-1.5 rounded-full text-xs font-medium bg-white border border-gray-300 text-gray-600"><i class="fas fa-sms mr-1"></i>문자</button>
              <button onclick="setMsgChannel(&apos;email&apos;)" id="msgChEmail" class="px-3 py-1.5 rounded-full text-xs font-medium bg-white border border-gray-300 text-gray-600"><i class="fas fa-envelope mr-1"></i>이메일</button>
              <button onclick="setMsgChannel(&apos;fax&apos;)" id="msgChFax" class="px-3 py-1.5 rounded-full text-xs font-medium bg-white border border-gray-300 text-gray-600"><i class="fas fa-fax mr-1"></i>팩스</button>
            </div>
            <div class="flex gap-2">
              <div class="flex-1">
                <label class="text-xs font-semibold text-gray-600 mb-1 block">수신자</label>
                <input type="text" id="msgRecvName" class="w-full border rounded-lg px-3 py-2 text-sm bg-gray-50" readonly>
              </div>
              <div class="flex-1">
                <label class="text-xs font-semibold text-gray-600 mb-1 block" id="msgRecvLabel">수신번호</label>
                <input type="text" id="msgRecvAddr" class="w-full border rounded-lg px-3 py-2 text-sm">
              </div>
            </div>
            <div id="msgKakaoArea">
              <label class="text-xs font-semibold text-gray-600 mb-1 block">카카오톡 템플릿</label>
              <select id="msgTemplate" class="w-full border rounded-lg px-3 py-2 text-sm" onchange="onMsgTemplateChange()">
                <option value="">직접 작성</option>
              </select>
            </div>
            <div id="msgSubjectArea" class="hidden">
              <label class="text-xs font-semibold text-gray-600 mb-1 block">제목 <span id="msgSubjectHint" class="text-gray-400 font-normal"></span></label>
              <input type="text" id="msgSubject" class="w-full border rounded-lg px-3 py-2 text-sm" placeholder="제목">
            </div>
            <div>
              <label class="text-xs font-semibold text-gray-600 mb-1 block">내용</label>
              <!-- 일반 텍스트 (카카오/SMS/팩스) -->
              <div id="msgBodyTextArea">
                <textarea id="msgBody" rows="5" class="w-full border rounded-lg px-3 py-2 text-sm" placeholder="메시지 내용" oninput="if(_msgChannel===&apos;sms&apos;)updateMsgByteCounter();updateMsgPreview()"></textarea>
              </div>
              <!-- 이메일 HTML 에디터 -->
              <div id="msgBodyEditorArea" class="hidden">
                <div id="msgQuillEditor" style="min-height:120px;"></div>
              </div>
              <div class="flex justify-between mt-1">
                <span id="msgChannelInfo" class="text-xs text-blue-600 font-medium">카카오톡</span>
                <span id="msgByteCounter" class="text-xs text-gray-400 hidden">0 / 90 byte</span>
              </div>
            </div>
            <!-- 포털 링크 -->
            <div id="msgPortalLinkArea">
              <label class="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" id="msgPortalLinkToggle" class="w-4 h-4 text-blue-600 rounded">
                <span class="text-xs font-semibold text-gray-600">거래 내역 확인 링크 포함</span>
              </label>
            </div>
            <!-- 예약 발송 -->
            <div id="msgScheduleArea" class="hidden">
              <label class="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" id="msgScheduleToggle" class="w-4 h-4 text-blue-600 rounded" onchange="toggleScheduleInput()">
                <span class="text-xs font-semibold text-gray-600">예약 발송</span>
              </label>
              <div id="msgScheduleInput" class="hidden mt-2">
                <input type="datetime-local" id="msgScheduleAt" class="w-full border rounded-lg px-3 py-2 text-sm">
                <div class="text-xs text-gray-400 mt-1">지정한 시간에 자동 발송됩니다 (카카오톡/SMS만 지원)</div>
              </div>
            </div>
            <div class="flex items-center justify-between pt-3 border-t">
              <div id="msgSendStatus" class="text-xs text-gray-400"></div>
              <div class="flex gap-2">
                <button onclick="closeMsgSendModal()" class="px-4 py-2 border text-gray-700 rounded-lg text-sm hover:bg-gray-50">취소</button>
                <button onclick="execMsgSend()" id="msgSendBtn" class="px-5 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
                  <i class="fas fa-paper-plane mr-1"></i>발송
                </button>
              </div>
            </div>
          </div>
          <div class="w-[220px] flex-shrink-0">
            <div class="text-xs font-semibold text-gray-600 mb-2 text-center">미리보기</div>
            <div id="msgPreviewArea">
              <div id="msgPreviewKakao" class="bg-[#b2c7d9] rounded-2xl p-3 min-h-[260px]">
                <div class="bg-white rounded-xl p-3 shadow-sm">
                  <div class="text-xs font-bold text-gray-800 mb-1">동산기획</div>
                  <div id="msgPreviewKakaoBody" class="text-xs text-gray-600 whitespace-pre-wrap leading-relaxed" style="min-height:80px;">메시지 내용이 여기에 표시됩니다</div>
                  <div class="mt-2 border-t pt-2">
                    <div class="text-center text-xs text-blue-600 bg-blue-50 rounded py-1.5">확인하기</div>
                  </div>
                </div>
              </div>
              <div id="msgPreviewSms" class="hidden bg-gray-900 rounded-2xl p-3 min-h-[260px]">
                <div class="bg-green-500 rounded-xl p-3">
                  <div id="msgPreviewSmsBody" class="text-xs text-white whitespace-pre-wrap leading-relaxed" style="min-height:80px;">메시지 내용</div>
                </div>
                <div class="text-center text-xs text-gray-400 mt-2">SMS</div>
              </div>
              <div id="msgPreviewEmail" class="hidden bg-white border rounded-xl min-h-[260px]">
                <div class="bg-gray-100 rounded-t-xl px-3 py-2 border-b">
                  <div class="text-xs text-gray-400">제목</div>
                  <div id="msgPreviewEmailSubject" class="text-xs font-medium text-gray-800">(제목 없음)</div>
                </div>
                <div class="p-3">
                  <div id="msgPreviewEmailBody" class="text-xs text-gray-600 whitespace-pre-wrap leading-relaxed" style="min-height:80px;">내용</div>
                </div>
              </div>
              <div id="msgPreviewFax" class="hidden bg-white border-2 border-dashed border-gray-300 rounded-xl p-3 min-h-[260px] flex items-center justify-center">
                <div class="text-center text-gray-400">
                  <i class="fas fa-fax text-2xl mb-2"></i>
                  <div class="text-xs">준비 중</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    <script>
${STATUS_LABELS_JS}
${SHARED_AUTH_JS}
    </script>
    <script>
// === Global ESC key handler ===
document.addEventListener('keydown', function(e) {
  if (e.key !== 'Escape') return;

  // 우선순위: 최상위 z-index 모달부터 닫기
  var closers = [
    // 명세서 이메일 모달 (z:20000)
    function() { var el = document.getElementById('invoiceEmailModal'); if (el) { el.remove(); return true; } },
    // 명세서 iframe 패널 (z:10000)
    function() { var el = document.getElementById('invoicePanel'); if (el) { el.remove(); return true; } },
    // 커맨드 팔레트
    function() { var el = document.getElementById('cmdPalette'); if (el && el.style.display !== 'none') { el.style.display = 'none'; return true; } },
    // 품목 검색 모달 (z:70, DOM remove 방식)
    function() { var el = document.getElementById('itemSearchModal'); if (el) { el.remove(); return true; } },
    // 원자재 연결 모달 (z:60, DOM remove 방식)
    function() { var el = document.getElementById('rmConnectionModal'); if (el) { el.remove(); return true; } },
    // 생산 현황 보드: zoom → lightbox 순서
    function() { if (typeof closeLbZoom === 'function' && closeLbZoom()) return true; var el = document.getElementById('lightbox'); if (el && el.classList.contains('show')) { if (typeof closeLightbox === 'function') closeLightbox(); return true; } return false; },
    // 전역 검색
    function() { var el = document.getElementById('globalSearchResults'); if (el && el.style.display !== 'none') { el.style.display = 'none'; return true; } },
    // display:flex 모달 (사용자 모달, 비번 초기화 등)
    function() {
      var modals = document.querySelectorAll('[id$="Modal"],[id$="modal"],[id$="ModalOverlay"]');
      for (var i = modals.length - 1; i >= 0; i--) {
        var m = modals[i];
        if (m.id === 'lbModal') continue; // lightbox는 전용 closer에서 처리
        var st = window.getComputedStyle(m);
        if (st.display !== 'none' && st.visibility !== 'hidden') {
          if (m.classList.contains('active')) { m.classList.remove('active'); return true; }
          if (m.classList.contains('hidden')) continue;
          // hidden 클래스 방식 통일 (인라인 style.display='none' 금지 — 재오픈 시 클래스 제거로 복구 불가)
          m.classList.add('hidden'); return true;
        }
      }
      return false;
    }
  ];

  for (var i = 0; i < closers.length; i++) {
    try { if (closers[i]()) return; } catch (err) {}
  }
});
    </script>
    ${opts.pageScript ? `<script id="page-script">${opts.pageScript}</script>` : ''}
</body>
</html>`
}
