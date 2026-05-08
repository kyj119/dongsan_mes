import type { Context } from 'hono'
import type { HonoEnv } from '../types/env'
import { renderPage } from '../layout'
import pageScript from '../scripts/iaAutoProcess.js?raw'

export function iaAutoProcessPage(c: Context<HonoEnv>) {
  return renderPage(c, {
    title: 'IA 자동 가공 테스트',
    activePage: '/ia-auto',
    pageContent: `
<div class="max-w-4xl mx-auto">

  <!-- 입력 폼 -->
  <div class="bg-white rounded-lg border p-5 mb-4">
    <h2 class="text-sm font-bold text-gray-700 mb-4">원본 파일 가공 테스트</h2>

    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
      <!-- 원본 파일 -->
      <div class="col-span-2">
        <label class="text-xs text-gray-500 block mb-1">원본 파일 경로 (Z: 드라이브)</label>
        <input id="inputSource" type="text" placeholder="Z:\\123\\07월\\01일\\05-헤드디자인\\자료\\파일.eps" class="w-full border rounded px-3 py-2 text-sm">
      </div>

      <!-- 품목 -->
      <div>
        <label class="text-xs text-gray-500 block mb-1">품목</label>
        <select id="inputProduct" class="w-full border rounded px-3 py-2 text-sm">
          <option value="">자동 판별</option>
          <option value="현수막">현수막</option>
          <option value="패트">패트</option>
          <option value="솔벤시트">솔벤시트</option>
          <option value="솔벤현수막">솔벤현수막</option>
          <option value="게시대">게시대</option>
          <option value="합성지">합성지</option>
          <option value="포맥스">포맥스</option>
          <option value="UV">UV</option>
          <option value="클리어필름">클리어필름</option>
          <option value="간판">간판</option>
          <option value="게릴라">게릴라</option>
        </select>
      </div>

      <!-- 후가공 -->
      <div>
        <label class="text-xs text-gray-500 block mb-1">후가공</label>
        <select id="inputFinishing" class="w-full border rounded px-3 py-2 text-sm">
          <option value="">없음</option>
          <option value="열재단">열재단</option>
          <option value="재단만">재단만</option>
          <option value="미싱">미싱</option>
          <option value="봉미싱">봉미싱</option>
          <option value="접어미싱">접어미싱</option>
          <option value="사방접어미싱">사방접어미싱</option>
          <option value="밴드미싱">밴드미싱</option>
          <option value="사방큰펀칭">사방큰펀칭</option>
          <option value="양옆접어미싱+사방큰펀칭">양옆접어미싱+사방큰펀칭</option>
          <option value="열재단+사방큰펀칭">열재단+사방큰펀칭</option>
        </select>
        <input id="inputFinishingCustom" type="text" placeholder="직접 입력..." class="w-full border rounded px-3 py-2 text-sm mt-1 hidden">
        <button onclick="toggleCustomFinishing()" class="text-[10px] text-blue-500 underline mt-1">직접 입력</button>
      </div>

      <!-- 규격 -->
      <div>
        <label class="text-xs text-gray-500 block mb-1">가로 (cm)</label>
        <input id="inputWidth" type="number" placeholder="550" class="w-full border rounded px-3 py-2 text-sm">
      </div>
      <div>
        <label class="text-xs text-gray-500 block mb-1">세로 (cm)</label>
        <input id="inputHeight" type="number" placeholder="80" class="w-full border rounded px-3 py-2 text-sm">
      </div>
    </div>

    <!-- 클리핑 좌표 (선택) -->
    <div class="bg-gray-50 rounded-lg p-3 mb-4">
      <div class="flex items-center gap-2 mb-2">
        <input type="checkbox" id="useClipBounds" class="rounded">
        <label for="useClipBounds" class="text-xs text-gray-600 font-medium">클리핑 좌표 지정 (mm, Illustrator 좌표계)</label>
      </div>
      <div id="clipFields" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 hidden">
        <div>
          <label class="text-[10px] text-gray-400">left</label>
          <input id="clipLeft" type="number" step="0.1" class="w-full border rounded px-2 py-1 text-xs">
        </div>
        <div>
          <label class="text-[10px] text-gray-400">top</label>
          <input id="clipTop" type="number" step="0.1" class="w-full border rounded px-2 py-1 text-xs">
        </div>
        <div>
          <label class="text-[10px] text-gray-400">right</label>
          <input id="clipRight" type="number" step="0.1" class="w-full border rounded px-2 py-1 text-xs">
        </div>
        <div>
          <label class="text-[10px] text-gray-400">bottom</label>
          <input id="clipBottom" type="number" step="0.1" class="w-full border rounded px-2 py-1 text-xs">
        </div>
      </div>
    </div>

    <!-- 실행 -->
    <div class="flex items-center gap-3">
      <button onclick="runPreview()" class="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
        <i class="fas fa-calculator mr-1"></i>규칙 미리보기
      </button>
      <button onclick="runProcess()" class="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700" id="btnProcess" disabled>
        <i class="fas fa-play mr-1"></i>가공 실행
      </button>
      <span id="statusMsg" class="text-xs text-gray-400"></span>
    </div>
  </div>

  <!-- 규칙 미리보기 -->
  <div id="previewSection" class="bg-white rounded-lg border p-5 mb-4 hidden">
    <h3 class="text-sm font-bold text-gray-700 mb-3">적용될 규칙</h3>
    <div class="grid grid-cols-2 gap-3 text-xs" id="rulePreview"></div>
  </div>

  <!-- 결과 -->
  <div id="resultSection" class="bg-white rounded-lg border p-5 hidden">
    <h2 class="text-sm font-bold text-gray-700 mb-3">결과</h2>
    <div id="resultContent"></div>
  </div>

</div>
`,
    pageScript,
  })
}