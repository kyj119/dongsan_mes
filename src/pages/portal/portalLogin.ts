// ============================================================================
// 고객 포털 로그인 페이지
// ============================================================================

import type { Context } from 'hono'

export const portalLoginPage = (c: Context) => {
  const html = `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>고객포털 로그인 - 동산기획</title>
  <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
  <script src="https://cdn.jsdelivr.net/npm/axios/dist/axios.min.js"></script>
  <style>
    body { background: linear-gradient(135deg, #1e3a5f 0%, #2563eb 50%, #1e40af 100%); min-height: 100vh; }
  </style>
</head>
<body class="flex items-center justify-center">
  <div class="bg-white rounded-xl shadow-2xl w-full max-w-md p-8">
    <div class="text-center mb-6">
      <div class="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-3">
        <i class="fas fa-building text-blue-600 text-2xl"></i>
      </div>
      <h1 class="text-xl font-bold text-gray-800">동산기획 고객포털</h1>
      <p class="text-sm text-gray-500 mt-1">거래처 전용 조회 서비스</p>
    </div>

    <form id="login-form" onsubmit="handleLogin(event)">
      <div class="space-y-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">아이디</label>
          <input type="text" id="login-id" class="w-full border rounded-lg px-4 py-2.5" placeholder="거래처 아이디" required autofocus>
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">비밀번호</label>
          <input type="password" id="login-pw" class="w-full border rounded-lg px-4 py-2.5" placeholder="비밀번호" required>
        </div>
        <div id="login-error" class="hidden text-sm text-red-600 bg-red-50 p-2 rounded"></div>
        <button type="submit" id="login-btn" class="w-full bg-blue-600 text-white py-2.5 rounded-lg font-medium hover:bg-blue-700 transition">
          로그인
        </button>
      </div>
    </form>

    <div class="mt-6 text-center text-xs text-gray-400">
      계정 관련 문의: 042-523-1982
    </div>
  </div>

  <script>
    // 이미 로그인된 경우 리다이렉트
    if (localStorage.getItem('portalToken')) {
      location.href = '/portal';
    }

    async function handleLogin(e) {
      e.preventDefault();
      const btn = document.getElementById('login-btn');
      const errEl = document.getElementById('login-error');
      btn.disabled = true;
      btn.textContent = '로그인 중...';
      errEl.classList.add('hidden');

      try {
        const res = await axios.post('/api/portal/auth/login', {
          login_id: document.getElementById('login-id').value,
          password: document.getElementById('login-pw').value,
        });
        const { token, user } = res.data.data;
        localStorage.setItem('portalToken', token);
        localStorage.setItem('portalUser', JSON.stringify(user));
        location.href = '/portal';
      } catch (err) {
        errEl.textContent = err.response?.data?.error || '로그인 실패';
        errEl.classList.remove('hidden');
        btn.disabled = false;
        btn.textContent = '로그인';
      }
    }
  </script>
</body>
</html>`
  return c.html(html)
}
