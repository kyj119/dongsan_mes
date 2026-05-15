// ============================================================================
// 고객 포털 미수금 스크립트
// ============================================================================

// Skeleton loading
(function() {
  var el = document.getElementById('balance-tbody');
  if (el && window.dsSkeleton) el.innerHTML = dsSkeleton.table(5, 5);
})();

// URL의 ?t= 임시 토큰 파라미터 확인
const urlParams = new URLSearchParams(window.location.search);
const accessToken = urlParams.get('t');

// 임시 토큰 접근 시 저장된 clientId (verify-token 응답에서 얻음)
let tokenClientId = null;

async function initBalance() {
  if (accessToken) {
    // 임시 토큰 모드: 로그인 없이 verify-token으로 인증
    try {
      const res = await axios.get('/api/portal/verify-token?t=' + encodeURIComponent(accessToken));
      if (!res.data.success) {
        showTokenError(res.data.error || '유효하지 않은 링크입니다.');
        return;
      }
      tokenClientId = res.data.data.client_id;
      // 거래처명 표시
      const clientNameEl = document.getElementById('portal-client-name');
      if (clientNameEl) clientNameEl.textContent = res.data.data.client_name;
      // 로그인 영역 숨김, 내용 표시
      const loginNote = document.getElementById('token-login-note');
      if (loginNote) loginNote.style.display = 'none';
      await loadBalance();
    } catch (e) {
      showTokenError('링크 확인 중 오류가 발생했습니다.');
      console.error(e);
    }
  } else {
    // 일반 로그인 세션 모드
    await loadBalance();
  }
}

function showTokenError(msg) {
  const container = document.getElementById('balance-container');
  if (container) {
    container.innerHTML = `
      <div class="flex flex-col items-center justify-center py-20 text-center">
        <div class="text-5xl mb-4">🔗</div>
        <h2 class="text-xl font-bold text-gray-700 mb-2">링크를 사용할 수 없습니다</h2>
        <p class="text-gray-500 mb-6">${msg}</p>
        <a href="/portal/login" class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">로그인 페이지로</a>
      </div>
    `;
  }
  // 테이블 영역 숨김
  const tableWrap = document.getElementById('balance-table-wrap');
  if (tableWrap) tableWrap.style.display = 'none';
}

async function loadBalance() {
  try {
    let res;
    if (accessToken && tokenClientId) {
      // 임시 토큰 모드: ?t= 파라미터를 API에 전달
      res = await axios.get('/api/portal/balance?t=' + encodeURIComponent(accessToken));
    } else {
      res = await axios.get('/api/portal/balance');
    }
    const { items, totalBalance } = res.data.data;
    renderBalance(items, totalBalance);
  } catch (e) {
    console.error(e);
    // 401 오류 시 토큰 모드면 만료 안내
    if (accessToken && e.response && e.response.status === 401) {
      showTokenError('링크가 만료되었습니다.');
    }
  }
}

function renderBalance(items, totalBalance) {
  document.getElementById('total-balance').textContent = (totalBalance || 0).toLocaleString() + '원';

  const tbody = document.getElementById('balance-tbody');
  if (!tbody) return;

  if (!items || items.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="text-center py-8 text-gray-500">미수금이 없습니다.</td></tr>';
    return;
  }

  tbody.innerHTML = items.map(i => `<tr class="border-b">
    <td class="px-3 py-2 text-sm font-mono">${i.order_number || '-'}</td>
    <td class="px-3 py-2 text-sm">${i.billing_date || '-'}</td>
    <td class="px-3 py-2 text-sm text-right">${Number(i.total_amount || 0).toLocaleString()}원</td>
    <td class="px-3 py-2 text-sm text-right text-green-600">${Number(i.paid_amount || 0).toLocaleString()}원</td>
    <td class="px-3 py-2 text-sm text-right font-semibold text-red-600">${Number(i.balance || 0).toLocaleString()}원</td>
  </tr>`).join('');
}

document.addEventListener('DOMContentLoaded', initBalance);
