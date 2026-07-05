// orderForm/client.js — 거래처 검색·선택·여신 + 배송시간 (Phase 3.1.C 분할)

﻿            localStorage.setItem('lastOrderFormType', 'production');
            var itemCount = 0;
            var searchTimers = {};
            var editMode = null; // 수정 모드일 때 주문 ID 저장
            var _clientAddress = '';          // 거래처 사업장 주소 (택배 등 기본 배송지)
            var _clientDeliveryAddress = '';  // 거래처 배송지/터미널 (대신화물)
            function handleClientEnter(e) {
                if (e.key !== 'Enter') return;
                e.preventDefault();
                var q = document.getElementById('clientSearch').value.trim();
                if (!q) return;
                document.getElementById('clientId').value = '';
                document.getElementById('clientSearch').style.borderColor = '#6366f1';
                axios.get('/api/clients?search=' + encodeURIComponent(q) + '&limit=50')
                    .then(function(res) {
                        document.getElementById('clientSearch').style.borderColor = '';
                        var clients = (res.data && res.data.data && res.data.data.clients) ? res.data.data.clients : [];
                        if (clients.length === 1) {
                            selectClient(clients[0].id, clients[0].client_name);
                            showToast(clients[0].client_name + ' 선택됨', 'success');
                        } else {
                            openClientModal(q, clients);
                        }
                    })
                    .catch(function(err) {
                        document.getElementById('clientSearch').style.borderColor = '';
                        console.error('Client search error:', err);
                    });
            }

            function openClientModal(query, clients) {
                var modal = document.getElementById('clientModal');
                var listHtml = '';
                if (clients.length === 0) {
                    listHtml = '<div class="text-center py-8 text-gray-400"><i class="fas fa-inbox text-2xl mb-2"></i><p>검색 결과가 없습니다.</p></div>';
                } else {
                    listHtml = clients.map(function(cl) {
                        var safeName = (cl.client_name || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
                        return '<div class="client-modal-row" onclick="selectClientFromModal(' + cl.id + ',\'' + safeName + '\')">'
                            + '<div class="font-medium text-sm">' + (cl.client_name || '') + '</div>'
                            + '<div class="text-xs text-gray-500">'
                            + (cl.client_code || '')
                            + (cl.business_registration_number ? ' | ' + cl.business_registration_number : '')
                            + (cl.phone ? ' | ' + cl.phone : '')
                            + '</div></div>';
                    }).join('');
                }
                modal.innerHTML = '<div class="client-modal-overlay" onclick="closeClientModal(event)">'
                    + '<div class="client-modal" onclick="event.stopPropagation()">'
                    + '<div class="p-4 border-b flex items-center justify-between">'
                    + '<h3 class="font-bold text-gray-800">거래처 선택</h3>'
                    + '<button onclick="closeClientModal()" class="text-gray-400 hover:text-gray-600"><i class="fas fa-times"></i></button>'
                    + '</div>'
                    + '<div class="p-4 border-b">'
                    + '<input type="text" id="modalClientSearch" value="' + (query || '').replace(/"/g, '&quot;') + '"'
                    + ' placeholder="거래처명 검색 후 Enter" class="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500"'
                    + ' onkeydown="handleModalClientSearch(event)" autofocus>'
                    + '<div class="text-xs text-gray-400 mt-1">' + (clients.length > 0 ? clients.length + '건 검색됨' : '검색 결과 없음') + '</div>'
                    + '</div>'
                    + '<div style="max-height:50vh; overflow-y:auto;">' + listHtml + '</div>'
                    + '</div></div>';
                setTimeout(function() {
                    var searchInput = document.getElementById('modalClientSearch');
                    if (searchInput) { searchInput.focus(); searchInput.select(); }
                }, 100);
            }

            function handleModalClientSearch(e) {
                if (e.key !== 'Enter') return;
                e.preventDefault();
                var q = document.getElementById('modalClientSearch').value.trim();
                if (!q) return;
                axios.get('/api/clients?search=' + encodeURIComponent(q) + '&limit=50')
                    .then(function(res) {
                        var clients = (res.data && res.data.data && res.data.data.clients) ? res.data.data.clients : [];
                        if (clients.length === 1) {
                            selectClientFromModal(clients[0].id, clients[0].client_name);
                        } else {
                            openClientModal(q, clients);
                        }
                    });
            }

            function selectClientFromModal(id, name) {
                selectClient(id, name);
                closeClientModal();
                showToast(name + ' 선택됨', 'success');
            }

            function closeClientModal(e) {
                if (e && e.target && !e.target.classList.contains('client-modal-overlay')) return;
                document.getElementById('clientModal').innerHTML = '';
            }

            function selectClient(id, name) {
                document.getElementById('clientId').value = id;
                document.getElementById('clientSearch').value = name;
                // 배송처 기본값: 거래처명 (이미 값이 있으면 덮어쓰지 않음)
                var recEl = document.getElementById('receptionLocation');
                if (recEl && !recEl.value) recEl.value = name;
                // 거래처 연락처 + 주소 자동 채우기
                axios.get('/api/clients/' + id).then(function(res) {
                    if (res.data && res.data.success && res.data.data) {
                        var cl = res.data.data;
                        var phoneEl = document.getElementById('contactPhone');
                        var mobileEl = document.getElementById('contactMobile');
                        if (phoneEl) phoneEl.value = cl.phone || '';
                        if (mobileEl) mobileEl.value = cl.mobile || '';
                        // 거래처 배송 정보 보관 (거래처/방식 변경 시 syncDeliveryInfo가 사용)
                        _clientAddress = cl.address || '';
                        _clientDeliveryAddress = cl.delivery_address || '';
                        // 거래처 기본 배송방식 → 출고방법 자동선택 (한글 1:1)
                        var dmEl = document.getElementById('deliveryMethod');
                        if (dmEl && cl.delivery_method) {
                            var hasOpt = Array.prototype.some.call(dmEl.options, function(o) { return o.value === cl.delivery_method; });
                            if (hasOpt) dmEl.value = cl.delivery_method;
                        }
                        // 라벨 전환 + 배송지 자동 채움 (거래처 변경 시 새 거래처 정보 반영)
                        onDeliveryMethodChange();
                    }
                }).catch(function(err) { console.error('[orderForm] 거래처 정보 자동입력 실패', err); });
                // 여신 체크
                checkClientCredit(id);
                // 합배송 예약 후보 (거래처 변경 → 기존 선택 초기화)
                _ofConsolidateWith = null;
                ofLoadUnshippedCandidates(id);
            }

            // ========== 합배송 예약 (배송 후속 P1) ==========
            var _ofConsolidateWith = null;      // 합배송 예약 대상 주문 id (저장 payload)
            var _ofUnshippedCandidates = [];    // 후보 캐시 (라디오 인덱스 참조)

            // 같은 거래처 미출고 주문 조회 → 배너 렌더. preselectId = 수정모드 복원용
            function ofLoadUnshippedCandidates(clientId, preselectId) {
                var banner = document.getElementById('ofConsolidationBanner');
                if (!banner) { console.warn('[orderForm] #ofConsolidationBanner not found'); return; }
                // 견적서 폼은 예약 무의미 (출고 없음)
                if (window.location.pathname.indexOf('quotation-form') >= 0) { banner.classList.add('hidden'); return; }
                var listEl = document.getElementById('ofConsolidationList');
                var cntEl = document.getElementById('ofConsolidationCount');
                var url = '/api/orders/unshipped-by-client?client_id=' + clientId + (editMode ? '&exclude_order_id=' + editMode : '');
                axios.get(url).then(function(res) {
                    var rows = (res.data && res.data.success) ? (res.data.data || []) : [];
                    _ofUnshippedCandidates = rows;
                    if (!rows.length) { banner.classList.add('hidden'); return; }
                    if (cntEl) cntEl.textContent = rows.length;
                    // 두 의도 분리 (배송 UX P2): 추가 주문(주문서 1장 유지)=품목 추가 버튼 / 별개 주문 합배송=라디오
                    var html = '<div class="text-[11px] text-amber-700 py-1">같은 주문의 추가분이면 <b>[품목 추가]</b>로 기존 주문서에 합치세요. 합배송은 별도 주문서를 유지한 채 배송만 한 박스로 묶습니다.</div>'
                        + '<label class="flex items-center gap-2 py-1.5 cursor-pointer">'
                        + '<input type="radio" name="ofConsolidateRadio" value="" ' + (_ofConsolidateWith ? '' : 'checked') + ' onchange="ofSetConsolidateTarget(null)">'
                        + '<span class="text-gray-600">합배송 안 함</span></label>';
                    rows.forEach(function(o, idx) {
                        var dd = o.delivery_date || '-';
                        var checked = (_ofConsolidateWith && Number(_ofConsolidateWith) === Number(o.id)) ? 'checked' : '';
                        var itemTxt = (o.main_item_name || '') + (o.item_count > 1 ? ' 외 ' + (o.item_count - 1) + '건' : '');
                        // 품목 추가 가능 = 편집 가능 상태 + 미청구 (출고 준비·청구 후 주문은 새 주문+합배송만 안내)
                        var canAppend = ['CONFIRMED', 'PRINTING', 'PRINT_DONE', 'HOLD'].indexOf(o.status) >= 0
                            && ['BILLED', 'PAID'].indexOf(o.billing_status || '') < 0;
                        html += '<div class="flex items-center gap-2 py-1.5">'
                            + '<label class="flex items-center gap-2 flex-1 min-w-0 cursor-pointer" title="별도 주문서 유지 + 출고 시 한 박스">'
                            + '<input type="radio" name="ofConsolidateRadio" value="' + o.id + '" ' + checked + ' onchange="ofSetConsolidateTarget(' + idx + ')">'
                            + '<span class="font-medium whitespace-nowrap">' + escapeHtml(o.order_number || ('#' + o.id)) + '</span>'
                            + (o.entity_name ? '<span style="background:#eef2ff;color:#4338ca;font-size:10px;padding:1px 5px;border-radius:8px;white-space:nowrap">' + escapeHtml(o.entity_name) + '</span>' : '')
                            + '<span class="text-gray-500 whitespace-nowrap">납품 ' + escapeHtml(dd) + '</span>'
                            + '<span class="text-gray-500 whitespace-nowrap">' + escapeHtml(o.delivery_method || '-') + '</span>'
                            + '<span class="text-gray-400 truncate" title="' + escapeHtml(itemTxt) + '">' + escapeHtml(itemTxt) + '</span>'
                            + '</label>'
                            + (canAppend
                                ? '<button type="button" class="shrink-0 px-2 py-0.5 text-[11px] rounded border border-amber-300 bg-white text-amber-800 hover:bg-amber-100" title="새 주문서를 만들지 않고 이 주문(주문서 1장)에 품목을 추가합니다" onclick="ofGotoAddItems(' + idx + ')"><i class="fas fa-plus mr-0.5"></i>품목 추가</button>'
                                : '')
                            + '</div>';
                    });
                    if (listEl) listEl.innerHTML = html;
                    banner.classList.remove('hidden');
                }).catch(function(err) {
                    console.warn('[orderForm] 합배송 후보 조회 실패', err);
                    banner.classList.add('hidden');
                });
                // 수정모드 복원: 기존 예약 선택 유지
                if (preselectId) _ofConsolidateWith = preselectId;
            }

            // [품목 추가] — 새 주문서를 만들지 않고 기존 주문 수정 화면으로 이동 (주문서 1장 유지)
            async function ofGotoAddItems(idx) {
                var o = _ofUnshippedCandidates[idx];
                if (!o) return;
                var no = o.order_number || ('#' + o.id);
                if (await showConfirm('주문 ' + no + ' 수정 화면으로 이동해 품목을 추가합니다.\n(새 주문서를 만들지 않으며, 지금 입력 중인 내용은 저장되지 않습니다)')) {
                    window.location.href = '/order-form?edit=' + o.id;
                }
            }

            // 라디오 선택 → 예약 대상 설정 (+ 납품일 불일치 시 맞추기 제안)
            async function ofSetConsolidateTarget(idx) {
                if (idx === null || idx === undefined || idx === '') { _ofConsolidateWith = null; return; }
                var o = _ofUnshippedCandidates[idx];
                if (!o) { _ofConsolidateWith = null; return; }
                _ofConsolidateWith = o.id;
                var ddEl = document.getElementById('deliveryDate');
                if (o.delivery_date && ddEl && ddEl.value && ddEl.value !== o.delivery_date) {
                    if (await showConfirm('선택한 주문의 납품일(' + o.delivery_date + ')과 이 주문의 납품일(' + ddEl.value + ')이 다릅니다.\n납품일을 ' + o.delivery_date + '(으)로 맞출까요?\n(합배송은 실제로 같은 날 출고될 때 자동으로 묶입니다)')) {
                        ddEl.value = o.delivery_date;
                    }
                }
            }

            function checkClientCredit(clientId) {
                var banner = document.getElementById('creditBanner');
                if (!banner) return;
                axios.get('/api/clients/' + clientId + '/credit-check').then(function(res) {
                    if (!res.data.success) return;
                    var d = res.data.data;
                    if (d.status === 'BLOCKED') {
                        banner.innerHTML = '<div class="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700"><i class="fas fa-ban"></i><b>주문 차단</b> — 이 거래처는 관리자에 의해 주문이 차단되어 있습니다.</div>';
                        banner.classList.remove('hidden');
                    } else if (d.status === 'EXCEEDED') {
                        banner.innerHTML = '<div class="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700"><i class="fas fa-exclamation-triangle"></i><b>여신한도 초과</b> — ' + escapeHtml(d.message) + '</div>';
                        banner.classList.remove('hidden');
                    } else if (d.status === 'WARNING') {
                        banner.innerHTML = '<div class="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700"><i class="fas fa-exclamation-triangle"></i><b>여신 주의</b> — ' + escapeHtml(d.message) + '</div>';
                        banner.classList.remove('hidden');
                    } else {
                        banner.classList.add('hidden');
                    }
                }).catch(function() {});
            }

            function initDeliveryTimeOptions() {
                var hourSel = document.getElementById('deliveryTimeHour');
                var minSel = document.getElementById('deliveryTimeMinute');
                if (!hourSel || !minSel) return;
                var hHtml = '<option value="">미정</option>';
                for (var h = 9; h <= 18; h++) {
                    var hh = (h < 10 ? '0' : '') + h;
                    hHtml += '<option value="' + hh + '">' + hh + '시</option>';
                }
                hourSel.innerHTML = hHtml;
                updateMinuteOptions();
            }

            function updateMinuteOptions() {
                var hourSel = document.getElementById('deliveryTimeHour');
                var minSel = document.getElementById('deliveryTimeMinute');
                if (!hourSel || !minSel) return;
                var prevMin = minSel.value;
                var hour = hourSel.value;
                var mHtml = '<option value="00">00분</option>';
                if (hour !== '18') {
                    mHtml += '<option value="30">30분</option>';
                }
                minSel.innerHTML = mHtml;
                if (prevMin === '30' && hour !== '18') minSel.value = '30';
                else minSel.value = '00';
                minSel.disabled = !hour;
            }

            function onDeliveryTimeHourChange() {
                updateMinuteOptions();
            }

            function onDeliveryMethodChange() {
                var method = document.getElementById('deliveryMethod').value;
                var hourSel = document.getElementById('deliveryTimeHour');
                var minSel = document.getElementById('deliveryTimeMinute');
                if (method === '한진택배') {
                    hourSel.value = '18';
                    updateMinuteOptions();
                    minSel.value = '00';
                    hourSel.disabled = true;
                    minSel.disabled = true;
                } else if (method === '대신택배' || method === '대신화물') {
                    hourSel.value = '16';
                    updateMinuteOptions();
                    minSel.value = '00';
                    hourSel.disabled = true;
                    minSel.disabled = true;
                } else {
                    // 이전에 고정이었던 경우 미정으로 리셋
                    if (hourSel.disabled) {
                        hourSel.value = '';
                        updateMinuteOptions();
                    }
                    hourSel.disabled = false;
                    minSel.disabled = !hourSel.value;
                }
                // 선불/착불 활성화 제어
                var spSelect = document.getElementById('shippingPayment');
                var spLabel = document.getElementById('shippingPaymentLabel');
                if (spSelect) {
                    var needsPayment = ['대신택배','대신화물','한진택배','용차','퀵'].indexOf(method) >= 0;
                    spSelect.disabled = !needsPayment;
                    spSelect.required = needsPayment;
                    if (!needsPayment) spSelect.value = '';
                    if (spLabel) spLabel.innerHTML = needsPayment ? '선불/착불 <span class="text-red-500">*</span>' : '선불/착불';
                }

                // 대신화물: 배송처 주소를 "화물 터미널"로 안내 (저장 시 거래처 기본 터미널 갱신)
                var addrLabel = document.getElementById('deliveryInfoLabel');
                var addrInput = document.getElementById('deliveryInfo');
                if (addrLabel) {
                    if (method === '대신화물') {
                        addrLabel.textContent = '화물 터미널';
                        if (addrInput) addrInput.placeholder = '예: 대전 대신화물 터미널';
                    } else {
                        addrLabel.textContent = '배송처 주소';
                        if (addrInput) addrInput.placeholder = '예: 서울시 중구 을지로 123';
                    }
                }
                // 거래처/방식 변경 시 배송지 동기화 (대신화물=터미널, 그 외=사업장 주소)
                syncDeliveryInfo();
            }

            // 현재 배송방식에 맞는 거래처 배송지를 deliveryInfo에 채움 (거래처/방식 변경 대응)
            function syncDeliveryInfo() {
                if (!_clientAddress && !_clientDeliveryAddress) return; // 거래처 미선택(편집 등) → 기존값 유지
                var input = document.getElementById('deliveryInfo');
                if (!input) return;
                var method = document.getElementById('deliveryMethod').value;
                input.value = (method === '대신화물')
                    ? (_clientDeliveryAddress || _clientAddress || '')
                    : (_clientAddress || _clientDeliveryAddress || '');
            }

            async function loadData() {
                try {
                    const tomorrow = new Date();
                    tomorrow.setDate(tomorrow.getDate() + 1);
                    document.getElementById('deliveryDate').value = tomorrow.toISOString().split('T')[0];

                    // 납품시간 옵션 초기화
                    initDeliveryTimeOptions();
                    // 기본 출고방법(대신택배)에 맞춰 시간 자동 설정
                    onDeliveryMethodChange();

                    // 수정 모드가 아닐 때만 첫 품목 행 자동 추가
                    if (!editMode) {
                        addItemRow();
                    }
                } catch (err) {
                    showToast('데이터 로딩 실패: ' + (err.response?.data?.error || err.message), 'error');
                }
            }

