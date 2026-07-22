import type { Context } from 'hono'
import type { HonoEnv } from '../types/env'
import { renderPage } from '../layout'
import pageScript from '../scripts/clients.js?raw'

export function clientsPage(c: Context<HonoEnv>) {
  return renderPage(c, {
    title: '거래처 관리',
    activePage: '/clients',
    pageContent: `
      <!-- 필터 영역 -->
      <div class="ds-filter-bar">
        <div class="ds-filter-field" style="flex:1;min-width:200px">
          <label class="ds-label">검색</label>
          <input type="text" id="searchInput" placeholder="거래처명, 사업자번호, 전화번호, 키워드..."
            class="ds-input" onkeydown="if(event.key==='Enter')searchClients()">
        </div>
        <div class="ds-filter-field">
          <label class="ds-label">유형</label>
          <select id="clientTypeFilter" class="ds-input" onchange="searchClients()">
            <option value="">전체</option>
            <option value="SALES">매출처</option>
            <option value="PURCHASE">매입처</option>
            <option value="BOTH">양쪽</option>
          </select>
        </div>
        <div class="ds-filter-field">
          <label class="ds-label">계산서</label>
          <select id="invoiceMethodFilter" class="ds-input" onchange="searchClients()">
            <option value="">전체</option>
            <option value="PER_ORDER">건별 발행</option>
            <option value="MONTHLY">월합산</option>
            <option value="UNDECIDED">미분류</option>
            <option value="CARD">카드결제</option>
            <option value="ISSUED_BY_OTHER">타발행</option>
          </select>
        </div>
        <div class="ds-filter-field">
          <label class="ds-label">배송</label>
          <select id="deliveryMethodFilter" class="ds-input" onchange="searchClients()">
            <option value="">전체</option>
            <option value="SAME">소재지</option>
            <option value="FREIGHT">화물</option>
            <option value="DIRECT">직배송</option>
            <option value="PICKUP">방문수령</option>
          </select>
        </div>
        <div class="ds-filter-field">
          <label class="ds-label">상태</label>
          <select id="activeFilter" class="ds-input" onchange="searchClients()">
            <option value="1">활성</option>
            <option value="all">전체</option>
            <option value="0">비활성</option>
          </select>
        </div>
        <div class="ds-filter-field">
          <label class="ds-label">정렬</label>
          <select id="sortBy" class="ds-input" onchange="searchClients()">
            <option value="name">이름순</option>
            <option value="last_order">최근주문순</option>
            <option value="created">최근등록순</option>
          </select>
        </div>
        <div class="ds-filter-field">
          <label class="ds-label">휴면</label>
          <select id="dormantFilter" class="ds-input" onchange="searchClients()">
            <option value="">전체</option>
            <option value="30">30일+</option>
            <option value="60">60일+</option>
            <option value="90">90일+</option>
            <option value="180">180일+</option>
          </select>
        </div>
        <div class="ds-filter-field">
          <label class="ds-label">미수금</label>
          <select id="balanceFilter" class="ds-input" onchange="searchClients()">
            <option value="">전체</option>
            <option value="1">미수금 있음</option>
          </select>
        </div>
        <div class="ds-filter-field">
          <label class="ds-label">차단</label>
          <select id="creditHoldFilter" class="ds-input" onchange="searchClients()">
            <option value="">전체</option>
            <option value="1">주문차단</option>
          </select>
        </div>
        <div class="ds-filter-actions">
          <button onclick="resetFilters()" class="ds-btn ds-btn-ghost ds-btn-sm">초기화</button>
          <button onclick="searchClients()" class="ds-btn ds-btn-primary ds-btn-sm">
            <i class="fas fa-search" style="margin-right:4px"></i>검색
          </button>
        </div>
      </div>

      <!-- 거래처 목록 -->
      <div class="ds-card" style="padding:0;overflow:hidden;">
        <div class="flex justify-between items-center px-4 py-3" style="border-bottom:1px solid var(--c-border-light)">
          <div class="flex items-center gap-3">
            <h3 class="text-sm font-semibold" style="color:var(--c-text)">거래처 목록</h3>
            <span id="totalCount" class="text-xs" style="color:var(--c-text-muted)"></span>
          </div>
          <div class="flex items-center gap-2">
            <select id="pageSizeSelect" onchange="changePageSize()" class="ds-input" style="width:auto;min-height:28px;padding:2px 8px;font-size:var(--fs-xs)">
              <option value="20">20개</option>
              <option value="50" selected>50개</option>
              <option value="100">100개</option>
              <option value="200">200개</option>
            </select>
            <button onclick="showAddClientModal()" class="ds-btn ds-btn-primary ds-btn-sm">
              <i class="fas fa-plus" style="margin-right:4px"></i>거래처 추가
            </button>
          </div>
        </div>

        <div id="clientsList" class="overflow-x-auto">
          <div class="text-center py-12">
            <div class="ds-skeleton ds-skeleton-row" style="width:90%;margin:0 auto 4px;"></div>
            <div class="ds-skeleton ds-skeleton-row" style="width:90%;margin:0 auto 4px;"></div>
            <div class="ds-skeleton ds-skeleton-row" style="width:90%;margin:0 auto 4px;"></div>
            <div class="ds-skeleton ds-skeleton-row" style="width:90%;margin:0 auto 4px;"></div>
            <div class="ds-skeleton ds-skeleton-row" style="width:90%;margin:0 auto 4px;"></div>
          </div>
        </div>

        <div id="paginationArea" class="px-4 py-3" style="border-top:1px solid var(--c-border)"></div>
      </div>

      <!-- 엑셀 임포트 (하단) -->
      <details class="ds-card mt-4" style="padding:0;overflow:hidden;">
        <summary class="px-4 py-3 cursor-pointer text-sm font-medium" style="color:var(--c-text-secondary)">
          <i class="fas fa-file-excel" style="color:var(--c-success);margin-right:8px"></i>엑셀 파일 임포트
        </summary>
        <div class="px-4 pb-4">
          <div class="flex gap-3 items-end mt-2">
            <div class="flex-1">
              <label class="ds-label">거래처 엑셀 파일 (.xlsx)</label>
              <input type="file" id="excelFile" accept=".xlsx,.xls"
                class="ds-input" style="padding:6px">
            </div>
            <button onclick="importExcel()" class="ds-btn ds-btn-primary ds-btn-sm">
              <i class="fas fa-upload" style="margin-right:4px"></i>임포트
            </button>
          </div>
          <div id="importResult" class="mt-3 hidden"></div>
        </div>
      </details>

      <!-- 거래처 추가/수정 모달 -->
      <div id="clientModal" class="ds-modal-overlay hidden">
        <div class="ds-modal ds-modal-wide" style="max-width:720px">
          <div class="ds-modal-header">
            <h3 id="clientModalTitle">거래처 추가</h3>
            <button onclick="document.getElementById('clientModal').classList.add('hidden')" class="ds-btn ds-btn-ghost ds-btn-sm" style="font-size:18px">&times;</button>
          </div>
          <div class="ds-modal-body">
            <input type="hidden" id="clientModalId">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label class="ds-label">사업자등록번호</label>
                <div class="flex gap-2">
                  <input type="text" id="clientModalBizRegNum" oninput="formatBizRegNum(this)" class="ds-input flex-1" placeholder="000-00-00000" maxlength="12">
                  <button type="button" id="btnCheckBrn" onclick="checkBrnStatus()" class="ds-btn ds-btn-secondary ds-btn-sm" style="white-space:nowrap">상태조회</button>
                </div>
                <div id="brnStatusResult" class="hidden text-sm mt-1"></div>
              </div>
              <div>
                <label class="ds-label">거래처 유형</label>
                <select id="editClientType" class="ds-input">
                  <option value="SALES">매출처</option>
                  <option value="PURCHASE">매입처</option>
                  <option value="BOTH">매출+매입</option>
                </select>
              </div>
              <div>
                <label class="ds-label">거래처명 <span style="color:var(--c-danger)">*</span></label>
                <input type="text" id="clientModalName" class="ds-input">
              </div>
              <div>
                <label class="ds-label">단가표</label>
                <select id="clientModalPriceList" class="ds-input">
                  <option value="">기본</option>
                </select>
              </div>
              <div>
                <label class="ds-label">가격 정책</label>
                <select id="clientModalPricePolicy" class="ds-input">
                  <option value="">정가 (기본)</option>
                </select>
              </div>
              <div>
                <label class="ds-label">연체 기준일(일)</label>
                <input type="number" id="clientModalOverdueDays" class="ds-input" placeholder="30" min="1" max="365">
                <div class="text-xs mt-1" style="color:var(--c-text-secondary)">미입력 시 30일. 청구 후 이 일수 초과 시 연체 경고</div>
              </div>
              <div>
                <label class="ds-label">대표자</label>
                <input type="text" id="clientModalRepresentative" class="ds-input">
              </div>
              <div>
                <label class="ds-label">업태</label>
                <input type="text" id="clientModalBizType" class="ds-input" placeholder="예: 제조업">
              </div>
              <div>
                <label class="ds-label">종목</label>
                <input type="text" id="clientModalBizItem" class="ds-input" placeholder="예: 현수막">
              </div>
              <div>
                <label class="ds-label">전화</label>
                <input type="text" id="clientModalPhone" oninput="formatPhoneNum(this)" class="ds-input">
              </div>
              <div>
                <label class="ds-label">담당자 휴대폰 <span class="text-xs font-normal" style="color:var(--c-primary)">(알림톡/문자)</span></label>
                <input type="tel" id="clientModalMobile" oninput="formatPhoneNum(this)" class="ds-input" placeholder="010-0000-0000">
              </div>
              <div>
                <label class="ds-label">FAX</label>
                <input type="text" id="clientModalFax" oninput="formatPhoneNum(this)" class="ds-input">
              </div>
              <div>
                <label class="ds-label">이메일</label>
                <input type="email" id="clientModalEmail" class="ds-input">
              </div>
              <div>
                <label class="ds-label">배송방식</label>
                <select id="clientModalDeliveryMethod" class="ds-input">
                  <option value="대신택배">대신택배</option>
                  <option value="대신화물">대신화물</option>
                  <option value="한진택배">한진택배</option>
                  <option value="직배">직배</option>
                  <option value="용차">용차</option>
                  <option value="퀵">퀵</option>
                  <option value="방문수령">방문수령</option>
                </select>
              </div>
              <div class="col-span-1 md:col-span-2">
                <label class="ds-label">주소</label>
                <div class="grid grid-cols-12 gap-2">
                  <input type="text" id="clientModalPostalCode" maxlength="5" placeholder="우편번호" class="ds-input col-span-2 tabular-nums">
                  <input type="text" id="clientModalAddress" placeholder="기본주소" class="ds-input col-span-7">
                  <button type="button" onclick="openPostcodeSearch({ postalId: 'clientModalPostalCode', addressId: 'clientModalAddress', detailFocusId: 'clientModalAddressDetail' })" class="ds-btn ds-btn-secondary ds-btn-sm col-span-3">
                    <i class="fas fa-search" style="margin-right:4px"></i>주소 검색
                  </button>
                  <input type="text" id="clientModalAddressDetail" placeholder="상세주소 (예: 101동 1502호)" class="ds-input col-span-12">
                </div>
              </div>
              <div class="col-span-1 md:col-span-2" id="deliveryAddressRow">
                <label class="ds-label">배송지 (화물 지점명 등)</label>
                <input type="text" id="clientModalDeliveryAddress" class="ds-input" placeholder="예: 유성구암, 별도 배송지 주소 등">
              </div>
              <div class="col-span-1 md:col-span-2">
                <label class="ds-label">검색 키워드</label>
                <textarea id="clientModalSearchKeywords" rows="2" class="ds-input" placeholder="검색에 사용할 키워드 (쉼표로 구분)"></textarea>
              </div>
              <div class="col-span-1 md:col-span-2" style="border-top:1px solid var(--c-border);padding-top:10px">
                <label class="ds-label">결제 주기 <span class="text-xs font-normal" style="color:var(--c-primary)">(미수금 회수예측)</span></label>
                <div class="flex flex-wrap items-center gap-2">
                  <select id="clientModalCycleType" class="ds-input" style="width:auto" onchange="onCycleTypeChange()">
                    <option value="NET_DAYS">청구건별</option>
                    <option value="MONTHLY">월정산</option>
                    <option value="THRESHOLD">누적 임계(후순위)</option>
                  </select>
                  <div id="cycleNetWrap" class="flex items-center gap-1">
                    <span class="text-sm" style="color:var(--c-text-secondary)">청구일 +</span>
                    <input type="number" id="clientModalTermsDays" class="ds-input" style="width:80px" placeholder="30" min="0">
                    <span class="text-sm" style="color:var(--c-text-secondary)">일</span>
                  </div>
                  <div id="cycleMonthlyWrap" class="hidden items-center gap-1" style="flex-wrap:wrap">
                    <input type="number" id="clientModalClosingDay" class="ds-input" style="width:140px" placeholder="마감일(빈칸=말일)" min="1" max="28" title="1~28일만 지정, 말일은 빈칸. 29~31은 코드상 말일 처리됨">
                    <select id="clientModalMonthOffset" class="ds-input" style="width:auto">
                      <option value="0">당월</option>
                      <option value="1">익월</option>
                      <option value="2">익익월</option>
                    </select>
                    <input type="number" id="clientModalPayDay" class="ds-input" style="width:140px" placeholder="결제일(빈칸=말일)" min="1" max="28" title="1~28일만 지정, 말일은 빈칸. 29~31은 코드상 말일 처리됨">
                  </div>
                </div>
              </div>
              <div class="col-span-1 md:col-span-2">
                <label class="ds-label">이체 정보</label>
                <textarea id="clientModalTransferInfo" rows="2" class="ds-input" placeholder="계좌번호, 은행명, 예금주 등"></textarea>
              </div>
              <div class="col-span-1 md:col-span-2">
                <label class="ds-label">비고</label>
                <textarea id="clientModalNotes" rows="2" class="ds-input" placeholder="기타 메모"></textarea>
              </div>
            </div>
          </div>
          <div class="ds-modal-footer">
            <button onclick="document.getElementById('clientModal').classList.add('hidden')" class="ds-btn ds-btn-secondary">취소</button>
            <button onclick="saveClient()" class="ds-btn ds-btn-primary">저장</button>
          </div>
        </div>
      </div>
    `,
    pageScript,
  })
}
