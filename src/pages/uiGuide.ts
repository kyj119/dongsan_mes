import type { Context } from 'hono'
import type { HonoEnv } from '../types/env'
import { renderPage } from '../layout'
import pageScript from '../scripts/uiGuide.js?raw'

export function uiGuidePage(c: Context<HonoEnv>) {
  return renderPage(c, {
    title: 'UI 컴포넌트 가이드',
    activePage: '/settings',
    pageCSS: `
      .guide-page { background: #F8F9FA; margin: -24px; padding: 24px; min-height: 100%; }
      .guide-page * { color: inherit; }
      .guide-page p, .guide-page td, .guide-page th, .guide-page span, .guide-page label, .guide-page div { color: #212529; }
      .guide-section { background: #fff; border-radius: 8px; border: 1px solid #e5e7eb; overflow: hidden; }
      .guide-section-header { display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; background: #f9fafb; border-bottom: 1px solid #e5e7eb; cursor: pointer; }
      .guide-section-header:hover { background: #f3f4f6; }
      .guide-section-body { padding: 16px; }
      .token-swatch { width: 100%; height: 48px; border-radius: 6px; display: flex; align-items: center; justify-content: center; font-size: 10px; font-family: monospace; margin-bottom: 6px; }
      .group-hover-actions .action-cell { opacity: 0; transition: opacity 0.15s; }
      .group-hover-actions tr:hover .action-cell { opacity: 1; }
      .tabnum { font-variant-numeric: tabular-nums; }
    `,
    pageContent: `
<div class="guide-page space-y-5">
  <!-- 헤더 -->
  <div class="flex items-center justify-between">
    <div>
      <h2 class="text-lg font-bold" style="color:#212529;"><i class="fas fa-palette mr-2 text-blue-600"></i>UI 컴포넌트 가이드</h2>
      <p class="text-xs mt-1" style="color:#6b7280;">동산현수막 ERP+MES 디자인 시스템 — 개선안 적용</p>
    </div>
    <div class="flex gap-2">
      <button onclick="toggleSection('all')" class="px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700">전체 보기</button>
      <button onclick="toggleSection('collapse')" class="px-3 py-1.5 text-xs border border-gray-300 bg-white rounded hover:bg-gray-50" style="color:#374151;">전체 접기</button>
    </div>
  </div>

  <!-- ===== 1. 색상 시스템 ===== -->
  <div class="guide-section" id="sec-colors">
    <div class="guide-section-header" onclick="togglePanel('colors')">
      <span class="text-sm font-semibold" style="color:#374151;"><i class="fas fa-swatchbook mr-2 text-blue-500"></i>1. 색상 시스템</span>
      <i class="fas fa-chevron-down text-xs" style="color:#9ca3af;" id="ico-colors"></i>
    </div>
    <div class="guide-section-body" id="pan-colors">
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <!-- 배경 + 텍스트 -->
        <div class="text-center">
          <div class="token-swatch" style="background:#F8F9FA; border:1px solid #e5e7eb; color:#6b7280;">#F8F9FA</div>
          <div class="text-xs font-medium" style="color:#374151;">배경 (오프화이트)</div>
          <div class="text-[10px]" style="color:#9ca3af;">순백 대신 — 눈부심↓</div>
        </div>
        <div class="text-center">
          <div class="token-swatch" style="background:#212529; color:#fff;">#212529</div>
          <div class="text-xs font-medium" style="color:#374151;">텍스트 (소프트 블랙)</div>
          <div class="text-[10px]" style="color:#9ca3af;">대비율 16:1 유지, 피로↓</div>
        </div>
        <div class="text-center">
          <div class="token-swatch" style="background:#ffffff; border:1px solid #e5e7eb; color:#6b7280;">#FFFFFF</div>
          <div class="text-xs font-medium" style="color:#374151;">카드/패널 배경</div>
          <div class="text-[10px]" style="color:#9ca3af;">오프화이트 위에 떠오름</div>
        </div>
        <div class="text-center">
          <div class="token-swatch" style="background:#6B7280; color:#fff;">#6B7280</div>
          <div class="text-xs font-medium" style="color:#374151;">보조 텍스트</div>
          <div class="text-[10px]" style="color:#9ca3af;">gray-500, 라벨/설명</div>
        </div>
      </div>
      <div class="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
        <div class="text-center">
          <div class="token-swatch" style="background:#2563eb; color:#fff;">#2563EB</div>
          <div class="text-xs font-medium" style="color:#374151;">Primary</div>
          <div class="text-[10px]" style="color:#9ca3af;">CTA, 링크, 활성</div>
        </div>
        <div class="text-center">
          <div class="token-swatch" style="background:#16a34a; color:#fff;">#16A34A</div>
          <div class="text-xs font-medium" style="color:#374151;">Success</div>
          <div class="text-[10px]" style="color:#9ca3af;">완료, 정상</div>
        </div>
        <div class="text-center">
          <div class="token-swatch" style="background:#d97706; color:#fff;">#D97706</div>
          <div class="text-xs font-medium" style="color:#374151;">Warning</div>
          <div class="text-[10px]" style="color:#9ca3af;">주의, 대기</div>
        </div>
        <div class="text-center">
          <div class="token-swatch" style="background:#dc2626; color:#fff;">#DC2626</div>
          <div class="text-xs font-medium" style="color:#374151;">Danger</div>
          <div class="text-[10px]" style="color:#9ca3af;">에러, 삭제, 지연</div>
        </div>
        <div class="text-center">
          <div class="token-swatch" style="background:#9ca3af; color:#fff;">#9CA3AF</div>
          <div class="text-xs font-medium" style="color:#374151;">Neutral</div>
          <div class="text-[10px]" style="color:#9ca3af;">비활성, 기본</div>
        </div>
      </div>
      <div class="p-3 rounded text-xs" style="background:#eff6ff; color:#1e40af;">
        <i class="fas fa-info-circle mr-1"></i>
        <strong>규칙:</strong> 보라·핑크·틸은 차트 전용. 카드 숫자는 기본 <code style="color:#1e40af;">#212529</code>, 위험/이상치만 시맨틱 컬러.
      </div>
    </div>
  </div>

  <!-- ===== 2. 버튼 ===== -->
  <div class="guide-section" id="sec-buttons">
    <div class="guide-section-header" onclick="togglePanel('buttons')">
      <span class="text-sm font-semibold" style="color:#374151;"><i class="fas fa-hand-pointer mr-2 text-blue-500"></i>2. 버튼 (4종류만)</span>
      <i class="fas fa-chevron-down text-xs" style="color:#9ca3af;" id="ico-buttons"></i>
    </div>
    <div class="guide-section-body" id="pan-buttons">
      <div class="space-y-4">
        <div class="flex items-center gap-4 flex-wrap">
          <span class="w-20 text-xs font-medium" style="color:#6b7280;">Primary</span>
          <button class="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"><i class="fas fa-plus mr-1"></i>새 주문</button>
          <button class="px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"><i class="fas fa-search mr-1"></i>조회</button>
          <code class="text-[10px]" style="color:#9ca3af;">bg-blue-600 text-white</code>
        </div>
        <div class="flex items-center gap-4 flex-wrap">
          <span class="w-20 text-xs font-medium" style="color:#6b7280;">Danger</span>
          <button class="px-4 py-2 text-sm bg-red-600 text-white rounded hover:bg-red-700"><i class="fas fa-trash mr-1"></i>삭제</button>
          <button class="px-3 py-1.5 text-xs bg-red-600 text-white rounded hover:bg-red-700"><i class="fas fa-bell mr-1"></i>연체 알림</button>
          <code class="text-[10px]" style="color:#9ca3af;">bg-red-600 text-white</code>
        </div>
        <div class="flex items-center gap-4 flex-wrap">
          <span class="w-20 text-xs font-medium" style="color:#6b7280;">Secondary</span>
          <button class="px-4 py-2 text-sm border border-gray-300 bg-white rounded hover:bg-gray-50" style="color:#374151;"><i class="fas fa-file-csv mr-1"></i>CSV 내보내기</button>
          <button class="px-3 py-1.5 text-xs border border-gray-300 bg-white rounded hover:bg-gray-50" style="color:#374151;"><i class="fas fa-upload mr-1"></i>불러오기</button>
          <code class="text-[10px]" style="color:#9ca3af;">border bg-white</code>
        </div>
        <div class="flex items-center gap-4 flex-wrap">
          <span class="w-20 text-xs font-medium" style="color:#6b7280;">Ghost</span>
          <button class="px-3 py-1.5 text-xs hover:underline" style="color:#6b7280;">초기화</button>
          <button class="text-sm" style="color:#9ca3af;">&times;</button>
          <code class="text-[10px]" style="color:#9ca3af;">배경 없음</code>
        </div>
      </div>
    </div>
  </div>

  <!-- ===== 3. 요약 카드 ===== -->
  <div class="guide-section" id="sec-cards">
    <div class="guide-section-header" onclick="togglePanel('cards')">
      <span class="text-sm font-semibold" style="color:#374151;"><i class="fas fa-th-large mr-2 text-blue-500"></i>3. 요약 카드 — 위험/이상치만 색상</span>
      <i class="fas fa-chevron-down text-xs" style="color:#9ca3af;" id="ico-cards"></i>
    </div>
    <div class="guide-section-body" style="background:#F8F9FA;">
      <div class="grid grid-cols-3 md:grid-cols-6 gap-2 mb-4" id="pan-cards">
        <div class="bg-white rounded-lg border p-2.5 text-center shadow-sm">
          <div class="text-xl font-bold tabnum" style="color:#212529;">42</div>
          <div class="text-[10px]" style="color:#9ca3af;">전체</div>
        </div>
        <div class="bg-white rounded-lg border p-2.5 text-center shadow-sm">
          <div class="text-xl font-bold tabnum" style="color:#212529;">28</div>
          <div class="text-[10px]" style="color:#9ca3af;">완료</div>
        </div>
        <div class="bg-white rounded-lg border p-2.5 text-center shadow-sm">
          <div class="text-xl font-bold tabnum" style="color:#212529;">8</div>
          <div class="text-[10px]" style="color:#9ca3af;">진행중</div>
        </div>
        <div class="bg-white rounded-lg border p-2.5 text-center shadow-sm">
          <div class="text-xl font-bold tabnum" style="color:#212529;">4</div>
          <div class="text-[10px]" style="color:#9ca3af;">대기</div>
        </div>
        <div class="bg-white rounded-lg border border-red-200 p-2.5 text-center shadow-sm">
          <div class="text-xl font-bold tabnum" style="color:#dc2626;">2</div>
          <div class="text-[10px] font-medium" style="color:#dc2626;">지연</div>
        </div>
        <div class="bg-white rounded-lg border p-2.5 text-center shadow-sm">
          <div class="text-xl font-bold tabnum" style="color:#212529;">15M</div>
          <div class="text-[10px]" style="color:#9ca3af;">매출</div>
        </div>
      </div>
      <div class="p-3 rounded text-xs" style="background:#f0fdf4; color:#166534;">
        <i class="fas fa-check-circle mr-1"></i>
        "지연 2건"만 빨간색 → 즉시 시선 집중. 나머지는 중성색으로 시각적 부담 최소화.
      </div>
    </div>
  </div>

  <!-- ===== 4. 뱃지 ===== -->
  <div class="guide-section" id="sec-badges">
    <div class="guide-section-header" onclick="togglePanel('badges')">
      <span class="text-sm font-semibold" style="color:#374151;"><i class="fas fa-tags mr-2 text-blue-500"></i>4. 뱃지 — 색상 + 아이콘 + 텍스트 (bg-*-50)</span>
      <i class="fas fa-chevron-down text-xs" style="color:#9ca3af;" id="ico-badges"></i>
    </div>
    <div class="guide-section-body" id="pan-badges">
      <div class="flex flex-wrap gap-3 mb-4">
        <div class="text-center">
          <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700"><i class="fas fa-check-circle text-[8px] mr-1"></i>완료</span>
          <div class="text-[10px] mt-1" style="color:#9ca3af;">success</div>
        </div>
        <div class="text-center">
          <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700"><i class="fas fa-circle text-[5px] mr-1"></i>가동</span>
          <div class="text-[10px] mt-1" style="color:#9ca3af;">success (장비)</div>
        </div>
        <div class="text-center">
          <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700"><i class="fas fa-check text-[8px] mr-1"></i>확정</span>
          <div class="text-[10px] mt-1" style="color:#9ca3af;">info</div>
        </div>
        <div class="text-center">
          <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700"><i class="fas fa-spinner text-[8px] mr-1"></i>인쇄중</span>
          <div class="text-[10px] mt-1" style="color:#9ca3af;">info (진행)</div>
        </div>
        <div class="text-center">
          <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700"><i class="fas fa-pause text-[8px] mr-1"></i>대기</span>
          <div class="text-[10px] mt-1" style="color:#9ca3af;">warning</div>
        </div>
        <div class="text-center">
          <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-700"><i class="fas fa-exclamation-triangle text-[8px] mr-1"></i>지연</span>
          <div class="text-[10px] mt-1" style="color:#9ca3af;">danger</div>
        </div>
        <div class="text-center">
          <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-700"><i class="fas fa-power-off text-[8px] mr-1"></i>OFF</span>
          <div class="text-[10px] mt-1" style="color:#9ca3af;">danger (장비)</div>
        </div>
        <div class="text-center">
          <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium" style="background:#f3f4f6; color:#4b5563;"><i class="far fa-clock text-[8px] mr-1"></i>미접수</span>
          <div class="text-[10px] mt-1" style="color:#9ca3af;">neutral</div>
        </div>
      </div>
      <div class="p-3 rounded text-xs" style="background:#eff6ff; color:#1e40af;">
        <i class="fas fa-universal-access mr-1"></i>
        <strong>접근성:</strong> 색상 + 아이콘 + 텍스트 3요소로 색맹 사용자도 구분 가능 (WCAG 1.4.1). 배경은 <code style="color:#1e40af;">bg-*-50</code> 은은하게.
      </div>
    </div>
  </div>

  <!-- ===== 5. 필터 영역 ===== -->
  <div class="guide-section" id="sec-filters">
    <div class="guide-section-header" onclick="togglePanel('filters')">
      <span class="text-sm font-semibold" style="color:#374151;"><i class="fas fa-filter mr-2 text-blue-500"></i>5. 필터 영역</span>
      <i class="fas fa-chevron-down text-xs" style="color:#9ca3af;" id="ico-filters"></i>
    </div>
    <div class="guide-section-body" id="pan-filters" style="background:#F8F9FA;">
      <div class="bg-white rounded-lg border p-3 shadow-sm mb-3">
        <div class="flex flex-wrap items-end gap-2">
          <div class="flex-1 min-w-[200px]">
            <label class="text-[10px] block mb-0.5" style="color:#9ca3af;">검색</label>
            <input type="text" placeholder="거래처, 주문번호..." class="w-full border rounded px-2 py-1 text-xs" style="color:#212529;">
          </div>
          <div>
            <label class="text-[10px] block mb-0.5" style="color:#9ca3af;">상태</label>
            <select class="border rounded px-2 py-1 text-xs" style="color:#212529;">
              <option>전체</option><option>진행중</option><option>완료</option>
            </select>
          </div>
          <div>
            <label class="text-[10px] block mb-0.5" style="color:#9ca3af;">기간</label>
            <input type="date" class="border rounded px-2 py-1 text-xs" style="color:#212529;">
          </div>
          <div class="ml-auto flex items-end gap-2">
            <button class="text-xs hover:underline" style="color:#6b7280;">초기화</button>
            <button class="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"><i class="fas fa-search mr-1"></i>조회</button>
          </div>
        </div>
      </div>
      <div class="p-3 rounded text-xs" style="background:#eff6ff; color:#1e40af;">
        <i class="fas fa-info-circle mr-1"></i>
        레이아웃: [검색(flex-1)] [필터] | [초기화(Ghost)] [검색(Primary)]. 검색 버튼 텍스트는 항상 "검색".
      </div>
    </div>
  </div>

  <!-- ===== 6. 테이블 ===== -->
  <div class="guide-section" id="sec-tables">
    <div class="guide-section-header" onclick="togglePanel('tables')">
      <span class="text-sm font-semibold" style="color:#374151;"><i class="fas fa-table mr-2 text-blue-500"></i>6. 테이블 — 호버 액션 + tabular-nums</span>
      <i class="fas fa-chevron-down text-xs" style="color:#9ca3af;" id="ico-tables"></i>
    </div>
    <div class="guide-section-body" id="pan-tables" style="background:#F8F9FA;">
      <!-- 데이터 있는 테이블 -->
      <div class="text-xs font-medium mb-2" style="color:#6b7280;">데이터 있는 상태 (마우스를 행 위에 올려보세요)</div>
      <div class="bg-white rounded-lg border overflow-hidden shadow-sm mb-4 group-hover-actions">
        <table class="w-full text-xs ds-table-striped">
          <thead style="background:#f9fafb;"><tr>
            <th class="px-3 py-2 text-left font-semibold" style="color:#6b7280;">#</th>
            <th class="px-3 py-2 text-left font-semibold" style="color:#6b7280;">거래처</th>
            <th class="px-3 py-2 text-left font-semibold" style="color:#6b7280;">품목</th>
            <th class="px-3 py-2 text-right font-semibold" style="color:#6b7280;">금액</th>
            <th class="px-3 py-2 text-center font-semibold" style="color:#6b7280;">상태</th>
            <th class="px-3 py-2 text-center font-semibold w-16" style="color:#6b7280;">관리</th>
          </tr></thead>
          <tbody>
            <tr class="hover:bg-blue-50/30 border-b border-gray-100">
              <td class="px-3 py-2" style="color:#9ca3af;">1</td>
              <td class="px-3 py-2 font-medium" style="color:#212529;">아이디파일</td>
              <td class="px-3 py-2" style="color:#212529;">현수막 600×120cm</td>
              <td class="px-3 py-2 text-right tabnum" style="color:#212529;">45,000</td>
              <td class="px-3 py-2 text-center"><span class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-green-50 text-green-700"><i class="fas fa-check-circle text-[7px] mr-0.5"></i>완료</span></td>
              <td class="px-3 py-2 text-center action-cell"><button class="text-blue-500 hover:text-blue-700 mr-1.5"><i class="fas fa-edit"></i></button><button class="text-red-400 hover:text-red-600"><i class="fas fa-trash"></i></button></td>
            </tr>
            <tr class="hover:bg-blue-50/30 border-b border-gray-100">
              <td class="px-3 py-2" style="color:#9ca3af;">2</td>
              <td class="px-3 py-2 font-medium" style="color:#212529;">글로벌사인</td>
              <td class="px-3 py-2" style="color:#212529;">솔벤시트 300×200cm</td>
              <td class="px-3 py-2 text-right tabnum" style="color:#212529;">120,000</td>
              <td class="px-3 py-2 text-center"><span class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-blue-50 text-blue-700"><i class="fas fa-spinner text-[7px] mr-0.5"></i>진행</span></td>
              <td class="px-3 py-2 text-center action-cell"><button class="text-blue-500 hover:text-blue-700 mr-1.5"><i class="fas fa-edit"></i></button><button class="text-red-400 hover:text-red-600"><i class="fas fa-trash"></i></button></td>
            </tr>
            <tr class="hover:bg-blue-50/30 border-b border-gray-100">
              <td class="px-3 py-2" style="color:#9ca3af;">3</td>
              <td class="px-3 py-2 font-medium" style="color:#212529;">대한광고</td>
              <td class="px-3 py-2" style="color:#212529;">깃발 100×150cm</td>
              <td class="px-3 py-2 text-right tabnum" style="color:#212529;">35,000</td>
              <td class="px-3 py-2 text-center"><span class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-red-50 text-red-700"><i class="fas fa-exclamation-triangle text-[7px] mr-0.5"></i>지연</span></td>
              <td class="px-3 py-2 text-center action-cell"><button class="text-blue-500 hover:text-blue-700 mr-1.5"><i class="fas fa-edit"></i></button><button class="text-red-400 hover:text-red-600"><i class="fas fa-trash"></i></button></td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- 빈 상태 -->
      <div class="text-xs font-medium mb-2" style="color:#6b7280;">빈 상태 (Empty State)</div>
      <div class="bg-white rounded-lg border overflow-hidden shadow-sm">
        <table class="w-full text-xs ds-table-striped">
          <thead style="background:#f9fafb;"><tr>
            <th class="px-3 py-2 text-left font-semibold" style="color:#6b7280;">거래처</th>
            <th class="px-3 py-2 text-left font-semibold" style="color:#6b7280;">품목</th>
            <th class="px-3 py-2 text-center font-semibold" style="color:#6b7280;">상태</th>
          </tr></thead>
          <tbody>
            <tr><td colspan="3" class="text-center py-12">
              <i class="fas fa-inbox text-3xl mb-3 block" style="color:#d1d5db;"></i>
              <div class="text-sm mb-1" style="color:#6b7280;">주문이 없습니다</div>
              <div class="text-xs mb-3" style="color:#9ca3af;">새 주문을 등록해 보세요</div>
              <button class="px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"><i class="fas fa-plus mr-1"></i>새 주문</button>
            </td></tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>

  <!-- ===== 7. 폼 ===== -->
  <div class="guide-section" id="sec-forms">
    <div class="guide-section-header" onclick="togglePanel('forms')">
      <span class="text-sm font-semibold" style="color:#374151;"><i class="fas fa-edit mr-2 text-blue-500"></i>7. 폼 디자인</span>
      <i class="fas fa-chevron-down text-xs" style="color:#9ca3af;" id="ico-forms"></i>
    </div>
    <div class="guide-section-body" id="pan-forms">
      <div class="max-w-lg space-y-3">
        <div>
          <label class="text-sm font-medium mb-1 block" style="color:#374151;">거래처명 <span style="color:#dc2626;">*</span></label>
          <input type="text" value="아이디파일" class="w-full border rounded px-3 py-2 text-sm" style="color:#212529;">
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="text-sm font-medium mb-1 block" style="color:#374151;">유형</label>
            <select class="w-full border rounded px-3 py-2 text-sm" style="color:#212529;">
              <option>매출</option><option>매입</option>
            </select>
          </div>
          <div>
            <label class="text-sm font-medium mb-1 block" style="color:#374151;">연락처</label>
            <input type="tel" placeholder="010-0000-0000" class="w-full border rounded px-3 py-2 text-sm" style="color:#212529;">
          </div>
        </div>
        <div>
          <label class="text-sm font-medium mb-1 block" style="color:#374151;">파일 첨부</label>
          <div class="border-2 border-dashed border-gray-300 rounded-lg px-4 py-6 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50/30">
            <i class="fas fa-cloud-upload-alt text-xl mb-2 block" style="color:#9ca3af;"></i>
            <span class="text-sm" style="color:#6b7280;">파일을 끌어 놓거나 클릭하세요</span>
          </div>
        </div>
        <div class="flex justify-end gap-2 pt-2">
          <button class="px-4 py-2 text-sm border border-gray-300 bg-white rounded hover:bg-gray-50" style="color:#374151;">취소</button>
          <button class="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"><i class="fas fa-save mr-1"></i>저장</button>
        </div>
      </div>
    </div>
  </div>

  <!-- ===== 8. 아이콘 ===== -->
  <div class="guide-section" id="sec-icons">
    <div class="guide-section-header" onclick="togglePanel('icons')">
      <span class="text-sm font-semibold" style="color:#374151;"><i class="fas fa-icons mr-2 text-blue-500"></i>8. 아이콘 (Font Awesome)</span>
      <i class="fas fa-chevron-down text-xs" style="color:#9ca3af;" id="ico-icons"></i>
    </div>
    <div class="guide-section-body" id="pan-icons">
      <div class="grid grid-cols-4 md:grid-cols-8 gap-3 mb-4">
        <div class="text-center p-2 border rounded hover:bg-gray-50"><i class="fas fa-plus text-lg mb-1 block" style="color:#374151;"></i><div class="text-[10px]" style="color:#9ca3af;">fa-plus</div></div>
        <div class="text-center p-2 border rounded hover:bg-gray-50"><i class="fas fa-search text-lg mb-1 block" style="color:#374151;"></i><div class="text-[10px]" style="color:#9ca3af;">fa-search</div></div>
        <div class="text-center p-2 border rounded hover:bg-gray-50"><i class="fas fa-edit text-lg mb-1 block" style="color:#374151;"></i><div class="text-[10px]" style="color:#9ca3af;">fa-edit</div></div>
        <div class="text-center p-2 border rounded hover:bg-gray-50"><i class="fas fa-trash text-lg mb-1 block" style="color:#374151;"></i><div class="text-[10px]" style="color:#9ca3af;">fa-trash</div></div>
        <div class="text-center p-2 border rounded hover:bg-gray-50"><i class="fas fa-check-circle text-lg mb-1 block" style="color:#374151;"></i><div class="text-[10px]" style="color:#9ca3af;">fa-check-circle</div></div>
        <div class="text-center p-2 border rounded hover:bg-gray-50"><i class="fas fa-exclamation-triangle text-lg mb-1 block" style="color:#374151;"></i><div class="text-[10px]" style="color:#9ca3af;">fa-exclamation-triangle</div></div>
        <div class="text-center p-2 border rounded hover:bg-gray-50"><i class="fas fa-spinner text-lg mb-1 block" style="color:#374151;"></i><div class="text-[10px]" style="color:#9ca3af;">fa-spinner</div></div>
        <div class="text-center p-2 border rounded hover:bg-gray-50"><i class="fas fa-power-off text-lg mb-1 block" style="color:#374151;"></i><div class="text-[10px]" style="color:#9ca3af;">fa-power-off</div></div>
      </div>
      <div class="p-3 rounded text-xs" style="background:#fef2f2; color:#991b1b;">
        <i class="fas fa-ban mr-1"></i>
        <strong>금지:</strong> 이모지(📊⚙️🏢)를 UI에 사용하지 않습니다. Font Awesome <code style="color:#991b1b;">fas</code>/<code style="color:#991b1b;">far</code> 클래스만 사용.
      </div>
    </div>
  </div>

  <!-- ===== 9. 간격 ===== -->
  <div class="guide-section" id="sec-spacing">
    <div class="guide-section-header" onclick="togglePanel('spacing')">
      <span class="text-sm font-semibold" style="color:#374151;"><i class="fas fa-ruler-combined mr-2 text-blue-500"></i>9. 간격 & 레이아웃</span>
      <i class="fas fa-chevron-down text-xs" style="color:#9ca3af;" id="ico-spacing"></i>
    </div>
    <div class="guide-section-body" id="pan-spacing">
      <table class="w-full text-xs mb-4 ds-table-striped">
        <thead style="background:#f9fafb;"><tr>
          <th class="px-3 py-2 text-left font-semibold" style="color:#6b7280;">요소</th>
          <th class="px-3 py-2 text-left font-semibold" style="color:#6b7280;">클래스</th>
          <th class="px-3 py-2 text-right font-semibold" style="color:#6b7280;">크기</th>
        </tr></thead>
        <tbody>
          <tr class="border-b border-gray-100"><td class="px-3 py-2" style="color:#212529;">페이지 배경</td><td class="px-3 py-2 font-mono text-blue-600">#F8F9FA</td><td class="px-3 py-2 text-right" style="color:#212529;">오프화이트</td></tr>
          <tr class="border-b border-gray-100"><td class="px-3 py-2" style="color:#212529;">섹션 간 간격</td><td class="px-3 py-2 font-mono text-blue-600">space-y-4 ~ space-y-5</td><td class="px-3 py-2 text-right" style="color:#212529;">16~20px</td></tr>
          <tr class="border-b border-gray-100"><td class="px-3 py-2" style="color:#212529;">카드 그리드 갭</td><td class="px-3 py-2 font-mono text-blue-600">gap-2</td><td class="px-3 py-2 text-right" style="color:#212529;">8px</td></tr>
          <tr class="border-b border-gray-100"><td class="px-3 py-2" style="color:#212529;">카드 내부 패딩</td><td class="px-3 py-2 font-mono text-blue-600">p-2.5 ~ p-4</td><td class="px-3 py-2 text-right" style="color:#212529;">10~16px</td></tr>
          <tr class="border-b border-gray-100"><td class="px-3 py-2" style="color:#212529;">카드 그림자</td><td class="px-3 py-2 font-mono text-blue-600">shadow-sm</td><td class="px-3 py-2 text-right" style="color:#212529;">미세한 입체감</td></tr>
          <tr><td class="px-3 py-2" style="color:#212529;">숫자 폰트</td><td class="px-3 py-2 font-mono text-blue-600">tabular-nums</td><td class="px-3 py-2 text-right" style="color:#212529;">열 정렬 보장</td></tr>
        </tbody>
      </table>
    </div>
  </div>

  <!-- 개선사항 요약 -->
  <div class="p-4 rounded-lg border-2 border-blue-200" style="background:#eff6ff;">
    <div class="text-sm font-semibold mb-2" style="color:#1e40af;"><i class="fas fa-clipboard-check mr-2"></i>적용된 개선사항 요약</div>
    <div class="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs" style="color:#1e40af;">
      <div><i class="fas fa-check mr-1 text-green-600"></i> 배경 #FFFFFF → #F8F9FA (눈부심↓)</div>
      <div><i class="fas fa-check mr-1 text-green-600"></i> 텍스트 #111827 → #212529 (대비 완화)</div>
      <div><i class="fas fa-check mr-1 text-green-600"></i> 카드 숫자 위험/이상치만 색상</div>
      <div><i class="fas fa-check mr-1 text-green-600"></i> 뱃지 색상+아이콘+텍스트 3요소</div>
      <div><i class="fas fa-check mr-1 text-green-600"></i> 테이블 액션 호버 시 노출</div>
      <div><i class="fas fa-check mr-1 text-green-600"></i> 뱃지 bg-*-100 → bg-*-50</div>
      <div><i class="fas fa-check mr-1 text-green-600"></i> 숫자 tabular-nums 정렬</div>
    </div>
  </div>
</div>
`,
    pageScript,
  })
}
