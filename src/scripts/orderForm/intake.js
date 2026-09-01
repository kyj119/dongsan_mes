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
            // '처리됨 보기'(2026-07-31): absorbed·void 조회 모드 — 프리필 금지·복구 전용
            var _ofTrayDone = false;
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
                // 피커가 '처리됨 보기'로 열려 있으면 캐시를 건드리지 않는다(배지의 waiting 결과가
                //   done 목록을 덮어쓰는 경합 방지, 2026-07-31). 배지 자체는 로컬 rows/meta로 그린다.
                var _pickerDone = _ofTrayDone && !!document.getElementById('intakePickerOverlay');
                if (!_pickerDone) _ofIntakeCache = [];
                // mode=single,both — 주문서 트레이는 '단건' 용도만 다룬다. 모아찍기용은 ia-editor 담당이라
                // 여기 뜨면 주문 라인으로 불러올 수 없는 조각이 목록을 채우는 노이즈가 된다(2026-07-28).
                axios.get('/api/workbench/intakes', { params: { status: 'waiting', limit: 200, lite: 1, mode: 'single,both' } })
                    .then(function(res) {
                        var d = res.data || {};
                        var rows = d.data || [];
                        if (!rows.length) return;
                        // #576 서버가 준 전체 건수·담당자 마스터 — 200건 상한 밖도 존재를 알리기 위함
                        var meta = { total: d.total != null ? d.total : rows.length, truncated: !!d.truncated, workerNames: d.worker_names || [] };
                        if (!_pickerDone) { _ofIntakeCache = rows; _ofIntakeMeta = meta; }
                        var mine = 0;
                        if (_ofTrayMyId != null) {
                            for (var i = 0; i < rows.length; i++) if (Number(rows[i].worker_id) === _ofTrayMyId) mine++;
                        }
                        // 이 거래처 대기물 수 — 거래처를 정하면 트레이가 '이 거래처만'으로 자동 열리는데
                        //   배지는 전체 건수만 보여줘서 "거래처를 정했는데 숫자가 안 바뀐다"로 보였다(2026-07-30).
                        //   ⚠️ 상한(200) 밖은 셀 수 없으므로 절단 상태면 '+'로 최소값임을 밝힌다.
                        var cIdEl0 = document.getElementById('clientId');
                        var curClientId = cIdEl0 && cIdEl0.value ? Number(cIdEl0.value) : null;
                        var forClient = 0;
                        if (curClientId) {
                            for (var ci = 0; ci < rows.length; ci++) if (Number(rows[ci].client_id) === curClientId) forClient++;
                        }
                        badge.innerHTML = '<button type="button" onclick="ofIntakeOpenPicker()" '
                            + 'class="px-3 py-1.5 text-sm rounded-lg bg-amber-100 text-amber-800 border border-amber-300 hover:bg-amber-200">'
                            + '<i class="fas fa-inbox mr-1"></i>가공 대기함 <b>' + meta.total + '</b>건'
                            + (meta.truncated ? ' <span class="text-amber-700">(최근 ' + rows.length + '건 표시)</span>' : '')
                            + (curClientId
                                ? ' <span class="text-blue-700">(이 거래처 ' + forClient + (meta.truncated ? '+' : '') + ')</span>'
                                : '')
                            + (mine ? ' <span class="text-purple-700">(내 작업 ' + mine + ')</span>' : '')
                            + ' — 클릭해서 라인으로 불러오기</button>';
                    })
                    .catch(function(e) { console.warn('[orderForm] 가공 대기물 조회 실패', e); }); // 권한 없음(403) 등은 조용히 무시
            };
            // client.js selectClient() 훅 — 거래처 변경 시 재조회(주문선행 자동필터는 트레이 오픈 시 반영)
            window.ofIntakeOnClientSelected = function() { ofIntakeRefreshBadge(); };
            // ── 담당자 셀렉트 채우기 (#604 · 2026-08-10 후보 축소) ────────────────
            // 담당자 컬럼은 `employees` 를 가리키지만 **고를 수 있는 사람은 사용자 관리(users) 기준**
            //   — 디자이너·관리자만(서버 `/api/orders/sales-rep-options` 가 규칙 정본).
            //   비워 두면 서버가 로그인 사용자로 채운다(create.ts). 그래서 여기서 강제 선택하지 않는다.
            // ⚠️ 수정 진입 시 **현재 담당자가 후보 밖일 수 있다**(이관분의 MES 계정 없는 영업).
            //   옵션에 없는 값을 select 에 넣으면 조용히 '' 가 되어 저장할 때마다 담당자가 지워진다
            //   → 현재 값을 `include` 로 서버에 알려 후보에 합류시킨다.
            async function ofLoadSalesReps() {
                var el = document.getElementById('salesRepId');
                if (!el) { console.warn('[orderForm] #salesRepId not found'); return; }
                try {
                    // 수정 진입이 먼저 끝났으면 dataset.pending 에 의도값이 있다(parent.js 참조).
                    //   옵션을 갈아끼우면 현재 선택이 날아가므로 **둘 다** 본다.
                    var want = el.dataset.pending || el.value;
                    var url = '/api/orders/sales-rep-options' + (want ? '?include=' + encodeURIComponent(want) : '');
                    var res = await axios.get(url);
                    var list = (res.data && res.data.data) || [];
                    el.innerHTML = '<option value="">(미지정 — 저장 시 로그인 사용자)</option>'
                        + list.map(function(e) {
                            return '<option value="' + e.id + '">' + escapeHtml(e.name || '')
                                + (e.department ? ' · ' + escapeHtml(e.department) : '')
                                + (e.is_current ? ' (현재 담당)' : '') + '</option>';
                        }).join('');
                    if (want) el.value = want;
                } catch (err) {
                    console.warn('[orderForm] 담당자 목록 로드 실패', err);
                }
            }
            // 수정 진입(parent.js)이 dataset.pending 을 채운 뒤 호출 — 현재 담당자를 include 로 합류시켜 재로드
            window.ofReloadSalesReps = ofLoadSalesReps;

            // 폼 로드 시 1회 노출 (거래처 선택 전에도 대기물 보이게)
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', function() { ofIntakeRefreshBadge(); ofLoadSalesReps(); });
            } else {
                ofIntakeRefreshBadge();
                ofLoadSalesReps();
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
                // 처리됨 모드: 상태 배지 표시 + 행 클릭 프리필 차단(복구 선택만)
                var stBadge = !_ofTrayDone ? ''
                    : (r.status === 'absorbed'
                        ? '<span class="inline-block px-1.5 rounded bg-blue-100 text-blue-700 text-xs mr-1">주문반영</span>'
                        : '<span class="inline-block px-1.5 rounded bg-gray-200 text-gray-600 text-xs mr-1">취소됨</span>');
                return '<div class="flex items-center gap-2 px-3 py-2 border-b border-gray-100 hover:bg-blue-50">'
                    + '<input type="checkbox" ' + (_ofTraySel[r.id] ? 'checked ' : '') + 'onchange="ofTrayRowSel(' + r.id + ', this.checked)" class="itk-row-chk flex-none">'
                    + thumb
                    + (_ofTrayDone
                        ? '<div class="flex-1 min-w-0">'
                        : '<div class="flex-1 min-w-0 cursor-pointer" onclick="ofIntakePick(' + r.id + ')" title="클릭 시 이 대기물만 라인으로 추가">')
                    + '<div class="text-sm truncate">'
                    + stBadge
                    + (seq != null ? '<span class="inline-block px-1.5 rounded bg-gray-200 text-gray-700 text-xs mr-1">#' + seq + '</span>' : '')
                    + '<span class="font-medium">' + (r.width_cm != null ? r.width_cm : '?') + '×' + (r.height_cm != null ? r.height_cm : '?') + 'cm ×' + (r.qty || 1) + '</span>'
                    // 「조」로 입력된 건 = 파일 한 장이 낱개 두 장. 수량은 이미 **개**이고(패널이 환산),
                    //   여기 병기는 접수자가 눈으로 검산하라고 두는 것이다(0548 qty_unit).
                    + (r.qty_unit === 'set' ? '<span class="ml-1 px-1 rounded bg-indigo-50 text-indigo-700 text-[11px]">' + Math.round((r.qty || 2) / 2) + '조</span>' : '')
                    // 품목이 해소된 대기물은 초록 배지로 구분 — 프리필하면 단가까지 채워진다(0532)
                    + (r.item_name ? ' · <span class="text-green-700 font-medium">' + escapeHtml(r.item_name) + '</span>' : '')
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
                    + (_ofTrayDone ? '' : '<i class="fas fa-plus text-blue-400 flex-none"></i>')
                    + '</div>';
            }

            // 건수 문구 — **보이는 건수가 정본**이고, 감춰진 것이 있으면 이유와 함께 밝힌다(2026-07-30).
            //   전엔 헤더가 서버 반환 건수(=필터 전)만 보여줘서 한 화면에 세 숫자가 어긋났다:
            //   실측 — 헤더 `39건` / 거래처 그룹 `12건` / 실제 행 12개. '이 거래처만'이 자동 ON 인데도
            //   헤더가 39 라서 "거래처를 정했는데 수량이 안 바뀐다"로 보였다.
            //   갱신 지점도 서버 검색(ofTraySearch)뿐이어서 화면 필터를 만져도 헤더가 굳어 있었다.
            function ofTrayCountText(shown) {
                var loaded = (_ofIntakeCache || []).length;
                var total = _ofIntakeMeta.total || loaded;
                var s = '(' + shown + '건';
                if (shown !== loaded) s += ' 표시 · 조회 ' + loaded + '건';   // 화면 필터가 가린 만큼
                if (_ofIntakeMeta.truncated && total > loaded) s += ' / 전체 ' + total + '건';
                return s + ')';
            }
            function ofTraySetCount(shown) {
                var el = document.getElementById('intakeTrayCount');
                if (el) el.textContent = ofTrayCountText(shown);
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
                            + (_ofTrayDone ? '' // 처리됨 모드는 프리필 진입점 숨김(복구 전용)
                                : '<button type="button" onclick="ofTrayCreateFromGroup(' + gi + ')" '
                                + 'class="flex-none px-2 py-0.5 rounded border border-amber-400 bg-white text-amber-800 hover:bg-amber-100" '
                                + 'title="거래처를 상속하고 이 작업의 모든 파일을 라인으로 추가합니다">'
                                + '<i class="fas fa-file-invoice mr-1"></i>이 작업으로 주문 생성</button>')
                            + '</div>';
                        for (var bi = 0; bi < brows.length; bi++) html += ofTrayRowHtml(brows[bi]);
                    });
                });
                if (!html) {
                    // ⚠️ 서버 검색 결과가 있는데 화면이 비면, 클라이언트 필터('내 작업'·'이 거래처만')가
                    //    가린 것이다. 그냥 "없습니다"라고 하면 헤더는 N건인데 목록은 빈 모순으로 보인다.
                    var loaded = (_ofIntakeCache || []).length;
                    html = loaded > 0
                        ? '<div class="p-4 text-center text-sm text-amber-700 bg-amber-50">'
                          + '조회된 ' + loaded + '건이 화면 필터에 가려져 있습니다.'
                          + ' <button type="button" onclick="ofTrayClearViewFilters()" class="underline font-medium">필터 해제</button>'
                          + '</div>'
                        : '<div class="p-4 text-center text-sm text-gray-400">해당 조건의 대기물이 없습니다.</div>';
                }
                listEl.innerHTML = html;
                ofTraySetCount(filtered.length); // 헤더 = 실제 보이는 건수(필터를 만질 때마다 갱신)
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
                var n = Object.keys(_ofTraySel).length;
                var btn = document.getElementById('trayPrefillBtn');
                if (btn) {
                    btn.disabled = !n;
                    btn.innerHTML = _ofTrayDone
                        ? '<i class="fas fa-rotate-left mr-1"></i>선택 ' + n + '건 대기로 복구'
                        : '<i class="fas fa-arrow-down mr-1"></i>선택 ' + n + '건 라인으로 불러오기';
                }
                var vbtn = document.getElementById('trayVoidBtn');
                if (vbtn) {
                    vbtn.style.display = _ofTrayDone ? 'none' : '';
                    vbtn.disabled = !n;
                    vbtn.innerHTML = '<i class="fas fa-trash mr-1"></i>선택 삭제';
                }
            }

            window.ofIntakeOpenPicker = function() {
                var rows = _ofIntakeCache || [];
                if (!rows.length) return;
                var old = document.getElementById('intakePickerOverlay');
                if (old) old.remove();
                _ofTraySel = {};
                _ofTrayDone = false; // 피커는 항상 '대기' 모드로 시작(배지 캐시 = waiting 결과)
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
                    + '<label class="flex items-center gap-1 cursor-pointer text-gray-600" title="주문반영·취소된 대기물 조회 — 선택 후 대기 상태로 복구할 수 있습니다"><input type="checkbox" id="intakeShowDone" onchange="ofTrayDoneToggle(this.checked)"> 처리됨 보기</label>'
                    + '</div>'
                    // #576 서버 검색 — 위 필터들은 로드된 200건 안에서만 걸러내므로 상한 밖은 못 찾는다.
                    + '<div class="px-4 py-2 border-b flex items-center gap-2 text-sm flex-wrap">'
                    // 자동 검색으로 바꾸지 않는 이유 = 서버 호출이라 타이핑마다 질의하면 부하가 붙는다(사용자 결정).
                    //   대신 **입력했는데 아무 일도 안 일어난다**는 오해를 없앤다: placeholder 에 Enter 를 명시하고,
                    //   입력값이 마지막 실행 검색어와 달라지면 옆에 '↵ Enter 로 검색' 을 띄운다.
                    + '<input type="text" id="intakeSearchQ" placeholder="거래처·담당자·메모·묶음 검색 후 Enter" value="' + escapeHtml(_ofTrayQuery.q) + '" '
                    + 'oninput="ofTraySearchDirty()" onkeydown="if(event.key===\'Enter\'){event.preventDefault();ofTraySearch();}" '
                    + 'class="px-2 py-1 border rounded text-sm" style="flex:1;min-width:180px">'
                    + '<span id="intakeSearchDirty" class="text-xs text-amber-700 hidden"><i class="fas fa-turn-down fa-rotate-90 mr-0.5"></i>Enter 로 검색</span>'
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
                    + '<div class="px-4 py-3 border-t bg-gray-50 flex justify-end gap-2">'
                    + '<button type="button" id="trayVoidBtn" disabled onclick="ofTrayVoidSelected()" '
                    + 'class="px-4 py-1.5 text-sm rounded-lg border border-red-300 text-red-600 bg-white disabled:opacity-40 hover:bg-red-50"></button>'
                    + '<button type="button" id="trayPrefillBtn" disabled onclick="ofTrayPrimaryAction()" '
                    + 'class="px-4 py-1.5 text-sm rounded-lg bg-blue-600 text-white disabled:bg-gray-300 hover:bg-blue-700"></button>'
                    + '</div></div>';
                overlay.addEventListener('click', function(ev) { if (ev.target === overlay) overlay.remove(); });
                document.body.appendChild(overlay);
                ofTrayRender();
            };

            // 입력값이 '마지막으로 실행한 검색어'와 다른 동안만 안내를 띄운다 — 검색을 실행하면 사라진다.
            window.ofTraySearchDirty = function() {
                var qEl = document.getElementById('intakeSearchQ');
                var hint = document.getElementById('intakeSearchDirty');
                if (!qEl || !hint) return;
                var dirty = (qEl.value || '').trim() !== (_ofTrayQuery.q || '');
                hint.className = dirty ? 'text-xs text-amber-700' : 'text-xs text-amber-700 hidden';
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
                    // '처리됨 보기'면 absorbed·void 조회(서버 콤마 다중 status)
                    var params = { status: _ofTrayDone ? 'absorbed,void' : 'waiting', limit: 200, lite: 1, mode: 'single,both' };
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
                        // 헤더는 ofTrayRender() 가 화면 필터 적용 후 건수로 갱신한다(정본 1곳).
                        //   여기서 서버 반환 건수로 먼저 써 버리면 다시 두 숫자가 갈린다.
                        var notice = document.getElementById('intakeTruncNotice');
                        if (notice) notice.style.display = _ofIntakeMeta.truncated ? '' : 'none';
                        ofTrayRender();      // 헤더 건수도 여기서 갱신된다(정본 1곳)
                        ofTraySearchDirty(); // 실행 완료 → 'Enter 로 검색' 안내 해제
                        ofTrayUpdateFooter();
                    } catch (e) {
                        console.warn('[orderForm] 대기함 검색 실패', e);
                        if (typeof showToast === 'function') showToast('대기함 검색에 실패했습니다.', 'error');
                    }
                };
                if (typeof safeSubmit === 'function') return safeSubmit(btn, run);
                return run();
            };

            // 화면 필터('내 작업'·담당자·'이 거래처만')만 해제 — 서버 검색 조건은 유지한다.
            window.ofTrayClearViewFilters = function() {
                var my = document.getElementById('intakeMyWork');
                if (my && my.checked) { my.checked = false; try { localStorage.setItem('ofTrayMyWork', '0'); } catch (e) { /* private 모드 */ } }
                var wf = document.getElementById('intakeWorkerFilter');
                if (wf) wf.value = '';
                var co = document.getElementById('intakeClientOnly');
                if (co) co.checked = false;
                ofTrayRender();
                ofTrayUpdateFooter();
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

            // ── 처리됨 보기 · 삭제 · 복구 (2026-07-31) ──────────────────
            window.ofTrayDoneToggle = function(on) {
                _ofTrayDone = !!on;
                _ofTraySel = {};
                ofTraySearch(); // 서버 재조회(waiting ↔ absorbed,void) — 렌더·푸터·건수 갱신 포함
            };

            // 푸터 주 버튼: 대기 모드=프리필 / 처리됨 모드=복구
            window.ofTrayPrimaryAction = function() {
                return _ofTrayDone ? ofTrayRestoreSelected() : ofTrayPrefillSelected();
            };

            window.ofTrayVoidSelected = async function() {
                var ids = Object.keys(_ofTraySel).map(Number);
                if (!ids.length) return;
                if (typeof showConfirm === 'function'
                    && !(await showConfirm('선택 ' + ids.length + '건을 대기함에서 삭제(취소)할까요?\n"처리됨 보기"에서 다시 대기로 복구할 수 있습니다.'))) return;
                try {
                    var res = await axios.post('/api/workbench/intakes/void-bulk', { ids: ids });
                    var d = (res.data && res.data.data) || {};
                    var msg = '삭제 ' + (d.voided || 0) + '건';
                    if (d.denied) msg += ' · 권한 없음 ' + d.denied + '건(등록 본인·관리자만)';
                    if (d.skipped) msg += ' · 이미 처리됨 ' + d.skipped + '건';
                    if (typeof showToast === 'function') showToast(msg, d.voided ? 'info' : 'warning');
                } catch (e) {
                    console.warn('[orderForm] 대기물 삭제 실패', e);
                    if (typeof showToast === 'function') showToast('삭제에 실패했습니다.', 'error');
                }
                _ofTraySel = {};
                await ofTraySearch();   // 목록 정본 재조회
                ofIntakeRefreshBadge(); // 배지 waiting 건수 갱신
            };

            window.ofTrayRestoreSelected = async function() {
                var ids = Object.keys(_ofTraySel).map(Number);
                if (!ids.length) return;
                // 건별 격리 + 실패 집계 1회 통지(#575 패턴) — 복구는 대량이 드물어 bulk API 없이 순차
                var ok = 0, fail = 0, failMsg = '';
                for (var i = 0; i < ids.length; i++) {
                    try {
                        await axios.post('/api/workbench/intakes/' + ids[i] + '/restore');
                        ok++;
                    } catch (e) {
                        fail++;
                        failMsg = (e && e.response && e.response.data && e.response.data.error) || failMsg;
                        console.warn('[orderForm] 대기물 복구 실패 (intake #' + ids[i] + ')', e);
                    }
                }
                if (typeof showToast === 'function') {
                    if (!fail) showToast('대기물 ' + ok + '건을 대기 상태로 복구했습니다.', 'info');
                    else showToast('복구 ' + ok + '건 / 실패 ' + fail + '건' + (failMsg ? ' — ' + failMsg : ''), ok ? 'warning' : 'error');
                }
                _ofTraySel = {};
                await ofTraySearch();
                ofIntakeRefreshBadge();
            };

            // ── 프리필 (단건·그룹·선택 일괄) ─────────────────────────────

            // 펀칭 보류 — 후가공(PP) 섹션은 **품목 소분류가 정해진 뒤에야** 생긴다(finishing.js loadItemPP).
            //   마감(fin_*)은 품목과 무관해 지금 바로 꽂히지만 펀칭은 꽂을 칸 자체가 없다.
            //   그래서 값을 행의 PP 컨테이너에 얹어 두고, loadItemPP 가 렌더 직후 applyPendingPunch 로 꺼낸다.
            //   품목을 사람이 나중에 골라도 그때 반영된다 — 패널이 이미 받은 값을 다시 고르지 않게 하는 것.
            function ofStashPunch(rowId, punchJson) {
                if (!punchJson) return;
                var p;
                try { p = (typeof punchJson === 'string') ? JSON.parse(punchJson) : punchJson; } catch (e) { return; }
                if (!p) return;
                var c = p.corners || {};
                var any = ((p.top || 0) + (p.bottom || 0) + (p.left || 0) + (p.right || 0)) > 0
                    || !!c.tl || !!c.tr || !!c.bl || !!c.br;
                if (!any) return; // 펀칭 없음 = 체크를 켜지 않는다(빈 값으로 켜면 단가만 붙는다)
                var box = document.getElementById('pp_options_' + rowId);
                if (box) box.dataset.pendingPunch = JSON.stringify(p);
            }

            // 대기물 1건 → 주문 라인 1개 (라인별 intake_id 마커 → 저장 후 absorb가 order_item_id 매핑)
            async function ofIntakePrefillOne(r) {
                // 빈 라인이 있으면 그 라인을 채운다(주문서를 열면 있는 라인1이 남지 않도록).
                var id = window.claimItemRow ? window.claimItemRow() : (addItemRow(), itemCount);

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

                // 품목 프리필(0532) — Z: 스캔이 파일명 제품유형을 품목으로 해소해 실어 보낸 경우.
                //   ★품목이 정해지면 단가까지 따라온다(/api/prices 최근거래가 > 특약가 > 단가표 > 기본단가).
                //   itemRow.js 의 applyItemSelection 을 그대로 쓴다 — 재구현하면 두 벌이 갈린다.
                //   item_id 가 없으면(미해소) 아무것도 하지 않는다. 사람이 고른다.
                if (r.item_id && window.__ofApplyItem && window.__ofApplyItem[id]) {
                    try {
                        var itRes = await axios.get('/api/items/' + r.item_id);
                        var itD = (itRes.data && itRes.data.data) || null;
                        if (itD) {
                            window.__ofApplyItem[id]({
                                id: itD.id, name: itD.item_name, price: itD.base_price || 0,
                                unit: itD.unit || 'EA',
                                category: itD.category || itD.category_direct || '',
                                sub_category: itD.sub_category || itD.sub_category_direct || '',
                                pricing_method: itD.pricing_method || 'FIXED',
                                specification: itD.specification || '',
                                width_mm: itD.width_mm || '',
                                item_type: itD.item_type || ''
                            });
                            // applyItemSelection 이 규격칸을 건드릴 수 있어 대기물 실측을 다시 얹는다
                            if (wEl && r.width_cm != null) wEl.value = r.width_cm;
                            if (hEl && r.height_cm != null) hEl.value = r.height_cm;
                            if (qEl && r.qty) qEl.value = r.qty;
                        }
                    } catch (e) { console.warn('[orderForm] 대기물 품목 프리필 실패', e); }
                }

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

                // 펀칭 — 품목 선택 후 PP 섹션이 생길 때 반영된다(ofStashPunch 주석)
                ofStashPunch(id, r.punch_json);

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
                if (_ofTrayDone) return; // 처리됨 모드는 프리필 금지(복구 전용)
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

            // ── 자동 묶음 (2026-07-31 결정) ──────────────────────────────
            // 규격+마감+배율(+거래처) 동일 2건 이상 → 묶음 품목(부모 1 + 자식 N)으로 프리필.
            //   마감을 키에 넣는 이유: 마감은 부모 행 1곳에만 실려 자식 전체에 상속되므로,
            //   다른 마감을 한 묶음에 섞으면 일부 대기물의 마감 정보가 유실된다.
            //   규격 미상(width/height null)은 묶음 불가 → null 반환(개별 라인).
            function ofTrayBundleKey(r) {
                if (r.width_cm == null || r.height_cm == null) return null;
                // ★재단 패널 네스팅 시트는 절대 묶지 않는다(2026-08-05).
                //   묶음 키가 '규격'을 보는데 재단 시트의 규격은 **시트(롤/평판) 크기**라 폭이 고정이다
                //   → 내용이 전혀 다른 시트 2장이 같은 부모(=단일 품목·단가 1행)로 합쳐지고,
                //     시트별 단가를 못 실어 청구가 조용히 틀어진다. 시트 단가 청구가 확정 방침이므로
                //     시트는 언제나 자기 라인 1개를 갖는다.
                //   판별 = script_version 접두(mes-cut-host.jsx MESCUT_VERSION = 'CUT-CEP-*').
                //   lite 목록이 designer_intakes.* 를 그대로 주므로(workbench.ts) 추가 조회가 필요 없다.
                if (String(r.script_version || '').indexOf('CUT-CEP') === 0) return null;
                var fin = '';
                try {
                    var fj = r.finishing_json ? JSON.parse(r.finishing_json) : null;
                    if (fj) fin = ['top', 'bottom', 'left', 'right'].map(function(d) {
                        return (fj[d] || '') + ':' + (fj[d + '_cm'] != null ? fj[d + '_cm'] : '');
                    }).join('|');
                } catch (e) { fin = String(r.finishing_json || ''); } // 파싱불가 마감은 원문 일치로만 묶음
                var ck = r.client_id ? ('c' + r.client_id) : ('n:' + (r.client_name || ''));
                return [ck, r.width_cm, r.height_cm, r.scale_pct || 100, fin].join('§');
            }

            // 동일 조건 대기물 N건 → 묶음 품목. 청구·마감은 부모, 파일연결은 자식별
            //   (자식 = ai_group_index -3 passthrough + 자기 ai_analysis_id → 저장 후
            //    absorb 역추적·카드 편입·에이전트 출력이 기존 묶음 플로우를 그대로 탄다).
            async function ofIntakePrefillBundle(rows) {
                var r0 = rows[0];
                var sf = (r0.scale_pct && r0.scale_pct < 100) ? Math.round(100 / r0.scale_pct) : 1;
                var parentId = addParentItemRow(rows.length);
                var sfEl = document.querySelector('[name="scale_factor_' + parentId + '"]');
                if (sfEl) sfEl.value = sf; // 자식 행 생성 전에 설정(addChildItemRow가 참조)
                var wEl = document.querySelector('[name="width_' + parentId + '"]');
                if (wEl) { wEl.value = r0.width_cm; wEl.dataset.origMm = String(r0.width_cm * 10 / sf); }
                var hEl = document.querySelector('[name="height_' + parentId + '"]');
                if (hEl) { hEl.value = r0.height_cm; hEl.dataset.origMm = String(r0.height_cm * 10 / sf); }

                // 마감: 부모 행에 주입(자식 카드 상속) — ofIntakePrefillOne과 동일 스키마
                try {
                    if (typeof loadFinishingForOrder === 'function') await loadFinishingForOrder(parentId);
                    var fj2 = r0.finishing_json ? JSON.parse(r0.finishing_json) : null;
                    if (fj2) {
                        var vals = [];
                        ['top', 'bottom', 'left', 'right'].forEach(function(dir) {
                            var sel = document.querySelector('[name="fin_' + dir + '_' + parentId + '"]');
                            if (sel && fj2[dir]) sel.value = fj2[dir];
                            var cmIn = document.querySelector('[name="fin_cm_' + dir + '_' + parentId + '"]');
                            if (cmIn && fj2[dir + '_cm'] != null) cmIn.value = fj2[dir + '_cm'];
                            vals.push(fj2[dir] || '');
                        });
                        if (!(vals[0] === vals[1] && vals[0] === vals[2] && vals[0] === vals[3])) {
                            var sides = document.getElementById('finishing_sides_' + parentId);
                            if (sides) sides.classList.remove('hidden');
                        }
                        if (typeof calcFinishing === 'function') calcFinishing(parentId);
                    }
                } catch (e) { console.warn('[orderForm] 묶음 마감 주입 실패', e); }

                // 펀칭도 마감과 같이 **부모 행에만** 얹는다 — 자식 카드가 상속한다(묶음 키가 마감을 보는 이유와 동일)
                ofStashPunch(parentId, r0.punch_json);

                var okIds = [], failed = [];
                for (var i = 0; i < rows.length; i++) {
                    var r = rows[i];
                    try {
                        var thumb = r.has_thumbnail ? await ofIntakeThumbGet(r.id) : null;
                        // addChildItemRow는 raw base64를 기대 — data: 접두 제거
                        if (thumb && thumb.indexOf('data:') === 0) thumb = thumb.slice(thumb.indexOf(',') + 1);
                        var childId = addChildItemRow(parentId, {
                            index: i + 1,
                            label: '완성본',
                            ai_group_index: -3,
                            width_mm: r.width_cm * 10 / sf,
                            height_mm: r.height_cm * 10 / sf,
                            thumbnail_base64: thumb || null,
                            _analysis_id: r.ai_analysis_id || '',
                            content: r.keyword || '', // 내용 = 키워드(직결) — 단건 프리필과 동일
                            qty: r.qty || 1
                        });
                        var rowEl = document.getElementById('item_row_' + childId);
                        if (rowEl) {
                            var mark = document.createElement('input');
                            mark.type = 'hidden';
                            mark.name = 'intake_id_' + childId; // 저장 후 ofIntakeAbsorbAll 수거 대상
                            mark.value = String(r.id);
                            rowEl.appendChild(mark);
                            // AI_PROCESS 태스크 트리거용 — calc.js 직접연결 수집이 자식 행도 읽는다
                            var df = document.createElement('input');
                            df.type = 'hidden';
                            df.name = 'child_direct_file_path_' + childId;
                            df.value = r.eps_path || r.work_ai_path || '';
                            rowEl.appendChild(df);
                        }
                        okIds.push(r.id);
                    } catch (e) {
                        failed.push(r);
                        console.warn('[orderForm] 묶음 자식 프리필 실패 (intake #' + (r && r.id) + ')', e);
                    }
                }
                if (!okIds.length) {
                    // 자식이 전멸하면 빈 부모만 남는다 → 제거(저장 검증에 걸리는 유령 행 방지)
                    var pEl = document.getElementById('item-' + parentId);
                    if (pEl) pEl.remove();
                    if (typeof renumberDisplay === 'function') renumberDisplay();
                } else {
                    if (typeof updateParentChildCount === 'function') updateParentChildCount(parentId);
                    if (typeof calcItem === 'function') calcItem(parentId);
                    // 묶음은 부모+자식 구조라 기존 빈 라인을 재사용할 수 없다 → 남은 빈 라인 하나를 걷어낸다
                    //   (단건 프리필의 claimItemRow 와 같은 목적: 빈 라인1이 남지 않게).
                    if (window.dropOneEmptyItemRow) window.dropOneEmptyItemRow();
                }
                return { ids: okIds, failed: failed };
            }

            // #575 항목별 try/catch — 예전엔 가드가 없어서 중간 1건이 던지면 루프가 통째로 중단되고
            //   뒤처리(ofTrayAfterPrefill = 대기함 캐시 정리 + 완료 안내)까지 도달하지 못했다.
            //   결과: 앞쪽 항목은 폼에 들어갔는데 대기함 상태는 그대로 → 같은 항목을 또 프리필해
            //   라인이 중복되고, 사용자에겐 에러 토스트조차 없이 조용히 멈췄다.
            //   같은 파일 ofIntakeAbsorbAll(#533)이 쓰는 "건별 격리 + 실패 집계 1회 통지" 패턴을 맞춘다.
            //   성공분만 ofTrayAfterPrefill로 넘겨 실패한 대기물은 대기함에 남긴다(재시도 가능).
            async function ofTrayPrefillRows(rows) {
                var overlay = document.getElementById('intakePickerOverlay');
                if (overlay) overlay.remove();
                // 묶음 판정: 표시 순서(첫 등장) 유지하며 동일 키끼리 수집
                var byKey = {}, seq = [];
                rows.forEach(function(r) {
                    var k = ofTrayBundleKey(r);
                    if (k != null && byKey[k]) { byKey[k].rows.push(r); return; }
                    var entry = { key: k, rows: [r] };
                    if (k != null) byKey[k] = entry;
                    seq.push(entry);
                });
                var ids = [];
                var failed = [];
                var bundles = 0;
                for (var gi = 0; gi < seq.length; gi++) {
                    var g = seq[gi];
                    if (g.key != null && g.rows.length >= 2) {
                        var res = await ofIntakePrefillBundle(g.rows);
                        ids = ids.concat(res.ids);
                        failed = failed.concat(res.failed);
                        if (res.ids.length) bundles++;
                        continue;
                    }
                    for (var ri = 0; ri < g.rows.length; ri++) {
                        try {
                            await ofIntakePrefillOne(g.rows[ri]);
                            ids.push(g.rows[ri].id);
                        } catch (e) {
                            failed.push(g.rows[ri]);
                            console.warn('[orderForm] 대기물 프리필 실패 (intake #' + (g.rows[ri] && g.rows[ri].id) + ')', e);
                        }
                    }
                }
                if (ids.length > 0) ofTrayAfterPrefill(ids);
                if (typeof showToast === 'function') {
                    var bundleNote = bundles ? ' (동일 규격·마감 → 묶음 ' + bundles + '개 자동 구성)' : '';
                    if (failed.length === 0) {
                        showToast('대기물 ' + ids.length + '건을 라인으로 불러왔습니다.' + bundleNote + ' 품목·단가를 확인해 주세요.', 'info');
                    } else if (ids.length === 0) {
                        showToast('대기물 ' + failed.length + '건을 불러오지 못했습니다. 새로고침 후 다시 시도해 주세요.', 'error');
                    } else {
                        showToast('대기물 ' + ids.length + '건 불러옴' + bundleNote + ' / ' + failed.length + '건 실패 — 실패분은 대기함에 그대로 남아 있습니다.', 'warning');
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
                    var aidEl = document.querySelector('[name="ai_analysis_id_' + rowId + '"]')
                        || document.querySelector('[name="child_ai_analysis_id_' + rowId + '"]'); // 묶음 자식 행
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
