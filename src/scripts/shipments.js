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
var jikbaeGroups = {}; // 직배 전용 섹션 (배송 후속 P2)
var etcGroups = {};
var shipmentsMultiEntity = false; // P2: 로드된 데이터에 복수 법인 존재 시 법인 배지 표시 (전체모드)

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
  // shipments 테이블 기반 (기존) — /daily는 합포장 자식에 대표(primary) 값을 COALESCE로 내려줌
  //   → 합포장 그룹은 대표의 운송수단 섹션 하나로 모임 (박스는 대표 운송수단으로 나감)
  var type = (s.delivery_type || '').toUpperCase();
  var courier = (s.courier_name || '').trim();
  if (type === 'FREIGHT' && courier === '대신화물') return 'freight';
  if (type === 'DELIVERY' && courier === '대신택배') return 'daesintaekbae';
  if (type === 'DELIVERY' && courier === '한진택배') return 'hanjin';
  if (type === 'DELIVERY' && (courier === '직배' || courier === '직접배송')) return 'jikbae';
  if (type === 'QUICK') return 'quick';
  // orders/daily 기반 (delivery_method) — 합포장 자식은 대표 주문의 배송방법 우선
  var method = ((s.merged_into_id && s.primary_delivery_method) || s.delivery_method || '').trim();
  if (method === '직배' || method === '직접배송') return 'jikbae';
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
  var secCols = { freight: 7, daesintaekbae: 7, hanjin: 5, quick: 5, jikbae: 6, etc: 4 };
  ['freight', 'daesintaekbae', 'hanjin', 'quick', 'jikbae', 'etc'].forEach(function(sec) {
    var tbody = document.getElementById('tbody-' + sec);
    var cs = secCols[sec] || 7;
    if (tbody) tbody.innerHTML = '<tr><td colspan="' + cs + '" class="px-4 py-2"><div class="ds-skeleton ds-skeleton-row"></div></td></tr><tr><td colspan="' + cs + '" class="px-4 py-2"><div class="ds-skeleton ds-skeleton-row"></div></td></tr><tr><td colspan="' + cs + '" class="px-4 py-2"><div class="ds-skeleton ds-skeleton-row"></div></td></tr>';
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
    jikbaeGroups = {};
    etcGroups = {};

    var sectionMaps = {
      freight: freightGroups,
      daesintaekbae: daesintaekbaeGroups,
      hanjin: hanjinGroups,
      quick: quickGroups,
      jikbae: jikbaeGroups,
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
          // P1: shipment 저장 주소 > 주문 배송처(delivery_info) > 거래처 주소 (기존엔 receiver_address 미저장이라 항상 거래처 폴백)
          receiver_address: s.receiver_address || s.delivery_info || s.client_address || '',
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
          items: [], // 아래 concat에서 모든 shipment(첫 건 포함) items를 1회씩 누적 — s.items로 초기화하면 첫 주문 2배 중복
          item_summaries: [],
          shipments: [],
          entity_names: {}, // P2: 그룹 내 법인 집합 (배지)
          total_cards: 0,
          done_cards: 0,
          shipped_cards: 0
        };
      }
      map[key].shipments.push(s);
      if (s.entity_id != null) map[key].entity_names[s.entity_name || ('법인' + s.entity_id)] = true;
      if (s.item_summary) map[key].item_summaries.push(s.item_summary);
      if (s.items && s.items.length) map[key].items = map[key].items.concat(s.items);
      map[key].total_cards += (s.total_cards || 0);
      map[key].done_cards += (s.done_cards || 0);
      map[key].shipped_cards += (s.shipped_cards || 0);
    });

    // P2: 복수 법인 데이터 여부 (관리자 전체모드에서만 true — 법인 배지 노출 조건)
    var entitySet = {};
    shipments.forEach(function(s) { if (s.entity_id != null) entitySet[s.entity_id] = true; });
    shipmentsMultiEntity = Object.keys(entitySet).length > 1;

    // 섹션 로드 시 선택 상태 초기화
    selectedShipments = {};
    ['freight', 'daesintaekbae', 'hanjin', 'quick', 'jikbae'].forEach(function(sec) {
      updateSendButton(sec);
    });

    renderAllSections();
    updateBadges();
    loadConsolidationCandidates(date); // P2: 합배송 후보 (비동기, 실패해도 본 화면 무관)
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
  renderJikbaeSection();
  renderEtcSection();
}

function getItemSummaryText(grp) {
  // 내품명(한진 송장·알림 품목): 대표품목 + '외 N건' (N = 나머지 품목 건수)
  var items = (grp.items || []).filter(function(it) { return it && it.item_name; });
  if (items.length) {
    var first = items[0].item_name;
    return items.length === 1 ? first : (first + ' 외 ' + (items.length - 1) + '건');
  }
  // fallback: 품목 배열이 없으면 기존 요약 문자열
  var texts = (grp.item_summaries || []).filter(Boolean);
  return texts.length ? texts.join(' / ') : '-';
}

// T1: 품목 셀 상세 렌더 — 품목별 줄 나열(규격·수량·메모). 화면 셀 전용.
// 엑셀(hanjin-export)·인쇄(printShipmentList)·알림 발송은 getItemSummaryText 요약 유지.
// (전역 스코프 concat 충돌 방지: shipments prefix)
function shipmentsItemDetailHtml(grp) {
  var items = (grp.items || []).filter(function(it) { return it && it.item_name; });
  if (!items.length) {
    var texts = (grp.item_summaries || []).filter(Boolean);
    var fb = texts.length ? texts.join(' / ') : '-';
    return '<div class="truncate" title="' + escapeHtml(fb) + '">' + escapeHtml(fb) + '</div>';
  }
  var MAX_LINES = 3;
  var html = items.slice(0, MAX_LINES).map(function(it) {
    // 규격: specification 우선, 없으면 width×height, 둘 다 없으면 생략
    var spec = it.specification || ((it.width && it.height) ? (it.width + 'x' + it.height) : '');
    var qty = (it.quantity != null ? it.quantity : 1);
    var main = it.item_name + (spec ? ' ' + spec : '') + ' ×' + qty;
    var full = main + (it.content ? ' · ' + it.content : '');
    return '<div class="truncate" title="' + escapeHtml(full) + '">' + escapeHtml(main)
      + (it.content ? ' <span class="text-[10px] text-gray-400">· ' + escapeHtml(it.content) + '</span>' : '')
      + '</div>';
  }).join('');
  if (items.length > MAX_LINES) {
    html += '<div class="text-[10px] text-gray-400">외 ' + (items.length - MAX_LINES) + '건</div>';
  }
  return html;
}

// 착/선불 한글 변환 (shipping_payment: PREPAID/COLLECT, 레거시 COD)
function payTypeKo(v) {
  if (v === 'PREPAID') return '선불';
  if (v === 'COLLECT' || v === 'COD') return '착불';
  return v || '';
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

// P2: 법인 배지 (복수 법인 데이터가 로드된 전체모드에서만 표시)
function shipmentsEntityChips(grp) {
  if (!shipmentsMultiEntity) return '';
  var names = Object.keys(grp.entity_names || {});
  if (!names.length) return '';
  return names.map(function(n) {
    return ' <span style="background:#eef2ff;color:#4338ca;font-size:10px;padding:1px 5px;border-radius:8px;white-space:nowrap">' + escapeHtml(n) + '</span>';
  }).join('');
}

// P3(배송 후속): 합포장 묶음 배지 — 그룹 내 shipment들의 실효 대표(merged_into || 자신) 수렴 판정
function shipmentsMergeBadge(grp) {
  var withSp = (grp.shipments || []).filter(function(s) { return s.shipment_id; });
  if (withSp.length < 2) return '';
  var primaries = {};
  var mergedCnt = 0;
  withSp.forEach(function(s) {
    primaries[s.merged_into_id || s.shipment_id] = true;
    if (s.merged_into_id) mergedCnt++;
  });
  if (!mergedCnt) return '';
  var full = Object.keys(primaries).length === 1;
  var label = full ? '합포장 ' + withSp.length + '건' : '부분묶음';
  var bg = full ? '#dcfce7' : '#fef9c3';
  var fg = full ? '#15803d' : '#a16207';
  return ' <span style="background:' + bg + ';color:' + fg + ';font-size:10px;padding:1px 5px;border-radius:8px;white-space:nowrap" title="송장·라벨은 대표 출고 1건으로 관리됩니다"><i class="fas fa-link" style="font-size:9px"></i> ' + label + '</span>';
}

// ========== P2/P3: 합배송 후보 (법인 통합) + 합포장 묶음 ==========
var shipmentsConsolidation = { same_client: [], same_region: [] }; // P3: 버튼 onclick 인덱스 참조용

async function loadConsolidationCandidates(date) {
  var card = document.getElementById('consolidationCard');
  var body = document.getElementById('consolidationBody');
  var cnt = document.getElementById('consolidationCount');
  if (!card || !body) { console.warn('[shipments] #consolidationCard not found'); return; }
  try {
    var res = await axios.get('/api/shipments/consolidation-candidates?date=' + encodeURIComponent(date));
    var d = (res.data && res.data.success) ? (res.data.data || {}) : {};
    var sc = d.same_client || [];
    var sr = d.same_region || [];
    shipmentsConsolidation = { same_client: sc, same_region: sr };
    if (!sc.length && !sr.length) { card.classList.add('hidden'); return; }

    var html = '';
    sc.forEach(function(g, idx) {
      var parts = (g.orders || []).map(function(o) {
        // v2: 비당일 미출고 주문 = 대기 칩 (납품일 표기) — 납품일 달라도 묶기 가능
        var waitChip = o.waiting
          ? ' <span style="background:#fef3c7;color:#92400e;font-size:10px;padding:0 4px;border-radius:6px;white-space:nowrap">납품 ' + escapeHtml((o.delivery_date || '').substring(5)) + '</span>'
          : '';
        return '<span style="white-space:nowrap">' + escapeHtml(o.entity_name || ('법인' + o.entity_id)) + ' ' + escapeHtml(o.order_number || '') + ' (' + escapeHtml(o.delivery_method || '-') + ')' + waitChip + '</span>';
      });
      // P3: 묶음 상태별 액션 버튼
      var actionHtml = g.merged
        ? '<span class="text-xs" style="color:#15803d;white-space:nowrap"><i class="fas fa-check mr-1"></i>합포장됨</span> '
          + '<button onclick="unmergeConsolidation(' + idx + ')" class="px-2 py-0.5 text-xs border border-gray-300 text-gray-600 rounded hover:bg-gray-50">해제</button>'
        : '<button onclick="mergeConsolidation(' + idx + ')" class="px-2 py-0.5 text-xs bg-amber-600 text-white rounded hover:bg-amber-700"><i class="fas fa-box mr-1"></i>한 박스로 묶기</button>';
      html += '<div class="flex items-start gap-2">'
        + '<span style="background:#fef3c7;color:#92400e;font-size:11px;padding:2px 8px;border-radius:9999px;white-space:nowrap;flex-shrink:0">동일 거래처</span>'
        + '<div class="flex-1"><span class="font-medium">' + escapeHtml(g.client_name) + '</span> '
        + '<span class="text-gray-600">' + parts.join(' · ') + '</span></div>'
        + '<div class="flex items-center gap-2" style="flex-shrink:0">' + actionHtml + '</div>'
        + '</div>';
    });
    sr.forEach(function(g) {
      var parts = (g.orders || []).map(function(o) {
        return '<span style="white-space:nowrap">' + escapeHtml(o.client_name || '') + ' [' + escapeHtml(o.entity_name || ('법인' + o.entity_id)) + '·' + escapeHtml(o.delivery_method || '-') + ']</span>';
      });
      html += '<div class="flex items-start gap-2">'
        + '<span style="background:#dbeafe;color:#1e40af;font-size:11px;padding:2px 8px;border-radius:9999px;white-space:nowrap;flex-shrink:0">권역 ' + escapeHtml(g.postal_prefix || '') + '**</span>'
        + '<div><span class="text-gray-600">' + parts.join(' · ') + '</span> '
        + '<span class="text-xs text-blue-700">→ 동선 묶음 검토</span></div>'
        + '</div>';
    });
    body.innerHTML = html;
    if (cnt) cnt.textContent = '(거래처 ' + sc.length + ' · 권역 ' + sr.length + ')';
    card.classList.remove('hidden');
  } catch (e) {
    // 403(권한 미달) 등 — 본 화면과 무관하므로 조용히 숨김
    card.classList.add('hidden');
  }
}

// P3: 동일 거래처 합포장 묶기/해제
async function mergeConsolidation(idx) {
  var g = (shipmentsConsolidation.same_client || [])[idx];
  if (!g || !g.orders || !g.orders.length) return;
  var ids = g.orders.map(function(o) { return o.id; });
  // 운송수단·납품일 불일치 경고 (차단 아님 — 인지 후 진행)
  var mergeMethods = {}, mergeDates = {};
  g.orders.forEach(function(o) {
    if (o.delivery_method) mergeMethods[o.delivery_method] = true;
    if (o.delivery_date) mergeDates[o.delivery_date] = true;
  });
  var mergeWarns = [];
  if (Object.keys(mergeMethods).length > 1) {
    mergeWarns.push('⚠️ 운송수단이 서로 다릅니다: ' + Object.keys(mergeMethods).join(' / ') + '\n→ 묶으면 대표 주문의 운송수단 섹션으로 함께 표시됩니다.');
  }
  if (Object.keys(mergeDates).length > 1) {
    mergeWarns.push('⚠️ 납품일이 서로 다릅니다: ' + Object.keys(mergeDates).map(function(d) { return d.substring(5); }).join(' / ') + '\n→ 출고 확정 시 파트너 동반 출고 여부를 확인합니다.');
  }
  var mergeMsg = g.client_name + ' 주문 ' + ids.length + '건을 한 박스로 묶을까요?\n(송장번호·라벨은 대표 출고 1건으로 관리됩니다)';
  if (mergeWarns.length) mergeMsg += '\n\n' + mergeWarns.join('\n\n');
  if (!(await showConfirm(mergeMsg))) return;
  try {
    var res = await axios.post('/api/shipments/merge', { order_ids: ids });
    if (res.data.success) {
      showToast(res.data.message || '합포장 묶음 완료', 'success');
      loadShipmentsByDate();
    } else {
      showToast(res.data.error || '묶음 실패', 'error');
    }
  } catch (e) {
    showToast('묶음 실패: ' + ((e.response && e.response.data && e.response.data.error) || e.message), 'error');
  }
}

async function unmergeConsolidation(idx) {
  var g = (shipmentsConsolidation.same_client || [])[idx];
  if (!g || !g.orders || !g.orders.length) return;
  if (!(await showConfirm(g.client_name + ' 합포장을 해제할까요?'))) return;
  try {
    var res = await axios.post('/api/shipments/unmerge', { order_id: g.orders[0].id });
    if (res.data.success) {
      showToast(res.data.message || '합포장 해제 완료', 'success');
      loadShipmentsByDate();
    } else {
      showToast(res.data.error || '해제 실패', 'error');
    }
  } catch (e) {
    showToast('해제 실패: ' + ((e.response && e.response.data && e.response.data.error) || e.message), 'error');
  }
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
    var isChecked = selectedShipments['freight'] && selectedShipments['freight'].has(key);

    // 터미널: 항상 input으로 표시 (저장 버튼 별도)
    // ID 접두어 'f-' 사용: 대신화물 전용 (대신택배와 ID 충돌 방지)
    var terminalHtml = '<div class="flex items-center gap-1">'
      + '<input type="text" id="f-terminal-' + escapeHtml(key) + '" value="' + escapeHtml(grp.delivery_address) + '"'
      + ' placeholder="터미널명" class="ds-input px-2 py-1 text-xs w-24 border rounded">'
      + '<button onclick="saveTerminal(\'' + escapeHtml(key) + '\')" class="px-2 py-1 text-xs bg-gray-100 border rounded hover:bg-gray-200" title="거래처에 저장"><i class="fas fa-save"></i></button>'
      + '</div>';

    return '<tr class="border-t hover:bg-blue-50">'
      + '<td class="px-3 py-2 w-8 text-center"><input type="checkbox" id="cb-freight-' + escapeHtml(key) + '" ' + (isChecked ? 'checked' : '') + ' onchange="toggleShipmentCheck(\'freight\',\'' + escapeHtml(key) + '\',this.checked)" class="rounded"></td>'
      + '<td class="px-3 py-2 font-medium" title="' + escapeHtml(grp.client_name) + '">' + escapeHtml(grp.client_name) + shipmentsEntityChips(grp) + shipmentsMergeBadge(grp) + shipmentsWaitBadge(grp) + shipmentsCheckChip('freight', key, grp) + '</td>'
      + '<td class="px-3 py-2">' + terminalHtml + '</td>'
      + '<td class="px-3 py-2 text-xs text-gray-500 hidden md:table-cell">' + shipmentsItemDetailHtml(grp) + '</td>'
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
    var addr = grp.receiver_address;
    var isChecked = selectedShipments['daesintaekbae'] && selectedShipments['daesintaekbae'].has(key);

    // ID 접두어 'd-' 사용: 대신택배 전용 (대신화물과 ID 충돌 방지)
    return '<tr class="border-t hover:bg-green-50">'
      + '<td class="px-3 py-2 w-8 text-center"><input type="checkbox" id="cb-daesintaekbae-' + escapeHtml(key) + '" ' + (isChecked ? 'checked' : '') + ' onchange="toggleShipmentCheck(\'daesintaekbae\',\'' + escapeHtml(key) + '\',this.checked)" class="rounded"></td>'
      + '<td class="px-3 py-2 font-medium" title="' + escapeHtml(grp.client_name) + '">' + escapeHtml(grp.client_name) + shipmentsEntityChips(grp) + shipmentsMergeBadge(grp) + shipmentsWaitBadge(grp) + shipmentsCheckChip('daesintaekbae', key, grp) + '</td>'
      + '<td class="px-3 py-2 text-sm">'
      + '<input type="text" id="d-addr-' + escapeHtml(key) + '" value="' + escapeHtml(addr) + '"'
      + ' class="ds-input px-2 py-1 text-xs w-full border rounded" placeholder="배송주소">'
      + '</td>'
      + '<td class="px-3 py-2 text-xs text-gray-500 hidden md:table-cell">' + shipmentsItemDetailHtml(grp) + '</td>'
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
// 한진 대량등록(송장출력 요청) 엑셀 다운로드 — 선택(없으면 전체) 한진 출고 거래처
function downloadHanjinExcel() {
  var selected = selectedShipments['hanjin'];
  var keys = Object.keys(hanjinGroups);
  if (selected && selected.size > 0) keys = keys.filter(function(k) { return selected.has(k); });
  if (!keys.length) { showToast('한진 출고 건이 없습니다', 'warning'); return; }
  var date = document.getElementById('shipDate').value;
  var targets = keys.map(function(key) {
    var grp = hanjinGroups[key];
    return {
      client_id: grp.client_id,
      client_name: grp.client_name,
      phone: grp.mobile || grp.contact_phone || '',
      address: grp.receiver_address || grp.delivery_address || '',
      item: getItemSummaryText(grp)
    };
  });
  axios.post('/api/shipments/hanjin-export', { date: date, targets: targets }).then(function(res) {
    if (!res.data.success) { showToast(res.data.error || '엑셀 생성 실패', 'error'); return; }
    window.dsDownloadCsv('한진업로드_' + (date || '') + '.csv', res.data.data.csv);
    showToast(targets.length + '건 한진 업로드 엑셀 다운로드', 'success');
  }).catch(function(e) {
    showToast('엑셀 생성 오류: ' + (e.response && e.response.data ? e.response.data.error : e.message), 'error');
  });
}

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
      + '<td class="px-3 py-2 w-8 text-center"><input type="checkbox" id="cb-hanjin-' + escapeHtml(key) + '" ' + (isChecked ? 'checked' : '') + ' onchange="toggleShipmentCheck(\'hanjin\',\'' + escapeHtml(key) + '\',this.checked)" class="rounded"></td>'
      + '<td class="px-3 py-2 font-medium" title="' + escapeHtml(grp.client_name) + '">' + escapeHtml(grp.client_name) + shipmentsEntityChips(grp) + shipmentsMergeBadge(grp) + shipmentsWaitBadge(grp) + shipmentsCheckChip('hanjin', key, grp) + '</td>'
      + '<td class="px-3 py-2 text-sm text-gray-600 truncate" title="' + escapeHtml(addr || '') + '">' + escapeHtml(addr || '-') + '</td>'
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
      + '<td class="px-3 py-2 w-8 text-center"><input type="checkbox" id="cb-quick-' + escapeHtml(key) + '" ' + (isChecked ? 'checked' : '') + ' onchange="toggleShipmentCheck(\'quick\',\'' + escapeHtml(key) + '\',this.checked)" class="rounded"></td>'
      + '<td class="px-3 py-2 font-medium" title="' + escapeHtml(grp.client_name) + '">' + escapeHtml(grp.client_name) + shipmentsEntityChips(grp) + shipmentsMergeBadge(grp) + shipmentsWaitBadge(grp) + shipmentsCheckChip('quick', key, grp) + '</td>'
      + '<td class="px-3 py-2 text-sm text-gray-600 truncate" title="' + escapeHtml(grp.receiver_address || '') + '">' + escapeHtml(grp.receiver_address || '-') + '</td>'
      + '<td class="px-3 py-2 text-sm">' + escapeHtml(grp.contact_phone || '-') + '</td>'
      + '<td class="px-3 py-2 text-center">'
      + '<button onclick="printQuickGuide(\'' + escapeHtml(key) + '\')" class="px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 whitespace-nowrap">'
      + '<i class="fas fa-print mr-1"></i>안내용지</button>'
      + '</td>'
      + '</tr>';
  }).join('');
}

// --- 직배 (자사 기사 배송, 배송 후속 P2) ---
function renderJikbaeSection() {
  var tbody = document.getElementById('tbody-jikbae');
  if (!tbody) { console.warn('[shipments] #tbody-jikbae not found'); return; }
  var keys = Object.keys(jikbaeGroups);
  if (!keys.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="text-center py-8"><i class="fas fa-truck text-2xl mb-2 block text-gray-300"></i><div class="text-sm text-gray-400">출고 건 없음</div></td></tr>';
    return;
  }
  tbody.innerHTML = keys.map(function(key) {
    var grp = jikbaeGroups[key];
    var isChecked = selectedShipments['jikbae'] && selectedShipments['jikbae'].has(key);
    return '<tr class="border-t hover:bg-purple-50">'
      + '<td class="px-3 py-2 w-8 text-center"><input type="checkbox" id="cb-jikbae-' + escapeHtml(key) + '" ' + (isChecked ? 'checked' : '') + ' onchange="toggleShipmentCheck(\'jikbae\',\'' + escapeHtml(key) + '\',this.checked)" class="rounded"></td>'
      + '<td class="px-3 py-2 font-medium" title="' + escapeHtml(grp.client_name) + '">' + escapeHtml(grp.client_name) + shipmentsEntityChips(grp) + shipmentsMergeBadge(grp) + shipmentsWaitBadge(grp) + shipmentsCheckChip('jikbae', key, grp) + '</td>'
      + '<td class="px-3 py-2 text-sm text-gray-600 truncate" title="' + escapeHtml(grp.receiver_address || '') + '">' + escapeHtml(grp.receiver_address || '-') + '</td>'
      + '<td class="px-3 py-2 text-sm">' + escapeHtml(grp.contact_phone || grp.client_mobile || '-') + '</td>'
      + '<td class="px-3 py-2 text-sm text-center">' + escapeHtml(grp.delivery_time || '-') + '</td>'
      + '<td class="px-3 py-2 text-center">'
      + '<button onclick="printJikbaeGuide(\'' + escapeHtml(key) + '\')" class="px-3 py-1.5 text-xs bg-purple-600 text-white rounded hover:bg-purple-700 whitespace-nowrap">'
      + '<i class="fas fa-print mr-1"></i>안내용지</button>'
      + '</td>'
      + '</tr>';
  }).join('');
}

async function printJikbaeGuide(key) {
  var grp = jikbaeGroups[key];
  if (!grp) return;
  doPrint(buildQuickGuideHtml(grp.client_name, grp.receiver_address, grp.contact_phone || grp.client_mobile));
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
      + '<td class="px-3 py-2 font-medium" title="' + escapeHtml(grp.client_name) + '">' + escapeHtml(grp.client_name) + shipmentsEntityChips(grp) + shipmentsMergeBadge(grp) + shipmentsWaitBadge(grp) + '</td>'
      + '<td class="px-3 py-2 text-xs text-gray-500">' + escapeHtml(grp.delivery_type) + '</td>'
      + '<td class="px-3 py-2 text-xs text-gray-500">' + escapeHtml(grp.courier_name || '-') + '</td>'
      + '<td class="px-3 py-2 text-sm truncate" title="' + escapeHtml(grp.receiver_address || '') + '">' + escapeHtml(grp.receiver_address || '-') + '</td>'
      + '</tr>';
  }).join('');
}

// ========== 배지 업데이트 ==========
function updateBadges() {
  var fc = Object.keys(freightGroups).length;
  var dc = Object.keys(daesintaekbaeGroups).length;
  var hc = Object.keys(hanjinGroups).length;
  var qc = Object.keys(quickGroups).length;
  var jc = Object.keys(jikbaeGroups).length;
  document.getElementById('badgeFreight').textContent = '대신화물 ' + fc + '건';
  document.getElementById('badgeDaesintaekbae').textContent = '대신택배 ' + dc + '건';
  document.getElementById('badgeHanjin').textContent = '한진택배 ' + hc + '건';
  document.getElementById('badgeQuick').textContent = '퀵·용차 ' + qc + '건';
  var jb = document.getElementById('badgeJikbae');
  if (jb) jb.textContent = '직접배송 ' + jc + '건';
}

// ========== 저장 함수 ==========
async function saveShipmentCounts(shipmentIds, labelCount, boxCount, receiverAddress) {
  try {
    for (var i = 0; i < shipmentIds.length; i++) {
      var payload = {
        label_count: parseInt(labelCount) || 1,
        box_count: parseInt(boxCount) || 1
      };
      // P1: 라벨 인쇄 시 편집한 배송주소도 영속화 (기존엔 인쇄용으로만 읽고 유실)
      if (receiverAddress !== undefined && receiverAddress !== null) payload.receiver_address = receiverAddress;
      // by-order 라우트: 여기의 id는 주문 ID (shipment PK 오매칭 방지)
      await axios.patch('/api/shipments/by-order/' + shipmentIds[i], payload);
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
      // by-order 라우트: ids는 주문 ID (shipment PK 오매칭 방지)
      await axios.patch('/api/shipments/by-order/' + ids[i], { tracking_number: tracking });
    }
    // P1: 로컬 상태 동기 (재렌더 시 유지 — 서버 재조회 없이도 값 보존)
    grp.shipments.forEach(function(s) { s.tracking_number = tracking; });
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

  await saveShipmentCounts(getShipmentIds(grp), labelCount, boxCount, address);
  grp.receiver_address = address;

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
  // 선택된 거래처만 출력 (체크박스로 선택)
  var selected = selectedShipments[section] || new Set();
  var keys = Object.keys(map).filter(function(k) { return selected.has(k); });
  if (!keys.length) { showToast('라벨을 출력할 거래처를 선택해주세요.', 'warning'); return; }

  var allHtml = '';
  var prefix = section === 'freight' ? 'f-' : 'd-';
  for (var i = 0; i < keys.length; i++) {
    var key = keys[i];
    var grp = map[key];
    var lcEl = document.getElementById(prefix + 'lc-' + key);
    var bcEl = document.getElementById(prefix + 'bc-' + key);
    var labelCount = parseInt(lcEl ? lcEl.value : '1') || 1;
    var boxCount = parseInt(bcEl ? bcEl.value : '1') || 1;

    if (section === 'freight') {
      await saveShipmentCounts(getShipmentIds(grp), labelCount, boxCount);
      var termEl = document.getElementById('f-terminal-' + key);
      var terminal = termEl ? termEl.value.trim() : grp.delivery_address;
      allHtml += buildFreightLabelHtml(grp.client_name, terminal, labelCount);
    } else {
      var addrEl = document.getElementById('d-addr-' + key);
      var address = addrEl ? addrEl.value.trim() : grp.receiver_address;
      await saveShipmentCounts(getShipmentIds(grp), labelCount, boxCount, address);
      grp.receiver_address = address;
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

  // 합배송 파트너(미출고·비당일) 동반 출고 프롬프트 — 박스는 함께 나가는데 한쪽만 SHIPPED 되는 갭 방지.
  // 파트너가 미완성(하드게이트)·타법인이면 개별 차단 결과로 표시됨 (bulk-ship per-order skip).
  var partnerMap = {};
  keys.forEach(function(key) {
    groups[key].shipments.forEach(function(s) {
      (s.consolidate_partners || []).forEach(function(p) {
        if (!orderIds.has(p.id)) partnerMap[p.id] = p;
      });
    });
  });
  var pendingPartners = Object.keys(partnerMap).map(function(k) { return partnerMap[k]; });
  if (pendingPartners.length > 0) {
    var partnerList = pendingPartners.map(function(p) {
      return '· ' + (p.entity_name ? p.entity_name + ' ' : '') + (p.order_number || ('#' + p.id))
        + (p.delivery_date ? ' (납품 ' + String(p.delivery_date).substring(5) + ')' : '');
    }).join('\n');
    if (await showConfirm('합배송으로 묶인 미출고 주문 ' + pendingPartners.length + '건이 있습니다:\n' + partnerList + '\n\n함께 출고 확정하시겠습니까?')) {
      pendingPartners.forEach(function(p) { orderIds.add(p.id); });
    } else {
      if (!(await showConfirm('합배송 파트너를 제외하고 이 화면의 주문만 출고합니다.\n(박스가 실제로 함께 나갔다면 파트너 주문도 별도 출고 처리가 필요합니다)\n\n계속하시겠습니까?'))) return;
    }
  }

  // v2 소프트 게이트: 미검수 라인 경고 (검수 없이도 진행 가능 — 확인만)
  var uncheckedOrders = 0, uncheckedLines = 0;
  keys.forEach(function(key) {
    groups[key].shipments.forEach(function(s) {
      var lineCount = (s.items || []).length;
      if (!lineCount) return;
      var un = Math.max(0, lineCount - (s.chk_done || 0));
      if (un > 0) { uncheckedOrders++; uncheckedLines += un; }
    });
  });
  // 갭4: 동반출고로 추가된 화면 밖 파트너의 미검수 라인도 합산 (chk_done/line_total = /daily 파트너 필드)
  pendingPartners.forEach(function(p) {
    if (!orderIds.has(p.id)) return;
    var un = Math.max(0, (p.line_total || 0) - (p.chk_done || 0));
    if (un > 0) { uncheckedOrders++; uncheckedLines += un; }
  });
  var confirmMsg = orderIds.size + '건 주문을 출고 확정하시겠습니까?\n(전량 출고 원칙 — 미완성 카드가 있는 주문은 차단됩니다)';
  if (uncheckedOrders > 0) {
    confirmMsg += '\n\n⚠️ 미검수 라인 ' + uncheckedLines + '개(주문 ' + uncheckedOrders + '건)가 있습니다. 검수 없이 출고합니다.';
  }
  if (!(await showConfirm(confirmMsg))) return;

  try {
    var res = await axios.patch('/api/orders/bulk-ship', { order_ids: Array.from(orderIds) });
    if (res.data.success) {
      var results = res.data.data || [];
      var shipped = results.filter(function(r) { return r.order_shipped; }).length;
      var blocked = results.filter(function(r) { return !r.success; });
      var msg = shipped + '건 출고 완료';
      if (blocked.length > 0) {
        msg += ', ' + blocked.length + '건 차단';
        showToast(msg, 'warning');
        showShipBlockedModal(blocked);
      } else {
        showToast(msg, 'success');
      }
      loadShipmentsByDate();
    }
  } catch(err) {
    showToast('출고 처리 실패: ' + (err.response?.data?.error || err.message), 'error');
  }
}

// v2 하드 게이트 차단 결과 모달 — 주문별 사유 + 미완성 카드 목록
function showShipBlockedModal(blocked) {
  var existing = document.getElementById('shipBlockedOverlay');
  if (existing) existing.remove();

  // 주문 id → 표시 정보 (로드된 그룹에서 역조회)
  function findOrderInfo(orderId) {
    var maps = [freightGroups, daesintaekbaeGroups, hanjinGroups, quickGroups, jikbaeGroups, etcGroups];
    for (var i = 0; i < maps.length; i++) {
      var gkeys = Object.keys(maps[i]);
      for (var k = 0; k < gkeys.length; k++) {
        var grp = maps[i][gkeys[k]];
        for (var s = 0; s < grp.shipments.length; s++) {
          if (grp.shipments[s].id === orderId) return { client: grp.client_name, number: grp.shipments[s].order_number || ('#' + orderId) };
        }
      }
    }
    return { client: '', number: '#' + orderId };
  }

  var rows = blocked.map(function(r) {
    var info = findOrderInfo(r.id);
    var cards = (r.unshipped_cards || []).map(function(cd) { return (cd.card_number || cd.id) + '(' + (cd.status ? window.MES_STATUS.cardLabel(cd.status) : '-') + ')'; }).join(', ');
    return '<tr class="border-t border-gray-100">'
      + '<td class="px-3 py-2 text-sm">' + escapeHtml(info.client) + '</td>'
      + '<td class="px-3 py-2 text-sm">' + escapeHtml(info.number) + '</td>'
      + '<td class="px-3 py-2 text-sm text-red-600">' + escapeHtml(r.error || '차단') + (cards ? '<div class="text-xs text-gray-500 mt-0.5">' + escapeHtml(cards) + '</div>' : '') + '</td>'
      + '</tr>';
  }).join('');

  var html = '<div id="shipBlockedOverlay" class="fixed inset-0 bg-black/40 ds-z-stack flex items-center justify-center p-4">'
    + '<div class="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col">'
    + '<div class="px-5 py-4 border-b flex items-center justify-between">'
    + '<h3 class="text-base font-semibold text-red-700"><i class="fas fa-ban mr-1"></i>출고 차단 ' + blocked.length + '건 — 전량 출고 원칙</h3>'
    + '<button id="shipBlockedClose" class="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>'
    + '</div>'
    + '<div class="px-5 py-2 text-xs text-gray-500">미완성 카드가 남은 주문은 출고할 수 없습니다. 생산 완료 후 다시 확정하세요.</div>'
    + '<div class="px-5 pb-3 overflow-y-auto flex-1"><table class="w-full text-left"><thead><tr class="text-xs text-gray-500">'
    + '<th class="px-3 py-1">거래처</th><th class="px-3 py-1">주문번호</th><th class="px-3 py-1">사유</th>'
    + '</tr></thead><tbody>' + rows + '</tbody></table></div>'
    + '<div class="px-5 py-3 border-t flex justify-end"><button id="shipBlockedDismiss" class="ds-btn text-sm">닫기</button></div>'
    + '</div></div>';
  document.body.insertAdjacentHTML('beforeend', html);
  var overlay = document.getElementById('shipBlockedOverlay');
  if (!overlay) { console.warn('[shipments] #shipBlockedOverlay not found'); return; }
  function close() { overlay.remove(); }
  var c1 = document.getElementById('shipBlockedClose'); if (c1) c1.addEventListener('click', close);
  var c2 = document.getElementById('shipBlockedDismiss'); if (c2) c2.addEventListener('click', close);
  overlay.addEventListener('click', function(e) { if (e.target === overlay) close(); });
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

      // 착/선불 (shipping_payment 필드) — 한글 표기
      var payType = payTypeKo(grp.shipping_payment);

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
  var map = { freight: freightGroups, daesintaekbae: daesintaekbaeGroups, hanjin: hanjinGroups, quick: quickGroups, jikbae: jikbaeGroups, etc: etcGroups };
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

  // 기본 메시지(폴백) — 먼저 설정. 아래 fillShipTemplateSelect가 템플릿 자동선택 시
  // onShipTemplateChange로 '실제 등록 템플릿 본문'을 덮어써 항상 템플릿과 일치하도록 한다.
  document.getElementById('shipSendContent').value = getDefaultShipmentMessage(section, groups, selected);

  // 템플릿 로드 (카카오톡용) — 로드/자동선택 후 실제 템플릿 본문이 우선 적용됨
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

  var modal = document.getElementById('shipmentSendModal');
  modal.classList.remove('hidden');
  modal.onclick = function(e) {
    if (e.target === modal) closeShipmentSendModal();
  };
}

function getDefaultShipmentMessage(section, groups, selected) {
  // 폴백 본문(템플릿 로드 전/직접작성용). 알림톡 발송 시엔 fillShipTemplateSelect가
  // 실제 등록 템플릿(대신화물 출고/대신택배 출고/방문 수령 준비 완료) 본문으로 덮어쓴다.
  // 변수는 #{} 그대로 두고 서버 resolveMsg가 치환.
  if (section === 'freight') {
    return '#{고객명}님, 동산기획입니다.\n\n주문하신 제품이 발송되었습니다.\n\n■ 품목: #{품목}\n■ 배송: 대신화물\n■ 터미널: #{터미널}\n■ 출고일: #{날짜}\n\n문의: 042-523-1982';
  } else if (section === 'hanjin') {
    return '#{고객명}님, 동산기획입니다.\n\n주문하신 제품이 발송되었습니다.\n\n■ 품목: #{품목}\n■ 배송: 한진택배\n■ 송장번호: #{송장번호}\n■ 출고일: #{날짜}\n\n문의: 042-523-1982';
  } else if (section === 'daesintaekbae') {
    return '#{고객명}님, 동산기획입니다.\n\n주문하신 제품이 발송되었습니다.\n\n■ 품목: #{품목}\n■ 배송: 대신택배\n■ 출고일: #{날짜}\n\n문의: 042-523-1982';
  } else if (section === 'quick') {
    return '#{고객명}님, 동산기획입니다.\n\n주문하신 제품이 출고 준비 완료되었습니다.\n방문 수령 가능합니다.\n\n■ 품목: #{품목}\n■ 출고일: #{날짜}\n\n문의: 042-523-1982';
  }
  return '#{고객명}님, 동산기획입니다.\n\n주문하신 제품이 출고되었습니다.\n\n■ 출고일: #{날짜}\n\n문의: 042-523-1982';
}

async function fillShipTemplateSelect() {
  var sel = document.getElementById('shipTemplateSelect');
  sel.innerHTML = '<option value="">직접 작성</option>' + shipTemplatesCache.map(function(t) {
    return '<option value="' + escapeHtml(t.templateCode) + '">' + escapeHtml(t.templateName) + '</option>';
  }).join('');

  // 발송 위치별 기본 템플릿 — DB(kakao_template_defaults)에서 resolve (출고 섹션=match_key).
  // 관리자 설정(/settings)에서 변경 가능. 한진 등 미설정 섹션은 자동선택 없음(수동).
  try {
    var r = await axios.get('/api/kakao/template-defaults/resolve', { params: { context: 'shipments', key: shipSendSection } });
    var autoCode = (r.data && r.data.data && r.data.data.template_code) || '';
    if (autoCode) {
      sel.value = autoCode;
      onShipTemplateChange();  // 선택 템플릿 본문을 메시지에 반영
    }
  } catch (e) { /* 기본값 없으면 수동 선택 */ }
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
      var d = res.data.data || {};
      var status = d.status || 'SUCCESS';
      if (status === 'SUCCESS') {
        showToast(((d.sent_count != null) ? d.sent_count : targets.length) + '건 발송 완료', 'success');
        closeShipmentSendModal();
        // 해당 섹션 체크 해제
        selectedShipments[shipSendSection] = new Set();
        updateSendButton(shipSendSection);
      } else {
        // #378: 부분/전량 실패 → 결과 모달(성공N/실패M + 실패목록 + 실패건 재발송)
        closeShipmentSendModal();
        showShipmentSendResult(d, payload);
      }
    } else {
      showToast(res.data.error || '발송 실패', 'error');
    }
  } catch(e) {
    showToast('발송 오류: ' + (e.response && e.response.data ? e.response.data.error : e.message), 'error');
  }
}

// #378: 일괄 발송 결과 모달 (성공/실패 집계 + 실패 목록 + 실패 건만 재발송)
function showShipmentSendResult(d, originalPayload) {
  var total = (d.total != null) ? d.total : ((d.sent_count || 0) + (d.fail_count || 0));
  var ok = d.sent_count || 0;
  var fail = d.fail_count || 0;
  var failures = d.failures || [];
  var existing = document.getElementById('shipSendResultOverlay');
  if (existing) existing.remove();

  var rows = failures.map(function(f) {
    return '<tr class="border-t border-gray-100">'
      + '<td class="px-3 py-2 text-sm">' + escapeHtml(f.client_name || '-') + '</td>'
      + '<td class="px-3 py-2 text-sm">' + escapeHtml(f.mobile || '-') + '</td>'
      + '<td class="px-3 py-2 text-sm text-red-600">' + escapeHtml(f.reason || '발송 실패') + '</td>'
      + '</tr>';
  }).join('');

  var statusColor = (fail === 0) ? 'text-green-600' : (ok === 0 ? 'text-red-600' : 'text-amber-600');
  var listHtml = failures.length
    ? ('<div class="px-5 overflow-y-auto flex-1"><table class="w-full text-left"><thead><tr class="text-xs text-gray-500">'
        + '<th class="px-3 py-1">거래처</th><th class="px-3 py-1">수신번호</th><th class="px-3 py-1">사유</th>'
        + '</tr></thead><tbody>' + rows + '</tbody></table></div>')
    : '';
  var resendBtnHtml = (fail > 0)
    ? '<button id="shipSendResultResend" class="ds-btn ds-btn-primary text-sm">실패 ' + fail + '건 재발송</button>'
    : '';

  var html = '<div id="shipSendResultOverlay" class="fixed inset-0 bg-black/40 ds-z-stack flex items-center justify-center p-4">'
    + '<div class="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col">'
    + '<div class="px-5 py-4 border-b flex items-center justify-between">'
    + '<h3 class="text-base font-semibold">발송 결과</h3>'
    + '<button id="shipSendResultClose" class="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>'
    + '</div>'
    + '<div class="px-5 py-3 text-sm font-medium ' + statusColor + '">성공 ' + ok + '건 / 실패 ' + fail + '건 (총 ' + total + '건)</div>'
    + listHtml
    + '<div class="px-5 py-4 border-t flex justify-end gap-2">' + resendBtnHtml
    + '<button id="shipSendResultDismiss" class="ds-btn text-sm">닫기</button></div>'
    + '</div></div>';
  document.body.insertAdjacentHTML('beforeend', html);

  var overlay = document.getElementById('shipSendResultOverlay');
  if (!overlay) { console.warn('[shipments] #shipSendResultOverlay not found'); return; }
  function close() { if (overlay) overlay.remove(); }
  var closeBtn = document.getElementById('shipSendResultClose'); if (closeBtn) closeBtn.addEventListener('click', close);
  var dismissBtn = document.getElementById('shipSendResultDismiss'); if (dismissBtn) dismissBtn.addEventListener('click', close);
  overlay.addEventListener('click', function(e) { if (e.target === overlay) close(); });

  var resendBtn = document.getElementById('shipSendResultResend');
  if (resendBtn) resendBtn.addEventListener('click', async function() {
    var failKeys = {};
    failures.forEach(function(f) { failKeys[(f.client_name || '') + '|' + (f.mobile || '')] = true; });
    var retryTargets = (originalPayload.targets || []).filter(function(t) {
      return failKeys[(t.client_name || '') + '|' + (t.mobile || '')];
    });
    if (retryTargets.length === 0) { showToast('재발송 대상이 없습니다', 'warning'); return; }
    resendBtn.disabled = true; resendBtn.textContent = '재발송 중...';
    try {
      var retryPayload = Object.assign({}, originalPayload, { targets: retryTargets });
      var res = await axios.post('/api/kakao/send-shipment-bulk', retryPayload);
      close();
      if (res.data.success) {
        var rd = res.data.data || {};
        if ((rd.status || 'SUCCESS') === 'SUCCESS') {
          showToast(retryTargets.length + '건 재발송 완료', 'success');
        } else {
          showShipmentSendResult(rd, retryPayload);
        }
      } else {
        showToast(res.data.error || '재발송 실패', 'error');
      }
    } catch (e) {
      resendBtn.disabled = false; resendBtn.textContent = '실패 ' + fail + '건 재발송';
      showToast('재발송 오류: ' + (e.response && e.response.data ? e.response.data.error : e.message), 'error');
    }
  });
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

    var today = (window.kstToday ? window.kstToday() : new Date().toISOString().split('T')[0]);
    tbody.innerHTML = orders.map(function(o) {
      var isOverdue = o.auto_complete_date <= today;
      var statusHtml = isOverdue
        ? '<span class="ds-badge ds-badge-green text-xs">동기화 가능</span>'
        : '<span class="ds-badge ds-badge-blue text-xs">배송 중</span>';
      return '<tr class="hover:bg-gray-50">'
        + '<td class="px-3 py-2 text-sm font-medium">' + escapeHtml(o.order_number) + '</td>'
        + '<td class="px-3 py-2 text-sm" title="' + escapeHtml(o.client_name || '') + '">' + escapeHtml(o.client_name) + '</td>'
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

// ========== 출고관리 v2: 포장 검수 + 합배송 대기 배지 + 명세서 ==========

// 합배송 대기 배지 — 예약(0438)·묶음 상대의 납품일이 이 화면 날짜보다 미래면 보류 표시
function shipmentsWaitBadge(grp) {
  var maxDate = '';
  (grp.shipments || []).forEach(function(s) {
    var pd = s.consolidate_partner_pending_date || '';
    if (pd && pd > currentDate && pd > maxDate) maxDate = pd;
  });
  if (!maxDate) return '';
  return ' <span style="background:#fff7ed;color:#c2410c;border:1px solid #fdba74;font-size:10px;padding:1px 5px;border-radius:8px;white-space:nowrap" title="합배송 상대 주문의 납품일까지 보류 권장 (묶어서 함께 출고)"><i class="fas fa-hourglass-half" style="font-size:9px"></i> 합배송 대기 →' + escapeHtml(maxDate.substring(5)) + '</span>';
}

// 검수 진행 칩 — 클릭 시 검수 모달. 회색=미시작 / 황색=진행 / 녹색=완료
function shipmentsCheckChip(section, key, grp) {
  var total = 0, done = 0;
  (grp.shipments || []).forEach(function(s) {
    total += (s.items || []).length;
    done += (s.chk_done || 0);
  });
  if (!total) return '';
  var full = done >= total;
  var bg = full ? '#dcfce7' : (done > 0 ? '#fef9c3' : '#f3f4f6');
  var fg = full ? '#15803d' : (done > 0 ? '#a16207' : '#6b7280');
  var label = (full ? '✓ ' : '') + done + '/' + total;
  return ' <button onclick="openShipCheckModal(\'' + section + '\',\'' + escapeHtml(key) + '\')" style="background:' + bg + ';color:' + fg + ';font-size:10px;padding:1px 6px;border-radius:8px;white-space:nowrap;border:1px solid rgba(0,0,0,0.06);cursor:pointer" title="포장 검수 체크리스트 열기"><i class="fas fa-clipboard-check" style="font-size:9px"></i> 검수 ' + label + '</button>';
}

// ---- 검수 모달 ----
var shipCheckState = { section: '', key: '', clientName: '', entries: [] };

async function openShipCheckModal(section, key) {
  var grp = getSectionGroups(section)[key];
  if (!grp) return;
  var modal = document.getElementById('shipCheckModal');
  var body = document.getElementById('shipCheckBody');
  var nameEl = document.getElementById('shipCheckClientName');
  if (!modal || !body) { console.warn('[shipments] #shipCheckModal not found'); return; }

  shipCheckState = { section: section, key: key, clientName: grp.client_name, entries: [] };
  if (nameEl) nameEl.textContent = grp.client_name;
  body.innerHTML = '<div class="text-center text-gray-400 py-8"><i class="fas fa-spinner fa-spin mr-1"></i>검수 정보 로딩 중...</div>';
  modal.classList.remove('hidden');
  modal.onclick = function(e) { if (e.target === modal) closeShipCheckModal(); };

  try {
    var orderIds = [];
    (grp.shipments || []).forEach(function(s) { if (s.id && orderIds.indexOf(s.id) < 0) orderIds.push(s.id); });
    var resList = await Promise.all(orderIds.map(function(oid) {
      return axios.get('/api/shipments/checklist/by-order/' + oid);
    }));
    shipCheckState.entries = resList.map(function(r) { return r.data && r.data.success ? r.data.data : null; }).filter(Boolean);

    // 갭4: 합포장 파트너 합류 — 응답 group에서 화면 밖 주문을 찾아 검수에 포함.
    // 자법인=라인 합류(편집 가능), 타법인=by-order가 entityFilter 404 → 읽기전용 표기만.
    var scLoaded = {};
    shipCheckState.entries.forEach(function(en) { scLoaded[en.order.id] = 1; });
    var scPartnerMap = {};
    shipCheckState.entries.forEach(function(en) {
      (en.group || []).forEach(function(g) {
        if (g.order_id && !scLoaded[g.order_id] && !scPartnerMap[g.order_id]) scPartnerMap[g.order_id] = g;
      });
    });
    shipCheckState.partnersReadonly = [];
    var scPartnerIds = Object.keys(scPartnerMap);
    if (scPartnerIds.length > 0) {
      var pres = await Promise.all(scPartnerIds.map(function(oid) {
        return axios.get('/api/shipments/checklist/by-order/' + oid).catch(function() { return null; });
      }));
      pres.forEach(function(r, i) {
        var g = scPartnerMap[scPartnerIds[i]];
        if (r && r.data && r.data.success) {
          var pen = r.data.data;
          pen._offscreen = true;
          shipCheckState.entries.push(pen);
        } else {
          shipCheckState.partnersReadonly.push(g);
        }
      });
    }

    shipCheckState.entries.forEach(function(en) {
      (en.lines || []).forEach(function(ln) {
        ln._checked = !!ln.checked_at;
        ln._partial = ln.packed_quantity != null;
      });
    });
    renderShipCheckModal();
  } catch (e) {
    body.innerHTML = '<div class="text-center text-red-500 py-8">검수 정보 로드 실패: ' + escapeHtml((e.response && e.response.data && e.response.data.error) || e.message || '') + '</div>';
  }
}

function shipCheckLineSpec(ln) {
  if (ln.specification) return ln.specification;
  if (ln.width && ln.height) return ln.width + 'x' + ln.height;
  return '';
}

function renderShipCheckModal() {
  var body = document.getElementById('shipCheckBody');
  if (!body) return;
  var html = '';
  // 갭4: 합포장 배너 — 묶음 전체(파트너 포함)가 한 박스로 나감을 명시
  var scReadonly = shipCheckState.partnersReadonly || [];
  var scIsMerged = scReadonly.length > 0 || shipCheckState.entries.some(function(en) { return en._offscreen || (en.group || []).length > 1; });
  if (scIsMerged) {
    var scGroupSize = shipCheckState.entries.length + scReadonly.length;
    html += '<div class="mb-3 px-3 py-2 rounded-lg text-sm" style="background:#eff6ff;border:1px solid #bfdbfe;color:#1d4ed8">'
      + '<i class="fas fa-boxes-stacked mr-1"></i>합포장 묶음 — 주문 ' + scGroupSize + '건이 한 박스로 나갑니다. 검수도 묶음 전체 기준으로 확인하세요.';
    if (scReadonly.length > 0) {
      html += '<div class="mt-1 text-xs" style="color:#1e40af">'
        + scReadonly.map(function(g) {
            var prog = (g.line_total || g.chk_total) ? (' 검수 ' + (g.chk_done || 0) + '/' + (g.line_total || g.chk_total)) : '';
            return '· ' + (g.entity_name ? escapeHtml(g.entity_name) + ' ' : '') + escapeHtml(g.order_number || ('#' + g.order_id)) + prog + ' <span class="text-gray-400">(타법인 — 해당 법인에서 검수)</span>';
          }).join('<br>')
        + '</div>';
    }
    html += '</div>';
  }
  shipCheckState.entries.forEach(function(en, ei) {
    var lines = en.lines || [];
    var done = lines.filter(function(l) { return l._checked; }).length;
    var shippedBadge = en.order && en.order.shipped_at ? ' <span class="ds-badge ds-badge-blue text-xs">출고됨</span>' : '';
    var partnerBadge = en._offscreen
      ? ' <span class="text-xs px-1.5 py-0.5 rounded" style="background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe" title="합포장으로 묶인 화면 밖 주문 — 함께 검수">합포장 파트너' + (en.order.entity_name ? ' · ' + escapeHtml(en.order.entity_name) : '') + '</span>'
      : '';
    html += '<div class="mb-4 border rounded-lg overflow-hidden">'
      + '<div class="flex items-center justify-between px-3 py-2 bg-gray-50 border-b">'
      + '<div class="font-semibold text-gray-700">' + escapeHtml(en.order.order_number || ('#' + en.order.id)) + shippedBadge + partnerBadge
      + ' <span class="text-xs font-normal text-gray-500">납품 ' + escapeHtml(en.order.delivery_date || '-') + ' · ' + escapeHtml(en.order.delivery_method || '-') + '</span></div>'
      + '<div class="flex items-center gap-2">'
      + '<span id="scCnt-' + ei + '" class="text-xs ' + (done >= lines.length && lines.length ? 'text-green-600 font-semibold' : 'text-gray-500') + '">' + done + '/' + lines.length + '</span>'
      + '<button onclick="shipCheckAll(' + ei + ')" class="px-2 py-0.5 text-xs border border-gray-300 rounded hover:bg-gray-100">전체 체크</button>'
      + '</div></div>'
      + '<table class="w-full text-sm"><thead><tr class="text-xs text-gray-500 bg-gray-50">'
      + '<th class="px-2 py-1 text-center" style="width:36px">담음</th>'
      + '<th class="px-2 py-1 text-left">품목</th>'
      + '<th class="px-2 py-1 text-left" style="width:110px">규격</th>'
      + '<th class="px-2 py-1 text-center" style="width:70px">수량</th>'
      + '<th class="px-2 py-1 text-center" style="width:110px">부분(예외)</th>'
      + '</tr></thead><tbody>';
    lines.forEach(function(ln, li) {
      var pqHtml = ln._partial
        ? '<input type="number" id="sc-pq-' + ei + '-' + li + '" value="' + (ln.packed_quantity != null ? ln.packed_quantity : (ln.quantity || '')) + '" min="0" step="any"'
          + ' oninput="shipCheckSetQty(' + ei + ',' + li + ',this.value)" class="ds-input w-16 px-1 py-0.5 text-center text-xs border rounded">'
          + ' <button onclick="shipCheckTogglePartial(' + ei + ',' + li + ')" class="text-xs text-gray-400 hover:text-gray-600" title="전량으로 되돌리기">&times;</button>'
        : '<button onclick="shipCheckTogglePartial(' + ei + ',' + li + ')" class="px-2 py-0.5 text-xs text-gray-400 border border-dashed border-gray-300 rounded hover:text-amber-600 hover:border-amber-400" title="일부만 담는 예외 수량 입력">부분</button>';
      html += '<tr class="border-t ' + (ln._checked ? 'bg-green-50' : '') + '">'
        + '<td class="px-2 py-1.5 text-center"><input type="checkbox" ' + (ln._checked ? 'checked' : '') + ' onchange="toggleShipCheckLine(' + ei + ',' + li + ',this.checked)" class="rounded" style="width:16px;height:16px"></td>'
        + '<td class="px-2 py-1.5" title="' + escapeHtml(ln.item_name || '') + '">' + escapeHtml(ln.item_name || '-')
        + (ln.content ? ' <span class="text-xs text-gray-400">' + escapeHtml(ln.content) + '</span>' : '') + '</td>'
        + '<td class="px-2 py-1.5 text-xs text-gray-500">' + escapeHtml(shipCheckLineSpec(ln) || '-') + '</td>'
        + '<td class="px-2 py-1.5 text-center">' + (ln.quantity || 0) + (ln.unit ? ' ' + escapeHtml(ln.unit) : '') + '</td>'
        + '<td class="px-2 py-1.5 text-center">' + pqHtml + '</td>'
        + '</tr>';
    });
    html += '</tbody></table></div>';
  });
  if (!html) html = '<div class="text-center text-gray-400 py-8">검수할 라인이 없습니다.</div>';
  body.innerHTML = html;
}

function toggleShipCheckLine(ei, li, checked) {
  var en = shipCheckState.entries[ei];
  if (!en || !en.lines[li]) return;
  en.lines[li]._checked = checked;
  var done = en.lines.filter(function(l) { return l._checked; }).length;
  var cnt = document.getElementById('scCnt-' + ei);
  if (cnt) {
    cnt.textContent = done + '/' + en.lines.length;
    cnt.className = 'text-xs ' + (done >= en.lines.length ? 'text-green-600 font-semibold' : 'text-gray-500');
  }
}

function shipCheckAll(ei) {
  var en = shipCheckState.entries[ei];
  if (!en) return;
  en.lines.forEach(function(l) { l._checked = true; });
  renderShipCheckModal();
}

function shipCheckTogglePartial(ei, li) {
  var en = shipCheckState.entries[ei];
  if (!en || !en.lines[li]) return;
  var ln = en.lines[li];
  ln._partial = !ln._partial;
  if (!ln._partial) ln.packed_quantity = null;
  else if (ln.packed_quantity == null) ln.packed_quantity = ln.quantity || 0;
  renderShipCheckModal();
}

function shipCheckSetQty(ei, li, val) {
  var en = shipCheckState.entries[ei];
  if (!en || !en.lines[li]) return;
  var n = parseFloat(val);
  en.lines[li].packed_quantity = isNaN(n) ? null : n;
}

async function saveShipCheckModal() {
  if (!shipCheckState.entries.length) { closeShipCheckModal(); return; }
  try {
    for (var i = 0; i < shipCheckState.entries.length; i++) {
      var en = shipCheckState.entries[i];
      var items = (en.lines || []).map(function(ln) {
        return {
          order_item_id: ln.order_item_id,
          checked: !!ln._checked,
          packed_quantity: ln._partial && ln.packed_quantity != null ? ln.packed_quantity : null
        };
      });
      if (items.length) await axios.patch('/api/shipments/checklist/' + en.shipment_id, { items: items });
    }
    showToast('검수 저장 완료', 'success');
    closeShipCheckModal();
    loadShipmentsByDate(); // 칩/집계 갱신
  } catch (e) {
    showToast('검수 저장 실패: ' + ((e.response && e.response.data && e.response.data.error) || e.message), 'error');
  }
}

function closeShipCheckModal() {
  var modal = document.getElementById('shipCheckModal');
  if (modal) modal.classList.add('hidden');
}

// ---- 명세서 인쇄 (A4) ----
function shipDoPrintA4(html, orientation) {
  var listArea = document.getElementById('printListArea');
  if (!listArea) { showToast('인쇄 영역을 찾을 수 없습니다.', 'error'); return; }
  listArea.innerHTML = html;
  document.body.classList.add('print-list-mode');
  var pageStyle = document.createElement('style');
  pageStyle.id = 'printListPageStyle';
  pageStyle.textContent = '@page { size: A4 ' + (orientation || 'portrait') + '; margin: 12mm; }';
  document.head.appendChild(pageStyle);
  setTimeout(function() {
    window.print();
    document.body.classList.remove('print-list-mode');
    listArea.innerHTML = '';
    var ps = document.getElementById('printListPageStyle');
    if (ps) ps.remove();
  }, 100);
}

async function shipQrDataUrl(text) {
  try {
    if (typeof QRCode === 'undefined') return null;
    return await QRCode.toDataURL(text, { width: 96, margin: 1 });
  } catch (e) { return null; }
}

// 검수 체크지 — 포장대 내부용 (체크박스 + QR → /pack 모바일 검수 직행)
async function printShipCheckSheet() {
  var entries = shipCheckState.entries;
  if (!entries.length) { showToast('인쇄할 검수 정보가 없습니다.', 'warning'); return; }
  var html = '<div style="font-family:Malgun Gothic,sans-serif;">';
  for (var i = 0; i < entries.length; i++) {
    var en = entries[i];
    var qr = await shipQrDataUrl(location.origin + '/pack?order=' + en.order.id);
    html += '<div class="list-section" style="page-break-after:' + (i < entries.length - 1 ? 'always' : 'auto') + '">'
      + '<div class="list-header"><h2>포장 검수 체크지</h2><span class="list-date">' + escapeHtml(currentDate) + '</span></div>'
      + '<table style="margin-bottom:8px"><tbody>'
      + '<tr><td style="width:15%;background:#f0f0f0;font-weight:bold">거래처</td><td style="width:45%">' + escapeHtml(shipCheckState.clientName) + '</td>'
      + '<td rowspan="3" style="width:40%;text-align:center;vertical-align:middle">' + (qr ? '<img src="' + qr + '" style="width:26mm;height:26mm"><div style="font-size:8pt;color:#666">모바일 검수 QR</div>' : '') + '</td></tr>'
      + '<tr><td style="background:#f0f0f0;font-weight:bold">주문번호</td><td>' + escapeHtml(en.order.order_number || ('#' + en.order.id)) + '</td></tr>'
      + '<tr><td style="background:#f0f0f0;font-weight:bold">납품일 / 배송</td><td>' + escapeHtml(en.order.delivery_date || '-') + ' / ' + escapeHtml(en.order.delivery_method || '-') + '</td></tr>'
      + '</tbody></table>'
      + '<table><thead><tr>'
      + '<th style="width:8%;text-align:center">확인</th><th style="width:42%">품목</th><th style="width:18%">규격</th><th style="width:10%;text-align:center">수량</th><th style="width:22%">비고</th>'
      + '</tr></thead><tbody>';
    (en.lines || []).forEach(function(ln) {
      html += '<tr>'
        + '<td style="text-align:center;font-size:14pt">' + (ln._checked ? '☑' : '☐') + '</td>'
        + '<td>' + escapeHtml(ln.item_name || '-') + (ln.content ? ' <span style="color:#888;font-size:8pt">' + escapeHtml(ln.content) + '</span>' : '') + '</td>'
        + '<td>' + escapeHtml(shipCheckLineSpec(ln) || '-') + '</td>'
        + '<td style="text-align:center;font-weight:bold">' + (ln.quantity || 0) + (ln.unit ? ' ' + escapeHtml(ln.unit) : '') + '</td>'
        + '<td style="height:8mm"></td>'
        + '</tr>';
    });
    html += '</tbody></table>'
      + '<div style="margin-top:10mm;display:flex;justify-content:flex-end;gap:20mm;font-size:10pt">'
      + '<span>검수자: ______________</span><span>확인: ______________</span></div>'
      + '</div>';
  }
  html += '</div>';
  shipDoPrintA4(html, 'portrait');
}

// 납품명세서 — 박스 동봉 거래처용 (가격 제외). 복수 주문이면 합배송 통합 명세서(주문별 구분+소계).
function printShipDeliveryNote() {
  var entries = shipCheckState.entries;
  if (!entries.length) { showToast('인쇄할 명세 정보가 없습니다.', 'warning'); return; }
  var isMulti = entries.length > 1;
  var supplier = (entries[0].order && entries[0].order.entity_name) || '';
  var html = '<div style="font-family:Malgun Gothic,sans-serif;">'
    + '<div class="list-header"><h2>납품명세서' + (isMulti ? ' <span style="font-size:10pt;color:#92400e">(합배송 ' + entries.length + '건 동봉)</span>' : '') + '</h2>'
    + '<span class="list-date">' + escapeHtml(currentDate) + '</span></div>'
    + '<table style="margin-bottom:10px"><tbody>'
    + '<tr><td style="width:15%;background:#f0f0f0;font-weight:bold">받는 곳</td><td style="width:45%">' + escapeHtml(shipCheckState.clientName) + '</td>'
    + '<td style="width:15%;background:#f0f0f0;font-weight:bold">공급</td><td>' + escapeHtml(supplier || '-') + '</td></tr>'
    + '</tbody></table>';
  var grandQty = 0;
  entries.forEach(function(en) {
    var subQty = 0;
    if (isMulti) {
      html += '<h3 style="font-size:11pt;font-weight:bold;margin:10px 0 4px;border-left:4px solid #92400e;padding-left:6px">'
        + escapeHtml(en.order.order_number || ('#' + en.order.id)) + ' <span style="font-weight:normal;color:#666;font-size:9pt">납품 ' + escapeHtml(en.order.delivery_date || '-') + '</span></h3>';
    }
    html += '<table style="margin-bottom:6px"><thead><tr>'
      + '<th style="width:6%;text-align:center">No</th><th style="width:46%">품목</th><th style="width:20%">규격</th><th style="width:12%;text-align:center">수량</th><th style="width:16%">비고</th>'
      + '</tr></thead><tbody>';
    (en.lines || []).forEach(function(ln, idx) {
      var q = (ln.packed_quantity != null ? ln.packed_quantity : ln.quantity) || 0;
      subQty += q; grandQty += q;
      html += '<tr>'
        + '<td style="text-align:center">' + (idx + 1) + '</td>'
        + '<td>' + escapeHtml(ln.item_name || '-') + '</td>'
        + '<td>' + escapeHtml(shipCheckLineSpec(ln) || '-') + '</td>'
        + '<td style="text-align:center">' + q + (ln.unit ? ' ' + escapeHtml(ln.unit) : '') + '</td>'
        + '<td>' + escapeHtml(ln.content || '') + '</td>'
        + '</tr>';
    });
    if (isMulti) {
      html += '<tr><td colspan="3" style="text-align:right;background:#fafafa;font-weight:bold">소계</td>'
        + '<td style="text-align:center;background:#fafafa;font-weight:bold">' + subQty + '</td><td style="background:#fafafa"></td></tr>';
    }
    html += '</tbody></table>';
  });
  html += '<table><tbody><tr><td style="width:72%;text-align:right;background:#f0f0f0;font-weight:bold">총 수량</td>'
    + '<td style="width:12%;text-align:center;font-weight:bold">' + grandQty + '</td><td style="width:16%"></td></tr></tbody></table>'
    + '<div style="margin-top:8mm;font-size:10pt;color:#333">위와 같이 납품합니다. 수량을 확인해 주세요.</div>'
    + '</div>';
  shipDoPrintA4(html, 'portrait');
}

// ========== 초기화 ==========
initDatePicker();
loadShipmentsByDate();
loadInTransitOrders();

/* ── 출고 이력 탭 ───────────────────────────────────────────────────────────
 * 설계 = docs/specs/2026-08-09-shipment-history-list.md
 *
 * 정본은 주문 출고완료(orders.status='SHIPPED')다. shipments 테이블은 prod 0건이라 쓰지 않는다.
 * 조회도 /api/orders 를 그대로 쓴다 — 전용 엔드포인트를 만들면 조회조건이 또 두 벌이 되고,
 * 목록 UX 감사에서 계속 잡아온 그 문제(카드≠목록, CSV≠화면)를 새로 만드는 셈이다.
 */
var histCurrentPage = 1;
var histToolbarMounted = false;
var histPresetApplied = false;

// 기본 조회 기간 = 최근 1개월 (주문 목록과 동일 규칙)
function shipHistDefaultFrom() {
  var t = (window.kstToday ? window.kstToday() : new Date().toISOString().slice(0, 10)).split('-');
  var d = new Date(parseInt(t[0]), parseInt(t[1]) - 1, parseInt(t[2]));
  d.setMonth(d.getMonth() - 1);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

// ── 조회조건 SSOT (클라) — 서버 정본 = routes/orders/listFilter.ts ──
function histReadFilters() {
  var g = function(id) { var el = document.getElementById(id); return el ? el.value : ''; };
  return {
    dateFrom: g('histDateFrom'),
    dateTo: g('histDateTo'),
    search: g('histSearch'),
    method: g('histMethod'),
    sort: 'ship_date_desc'
  };
}

function histBuildParams(f) {
  var p = new URLSearchParams();
  p.append('status', 'SHIPPED');          // 이력 = 출고완료 주문
  p.append('exclude_vouchers', '1');      // 기초채권·법인간미러 전표는 출고가 아니다
  if (f.dateFrom) p.append('ship_date_from', f.dateFrom);
  if (f.dateTo) p.append('ship_date_to', f.dateTo);
  if (f.search) p.append('search', f.search);
  if (f.method) p.append('delivery_method', f.method);
  return p;
}

function histRenderChips(f, summary) {
  var items = [];
  if (f.dateFrom || f.dateTo) {
    var label = f.dateFrom && f.dateTo ? ('출고일 ' + f.dateFrom + ' ~ ' + f.dateTo)
              : f.dateFrom ? ('출고일 ' + f.dateFrom + ' 이후')
              : ('출고일 ' + f.dateTo + ' 이전');
    items.push({ label: label, onClear: function() {
      document.getElementById('histDateFrom').value = '';
      document.getElementById('histDateTo').value = '';
      loadShipHistory(1);
    } });
  } else {
    items.push({ label: '전체 기간', tone: 'static' });
  }
  if (f.search) items.push({ label: '검색 "' + f.search + '"', onClear: function() { document.getElementById('histSearch').value = ''; loadShipHistory(1); } });
  if (f.method) items.push({ label: '배송 ' + f.method, onClear: function() { document.getElementById('histMethod').value = ''; loadShipHistory(1); } });
  items.push({ label: '출고완료만', tone: 'static' });

  // 숫자가 이상해 보이는 이유를 화면이 스스로 말하게 한다 (합계 바의 '공급가 미기재' 알림과 같은 방식)
  if (summary && summary.voucher_excluded > 0) {
    items.push({ label: '회계 전표 ' + Number(summary.voucher_excluded).toLocaleString() + '건 제외', tone: 'static' });
  }
  if (summary && summary.ship_date_missing > 0) {
    items.push({ label: '출고일 미기록 ' + Number(summary.ship_date_missing).toLocaleString() + '건 포함 (주문일로 대체)', tone: 'warn' });
  }
  window.dsListUx.renderChips('histFilterChips', items);
}

function histRenderSummary(summary, pagination) {
  if (!summary) { window.dsListUx.renderSummary('histSummaryBar', null); return; }
  window.dsListUx.renderSummary('histSummaryBar', [
    { label: '건수', value: summary.count },
    { label: '수량', value: summary.quantity },
    { label: '공급가', value: summary.supply_amount, format: 'won' },
    { label: '부가세', value: summary.vat_amount, format: 'won' },
    { label: '합계', value: summary.final_amount, format: 'won', strong: true }
  ], {
    multiPage: !!(pagination && pagination.total_pages > 1),
    note: window.dsAmountBreakdownNote ? window.dsAmountBreakdownNote(summary) : ''
  });
}

function histRenderPagination(p) {
  var el = document.getElementById('histPagination');
  if (!el) { console.warn('[shipHistory] #histPagination not found'); return; }
  if (!p || p.total_pages <= 1) { el.innerHTML = ''; return; }
  var btn = 'padding:6px 14px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;cursor:pointer;background:#fff;';
  var dis = 'padding:6px 14px;border:1px solid #e5e7eb;border-radius:6px;font-size:13px;cursor:not-allowed;background:#f9fafb;color:#9ca3af;';
  var nums = '';
  var start = Math.max(1, p.page - 2);
  var end = Math.min(p.total_pages, start + 4);
  for (var i = start; i <= end; i++) {
    var active = i === p.page
      ? 'padding:6px 12px;border:1px solid #2563eb;border-radius:6px;font-size:13px;cursor:pointer;background:#2563eb;color:#fff;font-weight:600;'
      : btn;
    nums += '<button onclick="loadShipHistory(' + i + ')" style="' + active + '">' + i + '</button>';
  }
  el.innerHTML =
      '<button onclick="loadShipHistory(' + (p.page - 1) + ')" ' + (p.page <= 1 ? 'disabled' : '') + ' style="' + (p.page <= 1 ? dis : btn) + '">이전</button>'
    + nums
    + '<button onclick="loadShipHistory(' + (p.page + 1) + ')" ' + (p.page >= p.total_pages ? 'disabled' : '') + ' style="' + (p.page >= p.total_pages ? dis : btn) + '">다음</button>'
    + '<span style="font-size:13px;color:#6b7280;margin-left:8px;">' + p.page + ' / ' + p.total_pages + ' 페이지</span>';
}

function histRenderRows(rows) {
  var tbody = document.getElementById('histTableBody');
  if (!tbody) { console.warn('[shipHistory] #histTableBody not found'); return; }
  if (!rows || rows.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" class="text-center py-12">'
      + '<i class="fas fa-inbox text-3xl mb-3 block text-gray-300"></i>'
      + '<div class="text-sm text-gray-500">해당 기간의 출고 이력이 없습니다.</div></td></tr>';
    return;
  }
  tbody.innerHTML = rows.map(function(o) {
    // 출고일: shipped_at 이 정본. 없으면 주문일로 대체하되 그 사실을 배지로 드러낸다.
    var shipped = o.shipped_at ? String(o.shipped_at).slice(0, 10) : '';
    var shipCell = shipped
      ? shipped
      : ((o.order_date || '-') + ' <span class="ds-cond ds-cond-warn" style="padding:1px 5px;font-size:10px">주문일 대체</span>');

    var spec = (o.main_item_width && o.main_item_height)
      ? ' <span class="text-xs text-gray-500">[' + o.main_item_width + '×' + o.main_item_height + ']</span>' : '';
    var more = o.item_count > 1 ? ' <span class="text-xs text-gray-400">외 ' + (o.item_count - 1) + '건</span>' : '';
    var itemCell = (o.main_item_name ? escapeHtml(o.main_item_name) : '<span class="text-gray-400">-</span>') + spec + more;

    // 합배송 배지 — 주문 목록과 같은 규칙(대표/자식). 이력에서 묶음을 한 줄로 합치지 않는다.
    var consBadge = '';
    if (o.consolidation_child_count > 0) {
      consBadge = ' <span class="px-1.5 py-0.5 text-[10px] rounded font-bold" style="background:#ecfeff;color:#0e7490" title="' + escapeHtml(o.consolidation_child_numbers || '') + '">합배송 +' + o.consolidation_child_count + '</span>';
    } else if (o.consolidate_root_number) {
      consBadge = ' <span class="px-1.5 py-0.5 text-[10px] rounded" style="background:#f1f5f9;color:#475569" title="대표 주문 ' + escapeHtml(o.consolidate_root_number) + '">합배송 자식</span>';
    }

    // ⚠️ getBillingStatus* 는 orders.js 전용이라 여기서 부르면 ReferenceError 다 — 로컬 맵을 쓴다
    var billLabel = { BILLED: '회계반영', PAID: '수금완료' }[o.billing_status] || o.billing_status;
    var billClass = o.billing_status === 'PAID' ? 'ds-badge ds-badge-green' : 'ds-badge ds-badge-gray';
    var billing = o.billing_status
      ? '<span class="px-2 py-0.5 text-xs rounded-full ' + billClass + '">' + escapeHtml(billLabel) + '</span>'
      : '<span class="text-xs text-gray-400">-</span>';

    return '<tr class="cursor-pointer" ondblclick="window.location.href=\'/orders?search=' + encodeURIComponent(o.order_number || '') + '\'">'
      + '<td class="hist-date">' + shipCell + '</td>'
      + '<td class="font-medium">' + escapeHtml(o.order_number || '-') + consBadge + '</td>'
      + '<td>' + escapeHtml(o.client_name || '-') + '</td>'
      + '<td>' + itemCell + '</td>'
      + '<td>' + escapeHtml(o.delivery_method || '-') + '</td>'
      + '<td>' + (o.delivery_date || '-') + '</td>'
      + '<td style="text-align:right">' + (Number(o.final_amount) || 0).toLocaleString() + '원</td>'
      + '<td style="text-align:center">' + billing + '</td>'
      + '</tr>';
  }).join('');
}

async function loadShipHistory(page) {
  histCurrentPage = page || 1;
  var f = histReadFilters();
  var params = histBuildParams(f);
  params.append('sort', f.sort);
  params.append('page', String(histCurrentPage));
  params.append('limit', String(window.dsListToolbar ? window.dsListToolbar.pageSize('ship-history', 50) : 50));

  histRenderChips(f, null);   // 조건 표시는 응답을 기다리지 않는다

  var tbody = document.getElementById('histTableBody');
  if (tbody && window.dsSkeleton) tbody.innerHTML = window.dsSkeleton.loadingRow(8);

  try {
    var res = await axios.get('/api/orders?' + params.toString());
    if (!res.data.success) throw new Error(res.data.error || '조회 실패');
    histRenderRows(res.data.data || []);
    histRenderPagination(res.data.pagination);
    histRenderSummary(res.data.summary, res.data.pagination);
    histRenderChips(f, res.data.summary);   // 결측·제외 건수는 응답을 받아야 알 수 있다
  } catch (e) {
    console.error('loadShipHistory error:', e);
    if (tbody) tbody.innerHTML = '<tr><td colspan="8" class="px-4 py-8 text-center text-red-500">불러오기 실패: ' + escapeHtml(e.message || '') + '</td></tr>';
  }
}

function resetShipHistoryFilters() {
  var setVal = function(id, v) { var el = document.getElementById(id); if (el) el.value = v; };
  setVal('histDateFrom', shipHistDefaultFrom());
  setVal('histDateTo', '');
  setVal('histSearch', '');
  setVal('histMethod', '');
  loadShipHistory(1);
}

function histApplyFilters(f) {
  if (!f) return;
  var setVal = function(id, v) { var el = document.getElementById(id); if (el) el.value = (v == null ? '' : v); };
  setVal('histDateFrom', f.dateFrom);
  setVal('histDateTo', f.dateTo);
  setVal('histSearch', f.search);
  setVal('histMethod', f.method);
  histPresetApplied = true;
  loadShipHistory(1);
}

// 탭 최초 진입 시 1회 — 표가 hidden 이면 열 선택이 thead 를 읽지 못한다(입고·세금계산서에서 겪은 함정)
window.initShipHistory = function() {
  if (histToolbarMounted) return;
  histToolbarMounted = true;

  var from = document.getElementById('histDateFrom');
  if (from && !from.value) from.value = shipHistDefaultFrom();

  var m = window.dsListToolbar && window.dsListToolbar.mount({
    pageKey: 'ship-history',
    container: 'histListToolbar',
    tableSelector: '.hist-tbl',
    defaultPageSize: 50,
    getFilters: function() { return histReadFilters(); },
    applyFilters: function(f) { histApplyFilters(f); },
    onChange: function() { loadShipHistory(1); }
  });
  if (m && m.then) m.then(function() { if (!histPresetApplied) loadShipHistory(1); });
  else loadShipHistory(1);
};
