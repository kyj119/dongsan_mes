            localStorage.setItem('lastOrderFormType', 'dist');
            var itemCount = 0;
            var searchTimers = {};
            var isSubmitting = false;
            var _clientAddress = '';          // 거래처 사업장 주소 (택배 등 기본 배송지)
            var _clientAddressDetail = '';    // 거래처 상세주소 (0535)
            var _clientPostal = '';           // 거래처 우편번호 (0535)
            var _clientDeliveryAddress = '';  // 거래처 배송지/터미널 (대신화물)
            var _deliveryAutoFilled = null;   // 자동채움 마지막 값 — 손댄 값은 덮어쓰지 않는다(0535)
            var _forceDeliverySync = false;   // 거래처 교체 순간만 강제 동기화 (0535)

            // ===== 품목 담당 법인 셀렉트 (멀티법인 협업) =====
            // 유통/GOODS 품목은 카드그룹 없어 자동추천 없음 → 수동 지정용.
            // 담당 지정 시 출고 재고차감이 해당 법인 재고에서 이뤄짐(COALESCE).
            function entityAssignOptions() {
                var list = window.__entities || [];
                var opts = '<option value="">자동</option>';
                list.forEach(function(e) {
                    var nm = window.escapeHtml ? window.escapeHtml(e.short_name || e.name) : (e.short_name || e.name);
                    opts += '<option value="' + e.id + '">' + nm + '</option>';
                });
                return opts;
            }
            (function loadEntities() {
                if (typeof axios === 'undefined') return;
                axios.get('/api/auth/entities').then(function(res) {
                    if (!res.data || !res.data.success) return;
                    window.__entities = res.data.data || [];
                    // entities 로드 전 생성된 행의 담당 셀렉트 갱신 (첫 행 타이밍 대응)
                    document.querySelectorAll('[name^="assigned_entity_"]').forEach(function(sel) {
                        var cur = sel.value;
                        sel.innerHTML = entityAssignOptions();
                        if (cur) sel.value = cur;
                    });
                }).catch(function() {});
            })();

            // ===== 거래처 검색 =====
            function handleClientEnter(e) {
                if (e.key !== 'Enter') return;
                e.preventDefault();
                var q = document.getElementById('clientSearch').value.trim();
                if (!q) return;
                document.getElementById('clientId').value = '';
                axios.get('/api/clients?search=' + encodeURIComponent(q) + '&limit=50')
                    .then(function(res) {
                        var clients = (res.data && res.data.data && res.data.data.clients) ? res.data.data.clients : [];
                        if (clients.length === 1) {
                            selectClient(clients[0].id, clients[0].client_name);
                            showToast(clients[0].client_name + ' 선택됨', 'success');
                        } else {
                            // 공용 거래처 검색 모달 (shell.js) — 자체 clientModal 이관
                            openClientSearchModal({ search: q, onSelect: function(cl) {
                                selectClient(cl.id, cl.client_name);
                                showToast(cl.client_name + ' 선택됨', 'success');
                            } });
                        }
                    })
                    .catch(function(err) { console.error('Client search error:', err); });
            }

            function selectClient(id, name) {
                // 교체 판정 = 직전 clientId 와 다름 (주문서 폼 client.js 와 동일 규칙)
                var _prevClientId = document.getElementById('clientId').value;
                var _clientSwapped = String(_prevClientId || '') !== String(id);
                document.getElementById('clientId').value = id;
                document.getElementById('clientSearch').value = name;
                // 배송처 = 거래처명. 거래처 교체 시 주소와 함께 갱신
                var recEl = document.getElementById('receptionLocation');
                if (recEl && (_clientSwapped || !recEl.value)) recEl.value = name;
                axios.get('/api/clients/' + id).then(function(res) {
                    if (res.data && res.data.success && res.data.data) {
                        var cl = res.data.data;
                        var phoneEl = document.getElementById('contactPhone');
                        if (phoneEl && !phoneEl.value) phoneEl.value = cl.phone || '';
                        var mobileEl = document.getElementById('contactMobile');
                        if (mobileEl && !mobileEl.value) mobileEl.value = cl.mobile || '';
                        // 거래처 배송 정보 보관 (거래처/방식 변경 시 syncDeliveryInfoDist가 사용)
                        _clientAddress = cl.address || '';
                        _clientAddressDetail = cl.address_detail || '';
                        _clientPostal = cl.postal_code || '';
                        _clientDeliveryAddress = cl.delivery_address || '';
                        // 거래처 기본 배송방법 → 출고방법 자동선택 (한글 1:1, 구 enum 호환)
                        var dmEl = document.getElementById('distDeliveryMethod');
                        if (dmEl && cl.delivery_method) {
                            var DM_MAP = { 'SAME': '대신택배', 'FREIGHT': '대신화물', 'DIRECT': '직접배송', 'PICKUP': '방문수령' };
                            var mapped = DM_MAP[cl.delivery_method] || cl.delivery_method;
                            var hasOpt = Array.prototype.some.call(dmEl.options, function(o) { return o.value === mapped; });
                            if (hasOpt) dmEl.value = mapped;
                        }
                        // 라벨 전환 + 배송지 자동 채움. 강제 동기화는 교체일 때만
                        _forceDeliverySync = _clientSwapped;
                        onDistDeliveryMethodChange();
                    }
                }).catch(function() {});
            }

            // ===== 품목 검색 및 테이블 =====
            function addItemRow() {
                itemCount++;
                var id = itemCount;
                var html = '<tr id="distItem-' + id + '" class="border-b border-gray-100">'
                    + '<td class="py-3 px-3 relative">'
                    + '<input type="hidden" name="dist_item_id_' + id + '">'
                    + '<input type="hidden" name="dist_unit_' + id + '">'
                    + '<input type="text" name="dist_item_search_' + id + '" placeholder="품목명 또는 코드 검색..." autocomplete="off"'
                    + ' class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">'
                    + '</td>'
                    + '<td class="py-3 px-3"><input type="text" name="dist_spec_' + id + '" placeholder="폭 등 규격" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"></td>'
                    + '<td class="py-3 px-3"><select name="assigned_entity_' + id + '" class="w-full px-2 py-2 border border-gray-300 rounded-lg text-sm">' + entityAssignOptions() + '</select></td>'
                    + '<td class="py-3 px-3"><input type="number" name="dist_qty_' + id + '" value="1" min="1" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-center" oninput="calcDistItem(' + id + ')"></td>'
                    + '<td class="py-3 px-3"><input type="text" inputmode="numeric" data-money name="dist_price_' + id + '" value="0" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-right" oninput="calcDistItem(' + id + ')"></td>'
                    + '<td class="py-3 px-3 text-right tabular-nums"><span id="dist_amount_' + id + '" class="font-medium text-blue-700">0원</span></td>'
                    + '<td class="py-3 px-2 text-center">'
                    + '<button type="button" onclick="removeDistItem(' + id + ')" class="text-red-400 hover:text-red-600 px-2 py-1.5 rounded hover:bg-red-50">'
                    + '<i class="fas fa-trash"></i></button>'
                    + '</td></tr>';
                document.getElementById('distItemsBody').insertAdjacentHTML('beforeend', html);
                setupDistAutocomplete(id);
                // focus search field
                var searchEl = document.querySelector('[name="dist_item_search_' + id + '"]');
                if (searchEl) searchEl.focus();
            }

            function removeDistItem(id) {
                var row = document.getElementById('distItem-' + id);
                if (row) { row.remove(); calculateDistTotal(); }
            }

            function setupDistAutocomplete(id) {
                var input = document.querySelector('[name="dist_item_search_' + id + '"]');
                var hidId = document.querySelector('[name="dist_item_id_' + id + '"]');

                // 품목 선택 적용 (openItemSearchModal 콜백과 동일 인터페이스)
                function applyDistItem(item) {
                    hidId.value = item.id;
                    input.value = item.name;
                    // 품목 규격 자동채움(수정 가능). 단위는 hidden에 보관 → 제출 시 저장(명세서 단위 표시)
                    document.querySelector('[name="dist_spec_' + id + '"]').value = item.specification || '';
                    var unitEl = document.querySelector('[name="dist_unit_' + id + '"]');
                    if (unitEl) unitEl.value = item.unit || 'EA';
                    var price = parseInt(item.price) || 0;
                    document.querySelector('[name="dist_price_' + id + '"]').value = fmtMoneyInput(price);
                    calcDistItem(id);
                }

                // 검색 함수 (생산 주문서와 동일 패턴)
                async function doDistItemSearch(openModal) {
                    var q = input.value.trim();
                    if (!q) return;
                    try {
                        var res = await axios.get('/api/items?search=' + encodeURIComponent(q) + '&limit=50');
                        var items = res.data.data || [];
                        if (items.length === 1) {
                            var it = items[0];
                            applyDistItem({
                                id: it.id, name: it.item_name,
                                price: it.sales_price || it.base_price || 0,
                                unit: it.unit || 'EA',
                                specification: it.specification || ''
                            });
                        } else if (items.length > 1 && openModal) {
                            window.openItemSearchModal({ type: '', search: q, onSelect: applyDistItem });
                        }
                    } catch(e) { console.error('Dist search error', e); }
                }

                // input: 자동완성 (1건 자동 적용, 모달은 열지 않음)
                input.addEventListener('input', function() {
                    clearTimeout(searchTimers[id]);
                    hidId.value = '';
                    var q = input.value.trim();
                    if (!q) return;
                    searchTimers[id] = setTimeout(function() { doDistItemSearch(false); }, 300);
                });

                // Enter: 모달 열기 허용
                input.addEventListener('keydown', function(e) {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        clearTimeout(searchTimers[id]);
                        doDistItemSearch(true);
                    }
                });
            }

            function calcDistItem(id) {
                var qty = parseInt(document.querySelector('[name="dist_qty_' + id + '"]').value) || 0;
                var price = parseMoney(document.querySelector('[name="dist_price_' + id + '"]').value);
                var amt = qty * price;
                document.getElementById('dist_amount_' + id).textContent = amt.toLocaleString() + '원';
                calculateDistTotal();
            }

            // ===== 부속품 추가 =====
            // 유통 주문서의 「부속품」 버튼(pages/orderForm.ts:530)이 부르는 함수.
            //   이 페이지의 pageScript 는 [deliverySlot, orderFormDist.js] 뿐이라 정의가 없어 ReferenceError 였다.
            //   생산 주문서의 동명 함수(orderForm/itemRow.js)는 품목 행 구조(item_search_*)가 달라 재사용할 수 없고,
            //   itemRow.js 를 이 페이지에 함께 싣는 것도 안 된다 — 두 스크립트가 전역 이름 12개를 공유해 서로 덮는다.
            window.addAccessoryRow = async function() {
                try {
                    var res = await axios.get('/api/items?category=ACCESSORY&is_active=1&limit=50');
                    var accessories = (res.data.data || res.data.items || []);
                    if (accessories.length === 0) {
                        showToast('등록된 부속품이 없습니다. 품목 관리에서 부속품을 등록해주세요.', 'warning');
                        return;
                    }

                    var overlay = document.createElement('div');
                    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9998;display:flex;align-items:center;justify-content:center';
                    overlay.onclick = function(e) { if (e.target === overlay) overlay.remove(); };

                    var modal = document.createElement('div');
                    modal.style.cssText = 'background:white;border-radius:12px;padding:20px;max-width:400px;width:90%;max-height:70vh;overflow-y:auto';
                    modal.innerHTML = '<h3 class="text-lg font-bold mb-3"><i class="fas fa-puzzle-piece text-amber-600 mr-2"></i>부속품 추가</h3>'
                        + '<p class="text-xs text-gray-500 mb-3">선택한 부속품이 품목 행으로 추가됩니다.</p>'
                        + '<div class="space-y-1">'
                        + accessories.map(function(acc) {
                            return '<button type="button" class="w-full text-left px-3 py-2 rounded hover:bg-amber-50 border border-gray-100 text-sm flex items-center justify-between" '
                                + 'data-acc-id="' + acc.id + '">'
                                + '<span><i class="fas fa-cube text-amber-400 mr-2"></i>' + escapeHtml(acc.item_name || '') + '</span>'
                                + '<span class="text-xs text-gray-400">' + escapeHtml(acc.item_code || '') + '</span>'
                                + '</button>';
                        }).join('')
                        + '</div>';

                    modal.querySelectorAll('button[data-acc-id]').forEach(function(btn, accIdx) {
                        btn.addEventListener('click', function() {
                            var acc = accessories[accIdx];
                            addItemRow();
                            var id = itemCount;
                            var nameEl = document.querySelector('[name="dist_item_search_' + id + '"]');
                            if (nameEl) nameEl.value = acc.item_name || '';
                            var idEl = document.querySelector('[name="dist_item_id_' + id + '"]');
                            if (idEl) idEl.value = acc.id;
                            var unitEl = document.querySelector('[name="dist_unit_' + id + '"]');
                            if (unitEl) unitEl.value = acc.unit || 'EA';
                            var specEl = document.querySelector('[name="dist_spec_' + id + '"]');
                            if (specEl) specEl.value = acc.specification || '';
                            var priceEl = document.querySelector('[name="dist_price_' + id + '"]');
                            if (priceEl) priceEl.value = fmtMoneyInput(parseInt(acc.sales_price || acc.base_price || 0) || 0);
                            var qtyEl = document.querySelector('[name="dist_qty_' + id + '"]');
                            if (qtyEl) { qtyEl.value = ''; qtyEl.focus(); }
                            calcDistItem(id);
                            overlay.remove();
                            showToast((acc.item_name || '부속품') + ' 추가됨. 수량을 입력하세요.', 'success');
                        });
                    });

                    overlay.appendChild(modal);
                    document.body.appendChild(overlay);
                } catch(err) {
                    showToast('부속품 목록 로딩 실패: ' + ((err.response && err.response.data && err.response.data.error) || err.message), 'error');
                }
            };

            // ===== 합계 계산 =====
            function calculateDistTotal() {
                var total = 0;
                document.querySelectorAll('#distItemsBody > tr').forEach(function(row) {
                    var id = row.id.replace('distItem-', '');
                    var qty = parseInt((document.querySelector('[name="dist_qty_' + id + '"]') || {}).value) || 0;
                    var price = parseMoney((document.querySelector('[name="dist_price_' + id + '"]') || {}).value);
                    total += qty * price;
                });
                var vatCheck = document.getElementById('distVatIncluded');
                // 부가세율 = 서버 settings 주입값(window.VAT_RATE). 하드코딩 0.1 이면 설정 변경 시
                //   화면 합계와 저장 금액이 갈린다(생산 주문서 calc.js 와 같은 규칙).
                var distVatRate = (typeof window.VAT_RATE === 'number' && isFinite(window.VAT_RATE)) ? window.VAT_RATE : 0.1;
                var vat = vatCheck && vatCheck.checked ? Math.round(total * distVatRate) : 0;
                var discount = parseMoney((document.getElementById('distDiscount') || {}).value);
                var grand = Math.max(0, total + vat - discount);

                document.getElementById('distSubtotal').textContent = total.toLocaleString() + '원';
                document.getElementById('distVatAmount').textContent = vat.toLocaleString() + '원';
                document.getElementById('distGrandTotal').textContent = grand.toLocaleString() + '원';
            }

            // ===== 납품시간 옵션 =====
            function initDistDeliveryTimeOptions() {
                var hourSel = document.getElementById('distDeliveryTimeHour');
                var minSel = document.getElementById('distDeliveryTimeMinute');
                if (!hourSel || !minSel) return;
                var hHtml = '<option value="">미정</option>';
                for (var h = 9; h <= 18; h++) {
                    var hh = (h < 10 ? '0' : '') + h;
                    hHtml += '<option value="' + hh + '">' + hh + '시</option>';
                }
                hourSel.innerHTML = hHtml;
                updateDistMinuteOptions();
            }

            function updateDistMinuteOptions() {
                var hourSel = document.getElementById('distDeliveryTimeHour');
                var minSel = document.getElementById('distDeliveryTimeMinute');
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

            function onDistDeliveryTimeHourChange() {
                updateDistMinuteOptions();
            }

            // ===== 출고방법 변경 시 선불/착불 + 납품시간 연동 =====
            // 지금 저장될 슬롯. 직배가 아니면 null.
            function distActiveSlot() {
                var m = document.getElementById('distDeliveryMethod');
                var sl = document.getElementById('distDeliverySlot');
                if (!m || !sl || !window.MES_SLOT) return null;
                return window.MES_SLOT.isSlotMethod(m.value) ? (window.MES_SLOT.normalizeSlot(sl.value) || null) : null;
            }

            function applyDistDeliverySlotUI(method) {
                var wrap = document.getElementById('distDeliverySlotWrap');
                var timeWrap = document.getElementById('distDeliveryTimeWrap');
                var slotSel = document.getElementById('distDeliverySlot');
                if (!wrap || !timeWrap || !slotSel) { console.warn('[orderFormDist] #distDeliverySlotWrap/#distDeliveryTimeWrap not found'); return; }
                var useSlot = !!(window.MES_SLOT && window.MES_SLOT.isSlotMethod(method));
                wrap.classList.toggle('hidden', !useSlot);
                timeWrap.classList.toggle('hidden', useSlot);
                if (!useSlot) { slotSel.value = ''; setDistSlotHint(''); return; }
                refreshDistSlotGuard();
            }

            function refreshDistSlotGuard() {
                var slotSel = document.getElementById('distDeliverySlot');
                var dateEl = document.getElementById('distDeliveryDate');
                if (!slotSel || !window.MES_SLOT) return;
                var date = dateEl ? dateEl.value : '';
                var keepAm = slotSel.value === 'AM';
                var amOk = window.MES_SLOT.selectable('AM', date);
                var amOpt = slotSel.querySelector('option[value="AM"]');
                if (amOpt) {
                    amOpt.disabled = !amOk && !keepAm;
                    amOpt.textContent = (amOk || keepAm) ? '오전' : '오전 (마감 지남)';
                }
                var slot = window.MES_SLOT.normalizeSlot(slotSel.value);
                if (slot) {
                    var due = window.MES_SLOT.deadline({ delivery_date: date, delivery_method: '직배', delivery_slot: slot });
                    setDistSlotHint(due
                        ? '완료기한 ' + due + ' 까지 · 납품시간은 ' + window.MES_SLOT.REPRESENTATIVE_TIME[slot] + ' 로 기록됩니다'
                        : '납품일을 먼저 선택하세요');
                } else {
                    setDistSlotHint(amOk ? '' : '오전편은 납품 전날 18:00 까지 접수분만 가능합니다');
                }
            }

            function setDistSlotHint(text) {
                var el = document.getElementById('distDeliverySlotHint');
                if (el) el.textContent = text || '';
            }

            function onDistDeliverySlotChange() {
                refreshDistSlotGuard();
            }

            function onDistDeliveryMethodChange() {
                var method = document.getElementById('distDeliveryMethod').value;
                var hourSel = document.getElementById('distDeliveryTimeHour');
                var minSel = document.getElementById('distDeliveryTimeMinute');
                applyDistDeliverySlotUI(method);

                // 납품시간 자동 설정
                if (hourSel && minSel) {
                    if (method === '한진택배') {
                        hourSel.value = '18'; updateDistMinuteOptions(); minSel.value = '00';
                        hourSel.disabled = true; minSel.disabled = true;
                    } else if (method === '대신택배' || method === '대신화물') {
                        hourSel.value = '16'; updateDistMinuteOptions(); minSel.value = '00';
                        hourSel.disabled = true; minSel.disabled = true;
                    } else {
                        if (hourSel.disabled) { hourSel.value = ''; updateDistMinuteOptions(); }
                        hourSel.disabled = false;
                        minSel.disabled = !hourSel.value;
                    }
                }

                // 선불/착불 활성화 제어
                var spSelect = document.getElementById('distShippingPayment');
                var spLabel = document.getElementById('distShippingPaymentLabel');
                if (spSelect) {
                    var needsPayment = ['대신택배','대신화물','한진택배','용차','퀵'].indexOf(method) >= 0;
                    spSelect.disabled = !needsPayment;
                    if (!needsPayment) spSelect.value = '';
                    if (spLabel) spLabel.innerHTML = needsPayment ? '선불/착불 <span class="text-red-500">*</span>' : '선불/착불';
                }

                // 대신화물: 배송처 주소를 "화물 터미널"로 안내 (저장 시 거래처 기본 터미널 갱신)
                var addrLabel = document.getElementById('deliveryAddressLabel');
                var addrInput = document.getElementById('deliveryAddress');
                var addrDetail = document.getElementById('distDeliveryDetail');
                var addrPostal = document.getElementById('distDeliveryPostal');
                var isFreightAddr = (method === '대신화물');
                if (addrLabel) {
                    if (isFreightAddr) {
                        addrLabel.textContent = '화물 터미널';
                        if (addrInput) addrInput.placeholder = '예: 대전 대신화물 터미널';
                    } else {
                        addrLabel.textContent = '배송처 주소';
                        if (addrInput) addrInput.placeholder = '예: 서울시 중구 을지로 123';
                    }
                }
                // 터미널명은 주소가 아니다 → 우편번호/상세 칸 숨김 (0535)
                if (addrDetail) addrDetail.classList.toggle('hidden', isFreightAddr);
                if (addrPostal) addrPostal.classList.toggle('hidden', isFreightAddr);
                // 거래처/방식 변경 시 배송지 동기화 (대신화물=터미널, 그 외=사업장 주소)
                syncDeliveryInfoDist();
            }

            // 현재 배송방식에 맞는 거래처 배송지를 deliveryAddress에 채움 (거래처/방식 변경 대응)
            function syncDeliveryInfoDist() {
                if (!_clientAddress && !_clientDeliveryAddress) return; // 거래처 미선택 → 기존값 유지
                var input = document.getElementById('deliveryAddress');
                if (!input) { console.warn('[orderFormDist] #deliveryAddress not found'); return; }
                var detEl = document.getElementById('distDeliveryDetail');
                var postEl = document.getElementById('distDeliveryPostal');
                var method = document.getElementById('distDeliveryMethod').value;
                var isFreight = (method === '대신화물');
                var road = isFreight
                    ? (_clientDeliveryAddress || _clientAddress || '')
                    : (_clientAddress || _clientDeliveryAddress || '');
                var det = isFreight ? '' : _clientAddressDetail;
                var post = isFreight ? '' : _clientPostal;
                // 손댄 값 보호 — 주문서 폼(client.js)과 동일 규칙 (0535)
                var force = _forceDeliverySync; _forceDeliverySync = false;
                var last = _deliveryAutoFilled || { road: '', detail: '' };
                var curRoad = (input.value || '').trim();
                var curDet = detEl ? (detEl.value || '').trim() : '';
                if (!force && ((curRoad && curRoad !== last.road) || (curDet && curDet !== last.detail))) return;
                input.value = road;
                if (detEl) detEl.value = det;
                if (postEl) postEl.value = post;
                _deliveryAutoFilled = { road: road, detail: det };
            }

            // 저장 payload 의 배송지 3축 (0535) — 대신화물=터미널 모드에선 상세/우편번호 제외
            function collectDeliveryFieldsDist() {
                var road = ((document.getElementById('deliveryAddress') || {}).value || '').trim();
                var det = ((document.getElementById('distDeliveryDetail') || {}).value || '').trim();
                var post = ((document.getElementById('distDeliveryPostal') || {}).value || '').trim();
                var methodEl = document.getElementById('distDeliveryMethod');
                if (methodEl && methodEl.value === '대신화물') { det = ''; post = ''; }
                return {
                    delivery_info: window.dsComposeAddress(road, det) || null,
                    delivery_postal: post || null,
                    delivery_detail: det || null
                };
            }


            // ===== 폼 제출 =====
            document.getElementById('distOrderForm').addEventListener('submit', async function(e) {
                e.preventDefault();
                if (isSubmitting) return;

                var clientId = document.getElementById('clientId').value;
                if (!clientId) { showToast('거래처를 선택하세요.', 'warning'); return; }

                var rows = document.querySelectorAll('#distItemsBody > tr');
                if (!rows.length) { showToast('최소 1개 이상의 품목을 추가하세요.', 'warning'); return; }

                var items = [];
                var valid = true;
                rows.forEach(function(row, idx) {
                    if (!valid) return;
                    var id = row.id.replace('distItem-', '');
                    var itemName = (document.querySelector('[name="dist_item_search_' + id + '"]') || {}).value || '';
                    if (!itemName.trim()) { showToast('품목 #' + (idx + 1) + ': 품목명을 입력하세요.', 'warning'); valid = false; return; }
                    var itemId = (document.querySelector('[name="dist_item_id_' + id + '"]') || {}).value || null;
                    var qty = parseInt((document.querySelector('[name="dist_qty_' + id + '"]') || {}).value) || 1;
                    var unitPrice = parseMoney((document.querySelector('[name="dist_price_' + id + '"]') || {}).value);
                    var amount = qty * unitPrice;
                    var vatCheck = document.getElementById('distVatIncluded');
                    var spec = ((document.querySelector('[name="dist_spec_' + id + '"]') || {}).value || '').trim();
                    var unit = (document.querySelector('[name="dist_unit_' + id + '"]') || {}).value || 'EA';
                    var assignedVal = (document.querySelector('[name="assigned_entity_' + id + '"]') || {}).value;
                    items.push({
                        item_id: itemId ? parseInt(itemId) : null,
                        item_name: itemName.trim(),
                        specification: spec || null,
                        width: null,
                        height: null,
                        quantity: qty,
                        unit: unit,
                        unit_price: unitPrice,
                        amount: amount,
                        vat_included: vatCheck && vatCheck.checked ? 1 : 0,
                        assigned_entity_id: assignedVal ? parseInt(assignedVal) : undefined,
                        sort_order: idx + 1
                    });
                });
                if (!valid) return;

                isSubmitting = true;
                var btn = document.getElementById('distSubmitBtn');
                btn.disabled = true;
                btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>등록 중...';

                // 납품시간 조합
                var distSlot = distActiveSlot();
                var dtHour = (document.getElementById('distDeliveryTimeHour') || {}).value || '';
                var dtMin = (document.getElementById('distDeliveryTimeMinute') || {}).value || '00';
                // 슬롯을 골랐으면 대표시각(오전 09:00 / 오후 14:00) — 비우면 출고목록·칸반이 '미정'이 된다
                var deliveryTime = distSlot ? window.MES_SLOT.REPRESENTATIVE_TIME[distSlot] : (dtHour ? (dtHour + ':' + dtMin) : null);

                var _delivery = collectDeliveryFieldsDist();   // 0535
                var orderData = {
                    client_id: parseInt(clientId),
                    order_type: 'DISTRIBUTION',
                    priority: (document.getElementById('distPriority') || {}).value || 'NORMAL',
                    delivery_date: document.getElementById('distDeliveryDate').value || null,
                    delivery_time: deliveryTime,
                    delivery_slot: distSlot,
                    delivery_method: document.getElementById('distDeliveryMethod').value || null,
                    shipping_payment: document.getElementById('distShippingPayment').value || null,
                    reception_location: document.getElementById('receptionLocation').value || null,
                    delivery_info: _delivery.delivery_info,
                    delivery_postal: _delivery.delivery_postal,
                    delivery_detail: _delivery.delivery_detail,
                    contact_phone: document.getElementById('contactPhone').value || null,
                    contact_mobile: document.getElementById('contactMobile').value || null,
                    discount_amount: parseMoney((document.getElementById('distDiscount') || {}).value),
                    notes: document.getElementById('distNotes').value || null,
                    items: items
                };

                try {
                    var res = await axios.post('/api/orders', orderData);
                    if (res.data.success) {
                        showToast('유통 주문이 등록되었습니다.', 'success');
                        // 대신화물 터미널이 거래처 기본값과 다르면 거래처 기본 터미널 자동 갱신 + 알림
                        var _dm = document.getElementById('distDeliveryMethod').value;
                        var _term = (document.getElementById('deliveryAddress').value || '').trim();
                        if (_dm === '대신화물' && orderData.client_id && _term && _term !== (_clientDeliveryAddress || '').trim()) {
                            try {
                                await axios.patch('/api/clients/' + orderData.client_id, { delivery_address: _term });
                                showToast('거래처 기본 터미널을 갱신했습니다: ' + _term, 'info');
                            } catch (e) { /* 거래처 갱신 실패는 주문 등록에 영향 없음 */ }
                        }
                        if (res.data.material_warnings && res.data.material_warnings.length > 0) {
                            var wl = res.data.material_warnings.map(function(w) { return w.material_name + ': 부족 ' + w.shortfall + ' ' + w.unit; });
                            alert('자재 부족 경고 ' + res.data.material_warnings.length + '건\n\n' + wl.join('\n'));
                        }
                        window.location.href = '/orders';
                    } else {
                        showToast('등록 실패: ' + (res.data.error || '알 수 없는 오류'), 'error');
                        isSubmitting = false; btn.disabled = false;
                        btn.innerHTML = '<i class="fas fa-save mr-2"></i>등록';
                    }
                } catch (err) {
                    showToast('등록 실패: ' + (err.response?.data?.error || err.message), 'error');
                    isSubmitting = false; btn.disabled = false;
                    btn.innerHTML = '<i class="fas fa-save mr-2"></i>등록';
                }
            });

            // ===== Enter 키 방지 =====
            document.getElementById('distOrderForm').addEventListener('keydown', function(e) {
                if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') {
                    // allow enter on client search and item search
                    var name = e.target.name || e.target.id || '';
                    if (name === 'clientSearch') return;
                    if (name.startsWith('dist_item_search_')) {
                        // handled by autocomplete keydown
                        return;
                    }
                    e.preventDefault();
                }
            });

            // ===== 초기화 =====
            (function init() {
                // 기본 납품일: 내일
                var tomorrow = new Date();
                tomorrow.setDate(tomorrow.getDate() + 1);
                var dateEl = document.getElementById('distDeliveryDate');
                if (dateEl) dateEl.value = new Date(tomorrow.getTime() - tomorrow.getTimezoneOffset() * 60000).toISOString().split('T')[0];
                // 납품시간 옵션 초기화
                initDistDeliveryTimeOptions();
                var distDdSlot = document.getElementById('distDeliveryDate');
                if (distDdSlot) {
                    distDdSlot.addEventListener('change', refreshDistSlotGuard);
                    distDdSlot.addEventListener('input', refreshDistSlotGuard);
                } else { console.warn('[orderFormDist] #distDeliveryDate not found (슬롯 가드 미동작)'); }
                // 출고방법 초기화 (납품시간 자동 설정 포함)
                onDistDeliveryMethodChange();
                // 첫 품목 행 추가
                addItemRow();
            })();
