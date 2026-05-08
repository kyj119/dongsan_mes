// ============================================================
// 이카운트 → dongsan_mes 데이터 이관 스크립트
// ============================================================

let currentImportType = null;
let parsedData = [];
let currentVerifyType = null;
let migrationEntityId = parseInt(localStorage.getItem('entityId') || '1');

// 법인 선택 드롭다운 초기화
(function initMigrationEntitySelect() {
  axios.get('/api/auth/entities').then(function(res) {
    if (!res.data.success) return;
    var sel = document.getElementById('migrationEntitySelect');
    if (!sel) return;
    var html = '';
    (res.data.data || []).forEach(function(e) {
      html += '<option value="' + e.id + '"' + (e.id === migrationEntityId ? ' selected' : '') + '>' + e.short_name + '</option>';
    });
    sel.innerHTML = html;
  }).catch(function() {});
})();

window.onMigrationEntityChange = function() {
  var sel = document.getElementById('migrationEntitySelect');
  if (sel) migrationEntityId = parseInt(sel.value) || 1;
  // 힌트 업데이트
  var hint = document.getElementById('migrationEntityHint');
  if (hint) {
    if (currentImportType === 'clients' || currentImportType === 'items') {
      hint.textContent = '거래처/품목은 공유 데이터로 법인 무관';
    } else {
      hint.textContent = '선택한 법인으로 이관됩니다';
    }
  }
};

// Papa Parse + SheetJS CDN 로드
(function loadLibs() {
  if (!window.Papa) {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/PapaParse/5.4.1/papaparse.min.js';
    document.head.appendChild(s);
  }
  if (!window.XLSX) {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
    document.head.appendChild(s);
  }
})();

// 이카운트 CSV 헤더 매핑 정의
const HEADER_MAPS = {
  clients: {
    label: '거래처',
    fields: [
      { ecount: '거래처코드', aliases: ['거래처코드'], system: 'client_code', required: true },
      { ecount: '거래처명', aliases: ['거래처명'], system: 'client_name', required: true },
      { ecount: '대표자명', aliases: ['대표자명', '대표자'], system: 'representative' },
      { ecount: '사업자번호', aliases: ['사업자번호'], system: 'business_registration_number' },
      { ecount: '업태', aliases: ['업태'], system: 'business_type' },
      { ecount: '종목', aliases: ['종목'], system: 'business_item' },
      { ecount: '전화', aliases: ['전화', '전화번호'], system: 'phone' },
      { ecount: '모바일', aliases: ['모바일', '휴대폰', '핸드폰'], system: 'mobile' },
      { ecount: 'Fax', aliases: ['Fax', '팩스', 'FAX'], system: 'fax' },
      { ecount: 'Email', aliases: ['Email', '이메일', 'email', 'E-mail'], system: 'email' },
      { ecount: '주소1', aliases: ['주소1', '주소', '주소(1)'], system: 'address' },
      { ecount: '검색창내용', aliases: ['검색창내용', '검색어'], system: 'search_keywords' },
      { ecount: '이체정보', aliases: ['이체정보'], system: 'transfer_info' },
      { ecount: '여신한도', aliases: ['여신한도', '여신', 'credit_limit'], system: 'credit_limit' },
    ]
  },
  items: {
    label: '품목',
    fields: [
      { ecount: '품목코드', system: 'item_code', required: true },
      { ecount: '품목명', system: 'item_name', required: true },
      { ecount: '규격', system: 'specification' },
      { ecount: '단위', system: 'unit' },
      { ecount: '단가', system: 'unit_price' },
      { ecount: '품목분류', system: 'category_name' },
    ]
  },
  orders: {
    label: '주문 이력',
    fields: [
      { ecount: '주문번호', system: 'order_number', required: true },
      { ecount: '거래처코드', system: 'client_code', required: true },
      { ecount: '주문일', system: 'order_date' },
      { ecount: '납기일', system: 'delivery_date' },
      { ecount: '금액', system: 'final_amount' },
      { ecount: '청구금액', system: 'billed_amount' },
      { ecount: '청구상태', system: 'billing_status' },
      { ecount: '상태', system: 'status' },
      { ecount: '비고', system: 'notes' },
    ]
  },
  payments: {
    label: '입금 이력',
    fields: [
      { ecount: '거래처코드', system: 'client_code', required: true },
      { ecount: '입금일', system: 'payment_date' },
      { ecount: '금액', system: 'amount', required: true },
      { ecount: '입금방법', system: 'payment_method' },
      { ecount: '참조번호', system: 'reference_number' },
      { ecount: '비고', system: 'notes' },
    ]
  },
  tax_invoices: {
    label: '세금계산서',
    fields: [
      { ecount: '승인번호', system: 'nts_approval_number' },
      { ecount: '거래처코드', system: 'client_code', required: true },
      { ecount: '발행일', system: 'issue_date' },
      { ecount: '공급가액', system: 'supply_amount', required: true },
      { ecount: '세액', system: 'tax_amount' },
      { ecount: '합계', system: 'total_amount' },
    ]
  },
  opening_balances: {
    label: '기초잔액',
    fields: [
      { ecount: '거래처코드', system: 'client_code', required: true },
      { ecount: '잔액', system: 'opening_balance', required: true },
    ]
  },
};

// 헤더 자동 매칭 (이카운트 CSV 헤더 → 시스템 필드)
let headerMapping = {};

function autoMapHeaders(csvHeaders, type) {
  const map = HEADER_MAPS[type];
  if (!map) return {};
  headerMapping = {};
  // BOM 제거 (UTF-8 BOM이 헤더에 붙는 경우)
  const cleanHeaders = csvHeaders.map(h => h.replace(/^\uFEFF/, '').trim());

  for (const field of map.fields) {
    const aliases = field.aliases || [field.ecount];
    let matchIdx = -1;

    // 1순위: aliases 정확 매칭
    for (const alias of aliases) {
      matchIdx = cleanHeaders.findIndex(h => h === alias);
      if (matchIdx >= 0) break;
    }
    // 2순위: aliases 부분 매칭
    if (matchIdx === -1) {
      for (const alias of aliases) {
        matchIdx = cleanHeaders.findIndex(h => h.includes(alias) || alias.includes(h));
        if (matchIdx >= 0) break;
      }
    }
    headerMapping[field.system] = matchIdx >= 0 ? csvHeaders[matchIdx] : '';
  }
  return headerMapping;
}

// ============================================================
// 탭 전환
// ============================================================
window.switchMigTab = function(tab) {
  const tabs = ['import', 'verify', 'status'];
  tabs.forEach(t => {
    const tabBtn = document.getElementById('tab' + t.charAt(0).toUpperCase() + t.slice(1));
    const content = document.getElementById(t + 'Content');
    if (t === tab) {
      tabBtn.classList.remove('border-transparent', 'text-gray-500');
      tabBtn.classList.add('border-blue-600', 'text-blue-600');
      content.classList.remove('hidden');
    } else {
      tabBtn.classList.add('border-transparent', 'text-gray-500');
      tabBtn.classList.remove('border-blue-600', 'text-blue-600');
      content.classList.add('hidden');
    }
  });

  if (tab === 'status') loadStatusReport();
  if (tab === 'import') loadMigrationLogs();
};

// ============================================================
// 이관 유형 선택
// ============================================================
window.selectImportType = function(type) {
  currentImportType = type;
  parsedData = [];

  // 버튼 활성화 표시
  document.querySelectorAll('.import-type-btn').forEach(btn => {
    if (btn.dataset.type === type) {
      btn.classList.add('border-blue-500', 'bg-blue-50');
    } else {
      btn.classList.remove('border-blue-500', 'bg-blue-50');
    }
  });

  // 매핑 테이블 표시
  const map = HEADER_MAPS[type];
  if (map) {
    document.getElementById('mappingTitle').textContent = map.label + ' CSV 헤더 매핑';
    document.getElementById('mappingDesc').textContent = '이카운트 CSV 헤더명과 시스템 필드를 매칭합니다';
    renderMappingTable(type, []);
    document.getElementById('mappingSection').classList.remove('hidden');
  }

  // 업로드 영역 표시
  document.getElementById('uploadSection').classList.remove('hidden');
  document.getElementById('previewSection').classList.add('hidden');
  document.getElementById('progressSection').classList.add('hidden');
  document.getElementById('resultSection').classList.add('hidden');
  document.getElementById('fileInfo').classList.add('hidden');
};

function renderMappingTable(type, csvHeaders) {
  const map = HEADER_MAPS[type];
  if (!map) return;

  const html = `<table class="w-full text-xs">
    <thead><tr class="bg-gray-50">
      <th class="px-2 py-1.5 text-left text-gray-600 font-semibold">시스템 필드</th>
      <th class="px-2 py-1.5 text-left text-gray-600 font-semibold">이카운트 헤더 (기본)</th>
      <th class="px-2 py-1.5 text-left text-gray-600 font-semibold">CSV 매칭</th>
      <th class="px-2 py-1.5 text-center text-gray-600 font-semibold">필수</th>
    </tr></thead>
    <tbody>${map.fields.map(f => {
      const mapped = headerMapping[f.system] || '';
      const options = csvHeaders.length > 0
        ? `<select data-field="${f.system}" onchange="updateMapping(this)" class="border rounded px-1.5 py-0.5 text-xs w-full">
            <option value="">-- 선택 --</option>
            ${csvHeaders.map(h => `<option value="${h}" ${mapped === h ? 'selected' : ''}>${h}</option>`).join('')}
           </select>`
        : `<span class="text-gray-400">CSV 업로드 후 표시</span>`;

      return `<tr class="border-b border-gray-100">
        <td class="px-2 py-1.5 font-medium" style="color:#212529;">${f.system}</td>
        <td class="px-2 py-1.5 text-gray-500">${f.ecount}</td>
        <td class="px-2 py-1.5">${options}</td>
        <td class="px-2 py-1.5 text-center">${f.required ? '<span class="text-red-500">*</span>' : ''}</td>
      </tr>`;
    }).join('')}</tbody>
  </table>`;
  document.getElementById('mappingTable').innerHTML = html;
}

window.updateMapping = function(select) {
  headerMapping[select.dataset.field] = select.value;
};

// ============================================================
// CSV 파일 업로드 & 파싱
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  setupDropZone('dropZone', 'csvFileInput', handleImportFile);
  setupDropZone('verifyDropZone', 'verifyCsvInput', handleVerifyFile);
  loadMigrationLogs();
});

function setupDropZone(zoneId, inputId, handler) {
  const zone = document.getElementById(zoneId);
  const input = document.getElementById(inputId);
  if (!zone || !input) return;

  zone.addEventListener('click', () => input.click());
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('border-blue-400', 'bg-blue-50'); });
  zone.addEventListener('dragleave', () => { zone.classList.remove('border-blue-400', 'bg-blue-50'); });
  zone.addEventListener('drop', e => {
    e.preventDefault();
    zone.classList.remove('border-blue-400', 'bg-blue-50');
    if (e.dataTransfer.files.length) handler(e.dataTransfer.files[0]);
  });
  input.addEventListener('change', e => { if (e.target.files.length) handler(e.target.files[0]); });
}

function handleImportFile(file) {
  if (!currentImportType) {
    showToast('이관 유형을 먼저 선택하세요.', 'warning');
    return;
  }

  document.getElementById('fileName').textContent = file.name;
  document.getElementById('fileInfo').classList.remove('hidden');

  const isExcel = /\.xlsx?$/i.test(file.name);

  if (isExcel) {
    // xlsx/xls 파일 → SheetJS로 파싱
    const reader = new FileReader();
    reader.onload = function(e) {
      if (!window.XLSX) {
        showToast('SheetJS 라이브러리 로딩 중입니다. 잠시 후 다시 시도하세요.', 'warning');
        return;
      }
      const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
      processImportData(rows);
    };
    reader.readAsArrayBuffer(file);
  } else {
    // csv 파일 → Papa Parse로 파싱
    const reader = new FileReader();
    reader.onload = function(e) {
      if (!window.Papa) {
        showToast('Papa Parse 라이브러리 로딩 중입니다. 잠시 후 다시 시도하세요.', 'warning');
        return;
      }
      const result = Papa.parse(e.target.result, { header: true, skipEmptyLines: true });
      if (result.errors.length > 0) {
        console.warn('CSV parse warnings:', result.errors.slice(0, 5));
      }
      processImportData(result.data);
    };
    const encoding = document.getElementById('encodingSelect')?.value || 'EUC-KR';
    reader.readAsText(file, encoding);
  }
}

function processImportData(rows) {
  if (!rows || rows.length === 0) {
    showToast('데이터가 없습니다.', 'warning');
    return;
  }

  const csvHeaders = Object.keys(rows[0]);
  autoMapHeaders(csvHeaders, currentImportType);
  renderMappingTable(currentImportType, csvHeaders);

  // 매핑 적용하여 데이터 변환
  parsedData = rows.map(row => {
    const mapped = {};
    for (const [sysField, csvHeader] of Object.entries(headerMapping)) {
      if (csvHeader && row[csvHeader] !== undefined) {
        let val = row[csvHeader];
        // 금액 필드 숫자 변환
        if (['final_amount', 'billed_amount', 'amount', 'unit_price', 'opening_balance', 'supply_amount', 'tax_amount', 'total_amount'].includes(sysField)) {
          val = parseFloat(String(val).replace(/,/g, '')) || 0;
        }
        mapped[sysField] = val;
      }
    }
    // 거래처: client_code를 항상 business_registration_number에도 저장 (이카운트는 거래처코드 = 사업자번호)
    if (currentImportType === 'clients' && mapped.client_code && !mapped.business_registration_number) {
      mapped.business_registration_number = String(mapped.client_code);
    }
    // 사용구분: YES → is_active = 1, NO → 0
    if (currentImportType === 'clients') {
      const useFlag = row['사용구분'] || row['사용여부'] || '';
      if (useFlag === 'NO' || useFlag === 'N') mapped.is_active = 0;
    }
    return mapped;
  });

  document.getElementById('fileRows').textContent = `(${parsedData.length}건)`;
  requestPreview();
}

async function requestPreview() {
  if (!parsedData.length) return;

  const previewSection = document.getElementById('previewSection');
  previewSection.classList.remove('hidden');

  const keyMap = {
    clients: 'clients', items: 'items', orders: 'orders',
    payments: 'payments', opening_balances: 'balances',
  };
  const dataKey = keyMap[currentImportType] || currentImportType;

  try {
    // opening_balances는 preview API 없음
    if (currentImportType === 'opening_balances') {
      renderPreviewTable(parsedData.slice(0, 100), currentImportType);
      document.getElementById('previewStats').textContent = `총 ${parsedData.length}건`;
      return;
    }

    const res = await axios.post(`/api/migration/${currentImportType}/preview`, {
      [dataKey]: parsedData.slice(0, 100)
    });

    if (res.data.success) {
      const d = res.data.data;
      const totalAll = parsedData.length;
      document.getElementById('previewStats').textContent =
        `전체 ${totalAll.toLocaleString()}건 (미리보기 ${d.preview_count || d.preview?.length || 0}건) | 신규 ${d.inserts || 0} | 수정 ${d.updates || 0} | 매칭실패 ${d.unmatched_clients || d.unmatched || 0}`;
      renderPreviewTable(d.preview, currentImportType);
    }
  } catch (err) {
    console.error('preview error:', err);
    document.getElementById('previewTable').innerHTML =
      `<p class="text-sm text-red-500 py-4 text-center">미리보기 실패: ${err.response?.data?.error || err.message}</p>`;
  }
}

function renderPreviewTable(data, type) {
  if (!data || !data.length) {
    document.getElementById('previewTable').innerHTML =
      '<p class="text-sm text-gray-400 text-center py-4">데이터가 없습니다.</p>';
    return;
  }

  const fields = HEADER_MAPS[type]?.fields || [];
  const fieldKeys = fields.map(f => f.system);
  const statusFields = ['_match', '_existing', '_client_match'];

  const html = `<table class="w-full text-xs">
    <thead><tr class="bg-gray-50 sticky top-0">
      <th class="px-2 py-1.5 text-left text-gray-600 font-semibold">#</th>
      ${fieldKeys.map(k => `<th class="px-2 py-1.5 text-left text-gray-600 font-semibold">${k}</th>`).join('')}
      <th class="px-2 py-1.5 text-center text-gray-600 font-semibold">상태</th>
    </tr></thead>
    <tbody>${data.slice(0, 50).map((row, i) => {
      const matchStatus = row._match || row._existing || (row._client_match ? 'MATCHED' : 'UNMATCHED');
      const badgeClass = matchStatus === 'INSERT' || matchStatus === 'MATCHED'
        ? 'bg-green-50 text-green-700' : matchStatus === 'UPDATE'
        ? 'bg-blue-50 text-blue-700' : matchStatus === 'SKIP'
        ? 'bg-gray-100 text-gray-600' : 'bg-amber-50 text-amber-700';
      const badgeIcon = matchStatus === 'INSERT' ? 'fa-plus' : matchStatus === 'UPDATE' ? 'fa-pen' :
        matchStatus === 'SKIP' ? 'fa-forward' : matchStatus === 'MATCHED' ? 'fa-check' : 'fa-question';

      return `<tr class="border-b border-gray-100 hover:bg-blue-50/30">
        <td class="px-2 py-1 text-gray-400">${i + 1}</td>
        ${fieldKeys.map(k => `<td class="px-2 py-1" style="color:#212529;max-width:150px;" class="truncate">${row[k] ?? ''}</td>`).join('')}
        <td class="px-2 py-1 text-center">
          <span class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${badgeClass}">
            <i class="fas ${badgeIcon} text-[7px] mr-0.5"></i>${matchStatus}
          </span>
        </td>
      </tr>`;
    }).join('')}</tbody>
  </table>`;
  document.getElementById('previewTable').innerHTML = html;
}

// ============================================================
// 이관 실행
// ============================================================
window.executeImport = async function() {
  if (!parsedData.length || !currentImportType) return;

  const confirmed = await showConfirm(`${HEADER_MAPS[currentImportType]?.label || currentImportType} ${parsedData.length}건을 가져오시겠습니까?`);
  if (!confirmed) return;

  const progressSection = document.getElementById('progressSection');
  const resultSection = document.getElementById('resultSection');
  progressSection.classList.remove('hidden');
  resultSection.classList.add('hidden');
  document.getElementById('importBtn').disabled = true;

  const CHUNK_SIZE = 500;
  const chunks = [];
  for (let i = 0; i < parsedData.length; i += CHUNK_SIZE) {
    chunks.push(parsedData.slice(i, i + CHUNK_SIZE));
  }

  const keyMap = {
    clients: 'clients', items: 'items', orders: 'orders',
    payments: 'payments', opening_balances: 'balances',
  };
  const dataKey = keyMap[currentImportType] || currentImportType;

  let totalImported = 0, totalSkipped = 0, totalErrors = 0;
  const allErrorDetails = [];

  for (let i = 0; i < chunks.length; i++) {
    const pct = Math.round(((i + 1) / chunks.length) * 100);
    document.getElementById('progressBar').style.width = pct + '%';
    document.getElementById('progressPercent').textContent = pct + '%';
    document.getElementById('progressText').textContent = `청크 ${i + 1}/${chunks.length} 처리 중... (${CHUNK_SIZE * i + chunks[i].length}/${parsedData.length}건)`;

    try {
      const endpoint = currentImportType === 'opening_balances' ? '/api/migration/opening-balances' : `/api/migration/${currentImportType}/import`;
      const res = await axios.post(endpoint, { [dataKey]: chunks[i], entity_id: migrationEntityId });
      if (res.data.success) {
        totalImported += res.data.data.imported;
        totalSkipped += res.data.data.skipped || 0;
        totalErrors += res.data.data.errors || 0;
        if (res.data.data.error_details) allErrorDetails.push(...res.data.data.error_details);
      }
    } catch (err) {
      totalErrors += chunks[i].length;
      allErrorDetails.push(`청크 ${i + 1} 전체 실패: ${err.response?.data?.error || err.message}`);
    }
  }

  // 결과 표시
  resultSection.classList.remove('hidden');
  document.getElementById('importBtn').disabled = false;
  document.getElementById('resultContent').innerHTML = `
    <div class="grid grid-cols-3 gap-2 mb-3">
      <div class="bg-green-50 rounded-lg p-2.5 text-center">
        <div class="text-lg font-bold text-green-700" style="font-variant-numeric:tabular-nums;">${totalImported}</div>
        <div class="text-[10px] text-green-600">성공</div>
      </div>
      <div class="bg-gray-100 rounded-lg p-2.5 text-center">
        <div class="text-lg font-bold text-gray-600" style="font-variant-numeric:tabular-nums;">${totalSkipped}</div>
        <div class="text-[10px] text-gray-500">건너뜀</div>
      </div>
      <div class="${totalErrors > 0 ? 'bg-red-50 border border-red-200' : 'bg-gray-100'} rounded-lg p-2.5 text-center">
        <div class="text-lg font-bold ${totalErrors > 0 ? 'text-red-600' : 'text-gray-600'}" style="font-variant-numeric:tabular-nums;">${totalErrors}</div>
        <div class="text-[10px] ${totalErrors > 0 ? 'text-red-500' : 'text-gray-500'}">오류</div>
      </div>
    </div>
    ${allErrorDetails.length > 0 ? `
      <details class="text-xs text-gray-600">
        <summary class="cursor-pointer text-red-600 font-medium">오류 상세 (${allErrorDetails.length}건)</summary>
        <ul class="mt-1 space-y-0.5 max-h-40 overflow-y-auto">${allErrorDetails.map(e => `<li class="text-red-500">${e}</li>`).join('')}</ul>
      </details>
    ` : ''}
  `;

  loadMigrationLogs();
};

// ============================================================
// 이관 이력 로드
// ============================================================
async function loadMigrationLogs() {
  try {
    const res = await axios.get('/api/migration/logs');
    if (!res.data.success) return;

    const logs = res.data.data;
    if (!logs.length) {
      document.getElementById('migrationLogs').innerHTML =
        '<p class="text-sm text-gray-400 text-center py-4"><i class="fas fa-inbox text-lg block mb-1"></i>이관 이력이 없습니다.</p>';
      return;
    }

    const typeLabels = { clients: '거래처', items: '품목', orders: '주문', payments: '입금', tax_invoices: '세금계산서', opening_balances: '기초잔액' };
    const statusBadge = (s) => {
      if (s === 'COMPLETED') return '<span class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-50 text-green-700"><i class="fas fa-check-circle text-[7px] mr-0.5"></i>완료</span>';
      if (s === 'RUNNING') return '<span class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-700"><i class="fas fa-spinner text-[7px] mr-0.5"></i>진행중</span>';
      if (s === 'FAILED') return '<span class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-50 text-red-700"><i class="fas fa-exclamation-triangle text-[7px] mr-0.5"></i>실패</span>';
      return '<span class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-600"><i class="far fa-clock text-[7px] mr-0.5"></i>대기</span>';
    };

    document.getElementById('migrationLogs').innerHTML = `
      <table class="w-full text-xs">
        <thead><tr class="bg-gray-50">
          <th class="px-2 py-1.5 text-left text-gray-600 font-semibold">유형</th>
          <th class="px-2 py-1.5 text-center text-gray-600 font-semibold">상태</th>
          <th class="px-2 py-1.5 text-right text-gray-600 font-semibold">전체</th>
          <th class="px-2 py-1.5 text-right text-gray-600 font-semibold">성공</th>
          <th class="px-2 py-1.5 text-right text-gray-600 font-semibold">건너뜀</th>
          <th class="px-2 py-1.5 text-right text-gray-600 font-semibold">오류</th>
          <th class="px-2 py-1.5 text-left text-gray-600 font-semibold">시간</th>
        </tr></thead>
        <tbody>${logs.map(l => `
          <tr class="border-b border-gray-100 hover:bg-blue-50/30">
            <td class="px-2 py-1.5 font-medium" style="color:#212529;">${typeLabels[l.migration_type] || l.migration_type}</td>
            <td class="px-2 py-1.5 text-center">${statusBadge(l.status)}</td>
            <td class="px-2 py-1.5 text-right" style="font-variant-numeric:tabular-nums;">${(l.total_rows || 0).toLocaleString()}</td>
            <td class="px-2 py-1.5 text-right text-green-600" style="font-variant-numeric:tabular-nums;">${(l.imported_rows || 0).toLocaleString()}</td>
            <td class="px-2 py-1.5 text-right text-gray-400" style="font-variant-numeric:tabular-nums;">${(l.skipped_rows || 0).toLocaleString()}</td>
            <td class="px-2 py-1.5 text-right ${l.error_rows > 0 ? 'text-red-600 font-medium' : 'text-gray-400'}" style="font-variant-numeric:tabular-nums;">${(l.error_rows || 0).toLocaleString()}</td>
            <td class="px-2 py-1.5 text-gray-400">${l.completed_at ? new Date(l.completed_at).toLocaleString('ko') : '-'}</td>
          </tr>`).join('')}
        </tbody>
      </table>`;
  } catch (err) {
    console.error('load logs error:', err);
  }
}

// ============================================================
// 대사 검증
// ============================================================
window.selectVerifyType = function(type) {
  currentVerifyType = type;
  document.querySelectorAll('.verify-type-btn').forEach(btn => {
    btn.classList.remove('border-blue-500', 'bg-blue-50');
  });
  event.currentTarget.classList.add('border-blue-500', 'bg-blue-50');

  const labels = { clients: '거래처 대사용 CSV', balances: '거래처별 잔액 CSV', orders: '일별 주문 CSV' };
  document.getElementById('verifyUploadTitle').textContent = labels[type] || 'CSV 업로드';
  document.getElementById('verifyUploadSection').classList.remove('hidden');
  document.getElementById('verifyResultSection').classList.add('hidden');

  // 주문 대사는 날짜 선택 필요
  const datePicker = document.getElementById('verifyDatePicker');
  if (type === 'orders') {
    datePicker.classList.remove('hidden');
    document.getElementById('verifyDate').value = new Date().toISOString().substring(0, 10);
  } else {
    datePicker.classList.add('hidden');
  }
};

function handleVerifyFile(file) {
  if (!currentVerifyType) { showToast('검증 유형을 먼저 선택하세요.', 'warning'); return; }

  const isExcel = /\.xlsx?$/i.test(file.name);

  function processVerifyData(data) {
    // 데이터 변환 (금액 숫자 변환)
    const cleaned = data.map(row => {
      const mapped = {};
      for (const [key, val] of Object.entries(row)) {
        mapped[key] = val;
      }
      for (const numField of ['balance', 'final_amount', '잔액', '금액', '미수금']) {
        if (mapped[numField]) mapped[numField] = parseFloat(String(mapped[numField]).replace(/,/g, '')) || 0;
      }
      return mapped;
    });
    doVerify(cleaned);
  }

  if (isExcel) {
    const reader = new FileReader();
    reader.onload = function(e) {
      if (!window.XLSX) { showToast('SheetJS 로딩 중입니다.', 'warning'); return; }
      const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      processVerifyData(XLSX.utils.sheet_to_json(sheet, { defval: '' }));
    };
    reader.readAsArrayBuffer(file);
  } else {
    const reader = new FileReader();
    reader.onload = function(e) {
      if (!window.Papa) { showToast('Papa Parse 로딩 중입니다.', 'warning'); return; }
      const result = Papa.parse(e.target.result, { header: true, skipEmptyLines: true });
      processVerifyData(result.data);
    };
    const encoding = document.getElementById('verifyEncodingSelect')?.value || 'EUC-KR';
    reader.readAsText(file, encoding);
  }
}

async function doVerify(cleaned) {

    try {
      let res;
      if (currentVerifyType === 'clients') {
        // 헤더 자동 매핑
        const clients = cleaned.map(r => ({
          client_code: r['거래처코드'] || r.client_code || '',
          client_name: r['거래처명'] || r.client_name || '',
          business_registration_number: r['사업자번호'] || r.business_registration_number || '',
          phone: r['전화번호'] || r.phone || '',
        }));
        res = await axios.post('/api/migration/verify/clients', { clients });
      } else if (currentVerifyType === 'balances') {
        const balances = cleaned.map(r => ({
          client_code: r['거래처코드'] || r.client_code || '',
          client_name: r['거래처명'] || r.client_name || '',
          balance: parseFloat(r['잔액'] || r['미수금'] || r.balance || 0),
        }));
        res = await axios.post('/api/migration/verify/balances', { balances });
      } else if (currentVerifyType === 'orders') {
        const date = document.getElementById('verifyDate').value;
        const orders = cleaned.map(r => ({
          order_number: r['주문번호'] || r.order_number || '',
          client_code: r['거래처코드'] || r.client_code || '',
          client_name: r['거래처명'] || r.client_name || '',
          final_amount: parseFloat(r['금액'] || r.final_amount || 0),
        }));
        res = await axios.post('/api/migration/verify/orders', { orders, date });
      }

      if (res?.data?.success) {
        renderVerifyResult(res.data.data, currentVerifyType);
      }
    } catch (err) {
      console.error('verify error:', err);
      showToast('대사 실패: ' + (err.response?.data?.error || err.message), 'error');
    }
}

function renderVerifyResult(data, type) {
  const section = document.getElementById('verifyResultSection');
  section.classList.remove('hidden');

  if (type === 'clients') {
    document.getElementById('verifyResultSummary').textContent =
      `총 ${data.total}건 | 일치 ${data.matched} | 불일치 ${data.mismatched} | 누락 ${data.missing} | 시스템만 ${data.system_only}`;

    const statusBadge = (s) => {
      if (s === 'MATCH') return '<span class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-50 text-green-700"><i class="fas fa-check-circle text-[7px] mr-0.5"></i>일치</span>';
      if (s === 'MISMATCH') return '<span class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-50 text-amber-700"><i class="fas fa-exclamation-triangle text-[7px] mr-0.5"></i>불일치</span>';
      return '<span class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-50 text-red-700"><i class="fas fa-times-circle text-[7px] mr-0.5"></i>누락</span>';
    };

    document.getElementById('verifyResultContent').innerHTML = `
      <table class="w-full text-xs">
        <thead><tr class="bg-gray-50 sticky top-0">
          <th class="px-2 py-1.5 text-left text-gray-600 font-semibold">거래처코드</th>
          <th class="px-2 py-1.5 text-left text-gray-600 font-semibold">거래처명 (이카운트)</th>
          <th class="px-2 py-1.5 text-left text-gray-600 font-semibold">거래처명 (시스템)</th>
          <th class="px-2 py-1.5 text-center text-gray-600 font-semibold">상태</th>
          <th class="px-2 py-1.5 text-left text-gray-600 font-semibold">차이</th>
        </tr></thead>
        <tbody>${data.results.filter(r => r.status !== 'MATCH').concat(data.results.filter(r => r.status === 'MATCH')).map(r => `
          <tr class="border-b border-gray-100 hover:bg-blue-50/30">
            <td class="px-2 py-1" style="color:#212529;">${r.client_code}</td>
            <td class="px-2 py-1" style="color:#212529;">${r.client_name || ''}</td>
            <td class="px-2 py-1 text-gray-500">${r.system_name || '-'}</td>
            <td class="px-2 py-1 text-center">${statusBadge(r.status)}</td>
            <td class="px-2 py-1 text-gray-400">${r.diffs?.join(', ') || ''}</td>
          </tr>`).join('')}
        </tbody>
      </table>`;
  } else if (type === 'balances') {
    const matchIcon = data.go_no_go ? 'fa-check-circle text-green-600' : 'fa-exclamation-triangle text-amber-600';
    document.getElementById('verifyResultSummary').innerHTML =
      `<i class="fas ${matchIcon} mr-1"></i>일치율 ${data.match_rate}% | 일치 ${data.matched} | 허용범위 ${data.within_tolerance} | 불일치 ${data.mismatched} | 누락 ${data.missing}`;

    document.getElementById('verifyResultContent').innerHTML = `
      <table class="w-full text-xs">
        <thead><tr class="bg-gray-50 sticky top-0">
          <th class="px-2 py-1.5 text-left text-gray-600 font-semibold">거래처코드</th>
          <th class="px-2 py-1.5 text-left text-gray-600 font-semibold">거래처명</th>
          <th class="px-2 py-1.5 text-right text-gray-600 font-semibold">이카운트 잔액</th>
          <th class="px-2 py-1.5 text-right text-gray-600 font-semibold">시스템 잔액</th>
          <th class="px-2 py-1.5 text-right text-gray-600 font-semibold">차이</th>
          <th class="px-2 py-1.5 text-center text-gray-600 font-semibold">상태</th>
          <th class="px-2 py-1.5 text-center text-gray-600 font-semibold">조치</th>
        </tr></thead>
        <tbody>${data.results.map(r => {
          const badge = r.status === 'MATCH' ? 'bg-green-50 text-green-700' :
            r.status === 'TOLERANCE' ? 'bg-blue-50 text-blue-700' :
            r.status === 'MISSING' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700';
          const icon = r.status === 'MATCH' ? 'fa-check-circle' : r.status === 'TOLERANCE' ? 'fa-check' :
            r.status === 'MISSING' ? 'fa-times-circle' : 'fa-exclamation-triangle';

          return `<tr class="border-b border-gray-100 hover:bg-blue-50/30 ${r.status === 'MISMATCH' ? 'bg-amber-50/20' : ''}">
            <td class="px-2 py-1" style="color:#212529;">${r.client_code}</td>
            <td class="px-2 py-1" style="color:#212529;">${r.client_name || ''}</td>
            <td class="px-2 py-1 text-right" style="font-variant-numeric:tabular-nums;">${(r.ecount_balance || 0).toLocaleString()}</td>
            <td class="px-2 py-1 text-right" style="font-variant-numeric:tabular-nums;">${r.system_balance !== null ? r.system_balance.toLocaleString() : '-'}</td>
            <td class="px-2 py-1 text-right font-medium ${r.diff > 0 ? 'text-red-600' : r.diff < 0 ? 'text-blue-600' : ''}" style="font-variant-numeric:tabular-nums;">${r.diff !== null ? r.diff.toLocaleString() : '-'}</td>
            <td class="px-2 py-1 text-center"><span class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${badge}"><i class="fas ${icon} text-[7px] mr-0.5"></i>${r.status}</span></td>
            <td class="px-2 py-1 text-center">${r.client_id ? `<a href="/clients/${r.client_id}" class="text-blue-600 hover:underline text-[10px]">원장</a>` : ''}</td>
          </tr>`;
        }).join('')}
        </tbody>
      </table>`;
  } else if (type === 'orders') {
    document.getElementById('verifyResultSummary').textContent =
      `${data.date} | 이카운트 ${data.ecount_count}건 | 시스템 ${data.system_count}건 | 매칭 ${data.matched} | 이카운트만 ${data.ecount_only} | 시스템만 ${data.system_only}`;

    let html = '<div class="space-y-3">';
    if (data.ecount_only > 0) {
      html += `<div class="border border-amber-200 rounded-lg p-3">
        <h4 class="text-xs font-semibold text-amber-700 mb-2"><i class="fas fa-exclamation-triangle mr-1"></i>새 시스템에 누락 (${data.ecount_only}건)</h4>
        <table class="w-full text-xs"><thead><tr class="bg-amber-50">
          <th class="px-2 py-1 text-left text-amber-700">주문번호</th><th class="px-2 py-1 text-left text-amber-700">거래처</th><th class="px-2 py-1 text-right text-amber-700">금액</th><th class="px-2 py-1 text-center text-amber-700">조치</th>
        </tr></thead><tbody>${data.results.filter(r => r.status === 'ECOUNT_ONLY').map(r => `
          <tr class="border-b border-amber-100"><td class="px-2 py-1">${r.ecount_order_number}</td><td class="px-2 py-1">${r.ecount_client_name || r.ecount_client_code}</td>
          <td class="px-2 py-1 text-right" style="font-variant-numeric:tabular-nums;">${(r.ecount_amount || 0).toLocaleString()}</td>
          <td class="px-2 py-1 text-center"><a href="/order-form" class="text-blue-600 hover:underline text-[10px]">주문 생성</a></td></tr>
        `).join('')}</tbody></table></div>`;
    }
    if (data.system_only > 0) {
      html += `<div class="border border-blue-200 rounded-lg p-3">
        <h4 class="text-xs font-semibold text-blue-700 mb-2"><i class="fas fa-info-circle mr-1"></i>이카운트에 없음 (${data.system_only}건)</h4>
        <table class="w-full text-xs"><thead><tr class="bg-blue-50">
          <th class="px-2 py-1 text-left text-blue-700">주문번호</th><th class="px-2 py-1 text-left text-blue-700">거래처</th><th class="px-2 py-1 text-right text-blue-700">금액</th>
        </tr></thead><tbody>${data.system_only_list.map(o => `
          <tr class="border-b border-blue-100"><td class="px-2 py-1">${o.order_number}</td><td class="px-2 py-1">${o.client_name || o.client_code}</td>
          <td class="px-2 py-1 text-right" style="font-variant-numeric:tabular-nums;">${(o.final_amount || 0).toLocaleString()}</td></tr>
        `).join('')}</tbody></table></div>`;
    }
    if (data.ecount_only === 0 && data.system_only === 0) {
      html += '<div class="text-center py-6"><i class="fas fa-check-circle text-3xl text-green-400 mb-2 block"></i><p class="text-sm text-green-600 font-medium">모든 주문이 양쪽에 일치합니다</p></div>';
    }
    html += '</div>';
    document.getElementById('verifyResultContent').innerHTML = html;
  }
}

// ============================================================
// 전환 현황
// ============================================================
async function loadStatusReport() {
  try {
    const res = await axios.get('/api/migration/report/summary');
    if (!res.data.success) return;

    const d = res.data.data;
    const counts = d.current_counts || {};

    document.getElementById('statClients').textContent = (counts.clients || 0).toLocaleString();
    document.getElementById('statItems').textContent = (counts.items || 0).toLocaleString();
    document.getElementById('statOrders').textContent = (counts.orders || 0).toLocaleString();
    document.getElementById('statPayments').textContent = (counts.payments || 0).toLocaleString();

    // 이관 로그 요약
    const logs = d.migration_logs || [];
    if (logs.length > 0) {
      const typeLabels = { clients: '거래처', items: '품목', orders: '주문', payments: '입금', tax_invoices: '세금계산서', opening_balances: '기초잔액' };
      document.getElementById('statusLogSummary').innerHTML = `
        <table class="w-full text-xs">
          <thead><tr class="bg-gray-50">
            <th class="px-2 py-1.5 text-left text-gray-600 font-semibold">유형</th>
            <th class="px-2 py-1.5 text-center text-gray-600 font-semibold">상태</th>
            <th class="px-2 py-1.5 text-right text-gray-600 font-semibold">이관 건수</th>
            <th class="px-2 py-1.5 text-left text-gray-600 font-semibold">최종 완료</th>
          </tr></thead>
          <tbody>${logs.map(l => `
            <tr class="border-b border-gray-100">
              <td class="px-2 py-1.5" style="color:#212529;">${typeLabels[l.migration_type] || l.migration_type}</td>
              <td class="px-2 py-1.5 text-center"><span class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${l.status === 'COMPLETED' ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-600'}">${l.status}</span></td>
              <td class="px-2 py-1.5 text-right" style="font-variant-numeric:tabular-nums;">${(l.imported || 0).toLocaleString()}</td>
              <td class="px-2 py-1.5 text-gray-400">${l.last_completed ? new Date(l.last_completed).toLocaleString('ko') : '-'}</td>
            </tr>`).join('')}
          </tbody>
        </table>`;
    } else {
      document.getElementById('statusLogSummary').innerHTML =
        '<p class="text-sm text-gray-400 text-center py-4">아직 이관 작업이 없습니다.</p>';
    }
  } catch (err) {
    console.error('status report error:', err);
  }
}

window.recalculateAllBalances = async function() {
  if (!(await showConfirm('전체 거래처 잔액을 재계산하시겠습니까?'))) return;
  const btn = document.getElementById('recalcBtn');
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i>재계산 중...';

  try {
    const res = await axios.post('/api/migration/recalculate-all-balances');
    if (res.data.success) {
      showToast(`${res.data.data.updated}개 거래처 잔액이 재계산되었습니다.`, 'warning');
    }
  } catch (err) {
    showToast('재계산 실패: ' + (err.response?.data?.error || err.message), 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-calculator mr-1"></i>재계산 실행';
  }
};
