// ===========================================================================
// 구역 품목 선택기 (zonePicker) — 실사「품목 추가」와 창고「품목 배정」이 **같은 화면**을 쓴다.
//
// 왜 이 모양인가 (용준님 2026-09-04)
//   「우측에서 하나하나 찾아서 넣는 게 어렵다」 — 그룹 안에서 **규격만 다른 형제**가 무리로 있는데
//   세로 목록으로는 그걸 못 훑는다. 수성 현수막원단 2코팅은 23품목이 전부 같은 이름이고
//   30cm~320cm 규격만 다르다.
//   → 그룹을 세로로 쌓고, 그 안의 규격을 **가로 한 줄**로 펴서 좌우 스크롤한다.
//
// ★이미 이 구역에 있는 규격도 **회색으로 같이** 보여준다(`include_held=1`).
//   없는 것만 주면 30·45·90 처럼 띄엄띄엄 나와 「무엇이 빠졌나」를 읽을 수 없다.
//   실측 = 출력실 수성 원단 23개 중 19개 보유 → 빠진 4개(45·105·127·137cm)가 한눈에 보인다.
//
// ⚠️ `?raw` concat 로 전역 스코프를 공유하므로 식별자는 전부 `zp` 접두.
// ⚠️ 규격 없는 그룹이 있다(간판자재 69품목 중 66개가 공백) → 칩 라벨은 규격 없으면 **품목명**.
// ⚠️ PC 위주 · 폰은 보기만(용준님) — 칩 높이는 PC 기준, 가로 스크롤은 그룹마다 독립.
// ===========================================================================

var _zp = {
  zoneId: null, mount: null, onCount: null,
  tree: [], items: [], groups: [], cats: [], cat: '', sel: {}, timer: null, loading: false
};

/** 선택된 품목 id 배열 — 호스트(실사 모달 · 배정 탭)가 이걸 읽어 POST 한다. */
function zpSelectedIds() {
  var out = [];
  for (var k in _zp.sel) { if (_zp.sel[k]) out.push(Number(k)); }
  return out;
}

function zpClearSelection() { _zp.sel = {}; }

/**
 * 선택기를 컨테이너에 띄운다.
 * @param zoneId  대상 구역
 * @param mountId 컨테이너 element id
 * @param onCount 선택 수가 바뀔 때 호출(호스트가 「N개 추가」 버튼을 갱신)
 */
function zpOpen(zoneId, mountId, onCount) {
  var el = document.getElementById(mountId);
  if (!el) { console.warn('[zonePicker] #' + mountId + ' not found'); return; }
  _zp.zoneId = Number(zoneId);
  _zp.mount = mountId;
  _zp.onCount = onCount || null;
  _zp.sel = {};
  _zp.cat = '';
  el.innerHTML = zpToolbarHtml() + '<div id="zpBody"></div>';
  zpLoad();
}

function zpToolbarHtml() {
  return ''
    + '<div style="display:flex;gap:8px;align-items:center;margin-bottom:10px;flex-wrap:wrap;">'
    +   '<select id="zpCat" onchange="zpPickCat(this.value)" style="padding:6px 8px;border:1px solid var(--c-border,#d1d5db);border-radius:6px;font-size:13px;min-width:150px;"></select>'
    +   '<input type="text" id="zpSearch" placeholder="품목명 · 코드 · 규격" oninput="zpSearchInput()"'
    +     ' style="flex:1;min-width:160px;padding:6px 10px;border:1px solid var(--c-border,#d1d5db);border-radius:6px;font-size:13px;">'
    +   '<span id="zpCount" style="font-size:12px;color:#6b7280;white-space:nowrap;"></span>'
    + '</div>';
}

function zpSearchInput() {
  if (_zp.timer) clearTimeout(_zp.timer);
  _zp.timer = setTimeout(zpLoad, 300);
}

function zpPickCat(cat) { _zp.cat = cat || ''; zpLoad(); }

async function zpLoad() {
  var body = document.getElementById('zpBody');
  if (!body) return;
  if (_zp.loading) return;
  _zp.loading = true;
  body.innerHTML = '<div style="padding:24px;text-align:center;color:#9ca3af;font-size:13px;"><i class="fas fa-spinner fa-spin"></i></div>';
  var q = document.getElementById('zpSearch');
  try {
    var r = await axios.get('/api/storage-zones/' + _zp.zoneId + '/candidates', {
      params: {
        q: q ? q.value.trim() : '',
        category: _zp.cat,
        include_held: '1',   // ★보유분까지 받아야 「빠진 규격」이 보인다
        limit: 1000
      }
    });
    var d = (r.data && r.data.data) || {};
    _zp.tree = d.tree || [];
    _zp.items = d.items || [];
    zpBuildGroups();
    zpRender(!!d.truncated);
  } catch (e) {
    var msg = (e.response && e.response.data && e.response.data.error) ? e.response.data.error : e.message;
    body.innerHTML = '<div style="padding:24px;text-align:center;color:#ef4444;font-size:13px;">' + window.escapeHtml(msg) + '</div>';
  } finally {
    _zp.loading = false;
  }
}

/** 규격의 앞 숫자로 자연 정렬 — 문자열 정렬이면 100cm 가 30cm 앞에 온다. */
function zpSpecKey(s) {
  var m = String(s || '').match(/-?\d+(\.\d+)?/);
  return m ? parseFloat(m[0]) : Number.POSITIVE_INFINITY;
}

function zpBuildGroups() {
  // 분류 셀렉트 채우기 — 트리가 분류별 합계를 갖고 있다.
  var catAgg = {}, catOrder = [];
  _zp.tree.forEach(function (t) {
    if (!(t.category in catAgg)) { catAgg[t.category] = 0; catOrder.push(t.category); }
    catAgg[t.category] += Number(t.n) || 0;
  });
  _zp.cats = catOrder.map(function (c) { return { name: c, n: catAgg[c] }; });

  var sel = document.getElementById('zpCat');
  if (sel) {
    var want = _zp.cat || (_zp.cats.length ? _zp.cats[0].name : '');
    sel.innerHTML = '<option value="">분류 전체</option>'
      + _zp.cats.map(function (c) {
          return '<option value="' + window.escapeHtml(c.name) + '"' + (c.name === _zp.cat ? ' selected' : '') + '>'
            + window.escapeHtml(c.name) + ' (' + c.n + ')</option>';
        }).join('');
    // 첫 진입에 분류를 안 고르면 209개 그룹이 통째로 뜬다 → 가장 큰 분류를 자동으로 연다.
    if (!_zp.cat && want) { _zp.cat = want; sel.value = want; setTimeout(zpLoad, 0); }
  }

  var map = {}, order = [];
  _zp.items.forEach(function (it) {
    var g = it.item_group || '(그룹 없음)';
    if (!map[g]) { map[g] = { name: g, category: it.category, rows: [], held: 0 }; order.push(g); }
    map[g].rows.push(it);
    if (Number(it.in_zone)) map[g].held++;
  });
  order.forEach(function (g) {
    map[g].rows.sort(function (a, b) {
      var ka = zpSpecKey(a.specification), kb = zpSpecKey(b.specification);
      if (ka !== kb) return ka - kb;
      return String(a.item_name || '').localeCompare(String(b.item_name || ''))
          || String(a.item_code || '').localeCompare(String(b.item_code || ''));
    });
  });
  _zp.groups = order.map(function (g) { return map[g]; });
}

function zpRender(truncated) {
  var body = document.getElementById('zpBody');
  if (!body) return;
  if (!_zp.groups.length) {
    body.innerHTML = '<div style="padding:24px;text-align:center;color:#9ca3af;font-size:13px;">해당 조건의 품목이 없습니다.</div>';
    zpSyncCount();
    return;
  }
  body.innerHTML = _zp.groups.map(function (g, gi) {
    var missing = g.rows.length - g.held;
    return ''
      + '<div style="border-bottom:1px solid #f1f5f9;padding:8px 0;">'
      +   '<div style="display:flex;align-items:center;gap:8px;margin-bottom:5px;">'
      +     '<span style="font-size:13px;font-weight:600;">' + window.escapeHtml(g.name) + '</span>'
      +     '<span style="font-size:11px;color:#9ca3af;">' + g.rows.length + '개'
      +       (g.held ? ' · 보유 ' + g.held : '') + (missing ? ' · <b style="color:#2563eb">없음 ' + missing + '</b>' : '') + '</span>'
      +     '<span style="margin-left:auto;display:flex;gap:4px;">'
      +       (missing ? '<button onclick="zpPickMissing(' + gi + ')" style="padding:2px 8px;border:1px solid #d1d5db;border-radius:4px;background:#fff;font-size:11px;cursor:pointer;">없는 것 전체</button>' : '')
      +       '<button onclick="zpClearGroup(' + gi + ')" style="padding:2px 8px;border:1px solid #e5e7eb;border-radius:4px;background:#fff;font-size:11px;cursor:pointer;color:#6b7280;">해제</button>'
      +     '</span>'
      +   '</div>'
      // ★가로 스크롤은 **그룹마다 독립**이다 — 한 축으로 묶으면 긴 그룹이 짧은 그룹을 끌고 다닌다.
      +   '<div style="display:flex;gap:5px;overflow-x:auto;padding-bottom:4px;">'
      +     g.rows.map(function (it) { return zpChipHtml(it); }).join('')
      +   '</div>'
      + '</div>';
  }).join('')
  + (truncated ? '<div style="font-size:11px;color:#b45309;padding:6px 0;">※ 결과가 잘렸습니다. 분류를 좁히거나 검색하세요.</div>' : '');
  zpSyncCount();
}

function zpChipHtml(it) {
  // 규격이 없으면 품목명이 곧 규격이다(간판자재 69품목 중 66개가 공백).
  var label = it.specification || it.item_name || it.item_code || '';
  var base = 'flex:0 0 auto;min-width:52px;padding:6px 10px;border-radius:6px;font-size:12px;'
           + 'white-space:nowrap;text-align:center;border:1px solid ';
  if (Number(it.in_zone)) {
    return '<span title="이미 이 구역에 있습니다 — ' + window.escapeHtml(it.item_code || '') + '"'
      + ' style="' + base + '#e5e7eb;background:#f3f4f6;color:#9ca3af;cursor:default;">' + window.escapeHtml(label) + '</span>';
  }
  var on = !!_zp.sel[it.id];
  return '<button onclick="zpToggle(' + it.id + ')" title="' + window.escapeHtml((it.item_code || '') + (it.current_zones ? ' · 현재 ' + it.current_zones : '')) + '"'
    + ' style="' + base + (on ? '#2563eb;background:#dbeafe;color:#1d4ed8;font-weight:600;' : '#d1d5db;background:#fff;color:#374151;') + 'cursor:pointer;">'
    + (on ? '✓ ' : '') + window.escapeHtml(label)
    + (it.current_zones ? '<span style="color:#b45309;font-size:10px;"> ●</span>' : '')
    + '</button>';
}

function zpToggle(id) {
  _zp.sel[id] = !_zp.sel[id];
  zpRender(false);
}

function zpPickMissing(gi) {
  var g = _zp.groups[gi];
  if (!g) return;
  g.rows.forEach(function (it) { if (!Number(it.in_zone)) _zp.sel[it.id] = true; });
  zpRender(false);
}

function zpClearGroup(gi) {
  var g = _zp.groups[gi];
  if (!g) return;
  g.rows.forEach(function (it) { delete _zp.sel[it.id]; });
  zpRender(false);
}

function zpSyncCount() {
  var n = zpSelectedIds().length;
  var el = document.getElementById('zpCount');
  if (el) el.textContent = n ? ('선택 ' + n + '개') : '';
  if (_zp.onCount) _zp.onCount(n);
}
