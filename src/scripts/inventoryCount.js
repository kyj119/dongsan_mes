// ===== 재고실사 페이지 스크립트 =====
var countsList = [];
var _detailCountId = null;

// ===== 상태 뱃지 =====
function getStatusBadge(status) {
  if (status === 'DRAFT') return '<span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;background:#e0e7ff;color:#4f46e5;">작성중</span>';
  if (status === 'SUBMITTED') return '<span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;background:#fef9c3;color:#a16207;">제출됨</span>';
  if (status === 'APPROVED') return '<span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;background:#dcfce7;color:#15803d;">승인됨</span>';
  return '<span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;background:#f3f4f6;color:#666;">기타</span>';
}

// ===== 요약 업데이트 =====
function updateSummary() {
  var total = countsList.length;
  var inProgress = countsList.filter(function(c) { return c.status === 'DRAFT' || c.status === 'SUBMITTED'; }).length;
  var lastCount = countsList.length > 0 ? countsList[0].count_date : '-';

  document.getElementById('totalCounts').textContent = total;
  document.getElementById('inProgressCounts').textContent = inProgress;
  document.getElementById('lastCountDate').textContent = lastCount;
}

// ===== 테이블 렌더 =====
function renderTable(list) {
  var tbody = document.getElementById('countBody');
  if (!list || list.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:32px;color:#9ca3af;font-size:14px;">실사 기록이 없습니다.</td></tr>';
    return;
  }

  tbody.innerHTML = list.map(function(c) {
    var badge = getStatusBadge(c.status);
    var submittedBy = c.submitted_by || '-';
    return '<tr style="cursor:pointer;transition:background 0.15s;" onmouseover="this.style.background=\'#f8fafc\'" onmouseout="this.style.background=\'\'" onclick="openDetail(' + c.id + ')">'
      + '<td style="padding:10px 12px;font-family:monospace;font-weight:600;">' + escapeHtml(c.count_number) + '</td>'
      + '<td style="padding:10px 12px;text-align:center;font-size:13px;">' + (c.count_date || '') + '</td>'
      + '<td style="padding:10px 12px;text-align:center;font-size:13px;">' + (c.count_type === 'FULL' ? '전수' : '정기') + '</td>'
      + '<td style="padding:10px 12px;text-align:center;">' + badge + '</td>'
      + '<td style="padding:10px 12px;text-align:center;color:#666;font-size:13px;">-</td>'
      + '<td style="padding:10px 12px;text-align:center;font-size:12px;color:#666;">' + escapeHtml(submittedBy) + '</td>'
      + '<td style="padding:10px 12px;text-align:center;"><a href="javascript:" onclick="event.stopPropagation(); openDetail(' + c.id + ')" style="color:#3b82f6;font-size:13px;text-decoration:none;">열기</a></td>'
      + '</tr>';
  }).join('');
}

// ===== 데이터 로드 =====
async function loadCounts() {
  document.getElementById('countBody').innerHTML = '<tr><td colspan="7" style="text-align:center;padding:32px;color:#9ca3af;"><i class="fas fa-spinner fa-spin"></i> 로딩 중...</td></tr>';

  try {
    var statusVal = document.getElementById('fStatus').value;
    var params = new URLSearchParams({ limit: '100' });
    if (statusVal) params.append('status', statusVal);

    var res = await axios.get('/api/inventory-counts?' + params.toString());
    countsList = (res.data.data || []);

    renderTable(countsList);
    updateSummary();
  } catch (e) {
    var msg = (e.response && e.response.data && e.response.data.error) ? e.response.data.error : e.message;
    document.getElementById('countBody').innerHTML = '<tr><td colspan="7" style="text-align:center;padding:32px;color:#ef4444;">오류: ' + escapeHtml(msg) + '</td></tr>';
  }
}

// ===== 새 실사 생성 (전체/카테��리별) =====
async function createNewCount() {
  // 카테고리 선택 다이얼로그
  var categories = [];
  try {
    var catRes = await axios.get('/api/inventory/meta/categories');
    if (catRes.data.success) categories = catRes.data.data.categories || [];
  } catch(e) {}

  var opts = '<option value="">전체 실사 (모든 품목)</option>';
  categories.forEach(function(c) {
    opts += '<option value="' + c.category + '">' + c.category + ' (' + c.item_count + '건)</option>';
  });

  var modalHtml = '<div id="countCreateModal" style="position:fixed;inset:0;background:rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;z-index:9999">'
    + '<div style="background:#fff;border-radius:12px;padding:24px;width:360px;box-shadow:0 20px 60px rgba(0,0,0,0.2)">'
    + '<h3 style="font-size:16px;font-weight:700;margin-bottom:16px">새 재고 실사</h3>'
    + '<label style="font-size:12px;color:#6b7280;margin-bottom:4px;display:block">실사 범위</label>'
    + '<select id="countCategory" style="width:100%;padding:8px 12px;border:1px solid #d1d5db;border-radius:8px;margin-bottom:12px">' + opts + '</select>'
    + '<label style="font-size:12px;color:#6b7280;margin-bottom:4px;display:block">메모 (선택)</label>'
    + '<input id="countNotes" type="text" placeholder="예: 월말 정기 실���" style="width:100%;padding:8px 12px;border:1px solid #d1d5db;border-radius:8px;margin-bottom:16px">'
    + '<div style="display:flex;gap:8px;justify-content:flex-end">'
    + '<button onclick="document.getElementById(\'countCreateModal\').remove()" style="padding:8px 16px;border:1px solid #d1d5db;border-radius:8px;background:#fff;cursor:pointer">취소</button>'
    + '<button onclick="submitNewCount()" style="padding:8px 16px;border:none;border-radius:8px;background:#2563eb;color:#fff;font-weight:600;cursor:pointer">생성</button>'
    + '</div></div></div>';

  document.body.insertAdjacentHTML('beforeend', modalHtml);
}

async function submitNewCount() {
  var category = document.getElementById('countCategory').value;
  var notes = document.getElementById('countNotes').value;
  var modal = document.getElementById('countCreateModal');

  try {
    var res = await axios.post('/api/inventory-counts', {
      count_type: category ? 'PERIODIC' : 'FULL',
      category: category || '',
      notes: notes
    });

    if (res.data.success) {
      if (modal) modal.remove();
      var label = category ? '[' + category + '] ' : '[전체] ';
      showToast(label + '실��� 생성됨: ' + res.data.data.count_number + ' (' + (res.data.data.item_count || '?') + '건)', 'success');
      _detailCountId = res.data.data.id;
      loadDetailCount(_detailCountId);
      loadCounts();
    }
  } catch (e) {
    var msg = (e.response && e.response.data && e.response.data.error) ? e.response.data.error : e.message;
    showToast('생성 실패: ' + msg, 'error');
  }
}

// ===== 상세 패널 로드 =====
async function loadDetailCount(countId) {
  _detailCountId = countId;
  var panel = document.getElementById('detailPanel');
  panel.classList.remove('hidden');
  panel.style.display = 'flex';

  var count = countsList.find(function(c) { return c.id === countId; });
  if (count) {
    document.getElementById('panelCountNumber').textContent = count.count_number;
    document.getElementById('panelCountDate').textContent = count.count_date;
    document.getElementById('panelStatusBadge').innerHTML = getStatusBadge(count.status);
  }

  document.getElementById('panelItems').innerHTML = '<div style="text-align:center;padding:16px;color:#9ca3af;"><i class="fas fa-spinner fa-spin"></i></div>';

  try {
    var res = await axios.get('/api/inventory-counts/' + countId);
    var data = res.data.data || {};

    // 입력 완료율 표시
    var totalCount = (data.items || []).length;
    var filledCount = (data.items || []).filter(function(it) { return it.counted_quantity !== null && it.counted_quantity !== undefined; }).length;
    var progressEl = document.getElementById('panelProgress');
    if (progressEl) {
      if (totalCount > 0) {
        progressEl.innerHTML = '<span style="font-size:12px;color:#6b7280">입력: </span><span style="font-size:12px;font-weight:700;color:' + (filledCount === totalCount ? '#16a34a' : '#2563eb') + '">' + filledCount + '/' + totalCount + '</span>';
      } else {
        progressEl.innerHTML = '';
      }
    }

    if (!data.items || data.items.length === 0) {
      document.getElementById('panelItems').innerHTML = '<div style="color:#9ca3af;font-size:13px;padding:8px 0;">품목 없음</div>';
    } else {
      var itemsHtml = data.items.map(function(item) {
        var systemQty = parseFloat(item.system_quantity) || 0;
        var countedQty = parseFloat(item.counted_quantity) || 0;
        var diff = item.difference || 0;
        var diffPct = item.difference_pct || 0;

        var varClass = '';
        if (Math.abs(diffPct) >= 20) varClass = 'variance-danger';
        else if (Math.abs(diffPct) >= 10) varClass = 'variance-warning';

        return '<div style="padding:10px;border:1px solid #f1f5f9;border-radius:4px;margin-bottom:8px;">'
          + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">'
            + '<div style="font-weight:500;font-size:13px;">' + escapeHtml(item.item_name || item.item_code || '') + '</div>'
            + (varClass ? '<span style="font-size:10px;padding:2px 6px;border-radius:3px;background:#fee2e2;color:#dc2626;" class="' + varClass + '">' + diffPct.toFixed(1) + '%</span>' : '')
          + '</div>'
          + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:12px;color:#666;">'
            + '<div>시스템: <strong>' + systemQty.toLocaleString() + '</strong> ' + (item.unit || 'YD') + '</div>'
            + '<div>실사: <input type="number" value="' + countedQty + '" style="width:60px;padding:4px;border:1px solid #ddd;border-radius:3px;font-size:12px;" onchange="updateItemCount(' + item.id + ', this.value, ' + item.count_id + ')" /></div>'
          + '</div>'
          + (item.notes ? '<div style="font-size:11px;color:#9ca3af;margin-top:6px;padding-top:6px;border-top:1px solid #f1f5f9;"><strong>메모:</strong> ' + escapeHtml(item.notes) + '</div>' : '')
        + '</div>';
      }).join('');

      document.getElementById('panelItems').innerHTML = itemsHtml;
    }

    // 액션 버튼 렌더
    renderDetailActions(data.status);

  } catch (e) {
    var errMsg = (e.response && e.response.data && e.response.data.error) ? e.response.data.error : e.message;
    document.getElementById('panelItems').innerHTML = '<div style="color:#ef4444;font-size:13px;">로드 실패: ' + escapeHtml(errMsg) + '</div>';
  }
}

function renderDetailActions(status) {
  var actionsEl = document.getElementById('panelActions');

  if (status === 'DRAFT') {
    actionsEl.innerHTML = ''
      + '<button onclick="submitCount(' + _detailCountId + ')" class="ds-btn ds-btn-primary" style="background:#3b82f6;">'
        + '<i class="fas fa-check" style="margin-right:4px"></i>제출'
      + '</button>'
      + '<button onclick="closeDetailPanel()" class="ds-btn ds-btn-secondary">'
        + '<i class="fas fa-times" style="margin-right:4px"></i>닫기'
      + '</button>';
  } else if (status === 'SUBMITTED') {
    actionsEl.innerHTML = ''
      + '<button onclick="approveCount(' + _detailCountId + ')" class="ds-btn ds-btn-primary" style="background:#16a34a;">'
        + '<i class="fas fa-check-double" style="margin-right:4px"></i>승인'
      + '</button>'
      + '<button onclick="closeDetailPanel()" class="ds-btn ds-btn-secondary">'
        + '<i class="fas fa-times" style="margin-right:4px"></i>닫기'
      + '</button>';
  } else {
    actionsEl.innerHTML = '<button onclick="closeDetailPanel()" class="ds-btn ds-btn-secondary" style="grid-column:1/-1;">'
      + '<i class="fas fa-times" style="margin-right:4px"></i>닫기'
    + '</button>';
  }
}

async function updateItemCount(itemId, countedQty, countId) {
  try {
    var items = [{ id: itemId, counted_quantity: parseFloat(countedQty), system_quantity: 0 }];
    var res = await axios.get('/api/inventory-counts/' + countId);
    var existingItem = (res.data.data.items || []).find(function(i) { return i.id === itemId; });
    if (existingItem) items[0].system_quantity = existingItem.system_quantity;

    await axios.put('/api/inventory-counts/' + countId + '/items', { items: items });
  } catch (e) {
    showToast('업데이트 실패', 'error');
  }
}

async function submitCount(countId) {
  if (!(await showConfirm('이 실사를 제출하시겠습니까?'))) return;
  try {
    var res = await axios.patch('/api/inventory-counts/' + countId + '/submit');
    if (res.data.success) {
      showToast('제출됨', 'success');
      loadCounts();
      loadDetailCount(countId);
    }
  } catch (e) {
    var msg = (e.response && e.response.data && e.response.data.error) ? e.response.data.error : e.message;
    showToast('제출 실패: ' + msg, 'error');
  }
}

async function approveCount(countId) {
  if (!(await showConfirm('이 실사를 승인하시겠습니까? 재고가 실사 수량으로 보정됩니다.', { danger: true }))) return;
  try {
    var res = await axios.patch('/api/inventory-counts/' + countId + '/approve');
    if (res.data.success) {
      showToast('승인됨', 'success');
      loadCounts();
      loadDetailCount(countId);
    }
  } catch (e) {
    var msg = (e.response && e.response.data && e.response.data.error) ? e.response.data.error : e.message;
    showToast('승인 실패: ' + msg, 'error');
  }
}

function openDetail(countId) {
  loadDetailCount(countId);
}

function closeDetailPanel() {
  var panel = document.getElementById('detailPanel');
  panel.classList.add('hidden');
  panel.style.display = 'none';
  _detailCountId = null;
}

document.addEventListener('click', function(e) {
  if (_detailCountId !== null && !e.target.closest('#detailPanel') && !e.target.closest('#countBody')) {
    closeDetailPanel();
  }
});

// ===== 필터 이벤트 바인딩 =====
document.getElementById('fStatus').addEventListener('change', loadCounts);

// ===== 초기 로드 =====
loadCounts();
