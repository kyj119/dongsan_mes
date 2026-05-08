            localStorage.setItem('lastOrderFormType', 'production');
            var itemCount = 0;
            var searchTimers = {};
            var editMode = null; // 수정 모드일 때 주문 ID 저장
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
                        var clients = (res.data && res.data.clients) ? res.data.clients : [];
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
                        var clients = (res.data && res.data.clients) ? res.data.clients : [];
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
                        // 배송처 주소: 비어있을 때만 거래처 주소로 채움
                        var delInfoEl = document.getElementById('deliveryInfo');
                        if (delInfoEl && !delInfoEl.value && cl.address) {
                            delInfoEl.value = cl.address;
                        }
                    }
                }).catch(function(err) { console.error('[orderForm] 거래처 정보 자동입력 실패', err); });
                // 여신 체크
                checkClientCredit(id);
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

            function buildItemHtml(id) {
                return `<div class="border border-gray-200 rounded-lg p-3 mb-2 bg-gray-50" id="item-${id}">
                    <input type="hidden" name="ai_group_index_${id}" value="">
                    <input type="hidden" name="ai_analysis_id_${id}" value="">
                    <input type="hidden" name="pricing_method_${id}" value="FIXED">
                    <div class="flex justify-between items-center mb-2">
                        <div class="flex items-center gap-2">
                            <div id="thumb_${id}" class="hidden cursor-pointer" onclick="openThumbModal('thumb_img_${id}')" title="클릭하여 크게 보기">
                                <img id="thumb_img_${id}" class="w-20 h-20 object-contain border border-gray-200 rounded shadow-sm" />
                            </div>
                            <span class="font-bold text-gray-700 text-sm" id="item_label_${id}">품목 #${id}</span>
                            <span id="item_check_${id}" class="hidden text-green-500 text-sm"><i class="fas fa-check-circle"></i></span>
                        </div>
                        <button type="button" onclick="removeItem(${id})" class="text-red-400 hover:text-red-600 text-xs px-2 py-1 rounded hover:bg-red-50">
                            <i class="fas fa-trash mr-1"></i>삭제
                        </button>
                    </div>
                    <div class="grid grid-cols-4 md:grid-cols-8 gap-2 mb-2">
                        <div class="col-span-2 relative">
                            <label class="block text-xs font-medium text-gray-600 mb-0.5">품목 <span class="text-red-500">*</span></label>
                            <input type="hidden" name="item_id_${id}">
                            <input type="hidden" name="item_unit_${id}" value="EA">
                            <input type="hidden" name="category_name_${id}">
                            <input type="hidden" name="item_subcat_${id}">
                            <input type="text" name="item_search_${id}" placeholder="품목명 검색..." autocomplete="off"
                                   class="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500">
                            <input type="hidden" name="pricing_method_${id}" value="FIXED">
                            <div id="item_spec_info_${id}" class="hidden text-xs text-blue-600 mt-0.5"></div>
                            <div id="item_dd_${id}" class="item-dd hidden"></div>
                        </div>
                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-0.5">가로(cm)</label>
                            <input type="number" name="width_${id}" min="0" step="0.1" placeholder="90" class="w-full px-2 py-1.5 border border-gray-300 rounded text-sm" oninput="calcItem(${id})">
                        </div>
                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-0.5">세로(cm)</label>
                            <input type="number" name="height_${id}" min="0" step="0.1" placeholder="60" class="w-full px-2 py-1.5 border border-gray-300 rounded text-sm" oninput="calcItem(${id})">
                        </div>
                        <div id="scale_div_${id}" class="hidden">
                            <label class="block text-xs font-medium text-gray-600 mb-0.5" title="실제크기/파일크기 배율">스케일</label>
                            <input type="number" name="scale_factor_${id}" min="1" step="1" value="1" class="w-full px-2 py-1.5 border border-gray-300 rounded text-sm" title="실제크기/파일크기 배율. 1/5 축소 파일이면 5 입력" oninput="onScaleFactorChange(${id})">
                        </div>
                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-0.5">수량 <span class="text-red-500">*</span></label>
                            <input type="number" name="quantity_${id}" value="1" min="1" required class="w-full px-2 py-1.5 border border-gray-300 rounded text-sm" oninput="calcItem(${id})">
                        </div>
                        <div>
                            <label id="unit_price_label_${id}" class="block text-xs font-medium text-gray-600 mb-0.5">단가</label>
                            <input type="text" inputmode="numeric" data-money name="unit_price_${id}" value="0" class="w-full px-2 py-1.5 border border-gray-300 rounded text-sm" oninput="calcItem(${id})">
                        </div>
                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-0.5">금액</label>
                            <input type="text" name="amount_${id}" class="w-full px-2 py-1.5 border border-gray-300 rounded text-sm font-bold text-blue-700" value="0원"
                                   oninput="onAmountManualEdit(${id})" data-auto-amount="0">
                        </div>
                    </div>
                    <div class="grid grid-cols-4 md:grid-cols-8 gap-2 mb-2">
                        <div class="col-span-3">
                            <label class="block text-xs font-medium text-gray-600 mb-0.5">내용</label>
                            <input type="text" name="content_${id}" placeholder="예: 홍보용 현수막 (선택)" class="w-full px-2 py-1.5 border border-gray-300 rounded text-sm">
                        </div>
                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-0.5">단위</label>
                            <input type="text" name="unit_display_${id}" value="EA" readonly class="w-full px-2 py-1.5 border border-gray-200 rounded text-sm bg-gray-100 text-gray-600">
                        </div>
                        <div class="flex items-end pb-0.5">
                            <label class="flex items-center gap-1.5 text-xs cursor-pointer">
                                <input type="checkbox" name="vat_${id}" checked class="rounded border-gray-300 text-blue-600" onchange="calculateTotal()">
                                <span class="text-gray-700">부가세</span>
                            </label>
                        </div>
                    </div>
                    <div class="pt-2 border-t border-gray-200" id="pp_section_${id}">
                        <label class="block text-xs font-medium text-gray-600 mb-1">후가공 <span class="text-gray-400 font-normal">(품목 선택 시 자동 로드)</span></label>
                        <div id="pp_options_${id}" class="space-y-1 text-sm text-gray-400">품목을 선택하면 후가공 옵션이 표시됩니다.</div>
                        <div id="pp_subtotal_${id}" class="text-right text-sm font-medium text-orange-600 mt-1"></div>
                    </div>
                    <div class="pt-2 border-t border-gray-200" id="finishing_section_${id}">
                        <label class="block text-xs font-medium text-gray-600 mb-1">마감 방식</label>
                        <div class="flex items-center gap-1 mb-1" id="finishing_presets_${id}"></div>
                        <div class="flex items-center gap-2" id="finishing_simple_${id}">
                            <button type="button" onclick="toggleFinishingDetail(${id})" class="text-[10px] text-gray-400 hover:text-blue-600 whitespace-nowrap">개별 설정 ▾</button>
                        </div>
                        <div class="grid grid-cols-4 gap-1 mt-1 hidden" id="finishing_sides_${id}">
                            <div><label class="text-[10px] text-gray-400">상</label><select name="fin_top_${id}" class="w-full border rounded px-1 py-0.5 text-xs fin-select" onchange="onFinMethodChange(${id},'top')"></select><input name="fin_cm_top_${id}" type="number" step="0.5" min="0" class="w-full border rounded px-1 py-0.5 text-xs mt-0.5" placeholder="cm" onchange="calcFinishing(${id})"></div>
                            <div><label class="text-[10px] text-gray-400">하</label><select name="fin_bottom_${id}" class="w-full border rounded px-1 py-0.5 text-xs fin-select" onchange="onFinMethodChange(${id},'bottom')"></select><input name="fin_cm_bottom_${id}" type="number" step="0.5" min="0" class="w-full border rounded px-1 py-0.5 text-xs mt-0.5" placeholder="cm" onchange="calcFinishing(${id})"></div>
                            <div><label class="text-[10px] text-gray-400">좌</label><select name="fin_left_${id}" class="w-full border rounded px-1 py-0.5 text-xs fin-select" onchange="onFinMethodChange(${id},'left')"></select><input name="fin_cm_left_${id}" type="number" step="0.5" min="0" class="w-full border rounded px-1 py-0.5 text-xs mt-0.5" placeholder="cm" onchange="calcFinishing(${id})"></div>
                            <div><label class="text-[10px] text-gray-400">우</label><select name="fin_right_${id}" class="w-full border rounded px-1 py-0.5 text-xs fin-select" onchange="onFinMethodChange(${id},'right')"></select><input name="fin_cm_right_${id}" type="number" step="0.5" min="0" class="w-full border rounded px-1 py-0.5 text-xs mt-0.5" placeholder="cm" onchange="calcFinishing(${id})"></div>
                        </div>
                        <div id="finishing_calc_${id}" class="text-xs text-gray-500 mt-1"></div>
                    </div>
                </div>`;
            }

            function setupAutocomplete(id) {
                const input = document.querySelector(`[name="item_search_${id}"]`);
                const dd = document.getElementById(`item_dd_${id}`);
                const hidId = document.querySelector(`[name="item_id_${id}"]`);
                const hidUnit = document.querySelector(`[name="item_unit_${id}"]`);
                const hidCat = document.querySelector(`[name="category_name_${id}"]`);
                const hidSubcat = document.querySelector(`[name="item_subcat_${id}"]`);
                const unitDisp = document.querySelector(`[name="unit_display_${id}"]`);
                const priceInp = document.querySelector(`[name="unit_price_${id}"]`);

                // 품목 선택 적용 (공통)
                function applyItemSelection(item) {
                    hidId.value = item.id;
                    input.value = item.name;
                    hidUnit.value = item.unit;
                    hidCat.value = item.category;
                    if (hidSubcat) hidSubcat.value = item.sub_category || '';
                    unitDisp.value = item.unit;
                    priceInp.value = fmtMoneyInput(item.price);
                    var pm = item.pricing_method || 'FIXED';
                    var pmInp = document.querySelector('[name="pricing_method_' + id + '"]');
                    if (pmInp) pmInp.value = pm;
                    var wInp = document.querySelector('[name="width_' + id + '"]');
                    var hInp = document.querySelector('[name="height_' + id + '"]');
                    var priceLbl = document.getElementById('unit_price_label_' + id);
                    if (pm === 'AREA') {
                        if (wInp) { wInp.classList.add('border-purple-500'); wInp.classList.remove('border-gray-300'); }
                        if (hInp) { hInp.classList.add('border-purple-500'); hInp.classList.remove('border-gray-300'); }
                        if (priceLbl) priceLbl.textContent = '단가 (원/㎡)';
                    } else {
                        if (wInp) { wInp.classList.remove('border-purple-500'); wInp.classList.add('border-gray-300'); }
                        if (hInp) { hInp.classList.remove('border-purple-500'); hInp.classList.add('border-gray-300'); }
                        if (priceLbl) priceLbl.textContent = '단가 (원)';
                    }
                    // FIXED 품목에 규격 정보 표시
                    var specInfo = document.getElementById('item_spec_info_' + id);
                    if (specInfo) {
                        if (pm === 'FIXED' && item.specification) {
                            specInfo.textContent = '규격: ' + item.specification;
                            specInfo.classList.remove('hidden');
                        } else {
                            specInfo.classList.add('hidden');
                        }
                    }
                    // 체크 아이콘 표시
                    var checkEl = document.getElementById('item_check_' + id);
                    if (checkEl) checkEl.classList.remove('hidden');

                    calcItem(id);
                    var subcat = item.sub_category || item.media_subcategory_name || '';
                    loadItemPP(id, subcat);
                    loadFinishingForOrder(id);
                    const clientIdEl = document.getElementById('clientId');
                    const clientId = clientIdEl ? clientIdEl.value : '';
                    if (clientId && item.id) {
                        axios.get('/api/price-list/calculate?item_id=' + item.id + '&client_id=' + clientId)
                            .then(r => { if (r.data?.data?.price > 0) { priceInp.value = fmtMoneyInput(r.data.data.price); calcItem(id); } })
                            .catch(() => {});
                    }
                }

                // 검색 함수 (input/Enter 공용)
                async function doItemSearch(openModal) {
                    var q = input.value.trim();
                    if (!q) return;
                    try {
                        var res = await axios.get('/api/items?search=' + encodeURIComponent(q) + '&type=sales&limit=50');
                        var items = res.data.data || [];
                        if (items.length === 1) {
                            var it = items[0];
                            applyItemSelection({
                                id: it.id, name: it.item_name, price: it.base_price || 0,
                                unit: it.unit || 'EA', category: it.category || it.category_direct || '',
                                sub_category: it.sub_category || it.sub_category_direct || '',
                                pricing_method: it.pricing_method || 'FIXED',
                                specification: it.specification || ''
                            });
                        } else if (items.length > 1 && openModal) {
                            window.openItemSearchModal({ type: 'sales', search: q, onSelect: applyItemSelection });
                        }
                    } catch(e) { console.error('Search error', e); }
                }

                // input: 자동완성 (1건 자동 적용, 모달은 열지 않음)
                input.addEventListener('input', () => {
                    clearTimeout(searchTimers[id]);
                    hidId.value = '';
                    var checkEl2 = document.getElementById('item_check_' + id);
                    if (checkEl2) checkEl2.classList.add('hidden');
                    const q = input.value.trim();
                    if (!q) return;
                    searchTimers[id] = setTimeout(function() { doItemSearch(false); }
                    , 300);
                });

                // Enter: 모달 열기 허용
                input.addEventListener('keydown', function(e) {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        clearTimeout(searchTimers[id]);
                        doItemSearch(true);
                    }
                });
            }

            // ========== 마감 방식 (주문서) ==========
            var finishingMethodsCache = [];

            async function loadFinishingMethodsForOrder() {
                if (finishingMethodsCache.length > 0) return;
                try {
                    var res = await axios.get('/api/finishing/methods');
                    finishingMethodsCache = (res.data.data || []).map(function(m) {
                        return { name: m.name, margin: m.margin_cm };
                    });
                } catch(e) { console.warn('마감 방식 로드 실패'); }
            }

            async function loadFinishingForOrder(id) {
                await loadFinishingMethodsForOrder();
                var methods = finishingMethodsCache;

                var opts = '<option value="">없음</option>' + methods.map(function(m) {
                    return '<option value="' + m.name + '">' + m.name + ' (' + m.margin + 'cm)</option>';
                }).join('');
                ['fin_top_','fin_bottom_','fin_left_','fin_right_'].forEach(function(prefix) {
                    var sel = document.querySelector('[name="' + prefix + id + '"]');
                    if (sel) sel.innerHTML = opts;
                });

                // 프리셋 버튼
                try {
                    var presetsRes = await axios.get('/api/finishing/presets');
                    var presets = presetsRes.data.data || [];
                    var presetsEl = document.getElementById('finishing_presets_' + id);
                    if (presetsEl && presets.length > 0) {
                        presetsEl.innerHTML = presets.map(function(p) {
                            return '<button type="button" data-preset-id="' + id + '" onclick="applyFinPresetToOrder(' + id + ',\'' + escapeHtml(p.config).replace(/'/g, "\\'") + '\',this)" '
                                + 'class="fin-preset-btn px-2 py-0.5 text-[10px] bg-gray-100 text-gray-600 rounded hover:bg-blue-100 hover:text-blue-700 border border-transparent">'
                                + escapeHtml(p.name) + '</button>';
                        }).join('');
                    }
                } catch(e) {}
            }

            window.applyFinPresetToOrder = function(itemId, configStr, btnEl) {
                try {
                    var config = JSON.parse(configStr.replace(/&quot;/g, '"'));
                    ['top','bottom','left','right'].forEach(function(dir) {
                        var sel = document.querySelector('[name="fin_' + dir + '_' + itemId + '"]');
                        if (sel && config[dir]) sel.value = config[dir];
                    });
                    var allSame = config.top && config.top === config.bottom && config.top === config.left && config.top === config.right;
                    if (!allSame) {
                        var sides = document.getElementById('finishing_sides_' + itemId);
                        if (sides) sides.classList.remove('hidden');
                    }
                    // 선택된 프리셋 강조 표시
                    document.querySelectorAll('[data-preset-id="' + itemId + '"]').forEach(function(b) {
                        b.className = 'fin-preset-btn px-2 py-0.5 text-[10px] bg-gray-100 text-gray-600 rounded border border-transparent';
                    });
                    if (btnEl) {
                        btnEl.className = 'fin-preset-btn px-2 py-0.5 text-[10px] bg-blue-600 text-white rounded border border-blue-600';
                    }
                    calcFinishing(itemId);
                } catch(e) {}
            };

            // 사방 동일 적용
            window.applyFinishingAll = function(itemId) {
                var allSel = document.querySelector('[name="fin_all_' + itemId + '"]');
                var val = allSel ? allSel.value : '';
                ['fin_top_','fin_bottom_','fin_left_','fin_right_'].forEach(function(prefix) {
                    var sel = document.querySelector('[name="' + prefix + itemId + '"]');
                    if (sel) sel.value = val;
                });
                calcFinishing(itemId);
            };

            // 개별 설정 토글
            window.toggleFinishingDetail = function(itemId) {
                var sides = document.getElementById('finishing_sides_' + itemId);
                var btn = document.querySelector('#finishing_simple_' + itemId + ' button');
                if (sides) {
                    var isHidden = sides.classList.contains('hidden');
                    sides.classList.toggle('hidden');
                    if (btn) btn.textContent = isHidden ? '개별 설정 ▴' : '개별 설정 ▾';
                }
            };

            // 방식 선택 시 기본 cm 자동 채움
            window.onFinMethodChange = function(itemId, direction) {
                var sel = document.querySelector('[name="fin_' + direction + '_' + itemId + '"]');
                var cmInput = document.querySelector('[name="fin_cm_' + direction + '_' + itemId + '"]');
                if (sel && cmInput) {
                    var methodName = sel.value;
                    var m = finishingMethodsCache.find(function(fm) { return fm.name === methodName; });
                    cmInput.value = m ? m.margin : '';
                }
                calcFinishing(itemId);
            };

            window.calcFinishing = function(itemId) {
                var getVal = function(name) {
                    var sel = document.querySelector('[name="' + name + '"]');
                    return sel ? sel.value : '';
                };
                var getCm = function(direction) {
                    // cm 오버라이드 우선, 없으면 방식 기본값
                    var cmInput = document.querySelector('[name="fin_cm_' + direction + '_' + itemId + '"]');
                    if (cmInput && cmInput.value !== '') return parseFloat(cmInput.value) || 0;
                    var methodName = getVal('fin_' + direction + '_' + itemId);
                    var m = finishingMethodsCache.find(function(fm) { return fm.name === methodName; });
                    return m ? m.margin : 0;
                };

                var mTop = getCm('top'), mBottom = getCm('bottom'), mLeft = getCm('left'), mRight = getCm('right');

                var widthEl = document.querySelector('[name="width_' + itemId + '"]');
                var heightEl = document.querySelector('[name="height_' + itemId + '"]');
                var w = parseFloat(widthEl?.value) || 0;
                var h = parseFloat(heightEl?.value) || 0;

                var calcEl = document.getElementById('finishing_calc_' + itemId);
                if (calcEl && (mTop || mBottom || mLeft || mRight) && w && h) {
                    var finalW = w + mLeft + mRight;
                    var finalH = h + mTop + mBottom;
                    calcEl.innerHTML = '<i class="fas fa-ruler-combined mr-1 text-blue-400"></i>여백: 상' + mTop + ' 하' + mBottom + ' 좌' + mLeft + ' 우' + mRight + 'cm → <span class="font-medium text-blue-600">' + finalW + '×' + finalH + 'cm</span>';
                } else if (calcEl) {
                    calcEl.innerHTML = '';
                }
            };

            async function loadItemPP(rowId, subcat) {
                const container = document.getElementById('pp_options_' + rowId);
                if (!container) return;
                container.innerHTML = '<span class="text-gray-400">로딩 중...</span>';

                if (!subcat) {
                    container.innerHTML = '<span class="text-gray-400 text-xs">소분류 미지정 품목 (후가공 없음)</span>';
                    return;
                }

                try {
                    const res = await axios.get('/api/post-processing/by-subcategory/' + encodeURIComponent(subcat));
                    const options = res.data.data || [];

                    const finishOpts = options.filter(function(o) { return (o.pp_category || 'finish') === 'finish'; });
                    const punchingOpt = options.find(function(o) { return o.pp_category === 'punching'; });
                    const annotationOpt = options.find(function(o) { return o.pp_category === 'annotation'; });
                    const offsetOpt = options.find(function(o) { return o.pp_category === 'offset'; });


                    let html = '';

                    // --- Section 1: Finish PP — per-direction rows ---
                    if (finishOpts.length > 0) {
                        html += '<div class="pp-finish-section mb-3">';
                        html += '<label class="block text-xs font-medium text-gray-600 mb-1">\ub9c8\uac10 \ubc29\uc2dd</label>';

                        // 전체 동일 적용 빠른 선택
                        html += '<div class="pp-finish-all flex items-center gap-2 mb-2 pb-2 border-b border-gray-100">';
                        html += '<span class="text-xs text-blue-600 font-medium whitespace-nowrap">\uc804\uccb4</span>';
                        html += '<select class="pp-finish-all-select flex-1 border border-blue-200 rounded px-2 py-1 text-sm bg-blue-50" data-row="' + rowId + '">';
                        html += '<option value="">\uc120\ud0dd</option>';
                        finishOpts.forEach(function(opt) {
                            html += '<option value="' + opt.id + '"'
                                + ' data-pp-name="' + (opt.option_name || '') + '"'
                                + '>' + opt.option_name + ' (\uc804\uccb4 \ub3d9\uc77c)</option>';
                        });
                        html += '</select>';
                        html += '</div>';

                        var directions = [
                            { key: 'top',    label: '\uc0c1(T)', marginKey: 'margin_top' },
                            { key: 'bottom', label: '\ud558(B)', marginKey: 'margin_bottom' },
                            { key: 'left',   label: '\uc88c(L)', marginKey: 'margin_left' },
                            { key: 'right',  label: '\uc6b0(R)', marginKey: 'margin_right' }
                        ];

                        directions.forEach(function(dir) {
                            html += '<div class="pp-finish-dir-row flex items-center gap-2 mb-1" data-direction="' + dir.key + '">';
                            html += '<span class="w-10 text-xs text-gray-500">' + dir.label + '</span>';
                            html += '<select class="pp-finish-dir flex-1 border border-gray-300 rounded px-2 py-1 text-sm" data-direction="' + dir.key + '" data-row="' + rowId + '">';
                            html += '<option value="">\uc5c6\uc74c</option>';
                            finishOpts.forEach(function(opt) {
                                html += '<option value="' + opt.id + '"'
                                    + ' data-pp-id="' + opt.id + '"'
                                    + ' data-pp-code="' + (opt.option_code || '') + '"'
                                    + ' data-pp-name="' + (opt.option_name || '') + '"'
                                    + ' data-margin-default="' + (opt[dir.marginKey] || 0) + '"'
                                    + ' data-pricing-type="' + (opt.pricing_type || 'fixed') + '"'
                                    + ' data-additional-cost="' + (opt.additional_cost || 0) + '"'
                                    + ' data-unit-price="' + (opt.unit_price || 0) + '"'
                                    + '>' + opt.option_name + '</option>';
                            });
                            html += '</select>';
                            html += '<input type="number" step="0.1" min="0" class="pp-finish-dir-margin w-16 border rounded px-1 py-0.5 text-center text-xs" data-direction="' + dir.key + '" data-row="' + rowId + '" style="display:none">';
                            html += '<span class="pp-dir-cm text-xs text-gray-400" style="display:none">cm</span>';
                            html += '</div>';
                        });

                        html += '<span class="pp-finish-cost text-xs text-orange-600 font-medium mt-1 block"></span>';
                        html += '</div>';
                    }

                    // --- Section 2: Punching checkbox ---
                    if (punchingOpt) {
                        html += '<div class="pp-punching-section mb-3 pt-2 border-t border-gray-100"'
                            + ' data-pp-id="' + punchingOpt.id + '"'
                            + ' data-pp-code="' + (punchingOpt.option_code || '') + '"'
                            + ' data-pp-name="' + (punchingOpt.option_name || '') + '"'
                            + ' data-margin-top="' + (punchingOpt.margin_top || 0) + '"'
                            + ' data-margin-bottom="' + (punchingOpt.margin_bottom || 0) + '"'
                            + ' data-margin-left="' + (punchingOpt.margin_left || 0) + '"'
                            + ' data-margin-right="' + (punchingOpt.margin_right || 0) + '"'
                            + ' data-pricing-type="' + (punchingOpt.pricing_type || 'fixed') + '"'
                            + ' data-additional-cost="' + (punchingOpt.additional_cost || 0) + '"'
                            + ' data-unit-price="' + (punchingOpt.unit_price || 0) + '"'
                            + '>';
                        html += '<label class="flex items-center gap-2 cursor-pointer">';
                        html += '<input type="checkbox" id="pp_punching_check_' + rowId + '" class="pp-punching-check h-4 w-4" data-row="' + rowId + '">';
                        html += '<span class="font-medium text-sm text-gray-700">\ud380\uce6d</span>';
                        html += '</label>';
                        html += '<div id="pp_punching_detail_' + rowId + '" class="mt-2 ml-6" style="display:none;">';
                        html += '<div class="flex gap-1 mb-2 flex-wrap">';
                        html += '<button type="button" class="pp-punch-preset px-2 py-0.5 text-xs border rounded bg-gray-100 hover:bg-gray-200" data-preset="top_bottom" data-row="' + rowId + '">\uc0c1\ud558</button>';
                        html += '<button type="button" class="pp-punch-preset px-2 py-0.5 text-xs border rounded bg-gray-100 hover:bg-gray-200" data-preset="left_right" data-row="' + rowId + '">\uc88c\uc6b0</button>';
                        html += '<button type="button" class="pp-punch-preset px-2 py-0.5 text-xs border rounded bg-gray-100 hover:bg-gray-200" data-preset="all_sides" data-row="' + rowId + '">\uc0c1\ud558\uc88c\uc6b0</button>';
                        html += '<button type="button" class="pp-punch-preset px-2 py-0.5 text-xs border rounded bg-gray-100 hover:bg-gray-200" data-preset="corners" data-row="' + rowId + '">4\ubaa8\uc11c\ub9ac</button>';
                        html += '<button type="button" class="pp-punch-preset px-2 py-0.5 text-xs border rounded bg-gray-100 hover:bg-gray-200" data-preset="reset" data-row="' + rowId + '">\ucd08\uae30\ud654</button>';
                        html += '</div>';
                        html += '<div class="grid grid-cols-3 gap-1 text-center text-xs" style="max-width:200px;">';
                        html += '<label class="flex flex-col items-center"><span>\uc88c\uc0c1</span><input type="number" min="0" max="1" value="0" class="pp-punch-val w-12 border rounded text-center py-0.5" data-key="corner_tl" data-row="' + rowId + '"></label>';
                        html += '<label class="flex flex-col items-center"><span>\uc0c1</span><input type="number" min="0" value="0" class="pp-punch-val w-12 border rounded text-center py-0.5" data-key="side_top" data-row="' + rowId + '"></label>';
                        html += '<label class="flex flex-col items-center"><span>\uc6b0\uc0c1</span><input type="number" min="0" max="1" value="0" class="pp-punch-val w-12 border rounded text-center py-0.5" data-key="corner_tr" data-row="' + rowId + '"></label>';
                        html += '<label class="flex flex-col items-center"><span>\uc88c</span><input type="number" min="0" value="0" class="pp-punch-val w-12 border rounded text-center py-0.5" data-key="side_left" data-row="' + rowId + '"></label>';
                        html += '<div class="flex items-center justify-center text-gray-400 text-xs">\ucd9c\ub825\ubb3c</div>';
                        html += '<label class="flex flex-col items-center"><span>\uc6b0</span><input type="number" min="0" value="0" class="pp-punch-val w-12 border rounded text-center py-0.5" data-key="side_right" data-row="' + rowId + '"></label>';
                        html += '<label class="flex flex-col items-center"><span>\uc88c\ud558</span><input type="number" min="0" max="1" value="0" class="pp-punch-val w-12 border rounded text-center py-0.5" data-key="corner_bl" data-row="' + rowId + '"></label>';
                        html += '<label class="flex flex-col items-center"><span>\ud558</span><input type="number" min="0" value="0" class="pp-punch-val w-12 border rounded text-center py-0.5" data-key="side_bottom" data-row="' + rowId + '"></label>';
                        html += '<label class="flex flex-col items-center"><span>\uc6b0\ud558</span><input type="number" min="0" max="1" value="0" class="pp-punch-val w-12 border rounded text-center py-0.5" data-key="corner_br" data-row="' + rowId + '"></label>';
                        html += '</div>';
                        html += '<span class="pp-punching-cost text-xs text-orange-600 font-medium mt-1 block"></span>';
                        html += '</div>';
                        html += '</div>';
                    }

                    // --- Section 2.5: Offset (다이컷) checkbox ---
                    if (offsetOpt) {
                        html += '<div class="pp-offset-section mb-2 pt-2 border-t border-gray-100"'
                            + ' data-pp-id="' + offsetOpt.id + '"'
                            + ' data-pp-code="' + (offsetOpt.option_code || '') + '"'
                            + ' data-pp-name="' + (offsetOpt.option_name || '') + '"'
                            + ' data-pricing-type="' + (offsetOpt.pricing_type || 'fixed') + '"'
                            + ' data-additional-cost="' + (offsetOpt.additional_cost || 0) + '"'
                            + ' data-unit-price="' + (offsetOpt.unit_price || 0) + '"'
                            + '>';
                        html += '<label class="flex items-center gap-2 cursor-pointer">';
                        html += '<input type="checkbox" id="pp_offset_check_' + rowId + '" class="pp-offset-check h-4 w-4" data-row="' + rowId + '">';
                        html += '<span class="font-medium text-sm text-gray-700">오프셋(다이컷)</span>';
                        html += '</label>';
                        html += '<div id="pp_offset_detail_' + rowId + '" class="mt-2 ml-6" style="display:none;">';
                        html += '<div class="grid grid-cols-4 gap-2 mb-1">';
                        html += '<div class="text-center"><label class="text-xs text-gray-600 block mb-1">상단</label>'
                            + '<input type="number" min="0" max="20" step="0.5" value="0" '
                            + 'class="pp-offset-top w-full border rounded px-2 py-1 text-sm text-center" data-row="' + rowId + '"></div>';
                        html += '<div class="text-center"><label class="text-xs text-gray-600 block mb-1">하단</label>'
                            + '<input type="number" min="0" max="20" step="0.5" value="0" '
                            + 'class="pp-offset-bottom w-full border rounded px-2 py-1 text-sm text-center" data-row="' + rowId + '"></div>';
                        html += '<div class="text-center"><label class="text-xs text-gray-600 block mb-1">좌측</label>'
                            + '<input type="number" min="0" max="20" step="0.5" value="0" '
                            + 'class="pp-offset-left w-full border rounded px-2 py-1 text-sm text-center" data-row="' + rowId + '"></div>';
                        html += '<div class="text-center"><label class="text-xs text-gray-600 block mb-1">우측</label>'
                            + '<input type="number" min="0" max="20" step="0.5" value="0" '
                            + 'class="pp-offset-right w-full border rounded px-2 py-1 text-sm text-center" data-row="' + rowId + '"></div>';
                        html += '</div>';
                        html += '<p class="text-xs text-gray-400">가장자리: 에지 스트립 확장 (도련). 스케일: 비례 확대 (다이컷).</p>';
                        html += '<div class="flex gap-4 mt-2 pt-2 border-t border-gray-100">';
                        html += '<label class="flex items-center gap-1.5 text-sm">';
                        html += '<span class="text-xs text-gray-600">확장:</span>';
                        html += '<select class="pp-offset-method border rounded px-2 py-1 text-xs" data-row="' + rowId + '">';
                        html += '<option value="edge_strip">가장자리(도련)</option>';
                        html += '<option value="scale">스케일(다이컷)</option>';
                        html += '</select></label>';
                        html += '<label class="flex items-center gap-1.5 text-sm">';
                        html += '<input type="checkbox" class="pp-offset-cutline h-4 w-4" data-row="' + rowId + '" checked>';
                        html += '<span class="text-xs text-gray-600">재단선(M100)</span>';
                        html += '</label>';
                        html += '</div>';
                        html += '</div>';
                        html += '</div>';
                    }

                    // --- Section 3: Annotation checkbox ---
                    if (annotationOpt) {
                        html += '<div class="pp-annotation-section mb-2 pt-2 border-t border-gray-100"'
                            + ' data-pp-id="' + annotationOpt.id + '"'
                            + ' data-pp-code="' + (annotationOpt.option_code || '') + '"'
                            + ' data-pp-name="' + (annotationOpt.option_name || '') + '"'
                            + ' data-pricing-type="' + (annotationOpt.pricing_type || 'fixed') + '"'
                            + ' data-additional-cost="' + (annotationOpt.additional_cost || 0) + '"'
                            + ' data-unit-price="' + (annotationOpt.unit_price || 0) + '"'
                            + '>';
                        html += '<label class="flex items-center gap-2 cursor-pointer">';
                        html += '<input type="checkbox" id="pp_annotation_check_' + rowId + '" class="pp-annotation-check h-4 w-4" data-row="' + rowId + '" disabled>';
                        html += '<span class="font-medium text-sm text-gray-400" id="pp_annotation_label_' + rowId + '">\uc8fc\uc11d <span class="text-xs font-normal">(\uc5ec\ubc31 \ud544\uc694)</span></span>';
                        html += '</label>';
                        html += '<div id="pp_annotation_detail_' + rowId + '" class="mt-2 ml-6" style="display:none;">';
                        html += '<div class="flex gap-3 flex-wrap">';
                        html += '<label class="text-xs text-gray-600 flex items-center gap-1"><input type="checkbox" class="pp-anno-dir h-3.5 w-3.5" data-dir="\uc0c1" data-row="' + rowId + '"> \uc0c1</label>';
                        html += '<label class="text-xs text-gray-600 flex items-center gap-1"><input type="checkbox" class="pp-anno-dir h-3.5 w-3.5" data-dir="\ud558" data-row="' + rowId + '" checked> \ud558</label>';
                        html += '<label class="text-xs text-gray-600 flex items-center gap-1"><input type="checkbox" class="pp-anno-dir h-3.5 w-3.5" data-dir="\uc88c" data-row="' + rowId + '"> \uc88c</label>';
                        html += '<label class="text-xs text-gray-600 flex items-center gap-1"><input type="checkbox" class="pp-anno-dir h-3.5 w-3.5" data-dir="\uc6b0" data-row="' + rowId + '"> \uc6b0</label>';
                        html += '</div>';
                        html += '<div class="mt-1.5">';
                        html += '<input type="text" class="pp-anno-text w-full px-2 py-1 border border-gray-300 rounded text-xs" data-row="' + rowId + '" placeholder="\uc790\ub3d9\uc0dd\uc131 (\uc608: \uc2e4\uc0ac\uad11\uace0-615x375-1\uac1c)">';
                        html += '</div>';
                        html += '<span class="pp-annotation-cost text-xs text-orange-600 font-medium mt-1 block"></span>';
                        html += '</div>';
                        html += '</div>';
                    }

                    container.innerHTML = html || '<div class="text-sm text-gray-400">\uc774 \uc18c\ubd84\ub958\uc5d0 \uc801\uc6a9 \uac00\ub2a5\ud55c \ud6c4\uac00\uacf5\uc774 \uc5c6\uc2b5\ub2c8\ub2e4.</div>';

                    setupPPEvents(rowId);

                } catch(e) {
                    console.error('loadItemPP error:', e);
                    container.innerHTML = '<span class="text-red-400 text-xs">\ud6c4\uac00\uacf5 \ub85c\ub529 \uc2e4\ud328</span>';
                }
            }

            function setupPPEvents(rowId) {
                const container = document.getElementById('pp_options_' + rowId);
                if (!container) return;

                // "전체 동일" 빠른 선택 이벤트
                var allSelect = container.querySelector('.pp-finish-all-select');
                if (allSelect) {
                    allSelect.addEventListener('change', function() {
                        var val = this.value;
                        container.querySelectorAll('.pp-finish-dir').forEach(function(sel) {
                            sel.value = val;
                            sel.dispatchEvent(new Event('change'));
                        });
                        this.value = '';
                    });
                }

                // Per-direction finish dropdown change
                container.querySelectorAll('.pp-finish-dir').forEach(function(sel) {
                    sel.addEventListener('change', function() {
                        var row = this.closest('.pp-finish-dir-row');
                        var marginInput = row.querySelector('.pp-finish-dir-margin');
                        var cmLabel = row.querySelector('.pp-dir-cm');
                        if (this.value) {
                            var opt = this.options[this.selectedIndex];
                            marginInput.value = opt.dataset.marginDefault || 0;
                            marginInput.style.display = '';
                            if (cmLabel) cmLabel.style.display = '';
                        } else {
                            marginInput.style.display = 'none';
                            if (cmLabel) cmLabel.style.display = 'none';
                        }
                        updateAnnotationState(rowId);
                        calculatePPCost(rowId);
                        calculateTotal();
                    });
                });

                // Per-direction margin input change
                container.querySelectorAll('.pp-finish-dir-margin').forEach(function(inp) {
                    inp.addEventListener('input', function() {
                        calculatePPCost(rowId);
                        calculateTotal();
                    });
                });

                // Punching checkbox
                const punchCheck = container.querySelector('.pp-punching-check');
                if (punchCheck) {
                    punchCheck.addEventListener('change', function() {
                        const detail = document.getElementById('pp_punching_detail_' + rowId);
                        if (detail) detail.style.display = this.checked ? '' : 'none';
                        updateAnnotationState(rowId);
                        calculatePPCost(rowId);
                        calculateTotal();
                    });
                }

                // Punching grid input changes
                container.querySelectorAll('.pp-punch-val').forEach(function(input) {
                    input.addEventListener('input', function() {
                        calculatePPCost(rowId);
                        calculateTotal();
                    });
                });

                // Punching preset buttons
                container.querySelectorAll('.pp-punch-preset').forEach(function(btn) {
                    btn.addEventListener('click', function() {
                        const preset = this.dataset.preset;
                        const vals = container.querySelectorAll('.pp-punch-val');
                        const map = {};
                        vals.forEach(function(v) { map[v.dataset.key] = v; });

                        // Reset all first
                        vals.forEach(function(v) { v.value = 0; });

                        if (preset === 'top_bottom') {
                            if (map['side_top']) map['side_top'].value = 1;
                            if (map['side_bottom']) map['side_bottom'].value = 1;
                        } else if (preset === 'left_right') {
                            if (map['side_left']) map['side_left'].value = 1;
                            if (map['side_right']) map['side_right'].value = 1;
                        } else if (preset === 'all_sides') {
                            if (map['side_top']) map['side_top'].value = 1;
                            if (map['side_bottom']) map['side_bottom'].value = 1;
                            if (map['side_left']) map['side_left'].value = 1;
                            if (map['side_right']) map['side_right'].value = 1;
                        } else if (preset === 'corners') {
                            if (map['corner_tl']) map['corner_tl'].value = 1;
                            if (map['corner_tr']) map['corner_tr'].value = 1;
                            if (map['corner_bl']) map['corner_bl'].value = 1;
                            if (map['corner_br']) map['corner_br'].value = 1;
                        }
                        // 'reset' just leaves all at 0

                        calculatePPCost(rowId);
                        calculateTotal();
                    });
                });

                // Annotation checkbox
                const annoCheck = container.querySelector('.pp-annotation-check');
                if (annoCheck) {
                    annoCheck.addEventListener('change', function() {
                        const detail = document.getElementById('pp_annotation_detail_' + rowId);
                        if (detail) detail.style.display = this.checked ? '' : 'none';
                        calculatePPCost(rowId);
                        calculateTotal();
                    });
                }

                // Annotation direction checkboxes
                container.querySelectorAll('.pp-anno-dir').forEach(function(cb) {
                    cb.addEventListener('change', function() {
                        calculatePPCost(rowId);
                        calculateTotal();
                    });
                });

                // Offset checkbox
                const offsetCheck = container.querySelector('.pp-offset-check');
                if (offsetCheck) {
                    offsetCheck.addEventListener('change', function() {
                        const detail = document.getElementById('pp_offset_detail_' + rowId);
                        if (detail) detail.style.display = this.checked ? '' : 'none';
                        calculatePPCost(rowId);
                        calculateTotal();
                    });
                }


            }

            function updateAnnotationState(rowId) {
                const container = document.getElementById('pp_options_' + rowId);
                if (!container) return;

                const annoCheck = container.querySelector('.pp-annotation-check');
                const annoLabel = document.getElementById('pp_annotation_label_' + rowId);

                if (!annoCheck) return;

                var hasFinish = Array.from(container.querySelectorAll('.pp-finish-dir')).some(function(sel) { return sel.value !== ''; });
                // 펀칭은 여백 0 (마크가 그룹 안쪽) → annotation enable 무관
                var hasMargins = hasFinish;

                annoCheck.disabled = !hasMargins;
                if (annoLabel) {
                    annoLabel.className = hasMargins
                        ? 'font-medium text-sm text-gray-700'
                        : 'font-medium text-sm text-gray-400';
                    annoLabel.innerHTML = hasMargins
                        ? '\uc8fc\uc11d'
                        : '\uc8fc\uc11d <span class="text-xs font-normal">(\uc5ec\ubc31 \ud544\uc694)</span>';
                }

                // If margins removed, uncheck annotation
                if (!hasMargins && annoCheck.checked) {
                    annoCheck.checked = false;
                    const detail = document.getElementById('pp_annotation_detail_' + rowId);
                    if (detail) detail.style.display = 'none';
                }
            }

            function renumberDisplay() {
                document.querySelectorAll('#itemsContainer > [id^="item-"]').forEach(function(row, idx) {
                    var span = row.querySelector('span.font-bold.text-gray-700');
                    if (span) {
                        span.textContent = '품목 #' + (idx + 1);
                    } else {
                        var pspan = row.querySelector('span.font-bold.text-green-700');
                        if (pspan) pspan.textContent = '묶음 품목 #' + (idx + 1);
                    }
                });
            }

            window.addItemRow = function() {
                var rows = document.querySelectorAll('#itemsContainer > [id^="item-"]');
                var maxId = 0;
                rows.forEach(function(row) {
                    var id = parseInt(row.id.replace('item-', ''));
                    if (id > maxId) maxId = id;
                });
                itemCount = maxId + 1;
                const wrap = document.createElement('div');
                wrap.innerHTML = buildItemHtml(itemCount);
                var newRow = wrap.firstElementChild;
                document.getElementById('itemsContainer').appendChild(newRow);
                setupAutocomplete(itemCount);
                if (window.bindMoneyInputs) window.bindMoneyInputs(newRow);
                renumberDisplay();
            };

            window.openThumbModal = function(imgId) {
                var imgEl = document.getElementById(imgId);
                if (!imgEl || !imgEl.src) return;

                var overlay = document.createElement('div');
                overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:9999;'
                    + 'display:flex;align-items:center;justify-content:center;overflow:hidden';

                var img = document.createElement('img');
                img.src = imgEl.src;
                img.style.cssText = 'width:90vw;height:90vh;object-fit:contain;'
                    + 'transform-origin:center center;transition:transform 0.08s ease-out;cursor:zoom-in';

                var scale = 1;
                overlay.addEventListener('wheel', function(e) {
                    e.preventDefault();
                    var delta = e.deltaY < 0 ? 0.15 : -0.15;
                    scale = Math.max(0.2, Math.min(8, scale + delta));
                    img.style.transform = 'scale(' + scale + ')';
                    img.style.cursor = scale > 1 ? 'grab' : 'zoom-in';
                }, { passive: false });

                overlay.addEventListener('click', function(e) {
                    if (e.target === overlay) { document.body.removeChild(overlay); document.removeEventListener('keydown', onKey); }
                });

                var onKey = function(e) {
                    if (e.key === 'Escape') { document.body.removeChild(overlay); document.removeEventListener('keydown', onKey); }
                };
                document.addEventListener('keydown', onKey);

                var hint = document.createElement('div');
                hint.style.cssText = 'position:absolute;bottom:16px;left:50%;transform:translateX(-50%);'
                    + 'color:rgba(255,255,255,0.65);font-size:12px;pointer-events:none;user-select:none;'
                    + 'background:rgba(0,0,0,0.4);padding:4px 10px;border-radius:20px';
                hint.textContent = '스크롤: 확대/축소  ·  바깥 클릭 또는 ESC: 닫기';

                overlay.appendChild(img);
                overlay.appendChild(hint);
                document.body.appendChild(overlay);
            };

            window.removeItem = function(id) {
                // 자식 행 먼저 삭제 (묶음 부모행인 경우)
                document.querySelectorAll('[data-parent-row="' + id + '"]').forEach(function(el) {
                    el.remove();
                });
                const el = document.getElementById(`item-${id}`);
                if (el) { el.remove(); renumberDisplay(); calculateTotal(); }
            };

            window.onScaleFactorChange = function(id) {
                const sf = parseFloat(document.querySelector(`[name="scale_factor_${id}"]`)?.value) || 1;
                const wEl = document.querySelector(`[name="width_${id}"]`);
                const hEl = document.querySelector(`[name="height_${id}"]`);
                if (wEl && wEl.dataset.origMm) wEl.value = (parseFloat(wEl.dataset.origMm) / 10 * sf).toFixed(1);
                if (hEl && hEl.dataset.origMm) hEl.value = (parseFloat(hEl.dataset.origMm) / 10 * sf).toFixed(1);

                // 자식 행들의 scale_factor + 크기 업데이트
                document.querySelectorAll('[data-parent-row="' + id + '"]').forEach(function(childRow) {
                    var sfInput = childRow.querySelector('[name^="child_scale_factor_"]');
                    if (sfInput) sfInput.value = sf;
                    var sizeSpan = childRow.querySelector('[data-orig-mm-w]');
                    if (sizeSpan) {
                        var origW = parseFloat(sizeSpan.dataset.origMmW) || 0;
                        var origH = parseFloat(sizeSpan.dataset.origMmH) || 0;
                        if (origW > 0 && origH > 0) {
                            var wCm = (origW / 10 * sf).toFixed(1);
                            var hCm = (origH / 10 * sf).toFixed(1);
                            var sizeLabel = sizeSpan.querySelector('[id^="child_size_"]');
                            if (sizeLabel) sizeLabel.textContent = wCm + '\u00d7' + hCm + 'cm';
                            if (sfInput) {
                                var childId = sfInput.name.replace('child_scale_factor_', '');
                                var wHidden = childRow.querySelector('[name="child_width_' + childId + '"]');
                                var hHidden = childRow.querySelector('[name="child_height_' + childId + '"]');
                                if (wHidden) wHidden.value = wCm;
                                if (hHidden) hHidden.value = hCm;
                            }
                        }
                    }
                });

                calcItem(id);
            };

            window.onParentScaleChange = function(parentId) {
                const sf = parseFloat(document.querySelector('[name="scale_factor_' + parentId + '"]')?.value) || 1;

                // 부모 자신의 규격도 스케일 반영
                const wEl = document.querySelector('[name="width_' + parentId + '"]');
                const hEl = document.querySelector('[name="height_' + parentId + '"]');
                if (wEl && wEl.dataset.origMm) wEl.value = (parseFloat(wEl.dataset.origMm) / 10 * sf).toFixed(1);
                if (hEl && hEl.dataset.origMm) hEl.value = (parseFloat(hEl.dataset.origMm) / 10 * sf).toFixed(1);

                document.querySelectorAll('[data-parent-row="' + parentId + '"]').forEach(function(childRow) {
                    const childId = childRow.id.replace('item_row_', '');
                    const sfInput = childRow.querySelector('[name^="child_scale_factor_"]');
                    if (sfInput) sfInput.value = sf;
                    const outerSpan = childRow.querySelector('[data-orig-mm-w]');
                    if (!outerSpan) return;
                    const wMm = parseFloat(outerSpan.dataset.origMmW || '0');
                    const hMm = parseFloat(outerSpan.dataset.origMmH || '0');
                    if (!wMm && !hMm) return;
                    const wCm = (wMm / 10 * sf).toFixed(1);
                    const hCm = (hMm / 10 * sf).toFixed(1);
                    const sizeEl = document.getElementById('child_size_' + childId);
                    if (sizeEl) sizeEl.textContent = wCm + '×' + hCm + 'cm';
                    const wHid = childRow.querySelector('[name="child_width_' + childId + '"]');
                    const hHid = childRow.querySelector('[name="child_height_' + childId + '"]');
                    if (wHid) wHid.value = wCm;
                    if (hHid) hHid.value = hCm;
                });
                calcItem(parentId);
            };

            function calculatePPCost(rowId) {
                const container = document.getElementById('pp_options_' + rowId);
                if (!container) return 0;

                const w = parseFloat(document.querySelector('[name="width_' + rowId + '"]')?.value) || 0;
                const h = parseFloat(document.querySelector('[name="height_' + rowId + '"]')?.value) || 0;
                const qty = parseInt(document.querySelector('[name="quantity_' + rowId + '"]')?.value) || 1;
                let subtotal = 0;

                // 1. Finish PP cost — group by ppId across 4 directions
                var ppCostMap = {};
                container.querySelectorAll('.pp-finish-dir').forEach(function(sel) {
                    if (!sel.value) return;
                    var opt = sel.options[sel.selectedIndex];
                    var ppId = opt.dataset.ppId;
                    var dirRow = sel.closest('.pp-finish-dir-row');
                    var margin = parseFloat(dirRow.querySelector('.pp-finish-dir-margin').value) || 0;

                    if (!ppCostMap[ppId]) {
                        ppCostMap[ppId] = {
                            pricingType: opt.dataset.pricingType || 'fixed',
                            unitPrice: parseFloat(opt.dataset.unitPrice) || 0,
                            additionalCost: parseFloat(opt.dataset.additionalCost) || 0,
                            marginSum: 0
                        };
                    }
                    ppCostMap[ppId].marginSum += margin;
                });

                var finishCost = 0;
                Object.keys(ppCostMap).forEach(function(ppId) {
                    var info = ppCostMap[ppId];
                    if (info.pricingType === 'fixed') finishCost += info.additionalCost;
                    else if (info.pricingType === 'per_length') finishCost += info.marginSum * info.unitPrice;
                    else if (info.pricingType === 'per_sqm') finishCost += (w / 100) * (h / 100) * info.unitPrice;
                    else if (info.pricingType === 'per_meter') finishCost += ((w + h) * 2 / 100) * info.unitPrice;
                    else if (info.pricingType === 'per_unit') finishCost += qty * info.unitPrice;
                });
                finishCost = Math.round(finishCost);

                var finishCostSpan = container.querySelector('.pp-finish-cost');
                if (finishCostSpan) finishCostSpan.textContent = finishCost > 0 ? '+' + finishCost.toLocaleString() + '\uc6d0' : '';
                subtotal += finishCost;

                // 2. Punching cost
                const punchSection = container.querySelector('.pp-punching-section');
                const punchCheck = container.querySelector('.pp-punching-check');
                const punchCostSpan = container.querySelector('.pp-punching-cost');
                if (punchCheck && punchCheck.checked && punchSection) {
                    const pricingType = punchSection.dataset.pricingType || 'fixed';
                    const additionalCost = parseFloat(punchSection.dataset.additionalCost) || 0;
                    let cost = pricingType === 'fixed' ? additionalCost : 0;
                    cost = Math.round(cost);
                    if (punchCostSpan) punchCostSpan.textContent = cost > 0 ? '+' + cost.toLocaleString() + '\uc6d0' : '';
                    subtotal += cost;
                } else if (punchCostSpan) {
                    punchCostSpan.textContent = '';
                }

                // 3. Annotation cost
                const annoSection = container.querySelector('.pp-annotation-section');
                const annoCheck = container.querySelector('.pp-annotation-check');
                const annoCostSpan = container.querySelector('.pp-annotation-cost');
                if (annoCheck && annoCheck.checked && annoSection) {
                    const pricingType = annoSection.dataset.pricingType || 'fixed';
                    const additionalCost = parseFloat(annoSection.dataset.additionalCost) || 0;
                    let cost = pricingType === 'fixed' ? additionalCost : 0;
                    cost = Math.round(cost);
                    if (annoCostSpan) annoCostSpan.textContent = cost > 0 ? '+' + cost.toLocaleString() + '\uc6d0' : '';
                    subtotal += cost;
                } else if (annoCostSpan) {
                    annoCostSpan.textContent = '';
                }

                const subtotalEl = document.getElementById('pp_subtotal_' + rowId);
                if (subtotalEl) subtotalEl.textContent = subtotal > 0 ? '\ud6c4\uac00\uacf5 \uc18c\uacc4: ' + subtotal.toLocaleString() + '\uc6d0' : '';
                return subtotal;
            }

            window.calcItem = function(id) {
                var qty = parseInt(document.querySelector('[name="quantity_' + id + '"]').value) || 0;
                var price = parseMoney((document.querySelector('[name="unit_price_' + id + '"]') || {}).value);
                var pmEl = document.querySelector('[name="pricing_method_' + id + '"]');
                var pm = pmEl ? pmEl.value : 'FIXED';
                var amt;
                if (pm === 'AREA') {
                    var wEl = document.querySelector('[name="width_' + id + '"]');
                    var hEl = document.querySelector('[name="height_' + id + '"]');
                    var wRaw = wEl ? (parseFloat(wEl.value) || 0) : 0;
                    var hRaw = hEl ? (parseFloat(hEl.value) || 0) : 0;
                    // 금액 계산용: 10cm 단위 올림 (표시는 원본 유지)
                    var w = Math.ceil(wRaw / 10) * 10;
                    var h = Math.ceil(hRaw / 10) * 10;
                    amt = price * (w / 100) * (h / 100) * qty;
                } else {
                    amt = qty * price;
                }
                // 100원 단위 반올림
                amt = Math.round(amt / 100) * 100;
                var el = document.querySelector('[name="amount_' + id + '"]');
                if (el) {
                    // 금액이 수동 수정되지 않았으면 자동 계산값 적용
                    var wasManual = el.classList.contains('border-amber-400');
                    if (!wasManual) {
                        el.value = amt.toLocaleString() + '원';
                    }
                    el.dataset.autoAmount = String(amt);
                }
                calculateTotal();
            };

            function calculateTotal() {
                var total = 0, vat = 0, ppTotal = 0;
                document.querySelectorAll('#itemsContainer > [id^="item-"]').forEach(function(row) {
                    var id = row.id.replace('item-', '');
                    var isChildInput = row.querySelector('[name^="is_child_"]');
                    var isChild = isChildInput && isChildInput.value === '1';
                    var qty = parseInt((document.querySelector('[name="quantity_' + id + '"]') || {}).value || 0);
                    var price = parseMoney((document.querySelector('[name="unit_price_' + id + '"]') || {}).value);
                    var pmEl = document.querySelector('[name="pricing_method_' + id + '"]');
                    var pm = pmEl ? pmEl.value : 'FIXED';
                    var amt;
                    if (pm === 'AREA') {
                        var wEl = document.querySelector('[name="width_' + id + '"]');
                        var hEl = document.querySelector('[name="height_' + id + '"]');
                        var wRaw2 = wEl ? (parseFloat(wEl.value) || 0) : 0;
                        var hRaw2 = hEl ? (parseFloat(hEl.value) || 0) : 0;
                        var w2 = Math.ceil(wRaw2 / 10) * 10;
                        var h2 = Math.ceil(hRaw2 / 10) * 10;
                        amt = price * (w2 / 100) * (h2 / 100) * qty;
                    } else {
                        amt = qty * price;
                    }
                    amt = Math.round(amt / 100) * 100;
                    total += amt;
                    var vatEl = document.querySelector('[name="vat_' + id + '"]');
                    if (vatEl && vatEl.checked) vat += Math.round(amt * 0.1);
                    if (!isChild) ppTotal += calculatePPCost(id) || 0;
                });
                var discount = parseMoney((document.getElementById('discountAmount') || {}).value);
                document.getElementById('totalAmount').textContent = Math.round(total).toLocaleString();
                document.getElementById('totalVat').textContent = vat.toLocaleString();
                var ppTotalEl = document.getElementById('totalPPCost');
                if (ppTotalEl) ppTotalEl.textContent = ppTotal > 0 ? ppTotal.toLocaleString() : '0';
                document.getElementById('grandTotal').textContent = Math.max(0, Math.round(total) + vat + ppTotal - discount).toLocaleString();
            }

            // Enter 키 스마트 동작 (폼 제출 방지 + 필드별 편의 기능)
            document.getElementById('orderForm').addEventListener('keydown', function(e) {
                if (e.key !== 'Enter' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'BUTTON') return;
                e.preventDefault();

                var el = e.target;
                var name = el.name || el.id || '';

                // 1) 품목 검색 필드: 드롭다운 첫 번째 항목 자동 선택
                if (name.startsWith('item_search_')) {
                    var rowId = name.replace('item_search_', '');
                    var dd = document.getElementById('item_dd_' + rowId);
                    if (dd && !dd.classList.contains('hidden')) {
                        var first = dd.querySelector('.item-dd-entry');
                        if (first) { first.dispatchEvent(new MouseEvent('mousedown', {bubbles: true})); return; }
                    }
                    // 드롭다운 없으면 가로 필드로 이동
                    var wField = document.querySelector('[name="width_' + rowId + '"]');
                    if (wField) wField.focus();
                    return;
                }

                // 2) 수량/단가/규격 필드: 같은 행 내 다음 필드로 이동
                var match = name.match(/^(width|height|quantity|unit_price|content)_(\d+)$/);
                if (match) {
                    var field = match[1];
                    var rid = match[2];
                    var order = ['width', 'height', 'quantity', 'unit_price', 'content'];
                    var idx = order.indexOf(field);
                    if (idx >= 0 && idx < order.length - 1) {
                        // 다음 필드로 이동
                        var next = document.querySelector('[name="' + order[idx + 1] + '_' + rid + '"]');
                        if (next) { next.focus(); next.select(); return; }
                    }
                    // 마지막 필드(content)이면 → 새 품목 행 추가 + 포커스
                    if (field === 'content' || field === 'unit_price') {
                        addItemRow();
                        setTimeout(function() {
                            var rows = document.querySelectorAll('#itemsContainer > [id^="item-"]');
                            var lastRow = rows[rows.length - 1];
                            if (lastRow) {
                                var newId = lastRow.id.replace('item-', '');
                                var searchField = document.querySelector('[name="item_search_' + newId + '"]');
                                if (searchField) searchField.focus();
                            }
                        }, 100);
                        return;
                    }
                }

                // 3) 거래처 검색: 기존 handleClientEnter 유지 (이미 별도 핸들러 있음)
                // 4) 기타 필드: 다음 input으로 포커스 이동 (Tab과 유사)
                var allInputs = Array.from(document.getElementById('orderForm').querySelectorAll('input:not([type="hidden"]):not([type="checkbox"]), select, textarea'));
                var curIdx = allInputs.indexOf(el);
                if (curIdx >= 0 && curIdx < allInputs.length - 1) {
                    allInputs[curIdx + 1].focus();
                }
            });

            var isSubmitting = false;
            document.getElementById('orderForm').addEventListener('submit', async (e) => {
                e.preventDefault();
                if (isSubmitting) return;

                const clientId = document.getElementById('clientId').value;
                if (!clientId) { showToast('거래처를 선택하세요.', 'warning'); return; }

                // 납기일 과거 검증
                const deliveryDateVal = document.getElementById('deliveryDate').value;
                if (deliveryDateVal) {
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    const delivery = new Date(deliveryDateVal);
                    if (delivery < today) {
                        if (!(await showConfirm('납기일이 과거입니다 (' + deliveryDateVal + '). 계속 진행하시겠습니까?'))) {
                            return;
                        }
                    }
                }

                // 일반/부모 행(item-N) + 자식 행(item_row_N) 모두 수집
                const itemRows = document.querySelectorAll('#itemsContainer > [id^="item"]');
                if (!itemRows.length) { showToast('최소 1개 이상의 품목을 추가하세요.', 'warning'); return; }

                const items = [];
                let valid = true;
                itemRows.forEach((row, idx) => {
                    if (!valid) return;

                    // ── 자식 행 처리 ──
                    const isChildInput = row.querySelector('[name^="is_child_"]');
                    if (isChildInput && isChildInput.value === '1') {
                        const childId = isChildInput.name.replace('is_child_', '');
                        const childParentRowId = row.getAttribute('data-parent-row');
                        const parentRowEl = childParentRowId
                            ? document.getElementById('item-' + childParentRowId)
                            : null;
                        const parentItemName = parentRowEl
                            ?.querySelector('[name^="item_search_"]')?.value?.trim() || '묶음 품목';
                        items.push({
                            item_name: parentItemName,
                            parent_client_id: row.querySelector(`[name="parent_client_id_${childId}"]`)?.value || null,
                            ai_group_index: (() => { const v = row.querySelector(`[name="child_ai_group_index_${childId}"]`)?.value; return (v !== '' && v !== undefined) ? parseInt(v) : null; })(),
                            ai_analysis_id: (() => { const v = row.querySelector(`[name="child_ai_analysis_id_${childId}"]`)?.value; return (v !== '' && v !== undefined && !isNaN(parseInt(v))) ? parseInt(v) : null; })(),
                            content: row.querySelector(`[name="child_content_${childId}"]`)?.value || null,
                            width: (() => { const v = row.querySelector(`[name="child_width_${childId}"]`)?.value; return v ? parseFloat(v) : null; })(),
                            height: (() => { const v = row.querySelector(`[name="child_height_${childId}"]`)?.value; return v ? parseFloat(v) : null; })(),
                            scale_factor: parseFloat(row.querySelector(`[name="child_scale_factor_${childId}"]`)?.value || '1'),
                            quantity: parseInt(row.querySelector('[name="child_qty_' + childId + '"]')?.value || '1'),
                            unit: 'EA',
                            unit_price: 0,
                            vat_included: 1,
                            sort_order: idx + 1,
                        });
                        return;
                    }

                    // ── 일반/부모 행 처리 ──
                    const id = row.id.replace('item-', '');
                    const itemName = document.querySelector(`[name="item_search_${id}"]`)?.value?.trim();
                    if (!itemName) { showToast(`품목 #${idx + 1}: 품목명을 입력하세요.`, 'warning'); valid = false; return; }
                    // 3-section PP 수집 (finish / punching / annotation)
                    const pp = [];
                    const ppContainer = document.getElementById('pp_options_' + id);
                    const w = parseFloat(document.querySelector('[name="width_' + id + '"]')?.value) || 0;
                    const h = parseFloat(document.querySelector('[name="height_' + id + '"]')?.value) || 0;
                    const qty = parseInt(document.querySelector('[name="quantity_' + id + '"]')?.value) || 1;

                    if (ppContainer) {
                        // 1. Finish PP — group by ppCode across 4 directions
                        var finishByPP = {};
                        ppContainer.querySelectorAll('.pp-finish-dir').forEach(function(sel) {
                            if (!sel.value) return;
                            var opt = sel.options[sel.selectedIndex];
                            var dir = sel.dataset.direction;
                            var dirRow = sel.closest('.pp-finish-dir-row');
                            var margin = parseFloat(dirRow.querySelector('.pp-finish-dir-margin').value) || 0;
                            var ppCode = opt.dataset.ppCode;

                            if (!finishByPP[ppCode]) {
                                finishByPP[ppCode] = {
                                    id: parseInt(opt.dataset.ppId),
                                    code: ppCode,
                                    name: opt.dataset.ppName,
                                    margin_top: 0, margin_bottom: 0, margin_left: 0, margin_right: 0,
                                    params: { directions: {} },
                                    _pricingType: opt.dataset.pricingType || 'fixed',
                                    _unitPrice: parseFloat(opt.dataset.unitPrice) || 0,
                                    _additionalCost: parseFloat(opt.dataset.additionalCost) || 0,
                                    _marginSum: 0
                                };
                            }

                            var dirMap = { top: 'margin_top', bottom: 'margin_bottom', left: 'margin_left', right: 'margin_right' };
                            finishByPP[ppCode][dirMap[dir]] = margin;
                            finishByPP[ppCode].params.directions[dir] = margin;
                            finishByPP[ppCode]._marginSum += margin;
                        });

                        Object.keys(finishByPP).forEach(function(code) {
                            var entry = finishByPP[code];
                            var price = 0;
                            if (entry._pricingType === 'fixed') price = entry._additionalCost;
                            else if (entry._pricingType === 'per_length') price = entry._marginSum * entry._unitPrice;
                            else if (entry._pricingType === 'per_sqm') price = (w / 100) * (h / 100) * entry._unitPrice;
                            else if (entry._pricingType === 'per_meter') price = ((w + h) * 2 / 100) * entry._unitPrice;
                            else if (entry._pricingType === 'per_unit') price = qty * entry._unitPrice;
                            entry.price = Math.round(price);
                            delete entry._pricingType;
                            delete entry._unitPrice;
                            delete entry._additionalCost;
                            delete entry._marginSum;
                            pp.push(entry);
                        });

                        // 2. Punching
                        const punchCheck = ppContainer.querySelector('.pp-punching-check');
                        const punchSection = ppContainer.querySelector('.pp-punching-section');
                        if (punchCheck && punchCheck.checked && punchSection) {
                            const punchParams = {};
                            ppContainer.querySelectorAll('.pp-punch-val').forEach(function(el) {
                                punchParams[el.dataset.key] = parseInt(el.value) || 0;
                            });
                            punchParams.margin_top = parseFloat(punchSection.dataset.marginTop) || 0;
                            punchParams.margin_bottom = parseFloat(punchSection.dataset.marginBottom) || 0;
                            punchParams.margin_left = parseFloat(punchSection.dataset.marginLeft) || 0;
                            punchParams.margin_right = parseFloat(punchSection.dataset.marginRight) || 0;

                            pp.push({
                                id: parseInt(punchSection.dataset.ppId),
                                code: punchSection.dataset.ppCode,
                                name: punchSection.dataset.ppName,
                                margin_left: parseFloat(punchSection.dataset.marginLeft) || 0,
                                margin_right: parseFloat(punchSection.dataset.marginRight) || 0,
                                margin_top: parseFloat(punchSection.dataset.marginTop) || 0,
                                margin_bottom: parseFloat(punchSection.dataset.marginBottom) || 0,
                                params: punchParams,
                                price: 0
                            });
                        }

                        // 3. Annotation
                        const annoCheck = ppContainer.querySelector('.pp-annotation-check');
                        const annoSection = ppContainer.querySelector('.pp-annotation-section');
                        if (annoCheck && annoCheck.checked && annoSection) {
                            const annoParams = {};
                            var positions = [];
                            ppContainer.querySelectorAll('.pp-anno-dir:checked').forEach(function(cb) {
                                positions.push(cb.dataset.dir);
                            });
                            annoParams.positions = positions;
                            var annoTextInput = ppContainer.querySelector('.pp-anno-text');
                            if (annoTextInput && annoTextInput.value.trim()) {
                                annoParams.customText = annoTextInput.value.trim();
                            }

                            pp.push({
                                id: parseInt(annoSection.dataset.ppId),
                                code: annoSection.dataset.ppCode,
                                name: annoSection.dataset.ppName,
                                margin_left: 0,
                                margin_right: 0,
                                margin_top: 0,
                                margin_bottom: 0,
                                params: annoParams,
                                price: 0
                            });
                        }

                        // 4. Offset (다이컷)
                        const offsetCheck2 = ppContainer.querySelector('.pp-offset-check');
                        const offsetSection = ppContainer.querySelector('.pp-offset-section');
                        if (offsetCheck2 && offsetCheck2.checked && offsetSection) {
                            var oTop = parseFloat(ppContainer.querySelector('.pp-offset-top').value) || 0;
                            var oBottom = parseFloat(ppContainer.querySelector('.pp-offset-bottom').value) || 0;
                            var oLeft = parseFloat(ppContainer.querySelector('.pp-offset-left').value) || 0;
                            var oRight = parseFloat(ppContainer.querySelector('.pp-offset-right').value) || 0;
                            pp.push({
                                id: parseInt(offsetSection.dataset.ppId),
                                code: offsetSection.dataset.ppCode,
                                name: offsetSection.dataset.ppName,
                                margin_left: 0,
                                margin_right: 0,
                                margin_top: 0,
                                margin_bottom: 0,
                                params: {
                                    offset_top: oTop, offset_bottom: oBottom,
                                    offset_left: oLeft, offset_right: oRight,
                                    method: (ppContainer.querySelector('.pp-offset-method') || {}).value || 'edge_strip',
                                    cut_line: ppContainer.querySelector('.pp-offset-cutline') ? ppContainer.querySelector('.pp-offset-cutline').checked : true
                                },
                                price: 0
                            });
                        }


                    }
                    const wVal = document.querySelector(`[name="width_${id}"]`)?.value;
                    const hVal = document.querySelector(`[name="height_${id}"]`)?.value;
                    const aiGroupIdxVal = document.querySelector(`[name="ai_group_index_${id}"]`)?.value;
                    const aiAnalysisIdVal = document.querySelector(`[name="ai_analysis_id_${id}"]`)?.value;
                    const sfEl = document.querySelector(`[name="scale_factor_${id}"]`);
                    const sfVal = sfEl ? sfEl.value : '';
                    var pmItemEl = document.querySelector('[name="pricing_method_' + id + '"]');
                    var pmItem = pmItemEl ? pmItemEl.value : 'FIXED';
                    items.push({
                        item_id: document.querySelector(`[name="item_id_${id}"]`)?.value ? parseInt(document.querySelector(`[name="item_id_${id}"]`).value) : undefined,
                        item_name: itemName,
                        category_name: document.querySelector(`[name="category_name_${id}"]`)?.value || '',
                        width: wVal ? parseFloat(wVal) : null,
                        height: hVal ? parseFloat(hVal) : null,
                        scale_factor: sfVal ? parseFloat(sfVal) : 1,
                        quantity: parseInt(document.querySelector(`[name="quantity_${id}"]`)?.value || 1),
                        unit: document.querySelector(`[name="item_unit_${id}"]`)?.value || 'EA',
                        unit_price: parseMoney(document.querySelector(`[name="unit_price_${id}"]`)?.value),
                        pricing_method: pmItem,
                        vat_included: document.querySelector(`[name="vat_${id}"]`)?.checked ? 1 : 0,
                        post_processing: JSON.stringify(pp),
                        finishing: (function() {
                            var finObj = {
                                top: document.querySelector('[name="fin_top_' + id + '"]')?.value || '',
                                bottom: document.querySelector('[name="fin_bottom_' + id + '"]')?.value || '',
                                left: document.querySelector('[name="fin_left_' + id + '"]')?.value || '',
                                right: document.querySelector('[name="fin_right_' + id + '"]')?.value || ''
                            };
                            // cm 오버라이드 (비어있으면 포함 안 함)
                            ['top','bottom','left','right'].forEach(function(dir) {
                                var cmEl = document.querySelector('[name="fin_cm_' + dir + '_' + id + '"]');
                                if (cmEl && cmEl.value !== '') finObj[dir + '_cm'] = parseFloat(cmEl.value) || 0;
                            });
                            return JSON.stringify(finObj);
                        })(),
                        content: document.querySelector(`[name="content_${id}"]`)?.value || '',
                        sort_order: idx + 1,
                        ai_group_index: (aiGroupIdxVal !== '' && aiGroupIdxVal !== undefined) ? parseInt(aiGroupIdxVal) : null,
                        ai_analysis_id: (aiAnalysisIdVal !== '' && aiAnalysisIdVal !== undefined) ? parseInt(aiAnalysisIdVal) : null,
                        sheet_layout_params: (function() {
                            var el = document.querySelector('[name="sheet_layout_params_' + id + '"]');
                            return el ? el.value : null;
                        })(),
                        client_group_id: document.querySelector(`[name="client_group_id_${id}"]`)?.value || null
                    });
                });
                if (!valid) return;

                // 자동 정렬: 카테고리 → 면적(큰 순) → 품목명
                items.sort(function(a, b) {
                    // 자식 행은 부모 바로 뒤에 유지 (sort_order 기준)
                    if (a.parent_client_id || b.parent_client_id) return 0;
                    var catA = (a.category_name || '').toLowerCase();
                    var catB = (b.category_name || '').toLowerCase();
                    if (catA !== catB) return catA < catB ? -1 : 1;
                    var areaA = (a.width || 0) * (a.height || 0);
                    var areaB = (b.width || 0) * (b.height || 0);
                    if (areaA !== areaB) return areaB - areaA; // 큰 순
                    return (a.item_name || '').localeCompare(b.item_name || '');
                });
                // sort_order 재부여
                items.forEach(function(item, idx) { item.sort_order = idx + 1; });

                // 선불/착불 필수 검증
                var spEl = document.getElementById('shippingPayment');
                if (spEl && !spEl.disabled && spEl.required && !spEl.value) {
                    showToast('선불/착불을 선택하세요.', 'warning');
                    return;
                }

                // AREA 품목인데 가로/세로가 0인 경우 경고
                var areaNoSize = items.filter(function(i) { return i.pricing_method === 'AREA' && (!i.width || !i.height); });
                if (areaNoSize.length > 0) {
                    if (!(await showConfirm(areaNoSize.length + '개 면적 단위 품목의 가로/세로가 입력되지 않았습니다. 금액이 0원으로 계산됩니다. 계속하시겠습니까?'))) {
                        return;
                    }
                }

                // 단가 0원 경고
                const zeroItems = items.filter(i => !i.parent_client_id && (i.unit_price === 0 || !i.unit_price));
                if (zeroItems.length > 0) {
                    if (!(await showConfirm(`${zeroItems.length}개 품목의 단가가 0원입니다. 계속하시겠습니까?`))) {
                        isSubmitting = false;
                        const submitBtn = document.getElementById('submitBtn');
                        submitBtn.disabled = false;
                        submitBtn.innerHTML = editMode
                            ? '<i class="fas fa-save mr-2"></i>수정 저장'
                            : '<i class="fas fa-save mr-2"></i>등록';
                        return;
                    }
                }

                isSubmitting = true;
                const btn = document.getElementById('submitBtn');
                btn.disabled = true;
                btn.innerHTML = editMode
                    ? '<i class="fas fa-spinner fa-spin mr-2"></i>저장 중...'
                    : '<i class="fas fa-spinner fa-spin mr-2"></i>등록 중...';

                const orderData = {
                    client_id: parseInt(clientId),
                    delivery_date: document.getElementById('deliveryDate').value,
                    priority: document.getElementById('priority').value,
                    reception_location: document.getElementById('receptionLocation').value,
                    delivery_info: document.getElementById('deliveryInfo').value,
                    delivery_method: document.getElementById('deliveryMethod').value,
                    delivery_time: (function() { var h = document.getElementById('deliveryTimeHour').value; var m = document.getElementById('deliveryTimeMinute').value; return h ? (h + ':' + (m || '00')) : null; })(),
                    discount_amount: parseMoney(document.getElementById('discountAmount').value),
                    notes: document.getElementById('notes').value,
                    contact_phone: document.getElementById('contactPhone').value.trim() || null,
                    contact_mobile: document.getElementById('contactMobile').value.trim() || null,
                    shipping_payment: document.getElementById('shippingPayment').value || null,
                    ai_file_path: resolvedFilePath || null,
                    ai_analysis_id: aiAnalysisId || null,
                    layout_id: null,
                    items
                };

                try {
                    let res;
                    if (editMode) {
                        res = await axios.put(`/api/orders/${editMode}`, orderData);
                    } else {
                        res = await axios.post('/api/orders', orderData);
                    }
                    if (res.data.success) {
                        const id = editMode ? editMode : res.data.data.id;
                        var msg = editMode ? '주문이 수정되었습니다.' : '주문이 등록되었습니다.';
                        if (res.data.message && res.data.message.includes('자동가공')) {
                            msg += '\n\n🔄 자동가공이 시작되었습니다. 주문 상세에서 결과를 확인하세요.';
                        }
                        if (res.data.cards_preserved) {
                            msg += '\n\n⚠️ ' + res.data.card_warning;
                        }
                        showToast(msg, 'warning');
                        // 견적서 폼이면 견적서 관리로, 아니면 주문 관리로
                        if (window.location.pathname.includes('quotation-form')) {
                            window.location.href = '/quotations';
                        } else {
                            window.location.href = '/orders?view=' + id;
                        }
                    } else {
                        showToast((editMode ? '수정' : '등록') + ' 실패: ' + (res.data.error || '알 수 없는 오류'), 'error');
                        isSubmitting = false; btn.disabled = false;
                        btn.innerHTML = editMode
                            ? '<i class="fas fa-save mr-2"></i>수정 저장'
                            : '<i class="fas fa-save mr-2"></i>등록';
                    }
                } catch (err) {
                    showToast((editMode ? '수정' : '등록') + ' 실패: ' + (err.response?.data?.error || err.message), 'error');
                    isSubmitting = false; btn.disabled = false;
                    btn.innerHTML = editMode
                        ? '<i class="fas fa-save mr-2"></i>수정 저장'
                        : '<i class="fas fa-save mr-2"></i>등록';
                }
            });

            // 수정 모드에서는 견적서 버튼 숨기기 (수정 모드 체크는 loadEditOrder 이후)
            window.submitAsQuotation = async function() {
                const clientId = document.getElementById('clientId').value;
                if (!clientId) { showToast('거래처를 선택하세요.', 'warning'); return; }

                const itemRows = document.querySelectorAll('#itemsContainer > [id^="item"]');
                if (!itemRows.length) { showToast('최소 1개 이상의 품목을 추가하세요.', 'warning'); return; }

                // 유효기한: 오늘로부터 30일 후
                var validUntilDate = new Date();
                validUntilDate.setDate(validUntilDate.getDate() + 30);
                var validUntil = validUntilDate.toISOString().slice(0, 10);

                if (!(await showConfirm('견적서로 저장하시겠습니까?\n유효기한: ' + validUntil + ' (오늘로부터 30일)'))) return;

                // 폼 데이터 수집은 submit 핸들러와 동일 로직을 간략화
                var qBtn = document.getElementById('quotationBtn');
                qBtn.disabled = true;
                qBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>저장 중...';

                try {
                    // 품목 수집 (부모 행만)
                    const items = [];
                    document.querySelectorAll('#itemsContainer > [id^="item"]').forEach(function(row, idx) {
                        const isChildInput = row.querySelector('[name^="is_child_"]');
                        if (isChildInput && isChildInput.value === '1') {
                            const childId = isChildInput.name.replace('is_child_', '');
                            const childParentRowId = row.getAttribute('data-parent-row');
                            const parentRowEl = childParentRowId ? document.getElementById('item-' + childParentRowId) : null;
                            const parentItemName = parentRowEl?.querySelector('[name^="item_search_"]')?.value?.trim() || '묶음 품목';
                            items.push({
                                item_name: parentItemName,
                                parent_client_id: row.querySelector('[name="parent_client_id_' + childId + '"]')?.value || null,
                                content: row.querySelector('[name="child_content_' + childId + '"]')?.value || null,
                                width: (() => { const v = row.querySelector('[name="child_width_' + childId + '"]')?.value; return v ? parseFloat(v) : null; })(),
                                height: (() => { const v = row.querySelector('[name="child_height_' + childId + '"]')?.value; return v ? parseFloat(v) : null; })(),
                                quantity: parseInt(row.querySelector('[name="child_qty_' + childId + '"]')?.value || '1'),
                                unit: 'EA', unit_price: 0, vat_included: 1, sort_order: idx + 1,
                            });
                            return;
                        }
                        const id = row.id.replace('item-', '');
                        const itemName = document.querySelector('[name="item_search_' + id + '"]')?.value?.trim();
                        if (!itemName) return;
                        const qty = parseInt(document.querySelector('[name="quantity_' + id + '"]')?.value) || 1;
                        const unitPrice = parseMoney(document.querySelector('[name="unit_price_' + id + '"]')?.value);
                        items.push({
                            item_id: parseInt(document.querySelector('[name="item_id_' + id + '"]')?.value) || null,
                            item_name: itemName,
                            content: document.querySelector('[name="content_' + id + '"]')?.value || null,
                            width: (() => { const v = document.querySelector('[name="width_' + id + '"]')?.value; return v ? parseFloat(v) : null; })(),
                            height: (() => { const v = document.querySelector('[name="height_' + id + '"]')?.value; return v ? parseFloat(v) : null; })(),
                            quantity: qty, unit: 'EA', unit_price: unitPrice,
                            vat_included: 1, sort_order: idx + 1, post_processing: [],
                        });
                    });

                    const orderData = {
                        client_id: parseInt(clientId),
                        delivery_date: document.getElementById('deliveryDate').value,
                        priority: document.getElementById('priority').value,
                        reception_location: document.getElementById('receptionLocation').value,
                        delivery_info: document.getElementById('deliveryInfo').value,
                        delivery_method: document.getElementById('deliveryMethod').value,
                        notes: document.getElementById('notes').value,
                        contact_phone: document.getElementById('contactPhone').value.trim() || null,
                        contact_mobile: document.getElementById('contactMobile').value.trim() || null,
                        status: 'QUOTATION',
                        valid_until: validUntil,
                        items
                    };

                    const res = await axios.post('/api/orders', orderData);

                    if (res.data.success) {
                        const id = res.data.data.id;
                        showToast('견적서가 저장되었습니다.', 'success');
                        window.location.href = '/quotations';
                    } else {
                        showToast('견적서 저장 실패: ' + (res.data.error || '알 수 없는 오류'), 'error');
                    }
                } catch (err) {
                    showToast('견적서 저장 실패: ' + (err.response?.data?.error || err.message), 'error');
                } finally {
                    qBtn.disabled = false;
                    qBtn.innerHTML = '<i class="fas fa-file-alt mr-2"></i>견적서로 저장';
                }
            };

            document.getElementById('addItemBtn').addEventListener('click', addItemRow);

            document.getElementById('addBundleBtn').addEventListener('click', function() {
                const parentId = addParentItemRow(1);
                addChildItemRow(parentId, { index: 1, width_mm: 0, height_mm: 0, thumbnail_base64: null });
                calculateTotal();
            });

            // ── 후가공 일괄 적용 ──────────────────────────────────────
            var bulkPPBtn = document.getElementById('bulkPPBtn');
            if (bulkPPBtn) {
                bulkPPBtn.addEventListener('click', async function() {
                    // 현재 품목 행에서 소분류 수집
                    var rows = document.querySelectorAll('#itemsContainer > [id^="item-"]');
                    var subcats = new Set();
                    rows.forEach(function(row) {
                        var id = row.id.replace('item-', '');
                        var sc = document.querySelector('[name="item_subcat_' + id + '"]');
                        if (sc && sc.value) subcats.add(sc.value);
                    });
                    if (subcats.size === 0) {
                        showToast('품목을 먼저 추가하세요.', 'warning');
                        return;
                    }
                    // 첫 번째 행의 후가공 상태 수집
                    var firstRow = rows[0];
                    var firstId = firstRow.id.replace('item-', '');
                    var firstPP = document.getElementById('pp_options_' + firstId);
                    if (!firstPP) { showToast('첫 번째 품목의 후가공을 먼저 설정하세요.', 'warning'); return; }

                    // finish 방향 드롭다운 값 수집
                    var finishVals = {};
                    firstPP.querySelectorAll('.pp-finish-dir').forEach(function(sel) {
                        finishVals[sel.dataset.dir || sel.className] = sel.value;
                    });
                    // punch 체크
                    var punchChecked = firstPP.querySelector('.pp-punch-check');
                    var punchState = punchChecked ? punchChecked.checked : false;
                    // annotation 체크
                    var annoChecked = firstPP.querySelector('.pp-annotation-check');
                    var annoState = annoChecked ? annoChecked.checked : false;
                    // offset 체크
                    var offsetChecked = firstPP.querySelector('.pp-offset-check');
                    var offsetState = offsetChecked ? offsetChecked.checked : false;

                    var targetCount = 0;
                    rows.forEach(function(row, idx) {
                        if (idx === 0) return; // 첫 행 스킵
                        var id = row.id.replace('item-', '');
                        var isChild = row.querySelector('[name^="is_child_"]');
                        if (isChild && isChild.value === '1') return; // 자식 행 스킵
                        var pp = document.getElementById('pp_options_' + id);
                        if (!pp) return;
                        // finish 복사
                        pp.querySelectorAll('.pp-finish-dir').forEach(function(sel) {
                            var key = sel.dataset.dir || sel.className;
                            if (finishVals[key] !== undefined) sel.value = finishVals[key];
                            sel.dispatchEvent(new Event('change', {bubbles: true}));
                        });
                        // punch 복사
                        var pc = pp.querySelector('.pp-punch-check');
                        if (pc && pc.checked !== punchState) { pc.checked = punchState; pc.dispatchEvent(new Event('change', {bubbles: true})); }
                        // annotation 복사
                        var ac = pp.querySelector('.pp-annotation-check');
                        if (ac && ac.checked !== annoState) { ac.checked = annoState; ac.dispatchEvent(new Event('change', {bubbles: true})); }
                        // offset 복사
                        var oc = pp.querySelector('.pp-offset-check');
                        if (oc && oc.checked !== offsetState) { oc.checked = offsetState; oc.dispatchEvent(new Event('change', {bubbles: true})); }
                        targetCount++;
                    });
                    if (targetCount > 0) {
                        showToast('첫 행의 후가공을 ' + targetCount + '개 행에 적용했습니다.', 'success');
                    } else {
                        showToast('적용할 대상 행이 없습니다.', 'warning');
                    }
                    calculateTotal();
                });
            }

            // ── AI 파일 분석 기능 ──────────────────────────────────────
            var aiAnalysisId = null;
            var analysisPollingTimer = null;
            var selectedAIFile = null;
            var localAIPath = null;
            var resolvedFilePath = null; // IllustratorAutomat이 업데이트한 파일 경로
            var AI_CHUNK_SIZE = 500 * 1024; // 500KB per chunk

            // ── 시트 배치 상태 변수 ──────────────────────────────────────
            var sheetLayoutGroups = null;
            var sheetLayoutResult = null;
            var sheetQuantities = {};
            var sheetGaps = [];         // [{placement_a, placement_b, side, gap_mm}]

            var COLORS = [
                '#3B82F6','#EF4444','#10B981','#F59E0B','#8B5CF6',
                '#EC4899','#06B6D4','#84CC16','#F97316','#6366F1'
            ];

            // ── 시트 배치 탭 전환 ─────────────────────────────────────────
            window.switchAiTab = function(tab) {
                var tabExtract = document.getElementById('tabExtract');
                var tabSheet   = document.getElementById('tabSheet');
                var sheetPanel = document.getElementById('sheetLayoutPanel');

                function setTabStyle(el, active) {
                    if (!el) return;
                    if (active) {
                        el.className = 'flex-1 px-4 py-3 text-sm font-semibold rounded-lg border-2 border-blue-600 bg-blue-600 text-white hover:bg-blue-700 transition-colors';
                    } else {
                        el.className = 'flex-1 px-4 py-3 text-sm font-semibold rounded-lg border-2 border-blue-300 bg-white text-blue-600 hover:bg-blue-50 transition-colors';
                    }
                }

                var extractPanel = document.getElementById('extractPanel');

                if (tab === 'sheet') {
                    setTabStyle(tabSheet, true);
                    setTabStyle(tabExtract, false);
                    if (sheetPanel) sheetPanel.classList.remove('hidden');
                    if (extractPanel) extractPanel.classList.add('hidden');
                    populateSheetElements(sheetLayoutGroups);
                } else {
                    setTabStyle(tabExtract, true);
                    setTabStyle(tabSheet, false);
                    if (sheetPanel) sheetPanel.classList.add('hidden');

                    // 품목 추출 패널 표시
                    var extractPanel = document.getElementById('extractPanel');
                    if (extractPanel) {
                        extractPanel.classList.remove('hidden');
                        populateExtractGroupsList();
                    }
                }
            };

            // ── 시트 배치 요소 테이블 렌더링 ──────────────────────────────
            function getSheetScaleFactor() {
                var el = document.getElementById('sheetScaleFactor');
                return el ? (parseInt(el.value, 10) || 1) : 1;
            }

            // ── 품목 추출 패널: 그룹 목록 표시 ──
            function populateExtractGroupsList() {
                var container = document.getElementById('extractGroupsList');
                if (!container || !sheetLayoutGroups) return;
                container.innerHTML = '';
                sheetLayoutGroups.forEach(function(g, i) {
                    var wCm = g.width_mm ? (g.width_mm / 10).toFixed(1) : '?';
                    var hCm = g.height_mm ? (g.height_mm / 10).toFixed(1) : '?';
                    var thumbHtml = '';
                    if (g.thumbnail_base64) {
                        var b64 = g.thumbnail_base64;
                        if (b64.indexOf('data:') !== 0) b64 = 'data:image/png;base64,' + b64;
                        thumbHtml = '<img src="' + b64 + '" class="w-12 h-12 object-contain rounded border flex-shrink-0">';
                    } else {
                        var color = COLORS[i % COLORS.length];
                        thumbHtml = '<div class="w-12 h-12 rounded border flex items-center justify-center text-white font-bold" style="background:' + color + '">' + String.fromCharCode(65 + i) + '</div>';
                    }
                    container.insertAdjacentHTML('beforeend',
                        '<div class="flex items-center gap-3 py-2 border-b border-gray-100">'
                        + thumbHtml
                        + '<div class="text-sm text-gray-700">그룹 ' + (i + 1) + ' — <b>' + wCm + ' × ' + hCm + ' cm</b> (파일 크기)</div>'
                        + '</div>');
                });
            }

            window.doExtractToLines = function() {
                if (!sheetLayoutGroups || sheetLayoutGroups.length === 0) return;
                removeEmptyItemRows();
                var groups = sheetLayoutGroups;
                var allSameSize = groups.length > 1 && groups.every(function(g) {
                    var refW = groups[0].width_mm, refH = groups[0].height_mm;
                    if (!refW || !refH || !g.width_mm || !g.height_mm) return false;
                    return Math.abs(g.width_mm - refW) / refW < 0.05
                        && Math.abs(g.height_mm - refH) / refH < 0.05;
                });
                if (allSameSize) {
                    populateAsGroupedItem(groups);
                } else {
                    populateRowsFromGroups(groups);
                }
                var aiResultTabs = document.getElementById('aiResultTabs');
                if (aiResultTabs) aiResultTabs.classList.add('hidden');
                showToast(groups.length + '개 품목 라인이 추가되었습니다.', 'success');
                var itemsContainer = document.getElementById('itemsContainer');
                if (itemsContainer) itemsContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
            };

            function populateSheetElements(groups) {
                const tbody = document.getElementById('sheetElementsBody');
                if (!tbody) return;
                tbody.innerHTML = '';
                if (!groups || groups.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="4" class="text-center text-gray-400 py-4">분석 결과가 없습니다.</td></tr>';
                    return;
                }
                var sf = getSheetScaleFactor();
                groups.forEach(function(g, i) {
                    const color = COLORS[i % COLORS.length];
                    // 파일 크기 × 스케일 = 실제 출력 크기
                    const wCm = g.width_mm  ? (g.width_mm  / 10 * sf).toFixed(1) : '?';
                    const hCm = g.height_mm ? (g.height_mm / 10 * sf).toFixed(1) : '?';
                    const qty = sheetQuantities[i] !== undefined ? sheetQuantities[i] : 1;
                    const area = (g.width_mm && g.height_mm)
                        ? ((g.width_mm / 10 * sf) * (g.height_mm / 10 * sf) * qty / 10000).toFixed(4)
                        : '-';

                    let thumbHtml;
                    if (g.thumbnail_base64) {
                        var b64 = g.thumbnail_base64;
                        if (b64.indexOf('data:') !== 0) b64 = 'data:image/png;base64,' + b64;
                        thumbHtml = '<img src="' + b64 + '" class="w-10 h-10 object-contain rounded border" />';
                    } else {
                        const letter = (g.name || String.fromCharCode(65 + i)).charAt(0).toUpperCase();
                        thumbHtml = '<div class="w-10 h-10 rounded flex items-center justify-center text-white font-bold text-sm" style="background:' + color + '">' + letter + '</div>';
                    }

                    const tr = document.createElement('tr');
                    tr.className = 'border-b border-gray-100';
                    tr.innerHTML =
                        '<td class="py-2 px-2">' + thumbHtml + '</td>' +
                        '<td class="py-2 px-2 text-sm text-gray-700">' + wCm + ' × ' + hCm + ' cm</td>' +
                        '<td class="py-2 px-2">' +
                            '<input type="number" min="1" value="' + qty + '" data-group-index="' + i + '" ' +
                            'onchange="onSheetQtyChange(this)" ' +
                            'class="w-16 border border-gray-300 rounded px-2 py-1 text-sm text-center" />' +
                        '</td>' +
                        '<td class="py-2 px-2 text-sm text-gray-600 sheet-area-cell" data-group-index="' + i + '">' + area + ' ㎡</td>';
                    tbody.appendChild(tr);
                });

                // 추천 롤 폭으로 기본값 설정 + 배치 가능 영역 표시
                var cutMarksEl = document.getElementById('sheetCutMarks');
                var hasCut = cutMarksEl ? cutMarksEl.checked : false;
                var rec = recommendRollWidth(groups, sheetQuantities, hasCut);
                if (rec) {
                    var rollSel = document.getElementById('sheetRollWidth');
                    if (rollSel) rollSel.value = String(rec.roll);
                    var recEl = document.getElementById('sheetRecommendation');
                    if (recEl) {
                        recEl.textContent = '추천: ' + rec.roll + 'cm (효율 ' + (rec.efficiency * 100).toFixed(1) + '%)';
                        recEl.className = 'text-xs text-blue-600 mt-1';
                    }
                }
                // 배치 가능 영역 업데이트 (onSheetSettingsChange 호출하지 않음 — 재귀 방지)
                var rollVal = parseInt((document.getElementById('sheetRollWidth') || {}).value, 10) || 127;
                var marginVal = hasCut ? 1.5 : 0;
                var availEl = document.getElementById('sheetAvailableWidth');
                if (availEl) availEl.textContent = (rollVal - marginVal * 2).toFixed(0) + ' cm';
                resetSheetPreview();
            }

            window.onSheetQtyChange = function(el) {
                const idx = parseInt(el.getAttribute('data-group-index'), 10);
                const val = Math.max(1, parseInt(el.value, 10) || 1);
                el.value = val;
                sheetQuantities[idx] = val;
                updateSheetAreaDisplay();
                resetSheetPreview();
            };

            function updateSheetAreaDisplay() {
                if (!sheetLayoutGroups) return;
                var sf = getSheetScaleFactor();
                document.querySelectorAll('.sheet-area-cell').forEach(function(cell) {
                    const idx = parseInt(cell.getAttribute('data-group-index'), 10);
                    const g = sheetLayoutGroups[idx];
                    if (!g || !g.width_mm || !g.height_mm) { cell.textContent = '-'; return; }
                    const qty = sheetQuantities[idx] || 1;
                    const area = (g.width_mm / 10 * sf) * (g.height_mm / 10 * sf) * qty / 10000;
                    cell.textContent = area.toFixed(4) + ' ㎡';
                });
            }

            // 스케일 변경 → 테이블 재렌더 + 설정 업데이트
            window.onSheetScaleChange = function() {
                if (sheetLayoutGroups) populateSheetElements(sheetLayoutGroups);
            };

            window.onSheetSettingsChange = function() {
                const widthSel  = document.getElementById('sheetRollWidth');
                const cutMarks  = document.getElementById('sheetCutMarks');
                const availEl   = document.getElementById('sheetAvailableWidth');
                const recEl     = document.getElementById('sheetRecommendation');
                if (!widthSel) return;

                const rollWidth = parseInt(widthSel.value, 10) || 0;
                const hasCut    = cutMarks ? cutMarks.checked : false;
                const margin    = hasCut ? 1.5 : 0; // cm (재단 시 양쪽 1.5cm)
                const available = rollWidth - margin * 2;

                if (availEl) availEl.textContent = available.toFixed(0) + ' cm';

                const rec = recommendRollWidth(sheetLayoutGroups, sheetQuantities, hasCut);
                if (recEl) {
                    if (rec) {
                        recEl.textContent = '추천 폭: ' + rec.roll + 'cm (효율 ' + (rec.efficiency * 100).toFixed(1) + '%, 길이 ' + rec.total_height.toFixed(1) + 'cm)';
                        recEl.className = 'text-xs text-blue-600 mt-1';
                    } else {
                        recEl.textContent = '';
                    }
                }

                resetSheetPreview();
            };

            // ── Bin-Packing 알고리즘 (도련 간격 지원) ───────────────────────
            // bleedGap: 인접 배치 사이 도련 간격 (cm, 기본 0)
            function shelfBinPack(items, availableWidth, bleedGap) {
                if (!items || items.length === 0) return { error: true, errorMsg: '배치할 항목이 없습니다.' };
                var gap = bleedGap || 0; // 도련 간격 (cm)

                // Sort by area descending
                const sorted = items.slice().sort(function(a, b) {
                    return (b.w * b.h) - (a.w * a.h);
                });

                const shelves = []; // { y, height, usedWidth, itemCount }
                const placements = [];

                for (let i = 0; i < sorted.length; i++) {
                    const item = sorted[i];
                    let placed = false;

                    // Try fitting in existing shelves (original then rotated)
                    for (let si = 0; si < shelves.length; si++) {
                        const shelf = shelves[si];
                        // 이미 아이템이 있으면 간격 추가
                        var xGap = shelf.itemCount > 0 ? gap : 0;
                        const orientations = [
                            { w: item.w, h: item.h, rotated: false },
                            { w: item.h, h: item.w, rotated: true }
                        ];
                        for (let oi = 0; oi < orientations.length; oi++) {
                            const o = orientations[oi];
                            if (shelf.usedWidth + xGap + o.w <= availableWidth) {
                                placements.push({
                                    group_index: item.groupIndex,
                                    x_cm: shelf.usedWidth + xGap,
                                    y_cm: shelf.y,
                                    width_cm: o.w,
                                    height_cm: o.h,
                                    rotated: o.rotated
                                });
                                shelf.usedWidth += xGap + o.w;
                                shelf.itemCount++;
                                if (o.h > shelf.height) shelf.height = o.h;
                                placed = true;
                                break;
                            }
                        }
                        if (placed) break;
                    }

                    if (!placed) {
                        // Try both orientations for new shelf
                        const orientations = [
                            { w: item.w, h: item.h, rotated: false },
                            { w: item.h, h: item.w, rotated: true }
                        ];
                        let chosen = null;
                        for (let oi = 0; oi < orientations.length; oi++) {
                            if (orientations[oi].w <= availableWidth) {
                                chosen = orientations[oi];
                                break;
                            }
                        }
                        if (!chosen) {
                            return { error: true, errorMsg: '항목이 롤 폭보다 큽니다: ' + item.w.toFixed(1) + 'cm × ' + item.h.toFixed(1) + 'cm' };
                        }
                        const prevShelf = shelves[shelves.length - 1];
                        // shelf 사이에도 도련 간격 추가
                        const yGap = prevShelf ? gap : 0;
                        const newY = prevShelf ? prevShelf.y + prevShelf.height + yGap : 0;
                        shelves.push({ y: newY, height: chosen.h, usedWidth: chosen.w, itemCount: 1 });
                        placements.push({
                            group_index: item.groupIndex,
                            x_cm: 0,
                            y_cm: newY,
                            width_cm: chosen.w,
                            height_cm: chosen.h,
                            rotated: chosen.rotated
                        });
                    }
                }

                const lastShelf = shelves[shelves.length - 1];
                const totalHeight = lastShelf ? lastShelf.y + lastShelf.height : 0;
                const totalArea   = items.reduce(function(s, it) { return s + it.w * it.h; }, 0);
                const usedArea    = availableWidth * totalHeight;
                const efficiency  = usedArea > 0 ? totalArea / usedArea : 0;
                const rotatedCount = placements.filter(function(p) { return p.rotated; }).length;

                return {
                    error: false,
                    placements: placements,
                    total_width_cm: availableWidth,
                    total_height_cm: totalHeight,
                    efficiency: efficiency,
                    rotated_count: rotatedCount,
                    total_items: items.length
                };
            }

            function recommendRollWidth(groups, quantities, cutMarks) {
                if (!groups || groups.length === 0) return null;
                const rollWidths = [105, 127, 137, 152];
                const margin = (cutMarks ? 1.5 : 0) * 2;
                const sf = getSheetScaleFactor();

                // Build expanded items (스케일 + 기본 bleed 적용 — 추천 시에는 전체 bleed)
                var bleedCm = 0.3; // 3mm → cm
                const items = [];
                groups.forEach(function(g, i) {
                    if (!g.width_mm || !g.height_mm) return;
                    const qty = quantities[i] || 1;
                    var origW = g.width_mm / 10 * sf;
                    var origH = g.height_mm / 10 * sf;
                    for (let q = 0; q < qty; q++) {
                        items.push({
                            groupIndex: i,
                            w: origW + bleedCm * 2,  // 양쪽 bleed 최대
                            h: origH + bleedCm * 2,
                            origW: origW, origH: origH
                        });
                    }
                });
                if (items.length === 0) return null;

                let best = null;
                rollWidths.forEach(function(roll) {
                    const available = roll - margin;
                    if (available <= 0) return;
                    const result = shelfBinPack(items, available, 0);
                    if (result.error) return;
                    if (!best || result.efficiency > best.efficiency ||
                        (Math.abs(result.efficiency - best.efficiency) < 0.001 && result.total_height_cm < best.total_height)) {
                        best = { roll: roll, efficiency: result.efficiency, total_height: result.total_height_cm };
                    }
                });
                return best;
            }

            window.calculateAndPreviewSheet = function() {
                sheetGaps = [];
                const widthSel = document.getElementById('sheetRollWidth');
                const cutMarks = document.getElementById('sheetCutMarks');
                if (!widthSel || !sheetLayoutGroups) { showToast('분석 결과가 없습니다.', 'warning'); return; }

                const rollWidth = parseInt(widthSel.value, 10) || 0;
                const hasCut    = cutMarks ? cutMarks.checked : false;
                const margin    = hasCut ? 1.5 : 0; // cm (재단 시 양쪽 1.5cm)
                const available = rollWidth - margin * 2;
                const sf = getSheetScaleFactor();

                // ── 도련 v5.1: 2-pass — flush 배치 → 인접 분석 → bleed 결정 → 최종 배치 ──
                var bleedMm = 3;
                var bleedCm = bleedMm / 10; // 3mm → cm (스케일은 실제 출력 기준)

                // Pass 1: flush 배치 (원본 크기로, bleed 없이)
                var baseItems = [];
                sheetLayoutGroups.forEach(function(g, i) {
                    if (!g.width_mm || !g.height_mm) return;
                    var qty = sheetQuantities[i] || 1;
                    for (var q = 0; q < qty; q++) {
                        baseItems.push({ groupIndex: i, w: g.width_mm / 10 * sf, h: g.height_mm / 10 * sf });
                    }
                });
                var flushResult = shelfBinPack(baseItems, available, 0);
                if (flushResult.error) { showToast(flushResult.errorMsg, 'error'); return; }

                // Pass 2: 인접 분석 → per-placement bleed 결정
                var boundaries = findAdjacentBoundaries(flushResult.placements);
                var placementBleeds = [];
                for (var pbi = 0; pbi < flushResult.placements.length; pbi++) {
                    var fp = flushResult.placements[pbi];
                    placementBleeds[pbi] = getPerEdgeBleedWithAdjacency(fp.group_index, pbi, flushResult.placements, boundaries, bleedCm);
                }

                // Pass 3: bleed 포함 크기로 최종 배치
                var finalItems = [];
                sheetLayoutGroups.forEach(function(g, i) {
                    if (!g.width_mm || !g.height_mm) return;
                    var qty = sheetQuantities[i] || 1;
                    for (var q = 0; q < qty; q++) {
                        // flush 결과에서 이 groupIndex의 placement 찾기
                        var fpIdx = -1;
                        for (var fi = 0; fi < flushResult.placements.length; fi++) {
                            if (flushResult.placements[fi].group_index === i) { fpIdx = fi; break; }
                        }
                        var bl = fpIdx >= 0 ? placementBleeds[fpIdx] : { top: bleedCm, bottom: bleedCm, left: bleedCm, right: bleedCm };
                        var origW = g.width_mm / 10 * sf;
                        var origH = g.height_mm / 10 * sf;
                        finalItems.push({
                            groupIndex: i,
                            w: origW + bl.left + bl.right,
                            h: origH + bl.top + bl.bottom,
                            origW: origW, origH: origH,
                            bleed: bl
                        });
                    }
                });

                var result = shelfBinPack(finalItems, available, 0);
                if (result.error) { showToast(result.errorMsg, 'error'); return; }

                // placement 좌표 보정
                result.placements.forEach(function(p) {
                    var item = finalItems.find(function(it) { return it.groupIndex === p.group_index; });
                    if (item) {
                        p.x_cm += margin + item.bleed.left;
                        p.y_cm += item.bleed.top;
                        p.width_cm = item.origW;
                        p.height_cm = item.origH;
                        p.bleed = item.bleed;
                    } else {
                        p.x_cm += margin;
                    }
                });

                sheetGaps = [];
                sheetLayoutResult = result;
                // 먼저 영역을 표시한 후 렌더링 (hidden 상태에서는 clientWidth=0)
                var previewArea = document.getElementById('sheetPreviewArea');
                if (previewArea) previewArea.classList.remove('hidden');
                // requestAnimationFrame으로 레이아웃 완료 후 렌더링
                requestAnimationFrame(function() {
                    if (typeof renderSheetCanvas === 'function') renderSheetCanvas();
                    if (typeof showSheetStats === 'function') showSheetStats();
                });
            };

            window.resetSheetPreview = function() {
                sheetLayoutResult = null;
                sheetGaps = [];
                const previewArea = document.getElementById('sheetPreviewArea');
                if (previewArea) previewArea.classList.add('hidden');
            };

            // ── 미리보기 모달 ──────────────────────────────────────────────
            window.openSheetPreviewModal = function() {
                var modal = document.getElementById('sheetPreviewModal');
                if (!modal) return;
                modal.classList.remove('hidden');
                // 모달이 표시된 후 캔버스 렌더링
                requestAnimationFrame(function() {
                    preloadSheetThumbnails(function() {
                        renderSheetCanvasModal();
                    });
                });
            };

            window.closeSheetPreviewModal = function() {
                var modal = document.getElementById('sheetPreviewModal');
                if (modal) modal.classList.add('hidden');
            };

            // 썸네일 이미지 사전 로딩 (캔버스 렌더링 전)
            function preloadSheetThumbnails(callback) {
                if (!sheetLayoutGroups) { callback(); return; }
                window._sheetThumbCache = {};
                var pending = 0;
                var done = function() { pending--; if (pending <= 0) callback(); };
                sheetLayoutGroups.forEach(function(g, i) {
                    if (g.thumbnail_base64) {
                        pending++;
                        var img = new Image();
                        img.onload = function() { window._sheetThumbCache[i] = img; done(); };
                        img.onerror = done;
                        img.src = g.thumbnail_base64;
                    }
                });
                if (pending === 0) callback();
            }

            function renderSheetCanvasModal() {
                if (!sheetLayoutResult) return;
                var canvas = document.getElementById('sheetCanvasModal');
                if (!canvas) return;
                var ctx = canvas.getContext('2d');
                var result = sheetLayoutResult;

                var widthSel = document.getElementById('sheetRollWidth');
                var rollWidth = widthSel ? (parseInt(widthSel.value, 10) || 127) : 127;
                var cutMarksChk = document.getElementById('sheetCutMarks');
                var hasCut = cutMarksChk ? cutMarksChk.checked : false;
                var margin = hasCut ? 1.5 : 0;

                // 모달 내부 캔버스: 부모 너비에 맞춤 (세로형)
                var dpr = window.devicePixelRatio || 1;
                var containerW = canvas.parentElement ? canvas.parentElement.clientWidth - 20 : 800;
                if (containerW < 300) containerW = 800;

                // 세로형: 70% 비율, 중앙 정렬
                var scale = containerW * 0.7 / rollWidth;
                var rollPx = rollWidth * scale; // 실제 롤 폭 픽셀
                var headerH = 40;
                var footerH = 50;
                var contentH = result.total_height_cm * scale;
                var cssW = containerW;
                var cssH = contentH + headerH + footerH;
                var offsetX = (cssW - rollPx) / 2; // 중앙 정렬 오프셋

                canvas.width = cssW * dpr;
                canvas.height = cssH * dpr;
                canvas.style.width = cssW + 'px';
                canvas.style.height = cssH + 'px';
                ctx.scale(dpr, dpr);

                // Background
                ctx.fillStyle = '#f8fafc';
                ctx.fillRect(0, 0, cssW, cssH);

                // 상단 롤 폭 라벨
                ctx.fillStyle = '#1e293b';
                ctx.font = 'bold 18px sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('롤 폭 ' + rollWidth + 'cm', cssW / 2, headerH / 2);

                var offsetY = headerH;

                // 롤 폭 테두리 (전체 영역)
                ctx.strokeStyle = '#94a3b8';
                ctx.lineWidth = 1.5;
                ctx.strokeRect(offsetX, offsetY, rollPx, contentH);

                // 여백 영역 (색상만, 글씨 제거)
                if (margin > 0) {
                    var mPx = margin * scale;
                    ctx.fillStyle = '#fee2e220';
                    ctx.fillRect(offsetX, offsetY, mPx, contentH);
                    ctx.fillRect(offsetX + rollPx - mPx, offsetY, mPx, contentH);
                }

                // 배치 요소 (썸네일 이미지 + 도련 표시 포함)
                result.placements.forEach(function(p) {
                    var gi = p.group_index;
                    var color = COLORS[gi % COLORS.length];
                    var x = p.x_cm * scale + offsetX;
                    var y = p.y_cm * scale + offsetY;
                    // 회전된 placement: 미리보기에서도 w↔h 교환
                    var w = (p.rotated ? p.height_cm : p.width_cm) * scale;
                    var h = (p.rotated ? p.width_cm : p.height_cm) * scale;

                    // 도련 표시: 적용되는 변에 빨간 점선
                    var bl = p.bleed || {};
                    var hasBleed = bl.top > 0 || bl.bottom > 0 || bl.left > 0 || bl.right > 0;
                    if (hasBleed) {
                        ctx.save();
                        ctx.strokeStyle = '#ef4444';
                        ctx.lineWidth = 2;
                        ctx.setLineDash([5, 3]);
                        if (bl.top > 0)    { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w, y); ctx.stroke(); }
                        if (bl.bottom > 0) { ctx.beginPath(); ctx.moveTo(x, y + h); ctx.lineTo(x + w, y + h); ctx.stroke(); }
                        if (bl.left > 0)   { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + h); ctx.stroke(); }
                        if (bl.right > 0)  { ctx.beginPath(); ctx.moveTo(x + w, y); ctx.lineTo(x + w, y + h); ctx.stroke(); }
                        ctx.setLineDash([]);
                        ctx.restore();
                    }

                    // 썸네일 이미지 그리기 (회전 반영)
                    var group = sheetLayoutGroups ? sheetLayoutGroups[gi] : null;
                    var thumbSrc = group ? group.thumbnail_base64 : null;
                    if (thumbSrc && window._sheetThumbCache && window._sheetThumbCache[gi]) {
                        var img = window._sheetThumbCache[gi];
                        if (p.rotated) {
                            ctx.save();
                            ctx.translate(x + w / 2, y + h / 2);
                            ctx.rotate(-Math.PI / 2);
                            ctx.drawImage(img, -h / 2, -w / 2, h, w);
                            ctx.restore();
                        } else {
                            ctx.drawImage(img, x, y, w, h);
                        }
                    } else {
                        ctx.fillStyle = color + '25';
                        ctx.fillRect(x, y, w, h);
                    }

                    // CutLine 테두리 (실선)
                    ctx.strokeStyle = color;
                    ctx.lineWidth = 1.5;
                    ctx.strokeRect(x, y, w, h);

                    // 라벨
                    var letter = String.fromCharCode(65 + gi) + (p.rotated ? ' ↻' : '');
                    var labelSize = Math.max(12, Math.min(24, Math.floor(Math.min(w, h) * 0.2)));
                    ctx.fillStyle = 'rgba(255,255,255,0.75)';
                    ctx.fillRect(x + 2, y + 2, labelSize * 1.2, labelSize * 1.4);
                    ctx.fillStyle = color;
                    ctx.font = 'bold ' + labelSize + 'px sans-serif';
                    ctx.textAlign = 'left';
                    ctx.textBaseline = 'top';
                    ctx.fillText(letter, x + 4, y + 4);
                });

                // 하단 요약
                ctx.fillStyle = '#1e293b';
                ctx.font = 'bold 16px sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'alphabetic';
                ctx.fillText(
                    '총 길이: ' + result.total_height_cm.toFixed(1) + 'cm | '
                    + result.total_items + '개 요소 | '
                    + '효율: ' + (result.efficiency * 100).toFixed(1) + '%',
                    cssW / 2, cssH - 16
                );

                // 간격 경계 표시 (빨간 점선)
                sheetGaps.forEach(function(gap) {
                    var pa2 = result.placements[gap.placement_a];
                    var pb2 = result.placements[gap.placement_b];
                    if (!pa2 || !pb2) return;
                    ctx.save();
                    ctx.strokeStyle = '#ef4444';
                    ctx.lineWidth = 3;
                    ctx.setLineDash([6, 4]);
                    if (gap.side === 'right') {
                        var gx = (pa2.x_cm + pa2.width_cm) * scale + offsetX;
                        var gy1 = Math.max(pa2.y_cm, pb2.y_cm) * scale + offsetY;
                        var gy2 = Math.min(pa2.y_cm + pa2.height_cm, pb2.y_cm + pb2.height_cm) * scale + offsetY;
                        ctx.beginPath(); ctx.moveTo(gx, gy1); ctx.lineTo(gx, gy2); ctx.stroke();
                        ctx.setLineDash([]);
                        ctx.fillStyle = '#ef4444'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center';
                        ctx.fillText('3mm', gx, gy1 - 4);
                    } else if (gap.side === 'bottom') {
                        var gy3 = (pa2.y_cm + pa2.height_cm) * scale + offsetY;
                        var gx1 = Math.max(pa2.x_cm, pb2.x_cm) * scale + offsetX;
                        var gx2 = Math.min(pa2.x_cm + pa2.width_cm, pb2.x_cm + pb2.width_cm) * scale + offsetX;
                        ctx.beginPath(); ctx.moveTo(gx1, gy3); ctx.lineTo(gx2, gy3); ctx.stroke();
                        ctx.setLineDash([]);
                        ctx.fillStyle = '#ef4444'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center';
                        ctx.fillText('3mm', (gx1 + gx2) / 2, gy3 - 4);
                    }
                    ctx.restore();
                });

            }

            // calculateAndPreviewSheet에서 호출되는 이전 함수 (이제 모달 자동 오픈)
            function renderSheetCanvas() {
                openSheetPreviewModal();
            }

            function showSheetStats() {
                if (!sheetLayoutResult) return;
                const statsEl = document.getElementById('sheetStats');
                if (!statsEl) return;
                const result = sheetLayoutResult;

                var html = '';

                // 총 요소
                html += '<div class="flex-1 p-2 bg-white rounded border text-center">';
                html += '<div class="text-xs text-gray-500">총 요소</div>';
                html += '<div class="font-bold">' + result.total_items + '개</div>';
                html += '</div>';

                // 배치 크기
                html += '<div class="flex-1 p-2 bg-white rounded border text-center">';
                html += '<div class="text-xs text-gray-500">배치 크기</div>';
                html += '<div class="font-bold text-blue-600">' + result.total_width_cm + ' × ' + result.total_height_cm.toFixed(1) + ' cm</div>';
                html += '</div>';

                // 효율
                html += '<div class="flex-1 p-2 bg-white rounded border text-center">';
                html += '<div class="text-xs text-gray-500">효율</div>';
                html += '<div class="font-bold text-green-600">' + (result.efficiency * 100).toFixed(1) + '%</div>';
                html += '</div>';

                // 회전 (0이면 숨김)
                if (result.rotated_count > 0) {
                    html += '<div class="flex-1 p-2 bg-white rounded border text-center">';
                    html += '<div class="text-xs text-gray-500">회전</div>';
                    html += '<div class="font-bold text-purple-600">' + result.rotated_count + '개</div>';
                    html += '</div>';
                }

                statsEl.innerHTML = html;
            }

            function findAdjacentBoundaries(placements) {
                var boundaries = [];
                for (var i = 0; i < placements.length; i++) {
                    for (var j = i + 1; j < placements.length; j++) {
                        var a = placements[i], b = placements[j];
                        if (Math.abs((a.x_cm + a.width_cm) - b.x_cm) < 0.2) {
                            var overlapTop = Math.min(a.y_cm + a.height_cm, b.y_cm + b.height_cm);
                            var overlapBot = Math.max(a.y_cm, b.y_cm);
                            if (overlapTop > overlapBot) boundaries.push({a: i, b: j, side: 'right'});
                        }
                        if (Math.abs((a.y_cm + a.height_cm) - b.y_cm) < 0.2) {
                            var overlapR = Math.min(a.x_cm + a.width_cm, b.x_cm + b.width_cm);
                            var overlapL = Math.max(a.x_cm, b.x_cm);
                            if (overlapR > overlapL) boundaries.push({a: i, b: j, side: 'bottom'});
                        }
                    }
                }
                return boundaries;
            }

            // ── 도련 v5.1: per-edge bleed 판단 (인접 디자인 색상 고려) ──
            var WHITE_THRESHOLD = 30;
            function isWhiteColor(rgb) {
                if (!rgb || rgb.length < 3) return true;
                var dr = 255-rgb[0], dg = 255-rgb[1], db = 255-rgb[2];
                return Math.sqrt(dr*dr + dg*dg + db*db) < WHITE_THRESHOLD;
            }

            function colorDistance(a, b) {
                if (!a || !b) return 999;
                var dr = a[0]-b[0], dg = a[1]-b[1], db = a[2]-b[2];
                return Math.sqrt(dr*dr + dg*dg + db*db);
            }

            // 디자인별 4방향 bleed 결정 (인접 디자인 색상도 고려)
            // 규칙:
            //   - 양쪽 모두 백색 → bleed 0
            //   - 어느 한쪽이라도 유색 → bleed 적용
            //   - 양쪽 유색이지만 색상 유사 (dist < 60) → bleed 0
            function getPerEdgeBleedWithAdjacency(groupIndex, placementIndex, placements, boundaries, bleedCm) {
                var result = { top: bleedCm, bottom: bleedCm, left: bleedCm, right: bleedCm };
                if (!sheetLayoutGroups || !sheetLayoutGroups[groupIndex]) return result;
                var myEc = sheetLayoutGroups[groupIndex].edge_colors;

                // 각 방향: 외곽 변인지, 인접 변인지 판단
                var sides = ['top', 'bottom', 'left', 'right'];
                var opposites = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' };
                var bdSideMap = { right: 'right', bottom: 'bottom' }; // boundaries에서 사용하는 side

                for (var si = 0; si < sides.length; si++) {
                    var side = sides[si];
                    var myColor = myEc ? myEc[side] : null;
                    var adjColor = null;
                    var hasAdj = false;

                    // 인접 디자인 찾기
                    for (var bi = 0; bi < boundaries.length; bi++) {
                        var bd = boundaries[bi];
                        var adjGroupIdx = -1;
                        if (bd.side === 'right') {
                            if (bd.a === placementIndex && side === 'right') {
                                adjGroupIdx = placements[bd.b].group_index; adjColor = getEdgeColor(adjGroupIdx, 'left'); hasAdj = true;
                            } else if (bd.b === placementIndex && side === 'left') {
                                adjGroupIdx = placements[bd.a].group_index; adjColor = getEdgeColor(adjGroupIdx, 'right'); hasAdj = true;
                            }
                        } else if (bd.side === 'bottom') {
                            if (bd.a === placementIndex && side === 'bottom') {
                                adjGroupIdx = placements[bd.b].group_index; adjColor = getEdgeColor(adjGroupIdx, 'top'); hasAdj = true;
                            } else if (bd.b === placementIndex && side === 'top') {
                                adjGroupIdx = placements[bd.a].group_index; adjColor = getEdgeColor(adjGroupIdx, 'bottom'); hasAdj = true;
                            }
                        }
                        if (hasAdj) break;
                    }

                    if (hasAdj) {
                        // 인접 변: 양쪽 모두 백색이면 bleed 불필요, 색상 유사해도 불필요
                        var myWhite = isWhiteColor(myColor);
                        var adjWhite = isWhiteColor(adjColor);
                        if (myWhite && adjWhite) {
                            result[side] = 0;
                        } else if (!myWhite && !adjWhite && colorDistance(myColor, adjColor) < 60) {
                            result[side] = 0; // 양쪽 유색이지만 유사
                        }
                        // 어느 한쪽이라도 유색 + 색상 다름 → bleed 유지
                    } else {
                        // 외곽 변: 내 엣지가 백색이면 bleed 불필요
                        if (isWhiteColor(myColor)) result[side] = 0;
                    }
                }

                return result;
            }

            function getEdgeColor(groupIndex, side) {
                if (!sheetLayoutGroups || !sheetLayoutGroups[groupIndex]) return null;
                var ec = sheetLayoutGroups[groupIndex].edge_colors;
                return ec ? ec[side] : null;
            }

            // ── Task 5: 확정 → 부모-자식 주문 라인 생성 ──────────────────────
            window.confirmSheetLayout = function() {
                if (!sheetLayoutResult || !sheetLayoutGroups) {
                    showToast('먼저 배치 미리보기를 실행하세요.', 'warning');
                    return;
                }

                removeEmptyItemRows();

                const childCount = sheetLayoutGroups.length;
                const parentId   = addParentItemRow(childCount);

                // 부모 행 크기 설정
                var wInput = document.querySelector('[name="width_' + parentId + '"]');
                var hInput = document.querySelector('[name="height_' + parentId + '"]');
                if (wInput) wInput.value = sheetLayoutResult.total_width_cm;
                if (hInput) hInput.value = sheetLayoutResult.total_height_cm.toFixed(1);

                // sheet_layout_params hidden input 생성
                var widthSel = document.getElementById('sheetRollWidth');
                var cutMarksEl = document.getElementById('sheetCutMarks');
                var rollWidthCm = widthSel ? (parseInt(widthSel.value, 10) || 0) : 0;
                var hasCut = cutMarksEl ? cutMarksEl.checked : false;
                var marginCm = hasCut ? 1.5 : 0;

                // edge_colors 수집 (sheetLayoutGroups에서)
                var ecList = [];
                if (sheetLayoutGroups) {
                    sheetLayoutGroups.forEach(function(g, idx) {
                        ecList.push(g.edge_colors || { top: [255,255,255], bottom: [255,255,255], left: [255,255,255], right: [255,255,255] });
                    });
                }

                var layoutParams = JSON.stringify({
                    mode: 'sheet_layout',
                    roll_width_cm: rollWidthCm,
                    total_height_cm: sheetLayoutResult.total_height_cm,
                    margin_cm: marginCm,
                    cut_marks: hasCut,
                    scale_factor: getSheetScaleFactor(),
                    bleed_mm: 3,
                    gaps: [],  // v5: per-edge bleed가 placements.bleed에 포함
                    edge_colors: ecList,
                    placements: sheetLayoutResult.placements
                });
                var hiddenInput = document.createElement('input');
                hiddenInput.type  = 'hidden';
                hiddenInput.name  = 'sheet_layout_params_' + parentId;
                hiddenInput.value = layoutParams;
                var parentRow = document.getElementById('item-' + parentId);
                if (parentRow) parentRow.appendChild(hiddenInput);

                // 부모 수량 = 1
                var qtyInput = document.querySelector('[name="quantity_' + parentId + '"]');
                if (qtyInput) qtyInput.value = 1;

                // 부모 행의 scale_factor를 시트 스케일로 설정 (자식 행이 이 값을 참조)
                var sfEl = document.querySelector('[name="scale_factor_' + parentId + '"]');
                if (sfEl) sfEl.value = getSheetScaleFactor();

                // 자식 행 생성
                sheetLayoutGroups.forEach(function(group, i) {
                    addChildItemRow(parentId, group);
                    // 마지막으로 추가된 자식 행의 수량 설정
                    var childRows = document.querySelectorAll('[data-parent-id="' + parentId + '"]');
                    var lastChild = childRows[childRows.length - 1];
                    if (lastChild) {
                        var childId = lastChild.id ? lastChild.id.replace('item-', '') : null;
                        if (childId) {
                            var childQtyEl = document.querySelector('[name="quantity_' + childId + '"]') ||
                                             document.querySelector('[name="child_qty_' + childId + '"]');
                            if (childQtyEl) childQtyEl.value = sheetQuantities[i] || 1;
                        }
                    }
                });

                calcItem(parentId);
                calculateTotal();

                // UI 업데이트
                var aiResultTabs = document.getElementById('aiResultTabs');
                if (aiResultTabs) aiResultTabs.classList.add('hidden');

                var statusEl = document.getElementById('aiAnalysisStatus');
                if (statusEl) {
                    statusEl.textContent = '시트 배치 확정 완료 — ' + childCount + '개 자식 행 생성';
                    statusEl.className = 'mt-2 text-sm text-green-600';
                    statusEl.classList.remove('hidden');
                }

                showToast('시트 배치가 주문 라인에 추가되었습니다.', 'success');
            };

            window.onAIFileSelected = function(input) {
                selectedAIFile = input.files[0];
                if (selectedAIFile) {
                    localAIPath = null;
                    document.getElementById('aiLocalPath').value = '';
                    var sizeMB = (selectedAIFile.size / 1024 / 1024).toFixed(1);
                    document.getElementById('aiFileLabel').textContent = selectedAIFile.name + ' (' + sizeMB + 'MB)';
                    document.getElementById('aiAnalysisBtn').disabled = false;
                }
            };

            // 드래그 앤 드롭 핸들러
            window.handleAiFileDrop = function(e) {
                var files = e.dataTransfer.files;
                if (!files || files.length === 0) return;
                var file = files[0];
                var name = file.name.toLowerCase();
                if (!name.endsWith('.ai') && !name.endsWith('.eps')) {
                    showToast('AI 또는 EPS 파일만 지원합니다.', 'warning');
                    return;
                }
                selectedAIFile = file;
                localAIPath = null;
                document.getElementById('aiLocalPath').value = '';
                var sizeMB = (file.size / 1024 / 1024).toFixed(1);
                document.getElementById('aiFileLabel').textContent = file.name + ' (' + sizeMB + 'MB)';
                document.getElementById('aiAnalysisBtn').disabled = false;
                showToast(file.name + ' 파일이 선택되었습니다.', 'success');
            };

            function onAILocalPathChanged(input) {
                localAIPath = input.value.trim() || null;
                if (localAIPath) {
                    selectedAIFile = null;
                    document.getElementById('aiFileLabel').textContent = 'AI 파일 선택 (.ai, .eps)';
                    document.getElementById('aiFileInput').value = '';
                }
                document.getElementById('aiAnalysisBtn').disabled = !(localAIPath || selectedAIFile);
            }

            async function requestAIAnalysis() {
                if (!selectedAIFile && !localAIPath) { showToast('파일을 선택하거나 경로를 입력해주세요.', 'warning'); return; }

                const statusDiv = document.getElementById('aiAnalysisStatus');
                statusDiv.classList.remove('hidden');
                document.getElementById('aiAnalysisBtn').disabled = true;
                resolvedFilePath = null;

                // 503 재시도 헬퍼: 503 응답 시 2초 후 1회 재시도
                async function postWithRetry(url, data, config) {
                    try {
                        return await axios.post(url, data, config);
                    } catch (err503) {
                        if (err503.response && err503.response.status === 503) {
                            await new Promise(function(r) { setTimeout(r, 2000); });
                            return await axios.post(url, data, config);
                        }
                        throw err503;
                    }
                }

                try {
                    if (localAIPath) {
                        // 경로 입력 모드 — 청크 없이 바로 pending
                        statusDiv.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i> 분석 요청 중...';
                        const res = await postWithRetry('/api/ai-analysis',
                            { file_path: localAIPath }
                        );
                        if (!res.data.success) throw new Error(res.data.error || '요청 생성 실패');
                        aiAnalysisId = res.data.data.id;
                        await axios.patch('/api/ai-analysis/' + aiAnalysisId,
                            { status: 'pending' }
                        );
                    } else {
                        // 파일 피커 모드 — R2 직접 업로드
                        statusDiv.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i> 파일 업로드 중...';
                        var formData = new FormData();
                        formData.append('file', selectedAIFile);
                        var res = await axios.post('/api/ai-analysis/upload', formData, {
                            headers: { 'Content-Type': 'multipart/form-data' },
                            onUploadProgress: function(e) {
                                if (e.total) {
                                    var pct = Math.round(e.loaded / e.total * 100);
                                    statusDiv.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i> 업로드 중... ' + pct + '%';
                                }
                            }
                        });
                        if (!res.data.success) throw new Error(res.data.error || '업로드 실패');
                        aiAnalysisId = res.data.data.id;
                    }
                    statusDiv.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i> IllustratorAutomat에서 분석 중... (최대 120초 대기)';
                    startAnalysisPolling();

                } catch(err) {
                    statusDiv.innerHTML = '<i class="fas fa-times-circle text-red-500 mr-1"></i> 오류: ' + (err.response?.data?.error || err.message);
                    document.getElementById('aiAnalysisBtn').disabled = false;
                }
            }

            function startAnalysisPolling() {
                if (analysisPollingTimer) clearInterval(analysisPollingTimer);
                const statusDiv = document.getElementById('aiAnalysisStatus');

                const timeoutId = setTimeout(() => {
                    clearInterval(analysisPollingTimer);
                    analysisPollingTimer = null;
                    statusDiv.innerHTML = '<i class="fas fa-clock text-amber-500 mr-1"></i> 시간 초과. IllustratorAutomat 실행 여부를 확인하세요.';
                }, 120000);

                analysisPollingTimer = setInterval(async () => {
                    try {
                        const res = await axios.get('/api/ai-analysis/' + aiAnalysisId);
                        const d = res.data.data;
                        if (d.status === 'done') {
                            clearInterval(analysisPollingTimer);
                            clearTimeout(timeoutId);
                            analysisPollingTimer = null;
                            resolvedFilePath = d.file_path || null; // temp 경로 저장 (주문 제출 시 사용)
                            const groups = JSON.parse(d.groups_json || '[]');
                            window._lastAnalysisGroups = groups;

                            sheetLayoutGroups = groups;
                            sheetQuantities = {};
                            groups.forEach(function(_, i) { sheetQuantities[i] = 1; });

                            // 탭 표시 + 품목 추출 탭 기본 선택
                            var aiResultTabs = document.getElementById('aiResultTabs');
                            if (aiResultTabs) aiResultTabs.classList.remove('hidden');
                            switchAiTab('extract');

                            statusDiv.innerHTML = '<i class="fas fa-check-circle text-green-600 mr-1"></i> 분석 완료: '
                                + groups.length + '개 그룹 추출됨';
                        } else if (d.status === 'error') {
                            clearInterval(analysisPollingTimer);
                            clearTimeout(timeoutId);
                            analysisPollingTimer = null;
                            statusDiv.innerHTML = '<i class="fas fa-exclamation-circle text-red-500 mr-1"></i> 오류: ' + (d.error_message || '알 수 없는 오류');
                        }
                    } catch(err) {
                        console.warn('Polling error:', err.message);
                    }
                }, 2000);
            }

            function removeEmptyItemRows() {
                var rows = document.querySelectorAll('#itemsContainer > [id^="item-"]');
                rows.forEach(function(row) {
                    var id = row.id.replace('item-', '');
                    var name = (document.querySelector('[name="item_search_' + id + '"]') || {}).value || '';
                    var w = (document.querySelector('[name="width_' + id + '"]') || {}).value || '';
                    var h = (document.querySelector('[name="height_' + id + '"]') || {}).value || '';
                    var content = (document.querySelector('[name="content_' + id + '"]') || {}).value || '';
                    var itemId = (document.querySelector('[name="item_id_' + id + '"]') || {}).value || '';
                    var qty = (document.querySelector('[name="quantity_' + id + '"]') || {}).value || '1';
                    if (!name && !w && !h && !content && !itemId && qty === '1') {
                        row.remove();
                    }
                });
            }

            function populateRowsFromGroups(groups) {
                if (!groups || groups.length === 0) return;
                removeEmptyItemRows();

                // 개별 모드: 그룹당 행 1개 추가
                groups.forEach(function(group) {
                    addItemRow();
                    const id = itemCount;

                    const giEl = document.querySelector('[name="ai_group_index_' + id + '"]');
                    if (giEl) giEl.value = group.index;

                    // 현재 분석 요청 ID를 품목 행에 기록 (여러 파일 업로드 시 파일별 추적)
                    const aiIdEl = document.querySelector('[name="ai_analysis_id_' + id + '"]');
                    if (aiIdEl && aiAnalysisId) aiIdEl.value = aiAnalysisId;

                    const wEl = document.querySelector('[name="width_' + id + '"]');
                    const hEl = document.querySelector('[name="height_' + id + '"]');
                    const sfEl = document.querySelector('[name="scale_factor_' + id + '"]');
                    const sf = parseFloat(sfEl?.value) || 1;
                    if (wEl && group.width_mm) {
                        wEl.dataset.origMm = group.width_mm;
                        wEl.value = (group.width_mm / 10 * sf).toFixed(1);
                    }
                    if (hEl && group.height_mm) {
                        hEl.dataset.origMm = group.height_mm;
                        hEl.value = (group.height_mm / 10 * sf).toFixed(1);
                    }

                    // 품목명은 자동 입력하지 않음 (사용자가 직접 입력)

                    if (group.thumbnail_base64) {
                        const thumbDiv = document.getElementById('thumb_' + id);
                        const thumbImg = document.getElementById('thumb_img_' + id);
                        if (thumbDiv && thumbImg) {
                            thumbImg.src = 'data:image/png;base64,' + group.thumbnail_base64;
                            thumbDiv.classList.remove('hidden');
                        }
                    }

                    // AI 분석 행이므로 파일 스케일 표시
                    var scaleDiv = document.getElementById('scale_div_' + id);
                    if (scaleDiv) scaleDiv.classList.remove('hidden');

                    calcItem(id);
                });

                calculateTotal();

                // AI 파일 입력 초기화 (행이 추가된 후 선택 필드 리셋)
                const aiFileInputEl = document.getElementById('aiFileInput');
                if (aiFileInputEl) aiFileInputEl.value = '';
                const aiFileLabelEl = document.getElementById('aiFileLabel');
                if (aiFileLabelEl) aiFileLabelEl.textContent = 'AI 파일 선택 (.ai, .eps)';
                const aiLocalPathEl = document.getElementById('aiLocalPath');
                if (aiLocalPathEl) aiLocalPathEl.value = '';

                // 분석 완료 메시지 업데이트
                const statusDiv2 = document.getElementById('aiAnalysisStatus');
                if (statusDiv2) {
                    statusDiv2.innerHTML = '<i class="fas fa-check-circle text-green-600 mr-1"></i> 분석 완료: '
                        + groups.length + '개 그룹 → ' + groups.length + '개 행 추가됨';
                }
            }

            // ── 묶음 편집: 하나의 품목으로 묶기 ──────────────────────────────
            window.populateAsGroupedItem = function(groups) {
                if (!groups || groups.length === 0) return;
                removeEmptyItemRows();
                const parentId = addParentItemRow(groups.length);

                // 부모 행에 규격 설정 (동일 규격이므로 첫 그룹 기준)
                const ref = groups[0];
                const sfEl = document.querySelector('[name="scale_factor_' + parentId + '"]');
                const sf = parseFloat(sfEl?.value) || 1;
                const wEl = document.querySelector('[name="width_' + parentId + '"]');
                const hEl = document.querySelector('[name="height_' + parentId + '"]');
                if (wEl && ref.width_mm) {
                    wEl.dataset.origMm = ref.width_mm;
                    wEl.value = (ref.width_mm / 10 * sf).toFixed(1);
                }
                if (hEl && ref.height_mm) {
                    hEl.dataset.origMm = ref.height_mm;
                    hEl.value = (ref.height_mm / 10 * sf).toFixed(1);
                }

                groups.forEach(function(group) {
                    addChildItemRow(parentId, group);
                });
                calcItem(parentId);
                calculateTotal();
                const sd = document.getElementById('aiAnalysisStatus');
                if (sd) {
                    sd.innerHTML = '<i class="fas fa-check-circle text-green-600 mr-1"></i>'
                        + ' 묶음 추가 완료: 부모 행 1개 + 자식 ' + groups.length + '개';
                }
            };

            function addParentItemRow(childCount) {
                itemCount++;
                const id = itemCount;
                const pgId = 'pg' + id;
                const html = buildParentItemHtml(id, childCount, pgId);
                document.getElementById('itemsContainer').insertAdjacentHTML('beforeend', html);
                setupAutocomplete(id);
                var parentEl = document.getElementById('item-' + id);
                if (parentEl && window.bindMoneyInputs) window.bindMoneyInputs(parentEl);
                renumberDisplay();
                return id;
            }

            function buildParentItemHtml(id, childCount, pgId) {
                return `<div class="border-2 border-green-300 rounded-lg p-4 mb-1 bg-green-50" id="item-${id}">
                    <input type="hidden" name="ai_group_index_${id}" value="">
                    <input type="hidden" name="ai_analysis_id_${id}" value="">
                    <input type="hidden" name="client_group_id_${id}" value="${pgId}">
                    <input type="hidden" name="is_parent_${id}" value="1">
                    <input type="hidden" name="pricing_method_${id}" value="FIXED">
                    <div class="flex justify-between items-center mb-3">
                        <div class="flex items-center gap-2">
                            <span class="font-bold text-green-700">묶음 품목 #${id}</span>
                            <span id="parent_badge_${id}" class="text-xs bg-green-200 text-green-700 px-2 py-0.5 rounded font-medium">×${childCount}장</span>
                            <span class="text-xs text-green-600">(청구·정산 기준 행 — 각 장은 아래 자식 행)</span>
                        </div>
                        <button type="button" onclick="removeItem(${id})" class="text-red-400 hover:text-red-600 text-sm px-2 py-1 rounded hover:bg-red-50">
                            <i class="fas fa-trash mr-1"></i>삭제
                        </button>
                    </div>
                    <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-3">
                        <div class="col-span-2 relative">
                            <label class="block text-xs font-medium text-gray-600 mb-1">품목 <span class="text-red-500">*</span></label>
                            <input type="hidden" name="item_id_${id}">
                            <input type="hidden" name="item_unit_${id}" value="EA">
                            <input type="hidden" name="category_name_${id}">
                            <input type="hidden" name="item_subcat_${id}">
                            <input type="text" name="item_search_${id}" placeholder="🔍 품목명 검색..." autocomplete="off"
                                   class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500">
                            <div id="item_dd_${id}" class="item-dd hidden"></div>
                        </div>
                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-1">가로 (cm)</label>
                            <input type="number" name="width_${id}" min="0" step="0.1" placeholder="예: 90"
                                   class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" oninput="calcItem(${id})">
                        </div>
                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-1">세로 (cm)</label>
                            <input type="number" name="height_${id}" min="0" step="0.1" placeholder="예: 60"
                                   class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" oninput="calcItem(${id})">
                        </div>
                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-1"
                                   title="실제크기/파일크기 배율 (1:1=1, 1/5축소=5)">파일 스케일</label>
                            <input type="number" name="scale_factor_${id}" min="1" step="1" value="1"
                                   class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                                   title="실제크기/파일크기 배율. 1/5 축소 파일이면 5 입력"
                                   oninput="onParentScaleChange(${id})">
                        </div>
                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-1">수량 (자동)</label>
                            <input type="number" name="quantity_${id}" value="${childCount}" min="1"
                                   class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" oninput="calcItem(${id})">
                        </div>
                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-1">단위</label>
                            <input type="text" name="unit_display_${id}" value="EA" readonly
                                   class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-100 text-gray-600">
                        </div>
                        <div>
                            <label id="unit_price_label_${id}" class="block text-xs font-medium text-gray-600 mb-1">단가 (원)</label>
                            <input type="text" inputmode="numeric" data-money name="unit_price_${id}" value="0"
                                   class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" oninput="calcItem(${id})">
                        </div>
                        <div>
                            <label class="block text-xs font-medium text-gray-600 mb-1">금액</label>
                            <input type="text" name="amount_${id}" readonly value="0원"
                                   class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-100 font-bold text-blue-700">
                        </div>
                        <div class="flex items-end pb-1">
                            <label class="flex items-center gap-2 text-sm cursor-pointer">
                                <input type="checkbox" name="vat_${id}" checked class="rounded border-gray-300 text-blue-600" onchange="calculateTotal()">
                                <span class="text-gray-700">부가세 포함</span>
                            </label>
                        </div>
                    </div>
                    <div class="pt-2 border-t border-green-200" id="pp_section_${id}">
                        <label class="block text-xs font-medium text-green-700 mb-2">후가공 <span class="text-gray-400 font-normal">(자식 카드에 상속됨)</span></label>
                        <div id="pp_options_${id}" class="space-y-2 text-sm text-gray-400">품목을 선택하면 후가공 옵션이 표시됩니다.</div>
                        <div id="pp_subtotal_${id}" class="text-right text-sm font-medium text-orange-600 mt-1"></div>
                    </div>
                    <div class="pt-2 border-t border-green-200" id="finishing_section_${id}">
                        <label class="block text-xs font-medium text-green-700 mb-1">마감 방식</label>
                        <div class="flex items-center gap-1 mb-1" id="finishing_presets_${id}"></div>
                        <div class="flex items-center gap-2" id="finishing_simple_${id}">
                            <button type="button" onclick="toggleFinishingDetail(${id})" class="text-[10px] text-gray-400 hover:text-blue-600 whitespace-nowrap">개별 설정 ▾</button>
                        </div>
                        <div class="grid grid-cols-4 gap-1 mt-1 hidden" id="finishing_sides_${id}">
                            <div><label class="text-[10px] text-gray-400">상</label><select name="fin_top_${id}" class="w-full border rounded px-1 py-0.5 text-xs fin-select" onchange="onFinMethodChange(${id},'top')"></select><input name="fin_cm_top_${id}" type="number" step="0.5" min="0" class="w-full border rounded px-1 py-0.5 text-xs mt-0.5" placeholder="cm" onchange="calcFinishing(${id})"></div>
                            <div><label class="text-[10px] text-gray-400">하</label><select name="fin_bottom_${id}" class="w-full border rounded px-1 py-0.5 text-xs fin-select" onchange="onFinMethodChange(${id},'bottom')"></select><input name="fin_cm_bottom_${id}" type="number" step="0.5" min="0" class="w-full border rounded px-1 py-0.5 text-xs mt-0.5" placeholder="cm" onchange="calcFinishing(${id})"></div>
                            <div><label class="text-[10px] text-gray-400">좌</label><select name="fin_left_${id}" class="w-full border rounded px-1 py-0.5 text-xs fin-select" onchange="onFinMethodChange(${id},'left')"></select><input name="fin_cm_left_${id}" type="number" step="0.5" min="0" class="w-full border rounded px-1 py-0.5 text-xs mt-0.5" placeholder="cm" onchange="calcFinishing(${id})"></div>
                            <div><label class="text-[10px] text-gray-400">우</label><select name="fin_right_${id}" class="w-full border rounded px-1 py-0.5 text-xs fin-select" onchange="onFinMethodChange(${id},'right')"></select><input name="fin_cm_right_${id}" type="number" step="0.5" min="0" class="w-full border rounded px-1 py-0.5 text-xs mt-0.5" placeholder="cm" onchange="calcFinishing(${id})"></div>
                        </div>
                        <div id="finishing_calc_${id}" class="text-xs text-gray-500 mt-1"></div>
                    </div>
                    <div class="mt-2 pt-2 border-t border-green-200 flex justify-start">
                        <button type="button" onclick="addManualChildRow(${id})"
                                class="text-sm px-3 py-1.5 bg-green-50 text-green-700 rounded hover:bg-green-200 border border-green-300">
                            <i class="fas fa-plus mr-1"></i>자식 행 추가
                        </button>
                    </div>
                </div>`;
            }

            function addChildItemRow(parentId, group) {
                itemCount++;
                const id = itemCount;
                const sf = parseFloat(document.querySelector(`[name="scale_factor_${parentId}"]`)?.value) || 1;
                const wCm = group.width_mm ? (group.width_mm / 10 * sf).toFixed(1) : '';
                const hCm = group.height_mm ? (group.height_mm / 10 * sf).toFixed(1) : '';
                const isManual = (!group.width_mm && !group.height_mm && !group.thumbnail_base64);

                const thumbHtml = group.thumbnail_base64
                    ? `<img src="data:image/png;base64,${group.thumbnail_base64}"
                              class="w-24 h-24 object-contain border rounded bg-white flex-shrink-0 cursor-pointer"
                              onclick="openThumbModal('child_thumb_img_${id}')"
                              id="child_thumb_img_${id}">`
                    : `<div class="w-24 h-24 border rounded bg-gray-100 flex items-center justify-center flex-shrink-0 text-gray-400 text-xs">없음</div>`;

                const sizeHtml = isManual
                    ? `<div class="flex flex-col gap-1 flex-shrink-0">
                        <span class="text-xs text-gray-500">자식 ${group.index}</span>
                        <div class="flex items-center gap-1">
                            <input type="number" name="child_width_${id}" min="0" step="0.1" placeholder="가로"
                                   value="${wCm}" class="w-16 border rounded px-1 py-0.5 text-xs text-center" title="가로 (cm)">
                            <span class="text-xs text-gray-400">x</span>
                            <input type="number" name="child_height_${id}" min="0" step="0.1" placeholder="세로"
                                   value="${hCm}" class="w-16 border rounded px-1 py-0.5 text-xs text-center" title="세로 (cm)">
                            <span class="text-xs text-gray-400">cm</span>
                        </div>
                    </div>`
                    : `<span class="text-xs text-gray-500 w-20 flex-shrink-0"
                              data-orig-mm-w="${group.width_mm || 0}"
                              data-orig-mm-h="${group.height_mm || 0}">
                            그룹 ${group.index}<br>
                            <span id="child_size_${id}" class="text-gray-400">${wCm ? wCm + '×' + hCm + 'cm' : ''}</span>
                        </span>`;

                const hiddenSizeHtml = isManual
                    ? ''
                    : `<input type="hidden" name="child_width_${id}" value="${wCm}">
                    <input type="hidden" name="child_height_${id}" value="${hCm}">`;

                const html = `<div id="item_row_${id}"
                     class="flex items-center gap-3 border-l-4 border-green-400 bg-green-50 ml-4 pl-3 pr-3 py-2 mb-1 rounded-r child-item-row"
                     data-parent-row="${parentId}">
                    ${thumbHtml}
                    ${sizeHtml}
                    <input type="text" name="child_content_${id}" placeholder="내용명 (예: ○○마트 행사)"
                           class="flex-1 border rounded px-2 py-1.5 text-sm focus:ring-1 focus:ring-green-400 min-w-0">
                    <input type="number" name="child_qty_${id}" value="1" min="1"
                           class="w-16 border rounded px-2 py-1.5 text-sm text-center focus:ring-1 focus:ring-green-400 flex-shrink-0"
                           oninput="updateParentChildCount(${parentId})"
                           title="수량">
                    <button type="button" onclick="removeChildItem(${id}, ${parentId})"
                            class="text-red-400 hover:text-red-600 flex-shrink-0 px-1">
                        <i class="fas fa-times"></i>
                    </button>
                    <input type="hidden" name="parent_client_id_${id}" value="pg${parentId}">
                    <input type="hidden" name="child_ai_group_index_${id}" value="${group.index}">
                    <input type="hidden" name="child_ai_analysis_id_${id}" value="${aiAnalysisId || ''}">
                    ${hiddenSizeHtml}
                    <input type="hidden" name="child_scale_factor_${id}" value="${sf}">
                    <input type="hidden" name="is_child_${id}" value="1">
                </div>`;

                // Task 5: 자식 행을 부모 바로 아래, 기존 자식 뒤에 삽입
                const siblings = document.querySelectorAll('[data-parent-row="' + parentId + '"]');
                if (siblings.length > 0) {
                    siblings[siblings.length - 1].insertAdjacentHTML('afterend', html);
                } else {
                    document.getElementById('item-' + parentId).insertAdjacentHTML('afterend', html);
                }
                return id;
            }

            window.removeChildItem = function(childId, parentId) {
                document.getElementById('item_row_' + childId)?.remove();
                const remaining = document.querySelectorAll('[data-parent-row="' + parentId + '"]');
                if (remaining.length === 0) {
                    const parentEl = document.getElementById('item-' + parentId);
                    if (parentEl) {
                        parentEl.remove();
                        renumberDisplay();
                    }
                } else {
                    updateParentChildCount(parentId);
                }
                calculateTotal();
            };

            window.addManualChildRow = function(parentId) {
                const existingChildren = document.querySelectorAll('[data-parent-row="' + parentId + '"]');
                const nextIndex = existingChildren.length + 1;
                addChildItemRow(parentId, {
                    index: nextIndex,
                    width_mm: 0,
                    height_mm: 0,
                    thumbnail_base64: null
                });
                updateParentChildCount(parentId);
                calculateTotal();
            };

            function updateParentChildCount(parentId) {
                let total = 0;
                document.querySelectorAll('[data-parent-row="' + parentId + '"]').forEach(function(row) {
                    const childId = row.id.replace('item_row_', '');
                    const qtyEl = row.querySelector('[name="child_qty_' + childId + '"]');
                    total += parseInt(qtyEl?.value || '1');
                });
                const badge = document.getElementById('parent_badge_' + parentId);
                if (badge) badge.textContent = '×' + total + '장';
                const qtyEl = document.querySelector('[name="quantity_' + parentId + '"]');
                if (qtyEl) { qtyEl.value = total; calcItem(parentId); }
            }


            // ── 수정 모드 진입 처리 ──────────────────────────────────────────

            // 상태 텍스트/색상 (order-form 내부용)
            function getStatusText(status) {
                const map = {
                    'CONFIRMED': '확정',
                    'PRINTING': '출력중',
                    'PRINT_DONE': '출력완료', 'SHIPPED': '출고완료',
                    'HOLD': '보류', 'CANCELLED': '취소'
                };
                return map[status] || status;
            }
            function getStatusColor(status) {
                const map = {
                    'CONFIRMED': 'bg-blue-50 text-blue-700',
                    'PRINTING': 'bg-orange-100 text-orange-800',
                    'PRINT_DONE': 'bg-green-50 text-green-700',
                    'SHIPPED': 'bg-gray-100 text-gray-700',
                    'HOLD': 'bg-gray-200 text-gray-600',
                    'CANCELLED': 'bg-red-50 text-red-700'
                };
                return map[status] || 'bg-gray-100 text-gray-800';
            }

            // 후가공 복원 헬퍼
            function restorePostProcessing(rowId, ppJson) {
                if (!ppJson) return;
                try {
                    const ppArr = typeof ppJson === 'string' ? JSON.parse(ppJson) : ppJson;
                    if (!Array.isArray(ppArr) || ppArr.length === 0) return;

                    const container = document.getElementById('pp_options_' + rowId);
                    if (!container) return;

                    // Sort: finish → punching → offset → annotation (annotation last for correct enable state)
                    ppArr.sort(function(a, b) {
                        var order = { 'PUNCHING': 1, 'OFFSET': 2, 'ANNOTATION': 3 };
                        return (order[a.code] || 0) - (order[b.code] || 0);
                    });
                    ppArr.forEach(function(pp) {
                        const code = pp.code || pp.option_code || '';

                        if (code === 'PUNCHING') {
                            // Restore punching
                            const punchCheck = container.querySelector('.pp-punching-check');
                            if (punchCheck) {
                                punchCheck.checked = true;
                                const detail = document.getElementById('pp_punching_detail_' + rowId);
                                if (detail) detail.style.display = '';
                                // Restore grid values
                                if (pp.params) {
                                    Object.keys(pp.params).forEach(function(key) {
                                        if (key.startsWith('margin_')) return; // skip margin params
                                        const input = container.querySelector('.pp-punch-val[data-key="' + key + '"]');
                                        if (input) {
                                            const v = pp.params[key];
                                            input.value = (v === true) ? 1 : (v === false ? 0 : (parseInt(v) || 0));
                                        }
                                    });
                                }
                            }
                        } else if (code === 'ANNOTATION') {
                            // Restore annotation — enable first (may be disabled)
                            const annoCheck = container.querySelector('.pp-annotation-check');
                            if (annoCheck) {
                                annoCheck.disabled = false;
                                const annoLabel = document.getElementById('pp_annotation_label_' + rowId);
                                if (annoLabel) {
                                    annoLabel.className = 'font-medium text-sm text-gray-700';
                                    annoLabel.innerHTML = '\uc8fc\uc11d';
                                }
                                annoCheck.checked = true;
                                const detail = document.getElementById('pp_annotation_detail_' + rowId);
                                if (detail) detail.style.display = '';
                                // Restore positions (new: array) or position (legacy: string)
                                var positions = (pp.params && pp.params.positions) || (pp.params && pp.params.position ? [pp.params.position] : []);
                                // Uncheck all first
                                container.querySelectorAll('.pp-anno-dir').forEach(function(cb) { cb.checked = false; });
                                // Check saved positions
                                positions.forEach(function(dir) {
                                    var cb = container.querySelector('.pp-anno-dir[data-dir="' + dir + '"]');
                                    if (cb) cb.checked = true;
                                });
                                // Restore customText
                                if (pp.params && pp.params.customText) {
                                    var annoTextInput = container.querySelector('.pp-anno-text');
                                    if (annoTextInput) annoTextInput.value = pp.params.customText;
                                }
                            }
                        } else if (code === 'OFFSET') {
                            const offsetCheck = container.querySelector('.pp-offset-check');
                            if (offsetCheck) {
                                offsetCheck.checked = true;
                                const detail = document.getElementById('pp_offset_detail_' + rowId);
                                if (detail) detail.style.display = '';
                                if (pp.params) {
                                    // 4방향 (신규)
                                    if (pp.params.offset_top !== undefined) {
                                        var ti = container.querySelector('.pp-offset-top');
                                        var bi = container.querySelector('.pp-offset-bottom');
                                        var li = container.querySelector('.pp-offset-left');
                                        var ri = container.querySelector('.pp-offset-right');
                                        if (ti) ti.value = pp.params.offset_top || 0;
                                        if (bi) bi.value = pp.params.offset_bottom || 0;
                                        if (li) li.value = pp.params.offset_left || 0;
                                        if (ri) ri.value = pp.params.offset_right || 0;
                                    }
                                    // 하위호환: 기존 offset_distance → 4방향 동일값
                                    else if (pp.params.offset_distance) {
                                        var d = pp.params.offset_distance;
                                        var inputs = ['pp-offset-top', 'pp-offset-bottom', 'pp-offset-left', 'pp-offset-right'];
                                        inputs.forEach(function(cls) {
                                            var inp = container.querySelector('.' + cls);
                                            if (inp) inp.value = d;
                                        });
                                    }
                                    // method/cut_line 복원
                                    if (pp.params.method) {
                                        var mSel = container.querySelector('.pp-offset-method');
                                        if (mSel) mSel.value = pp.params.method;
                                    }
                                    if (pp.params.cut_line !== undefined) {
                                        var clCb = container.querySelector('.pp-offset-cutline');
                                        if (clCb) clCb.checked = !!pp.params.cut_line;
                                    }
                                }
                            }
                        } else {
                            // Restore finish PP — direction-based
                            if (pp.params && pp.params.directions) {
                                // New format: directions object
                                Object.keys(pp.params.directions).forEach(function(dir) {
                                    var sel = container.querySelector('.pp-finish-dir[data-direction="' + dir + '"]');
                                    if (sel) {
                                        for (var i = 0; i < sel.options.length; i++) {
                                            if (sel.options[i].dataset.ppCode === code || sel.options[i].value === String(pp.id)) {
                                                sel.selectedIndex = i;
                                                sel.dispatchEvent(new Event('change'));
                                                break;
                                            }
                                        }
                                        var marginInput = sel.closest('.pp-finish-dir-row').querySelector('.pp-finish-dir-margin');
                                        if (marginInput) marginInput.value = pp.params.directions[dir];
                                    }
                                });
                            } else {
                                // Legacy format: margin_top/bottom/left/right fields
                                var dirMargins = {
                                    top: parseFloat((pp.params && pp.params.margin_top != null) ? pp.params.margin_top : (pp.margin_top || 0)) || 0,
                                    bottom: parseFloat((pp.params && pp.params.margin_bottom != null) ? pp.params.margin_bottom : (pp.margin_bottom || 0)) || 0,
                                    left: parseFloat((pp.params && pp.params.margin_left != null) ? pp.params.margin_left : (pp.margin_left || 0)) || 0,
                                    right: parseFloat((pp.params && pp.params.margin_right != null) ? pp.params.margin_right : (pp.margin_right || 0)) || 0
                                };
                                Object.keys(dirMargins).forEach(function(dir) {
                                    if (dirMargins[dir] > 0) {
                                        var sel = container.querySelector('.pp-finish-dir[data-direction="' + dir + '"]');
                                        if (sel) {
                                            for (var i = 0; i < sel.options.length; i++) {
                                                if (sel.options[i].dataset.ppCode === code || sel.options[i].value === String(pp.id)) {
                                                    sel.selectedIndex = i;
                                                    sel.dispatchEvent(new Event('change'));
                                                    break;
                                                }
                                            }
                                            var marginInput = sel.closest('.pp-finish-dir-row').querySelector('.pp-finish-dir-margin');
                                            if (marginInput) marginInput.value = dirMargins[dir];
                                        }
                                    }
                                });
                            }
                        }
                    });

                    // Update annotation state after all restorations
                    updateAnnotationState(rowId);
                    calculatePPCost(rowId);
                    calculateTotal();
                } catch(e) { console.error('PP restore error:', e); }
            }

            async function loadOrderForEdit(orderId) {
                try {
                    const res = await axios.get('/api/orders/' + orderId);
                    if (!res.data.success) { showToast('주문 정보를 불러오지 못했습니다.', 'error'); return; }

                    const order = res.data.data;
                    editMode = orderId;

                    // 1. 제목 변경
                    const h1 = document.querySelector('h1');
                    h1.textContent = '주문 수정 (' + order.order_number + ')';

                    // 2. 상태 배지 표시
                    h1.insertAdjacentHTML('afterend',
                        '<span class="ml-3 px-3 py-1 rounded-full text-sm font-medium ' + getStatusColor(order.status) + '">' + getStatusText(order.status) + '</span>'
                    );

                    // 3. 기본 정보 채우기
                    if (order.client_id) {
                        document.getElementById('clientId').value = order.client_id;
                        document.getElementById('clientSearch').value = order.client_name || '';
                    }
                    if (order.delivery_date) document.getElementById('deliveryDate').value = order.delivery_date;
                    const prioEl = document.getElementById('priority');
                    if (prioEl && order.priority) prioEl.value = order.priority;
                    const recEl = document.getElementById('receptionLocation');
                    if (recEl) recEl.value = order.reception_location || '';
                    const delEl = document.getElementById('deliveryInfo');
                    if (delEl) delEl.value = order.delivery_info || '';
                    const dmEl = document.getElementById('deliveryMethod');
                    if (dmEl && order.delivery_method) {
                        var dmOptions = Array.from(dmEl.options).map(function(o) { return o.value; });
                        if (dmOptions.indexOf(order.delivery_method) >= 0) {
                            dmEl.value = order.delivery_method;
                        } else {
                            dmEl.value = '';
                        }
                    }
                    if (order.delivery_time) {
                        var dtParts = order.delivery_time.split(':');
                        var dtHourEl = document.getElementById('deliveryTimeHour');
                        if (dtHourEl) dtHourEl.value = dtParts[0] || '';
                        updateMinuteOptions();
                        var dtMinEl = document.getElementById('deliveryTimeMinute');
                        if (dtMinEl) dtMinEl.value = dtParts[1] || '00';
                    }
                    onDeliveryMethodChange();
                    var spEl = document.getElementById('shippingPayment');
                    if (spEl) spEl.value = order.shipping_payment || '';
                    document.getElementById('notes').value = order.notes || '';
                    const contactPhoneEl = document.getElementById('contactPhone');
                    if (contactPhoneEl) contactPhoneEl.value = order.contact_phone || '';
                    const contactMobileEl = document.getElementById('contactMobile');
                    if (contactMobileEl) contactMobileEl.value = order.contact_mobile || '';

                    // 4. 할인 금액 복원
                    const discountEl = document.getElementById('discountAmount');
                    if (discountEl && order.discount_amount) discountEl.value = fmtMoneyInput(order.discount_amount);

                    // 5. AI 파일 패널
                    if (order.ai_file_path) {
                        const aiPanel = document.querySelector('.mb-6.bg-blue-50');
                        if (aiPanel) {
                            const localPathEl = document.getElementById('aiLocalPath');
                            const fileInputLabel = document.getElementById('aiFileInput')?.closest('label');
                            const analyzeBtn = document.getElementById('aiAnalysisBtn');
                            if (localPathEl) localPathEl.value = order.ai_file_path;
                            if (fileInputLabel) {
                                fileInputLabel.style.pointerEvents = 'none';
                                fileInputLabel.style.opacity = '0.5';
                                const lbl = document.getElementById('aiFileLabel');
                                if (lbl) lbl.textContent = '(기존 파일 유지됨)';
                            }
                            if (analyzeBtn) analyzeBtn.disabled = false;
                            resolvedFilePath = order.ai_file_path;
                            const statusDiv = document.getElementById('aiAnalysisStatus');
                            if (statusDiv) {
                                statusDiv.classList.remove('hidden');
                                statusDiv.innerHTML = '<i class="fas fa-info-circle text-blue-500 mr-1"></i>기존 AI 파일: ' + escapeHtml(order.ai_file_path);
                            }
                        }
                    }

                    // 6. 품목 복원
                    const items = order.items || [];
                    document.getElementById('itemsContainer').innerHTML = '';
                    itemCount = 0;

                    const idMap = {};

                    // Pass 1: 부모/일반 행 먼저
                    const parentItems = items.filter(i => !i.parent_item_id);
                    const childItems = items.filter(i => i.parent_item_id);

                    for (const item of parentItems) {
                        const hasChildren = childItems.some(c => c.parent_item_id === item.id);
                        let id;

                        if (hasChildren) {
                            const childCount = childItems.filter(c => c.parent_item_id === item.id).length;
                            id = addParentItemRow(childCount);
                        } else {
                            addItemRow();
                            id = itemCount;
                        }
                        idMap[item.id] = id;

                        const set = (name, val) => {
                            const el = document.querySelector('[name="' + name + '_' + id + '"]');
                            if (el && val != null) el.value = val;
                        };

                        set('item_search', item.item_name || '');
                        set('item_id', item.item_id || '');
                        set('category_name', item.category_name || '');
                        set('width', item.width || '');
                        set('height', item.height || '');
                        set('scale_factor', item.scale_factor || 1);
                        set('quantity', item.quantity || 1);
                        set('item_unit', item.unit || 'EA');
                        set('unit_price', fmtMoneyInput(item.unit_price || 0));
                        set('content', item.content || '');
                        set('ai_group_index', item.ai_group_index != null ? item.ai_group_index : '');
                        set('ai_analysis_id', item.ai_analysis_id || '');

                        var pmRestoreVal = item.pricing_method || 'FIXED';
                        set('pricing_method', pmRestoreVal);
                        if (pmRestoreVal === 'AREA') {
                            var wRestoreEl = document.querySelector('[name="width_' + id + '"]');
                            var hRestoreEl = document.querySelector('[name="height_' + id + '"]');
                            var priceLblRestore = document.getElementById('unit_price_label_' + id);
                            if (wRestoreEl) { wRestoreEl.classList.add('border-purple-500'); wRestoreEl.classList.remove('border-gray-300'); }
                            if (hRestoreEl) { hRestoreEl.classList.add('border-purple-500'); hRestoreEl.classList.remove('border-gray-300'); }
                            if (priceLblRestore) priceLblRestore.textContent = '단가 (원/㎡)';
                        }

                        if (item.ai_group_index != null && item.ai_group_index !== '') {
                            var scaleDivEdit = document.getElementById('scale_div_' + id);
                            if (scaleDivEdit) scaleDivEdit.classList.remove('hidden');
                        }

                        const vatEl = document.querySelector('[name="vat_' + id + '"]');
                        if (vatEl) vatEl.checked = (item.vat_included == 1);

                        calcItem(id);

                        // 썸네일 복원: ai_groups_json에서 해당 그룹의 thumbnail_base64 추출
                        if (item.ai_groups_json && item.ai_group_index != null) {
                            try {
                                var groups = JSON.parse(item.ai_groups_json);
                                var grp = groups.find(function(g) { return g.index == item.ai_group_index; }) || groups[item.ai_group_index];
                                if (grp && grp.thumbnail_base64) {
                                    var thumbDiv = document.getElementById('thumb_' + id);
                                    var thumbImg = document.getElementById('thumb_img_' + id);
                                    if (thumbDiv && thumbImg) {
                                        thumbImg.src = 'data:image/png;base64,' + grp.thumbnail_base64;
                                        thumbDiv.classList.remove('hidden');
                                    }
                                }
                            } catch(e) { /* groups_json 파싱 실패 무시 */ }
                        }

                        if (item.post_processing && item.item_id) {
                            setTimeout(() => restorePostProcessing(id, item.post_processing), 600);
                        }
                    }

                    // Pass 2: 자식 행 (묶음)
                    for (const child of childItems) {
                        const parentRowId = idMap[child.parent_item_id];
                        if (parentRowId == null) continue;

                        const group = {
                            index: child.ai_group_index != null ? child.ai_group_index : 0,
                            width_mm: child.width ? child.width * 10 : 0,
                            height_mm: child.height ? child.height * 10 : 0,
                            thumbnail_base64: null
                        };
                        const childId = addChildItemRow(parentRowId, group);

                        const cSet = (name, val) => {
                            const el = document.querySelector('[name="' + name + '_' + childId + '"]');
                            if (el && val != null) el.value = val;
                        };
                        cSet('child_content', child.content || '');
                        cSet('child_qty', child.quantity || 1);
                        cSet('child_ai_group_index', child.ai_group_index != null ? child.ai_group_index : '');
                        cSet('child_ai_analysis_id', child.ai_analysis_id || '');
                    }
                    if (childItems.length > 0) {
                        const parentIdsWithChildren = new Set(
                            childItems.map(c => idMap[c.parent_item_id]).filter(Boolean)
                        );
                        parentIdsWithChildren.forEach(pid => updateParentChildCount(pid));
                    }

                    // 7. 합계 재계산
                    calculateTotal();

                    // 8. 버튼 변경
                    const submitBtn = document.getElementById('submitBtn');
                    if (submitBtn) {
                        submitBtn.innerHTML = '<i class="fas fa-save mr-2"></i>수정 저장';
                    }
                    // 수정 모드에서는 "견적서로 저장" 버튼 숨김
                    const qBtn = document.getElementById('quotationBtn');
                    if (qBtn) qBtn.style.display = 'none';

                    // 9. 상태별 경고
                    const formEl = document.querySelector('form');
                    if (formEl) {
                        if (['PRINTING'].includes(order.status)) {
                            const warn = document.createElement('div');
                            warn.className = 'bg-amber-50 border border-amber-300 text-amber-700 px-4 py-3 rounded mb-4';
                            warn.innerHTML = '<i class="fas fa-exclamation-triangle mr-2"></i>이 주문은 이미 제작이 진행 중입니다. 품목을 수정하면 PDF가 재생성됩니다.';
                            formEl.prepend(warn);
                        }
                        if (['PRINT_DONE'].includes(order.status)) {
                            const warn = document.createElement('div');
                            warn.className = 'bg-red-50 border border-red-300 text-red-700 px-4 py-3 rounded mb-4';
                            warn.innerHTML = '<i class="fas fa-exclamation-triangle mr-2"></i>이 주문은 인쇄가 완료되었습니다. 수정 시 카드가 재생성되고 인쇄 이력이 초기화됩니다.';
                            formEl.prepend(warn);
                        }
                        if (['SHIPPED'].includes(order.status)) {
                            const warn = document.createElement('div');
                            warn.className = 'bg-red-50 border border-red-300 text-red-700 px-4 py-3 rounded mb-4';
                            warn.innerHTML = '<i class="fas fa-exclamation-triangle mr-2"></i>이 주문은 출고완료 상태입니다. 금액과 비고만 수정하는 것을 권장합니다.';
                            formEl.prepend(warn);
                        }
                    }

                } catch(err) {
                    console.error('Edit load error:', err);
                    showToast('주문 정보를 불러오는 중 오류: ' + (err.response?.data?.error || err.message), 'error');
                }
            }

            async function loadOrderForCopy() {
                const raw = sessionStorage.getItem('copyOrderData');
                sessionStorage.removeItem('copyOrderData');
                if (!raw) { showToast('복사할 주문 정보가 없습니다.', 'warning'); return; }

                let order;
                try { order = JSON.parse(raw); } catch(e) { showToast('주문 데이터 파싱 오류', 'error'); return; }

                // editMode는 null 유지 (새 주문으로 POST)

                // 제목 + 복사 배지
                const h1 = document.querySelector('h1');
                if (h1) {
                    h1.insertAdjacentHTML('afterend',
                        '<span class="ml-3 px-3 py-1 rounded-full text-sm font-medium bg-green-50 text-green-700">복사본 (새 주문)</span>'
                    );
                }

                if (order.client_id) {
                    document.getElementById('clientId').value = order.client_id;
                    document.getElementById('clientSearch').value = order.client_name || '';
                }
                // 납기일: 원본 기간 유지 (delivery_date - order_date 일수를 오늘 기준으로 재계산)
                if (order.delivery_date && order.order_date) {
                    var origOrder = new Date(order.order_date);
                    var origDeliv = new Date(order.delivery_date);
                    var daysDiff = Math.round((origDeliv - origOrder) / (1000 * 60 * 60 * 24));
                    if (daysDiff > 0) {
                        var newDeliv = new Date();
                        newDeliv.setDate(newDeliv.getDate() + daysDiff);
                        document.getElementById('deliveryDate').value = newDeliv.toISOString().split('T')[0];
                    } else {
                        document.getElementById('deliveryDate').value = order.delivery_date;
                    }
                } else if (order.delivery_date) {
                    document.getElementById('deliveryDate').value = order.delivery_date;
                }
                const prioEl = document.getElementById('priority');
                if (prioEl && order.priority) prioEl.value = order.priority;
                const recEl = document.getElementById('receptionLocation');
                if (recEl) recEl.value = order.reception_location || '';
                const delEl = document.getElementById('deliveryInfo');
                if (delEl) delEl.value = order.delivery_info || '';
                const dmEl = document.getElementById('deliveryMethod');
                if (dmEl && order.delivery_method) {
                    var dmOptionsCopy = Array.from(dmEl.options).map(function(o) { return o.value; });
                    if (dmOptionsCopy.indexOf(order.delivery_method) >= 0) {
                        dmEl.value = order.delivery_method;
                    } else {
                        dmEl.value = '';
                    }
                }
                if (order.delivery_time) {
                    var dtPartsCopy = order.delivery_time.split(':');
                    var dtHourCopy = document.getElementById('deliveryTimeHour');
                    if (dtHourCopy) dtHourCopy.value = dtPartsCopy[0] || '';
                    updateMinuteOptions();
                    var dtMinCopy = document.getElementById('deliveryTimeMinute');
                    if (dtMinCopy) dtMinCopy.value = dtPartsCopy[1] || '00';
                }
                onDeliveryMethodChange();
                var spElCopy = document.getElementById('shippingPayment');
                if (spElCopy) spElCopy.value = order.shipping_payment || '';
                document.getElementById('notes').value = order.order_number + '-재주문건';
                const discountEl = document.getElementById('discountAmount');
                if (discountEl) discountEl.value = fmtMoneyInput(order.discount_amount || 0);

                // AI 파일 경로 복원 (재주문: 같은 디자인 파일 재사용)
                if (order.ai_file_path) {
                    const aiPanel = document.querySelector('.mb-6.bg-blue-50');
                    if (aiPanel) {
                        const localPathEl = document.getElementById('aiLocalPath');
                        if (localPathEl) localPathEl.value = order.ai_file_path;
                        const analyzeBtn = document.getElementById('aiAnalysisBtn');
                        if (analyzeBtn) analyzeBtn.disabled = false;
                        resolvedFilePath = order.ai_file_path;
                        const statusDiv = document.getElementById('aiAnalysisStatus');
                        if (statusDiv) {
                            statusDiv.classList.remove('hidden');
                            statusDiv.innerHTML = '<i class="fas fa-copy text-green-500 mr-1"></i>원본 AI 파일 재사용: ' + escapeHtml(order.ai_file_path);
                        }
                    }
                }

                // 품목 복원
                const items = order.items || [];
                document.getElementById('itemsContainer').innerHTML = '';
                itemCount = 0;

                const idMap = {};
                const parentItems = items.filter(i => !i.parent_item_id);
                const childItems = items.filter(i => i.parent_item_id);

                for (const item of parentItems) {
                    const hasChildren = childItems.some(c => c.parent_item_id === item.id);
                    let id;
                    if (hasChildren) {
                        const childCount = childItems.filter(c => c.parent_item_id === item.id).length;
                        id = addParentItemRow(childCount);
                    } else {
                        addItemRow();
                        id = itemCount;
                    }
                    idMap[item.id] = id;

                    const set = (name, val) => {
                        const el = document.querySelector('[name="' + name + '_' + id + '"]');
                        if (el && val != null) el.value = val;
                    };

                    set('item_search', item.item_name || '');
                    set('item_id', item.item_id || '');
                    set('category_name', item.category_name || '');
                    set('width', item.width || '');
                    set('height', item.height || '');
                    set('scale_factor', item.scale_factor || 1);
                    set('quantity', item.quantity || 1);
                    set('item_unit', item.unit || 'EA');
                    set('unit_price', fmtMoneyInput(item.unit_price || 0));
                    set('content', item.content || '');
                    // 재주문: ai_group_index, ai_analysis_id 복사 (같은 디자인 파일 재사용)
                    set('ai_group_index', item.ai_group_index != null ? item.ai_group_index : '');
                    set('ai_analysis_id', item.ai_analysis_id || '');

                    const vatEl = document.querySelector('[name="vat_' + id + '"]');
                    if (vatEl) vatEl.checked = (item.vat_included == 1);

                    calcItem(id);

                    // 썸네일 복원
                    if (item.ai_groups_json && item.ai_group_index != null) {
                        try {
                            var copyGroups = JSON.parse(item.ai_groups_json);
                            var copyGrp = copyGroups.find(function(g) { return g.index == item.ai_group_index; }) || copyGroups[item.ai_group_index];
                            if (copyGrp && copyGrp.thumbnail_base64) {
                                var cThumbDiv = document.getElementById('thumb_' + id);
                                var cThumbImg = document.getElementById('thumb_img_' + id);
                                if (cThumbDiv && cThumbImg) {
                                    cThumbImg.src = 'data:image/png;base64,' + copyGrp.thumbnail_base64;
                                    cThumbDiv.classList.remove('hidden');
                                }
                            }
                        } catch(e) {}
                    }

                    if (item.post_processing && item.item_id) {
                        setTimeout(() => restorePostProcessing(id, item.post_processing), 600);
                    }
                }

                // Pass 2: 자식 행
                for (const child of childItems) {
                    const parentRowId = idMap[child.parent_item_id];
                    if (parentRowId == null) continue;
                    // 자식 행 썸네일도 복원
                    var childThumb = null;
                    if (child.ai_groups_json && child.ai_group_index != null) {
                        try {
                            var cgs = JSON.parse(child.ai_groups_json);
                            var cg = cgs.find(function(g) { return g.index == child.ai_group_index; }) || cgs[child.ai_group_index];
                            if (cg) childThumb = cg.thumbnail_base64;
                        } catch(e) {}
                    }
                    const group = {
                        index: child.ai_group_index != null ? child.ai_group_index : 0,
                        width_mm: child.width ? child.width * 10 : 0,
                        height_mm: child.height ? child.height * 10 : 0,
                        thumbnail_base64: childThumb || null
                    };
                    const childId = addChildItemRow(parentRowId, group);

                    const cSet = (name, val) => {
                        const el = document.querySelector('[name="' + name + '_' + childId + '"]');
                        if (el && val != null) el.value = val;
                    };
                    cSet('child_content', child.content || '');
                    cSet('child_qty', child.quantity || 1);
                    // 재주문: ai 필드 복사
                    cSet('child_ai_group_index', child.ai_group_index != null ? child.ai_group_index : '');
                    cSet('child_ai_analysis_id', child.ai_analysis_id || '');
                }
                if (childItems.length > 0) {
                    Object.values(idMap).forEach(pid => updateParentChildCount(pid));
                }

                calculateTotal();
            }

            // ============================================
            // 금액 수동 수정 핸들러
            // ============================================
            window.onAmountManualEdit = function(id) {
                var el = document.querySelector('[name="amount_' + id + '"]');
                if (!el) return;
                var autoAmt = parseInt(el.dataset.autoAmount) || 0;
                var manual = parseMoney(el.value);
                if (autoAmt > 0 && manual !== autoAmt) {
                    el.classList.add('border-amber-400');
                    el.title = '자동 계산: ' + autoAmt.toLocaleString() + '원 (수동 수정됨)';
                } else {
                    el.classList.remove('border-amber-400');
                    el.title = '';
                }
                calculateTotal();
            };

            // ============================================
            // 출력방식 필터 (주문서 품목 선택 보조)
            // ============================================
            window.togglePrintMethodFilter = function() {
                var panel = document.getElementById('printMethodFilter');
                if (!panel) return;
                if (panel.classList.contains('hidden')) {
                    // 출력방식 목록 로드
                    axios.get('/api/print-system/methods').then(function(res) {
                        var methods = res.data.data || [];
                        var html = '<div class="flex gap-1 mb-2">';
                        methods.forEach(function(m) {
                            html += '<button type="button" onclick="selectPrintMethodFilter(' + m.id + ',\'' + m.name + '\')" '
                                + 'class="px-3 py-1.5 text-xs rounded border border-gray-300 hover:bg-blue-50 hover:border-blue-400">'
                                + m.name + '</button>';
                        });
                        html += '</div><div id="printMediaFilterList"></div>';
                        panel.innerHTML = html;
                        panel.classList.remove('hidden');
                    });
                } else {
                    panel.classList.add('hidden');
                }
            };

            window.selectPrintMethodFilter = function(methodId, methodName) {
                // 해당 출력방식의 소재 목록 로드
                axios.get('/api/print-system/items-for-order?method_id=' + methodId).then(function(res) {
                    var items = res.data.data || [];
                    var listEl = document.getElementById('printMediaFilterList');
                    if (!listEl) return;
                    if (!items.length) {
                        listEl.innerHTML = '<p class="text-xs text-gray-400 py-2">등록된 소재가 없습니다.</p>';
                        return;
                    }
                    var html = '<div class="text-xs text-gray-500 mb-1">' + escapeHtml(methodName) + ' 소재:</div><div class="flex flex-wrap gap-1">';
                    items.forEach(function(it) {
                        html += '<button type="button" data-item-id="' + it.id + '" data-item-name="' + escapeHtml(it.item_name || '') + '" data-base-price="' + (it.base_price || 0) + '" data-pricing-method="' + (it.pricing_method || 'AREA') + '" '
                            + 'class="pm-filter-media-btn px-2 py-1 text-xs rounded bg-gray-100 hover:bg-blue-100 border border-gray-200">'
                            + escapeHtml(it.item_name || '') + '</button>';
                    });
                    html += '</div>';
                    listEl.innerHTML = html;
                    // data 속성 기반 이벤트 바인딩 (XSS 방지)
                    listEl.querySelectorAll('.pm-filter-media-btn').forEach(function(btn) {
                        btn.addEventListener('click', function() {
                            selectPrintMediaFilter(
                                parseInt(btn.dataset.itemId),
                                btn.dataset.itemName,
                                parseFloat(btn.dataset.basePrice) || 0,
                                btn.dataset.pricingMethod
                            );
                        });
                    });
                });
            };

            window.selectPrintMediaFilter = function(itemId, itemName, basePrice, pricingMethod) {
                // 현재 포커스된 품목 행 또는 첫 빈 행 찾기
                var rows = document.querySelectorAll('#itemsContainer > [id^="item-"]');
                var targetId = null;
                rows.forEach(function(row) {
                    var id = row.id.replace('item-', '');
                    var hidId = document.querySelector('[name="item_id_' + id + '"]');
                    if (!targetId && (!hidId || !hidId.value)) targetId = id;
                });
                if (!targetId && rows.length > 0) {
                    // 모든 행에 품목이 있으면 새 행 추가
                    addItemRow();
                    var newRows = document.querySelectorAll('#itemsContainer > [id^="item-"]');
                    targetId = newRows[newRows.length - 1].id.replace('item-', '');
                }
                if (!targetId) return;

                // 품목 정보 채우기
                var hidId = document.querySelector('[name="item_id_' + targetId + '"]');
                var searchInp = document.querySelector('[name="item_search_' + targetId + '"]');
                var priceInp = document.querySelector('[name="unit_price_' + targetId + '"]');
                var pmInp = document.querySelector('[name="pricing_method_' + targetId + '"]');

                if (hidId) hidId.value = itemId;
                if (searchInp) searchInp.value = itemName;
                if (priceInp) priceInp.value = fmtMoneyInput(basePrice);
                if (pmInp) pmInp.value = pricingMethod;

                // 단가 자동 조회
                var clientId = (document.getElementById('clientId') || {}).value;
                if (clientId) {
                    axios.get('/api/price-list/calculate?item_id=' + itemId + '&client_id=' + clientId)
                        .then(function(r) {
                            if (r.data && r.data.data && r.data.data.price > 0) {
                                priceInp.value = fmtMoneyInput(r.data.data.price);
                            }
                            calcItem(targetId);
                        }).catch(function() { calcItem(targetId); });
                } else {
                    calcItem(targetId);
                }

                // 필터 닫기
                var panel = document.getElementById('printMethodFilter');
                if (panel) panel.classList.add('hidden');
            };

            // ============================================
            // 판재 배치 계산 (SHEET 소재)
            // ============================================
            window.updateSheetCalc = function(rowId) {
                var infoEl = document.getElementById('sheet_calc_' + rowId);
                if (!infoEl) return;
                var itemId = (document.querySelector('[name="item_id_' + rowId + '"]') || {}).value;
                if (!itemId) { infoEl.classList.add('hidden'); return; }

                // 품목의 소재 정보 조회 (media_type, sheet dimensions)
                axios.get('/api/items/' + itemId).then(function(res) {
                    var item = res.data.data;
                    if (!item || !item.print_media_id) { infoEl.classList.add('hidden'); return; }

                    // print_media 정보는 items-for-order에서 가져와야 하지만,
                    // 여기서는 간단하게 숨김 처리 (추후 확장)
                    infoEl.classList.add('hidden');
                }).catch(function() { infoEl.classList.add('hidden'); });
            };

            // ============================================
            // 단가 수동 변경 시 거래처 특약 저장 제안
            // ============================================
            window.onUnitPriceManualChange = function(id) {
                var priceInp = document.querySelector('[name="unit_price_' + id + '"]');
                var itemIdEl = document.querySelector('[name="item_id_' + id + '"]');
                var clientIdEl = document.getElementById('clientId');
                if (!priceInp || !itemIdEl || !clientIdEl) return;

                var itemId = itemIdEl.value;
                var clientId = clientIdEl.value;
                var newPrice = parseMoney(priceInp.value);
                if (!itemId || !clientId || !newPrice) return;

                // 기본 단가와 비교
                var basePrice = parseFloat(priceInp.dataset.basePrice || '0');
                if (basePrice && newPrice !== basePrice) {
                    // 저장 제안 팝업 (기존 showConfirm 활용)
                    var msg = '단가가 변경되었습니다 (' + basePrice.toLocaleString() + '원 → ' + newPrice.toLocaleString() + '원).\n이 거래처의 기본 단가로 저장할까요?';
                    showConfirm(msg, function() {
                        axios.post('/api/prices', {
                            item_id: parseInt(itemId),
                            client_id: parseInt(clientId),
                            price: newPrice,
                            context: 'sales'
                        }).then(function() {
                            showToast('거래처 단가가 저장되었습니다.', 'success');
                        }).catch(function() {
                            showToast('단가 저장 실패', 'error');
                        });
                    });
                }
            };

            loadData().then(async () => {
                const params = new URLSearchParams(window.location.search);
                const editId = params.get('edit');
                const isCopy = params.get('copy');
                if (editId) {
                    await loadOrderForEdit(editId);
                } else if (isCopy) {
                    await loadOrderForCopy();
                }
            });
