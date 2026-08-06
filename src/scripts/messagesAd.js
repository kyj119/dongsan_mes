// ============================================================================
// 광고 발송 탭 (/messages → 광고 발송) — ADMIN 전용
//
// ?raw concat으로 messages.js와 같은 전역 스코프에 올라간다 → 모든 식별자에 ad 접두사.
// (BULK_BASE_VARS 등 messages.js의 전역은 재사용하되 재정의하지 않는다)
// ============================================================================

var adChannel = 'lms';
var adReceivers = [];        // [{name, phone, client_id}]
var adImageB64 = null;
var adPreviewOk = false;     // 대상 확인을 통과해야 발송 버튼이 열린다

// ── 역할 게이트 (클라 = fail-open, 서버 requireRole('ADMIN') = fail-closed) ──
function adApplyRoleGate(role) {
  var tab = document.getElementById('tabAd');
  if (!tab) { console.warn('[messagesAd] #tabAd not found'); return; }
  if (role === 'ADMIN') tab.classList.remove('hidden');
}

// shell.js가 user를 뒤늦게 복구하는 경우(ds-user-restored)에도 탭이 나타나야 한다
window.addEventListener('ds-user-restored', function(e) {
  adApplyRoleGate(e && e.detail && e.detail.role);
});

/** 탭 진입 시 로드 — ADMIN 외에는 API가 401이므로 호출 자체를 하지 않는다 */
function adInit() {
  adRenderVarChips();
  adLoadGroups();
  adLoadOptOuts();
  adLoadBannedWords();
}

(function adBoot() {
  adApplyRoleGate(typeof currentUserRole !== 'undefined' ? currentUserRole : null);
})();

// ── 채널 ──
function adSetChannel(ch) {
  adChannel = ch;
  [['lms', 'adChLms'], ['mms', 'adChMms']].forEach(function(pair) {
    var btn = document.getElementById(pair[1]);
    if (!btn) return;
    btn.className = (pair[0] === ch)
      ? 'px-4 py-2 rounded-full text-sm font-medium bg-blue-50 border-2 border-blue-500 text-blue-700'
      : 'px-4 py-2 rounded-full text-sm font-medium bg-white border border-gray-300 text-gray-600 hover:border-gray-400';
  });
  var imgArea = document.getElementById('adImageArea');
  if (imgArea) imgArea.classList.toggle('hidden', ch !== 'mms');
  adResetPreview();
  adUpdateCost();
}

// ── 수신자 ──
async function adLoadGroups() {
  var sel = document.getElementById('adGroupSelect');
  if (!sel) { console.warn('[messagesAd] #adGroupSelect not found'); return; }
  try {
    var res = await axios.get('/api/contact-groups');
    var groups = (res.data && res.data.data) || [];
    sel.innerHTML = '<option value="">그룹 선택...</option>'
      + groups.map(function(g) {
          return '<option value="' + g.id + '">' + escapeHtml(g.name) + ' (' + (g.member_count || 0) + '명)</option>';
        }).join('');
  } catch (e) {
    console.warn('[messagesAd] 그룹 목록 로드 실패', e);
  }
}

async function adLoadGroup() {
  var sel = document.getElementById('adGroupSelect');
  if (!sel || !sel.value) return;
  try {
    var res = await axios.get('/api/contact-groups/' + sel.value + '/members');
    var members = (res.data && res.data.data && res.data.data.members) || (res.data && res.data.data) || [];
    adReceivers = members
      .filter(function(m) { return m.phone; })
      .map(function(m) {
        return {
          name: m.name || '',
          phone: m.phone,
          client_id: m.member_type === 'CLIENT' ? m.member_id : undefined,
        };
      });
    var custom = document.getElementById('adCustomArea');
    if (custom) custom.classList.add('hidden');
    adRenderTargetInfo();
  } catch (e) {
    showToast('그룹 멤버를 불러오지 못했습니다', 'error');
  }
}

function adToggleCustom() {
  var area = document.getElementById('adCustomArea');
  if (!area) return;
  area.classList.toggle('hidden');
  if (!area.classList.contains('hidden')) {
    var sel = document.getElementById('adGroupSelect');
    if (sel) sel.value = '';
  }
}

function adParseReceivers() {
  var ta = document.getElementById('adReceiversRaw');
  if (!ta) return;
  var lines = ta.value.split(/\r?\n/).filter(function(l) { return l.trim(); });
  adReceivers = [];
  lines.forEach(function(line) {
    var cols = line.split(/\t|,/).map(function(s) { return s.trim(); });
    // 번호가 어느 열에 있든 찾는다(엑셀 열 순서가 제각각)
    var phone = cols.find(function(c) { return /^[0-9\-+() ]{9,}$/.test(c); });
    if (!phone) return;
    var name = cols.filter(function(c) { return c !== phone; })[0] || '';
    adReceivers.push({ name: name, phone: phone });
  });
  adRenderTargetInfo();
}

function adRenderTargetInfo() {
  var el = document.getElementById('adTargetInfo');
  if (el) {
    el.textContent = adReceivers.length > 0
      ? adReceivers.length + '명 선택됨 (대상 확인을 눌러 발송 가능 인원을 계산하세요)'
      : '';
  }
  adResetPreview();
  adUpdateCost();
}

function adUpdateCost() {
  var el = document.getElementById('adCostInfo');
  if (!el) return;
  var unit = adChannel === 'mms' ? 100 : 35;
  el.innerHTML = adReceivers.length
    ? '예상 최대 <b>' + (adReceivers.length * unit).toLocaleString() + '원</b> <span class="text-gray-400">(' + unit + '원 × ' + adReceivers.length + '명, 제외 전 기준)</span>'
    : '';
}

// ── 이미지 (MMS) ──
function adPickImage(input) {
  var file = input && input.files && input.files[0];
  if (!file) return;
  var infoEl = document.getElementById('adImageInfo');
  if (infoEl) infoEl.textContent = '이미지 처리 중...';
  var reader = new FileReader();
  reader.onload = async function(e) {
    var compressed = await window.compressImageForMms(e.target.result);
    if (!compressed) {
      adImageB64 = null;
      if (infoEl) infoEl.textContent = '이미지 처리 실패 (다른 파일을 사용해주세요)';
      return;
    }
    adImageB64 = compressed.slice(compressed.indexOf('base64,') + 7);
    var kb = Math.round(window.mmsImageBytes(adImageB64) / 1024);
    if (infoEl) infoEl.textContent = file.name + ' · ' + kb + 'KB';
    var prev = document.getElementById('adImagePreview');
    if (prev) { prev.src = compressed; prev.classList.remove('hidden'); }
    adResetPreview();
  };
  reader.readAsDataURL(file);
}

// ── 예약 ──
function adToggleSchedule() {
  var t = document.getElementById('adScheduleToggle');
  var box = document.getElementById('adScheduleInput');
  if (box && t) box.classList.toggle('hidden', !t.checked);
  adResetPreview();
}

/** datetime-local → 바로빌 yyyyMMddHHmmss */
function adScheduleValue() {
  var t = document.getElementById('adScheduleToggle');
  var v = document.getElementById('adScheduleAt');
  if (!t || !t.checked || !v || !v.value) return undefined;
  return v.value.replace(/[-:T]/g, '') + '00';
}

// ── 변수 칩 ──
function adRenderVarChips() {
  var el = document.getElementById('adVarChips');
  if (!el) { console.warn('[messagesAd] #adVarChips not found'); return; }
  // BULK_BASE_VARS = messages.js 전역(서버 BULK_VAR_NAMES와 동일 목록)
  el.innerHTML = BULK_BASE_VARS.map(function(v) {
    return '<button type="button" onclick="adInsertVar(\'' + v + '\')" class="px-1.5 py-0.5 rounded text-xs bg-white text-gray-600 border border-gray-200 hover:bg-blue-50">#{' + v + '}</button>';
  }).join('');
}

function adInsertVar(name) {
  var ta = document.getElementById('adContent');
  if (!ta) return;
  var token = '#{' + name + '}';
  var start = ta.selectionStart || 0;
  ta.value = ta.value.slice(0, start) + token + ta.value.slice(ta.selectionEnd || start);
  ta.focus();
  ta.selectionStart = ta.selectionEnd = start + token.length;
  adResetPreview();
}

// ── 대상 확인 → 발송 ──
function adResetPreview() {
  adPreviewOk = false;
  var btn = document.getElementById('adSendBtn');
  if (btn) {
    btn.disabled = true;
    btn.className = 'ds-btn ds-btn-primary text-sm font-medium opacity-50 cursor-not-allowed';
  }
}

function adBuildPayload() {
  return {
    channel: adChannel,
    content: {
      subject: (document.getElementById('adSubject') || {}).value || '',
      body: (document.getElementById('adContent') || {}).value || '',
      image_base64: adChannel === 'mms' ? adImageB64 : undefined,
      sndDT: adScheduleValue(),
    },
    receivers: adReceivers,
  };
}

async function adPreviewSend() {
  var payload = adBuildPayload();
  if (!payload.content.body) { showToast('본문을 입력해주세요', 'warning'); return; }
  if (adReceivers.length === 0) { showToast('수신자를 선택해주세요', 'warning'); return; }

  try {
    var res = await axios.post('/api/messages/ad/preview', payload);
    var d = res.data.data;
    var box = document.getElementById('adPreviewBox');
    if (box) box.classList.remove('hidden');

    var unit = adChannel === 'mms' ? 100 : 35;
    var sum = document.getElementById('adPreviewSummary');
    if (sum) {
      sum.innerHTML = '발송 대상 <b class="text-blue-700">' + d.sendable_count + '명</b>'
        + ' <span class="text-gray-400">/ 선택 ' + d.total + '명</span>'
        + (d.sendable_count ? ' · 예상 <b>' + (d.sendable_count * unit).toLocaleString() + '원</b>' : '');
    }

    var ex = d.excluded || {};
    var exList = d.excluded_list || {};
    var parts = [];
    function chip(label, n, names, color) {
      if (!n) return;
      var sample = (names || []).slice(0, 5).map(function(x) { return escapeHtml(x.name || x.phone); }).join(', ');
      parts.push('<div class="' + color + ' rounded px-2 py-1.5 mb-1"><b>' + label + ' ' + n + '명</b>'
        + (sample ? ' <span class="text-gray-500">— ' + sample + (n > 5 ? ' 외 ' + (n - 5) + '명' : '') + '</span>' : '') + '</div>');
    }
    chip('수신거부', ex.opt_out, exList.opt_out, 'bg-red-50 text-red-700');
    chip('6개월 경과', ex.stale, exList.stale, 'bg-amber-50 text-amber-700');
    chip('거래이력 없음', ex.unknown, exList.unknown, 'bg-gray-100 text-gray-600');
    chip('번호 오류', ex.invalid, exList.invalid, 'bg-gray-100 text-gray-600');
    var exEl = document.getElementById('adPreviewExcluded');
    if (exEl) {
      exEl.innerHTML = parts.length
        ? '<div class="text-gray-500 mb-1">제외됨</div>' + parts.join('')
        : '<span class="text-green-600">제외 대상 없음</span>';
    }

    var bodyEl = document.getElementById('adPreviewBody');
    if (bodyEl) {
      bodyEl.textContent = (d.previews && d.previews[0])
        ? d.previews[0].body
        : '(발송 가능한 대상이 없어 미리보기를 만들 수 없습니다)';
    }

    var unresolved = (d.previews || []).reduce(function(acc, p) { return acc.concat(p.unresolved || []); }, []);
    if (unresolved.length > 0) {
      showToast('값을 찾지 못한 변수: ' + unresolved.join(', '), 'warning');
      adResetPreview();
      return;
    }

    if (d.sendable_count > 0) {
      adPreviewOk = true;
      var btn = document.getElementById('adSendBtn');
      if (btn) { btn.disabled = false; btn.className = 'ds-btn ds-btn-primary text-sm font-medium'; }
    } else {
      adResetPreview();
    }
  } catch (e) {
    showToast((e.response && e.response.data && e.response.data.error) || '대상 확인 실패', 'error');
    adResetPreview();
  }
}

// #573 형제: 광고 발송도 같은 결함 2건이 있었다.
//   ① disable이 showConfirm '이후'라 확인창이 두 개 뜰 수 있었다(둘 다 확인 = 이중 발송·이중 과금).
//      → safeSubmit으로 클릭 즉시 잠근다.
//   ② finally가 innerHTML만 복구하고 disabled를 되돌리지 않아, 발송 실패 시 버튼이 "발송" 모습
//      그대로 영구 잠김이었다(adResetPreview는 성공 경로에서만 호출). → safeSubmit의 finally가 복구.
async function adSend() {
  var __btn = document.getElementById('adSendBtn');
  try {
    if (typeof safeSubmit === 'function') return await safeSubmit(__btn, adSendExec);
    return await adSendExec();
  } finally {
    // ⚠️ safeSubmit의 finally는 disabled를 무조건 false로 되돌린다. 이 버튼은 adPreviewOk
    //    게이트로 잠겨 있어야 하므로(발송 성공 시 adSendExec가 adResetPreview 호출) 재적용한다.
    //    발송 실패 시엔 adPreviewOk가 true로 남아 정상적으로 재시도 가능 상태가 된다(위 ② 해소).
    if (!adPreviewOk) adResetPreview();
  }
}

async function adSendExec() {
  if (!adPreviewOk) { showToast('먼저 [대상 확인]을 눌러주세요', 'warning'); return; }
  var payload = adBuildPayload();

  var confirmed = await showConfirm(
    '광고 문자를 발송합니다.\n\n(광고) 표기와 무료 수신거부 링크가 자동으로 붙습니다.\n발송 후에는 취소할 수 없습니다.',
    { danger: true, confirmText: '발송' }
  );
  if (!confirmed) return;

  try {
    var res = await axios.post('/api/messages/ad/send', payload);
    var d = res.data.data;
    if (d.fail_count > 0) {
      // #585: 실패자를 식별 가능하게 보여준다(#574 send-bulk 미러). 수신자 목록은 지우지
      //   않는다 — [실패건만 다시 선택]이 그 목록을 실패자만으로 좁힌다.
      adShowSendResult(d, d.success_count || 0, d.fail_count || 0);
    } else {
      showToast('광고 발송 완료 — 성공 ' + d.success_count + '건', 'success');
    }
    adResetPreview();
    if (typeof loadLogs === 'function') loadLogs();
  } catch (e) {
    showToast((e.response && e.response.data && e.response.data.error) || '발송 실패', 'error');
  }
}

// === #585 광고 발송 부분실패 결과 (messages.js msgShowBulkResult/msgRetryFailed 미러) ===
var adLastFailed = [];   // [{ name, phone, client_id, error }]

function adShowSendResult(d, okCnt, failCnt) {
  adLastFailed = d.failed || [];
  var modal = document.getElementById('adSendResultModal');
  var body = document.getElementById('adSendResultBody');
  var retryBtn = document.getElementById('adSendRetryBtn');
  if (!modal || !body) {
    showToast('일부 발송 (' + okCnt + '건 접수 / ' + failCnt + '건 실패)', 'warning');
    return;
  }

  var html = '<div class="text-sm mb-2"><span class="font-semibold text-green-700">' + okCnt + '건 접수</span>'
    + ' · <span class="font-semibold text-red-600">' + failCnt + '건 실패</span></div>';

  if (adLastFailed.length > 0) {
    // 같은 오류끼리 묶는다(원인은 대개 소수 종류다)
    var byErr = {};
    adLastFailed.forEach(function(f) { (byErr[f.error] = byErr[f.error] || []).push(f); });
    html += '<div class="text-xs font-semibold text-gray-600 mb-1">실패 대상</div>';
    Object.keys(byErr).forEach(function(err) {
      html += '<div class="mb-2"><div class="text-xs text-red-600 mb-0.5">' + escapeHtml(err)
        + ' <span class="text-gray-400">' + byErr[err].length + '건</span></div>'
        + '<div class="text-xs text-gray-700 pl-2">'
        + byErr[err].map(function(f) {
            return escapeHtml(f.name || '(이름없음)') + ' <span class="text-gray-400">' + escapeHtml(f.phone || '') + '</span>';
          }).join(', ')
        + '</div></div>';
    });
  } else if (d.failed_identifiable === false) {
    html += '<div class="text-xs text-gray-500">이 발송은 제공사가 건별 결과를 돌려주지 않아 '
      + '실패한 수신자를 특정할 수 없습니다. 발송 이력에서 접수번호로 확인해 주세요.</div>';
  }

  if (retryBtn) {
    if (adLastFailed.length > 0) retryBtn.classList.remove('hidden');
    else retryBtn.classList.add('hidden');
  }
  body.innerHTML = html;
  modal.classList.remove('hidden');
}

function adRetryFailed() {
  if (adLastFailed.length === 0) return;
  var phones = {};
  adLastFailed.forEach(function(f) { if (f.phone) phones[String(f.phone)] = 1; });
  adReceivers = adReceivers.filter(function(r) { return phones[String(r.phone)]; });
  adRenderTargetInfo();   // adResetPreview 포함 — 재발송도 [대상 확인] 게이트를 다시 지난다
  adCloseSendResult();
  showToast('실패한 ' + adLastFailed.length + '건만 남겼습니다. [대상 확인] 후 다시 발송하세요.', 'info');
}

function adCloseSendResult() {
  var m = document.getElementById('adSendResultModal');
  if (m) m.classList.add('hidden');
}

// ── 수신거부 명단 ──
// #587: 서버가 search 파라미터를 이미 지원(LIMIT 300) — 300건 넘는 오래된 등록도 검색으로 도달.
var adOptOutSearchTimer = null;
function adSearchOptOuts() {
  clearTimeout(adOptOutSearchTimer);
  adOptOutSearchTimer = setTimeout(adLoadOptOuts, 300);
}

async function adLoadOptOuts() {
  var el = document.getElementById('adOptOutList');
  if (!el) { console.warn('[messagesAd] #adOptOutList not found'); return; }
  try {
    var q = (document.getElementById('adOptOutSearch') || {}).value || '';
    var res = await axios.get('/api/messages/ad/opt-outs', { params: q.trim() ? { search: q.trim() } : {} });
    var rows = (res.data && res.data.data) || [];
    el.innerHTML = rows.length
      ? rows.map(function(r) {
          var src = r.source === 'WEB' ? '링크' : (r.source === 'CALL' ? '전화' : '수동');
          return '<div class="flex items-center justify-between text-xs py-1 border-b border-gray-100">'
            + '<div><span class="font-medium text-gray-700">' + escapeHtml(r.phone) + '</span>'
            + (r.client_name ? ' <span class="text-gray-400">' + escapeHtml(r.client_name) + '</span>' : '')
            + ' <span class="text-gray-300">' + src + '</span></div>'
            + '<button onclick="adRemoveOptOut(' + r.id + ')" class="text-gray-300 hover:text-red-600"><i class="fas fa-times"></i></button>'
            + '</div>';
        }).join('')
      : '<div class="text-xs text-gray-400 py-2">' + (q.trim() ? '검색 결과가 없습니다.' : '등록된 수신거부가 없습니다.') + '</div>';
  } catch (e) {
    console.warn('[messagesAd] 수신거부 명단 로드 실패', e);
  }
}

async function adAddOptOut() {
  var phone = prompt('수신거부할 전화번호를 입력하세요');
  if (!phone) return;
  try {
    await axios.post('/api/messages/ad/opt-outs', { phone: phone, source: 'CALL', reason: '전화 요청' });
    showToast('수신거부 등록됨', 'success');
    adLoadOptOuts();
  } catch (e) {
    showToast((e.response && e.response.data && e.response.data.error) || '등록 실패', 'error');
  }
}

async function adRemoveOptOut(id) {
  var confirmed = await showConfirm('수신거부를 해제할까요? 이후 광고 문자가 다시 발송됩니다.', { danger: true });
  if (!confirmed) return;
  try {
    await axios.delete('/api/messages/ad/opt-outs/' + id);
    adLoadOptOuts();
  } catch (e) {
    showToast('해제 실패', 'error');
  }
}

// ── 금지어 ──
async function adLoadBannedWords() {
  var el = document.getElementById('adBannedList');
  if (!el) { console.warn('[messagesAd] #adBannedList not found'); return; }
  try {
    var res = await axios.get('/api/messages/ad/banned-words');
    var rows = ((res.data && res.data.data) || []).filter(function(w) { return w.is_active; });
    el.innerHTML = rows.length
      ? rows.map(function(w) {
          return '<span class="inline-flex items-center gap-1 px-2 py-1 rounded text-xs bg-gray-100 text-gray-700">'
            + escapeHtml(w.word)
            + '<button onclick="adRemoveBannedWord(' + w.id + ')" class="text-gray-400 hover:text-red-600"><i class="fas fa-times"></i></button>'
            + '</span>';
        }).join('')
      : '<div class="text-xs text-gray-400">등록된 금지어가 없습니다.</div>';
  } catch (e) {
    console.warn('[messagesAd] 금지어 로드 실패', e);
  }
}

async function adAddBannedWord() {
  var word = prompt('차단할 단어를 입력하세요 (예: 할인)');
  if (!word) return;
  try {
    await axios.post('/api/messages/ad/banned-words', { word: word.trim() });
    adLoadBannedWords();
  } catch (e) {
    showToast((e.response && e.response.data && e.response.data.error) || '추가 실패', 'error');
  }
}

async function adRemoveBannedWord(id) {
  try {
    await axios.delete('/api/messages/ad/banned-words/' + id);
    adLoadBannedWords();
  } catch (e) {
    showToast('삭제 실패', 'error');
  }
}
