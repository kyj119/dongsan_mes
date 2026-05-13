// ========== 상태 ==========
var currentDate = (function() {
  var now = new Date();
  var y = now.getFullYear();
  var m = String(now.getMonth() + 1).padStart(2, '0');
  var d = String(now.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + d;
})(); // YYYY-MM-DD (로컬 타임존 기준)
var freightGroups = {};
var daesintaekbaeGroups = {};
var hanjinGroups = {};
var quickGroups = {};
var etcGroups = {};

// ========== 발송 상태 ==========
var selectedShipments = {}; // { 'freight': Set(['key1','key2']), ... }
var shipSendChannel = 'alimtalk';
var shipSendSection = '';
var shipTemplatesCache = [];

// ========== 유틸 ==========

// 로컬 날짜를 YYYY-MM-DD로 반환 (UTC 변환 없이)
function getLocalDateStr(date) {
  var y = date.getFullYear();
  var m = String(date.getMonth() + 1).padStart(2, '0');
  var d = String(date.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + d;
}


function formatDateLabel(dateStr) {
  // YYYY-MM-DD → "03.21 (금)"
  var d = new Date(dateStr + 'T00:00:00');
  var days = ['일', '월', '화', '수', '목', '금', '토'];
  var mm = String(d.getMonth() + 1).padStart(2, '0');
  var dd = String(d.getDate()).padStart(2, '0');
  return mm + '.' + dd + ' (' + days[d.getDay()] + ')';
}

function sectionOf(s) {
  // shipments 테이블 기반 (기존)
  var type = (s.delivery_type || '').toUpperCase();
  var courier = (s.courier_name || '').trim();
  if (type === 'FREIGHT' && courier === '대신화물') return 'freight';
  if (type === 'DELIVERY' && courier === '대신택배') return 'daesintaekbae';
  if (type === 'DELIVERY' && courier === '한진택배') return 'hanjin';
  if (type === 'QUICK') return 'quick';
  // orders/daily 기반 (delivery_method)
  var method = (s.delivery_method || '').trim();
  if (method === '화물' || method.includes('화물')) return 'freight';
  if (method === '택배' || method.includes('한진')) return 'hanjin';
  if (method === '대신택배') return 'daesintaekbae';
  if (method === '퀵' || method === '용차' || method.includes('퀵')) return 'quick';
  if (method === '배송') return 'freight';
  return 'etc';
}

function groupKey(s) {
  return s.client_id ? String(s.client_id) : ('_' + (s.client_name || 'unknown'));
}

// ========== 날짜 탐색 ==========
function initDatePicker() {
  currentDate = getLocalDateStr(new Date());
  document.getElementById('shipDate').value = currentDate;
}

function changeDate(delta) {
  var parts = currentDate.split('-');
  var d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
  d.setDate(d.getDate() + delta);
  currentDate = getLocalDateStr(d);
  document.getElementById('shipDate').value = currentDate;
  loadShipmentsByDate();
}

function goToday() {
  currentDate = getLocalDateStr(new Date());
  document.getElementById('shipDate').value = currentDate;
  loadShipmentsByDate();
}

function scrollToSection(id) {
  var el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ========== 데이터 로드 ==========
async function loadShipmentsByDate() {
  var date = document.getElementById('shipDate').value;
  if (!date) { goToday(); return; }
  currentDate = date; // 항상 동기화

  // 로딩 표시
  ['freight', 'daesintaekbae', 'hanjin', 'quick', 'etc'].forEach(function(sec) {
    var tbody = document.getElementById('tbody-' + sec);
    if (tbody) tbody.innerHTML = '<tr><td colspan="10" class="px-4 py-2"><div class="ds-skeleton ds-skeleton-row"></div></td></tr><tr><td colspan="10" class="px-4 py-2"><div class="ds-skeleton ds-skeleton-row"></div></td></tr><tr><td colspan="10" class="px-4 py-2"><div class="ds-skeleton ds-skeleton-row"></div></td></tr>';
  });

  try {
    var res = await axios.get('/api/shipments/daily?date=' + encodeURIComponent(date));
    if (!res.data.success) {
      showToast('데이터 로드 실패', 'error');
      return;
    }
    var shipments = res.data.data || [];

    // 섹션별·거래처별 그룹화
    freightGroups = {};
    daesintaekbaeGroups = {};
    hanjinGroups = {};
    quickGroups = {};
    etcGroups = {};

    var sectionMaps = {
      freight: freightGroups,
      daesintaekbae: daesintaekbaeGroups,
      hanjin: hanjinGroups,
      quick: quickGroups,
      etc: etcGroups
    };

    shipments.forEach(function(s) {
      var sec = sectionOf(s);
      var key = groupKey(s);
      var map = sectionMaps[sec];
      if (!map[key]) {
        map[key] = {
          key: key,
          client_id: s.client_id,
          client_name: s.client_name || '(거래처 없음)',
          delivery_address: s.delivery_address || '',
          receiver_address: s.receiver_address || s.client_address || '',
          contact_phone: s.contact_phone || s.client_phone || '',
          client_mobile: s.client_mobile || s.mobile || '',
          mobile: s.mobile || '',
          courier_name: s.courier_name || s.delivery_method || '',
          delivery_type: s.delivery_type || s.delivery_method || '',
          delivery_method: s.delivery_method || '',
          delivery_time: s.delivery_time || '',
          delivery_info: s.delivery_info || '',
          shipping_payment: s.shipping_payment || '',
          delivery_date: s.delivery_date || '',
          notes: s.notes || '',
          reception_location: s.reception_location || '',
          items: s.items || [],
          item_summaries: [],
          shipments: [],
          total_cards: 0,
          done_cards: 0,
          shipped_cards: 0
        };
      }
      map[key].shipments.push(s);
      if (s.item_summary) map[key].item_summaries.push(s.item_summary);
      if (s.items && s.items.length) map[key].items = map[key].items.concat(s.items);
      map[key].total_cards += (s.total_cards || 0);
      map[key].done_cards += (s.done_cards || 0);
      map[key].shipped_cards += (s.shipped_cards || 0);
    });

    // 섹션 로드 시 선택 상태 초기화
    selectedShipments = {};
    ['freight', 'daesintaekbae', 'hanjin', 'quick'].forEach(function(sec) {
      updateSendButton(sec);
    });

    renderAllSections();
    updateBadges();
  } catch (e) {
    console.error('loadShipmentsByDate error:', e);
    showToast('로드 오류: ' + (e.message || ''), 'error');
  }
}

// ========== 섹션 렌더링 ==========
function renderAllSections() {
  renderFreightSection();
  renderDaesintaekbaeSection();
  renderHanjinSection();
  renderQuickSection();
  renderEtcSection();
}

function getItemSummaryText(grp) {
  var texts = grp.item_summaries.filter(Boolean);
  if (!texts.length) return '-';
  return texts.join(' / ');
}

function getShipmentIds(grp) {
  return grp.shipments.map(function(s) { return s.id; });
}

function getDefaultLabelCount(grp) {
  return grp.shipments[0] ? (grp.shipments[0].label_count || 1) : 1;
}

function getDefaultBoxCount(grp) {
  return grp.shipments[0] ? (grp.shipments[0].box_count || 1) : 1;
}

function getDefaultTrackingNumber(grp) {
  return grp.shipments[0] ? (grp.shipments[0].tracking_number || '') : '';
}

// --- 대신화물 ---
function renderFreightSection() {
  var tbody = document.getElementById('tbody-freight');
  var keys = Object.keys(freightGroups);
  if (!keys.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-center py-8"><i class="fas fa-truck text-2xl mb-2 block text-gray-300"></i><div class="text-sm text-gray-400">출고 건 없음</div></td></tr>';
    return;
  }
  tbody.innerHTML = keys.map(function(key) {
    var grp = freightGroups[key];
    var labelCount = getDefaultLabelCount(grp);
    var boxCount = getDefaultBoxCount(grp);
    var itemSummary = getItemSummaryText(grp);
    var isChecked = selectedShipments['freight'] && selectedShipments['freight'].has(key);

    // 터미널: 항상 input으로 표시 (저장 버튼 별도)
    // ID 접두어 'f-' 사용: 대신화물 전용 (대신택배와 ID 충돌 방지)
    var terminalHtml = '<div class="flex items-center gap-1">'
      + '<input type="text" id="f-terminal-' + escapeHtml(key) + '" value="' + escapeHtml(grp.delivery_address) + '"'
      + ' placeholder="터미널명" class="ds-input px-2 py-1 text-xs w-24 border rounded">'
      + '<button onclick="saveTerminal(\'' + escapeHtml(key) + '\')" class="px-2 py-1 text-xs bg-gray-100 border rounded hover:bg-gray-200" title="거래처에 저장"><i class="fas fa-save"></i></button>'
      + '</div>';

    return '<tr class="border-t hover:bg-blue-50">'
      + '<td class="px-3 py-2 w-8"><input type="checkbox" id="cb-freight-' + escapeHtml(key) + '" ' + (isChecked ? 'checked' : '') + ' onchange="toggleShipmentCheck(\'freight\',\'' + escapeHtml(key) + '\',this.checked)" class="rounded"></td>'
      + '<td class="px-3 py-2 font-medium">' + escapeHtml(grp.client_name)
      + '<a href="/tax-invoices?search=' + encodeURIComponent(grp.client_name) + '" class="text-xs text-blue-600 hover:underline ml-2"><i class="fas fa-file-invoice mr-1"></i>계산서 발행</a>'
      + '</td>'
      + '<td class="px-3 py-2">' + terminalHtml + '</td>'
      + '<td class="px-3 py-2 text-xs text-gray-500 hidden md:table-cell max-w-[160px] truncate">' + escapeHtml(itemSummary) + '</td>'
      + '<td class="px-3 py-2 text-center">'
      + '<input type="number" id="f-lc-' + escapeHtml(key) + '" value="' + labelCount + '" min="1" max="99"'
      + ' class="ds-input w-14 px-1 py-1 text-center text-sm border rounded"> 장'
      + '</td>'
      + '<td class="px-3 py-2 text-center">'
      + '<input type="number" id="f-bc-' + escapeHtml(key) + '" value="' + boxCount + '" min="1" max="99"'
      + ' class="ds-input w-14 px-1 py-1 text-center text-sm border rounded"> 개'
      + '</td>'
      + '<td class="px-3 py-2 text-center">'
      + '<button onclick="printFreightLabel(\'' + escapeHtml(key) + '\')" class="px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 whitespace-nowrap">'
      + '<i class="fas fa-print mr-1"></i>라벨</button>'
      + '</td>'
      + '</tr>';
  }).join('');
}

// --- 대신택배 ---
function renderDaesintaekbaeSection() {
  var tbody = document.getElementById('tbody-daesintaekbae');
  var keys = Object.keys(daesintaekbaeGroups);
  if (!keys.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-center py-8"><i class="fas fa-truck text-2xl mb-2 block text-gray-300"></i><div class="text-sm text-gray-400">출고 건 없음</div></td></tr>';
    return;
  }
  tbody.innerHTML = keys.map(function(key) {
    var grp = daesintaekbaeGroups[key];
    var labelCount = getDefaultLabelCount(grp);
    var boxCount = getDefaultBoxCount(grp);
    var itemSummary = getItemSummaryText(grp);
    var addr = grp.receiver_address;
    var isChecked = selectedShipments['daesintaekbae'] && selectedShipments['daesintaekbae'].has(key);

    // ID 접두어 'd-' 사용: 대신택배 전용 (대신화물과 ID 충돌 방지)
    return '<tr class="border-t hover:bg-green-50">'
      + '<td class="px-3 py-2 w-8"><input type="checkbox" id="cb-daesintaekbae-' + escapeHtml(key) + '" ' + (isChecked ? 'checked' : '') + ' onchange="toggleShipmentCheck(\'daesintaekbae\',\'' + escapeHtml(key) + '\',this.checked)" class="rounded"></td>'
      + '<td class="px-3 py-2 font-medium">' + escapeHtml(grp.client_name)
      + '<a href="/tax-invoices?search=' + encodeURIComponent(grp.client_name) + '" class="text-xs text-blue-600 hover:underline ml-2"><i class="fas fa-file-invoice mr-1"></i>계산서 발행</a>'
      + '</td>'
      + '<td class="px-3 py-2 text-sm">'
      + '<input type="text" id="d-addr-' + escapeHtml(key) + '" value="' + escapeHtml(addr) + '"'
      + ' class="ds-input px-2 py-1 text-xs w-full border rounded" placeholder="배송주소">'
      + '</td>'
      + '<td class="px-3 py-2 text-xs text-gray-500 hidden md:table-cell max-w-[160px] truncate">' + escapeHtml(itemSummary) + '</td>'
      + '<td class="px-3 py-2 text-center">'
      + '<input type="number" id="d-lc-' + escapeHtml(key) + '" value="' + labelCount + '" min="1" max="99"'
      + ' class="ds-input w-14 px-1 py-1 text-center text-sm border rounded"> 장'
      + '</td>'
      + '<td class="px-3 py-2 text-center">'
      + '<input type="number" id="d-bc-' + escapeHtml(key) + '" value="' + boxCount + '" min="1" max="99"'
      + ' class="ds-input w-14 px-1 py-1 text-center text-sm border rounded"> 개'
      + '</td>'
      + '<td class="px-3 py-2 text-center">'
      + '<button onclick="printDeliveryLabel(\'' + escapeHtml(key) + '\',\'daesintaekbae\')" class="px-3 py-1.5 text-xs bg-green-600 text-white rounded hover:bg-green-700 whitespace-nowrap">'
      + '<i class="fas fa-print mr-1"></i>라벨</button>'
      + '</td>'
      + '</tr>';
  }).join('');
}

// --- 한진택배 ---
function renderHanjinSection() {
  var tbody = document.getElementById('tbody-hanjin');
  var keys = Object.keys(hanjinGroups);
  if (!keys.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="text-center py-8"><i class="fas fa-truck text-2xl mb-2 block text-gray-300"></i><div class="text-sm text-gray-400">출고 건 없음</div></td></tr>';
    return;
  }
  tbody.innerHTML = keys.map(function(key) {
    var grp = hanjinGroups[key];
    var tracking = getDefaultTrackingNumber(grp);
    var addr = grp.receiver_address;
    var isChecked = selectedShipments['hanjin'] && selectedShipments['hanjin'].has(key);
    return '<tr class="border-t hover:bg-orange-50">'
      + '<td class="px-3 py-2 w-8"><input type="checkbox" id="cb-hanjin-' + escapeHtml(key) + '" ' + (isChecked ? 'checked' : '') + ' onchange="toggleShipmentCheck(\'hanjin\',\'' + escapeHtml(key) + '\',this.checked)" class="rounded"></td>'
      + '<td class="px-3 py-2 font-medium">' + escapeHtml(grp.client_name)
      + '<a href="/tax-invoices?search=' + encodeURIComponent(grp.client_name) + '" class="text-xs text-blue-600 hover:underline ml-2"><i class="fas fa-file-invoice mr-1"></i>계산서 발행</a>'
      + '</td>'
      + '<td class="px-3 py-2 text-sm text-gray-600 max-w-[180px] truncate">' + escapeHtml(addr || '-') + '</td>'
      + '<td class="px-3 py-2">'
      + '<input type="text" id="track-' + escapeHtml(key) + '" value="' + escapeHtml(tracking) + '"'
      + ' class="ds-input px-2 py-1 text-sm w-48 border rounded" placeholder="송장번호 입력">'
      + '</td>'
      + '<td class="px-3 py-2 text-center">'
      + '<button onclick="saveTrackingNumber(\'' + escapeHtml(key) + '\')" class="px-3 py-1.5 text-xs bg-orange-600 text-white rounded hover:bg-orange-700">'
      + '<i class="fas fa-save mr-1"></i>저장</button>'
      + '</td>'
      + '</tr>';
  }).join('');
}

// --- 퀵·용차 ---
function renderQuickSection() {
  var tbody = document.getElementById('tbody-quick');
  var keys = Object.keys(quickGroups);
  if (!keys.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="text-center py-8"><i class="fas fa-truck text-2xl mb-2 block text-gray-300"></i><div class="text-sm text-gray-400">출고 건 없음</div></td></tr>';
    return;
  }
  tbody.innerHTML = keys.map(function(key) {
    var grp = quickGroups[key];
    var isChecked = selectedShipments['quick'] && selectedShipments['quick'].has(key);
    return '<tr class="border-t hover:bg-gray-50">'
      + '<td class="px-3 py-2 w-8"><input type="checkbox" id="cb-quick-' + escapeHtml(key) + '" ' + (isChecked ? 'checked' : '') + ' onchange="toggleShipmentCheck(\'quick\',\'' + escapeHtml(key) + '\',this.checked)" class="rounded"></td>'
      + '<td class="px-3 py-2 font-medium">' + escapeHtml(grp.client_name)
      + '<a href="/tax-invoices?search=' + encodeURIComponent(grp.client_name) + '" class="text-xs text-blue-600 hover:underline ml-2"><i class="fas fa-file-invoice mr-1"></i>계산서 발행</a>'
      + '</td>'
      + '<td class="px-3 py-2 text-sm text-gray-600">' + escapeHtml(grp.receiver_address || '-') + '</td>'
      + '<td class="px-3 py-2 text-sm">' + escapeHtml(grp.contact_phone || '-') + '</td>'
      + '<td class="px-3 py-2 text-center">'
      + '<button onclick="printQuickGuide(\'' + escapeHtml(key) + '\')" class="px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 whitespace-nowrap">'
      + '<i class="fas fa-print mr-1"></i>안내용지</button>'
      + '</td>'
      + '</tr>';
  }).join('');
}

// --- 기타 ---
function renderEtcSection() {
  var tbody = document.getElementById('tbody-etc');
  var secEl = document.getElementById('sectionEtc');
  var keys = Object.keys(etcGroups);
  if (!keys.length) {
    secEl.classList.add('hidden');
    return;
  }
  secEl.classList.remove('hidden');
  tbody.innerHTML = keys.map(function(key) {
    var grp = etcGroups[key];
    return '<tr class="border-t">'
      + '<td class="px-3 py-2 font-medium">' + escapeHtml(grp.client_name)
      + '<a href="/tax-invoices?search=' + encodeURIComponent(grp.client_name) + '" class="text-xs text-blue-600 hover:underline ml-2"><i class="fas fa-file-invoice mr-1"></i>계산서 발행</a>'
      + '</td>'
      + '<td class="px-3 py-2 text-xs text-gray-500">' + escapeHtml(grp.delivery_type) + '</td>'
      + '<td class="px-3 py-2 text-xs text-gray-500">' + escapeHtml(grp.courier_name || '-') + '</td>'
      + '<td class="px-3 py-2 text-sm">' + escapeHtml(grp.receiver_address || '-') + '</td>'
      + '</tr>';
  }).join('');
}

// ========== 배지 업데이트 ==========
function updateBadges() {
  var fc = Object.keys(freightGroups).length;
  var dc = Object.keys(daesintaekbaeGroups).length;
  var hc = Object.keys(hanjinGroups).length;
  var qc = Object.keys(quickGroups).length;
  document.getElementById('badgeFreight').textContent = '대신화물 ' + fc + '건';
  document.getElementById('badgeDaesintaekbae').textContent = '대신택배 ' + dc + '건';
  document.getElementById('badgeHanjin').textContent = '한진택배 ' + hc + '건';
  document.getElementById('badgeQuick').textContent = '퀵·용차 ' + qc + '건';
}

// ========== 저장 함수 ==========
async function saveShipmentCounts(shipmentIds, labelCount, boxCount) {
  try {
    for (var i = 0; i < shipmentIds.length; i++) {
      await axios.patch('/api/shipments/' + shipmentIds[i], {
        label_count: parseInt(labelCount) || 1,
        box_count: parseInt(boxCount) || 1
      });
    }
  } catch (e) {
    console.error('saveShipmentCounts error:', e);
  }
}

async function saveTerminal(key) {
  var grp = freightGroups[key];
  if (!grp || !grp.client_id) { showToast('거래처 정보가 없습니다.', 'warning'); return; }
  var terminalEl = document.getElementById('f-terminal-' + key);
  var terminal = terminalEl ? terminalEl.value.trim() : '';
  try {
    await axios.patch('/api/clients/' + grp.client_id, { delivery_address: terminal, delivery_method: 'FREIGHT' });
    grp.delivery_address = terminal;
    showToast('터미널 저장 완료', 'success');
  } catch (e) {
    showToast('저장 실패: ' + (e.message || ''), 'error');
  }
}

async function saveTrackingNumber(key) {
  var grp = hanjinGroups[key];
  if (!grp) return;
  var trackEl = document.getElementById('track-' + key);
  var tracking = trackEl ? trackEl.value.trim() : '';
  var ids = getShipmentIds(grp);
  try {
    for (var i = 0; i < ids.length; i++) {
      await axios.patch('/api/shipments/' + ids[i], { tracking_number: tracking });
    }
    showToast('송장번호 저장 완료', 'success');
  } catch (e) {
    showToast('저장 실패: ' + (e.message || ''), 'error');
  }
}

// ========== 라벨 출력 ==========
function getLabelDateStr() {
  return formatDateLabel(currentDate);
}

function buildFreightLabelHtml(clientName, terminal, count) {
  var dateStr = getLabelDateStr();
  var single = '<div class="label-card">'
    + '<div class="label-client">' + escapeHtml(clientName) + '</div>'
    + '<div class="label-middle">' + escapeHtml(terminal || '(터미널 미지정)') + '</div>'
    + '<div class="label-footer">'
    + '<div class="label-carrier">대신화물</div>'
    + '<div class="label-date">' + escapeHtml(dateStr) + '</div>'
    + '</div></div>';
  var html = '';
  for (var i = 0; i < count; i++) html += single;
  return html;
}

function buildDeliveryLabelHtml(clientName, address, carrier, count) {
  var dateStr = getLabelDateStr();
  var single = '<div class="label-card">'
    + '<div class="label-client">' + escapeHtml(clientName) + '</div>'
    + '<div class="label-middle">' + escapeHtml(address || '(주소 없음)') + '</div>'
    + '<div class="label-footer">'
    + '<div class="label-carrier">' + escapeHtml(carrier) + '</div>'
    + '<div class="label-date">' + escapeHtml(dateStr) + '</div>'
    + '</div></div>';
  var html = '';
  for (var i = 0; i < count; i++) html += single;
  return html;
}

function buildQuickGuideHtml(clientName, address, phone) {
  var dateStr = getLabelDateStr();
  return '<div class="quick-guide">'
    + '<h2>배송 안내</h2>'
    + '<table><tbody>'
    + '<tr><td>거래처</td><td>' + escapeHtml(clientName) + '</td></tr>'
    + '<tr><td>배송지</td><td>' + escapeHtml(address || '-') + '</td></tr>'
    + '<tr><td>연락처</td><td>' + escapeHtml(phone || '-') + '</td></tr>'
    + '<tr><td>날짜</td><td>' + escapeHtml(dateStr) + '</td></tr>'
    + '</tbody></table></div>';
}

function doPrint(html) {
  var printArea = document.getElementById('printArea');
  if (!printArea) { showToast('인쇄 영역을 찾을 수 없습니다.', 'error'); return; }
  printArea.innerHTML = html;
  // 라벨용 @page 동적 삽입
  var pageStyle = document.createElement('style');
  pageStyle.id = 'printLabelPageStyle';
  pageStyle.textContent = '@page { size: 100mm 60mm; margin: 0; }';
  document.head.appendChild(pageStyle);
  setTimeout(function() {
    window.print();
    printArea.innerHTML = '';
    var ps = document.getElementById('printLabelPageStyle');
    if (ps) ps.remove();
  }, 100);
}

async function printFreightLabel(key) {
  var grp = freightGroups[key];
  if (!grp) return;
  var lcEl = document.getElementById('f-lc-' + key);
  var bcEl = document.getElementById('f-bc-' + key);
  var labelCount = parseInt(lcEl ? lcEl.value : '1') || 1;
  var boxCount = parseInt(bcEl ? bcEl.value : '1') || 1;
  var terminalEl = document.getElementById('f-terminal-' + key);
  var terminal = terminalEl ? terminalEl.value.trim() : grp.delivery_address;

  // 라벨 출력 전 수량 저장
  await saveShipmentCounts(getShipmentIds(grp), labelCount, boxCount);

  doPrint(buildFreightLabelHtml(grp.client_name, terminal, labelCount));
}

async function printDeliveryLabel(key, section) {
  var map = section === 'daesintaekbae' ? daesintaekbaeGroups : {};
  var grp = map[key];
  if (!grp) return;
  var lcEl = document.getElementById('d-lc-' + key);
  var bcEl = document.getElementById('d-bc-' + key);
  var labelCount = parseInt(lcEl ? lcEl.value : '1') || 1;
  var boxCount = parseInt(bcEl ? bcEl.value : '1') || 1;
  var addrEl = document.getElementById('d-addr-' + key);
  var address = addrEl ? addrEl.value.trim() : grp.receiver_address;
  var carrier = section === 'daesintaekbae' ? '대신택배' : '택배';

  await saveShipmentCounts(getShipmentIds(grp), labelCount, boxCount);

  doPrint(buildDeliveryLabelHtml(grp.client_name, address, carrier, labelCount));
}

async function printQuickGuide(key) {
  var grp = quickGroups[key];
  if (!grp) return;
  doPrint(buildQuickGuideHtml(grp.client_name, grp.receiver_address, grp.contact_phone));
}

async function printAllSection(section) {
  var map = section === 'freight' ? freightGroups : daesintaekbaeGroups;
  var carrier = section === 'freight' ? null : '대신택배';
  var keys = Object.keys(map);
  if (!keys.length) { showToast('출력할 내용이 없습니다.', 'warning'); return; }

  var allHtml = '';
  var prefix = section === 'freight' ? 'f-' : 'd-';
  for (var i = 0; i < keys.length; i++) {
    var key = keys[i];
    var grp = map[key];
    var lcEl = document.getElementById(prefix + 'lc-' + key);
    var bcEl = document.getElementById(prefix + 'bc-' + key);
    var labelCount = parseInt(lcEl ? lcEl.value : '1') || 1;
    var boxCount = parseInt(bcEl ? bcEl.value : '1') || 1;
    await saveShipmentCounts(getShipmentIds(grp), labelCount, boxCount);

    if (section === 'freight') {
      var termEl = document.getElementById('f-terminal-' + key);
      var terminal = termEl ? termEl.value.trim() : grp.delivery_address;
      allHtml += buildFreightLabelHtml(grp.client_name, terminal, labelCount);
    } else {
      var addrEl = document.getElementById('d-addr-' + key);
      var address = addrEl ? addrEl.value.trim() : grp.receiver_address;
      allHtml += buildDeliveryLabelHtml(grp.client_name, address, carrier, labelCount);
    }
  }
  doPrint(allHtml);
}

// ========== 출고 확정 ==========
async function confirmShipSection(section) {
  var groups = getSectionGroups(section);
  var keys = Object.keys(groups);
  if (!keys.length) { showToast('출고할 항목이 없습니다.', 'warning'); return; }

  // 주문 ID 수집 (중복 제거)
  var orderIds = new Set();
  keys.forEach(function(key) {
    var grp = groups[key];
    grp.shipments.forEach(function(s) { var oid = s.order_id || s.id; if (oid) orderIds.add(oid); });
  });
  if (orderIds.size === 0) { showToast('출고 대상 주문이 없습니다.', 'warning'); return; }

  if (!(await showConfirm(orderIds.size + '건 주문을 출고 확정하시겠습니까?\n(출력완료 카드만 출고 처리됩니다)'))) return;

  try {
    var res = await axios.patch('/api/orders/bulk-ship', { order_ids: Array.from(orderIds) });
    if (res.data.success) {
      var results = res.data.data || [];
      var shipped = results.filter(function(r) { return r.order_shipped; }).length;
      var partial = results.filter(function(r) { return r.success && !r.order_shipped; }).length;
      var msg = shipped + '건 출고 완료';
      if (partial > 0) msg += ', ' + partial + '건 부분 출고';
      showToast(msg, 'success');
      loadShipmentsByDate();
    }
  } catch(err) {
    showToast('출고 처리 실패: ' + (err.response?.data?.error || err.message), 'error');
  }
}

// ========== 출고 확인 리스트 (A4 가로형) ==========
function printShipmentList(carrier) {
  // carrier: 'daeshin' (화물+택배) or 'hanjin'
  var sections = [];
  if (carrier === 'daeshin') {
    sections.push({ title: '대신화물 (16:00 출고)', groups: freightGroups });
    sections.push({ title: '대신택배 (16:00 출고)', groups: daesintaekbaeGroups });
  } else {
    sections.push({ title: '한진택배 (18:00 출고)', groups: hanjinGroups });
  }

  var totalCount = 0;
  var html = '<div style="padding:8mm;font-family:Malgun Gothic,sans-serif;">';
  html += '<div class="list-header"><h2>' + (carrier === 'daeshin' ? '대신 출고 확인 리스트' : '한진 출고 확인 리스트') + '</h2>';
  html += '<span class="list-date">' + currentDate + '</span></div>';

  for (var s = 0; s < sections.length; s++) {
    var sec = sections[s];
    var keys = Object.keys(sec.groups);
    if (keys.length === 0) continue;

    html += '<div class="list-section">';
    html += '<h3 style="font-size:11pt;font-weight:bold;margin:8px 0 4px;color:#333;">' + sec.title + ' (' + keys.length + '건)</h3>';
    html += '<table><thead><tr>';
    html += '<th style="width:3%">No</th>';
    html += '<th style="width:10%">거래처</th>';
    html += '<th style="width:9%">전화번호</th>';
    html += '<th style="width:18%">품목명[규격]</th>';
    html += '<th style="width:7%">배송처</th>';
    html += '<th style="width:5%">수량</th>';
    html += '<th style="width:7%">출고방법</th>';
    html += '<th style="width:5%">착/선불</th>';
    html += '<th style="width:18%">배송처 주소</th>';
    html += '<th style="width:10%">비고</th>';
    html += '<th style="width:8%">납기</th>';
    html += '</tr></thead><tbody>';

    var idx = 0;
    for (var k = 0; k < keys.length; k++) {
      var grp = sec.groups[keys[k]];
      idx++;
      totalCount++;

      // 전화번호: contact_phone > client_mobile > client_phone
      var phone = grp.contact_phone || grp.client_mobile || '';

      // 품목명[규격]: items 배열에서 추출
      var itemStr = '';
      if (grp.items && grp.items.length > 0) {
        itemStr = grp.items.map(function(it) {
          var spec = (it.width && it.height) ? '[' + it.width + 'x' + it.height + ']' : '';
          return it.item_name + spec;
        }).join(', ');
      } else {
        itemStr = getItemSummaryText(grp);
      }

      // 전체 수량
      var totalQty = 0;
      if (grp.items && grp.items.length > 0) {
        grp.items.forEach(function(it) { totalQty += (it.quantity || 0); });
      }

      // 배송처 (reception_location 또는 터미널)
      var dest = grp.reception_location || '';
      if (!dest && carrier === 'daeshin' && s === 0) {
        var termEl = document.getElementById('f-terminal-' + keys[k]);
        dest = termEl ? termEl.value.trim() : (grp.delivery_address || '');
      }

      // 출고방법
      var method = grp.delivery_method || grp.courier_name || '';

      // 착/선불 (shipping_payment 필드)
      var payType = grp.shipping_payment || '';

      // 배송처 주소
      var address = grp.receiver_address || grp.delivery_address || grp.client_address || '';
      if (!address) {
        var addrEl = document.getElementById('d-addr-' + keys[k]);
        if (addrEl) address = addrEl.value.trim();
      }

      // 납기
      var ddate = grp.delivery_date || '';

      html += '<tr>';
      html += '<td style="text-align:center">' + idx + '</td>';
      html += '<td>' + escapeHtml(grp.client_name) + '</td>';
      html += '<td style="font-size:9pt">' + escapeHtml(phone) + '</td>';
      html += '<td style="font-size:8pt">' + escapeHtml(itemStr.length > 50 ? itemStr.substring(0, 50) + '...' : itemStr) + '</td>';
      html += '<td style="font-size:9pt">' + escapeHtml(dest) + '</td>';
      html += '<td style="text-align:center">' + (totalQty || '-') + '</td>';
      html += '<td style="font-size:9pt">' + escapeHtml(method) + '</td>';
      html += '<td style="text-align:center;font-size:9pt">' + escapeHtml(payType) + '</td>';
      html += '<td style="font-size:8pt">' + escapeHtml(address) + '</td>';
      html += '<td style="font-size:8pt">' + escapeHtml(grp.notes) + '</td>';
      html += '<td style="font-size:9pt">' + escapeHtml(ddate) + '</td>';
      html += '</tr>';
    }
    html += '</tbody></table></div>';
  }

  html += '<div style="margin-top:12px;font-size:10pt;color:#666;">합계: ' + totalCount + '건 | 출력시각: ' + new Date().toLocaleTimeString('ko-KR', {hour:'2-digit',minute:'2-digit'}) + '</div>';
  html += '</div>';

  var listArea = document.getElementById('printListArea');
  if (!listArea) return;
  listArea.innerHTML = html;
  document.body.classList.add('print-list-mode');
  // A4 가로 @page 동적 삽입
  var pageStyle = document.createElement('style');
  pageStyle.id = 'printListPageStyle';
  pageStyle.textContent = '@page { size: A4 landscape; margin: 10mm; }';
  document.head.appendChild(pageStyle);
  setTimeout(function() {
    window.print();
    document.body.classList.remove('print-list-mode');
    listArea.innerHTML = '';
    var ps = document.getElementById('printListPageStyle');
    if (ps) ps.remove();
  }, 100);
}

// ========== 체크박스 ==========
function getSectionGroups(section) {
  var map = { freight: freightGroups, daesintaekbae: daesintaekbaeGroups, hanjin: hanjinGroups, quick: quickGroups, etc: etcGroups };
  return map[section] || {};
}

function toggleSectionCheck(section, checked) {
  var groups = getSectionGroups(section);
  if (!selectedShipments[section]) selectedShipments[section] = new Set();
  Object.keys(groups).forEach(function(key) {
    var cb = document.getElementById('cb-' + section + '-' + key);
    if (cb) cb.checked = checked;
    if (checked) selectedShipments[section].add(key);
    else selectedShipments[section].delete(key);
  });
  updateSendButton(section);
}

function toggleShipmentCheck(section, key, checked) {
  if (!selectedShipments[section]) selectedShipments[section] = new Set();
  if (checked) selectedShipments[section].add(key);
  else selectedShipments[section].delete(key);
  updateSendButton(section);
}

function updateSendButton(section) {
  var capSection = section.charAt(0).toUpperCase() + section.slice(1);
  var btn = document.getElementById('btnSend' + capSection);
  var count = selectedShipments[section] ? selectedShipments[section].size : 0;
  if (btn) {
    if (count > 0) {
      btn.classList.remove('hidden');
      btn.innerHTML = '<i class="fas fa-paper-plane mr-1"></i>' + count + '건 발송';
    } else {
      btn.classList.add('hidden');
    }
  }
}

// ========== 발송 모달 ==========
function openShipmentSendModal(section) {
  shipSendSection = section;
  var groups = getSectionGroups(section);
  var selected = selectedShipments[section] || new Set();
  if (selected.size === 0) { showToast('발송할 거래처를 선택해주세요', 'warning'); return; }

  // 대상 목록 표시
  var targetsHtml = '';
  var noMobileCount = 0;
  selected.forEach(function(key) {
    var grp = groups[key];
    if (!grp) return;
    var phone = grp.mobile || grp.contact_phone || '';
    if (phone) {
      targetsHtml += '<div class="flex justify-between text-gray-700"><span>' + escapeHtml(grp.client_name) + '</span><span class="text-gray-400">' + escapeHtml(phone) + '</span></div>';
    } else {
      noMobileCount++;
      targetsHtml += '<div class="flex justify-between text-gray-400"><span>' + escapeHtml(grp.client_name) + '</span><span class="text-red-400 text-xs">연락처 없음</span></div>';
    }
  });
  document.getElementById('shipSendTargets').innerHTML = targetsHtml || '<div class="text-gray-400 text-xs">대상 없음</div>';

  var noMobileEl = document.getElementById('shipSendNoMobile');
  if (noMobileCount > 0) {
    noMobileEl.textContent = noMobileCount + '건은 연락처가 없어 발송되지 않습니다';
    noMobileEl.classList.remove('hidden');
  } else {
    noMobileEl.classList.add('hidden');
  }

  document.getElementById('shipSendBtnText').textContent = selected.size + '건 발송';

  // 템플릿 로드 (카카오톡용)
  if (shipTemplatesCache.length === 0) {
    axios.get('/api/kakao/templates').then(function(res) {
      if (res.data.success) {
        shipTemplatesCache = (res.data.data || []).filter(function(t) { return t.state === 'S' || t.state === '3'; });
        fillShipTemplateSelect();
      }
    }).catch(function() {});
  } else {
    fillShipTemplateSelect();
  }

  // 기본 메시지
  document.getElementById('shipSendContent').value = getDefaultShipmentMessage(section, groups, selected);

  var modal = document.getElementById('shipmentSendModal');
  modal.classList.remove('hidden');
  modal.onclick = function(e) {
    if (e.target === modal) closeShipmentSendModal();
  };
}

function getDefaultShipmentMessage(section, groups, selected) {
  var date = document.getElementById('shipDate').value;
  if (section === 'freight') {
    return '#{고객명}님, 동산현수막입니다.\n\n주문하신 제품이 발송되었습니다.\n\n■ 품목: #{품목}\n■ 배송: 대신화물\n■ 터미널: #{터미널}\n■ 출고일: ' + date + '\n\n문의: 042-523-1982';
  } else if (section === 'hanjin') {
    return '#{고객명}님, 동산현수막입니다.\n\n주문하신 제품이 발송되었습니다.\n\n■ 품목: #{품목}\n■ 배송: 한진택배\n■ 송장번호: #{송장번호}\n■ 출고일: ' + date + '\n\n문의: 042-523-1982';
  } else if (section === 'daesintaekbae') {
    return '#{고객명}님, 동산현수막입니다.\n\n주문하신 제품이 발송되었습니다.\n\n■ 품목: #{품목}\n■ 배송: 대신택배\n■ 출고일: ' + date + '\n\n문의: 042-523-1982';
  } else if (section === 'quick') {
    return '#{고객명}님, 동산현수막입니다.\n\n주문하신 제품이 출고 준비 완료되었습니다.\n방문 수령 가능합니다.\n\n■ 품목: #{품목}\n■ 출고일: ' + date + '\n\n문의: 042-523-1982';
  }
  return '#{고객명}님, 동산현수막입니다.\n\n주문하신 제품이 출고되었습니다.\n\n■ 출고일: ' + date + '\n\n문의: 042-523-1982';
}

function fillShipTemplateSelect() {
  var sel = document.getElementById('shipTemplateSelect');
  sel.innerHTML = '<option value="">직접 작성</option>' + shipTemplatesCache.map(function(t) {
    return '<option value="' + escapeHtml(t.templateCode) + '">' + escapeHtml(t.templateName) + '</option>';
  }).join('');

  // 섹션별 자동 선택
  var autoCode = '';
  if (shipSendSection === 'quick') {
    autoCode = 'pickup_ready';
  } else if (shipSendSection === 'freight' || shipSendSection === 'hanjin' || shipSendSection === 'daesintaekbae') {
    autoCode = 'shipment_sent';
  }

  if (autoCode) {
    sel.value = autoCode;
    // 자동 선택된 템플릿의 내용을 메시지에 반영
    onShipTemplateChange();
  }
}

function onShipTemplateChange() {
  var code = document.getElementById('shipTemplateSelect').value;
  if (!code) return;
  var tpl = shipTemplatesCache.find(function(t) { return t.templateCode === code; });
  if (tpl) document.getElementById('shipSendContent').value = tpl.template || tpl.content || '';
}

function setShipSendChannel(ch) {
  shipSendChannel = ch;
  var alBtn = document.getElementById('shipChannelAlimtalk');
  var smsBtn = document.getElementById('shipChannelSms');
  if (ch === 'alimtalk') {
    alBtn.className = 'flex-1 px-3 py-2 text-sm rounded-lg border-2 border-blue-500 bg-blue-50 text-blue-700 font-medium';
    smsBtn.className = 'flex-1 px-3 py-2 text-sm rounded-lg border-2 border-gray-200 text-gray-600';
    document.getElementById('shipAlimtalkArea').classList.remove('hidden');
    document.getElementById('shipSmsArea').classList.add('hidden');
  } else {
    smsBtn.className = 'flex-1 px-3 py-2 text-sm rounded-lg border-2 border-green-500 bg-green-50 text-green-700 font-medium';
    alBtn.className = 'flex-1 px-3 py-2 text-sm rounded-lg border-2 border-gray-200 text-gray-600';
    document.getElementById('shipAlimtalkArea').classList.add('hidden');
    document.getElementById('shipSmsArea').classList.remove('hidden');
  }
}

function closeShipmentSendModal() {
  document.getElementById('shipmentSendModal').classList.add('hidden');
  shipSendSection = '';
}

async function sendShipmentBulk() {
  var groups = getSectionGroups(shipSendSection);
  var selected = selectedShipments[shipSendSection] || new Set();
  var content = document.getElementById('shipSendContent').value.trim();
  if (!content) { showToast('메시지 내용을 입력해주세요', 'warning'); return; }

  // 발송 대상 구성 (mobile 있는 것만)
  var targets = [];
  selected.forEach(function(key) {
    var grp = groups[key];
    if (!grp) return;
    var phone = grp.mobile || grp.contact_phone || '';
    if (!phone) return;

    var tracking = '';
    var trackEl = document.getElementById('track-' + key);
    if (trackEl) tracking = trackEl.value || '';

    var terminal = grp.delivery_address || '';
    var termEl = document.getElementById('f-terminal-' + key);
    if (termEl) terminal = termEl.value || '';

    targets.push({
      client_id: grp.client_id,
      client_name: grp.client_name,
      mobile: phone,
      item_summary: getItemSummaryText(grp),
      tracking_number: tracking,
      terminal: terminal,
      delivery_type: grp.delivery_type || '',
      shipment_ids: getShipmentIds(grp)
    });
  });

  if (targets.length === 0) { showToast('발송 가능한 대상이 없습니다 (연락처 확인)', 'warning'); return; }

  var confirmMsg = targets.length + '개 거래처에 ' + (shipSendChannel === 'alimtalk' ? '카카오톡' : '문자') + '를 발송합니다.';
  if (!(await showConfirm(confirmMsg))) return;

  try {
    var templateCode = '';
    if (shipSendChannel === 'alimtalk') {
      var selEl = document.getElementById('shipTemplateSelect');
      templateCode = selEl ? selEl.value : '';
    }
    var subjectEl = document.getElementById('shipSmsSubject');
    var subject = (shipSendChannel === 'sms' && subjectEl) ? subjectEl.value.trim() : '';

    var payload = {
      channel: shipSendChannel,
      content: content,
      targets: targets,
      template_code: templateCode,
      subject: subject,
      date: document.getElementById('shipDate').value
    };

    var res = await axios.post('/api/kakao/send-shipment-bulk', payload);
    if (res.data.success) {
      var d = res.data.data;
      showToast((d.sent_count || targets.length) + '건 발송 완료', 'success');
      closeShipmentSendModal();
      // 해당 섹션 체크 해제
      selectedShipments[shipSendSection] = new Set();
      updateSendButton(shipSendSection);
    } else {
      showToast(res.data.error || '발송 실패', 'error');
    }
  } catch(e) {
    showToast('발송 오류: ' + (e.response && e.response.data ? e.response.data.error : e.message), 'error');
  }
}

// ========== 배송 중 (In-Transit) ==========
async function loadInTransitOrders() {
  try {
    var res = await axios.get('/api/orders/in-transit');
    if (!res.data.success) return;
    var orders = res.data.data || [];
    var section = document.getElementById('sectionInTransit');
    var tbody = document.getElementById('tbody-intransit');
    var badge = document.getElementById('badgeInTransit');
    if (!tbody || !section) return;

    if (orders.length === 0) {
      section.classList.add('hidden');
      tbody.innerHTML = '<tr><td colspan="6" class="px-4 py-6 text-center text-gray-400 text-sm">배송 중인 주문이 없습니다.</td></tr>';
      return;
    }

    section.classList.remove('hidden');
    if (badge) badge.textContent = orders.length + '건';

    var today = new Date().toISOString().split('T')[0];
    tbody.innerHTML = orders.map(function(o) {
      var isOverdue = o.auto_complete_date <= today;
      var statusHtml = isOverdue
        ? '<span class="ds-badge ds-badge-green text-xs">동기화 가능</span>'
        : '<span class="ds-badge ds-badge-blue text-xs">배송 중</span>';
      return '<tr class="hover:bg-gray-50">'
        + '<td class="px-3 py-2 text-sm font-medium">' + escapeHtml(o.order_number) + '</td>'
        + '<td class="px-3 py-2 text-sm">' + escapeHtml(o.client_name) + '</td>'
        + '<td class="px-3 py-2 text-center text-xs">' + escapeHtml(o.delivery_method || '-') + '</td>'
        + '<td class="px-3 py-2 text-center text-xs">' + escapeHtml((o.updated_at || '').substring(0, 10)) + '</td>'
        + '<td class="px-3 py-2 text-center text-xs font-medium ' + (isOverdue ? 'text-green-600' : 'text-gray-500') + '">' + escapeHtml(o.auto_complete_date) + '</td>'
        + '<td class="px-3 py-2 text-center">' + statusHtml + '</td>'
        + '</tr>';
    }).join('');
  } catch(e) {
    console.error('loadInTransitOrders error:', e);
  }
}

async function runSyncStatuses() {
  if (!(await showConfirm('상태 동기화를 실행하시겠습니까?\n기한이 도래한 주문이 출고완료 상태로 전이됩니다.'))) return;
  try {
    var res = await axios.post('/api/orders/sync-statuses');
    if (res.data.success) {
      var d = res.data.data;
      var msg = '동기화 완료: 출고완료 ' + d.shipped + '건';
      if (d.billed > 0) msg += ', 회계반영 ' + d.billed + '건';
      showToast(msg, 'success');
      var timeEl = document.getElementById('syncLastTime');
      if (timeEl) {
        var now = new Date();
        timeEl.textContent = '마지막 동기화: ' + now.getHours() + ':' + String(now.getMinutes()).padStart(2, '0');
      }
      loadInTransitOrders();
      loadShipmentsByDate();
    } else {
      showToast(res.data.error || '동기화 실패', 'error');
    }
  } catch(e) {
    showToast('동기화 오류: ' + (e.response?.data?.error || e.message), 'error');
  }
}

// ========== 초기화 ==========
initDatePicker();
loadShipmentsByDate();
loadInTransitOrders();
