#!/usr/bin/env node
/**
 * 주문서 왕복(라운드트립) 감사 — "수정 저장이 데이터를 소실시키는" 클래스를 기계로 잡는다.
 *
 *   흐름: API로 전 필드를 채운 주문 생성 → GET(A) → 실제 수정 화면(?edit=)을 헤드리스로 열어
 *        아무것도 만지지 않고 「수정 저장」 클릭 → GET(B) → A/B 필드별 대조.
 *
 *   왜 브라우저인가: API 왕복(PUT에 A를 되돌려주기)은 폼 복원 누락을 못 잡는다 — 2026-08-10
 *   실사례(수정화면이 finishing을 복원하지 않아 저장 때마다 빈값으로 소실)가 정확히 이 부류.
 *
 *   사용: 로컬 dev 서버(dist 서빙)가 떠 있는 상태에서
 *     node scripts/orderform-roundtrip.cjs            # 기본 http://localhost:3000
 *     RT_URL=... RT_USER=... RT_PASS=... 로 재지정
 *
 *   종료코드: 소실/변형 발견 시 1 (스모크처럼 게이트로 사용).
 *   ⚠️ prod 를 겨누지 말 것 — 주문 채번을 소비하고 실데이터에 시험 주문이 생긴다.
 */
const { chromium } = require('playwright-core');

const BASE = (process.env.RT_URL || 'http://localhost:3000').replace(/\/$/, '');
const USER = process.env.RT_USER || 'admin';
const PASS = process.env.RT_PASS || 'password';

const log = (s) => console.log(s);

async function api(token, method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || j.success === false) throw new Error(`${method} ${path} → ${res.status} ${j.error || ''}`);
  return j;
}

// JSON 문자열 필드는 파싱해 키 정렬 후 비교(직렬화 순서 차이는 소실이 아니다)
function norm(v) {
  if (v === undefined || v === null) return null;
  if (typeof v === 'string') {
    const t = v.trim();
    if ((t.startsWith('{') && t.endsWith('}')) || (t.startsWith('[') && t.endsWith(']'))) {
      try { return JSON.stringify(sortDeep(JSON.parse(t))); } catch { /* fallthrough */ }
    }
    return t;
  }
  if (typeof v === 'number') return v;
  if (typeof v === 'object') return JSON.stringify(sortDeep(v));
  return v;
}
function sortDeep(o) {
  if (Array.isArray(o)) return o.map(sortDeep);
  if (o && typeof o === 'object') {
    return Object.keys(o).sort().reduce((acc, k) => { acc[k] = sortDeep(o[k]); return acc; }, {});
  }
  return o;
}
// 숫자 동등(문자 '90' vs 90) 허용
function eq(a, b) {
  if (norm(a) === norm(b)) return true;
  const na = Number(a), nb = Number(b);
  if (!Number.isNaN(na) && !Number.isNaN(nb) && a !== '' && b !== '' && a !== null && b !== null) return na === nb;
  return false;
}

(async () => {
  let orderId = null;
  let token = null;
  let failures = [];
  try {
    // ── 로그인 ─────────────────────────────────────────────────────────
    const lg = await api(null, 'POST', '/api/auth/login', { username: USER, password: PASS });
    token = lg.data && lg.data.token;
    if (!token) throw new Error('로그인 실패(token 없음)');

    // ── 시드 확보: 거래처 1 + 생산 품목 1 + 마감방식 1 ──────────────────
    const cj = await api(token, 'GET', '/api/clients?limit=1');
    const client = (cj.data.clients || cj.data || [])[0];
    if (!client) throw new Error('거래처가 없어 왕복을 만들 수 없습니다');
    const ij = await api(token, 'GET', '/api/items?type=sales&exclude_type=MATERIAL&limit=10');
    const prodItem = (ij.data || []).find((x) => x.item_type === 'PRODUCT') || (ij.data || [])[0];
    if (!prodItem) throw new Error('판매 품목이 없어 왕복을 만들 수 없습니다');
    const fm = await api(token, 'GET', '/api/finishing/methods');
    const finMethod = (fm.data || [])[0] ? fm.data[0].name : '';

    // ── 전 필드를 채운 주문 생성 ───────────────────────────────────────
    // post_processing 은 저장 스키마(코드/방향/params)를 그대로 사용 — 소실 검출이 목적이라
    // 실제 옵션 id 와 무관하게 왕복 보존 여부만 본다.
    const pp = [
      { id: 1, code: 'PUNCHING', name: '펀칭', margin_left: 0, margin_right: 0, margin_top: 0, margin_bottom: 0,
        params: { corner_tl: 1, corner_tr: 1, side_top: 2, side_bottom: 0, side_left: 0, side_right: 0, corner_bl: 0, corner_br: 0 }, price: 0 },
    ];
    const finishing = finMethod ? { top: finMethod, bottom: finMethod, left: '', right: '', top_cm: 3 } : { top: '', bottom: '', left: '', right: '' };
    const orderBody = {
      client_id: client.id,
      delivery_date: '2026-09-01',
      priority: 'URGENT',
      reception_location: '왕복감사-접수처',
      delivery_info: '왕복감사-배송정보',
      delivery_method: '직배',        // 직배로 두어야 배차 슬롯까지 왕복 검사가 걸린다
      delivery_time: '09:00',
      delivery_slot: 'AM',
      discount_amount: 1000,
      notes: '왕복감사-비고',
      contact_phone: '043-000-0000',
      contact_mobile: '010-0000-0000',
      shipping_payment: 'PREPAID',
      items: [{
        item_id: prodItem.id,
        item_name: prodItem.item_name,
        category_name: prodItem.category || prodItem.category_direct || '',
        width: 90, height: 60, quantity: 3, unit: prodItem.unit || 'EA',
        unit_price: 12000, vat_included: 1,
        post_processing: JSON.stringify(pp),
        finishing: JSON.stringify(finishing),
        content: '왕복감사-내용',
        sort_order: 1,
        price_status: 'CONFIRMED',
        // 라인 에누리(수동 금액): 자동 36,000 → 35,000
        amount: 35000, discount_reason: '왕복감사-에누리',
      }],
    };
    const created = await api(token, 'POST', '/api/orders', orderBody);
    orderId = created.data.id;
    log(`▶ 시험 주문 생성: #${orderId} (${created.data.order_number || ''})`);

    // ── 스냅샷 A ──────────────────────────────────────────────────────
    const A = (await api(token, 'GET', '/api/orders/' + orderId)).data;

    // ── 수정 화면 왕복 (아무것도 만지지 않고 저장) ─────────────────────
    const browser = await chromium.launch();
    try {
      const page = await (await browser.newContext()).newPage();
      await page.addInitScript(([t]) => { localStorage.setItem('token', t); }, [token]);
      await page.goto(BASE + '/order-form?edit=' + orderId, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => {
        const b = document.getElementById('submitBtn');
        return b && b.textContent.includes('수정 저장');
      }, { timeout: 15000 });
      // 비동기 복원(마감·후가공·프리셋) 정착 대기
      await page.waitForTimeout(2500);
      await page.click('#submitBtn');
      await page.waitForURL('**/orders**', { timeout: 20000 });
    } finally {
      await browser.close();
    }

    // ── 스냅샷 B + 대조 ────────────────────────────────────────────────
    const B = (await api(token, 'GET', '/api/orders/' + orderId)).data;

    const ORDER_FIELDS = ['delivery_date', 'priority', 'reception_location', 'delivery_info', 'delivery_method',
      'delivery_time', 'delivery_slot', 'discount_amount', 'notes', 'contact_phone', 'contact_mobile', 'shipping_payment',
      'sales_rep_id', 'total_amount', 'vat_amount', 'final_amount'];
    const ITEM_FIELDS = ['item_id', 'item_name', 'category_name', 'width', 'height', 'quantity', 'unit',
      'unit_price', 'amount', 'auto_amount', 'line_discount', 'discount_reason', 'vat_included',
      'post_processing', 'finishing', 'content', 'specification', 'ai_group_index', 'scale_factor',
      'ai_analysis_id', 'price_status', 'assigned_entity_id', 'dxf_analysis_id', 'dxf_file_name'];

    // GET /:id 응답은 flat({...order, items}) — order 필드는 최상위에서 읽는다
    for (const f of ORDER_FIELDS) {
      if (!eq(A[f], B[f])) failures.push(`order.${f}: ${JSON.stringify(A[f])} → ${JSON.stringify(B[f])}`);
    }
    const ai = (A.items || []).filter((x) => !x.parent_item_id);
    const bi = (B.items || []).filter((x) => !x.parent_item_id);
    if (ai.length !== bi.length) {
      failures.push(`items 수: ${ai.length} → ${bi.length}`);
    } else {
      for (let k = 0; k < ai.length; k++) {
        for (const f of ITEM_FIELDS) {
          if (!eq(ai[k][f], bi[k][f])) failures.push(`items[${k}].${f}: ${JSON.stringify(ai[k][f])} → ${JSON.stringify(bi[k][f])}`);
        }
      }
    }
  } catch (e) {
    failures.push('실행 오류: ' + e.message);
  } finally {
    // 시험 주문 정리 (실패해도 계속)
    if (orderId && token) {
      try { await api(token, 'DELETE', '/api/orders/' + orderId); log(`▶ 시험 주문 삭제: #${orderId}`); }
      catch (e) { log(`⚠️ 시험 주문 삭제 실패(#${orderId}): ${e.message}`); }
    }
  }

  if (failures.length) {
    log('\n❌ 왕복 소실/변형 ' + failures.length + '건:');
    failures.forEach((f) => log('  - ' + f));
    process.exit(1);
  }
  log('\n✅ 왕복 보존 — 소실 0건');
})();
