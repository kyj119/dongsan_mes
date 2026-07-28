// ============================================================================
// 수신거부 공개 페이지 (/unsubscribe?t=<token>) — **로그인 불필요**
//
// 광고 문자 말미의 "무료수신거부" 링크가 여기로 온다.
// 수신자는 대부분 모바일에서 열기 때문에 단일 화면·큰 버튼으로 만든다.
// 로그인 shell(shell.js)을 태우면 인증 리다이렉트가 걸리므로 단독 HTML로 구성한다.
// ============================================================================

import type { Context } from 'hono'

export const unsubscribePage = (c: Context) => {
  const html = `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>수신거부 - 동산기획</title>
  <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
  <script src="https://cdn.jsdelivr.net/npm/axios/dist/axios.min.js"></script>
  <style>body { background:#f3f4f6; min-height:100vh; }</style>
</head>
<body class="flex items-start justify-center p-4">
  <div class="bg-white rounded-xl shadow-lg w-full max-w-md p-6 mt-10">
    <div class="text-center mb-5">
      <div class="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
        <i class="fas fa-bell-slash text-gray-500 text-xl"></i>
      </div>
      <h1 class="text-lg font-bold text-gray-800">광고 문자 수신거부</h1>
      <p class="text-sm text-gray-500 mt-1">동산기획</p>
    </div>

    <div id="loading" class="text-center py-8 text-gray-400">
      <i class="fas fa-spinner fa-spin text-2xl"></i>
    </div>

    <div id="invalid" class="hidden text-center py-6">
      <i class="fas fa-link-slash text-3xl text-gray-300 mb-3"></i>
      <p class="text-sm text-gray-600">유효하지 않은 링크입니다.</p>
      <p class="text-xs text-gray-400 mt-2">문자에 포함된 링크를 다시 확인해주세요.</p>
    </div>

    <!-- 수신거부 전 -->
    <div id="active" class="hidden">
      <div class="bg-gray-50 rounded-lg p-4 mb-4 text-sm">
        <div class="flex justify-between py-1">
          <span class="text-gray-500">수신번호</span>
          <span id="phoneMasked" class="font-medium text-gray-800"></span>
        </div>
        <div id="clientRow" class="hidden flex justify-between py-1">
          <span class="text-gray-500">거래처</span>
          <span id="clientName" class="font-medium text-gray-800"></span>
        </div>
      </div>
      <p class="text-xs text-gray-500 mb-4 leading-relaxed">
        수신거부하시면 앞으로 <b>광고성 문자</b>를 보내지 않습니다.<br>
        주문 접수·시안 확인·배송 안내 등 <b>거래 관련 안내는 계속 발송</b>됩니다.
      </p>
      <button id="optOutBtn" onclick="doOptOut()"
        class="w-full bg-gray-800 text-white py-3 rounded-lg font-medium hover:bg-black transition">
        수신거부 하기
      </button>
    </div>

    <!-- 수신거부 완료 -->
    <div id="done" class="hidden text-center py-4">
      <div class="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
        <i class="fas fa-check text-green-600 text-xl"></i>
      </div>
      <p class="text-base font-bold text-gray-800 mb-1">수신거부 처리되었습니다</p>
      <p id="donePhone" class="text-sm text-gray-500"></p>
      <p class="text-xs text-gray-400 mt-3 leading-relaxed">
        앞으로 광고성 문자가 발송되지 않습니다.<br>
        거래 관련 안내(주문·시안·배송)는 계속 받으실 수 있습니다.
      </p>
      <button onclick="doCancel()" class="mt-5 text-xs text-gray-400 underline hover:text-gray-600">
        실수로 누르셨나요? 수신거부 취소
      </button>
    </div>

    <div id="errBox" class="hidden mt-3 text-sm text-red-600 bg-red-50 p-2 rounded"></div>

    <div class="mt-6 pt-4 border-t text-center text-xs text-gray-400">
      동산기획 · 문의 043-215-0924
    </div>
  </div>

<script>
var token = new URLSearchParams(location.search).get('t') || '';

function show(id) {
  ['loading','invalid','active','done'].forEach(function(k) {
    var el = document.getElementById(k);
    if (el) el.classList.toggle('hidden', k !== id);
  });
}

function showErr(msg) {
  var el = document.getElementById('errBox');
  if (!el) return;
  el.textContent = msg;
  el.classList.remove('hidden');
}

async function load() {
  if (!token) { show('invalid'); return; }
  try {
    var res = await axios.get('/api/public/unsubscribe/' + encodeURIComponent(token));
    var d = res.data.data;
    document.getElementById('phoneMasked').textContent = d.phone_masked || '';
    document.getElementById('donePhone').textContent = d.phone_masked || '';
    if (d.client_name) {
      document.getElementById('clientName').textContent = d.client_name;
      document.getElementById('clientRow').classList.remove('hidden');
    }
    show(d.opted_out ? 'done' : 'active');
  } catch (e) {
    show('invalid');
  }
}

async function doOptOut() {
  var btn = document.getElementById('optOutBtn');
  if (btn) { btn.disabled = true; btn.textContent = '처리 중...'; }
  try {
    var res = await axios.post('/api/public/unsubscribe/' + encodeURIComponent(token));
    document.getElementById('donePhone').textContent = res.data.data.phone_masked || '';
    show('done');
  } catch (e) {
    showErr('처리에 실패했습니다. 잠시 후 다시 시도해주세요.');
    if (btn) { btn.disabled = false; btn.textContent = '수신거부 하기'; }
  }
}

async function doCancel() {
  try {
    await axios.delete('/api/public/unsubscribe/' + encodeURIComponent(token));
    show('active');
  } catch (e) {
    showErr('취소에 실패했습니다.');
  }
}

load();
</script>
</body>
</html>`
  return c.html(html)
}
