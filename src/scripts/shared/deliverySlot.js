// shared/deliverySlot.js — 직배 배차 슬롯·완료기한 (클라 사본)
//
// ⚠️ 서버 정본 = src/utils/productionDeadline.ts. 상수가 갈리면
//    "주문서에서 고른 슬롯 ≠ 칸반이 계산한 마감" 이 된다 — 한쪽만 고치지 말 것.
//    게이트 = npm run test:delivery-slot (양쪽 상수·계산 결과를 대조한다).
//
// 규칙: 직배는 배차가 오전편·오후편 2회. 완료기한 = 오전 **전날 18:00** · 오후 당일 13:00.
//       납품시간 필드에는 대표시각(오전 09:00 / 오후 14:00)을 병기해 기존 화면을 유지한다.
//
// ?raw 결합 스크립트라 전역이 한 스코프에 쏟아진다 — 같은 페이지에 두 번 실려도 죽지 않게 IIFE + 존재 가드.
(function() {
    if (window.MES_SLOT) return;

    var LABELS = { AM: '오전', PM: '오후' };
    var REPRESENTATIVE_TIME = { AM: '09:00', PM: '14:00' };
    var DEADLINE = { AM: { dayOffset: -1, time: '18:00' }, PM: { dayOffset: 0, time: '13:00' } };

    // src/constants/deliveryMethod.ts ALIASES 사본 — 슬롯을 쓰는 출고방법 판정용
    var DIRECT_ALIASES = ['직접배송', '직배', '직접 배송', '자차배송'];

    function isSlotMethod(method) {
        var v = String(method == null ? '' : method).trim();
        return DIRECT_ALIASES.indexOf(v) >= 0;
    }

    function normalizeSlot(v) {
        var s = String(v == null ? '' : v).trim().toUpperCase();
        return (s === 'AM' || s === 'PM') ? s : null;
    }

    function resolveSlot(method, slot) {
        return isSlotMethod(method) ? normalizeSlot(slot) : null;
    }

    // 'YYYY-MM-DD' + 일수 → 'YYYY-MM-DD' (UTC 산술 — 로컬 시간대 영향 없음)
    function addDays(ymd, days) {
        var p = String(ymd || '').split('-');
        var y = Number(p[0]), m = Number(p[1]), d = Number(p[2]);
        if (!y || !m || !d) return ymd;
        return new Date(Date.UTC(y, m - 1, d) + days * 86400000).toISOString().slice(0, 10);
    }

    // 생산 완료기한 'YYYY-MM-DD HH:MM' (KST naive). 미정이면 null.
    function deadline(o) {
        o = o || {};
        var date = String(o.delivery_date || '').trim();
        if (!date) return null;
        var slot = resolveSlot(o.delivery_method, o.delivery_slot);
        if (slot) return addDays(date, DEADLINE[slot].dayOffset) + ' ' + DEADLINE[slot].time;
        var time = String(o.delivery_time || '').trim();
        return time ? date + ' ' + time : null;
    }

    // 표기 — `직배 오전` · `한진택배 18:00` · `방문수령`
    function timing(o) {
        o = o || {};
        var method = String(o.delivery_method || '').trim();
        var slot = resolveSlot(method, o.delivery_slot);
        if (slot) return (method + ' ' + LABELS[slot]).trim();
        var time = String(o.delivery_time || '').trim();
        return time ? (method + ' ' + time).trim() : method;
    }

    // 현재 KST naive 'YYYY-MM-DD HH:MM'
    function nowKst() {
        return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 16).replace('T', ' ');
    }

    // 주문서 입력 가드 — 오전편은 마감(전날 18:00) 전에만 고를 수 있다.
    // 서버는 이 규칙으로 막지 않는다(과거 주문 수정·복사가 전부 400 이 된다).
    function selectable(slot, deliveryDate, now) {
        if (slot === 'PM') return true;
        if (!deliveryDate) return true;
        var dl = addDays(deliveryDate, DEADLINE.AM.dayOffset) + ' ' + DEADLINE.AM.time;
        return (now || nowKst()) <= dl;
    }

    window.MES_SLOT = {
        LABELS: LABELS,
        REPRESENTATIVE_TIME: REPRESENTATIVE_TIME,
        DEADLINE: DEADLINE,
        isSlotMethod: isSlotMethod,
        normalizeSlot: normalizeSlot,
        resolveSlot: resolveSlot,
        addDays: addDays,
        deadline: deadline,
        timing: timing,
        nowKst: nowKst,
        selectable: selectable
    };
})();
