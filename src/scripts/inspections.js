(function() {
  // 탭 전환
  window.inspectionsSwitchTab = function(tab) {
    document.getElementById('templatesContent').classList.toggle('hidden', tab !== 'templates')
    document.getElementById('resultsContent').classList.toggle('hidden', tab !== 'results')
    document.getElementById('reviewContent').classList.toggle('hidden', tab !== 'review')
    ;['Templates','Results','Review'].forEach(function(name) {
      const el = document.getElementById('tab' + name)
      if (!el) return
      const active = (tab === name.toLowerCase())
      el.className = 'px-6 py-3 text-sm font-medium ' + (active
        ? 'border-b-2 border-blue-600 text-blue-600'
        : 'text-gray-500 hover:text-gray-700')
    })
    if (tab === 'templates') inspectionsLoadTemplates()
    else if (tab === 'results') inspectionsLoadResults()
    else if (tab === 'review') inspectionsLoadReview()
  }

  // Task 2~7에서 채움
  window.inspectionsLoadTemplates = async function() {
    const tbody = document.getElementById('templatesTableBody')
    tbody.innerHTML = Array(5).fill(
      '<tr class="border-b border-gray-100">' +
        '<td class="px-4 py-3"><div class="ds-skeleton ds-skeleton-row"></div></td>' +
        '<td class="px-4 py-3"><div class="ds-skeleton ds-skeleton-row"></div></td>' +
        '<td class="px-4 py-3"><div class="ds-skeleton ds-skeleton-row"></div></td>' +
        '<td class="px-4 py-3"><div class="ds-skeleton ds-skeleton-row"></div></td>' +
        '<td class="px-4 py-3"><div class="ds-skeleton ds-skeleton-row"></div></td>' +
      '</tr>'
    ).join('')
    const cat = document.getElementById('templateCategoryFilter').value.trim()
    try {
      const res = await axios.get('/api/inspections/templates' + (cat ? '?category=' + encodeURIComponent(cat) : ''))
      const list = res.data.data || []
      if (list.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="px-4 py-8 text-center text-gray-400"><i class="fas fa-clipboard-list text-3xl mb-3 block text-gray-300"></i><div class="text-sm mb-1">등록된 템플릿이 없습니다.</div><button onclick="inspectionsOpenTemplateModal()" class="px-3 py-1.5 text-xs bg-blue-600 text-white rounded mt-2 hover:bg-blue-700">+ 새 템플릿</button></td></tr>'
        return
      }
      tbody.innerHTML = list.map(function(t) {
        const status = t.is_active
          ? '<span class="inline-flex items-center px-2 py-0.5 text-xs rounded bg-green-50 text-green-700"><i class="fas fa-check-circle text-[7px] mr-1"></i>사용중</span>'
          : '<span class="inline-flex items-center px-2 py-0.5 text-xs rounded bg-gray-100 text-gray-600"><i class="fas fa-power-off text-[7px] mr-1"></i>비활성</span>'
        return '<tr>' +
          '<td class="px-4 py-2 font-medium">' + escapeHtml(t.template_name) + '</td>' +
          '<td class="px-4 py-2 text-gray-600">' + escapeHtml(t.category_name || '범용') + '</td>' +
          '<td class="px-4 py-2 text-center text-gray-700">' + (t.item_count || 0) + '</td>' +
          '<td class="px-4 py-2 text-center">' + status + '</td>' +
          '<td class="px-4 py-2 text-center">' +
            '<button onclick="inspectionsOpenTemplateModal(' + t.id + ')" class="text-blue-600 hover:underline mr-2">편집</button>' +
            '<button onclick="inspectionsDeleteTemplate(' + t.id + ',\\\'' + escapeHtml(t.template_name).replace(/'/g, '&#39;') + '\\\')" class="text-red-600 hover:underline">삭제</button>' +
          '</td>' +
        '</tr>'
      }).join('')
    } catch (e) {
      tbody.innerHTML = '<tr><td colspan="5" class="px-4 py-8 text-center text-red-500">조회 실패: ' + (e.message || e) + '</td></tr>'
    }
  }

  // id가 있으면 편집, 없으면 신규
  window.inspectionsOpenTemplateModal = async function(id) {
    const body = document.getElementById('templateModalBody')
    let template = { id: null, template_name: '', category_name: '', is_active: 1, items: [] }
    if (id) {
      try {
        const res = await axios.get('/api/inspections/templates/' + id)
        template = res.data.data
        if (!template.items) template.items = []
      } catch (e) {
        showToast('템플릿 조회 실패: ' + e.message, 'error')
        return
      }
    }
    // window 임시 저장 — 항목 추가/삭제 시 사용
    window._inspTemplate = template

    body.innerHTML =
      '<div class="p-6">' +
        '<div class="flex justify-between items-center mb-4">' +
          '<h3 class="text-lg font-bold">' + (id ? '검수 템플릿 편집' : '새 검수 템플릿') + '</h3>' +
          '<button onclick="inspectionsCloseTemplateModal()" class="text-gray-400 hover:text-gray-600 text-xl">&times;</button>' +
        '</div>' +
        '<div class="grid grid-cols-2 gap-4 mb-4">' +
          '<div><label class="ds-label">템플릿명 *</label><input id="tplName" type="text" class="ds-input" value="' + escapeHtml(template.template_name) + '"></div>' +
          '<div><label class="ds-label">카테고리 (선택)</label><input id="tplCategory" type="text" class="ds-input" value="' + escapeHtml(template.category_name || '') + '" placeholder="비우면 범용"></div>' +
        '</div>' +
        '<div class="flex justify-between items-center mb-2">' +
          '<h4 class="text-sm font-bold text-gray-700">검수 항목</h4>' +
          '<button onclick="inspectionsAddItem()" class="ds-btn ds-btn-secondary ds-btn-sm"><i class="fas fa-plus mr-1"></i>항목 추가</button>' +
        '</div>' +
        '<div id="tplItems" class="space-y-2"></div>' +
        '<div class="flex justify-end gap-2 mt-6">' +
          '<button onclick="inspectionsCloseTemplateModal()" class="ds-btn ds-btn-secondary">취소</button>' +
          '<button onclick="inspectionsSaveTemplate()" class="ds-btn ds-btn-primary"><i class="fas fa-save mr-1"></i>저장</button>' +
        '</div>' +
      '</div>'

    inspectionsRenderItems()
    document.getElementById('templateModal').classList.remove('hidden')
  }

  function inspectionsRenderItems() {
    const items = window._inspTemplate.items
    const wrap = document.getElementById('tplItems')
    if (items.length === 0) {
      wrap.innerHTML = '<div class="text-center text-gray-400 py-4 text-sm">검수 항목이 없습니다. [항목 추가] 버튼으로 추가하세요.</div>'
      return
    }
    wrap.innerHTML = items.map(function(it, idx) {
      return '<div class="border rounded p-3 bg-gray-50">' +
        '<div class="flex gap-2 mb-2">' +
          '<input type="text" placeholder="검수 항목명 (예: 폭 확인)" value="' + escapeHtml(it.check_item || '') +
            '" oninput="window._inspTemplate.items[' + idx + '].check_item=this.value" class="ds-input flex-1">' +
          '<select onchange="window._inspTemplate.items[' + idx + '].check_type=this.value" class="ds-input w-32">' +
            '<option value="PASS_FAIL"' + (it.check_type==='PASS_FAIL'?' selected':'') + '>합격/불합격</option>' +
            '<option value="NUMERIC"' + (it.check_type==='NUMERIC'?' selected':'') + '>수치</option>' +
            '<option value="TEXT"' + (it.check_type==='TEXT'?' selected':'') + '>텍스트</option>' +
          '</select>' +
          '<label class="flex items-center gap-1 text-xs text-gray-700"><input type="checkbox"' + (it.is_required!==false?' checked':'') +
            ' onchange="window._inspTemplate.items[' + idx + '].is_required=this.checked">필수</label>' +
          '<button onclick="inspectionsRemoveItem(' + idx + ')" class="text-red-600 hover:bg-red-50 px-2 rounded"><i class="fas fa-trash"></i></button>' +
        '</div>' +
        '<input type="text" placeholder="설명 (선택)" value="' + escapeHtml(it.description || '') +
          '" oninput="window._inspTemplate.items[' + idx + '].description=this.value" class="ds-input text-sm">' +
      '</div>'
    }).join('')
  }

  window.inspectionsAddItem = function() {
    window._inspTemplate.items.push({ check_item: '', check_type: 'PASS_FAIL', description: '', is_required: true })
    inspectionsRenderItems()
  }
  window.inspectionsRemoveItem = function(idx) {
    window._inspTemplate.items.splice(idx, 1)
    inspectionsRenderItems()
  }

  window.inspectionsSaveTemplate = async function() {
    const t = window._inspTemplate
    const name = document.getElementById('tplName').value.trim()
    const cat = document.getElementById('tplCategory').value.trim()
    if (!name) { showToast('템플릿명을 입력하세요', 'warning'); return }
    if (t.items.length === 0) { showToast('검수 항목 1개 이상 필요', 'warning'); return }
    if (t.items.some(function(i) { return !i.check_item })) { showToast('빈 항목명이 있습니다', 'warning'); return }
    const payload = {
      template_name: name,
      category_name: cat || null,
      items: t.items.map(function(i) {
        return { check_item: i.check_item, check_type: i.check_type || 'PASS_FAIL',
                 description: i.description || null, is_required: i.is_required !== false }
      })
    }
    try {
      if (t.id) {
        await axios.put('/api/inspections/templates/' + t.id, payload)
        showToast('템플릿 수정 완료', 'success')
      } else {
        await axios.post('/api/inspections/templates', payload)
        showToast('템플릿 생성 완료', 'success')
      }
      inspectionsCloseTemplateModal()
      inspectionsLoadTemplates()
    } catch (e) {
      const msg = (e.response && e.response.data && e.response.data.error) || e.message
      showToast('저장 실패: ' + msg, 'error')
    }
  }

  window.inspectionsDeleteTemplate = async function(id, name) {
    const ok = await showConfirm('템플릿 "' + name + '" 을 비활성화합니다. 계속할까요?', { danger: true })
    if (!ok) return
    try {
      await axios.delete('/api/inspections/templates/' + id)
      showToast('템플릿 비활성화 완료', 'success')
      inspectionsLoadTemplates()
    } catch (e) {
      showToast('삭제 실패: ' + e.message, 'error')
    }
  }

  window.inspectionsCloseTemplateModal = function() {
    document.getElementById('templateModal').classList.add('hidden')
  }
  window.inspectionsLoadResults = async function() {
    const tbody = document.getElementById('resultsTableBody')
    const receipt = document.getElementById('resultsReceiptFilter').value.trim()
    const supplier = document.getElementById('resultsSupplierFilter').value.trim()
    const params = []
    if (receipt) params.push('receipt_id=' + encodeURIComponent(receipt))
    if (supplier) params.push('supplier_id=' + encodeURIComponent(supplier))
    tbody.innerHTML = Array(5).fill(
      '<tr class="border-b border-gray-100">' +
        '<td class="px-4 py-3"><div class="ds-skeleton ds-skeleton-row"></div></td>' +
        '<td class="px-4 py-3"><div class="ds-skeleton ds-skeleton-row"></div></td>' +
        '<td class="px-4 py-3"><div class="ds-skeleton ds-skeleton-row"></div></td>' +
        '<td class="px-4 py-3"><div class="ds-skeleton ds-skeleton-row"></div></td>' +
        '<td class="px-4 py-3"><div class="ds-skeleton ds-skeleton-row"></div></td>' +
        '<td class="px-4 py-3"><div class="ds-skeleton ds-skeleton-row"></div></td>' +
      '</tr>'
    ).join('')
    try {
      const res = await axios.get('/api/inspections/results' + (params.length ? '?' + params.join('&') : ''))
      const list = res.data.data || []
      if (list.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="px-4 py-8 text-center text-gray-400"><i class="fas fa-history text-3xl mb-3 block text-gray-300"></i><div class="text-sm mb-1">검수 결과가 없습니다.</div></td></tr>'
        return
      }
      tbody.innerHTML = list.map(function(r) {
        const badge = r.overall_result === 'PASSED'
          ? '<span class="inline-flex items-center px-2 py-0.5 text-xs rounded bg-green-50 text-green-700"><i class="fas fa-check-circle text-[7px] mr-1"></i>합격</span>'
          : r.overall_result === 'FAILED'
            ? '<span class="inline-flex items-center px-2 py-0.5 text-xs rounded bg-red-50 text-red-700"><i class="fas fa-times-circle text-[7px] mr-1"></i>불합격</span>'
            : r.overall_result === 'PARTIAL'
              ? '<span class="inline-flex items-center px-2 py-0.5 text-xs rounded bg-amber-50 text-amber-700"><i class="fas fa-exclamation-triangle text-[7px] mr-1"></i>부분합격</span>'
              : '<span class="inline-flex items-center px-2 py-0.5 text-xs rounded bg-gray-100 text-gray-500">대기</span>'
        return '<tr>' +
          '<td class="px-4 py-2 text-gray-600">' + escapeHtml((r.inspected_at || '').slice(0, 16).replace('T', ' ')) + '</td>' +
          '<td class="px-4 py-2 font-medium">' + escapeHtml(r.receipt_number || ('#' + r.receipt_id)) + '</td>' +
          '<td class="px-4 py-2 text-gray-700">' + escapeHtml(r.supplier_name || '-') + '</td>' +
          '<td class="px-4 py-2 text-gray-700">' + escapeHtml(r.inspector_name || '-') + '</td>' +
          '<td class="px-4 py-2 text-center">' + badge + '</td>' +
          '<td class="px-4 py-2 text-center">' +
            '<button onclick="inspectionsOpenResultDetail(' + r.id + ')" class="text-blue-600 hover:underline">상세</button>' +
          '</td>' +
        '</tr>'
      }).join('')
    } catch (e) {
      tbody.innerHTML = '<tr><td colspan="6" class="px-4 py-8 text-center text-red-500">조회 실패: ' + (e.message || e) + '</td></tr>'
    }
  }
  window.inspectionsOpenResultDetail = async function(id) {
    const body = document.getElementById('resultDetailBody')
    body.innerHTML = '<div class="p-6 text-center text-gray-500">로딩 중...</div>'
    document.getElementById('resultDetailModal').classList.remove('hidden')
    try {
      const res = await axios.get('/api/inspections/results/' + id)
      const r = res.data.data
      const items = r.items || []
      const badge = r.overall_result === 'PASSED'
        ? '<span class="inline-flex items-center px-2 py-1 text-sm rounded bg-green-50 text-green-700 font-medium"><i class="fas fa-check-circle text-[7px] mr-1"></i>합격</span>'
        : r.overall_result === 'FAILED'
          ? '<span class="inline-flex items-center px-2 py-1 text-sm rounded bg-red-50 text-red-700 font-medium"><i class="fas fa-times-circle text-[7px] mr-1"></i>불합격</span>'
          : '<span class="inline-flex items-center px-2 py-1 text-sm rounded bg-amber-50 text-amber-700 font-medium"><i class="fas fa-exclamation-triangle text-[7px] mr-1"></i>부분합격</span>'
      body.innerHTML =
        '<div class="p-6">' +
          '<div class="flex justify-between items-center mb-4">' +
            '<h3 class="text-lg font-bold">검수 결과 상세</h3>' +
            '<button onclick="inspectionsCloseResultModal()" class="text-gray-400 hover:text-gray-600 text-xl">&times;</button>' +
          '</div>' +
          '<div class="grid grid-cols-2 gap-3 mb-4 text-sm">' +
            '<div><span class="text-gray-500">검수일시:</span> ' + escapeHtml((r.inspected_at || '').slice(0, 16).replace('T', ' ')) + '</div>' +
            '<div><span class="text-gray-500">검수자:</span> ' + escapeHtml(r.inspector_name || '-') + '</div>' +
            '<div><span class="text-gray-500">입고 ID:</span> ' + r.receipt_id + '</div>' +
            '<div><span class="text-gray-500">전체 결과:</span> ' + badge + '</div>' +
          '</div>' +
          (r.notes ? '<div class="mb-4 p-3 bg-gray-50 rounded text-sm"><span class="text-gray-500">메모:</span> ' + escapeHtml(r.notes) + '</div>' : '') +
          '<table class="w-full text-sm border">' +
            '<thead class="bg-gray-50"><tr>' +
              '<th class="px-3 py-2 text-left">검수 항목</th>' +
              '<th class="px-3 py-2 text-center">결과</th>' +
              '<th class="px-3 py-2 text-left">값</th>' +
              '<th class="px-3 py-2 text-left">메모</th>' +
            '</tr></thead><tbody>' +
              items.map(function(it) {
                const rb = it.check_result === 'PASS' ? '<span class="text-green-700">PASS</span>'
                       : it.check_result === 'FAIL' ? '<span class="text-red-700">FAIL</span>'
                       : '<span class="text-gray-500">N/A</span>'
                return '<tr class="border-t">' +
                  '<td class="px-3 py-2">' + escapeHtml(it.check_item) + '</td>' +
                  '<td class="px-3 py-2 text-center">' + rb + '</td>' +
                  '<td class="px-3 py-2 text-gray-700">' + escapeHtml(it.value || '-') + '</td>' +
                  '<td class="px-3 py-2 text-gray-600">' + escapeHtml(it.notes || '-') + '</td>' +
                '</tr>'
              }).join('') +
            '</tbody></table>' +
          '<div class="flex justify-end mt-4">' +
            '<button onclick="inspectionsCloseResultModal()" class="ds-btn ds-btn-secondary">닫기</button>' +
          '</div>' +
        '</div>'
    } catch (e) {
      body.innerHTML = '<div class="p-6 text-center text-red-500">조회 실패: ' + e.message + '</div>'
    }
  }
  window.inspectionsCloseResultModal = function() {
    document.getElementById('resultDetailModal').classList.add('hidden')
  }

  // 검수 확인 대기 목록 조회
  window.inspectionsLoadReview = async function() {
    const wrap = document.getElementById('reviewListContainer')
    wrap.innerHTML = '<div class="text-center text-gray-400 py-8">로딩 중...</div>'
    try {
      const res = await axios.get('/api/inventory/receipts/pending-review')
      const list = res.data.data || []
      // 배지 갱신
      const badge = document.getElementById('reviewCountBadge')
      if (list.length > 0) { badge.textContent = list.length; badge.classList.remove('hidden') }
      else badge.classList.add('hidden')

      if (list.length === 0) {
        wrap.innerHTML = '<div class="text-center py-12"><i class="fas fa-check-circle text-3xl mb-3 block text-gray-300"></i><div class="text-sm text-gray-500 mb-1">확인 대기 중인 입고가 없습니다.</div></div>'
        return
      }
      wrap.innerHTML = list.map(function(r) {
        return '<div class="ds-card border-l-4 border-amber-500 shadow-sm hover:shadow-md transition-shadow">' +
          '<div class="flex justify-between items-start mb-3">' +
            '<div>' +
              '<div class="font-bold text-base">' + escapeHtml(r.receipt_number || '#' + r.id) + '</div>' +
              '<div class="text-sm text-gray-600 mt-1">' +
                '<i class="fas fa-truck mr-1"></i>' + escapeHtml(r.supplier || '-') +
                ' · 입고일 ' + escapeHtml(r.receipt_date || '-') +
                ' · 라인 ' + (r.line_count || 0) + '건' +
                ' · 거부 수량 합계 <span class="text-red-600 font-medium">' + (r.total_rejected || 0) + '</span>' +
              '</div>' +
            '</div>' +
            '<div class="text-xs text-gray-500">담당 ' + escapeHtml(r.receiver_name || '-') + '</div>' +
          '</div>' +
          (r.notes ? '<div class="mb-3 p-2 bg-gray-50 text-xs rounded whitespace-pre-wrap">' + escapeHtml(r.notes) + '</div>' : '') +
          '<div class="flex gap-2">' +
            '<button onclick="inspectionsDecide(' + r.id + ',\'PARTIAL_ACCEPT\')" class="ds-btn ds-btn-sm bg-green-600 hover:bg-green-700 text-white"><i class="fas fa-check mr-1"></i>부분수령 확정</button>' +
            '<button onclick="inspectionsDecide(' + r.id + ',\'WAITING_RESHIP\')" class="ds-btn ds-btn-sm bg-amber-500 hover:bg-amber-600 text-white"><i class="fas fa-redo mr-1"></i>재입고 대기</button>' +
            '<button onclick="inspectionsDecide(' + r.id + ',\'CANCELLED\')" class="ds-btn ds-btn-sm bg-red-600 hover:bg-red-700 text-white"><i class="fas fa-ban mr-1"></i>전량 취소</button>' +
          '</div>' +
        '</div>'
      }).join('')
    } catch (e) {
      wrap.innerHTML = '<div class="text-center text-red-500 py-8">조회 실패: ' + e.message + '</div>'
    }
  }

  // 검수 확인 결정 처리
  window.inspectionsDecide = async function(receiptId, decision) {
    const labels = { PARTIAL_ACCEPT: '부분수령 확정', WAITING_RESHIP: '재입고 대기', CANCELLED: '전량 취소' }
    const danger = decision === 'CANCELLED'
    const ok = await showConfirm('"' + labels[decision] + '" 으로 처리합니다. 계속할까요?', { danger: danger })
    if (!ok) return
    const notes = prompt('결정 메모 (선택)', '')
    try {
      await axios.patch('/api/inventory/receipts/' + receiptId + '/inspection-decision', { decision: decision, notes: notes || '' })
      showToast(labels[decision] + ' 처리 완료', 'success')
      inspectionsLoadReview()
    } catch (e) {
      showToast('처리 실패: ' + ((e.response && e.response.data && e.response.data.error) || e.message), 'error')
    }
  }

  // 페이지 진입 시 자동 실행
  window.inspectionsLoadTemplates()
})()
