// IA 학습 데이터 검수 + 라벨링
// ─────────────────────────────────────────────────────────

var allRows = [];
var filteredRows = [];
var currentSort = { col: 'id', asc: true };
var currentPage = 1;
var PAGE_SIZE = 50;
var loadedFileName = '';

// 검수 상태: { [id]: { status, category, finishing } }
var vState = {};

var CATEGORIES = [
  '현수막', '패트', '깃발', '시트', '후렉스', '켈',
  '합성지', '가로등배너', '간판', '솔벤현수막', '아크릴', '자작나무', '게릴라', '기타'
];

// 4면 여백 후가공 (면별 1개만)
var EDGE_TYPES = ['', '열재단', '재단', '미싱', '봉미싱', '접어미싱', '줄미싱', '밴드미싱', '나무미싱', '원형나무'];
var EDGE_ABBR = { '열재단': '열', '재단': '재', '미싱': '미', '봉미싱': '봉', '접어미싱': '접', '줄미싱': '줄', '밴드미싱': '밴', '나무미싱': '목', '원형나무': '나' };
// 펀칭 (독립)
var PUNCH_TYPES = ['', '사방', '상단', '하단', '좌우', '상좌우', '기타'];
var EMPTY_FIN = { top: '', bottom: '', left: '', right: '', punching: '' };

// ── 후가공 문자열 → 4면+펀칭 자동 파싱 ──────────────────
function parseFinishingStr(raw) {
  if (!raw || !raw.trim()) return { top: '', bottom: '', left: '', right: '', punching: '' };
  var s = raw.trim();
  var fin = { top: '', bottom: '', left: '', right: '', punching: '' };

  // "여백없이"/"여백없음" 제거 (의미: 열재단과 동일)
  s = s.replace(/여백없이|여백없음/g, '').trim();

  // 펀칭 추출 (먼저 처리 후 문자열에서 제거)
  s = s.replace(/사방\s*큰?\s*펀칭/g, function() { fin.punching = '사방'; return ''; });
  s = s.replace(/상단\s*큰?\s*펀칭/g, function() { fin.punching = '상단'; return ''; });
  s = s.replace(/하단\s*큰?\s*펀칭/g, function() { fin.punching = '하단'; return ''; });
  s = s.replace(/좌우\s*큰?\s*펀칭/g, function() { fin.punching = '좌우'; return ''; });
  s = s.replace(/큰?\s*펀칭/g, function() { if (!fin.punching) fin.punching = '사방'; return ''; });

  // 토큰 분리 (+ 기준, 빈 토큰 제거)
  var tokens = s.split(/[+]/).map(function(t) { return t.trim(); }).filter(Boolean);

  tokens.forEach(function(tok) {
    // 사방 계열
    if (/사방\s*미싱/.test(tok)) { fin.top = '미싱'; fin.bottom = '미싱'; fin.left = '미싱'; fin.right = '미싱'; return; }
    if (/사방\s*열재단/.test(tok)) { fin.top = '열재단'; fin.bottom = '열재단'; fin.left = '열재단'; fin.right = '열재단'; return; }
    if (/사방\s*봉미싱/.test(tok)) { fin.top = '봉미싱'; fin.bottom = '봉미싱'; fin.left = '봉미싱'; fin.right = '봉미싱'; return; }
    if (/사방\s*접어미싱/.test(tok)) { fin.top = '접어미싱'; fin.bottom = '접어미싱'; fin.left = '접어미싱'; fin.right = '접어미싱'; return; }
    if (/^재단만$/.test(tok)) { fin.top = '열재단'; fin.bottom = '열재단'; fin.left = '열재단'; fin.right = '열재단'; return; }

    // 양옆 계열
    if (/양옆\s*접어미싱/.test(tok)) { fin.left = '접어미싱'; fin.right = '접어미싱'; return; }
    if (/양옆\s*미싱/.test(tok)) { fin.left = '미싱'; fin.right = '미싱'; return; }
    if (/양옆\s*봉미싱/.test(tok)) { fin.left = '봉미싱'; fin.right = '봉미싱'; return; }
    if (/양옆\s*열재단/.test(tok)) { fin.left = '열재단'; fin.right = '열재단'; return; }

    // 상단 계열
    if (/상단?\s*봉미싱/.test(tok)) { fin.top = '봉미싱'; return; }
    if (/상단?\s*미싱/.test(tok)) { fin.top = '미싱'; return; }
    if (/상단?\s*접어미싱/.test(tok)) { fin.top = '접어미싱'; return; }
    if (/상단?\s*줄미싱/.test(tok)) { fin.top = '줄미싱'; return; }
    if (/상단?\s*밴드미싱/.test(tok)) { fin.top = '밴드미싱'; return; }
    if (/상단?\s*열재단/.test(tok)) { fin.top = '열재단'; return; }

    // 하단 계열
    if (/하단?\s*봉미싱/.test(tok)) { fin.bottom = '봉미싱'; return; }
    if (/하단?\s*미싱/.test(tok)) { fin.bottom = '미싱'; return; }
    if (/하단?\s*접어미싱/.test(tok)) { fin.bottom = '접어미싱'; return; }
    if (/하단?\s*열재단/.test(tok)) { fin.bottom = '열재단'; return; }

    // 단독 키워드 (미지정 면에 적용)
    if (/^열재단$/.test(tok)) { fin.top = fin.top || '열재단'; fin.bottom = fin.bottom || '열재단'; fin.left = fin.left || '열재단'; fin.right = fin.right || '열재단'; return; }
    if (/^미싱$/.test(tok)) { fin.top = fin.top || '미싱'; fin.bottom = fin.bottom || '미싱'; fin.left = fin.left || '미싱'; fin.right = fin.right || '미싱'; return; }
  });

  return fin;
}

// 파일명 item → 카테고리 매핑
var ITEM_MAP = {
  '현수막': '현수막', '솔벤현수막': '솔벤현수막',
  'UV현수막': '솔벤현수막', 'uv현수막': '솔벤현수막',
  '패트': '패트', '페트': '패트', 'PET': '패트', 'pet': '패트',
  '깃발': '깃발',
  '시트': '시트', '솔벤시트': '시트', '솔벤': '시트', '래핑시트': '시트', '래핑': '시트',
  'UV출력': '시트', 'UV': '시트', 'uv출력': '시트', 'uv': '시트',
  '후렉스': '후렉스', '플렉스': '후렉스', '합성지후렉스': '후렉스',
  '켈': '켈', '합성지': '합성지',
  '가로등배너': '가로등배너', '가로등': '가로등배너',
  '간판': '간판', '아크릴': '아크릴', '자작나무': '자작나무'
};

var PATTERN_COLORS = {
  A: { bg: 'bg-blue-500', text: 'text-blue-700', light: 'bg-blue-50' },
  B: { bg: 'bg-green-500', text: 'text-green-700', light: 'bg-green-50' },
  C: { bg: 'bg-amber-500', text: 'text-amber-700', light: 'bg-amber-50' },
  D: { bg: 'bg-blue-500', text: 'text-blue-700', light: 'bg-blue-50' },
  F: { bg: 'bg-amber-500', text: 'text-amber-700', light: 'bg-amber-100' },
  I: { bg: 'bg-green-500', text: 'text-green-700', light: 'bg-green-50' },
  G: { bg: 'bg-amber-400', text: 'text-amber-600', light: 'bg-amber-50' },
  H: { bg: 'bg-amber-300', text: 'text-amber-600', light: 'bg-amber-50' },
  E: { bg: 'bg-gray-400', text: 'text-gray-600', light: 'bg-gray-100' },
};

// ── CSV 파싱 ──────────────────────────────────────────────
function parseCSV(text) {
  var lines = text.split('\n');
  if (lines.length < 2) return [];
  var headers = parseCSVLine(lines[0]).map(function(h) { return h.trim(); });
  var rows = [];
  for (var i = 1; i < lines.length; i++) {
    var line = lines[i].trim();
    if (!line) continue;
    var values = parseCSVLine(line);
    var row = {};
    for (var j = 0; j < headers.length; j++) {
      row[headers[j]] = values[j] || '';
    }
    rows.push(row);
  }
  return rows;
}

function parseCSVLine(line) {
  var result = [];
  var current = '';
  var inQuotes = false;
  for (var i = 0; i < line.length; i++) {
    var ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') { current += '"'; i++; }
      else if (ch === '"') { inQuotes = false; }
      else { current += ch; }
    } else {
      if (ch === '"') { inQuotes = true; }
      else if (ch === ',') { result.push(current); current = ''; }
      else { current += ch; }
    }
  }
  result.push(current);
  return result;
}

// ── 파일 로드 ─────────────────────────────────────────────
function handleCSV(file) {
  if (!file || !file.name.endsWith('.csv')) return;
  loadedFileName = file.name;
  var reader = new FileReader();
  reader.onload = function(e) {
    allRows = parseCSV(e.target.result);
    if (allRows.length === 0) return;
    initVerificationState();
    onDataLoaded();
  };
  reader.readAsText(file, 'UTF-8');
}

function onDataLoaded() {
  document.getElementById('dropZone').innerHTML =
    '<i class="fas fa-check-circle text-green-500 mr-1"></i>' +
    '<span class="text-green-700 text-sm font-medium">' + esc(loadedFileName) + '</span>' +
    '<span class="text-gray-400 text-[10px] ml-2">' + allRows.length + '행</span>' +
    '<button onclick="location.reload()" class="ml-3 text-[10px] text-blue-500 underline">다른 파일</button>';
  document.getElementById('statsSection').classList.remove('hidden');
  document.getElementById('btnExport').classList.remove('hidden');
  populateDayFilter();
  updateStats();
  applyFilters();
}

// ── 검수 상태 관리 ────────────────────────────────────────
function stateKey() {
  return 'ia-scan-' + simpleHash(loadedFileName);
}

function simpleHash(str) {
  var h = 0;
  for (var i = 0; i < str.length; i++) {
    h = ((h << 5) - h) + str.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h).toString(36);
}

function initVerificationState() {
  var needsSave = false;
  var saved = localStorage.getItem(stateKey());
  if (saved) {
    try {
      vState = JSON.parse(saved);
      // 행 수가 크게 다르면 강제 초기화 (pairs.csv 구조 변경 감지)
      var savedCount = Object.keys(vState).length;
      if (Math.abs(savedCount - allRows.length) > savedCount * 0.2) {
        console.log('pairs.csv 구조 변경 감지 (' + savedCount + ' → ' + allRows.length + '행), 검수 상태 초기화');
        saved = null;
        throw new Error('reset');
      }
      // 마이그레이션: 이전 버전 → 최신 기본값 재적용
      var rowMap = {};
      allRows.forEach(function(r) { rowMap[r.id] = r; });
      for (var id in vState) {
        var s = vState[id];
        var row = rowMap[id];
        if (!row) continue;
        // finishing 문자열 → 객체 변환
        if (!s.finishing || typeof s.finishing === 'string') {
          s.finishing = autoFinishing(row);
          s.finishing_raw = (row.finishing || '').trim();
          needsSave = true;
        }
        // 품목 빈값이면 자동 매핑 재적용
        if (!s.category) {
          var cat = autoCategory(row);
          if (cat) { s.category = cat; needsSave = true; }
        }
        // 게릴라/패트/켈: 후가공 기본값 재적용 (빈값일 때)
        var autoCat = autoCategory(row);
        if (autoCat && !s.finishing.left && !s.finishing.top) {
          var autoFin = autoFinishing(row);
          if (autoFin.left || autoFin.top) {
            s.finishing = autoFin;
            needsSave = true;
          }
        }
      }
      if (needsSave) saveState();
      return;
    } catch(e) {}
  }
  vState = {};
  allRows.forEach(function(r) {
    vState[r.id] = {
      status: 'pending',
      category: autoCategory(r),
      finishing: autoFinishing(r),
      finishing_raw: (r.finishing || '').trim()
    };
  });
  saveState();
}

function autoCategory(row) {
  // 게릴라 패턴 (F/G/H) → 게릴라
  if (row.pattern === 'F' || row.pattern === 'G' || row.pattern === 'H') return '게릴라';
  if (row.item) {
    var normalized = row.item.trim();
    for (var key in ITEM_MAP) {
      if (normalized.indexOf(key) !== -1) return ITEM_MAP[key];
    }
    return normalized;
  }
  return '';
}

function autoFinishing(row) {
  var cat = autoCategory(row);
  // 게릴라: 좌우 원형나무, 상하 없음, 펀칭 없음
  if (cat === '게릴라') return { top: '', bottom: '', left: '원형나무', right: '원형나무', punching: '' };
  // 패트/켈: 파일명 파싱만 (빈 면은 빈 채로)
  if (cat === '패트' || cat === '켈') {
    return parseFinishingStr(row.finishing || '');
  }
  // 나머지: 파일명에서 파싱
  return parseFinishingStr(row.finishing || '');
}

function saveState() {
  try { localStorage.setItem(stateKey(), JSON.stringify(vState)); } catch(e) {}
}

function emptyState() {
  return { status: 'pending', category: '', finishing: { top: '', bottom: '', left: '', right: '', punching: '' }, finishing_raw: '' };
}

function setRowStatus(id, status) {
  if (!vState[id]) return;
  vState[id].status = status;
  saveState();
  updateStats();
  renderTable();
  renderPreview();
  if (status === 'approved' || status === 'rejected') {
    setTimeout(function() { moveToNext(); }, 150);
  }
}

function setRowCategory(id, cat) {
  if (!vState[id]) vState[id] = emptyState();
  vState[id].category = cat;
  saveState();
  updateStats();
}

function setRowFinishing(id, field, val) {
  if (!vState[id]) vState[id] = emptyState();
  if (!vState[id].finishing || typeof vState[id].finishing === 'string') {
    vState[id].finishing = { top: '', bottom: '', left: '', right: '', punching: '' };
  }
  vState[id].finishing[field] = val;
  saveState();
}

// ── 샘플 오류율 계산 ─────────────────────────────────────
function getSampleErrorRate() {
  // paired 행 중 수동 검수된(승인+거부) 건의 오류율
  var reviewed = 0, errors = 0;
  allRows.forEach(function(r) {
    if (r.match_status !== 'paired') return; // 예외 행 제외
    var s = vState[r.id];
    if (!s) return;
    if (s.status === 'approved') reviewed++;
    else if (s.status === 'rejected') { reviewed++; errors++; }
  });
  if (reviewed === 0) return -1; // 아직 검수 안 함
  return errors / reviewed;
}

function canBulkApprove() {
  var rate = getSampleErrorRate();
  return rate >= 0 && rate <= 0.05;
}

// ── 워크플로우 가이드 ─────────────────────────────────────
function updateWorkflowGuide() {
  var exceptionCount = allRows.filter(function(r) {
    return r.match_status === 'output_only' || r.match_status === 'original_only';
  }).length;
  var exceptionDone = allRows.filter(function(r) {
    if (r.match_status !== 'output_only' && r.match_status !== 'original_only') return false;
    var s = vState[r.id];
    return s && s.status !== 'pending';
  }).length;

  var rate = getSampleErrorRate();
  var reviewed = 0;
  allRows.forEach(function(r) {
    if (r.match_status !== 'paired') return;
    var s = vState[r.id];
    if (s && (s.status === 'approved' || s.status === 'rejected')) reviewed++;
  });

  var step1Done = exceptionCount > 0 && exceptionDone >= exceptionCount;
  var step2Done = reviewed >= 30; // 최소 30건 이상 샘플 검수
  var step3Ready = canBulkApprove();

  var el1 = document.getElementById('wfStep1');
  var el2 = document.getElementById('wfStep2');
  var el3 = document.getElementById('wfStep3');
  var hint = document.getElementById('wfHint');

  // Step 1
  if (step1Done) {
    el1.className = 'flex items-center gap-1 text-green-600';
    el1.querySelector('span').className = 'w-5 h-5 rounded-full bg-green-500 text-white flex items-center justify-center text-[10px]';
    el1.querySelector('span').textContent = '✓';
  } else {
    el1.className = 'flex items-center gap-1 font-bold text-blue-700';
    el1.querySelector('span').className = 'w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px]';
    el1.querySelector('span').textContent = '1';
  }

  // Step 2
  if (step2Done) {
    el2.className = 'flex items-center gap-1 text-green-600';
    el2.querySelector('span').className = 'w-5 h-5 rounded-full bg-green-500 text-white flex items-center justify-center text-[10px]';
    el2.querySelector('span').textContent = '✓';
  } else if (step1Done) {
    el2.className = 'flex items-center gap-1 font-bold text-blue-700';
    el2.querySelector('span').className = 'w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px]';
    el2.querySelector('span').textContent = '2';
  } else {
    el2.className = 'flex items-center gap-1 text-gray-400';
    el2.querySelector('span').className = 'w-5 h-5 rounded-full bg-gray-300 text-white flex items-center justify-center text-[10px]';
    el2.querySelector('span').textContent = '2';
  }

  // Step 3
  if (step3Ready) {
    el3.className = 'flex items-center gap-1 font-bold text-blue-700';
    el3.querySelector('span').className = 'w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px]';
    el3.querySelector('span').textContent = '3';
  } else {
    el3.className = 'flex items-center gap-1 text-gray-400';
    el3.querySelector('span').className = 'w-5 h-5 rounded-full bg-gray-300 text-white flex items-center justify-center text-[10px]';
    el3.querySelector('span').textContent = '3';
  }

  // 힌트
  if (!step1Done) {
    hint.textContent = '예외 ' + exceptionDone + '/' + exceptionCount + '건 처리 — output_only + original_only 먼저 ✗ 처리';
  } else if (!step2Done) {
    hint.textContent = '샘플 검수 ' + reviewed + '건 / 최소 30건 — 패턴별 확인 + 품목 태그';
  } else if (rate > 0.05) {
    hint.textContent = '오류율 ' + (rate * 100).toFixed(1) + '% (5% 초과) — 오류 원인 확인 필요';
    hint.className = 'ml-auto text-[10px] text-red-600';
    return;
  } else {
    hint.textContent = '오류율 ' + (rate * 100).toFixed(1) + '% — 일괄 승인 가능!';
    hint.className = 'ml-auto text-[10px] text-green-600 font-medium';
    return;
  }
  hint.className = 'ml-auto text-[10px] text-blue-600';
}

// ── 통계 ──────────────────────────────────────────────────
function updateStats() {
  var total = allRows.length;
  var approved = 0, rejected = 0, pending = 0, categorized = 0;
  var bbOk = 0, bbTotal = 0;

  allRows.forEach(function(r) {
    var s = vState[r.id];
    if (s) {
      if (s.status === 'approved') approved++;
      else if (s.status === 'rejected') rejected++;
      else pending++;
      if (s.category) categorized++;
    } else { pending++; }
    if (r.match_status !== 'original_only') {
      bbTotal++;
      if (r.bb_width_mm) bbOk++;
    }
  });

  document.getElementById('statTotal').textContent = total;
  document.getElementById('statApproved').textContent = approved;
  document.getElementById('statRejected').textContent = rejected;
  document.getElementById('statPending').textContent = pending;
  document.getElementById('statBB').textContent = bbTotal > 0 ? Math.round(bbOk / bbTotal * 100) + '%' : '-';
  document.getElementById('statCategorized').textContent = categorized;

  var done = approved + rejected;
  document.getElementById('progressText').textContent = done + ' / ' + total;
  document.getElementById('barApproved').style.width = (total > 0 ? (approved / total * 100) : 0) + '%';
  document.getElementById('barRejected').style.width = (total > 0 ? (rejected / total * 100) : 0) + '%';

  // 패턴 분포
  var patCounts = { A: 0, B: 0, C: 0, D: 0, E: 0, F: 0, G: 0, H: 0, I: 0 };
  var seen = {};
  allRows.forEach(function(r) {
    if (r.output_file && !seen[r.output_file]) {
      seen[r.output_file] = true;
      if (patCounts.hasOwnProperty(r.pattern)) patCounts[r.pattern]++;
    }
  });
  var ptotal = 0; for (var k in patCounts) { if (patCounts.hasOwnProperty(k)) ptotal += patCounts[k]; }
  var barHtml = '', legendHtml = '';
  ['A', 'B', 'C', 'D', 'F', 'G', 'H', 'I', 'E'].forEach(function(p) {
    var pct = ptotal > 0 ? (patCounts[p] / ptotal * 100) : 0;
    if (pct > 0) {
      barHtml += '<div class="' + PATTERN_COLORS[p].bg + ' transition-all" style="width:' + pct + '%" title="' + p + ': ' + patCounts[p] + '"></div>';
    }
    legendHtml += '<span><span class="inline-block w-2 h-2 rounded-sm ' + PATTERN_COLORS[p].bg + ' mr-0.5"></span>' + p + ':' + patCounts[p] + '</span>';
  });
  document.getElementById('patternBar').innerHTML = barHtml;
  document.getElementById('patternLegend').innerHTML = legendHtml;
  document.getElementById('patternSummary').textContent = ptotal + '개 출력파일';

  // 일괄 승인 버튼 상태
  updateBulkApproveButton();
  updateWorkflowGuide();
}

function updateBulkApproveButton() {
  var btn = document.getElementById('btnBulkApprove');
  var label = document.getElementById('errorRateLabel');
  var rate = getSampleErrorRate();

  if (rate < 0) {
    btn.disabled = true;
    btn.className = 'px-2 py-1 text-[10px] bg-gray-100 text-gray-400 border border-gray-200 rounded cursor-not-allowed';
    label.textContent = '';
    btn.title = '샘플 검수를 먼저 진행해주세요';
  } else if (rate > 0.05) {
    btn.disabled = true;
    btn.className = 'px-2 py-1 text-[10px] bg-gray-100 text-gray-400 border border-gray-200 rounded cursor-not-allowed';
    label.textContent = '(오류 ' + (rate * 100).toFixed(1) + '%)';
    btn.title = '오류율 ' + (rate * 100).toFixed(1) + '% — 5% 이하여야 활성화';
  } else {
    btn.disabled = false;
    btn.className = 'px-2 py-1 text-[10px] bg-green-50 text-green-700 border border-green-200 rounded hover:bg-green-50';
    label.textContent = '(오류 ' + (rate * 100).toFixed(1) + '%)';
    btn.title = '미검수 행을 모두 승인';
  }
}

// ── 필터 ──────────────────────────────────────────────────
function populateDayFilter() {
  var days = new Set();
  allRows.forEach(function(r) { if (r.day) days.add(r.day); });
  var sel = document.getElementById('filterDay');
  Array.from(days).sort(function(a, b) { return parseInt(a) - parseInt(b); }).forEach(function(d) {
    var opt = document.createElement('option');
    opt.value = d; opt.textContent = d + '일';
    sel.appendChild(opt);
  });
}

function problemPriority(row) {
  if (row.match_status === 'output_only') return 1;
  if (row.match_status === 'original_only') return 2;
  if (!row.pattern || row.pattern === '') return 3;
  if ((!row.bb_width_mm || row.bb_width_mm === '') && row.match_status !== 'original_only') return 4;
  // margin_w는 CSV에 존재할 수도 있는 필드 — 없으면 이 분기 자동 스킵
  var mw = parseFloat(row.margin_w);
  if (!isNaN(mw) && (mw < -50 || mw > 200)) return 5;
  if ((!row.client || row.client === '') && row.match_status === 'paired') return 6;
  return 99;
}

function applyFilters() {
  var mode = document.getElementById('filterMode').value;
  var fp = document.getElementById('filterPattern').value;
  var fs = document.getElementById('filterStatus').value;
  var fv = document.getElementById('filterVerify').value;
  var fd = document.getElementById('filterDay').value;
  var fc = document.getElementById('filterClient').value.toLowerCase();

  var base = allRows.filter(function(r) {
    if (fp && r.pattern !== fp) return false;
    if (fs && r.match_status !== fs) return false;
    if (fd && r.day !== fd) return false;
    if (fc && (r.client || '').toLowerCase().indexOf(fc) === -1 &&
        (r.client_folder || '').toLowerCase().indexOf(fc) === -1) return false;
    var st = vState[r.id] ? vState[r.id].status : 'pending';
    if (fv && st !== fv) return false;
    return true;
  });

  if (mode === 'sample') {
    filteredRows = sampleByPattern(base, 30);
  } else if (mode === 'exception') {
    // output_only + original_only만 표시
    filteredRows = base.filter(function(r) {
      return r.match_status === 'output_only' || r.match_status === 'original_only';
    });
  } else if (mode === 'pending') {
    filteredRows = base.filter(function(r) {
      var st = vState[r.id] ? vState[r.id].status : 'pending';
      return st === 'pending';
    });
  } else if (mode === 'problemFirst') {
    filteredRows = base;
    filteredRows.sort(function(a, b) {
      return problemPriority(a) - problemPriority(b);
    });
  } else {
    filteredRows = base;
  }

  // 예외 모드일 때 일괄 거부 버튼 표시
  var btnBulkReject = document.getElementById('btnBulkReject');
  if (mode === 'exception') {
    btnBulkReject.classList.remove('hidden');
  } else {
    btnBulkReject.classList.add('hidden');
  }

  if (mode === 'problemFirst') {
    var problemCount = filteredRows.filter(function(r) { return problemPriority(r) < 99; }).length;
    document.getElementById('filteredCount').innerHTML = '<span class="text-red-600 font-medium">' + problemCount + '건 문제</span> / ' + filteredRows.length + '행';
  } else {
    document.getElementById('filteredCount').textContent = filteredRows.length + ' / ' + allRows.length + '행';
  }

  var btnFiltered = document.getElementById('btnBulkApproveFiltered');
  var btnSameOutput = document.getElementById('btnBulkApproveSameOutput');
  var btnClientDate = document.getElementById('btnBulkApproveClientDate');
  if (btnFiltered) btnFiltered.classList.toggle('hidden', filteredRows.length === 0);
  if (btnSameOutput) btnSameOutput.classList.toggle('hidden', !previewRowId);
  if (btnClientDate) btnClientDate.classList.toggle('hidden', !previewRowId);

  currentPage = 1;
  renderTable();
}

function sampleByPattern(rows, perPattern) {
  // paired 행만 샘플링 (예외는 이미 Step 1에서 처리)
  var byPat = { A: [], B: [], C: [], D: [], E: [] };
  rows.forEach(function(r) {
    if (r.match_status !== 'paired') return;
    var p = r.pattern || 'E';
    if (byPat[p]) byPat[p].push(r);
  });
  var result = [];
  ['A', 'B', 'C', 'D', 'E'].forEach(function(p) {
    var arr = byPat[p];
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
    }
    result = result.concat(arr.slice(0, perPattern));
  });
  result.sort(function(a, b) { return parseInt(a.id) - parseInt(b.id); });
  return result;
}

function resetFilters() {
  document.getElementById('filterMode').value = 'all';
  document.getElementById('filterPattern').value = '';
  document.getElementById('filterStatus').value = '';
  document.getElementById('filterVerify').value = '';
  document.getElementById('filterDay').value = '';
  document.getElementById('filterClient').value = '';
  applyFilters();
}

// ── 일괄 승인/거부 ───────────────────────────────────────
function bulkApprove() {
  if (!canBulkApprove()) {
    showToast('샘플 검수 오류율이 5% 초과입니다', true);
    return;
  }
  var count = 0;
  allRows.forEach(function(r) {
    if (r.match_status !== 'paired') return; // 예외 행 제외
    var s = vState[r.id];
    if (s && s.status === 'pending') {
      s.status = 'approved';
      count++;
    }
  });
  if (count > 0) {
    saveState();
    updateStats();
    renderTable();
    showToast(count + '건 일괄 승인 완료 (paired만)');
  }
}

function bulkReject() {
  var count = 0;
  filteredRows.forEach(function(r) {
    var s = vState[r.id];
    if (s && s.status === 'pending') {
      s.status = 'rejected';
      count++;
    }
  });
  if (count > 0) {
    saveState();
    updateStats();
    renderTable();
    showToast(count + '건 일괄 거부 완료');
  }
}

async function bulkApproveFiltered() {
  var pending = filteredRows.filter(function(r) {
    var s = vState[r.id];
    return !s || s.status === 'pending';
  });
  if (pending.length === 0) {
    showToast('승인 대상이 없습니다');
    return;
  }
  if (!(await showConfirm('현재 필터에 보이는 ' + pending.length + '건을 모두 승인하시겠습니까?'))) return;
  pending.forEach(function(r) {
    if (!vState[r.id]) vState[r.id] = emptyState();
    vState[r.id].status = 'approved';
  });
  saveState();
  updateStats();
  renderTable();
  renderPreview();
  showToast(pending.length + '건 일괄 승인 완료');
}

async function bulkApproveSameOutput() {
  if (!previewRowId) {
    showToast('먼저 행을 선택하세요');
    return;
  }
  var current = allRows.find(function(r) { return r.id === previewRowId; });
  if (!current || !current.output_file) return;

  var sameRows = allRows.filter(function(r) {
    return r.output_file === current.output_file;
  });
  if (sameRows.length <= 1) {
    showToast('같은 출력 파일의 다른 행이 없습니다');
    return;
  }

  var pendingCount = sameRows.filter(function(r) {
    var s = vState[r.id];
    return !s || s.status === 'pending';
  }).length;

  if (!(await showConfirm('같은 출력 파일(' + shortName(current.output_file) + ')의 ' + sameRows.length + '건 중 ' + pendingCount + '건 미검수를 모두 승인하시겠습니까?'))) return;

  sameRows.forEach(function(r) {
    if (!vState[r.id]) vState[r.id] = emptyState();
    if (vState[r.id].status === 'pending') {
      vState[r.id].status = 'approved';
    }
  });
  saveState();
  updateStats();
  renderTable();
  renderPreview();
  showToast(pendingCount + '건 일괄 승인 완료 (같은 출력 파일)');
}

async function bulkApproveClientDate() {
  if (!previewRowId) {
    showToast('먼저 행을 선택하세요');
    return;
  }
  var current = allRows.find(function(r) { return r.id === previewRowId; });
  if (!current || !current.client || !current.day) {
    showToast('거래처 또는 날짜 정보가 없습니다');
    return;
  }

  var sameRows = allRows.filter(function(r) {
    return r.client === current.client && r.day === current.day;
  });
  if (sameRows.length <= 1) {
    showToast('같은 거래처+날짜의 다른 행이 없습니다');
    return;
  }

  var pendingCount = sameRows.filter(function(r) {
    var s = vState[r.id];
    return !s || s.status === 'pending';
  }).length;

  if (!(await showConfirm(current.client + ' / ' + current.day + '일의 ' + sameRows.length + '건 중 ' + pendingCount + '건 미검수를 모두 승인하시겠습니까?'))) return;

  sameRows.forEach(function(r) {
    if (!vState[r.id]) vState[r.id] = emptyState();
    if (vState[r.id].status === 'pending') {
      vState[r.id].status = 'approved';
    }
  });
  saveState();
  updateStats();
  renderTable();
  renderPreview();
  showToast(pendingCount + '건 일괄 승인 완료 (거래처+날짜)');
}

// ── 정렬 ──────────────────────────────────────────────────
function sortBy(col) {
  if (currentSort.col === col) { currentSort.asc = !currentSort.asc; }
  else { currentSort.col = col; currentSort.asc = true; }
  filteredRows.sort(function(a, b) {
    var va = a[col] || '', vb = b[col] || '';
    if (['id', 'day', 'width_name', 'height_name'].indexOf(col) !== -1) {
      va = parseFloat(va) || 0; vb = parseFloat(vb) || 0;
    }
    if (va < vb) return currentSort.asc ? -1 : 1;
    if (va > vb) return currentSort.asc ? 1 : -1;
    return 0;
  });
  currentPage = 1;
  renderTable();
}

// ── 테이블 렌더 ───────────────────────────────────────────
function renderTable() {
  var start = (currentPage - 1) * PAGE_SIZE;
  var end = Math.min(start + PAGE_SIZE, filteredRows.length);
  var pageRows = filteredRows.slice(start, end);

  var html = '';
  pageRows.forEach(function(r) {
    var s = vState[r.id] || { status: 'pending', category: '', finishing: '' };
    var rowBg = s.status === 'approved' ? 'bg-green-50/50' : s.status === 'rejected' ? 'bg-red-50/50' : '';

    var pc = PATTERN_COLORS[r.pattern];
    var patBadge = pc
      ? '<span class="px-1 py-0.5 rounded text-[10px] font-mono ' + pc.light + ' ' + pc.text + '">' + r.pattern + '</span>'
      : '<span class="text-[10px] text-gray-300">-</span>';

    var outName = r.output_file ? shortName(r.output_file) : '';
    var origName = r.original_file ? shortName(r.original_file) : '<span class="text-gray-300">-</span>';

    // 축소비율 + 실제 여백 계산 (파일명 규격 기반)
    var scaleHtml = '';
    var bbW = parseFloat(r.bb_width_mm) || 0;
    var bbH = parseFloat(r.bb_height_mm) || 0;
    var wName = parseFloat(r.width_name) || 0; // cm
    var hName = parseFloat(r.height_name) || 0;

    if (wName && hName && bbW && bbH) {
      var nameW = wName * 10; // cm → mm
      var nameH = hName * 10;
      var sW = nameW / bbW; // 축소비율 (가로)
      var sH = nameH / bbH; // 축소비율 (세로)
      // 축소비율이 비슷하면 → 균일 축소, 차이가 나면 → 여백 포함
      var sAvg = (sW + sH) / 2;
      // 실제 출력 크기 (축소비율 적용)
      var realW = Math.round(bbW * sAvg);
      var realH = Math.round(bbH * sAvg);
      // 여백 = 실제출력 - 파일명규격
      var mgW = realW - Math.round(nameW);
      var mgH = realH - Math.round(nameH);

      var tip = '\u00f7' + sAvg.toFixed(1) + ' \uc2e4\uc81c:' + realW + '\u00d7' + realH + 'mm \uc5ec\ubc31:' + (mgW>=0?'+':'') + mgW + '\u00d7' + (mgH>=0?'+':'') + mgH + 'mm';

      var scaleLabel = sAvg >= 0.9 && sAvg <= 1.1 ? '1:1' : sAvg > 1 ? '\u00f7' + sAvg.toFixed(1) : '\u00d7' + (1/sAvg).toFixed(1);
      var absMgW = Math.abs(mgW), absMgH = Math.abs(mgH);

      if (absMgW <= 5 && absMgH <= 5) {
        // 여백 없음
        scaleHtml = '<span class="text-green-600 text-[9px]" title="' + tip + '">' + scaleLabel + '</span>';
      } else if (absMgW <= 100 && absMgH <= 100) {
        // 정상 여백
        var mgLabel = (mgW>=0?'+':'') + mgW + '/' + (mgH>=0?'+':'') + mgH;
        scaleHtml = '<span class="text-blue-600 text-[9px]" title="' + tip + '">' + scaleLabel + ' ' + mgLabel + '</span>';
      } else {
        // 큰 차이 (합침 배치 등)
        scaleHtml = '<span class="text-gray-400 text-[9px]" title="' + tip + '">' + scaleLabel + '</span>';
      }
    } else if (bbW && bbH) {
      scaleHtml = '<span class="text-gray-300 text-[9px]">-</span>';
    }

    // 품목 드롭다운
    var catHtml = '<select onclick="event.stopPropagation()" onchange="setRowCategory(\'' + r.id + '\', this.value)" class="border rounded px-1 py-0.5 text-[10px] w-full ' + (s.category ? 'text-gray-800' : 'text-gray-400') + '">';
    catHtml += '<option value="">선택</option>';
    CATEGORIES.forEach(function(c) {
      catHtml += '<option value="' + c + '"' + (s.category === c ? ' selected' : '') + '>' + c + '</option>';
    });
    catHtml += '</select>';

    // 후가공 4면+펀칭 컴팩트 표시
    var f = (s.finishing && typeof s.finishing === 'object') ? s.finishing : EMPTY_FIN;
    var hasFin = f.top || f.bottom || f.left || f.right || f.punching;
    var finHtml;
    if (hasFin) {
      var parts = [];
      parts.push('<span class="text-blue-600">상</span>:' + (EDGE_ABBR[f.top] || '-'));
      parts.push('<span class="text-blue-600">하</span>:' + (EDGE_ABBR[f.bottom] || '-'));
      parts.push('<span class="text-blue-600">좌</span>:' + (EDGE_ABBR[f.left] || '-'));
      parts.push('<span class="text-blue-600">우</span>:' + (EDGE_ABBR[f.right] || '-'));
      if (f.punching) parts.push('<span class="text-red-500">펀</span>:' + f.punching);
      finHtml = '<span class="text-[9px] cursor-pointer hover:bg-blue-50 rounded px-0.5" onclick="event.stopPropagation();openFinEdit(\'' + r.id + '\', this)" title="' + esc(s.finishing_raw || '') + '">' + parts.join(' ') + '</span>';
    } else {
      finHtml = '<span class="text-[9px] text-gray-300 cursor-pointer hover:bg-blue-50 rounded px-0.5" onclick="event.stopPropagation();openFinEdit(\'' + r.id + '\', this)">클릭하여 설정</span>';
    }

    // 검수 버튼
    var approveClass = s.status === 'approved' ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-400 hover:bg-green-50 hover:text-green-600';
    var rejectClass = s.status === 'rejected' ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-400 hover:bg-red-50 hover:text-red-600';
    var actionHtml =
      '<button onclick="event.stopPropagation();setRowStatus(\'' + r.id + '\', ' + (s.status === 'approved' ? "'pending'" : "'approved'") + ')" class="w-6 h-6 rounded text-xs ' + approveClass + '" title="승인">✓</button>' +
      '<button onclick="event.stopPropagation();setRowStatus(\'' + r.id + '\', ' + (s.status === 'rejected' ? "'pending'" : "'rejected'") + ')" class="w-6 h-6 rounded text-xs ml-0.5 ' + rejectClass + '" title="거부">✗</button>';

    var selectedClass = (r.id === previewRowId) ? 'ring-2 ring-blue-400 ring-inset' : '';
    html += '<tr data-id="' + r.id + '" class="hover:bg-gray-50 cursor-pointer ' + rowBg + ' ' + selectedClass + '" onclick="selectRow(\'' + r.id + '\')">';
    html += '<td class="px-2 py-1 text-gray-400 text-[10px]">' + r.id + '</td>';
    html += '<td class="px-2 py-1 text-[10px]">' + (r.day || '') + '</td>';
    html += '<td class="px-2 py-1">' + patBadge + '</td>';
    html += '<td class="px-2 py-1 text-[10px] font-medium max-w-[100px] truncate" title="' + esc(r.client_folder || '') + '">' + esc(r.client || r.client_folder || '') + '</td>';
    html += '<td class="px-2 py-1 text-[10px] max-w-[160px] truncate" title="' + esc(r.output_file || '') + '">' + outName + '</td>';
    html += '<td class="px-2 py-1 text-[10px] max-w-[140px] truncate" title="' + esc(r.original_file || '') + '">' + origName + '</td>';
    html += '<td class="px-2 py-1 text-[10px] text-right">' + esc(r.width_name || '') + '</td>';
    html += '<td class="px-2 py-1 text-[10px] text-right">' + esc(r.height_name || '') + '</td>';
    html += '<td class="px-2 py-1 text-[10px] text-center">' + scaleHtml + '</td>';
    html += '<td class="px-2 py-1">' + catHtml + '</td>';
    html += '<td class="px-2 py-1">' + finHtml + '</td>';
    html += '<td class="px-2 py-1 text-center whitespace-nowrap">' + actionHtml + '</td>';
    html += '</tr>';
  });

  document.getElementById('tableBody').innerHTML = html || '<tr><td colspan="12" class="px-4 py-8 text-center text-gray-400">데이터 없음</td></tr>';
  document.getElementById('pageInfo').textContent = filteredRows.length > 0
    ? (start + 1) + '-' + end + ' / ' + filteredRows.length + '행'
    : '0행';

  var totalPages = Math.ceil(filteredRows.length / PAGE_SIZE);
  var pagHtml = '';
  if (totalPages > 1) {
    if (currentPage > 1) pagHtml += '<button onclick="goPage(' + (currentPage - 1) + ')" class="px-2 py-0.5 text-[10px] border rounded hover:bg-gray-100">&lt;</button>';
    var sp = Math.max(1, currentPage - 3), ep = Math.min(totalPages, currentPage + 3);
    for (var p = sp; p <= ep; p++) {
      var cls = p === currentPage ? 'bg-blue-600 text-white' : 'hover:bg-gray-100';
      pagHtml += '<button onclick="goPage(' + p + ')" class="px-2 py-0.5 text-[10px] border rounded ' + cls + '">' + p + '</button>';
    }
    if (currentPage < totalPages) pagHtml += '<button onclick="goPage(' + (currentPage + 1) + ')" class="px-2 py-0.5 text-[10px] border rounded hover:bg-gray-100">&gt;</button>';
  }
  document.getElementById('pagination').innerHTML = pagHtml;
}

function goPage(p) { currentPage = p; renderTable(); }

// ── 내보내기 ──────────────────────────────────────────────
function exportVerified() {
  var approved = [], rejected = [];
  var catCounts = {}, finCounts = {};

  allRows.forEach(function(r) {
    var s = vState[r.id] || emptyState();
    if (s.status === 'approved') {
      var fin = (s.finishing && typeof s.finishing === 'object') ? s.finishing : EMPTY_FIN;
      approved.push({
        id: r.id,
        output_file: r.output_file,
        original_file: r.original_file,
        category: s.category,
        finishing: fin,
        finishing_raw: s.finishing_raw || '',
        quality: 'good',
        pattern: r.pattern,
        client: r.client,
        width_name: r.width_name,
        height_name: r.height_name,
        bb_width_mm: r.bb_width_mm,
        bb_height_mm: r.bb_height_mm,
        match_status: r.match_status,
        day: r.day
      });
      if (s.category) catCounts[s.category] = (catCounts[s.category] || 0) + 1;
      // 면별 후가공 통계
      ['top', 'bottom', 'left', 'right'].forEach(function(side) {
        if (fin[side]) finCounts[fin[side]] = (finCounts[fin[side]] || 0) + 1;
      });
      if (fin.punching) finCounts['펀칭_' + fin.punching] = (finCounts['펀칭_' + fin.punching] || 0) + 1;
    } else if (s.status === 'rejected') {
      rejected.push({ id: r.id, output_file: r.output_file, quality: 'rejected' });
    }
  });

  var rate = getSampleErrorRate();
  var output = {
    metadata: {
      source: loadedFileName.replace('.csv', ''),
      verified_date: new Date().toISOString().slice(0, 10),
      total_rows: allRows.length,
      approved: approved.length,
      rejected: rejected.length,
      sample_error_rate: rate >= 0 ? Math.round(rate * 1000) / 10 + '%' : 'N/A',
      categories: catCounts,
      finishings: finCounts
    },
    items: approved,
    rejected: rejected
  };

  var blob = new Blob([JSON.stringify(output, null, 2)], { type: 'application/json' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = 'verified_' + loadedFileName.replace('.csv', '') + '.json';
  a.click();
  URL.revokeObjectURL(url);
  showToast('verified.json 다운로드 (' + approved.length + '건 승인, ' + rejected.length + '건 거부)');
}

// ── 불러오기 ──────────────────────────────────────────────
function loadVerifiedJson() {
  document.getElementById('jsonInput').click();
}

function handleVerifiedJson(file) {
  if (!file || !file.name.endsWith('.json')) return;
  var reader = new FileReader();
  reader.onload = function(e) {
    try {
      var data = JSON.parse(e.target.result);
      if (!data.items || !data.metadata) {
        showToast('올바른 verified.json 파일이 아닙니다', true);
        return;
      }
      if (allRows.length === 0) {
        showToast('먼저 pairs.csv를 로드해주세요', true);
        return;
      }
      var count = 0;
      data.items.forEach(function(item) {
        if (vState[item.id]) {
          vState[item.id].status = item.status || 'approved';
          if (item.category) vState[item.id].category = item.category;
          if (item.finishing && typeof item.finishing === 'object') vState[item.id].finishing = item.finishing;
          if (item.finishing_raw) vState[item.id].finishing_raw = item.finishing_raw;
          count++;
        }
      });
      if (data.rejected) {
        data.rejected.forEach(function(item) {
          if (vState[item.id]) {
            vState[item.id].status = 'rejected';
            count++;
          }
        });
      }
      saveState();
      updateStats();
      renderTable();
      showToast(count + '건 검수 상태 복원 완료');
    } catch(err) {
      showToast('JSON 파싱 오류: ' + err.message, true);
    }
  };
  reader.readAsText(file, 'UTF-8');
}

// ── 유틸 ──────────────────────────────────────────────────
function shortName(path) {
  var parts = path.replace(/\\/g, '/').split('/');
  return esc(parts[parts.length - 1]);
}

function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── 후가공 편집 팝오버 ────────────────────────────────────
var activePopover = null;
function openFinEdit(id, el) {
  closeFinEdit();
  var s = vState[id];
  if (!s) return;
  var f = (s.finishing && typeof s.finishing === 'object') ? s.finishing : EMPTY_FIN;

  var pop = document.createElement('div');
  pop.id = 'finPopover';
  pop.className = 'absolute z-50 bg-white border border-gray-300 rounded-lg shadow-xl p-3 text-xs';
  pop.style.minWidth = '200px';

  var sides = [
    { key: 'top', label: '상' }, { key: 'bottom', label: '하' },
    { key: 'left', label: '좌' }, { key: 'right', label: '우' }
  ];
  var html = '<div class="space-y-1.5">';
  sides.forEach(function(side) {
    html += '<div class="flex items-center gap-2">';
    html += '<span class="w-4 text-right font-medium text-gray-600">' + side.label + '</span>';
    html += '<select data-side="' + side.key + '" class="flex-1 border rounded px-1.5 py-0.5 text-[11px]">';
    EDGE_TYPES.forEach(function(t) {
      html += '<option value="' + t + '"' + (f[side.key] === t ? ' selected' : '') + '>' + (t || '없음') + '</option>';
    });
    html += '</select></div>';
  });
  html += '<div class="flex items-center gap-2 pt-1 border-t">';
  html += '<span class="w-4 text-right font-medium text-red-500">펀</span>';
  html += '<select data-side="punching" class="flex-1 border rounded px-1.5 py-0.5 text-[11px]">';
  PUNCH_TYPES.forEach(function(t) {
    html += '<option value="' + t + '"' + (f.punching === t ? ' selected' : '') + '>' + (t || '없음') + '</option>';
  });
  html += '</select></div>';
  html += '<div class="flex justify-end gap-1 pt-1.5">';
  html += '<button onclick="closeFinEdit()" class="px-2 py-0.5 text-gray-400 hover:text-gray-600">취소</button>';
  html += '<button onclick="saveFinEdit(\'' + id + '\')" class="px-2 py-0.5 bg-blue-600 text-white rounded hover:bg-blue-700">확인</button>';
  html += '</div></div>';
  pop.innerHTML = html;

  // 위치: 클릭한 셀 아래
  var rect = el.getBoundingClientRect();
  pop.style.position = 'fixed';
  pop.style.left = Math.min(rect.left, window.innerWidth - 220) + 'px';
  pop.style.top = (rect.bottom + 4) + 'px';
  document.body.appendChild(pop);
  activePopover = pop;

  // 외부 클릭 닫기
  setTimeout(function() {
    document.addEventListener('click', onClickOutside);
  }, 10);
}

function onClickOutside(e) {
  if (activePopover && !activePopover.contains(e.target)) closeFinEdit();
}

function closeFinEdit() {
  if (activePopover) {
    activePopover.remove();
    activePopover = null;
    document.removeEventListener('click', onClickOutside);
  }
}

function saveFinEdit(id) {
  var pop = document.getElementById('finPopover');
  if (!pop) return;
  var selects = pop.querySelectorAll('select');
  selects.forEach(function(sel) {
    var field = sel.getAttribute('data-side');
    setRowFinishing(id, field, sel.value);
  });
  closeFinEdit();
  renderTable();
}

function showToast(msg, isError) {
  var el = document.createElement('div');
  el.className = 'fixed bottom-4 right-4 px-4 py-2 rounded-lg text-sm shadow-lg z-50 ' +
    (isError ? 'bg-red-600 text-white' : 'bg-gray-800 text-white');
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(function() { el.remove(); }, 3000);
}

// ── 행 선택 + 미리보기 ──────────────────────────────────────
var previewRowId = null;
var previewZoomed = false;

function selectRow(id) {
  previewRowId = id;
  previewZoomed = false;
  highlightSelectedRow();
  renderPreview();
  var btnSame = document.getElementById('btnBulkApproveSameOutput');
  if (btnSame) btnSame.classList.remove('hidden');
  var btnCD = document.getElementById('btnBulkApproveClientDate');
  if (btnCD) btnCD.classList.remove('hidden');
}

function highlightSelectedRow() {
  document.querySelectorAll('#tableBody tr.ring-2').forEach(function(tr) {
    tr.classList.remove('ring-2', 'ring-blue-400', 'ring-inset');
  });
  if (previewRowId) {
    var tr = document.querySelector('#tableBody tr[data-id="' + previewRowId + '"]');
    if (tr) {
      tr.classList.add('ring-2', 'ring-blue-400', 'ring-inset');
      var container = tr.closest('.overflow-auto');
      if (container) {
        var trRect = tr.getBoundingClientRect();
        var cRect = container.getBoundingClientRect();
        if (trRect.top < cRect.top || trRect.bottom > cRect.bottom) {
          tr.scrollIntoView({ block: 'nearest' });
        }
      }
    }
  }
}

function renderPreview() {
  var body = document.getElementById('previewBody');
  if (!body) return;
  var row = allRows.find(function(r) { return r.id === previewRowId; });
  if (!row) {
    body.innerHTML = '<div class="flex flex-col items-center justify-center h-full text-gray-300"><i class="fas fa-image text-4xl mb-2"></i><span class="text-xs">행을 클릭하거나 ↑↓ 키로 선택하세요</span></div>';
    document.getElementById('previewTitle').textContent = '미리보기';
    return;
  }

  var title = '#' + row.id;
  if (row.client) title += ' ' + row.client;
  document.getElementById('previewTitle').textContent = title;

  var pvHost = 'http://' + location.hostname + ':8080/';
  var s = vState[row.id] || emptyState();
  var isGuerrilla = row.pattern === 'F' || row.pattern === 'G' || row.pattern === 'H';
  var zoomClass = previewZoomed ? 'max-h-none cursor-zoom-out' : 'max-h-[280px] cursor-zoom-in';

  var html = '';

  // 파일 정보 + 치수 비교 바
  html += '<div class="mb-3 p-2 bg-gray-50 rounded text-[10px] text-gray-600 space-y-1">';
  html += '<div class="flex items-center gap-2">';
  html += '<span class="font-medium">출력:</span> <span class="truncate flex-1" title="' + esc(row.output_file || '') + '">' + shortName(row.output_file || '') + '</span>';
  if (row.bb_width_mm && row.bb_height_mm) {
    html += '<span class="text-blue-600 font-mono">BB: ' + row.bb_width_mm + '×' + row.bb_height_mm + 'mm</span>';
  }
  html += '</div>';
  if (!isGuerrilla) {
    html += '<div class="flex items-center gap-2">';
    html += '<span class="font-medium">원본:</span> <span class="truncate flex-1" title="' + esc(row.original_file || '') + '">' + shortName(row.original_file || '') + '</span>';
    if (row.margin_w !== undefined && row.margin_w !== '') {
      html += '<span class="text-purple-600 font-mono">여백 W:' + row.margin_w + ' H:' + (row.margin_h || '?') + 'mm</span>';
    }
    html += '</div>';
  }
  var matchBadge = row.match_status === 'paired' ? '<span class="px-1 rounded bg-green-50 text-green-700">매칭</span>'
    : row.match_status === 'output_only' ? '<span class="px-1 rounded bg-amber-50 text-amber-700">출력만 — 자료 폴더에 매칭 원본 없음</span>'
    : row.match_status === 'original_only' ? '<span class="px-1 rounded bg-blue-50 text-blue-700">원본만 — 출력 파일 없음</span>'
    : '<span class="text-gray-400">' + (row.match_status || '-') + '</span>';
  var verifyBadge = s.status === 'approved' ? '<span class="px-1 rounded bg-green-500 text-white">승인</span>'
    : s.status === 'rejected' ? '<span class="px-1 rounded bg-red-600 text-white">거부</span>'
    : '<span class="px-1 rounded bg-gray-200 text-gray-600">미검수</span>';
  html += '<div class="flex items-center gap-2">' + matchBadge + ' ' + verifyBadge + '</div>';
  html += '</div>';

  // 출력 이미지
  html += '<div class="mb-3">';
  html += '<div class="text-[10px] text-gray-500 font-medium mb-1"><i class="fas fa-print mr-1 text-blue-400"></i>출력 (EPS→PNG)</div>';
  if (row.output_file) {
    var outName = 'out_' + row.output_file.replace(/[\\/]/g, '_').replace(/\.[^.]+$/, '') + '.png';
    var outUrl = pvHost + encodeURIComponent(outName);
    html += '<div class="border rounded bg-gray-50 flex items-center justify-center min-h-[100px] overflow-hidden relative">';
    html += '<div class="absolute inset-0 flex items-center justify-center" id="outSpinner"><i class="fas fa-spinner fa-spin text-gray-300 text-xl"></i></div>';
    html += '<img src="' + outUrl + '" class="' + zoomClass + ' object-contain w-full relative z-10" onclick="toggleZoom()" onload="var sp=document.getElementById(\'outSpinner\');if(sp)sp.remove()" onerror="this.parentElement.innerHTML=\'<span class=&quot;text-gray-300 text-xs p-4&quot;>PNG 미생성</span>\'">';
    html += '</div>';
    html += '<div class="text-[10px] text-gray-400 mt-1 text-right"><a href="' + outUrl + '" target="_blank" class="text-blue-500 hover:underline">원본 해상도로 열기 ↗</a></div>';
  } else {
    html += '<div class="border rounded bg-gray-50 flex items-center justify-center p-6 text-gray-300 text-xs">출력 파일 없음</div>';
  }
  html += '</div>';

  // 원본 이미지
  html += '<div>';
  html += '<div class="text-[10px] text-gray-500 font-medium mb-1"><i class="fas fa-file-image mr-1 text-green-400"></i>원본 (AI/PDF→PNG)</div>';
  if (isGuerrilla) {
    html += '<div class="border rounded bg-orange-50 flex flex-col items-center justify-center p-6">';
    html += '<i class="fas fa-layer-group text-2xl text-orange-300 mb-2"></i>';
    html += '<div class="text-xs text-orange-600 font-medium">게릴라 — 동일 템플릿</div>';
    html += '<div class="text-[10px] text-gray-400 mt-1">번호만 상이 (원본에 다수 시안 포함)</div>';
    html += '</div>';
  } else if (row.original_file) {
    var origName = 'orig_' + row.original_file.replace(/[\\/]/g, '_').replace(/\.[^.]+$/, '') + '.png';
    var origUrl = pvHost + encodeURIComponent(origName);
    html += '<div class="border rounded bg-gray-50 flex items-center justify-center min-h-[100px] overflow-hidden relative">';
    html += '<div class="absolute inset-0 flex items-center justify-center" id="origSpinner"><i class="fas fa-spinner fa-spin text-gray-300 text-xl"></i></div>';
    html += '<img src="' + origUrl + '" class="' + zoomClass + ' object-contain w-full relative z-10" onclick="toggleZoom()" onload="var sp=document.getElementById(\'origSpinner\');if(sp)sp.remove()" onerror="this.parentElement.innerHTML=\'<span class=&quot;text-gray-300 text-xs p-4&quot;>PNG 미생성</span>\'">';
    html += '</div>';
    var shared = parseInt(row.shared_original_count) || 0;
    html += '<div class="text-[10px] mt-1 flex justify-between">';
    if (shared > 1) {
      html += '<span class="text-amber-600 font-medium">⚠ 이 원본에 ' + shared + '개 시안 포함</span>';
    } else {
      html += '<span></span>';
    }
    html += '<a href="' + origUrl + '" target="_blank" class="text-blue-500 hover:underline">원본 해상도로 열기 ↗</a>';
    html += '</div>';
  } else {
    html += '<div class="border rounded bg-gray-50 flex items-center justify-center p-6 text-gray-300 text-xs">';
    html += row.match_status === 'output_only' ? '자료 폴더에 매칭되는 원본 없음' : '원본 파일 없음';
    html += '</div>';
  }
  html += '</div>';

  // 하단 검수 버튼
  html += '<div class="flex gap-2 mt-3 pt-3 border-t">';
  var aActive = s.status === 'approved';
  var rActive = s.status === 'rejected';
  html += '<button onclick="setRowStatus(\'' + row.id + '\', \'' + (aActive ? 'pending' : 'approved') + '\')" class="flex-1 py-2 rounded text-sm font-medium ' + (aActive ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-500 hover:bg-green-50 hover:text-green-600') + '"><i class="fas fa-check mr-1"></i>승인 (1)</button>';
  html += '<button onclick="setRowStatus(\'' + row.id + '\', \'' + (rActive ? 'pending' : 'rejected') + '\')" class="flex-1 py-2 rounded text-sm font-medium ' + (rActive ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-red-50 hover:text-red-600') + '"><i class="fas fa-times mr-1"></i>거부 (2)</button>';
  html += '<button onclick="moveToNext()" class="px-4 py-2 rounded text-sm font-medium bg-gray-100 text-gray-500 hover:bg-gray-200">스킵 (3)</button>';
  html += '</div>';

  body.innerHTML = html;
}

function toggleZoom() {
  previewZoomed = !previewZoomed;
  renderPreview();
}

function closePreview() {
  previewRowId = null;
  highlightSelectedRow();
  renderPreview();
}

function moveSelection(delta) {
  if (filteredRows.length === 0) return;
  var currentIdx = -1;
  if (previewRowId) {
    currentIdx = filteredRows.findIndex(function(r) { return r.id === previewRowId; });
  }
  var newIdx = currentIdx + delta;
  if (newIdx < 0) newIdx = 0;
  if (newIdx >= filteredRows.length) newIdx = filteredRows.length - 1;

  var newPage = Math.floor(newIdx / PAGE_SIZE) + 1;
  if (newPage !== currentPage) {
    currentPage = newPage;
    renderTable();
  }

  selectRow(filteredRows[newIdx].id);
}

function moveToNext() {
  if (!previewRowId) { moveSelection(1); return; }
  var currentIdx = filteredRows.findIndex(function(r) { return r.id === previewRowId; });
  for (var i = currentIdx + 1; i < filteredRows.length; i++) {
    var s = vState[filteredRows[i].id];
    if (!s || s.status === 'pending') {
      var newPage = Math.floor(i / PAGE_SIZE) + 1;
      if (newPage !== currentPage) {
        currentPage = newPage;
        renderTable();
      }
      selectRow(filteredRows[i].id);
      return;
    }
  }
  moveSelection(1);
}

// ══════════════════════════════════════════════════════════
// ██ 게릴라 OCR 모드
// ══════════════════════════════════════════════════════════

var gData = null;       // guerrilla-ocr.json 원본
var gFiltered = [];     // 필터된 목록
var gState = {};        // { [idx]: { status, phone_edit, suffix_edit, unit_edit } }
var gPage = 1;
var G_PAGE_SIZE = 50;

function switchTab(tab) {
  var normal = document.getElementById('normalSection');
  var guerrilla = document.getElementById('guerrillaSection');
  var tabN = document.getElementById('tabNormal');
  var tabG = document.getElementById('tabGuerrilla');
  if (tab === 'guerrilla') {
    normal.classList.add('hidden');
    guerrilla.classList.remove('hidden');
    tabN.className = 'px-4 py-2 text-sm font-medium rounded-t-lg border border-b-0 bg-gray-50 text-gray-500 border-gray-200 hover:text-gray-700';
    tabG.className = 'px-4 py-2 text-sm font-medium rounded-t-lg border border-b-0 bg-white text-orange-600 border-orange-200';
  } else {
    normal.classList.remove('hidden');
    guerrilla.classList.add('hidden');
    tabN.className = 'px-4 py-2 text-sm font-medium rounded-t-lg border border-b-0 bg-white text-blue-600 border-blue-200';
    tabG.className = 'px-4 py-2 text-sm font-medium rounded-t-lg border border-b-0 bg-gray-50 text-gray-500 border-gray-200 hover:text-gray-700';
  }
}

function handleGuerrillaJson(file) {
  if (!file || !file.name.endsWith('.json')) return;
  var reader = new FileReader();
  reader.onload = function(e) {
    try {
      gData = JSON.parse(e.target.result);
      if (!gData.files || !gData.summary) {
        showToast('올바른 guerrilla-ocr.json이 아닙니다', true);
        gData = null;
        return;
      }
      initGuerrillaState();
      onGuerrillaLoaded();
    } catch(err) {
      showToast('JSON 파싱 오류: ' + err.message, true);
    }
  };
  reader.readAsText(file, 'UTF-8');
}

function initGuerrillaState() {
  var saved = loadGuerrillaState();
  if (saved && Object.keys(saved).length === gData.files.length) {
    gState = saved;
    return;
  }
  gState = {};
  gData.files.forEach(function(f, i) {
    gState[i] = {
      status: (f.suffixes && f.suffixes.length > 0) ? 'pending' : 'empty',
      phone_edit: (f.phones_found && f.phones_found[0]) || '',
      suffix_edit: (f.suffixes && f.suffixes[0]) || '',
      unit_edit: f.unit || ''
    };
  });
  saveGuerrillaState();
}

function onGuerrillaLoaded() {
  document.getElementById('gDropZone').innerHTML =
    '<i class="fas fa-check-circle text-green-500 mr-1"></i>' +
    '<span class="text-green-700 text-sm font-medium">guerrilla-ocr.json</span>' +
    '<span class="text-gray-400 text-[10px] ml-2">' + gData.files.length + '건</span>' +
    '<button onclick="location.reload()" class="ml-3 text-[10px] text-blue-500 underline">다른 파일</button>';
  document.getElementById('gStats').classList.remove('hidden');
  document.getElementById('gBtnExport').classList.remove('hidden');
  populateGuerrillaClientFilter();
  updateGuerrillaStats();
  applyGuerrillaFilters();
}

function populateGuerrillaClientFilter() {
  var clients = new Set();
  gData.files.forEach(function(f) { if (f.client_folder) clients.add(f.client_folder); });
  var sel = document.getElementById('gFilterClient');
  sel.innerHTML = '<option value="">전체</option>';
  Array.from(clients).sort().forEach(function(c) {
    var opt = document.createElement('option');
    opt.value = c; opt.textContent = c;
    sel.appendChild(opt);
  });
}

function updateGuerrillaStats() {
  var total = gData.files.length;
  var phones = 0, approved = 0, failed = 0;
  var uniqueSuffixes = new Set();
  gData.files.forEach(function(f, i) {
    var s = gState[i];
    if (f.suffixes && f.suffixes.length > 0) phones++;
    if (s && s.status === 'approved') approved++;
    if (s && (s.status === 'rejected' || s.status === 'empty')) failed++;
    if (s && s.suffix_edit) uniqueSuffixes.add(s.suffix_edit);
  });
  document.getElementById('gStatTotal').textContent = total;
  document.getElementById('gStatPhones').textContent = phones;
  document.getElementById('gStatApproved').textContent = approved;
  document.getElementById('gStatFailed').textContent = failed;
  document.getElementById('gStatUnique').textContent = uniqueSuffixes.size;
}

function applyGuerrillaFilters() {
  var fs = document.getElementById('gFilterStatus').value;
  var fc = document.getElementById('gFilterClient').value;
  gFiltered = [];
  gData.files.forEach(function(f, i) {
    var s = gState[i];
    if (fc && f.client_folder !== fc) return;
    if (fs === 'found' && (!f.suffixes || f.suffixes.length === 0)) return;
    if (fs === 'empty' && f.suffixes && f.suffixes.length > 0) return;
    if (fs === 'approved' && (!s || s.status !== 'approved')) return;
    if (fs === 'rejected' && (!s || s.status !== 'rejected')) return;
    gFiltered.push({ idx: i, file: f });
  });
  document.getElementById('gFilteredCount').textContent = gFiltered.length + ' / ' + gData.files.length + '건';
  gPage = 1;
  renderGuerrillaTable();
}

function gBulkApprove() {
  var count = 0;
  gFiltered.forEach(function(item) {
    var s = gState[item.idx];
    if (s && s.status === 'pending' && s.suffix_edit) {
      s.status = 'approved';
      count++;
    }
  });
  if (count > 0) {
    updateGuerrillaStats();
    renderGuerrillaTable();
    showToast(count + '건 일괄 승인');
  }
}

function saveGuerrillaState() {
  try { localStorage.setItem('ia-guerrilla-state', JSON.stringify(gState)); } catch(e) {}
}

function loadGuerrillaState() {
  var saved = localStorage.getItem('ia-guerrilla-state');
  if (saved) { try { return JSON.parse(saved); } catch(e) {} }
  return null;
}

function setGuerrillaStatus(idx, status) {
  if (!gState[idx]) return;
  gState[idx].status = status;
  saveGuerrillaState();
  updateGuerrillaStats();
  renderGuerrillaTable();
}

function editGuerrillaSuffix(idx, val) {
  if (!gState[idx]) return;
  gState[idx].suffix_edit = val;
  gState[idx].phone_edit = val;
  saveGuerrillaState();
}

function editGuerrillaUnit(idx, val) {
  if (!gState[idx]) return;
  gState[idx].unit_edit = val;
  saveGuerrillaState();
}

function renderGuerrillaTable() {
  var start = (gPage - 1) * G_PAGE_SIZE;
  var end = Math.min(start + G_PAGE_SIZE, gFiltered.length);
  var rows = gFiltered.slice(start, end);

  var html = '';
  rows.forEach(function(item, ri) {
    var f = item.file;
    var s = gState[item.idx];
    var hasPhone = f.suffixes && f.suffixes.length > 0;
    var rowBg = s.status === 'approved' ? 'bg-green-50/50' : s.status === 'rejected' ? 'bg-red-50/50' : !hasPhone ? 'bg-gray-50' : '';

    var phoneText = f.phones_found && f.phones_found.length > 0
      ? esc(f.phones_found.join(', '))
      : '<span class="text-red-400">추출 실패</span>';

    var suffixHtml = '<input type="text" value="' + esc(s.suffix_edit) + '" ' +
      'onchange="editGuerrillaSuffix(' + item.idx + ', this.value)" ' +
      'class="border rounded px-1 py-0.5 text-[10px] w-14 text-center ' + (s.suffix_edit ? 'font-bold' : 'text-gray-300') + '">';

    var unitHtml = '<input type="text" value="' + esc(s.unit_edit) + '" ' +
      'onchange="editGuerrillaUnit(' + item.idx + ', this.value)" ' +
      'class="border rounded px-1 py-0.5 text-[10px] w-10 text-center">';

    var candidate = s.unit_edit && s.suffix_edit ? s.unit_edit + '-' + s.suffix_edit : s.suffix_edit || '';

    var approveClass = s.status === 'approved' ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-400 hover:bg-green-50 hover:text-green-600';
    var rejectClass = s.status === 'rejected' ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-400 hover:bg-red-50 hover:text-red-600';
    var actionHtml =
      '<button onclick="setGuerrillaStatus(' + item.idx + ', \'' + (s.status === 'approved' ? 'pending' : 'approved') + '\')" class="w-6 h-6 rounded text-xs ' + approveClass + '">✓</button>' +
      '<button onclick="setGuerrillaStatus(' + item.idx + ', \'' + (s.status === 'rejected' ? 'pending' : 'rejected') + '\')" class="w-6 h-6 rounded text-xs ml-0.5 ' + rejectClass + '">✗</button>';

    html += '<tr class="hover:bg-gray-50 ' + rowBg + '">';
    html += '<td class="px-2 py-1 text-gray-400 text-[10px]">' + (start + ri + 1) + '</td>';
    html += '<td class="px-2 py-1 text-[10px]">' + esc(f.day || '') + '</td>';
    html += '<td class="px-2 py-1 text-[10px] max-w-[100px] truncate" title="' + esc(f.client_folder || '') + '">' + esc(f.client_folder || '') + '</td>';
    html += '<td class="px-2 py-1 text-[10px] max-w-[160px] truncate" title="' + esc(f.eps_path || '') + '">' + shortName(f.eps_path || '') + '</td>';
    html += '<td class="px-2 py-1 text-[10px]">' + phoneText + '</td>';
    html += '<td class="px-2 py-1">' + suffixHtml + '</td>';
    html += '<td class="px-2 py-1">' + unitHtml + '</td>';
    html += '<td class="px-2 py-1 text-[10px] font-medium text-blue-600">' + esc(candidate) + '</td>';
    html += '<td class="px-2 py-1 text-center whitespace-nowrap">' + actionHtml + '</td>';
    html += '</tr>';
  });

  document.getElementById('gTableBody').innerHTML = html || '<tr><td colspan="9" class="px-4 py-8 text-center text-gray-400">데이터 없음</td></tr>';
  document.getElementById('gPageInfo').textContent = gFiltered.length > 0
    ? (start + 1) + '-' + end + ' / ' + gFiltered.length + '건' : '0건';

  var totalPages = Math.ceil(gFiltered.length / G_PAGE_SIZE);
  var pagHtml = '';
  if (totalPages > 1) {
    if (gPage > 1) pagHtml += '<button onclick="gGoPage(' + (gPage - 1) + ')" class="px-2 py-0.5 text-[10px] border rounded hover:bg-gray-100">&lt;</button>';
    var sp = Math.max(1, gPage - 3), ep = Math.min(totalPages, gPage + 3);
    for (var p = sp; p <= ep; p++) {
      var cls = p === gPage ? 'bg-orange-500 text-white' : 'hover:bg-gray-100';
      pagHtml += '<button onclick="gGoPage(' + p + ')" class="px-2 py-0.5 text-[10px] border rounded ' + cls + '">' + p + '</button>';
    }
    if (gPage < totalPages) pagHtml += '<button onclick="gGoPage(' + (gPage + 1) + ')" class="px-2 py-0.5 text-[10px] border rounded hover:bg-gray-100">&gt;</button>';
  }
  document.getElementById('gPagination').innerHTML = pagHtml;
}

function gGoPage(p) { gPage = p; renderGuerrillaTable(); }

function exportGuerrilla() {
  var approved = [];
  gData.files.forEach(function(f, i) {
    var s = gState[i];
    if (s && s.status === 'approved') {
      approved.push({
        eps_path: f.eps_path,
        phone: s.phone_edit,
        suffix: s.suffix_edit,
        unit: s.unit_edit,
        filename_candidate: s.unit_edit && s.suffix_edit ? s.unit_edit + '-' + s.suffix_edit : s.suffix_edit,
        client_folder: f.client_folder,
        day: f.day,
        status: 'approved'
      });
    }
  });
  var output = {
    metadata: {
      source: gData.source,
      verified_date: new Date().toISOString().slice(0, 10),
      total: gData.files.length,
      approved: approved.length
    },
    items: approved
  };
  var blob = new Blob([JSON.stringify(output, null, 2)], { type: 'application/json' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url; a.download = 'guerrilla-verified.json';
  a.click(); URL.revokeObjectURL(url);
  showToast('guerrilla-verified.json 다운로드 (' + approved.length + '건)');
}

// ── 이벤트 바인딩 ─────────────────────────────────────────
document.addEventListener('DOMContentLoaded', function() {
  // ── 키보드 단축키 ────────────────────────────────────────────
  document.addEventListener('keydown', function(e) {
    var tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'select' || tag === 'textarea') return;
    if (activePopover) return;
    if (!document.getElementById('normalSection') || document.getElementById('normalSection').classList.contains('hidden')) return;
    if (filteredRows.length === 0) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        moveSelection(1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        moveSelection(-1);
        break;
      case '1':
      case 'Enter':
        e.preventDefault();
        if (previewRowId) setRowStatus(previewRowId, (vState[previewRowId] && vState[previewRowId].status === 'approved') ? 'pending' : 'approved');
        break;
      case '2':
      case 'Backspace':
        e.preventDefault();
        if (previewRowId) setRowStatus(previewRowId, (vState[previewRowId] && vState[previewRowId].status === 'rejected') ? 'pending' : 'rejected');
        break;
      case '3':
        e.preventDefault();
        moveToNext();
        break;
      case ' ':
        e.preventDefault();
        toggleZoom();
        break;
    }
  });

  var dropZone = document.getElementById('dropZone');
  var csvInput = document.getElementById('csvInput');
  var jsonInput = document.getElementById('jsonInput');

  var guerrillaInput = document.getElementById('guerrillaInput');

  dropZone.addEventListener('click', function() { csvInput.click(); });
  csvInput.addEventListener('change', function(e) {
    if (e.target.files.length > 0) handleCSV(e.target.files[0]);
  });
  jsonInput.addEventListener('change', function(e) {
    if (e.target.files.length > 0) handleVerifiedJson(e.target.files[0]);
  });
  guerrillaInput.addEventListener('change', function(e) {
    if (e.target.files.length > 0) handleGuerrillaJson(e.target.files[0]);
  });

  // 게릴라 드롭존 드래그
  var gDrop = document.getElementById('gDropZone');
  if (gDrop) {
    gDrop.addEventListener('dragover', function(e) { e.preventDefault(); gDrop.classList.add('border-orange-400', 'bg-orange-50'); });
    gDrop.addEventListener('dragleave', function() { gDrop.classList.remove('border-orange-400', 'bg-orange-50'); });
    gDrop.addEventListener('drop', function(e) {
      e.preventDefault(); gDrop.classList.remove('border-orange-400', 'bg-orange-50');
      if (e.dataTransfer.files.length > 0) handleGuerrillaJson(e.dataTransfer.files[0]);
    });
  }

  // 게릴라 필터
  var gfs = document.getElementById('gFilterStatus');
  var gfc = document.getElementById('gFilterClient');
  if (gfs) gfs.addEventListener('change', applyGuerrillaFilters);
  if (gfc) gfc.addEventListener('change', applyGuerrillaFilters);

  dropZone.addEventListener('dragover', function(e) {
    e.preventDefault();
    dropZone.classList.add('border-blue-400', 'bg-blue-50');
  });
  dropZone.addEventListener('dragleave', function() {
    dropZone.classList.remove('border-blue-400', 'bg-blue-50');
  });
  dropZone.addEventListener('drop', function(e) {
    e.preventDefault();
    dropZone.classList.remove('border-blue-400', 'bg-blue-50');
    if (e.dataTransfer.files.length > 0) handleCSV(e.dataTransfer.files[0]);
  });

  document.getElementById('filterMode').addEventListener('change', applyFilters);
  document.getElementById('filterPattern').addEventListener('change', applyFilters);
  document.getElementById('filterStatus').addEventListener('change', applyFilters);
  document.getElementById('filterVerify').addEventListener('change', applyFilters);
  document.getElementById('filterDay').addEventListener('change', applyFilters);
  document.getElementById('filterClient').addEventListener('input', applyFilters);
});
