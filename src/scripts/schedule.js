// Skeleton loading
(function() {
  var el = document.getElementById('unassignedCards');
  if (el && window.dsSkeleton) el.innerHTML = dsSkeleton.cards(4);
  var el2 = document.getElementById('equipmentColumns');
  if (el2 && window.dsSkeleton) el2.innerHTML = dsSkeleton.cards(3);
})();

// ── 유틸 ──
function getUrgencyInfo(deliveryDate) {
  if (!deliveryDate) return { class: '', label: '' };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(deliveryDate);
  due.setHours(0, 0, 0, 0);
  const diff = Math.ceil((due - today) / (1000 * 60 * 60 * 24));

  if (diff < 0) return { class: 'border-l-4 border-red-500 bg-red-50', label: `D+${Math.abs(diff)}`, badge: 'bg-red-600 text-white' };
  if (diff === 0) return { class: 'border-l-4 border-red-400 bg-red-50', label: 'D-Day', badge: 'bg-red-500 text-white' };
  if (diff === 1) return { class: 'border-l-4 border-orange-400 bg-orange-50', label: 'D-1', badge: 'bg-orange-500 text-white' };
  if (diff <= 3) return { class: 'border-l-4 border-amber-400', label: `D-${diff}`, badge: 'bg-amber-500 text-white' };
  return { class: '', label: `D-${diff}`, badge: 'bg-gray-200 text-gray-700' };
}

function formatDate(d) {
  if (!d) return '-';
  return d.substring(5, 10); // MM-DD
}

// ── 상태 변수 ──
var draggedCard = null;
var draggedFromEquipment = null;

// ── 카드 HTML 생성 ──
function renderCard(card) {
  const urgency = getUrgencyInfo(card.delivery_date);
  const ripBadge = card.rip_status === 'QUEUED' ? '<span class="text-[10px] bg-blue-50 text-blue-700 px-1 rounded">QUEUED</span>'
    : card.rip_status === 'SENT' ? '<span class="text-[10px] bg-green-50 text-green-700 px-1 rounded">SENT</span>'
    : '';

  return `
    <div class="schedule-card bg-white rounded shadow-sm p-2 cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow ${urgency.class}"
         draggable="true" data-card-id="${card.id}" data-priority="${card.priority || 0}">
      <div class="flex items-center justify-between mb-1">
        <span class="text-[11px] font-mono text-gray-500">${escapeHtml(card.card_number)}</span>
        <span class="text-[10px] px-1.5 py-0.5 rounded ${urgency.badge}">${urgency.label}</span>
      </div>
      <div class="text-xs font-medium text-gray-800 truncate" title="${escapeHtml(card.client_name)}">${escapeHtml(card.client_name)}</div>
      <div class="text-[11px] text-gray-500 truncate" title="${escapeHtml(card.item_name)}">${escapeHtml(card.item_name)}</div>
      <div class="flex items-center justify-between mt-1">
        <span class="text-[10px] text-gray-400">${escapeHtml(card.category_name || '')}</span>
        <div class="flex items-center gap-1">
          ${ripBadge}
          <span class="text-[10px] text-gray-400">${formatDate(card.delivery_date)}</span>
        </div>
      </div>
      <div class="flex items-center justify-between mt-1">
        <span class="text-[10px] text-gray-400">P:${card.priority || 0}</span>
        <div class="flex gap-1">
          <button onclick="event.stopPropagation(); changePriority(${card.id}, 1)" class="text-[10px] text-gray-400 hover:text-blue-600 px-1" title="우선순위 올리기">
            <i class="fas fa-arrow-up"></i>
          </button>
          <button onclick="event.stopPropagation(); changePriority(${card.id}, -1)" class="text-[10px] text-gray-400 hover:text-blue-600 px-1" title="우선순위 내리기">
            <i class="fas fa-arrow-down"></i>
          </button>
        </div>
      </div>
    </div>
  `;
}

// ── 장비 칼럼 생성 ──
function renderEquipmentColumn(eq) {
  const statusColors = {
    RUNNING: 'bg-green-50 text-green-700',
    IDLE: 'bg-gray-100 text-gray-600',
    MAINTENANCE: 'bg-amber-50 text-amber-700',
    BROKEN: 'bg-red-50 text-red-700'
  };
  const statusLabels = { RUNNING: '가동중', IDLE: '대기', MAINTENANCE: '정비중', BROKEN: '고장' };
  const statusClass = statusColors[eq.equipment_status] || statusColors.IDLE;
  const statusLabel = statusLabels[eq.equipment_status] || eq.equipment_status;

  const capacity = eq.daily_capacity || 0;
  const count = eq.queue_count || 0;
  const isOverloaded = capacity > 0 && count > capacity;

  const loadBar = capacity > 0
    ? `<div class="mt-2">
         <div class="flex justify-between text-[10px] text-gray-500 mb-0.5">
           <span>${count} / ${capacity}</span>
           <span>${Math.round((count / capacity) * 100)}%</span>
         </div>
         <div class="w-full bg-gray-200 rounded-full h-1.5">
           <div class="h-1.5 rounded-full ${isOverloaded ? 'bg-red-500' : count / capacity > 0.7 ? 'bg-amber-500' : 'bg-green-500'}"
                style="width: ${Math.min(100, Math.round((count / capacity) * 100))}%"></div>
         </div>
       </div>`
    : `<div class="text-[10px] text-gray-400 mt-1">${count}건 대기 (용량 미설정)</div>`;

  const onlineIcon = eq.agent_status === 'ONLINE'
    ? '<span class="w-2 h-2 bg-green-500 rounded-full inline-block" title="온라인"></span>'
    : '<span class="w-2 h-2 bg-gray-300 rounded-full inline-block" title="오프라인"></span>';

  const cardsHtml = (eq.cards || []).map(c => renderCard(c)).join('');

  return `
    <div class="flex-shrink-0 w-72 bg-white rounded-lg shadow">
      <div class="p-3 border-b ${isOverloaded ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-200'} rounded-t-lg">
        <div class="flex items-center justify-between mb-1">
          <div class="flex items-center gap-1.5">
            ${onlineIcon}
            <h3 class="font-bold text-sm text-gray-800">${escapeHtml(eq.name)}</h3>
          </div>
          <span class="text-[10px] px-1.5 py-0.5 rounded ${statusClass}">${statusLabel}</span>
        </div>
        <div class="flex items-center justify-between">
          <span class="text-[10px] text-gray-400">${escapeHtml(eq.location_zone || '')}</span>
          <button onclick="editCapacity('${escapeHtml(eq.id)}', ${capacity})" class="text-[10px] text-blue-500 hover:text-blue-700" title="용량 설정">
            <i class="fas fa-cog"></i> 용량
          </button>
        </div>
        ${loadBar}
      </div>
      <div class="schedule-drop-zone p-2 space-y-2 min-h-[200px] max-h-[calc(100vh-300px)] overflow-y-auto"
           data-equipment-id="${escapeHtml(eq.id)}">
        ${cardsHtml || '<div class="text-center text-gray-300 py-4 text-xs">카드 없음</div>'}
      </div>
    </div>
  `;
}

// ── 데이터 로드 ──
async function loadSchedule() {
  try {
    const [queuesRes, unassignedRes] = await Promise.all([
      axios.get('/api/cards/schedule/queues'),
      axios.get('/api/cards/schedule/unassigned')
    ]);

    const queues = queuesRes.data.data || [];
    const unassigned = unassignedRes.data.data || [];

    // 통계 업데이트
    const totalQueue = queues.reduce((s, eq) => s + (eq.queue_count || 0), 0);
    const overloaded = queues.filter(eq => eq.daily_capacity > 0 && eq.queue_count > eq.daily_capacity).length;
    const todayDue = [...unassigned, ...queues.flatMap(eq => eq.cards || [])].filter(c => {
      if (!c.delivery_date) return false;
      const today = new Date().toISOString().substring(0, 10);
      return c.delivery_date.substring(0, 10) <= today;
    }).length;

    document.getElementById('statTotalQueue').textContent = totalQueue;
    document.getElementById('statUnassigned').textContent = unassigned.length;
    document.getElementById('statTodayDue').textContent = todayDue;
    document.getElementById('statOverloaded').textContent = overloaded;

    // 미배정 카드 렌더링
    const unassignedEl = document.getElementById('unassignedCards');
    document.getElementById('unassignedCount').textContent = `(${unassigned.length})`;
    if (unassigned.length === 0) {
      unassignedEl.innerHTML = '<div class="text-center text-gray-400 py-4 text-xs">미배정 카드 없음</div>';
    } else {
      unassignedEl.innerHTML = unassigned.map(c => renderCard(c)).join('');
    }

    // 장비 칼럼 렌더링
    const columnsEl = document.getElementById('equipmentColumns');
    if (queues.length === 0) {
      columnsEl.innerHTML = '<div class="text-center text-gray-400 py-8 text-sm">등록된 장비가 없습니다</div>';
    } else {
      columnsEl.innerHTML = queues.map(eq => renderEquipmentColumn(eq)).join('');
    }

    // 드래그&드롭 이벤트 바인딩
    setupDragDrop();
  } catch (error) {
    console.error('Schedule load error:', error);
  }
}

// ── 드래그&드롭 ──
function setupDragDrop() {
  // 드래그 시작
  document.querySelectorAll('.schedule-card').forEach(card => {
    card.addEventListener('dragstart', (e) => {
      draggedCard = e.target.closest('.schedule-card');
      draggedFromEquipment = draggedCard.closest('[data-equipment-id]')?.dataset.equipmentId || '';
      draggedCard.classList.add('opacity-50');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', draggedCard.dataset.cardId);
    });

    card.addEventListener('dragend', () => {
      if (draggedCard) draggedCard.classList.remove('opacity-50');
      draggedCard = null;
      draggedFromEquipment = null;
      document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
    });
  });

  // 드롭 존
  document.querySelectorAll('.schedule-drop-zone, #unassignedCards').forEach(zone => {
    zone.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      zone.classList.add('drag-over');
    });

    zone.addEventListener('dragleave', (e) => {
      if (!zone.contains(e.relatedTarget)) {
        zone.classList.remove('drag-over');
      }
    });

    zone.addEventListener('drop', async (e) => {
      e.preventDefault();
      zone.classList.remove('drag-over');

      const cardId = e.dataTransfer.getData('text/plain');
      const targetEquipment = zone.dataset.equipmentId;

      if (!cardId) return;
      if (targetEquipment === draggedFromEquipment) return;

      try {
        await axios.put(`/api/cards/schedule/assign/${cardId}`, {
          equipment_id: targetEquipment || null
        });
        await loadSchedule();
      } catch (error) {
        showToast('장비 배정 실패: ' + (error.response?.data?.error || error.message), 'error');
      }
    });
  });
}

// ── 우선순위 변경 ──
window.changePriority = async function(cardId, delta) {
  const card = document.querySelector(`[data-card-id="${cardId}"]`);
  if (!card) return;

  const currentPriority = parseInt(card.dataset.priority) || 0;
  const newPriority = Math.max(0, Math.min(99, currentPriority + delta * 10));

  if (newPriority === currentPriority) return;

  try {
    await axios.put(`/api/cards/schedule/priority/${cardId}`, { priority: newPriority });
    await loadSchedule();
  } catch (error) {
    showToast('우선순위 변경 실패: ' + (error.response?.data?.error || error.message), 'error');
  }
};

// ── 용량 설정 ──
window.editCapacity = async function(equipmentId, currentCapacity) {
  const input = prompt(`일일 처리 용량 설정 (0 = 무제한)\n현재: ${currentCapacity}`, currentCapacity);
  if (input === null) return;

  const capacity = parseInt(input);
  if (isNaN(capacity) || capacity < 0) {
    showToast('0 이상의 숫자를 입력해주세요.', 'warning');
    return;
  }

  try {
    await axios.put(`/api/rip/equipment/${equipmentId}/capacity`, { daily_capacity: capacity });
    await loadSchedule();
  } catch (error) {
    showToast('용량 설정 실패: ' + (error.response?.data?.error || error.message), 'error');
  }
};

// ── 스타일 ──
var style = document.createElement('style');
style.textContent = `
  .drag-over {
    background-color: #dbeafe !important;
    border: 2px dashed #3b82f6;
    border-radius: 0.375rem;
  }
  .schedule-card {
    transition: transform 0.1s, box-shadow 0.1s;
  }
  .schedule-card:hover {
    transform: translateY(-1px);
  }
`;
document.head.appendChild(style);

// ── 초기화 ──
loadSchedule();

// 30초마다 자동 새로고침
setInterval(loadSchedule, 30000);
