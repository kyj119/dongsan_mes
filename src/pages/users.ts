import type { Context } from 'hono'
import type { HonoEnv } from '../types/env'
import { renderPage } from '../layout'
import pageScript from '../scripts/users.js?raw'

export function usersPage(c: Context<HonoEnv>) {
  return renderPage(c, {
    title: '사용자 관리',
    activePage: '/users',
    pageCSS: `
      .role-badge {
        display: inline-block;
        padding: 2px 8px;
        border-radius: 9999px;
        font-size: 12px;
        font-weight: 600;
      }
      .role-ADMIN    { background: #fee2e2; color: #991b1b; }
      .role-MANAGER  { background: #dbeafe; color: #1e40af; }
      .role-DESIGNER { background: #ede9fe; color: #5b21b6; }
      .role-OPERATOR { background: #dcfce7; color: #166534; }
      .status-badge  { display: inline-block; padding: 2px 8px; border-radius: 9999px; font-size: 12px; font-weight: 600; }
      .status-active   { background: #dcfce7; color: #166534; }
      .status-inactive { background: #f1f5f9; color: #64748b; }
      .modal-overlay {
        position: fixed; inset: 0; background: rgba(0,0,0,0.5);
        display: flex; align-items: center; justify-content: center;
        z-index: 1000;
      }
      .modal-box {
        background: #fff; border-radius: 12px; padding: 24px;
        width: 100%; max-width: 480px;
        box-shadow: 0 20px 60px rgba(0,0,0,0.3);
      }
    `,
    pageContent: `
      <!-- Header bar -->
      <div class="flex justify-between items-center mb-6">
        <h2 class="text-xl font-bold text-gray-800">
          <i class="fas fa-users text-blue-600 mr-2"></i>사용자 목록
        </h2>
        <button onclick="showCreateModal()"
          class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2">
          <i class="fas fa-plus"></i>
          사용자 추가
        </button>
      </div>

      <!-- Users Table -->
      <div class="bg-white rounded-lg shadow-lg overflow-hidden">
        <div id="usersTableWrap" class="overflow-x-auto">
          <div class="text-center py-12 text-gray-400">
            <i class="fas fa-spinner fa-spin text-3xl mb-3"></i>
            <p>사용자 목록을 불러오는 중...</p>
          </div>
        </div>
      </div>

      <!-- Create / Edit Modal -->
      <div id="userModal" class="modal-overlay" style="display:none;">
        <div class="modal-box">
          <div class="flex justify-between items-center mb-5">
            <h3 class="text-lg font-bold" id="modalTitle">사용자 추가</h3>
            <button onclick="closeModal()" class="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
          </div>
          <form id="userForm" onsubmit="submitUserForm(event)">
            <input type="hidden" id="editUserId">
            <div class="space-y-4">
              <div id="usernameField">
                <label class="block text-sm font-medium text-gray-700 mb-1">아이디 <span class="text-red-500">*</span></label>
                <input type="text" id="f_username" class="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="로그인 아이디" autocomplete="off">
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">이름 <span class="text-red-500">*</span></label>
                <input type="text" id="f_name" class="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="표시 이름">
              </div>
              <div id="passwordField">
                <label class="block text-sm font-medium text-gray-700 mb-1">비밀번호 <span class="text-red-500">*</span></label>
                <input type="password" id="f_password" class="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="비밀번호" autocomplete="new-password">
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">역할 <span class="text-red-500">*</span></label>
                <select id="f_role" class="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500">
                  <option value="OPERATOR">현장 (OPERATOR)</option>
                  <option value="DESIGNER">디자이너 (DESIGNER)</option>
                  <option value="MANAGER">매니저 (MANAGER)</option>
                  <option value="ADMIN">관리자 (ADMIN)</option>
                </select>
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">소속 법인</label>
                <select id="f_entity" class="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500">
                  <option value="1">동산기획</option>
                  <option value="2">선명</option>
                  <option value="3">동산기획(청주)</option>
                </select>
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">이메일</label>
                <input type="email" id="f_email" class="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="선택사항">
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-1">전화번호</label>
                <input type="tel" id="f_phone" class="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="선택사항">
              </div>
            </div>
            <div class="flex justify-end gap-3 mt-6">
              <button type="button" onclick="closeModal()"
                class="px-4 py-2 border rounded-lg text-gray-700 hover:bg-gray-50">취소</button>
              <button type="submit" id="submitBtn"
                class="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">저장</button>
            </div>
          </form>
        </div>
      </div>

      <!-- Reset Password Modal -->
      <div id="resetPwModal" class="modal-overlay" style="display:none;">
        <div class="modal-box">
          <div class="flex justify-between items-center mb-5">
            <h3 class="text-lg font-bold">비밀번호 초기화</h3>
            <button onclick="closeResetModal()" class="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
          </div>
          <p class="text-sm text-gray-600 mb-4"><span id="resetTargetName" class="font-semibold"></span> 의 비밀번호를 초기화합니다.</p>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">새 비밀번호 <span class="text-red-500">*</span></label>
            <input type="password" id="newPassword" class="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              placeholder="새 비밀번호" autocomplete="new-password">
          </div>
          <div class="flex justify-end gap-3 mt-6">
            <button type="button" onclick="closeResetModal()"
              class="px-4 py-2 border rounded-lg text-gray-700 hover:bg-gray-50">취소</button>
            <button type="button" onclick="submitResetPassword()"
              class="px-6 py-2 border border-gray-300 text-gray-700 bg-white rounded-lg hover:bg-gray-50">초기화</button>
          </div>
        </div>
      </div>
    `,
    pageScript
  })
}
