// /tasks 페이지 - 작업 큐 모니터링 (axios bearer 토큰은 SHARED_AUTH_JS에서 설정됨)

const STATUS_COLOR = {
  PENDING: 'bg-gray-100 text-gray-700',
  PROCESSING: 'bg-blue-50 text-blue-700',
  COMPLETED: 'bg-green-50 text-green-700',
  FAILED: 'bg-red-50 text-red-700',
  CANCELLED: 'bg-gray-100 text-gray-600'
};
const STATUS_LABEL = {
  PENDING: '대기',
  PROCESSING: '진행중',
  COMPLETED: '완료',
  FAILED: '실패',
  CANCELLED: '취소'
};
const TYPE_LABEL = {
  AI_PROCESS: 'AI 파일 처리',
  MANUAL: '수동'
};

function escTask(s) {
  if (s === null || s === undefined) return '';
  return String(s).replace(/[&<>"']/g, function(m) {
    return ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[m];
  });
}

async function loadStats() {
  try {
    const res = await axios.get('/api/tasks/_/stats');
    const d = res.data.data || {};
    document.getElementById('statPending').textContent = d.pending || 0;
    document.getElementById('statProcessing').textContent = d.processing || 0;
    document.getElementById('statFailed').textContent = d.failed || 0;
    document.getElementById('statCompleted').textContent = d.completed_24h || 0;
  } catch (e) { /* non-fatal */ }
}

async function loadTasks() {
  const type = document.getElementById('typeFilter').value;
  const status = document.getElementById('statusFilter').value;
  const params = new URLSearchParams();
  if (type) params.set('type', type);
  if (status) params.set('status', status);
  params.set('limit', '200');

  const body = document.getElementById('tasksBody');
  body.innerHTML = '<tr><td colspan="8" class="text-center py-8 text-gray-400">로딩중...</td></tr>';
  try {
    const res = await axios.get('/api/tasks?' + params.toString());
    const rows = res.data.data || [];
    if (rows.length === 0) {
      body.innerHTML = '<tr><td colspan="8" class="text-center py-8 text-gray-400">표시할 작업이 없습니다.</td></tr>';
      return;
    }
    body.innerHTML = rows.map(function(t) {
      const colorClass = STATUS_COLOR[t.status] || 'bg-gray-100 text-gray-700';
      const statusLabel = STATUS_LABEL[t.status] || t.status;
      const ref = [t.order_number, t.card_number].filter(Boolean).join(' / ');
      const retry = (t.retry_count || 0) + '/' + (t.max_retries || 3);
      const canRetry = (t.status === 'FAILED' || t.status === 'CANCELLED');
      const btn = canRetry
        ? '<button onclick="retryTask(' + t.id + ')" class="px-2.5 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700">재시도</button>'
        : '';
      return '<tr class="hover:bg-gray-50">'
        + '<td class="px-4 py-2 font-mono text-xs text-gray-900">' + t.id + '</td>'
        + '<td class="px-4 py-2 text-sm text-gray-900">' + escTask(TYPE_LABEL[t.type] || t.type) + '</td>'
        + '<td class="px-4 py-2"><span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ' + colorClass + '">' + escTask(statusLabel) + '</span></td>'
        + '<td class="px-4 py-2 font-mono text-xs text-gray-700">' + escTask(ref || '-') + '</td>'
        + '<td class="px-4 py-2 text-xs text-gray-700">' + retry + '</td>'
        + '<td class="px-4 py-2 text-xs text-red-600 max-w-xs truncate" title="' + escTask(t.error_message || '') + '">' + escTask(t.error_message || '') + '</td>'
        + '<td class="px-4 py-2 text-xs text-gray-500">' + escTask(t.created_at) + '</td>'
        + '<td class="px-4 py-2">' + btn + '</td>'
        + '</tr>';
    }).join('');
  } catch (e) {
    body.innerHTML = '<tr><td colspan="8" class="text-center py-8 text-red-500">불러오기 실패: ' + escTask(e.message) + '</td></tr>';
  }
}

window.retryTask = async function(id) {
  try {
    await axios.post('/api/tasks/' + id + '/retry');
    loadTasks();
    loadStats();
  } catch (e) {
    showToast('재시도 실패: ' + ((e.response && e.response.data && e.response.data.error) || e.message), 'error');
  }
};

window.loadTasks = loadTasks;
window.loadStats = loadStats;

document.getElementById('typeFilter').addEventListener('change', loadTasks);
document.getElementById('statusFilter').addEventListener('change', loadTasks);

loadStats();
loadTasks();

if (window.__tasksRefreshTimer) clearInterval(window.__tasksRefreshTimer);
window.__tasksRefreshTimer = setInterval(function() { loadStats(); loadTasks(); }, 10000);
