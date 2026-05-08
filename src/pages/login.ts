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
        <title>로그인 - ERP+MES</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
    </head>
    <body class="bg-gradient-to-br from-blue-500 to-purple-600 min-h-screen flex items-center justify-center">
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
                <div class="text-center text-sm text-gray-600">
                    <p>테스트 계정:</p>
                    <p class="mt-2">
                        <span class="font-semibold">admin</span> / password
                    </p>
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
                    
                    if (error.response && error.response.data) {
                        errorText.textContent = error.response.data.message || '로그인에 실패했습니다.';
                    } else {
                        errorText.textContent = '서버와의 연결에 실패했습니다.';
                    }
                }
            });

            // Enter key support
            document.getElementById('password').addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    loginForm.dispatchEvent(new Event('submit'));
                }
            });
        </script>
    </body>
    </html>
  `)
}
