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
      <div class="bg-white rounded-lg border p-3 shadow-sm mb-4">
        <div class="flex flex-wrap gap-2 items-end">
          <div class="flex-1 min-w-[200px]">
            <label class="block text-[10px] text-gray-400 mb-0.5">검색</label>
            <input type="text" id="searchInput" placeholder="거래처명, 사업자번호, 전화번호, 키워드..."
              class="w-full border rounded px-2 py-1.5 text-sm" style="color:#212529;">
          </div>
          <div>
            <label class="block text-[10px] text-gray-400 mb-0.5">유형</label>
            <select id="clientTypeFilter" class="border rounded px-2 py-1.5 text-xs" style="color:#212529;">
              <option value="">전체</option>
              <option value="SALES">매출처</option>
              <option value="PURCHASE">매입처</option>
              <option value="BOTH">양쪽</option>
            </select>
          </div>
          <div>
            <label class="block text-[10px] text-gray-400 mb-0.5">계산서</label>
            <select id="invoiceMethodFilter" class="border rounded px-2 py-1.5 text-xs" style="color:#212529;">
              <option value="">전체</option>
              <option value="PER_ORDER">건별 발행</option>
              <option value="MONTHLY">월합산</option>
              <option value="UNDECIDED">미분류</option>
              <option value="CARD">카드결제</option>
              <option value="ISSUED_BY_OTHER">타발행</option>
            </select>
          </div>
          <div>
            <label class="block text-[10px] text-gray-400 mb-0.5">배송</label>
            <select id="deliveryMethodFilter" class="border rounded px-2 py-1.5 text-xs" style="color:#212529;">
              <option value="">전체</option>
              <option value="SAME">소재지</option>
              <option value="FREIGHT">화물</option>
              <option value="DIRECT">직배송</option>
              <option value="PICKUP">방문수령</option>
            </select>
          </div>
          <div>
            <label class="block text-[10px] text-gray-400 mb-0.5">상태</label>
            <select id="activeFilter" class="border rounded px-2 py-1.5 text-xs" style="color:#212529;">
              <option value="1">활성</option>
              <option value="all">전체</option>
              <option value="0">비활성</option>
            </select>
          </div>
          <div>
            <label class="block text-[10px] text-gray-400 mb-0.5">정렬</label>
            <select id="sortBy" class="border rounded px-2 py-1.5 text-xs" style="color:#212529;" onchange="searchClients()">
              <option value="name">이름순</option>
              <option value="last_order">최근주문순</option>
              <option value="created">최근등록순</option>
            </select>
          </div>
          <div>
            <label class="block text-[10px] text-gray-400 mb-0.5">휴면</label>
            <select id="dormantFilter" class="border rounded px-2 py-1.5 text-xs" style="color:#212529;" onchange="searchClients()">
              <option value="">전체</option>
              <option value="30">30일+</option>
              <option value="60">60일+</option>
              <option value="90">90일+</option>
              <option value="180">180일+</option>
            </select>
          </div>
          <div>
            <label class="block text-[10px] text-gray-400 mb-0.5">미수금</label>
            <select id="balanceFilter" class="border rounded px-2 py-1.5 text-xs" style="color:#212529;" onchange="searchClients()">
              <option value="">전체</option>
              <option value="1">미수금 있음</option>
            </select>
          </div>
          <div>
            <label class="block text-[10px] text-gray-400 mb-0.5">차단</label>
            <select id="creditHoldFilter" class="border rounded px-2 py-1.5 text-xs" style="color:#212529;" onchange="searchClients()">
              <option value="">전체</option>
              <option value="1">주문차단</option>
            </select>
          </div>
          <div class="flex gap-1 ml-auto">
            <button onclick="resetFilters()" class="text-gray-500 px-2 py-1.5 text-xs hover:text-gray-700">초기화</button>
            <button onclick="searchClients()" class="px-3 py-1.5 bg-blue-600 text-white rounded text-xs hover:bg-blue-700">
              <i class="fas fa-search mr-1"></i>검색
            </button>
          </div>
        </div>
      </div>

      <!-- 거래처 목록 -->
      <div class="bg-white rounded-lg border shadow-sm">
        <div class="flex justify-between items-center px-4 py-3 border-b">
          <div class="flex items-center gap-3">
            <h3 class="text-sm font-semibold" style="color:#212529;">거래처 목록</h3>
            <span id="totalCount" class="text-xs text-gray-400"></span>
          </div>
          <div class="flex items-center gap-2">
            <select id="pageSizeSelect" onchange="changePageSize()" class="border rounded px-2 py-1 text-xs" style="color:#212529;">
              <option value="20">20개</option>
              <option value="50" selected>50개</option>
              <option value="100">100개</option>
              <option value="200">200개</option>
            </select>
            <button onclick="showAddClientModal()" class="px-3 py-1.5 bg-blue-600 text-white rounded text-xs hover:bg-blue-700">
              <i class="fas fa-plus mr-1"></i>거래처 추가
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

        <div id="paginationArea" class="px-4 py-3 border-t"></div>
      </div>

      <!-- 엑셀 임포트 (하단) -->
      <details class="bg-white rounded-lg border shadow-sm mt-4">
        <summary class="px-4 py-3 cursor-pointer text-sm font-medium text-gray-700 hover:bg-gray-50">
          <i class="fas fa-file-excel text-green-600 mr-2"></i>엑셀 파일 임포트
        </summary>
        <div class="px-4 pb-4">
          <div class="flex gap-3 items-end mt-2">
            <div class="flex-1">
              <label class="block text-[10px] text-gray-400 mb-1">거래처 엑셀 파일 (.xlsx)</label>
              <input type="file" id="excelFile" accept=".xlsx,.xls"
                class="block w-full text-sm text-gray-500 file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-xs file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100">
            </div>
            <button onclick="importExcel()" class="px-4 py-1.5 bg-blue-600 text-white rounded text-xs hover:bg-blue-700">
              <i class="fas fa-upload mr-1"></i>임포트
            </button>
          </div>
          <div id="importResult" class="mt-3 hidden"></div>
        </div>
      </details>

      <!-- 거래처 추가/수정 모달 -->
      <div id="clientModal" class="hidden fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div class="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
          <div class="p-6">
            <h2 class="text-lg font-bold mb-4" style="color:#212529;" id="clientModalTitle">거래처 추가</h2>
            <input type="hidden" id="clientModalId">
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-medium mb-1" style="color:#374151;">사업자등록번호</label>
                <div class="flex gap-2">
                  <input type="text" id="clientModalBizRegNum" oninput="formatBizRegNum(this)" class="flex-1 px-3 py-2 border rounded text-sm" style="color:#212529;" placeholder="000-00-00000" maxlength="12">
                  <button type="button" id="btnCheckBrn" onclick="checkBrnStatus()" class="px-3 py-2 border border-gray-300 text-gray-700 bg-white rounded text-sm whitespace-nowrap hover:bg-gray-50">상태조회</button>
                </div>
                <div id="brnStatusResult" class="hidden text-sm mt-1"></div>
              </div>
              <div>
                <label class="block text-sm font-medium mb-1" style="color:#374151;">거래처 유형</label>
                <select id="editClientType" class="w-full px-3 py-2 border rounded text-sm">
                  <option value="SALES">매출처</option>
                  <option value="PURCHASE">매입처</option>
                  <option value="BOTH">매출+매입</option>
                </select>
              </div>
              <div>
                <label class="block text-sm font-medium mb-1" style="color:#374151;">거래처명 <span class="text-red-500">*</span></label>
                <input type="text" id="clientModalName" class="w-full px-3 py-2 border rounded text-sm" style="color:#212529;">
              </div>
              <div>
                <label class="block text-sm font-medium mb-1" style="color:#374151;">단가표</label>
                <select id="clientModalPriceList" class="w-full px-3 py-2 border rounded text-sm">
                  <option value="">기본</option>
                </select>
              </div>
              <div>
                <label class="block text-sm font-medium mb-1" style="color:#374151;">가격 정책</label>
                <select id="clientModalPricePolicy" class="w-full px-3 py-2 border rounded text-sm">
                  <option value="">정가 (기본)</option>
                </select>
              </div>
              <div>
                <label class="block text-sm font-medium mb-1" style="color:#374151;">대표자</label>
                <input type="text" id="clientModalRepresentative" class="w-full px-3 py-2 border rounded text-sm" style="color:#212529;">
              </div>
              <div>
                <label class="block text-sm font-medium mb-1" style="color:#374151;">업태</label>
                <input type="text" id="clientModalBizType" class="w-full px-3 py-2 border rounded text-sm" style="color:#212529;" placeholder="예: 제조업">
              </div>
              <div>
                <label class="block text-sm font-medium mb-1" style="color:#374151;">종목</label>
                <input type="text" id="clientModalBizItem" class="w-full px-3 py-2 border rounded text-sm" style="color:#212529;" placeholder="예: 현수막">
              </div>
              <div>
                <label class="block text-sm font-medium mb-1" style="color:#374151;">전화</label>
                <input type="text" id="clientModalPhone" oninput="formatPhoneNum(this)" class="w-full px-3 py-2 border rounded text-sm" style="color:#212529;">
              </div>
              <div>
                <label class="block text-sm font-medium mb-1" style="color:#374151;">담당자 휴대폰 <span class="text-blue-500 text-xs font-normal">(알림톡/문자)</span></label>
                <input type="tel" id="clientModalMobile" oninput="formatPhoneNum(this)" class="w-full px-3 py-2 border rounded text-sm" style="color:#212529;" placeholder="010-0000-0000">
              </div>
              <div>
                <label class="block text-sm font-medium mb-1" style="color:#374151;">FAX</label>
                <input type="text" id="clientModalFax" oninput="formatPhoneNum(this)" class="w-full px-3 py-2 border rounded text-sm" style="color:#212529;">
              </div>
              <div>
                <label class="block text-sm font-medium mb-1" style="color:#374151;">이메일</label>
                <input type="email" id="clientModalEmail" class="w-full px-3 py-2 border rounded text-sm" style="color:#212529;">
              </div>
              <div>
                <label class="block text-sm font-medium mb-1" style="color:#374151;">배송방식</label>
                <select id="clientModalDeliveryMethod" class="w-full px-3 py-2 border rounded text-sm">
                  <option value="SAME">소재지 동일</option>
                  <option value="FREIGHT">화물</option>
                  <option value="DIRECT">직배송</option>
                  <option value="PICKUP">방문수령</option>
                </select>
              </div>
              <div class="col-span-2">
                <label class="block text-sm font-medium mb-1" style="color:#374151;">주소</label>
                <div class="grid grid-cols-12 gap-2">
                  <input type="text" id="clientModalPostalCode" maxlength="5" placeholder="우편번호" class="col-span-2 px-3 py-2 border rounded text-sm tabular-nums" style="color:#212529;">
                  <input type="text" id="clientModalAddress" placeholder="기본주소" class="col-span-7 px-3 py-2 border rounded text-sm" style="color:#212529;">
                  <button type="button" onclick="openPostcodeSearch({ postalId: 'clientModalPostalCode', addressId: 'clientModalAddress', detailFocusId: 'clientModalAddressDetail' })" class="col-span-3 px-3 py-2 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded border border-blue-200">
                    <i class="fas fa-search mr-1"></i>주소 검색
                  </button>
                  <input type="text" id="clientModalAddressDetail" placeholder="상세주소 (예: 101동 1502호)" class="col-span-12 px-3 py-2 border rounded text-sm" style="color:#212529;">
                </div>
              </div>
              <div class="col-span-2" id="deliveryAddressRow">
                <label class="block text-sm font-medium mb-1" style="color:#374151;">배송지 (화물 지점명 등)</label>
                <input type="text" id="clientModalDeliveryAddress" class="w-full px-3 py-2 border rounded text-sm" style="color:#212529;" placeholder="예: 유성구암, 별도 배송지 주소 등">
              </div>
              <div class="col-span-2">
                <label class="block text-sm font-medium mb-1" style="color:#374151;">검색 키워드</label>
                <textarea id="clientModalSearchKeywords" rows="2" class="w-full px-3 py-2 border rounded text-sm" style="color:#212529;" placeholder="검색에 사용할 키워드 (쉼표로 구분)"></textarea>
              </div>
              <div class="col-span-2">
                <label class="block text-sm font-medium mb-1" style="color:#374151;">이체 정보</label>
                <textarea id="clientModalTransferInfo" rows="2" class="w-full px-3 py-2 border rounded text-sm" style="color:#212529;" placeholder="계좌번호, 은행명, 예금주 등"></textarea>
              </div>
              <div class="col-span-2">
                <label class="block text-sm font-medium mb-1" style="color:#374151;">비고</label>
                <textarea id="clientModalNotes" rows="2" class="w-full px-3 py-2 border rounded text-sm" style="color:#212529;" placeholder="기타 메모"></textarea>
              </div>
            </div>
            <div class="mt-5 flex gap-2">
              <button onclick="saveClient()" class="flex-1 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm">저장</button>
              <button onclick="document.getElementById('clientModal').classList.add('hidden')" class="px-4 py-2 border border-gray-300 text-gray-700 bg-white rounded hover:bg-gray-50 text-sm">취소</button>
            </div>
          </div>
        </div>
      </div>
    `,
    pageScript,
  })
}
