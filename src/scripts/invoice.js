var _clientEmail = '';
var _clientFax = '';
var _clientName = '';
var _clientId = null;
var _orderNumber = '';

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

function buildInvoiceHalf(data, copyLabel, fullPage) {
    var order = data.order;
    var client = data.client || {};
    var items = data.items || [];
    var co = data.company || {};

    var displayItems = items.filter(function(it) { return !it.parent_item_id; });
    var MIN_ROWS = fullPage ? 0 : 6;
    var totalSupply = 0, totalVat = 0, totalQty = 0;

    var itemRows = '';
    for (var i = 0; i < displayItems.length; i++) {
        var it = displayItems[i];
        var supply = it.amount || 0;
        var vat = it.vat_included ? Math.round(supply * 0.1) : 0;
        totalSupply += supply;
        totalVat += vat;
        totalQty += (it.quantity || 0);
        var spec = '';
        if (it.width && it.height) spec = it.width + 'x' + it.height + 'cm';
        var itemNameDisplay = (it.item_name || '') + (it.content ? '[' + it.content + ']' : '');
        itemRows += '<tr>'
            + '<td>' + (i+1) + '</td>'
            + '<td class="left">' + itemNameDisplay + '</td>'
            + '<td class="left" style="font-size:9px">' + spec + '</td>'
            + '<td>' + (it.quantity || 0) + '</td>'
            + '<td>' + (it.unit || 'EA') + '</td>'
            + '<td class="right">' + fmt(it.unit_price) + '</td>'
            + '<td class="right">' + fmt(supply) + '</td>'
            + '<td class="right">' + fmt(vat) + '</td>'
            + '</tr>';
    }

    for (var j = displayItems.length; j < MIN_ROWS; j++) {
        itemRows += '<tr class="empty-row"><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>';
    }
    // 규격 컬럼 추가로 colspan 조정 필요 없음 (8컬럼 유지, 비고→규격으로 교체)

    var finalAmount = order.final_amount || (totalSupply + totalVat);
    var koreanAmount = '일금 ' + numberToKorean(finalAmount) + '원정';

    var orderDate = order.order_date || order.created_at || '';
    if (orderDate) { try { orderDate = new Date(orderDate).toLocaleDateString('ko-KR'); } catch(e){} }

    var stampImg = co.company_stamp_base64
        ? '<img src="' + co.company_stamp_base64 + '" style="position:absolute;right:-6px;top:50%;transform:translateY(-50%);width:44px;height:44px;opacity:0.8;z-index:10">'
        : '';

    var halfClass = fullPage ? 'invoice-half invoice-full' : 'invoice-half';

    return '<div class="' + halfClass + '">'
        + '<div class="inv-title">거  래  명  세  서</div>'
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
        + '  <span>주문번호: ' + (order.order_number || '') + '</span>'
        + '</div>'

        + '<div class="total-korean">' + koreanAmount + ' (\u20A9' + fmt(finalAmount) + ')</div>'

        + '<table class="items-table">'
        + '<thead><tr><th style="width:24px">No</th><th style="width:28%">품목명</th><th style="width:10%">규격</th><th style="width:5%">수량</th><th style="width:5%">단위</th><th style="width:11%">단가</th><th style="width:13%">공급가액</th><th style="width:10%">세액</th></tr></thead>'
        + '<tbody>' + itemRows + '</tbody>'
        + '<tfoot><tr class="total-row"><td colspan="3">합 계</td><td>' + fmt(totalQty) + '</td><td></td><td></td><td class="right">' + fmt(totalSupply) + '</td><td class="right">' + fmt(totalVat) + '</td></tr></tfoot>'
        + '</table>'

        + '<div class="footer-section"><span class="label">비고:</span>' + (order.notes || '') + '</div>'
        + '<div class="footer-section"><span class="label">입금계좌:</span>' + (co.company_bank_info || '') + '</div>'

        + '<table class="items-table" style="margin-top:0;border-top:none">'
        + '<tbody>'
        + '<tr>'
        + '<td colspan="2" style="text-align:center;font-weight:700;background:#f3f4f6;padding:4px 6px;border-top:2px solid #000">전 미수금</td>'
        + '<td colspan="2" style="text-align:right;padding:4px 8px;border-top:2px solid #000">' + fmt(data.previous_balance || 0) + '원</td>'
        + '<td colspan="2" style="text-align:center;font-weight:700;background:#f3f4f6;padding:4px 6px;border-top:2px solid #000">부가세</td>'
        + '<td colspan="2" style="text-align:right;padding:4px 8px;border-top:2px solid #000">' + fmt(totalVat) + '원</td>'
        + '</tr>'
        + '<tr>'
        + '<td colspan="2" style="text-align:center;font-weight:700;background:#f3f4f6;padding:4px 6px">합계금액</td>'
        + '<td colspan="2" style="text-align:right;padding:4px 8px;font-weight:700">' + fmt(finalAmount) + '원</td>'
        + '<td colspan="2" style="text-align:center;font-weight:700;background:#f3f4f6;padding:4px 6px">현 미수금</td>'
        + '<td colspan="2" style="text-align:right;padding:4px 8px;font-weight:700;color:#c00">' + fmt(data.current_balance || 0) + '원</td>'
        + '</tr>'
        + '<tr>'
        + '<td colspan="6" style="text-align:left;padding:4px 8px;font-size:10px;color:#666">위와 같이 거래하였음을 확인합니다.</td>'
        + '<td colspan="2" style="text-align:center;font-weight:700;background:#f9fafb;padding:8px 6px;height:40px;vertical-align:top;font-size:10px">인수확인<br><span style="font-weight:400;color:#999;font-size:9px">(서명/인)</span></td>'
        + '</tr>'
        + '</tbody>'
        + '</table>'
        + '</div>';
}

async function loadInvoice() {
    try {
        var res = await axios.get('/api/orders/' + ORDER_ID + '/invoice');

        if (res.data.success) {
            var data = res.data.data;
            var co = data.company || {};

            if (!co.company_name || !co.company_business_registration_number) {
                document.getElementById('settingsWarn').style.display = 'inline-block';
            }

            // 거래처 정보 저장
            _clientEmail = (data.client && data.client.email) || '';
            _clientFax = (data.client && data.client.fax) || '';
            _clientName = (data.client && data.client.client_name) || '';
            _clientId = (data.client && data.client.id) || null;
            _orderNumber = (data.order && data.order.order_number) || '';

            var displayItems = (data.items || []).filter(function(it) { return !it.parent_item_id; });
            var html;
            if (displayItems.length <= 8) {
                html = buildInvoiceHalf(data, '공급받는자 보관용', false)
                     + '<hr class="cut-line">'
                     + buildInvoiceHalf(data, '공급자 보관용', false);
            } else {
                html = buildInvoiceHalf(data, '공급받는자 보관용', true)
                     + '<div class="page-break-print" style="page-break-before:always"></div>'
                     + buildInvoiceHalf(data, '공급자 보관용', true);
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
        document.getElementById('errorMsg').innerHTML = '<i class="fas fa-exclamation-circle"></i> 거래 명세서를 불러오는데 실패했습니다.<br><small>' + (err.message || '') + '</small>';
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
            type: 'invoice',
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

async function loadTaxInvoiceStatus() {
    try {
        var res = await axios.get('/api/tax-invoices/order/' + ORDER_ID);
        var actionEl = document.getElementById('taxInvoiceAction');
        var dataArr = res.data.data;
        if (res.data.success && Array.isArray(dataArr) && dataArr.length > 0) {
            var taxId = dataArr[0].id;
            actionEl.innerHTML = '<a class="btn-tax-link" href="/tax-invoices?open=' + taxId + '"><i class="fas fa-file-invoice-dollar"></i> 세금계산서 보기</a>';
        } else {
            actionEl.innerHTML = '<button class="btn-tax" onclick="createTaxInvoice()"><i class="fas fa-file-invoice-dollar"></i> 세금계산서 발행</button>';
        }
    } catch (err) {
        var status = err.response && err.response.status;
        if (status === 404) {
            document.getElementById('taxInvoiceAction').innerHTML = '<button class="btn-tax" onclick="createTaxInvoice()"><i class="fas fa-file-invoice-dollar"></i> 세금계산서 발행</button>';
        }
    }
}

async function createTaxInvoice() {
    try {
        var res = await axios.post('/api/tax-invoices', { order_id: ORDER_ID });
        if (res.data.success) {
            window.location.href = '/tax-invoices?open=' + res.data.data.id;
        } else {
            showToastError('세금계산서 발행 실패: ' + (res.data.error || '알 수 없는 오류'));
        }
    } catch (err) {
        var msg = (err.response && err.response.data && err.response.data.error) || err.message || '알 수 없는 오류';
        showToastError('세금계산서 발행 실패: ' + msg);
    }
}

async function sendFax() {
    var faxNum = prompt('팩스 번호를 입력하세요:', _clientFax);
    if (!faxNum) return;

    faxNum = faxNum.replace(/[^0-9\-]/g, '');
    if (!faxNum) { showToastError('유효한 팩스 번호를 입력하세요.'); return; }

    try {
        showToastSuccess('팩스 이미지 생성 중...');
        var target = document.querySelector('.page-wrapper');
        var canvas = await html2canvas(target, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
        var dataUrl = canvas.toDataURL('image/png');
        var base64 = dataUrl.replace(/^data:image\/png;base64,/, '');

        showToastSuccess('팩스 전송 중...');
        var res = await axios.post('/api/fax/send', {
            receiver_num: faxNum,
            receiver_name: _clientName,
            file_data: base64,
            file_name: '거래명세서_' + _orderNumber + '.png',
            related_type: 'ORDER',
            related_id: ORDER_ID,
            client_id: _clientId
        });

        if (res.data.success) {
            showToastSuccess('팩스가 전송되었습니다.');
        } else {
            showToastError('팩스 전송 실패: ' + (res.data.error || '알 수 없는 오류'));
        }
    } catch (err) {
        var msg = (err.response && err.response.data && err.response.data.error) || err.message || '알 수 없는 오류';
        showToastError('팩스 전송 실패: ' + msg);
    }
}

loadInvoice();
loadTaxInvoiceStatus();
