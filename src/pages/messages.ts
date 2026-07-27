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
    <div class="ds-card p-5">
      <div class="text-xs text-gray-500">카카오톡 상태</div>
      <div class="text-3xl font-bold mt-1" id="msgStatusValue">-</div>
      <div class="text-xs text-gray-400 mt-1" id="msgChannelInfo"></div>
    </div>
    <div class="ds-card p-5">
      <div class="text-xs text-gray-500">오늘 발송</div>
      <div class="text-3xl font-bold text-gray-900 mt-1" id="msgTodayCount">-</div>
    </div>
    <div class="ds-card p-5">
      <div class="flex items-center justify-between">
        <div class="text-xs text-gray-500">발송 단가 <span class="text-gray-400">(부가세 별도)</span></div>
        <button id="msgUcRefreshBtn" onclick="refreshUnitCost()" title="바로빌에서 실시간 단가 재조회" class="text-gray-400 hover:text-blue-600 text-xs"><i class="fas fa-sync"></i></button>
      </div>
      <div class="mt-2 space-y-1 text-xs">
        <div class="flex justify-between"><span class="text-gray-600">알림톡</span><span class="font-bold text-gray-900" id="msgUcAlim">-</span></div>
        <div class="flex justify-between"><span class="text-gray-600">카톡 이미지</span><span class="font-bold text-gray-900" id="msgUcKkoImg">-</span></div>
        <div class="flex justify-between"><span class="text-gray-600">SMS 단문</span><span class="font-bold text-gray-900" id="msgUcSms">-</span></div>
        <div class="flex justify-between"><span class="text-gray-600">SMS 장문</span><span class="font-bold text-gray-900" id="msgUcLms">-</span></div>
        <div class="flex justify-between"><span class="text-gray-600">MMS 그림</span><span class="font-bold text-gray-900" id="msgUcMms">-</span></div>
        <div class="flex justify-between"><span class="text-gray-600">팩스</span><span class="font-bold text-gray-900" id="msgUcFax">-</span></div>
      </div>
    </div>
    <div class="ds-card p-5">
      <div class="text-xs text-gray-500">통합 포인트</div>
      <div class="text-3xl font-bold text-gray-900 mt-1" id="msgBalance">-</div>
      <div class="text-xs text-gray-400 mt-1" id="msgPartnerPoint"></div>
    </div>
  </div>

  <div class="flex gap-2">
    <button onclick="openIndividualSend()" class="ds-btn ds-btn-primary text-sm">
      <i class="fas fa-paper-plane mr-1"></i>새 발송
    </button>
  </div>

  <div class="flex border-b">
    <button id="tabHistory" onclick="switchMsgTab('history')" class="px-5 py-2.5 text-sm font-medium border-b-2 border-blue-600 text-blue-600">발송 이력</button>
    <button id="tabBulk" onclick="switchMsgTab('bulk')" class="px-5 py-2.5 text-sm font-medium text-gray-500 hover:text-gray-700">대량 발송</button>
    <button id="tabGroups" onclick="switchMsgTab('groups')" class="px-5 py-2.5 text-sm font-medium text-gray-500 hover:text-gray-700">그룹 관리</button>
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
        <option value="mms">MMS</option>
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
      <input type="text" id="logDateFrom" class="js-fp border border-gray-300 rounded-lg px-3 py-2 text-sm" maxlength="10" inputmode="numeric" placeholder="예: 2026-01-15" title="발송일 시작">
      <span class="text-gray-400 text-sm">~</span>
      <input type="text" id="logDateTo" class="js-fp border border-gray-300 rounded-lg px-3 py-2 text-sm" maxlength="10" inputmode="numeric" placeholder="예: 2026-01-15" title="발송일 종료">
      <button onclick="loadLogs()" class="ds-btn ds-btn-primary text-sm"><i class="fas fa-search mr-1"></i>검색</button>
    </div>
    <div class="ds-card overflow-hidden">
      <table class="w-full ds-table ds-table-striped">
        <thead class="bg-gray-50">
          <tr>
            <th class="col-datetime px-4 py-3 text-left text-xs font-semibold text-gray-600">발송일시</th>
            <th class="col-tag px-4 py-3 text-left text-xs font-semibold text-gray-600">채널</th>
            <th class="col-name px-4 py-3 text-left text-xs font-semibold text-gray-600">수신자</th>
            <th class="col-phone px-4 py-3 text-left text-xs font-semibold text-gray-600">수신번호</th>
            <th class="col-tag px-4 py-3 text-left text-xs font-semibold text-gray-600">관련 업무</th>
            <th class="col-status px-4 py-3 text-center text-xs font-semibold text-gray-600">상태</th>
            <th class="col-action px-4 py-3 text-center text-xs font-semibold text-gray-600">상세</th>
          </tr>
        </thead>
        <tbody id="logsBody"></tbody>
      </table>
    </div>
    <div id="logsPagination" class="mt-4 flex justify-center gap-1"></div>
  </div>

  <div id="panelBulk" class="hidden">
    <div class="ds-card p-6 max-w-3xl">
      <div class="mb-6">
        <div class="text-sm font-bold text-gray-700 mb-3">1. 발송 채널</div>
        <div class="flex gap-2 flex-wrap">
          <button onclick="setBulkChannel('kakao')" id="bulkChKakao" class="px-4 py-2 rounded-full text-sm font-medium bg-blue-50 border-2 border-blue-500 text-blue-700"><i class="fas fa-comment mr-1"></i>카카오톡</button>
          <button onclick="setBulkChannel('sms')" id="bulkChSms" class="px-4 py-2 rounded-full text-sm font-medium bg-white border border-gray-300 text-gray-600 hover:border-gray-400"><i class="fas fa-sms mr-1"></i>문자</button>
          <button onclick="setBulkChannel('mms')" id="bulkChMms" class="px-4 py-2 rounded-full text-sm font-medium bg-white border border-gray-300 text-gray-600 hover:border-gray-400" title="이미지 첨부 문자 (100원/건)"><i class="fas fa-image mr-1"></i>MMS</button>
          <button onclick="setBulkChannel('email')" id="bulkChEmail" class="px-4 py-2 rounded-full text-sm font-medium bg-white border border-gray-300 text-gray-600 hover:border-gray-400"><i class="fas fa-envelope mr-1"></i>이메일</button>
          <button disabled class="px-4 py-2 rounded-full text-sm font-medium bg-gray-100 border border-gray-200 text-gray-400 cursor-not-allowed"><i class="fas fa-fax mr-1"></i>팩스 (준비 중)</button>
        </div>
      </div>
      <div class="mb-6">
        <div class="text-sm font-bold text-gray-700 mb-3">2. 수신자</div>
        <div class="flex gap-2 flex-wrap mb-3">
          <button onclick="openRecipientPicker('employees')" id="bulkTgtEmployees" class="px-4 py-2 rounded-full text-sm font-medium bg-green-50 border-2 border-green-500 text-green-700"><i class="fas fa-users mr-1"></i>직원 선택</button>
          <button onclick="openRecipientPicker('clients')" id="bulkTgtClients" class="px-4 py-2 rounded-full text-sm font-medium bg-white border border-gray-300 text-gray-600 hover:border-gray-400"><i class="fas fa-building mr-1"></i>거래처 선택</button>
          <button onclick="openGroupPicker()" id="bulkTgtGroup" class="px-4 py-2 rounded-full text-sm font-medium bg-white border border-gray-300 text-gray-600 hover:border-gray-400"><i class="fas fa-layer-group mr-1"></i>그룹 선택</button>
          <button onclick="setBulkTarget('custom')" id="bulkTgtCustom" class="px-4 py-2 rounded-full text-sm font-medium bg-white border border-gray-300 text-gray-600 hover:border-gray-400"><i class="fas fa-pen mr-1"></i>직접 입력</button>
        </div>
        <div id="bulkTargetInfo" class="text-sm text-green-600 mb-2"></div>
        <!-- 선택된 수신자 태그 표시 영역 -->
        <div id="bulkSelectedTags" class="flex flex-wrap gap-1.5 mb-2"></div>
        <div id="bulkCustomArea" class="hidden">
          <div class="flex items-center gap-2 mb-2">
            <input type="file" id="bulkCsvFile" accept=".csv,text/csv" class="hidden" onchange="onBulkCsvPick(this)">
            <button type="button" onclick="document.getElementById('bulkCsvFile').click()" class="px-3 py-1.5 border border-gray-300 rounded-lg text-xs text-gray-700 hover:bg-gray-50"><i class="fas fa-file-csv mr-1"></i>CSV 파일</button>
            <span class="text-xs text-gray-400">또는 엑셀에서 범위를 복사해 아래에 붙여넣기</span>
          </div>
          <textarea id="bulkReceivers" rows="6" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono" oninput="parseBulkReceivers()" placeholder="엑셀에서 복사해 붙여넣으세요 (탭·쉼표 모두 인식)&#10;&#10;전화번호	거래처명	미수금&#10;010-1234-5678	대진	350000&#10;010-9876-5432	푸른솔	120000"></textarea>
          <div id="bulkParseInfo" class="text-xs text-gray-500 mt-1"></div>
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
        <!-- MMS 이미지 첨부 (대량) -->
        <div id="bulkImageArea" class="mb-3 hidden">
          <label class="text-xs font-semibold text-gray-600 mb-1 block">첨부 이미지 <span class="text-gray-400 font-normal">(JPG 자동 변환·축소)</span></label>
          <div class="flex items-center gap-2">
            <input type="file" id="bulkImageFile" accept="image/*" class="hidden" onchange="onBulkImagePick(this)">
            <button type="button" onclick="document.getElementById('bulkImageFile').click()" class="px-3 py-2 border border-gray-300 rounded-lg text-xs text-gray-700 hover:bg-gray-50"><i class="fas fa-upload mr-1"></i>이미지 선택</button>
            <img id="bulkImagePreview" class="hidden h-12 w-12 object-cover rounded border" alt="">
            <span id="bulkImageInfo" class="text-xs text-gray-400 flex-1 truncate">선택된 이미지 없음</span>
            <button type="button" id="bulkImageClearBtn" onclick="clearBulkImage()" class="hidden text-xs text-gray-400 hover:text-red-600"><i class="fas fa-times"></i></button>
          </div>
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
          <!-- 변수 도움말 + 미리보기 -->
          <div class="mt-2 p-2.5 bg-gray-50 rounded-lg">
            <div class="flex items-center justify-between mb-1.5">
              <span class="text-xs font-semibold text-gray-600">수신자별 변수 <span class="font-normal text-gray-400">(클릭하면 본문에 삽입)</span></span>
              <button type="button" onclick="previewBulkMessage()" class="text-xs text-blue-600 hover:text-blue-800"><i class="fas fa-eye mr-1"></i>치환 미리보기</button>
            </div>
            <div id="bulkVarChips" class="flex flex-wrap gap-1"></div>
            <div id="bulkPreviewBox" class="hidden mt-2 p-2 bg-white border border-gray-200 rounded text-xs whitespace-pre-wrap text-gray-700"></div>
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
      <div class="flex items-center justify-between pt-4 border-t">
        <div id="bulkCostInfo" class="text-xs text-gray-500"></div>
        <button onclick="sendBulk()" id="bulkSendBtn" class="ds-btn ds-btn-primary text-sm font-medium">
          <i class="fas fa-paper-plane mr-1"></i><span id="bulkSendLabel">발송</span>
        </button>
      </div>
    </div>
  </div>

  <div id="panelGroups" class="hidden">
    <div class="flex items-center justify-between mb-4">
      <div class="text-sm text-gray-500">거래처를 그룹으로 묶어두면 대량 발송에서 그룹 하나로 수신자를 채울 수 있습니다.</div>
      <button onclick="openGroupEditor()" class="ds-btn ds-btn-primary text-sm"><i class="fas fa-plus mr-1"></i>새 그룹</button>
    </div>
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div class="ds-card p-4 lg:col-span-1">
        <div class="text-xs font-bold text-gray-600 mb-2">그룹 목록</div>
        <div id="groupList" class="space-y-1"></div>
      </div>
      <div class="ds-card p-4 lg:col-span-2">
        <div class="flex items-center justify-between mb-3">
          <div>
            <div id="groupDetailName" class="text-sm font-bold text-gray-800">그룹을 선택하세요</div>
            <div id="groupDetailDesc" class="text-xs text-gray-400"></div>
          </div>
          <div id="groupDetailActions" class="hidden flex gap-2">
            <button onclick="openRecipientPicker('clients', true)" class="px-3 py-1.5 bg-blue-600 text-white rounded text-xs hover:bg-blue-700"><i class="fas fa-user-plus mr-1"></i>거래처 추가</button>
            <button onclick="editCurrentGroup()" class="px-3 py-1.5 border border-gray-300 rounded text-xs text-gray-700 hover:bg-gray-50"><i class="fas fa-pen mr-1"></i>이름 수정</button>
            <button onclick="deleteCurrentGroup()" class="px-3 py-1.5 border border-red-200 text-red-600 rounded text-xs hover:bg-red-50"><i class="fas fa-trash mr-1"></i>삭제</button>
          </div>
        </div>
        <div id="groupMemberWarn" class="hidden text-xs text-amber-600 mb-2"></div>
        <div class="overflow-hidden">
          <table class="w-full ds-table ds-table-striped">
            <thead class="bg-gray-50">
              <tr>
                <th class="col-name px-3 py-2 text-left text-xs font-semibold text-gray-600">이름</th>
                <th class="col-phone px-3 py-2 text-left text-xs font-semibold text-gray-600">연락처</th>
                <th class="col-email px-3 py-2 text-left text-xs font-semibold text-gray-600">이메일</th>
                <th class="col-action px-3 py-2 text-center text-xs font-semibold text-gray-600">제거</th>
              </tr>
            </thead>
            <tbody id="groupMemberBody"></tbody>
          </table>
        </div>
      </div>
    </div>
  </div>

  <div id="panelTemplates" class="hidden">
    <div class="flex gap-2 mb-4">
      <button onclick="switchTplSubTab('kakao')" id="tplSubKakao" class="px-4 py-2 rounded-lg text-sm font-medium bg-yellow-50 border border-yellow-400 text-yellow-800"><i class="fas fa-comment mr-1"></i>카카오톡</button>
      <button onclick="switchTplSubTab('sms')" id="tplSubSms" class="px-4 py-2 rounded-lg text-sm font-medium bg-white border border-gray-300 text-gray-600 hover:border-gray-400"><i class="fas fa-sms mr-1"></i>문자</button>
      <button onclick="switchTplSubTab('email')" id="tplSubEmail" class="px-4 py-2 rounded-lg text-sm font-medium bg-white border border-gray-300 text-gray-600 hover:border-gray-400"><i class="fas fa-envelope mr-1"></i>이메일</button>
      <button onclick="switchTplSubTab('fax')" id="tplSubFax" class="px-4 py-2 rounded-lg text-sm font-medium bg-white border border-gray-300 text-gray-600 hover:border-gray-400"><i class="fas fa-fax mr-1"></i>팩스</button>
    </div>
    <div id="tplPanelKakao">
      <div class="flex items-center justify-between mb-3">
        <p class="text-sm text-gray-500">등록된 카카오톡 템플릿입니다. 새 템플릿은 바로빌 사이트에서 등록합니다.</p>
        <button onclick="loadKakaoTemplates()" class="px-3 py-1.5 border border-gray-300 text-gray-700 bg-white rounded text-xs hover:bg-gray-50"><i class="fas fa-sync-alt mr-1"></i>새로고침</button>
      </div>
      <div id="kakaoTemplatesList" class="space-y-3"></div>
    </div>
    <div id="tplPanelSms" class="hidden">
      <div class="flex items-center justify-between mb-3">
        <p class="text-sm text-gray-500">자주 쓰는 문자 메시지를 템플릿으로 저장하세요.</p>
        <button onclick="openTplEditor('sms')" class="px-3 py-1.5 bg-blue-600 text-white rounded text-xs hover:bg-blue-700"><i class="fas fa-plus mr-1"></i>새 템플릿</button>
      </div>
      <div id="smsTemplatesList" class="space-y-3"></div>
    </div>
    <div id="tplPanelEmail" class="hidden">
      <div class="flex items-center justify-between mb-3">
        <p class="text-sm text-gray-500">이메일 템플릿을 관리합니다.</p>
        <button onclick="openTplEditor('email')" class="px-3 py-1.5 bg-blue-600 text-white rounded text-xs hover:bg-blue-700"><i class="fas fa-plus mr-1"></i>새 템플릿</button>
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

<div id="logDetailModal" class="ds-modal-overlay hidden flex items-center justify-center">
  <div class="ds-modal w-[500px] max-h-[80vh] overflow-y-auto p-6">
    <div class="flex items-center justify-between mb-4">
      <h3 class="text-lg font-bold text-gray-800">발송 결과 상세</h3>
      <button onclick="document.getElementById('logDetailModal').classList.add('hidden')" class="text-gray-400 hover:text-gray-600"><i class="fas fa-times"></i></button>
    </div>
    <div id="logDetailContent" class="space-y-3 text-sm"></div>
  </div>
</div>

<!-- 수신자 선택 팝업 -->
<div id="recipientPickerModal" class="ds-modal-overlay hidden flex items-center justify-center">
  <div class="ds-modal w-[600px] max-h-[80vh] flex flex-col">
    <div class="flex items-center justify-between p-4 border-b">
      <h3 class="text-lg font-bold text-gray-800" id="recipientPickerTitle">수신자 선택</h3>
      <button onclick="closeRecipientPicker()" class="text-gray-400 hover:text-gray-600"><i class="fas fa-times"></i></button>
    </div>
    <div class="p-4 border-b">
      <div class="flex gap-2">
        <input type="text" id="recipientSearch" class="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="이름/전화번호 검색" oninput="filterRecipients()">
        <button onclick="toggleAllRecipients()" class="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50 whitespace-nowrap" id="recipientToggleAll">화면 전체</button>
        <button onclick="selectAllServerRecipients()" class="hidden px-3 py-2 border border-blue-300 bg-blue-50 text-blue-700 rounded-lg text-sm hover:bg-blue-100 whitespace-nowrap" id="recipientSelectAllServer">검색 결과 전체 선택</button>
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
      <button onclick="confirmRecipientPicker()" class="ds-btn ds-btn-primary text-sm"><i class="fas fa-check mr-1"></i>선택 완료</button>
    </div>
  </div>
</div>

<div id="groupPickerModal" class="ds-modal-overlay hidden flex items-center justify-center">
  <div class="ds-modal w-[520px] max-h-[80vh] flex flex-col">
    <div class="flex items-center justify-between p-4 border-b">
      <h3 class="text-lg font-bold text-gray-800">그룹 선택</h3>
      <button onclick="closeGroupPicker()" class="text-gray-400 hover:text-gray-600"><i class="fas fa-times"></i></button>
    </div>
    <div class="flex-1 overflow-y-auto p-3" id="groupPickerList" style="max-height:420px;">
      <div class="text-center py-8 text-gray-400"><i class="fas fa-spinner fa-spin"></i> 로딩 중...</div>
    </div>
    <div class="p-4 border-t text-xs text-gray-400">그룹을 클릭하면 수신자가 채워집니다. 그룹 만들기는 <b>그룹 관리</b> 탭에서.</div>
  </div>
</div>

<div id="groupEditorModal" class="ds-modal-overlay hidden flex items-center justify-center">
  <div class="ds-modal w-[420px] p-6">
    <div class="flex items-center justify-between mb-4">
      <h3 class="text-lg font-bold text-gray-800" id="groupEditorTitle">새 그룹</h3>
      <button onclick="closeGroupEditor()" class="text-gray-400 hover:text-gray-600"><i class="fas fa-times"></i></button>
    </div>
    <div class="space-y-3">
      <div>
        <label class="text-xs font-semibold text-gray-600 mb-1 block">그룹명</label>
        <input type="text" id="groupEditorName" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="예: 주요 거래처">
      </div>
      <div>
        <label class="text-xs font-semibold text-gray-600 mb-1 block">설명 <span class="text-gray-400 font-normal">(선택)</span></label>
        <input type="text" id="groupEditorDesc" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="어떤 기준으로 묶은 그룹인지">
      </div>
    </div>
    <div class="flex justify-end gap-2 mt-5">
      <button onclick="closeGroupEditor()" class="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50">취소</button>
      <button onclick="saveGroupEditor()" class="ds-btn ds-btn-primary text-sm">저장</button>
    </div>
  </div>
</div>

<div id="tplEditorModal" class="ds-modal-overlay hidden flex items-center justify-center">
  <div class="ds-modal w-[500px] max-h-[80vh] overflow-y-auto p-6">
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
      <button onclick="saveTplEdit()" class="ds-btn ds-btn-primary text-sm"><i class="fas fa-save mr-1"></i>저장</button>
    </div>
  </div>
</div>
    `,
    pageScript
  })
}
