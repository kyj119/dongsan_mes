// 직원 간이 인증 페이지 — 계정 없는 직원이 사원번호+생년월일로 본인 확인
import type { Context } from 'hono'
import type { HonoEnv } from '../types/env'
import pageScript from '../scripts/employeeSelf.js?raw'

export function employeeSelfPage(c: Context<HonoEnv>) {
  return c.html(`<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>직원 셀프서비스</title>
  <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
  <script src="https://cdn.jsdelivr.net/npm/axios/dist/axios.min.js"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Malgun Gothic', '맑은 고딕', sans-serif;
      background: #f3f4f6;
      color: #111827;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .container {
      width: 100%;
      max-width: 420px;
      padding: 16px;
    }
    .card {
      background: #fff;
      border-radius: 12px;
      box-shadow: 0 4px 16px rgba(0,0,0,.08);
      padding: 32px;
    }
    .logo {
      text-align: center;
      margin-bottom: 24px;
    }
    .logo i {
      font-size: 48px;
      color: #2563eb;
    }
    .logo h1 {
      font-size: 20px;
      font-weight: 700;
      color: #111827;
      margin-top: 8px;
    }
    .logo p {
      font-size: 13px;
      color: #6b7280;
      margin-top: 4px;
    }
    .form-group {
      margin-bottom: 16px;
    }
    .form-group label {
      display: block;
      font-size: 13px;
      font-weight: 600;
      color: #374151;
      margin-bottom: 6px;
    }
    .form-group input {
      width: 100%;
      padding: 10px 14px;
      border: 1px solid #d1d5db;
      border-radius: 8px;
      font-size: 15px;
      outline: none;
      transition: border-color 0.15s;
    }
    .form-group input:focus {
      border-color: #2563eb;
      box-shadow: 0 0 0 3px rgba(37,99,235,.1);
    }
    .btn-primary {
      width: 100%;
      padding: 12px;
      background: #2563eb;
      color: #fff;
      border: none;
      border-radius: 8px;
      font-size: 15px;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.15s;
    }
    .btn-primary:hover { background: #1d4ed8; }
    .btn-primary:disabled { background: #93c5fd; cursor: not-allowed; }
    .error-msg {
      color: #dc2626;
      font-size: 13px;
      text-align: center;
      margin-top: 12px;
      display: none;
    }

    /* 인증 후 메뉴 */
    .menu-section { display: none; }
    .menu-section.active { display: block; }
    .user-info {
      background: #eff6ff;
      border-radius: 8px;
      padding: 16px;
      margin-bottom: 20px;
      text-align: center;
    }
    .user-info .name {
      font-size: 18px;
      font-weight: 700;
      color: #1e40af;
    }
    .user-info .detail {
      font-size: 13px;
      color: #6b7280;
      margin-top: 4px;
    }
    .menu-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 14px 16px;
      background: #f9fafb;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      margin-bottom: 10px;
      cursor: pointer;
      transition: all 0.15s;
      text-decoration: none;
      color: #374151;
    }
    .menu-item:hover {
      background: #eff6ff;
      border-color: #bfdbfe;
    }
    .menu-item i {
      font-size: 20px;
      width: 28px;
      text-align: center;
      color: #2563eb;
    }
    .menu-item .label {
      font-size: 14px;
      font-weight: 600;
    }
    .menu-item .desc {
      font-size: 12px;
      color: #9ca3af;
    }
    .btn-logout {
      width: 100%;
      padding: 10px;
      background: #f3f4f6;
      color: #6b7280;
      border: 1px solid #d1d5db;
      border-radius: 8px;
      font-size: 13px;
      cursor: pointer;
      margin-top: 12px;
    }
    .btn-logout:hover { background: #e5e7eb; }

    /* 계약서 목록 */
    .contracts-section { display: none; }
    .contracts-section.active { display: block; }
    .contract-item {
      padding: 12px;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      margin-bottom: 8px;
      background: #fff;
    }
    .contract-item .type {
      font-weight: 600;
      font-size: 14px;
    }
    .contract-item .dates {
      font-size: 12px;
      color: #6b7280;
      margin-top: 2px;
    }
    .contract-item .status {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 600;
      margin-top: 4px;
    }
    .status-signed { background: #dcfce7; color: #166534; }
    .status-draft { background: #fef3c7; color: #92400e; }
    .back-btn {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-size: 13px;
      color: #2563eb;
      cursor: pointer;
      margin-bottom: 12px;
      border: none;
      background: none;
    }
    .back-btn:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <div class="container">
    <div class="card">
      <!-- 로그인 폼 -->
      <div id="loginSection">
        <div class="logo">
          <i class="fas fa-id-badge"></i>
          <h1>직원 셀프서비스</h1>
          <p>사원번호와 생년월일로 본인 확인</p>
        </div>
        <form id="selfAuthForm">
          <div class="form-group">
            <label for="employeeCode">사원번호</label>
            <input type="text" id="employeeCode" placeholder="예: DS-001" autocomplete="off" required>
          </div>
          <div class="form-group">
            <label for="birthDate">생년월일 (6자리)</label>
            <input type="text" id="birthDate" placeholder="예: 901231" maxlength="6" inputmode="numeric" autocomplete="off" required>
          </div>
          <button type="submit" class="btn-primary" id="btnLogin">본인 확인</button>
        </form>
        <div class="error-msg" id="errorMsg"></div>
      </div>

      <!-- 메뉴 (인증 후) -->
      <div id="menuSection" class="menu-section">
        <div class="user-info">
          <div class="name" id="userName"></div>
          <div class="detail" id="userDetail"></div>
        </div>

        <div class="menu-item" id="btnCertificate">
          <i class="fas fa-file-certificate"></i>
          <div>
            <div class="label">재직증명서 출력</div>
            <div class="desc">재직증명서를 발급하여 인쇄합니다</div>
          </div>
        </div>

        <div class="menu-item" id="btnContracts">
          <i class="fas fa-file-contract"></i>
          <div>
            <div class="label">내 계약서 목록</div>
            <div class="desc">근로계약서 이력을 확인합니다</div>
          </div>
        </div>

        <button class="btn-logout" id="btnLogout">로그아웃</button>
      </div>

      <!-- 계약서 목록 -->
      <div id="contractsSection" class="contracts-section">
        <button class="back-btn" id="btnBack"><i class="fas fa-arrow-left"></i> 돌아가기</button>
        <h3 style="font-size:16px;font-weight:700;margin-bottom:12px;">내 계약서 목록</h3>
        <div id="contractsList"></div>
      </div>
    </div>
  </div>
  <script>${pageScript}</script>
</body>
</html>`)
}
