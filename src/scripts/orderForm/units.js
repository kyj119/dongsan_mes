            // ══════════════════════════════════════════════════════
            // 판매단위(0620 단위표) — 주문서 라인의 「조 = 2EA」 입력.
            //   스위치 settings.item_units.forms 가 ON 이고 품목에 기본단위 외 단위가 있을 때만 칸이 보인다.
            //   quantity(기본단위) = sales_qty × factor 로 자동 환산 → calcItem 이 금액을 다시 센다.
            //   저장: quantity 축은 종전 그대로, sales_unit/sales_qty/unit_factor 는 스냅샷(문서 「10조(20EA)」).
            //   ⚠️ ?raw concat 전역 — 식별자는 of(orderForm) 접두.
            // ══════════════════════════════════════════════════════
            var _ofUnitsFlag = null;
            var _ofUnitsCache = {};
            function ofUnitsFlag() {
                if (_ofUnitsFlag !== null) return Promise.resolve(_ofUnitsFlag);
                return axios.get('/api/items/units-flag').then(function (res) {
                    _ofUnitsFlag = !!(res.data && res.data.data && res.data.data.forms);
                    return _ofUnitsFlag;
                }).catch(function () { _ofUnitsFlag = false; return false; });
            }
            function ofUnitsFor(itemId) {
                if (_ofUnitsCache[itemId]) return Promise.resolve(_ofUnitsCache[itemId]);
                return axios.get('/api/items/' + itemId + '/units').then(function (res) {
                    var rows = (res.data && res.data.data) || [];
                    _ofUnitsCache[itemId] = rows;
                    return rows;
                }).catch(function () { return []; });
            }
            // 품목 선택·복원 때 호출. restore = {sales_unit, sales_qty} 가 있으면 그 값으로 되살린다.
            function ofUnitsApply(id, itemId, baseUnit, restore) {
                var wrap = document.getElementById('sales_unit_wrap_' + id);
                var hint = document.getElementById('sales_unit_hint_' + id);
                var sel = document.querySelector('[name="sales_unit_' + id + '"]');
                var qtyS = document.querySelector('[name="sales_qty_' + id + '"]');
                var fac = document.querySelector('[name="unit_factor_' + id + '"]');
                if (!wrap || !sel || !qtyS || !fac) return;
                // 초기화(품목 바뀜) — 판매단위 없음
                wrap.classList.add('hidden'); if (hint) hint.classList.add('hidden');
                sel.innerHTML = ''; qtyS.value = ''; fac.value = '';
                // ★복원값은 **플래그와 무관하게 먼저 넣는다**. PUT 은 라인을 지우고 다시 넣으므로,
                //   여기서 비우고 조기 반환하면 수정 한 번에 기존 스냅샷(견적에서 넘어온 「10조」 포함)이 사라진다.
                //   스위치는 「셀렉트를 보여줄지」만 가른다 — 저장값 보존은 스위치와 무관하다.
                if (restore && restore.sales_unit && restore.sales_qty > 0) {
                    sel.innerHTML = '<option value="' + escapeHtml(restore.sales_unit) + '" data-factor="' + (Number(restore.unit_factor) || '') + '" selected>' + escapeHtml(restore.sales_unit) + '</option>';
                    qtyS.value = restore.sales_qty;
                    fac.value = Number(restore.unit_factor) || '';
                }
                if (!(itemId > 0)) return;
                ofUnitsFlag().then(function (on) {
                    if (!on) return;
                    return ofUnitsFor(itemId).then(function (rows) {
                        var base = rows.filter(function (r) { return r.is_base; })[0];
                        var extra = rows.filter(function (r) { return !r.is_base; });
                        if (!base || !extra.length) return;   // 단일 단위 품목 = 칸 없음
                        var salesDefault = rows.filter(function (r) { return r.role_sales; })[0] || base;
                        sel.innerHTML = '<option value="" data-factor="1">' + escapeHtml(base.unit) + '</option>'
                            + extra.map(function (r) { return '<option value="' + escapeHtml(r.unit) + '" data-factor="' + r.factor + '">' + escapeHtml(r.unit) + ' (=' + r.factor + escapeHtml(base.unit) + ')</option>'; }).join('');
                        var chosen = (restore && restore.sales_unit) ? restore.sales_unit : (salesDefault.is_base ? '' : salesDefault.unit);
                        sel.value = chosen;
                        if (sel.value !== chosen) sel.value = '';
                        wrap.classList.remove('hidden');
                        if (restore && restore.sales_qty > 0 && sel.value) {
                            qtyS.value = restore.sales_qty;
                            ofSalesUnitChanged(id, true);
                        } else {
                            ofSalesUnitChanged(id, true);
                        }
                    });
                });
            }
            // 판매단위 바꿈: 기본단위면 판매 칸을 비우고 수량을 직접 쓴다. 환산 단위면 수량 = 판매수량 × 계수.
            function ofSalesUnitChanged(id, keepQty) {
                var sel = document.querySelector('[name="sales_unit_' + id + '"]');
                var qtyS = document.querySelector('[name="sales_qty_' + id + '"]');
                var fac = document.querySelector('[name="unit_factor_' + id + '"]');
                var qty = document.querySelector('[name="quantity_' + id + '"]');
                var hint = document.getElementById('sales_unit_hint_' + id);
                if (!sel || !qtyS || !fac || !qty) return;
                var opt = sel.options[sel.selectedIndex];
                var factor = opt ? (parseFloat(opt.getAttribute('data-factor')) || 1) : 1;
                if (!sel.value) {
                    fac.value = ''; qtyS.value = ''; qtyS.disabled = true; qty.readOnly = false;
                    if (hint) hint.classList.add('hidden');
                    return;
                }
                fac.value = factor; qtyS.disabled = false; qty.readOnly = true;
                if (!keepQty || !(parseFloat(qtyS.value) > 0)) {
                    // 기존 EA 수량을 판매단위로 되돌려 보여준다(21EA → 10.5조는 그대로 보인다)
                    var cur = parseFloat(qty.value) || 0;
                    if (cur > 0 && !(parseFloat(qtyS.value) > 0)) qtyS.value = Math.round((cur / factor) * 100) / 100;
                }
                ofSalesQtyChanged(id);
            }
            function ofSalesQtyChanged(id) {
                var qtyS = document.querySelector('[name="sales_qty_' + id + '"]');
                var fac = document.querySelector('[name="unit_factor_' + id + '"]');
                var qty = document.querySelector('[name="quantity_' + id + '"]');
                var sel = document.querySelector('[name="sales_unit_' + id + '"]');
                var hint = document.getElementById('sales_unit_hint_' + id);
                if (!qtyS || !fac || !qty || !sel || !sel.value) return;
                var n = parseFloat(qtyS.value) || 0;
                var factor = parseFloat(fac.value) || 1;
                var baseQty = Math.round(n * factor * 100) / 100;
                qty.value = baseQty > 0 ? baseQty : '';
                if (hint) {
                    var baseOpt = sel.options[0];
                    hint.textContent = n > 0 ? (n + sel.value + ' = ' + baseQty + (baseOpt ? baseOpt.textContent : '')) : '';
                    hint.classList.toggle('hidden', !(n > 0));
                }
                if (typeof calcItem === 'function') calcItem(id);
            }
            window.ofUnitsApply = ofUnitsApply;
            window.ofSalesUnitChanged = ofSalesUnitChanged;
            window.ofSalesQtyChanged = ofSalesQtyChanged;
