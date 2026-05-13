var _clientEmail = '';

// 인증 토큰 설정
var token = localStorage.getItem('token');
if (!token) {
    window.location.href = '/login';
    throw new Error('No auth token');
}
axios.defaults.headers.common['Authorization'] = 'Bearer ' + token;

function numberToKorean(num) {
    if (!num || num === 0) return '영';
    num = Math.floor(Math.abs(num));
    var digits = ['', '일', '이', '삼', '사', '오', '육', '칠', '팔', '구'];
    var smallUnits = ['', '십', '백', '천'];
    var bigUnits = ['', '만', '억', '조'];
    var result = '';
    var unitIdx = 0;
    while (num > 0) {
        var chunk = num % 10000;
        if (chunk > 0) {
            var chunkStr = '';
            var pos = 0;
            var c = chunk;
            while (c > 0) {
                var d = c % 10;
                if (d > 0) chunkStr = digits[d] + smallUnits[pos] + chunkStr;
                c = Math.floor(c / 10);
                pos++;
            }
            result = chunkStr + bigUnits[unitIdx] + result;
        }
        num = Math.floor(num / 10000);
        unitIdx++;
    }
    return result;
}

function formatRegNumber(num) {
    if (!num) return '';
    var s = num.replace(/[^0-9]/g, '');
    if (s.length === 10) return s.slice(0,3) + '-' + s.slice(3,5) + '-' + s.slice(5);
    return num;
}

function fmt(n) { return (n || 0).toLocaleString(); }

function buildQuotationHalf(data, copyLabel, fullPage, validUntil, isExpired) {
    var order = data.order;
    var client = data.client || {};
    var items = data.items || [];
    var co = data.company || {};

    var displayItems = items.filter(function(it) { return !it.parent_item_id; });
    var MIN_ROWS = fullPage ? 0 : 10;
    var totalSupply = 0, totalVat = 0;

    var itemRows = '';
    for (var i = 0; i < displayItems.length; i++) {
        var it = displayItems[i];
        var supply = it.amount || 0;
        var vat = it.vat_included ? Math.round(supply * 0.1) : 0;
        totalSupply += supply;
        totalVat += vat;
        var spec = '';
        if (it.width && it.height) spec = it.width + 'x' + it.height + 'cm';
        var nameWithSpec = (it.item_name || '') + (spec ? '-' + spec : '');
        var remark = (it.item_name || '') + (spec ? '[' + spec + ']' : '') + (it.content ? '-' + it.content : '');
        itemRows += '<tr>'
            + '<td>' + (i+1) + '</td>'
            + '<td class="left">' + nameWithSpec + '</td>'
            + '<td>' + (it.quantity || 0) + '</td>'
            + '<td>' + (it.unit || 'EA') + '</td>'
            + '<td class="right">' + fmt(it.unit_price) + '</td>'
            + '<td class="right">' + fmt(supply) + '</td>'
            + '<td class="right">' + fmt(vat) + '</td>'
            + '<td class="left" style="font-size:9px">' + remark + '</td>'
            + '</tr>';
    }

    for (var j = displayItems.length; j < MIN_ROWS; j++) {
        itemRows += '<tr class="empty-row"><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>';
    }

    var finalAmount = order.final_amount || (totalSupply + totalVat);
    var koreanAmount = '일금 ' + numberToKorean(finalAmount) + '원정';

    var orderDate = order.order_date || order.created_at || '';
    if (orderDate) { try { orderDate = new Date(orderDate).toLocaleDateString('ko-KR'); } catch(e){} }

    var validUntilStr = '';
    if (validUntil) {
        try { validUntilStr = new Date(validUntil).toLocaleDateString('ko-KR'); } catch(e){ validUntilStr = validUntil; }
    }

    var stampImg = co.company_stamp_base64
        ? '<img src="' + co.company_stamp_base64 + '" style="position:absolute;right:-6px;top:50%;transform:translateY(-50%);width:44px;height:44px;opacity:0.8;z-index:10">'
        : '';

    var halfClass = fullPage ? 'invoice-half invoice-full' : 'invoice-half';

    var expiredStyle = isExpired ? 'opacity:0.7;' : '';

    return '<div class="' + halfClass + '" style="' + expiredStyle + '">'
        + '<div class="inv-title">견  &nbsp; 적  &nbsp; 서</div>'
        + '<div class="inv-copy">(' + copyLabel + ')</div>'

        + '<div class="info-grid">'
        + '  <div class="info-box">'
        + '    <div class="box-title">공 급 자</div>'
        + '    <div class="info-row"><div class="info-label">등록번호</div><div class="info-value">' + formatRegNumber(co.company_business_registration_number) + '</div></div>'
        + '    <div class="info-row info-row-split"><div class="info-label">상호(법인)</div><div class="info-value">' + (co.company_name || '') + '</div><div class="info-label-sub">대 표</div><div class="info-value stamp-cell">' + (co.company_representative || '') + stampImg + '</div></div>'
        + '    <div class="info-row"><div class="info-label">업태/종목</div><div class="info-value">' + (co.company_business_type || '') + ' / ' + (co.company_business_item || '') + '</div></div>'
        + '    <div class="info-row"><div class="info-label">주소</div><div class="info-value">' + (co.company_address || '') + '</div></div>'
        + '    <div class="info-row"><div class="info-label">전화/FAX</div><div class="info-value">' + (co.company_phone || '') + ' / ' + (co.company_fax || '') + '</div></div>'
        + '  </div>'
        + '  <div class="info-box">'
        + '    <div class="box-title">공 급 받 는 자</div>'
        + '    <div class="info-row"><div class="info-label">등록번호</div><div class="info-value">' + formatRegNumber(client.business_registration_number) + '</div></div>'
        + '    <div class="info-row info-row-split"><div class="info-label">상호(법인)</div><div class="info-value">' + (client.client_name || '') + '</div><div class="info-label-sub">대 표</div><div class="info-value">' + (client.representative || '') + '</div></div>'
        + '    <div class="info-row"><div class="info-label">업태/종목</div><div class="info-value">' + (client.business_type || '') + ' / ' + (client.business_item || '') + '</div></div>'
        + '    <div class="info-row"><div class="info-label">주소</div><div class="info-value">' + (client.address || '') + '</div></div>'
        + '    <div class="info-row"><div class="info-label">전화/FAX</div><div class="info-value">' + (client.phone || '') + ' / ' + (client.fax || '') + '</div></div>'
        + '  </div>'
        + '</div>'

        + '<div class="meta-row">'
        + '  <span>작성일자: ' + orderDate + '</span>'
        + '  <span>주문번호: ' + (order.order_number || '') + '</span>'
        + (validUntilStr ? '  <span style="' + (isExpired ? 'color:#ef4444;font-weight:700' : 'color:#0d9488') + '">유효기한: ' + validUntilStr + (isExpired ? ' (만료)' : '') + '</span>' : '')
        + '</div>'

        + '<div class="total-korean">' + koreanAmount + ' (₩' + fmt(finalAmount) + ')</div>'

        + '<table class="items-table">'
        + '<thead><tr><th style="width:24px">No</th><th style="width:30%">품목명</th><th style="width:6%">수량</th><th style="width:5%">단위</th><th style="width:12%">단가</th><th style="width:13%">공급가액</th><th style="width:10%">세액</th><th>비고</th></tr></thead>'
        + '<tbody>' + itemRows + '</tbody>'
        + '<tfoot><tr class="total-row"><td colspan="5">합 계</td><td class="right">' + fmt(totalSupply) + '</td><td class="right">' + fmt(totalVat) + '</td><td></td></tr></tfoot>'
        + '</table>'

        + '<div class="footer-section"><span class="label">비고:</span>' + (order.notes || '') + ' 본 견적서는 유효기한까지 유효합니다.</div>'
        + '<div class="footer-section"><span class="label">입금계좌:</span>' + (co.company_bank_info || '') + '</div>'
        + '</div>';
}

async function loadQuotation() {
    try {
        var res = await axios.get('/api/orders/' + ORDER_ID + '/invoice');

        if (res.data.success) {
            var data = res.data.data;
            var co = data.company || {};
            var order = data.order || {};

            if (!co.company_name || !co.company_business_registration_number) {
                document.getElementById('settingsWarn').style.display = 'inline-block';
            }

            // 유효기한 처리
            var validUntil = order.valid_until || null;
            var isExpired = false;
            if (validUntil) {
                var today = new Date();
                today.setHours(0, 0, 0, 0);
                var expDate = new Date(validUntil);
                expDate.setHours(0, 0, 0, 0);
                if (expDate < today) {
                    isExpired = true;
                    document.getElementById('expiredBadge').style.display = 'inline-block';
                }
            }

            // 거래처 이메일 저장
            _clientEmail = (data.client && data.client.email) || '';

            // 주문 상태가 QUOTATION이면 주문 전환 버튼 표시
            if (order.status === 'QUOTATION') {
                document.getElementById('convertBtn').style.display = 'inline-block';
            }

            var displayItems = (data.items || []).filter(function(it) { return !it.parent_item_id; });
            var html;
            if (displayItems.length <= 8) {
                html = buildQuotationHalf(data, '고객 보관용', false, validUntil, isExpired)
                     + '<hr class="cut-line">'
                     + buildQuotationHalf(data, '공급자 보관용', false, validUntil, isExpired);
            } else {
                html = buildQuotationHalf(data, '고객 보관용', true, validUntil, isExpired)
                     + '<div style="page-break-before:always"></div>'
                     + buildQuotationHalf(data, '공급자 보관용', true, validUntil, isExpired);
            }

            document.getElementById('loadingMsg').style.display = 'none';
            document.getElementById('invoiceContent').style.display = 'block';
            document.getElementById('invoiceContent').innerHTML = html;
        } else {
            throw new Error(res.data.error || '데이터 로드 실패');
        }
    } catch (err) {
        document.getElementById('loadingMsg').style.display = 'none';
        document.getElementById('errorMsg').style.display = 'block';
        document.getElementById('errorMsg').innerHTML = '<i class="fas fa-exclamation-circle"></i> 견적서를 불러오는데 실패했습니다.<br><small>' + escapeHtml(err.message || '') + '</small>';
    }
}

function showToastError(msg) {
    var el = document.getElementById('toastError');
    el.textContent = msg;
    el.style.display = 'block';
    setTimeout(function() { el.style.display = 'none'; }, 4000);
}

function showToastSuccess(msg) {
    var el = document.getElementById('toastSuccess');
    el.textContent = msg;
    el.style.display = 'block';
    setTimeout(function() { el.style.display = 'none'; }, 3000);
}

function openEmailModal() {
    document.getElementById('emailTo').value = _clientEmail;
    document.getElementById('emailModalOverlay').classList.add('active');
    document.getElementById('emailTo').focus();
}

function closeEmailModal() {
    document.getElementById('emailModalOverlay').classList.remove('active');
}

async function sendEmail() {
    var email = document.getElementById('emailTo').value.trim();
    if (!email) { showToastError('이메일 주소를 입력하세요.'); return; }

    var btn = document.getElementById('sendEmailBtn');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i>발송 중...';

    try {
        var res = await axios.post('/api/orders/' + ORDER_ID + '/send-email', {
            type: 'quotation',
            to_email: email
        });

        if (res.data.success) {
            closeEmailModal();
            showToastSuccess('이메일이 발송되었습니다.');
        } else {
            showToastError('이메일 발송 실패: ' + (res.data.error || '알 수 없는 오류'));
        }
    } catch (err) {
        var msg = (err.response && err.response.data && err.response.data.error) || err.message || '알 수 없는 오류';
        showToastError('이메일 발송 실패: ' + msg);
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-paper-plane mr-1"></i>발송';
    }
}

async function convertToOrder() {
    if (!(await showConfirm('이 견적서를 주문으로 전환하시겠습니까?\n확정(CONFIRMED) 상태로 변경됩니다.'))) return;

    try {
        var res = await axios.post('/api/orders/' + ORDER_ID + '/convert-to-order', {});

        if (res.data.success) {
            showToastSuccess('주문으로 전환되었습니다. 주문 목록으로 이동합니다.');
            setTimeout(function() { window.location.href = '/orders'; }, 1500);
        } else {
            showToastError('전환 실패: ' + (res.data.error || '알 수 없는 오류'));
        }
    } catch (err) {
        var msg = (err.response && err.response.data && err.response.data.error) || err.message || '알 수 없는 오류';
        showToastError('전환 실패: ' + msg);
    }
}

loadQuotation();