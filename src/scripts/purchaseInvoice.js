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

function buildPOSheet(data) {
    var po = data.po || {};
    var supplier = data.supplier || {};
    var items = data.items || [];
    var co = data.company || {};

    var MIN_ROWS = 10;
    var totalSupply = 0, totalVat = 0;

    var itemRows = '';
    for (var i = 0; i < items.length; i++) {
        var it = items[i];
        var qty = it.quantity || 0;
        var unitPrice = it.unit_price || 0;
        var supply = it.amount || (qty * unitPrice);
        var vat = it.vat_included ? Math.round(supply * 0.1) : 0;
        totalSupply += supply;
        totalVat += vat;
        var spec = '';
        if (it.width && it.height) spec = it.width + 'x' + it.height + 'cm';
        var itemName = (it.item_name || it.name || '') + (spec ? ' [' + spec + ']' : '');
        itemRows += '<tr>'
            + '<td>' + (i+1) + '</td>'
            + '<td class="left">' + itemName + '</td>'
            + '<td>' + qty + '</td>'
            + '<td>' + (it.unit || 'EA') + '</td>'
            + '<td class="right">' + fmt(unitPrice) + '</td>'
            + '<td class="right">' + fmt(supply) + '</td>'
            + '<td class="right">' + fmt(vat) + '</td>'
            + '<td class="left" style="font-size:9px">' + (it.notes || it.content || '') + '</td>'
            + '</tr>';
    }

    for (var j = items.length; j < MIN_ROWS; j++) {
        itemRows += '<tr class="empty-row"><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>';
    }

    var finalAmount = po.total_amount || po.final_amount || (totalSupply + totalVat);
    var koreanAmount = '일금 ' + numberToKorean(finalAmount) + '원정';

    var poDate = po.order_date || po.created_at || '';
    if (poDate) { try { poDate = new Date(poDate).toLocaleDateString('ko-KR'); } catch(e){} }

    var deliveryDate = po.delivery_date || po.expected_date || '';
    if (deliveryDate) { try { deliveryDate = new Date(deliveryDate).toLocaleDateString('ko-KR'); } catch(e){} }

    var logoHtml = co.company_logo_base64
        ? '<img class="po-logo" src="' + co.company_logo_base64 + '" alt="로고">'
        : '';

    var stampHtml = co.company_stamp_base64
        ? '<img class="rep-stamp" src="' + co.company_stamp_base64 + '" alt="도장">'
        : '<span class="stamp-placeholder">(인)</span>';

    var managerName = po.created_by_name || '';
    var managerPhone = po.created_by_phone || '';

    return '<div class="po-sheet">'
        + '<div class="po-header">' + logoHtml + '<div class="po-title">발  주  서</div></div>'
        + '<div class="po-subtitle">발주번호: ' + (po.po_number || po.order_number || '') + '</div>'

        + '<div class="info-grid">'
        + '  <div class="info-box">'
        + '    <div class="box-title">발 주 자 (당사)</div>'
        + '    <div class="info-row"><div class="info-label">등록번호</div><div class="info-value">' + formatRegNumber(co.company_business_registration_number) + '</div></div>'
        + '    <div class="info-row"><div class="info-label">상호/대표</div><div class="info-value rep-row">' + (co.company_name || '') + '  <span class="rep-name">' + (co.company_representative || '') + ' ' + stampHtml + '</span></div></div>'
        + '    <div class="info-row"><div class="info-label">주소</div><div class="info-value">' + (co.company_address || '') + '</div></div>'
        + '    <div class="info-row"><div class="info-label">전화/FAX</div><div class="info-value">' + (co.company_phone || '') + ' / ' + (co.company_fax || '') + '</div></div>'
        + '    <div class="info-row"><div class="info-label">담당자</div><div class="info-value">' + managerName + (managerPhone ? '  (직통: ' + managerPhone + ')' : '') + '</div></div>'
        + '  </div>'
        + '  <div class="info-box">'
        + '    <div class="box-title">공 급 업 체</div>'
        + '    <div class="info-row"><div class="info-label">등록번호</div><div class="info-value">' + formatRegNumber(supplier.business_registration_number) + '</div></div>'
        + '    <div class="info-row"><div class="info-label">상호/대표</div><div class="info-value">' + (supplier.client_name || supplier.name || '') + '  <span class="rep-name">' + (supplier.representative || '') + ' <span class="stamp-placeholder">(인)</span></span></div></div>'
        + '    <div class="info-row"><div class="info-label">주소</div><div class="info-value">' + (supplier.address || '') + '</div></div>'
        + '    <div class="info-row"><div class="info-label">전화/FAX</div><div class="info-value">' + (supplier.phone || '') + ' / ' + (supplier.fax || '') + '</div></div>'
        + '    <div class="info-row"><div class="info-label">업태/종목</div><div class="info-value">' + (supplier.business_type || '') + (supplier.business_item ? ' / ' + supplier.business_item : '') + '</div></div>'
        + '  </div>'
        + '</div>'

        + '<div class="meta-row">'
        + '  <span>발주일자: ' + poDate + '</span>'
        + '  <span>납품요청일: ' + (deliveryDate || '-') + '</span>'
        + '  <span>납품장소: ' + (po.delivery_location || '-') + '</span>'
        + '</div>'

        + '<div class="total-korean">' + koreanAmount + ' (\u20A9' + fmt(finalAmount) + ')</div>'

        + '<table class="items-table">'
        + '<thead><tr>'
        + '<th style="width:24px">No</th>'
        + '<th style="width:32%">품목명</th>'
        + '<th style="width:6%">수량</th>'
        + '<th style="width:5%">단위</th>'
        + '<th style="width:12%">단가</th>'
        + '<th style="width:12%">공급가액</th>'
        + '<th style="width:10%">세액</th>'
        + '<th>비고</th>'
        + '</tr></thead>'
        + '<tbody>' + itemRows + '</tbody>'
        + '<tfoot><tr class="total-row">'
        + '<td colspan="5">합 계</td>'
        + '<td class="right">' + fmt(totalSupply) + '</td>'
        + '<td class="right">' + fmt(totalVat) + '</td>'
        + '<td></td>'
        + '</tr></tfoot>'
        + '</table>'

        + '<div class="footer-section"><span class="label">비고:</span>' + (po.notes || '') + '</div>'

        + '<div class="sign-section">'
        + '  <div class="sign-box">'
        + '    <div class="sign-label">검수 담당자</div>'
        + '    <div class="sign-info">'
        + '      <div>' + (co.company_name || '') + '</div>'
        + '      <div>담당: ' + managerName + '</div>'
        + (managerPhone ? '      <div>직통: ' + managerPhone + '</div>' : '')
        + '    </div>'
        + '  </div>'
        + '  <div class="sign-box">'
        + '    <div class="sign-label">공급업체 확인</div>'
        + '    <div class="sign-info">'
        + '      <div>' + (supplier.client_name || '') + '</div>'
        + '      <div>대표: ' + (supplier.representative || '') + '</div>'
        + '    </div>'
        + '  </div>'
        + '</div>'

        + '</div>';
}

async function loadInvoice() {
    try {
        var res = await axios.get('/api/purchase-orders/' + PO_ID + '/invoice');

        if (res.data.success) {
            var data = res.data.data;
            var html = buildPOSheet(data);
            document.getElementById('loadingMsg').style.display = 'none';
            document.getElementById('invoiceContent').style.display = 'block';
            document.getElementById('invoiceContent').innerHTML = html;
        } else {
            throw new Error(res.data.error || '데이터 로드 실패');
        }
    } catch (err) {
        document.getElementById('loadingMsg').style.display = 'none';
        document.getElementById('errorMsg').style.display = 'block';
        document.getElementById('errorMsg').innerHTML = '<i class="fas fa-exclamation-circle"></i> 발주서를 불러오는데 실패했습니다.<br><small>' + (err.message || '') + '</small>';
    }
}

loadInvoice();
