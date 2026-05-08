import type { Context } from 'hono'
import type { HonoEnv } from '../types/env'
import { renderPage } from '../layout'
import pageScript from '../scripts/iaScan.js?raw'

export function iaScanPage(c: Context<HonoEnv>) {
  return renderPage(c, {
    title: 'IA 학습 데이터 검수',
    activePage: '/ia-scan',
    pageContent: `
<!-- 파일 입력 (dropZone 밖에 배치) -->
<input type="file" id="csvInput" accept=".csv" class="hidden">
<input type="file" id="jsonInput" accept=".json" class="hidden">
<input type="file" id="guerrillaInput" accept=".json" class="hidden">

<!-- 모드 탭 -->
<div class="flex gap-1 mb-4">
  <button id="tabNormal" onclick="switchTab('normal')" class="px-4 py-2 text-sm font-medium rounded-t-lg border border-b-0 bg-white text-blue-600 border-blue-200">일반 검수</button>
  <button id="tabGuerrilla" onclick="switchTab('guerrilla')" class="px-4 py-2 text-sm font-medium rounded-t-lg border border-b-0 bg-gray-50 text-gray-500 border-gray-200 hover:text-gray-700">게릴라 OCR</button>
</div>

<!-- ========== 일반 검수 탭 ========== -->
<div id="normalSection">

<!-- 상단: 파일 로드 + 내보내기 -->
<div id="headerBar" class="flex items-center gap-3 mb-4">
  <div id="dropZone" class="flex-1 border-2 border-dashed border-gray-300 rounded-lg px-4 py-3 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50/50 transition-all">
    <i class="fas fa-file-csv text-gray-400 mr-2"></i>
    <span class="text-gray-500 text-sm">pairs.csv 드롭 또는 클릭</span>
  </div>
  <button onclick="loadVerifiedJson()" class="px-3 py-2 text-xs border rounded-lg hover:bg-gray-50 text-gray-600" title="이전 검수 상태 복원">
    <i class="fas fa-upload mr-1"></i>검수 불러오기
  </button>
  <button id="btnExport" onclick="exportVerified()" class="px-3 py-2 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 hidden">
    <i class="fas fa-download mr-1"></i>verified.json
  </button>
</div>

<!-- 통계 (로드 후 표시) -->
<div id="statsSection" class="hidden">
  <!-- 워크플로우 가이드 -->
  <div id="workflowGuide" class="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-3">
    <div class="flex items-center gap-4 text-xs">
      <span id="wfStep1" class="flex items-center gap-1 font-bold text-blue-700">
        <span class="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px]">1</span>
        예외 처리
      </span>
      <i class="fas fa-chevron-right text-gray-300"></i>
      <span id="wfStep2" class="flex items-center gap-1 text-gray-400">
        <span class="w-5 h-5 rounded-full bg-gray-300 text-white flex items-center justify-center text-[10px]">2</span>
        샘플 검수
      </span>
      <i class="fas fa-chevron-right text-gray-300"></i>
      <span id="wfStep3" class="flex items-center gap-1 text-gray-400">
        <span class="w-5 h-5 rounded-full bg-gray-300 text-white flex items-center justify-center text-[10px]">3</span>
        일괄 승인
      </span>
      <span id="wfHint" class="ml-auto text-[10px] text-blue-600">output_only + original_only 먼저 ✗ 처리하세요</span>
    </div>
  </div>

  <!-- 요약 카드 -->
  <div class="grid grid-cols-3 md:grid-cols-6 gap-2 mb-3">
    <div class="bg-white rounded-lg border p-2.5 text-center">
      <div class="text-xl font-bold text-gray-700" id="statTotal">0</div>
      <div class="text-[10px] text-gray-400">전체</div>
    </div>
    <div class="bg-white rounded-lg border p-2.5 text-center">
      <div class="text-xl font-bold text-green-600" id="statApproved">0</div>
      <div class="text-[10px] text-gray-400">승인</div>
    </div>
    <div class="bg-white rounded-lg border p-2.5 text-center">
      <div class="text-xl font-bold text-red-600" id="statRejected">0</div>
      <div class="text-[10px] text-gray-400">거부</div>
    </div>
    <div class="bg-white rounded-lg border p-2.5 text-center">
      <div class="text-xl font-bold text-gray-400" id="statPending">0</div>
      <div class="text-[10px] text-gray-400">미검수</div>
    </div>
    <div class="bg-white rounded-lg border p-2.5 text-center">
      <div class="text-xl font-bold text-purple-600" id="statBB">0%</div>
      <div class="text-[10px] text-gray-400">BB 추출</div>
    </div>
    <div class="bg-white rounded-lg border p-2.5 text-center">
      <div class="text-xl font-bold text-blue-600" id="statCategorized">0</div>
      <div class="text-[10px] text-gray-400">품목태그</div>
    </div>
  </div>

  <!-- 진행률 바 -->
  <div class="bg-white rounded-lg border p-3 mb-3">
    <div class="flex items-center justify-between mb-1.5">
      <span class="text-xs font-medium text-gray-600">검수 진행률</span>
      <span class="text-xs text-gray-400" id="progressText">0 / 0</span>
    </div>
    <div class="flex h-3 rounded-full overflow-hidden bg-gray-100">
      <div id="barApproved" class="bg-green-500 transition-all" style="width:0%"></div>
      <div id="barRejected" class="bg-red-400 transition-all" style="width:0%"></div>
    </div>
    <div class="flex gap-4 mt-1.5 text-[10px] text-gray-400">
      <span><span class="inline-block w-2 h-2 rounded-sm bg-green-500 mr-0.5"></span>승인</span>
      <span><span class="inline-block w-2 h-2 rounded-sm bg-red-400 mr-0.5"></span>거부</span>
      <span><span class="inline-block w-2 h-2 rounded-sm bg-gray-200 mr-0.5"></span>미검수</span>
    </div>
  </div>

  <!-- 패턴 분포 -->
  <div class="bg-white rounded-lg border p-3 mb-3">
    <div class="flex items-center justify-between mb-1.5">
      <span class="text-xs font-medium text-gray-600">패턴 분포</span>
      <span class="text-xs text-gray-400" id="patternSummary"></span>
    </div>
    <div class="flex h-4 rounded-full overflow-hidden bg-gray-100" id="patternBar"></div>
    <div class="flex gap-3 mt-1.5 text-[10px] text-gray-400" id="patternLegend"></div>
  </div>

  <!-- 필터 + 검수 모드 -->
  <div class="bg-white rounded-lg border p-3 mb-3">
    <div class="flex flex-wrap items-end gap-2">
      <div>
        <label class="text-[10px] text-gray-400 block mb-0.5">검수 모드</label>
        <select id="filterMode" class="border rounded px-2 py-1 text-xs font-medium">
          <option value="all">전체 보기</option>
          <option value="problemFirst">⚡ 문제 우선 큐</option>
          <option value="exception">① 예외 처리 (출력만·원본만)</option>
          <option value="sample">② 샘플 검수 (패턴별 30건)</option>
          <option value="pending">미검수만</option>
        </select>
      </div>
      <div>
        <label class="text-[10px] text-gray-400 block mb-0.5">패턴</label>
        <select id="filterPattern" class="border rounded px-2 py-1 text-xs">
          <option value="">전체</option>
          <option value="A">A: 번호-거래처</option>
          <option value="B">B: (품목)거래처</option>
          <option value="C">C: 거래처-내용</option>
          <option value="D">D: 번호-(품목)</option>
          <option value="F">F: 게릴라(거래처+번호)</option>
          <option value="G">G: 게릴라(팀_번호)</option>
          <option value="H">H: 게릴라(본/팀+번호)</option>
          <option value="I">I: 폴더명 파싱</option>
          <option value="E">E: 파싱불가</option>
        </select>
      </div>
      <div>
        <label class="text-[10px] text-gray-400 block mb-0.5">매칭</label>
        <select id="filterStatus" class="border rounded px-2 py-1 text-xs">
          <option value="">전체</option>
          <option value="paired">매칭</option>
          <option value="output_only">출력만</option>
          <option value="original_only">원본만</option>
        </select>
      </div>
      <div>
        <label class="text-[10px] text-gray-400 block mb-0.5">검수</label>
        <select id="filterVerify" class="border rounded px-2 py-1 text-xs">
          <option value="">전체</option>
          <option value="approved">승인</option>
          <option value="rejected">거부</option>
          <option value="pending">미검수</option>
        </select>
      </div>
      <div>
        <label class="text-[10px] text-gray-400 block mb-0.5">일자</label>
        <select id="filterDay" class="border rounded px-2 py-1 text-xs">
          <option value="">전체</option>
        </select>
      </div>
      <div>
        <label class="text-[10px] text-gray-400 block mb-0.5">거래처</label>
        <input id="filterClient" type="text" placeholder="검색..." class="border rounded px-2 py-1 text-xs w-24">
      </div>
      <div class="ml-auto flex items-end gap-2">
        <button id="btnBulkReject" onclick="bulkReject()" class="px-2 py-1 text-[10px] bg-red-50 text-red-700 border border-red-200 rounded hover:bg-red-100 hidden" title="필터된 미검수 행을 모두 거부">
          <i class="fas fa-times mr-0.5"></i>일괄 거부
        </button>
        <button id="btnBulkApprove" onclick="bulkApprove()" class="px-2 py-1 text-[10px] bg-gray-100 text-gray-400 border border-gray-200 rounded cursor-not-allowed" disabled title="샘플 검수 오류율 5% 이하일 때 활성화">
          <i class="fas fa-check-double mr-0.5"></i>일괄 승인 <span id="errorRateLabel"></span>
        </button>
        <button id="btnBulkApproveFiltered" onclick="bulkApproveFiltered()" class="px-2 py-1 text-[10px] bg-blue-50 text-blue-700 border border-blue-200 rounded hover:bg-blue-100 hidden" title="현재 필터 결과의 미검수를 모두 승인">
          <i class="fas fa-check-circle mr-0.5"></i>필터 전체 승인
        </button>
        <button id="btnBulkApproveSameOutput" onclick="bulkApproveSameOutput()" class="px-2 py-1 text-[10px] bg-green-50 text-green-700 border border-green-200 rounded hover:bg-green-100 hidden" title="같은 출력 파일의 행을 일괄 승인">
          <i class="fas fa-copy mr-0.5"></i>같은 출력 일괄
        </button>
        <button id="btnBulkApproveClientDate" onclick="bulkApproveClientDate()" class="px-2 py-1 text-[10px] bg-purple-50 text-purple-700 border border-purple-200 rounded hover:bg-purple-100 hidden" title="같은 거래처+날짜의 행을 일괄 승인">
          <i class="fas fa-users mr-0.5"></i>거래처+날짜 일괄
        </button>
        <button onclick="resetFilters()" class="text-[10px] text-gray-400 hover:text-blue-600 underline">초기화</button>
        <span class="text-[10px] text-gray-400" id="filteredCount"></span>
      </div>
    </div>
  </div>

  <!-- 좌우 분할: 테이블 + 미리보기 -->
  <div id="splitContainer" class="flex gap-3" style="height: calc(100vh - 380px); min-height: 400px;">
    <!-- 좌측: 테이블 (55%) -->
    <div class="flex-[55] flex flex-col min-w-0">
      <div class="bg-white rounded-lg border overflow-hidden flex flex-col flex-1">
        <div class="overflow-auto flex-1">
          <table class="w-full text-xs ds-table-striped">
            <thead class="bg-gray-50 sticky top-0 z-10">
              <tr>
                <th class="px-2 py-1.5 text-left cursor-pointer hover:bg-gray-100 w-8" onclick="sortBy('id')">#</th>
                <th class="px-2 py-1.5 text-left cursor-pointer hover:bg-gray-100 w-8" onclick="sortBy('day')">일</th>
                <th class="px-2 py-1.5 text-left w-8">패턴</th>
                <th class="px-2 py-1.5 text-left cursor-pointer hover:bg-gray-100" onclick="sortBy('client')">거래처</th>
                <th class="px-2 py-1.5 text-left">출력 파일</th>
                <th class="px-2 py-1.5 text-left">원본 파일</th>
                <th class="px-2 py-1.5 text-right w-10">가로</th>
                <th class="px-2 py-1.5 text-right w-10">세로</th>
                <th class="px-2 py-1.5 text-center w-14" title="출력BB vs 파일명 비율 / 원본ArtBox 여백">비율/여백</th>
                <th class="px-2 py-1.5 text-left w-20">품목</th>
                <th class="px-2 py-1.5 text-left w-24">후가공</th>
                <th class="px-2 py-1.5 text-center w-14">검수</th>
              </tr>
            </thead>
            <tbody id="tableBody" class="divide-y divide-gray-100"></tbody>
          </table>
        </div>
        <div class="flex items-center justify-between px-3 py-2 border-t bg-gray-50 flex-shrink-0">
          <span class="text-[10px] text-gray-400" id="pageInfo"></span>
          <div class="flex gap-1" id="pagination"></div>
        </div>
      </div>
    </div>

    <!-- 우측: 미리보기 (45%) -->
    <div class="flex-[45] flex flex-col min-w-0">
      <div id="previewPanel" class="bg-white rounded-lg border overflow-hidden flex flex-col flex-1">
        <div class="flex items-center justify-between px-3 py-2 bg-gray-50 border-b flex-shrink-0">
          <span class="text-xs font-medium text-gray-600" id="previewTitle">미리보기</span>
          <div class="flex items-center gap-2">
            <span class="text-[10px] text-gray-400" id="previewShortcuts">↑↓ 이동 · 1 승인 · 2 거부 · Space 확대</span>
            <button onclick="closePreview()" class="text-gray-400 hover:text-gray-600 text-sm">&times;</button>
          </div>
        </div>
        <div class="overflow-auto flex-1 p-3" id="previewBody">
          <div class="flex flex-col items-center justify-center h-full text-gray-300">
            <i class="fas fa-image text-4xl mb-2"></i>
            <span class="text-xs">행을 클릭하거나 ↑↓ 키로 선택하세요</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>
</div><!-- /normalSection -->

<!-- ========== 게릴라 OCR 탭 ========== -->
<div id="guerrillaSection" class="hidden">
  <!-- 파일 로드 -->
  <div class="flex items-center gap-3 mb-4">
    <div id="gDropZone" class="flex-1 border-2 border-dashed border-orange-300 rounded-lg px-4 py-3 text-center cursor-pointer hover:border-orange-400 hover:bg-orange-50/50 transition-all" onclick="document.getElementById('guerrillaInput').click()">
      <i class="fas fa-crosshairs text-orange-400 mr-2"></i>
      <span class="text-gray-500 text-sm">guerrilla-ocr.json 드롭 또는 클릭</span>
    </div>
    <button id="gBtnExport" onclick="exportGuerrilla()" class="px-3 py-2 text-xs border border-gray-300 text-gray-700 bg-white rounded-lg hover:bg-gray-50 hidden">
      <i class="fas fa-download mr-1"></i>guerrilla-verified.json
    </button>
  </div>

  <!-- 통계 -->
  <div id="gStats" class="hidden">
    <div class="grid grid-cols-2 md:grid-cols-5 gap-2 mb-3">
      <div class="bg-white rounded-lg border p-2.5 text-center">
        <div class="text-xl font-bold text-gray-700" id="gStatTotal">0</div>
        <div class="text-[10px] text-gray-400">전체 EPS</div>
      </div>
      <div class="bg-white rounded-lg border p-2.5 text-center">
        <div class="text-xl font-bold text-blue-600" id="gStatPhones">0</div>
        <div class="text-[10px] text-gray-400">번호 추출</div>
      </div>
      <div class="bg-white rounded-lg border p-2.5 text-center">
        <div class="text-xl font-bold text-green-600" id="gStatApproved">0</div>
        <div class="text-[10px] text-gray-400">승인</div>
      </div>
      <div class="bg-white rounded-lg border p-2.5 text-center">
        <div class="text-xl font-bold text-red-600" id="gStatFailed">0</div>
        <div class="text-[10px] text-gray-400">실패/거부</div>
      </div>
      <div class="bg-white rounded-lg border p-2.5 text-center">
        <div class="text-xl font-bold text-purple-600" id="gStatUnique">0</div>
        <div class="text-[10px] text-gray-400">고유 번호</div>
      </div>
    </div>

    <!-- 필터 -->
    <div class="bg-white rounded-lg border p-3 mb-3">
      <div class="flex flex-wrap items-end gap-2">
        <div>
          <label class="text-[10px] text-gray-400 block mb-0.5">상태</label>
          <select id="gFilterStatus" class="border rounded px-2 py-1 text-xs">
            <option value="">전체</option>
            <option value="found">번호 있음</option>
            <option value="empty">번호 없음</option>
            <option value="approved">승인</option>
            <option value="rejected">거부</option>
          </select>
        </div>
        <div>
          <label class="text-[10px] text-gray-400 block mb-0.5">거래처</label>
          <select id="gFilterClient" class="border rounded px-2 py-1 text-xs">
            <option value="">전체</option>
          </select>
        </div>
        <div class="ml-auto flex items-end gap-2">
          <button onclick="gBulkApprove()" class="px-2 py-1 text-[10px] bg-green-50 text-green-700 border border-green-200 rounded hover:bg-green-100">
            <i class="fas fa-check-double mr-0.5"></i>번호있는 행 일괄 승인
          </button>
          <span class="text-[10px] text-gray-400" id="gFilteredCount"></span>
        </div>
      </div>
    </div>

    <!-- 테이블 -->
    <div class="bg-white rounded-lg border overflow-hidden">
      <div class="overflow-x-auto" style="max-height: calc(100vh - 280px); overflow-y: auto;">
        <table class="w-full text-xs ds-table-striped">
          <thead class="bg-gray-50 sticky top-0">
            <tr>
              <th class="px-2 py-1.5 text-left w-8">#</th>
              <th class="px-2 py-1.5 text-left w-8">일</th>
              <th class="px-2 py-1.5 text-left">거래처</th>
              <th class="px-2 py-1.5 text-left">출력 파일</th>
              <th class="px-2 py-1.5 text-left w-32">OCR 번호</th>
              <th class="px-2 py-1.5 text-left w-16">뒤4자리</th>
              <th class="px-2 py-1.5 text-left w-12">단위</th>
              <th class="px-2 py-1.5 text-left w-28">파일명 후보</th>
              <th class="px-2 py-1.5 text-center w-16">검수</th>
            </tr>
          </thead>
          <tbody id="gTableBody" class="divide-y divide-gray-100"></tbody>
        </table>
      </div>
      <div class="flex items-center justify-between px-3 py-2 border-t bg-gray-50">
        <span class="text-[10px] text-gray-400" id="gPageInfo"></span>
        <div class="flex gap-1" id="gPagination"></div>
      </div>
    </div>
  </div>
</div><!-- /guerrillaSection -->
`,
    pageScript,
  })
}
