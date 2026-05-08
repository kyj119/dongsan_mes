import type { Context } from 'hono'
import type { HonoEnv } from '../types/env'
import { renderPage } from '../layout'
import pageScript from '../scripts/uiCompare.js?raw'

export function uiComparePage(c: Context<HonoEnv>) {
  return renderPage(c, {
    title: 'UI 개선안 비교',
    activePage: '/settings',
    pageCSS: `
      .compare-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
      .panel-before { border: 2px solid #e5e7eb; border-radius: 8px; overflow: hidden; }
      .panel-after { border: 2px solid #3b82f6; border-radius: 8px; overflow: hidden; }
      .panel-label { padding: 6px 12px; font-size: 11px; font-weight: 600; text-align: center; }
      .panel-before .panel-label { background: #f3f4f6; color: #6b7280; }
      .panel-after .panel-label { background: #eff6ff; color: #2563eb; }
      .panel-body { padding: 16px; }
      .panel-after .panel-body { background: #F8F9FA; }
    `,
    pageContent: `
<div class="space-y-6">
  <div class="flex items-center justify-between">
    <div>
      <h2 class="text-lg font-bold text-gray-900"><i class="fas fa-columns mr-2 text-blue-600"></i>UI 개선안 전후 비교</h2>
      <p class="text-xs text-gray-500 mt-1">각 항목의 현재 → 개선안을 나란히 비교합니다. 원하는 개선만 선택 적용 가능.</p>
    </div>
  </div>

  <!-- ===== 개선 1: 배경색 ===== -->
  <div class="bg-white rounded-lg border overflow-hidden">
    <div class="flex items-center justify-between px-4 py-3 bg-gray-50 border-b">
      <span class="text-sm font-semibold text-gray-700"><i class="fas fa-fill-drip mr-2 text-blue-500"></i>개선 1: 배경색 — 순백 → 오프화이트</span>
      <span class="px-2 py-0.5 rounded text-[10px] font-medium bg-green-50 text-green-700">눈 피로도 감소</span>
    </div>
    <div class="p-4">
      <div class="text-xs text-gray-500 mb-3">
        <strong>변경:</strong> 페이지 본문 배경을 <code>#FFFFFF</code> → <code>#F8F9FA</code>로 변경. 밝은 조명 아래 장시간 사용 시 눈부심 완화.
        <span class="text-gray-400 ml-2">(SAP Fiori, NN/g 권장)</span>
      </div>
      <div class="compare-grid">
        <div class="panel-before">
          <div class="panel-label">현재 (순백 #FFFFFF)</div>
          <div class="panel-body" style="background:#FFFFFF;">
            <div class="grid grid-cols-3 gap-2 mb-3">
              <div class="bg-white rounded-lg border p-2.5 text-center">
                <div class="text-xl font-bold text-gray-700">42</div>
                <div class="text-[10px] text-gray-400">전체</div>
              </div>
              <div class="bg-white rounded-lg border p-2.5 text-center">
                <div class="text-xl font-bold text-green-600">28</div>
                <div class="text-[10px] text-gray-400">완료</div>
              </div>
              <div class="bg-white rounded-lg border p-2.5 text-center">
                <div class="text-xl font-bold text-red-600">3</div>
                <div class="text-[10px] text-gray-400">지연</div>
              </div>
            </div>
            <div class="bg-white rounded border p-3 text-xs text-gray-500">테이블이나 카드가 배경과 구분이 안 됨</div>
          </div>
        </div>
        <div class="panel-after">
          <div class="panel-label">개선안 (오프화이트 #F8F9FA)</div>
          <div class="panel-body" style="background:#F8F9FA;">
            <div class="grid grid-cols-3 gap-2 mb-3">
              <div class="bg-white rounded-lg border p-2.5 text-center shadow-sm">
                <div class="text-xl font-bold text-gray-700">42</div>
                <div class="text-[10px] text-gray-400">전체</div>
              </div>
              <div class="bg-white rounded-lg border p-2.5 text-center shadow-sm">
                <div class="text-xl font-bold text-green-600">28</div>
                <div class="text-[10px] text-gray-400">완료</div>
              </div>
              <div class="bg-white rounded-lg border p-2.5 text-center shadow-sm">
                <div class="text-xl font-bold text-red-600">3</div>
                <div class="text-[10px] text-gray-400">지연</div>
              </div>
            </div>
            <div class="bg-white rounded border p-3 text-xs text-gray-500 shadow-sm">카드가 배경에서 자연스럽게 떠오름</div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- ===== 개선 2: 텍스트 색상 ===== -->
  <div class="bg-white rounded-lg border overflow-hidden">
    <div class="flex items-center justify-between px-4 py-3 bg-gray-50 border-b">
      <span class="text-sm font-semibold text-gray-700"><i class="fas fa-font mr-2 text-blue-500"></i>개선 2: 텍스트 색상 — 극단적 블랙 → 소프트 블랙</span>
      <span class="px-2 py-0.5 rounded text-[10px] font-medium bg-green-50 text-green-700">대비 완화</span>
    </div>
    <div class="p-4">
      <div class="text-xs text-gray-500 mb-3">
        <strong>변경:</strong> 본문 텍스트를 <code>#111827</code>(gray-900) → <code>#212529</code>로. WCAG AAA(7:1) 충족하면서 눈 피로 감소.
      </div>
      <div class="compare-grid">
        <div class="panel-before">
          <div class="panel-label">현재 (#111827, gray-900)</div>
          <div class="panel-body">
            <p style="color:#111827; font-size:14px; line-height:1.6;">
              <strong>아이디파일</strong> — 현수막 600×120cm 1장<br>
              사방미싱 + 상단펀칭<br>
              납기: 2026-03-22 <span style="color:#dc2626;">긴급</span>
            </p>
            <p style="color:#111827; font-size:12px; margin-top:8px;">
              순수 검정에 가까운 텍스트 — 흰 배경과의 극단적 대비
            </p>
          </div>
        </div>
        <div class="panel-after">
          <div class="panel-label">개선안 (#212529, 소프트 블랙)</div>
          <div class="panel-body">
            <p style="color:#212529; font-size:14px; line-height:1.6;">
              <strong>아이디파일</strong> — 현수막 600×120cm 1장<br>
              사방미싱 + 상단펀칭<br>
              납기: 2026-03-22 <span style="color:#dc2626;">긴급</span>
            </p>
            <p style="color:#212529; font-size:12px; margin-top:8px;">
              약간 부드러운 검정 — 대비율 16:1 (AAA 초과) 유지, 피로감↓
            </p>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- ===== 개선 3: 카드 숫자 색상 ===== -->
  <div class="bg-white rounded-lg border overflow-hidden">
    <div class="flex items-center justify-between px-4 py-3 bg-gray-50 border-b">
      <span class="text-sm font-semibold text-gray-700"><i class="fas fa-th-large mr-2 text-blue-500"></i>개선 3: 요약 카드 — 색상 과잉 → 의미 있는 색만</span>
      <span class="px-2 py-0.5 rounded text-[10px] font-medium bg-amber-50 text-amber-700">시선 집중도 개선</span>
    </div>
    <div class="p-4">
      <div class="text-xs text-gray-500 mb-3">
        <strong>변경:</strong> 모든 카드 숫자가 원색이면 "뭐가 중요한지" 구분 불가. 위험/이상치만 색상, 나머지는 중성색.
        <span class="text-gray-400 ml-2">(IBM Carbon: "색은 의미가 있을 때만")</span>
      </div>
      <div class="compare-grid">
        <div class="panel-before">
          <div class="panel-label">현재 (전부 원색)</div>
          <div class="panel-body">
            <div class="grid grid-cols-6 gap-2">
              <div class="bg-white rounded-lg border p-2 text-center">
                <div class="text-lg font-bold text-gray-700">42</div>
                <div class="text-[10px] text-gray-400">전체</div>
              </div>
              <div class="bg-white rounded-lg border p-2 text-center">
                <div class="text-lg font-bold text-green-600">28</div>
                <div class="text-[10px] text-gray-400">완료</div>
              </div>
              <div class="bg-white rounded-lg border p-2 text-center">
                <div class="text-lg font-bold text-blue-600">8</div>
                <div class="text-[10px] text-gray-400">진행중</div>
              </div>
              <div class="bg-white rounded-lg border p-2 text-center">
                <div class="text-lg font-bold text-amber-500">4</div>
                <div class="text-[10px] text-gray-400">대기</div>
              </div>
              <div class="bg-white rounded-lg border p-2 text-center">
                <div class="text-lg font-bold text-red-600">2</div>
                <div class="text-[10px] text-gray-400">지연</div>
              </div>
              <div class="bg-white rounded-lg border p-2 text-center">
                <div class="text-lg font-bold text-purple-600">15M</div>
                <div class="text-[10px] text-gray-400">매출</div>
              </div>
            </div>
            <div class="mt-2 text-[10px] text-red-500 text-center">← 모든 숫자가 원색 → 어디를 봐야 할지 모름</div>
          </div>
        </div>
        <div class="panel-after">
          <div class="panel-label">개선안 (위험/이상치만 색상)</div>
          <div class="panel-body">
            <div class="grid grid-cols-6 gap-2">
              <div class="bg-white rounded-lg border p-2 text-center shadow-sm">
                <div class="text-lg font-bold text-gray-900">42</div>
                <div class="text-[10px] text-gray-400">전체</div>
              </div>
              <div class="bg-white rounded-lg border p-2 text-center shadow-sm">
                <div class="text-lg font-bold text-gray-900">28</div>
                <div class="text-[10px] text-gray-400">완료</div>
              </div>
              <div class="bg-white rounded-lg border p-2 text-center shadow-sm">
                <div class="text-lg font-bold text-gray-900">8</div>
                <div class="text-[10px] text-gray-400">진행중</div>
              </div>
              <div class="bg-white rounded-lg border p-2 text-center shadow-sm">
                <div class="text-lg font-bold text-gray-900">4</div>
                <div class="text-[10px] text-gray-400">대기</div>
              </div>
              <div class="bg-white rounded-lg border p-2 text-center shadow-sm border-red-200">
                <div class="text-lg font-bold text-red-600">2</div>
                <div class="text-[10px] text-red-500 font-medium">지연</div>
              </div>
              <div class="bg-white rounded-lg border p-2 text-center shadow-sm">
                <div class="text-lg font-bold text-gray-900">15M</div>
                <div class="text-[10px] text-gray-400">매출</div>
              </div>
            </div>
            <div class="mt-2 text-[10px] text-green-600 text-center">← "지연 2건"만 빨간색 → 즉시 시선 집중</div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- ===== 개선 4: 뱃지 ===== -->
  <div class="bg-white rounded-lg border overflow-hidden">
    <div class="flex items-center justify-between px-4 py-3 bg-gray-50 border-b">
      <span class="text-sm font-semibold text-gray-700"><i class="fas fa-tags mr-2 text-blue-500"></i>개선 4: 뱃지 — 색상만 → 색상+아이콘+텍스트</span>
      <span class="px-2 py-0.5 rounded text-[10px] font-medium bg-red-50 text-red-700">접근성 필수</span>
    </div>
    <div class="p-4">
      <div class="text-xs text-gray-500 mb-3">
        <strong>변경:</strong> WCAG 1.4.1 — 색상만으로 정보 전달 금지. 색맹 사용자(남성 8%)도 구분 가능하도록 아이콘 추가.
      </div>
      <div class="compare-grid">
        <div class="panel-before">
          <div class="panel-label">현재 (색상만)</div>
          <div class="panel-body">
            <div class="space-y-3">
              <div class="flex items-center gap-3">
                <span class="text-xs text-gray-500 w-16">장비상태:</span>
                <span class="px-2 py-0.5 rounded text-xs bg-green-100 text-green-800">가동</span>
                <span class="px-2 py-0.5 rounded text-xs bg-amber-100 text-amber-800">대기</span>
                <span class="px-2 py-0.5 rounded text-xs bg-red-100 text-red-800">OFF</span>
              </div>
              <div class="flex items-center gap-3">
                <span class="text-xs text-gray-500 w-16">주문상태:</span>
                <span class="px-2 py-0.5 rounded text-xs bg-blue-100 text-blue-800">확정</span>
                <span class="px-2 py-0.5 rounded text-xs bg-green-100 text-green-800">완료</span>
                <span class="px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-700">대기</span>
              </div>
              <div class="p-2 bg-gray-50 rounded text-[10px] text-gray-400">
                <i class="fas fa-eye-slash mr-1"></i>색맹 시뮬레이션: 초록·빨강이 비슷하게 보임
              </div>
            </div>
          </div>
        </div>
        <div class="panel-after">
          <div class="panel-label">개선안 (색상 + 아이콘 + 텍스트)</div>
          <div class="panel-body">
            <div class="space-y-3">
              <div class="flex items-center gap-3">
                <span class="text-xs text-gray-500 w-16">장비상태:</span>
                <span class="px-2 py-0.5 rounded text-xs bg-green-50 text-green-700"><i class="fas fa-circle text-[6px] mr-1"></i>가동</span>
                <span class="px-2 py-0.5 rounded text-xs bg-amber-50 text-amber-700"><i class="fas fa-pause text-[8px] mr-1"></i>대기</span>
                <span class="px-2 py-0.5 rounded text-xs bg-red-50 text-red-700"><i class="fas fa-power-off text-[8px] mr-1"></i>OFF</span>
              </div>
              <div class="flex items-center gap-3">
                <span class="text-xs text-gray-500 w-16">주문상태:</span>
                <span class="px-2 py-0.5 rounded text-xs bg-blue-50 text-blue-700"><i class="fas fa-check text-[8px] mr-1"></i>확정</span>
                <span class="px-2 py-0.5 rounded text-xs bg-green-50 text-green-700"><i class="fas fa-check-circle text-[8px] mr-1"></i>완료</span>
                <span class="px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-500"><i class="far fa-clock text-[8px] mr-1"></i>대기</span>
              </div>
              <div class="p-2 bg-green-50 rounded text-[10px] text-green-700">
                <i class="fas fa-universal-access mr-1"></i>아이콘으로 색 구분 없이도 상태 파악 가능
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- ===== 개선 5: 테이블 액션 ===== -->
  <div class="bg-white rounded-lg border overflow-hidden">
    <div class="flex items-center justify-between px-4 py-3 bg-gray-50 border-b">
      <span class="text-sm font-semibold text-gray-700"><i class="fas fa-table mr-2 text-blue-500"></i>개선 5: 테이블 액션 — 항상 표시 → 호버 시 노출</span>
      <span class="px-2 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-700">시각적 노이즈 감소</span>
    </div>
    <div class="p-4">
      <div class="text-xs text-gray-500 mb-3">
        <strong>변경:</strong> 수정/삭제 버튼이 모든 행에 항상 보이면 시각적으로 산만. 호버 시에만 표시.
        <span class="text-gray-400 ml-2">(SAP Fiori, Odoo 공통 패턴)</span>
      </div>
      <div class="compare-grid">
        <div class="panel-before">
          <div class="panel-label">현재 (항상 표시)</div>
          <div class="panel-body">
            <table class="w-full text-xs ds-table-striped">
              <thead class="bg-gray-50"><tr>
                <th class="px-2 py-1.5 text-left text-gray-500">거래처</th>
                <th class="px-2 py-1.5 text-left text-gray-500">품목</th>
                <th class="px-2 py-1.5 text-center text-gray-500">상태</th>
                <th class="px-2 py-1.5 text-center text-gray-500 w-16">관리</th>
              </tr></thead>
              <tbody class="divide-y divide-gray-100">
                <tr><td class="px-2 py-1.5">아이디파일</td><td class="px-2 py-1.5">현수막</td><td class="px-2 py-1.5 text-center"><span class="px-1.5 py-0.5 rounded text-[10px] bg-green-100 text-green-800">완료</span></td><td class="px-2 py-1.5 text-center"><button class="text-blue-600 mr-1"><i class="fas fa-edit"></i></button><button class="text-red-600"><i class="fas fa-trash"></i></button></td></tr>
                <tr><td class="px-2 py-1.5">글로벌사인</td><td class="px-2 py-1.5">솔벤시트</td><td class="px-2 py-1.5 text-center"><span class="px-1.5 py-0.5 rounded text-[10px] bg-blue-100 text-blue-800">진행</span></td><td class="px-2 py-1.5 text-center"><button class="text-blue-600 mr-1"><i class="fas fa-edit"></i></button><button class="text-red-600"><i class="fas fa-trash"></i></button></td></tr>
                <tr><td class="px-2 py-1.5">대한광고</td><td class="px-2 py-1.5">깃발</td><td class="px-2 py-1.5 text-center"><span class="px-1.5 py-0.5 rounded text-[10px] bg-red-100 text-red-800">지연</span></td><td class="px-2 py-1.5 text-center"><button class="text-blue-600 mr-1"><i class="fas fa-edit"></i></button><button class="text-red-600"><i class="fas fa-trash"></i></button></td></tr>
              </tbody>
            </table>
            <div class="mt-2 text-[10px] text-red-500 text-center">← 파란·빨간 아이콘이 매 행마다 반복 → 산만</div>
          </div>
        </div>
        <div class="panel-after">
          <div class="panel-label">개선안 (호버 시 노출)</div>
          <div class="panel-body">
            <table class="w-full text-xs ds-table-striped" id="hoverTable">
              <thead class="bg-gray-50"><tr>
                <th class="px-2 py-1.5 text-left text-gray-500">거래처</th>
                <th class="px-2 py-1.5 text-left text-gray-500">품목</th>
                <th class="px-2 py-1.5 text-center text-gray-500">상태</th>
                <th class="px-2 py-1.5 text-center text-gray-500 w-16">관리</th>
              </tr></thead>
              <tbody class="divide-y divide-gray-100">
                <tr class="hover-row group"><td class="px-2 py-1.5">아이디파일</td><td class="px-2 py-1.5">현수막</td><td class="px-2 py-1.5 text-center"><span class="px-1.5 py-0.5 rounded text-[10px] bg-green-50 text-green-700"><i class="fas fa-check-circle text-[7px] mr-0.5"></i>완료</span></td><td class="px-2 py-1.5 text-center"><span class="action-btns opacity-0 group-hover:opacity-100 transition-opacity"><button class="text-blue-600 mr-1"><i class="fas fa-edit"></i></button><button class="text-red-600"><i class="fas fa-trash"></i></button></span></td></tr>
                <tr class="hover-row group hover:bg-blue-50/50"><td class="px-2 py-1.5">글로벌사인</td><td class="px-2 py-1.5">솔벤시트</td><td class="px-2 py-1.5 text-center"><span class="px-1.5 py-0.5 rounded text-[10px] bg-blue-50 text-blue-700"><i class="fas fa-spinner text-[7px] mr-0.5"></i>진행</span></td><td class="px-2 py-1.5 text-center"><span class="action-btns opacity-100"><button class="text-blue-600 mr-1"><i class="fas fa-edit"></i></button><button class="text-red-600"><i class="fas fa-trash"></i></button></span></td></tr>
                <tr class="hover-row group"><td class="px-2 py-1.5">대한광고</td><td class="px-2 py-1.5">깃발</td><td class="px-2 py-1.5 text-center"><span class="px-1.5 py-0.5 rounded text-[10px] bg-red-50 text-red-700"><i class="fas fa-exclamation-triangle text-[7px] mr-0.5"></i>지연</span></td><td class="px-2 py-1.5 text-center"><span class="action-btns opacity-0 group-hover:opacity-100 transition-opacity"><button class="text-blue-600 mr-1"><i class="fas fa-edit"></i></button><button class="text-red-600"><i class="fas fa-trash"></i></button></span></td></tr>
              </tbody>
            </table>
            <div class="mt-2 text-[10px] text-green-600 text-center">← 2번째 행에 마우스 올린 상태 (호버 시 버튼 노출)</div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- ===== 개선 6: 뱃지 채도 ===== -->
  <div class="bg-white rounded-lg border overflow-hidden">
    <div class="flex items-center justify-between px-4 py-3 bg-gray-50 border-b">
      <span class="text-sm font-semibold text-gray-700"><i class="fas fa-adjust mr-2 text-blue-500"></i>개선 6: 뱃지 채도 — 100 → 50 (은은하게)</span>
      <span class="px-2 py-0.5 rounded text-[10px] font-medium bg-green-50 text-green-700">가독성 향상</span>
    </div>
    <div class="p-4">
      <div class="text-xs text-gray-500 mb-3">
        <strong>변경:</strong> 배경색을 한 단계 연하게 (<code>-100</code> → <code>-50</code>). 텍스트 대비가 올라가고 테이블에서 덜 산만해짐.
      </div>
      <div class="compare-grid">
        <div class="panel-before">
          <div class="panel-label">현재 (bg-*-100 계열)</div>
          <div class="panel-body">
            <div class="flex flex-wrap gap-2">
              <span class="px-2.5 py-1 rounded text-xs font-medium bg-green-100 text-green-800">가동</span>
              <span class="px-2.5 py-1 rounded text-xs font-medium bg-blue-100 text-blue-800">확정</span>
              <span class="px-2.5 py-1 rounded text-xs font-medium bg-amber-100 text-amber-800">대기</span>
              <span class="px-2.5 py-1 rounded text-xs font-medium bg-red-100 text-red-800">지연</span>
              <span class="px-2.5 py-1 rounded text-xs font-medium bg-purple-100 text-purple-800">후가공</span>
            </div>
            <div class="mt-3 text-[10px] text-gray-400">배경색이 진해서 눈에 부담</div>
          </div>
        </div>
        <div class="panel-after">
          <div class="panel-label">개선안 (bg-*-50 계열)</div>
          <div class="panel-body">
            <div class="flex flex-wrap gap-2">
              <span class="px-2.5 py-1 rounded text-xs font-medium bg-green-50 text-green-700"><i class="fas fa-circle text-[5px] mr-1"></i>가동</span>
              <span class="px-2.5 py-1 rounded text-xs font-medium bg-blue-50 text-blue-700"><i class="fas fa-check text-[7px] mr-1"></i>확정</span>
              <span class="px-2.5 py-1 rounded text-xs font-medium bg-amber-50 text-amber-700"><i class="far fa-clock text-[7px] mr-1"></i>대기</span>
              <span class="px-2.5 py-1 rounded text-xs font-medium bg-red-50 text-red-700"><i class="fas fa-exclamation text-[7px] mr-1"></i>지연</span>
              <span class="px-2.5 py-1 rounded text-xs font-medium bg-gray-100 text-gray-500"><i class="fas fa-cog text-[7px] mr-1"></i>후가공</span>
            </div>
            <div class="mt-3 text-[10px] text-green-600">은은한 배경 + 아이콘 → 텍스트 가독성↑, 장시간 편안</div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- ===== 개선 7: 숫자 정렬 ===== -->
  <div class="bg-white rounded-lg border overflow-hidden">
    <div class="flex items-center justify-between px-4 py-3 bg-gray-50 border-b">
      <span class="text-sm font-semibold text-gray-700"><i class="fas fa-sort-numeric-down mr-2 text-blue-500"></i>개선 7: 숫자 정렬 — tabular-nums 적용</span>
      <span class="px-2 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-700">데이터 가독성</span>
    </div>
    <div class="p-4">
      <div class="text-xs text-gray-500 mb-3">
        <strong>변경:</strong> 금액·치수 컬럼에 <code>font-variant-numeric: tabular-nums</code> 적용. 각 자릿수가 동일 폭을 차지하여 세로 정렬 완벽.
      </div>
      <div class="compare-grid">
        <div class="panel-before">
          <div class="panel-label">현재 (기본 숫자)</div>
          <div class="panel-body">
            <table class="w-full text-xs ds-table-striped">
              <thead class="bg-gray-50"><tr>
                <th class="px-2 py-1.5 text-left text-gray-500">거래처</th>
                <th class="px-2 py-1.5 text-right text-gray-500">금액</th>
                <th class="px-2 py-1.5 text-right text-gray-500">미수금</th>
              </tr></thead>
              <tbody class="divide-y divide-gray-100">
                <tr><td class="px-2 py-1.5">아이디파일</td><td class="px-2 py-1.5 text-right">1,234,567</td><td class="px-2 py-1.5 text-right">0</td></tr>
                <tr><td class="px-2 py-1.5">글로벌사인</td><td class="px-2 py-1.5 text-right">890,000</td><td class="px-2 py-1.5 text-right">456,789</td></tr>
                <tr><td class="px-2 py-1.5">대한광고</td><td class="px-2 py-1.5 text-right">45,000</td><td class="px-2 py-1.5 text-right">12,300</td></tr>
              </tbody>
            </table>
          </div>
        </div>
        <div class="panel-after">
          <div class="panel-label">개선안 (tabular-nums)</div>
          <div class="panel-body">
            <table class="w-full text-xs ds-table-striped">
              <thead class="bg-gray-50"><tr>
                <th class="px-2 py-1.5 text-left text-gray-500">거래처</th>
                <th class="px-2 py-1.5 text-right text-gray-500">금액</th>
                <th class="px-2 py-1.5 text-right text-gray-500">미수금</th>
              </tr></thead>
              <tbody class="divide-y divide-gray-100">
                <tr><td class="px-2 py-1.5">아이디파일</td><td class="px-2 py-1.5 text-right" style="font-variant-numeric:tabular-nums;">1,234,567</td><td class="px-2 py-1.5 text-right" style="font-variant-numeric:tabular-nums;">0</td></tr>
                <tr><td class="px-2 py-1.5">글로벌사인</td><td class="px-2 py-1.5 text-right" style="font-variant-numeric:tabular-nums;">890,000</td><td class="px-2 py-1.5 text-right" style="font-variant-numeric:tabular-nums;">456,789</td></tr>
                <tr><td class="px-2 py-1.5">대한광고</td><td class="px-2 py-1.5 text-right" style="font-variant-numeric:tabular-nums;">45,000</td><td class="px-2 py-1.5 text-right" style="font-variant-numeric:tabular-nums;">12,300</td></tr>
              </tbody>
            </table>
            <div class="mt-2 text-[10px] text-green-600 text-center">← 자릿수가 세로로 완벽 정렬 (Pretendard 지원)</div>
          </div>
        </div>
      </div>
    </div>
  </div>

</div>
`,
    pageScript,
  })
}
