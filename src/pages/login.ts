import type { Context } from 'hono'
import type { HonoEnv } from '../types/env'

export function loginPage(c: Context<HonoEnv>) {
  c.header('Cache-Control', 'no-store, no-cache, must-revalidate')
  return c.html(`
    <!DOCTYPE html>
    <html lang="ko">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <link rel="icon" type="image/png" href="/favicon.ico">
        <title>로그인 - ERP+MES</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css">
        <style>
          /* 감청 톤 통일(2026-09-15): 독립 페이지라 앱 토큰이 안 온다 → 여기서 파랑→감청 */
          body { font-family: 'Pretendard Variable', Pretendard, -apple-system, BlinkMacSystemFont, system-ui, 'Malgun Gothic', sans-serif;
                 background: linear-gradient(135deg, #152A44 0%, #1E3A5F 60%, #24486E 100%) !important; }
          .bg-blue-600 { background-color: #1E3A5F !important; }
          .hover\\:bg-blue-700:hover { background-color: #16304F !important; }
          .bg-blue-100 { background-color: #E9EEF4 !important; }
          .text-blue-600 { color: #1E3A5F !important; }
          .focus\\:ring-blue-500:focus { --tw-ring-color: #1E3A5F !important; }
        </style>
    </head>
    <body class="bg-gradient-to-br from-blue-500 to-blue-700 min-h-screen flex items-center justify-center">
        <div class="bg-white rounded-lg shadow-2xl p-8 w-full max-w-md">
            <div class="text-center mb-8">
                <div class="inline-block p-4 bg-blue-100 rounded-full mb-4">
                    <i class="fas fa-industry text-4xl text-blue-600"></i>
                </div>
                <h1 class="text-3xl font-bold text-gray-800">ERP+MES 시스템</h1>
                <p class="text-gray-600 mt-2">인쇄업 주문 및 현장 관리</p>
            </div>

            <!-- Login Form -->
            <form id="loginForm" class="space-y-6">
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-2">
                        <i class="fas fa-user mr-2"></i>
                        아이디
                    </label>
                    <input 
                        type="text" 
                        id="username" 
                        class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="아이디를 입력하세요"
                        required
                    >
                </div>

                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-2">
                        <i class="fas fa-lock mr-2"></i>
                        비밀번호
                    </label>
                    <input 
                        type="password" 
                        id="password" 
                        class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="비밀번호를 입력하세요"
                        required
                    >
                </div>

                <div class="flex items-center justify-between">
                    <label class="flex items-center">
                        <input type="checkbox" id="rememberMe" class="rounded border-gray-300 text-blue-600">
                        <span class="ml-2 text-sm text-gray-600">로그인 상태 유지</span>
                    </label>
                </div>

                <!-- Error Message -->
                <div id="errorMessage" class="hidden bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
                    <i class="fas fa-exclamation-circle mr-2"></i>
                    <span id="errorText"></span>
                </div>

                <button 
                    type="submit" 
                    class="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors"
                >
                    <i class="fas fa-sign-in-alt mr-2"></i>
                    로그인
                </button>
            </form>

            <div class="mt-6 pt-6 border-t border-gray-200">
                <div class="text-center text-xs text-gray-400">
                    <p>로그인 문제 발생 시 관리자에게 문의하세요.</p>
                </div>
            </div>
        </div>

        <script src="https://cdn.jsdelivr.net/npm/axios@1.6.0/dist/axios.min.js"></script>
        <script>
            // If already logged in with valid token, verify with server then redirect
            (async function() {
                var t = localStorage.getItem('token');
                if (t) {
                    try {
                        var res = await fetch('/api/auth/me', {
                            headers: { 'Authorization': 'Bearer ' + t }
                        });
                        if (res.ok) {
                            window.location.href = '/cards';
                            return;
                        }
                    } catch(e) {}
                    // Server verification failed — clear token, show login form
                    localStorage.removeItem('token');
                    localStorage.removeItem('user');
                }
            })();

            const loginForm = document.getElementById('loginForm');
            const errorMessage = document.getElementById('errorMessage');
            const errorText = document.getElementById('errorText');

            loginForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                
                const username = document.getElementById('username').value;
                const password = document.getElementById('password').value;
                const rememberMe = document.getElementById('rememberMe').checked;

                // Hide error message
                errorMessage.classList.add('hidden');

                try {
                    const response = await axios.post('/api/auth/login', {
                        username,
                        password
                    });

                    if (response.data.success) {
                        // Store JWT token and user info
                        localStorage.setItem('token', response.data.data.token);
                        localStorage.setItem('user', JSON.stringify(response.data.data.user));

                        // Verify token was stored
                        const savedToken = localStorage.getItem('token');
                        if (!savedToken) {
                            errorMessage.classList.remove('hidden');
                            errorText.textContent = 'localStorage 저장 실패 — 브라우저 설정을 확인하세요.';
                            return;
                        }

                        // Redirect directly to cards (skip / → /cards 301)
                        window.location.href = '/cards';
                    }
                } catch (error) {
                    console.error('Login error:', error);
                    errorMessage.classList.remove('hidden');

                    if (error.response) {
                        if (error.response.status === 429) {
                            errorText.textContent = error.response.data.error || '요청이 너무 많습니다. 잠시 후 다시 시도하세요.';
                        } else if (error.response.data) {
                            errorText.textContent = error.response.data.message || '아이디 또는 비밀번호가 올바르지 않습니다.';
                        } else {
                            errorText.textContent = '로그인에 실패했습니다.';
                        }
                    } else {
                        errorText.textContent = '서버와의 연결에 실패했습니다. 네트워크를 확인하세요.';
                    }
                }
            });

            // ★Enter 처리기를 **두지 않는다** (2026-09-17 실기 재현).
            //   여기 있던 핸들러가 loginForm.dispatchEvent(new Event('submit')) 를 했는데,
            //   new Event() 는 **cancelable 이 아니라** 위 submit 리스너의 preventDefault() 가
            //   조용히 무효가 된다. 그러면 axios 로그인이 시작된 **직후 브라우저의 네이티브 제출이
            //   그대로 진행돼 페이지가 새로고침**되고, 응답(성공이든 401이든)은 렌더될 화면이 없다.
            //   → 증상 = 「Enter 를 눌렀는데 아무 말 없이 로그인창으로 되돌아온다」.
            //     비밀번호가 맞아도 같다(토큰은 저장되는데 화면은 로그인 폼으로 리셋된다) —
            //     그래서 **되기도 하고 안 되기도 하는** 것처럼 보였다. 버튼 클릭은 멀쩡했다
            //     (네이티브 submit 이벤트는 cancelable 이라 preventDefault 가 먹는다).
            //   ⚠️핸들러가 없어야 Enter 가 **정상 동작**한다 — form 에 type=submit 버튼이
            //     있으므로 브라우저가 알아서 submit 이벤트를 발생시키고, 그건 취소 가능하다.
            //     「Enter 지원」을 손으로 다시 넣지 말 것. 넣는 순간 같은 사고가 돌아온다.
        </script>
    </body>
    </html>
  `)
}
