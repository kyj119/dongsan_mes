import type { Context } from 'hono'
import type { HonoEnv } from '../types/env'
import { renderPage } from '../layout'
import pageScript from '../scripts/purchaseCandidates.js?raw'

/**
 * 매입 후보 큐 — 통장에서 돈이 나갔는데 발주가 없는 것.
 * 판정 규칙 정본 = `utils/apCandidate` · 데이터 = `GET /api/purchase-candidates`
 */
export function purchaseCandidatesPage(c: Context<HonoEnv>) {
  return renderPage(c, {
    title: '매입 후보',
    activePage: '/purchase-candidates',
    pageContent: `
      <div class="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 class="text-xl font-bold text-gray-800">매입 후보</h1>
          <p class="text-sm text-gray-500 mt-1">
            통장에서 나갔는데 <b>발주가 없는 돈</b>입니다. 거래처별로 지급액과 발주액을 대조합니다.
          </p>
        </div>
        <div class="flex items-end gap-2">
          <div>
            <label for="pcqMonths" class="block text-xs text-gray-500 mb-1">기간</label>
            <select id="pcqMonths" class="border rounded px-3 py-2 text-sm">
              <option value="1">이번 달</option>
              <option value="2" selected>최근 2개월</option>
              <option value="3">최근 3개월</option>
              <option value="6">최근 6개월</option>
            </select>
          </div>
          <button type="button" onclick="pcqLoad()"
            class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded text-sm">
            <i class="fas fa-rotate mr-1"></i>조회
          </button>
        </div>
      </div>

      <div id="pcqSummary" class="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4"></div>

      <div id="pcqNotice" class="hidden mb-4 border-l-4 border-amber-400 bg-amber-50 px-4 py-3 text-sm text-gray-700"></div>

      <div class="bg-white rounded-lg shadow mb-5">
        <div class="px-4 py-3 border-b flex flex-wrap items-center justify-between gap-2">
          <h2 class="font-semibold text-gray-800">
            거래처별 대조 <span id="pcqSupNote" class="text-xs font-normal text-gray-500 ml-1"></span>
          </h2>
          <div id="pcqSupFilter" class="flex flex-wrap gap-1"></div>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead class="bg-gray-50 text-gray-500">
              <tr>
                <th class="px-4 py-2 text-left font-medium">거래처 · 통장 적요</th>
                <th class="px-4 py-2 text-left font-medium">법인</th>
                <th class="px-4 py-2 text-left font-medium">발주 담당</th>
                <th class="px-4 py-2 text-right font-medium">통장 지급</th>
                <th class="px-4 py-2 text-right font-medium">등록 발주</th>
                <th class="px-4 py-2 text-right font-medium">차액</th>
                <th class="px-4 py-2 text-left font-medium">최근</th>
                <th class="px-4 py-2 text-left font-medium">판정</th>
                <th class="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody id="pcqSupBody"></tbody>
          </table>
        </div>
      </div>

      <div class="bg-white rounded-lg shadow">
        <div class="px-4 py-3 border-b flex flex-wrap items-center justify-between gap-2">
          <h2 class="font-semibold text-gray-800">
            건별 명세 <span id="pcqRowNote" class="text-xs font-normal text-gray-500 ml-1"></span>
          </h2>
          <div id="pcqRowFilter" class="flex flex-wrap gap-1"></div>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead class="bg-gray-50 text-gray-500">
              <tr>
                <th class="px-4 py-2 text-left font-medium">일자</th>
                <th class="px-4 py-2 text-left font-medium">법인</th>
                <th class="px-4 py-2 text-right font-medium">금액</th>
                <th class="px-4 py-2 text-left font-medium">통장 적요 · 판정 근거</th>
                <th class="px-4 py-2 text-left font-medium">계정</th>
                <th class="px-4 py-2 text-left font-medium">판정</th>
              </tr>
            </thead>
            <tbody id="pcqRowBody"></tbody>
          </table>
        </div>
      </div>

      <p class="text-xs text-gray-500 mt-4 leading-relaxed">
        <b>판정</b> — <b>확실</b>: 적요에 「외상·물대·미지급」이 있거나 등록된 거래처 이름과 일치 ·
        <b>가능</b>: 잘린 이름·2글자 거래처 일치 또는 「대금·자재·원단」 같은 매입어 ·
        <b>확인필요</b>: 판정 못 함(미등록 거래처일 수 있음)<br>
        <b>제외</b> — 개인통장 · 자기계좌 이체 · 이미 매입지급으로 연결된 건 · 급여·세금 등으로 분류된 건<br>
        <b>차액</b> — 통장 지급 − 같은 기간 등록 발주. 발주를 등록하면 줄어듭니다.
        지급은 「6월 외상대」처럼 여러 발주를 묶어 나가므로 <b>건별이 아니라 거래처·기간 단위로</b> 봅니다.
      </p>
    `,
    pageScript,
  })
}
