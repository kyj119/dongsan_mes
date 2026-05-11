// orderForm/client.js — 거래처 검색·선택·여신 + 배송시간 (Phase 3.1.C 분할)

﻿            localStorage.setItem('lastOrderFormType', 'production');
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

