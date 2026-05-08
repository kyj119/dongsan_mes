// 근태 관리 스프레드시트
(function () {
  // 상태
  var state = {
    month: '',
    department: '',
    employees: [],
    recordsMap: {},   // key: employee_id + '_' + YYYY-MM-DD  → record
    dirty: {},        // key → true (변경된 셀)
    selected: {},     // employee_id → true (체크박스)
    daysInMonth: 0,
    editing: null,    // { employee_id, date, empName }
  };

  // 유틸
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function key(empId, date) { return empId + '_' + date; }
  function daysInMonth(yyyymm) {
    var parts = yyyymm.split('-');
    return new Date(parseInt(parts[0], 10), parseInt(parts[1], 10), 0).getDate();
  }
  // 소수점 시간 → hh:mm 변환 (예: 8.5 → "08:30", 0 → "00:00")
  function fmtHM(h) {
    var v = parseFloat(h) || 0;
    var hrs = Math.floor(v);
    var mins = Math.round((v - hrs) * 60);
    if (mins >= 60) { hrs++; mins = 0; }
    return pad(hrs) + ':' + pad(mins);
  }
  function typeLabel(t) {
    switch (t) {
      case 'NORMAL': return '정';
      case 'ABSENT': return '결';
      case 'VACATION': return '연';
      case 'HALF_AM': return '반';
      case 'HALF_PM': return '반';
      case 'QUARTER_1': case 'QUARTER_2': case 'QUARTER_3': case 'QUARTER_4': return '¼';
      case 'SICK': return '병';
      case 'FAMILY_EVENT': return '경';
      case 'HOLIDAY': return '휴';
      default: return '-';
    }
  }
  function typeFullLabel(t) {
    switch (t) {
      case 'NORMAL': return '정상';
      case 'ABSENT': return '결근';
      case 'VACATION': return '연차';
      case 'HALF_AM': return '오전반차';
      case 'HALF_PM': return '오후반차';
      case 'QUARTER_1': return '반반차(08:30~10:00)';
      case 'QUARTER_2': return '반반차(10:00~12:00)';
      case 'QUARTER_3': return '반반차(13:00~16:00)';
      case 'QUARTER_4': return '반반차(16:00~18:00)';
      case 'SICK': return '병가';
      case 'FAMILY_EVENT': return '경조휴가';
      case 'HOLIDAY': return '휴일';
      default: return '-';
    }
  }
  function typeColor(t) {
    switch (t) {
      case 'NORMAL': return 'bg-green-50 text-green-700 border-green-200';
      case 'ABSENT': return 'bg-red-50 text-red-700 border-red-200';
      case 'VACATION': return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'HALF_AM': case 'HALF_PM':
      case 'QUARTER_1': case 'QUARTER_2': case 'QUARTER_3': case 'QUARTER_4':
        return 'bg-cyan-50 text-cyan-700 border-cyan-200';
      case 'SICK': return 'bg-purple-50 text-purple-700 border-purple-200';
      case 'FAMILY_EVENT': return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'HOLIDAY': return 'bg-gray-100 text-gray-700 border-gray-300';
      default: return 'bg-white text-gray-400 border-gray-200';
    }
  }
  // 출처별 도트 색상
  function sourceDotColor(src) {
    if (src === 'CAPS') return 'bg-blue-500';
    if (src === 'CAPS_EDITED') return 'bg-amber-500';
    if (src === 'MANUAL') return 'bg-gray-400';
    return '';
  }
  function sourceLabel(src) {
    if (src === 'CAPS') return 'CAPS 자동';
    if (src === 'CAPS_EDITED') return 'CAPS 수정됨';
    if (src === 'MANUAL') return '수동';
    return '';
  }
  function buildTooltip(rec) {
    if (!rec) return '';
    var parts = [];
    // 유형
    parts.push(typeFullLabel(rec.attendance_type));
    // 출퇴근 시간
    var inT = timeFromDatetime(rec.check_in_time);
    var outT = timeFromDatetime(rec.check_out_time);
    if (inT || outT) {
      parts.push((inT || '--:--') + ' ~ ' + (outT || '--:--'));
    }
    // 지각/조퇴 뱃지 정보
    if (rec.late_minutes > 0) parts.push('지각 ' + rec.late_minutes + '분');
    if (rec.early_leave_hours > 0) parts.push('조퇴 ' + fmtHM(rec.early_leave_hours));
    // 근무/연장
    if (rec.work_hours > 0) parts.push('근무 ' + fmtHM(rec.work_hours));
    if (rec.overtime_hours > 0) parts.push('연장 ' + fmtHM(rec.overtime_hours));
    // 출처
    if (rec.source) parts.push(sourceLabel(rec.source));
    // CAPS 상세
    if (rec.caps_late_min != null && rec.caps_late_min > 0) parts.push('CAPS지각 ' + rec.caps_late_min + '분');
    if (rec.caps_over_min != null && rec.caps_over_min > 0) parts.push('CAPS연장 ' + rec.caps_over_min + '분');
    if (rec.caps_synced_at) parts.push('동기화: ' + String(rec.caps_synced_at).slice(0, 16).replace('T', ' '));
    // 비고
    if (rec.notes) parts.push('메모: ' + rec.notes);
    return parts.join(' · ');
  }
  function timeFromDatetime(dt) {
    if (!dt) return '';
    try {
      var d = new Date(dt);
      if (isNaN(d.getTime())) {
        var m = String(dt).match(/T(\d{2}:\d{2})/);
        return m ? m[1] : '';
      }
      return pad(d.getHours()) + ':' + pad(d.getMinutes());
    } catch (e) { return ''; }
  }

  // 이상 감지: 문제가 있는 셀에 빨간 점 표시
  // 휴가/비근무 타입 판별
  function isLeaveType(t) {
    return ['VACATION', 'HALF_AM', 'HALF_PM', 'QUARTER_1', 'QUARTER_2', 'QUARTER_3', 'QUARTER_4', 'SICK', 'FAMILY_EVENT', 'ABSENT', 'HOLIDAY'].indexOf(t) >= 0;
  }
  function detectAnomaly(rec, dateStr) {
    if (!rec || !rec.attendance_type) return '';
    var inT = timeFromDatetime(rec.check_in_time);
    var outT = timeFromDatetime(rec.check_out_time);
    var t = rec.attendance_type;

    // 출근 기록 없이 퇴근만 있음
    if (!inT && outT && !isLeaveType(t)) return '출근 기록 없음';
    // 근무시간 0인데 정상 출근
    if (t === 'NORMAL' && Number(rec.work_hours || 0) === 0 && inT) return '근무시간 0h';
    return '';
  }

  // 월간 데이터 로드
  async function loadMonth() {
    state.month = document.getElementById('attMonth').value;
    state.department = document.getElementById('attDept').value;
    if (!state.month) {
      showToast('월을 선택해주세요.', 'warning');
      return;
    }
    try {
      var res = await axios.get('/api/attendance/month', {
        params: { month: state.month, department: state.department }
      });
      var data = (res.data && res.data.data) || {};
      state.employees = data.employees || [];
      state.daysInMonth = daysInMonth(state.month);
      state.recordsMap = {};
      state.dirty = {};
      state.selected = {};
      (data.records || []).forEach(function (r) {
        state.recordsMap[key(r.employee_id, r.work_date)] = r;
      });
      // 마지막 CAPS 동기화 정보
      var lastSyncEl = document.getElementById('attLastSync');
      if (lastSyncEl) {
        if (data.last_sync && data.last_sync.finished_at) {
          var t = String(data.last_sync.finished_at).slice(0, 16).replace('T', ' ');
          var ok = data.last_sync.success_count || 0;
          var fail = data.last_sync.fail_count || 0;
          lastSyncEl.innerHTML = '<i class="fas fa-clock mr-1"></i>최근 동기화 ' + t
            + ' <span class="text-green-600">성공 ' + ok + '</span>'
            + (fail > 0 ? ' <span class="text-red-600">실패 ' + fail + '</span>' : '');
        } else {
          lastSyncEl.innerHTML = '<i class="fas fa-info-circle mr-1"></i>CAPS 동기화 기록 없음';
        }
      }
      renderGrid();
      updateSaveButton();
      updateAnomalyCount();
    } catch (e) {
      console.error(e);
      showToast('근태 조회 실패: ' + (e.message || e), 'error');
    }
  }

  // 이상 건수 업데이트
  function updateAnomalyCount() {
    var count = 0;
    state.employees.forEach(function (emp) {
      for (var d = 1; d <= state.daysInMonth; d++) {
        var dateStr = state.month + '-' + pad(d);
        var rec = state.recordsMap[key(emp.id, dateStr)];
        if (rec && detectAnomaly(rec, dateStr)) count++;
      }
    });
    var el = document.getElementById('attAnomalyCount');
    if (el) {
      if (count > 0) {
        el.innerHTML = '<i class="fas fa-exclamation-triangle mr-1"></i>이상 ' + count + '건';
        el.className = 'text-xs text-red-600 font-medium';
      } else {
        el.innerHTML = '<i class="fas fa-check-circle mr-1"></i>이상 없음';
        el.className = 'text-xs text-green-600 font-medium';
      }
    }
  }

  // 그리드 렌더
  function renderGrid() {
    var headerRow = document.getElementById('attHeaderRow');
    var body = document.getElementById('attBody');
    if (!headerRow || !body) return;

    // 헤더: 체크박스 | 직원 | 1일~N일 | 집계
    var headHtml = '';
    headHtml += '<th class="px-2 py-2 border-b border-gray-200 bg-gray-50 sticky left-0 z-20"><input type="checkbox" id="attSelectAll" onchange="attendanceToggleAll(this.checked)"></th>';
    headHtml += '<th class="px-3 py-2 border-b border-gray-200 bg-gray-50 sticky left-8 z-20 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider min-w-[120px]">직원</th>';
    for (var d = 1; d <= state.daysInMonth; d++) {
      var dateStr = state.month + '-' + pad(d);
      var dow = new Date(dateStr).getDay();
      var dowClass = (dow === 0) ? 'text-red-600' : (dow === 6 ? 'text-blue-600' : 'text-gray-600');
      var dowBg = (dow === 0 || dow === 6) ? ' bg-gray-100' : ' bg-gray-50';
      headHtml += '<th class="px-1 py-2 border-b border-gray-200' + dowBg + ' text-center text-[10px] font-semibold ' + dowClass + '" title="' + dateStr + '">' + d + '</th>';
    }
    headHtml += '<th class="px-2 py-2 border-b border-gray-200 bg-gray-50 text-center text-xs font-semibold text-gray-600">출근</th>';
    headHtml += '<th class="px-2 py-2 border-b border-gray-200 bg-gray-50 text-center text-xs font-semibold text-gray-600">지각</th>';
    headHtml += '<th class="px-2 py-2 border-b border-gray-200 bg-gray-50 text-center text-xs font-semibold text-gray-600">조퇴</th>';
    headHtml += '<th class="px-2 py-2 border-b border-gray-200 bg-gray-50 text-center text-xs font-semibold text-gray-600">결근</th>';
    headHtml += '<th class="px-2 py-2 border-b border-gray-200 bg-gray-50 text-center text-xs font-semibold text-gray-600">연차</th>';
    headHtml += '<th class="px-2 py-2 border-b border-gray-200 bg-gray-50 text-center text-xs font-semibold text-gray-600">병가</th>';
    headHtml += '<th class="px-2 py-2 border-b border-gray-200 bg-gray-50 text-center text-xs font-semibold text-gray-600">휴일</th>';
    headHtml += '<th class="px-2 py-2 border-b border-gray-200 bg-gray-50 text-center text-xs font-semibold text-gray-600">조기(h)</th>';
    headHtml += '<th class="px-2 py-2 border-b border-gray-200 bg-gray-50 text-center text-xs font-semibold text-gray-600">연장(h)</th>';
    headHtml += '<th class="px-2 py-2 border-b border-gray-200 bg-gray-50 text-center text-xs font-semibold text-gray-600">조퇴(h)</th>';
    headHtml += '<th class="px-2 py-2 border-b border-gray-200 bg-gray-50 text-center text-xs font-semibold text-gray-600">휴일(h)</th>';
    headerRow.innerHTML = headHtml;

    if (state.employees.length === 0) {
      body.innerHTML = '<tr><td colspan="' + (state.daysInMonth + 13) + '" class="text-center py-12">'
        + '<i class="fas fa-users text-3xl mb-3 block text-gray-300"></i>'
        + '<div class="text-sm text-gray-500">조회된 직원이 없습니다</div>'
        + '</td></tr>';
      return;
    }

    var rowsHtml = '';
    state.employees.forEach(function (emp) {
      var summary = { work: 0, late: 0, earlyLeave: 0, absent: 0, vacation: 0, holiday: 0, early: 0, ot: 0, elHours: 0, holWork: 0, sick: 0, halfDay: 0 };
      var cells = '';
      for (var d = 1; d <= state.daysInMonth; d++) {
        var dateStr = state.month + '-' + pad(d);
        var dow = new Date(dateStr).getDay();
        var rec = state.recordsMap[key(emp.id, dateStr)];
        var t = rec ? rec.attendance_type : '';
        var ot = rec ? Number(rec.overtime_hours || 0) : 0;
        var eh = rec ? Number(rec.early_hours || 0) : 0;
        var elh = rec ? Number(rec.early_leave_hours || 0) : 0;
        var hwh = rec ? Number(rec.holiday_work_hours || 0) : 0;
        var lateMins = rec ? Number(rec.late_minutes || 0) : 0;
        if (rec) {
          if (t === 'ABSENT') summary.absent++;
          else if (t === 'NORMAL') summary.work++;
          else if (t === 'VACATION') summary.vacation++;
          else if (t === 'HOLIDAY') summary.holiday++;
          else if (t === 'HALF_AM' || t === 'HALF_PM' || t.startsWith('QUARTER_')) { summary.vacation += 0; summary.halfDay++; summary.work++; }
          else if (t === 'SICK') summary.sick++;
          else if (t === 'FAMILY_EVENT') summary.vacation++;
          // 지각: late_minutes > 0 (타입과 무관)
          if (lateMins > 0) summary.late++;
          // 조퇴: early_leave_hours > 0 (타입과 무관)
          if (elh > 0) summary.earlyLeave++;
          summary.early += eh;
          summary.ot += ot;
          summary.elHours += elh;
          summary.holWork += hwh;
        }
        var dirtyMark = state.dirty[key(emp.id, dateStr)] ? ' ring-2 ring-blue-400' : '';
        var label = rec ? typeLabel(t) : '';
        var color = rec ? typeColor(t) : 'bg-white text-gray-300 border-gray-100';
        // 뱃지: 조기출근+연장근무(상단), 지각(우하), 조퇴(하단 중앙)
        // 뱃지용 짧은 hh:mm (앞자리 0 제거: "1:30" 형식)
        function shortHM(v) { var h = Math.floor(v); var m = Math.round((v - h) * 60); if (m >= 60) { h++; m = 0; } return h + ':' + pad(m); }
        var otBadge = '', earlyBadge = '';
        if (eh > 0 && ot > 0) {
          // 복합 뱃지: 조기출근 + 연장근무 동시 → 상단 전체폭 합산
          otBadge = '<span class="absolute top-0 left-0 right-0 text-[7px] text-white px-0.5 rounded-b leading-tight text-center" style="background:linear-gradient(90deg,#2563eb 50%,#dc2626 50%);">' + shortHM(eh) + '|+' + shortHM(ot) + '</span>';
        } else if (ot > 0) {
          otBadge = '<span class="absolute top-0 right-0 text-[7px] bg-red-600 text-white px-0.5 rounded-bl leading-tight">+' + shortHM(ot) + '</span>';
        } else if (eh > 0) {
          earlyBadge = '<span class="absolute top-0 left-0 text-[7px] bg-blue-600 text-white px-0.5 rounded-br leading-tight">' + shortHM(eh) + '</span>';
        }
        var lateBadge = lateMins > 0 ? '<span class="absolute bottom-0 right-0 text-[7px] bg-amber-500 text-white px-0.5 rounded-tl leading-tight">지' + lateMins + '</span>' : '';
        var elBadge = elh > 0 ? '<span class="absolute bottom-0 left-1/2 -translate-x-1/2 text-[7px] bg-amber-600 text-white px-0.5 rounded-t leading-tight">조' + shortHM(elh) + '</span>' : '';
        var srcDot = '';
        var tooltip = '';
        if (rec) {
          tooltip = escapeHtml(buildTooltip(rec));
          if (rec.source) {
            var dotCls = sourceDotColor(rec.source);
            if (dotCls) {
              srcDot = '<span class="absolute bottom-0 left-0 w-1.5 h-1.5 rounded-full ' + dotCls + '" style="margin:1px;"></span>';
            }
          }
        }
        // 이상 감지 마크
        var anomaly = rec ? detectAnomaly(rec, dateStr) : '';
        var anomalyMark = anomaly ? '<span class="absolute top-0 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-red-500" title="' + escapeHtml(anomaly) + '"></span>' : '';

        // 주말 배경
        var weekendBg = (dow === 0 || dow === 6) ? ' bg-gray-50' : '';

        cells += '<td class="border border-gray-100 p-0 relative' + weekendBg + '">'
          + '<div class="att-cell cursor-pointer text-center text-[11px] font-semibold border rounded relative overflow-hidden ' + color + dirtyMark + '" '
          + 'data-emp="' + emp.id + '" data-date="' + dateStr + '" '
          + (tooltip ? 'title="' + tooltip + '" ' : '')
          + 'style="width:30px;height:30px;line-height:28px;margin:1px auto;">'
          + label
          + otBadge
          + earlyBadge
          + lateBadge
          + (lateMins > 0 ? '' : elBadge)
          + srcDot
          + anomalyMark
          + '</div></td>';
      }

      var deptLabel = emp.department === 'OFFICE' ? '사무' : emp.department === 'PRODUCTION' ? '생산' : emp.department === 'SALES' ? '영업' : (emp.department || '');

      rowsHtml += '<tr class="hover:bg-gray-50">'
        + '<td class="px-2 py-1 border-b border-gray-100 bg-white sticky left-0 z-10">'
        + '<input type="checkbox" class="att-chk" data-emp="' + emp.id + '" onchange="attendanceToggleRow(' + emp.id + ', this.checked)"></td>'
        + '<td class="px-3 py-1 border-b border-gray-100 bg-white sticky left-8 z-10 min-w-[120px]">'
        + '<div class="font-semibold text-gray-900 text-sm">' + escapeHtml(emp.name) + '</div>'
        + '<div class="text-[10px] text-gray-500">' + escapeHtml(emp.employee_code) + ' · ' + deptLabel + '</div>'
        + '</td>'
        + cells
        + '<td class="px-2 py-1 border-b border-gray-100 text-center text-sm font-medium text-gray-900">' + summary.work + '</td>'
        + '<td class="px-2 py-1 border-b border-gray-100 text-center text-sm font-medium ' + (summary.late > 0 ? 'text-amber-600' : 'text-gray-400') + '">' + summary.late + '</td>'
        + '<td class="px-2 py-1 border-b border-gray-100 text-center text-sm font-medium ' + (summary.earlyLeave > 0 ? 'text-amber-600' : 'text-gray-400') + '">' + summary.earlyLeave + '</td>'
        + '<td class="px-2 py-1 border-b border-gray-100 text-center text-sm font-medium ' + (summary.absent > 0 ? 'text-red-600' : 'text-gray-400') + '">' + summary.absent + '</td>'
        + '<td class="px-2 py-1 border-b border-gray-100 text-center text-sm font-medium ' + (summary.vacation > 0 ? 'text-blue-600' : 'text-gray-400') + '">' + summary.vacation + '</td>'
        + '<td class="px-2 py-1 border-b border-gray-100 text-center text-sm font-medium ' + (summary.sick > 0 ? 'text-purple-600' : 'text-gray-400') + '">' + summary.sick + '</td>'
        + '<td class="px-2 py-1 border-b border-gray-100 text-center text-sm font-medium text-gray-400">' + summary.holiday + '</td>'
        + '<td class="px-2 py-1 border-b border-gray-100 text-center text-sm font-medium ' + (summary.early > 0 ? 'text-blue-600' : 'text-gray-400') + '">' + fmtHM(summary.early) + '</td>'
        + '<td class="px-2 py-1 border-b border-gray-100 text-center text-sm font-medium ' + (summary.ot > 0 ? 'text-red-600' : 'text-gray-400') + '">' + fmtHM(summary.ot) + '</td>'
        + '<td class="px-2 py-1 border-b border-gray-100 text-center text-sm font-medium ' + (summary.elHours > 0 ? 'text-amber-600' : 'text-gray-400') + '">' + fmtHM(summary.elHours) + '</td>'
        + '<td class="px-2 py-1 border-b border-gray-100 text-center text-sm font-medium ' + (summary.holWork > 0 ? 'text-green-600' : 'text-gray-400') + '">' + fmtHM(summary.holWork) + '</td>'
        + '</tr>';
    });
    body.innerHTML = rowsHtml;

    // 셀 클릭 → 상세 모달 열기 (유형 순환 제거)
    var cells = body.querySelectorAll('.att-cell');
    for (var i = 0; i < cells.length; i++) {
      cells[i].addEventListener('click', onCellClick);
    }
  }

  // 수정 시 source 전환 (CAPS → CAPS_EDITED, 없으면 MANUAL)
  function bumpSource(rec) {
    if (!rec) return;
    if (rec.source === 'CAPS') rec.source = 'CAPS_EDITED';
    else if (!rec.source) rec.source = 'MANUAL';
  }

  // 셀 클릭 → 상세 모달 열기 (안전: 데이터 변경 없음)
  function onCellClick(e) {
    var empId = parseInt(this.dataset.emp, 10);
    var date = this.dataset.date;
    var emp = state.employees.find(function (x) { return x.id === empId; });
    var rec = state.recordsMap[key(empId, date)] || { attendance_type: '', work_hours: 0, overtime_hours: 0 };
    state.editing = { employee_id: empId, date: date, empName: emp ? emp.name : '' };

    // 모달 정보 채우기
    document.getElementById('attDetailInfo').textContent = (emp ? emp.name : '') + ' · ' + date;
    document.getElementById('attDetailType').value = rec.attendance_type || 'NORMAL';
    document.getElementById('attDetailIn').value = timeFromDatetime(rec.check_in_time);
    document.getElementById('attDetailOut').value = timeFromDatetime(rec.check_out_time);
    document.getElementById('attDetailHours').value = rec.work_hours || 0;
    document.getElementById('attDetailLateMin').value = rec.late_minutes || 0;
    document.getElementById('attDetailEarly').value = rec.early_hours || 0;
    document.getElementById('attDetailOt').value = rec.overtime_hours || 0;
    document.getElementById('attDetailEarlyLeave').value = rec.early_leave_hours || 0;
    document.getElementById('attDetailHolidayWork').value = rec.holiday_work_hours || 0;
    document.getElementById('attDetailNotes').value = rec.notes || '';

    // 이상 감지 표시
    var anomaly = detectAnomaly(rec, date);
    var anomalyEl = document.getElementById('attDetailAnomaly');
    if (anomalyEl) {
      if (anomaly) {
        anomalyEl.innerHTML = '<i class="fas fa-exclamation-triangle text-red-500 mr-1"></i>' + escapeHtml(anomaly);
        anomalyEl.className = 'text-xs text-red-600 bg-red-50 rounded px-2 py-1 mb-2';
        anomalyEl.style.display = 'block';
      } else {
        anomalyEl.style.display = 'none';
      }
    }

    // 출처 표시
    var sourceEl = document.getElementById('attDetailSource');
    if (sourceEl) {
      if (rec.source) {
        var dotCls = sourceDotColor(rec.source);
        sourceEl.innerHTML = '<span class="inline-block w-2 h-2 rounded-full ' + dotCls + ' mr-1"></span>' + sourceLabel(rec.source);
        if (rec.caps_synced_at) sourceEl.innerHTML += ' (' + String(rec.caps_synced_at).slice(0, 16).replace('T', ' ') + ')';
        sourceEl.style.display = 'block';
      } else {
        sourceEl.innerHTML = '<span class="inline-block w-2 h-2 rounded-full bg-gray-300 mr-1"></span>기록 없음';
        sourceEl.style.display = 'block';
      }
    }

    var modal = document.getElementById('attDetailModal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
  }

  function closeDetail() {
    var modal = document.getElementById('attDetailModal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    state.editing = null;
  }

  function applyDetail() {
    if (!state.editing) return;
    var e = state.editing;
    var k = key(e.employee_id, e.date);
    var rec = state.recordsMap[k] || { employee_id: e.employee_id, work_date: e.date };
    rec.attendance_type = document.getElementById('attDetailType').value;
    rec.status = rec.attendance_type === 'ABSENT' ? 'ABSENT' : (rec.attendance_type === 'VACATION' ? 'VACATION' : 'PRESENT');
    var inTime = document.getElementById('attDetailIn').value;
    var outTime = document.getElementById('attDetailOut').value;
    rec.check_in_time = inTime ? (e.date + 'T' + inTime + ':00') : null;
    rec.check_out_time = outTime ? (e.date + 'T' + outTime + ':00') : null;
    rec.work_hours = parseFloat(document.getElementById('attDetailHours').value) || 0;
    rec.late_minutes = parseInt(document.getElementById('attDetailLateMin').value) || 0;
    rec.early_hours = parseFloat(document.getElementById('attDetailEarly').value) || 0;
    rec.overtime_hours = parseFloat(document.getElementById('attDetailOt').value) || 0;
    rec.early_leave_hours = parseFloat(document.getElementById('attDetailEarlyLeave').value) || 0;
    rec.holiday_work_hours = parseFloat(document.getElementById('attDetailHolidayWork').value) || 0;
    rec.notes = document.getElementById('attDetailNotes').value || null;
    bumpSource(rec);
    state.recordsMap[k] = rec;
    state.dirty[k] = true;
    closeDetail();
    renderGrid();
    updateSaveButton();
    updateAnomalyCount();
  }

  // 체크박스
  function toggleAll(checked) {
    var boxes = document.querySelectorAll('.att-chk');
    for (var i = 0; i < boxes.length; i++) {
      boxes[i].checked = checked;
      var empId = parseInt(boxes[i].dataset.emp, 10);
      if (checked) state.selected[empId] = true;
      else delete state.selected[empId];
    }
    updateSelectedCount();
  }
  function toggleRow(empId, checked) {
    if (checked) state.selected[empId] = true;
    else delete state.selected[empId];
    updateSelectedCount();
  }
  function updateSelectedCount() {
    var n = Object.keys(state.selected).length;
    var el = document.getElementById('attSelectedCount');
    if (el) el.textContent = '선택: ' + n + '명';
  }

  // 일괄 적용
  function applyBulk() {
    var selectedIds = Object.keys(state.selected).map(function (x) { return parseInt(x, 10); });
    if (selectedIds.length === 0) { showToast('직원을 선택해주세요.', 'warning'); return; }
    var date = document.getElementById('attBulkDate').value;
    if (!date) { showToast('적용할 날짜를 선택해주세요.', 'warning'); return; }
    var type = document.getElementById('attBulkType').value;
    var ot = parseFloat(document.getElementById('attBulkOvertime').value) || 0;

    selectedIds.forEach(function (empId) {
      var k = key(empId, date);
      var rec = state.recordsMap[k] || { employee_id: empId, work_date: date };
      rec.attendance_type = type;
      rec.status = (type === 'ABSENT') ? 'ABSENT' : (type === 'VACATION' ? 'VACATION' : 'PRESENT');
      if (type === 'ABSENT') {
        rec.work_hours = 0;
        rec.overtime_hours = 0;
      } else {
        rec.work_hours = rec.work_hours || 8;
        if (ot > 0) rec.overtime_hours = (rec.overtime_hours || 0) + ot;
      }
      bumpSource(rec);
      state.recordsMap[k] = rec;
      state.dirty[k] = true;
    });
    renderGrid();
    updateSaveButton();
    updateAnomalyCount();
  }

  function updateSaveButton() {
    var n = Object.keys(state.dirty).length;
    var btn = document.getElementById('attSaveBtn');
    var label = document.getElementById('attSaveLabel');
    if (!btn) return;
    btn.disabled = n === 0;
    if (label) label.textContent = n > 0 ? ('저장 (' + n + '건)') : '저장';
  }

  // 저장
  async function saveAll() {
    var dirtyKeys = Object.keys(state.dirty);
    if (dirtyKeys.length === 0) { showToast('변경사항이 없습니다.', 'warning'); return; }

    var items = dirtyKeys.map(function (k) {
      var rec = state.recordsMap[k];
      return {
        employee_id: rec.employee_id,
        work_date: rec.work_date,
        attendance_type: rec.attendance_type,
        status: rec.status || 'PRESENT',
        check_in: rec.check_in_time || null,
        check_out: rec.check_out_time || null,
        work_hours: rec.work_hours || 0,
        overtime_hours: rec.overtime_hours || 0,
        early_hours: rec.early_hours || 0,
        early_leave_hours: rec.early_leave_hours || 0,
        holiday_work_hours: rec.holiday_work_hours || 0,
        late_minutes: rec.late_minutes || 0,
        notes: rec.notes || null
      };
    });

    try {
      var res = await axios.patch('/api/attendance/bulk', { items: items });
      var data = (res.data && res.data.data) || {};
      showToast((data.upserted || 0) + '건 저장 완료' + (data.errors_count ? ' (실패 ' + data.errors_count + '건)' : ''), 'success');
      state.dirty = {};
      updateSaveButton();
      loadMonth();
    } catch (e) {
      console.error(e);
      showToast('저장 실패: ' + (e.message || e), 'error');
    }
  }

  // CAPS 동기화 트리거 — MES API 경유 폴링 방식
  async function syncCaps() {
    if (!(await showConfirm('CAPS 서버에서 최신 근태 데이터를 가져오시겠습니까?\n(워커가 30초 이내에 동기화를 실행합니다)'))) return;
    var btn = document.getElementById('attCapsSyncBtn');
    var originalHtml = btn ? btn.innerHTML : '';
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i> 요청 중...';
    }
    try {
      // MES API를 통해 동기화 요청 플래그 설정 → 워커가 폴링으로 감지
      var res = await axios.post('/api/caps/sync/trigger');
      if (res.data && res.data.success) {
        showToast('동기화 요청 완료 — 워커가 곧 실행합니다 (최대 30초)', 'success');
        // 45초 후 자동 새로고침 (워커 폴링 30초 + 처리 시간)
        setTimeout(function() { loadMonth(); }, 45000);
      } else {
        showToast('동기화 요청 실패: ' + (res.data.error || '알 수 없는 오류'), 'error');
      }
    } catch (e) {
      console.error(e);
      var msg = (e.response && e.response.data && (e.response.data.error || e.response.data.detail)) || e.message || e;
      showToast('동기화 요청 실패: ' + msg, 'error');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = originalHtml || '<i class="fas fa-sync-alt mr-1"></i> CAPS 동기화';
      }
    }
  }

  // 초기화
  document.addEventListener('DOMContentLoaded', function () {
    var m = document.getElementById('attMonth');
    if (m) {
      var now = new Date();
      m.value = now.getFullYear() + '-' + pad(now.getMonth() + 1);
    }
    var bd = document.getElementById('attBulkDate');
    if (bd) bd.value = new Date().toISOString().slice(0, 10);
  });
  // SPA 네비게이션 대비
  (function () {
    var m = document.getElementById('attMonth');
    if (m && !m.value) {
      var now = new Date();
      m.value = now.getFullYear() + '-' + pad(now.getMonth() + 1);
    }
    var bd = document.getElementById('attBulkDate');
    if (bd && !bd.value) bd.value = new Date().toISOString().slice(0, 10);
    if (m && m.value) loadMonth();
  })();

  // 전역 핸들러 등록
  window.attendanceLoadMonth = loadMonth;
  window.attendanceSaveAll = saveAll;
  window.attendanceToggleAll = toggleAll;
  window.attendanceToggleRow = toggleRow;
  window.attendanceApplyBulk = applyBulk;
  window.attendanceCloseDetail = closeDetail;
  window.attendanceApplyDetail = applyDetail;
  window.attendanceSyncCaps = syncCaps;
})();
