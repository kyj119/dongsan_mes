            localStorage.setItem('lastOrderFormType', 'dist');
            var itemCount = 0;
            var searchTimers = {};
            var isSubmitting = false;

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
                            openClientModal(q, clients);
                        }
                    })
                    .catch(function(err) { console.error('Client search error:', err); });
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
                            + '<div class="font-medium text-sm">' + escapeHtml(cl.client_name || '') + '</div>'
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
                    + '<input type="text" id="modalClientSearch" value="' + escapeHtml(query || '') + '"'
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
                var recEl = document.getElementById('receptionLocation');
                if (recEl && !recEl.value) recEl.value = name;
                axios.get('/api/clients/' + id).then(function(res) {
                    if (res.data && res.data.success && res.data.data) {
                        var cl = res.data.data;
                        var addrEl = document.getElementById('deliveryAddress');
                        if (addrEl && !addrEl.value) addrEl.value = cl.delivery_address || cl.address || '';
                        var phoneEl = document.getElementById('contactPhone');
                        if (phoneEl && !phoneEl.value) phoneEl.value = cl.phone || '';
                        var mobileEl = document.getElementById('contactMobile');
                        if (mobileEl && !mobileEl.value) mobileEl.value = cl.mobile || '';
                        // 거래처 기본 배송방법 설정
                        if (cl.delivery_method) {
                            var dmEl = document.getElementById('distDeliveryMethod');
                            if (dmEl) { dmEl.value = cl.delivery_method; onDistDeliveryMethodChange(); }
                        }
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
                    + '<input type="text" name="dist_item_search_' + id + '" placeholder="품목명 검색..." autocomplete="off"'
                    + ' class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">'
                    + '<div id="dist_dd_' + id + '" class="item-dd hidden"></div>'
                    + '</td>'
                    + '<td class="py-3 px-3"><input type="text" name="dist_spec_' + id + '" readonly class="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-50"></td>'
                    + '<td class="py-3 px-3"><input type="number" name="dist_qty_' + id + '" value="1" min="1" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-center" oninput="calcDistItem(' + id + ')"></td>'
                    + '<td class="py-3 px-3"><input type="text" inputmode="numeric" data-money name="dist_price_' + id + '" value="0" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-right" oninput="calcDistItem(' + id + ')"></td>'
                    + '<td class="py-3 px-3 text-right"><span id="dist_amount_' + id + '" class="font-medium text-blue-700">0원</span></td>'
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
                var dd = document.getElementById('dist_dd_' + id);
                var hidId = document.querySelector('[name="dist_item_id_' + id + '"]');

                input.addEventListener('input', function() {
                    clearTimeout(searchTimers[id]);
                    hidId.value = '';
                    var q = input.value.trim();
                    if (q.length < 1) { dd.classList.add('hidden'); dd.innerHTML = ''; return; }
                    searchTimers[id] = setTimeout(function() {
                        axios.get('/api/items?is_sales_item=1&search=' + encodeURIComponent(q) + '&limit=20')
                            .then(function(res) {
                                var items = res.data.data || [];
                                if (items.length === 0) { dd.classList.add('hidden'); dd.innerHTML = ''; return; }
                                dd.innerHTML = items.map(function(it) {
                                    return '<div class="item-dd-entry px-3 py-2 cursor-pointer text-sm border-b border-gray-50" '
                                        + 'data-id="' + it.id + '" data-name="' + escapeHtml(it.item_name) + '" '
                                        + 'data-price="' + (it.sales_price || it.base_price || 0) + '" '
                                        + 'data-unit="' + escapeHtml(it.unit || 'EA') + '" '
                                        + 'data-spec="' + escapeHtml(it.specification || '') + '">'
                                        + '<div class="font-medium">' + escapeHtml(it.item_name) + '</div>'
                                        + '<div class="text-xs text-gray-500">'
                                        + (it.specification ? it.specification + ' | ' : '')
                                        + (it.sales_price ? it.sales_price.toLocaleString() + '원' : '')
                                        + (it.unit ? ' | ' + it.unit : '')
                                        + '</div></div>';
                                }).join('');
                                dd.classList.remove('hidden');
                            })
                            .catch(function() { dd.classList.add('hidden'); });
                    }, 300);
                });

                input.addEventListener('keydown', function(e) {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        // select first item in dropdown if visible
                        var first = dd.querySelector('.item-dd-entry');
                        if (first && !dd.classList.contains('hidden')) {
                            selectDistItem(id, first);
                        }
                    }
                });

                dd.addEventListener('mousedown', function(e) {
                    var entry = e.target.closest('.item-dd-entry');
                    if (entry) { selectDistItem(id, entry); }
                });

                input.addEventListener('blur', function() {
                    setTimeout(function() { dd.classList.add('hidden'); }, 200);
                });
            }

            function selectDistItem(id, entryEl) {
                var itemId = entryEl.dataset.id;
                var name = entryEl.dataset.name;
                var price = parseInt(entryEl.dataset.price) || 0;
                var unit = entryEl.dataset.unit || 'EA';
                var spec = entryEl.dataset.spec || '';

                document.querySelector('[name="dist_item_id_' + id + '"]').value = itemId;
                document.querySelector('[name="dist_item_search_' + id + '"]').value = name;
                document.querySelector('[name="dist_spec_' + id + '"]').value = spec;
                document.querySelector('[name="dist_price_' + id + '"]').value = fmtMoneyInput(price);
                document.getElementById('dist_dd_' + id).classList.add('hidden');
                calcDistItem(id);
            }

            function calcDistItem(id) {
                var qty = parseInt(document.querySelector('[name="dist_qty_' + id + '"]').value) || 0;
                var price = parseMoney(document.querySelector('[name="dist_price_' + id + '"]').value);
                var amt = qty * price;
                document.getElementById('dist_amount_' + id).textContent = amt.toLocaleString() + '원';
                calculateDistTotal();
            }

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
                var vat = vatCheck && vatCheck.checked ? Math.round(total * 0.1) : 0;
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
            function onDistDeliveryMethodChange() {
                var method = document.getElementById('distDeliveryMethod').value;
                var hourSel = document.getElementById('distDeliveryTimeHour');
                var minSel = document.getElementById('distDeliveryTimeMinute');

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
                    items.push({
                        item_id: itemId ? parseInt(itemId) : null,
                        item_name: itemName.trim(),
                        width: null,
                        height: null,
                        quantity: qty,
                        unit: 'EA',
                        unit_price: unitPrice,
                        amount: amount,
                        vat_included: vatCheck && vatCheck.checked ? 1 : 0,
                        sort_order: idx + 1
                    });
                });
                if (!valid) return;

                isSubmitting = true;
                var btn = document.getElementById('distSubmitBtn');
                btn.disabled = true;
                btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>등록 중...';

                // 납품시간 조합
                var dtHour = (document.getElementById('distDeliveryTimeHour') || {}).value || '';
                var dtMin = (document.getElementById('distDeliveryTimeMinute') || {}).value || '00';
                var deliveryTime = dtHour ? (dtHour + ':' + dtMin) : null;

                var orderData = {
                    client_id: parseInt(clientId),
                    order_type: 'DISTRIBUTION',
                    priority: (document.getElementById('distPriority') || {}).value || 'NORMAL',
                    delivery_date: document.getElementById('distDeliveryDate').value || null,
                    delivery_time: deliveryTime,
                    delivery_method: document.getElementById('distDeliveryMethod').value || null,
                    shipping_payment: document.getElementById('distShippingPayment').value || null,
                    reception_location: document.getElementById('receptionLocation').value || null,
                    delivery_info: document.getElementById('deliveryAddress').value || null,
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
                    if (name === 'clientSearch' || name === 'modalClientSearch') return;
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
                if (dateEl) dateEl.value = tomorrow.toISOString().split('T')[0];
                // 납품시간 옵션 초기화
                initDistDeliveryTimeOptions();
                // 출고방법 초기화 (납품시간 자동 설정 포함)
                onDistDeliveryMethodChange();
                // 첫 품목 행 추가
                addItemRow();
            })();
