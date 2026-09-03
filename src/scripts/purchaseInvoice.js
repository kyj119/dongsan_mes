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
    // ⚠️ '천' 이다. '청' 오타가 있으면 매입계산서 인쇄본에 '삼백이십오만사청원정' 이 찍힌다.
    //    같은 함수 사본이 invoice.js·quotation.js 에 있다 — 고칠 때 셋 다 본다.
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

// 이 페이지는 독립 HTML(shell/layout 전역 미로드) → formatKST·escapeHtml 폴백 정의 (없으면 렌더 전체 실패)
function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function(c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
}
function formatKSTDate(s) {
    if (!s) return '';
    if (typeof formatKST === 'function') return formatKST(s, 'date');
    return String(s).replace('T', ' ').slice(0, 10); // 날짜(YYYY-MM-DD)는 슬라이스로 충분
}

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
        // 규격(원단 폭 등)=품목마스터 파생: 저장 specification 우선, 없으면 폭(width_mm→cm), 그래도 없으면 구 width/height
        var spec = it.item_specification || (it.item_width_mm ? (it.item_width_mm / 10).toFixed(0) + 'cm' : '');
        if (!spec && it.width && it.height) spec = it.width + 'x' + it.height + 'cm';
        var itemName = (it.item_name || it.name || '') + (spec ? ' [' + spec + ']' : '');
        itemRows += '<tr>'
            + '<td>' + (i+1) + '</td>'
            + '<td class="left">' + escapeHtml(itemName) + '</td>'
            + '<td>' + qty + '</td>'
            + '<td>' + escapeHtml(it.unit || 'EA') + '</td>'
            + '<td class="right">' + fmt(unitPrice) + '</td>'
            + '<td class="right">' + fmt(supply) + '</td>'
            + '<td class="right">' + fmt(vat) + '</td>'
            + '<td class="left" style="font-size:9px">' + escapeHtml(it.notes || it.content || '') + '</td>'
            + '</tr>';
    }

    for (var j = items.length; j < MIN_ROWS; j++) {
        itemRows += '<tr class="empty-row"><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>';
    }

    var finalAmount = po.total_amount || po.final_amount || (totalSupply + totalVat);
    var koreanAmount = '일금 ' + numberToKorean(finalAmount) + '원정';

    var poDate = po.order_date || po.created_at || '';
    if (poDate) { poDate = formatKSTDate(poDate); }

    var deliveryDate = po.delivery_date || po.expected_date || '';
    if (deliveryDate) { deliveryDate = formatKSTDate(deliveryDate); }

    var logoHtml = co.company_logo_base64
        ? '<img class="po-logo" src="' + co.company_logo_base64 + '" alt="로고">'
        : '';

    var stampHtml = co.company_stamp_base64
        ? '<img class="rep-stamp" src="' + co.company_stamp_base64 + '" alt="도장">'
        : '<span class="stamp-placeholder">(인)</span>';

    // 아래 두 값은 여러 곳에 삽입되므로 대입 시점에 한 번만 이스케이프한다.
    var managerName = escapeHtml(po.created_by_name || '');
    var managerPhone = escapeHtml(po.created_by_phone || '');

    return '<div class="po-sheet">'
        + '<div class="po-header">' + logoHtml + '<div class="po-title">발   주   서</div></div>'
        + '<div class="po-subtitle">발주번호: ' + escapeHtml(po.po_number || po.order_number || '') + '</div>'

        + '<div class="info-grid">'
        + '  <div class="info-box">'
        + '    <div class="box-title">발 주 자 (당사)</div>'
        + '    <div class="info-row"><div class="info-label">등록번호</div><div class="info-value">' + formatRegNumber(co.company_business_registration_number) + '</div></div>'
        + '    <div class="info-row"><div class="info-label">상호/대표</div><div class="info-value rep-row">' + escapeHtml(co.company_name || '') + '  <span class="rep-name">' + escapeHtml(co.company_representative || '') + ' ' + stampHtml + '</span></div></div>'
        + '    <div class="info-row"><div class="info-label">주소</div><div class="info-value">' + escapeHtml(co.company_address || '') + '</div></div>'
        + '    <div class="info-row"><div class="info-label">전화/FAX</div><div class="info-value">' + escapeHtml(co.company_phone || '') + ' / ' + escapeHtml(co.company_fax || '') + '</div></div>'
        + '    <div class="info-row"><div class="info-label">담당자</div><div class="info-value">' + managerName + (managerPhone ? '  (직통: ' + managerPhone + ')' : '') + '</div></div>'
        + '  </div>'
        + '  <div class="info-box">'
        + '    <div class="box-title">공 급 업 체</div>'
        + '    <div class="info-row"><div class="info-label">등록번호</div><div class="info-value">' + formatRegNumber(supplier.business_registration_number) + '</div></div>'
        + '    <div class="info-row"><div class="info-label">상호/대표</div><div class="info-value">' + escapeHtml(supplier.client_name || supplier.name || '') + '  <span class="rep-name">' + escapeHtml(supplier.representative || '') + ' <span class="stamp-placeholder">(인)</span></span></div></div>'
        + '    <div class="info-row"><div class="info-label">주소</div><div class="info-value">' + escapeHtml(supplier.address || '') + '</div></div>'
        + '    <div class="info-row"><div class="info-label">전화/FAX</div><div class="info-value">' + escapeHtml(supplier.phone || '') + ' / ' + escapeHtml(supplier.fax || '') + '</div></div>'
        + '    <div class="info-row"><div class="info-label">업태/종목</div><div class="info-value">' + escapeHtml(supplier.business_type || '') + (supplier.business_item ? ' / ' + escapeHtml(supplier.business_item) : '') + '</div></div>'
        + '  </div>'
        + '</div>'

        + '<div class="meta-row">'
        + '  <span>발주일자: ' + poDate + '</span>'
        + '  <span>낙품요청일: ' + (deliveryDate || '-') + '</span>'
        + '  <span>납품장소: ' + escapeHtml(po.delivery_location || '-') + '</span>'
        + '</div>'

        + '<div class="total-korean">' + koreanAmount + ' (₩' + fmt(finalAmount) + ')</div>'

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

        + '<div class="footer-section"><span class="label">비고:</span>' + escapeHtml(po.notes || '') + '</div>'

        + '<div class="sign-section">'
        + '  <div class="sign-box">'
        + '    <div class="sign-label">검수 담당자</div>'
        + '    <div class="sign-info">'
        + '      <div>' + escapeHtml(co.company_name || '') + '</div>'
        + '      <div>담당: ' + managerName + '</div>'
        + (managerPhone ? '      <div>직통: ' + managerPhone + '</div>' : '')
        + '    </div>'
        + '  </div>'
        + '  <div class="sign-box">'
        + '    <div class="sign-label">공급업체 확인</div>'
        + '    <div class="sign-info">'
        + '      <div>' + escapeHtml(supplier.client_name || '') + '</div>'
        + '      <div>대표: ' + escapeHtml(supplier.representative || '') + '</div>'
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
        document.getElementById('errorMsg').innerHTML = '<i class="fas fa-exclamation-circle"></i> 발주서를 불러오는데 실패했습니다.<br><small>' + escapeHtml(err.message || '') + '</small>';
    }
}

loadInvoice();