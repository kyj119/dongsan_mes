(function() {
    var currentPage = 1;

    loadData();

    window.loadData = loadData;
    window.openTestModal = openTestModal;
    window.closeTestModal = closeTestModal;
    window.sendTestEmail = sendTestEmail;
    window.goToPage = goToPage;

    function loadData() {
        var search = document.getElementById('filterSearch').value;
        var template = document.getElementById('filterTemplate').value;
        var status = document.getElementById('filterStatus').value;
        var dateFrom = document.getElementById('filterDateFrom').value;
        var dateTo = document.getElementById('filterDateTo').value;

        var params = new URLSearchParams({ page: currentPage, limit: 30 });
        if (search) params.set('search', search);
        if (template) params.set('template', template);
        if (status) params.set('status', status);
        if (dateFrom) params.set('date_from', dateFrom);
        if (dateTo) params.set('date_to', dateTo);

        axios.get('/api/emails/logs?' + params.toString())
            .then(function(res) {
                if (res.data.success) {
                    renderTable(res.data.data);
                    renderPagination(res.data.pagination);
                    renderStats(res.data.data);
                }
            })
            .catch(function() { showToast('데이터 로드 실패', 'error'); });
    }

    function renderTable(items) {
        var body = document.getElementById('dataBody');
        if (!items || items.length === 0) {
            body.innerHTML = '<tr><td colspan="6" class="px-4 py-8 text-center text-gray-400">발송 이력이 없습니다.</td></tr>';
            return;
        }

        body.innerHTML = items.map(function(item) {
            var templateLabel = getTemplateLabel(item.template);
            var statusBadge = item.status === 'SENT'
                ? '<span class="px-2 py-1 bg-green-50 text-green-700 rounded text-xs">성공</span>'
                : '<span class="px-2 py-1 bg-red-50 text-red-700 rounded text-xs" title="' + (item.error_message || '') + '">실패</span>';
            var dt = item.created_at ? item.created_at.replace('T', ' ').substring(0, 16) : '-';

            return '<tr class="border-b hover:bg-gray-50">' +
                '<td class="px-4 py-3 text-gray-500 text-xs">' + dt + '</td>' +
                '<td class="px-4 py-3"><span class="px-2 py-1 bg-blue-50 text-blue-700 rounded text-xs">' + templateLabel + '</span></td>' +
                '<td class="px-4 py-3">' + (item.recipient_name ? item.recipient_name + '<br>' : '') + '<span class="text-gray-500 text-xs">' + item.recipient_email + '</span></td>' +
                '<td class="px-4 py-3 max-w-xs truncate">' + item.subject + '</td>' +
                '<td class="px-4 py-3 text-center">' + statusBadge + '</td>' +
                '<td class="px-4 py-3 text-gray-500 text-xs">' + (item.sent_by_name || '-') + '</td>' +
            '</tr>';
        }).join('');
    }

    function getTemplateLabel(template) {
        var labels = {
            'SHIPMENT_NOTICE': '출고 알림',
            'INVOICE_ISSUED': '세금계산서',
            'TEST': '테스트',
            'MANUAL': '수동'
        };
        return labels[template] || template;
    }

    function renderStats(items) {
        var total = items.length;
        var sent = items.filter(function(i) { return i.status === 'SENT'; }).length;
        var failed = total - sent;

        document.getElementById('statsArea').innerHTML =
            '<div class="bg-white rounded-lg shadow p-4 text-center"><div class="text-2xl font-bold text-blue-600">' + total + '</div><div class="text-xs text-gray-500">전체</div></div>' +
            '<div class="bg-white rounded-lg shadow p-4 text-center"><div class="text-2xl font-bold text-green-600">' + sent + '</div><div class="text-xs text-gray-500">성공</div></div>' +
            '<div class="bg-white rounded-lg shadow p-4 text-center"><div class="text-2xl font-bold text-red-600">' + failed + '</div><div class="text-xs text-gray-500">실패</div></div>';
    }

    function renderPagination(pg) {
        if (!pg || pg.total_pages <= 1) {
            document.getElementById('pagination').innerHTML = '';
            return;
        }
        var html = '';
        for (var i = 1; i <= pg.total_pages; i++) {
            var cls = i === pg.page ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-100';
            html += '<button onclick="goToPage(' + i + ')" class="px-3 py-1 mx-1 rounded text-sm ' + cls + '">' + i + '</button>';
        }
        document.getElementById('pagination').innerHTML = html;
    }

    function goToPage(p) {
        currentPage = p;
        loadData();
    }

    function openTestModal() {
        document.getElementById('testModal').classList.remove('hidden');
    }

    function closeTestModal() {
        document.getElementById('testModal').classList.add('hidden');
    }

    function sendTestEmail() {
        var email = document.getElementById('testEmail').value.trim();
        if (!email) { showToast('이메일 주소를 입력하세요.', 'warning'); return; }

        axios.post('/api/emails/test', { to: email })
            .then(function(res) {
                if (res.data.success) {
                    showToast('테스트 이메일 발송 완료', 'success');
                    closeTestModal();
                    loadData();
                } else {
                    showToast(res.data.error || '발송 실패', 'error');
                }
            })
            .catch(function(err) {
                showToast(err.response?.data?.error || '발송 실패', 'error');
            });
    }
})();
