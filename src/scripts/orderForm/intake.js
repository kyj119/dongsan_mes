// orderForm/intake.js — 디자이너 가공 대기함 트레이 (B단계: 작업 그룹핑·내작업·일괄 프리필)
// spec: docs/superpowers/specs/2026-07-23-ia-palette-session-loop.md §3-B·D6·§4.2
// 흐름: 배지 → 트레이(거래처→작업(batch_key) 2단 그룹핑 · "내 작업"=로그인 user id↔worker_id)
//        → 단건/그룹/선택 일괄 프리필(-3 passthrough, 거래처 client_id 상속)
//        → 주문 저장 성공 후 라인별 absorb(calc.js 훅 — 서버가 ai_analysis_id로 order_item_id 역추적)

            var _ofIntakeCache = [];   // waiting 대기물 (lite rows — 썸네일 대신 has_thumbnail)
            var _ofTrayThumbs = {};    // intake id → base64|null (lazy 캐시, /intakes/:id/thumb)
            var _ofTraySel = {};       // intake id → true (트레이 체크 선택)
            var _ofTrayGroups = [];    // 직전 렌더의 작업 그룹 [{clientId, clientName, rows:[..]}]
            var _ofTrayMyId = null;    // 로그인 user id — "내 작업" 필터(worker_id 매칭)
            // #576 서버 응답 메타(전체 건수·절단 여부·담당자 마스터). 로드된 rows에서 담당자를 뽑으면
            //   상한(200) 밖 담당자가 필터 옵션에도 안 나타나 그 사람 작업엔 아예 접근할 수 없었다.
            var _ofIntakeMeta = { total: 0, truncated: false, workerNames: [] };
            var _ofTrayQuery = { q: '', date_from: '', date_to: '' };
            try {
                var _ofTrayUser = JSON.parse(localStorage.getItem('user') || '{}');
                if (_ofTrayUser && _ofTrayUser.id != null && isFinite(Number(_ofTrayUser.id))) _ofTrayMyId = Number(_ofTrayUser.id);
            } catch (e) { /* 로그인 정보 파싱 실패 → 내작업 토글 숨김 */ }

            function ofIntakeThumbSrc(t) {
                if (!t) return '';
                return t.indexOf('data:') === 0 ? t : ('data:image/png;base64,' + t);
            }

            // lazy 썸네일: 목록엔 has_thumbnail만 오고 실물은 개별 fetch (r2:thumb: 마커 유출 방지 패턴)
            function ofIntakeThumbGet(id) {
                if (Object.prototype.hasOwnProperty.call(_ofTrayThumbs, id)) return Promise.resolve(_ofTrayThumbs[id]);
                return axios.get('/api/workbench/intakes/' + id + '/thumb')
                    .then(function(res) {
                        var t = (res.data && res.data.data && res.data.data.thumbnail) || null;
                        _ofTrayThumbs[id] = t;
                        return t;
                    })
                    .catch(function() { _ofTrayThumbs[id] = null; return null; });
            }

            // memo(=source_folder)는 배치에서 '<배치폴더>#_N' — N=배치 내 순번(식별 메타)
            function ofTraySeqOf(r) {
                var m = /#_(\d+)$/.exec(String(r.memo || ''));
                return m ? parseInt(m[1], 10) : null;
            }

            function ofTrayBasename(p) {
                if (!p) return '';
                var parts = String(p).split(/[\\\/]/);
                return parts[parts.length - 1] || '';
            }

            function ofTrayFinSummary(r) {
                var fin = '';
                try {
                    var fj = r.finishing_json ? JSON.parse(r.finishing_json) : null;
                    if (fj) {
                        var parts = [];
                        ['top', 'bottom', 'left', 'right'].forEach(function(d) { if (fj[d]) parts.push(fj[d]); });
                        fin = parts.filter(function(v, ix) { return parts.indexOf(v) === ix; }).join('·');
                    }
                } catch (e) { /* 표시용 파싱 실패 무시 */ }
                return fin;
            }

            // 대기물 배지 — 전체 waiting 건수 + 트레이 진입점
            window.ofIntakeRefreshBadge = function() {
                var anchor = document.getElementById('creditBanner');
                if (!anchor || !anchor.parentNode) return;
                var badge = document.getElementById('intakeBadge');
                if (!badge) {
                    badge = document.createElement('div');
                    badge.id = 'intakeBadge';
                    badge.className = 'mt-2';
                    anchor.parentNode.insertBefore(badge, anchor.nextSibling);
                }
                badge.innerHTML = '';
                _ofIntakeCache = [];
                // mode=single,both — 주문서 트레이는 '단건' 용도만 다룬다. 모아찍기용은 ia-editor 담당이라
                // 여기 뜨면 주문 라인으로 불러올 수 없는 조각이 목록을 채우는 노이즈가 된다(2026-07-28).
                axios.get('/api/workbench/intakes', { params: { status: 'waiting', limit: 200, lite: 1, mode: 'single,both' } })
                    .then(function(res) {
                        var d = res.data || {};
                        var rows = d.data || [];
                        if (!rows.length) return;
                        _ofIntakeCache = rows;
                        // #576 서버가 준 전체 건수·담당자 마스터 — 200건 상한 밖도 존재를 알리기 위함
                        _ofIntakeMeta = { total: d.total != null ? d.total : rows.length, truncated: !!d.truncated, workerNames: d.worker_names || [] };
                        var mine = 0;
                        if (_ofTrayMyId != null) {
                            for (var i = 0; i < rows.length; i++) if (Number(rows[i].worker_id) === _ofTrayMyId) mine++;
                        }
                        badge.innerHTML = '<button type="button" onclick="ofIntakeOpenPicker()" '
                            + 'class="px-3 py-1.5 text-sm rounded-lg bg-amber-100 text-amber-800 border border-amber-300 hover:bg-amber-200">'
                            + '<i class="fas fa-inbox mr-1"></i>가공 대기함 <b>' + _ofIntakeMeta.total + '</b>건'
                            + (_ofIntakeMeta.truncated ? ' <span class="text-amber-700">(최근 ' + rows.length + '건 표시)</span>' : '')
                            + (mine ? ' <span class="text-purple-700">(내 작업 ' + mine + ')</span>' : '')
                            + ' — 클릭해서 라인으로 불러오기</button>';
                    })
                    .catch(function(e) { console.warn('[orderForm] 가공 대기물 조회 실패', e); }); // 권한 없음(403) 등은 조용히 무시
            };
            // client.js selectClient() 훅 — 거래처 변경 시 재조회(주문선행 자동필터는 트레이 오픈 시 반영)
            window.ofIntakeOnClientSelected = function() { ofIntakeRefreshBadge(); };
            // 폼 로드 시 1회 노출 (거래처 선택 전에도 대기물 보이게)
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', function() { ofIntakeRefreshBadge(); });
            } else {
                ofIntakeRefreshBadge();
            }

            // ── 트레이 렌더 ──────────────────────────────────────────────

            // 트레이 행 1개 (체크박스 + 썸네일 lazy + 식별 메타: 파일명·순번·크기·가공자·시각)
            function ofTrayRowHtml(r) {
                var thumb = r.has_thumbnail
                    ? '<img data-itk="' + r.id + '" style="width:48px;height:48px;object-fit:contain;background:#f3f4f6;border-radius:6px;flex:none">'
                    : '<div style="width:48px;height:48px;background:#f3f4f6;border-radius:6px;flex:none"></div>';
                var seq = ofTraySeqOf(r);
                var fname = ofTrayBasename(r.eps_path || r.work_ai_path);
                var fin = ofTrayFinSummary(r);
                return '<div class="flex items-center gap-2 px-3 py-2 border-b border-gray-100 hover:bg-blue-50">'
                    + '<input type="checkbox" ' + (_ofTraySel[r.id] ? 'checked ' : '') + 'onchange="ofTrayRowSel(' + r.id + ', this.checked)" class="itk-row-chk flex-none">'
                    + thumb
                    + '<div class="flex-1 min-w-0 cursor-pointer" onclick="ofIntakePick(' + r.id + ')" title="클릭 시 이 대기물만 라인으로 추가">'
                    + '<div class="text-sm truncate">'
                    + (seq != null ? '<span class="inline-block px-1.5 rounded bg-gray-200 text-gray-700 text-xs mr-1">#' + seq + '</span>' : '')
                    + '<span class="font-medium">' + (r.width_cm != null ? r.width_cm : '?') + '×' + (r.height_cm != null ? r.height_cm : '?') + 'cm ×' + (r.qty || 1) + '</span>'
                    + (r.keyword ? ' · <span class="text-blue-600">' + escapeHtml(r.keyword) + '</span>' : '')
                    + '</div>'
                    + '<div class="text-xs text-gray-500 truncate">'
                    + (fname ? escapeHtml(fname) + ' · ' : '')
                    + (r.worker_name ? '<span class="text-purple-600">' + escapeHtml(r.worker_name) + '</span> · ' : '')
                    + (fin ? escapeHtml(fin) : '마감 없음')
                    + (r.post_desc ? ' · ' + escapeHtml(r.post_desc) : '')
                    + (r.trim ? ' · 돔보' : '')
                    + (r.scale_pct && r.scale_pct < 100 ? ' · 1/' + Math.round(100 / r.scale_pct) : '')
                    + (r.outline_failed ? ' · <span class="text-red-500">아웃라인 실패</span>' : '')
                    + ' · ' + ((typeof formatKST === 'function' && r.created_at) ? formatKST(r.created_at) : escapeHtml(String(r.created_at || '').slice(0, 16)))
                    + '</div></div>'
                    + '<i class="fas fa-plus text-blue-400 flex-none"></i>'
                    + '</div>';
            }

            // 필터 → 거래처/작업(batch_key) 2단 그룹핑 → HTML
            window.ofTrayRender = function() {
                var listEl = document.getElementById('intakeList');
                if (!listEl) return;
                var rows = _ofIntakeCache || [];
                var myChk = document.getElementById('intakeMyWork');
                var wSel = document.getElementById('intakeWorkerFilter');
                var cChk = document.getElementById('intakeClientOnly');
                var w = wSel ? wSel.value : '';
                var selClientId = null;
                var cIdEl = document.getElementById('clientId');
                if (cIdEl && cIdEl.value) selClientId = Number(cIdEl.value);
                var selClientName = '';
                var csEl = document.getElementById('clientSearch');
                if (csEl) selClientName = (csEl.value || '').trim();

                var filtered = rows.filter(function(r) {
                    if (myChk && myChk.checked && _ofTrayMyId != null && Number(r.worker_id) !== _ofTrayMyId) return false;
                    if (w && (r.worker_name || '') !== w) return false;
                    if (cChk && cChk.checked && (selClientId || selClientName)) {
                        // '미지정'(디자이너 미입력)은 항상 노출 — 전멸 방지(D2 계승)
                        if ((r.client_name || '') === '미지정') return true;
                        if (selClientId && Number(r.client_id) === selClientId) return true;
                        if (selClientName && (r.client_name || '') === selClientName) return true;
                        return false;
                    }
                    return true;
                });

                // 1단: 거래처 (client_id 우선, free-text는 이름 키)
                var clientMap = {}, clientKeys = [];
                filtered.forEach(function(r) {
                    var ck = r.client_id ? ('c' + r.client_id) : ('n:' + (r.client_name || '미지정'));
                    if (!clientMap[ck]) { clientMap[ck] = []; clientKeys.push(ck); }
                    clientMap[ck].push(r);
                });
                // 2단: 작업(batch_key). 단건 확정(batch_key 없음)은 memo(건별 폴더) 단위 = 단독 작업
                _ofTrayGroups = [];
                var html = '';
                clientKeys.sort(function(a, b) {
                    var ma = Math.max.apply(null, clientMap[a].map(function(r) { return r.id; }));
                    var mb = Math.max.apply(null, clientMap[b].map(function(r) { return r.id; }));
                    return mb - ma;
                });
                clientKeys.forEach(function(ck) {
                    var crows = clientMap[ck];
                    var cname = crows[0].client_name || '미지정';
                    var registered = !!crows[0].client_id;
                    html += '<div class="px-3 py-1.5 bg-gray-100 border-b text-sm font-semibold sticky top-0">'
                        + '<i class="fas fa-building mr-1 text-gray-400"></i>' + escapeHtml(cname)
                        + (registered ? '' : ' <span class="text-xs font-normal text-gray-400">(미등록/자유입력)</span>')
                        + ' <span class="text-xs font-normal text-gray-500">' + crows.length + '건</span></div>';
                    var batchMap = {}, batchKeys = [];
                    crows.forEach(function(r) {
                        var bk = r.batch_key || r.memo || ('i' + r.id);
                        if (!batchMap[bk]) { batchMap[bk] = []; batchKeys.push(bk); }
                        batchMap[bk].push(r);
                    });
                    batchKeys.sort(function(a, b) {
                        var ma = Math.max.apply(null, batchMap[a].map(function(r) { return r.id; }));
                        var mb = Math.max.apply(null, batchMap[b].map(function(r) { return r.id; }));
                        return mb - ma;
                    });
                    batchKeys.forEach(function(bk) {
                        var brows = batchMap[bk].slice().sort(function(x, y) {
                            var sx = ofTraySeqOf(x), sy = ofTraySeqOf(y);
                            if (sx != null && sy != null && sx !== sy) return sx - sy;
                            return x.id - y.id;
                        });
                        var gi = _ofTrayGroups.length;
                        _ofTrayGroups.push({ clientId: brows[0].client_id || null, clientName: cname, rows: brows });
                        var label = ofTrayBasename(brows[0].batch_key) || '단건 등록';
                        var allSel = brows.every(function(r) { return _ofTraySel[r.id]; });
                        html += '<div class="flex items-center gap-2 px-3 py-1.5 bg-amber-50 border-b border-amber-100 text-xs">'
                            + '<input type="checkbox" ' + (allSel ? 'checked ' : '') + 'onchange="ofTrayGroupSel(' + gi + ', this.checked)" title="이 작업 전체 선택" class="flex-none">'
                            + '<span class="font-medium text-amber-800 truncate"><i class="fas fa-folder-open mr-1"></i>' + escapeHtml(label) + '</span>'
                            + '<span class="text-gray-500 flex-none">' + brows.length + '건</span>'
                            + '<span class="flex-1"></span>'
                            + '<button type="button" onclick="ofTrayCreateFromGroup(' + gi + ')" '
                            + 'class="flex-none px-2 py-0.5 rounded border border-amber-400 bg-white text-amber-800 hover:bg-amber-100" '
                            + 'title="거래처를 상속하고 이 작업의 모든 파일을 라인으로 추가합니다">'
                            + '<i class="fas fa-file-invoice mr-1"></i>이 작업으로 주문 생성</button>'
                            + '</div>';
                        for (var bi = 0; bi < brows.length; bi++) html += ofTrayRowHtml(brows[bi]);
                    });
                });
                if (!html) html = '<div class="p-4 text-center text-sm text-gray-400">해당 조건의 대기물이 없습니다.</div>';
                listEl.innerHTML = html;
                ofTrayUpdateFooter();
                ofTrayLoadThumbs(listEl);
            };

            // lazy 썸네일 로드 — 보이는 행만 (IntersectionObserver, 미지원 시 순차 전체)
            function ofTrayLoadThumbs(listEl) {
                var imgs = listEl.querySelectorAll('img[data-itk]');
                if (!imgs.length) return;
                function loadOne(img) {
                    var id = parseInt(img.getAttribute('data-itk'), 10);
                    if (!id) return;
                    ofIntakeThumbGet(id).then(function(t) {
                        if (t && img.isConnected) img.src = ofIntakeThumbSrc(t);
                    });
                }
                if (typeof IntersectionObserver === 'function') {
                    var io = new IntersectionObserver(function(entries) {
                        entries.forEach(function(en) {
                            if (en.isIntersecting) { io.unobserve(en.target); loadOne(en.target); }
                        });
                    }, { root: listEl });
                    imgs.forEach(function(img) { io.observe(img); });
                } else {
                    imgs.forEach(loadOne);
                }
            }

            window.ofTrayRowSel = function(id, on) {
                if (on) _ofTraySel[id] = true; else delete _ofTraySel[id];
                ofTrayUpdateFooter();
            };
            window.ofTrayGroupSel = function(gi, on) {
                var g = _ofTrayGroups[gi];
                if (!g) return;
                g.rows.forEach(function(r) { if (on) _ofTraySel[r.id] = true; else delete _ofTraySel[r.id]; });
                ofTrayRender();
            };
            function ofTrayUpdateFooter() {
                var btn = document.getElementById('trayPrefillBtn');
                if (!btn) return;
                var n = Object.keys(_ofTraySel).length;
                btn.disabled = !n;
                btn.innerHTML = '<i class="fas fa-arrow-down mr-1"></i>선택 ' + n + '건 라인으로 불러오기';
            }

            window.ofIntakeOpenPicker = function() {
                var rows = _ofIntakeCache || [];
                if (!rows.length) return;
                var old = document.getElementById('intakePickerOverlay');
                if (old) old.remove();
                _ofTraySel = {};
                // #576 담당자 옵션은 전체 집합(server worker_names) 기준. 서버가 안 주면 로드된 rows로 폴백.
                var workers = (_ofIntakeMeta.workerNames || []).slice();
                if (workers.length === 0) {
                    for (var i = 0; i < rows.length; i++) {
                        var wn = rows[i].worker_name;
                        if (wn && workers.indexOf(wn) === -1) workers.push(wn);
                    }
                }
                var wOpts = '<option value="">담당자 전체</option>';
                for (var k = 0; k < workers.length; k++) wOpts += '<option value="' + escapeHtml(workers[k]) + '">' + escapeHtml(workers[k]) + '</option>';
                // "내 작업" 기본값: 사용자가 켠/끈 기억 우선, 없으면 내 waiting 존재 시 자동 ON
                var hasMine = _ofTrayMyId != null && rows.some(function(r) { return Number(r.worker_id) === _ofTrayMyId; });
                var savedMy = null;
                try { savedMy = localStorage.getItem('ofTrayMyWork'); } catch (e) { /* private 모드 등 */ }
                var myOn = savedMy != null ? savedMy === '1' : hasMine;
                // 주문선행: 폼에 거래처가 이미 선택돼 있으면 거래처 자동필터 ON (§4.2)
                var cIdEl = document.getElementById('clientId');
                var clientOn = !!(cIdEl && cIdEl.value);
                var overlay = document.createElement('div');
                overlay.className = 'client-modal-overlay';
                overlay.id = 'intakePickerOverlay';
                overlay.innerHTML = '<div class="client-modal" style="max-width:760px">'
                    + '<div class="px-4 py-3 border-b flex items-center justify-between">'
                    + '<b><i class="fas fa-inbox mr-1 text-amber-600"></i>가공 대기함 '
                    + '<span id="intakeTrayCount">(' + rows.length + (_ofIntakeMeta.truncated ? ' / 전체 ' + _ofIntakeMeta.total : '') + '건)</span></b>'
                    + '<button type="button" onclick="document.getElementById(\'intakePickerOverlay\').remove()" class="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>'
                    + '</div>'
                    + '<div class="px-4 py-2 border-b flex items-center gap-3 text-sm bg-gray-50 flex-wrap">'
                    + (_ofTrayMyId != null
                        ? '<label class="flex items-center gap-1 cursor-pointer font-medium text-purple-700"><input type="checkbox" id="intakeMyWork" ' + (myOn ? 'checked ' : '') + 'onchange="ofTrayMyWorkToggle(this.checked)"> 내 작업</label>'
                        : '')
                    + '<select id="intakeWorkerFilter" onchange="ofTrayRender()" class="px-2 py-1 border rounded text-sm">' + wOpts + '</select>'
                    + '<label class="flex items-center gap-1 cursor-pointer text-gray-600"><input type="checkbox" id="intakeClientOnly" ' + (clientOn ? 'checked ' : '') + 'onchange="ofTrayRender()"> 이 거래처만</label>'
                    + '</div>'
                    // #576 서버 검색 — 위 필터들은 로드된 200건 안에서만 걸러내므로 상한 밖은 못 찾는다.
                    + '<div class="px-4 py-2 border-b flex items-center gap-2 text-sm flex-wrap">'
                    + '<input type="text" id="intakeSearchQ" placeholder="거래처·담당자·메모·묶음 검색" value="' + escapeHtml(_ofTrayQuery.q) + '" '
                    + 'onkeydown="if(event.key===\'Enter\'){event.preventDefault();ofTraySearch();}" class="px-2 py-1 border rounded text-sm" style="flex:1;min-width:180px">'
                    + '<input type="date" id="intakeSearchFrom" value="' + escapeHtml(_ofTrayQuery.date_from) + '" class="px-2 py-1 border rounded text-sm">'
                    + '<span class="text-gray-400">~</span>'
                    + '<input type="date" id="intakeSearchTo" value="' + escapeHtml(_ofTrayQuery.date_to) + '" class="px-2 py-1 border rounded text-sm">'
                    + '<button type="button" id="intakeSearchBtn" onclick="ofTraySearch()" class="px-3 py-1 text-sm rounded bg-gray-700 text-white hover:bg-gray-800"><i class="fas fa-magnifying-glass"></i></button>'
                    + '<button type="button" onclick="ofTraySearchReset()" class="px-2 py-1 text-sm text-gray-500 hover:text-gray-700">초기화</button>'
                    + '</div>'
                    + (_ofIntakeMeta.truncated
                        ? '<div id="intakeTruncNotice" class="px-4 py-1.5 text-xs bg-amber-50 text-amber-800 border-b">'
                          + '전체 ' + _ofIntakeMeta.total + '건 중 최근 ' + rows.length + '건만 표시됩니다 — 오래된 항목은 위 검색으로 찾으세요.</div>'
                        : '')
                    + '<div id="intakeList" style="max-height:56vh;overflow-y:auto"></div>'
                    + '<div class="px-4 py-3 border-t bg-gray-50 flex justify-end">'
                    + '<button type="button" id="trayPrefillBtn" disabled onclick="ofTrayPrefillSelected()" '
                    + 'class="px-4 py-1.5 text-sm rounded-lg bg-blue-600 text-white disabled:bg-gray-300 hover:bg-blue-700"></button>'
                    + '</div></div>';
                overlay.addEventListener('click', function(ev) { if (ev.target === overlay) overlay.remove(); });
                document.body.appendChild(overlay);
                ofTrayRender();
            };

            // #576 서버 재조회 — 키워드·기간은 200건 상한 '밖'을 찾기 위한 것이라 서버로 내려야 한다.
            window.ofTraySearch = async function() {
                var qEl = document.getElementById('intakeSearchQ');
                var fEl = document.getElementById('intakeSearchFrom');
                var tEl = document.getElementById('intakeSearchTo');
                _ofTrayQuery = {
                    q: qEl ? qEl.value.trim() : '',
                    date_from: fEl ? fEl.value : '',
                    date_to: tEl ? tEl.value : ''
                };
                var btn = document.getElementById('intakeSearchBtn');
                var run = async function() {
                    var params = { status: 'waiting', limit: 200, lite: 1, mode: 'single,both' };
                    if (_ofTrayQuery.q) params.q = _ofTrayQuery.q;
                    if (_ofTrayQuery.date_from) params.date_from = _ofTrayQuery.date_from;
                    if (_ofTrayQuery.date_to) params.date_to = _ofTrayQuery.date_to;
                    try {
                        var res = await axios.get('/api/workbench/intakes', { params: params });
                        var d = res.data || {};
                        _ofIntakeCache = d.data || [];
                        _ofIntakeMeta = {
                            total: d.total != null ? d.total : _ofIntakeCache.length,
                            truncated: !!d.truncated,
                            workerNames: d.worker_names || []
                        };
                        _ofTraySel = {};   // 목록이 바뀌었으므로 선택 초기화(사라진 항목 프리필 방지)
                        var cntEl = document.getElementById('intakeTrayCount');
                        if (cntEl) {
                            cntEl.textContent = '(' + _ofIntakeCache.length
                                + (_ofIntakeMeta.truncated ? ' / 전체 ' + _ofIntakeMeta.total : '') + '건)';
                        }
                        var notice = document.getElementById('intakeTruncNotice');
                        if (notice) notice.style.display = _ofIntakeMeta.truncated ? '' : 'none';
                        ofTrayRender();
                        ofTrayUpdateFooter();
                    } catch (e) {
                        console.warn('[orderForm] 대기함 검색 실패', e);
                        if (typeof showToast === 'function') showToast('대기함 검색에 실패했습니다.', 'error');
                    }
                };
                if (typeof safeSubmit === 'function') return safeSubmit(btn, run);
                return run();
            };

            window.ofTraySearchReset = function() {
                var qEl = document.getElementById('intakeSearchQ');
                var fEl = document.getElementById('intakeSearchFrom');
                var tEl = document.getElementById('intakeSearchTo');
                if (qEl) qEl.value = '';
                if (fEl) fEl.value = '';
                if (tEl) tEl.value = '';
                return window.ofTraySearch();
            };

            window.ofTrayMyWorkToggle = function(on) {
                try { localStorage.setItem('ofTrayMyWork', on ? '1' : '0'); } catch (e) { /* 실패해도 필터는 동작 */ }
                ofTrayRender();
            };

            // ── 프리필 (단건·그룹·선택 일괄) ─────────────────────────────

            // 대기물 1건 → 주문 라인 1개 (라인별 intake_id 마커 → 저장 후 absorb가 order_item_id 매핑)
            async function ofIntakePrefillOne(r) {
                addItemRow();
                var id = itemCount;

                // 직접연결 약속값: -3 = 완성본(passthrough) — 세션에서 이미 가공 완료된 산출물
                var giEl = document.querySelector('[name="ai_group_index_' + id + '"]');
                if (giEl) giEl.value = -3;
                var aiIdEl = document.querySelector('[name="ai_analysis_id_' + id + '"]');
                if (aiIdEl) aiIdEl.value = r.ai_analysis_id || '';
                var dfEl = document.querySelector('[name="direct_file_path_' + id + '"]');
                if (dfEl) dfEl.value = r.eps_path || r.work_ai_path || '';

                // 크기(실물)·수량·파일 배율
                var sfEl = document.querySelector('[name="scale_factor_' + id + '"]');
                if (sfEl && r.scale_pct && r.scale_pct < 100) sfEl.value = Math.round(100 / r.scale_pct);
                var wEl = document.querySelector('[name="width_' + id + '"]');
                if (wEl && r.width_cm != null) wEl.value = r.width_cm;
                var hEl = document.querySelector('[name="height_' + id + '"]');
                if (hEl && r.height_cm != null) hEl.value = r.height_cm;
                var qEl = document.querySelector('[name="quantity_' + id + '"]');
                if (qEl && r.qty) qEl.value = r.qty;

                // 내용 = 키워드(직결). 후가공(post_desc)은 힌트로만 — 구조 PP는 품목 선택 후 확정
                var cEl = document.querySelector('[name="content_' + id + '"]');
                if (cEl && r.keyword) cEl.value = r.keyword;

                // 썸네일 (lazy 캐시 → 없으면 개별 fetch)
                try {
                    var thumb = r.has_thumbnail ? await ofIntakeThumbGet(r.id) : null;
                    if (thumb) {
                        var thumbDiv = document.getElementById('thumb_' + id);
                        var thumbImg = document.getElementById('thumb_img_' + id);
                        if (thumbDiv && thumbImg) {
                            thumbImg.src = ofIntakeThumbSrc(thumb);
                            thumbDiv.classList.remove('hidden');
                        }
                    }
                } catch (e) { /* 썸네일 실패는 프리필을 막지 않음 */ }

                // 마감: 옵션 로드 후 값 주입 (intake finishing_json = {top:방식명, top_cm:수치} — calc.js 직렬화와 동일 스키마)
                try {
                    if (typeof loadFinishingForOrder === 'function') await loadFinishingForOrder(id);
                    var fj2 = r.finishing_json ? JSON.parse(r.finishing_json) : null;
                    if (fj2) {
                        var vals = [];
                        ['top', 'bottom', 'left', 'right'].forEach(function(dir) {
                            var sel = document.querySelector('[name="fin_' + dir + '_' + id + '"]');
                            if (sel && fj2[dir]) sel.value = fj2[dir];
                            var cmIn = document.querySelector('[name="fin_cm_' + dir + '_' + id + '"]');
                            if (cmIn && fj2[dir + '_cm'] != null) cmIn.value = fj2[dir + '_cm'];
                            vals.push(fj2[dir] || '');
                        });
                        var allSame = vals[0] === vals[1] && vals[0] === vals[2] && vals[0] === vals[3];
                        if (!allSame) {
                            var sides = document.getElementById('finishing_sides_' + id);
                            if (sides) sides.classList.remove('hidden');
                        }
                        if (typeof calcFinishing === 'function') calcFinishing(id);
                    }
                } catch (e) { console.warn('[orderForm] 대기물 마감 주입 실패', e); }

                // absorb 대상 마커 (주문 저장 성공 후 calc.js 훅이 수거 — 라인별 order_item_id 매핑)
                var rowEl = document.getElementById('item-' + id);
                if (rowEl) {
                    var mark = document.createElement('input');
                    mark.type = 'hidden';
                    mark.name = 'intake_id_' + id;
                    mark.value = String(r.id);
                    rowEl.appendChild(mark);
                }

                if (typeof calcItem === 'function') calcItem(id);
            }

            // 프리필 뒤 공통 정리: 캐시 제거·배지 갱신·합계
            function ofTrayAfterPrefill(pickedIds) {
                _ofIntakeCache = _ofIntakeCache.filter(function(x) { return pickedIds.indexOf(x.id) === -1; });
                pickedIds.forEach(function(pid) { delete _ofTraySel[pid]; });
                if (typeof calculateTotal === 'function') calculateTotal();
                var badge = document.getElementById('intakeBadge');
                if (badge) {
                    badge.innerHTML = _ofIntakeCache.length
                        ? '<button type="button" onclick="ofIntakeOpenPicker()" class="px-3 py-1.5 text-sm rounded-lg bg-amber-100 text-amber-800 border border-amber-300 hover:bg-amber-200">'
                          + '<i class="fas fa-inbox mr-1"></i>가공 대기함 <b>' + _ofIntakeCache.length + '</b>건 — 클릭해서 라인으로 불러오기</button>'
                        : '<span class="text-xs text-green-600"><i class="fas fa-check mr-1"></i>대기물을 모두 불러왔습니다 (주문 저장 시 흡수 처리)</span>';
                }
            }

            // 단건 추가 (행 클릭) — 기존 피커 동작 유지
            window.ofIntakePick = async function(intakeId) {
                var r = null;
                for (var i = 0; i < _ofIntakeCache.length; i++) {
                    if (_ofIntakeCache[i].id === intakeId) { r = _ofIntakeCache[i]; break; }
                }
                if (!r) return;
                var overlay = document.getElementById('intakePickerOverlay');
                if (overlay) overlay.remove();
                await ofIntakePrefillOne(r);
                ofTrayAfterPrefill([r.id]);
                var pickMsg = '대기물을 라인으로 불러왔습니다. 품목·단가를 확인해 주세요.';
                if (r.post_desc) pickMsg += ' (후가공: ' + r.post_desc + ' — 품목 선택 후 확정)';
                if (typeof showToast === 'function') showToast(pickMsg, 'info');
            };

            // 선택 일괄 프리필 — 거래처 미선택 + 선택분이 단일 등록 거래처면 client_id 상속
            window.ofTrayPrefillSelected = async function() {
                var rows = [];
                _ofTrayGroups.forEach(function(g) {
                    g.rows.forEach(function(r) { if (_ofTraySel[r.id]) rows.push(r); });
                });
                if (!rows.length) return;
                var cIdEl = document.getElementById('clientId');
                if (cIdEl && !cIdEl.value) {
                    var cids = [];
                    rows.forEach(function(r) { if (r.client_id && cids.indexOf(r.client_id) === -1) cids.push(r.client_id); });
                    if (cids.length === 1 && typeof selectClient === 'function') {
                        var cn = '';
                        for (var ci = 0; ci < rows.length; ci++) if (rows[ci].client_id === cids[0]) { cn = rows[ci].client_name || ''; break; }
                        selectClient(cids[0], cn);
                    }
                }
                await ofTrayPrefillRows(rows);
            };

            // 파일선행: "이 작업으로 주문 생성" — 거래처 상속 + 작업 전체 N라인 프리필 (§4.2)
            window.ofTrayCreateFromGroup = async function(gi) {
                var g = _ofTrayGroups[gi];
                if (!g || !g.rows.length) return;
                if (g.clientId && typeof selectClient === 'function') {
                    var cIdEl = document.getElementById('clientId');
                    if (!cIdEl || Number(cIdEl.value) !== Number(g.clientId)) selectClient(g.clientId, g.clientName);
                }
                await ofTrayPrefillRows(g.rows.slice());
            };

            // #575 항목별 try/catch — 예전엔 가드가 없어서 중간 1건이 던지면 루프가 통째로 중단되고
            //   뒤처리(ofTrayAfterPrefill = 대기함 캐시 정리 + 완료 안내)까지 도달하지 못했다.
            //   결과: 앞쪽 항목은 폼에 들어갔는데 대기함 상태는 그대로 → 같은 항목을 또 프리필해
            //   라인이 중복되고, 사용자에겐 에러 토스트조차 없이 조용히 멈췄다.
            //   같은 파일 ofIntakeAbsorbAll(#533)이 쓰는 "건별 격리 + 실패 집계 1회 통지" 패턴을 맞춘다.
            //   성공분만 ofTrayAfterPrefill로 넘겨 실패한 대기물은 대기함에 남긴다(재시도 가능).
            async function ofTrayPrefillRows(rows) {
                var overlay = document.getElementById('intakePickerOverlay');
                if (overlay) overlay.remove();
                var ids = [];
                var failed = [];
                for (var i = 0; i < rows.length; i++) {
                    try {
                        await ofIntakePrefillOne(rows[i]);
                        ids.push(rows[i].id);
                    } catch (e) {
                        failed.push(rows[i]);
                        console.warn('[orderForm] 대기물 프리필 실패 (intake #' + (rows[i] && rows[i].id) + ')', e);
                    }
                }
                if (ids.length > 0) ofTrayAfterPrefill(ids);
                if (typeof showToast === 'function') {
                    if (failed.length === 0) {
                        showToast('대기물 ' + ids.length + '건을 라인으로 불러왔습니다. 품목·단가를 확인해 주세요.', 'info');
                    } else if (ids.length === 0) {
                        showToast('대기물 ' + failed.length + '건을 불러오지 못했습니다. 새로고침 후 다시 시도해 주세요.', 'error');
                    } else {
                        showToast('대기물 ' + ids.length + '건 불러옴 / ' + failed.length + '건 실패 — 실패분은 대기함에 그대로 남아 있습니다.', 'warning');
                    }
                }
            }

            // 주문 저장 성공 후(calc.js 훅) — 라인에 마킹된 대기물 absorb (실패해도 주문 등록에 영향 없음)
            // orderId: 저장된 주문 id(넘어오면 서버가 그 주문으로 order_item 범위 축소). 서버가 대기물
            // ai_analysis_id 로 통과 라인(-3)을 역추적해 라인별 order_item_id 를 링크(§4.2 배치 매핑).
            window.ofIntakeAbsorbAll = async function(orderId) {
                var marks = document.querySelectorAll('input[name^="intake_id_"]');
                var __failed = 0; // #533: 실패 건수 집계 → 사용자에게 1회 통지(주문 등록 자체는 막지 않음)
                for (var i = 0; i < marks.length; i++) {
                    var iid = parseInt(marks[i].value, 10);
                    if (!iid) continue;
                    var rowId = marks[i].name.slice('intake_id_'.length);
                    var aidEl = document.querySelector('[name="ai_analysis_id_' + rowId + '"]');
                    var aid = (aidEl && aidEl.value !== '') ? parseInt(aidEl.value, 10) : null;
                    var payload = {};
                    if (orderId) payload.order_id = orderId;
                    if (aid) payload.ai_analysis_id = aid;
                    try {
                        await axios.post('/api/workbench/intakes/' + iid + '/absorb', payload);
                    } catch (e) {
                        __failed++;
                        console.warn('[orderForm] 대기물 absorb 실패 (intake #' + iid + ')', e);
                    }
                }
                // 토스트 폭주 방지: 루프 종료 후 실패분이 있을 때만 1회
                if (__failed > 0 && typeof showToast === 'function') showToast('대기물 ' + __failed + '건 연동 실패 — 관리자에게 문의', 'error');
            };
