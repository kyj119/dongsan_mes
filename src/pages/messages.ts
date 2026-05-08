import type { Context } from 'hono'
import type { HonoEnv } from '../types/env'
import { renderPage } from '../layout'
import pageScript from '../scripts/messages.js?raw'

export function messagesPage(c: Context<HonoEnv>) {
  return renderPage(c, {
    title: '메시지 관리',
    activePage: '/messages',
    pageContent: `
<div class="space-y-6">
  <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
    <div class="bg-white border border-gray-200 rounded-lg p-5">
      <div class="text-xs text-gray-500">카카오톡 상태</div>
      <div class="text-3xl font-bold mt-1" id="msgStatusValue">-</div>
      <div class="text-xs text-gray-400 mt-1" id="msgChannelInfo"></div>
    </div>
    <div class="bg-white border border-gray-200 rounded-lg p-5">
      <div class="text-xs text-gray-500">오늘 발송</div>
      <div class="text-3xl font-bold text-gray-900 mt-1" id="msgTodayCount">-</div>
    </div>
    <div class="bg-white border border-gray-200 rounded-lg p-5">
      <div class="text-xs text-gray-500">발송 단가</div>
      <div class="text-3xl font-bold text-gray-900 mt-1" id="msgUnitCost">-</div>
    </div>
    <div class="bg-white border border-gray-200 rounded-lg p-5">
      <div class="text-xs text-gray-500">잔여 포인트</div>
      <div class="text-3xl font-bold text-gray-900 mt-1" id="msgBalance">-</div>
      <div class="text-xs text-gray-400 mt-1" id="msgPartnerPoint"></div>
    </div>
  </div>

  <div class="flex gap-2">
    <button onclick="openIndividualSend()" class="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
      <i class="fas fa-paper-plane mr-1"></i>새 발송
    </button>
  </div>

  <div class="flex border-b">
    <button id="tabHistory" onclick="switchMsgTab('history')" class="px-5 py-2.5 text-sm font-medium border-b-2 border-blue-600 text-blue-600">발송 이력</button>
    <button id="tabBulk" onclick="switchMsgTab('bulk')" class="px-5 py-2.5 text-sm font-medium text-gray-500 hover:text-gray-700">대량 발송</button>
    <button id="tabTemplates" onclick="switchMsgTab('templates')" class="px-5 py-2.5 text-sm font-medium text-gray-500 hover:text-gray-700">템플릿 관리</button>
    <button id="tabStats" onclick="switchMsgTab('stats')" class="px-5 py-2.5 text-sm font-medium text-gray-500 hover:text-gray-700">통계</button>
  </div>

  <div id="panelHistory">
    <div class="flex items-center gap-3 mb-4 flex-wrap">
      <input type="text" id="logSearch" placeholder="수신자명/전화번호 검색" class="flex-1 min-w-[200px] border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500">
      <select id="logChannel" class="border border-gray-300 rounded-lg px-3 py-2 text-sm">
        <option value="">전체 채널</option>
        <option value="kakao">카카오톡</option>
        <option value="sms">문자</option>
        <option value="email">이메일</option>
        <option value="fax">팩스</option>
      </select>
      <select id="logStatus" class="border border-gray-300 rounded-lg px-3 py-2 text-sm">
        <option value="">전체 상태</option>
        <option value="SUCCESS">성공</option>
        <option value="FAILED">실패</option>
        <option value="PENDING">대기</option>
        <option value="ALT_SENT">대체문자</option>
      </select>
      <button onclick="loadLogs()" class="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"><i class="fas fa-search mr-1"></i>조회</button>
    </div>
    <div class="bg-white rounded-lg shadow overflow-hidden">
      <table class="w-full text-sm">
        <thead class="bg-gray-50">
          <tr>
            <th class="px-4 py-3 text-left text-xs font-semibold text-gray-600">발송일시</th>
            <th class="px-4 py-3 text-left text-xs font-semibold text-gray-600">채널</th>
            <th class="px-4 py-3 text-left text-xs font-semibold text-gray-600">수신자</th>
            <th class="px-4 py-3 text-left text-xs font-semibold text-gray-600">수신번호</th>
            <th class="px-4 py-3 text-left text-xs font-semibold text-gray-600">관련 업무</th>
            <th class="px-4 py-3 text-center text-xs font-semibold text-gray-600">상태</th>
            <th class="px-4 py-3 text-center text-xs font-semibold text-gray-600">상세</th>
          </tr>
        </thead>
        <tbody id="logsBody"></tbody>
      </table>
    </div>
    <div id="logsPagination" class="mt-4 flex justify-center gap-1"></div>
  </div>

  <div id="panelBulk" class="hidden">
    <div class="bg-white rounded-lg shadow p-6 max-w-3xl">
      <div class="mb-6">
        <div class="text-sm font-bold text-gray-700 mb-3">1. 발송 채널</div>
        <div class="flex gap-2 flex-wrap">
          <button onclick="setBulkChannel('kakao')" id="bulkChKakao" class="px-4 py-2 rounded-full text-sm font-medium bg-blue-50 border-2 border-blue-500 text-blue-700">💬 카카오톡</button>
          <button onclick="setBulkChannel('sms')" id="bulkChSms" class="px-4 py-2 rounded-full text-sm font-medium bg-white border border-gray-300 text-gray-600 hover:border-gray-400">📱 문자</button>
          <button onclick="setBulkChannel('email')" id="bulkChEmail" class="px-4 py-2 rounded-full text-sm font-medium bg-white border border-gray-300 text-gray-600 hover:border-gray-400">📧 이메일</button>
          <button disabled class="px-4 py-2 rounded-full text-sm font-medium bg-gray-100 border border-gray-200 text-gray-400 cursor-not-allowed">📠 팩스 (준비 중)</button>
        </div>
      </div>
      <div class="mb-6">
        <div class="text-sm font-bold text-gray-700 mb-3">2. 수신자</div>
        <div class="flex gap-2 flex-wrap mb-3">
          <button onclick="openRecipientPicker('employees')" id="bulkTgtEmployees" class="px-4 py-2 rounded-full text-sm font-medium bg-green-50 border-2 border-green-500 text-green-700">👥 직원 선택</button>
          <button onclick="openRecipientPicker('clients')" id="bulkTgtClients" class="px-4 py-2 rounded-full text-sm font-medium bg-white border border-gray-300 text-gray-600 hover:border-gray-400">🏢 거래처 선택</button>
          <button onclick="setBulkTarget('custom')" id="bulkTgtCustom" class="px-4 py-2 rounded-full text-sm font-medium bg-white border border-gray-300 text-gray-600 hover:border-gray-400">✏️ 직접 입력</button>
        </div>
        <div id="bulkTargetInfo" class="text-sm text-green-600 mb-2"></div>
        <!-- 선택된 수신자 태그 표시 영역 -->
        <div id="bulkSelectedTags" class="flex flex-wrap gap-1.5 mb-2"></div>
        <div id="bulkCustomArea" class="hidden">
          <textarea id="bulkReceivers" rows="4" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="전화번호,이름 (줄바꿈 구분)&#10;010-1234-5678,홍길동&#10;010-9876-5432,김철수"></textarea>
          <div class="text-xs text-gray-400 mt-1">이메일 채널의 경우: email@example.com,이름</div>
        </div>
      </div>
      <div class="mb-6">
        <div class="text-sm font-bold text-gray-700 mb-3">3. 내용</div>
        <div id="bulkKakaoArea" class="mb-3">
          <label class="text-xs font-semibold text-gray-600 mb-1 block">카카오톡 템플릿</label>
          <select id="bulkTemplate" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" onchange="onBulkTemplateChange()">
            <option value="">템플릿 선택</option>
          </select>
        </div>
        <div id="bulkSubjectArea" class="mb-3 hidden">
          <label class="text-xs font-semibold text-gray-600 mb-1 block">제목</label>
          <input type="text" id="bulkSubject" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="제목">
        </div>
        <div>
          <label class="text-xs font-semibold text-gray-600 mb-1 block">본문</label>
          <div id="bulkContentTextArea">
            <textarea id="bulkContent" rows="6" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="메시지 내용을 입력하세요" oninput="updateBulkByteCounter()"></textarea>
          </div>
          <div id="bulkContentEditorArea" class="hidden">
            <div id="bulkQuillEditor" style="min-height:150px;"></div>
          </div>
          <div class="flex justify-between mt-1">
            <span id="bulkChannelLabel" class="text-xs text-blue-600 font-medium">카카오톡</span>
            <span id="bulkByteCounter" class="text-xs text-gray-400 hidden">0 / 90 byte</span>
          </div>
        </div>
      </div>
      <!-- 예약 발송 (카카오/SMS) -->
      <div id="bulkScheduleArea" class="mb-4">
        <label class="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" id="bulkScheduleToggle" class="w-4 h-4 text-blue-600 rounded" onchange="toggleBulkSchedule()">
          <span class="text-sm font-semibold text-gray-700">예약 발송</span>
        </label>
        <div id="bulkScheduleInput" class="hidden mt-2">
          <input type="datetime-local" id="bulkScheduleAt" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm max-w-xs">
          <div class="text-xs text-gray-400 mt-1">지정한 시간에 자동 발송됩니다 (카카오톡/SMS만 지원)</div>
        </div>
      </div>
      <div class="flex justify-end pt-4 border-t">
        <button onclick="sendBulk()" id="bulkSendBtn" class="px-6 py-2.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 font-medium">
          <i class="fas fa-paper-plane mr-1"></i><span id="bulkSendLabel">발송</span>
        </button>
      </div>
    </div>
  </div>

  <div id="panelTemplates" class="hidden">
    <div class="flex gap-2 mb-4">
      <button onclick="switchTplSubTab('kakao')" id="tplSubKakao" class="px-4 py-2 rounded-lg text-sm font-medium bg-yellow-50 border border-yellow-400 text-yellow-800">💬 카카오톡</button>
      <button onclick="switchTplSubTab('sms')" id="tplSubSms" class="px-4 py-2 rounded-lg text-sm font-medium bg-white border border-gray-300 text-gray-600 hover:border-gray-400">📱 문자</button>
      <button onclick="switchTplSubTab('email')" id="tplSubEmail" class="px-4 py-2 rounded-lg text-sm font-medium bg-white border border-gray-300 text-gray-600 hover:border-gray-400">📧 이메일</button>
      <button onclick="switchTplSubTab('fax')" id="tplSubFax" class="px-4 py-2 rounded-lg text-sm font-medium bg-white border border-gray-300 text-gray-600 hover:border-gray-400">📠 팩스</button>
    </div>
    <div id="tplPanelKakao">
      <div class="flex items-center justify-between mb-3">
        <p class="text-sm text-gray-500">팝빌에 등록된 카카오톡 템플릿입니다. 새 템플릿은 팝빌 사이트에서 등록합니다.</p>
        <button onclick="loadKakaoTemplates()" class="px-3 py-1.5 border border-gray-300 text-gray-700 bg-white rounded text-xs hover:bg-gray-50"><i class="fas fa-sync-alt mr-1"></i>새로고침</button>
      </div>
      <div id="kakaoTemplatesList" class="space-y-3"></div>
    </div>
    <div id="tplPanelSms" class="hidden">
      <div class="flex items-center justify-between mb-3">
        <p class="text-sm text-gray-500">자주 쓰는 문자 메시지를 템플릿으로 저장하세요.</p>
        <button onclick="openTplEditor('sms')" class="px-3 py-1.5 bg-green-600 text-white rounded text-xs hover:bg-green-700"><i class="fas fa-plus mr-1"></i>새 템플릿</button>
      </div>
      <div id="smsTemplatesList" class="space-y-3"></div>
    </div>
    <div id="tplPanelEmail" class="hidden">
      <div class="flex items-center justify-between mb-3">
        <p class="text-sm text-gray-500">이메일 템플릿을 관리합니다.</p>
        <button onclick="openTplEditor('email')" class="px-3 py-1.5 bg-purple-600 text-white rounded text-xs hover:bg-purple-700"><i class="fas fa-plus mr-1"></i>새 템플릿</button>
      </div>
      <div id="emailTemplatesList" class="space-y-3"></div>
    </div>
    <div id="tplPanelFax" class="hidden">
      <div class="text-center py-12 text-gray-400">
        <i class="fas fa-fax text-3xl mb-3"></i>
        <p>팩스 기능은 준비 중입니다</p>
      </div>
    </div>
  </div>
</div>

<!-- 통계 패널 -->
<div id="panelStats" class="hidden">
  <div class="flex items-center justify-between mb-4">
    <div class="flex gap-2">
      <button onclick="loadStats(7)" id="statsDays7" class="px-3 py-1.5 rounded-lg text-xs font-medium bg-white border border-gray-300 text-gray-600">7일</button>
      <button onclick="loadStats(30)" id="statsDays30" class="px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-50 border-2 border-blue-500 text-blue-700">30일</button>
      <button onclick="loadStats(90)" id="statsDays90" class="px-3 py-1.5 rounded-lg text-xs font-medium bg-white border border-gray-300 text-gray-600">90일</button>
    </div>
  </div>

  <!-- 요약 카드 -->
  <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
    <div class="bg-white border border-gray-200 rounded-lg p-4">
      <div class="text-xs text-gray-500">총 발송</div>
      <div class="text-2xl font-bold text-gray-900 mt-1" id="statTotal">-</div>
    </div>
    <div class="bg-white border border-gray-200 rounded-lg p-4">
      <div class="text-xs text-gray-500">성공</div>
      <div class="text-2xl font-bold text-green-600 mt-1" id="statSuccess">-</div>
    </div>
    <div class="bg-white border border-gray-200 rounded-lg p-4">
      <div class="text-xs text-gray-500">실패</div>
      <div class="text-2xl font-bold text-red-600 mt-1" id="statFailed">-</div>
    </div>
    <div class="bg-white border border-gray-200 rounded-lg p-4">
      <div class="text-xs text-gray-500">성공률</div>
      <div class="text-2xl font-bold text-blue-600 mt-1" id="statRate">-</div>
    </div>
  </div>

  <!-- 차트 영역 -->
  <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
    <div class="bg-white border border-gray-200 rounded-lg p-4">
      <h3 class="text-sm font-bold text-gray-700 mb-3">일별 발송 추이</h3>
      <div style="position:relative;height:250px;">
        <canvas id="statDailyChart"></canvas>
      </div>
    </div>
    <div class="bg-white border border-gray-200 rounded-lg p-4">
      <h3 class="text-sm font-bold text-gray-700 mb-3">채널별 비중</h3>
      <div style="position:relative;height:250px;">
        <canvas id="statChannelChart"></canvas>
      </div>
    </div>
  </div>

  <!-- 하단: 업무별 + 주요 수신자 -->
  <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
    <div class="bg-white border border-gray-200 rounded-lg p-4">
      <h3 class="text-sm font-bold text-gray-700 mb-3">관련 업무별</h3>
      <div id="statByType" class="space-y-2"></div>
    </div>
    <div class="bg-white border border-gray-200 rounded-lg p-4">
      <h3 class="text-sm font-bold text-gray-700 mb-3">주요 수신자 Top 10</h3>
      <div id="statTopReceivers" class="space-y-2"></div>
    </div>
  </div>
</div>

<div id="logDetailModal" class="hidden fixed inset-0 z-50 flex items-center justify-center bg-black/50">
  <div class="bg-white rounded-lg shadow-xl w-[500px] max-h-[80vh] overflow-y-auto p-6">
    <div class="flex items-center justify-between mb-4">
      <h3 class="text-lg font-bold text-gray-800">발송 결과 상세</h3>
      <button onclick="document.getElementById('logDetailModal').classList.add('hidden')" class="text-gray-400 hover:text-gray-600"><i class="fas fa-times"></i></button>
    </div>
    <div id="logDetailContent" class="space-y-3 text-sm"></div>
  </div>
</div>

<!-- 수신자 선택 팝업 -->
<div id="recipientPickerModal" class="hidden fixed inset-0 z-50 flex items-center justify-center bg-black/50">
  <div class="bg-white rounded-lg shadow-xl w-[600px] max-h-[80vh] flex flex-col">
    <div class="flex items-center justify-between p-4 border-b">
      <h3 class="text-lg font-bold text-gray-800" id="recipientPickerTitle">수신자 선택</h3>
      <button onclick="closeRecipientPicker()" class="text-gray-400 hover:text-gray-600"><i class="fas fa-times"></i></button>
    </div>
    <div class="p-4 border-b">
      <div class="flex gap-2">
        <input type="text" id="recipientSearch" class="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="이름/전화번호 검색" oninput="filterRecipients()">
        <button onclick="toggleAllRecipients()" class="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50 whitespace-nowrap" id="recipientToggleAll">전체 선택</button>
      </div>
      <div class="flex items-center justify-between mt-2">
        <span class="text-xs text-gray-500" id="recipientCountInfo">0명 로딩 중...</span>
        <span class="text-xs text-blue-600 font-medium" id="recipientSelectedCount">0명 선택됨</span>
      </div>
    </div>
    <div class="flex-1 overflow-y-auto p-2" id="recipientList" style="max-height:400px;">
      <div class="text-center py-8 text-gray-400"><i class="fas fa-spinner fa-spin"></i> 로딩 중...</div>
    </div>
    <div class="p-4 border-t flex justify-end gap-2">
      <button onclick="closeRecipientPicker()" class="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50">취소</button>
      <button onclick="confirmRecipientPicker()" class="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"><i class="fas fa-check mr-1"></i>선택 완료</button>
    </div>
  </div>
</div>

<div id="tplEditorModal" class="hidden fixed inset-0 z-50 flex items-center justify-center bg-black/50">
  <div class="bg-white rounded-lg shadow-xl w-[500px] max-h-[80vh] overflow-y-auto p-6">
    <div class="flex items-center justify-between mb-4">
      <h3 class="text-lg font-bold text-gray-800" id="tplEditorTitle">새 템플릿</h3>
      <button onclick="closeTplEditor()" class="text-gray-400 hover:text-gray-600"><i class="fas fa-times"></i></button>
    </div>
    <input type="hidden" id="tplEditId" value="">
    <input type="hidden" id="tplEditChannel" value="">
    <div class="space-y-4">
      <div>
        <label class="text-sm font-semibold text-gray-700 mb-1 block">템플릿 이름 <span class="text-red-500">*</span></label>
        <input type="text" id="tplEditName" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="예: 공지 알림">
      </div>
      <div id="tplEditSubjectArea">
        <label class="text-sm font-semibold text-gray-700 mb-1 block">제목</label>
        <input type="text" id="tplEditSubject" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="제목 (이메일용)">
      </div>
      <div>
        <label class="text-sm font-semibold text-gray-700 mb-1 block">내용 <span class="text-red-500">*</span></label>
        <textarea id="tplEditContent" rows="6" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="메시지 내용"></textarea>
      </div>
    </div>
    <div class="flex justify-end gap-2 mt-6">
      <button onclick="closeTplEditor()" class="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50">취소</button>
      <button onclick="saveTplEdit()" class="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"><i class="fas fa-save mr-1"></i>저장</button>
    </div>
  </div>
</div>
    `,
    pageScript
  })
}
