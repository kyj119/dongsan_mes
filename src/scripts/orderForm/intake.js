// orderForm/intake.js — 디자이너 가공 대기물(designer_intakes) 프리필 피커
// spec: docs/superpowers/specs/2026-07-16-ia-designer-session-loop.md §4.4
// 흐름: 거래처 선택(client.js selectClient 훅) → 대기물 배지 → 피커 모달
//        → 라인 자동 채움(크기·마감·수량·ai_analysis_id·썸네일) → 주문 저장 성공 후 absorb(calc.js 훅)

            var _ofIntakeCache = []; // 현재 거래처의 waiting 대기물

            function ofIntakeThumbSrc(t) {
                if (!t) return '';
                return t.indexOf('data:') === 0 ? t : ('data:image/png;base64,' + t);
            }

            // 대기물 배지 — 거래처 무관 전체 waiting (2026-07-17: 거래처 필터 제거, 식별=썸네일)
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
                axios.get('/api/workbench/intakes', { params: { status: 'waiting', limit: 50 } })
                    .then(function(res) {
                        var rows = (res.data && res.data.data) || [];
                        if (!rows.length) return;
                        _ofIntakeCache = rows;
                        badge.innerHTML = '<button type="button" onclick="ofIntakeOpenPicker()" '
                            + 'class="px-3 py-1.5 text-sm rounded-lg bg-amber-100 text-amber-800 border border-amber-300 hover:bg-amber-200">'
                            + '<i class="fas fa-inbox mr-1"></i>가공 대기물 <b>' + rows.length + '</b>건 — 클릭해서 라인으로 불러오기</button>';
                    })
                    .catch(function(e) { console.warn('[orderForm] 가공 대기물 조회 실패', e); }); // 권한 없음(403) 등은 조용히 무시
            };
            // client.js selectClient() 훅 호환 (거래처 변경 시 재조회)
            window.ofIntakeOnClientSelected = function() { ofIntakeRefreshBadge(); };
            // 폼 로드 시 1회 노출 (거래처 선택 전에도 대기물 보이게)
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', function() { ofIntakeRefreshBadge(); });
            } else {
                ofIntakeRefreshBadge();
            }

            // 피커 행 1개 HTML (담당자·키워드·후가공 표기)
            function ofIntakeRowHtml(r) {
                var thumb = r.thumbnail
                    ? '<img src="' + escapeHtml(ofIntakeThumbSrc(r.thumbnail)) + '" style="width:56px;height:56px;object-fit:contain;background:#f3f4f6;border-radius:6px;flex:none">'
                    : '<div style="width:56px;height:56px;background:#f3f4f6;border-radius:6px;flex:none"></div>';
                var fin = '';
                try {
                    var fj = r.finishing_json ? JSON.parse(r.finishing_json) : null;
                    if (fj) {
                        var parts = [];
                        ['top', 'bottom', 'left', 'right'].forEach(function(d) { if (fj[d]) parts.push(fj[d]); });
                        fin = parts.filter(function(v, ix) { return parts.indexOf(v) === ix; }).join('·');
                    }
                } catch (e) { /* 표시용 파싱 실패 무시 */ }
                var modeKo = r.mode === 'impose' ? '모아찍기용' : (r.mode === 'both' ? '단건+모아찍기' : '단건');
                return '<div class="client-modal-row flex items-center gap-3" onclick="ofIntakePick(' + r.id + ')">'
                    + thumb
                    + '<div class="flex-1 min-w-0">'
                    + '<div class="font-medium text-sm truncate">' + escapeHtml(r.client_name || '') + ' · '
                    + (r.width_cm != null ? r.width_cm : '?') + '×' + (r.height_cm != null ? r.height_cm : '?') + 'cm ×' + (r.qty || 1)
                    + (r.keyword ? ' · <span class="text-blue-600">' + escapeHtml(r.keyword) + '</span>' : '') + '</div>'
                    + '<div class="text-xs text-gray-500 truncate">'
                    + (r.worker_name ? '<span class="text-purple-600">' + escapeHtml(r.worker_name) + '</span> · ' : '')
                    + (fin ? escapeHtml(fin) : '마감 없음')
                    + (r.post_desc ? ' · ' + escapeHtml(r.post_desc) : '')
                    + (r.trim ? ' · 돔보' : '')
                    + (r.scale_pct && r.scale_pct < 100 ? ' · 1/' + Math.round(100 / r.scale_pct) : '')
                    + ' · ' + modeKo
                    + (r.outline_failed ? ' · <span class="text-red-500">아웃라인 실패</span>' : '')
                    + ' · ' + ((typeof formatKST === 'function' && r.created_at) ? formatKST(r.created_at) : escapeHtml(String(r.created_at || '').slice(0, 16)))
                    + '</div></div>'
                    + '<i class="fas fa-plus text-blue-500"></i>'
                    + '</div>';
            }

            // 필터 적용(클라이언트측): 담당자 + '이 거래처만'(현재 거래처 또는 미지정)
            window.ofIntakeApplyFilter = function() {
                var rows = _ofIntakeCache || [];
                var wSel = document.getElementById('intakeWorkerFilter');
                var cChk = document.getElementById('intakeClientOnly');
                var w = wSel ? wSel.value : '';
                var clientOnly = cChk && cChk.checked;
                var curClient = '';
                var cs = document.getElementById('clientSearch');
                if (cs) curClient = (cs.value || '').trim();
                var filtered = rows.filter(function(r) {
                    if (w && (r.worker_name || '') !== w) return false;
                    if (clientOnly && curClient) {
                        if ((r.client_name || '') !== curClient && (r.client_name || '') !== '미지정') return false;
                    }
                    return true;
                });
                var listEl = document.getElementById('intakeList');
                if (!listEl) return;
                if (!filtered.length) { listEl.innerHTML = '<div class="p-4 text-center text-sm text-gray-400">해당 조건의 대기물이 없습니다.</div>'; return; }
                var html = '';
                for (var i = 0; i < filtered.length; i++) html += ofIntakeRowHtml(filtered[i]);
                listEl.innerHTML = html;
            };

            window.ofIntakeOpenPicker = function() {
                var rows = _ofIntakeCache || [];
                if (!rows.length) return;
                var old = document.getElementById('intakePickerOverlay');
                if (old) old.remove();
                var workers = [];
                for (var i = 0; i < rows.length; i++) {
                    var wn = rows[i].worker_name;
                    if (wn && workers.indexOf(wn) === -1) workers.push(wn);
                }
                var wOpts = '<option value="">담당자 전체</option>';
                for (var k = 0; k < workers.length; k++) wOpts += '<option value="' + escapeHtml(workers[k]) + '">' + escapeHtml(workers[k]) + '</option>';
                var overlay = document.createElement('div');
                overlay.className = 'client-modal-overlay';
                overlay.id = 'intakePickerOverlay';
                overlay.innerHTML = '<div class="client-modal" style="max-width:640px">'
                    + '<div class="px-4 py-3 border-b flex items-center justify-between">'
                    + '<b><i class="fas fa-inbox mr-1 text-amber-600"></i>가공 대기물 (' + rows.length + '건)</b>'
                    + '<button type="button" onclick="document.getElementById(\'intakePickerOverlay\').remove()" class="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>'
                    + '</div>'
                    + '<div class="px-4 py-2 border-b flex items-center gap-3 text-sm bg-gray-50">'
                    + '<select id="intakeWorkerFilter" onchange="ofIntakeApplyFilter()" class="px-2 py-1 border rounded text-sm">' + wOpts + '</select>'
                    + '<label class="flex items-center gap-1 cursor-pointer text-gray-600"><input type="checkbox" id="intakeClientOnly" onchange="ofIntakeApplyFilter()"> 이 거래처만</label>'
                    + '</div>'
                    + '<div id="intakeList" style="max-height:60vh;overflow-y:auto"></div></div>';
                overlay.addEventListener('click', function(ev) { if (ev.target === overlay) overlay.remove(); });
                document.body.appendChild(overlay);
                ofIntakeApplyFilter();
            };

            window.ofIntakePick = async function(intakeId) {
                var r = null;
                for (var i = 0; i < _ofIntakeCache.length; i++) {
                    if (_ofIntakeCache[i].id === intakeId) { r = _ofIntakeCache[i]; break; }
                }
                if (!r) return;
                var overlay = document.getElementById('intakePickerOverlay');
                if (overlay) overlay.remove();

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

                // 썸네일
                if (r.thumbnail) {
                    var thumbDiv = document.getElementById('thumb_' + id);
                    var thumbImg = document.getElementById('thumb_img_' + id);
                    if (thumbDiv && thumbImg) {
                        thumbImg.src = ofIntakeThumbSrc(r.thumbnail);
                        thumbDiv.classList.remove('hidden');
                    }
                }

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

                // absorb 대상 마커 (주문 저장 성공 후 calc.js 훅이 수거)
                var rowEl = document.getElementById('item-' + id);
                if (rowEl) {
                    var mark = document.createElement('input');
                    mark.type = 'hidden';
                    mark.name = 'intake_id_' + id;
                    mark.value = String(intakeId);
                    rowEl.appendChild(mark);
                }

                if (typeof calcItem === 'function') calcItem(id);
                if (typeof calculateTotal === 'function') calculateTotal();

                // 배지 갱신 (남은 대기물 수)
                _ofIntakeCache = _ofIntakeCache.filter(function(x) { return x.id !== intakeId; });
                var badge = document.getElementById('intakeBadge');
                if (badge) {
                    badge.innerHTML = _ofIntakeCache.length
                        ? '<button type="button" onclick="ofIntakeOpenPicker()" class="px-3 py-1.5 text-sm rounded-lg bg-amber-100 text-amber-800 border border-amber-300 hover:bg-amber-200">'
                          + '<i class="fas fa-inbox mr-1"></i>가공 대기물 <b>' + _ofIntakeCache.length + '</b>건 — 클릭해서 라인으로 불러오기</button>'
                        : '<span class="text-xs text-green-600"><i class="fas fa-check mr-1"></i>대기물을 모두 불러왔습니다 (주문 저장 시 흡수 처리)</span>';
                }
                var pickMsg = '대기물을 라인으로 불러왔습니다. 품목·단가를 확인해 주세요.';
                if (r.post_desc) pickMsg += ' (후가공: ' + r.post_desc + ' — 품목 선택 후 확정)';
                if (typeof showToast === 'function') showToast(pickMsg, 'info');
            };

            // 주문 저장 성공 후(calc.js 훅) — 라인에 마킹된 대기물 absorb (실패해도 주문 등록에 영향 없음)
            // orderId: 저장된 주문 id(넘어오면 서버가 그 주문으로 order_item 범위 축소). 미지정이어도 서버가
            // 대기물 ai_analysis_id 로 통과 라인을 역추적해 order_item_id 를 링크(추적성 유지).
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
