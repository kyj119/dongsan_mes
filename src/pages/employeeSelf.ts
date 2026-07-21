// 직원 간이 인증 페이지 — 계정 없는 직원이 사원번호+생년월일로 본인 확인
import type { Context } from 'hono'
import type { HonoEnv } from '../types/env'
import pageScript from '../scripts/employeeSelf.js?raw'
import { HR_ENUMS_JS } from '../constants/hr'

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
      /* button 요소 리셋 (키보드 접근성 전환) */
      width: 100%;
      text-align: left;
      font-family: inherit;
      font-size: inherit;
    }
    .menu-item:hover {
      background: #eff6ff;
      border-color: #bfdbfe;
    }
    .menu-item:focus-visible {
      outline: 2px solid #2563eb;
      outline-offset: 2px;
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

    /* 급여명세서 목록 */
    .payslips-section { display: none; }
    .payslips-section.active { display: block; }
    .payslip-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 14px;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      margin-bottom: 8px;
      background: #fff;
      cursor: pointer;
      transition: all 0.15s;
    }
    .payslip-item:hover { background: #eff6ff; border-color: #bfdbfe; }
    .payslip-item .pi-period { font-weight: 600; font-size: 14px; }
    .payslip-item .pi-net { font-size: 13px; color: #1e40af; font-weight: 700; font-variant-numeric: tabular-nums; }

    /* 계약서 서명 */
    .sign-section { display: none; }
    .sign-section.active { display: block; }
    #selfSignCanvas {
      width: 100%;
      height: 170px;
      border: 1px solid #d1d5db;
      border-radius: 8px;
      background: #fff;
      touch-action: none;
      margin-top: 6px;
      cursor: crosshair;
    }
    .btn-secondary {
      width: 100%;
      padding: 10px;
      background: #eff6ff;
      color: #1e40af;
      border: 1px solid #bfdbfe;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
    }
    .btn-secondary:hover { background: #dbeafe; }
    .contract-item .sign-btn {
      display: inline-block;
      margin-top: 8px;
      padding: 6px 14px;
      background: #2563eb;
      color: #fff;
      border: none;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
    }
    .contract-item .sign-btn:hover { background: #1d4ed8; }
    .status-pending-sign { background: #fef3c7; color: #92400e; }

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

        <button type="button" class="menu-item" id="btnCertificate">
          <i class="fas fa-certificate" aria-hidden="true"></i>
          <div>
            <div class="label">재직증명서 출력</div>
            <div class="desc">재직증명서를 발급하여 인쇄합니다</div>
          </div>
        </button>

        <button type="button" class="menu-item" id="btnPayslips">
          <i class="fas fa-file-invoice-dollar" aria-hidden="true"></i>
          <div>
            <div class="label">급여명세서</div>
            <div class="desc">교부된 월별 급여명세서를 확인·인쇄합니다</div>
          </div>
        </button>

        <button type="button" class="menu-item" id="btnContracts">
          <i class="fas fa-file-contract" aria-hidden="true"></i>
          <div>
            <div class="label">내 계약서 목록</div>
            <div class="desc">근로계약서 이력을 확인합니다</div>
          </div>
        </button>

        <button class="btn-logout" id="btnLogout">로그아웃</button>
      </div>

      <!-- 급여명세서 목록 -->
      <div id="payslipsSection" class="payslips-section">
        <button class="back-btn" id="btnPayslipsBack"><i class="fas fa-arrow-left"></i> 돌아가기</button>
        <h3 style="font-size:16px;font-weight:700;margin-bottom:12px;">급여명세서</h3>
        <div id="payslipsList"></div>
      </div>

      <!-- 계약서 목록 -->
      <div id="contractsSection" class="contracts-section">
        <button class="back-btn" id="btnBack"><i class="fas fa-arrow-left"></i> 돌아가기</button>
        <h3 style="font-size:16px;font-weight:700;margin-bottom:12px;">내 계약서 목록</h3>
        <div id="contractsList"></div>
      </div>

      <!-- 근로계약서 서명 -->
      <div id="signSection" class="sign-section">
        <button class="back-btn" id="btnSignBack"><i class="fas fa-arrow-left"></i> 돌아가기</button>
        <h3 style="font-size:16px;font-weight:700;margin-bottom:8px;">근로계약서 서명</h3>
        <div id="signContractInfo" style="font-size:13px;color:#6b7280;margin-bottom:12px;"></div>
        <button type="button" id="btnViewContract" class="btn-secondary"><i class="fas fa-file-alt mr-1"></i> 계약서 전문 보기</button>
        <div style="margin-top:14px;">
          <label style="display:block;font-size:13px;font-weight:600;color:#374151;">아래 영역에 서명해 주세요</label>
          <canvas id="selfSignCanvas"></canvas>
        </div>
        <div style="display:flex;gap:8px;margin-top:10px;">
          <button type="button" id="btnSignClear" class="btn-logout" style="flex:1;margin-top:0;">지우기</button>
          <button type="button" id="btnSignSubmit" class="btn-primary" style="flex:2;">서명 제출</button>
        </div>
        <div class="error-msg" id="signError"></div>
      </div>
    </div>
  </div>
  <script>${HR_ENUMS_JS}</script>
  <script>${pageScript}</script>
</body>
</html>`)
}
