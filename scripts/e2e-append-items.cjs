// E2E: POST /api/orders/:id/items (ia-editor 라인 append) 검증
// 흐름: login → 주문 생성(1라인) → append(2라인) → 카드/품목/합계/카드번호 연속 검증 + 가드(400/404/409)
const BASE = (process.env.SMOKE_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
if (/pages\.dev|dongsanplan\.com/i.test(BASE) && process.env.ALLOW_PROD !== '1') {
  console.error('\x1b[31m[guard] 프로덕션 대상 e2e 차단:\x1b[0m ' + BASE + '\n  → prod에 테스트 데이터가 쌓입니다. 로컬에서 실행하세요. 정말 필요하면 ALLOW_PROD=1 설정.');
  process.exit(1);
}
const USER = process.env.SMOKE_USER || 'admin';
const PASS = process.env.SMOKE_PASS || 'password';

async function j(path, opts, token) {
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(opts && opts.headers) },
  });
  let data = null; try { data = await res.json(); } catch (_) {}
  return { status: res.status, data };
}
const pass = (m) => console.log(`  ✅ ${m}`);
const fail = (m) => { console.log(`  ❌ ${m}`); process.exitCode = 1; };

(async () => {
  // 1. login
  const lg = await j('/api/auth/login', { method: 'POST', body: JSON.stringify({ username: USER, password: PASS }) });
  const token = lg.data && lg.data.data && lg.data.data.token;
  if (!token) return fail(`login 실패 ${lg.status} ${JSON.stringify(lg.data)}`);
  pass('login');

  // 2. 거래처 + 품목 확보
  const cl = await j('/api/clients?limit=1&active=1', { method: 'GET' }, token);
  const client = cl.data && cl.data.data && (cl.data.data.clients || cl.data.data)[0];
  if (!client) return fail(`거래처 없음 ${JSON.stringify(cl.data).slice(0,200)}`);
  const it = await j('/api/items?limit=3', { method: 'GET' }, token);
  const items = (it.data && it.data.data) || [];
  if (!items.length) return fail('품목 없음');
  const item = items[0];
  pass(`거래처 #${client.id} / 품목 #${item.id} ${item.item_name}`);

  // 3. 주문 생성 (1라인, 솔벤시트류면 OUTPUT 카드 생성)
  const cr = await j('/api/orders', { method: 'POST', body: JSON.stringify({
    client_id: client.id, delivery_date: '2026-07-01',
    items: [{ item_id: item.id, item_name: item.item_name, width_mm: 1000, height_mm: 2000, quantity: 1, unit: 'EA', unit_price: 10000, vat_included: 1 }],
  }) }, token);
  const orderId = cr.data && cr.data.data && cr.data.data.id;
  if (!orderId) return fail(`주문 생성 실패 ${cr.status} ${JSON.stringify(cr.data)}`);
  pass(`주문 생성 #${orderId} ${cr.data.data.order_number} (${cr.data.message})`);

  // 3b. 생성 직후 상태 스냅샷 (GET /:id → data = 주문 필드 평탄화 + items + billing_groups)
  const before = await j(`/api/orders/${orderId}`, { method: 'GET' }, token);
  const bOrder = before.data.data;
  const bItems = (bOrder.items || []).length;
  const bTotal = bOrder.final_amount || 0;
  const bStatus = bOrder.status;
  const bGroups = (bOrder.billing_groups || []).length;
  // 카드 수
  const bCards = await j(`/api/cards?order_id=${orderId}&limit=100`, { method: 'GET' }, token);
  const bCardArr = (bCards.data && bCards.data.data && (bCards.data.data.cards || bCards.data.data)) || [];
  console.log(`  · before: items=${bItems} cards=${Array.isArray(bCardArr)?bCardArr.length:'?'} total=${bTotal} status=${bStatus} billing_groups=${bGroups}`);

  // 4. append 2라인
  const ap = await j(`/api/orders/${orderId}/items`, { method: 'POST', body: JSON.stringify({
    items: [
      { item_id: item.id, item_name: item.item_name, width_mm: 900, height_mm: 1200, quantity: 2, unit: 'EA', unit_price: 5000, vat_included: 1 },
      { item_id: item.id, item_name: item.item_name, width_mm: 600, height_mm: 600, quantity: 3, unit: 'EA', unit_price: 3000, vat_included: 1 },
    ],
  }) }, token);
  if (ap.status !== 200 || !ap.data.success) return fail(`append 실패 ${ap.status} ${JSON.stringify(ap.data)}`);
  pass(`append OK: ${ap.data.message}`);
  if (ap.data.data.added === 2) pass('added=2'); else fail(`added=${ap.data.data.added} (기대 2)`);

  // 5. after 검증
  const after = await j(`/api/orders/${orderId}`, { method: 'GET' }, token);
  const aOrder = after.data.data;
  const aItems = (aOrder.items || []).length;
  const aTotal = aOrder.final_amount || 0;
  if (aItems === bItems + 2) pass(`품목 ${bItems}→${aItems} (+2)`); else fail(`품목 ${bItems}→${aItems} (기대 +2)`);
  if (aTotal > bTotal) pass(`합계 ${bTotal}→${aTotal} (증가)`); else fail(`합계 ${bTotal}→${aTotal} (증가 기대)`);

  const aCards = await j(`/api/cards?order_id=${orderId}&limit=100`, { method: 'GET' }, token);
  const aCardArr = (aCards.data && aCards.data.data && (aCards.data.data.cards || aCards.data.data)) || [];
  if (Array.isArray(aCardArr) && Array.isArray(bCardArr)) {
    const nums = aCardArr.map(c => c.card_number).filter(Boolean);
    const uniq = new Set(nums);
    if (nums.length === uniq.size) pass(`카드번호 유일(중복 없음): [${nums.join(', ')}]`);
    else fail(`카드번호 중복! [${nums.join(', ')}]`);
    if (aCardArr.length >= bCardArr.length) pass(`카드 ${bCardArr.length}→${aCardArr.length}`);
    else fail(`카드 감소 ${bCardArr.length}→${aCardArr.length}`);
  }

  // 6. 가드: 빈 items → 400
  const g1 = await j(`/api/orders/${orderId}/items`, { method: 'POST', body: JSON.stringify({ items: [] }) }, token);
  if (g1.status === 400) pass('가드: 빈 items → 400'); else fail(`빈 items → ${g1.status} (기대 400)`);

  // 7. 가드: 없는 주문 → 404
  const g2 = await j(`/api/orders/99999999/items`, { method: 'POST', body: JSON.stringify({ items: [{ item_id: item.id, quantity: 1, unit_price: 1000 }] }) }, token);
  if (g2.status === 404) pass('가드: 없는 주문 → 404'); else fail(`없는 주문 → ${g2.status} (기대 404)`);

  // 8. 가드: SHIPPED 주문 차단 → 409 (상태 변경 후 시도)
  const sh = await j(`/api/orders/${orderId}/status`, { method: 'PATCH', body: JSON.stringify({ status: 'SHIPPED' }) }, token);
  if (sh.status === 200) {
    const g3 = await j(`/api/orders/${orderId}/items`, { method: 'POST', body: JSON.stringify({ items: [{ item_id: item.id, quantity: 1, unit_price: 1000 }] }) }, token);
    if (g3.status === 409) pass('가드: SHIPPED 주문 → 409'); else fail(`SHIPPED 주문 → ${g3.status} (기대 409): ${JSON.stringify(g3.data)}`);
  } else {
    console.log(`  ⚠ status→SHIPPED 전이 실패(${sh.status}) — 409 가드 테스트 skip`);
  }

  console.log(process.exitCode ? '\n❌ 일부 실패' : '\n✅ 전부 통과');
})();
