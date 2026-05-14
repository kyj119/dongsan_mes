// ============================================================================
// 고객 포털 레이아웃 (사이드바 없음, 상단 네비게이션)
// ============================================================================

export function renderPortalPage(options: {
  title: string
  content: string
  pageScript?: string
}): string {
  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${options.title} - 동산기획 고객포털</title>
  <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
  <script src="https://cdn.jsdelivr.net/npm/axios/dist/axios.min.js"></script>
  <style>
    body { background: #f3f4f6; }
    .portal-nav { background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%); }
  </style>
</head>
<body class="min-h-screen">
  <!-- 상단 네비게이션 -->
  <nav class="portal-nav text-white shadow-lg">
    <div class="max-w-6xl mx-auto px-4">
      <div class="flex justify-between items-center h-14">
        <div class="flex items-center space-x-6">
          <a href="/portal" class="font-bold text-lg">
            <i class="fas fa-building mr-2"></i>동산기획
          </a>
          <div class="hidden md:flex space-x-4 text-sm">
            <a href="/portal" class="hover:text-blue-200 px-2 py-1" id="nav-dashboard">대시보드</a>
            <a href="/portal/orders" class="hover:text-blue-200 px-2 py-1" id="nav-orders">주문 내역</a>
            <a href="/portal/balance" class="hover:text-blue-200 px-2 py-1" id="nav-balance">미수금</a>
            <a href="/portal/invoices" class="hover:text-blue-200 px-2 py-1" id="nav-invoices">세금계산서</a>
          </div>
        </div>
        <div class="flex items-center space-x-3">
          <span id="portal-user-name" class="text-sm"></span>
          <button onclick="portalLogout()" class="text-sm hover:text-blue-200"><i class="fas fa-sign-out-alt"></i></button>
        </div>
      </div>
    </div>
  </nav>

  <!-- 모바일 메뉴 -->
  <div class="md:hidden bg-blue-700 text-white px-4 py-2 flex space-x-4 text-sm overflow-x-auto">
    <a href="/portal" class="whitespace-nowrap">대시보드</a>
    <a href="/portal/orders" class="whitespace-nowrap">주문</a>
    <a href="/portal/balance" class="whitespace-nowrap">미수금</a>
    <a href="/portal/invoices" class="whitespace-nowrap">세금계산서</a>
  </div>

  <!-- 메인 콘텐츠 -->
  <main class="max-w-6xl mx-auto px-4 py-6">
    ${options.content}
  </main>

  <script>
    // 포털 인증 설정
    const portalToken = localStorage.getItem('portalToken');
    const portalUser = JSON.parse(localStorage.getItem('portalUser') || '{}');

    // ?t= 임시 토큰 접근이면 로그인 리다이렉트 건너뜀
    const _urlParams = new URLSearchParams(location.search);
    const _accessToken = _urlParams.get('t');
    if (!portalToken && !_accessToken && !location.pathname.includes('/portal/login')) {
      location.href = '/portal/login';
    }

    // axios 기본 설정
    if (portalToken) {
      axios.defaults.headers.common['Authorization'] = 'Bearer ' + portalToken;
    }
    axios.interceptors.response.use(r => r, err => {
      if (err.response?.status === 401 && !_accessToken) {
        localStorage.removeItem('portalToken');
        localStorage.removeItem('portalUser');
        location.href = '/portal/login';
      }
      return Promise.reject(err);
    });

    // 사용자 이름 표시
    const nameEl = document.getElementById('portal-user-name');
    if (nameEl && portalUser.client_name) {
      nameEl.textContent = portalUser.contact_name || portalUser.client_name;
    }

    function portalLogout() {
      localStorage.removeItem('portalToken');
      localStorage.removeItem('portalUser');
      location.href = '/portal/login';
    }
  </script>
  ${options.pageScript ? `<script>${options.pageScript}</script>` : ''}
</body>
</html>`
}
