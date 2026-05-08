import type { Context } from 'hono'
import type { HonoEnv } from '../types/env'
import { renderPage } from '../layout'
import pageScript from '../scripts/iaBatchTest.js?raw'

export function iaBatchTestPage(c: Context<HonoEnv>) {
  return renderPage(c, {
    title: 'IA 배치 테스트',
    activePage: '/ia-batch-test',
    pageContent: `
        <div class="container mx-auto px-4 py-6 max-w-7xl">
            <!-- 요약 카드 -->
            <div id="summaryCards" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6 hidden">
                <div class="bg-white border border-gray-200 rounded-lg p-5">
                    <div class="text-sm text-gray-500 mb-1">전체 요청</div>
                    <div id="statTotal" class="text-3xl font-bold text-gray-900">0</div>
                </div>
                <div class="bg-white border border-gray-200 rounded-lg p-5">
                    <div class="text-sm text-gray-500 mb-1">처리 대기</div>
                    <div id="statPending" class="text-3xl font-bold text-amber-500">0</div>
                </div>
                <div class="bg-white border border-gray-200 rounded-lg p-5">
                    <div class="text-sm text-gray-500 mb-1">완료</div>
                    <div id="statDone" class="text-3xl font-bold text-green-600">0</div>
                </div>
                <div class="bg-white border border-gray-200 rounded-lg p-5">
                    <div class="text-sm text-gray-500 mb-1">에러</div>
                    <div id="statError" class="text-3xl font-bold text-red-600">0</div>
                </div>
            </div>

            <!-- 배치 등록 영역 -->
            <div class="bg-white border border-gray-200 rounded-lg p-5 mb-6">
                <h3 class="text-sm font-semibold text-gray-700 mb-3">배치 테스트 등록</h3>

                <!-- 폴더 스캔 모드 -->
                <div class="mb-4">
                    <label class="text-sm text-gray-500 mb-1 block">폴더 경로 (하위 폴더 포함 .ai/.eps 자동 스캔)</label>
                    <div class="flex gap-2">
                        <input id="folderPath" type="text" class="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            placeholder="Z:\\123\\07월  또는  Z:\\123\\07월\\01일">
                        <button onclick="scanFolder()" id="scanBtn" class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium whitespace-nowrap">
                            폴더 스캔
                        </button>
                    </div>
                    <div id="scanStatus" class="mt-2 text-sm hidden"></div>
                </div>

                <!-- 스캔 결과 / 파일 목록 -->
                <div>
                    <div class="flex items-center justify-between mb-1">
                        <label class="text-sm text-gray-500">스캔된 파일 목록 <span id="fileCount" class="text-blue-600 font-medium"></span></label>
                        <button onclick="clearFiles()" class="text-xs text-gray-400 hover:text-gray-600">목록 초기화</button>
                    </div>
                    <textarea id="filePaths" rows="5" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono"
                        placeholder="폴더 스캔 후 파일 경로가 자동으로 채워집니다 (직접 입력도 가능)"></textarea>
                </div>

                <div class="flex gap-2 mt-3">
                    <button onclick="submitBatch()" id="submitBtn" class="px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium">
                        전체 분석 요청
                    </button>
                    <span id="submitResult" class="text-sm self-center hidden"></span>
                </div>

                <!-- 헬퍼 서버 안내 -->
                <div id="helperNotice" class="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700 hidden">
                    <strong>폴더 스캔 서버 미연결</strong> — 별도 터미널에서 아래 명령을 실행하세요:<br>
                    <code class="bg-amber-100 px-1.5 py-0.5 rounded text-xs font-mono mt-1 inline-block">node tools/folder-scan-server.js</code>
                </div>
            </div>

            <!-- 결과 조회 영역 -->
            <div class="bg-white border border-gray-200 rounded-lg p-5 mb-6">
                <div class="flex items-center justify-between mb-3">
                    <h3 class="text-sm font-semibold text-gray-700">결과 조회</h3>
                    <div class="flex gap-2 items-center">
                        <label class="text-sm text-gray-500">ID 범위:</label>
                        <input id="fromId" type="number" class="w-20 border border-gray-300 rounded-lg px-2 py-1.5 text-sm" placeholder="시작">
                        <span class="text-gray-400">~</span>
                        <input id="toId" type="number" class="w-20 border border-gray-300 rounded-lg px-2 py-1.5 text-sm" placeholder="끝">
                        <button onclick="loadResults()" class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium">
                            검색
                        </button>
                        <button onclick="refreshResults()" class="px-3 py-2 border border-gray-300 text-gray-700 bg-white rounded-lg hover:bg-gray-50 text-sm" title="새로고침">
                            ↻
                        </button>
                    </div>
                </div>

                <!-- 필터 -->
                <div class="flex gap-2 mb-4">
                    <button onclick="filterResults('all')" class="filter-btn px-3 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700">전체</button>
                    <button onclick="filterResults('done')" class="filter-btn px-3 py-1 rounded-full text-xs font-medium bg-green-50 text-green-700">완료</button>
                    <button onclick="filterResults('pending')" class="filter-btn px-3 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-700">대기</button>
                    <button onclick="filterResults('error')" class="filter-btn px-3 py-1 rounded-full text-xs font-medium bg-red-50 text-red-700">에러</button>
                </div>

                <!-- 결과 그리드 -->
                <div id="resultsGrid" class="space-y-4">
                    <div class="text-center py-12 text-gray-400">
                        <div class="text-4xl mb-3">📋</div>
                        <div class="text-sm">배치 테스트를 등록하거나 ID 범위로 검색하세요</div>
                    </div>
                </div>
            </div>
        </div>
    `,
    pageScript,
  })
}
