/**
 * 멀티사업자 브라우저 검증 스크립트
 * 실행: node scripts/entity-verify.mjs
 */
import { chromium } from 'playwright';

const BASE = 'http://localhost:3000';
const results = [];
let pass = 0, fail = 0;

function log(status, msg) {
  const icon = status === 'PASS' ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m';
  console.log(`  ${icon} ${msg}`);
  if (status === 'PASS') pass++; else fail++;
  results.push({ status, msg });
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  console.log('\n\x1b[1m=== 멀티사업자 브라우저 검증 ===\x1b[0m\n');

  // 1. 로그인
  console.log('\x1b[36m▶ 로그인\x1b[0m');
  await page.goto(BASE + '/login');
  await page.fill('#username', 'admin');
  await page.fill('#password', 'password');
  await page.click('button[type="submit"]');
  await page.waitForURL('**/dashboard', { timeout: 10000 }).catch(() => {});
  const url = page.url();
  if (url.includes('dashboard')) {
    log('PASS', '로그인 성공 → 대시보드 이동');
  } else {
    log('FAIL', '로그인 실패: ' + url);
    await browser.close();
    return;
  }

  // 2. 사이드바 법인 선택 확인
  console.log('\n\x1b[36m▶ 사이드바 법인 선택\x1b[0m');
  await page.waitForTimeout(2000);
  const entityName = await page.textContent('#entityName').catch(() => null);
  if (entityName && entityName.includes('동산기획')) {
    log('PASS', '사이드바 법인명: ' + entityName);
  } else {
    log('FAIL', '사이드바 법인명 이상: ' + entityName);
  }

  // 드롭다운 열기
  await page.click('#entitySwitcherBtn').catch(() => {});
  await page.waitForTimeout(500);
  const dropdown = await page.textContent('#entityDropdown').catch(() => '');
  if (dropdown.includes('선명') && dropdown.includes('동산기획(청주)') && dropdown.includes('전체')) {
    log('PASS', '드롭다운 4개 법인 표시');
  } else {
    log('FAIL', '드롭다운 내용: ' + dropdown.substring(0, 100));
  }
  // 닫기
  await page.click('body', { position: { x: 500, y: 500 } }).catch(() => {});

  // 3. 동산기획(entity=1) 주문 확인
  console.log('\n\x1b[36m▶ 동산기획 — 주문 목록\x1b[0m');
  await page.goto(BASE + '/orders');
  await page.waitForTimeout(2000);
  const ordersContent1 = await page.textContent('body').catch(() => '');
  const hasOrders1 = !ordersContent1.includes('주문이 없습니다') && !ordersContent1.includes('데이터가 없습니다');
  log(hasOrders1 ? 'PASS' : 'FAIL', '동산기획 주문 데이터 ' + (hasOrders1 ? '있음' : '없음'));

  // 4. 선명(entity=2)으로 전환
  console.log('\n\x1b[36m▶ 선명 법인 전환\x1b[0m');
  // API로 직접 전환
  const token = await page.evaluate(() => localStorage.getItem('token'));
  const switchRes = await page.evaluate(async () => {
    const t = localStorage.getItem('token');
    const res = await fetch('/api/auth/switch-entity', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + t, 'Content-Type': 'application/json' },
      body: JSON.stringify({ entity_id: 2 })
    });
    const data = await res.json();
    if (data.success) {
      localStorage.setItem('token', data.data.token);
      localStorage.setItem('entityId', '2');
    }
    return data;
  });
  if (switchRes.success) {
    log('PASS', '선명 법인 전환 성공');
  } else {
    log('FAIL', '선명 법인 전환 실패: ' + JSON.stringify(switchRes));
  }

  // 5. 선명 — 주문 목록 (비어있어야 함)
  await page.goto(BASE + '/orders');
  await page.waitForTimeout(2000);
  const ordersContent2 = await page.textContent('body').catch(() => '');
  // 주문 테이블이 비어있는지 확인
  const orderCount2 = await page.evaluate(async () => {
    const t = localStorage.getItem('token');
    const res = await fetch('/api/orders?limit=5', { headers: { 'Authorization': 'Bearer ' + t }});
    const d = await res.json();
    return Array.isArray(d.data) ? d.data.length : (d.data?.results?.length ?? -1);
  });
  log(orderCount2 === 0 ? 'PASS' : 'FAIL', '선명 주문 ' + orderCount2 + '건 (0건 예상)');

  // 6. 선명 — 발주 목록 (비어있어야 함)
  console.log('\n\x1b[36m▶ 선명 — 발주/원장/세금계산서\x1b[0m');
  const poCount2 = await page.evaluate(async () => {
    const t = localStorage.getItem('token');
    const res = await fetch('/api/purchase-orders?limit=5', { headers: { 'Authorization': 'Bearer ' + t }});
    const d = await res.json();
    return Array.isArray(d.data) ? d.data.length : 0;
  });
  log(poCount2 === 0 ? 'PASS' : 'FAIL', '선명 발주 ' + poCount2 + '건 (0건 예상)');

  // 7. 선명 — 발주 stats
  const poStats2 = await page.evaluate(async () => {
    const t = localStorage.getItem('token');
    const res = await fetch('/api/purchase-orders/stats', { headers: { 'Authorization': 'Bearer ' + t }});
    return await res.json();
  });
  log((poStats2.data?.total || 0) === 0 ? 'PASS' : 'FAIL', '선명 발주 stats total=' + (poStats2.data?.total || 0) + ' (0 예상)');

  // 8. 선명 — 원장 월간 요약
  const ledger2 = await page.evaluate(async () => {
    const t = localStorage.getItem('token');
    const res = await fetch('/api/ledger/monthly-summary?month=2026-04', { headers: { 'Authorization': 'Bearer ' + t }});
    return await res.json();
  });
  log(ledger2.success ? 'PASS' : 'FAIL', '선명 원장 요약 API 정상');

  // 9. 선명 — 세금계산서
  const tax2 = await page.evaluate(async () => {
    const t = localStorage.getItem('token');
    const res = await fetch('/api/tax-invoices?from=2026-01-01&to=2026-12-31', { headers: { 'Authorization': 'Bearer ' + t }});
    const d = await res.json();
    return { success: d.success, count: Array.isArray(d.data) ? d.data.length : 0 };
  });
  log(tax2.count === 0 ? 'PASS' : 'FAIL', '선명 세금계산서 ' + tax2.count + '건 (0건 예상)');

  // 10. 선명 — 대시보드 stats
  const dash2 = await page.evaluate(async () => {
    const t = localStorage.getItem('token');
    const res = await fetch('/api/dashboard/stats', { headers: { 'Authorization': 'Bearer ' + t }});
    return await res.json();
  });
  const dashOrders2 = dash2.data?.total_orders || 0;
  log(dashOrders2 === 0 ? 'PASS' : 'FAIL', '선명 대시보드 total_orders=' + dashOrders2 + ' (0 예상)');

  // 11. 선명 — 카드(현장카드)
  const cards2 = await page.evaluate(async () => {
    const t = localStorage.getItem('token');
    const res = await fetch('/api/cards', { headers: { 'Authorization': 'Bearer ' + t }});
    const d = await res.json();
    return Array.isArray(d.data) ? d.data.length : (d.data?.results?.length ?? -1);
  });
  log(cards2 === 0 ? 'PASS' : 'FAIL', '선명 현장카드 ' + cards2 + '건 (0건 예상)');

  // 12. 선명 — 출고/배송
  const ship2 = await page.evaluate(async () => {
    const t = localStorage.getItem('token');
    const res = await fetch('/api/shipments?limit=5', { headers: { 'Authorization': 'Bearer ' + t }});
    const d = await res.json();
    return Array.isArray(d.data) ? d.data.length : (d.data?.results?.length ?? 0);
  });
  log(ship2 === 0 ? 'PASS' : 'FAIL', '선명 출고 ' + ship2 + '건 (0건 예상)');

  // 13. 선명 — 급여
  const payroll2 = await page.evaluate(async () => {
    const t = localStorage.getItem('token');
    const res = await fetch('/api/payroll?period=2026-04', { headers: { 'Authorization': 'Bearer ' + t }});
    return await res.json();
  });
  log(payroll2.success ? 'PASS' : 'FAIL', '선명 급여 API 정상');

  // 14. 전체(합산) 모드 (entity=0)
  console.log('\n\x1b[36m▶ 전체(합산) 모드\x1b[0m');
  const switchAll = await page.evaluate(async () => {
    const t = localStorage.getItem('token');
    const res = await fetch('/api/auth/switch-entity', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + t, 'Content-Type': 'application/json' },
      body: JSON.stringify({ entity_id: 0 })
    });
    const data = await res.json();
    if (data.success) {
      localStorage.setItem('token', data.data.token);
      localStorage.setItem('entityId', '0');
    }
    return data;
  });
  log(switchAll.success ? 'PASS' : 'FAIL', '전체 모드 전환');

  const ordersAll = await page.evaluate(async () => {
    const t = localStorage.getItem('token');
    const res = await fetch('/api/orders?limit=5', { headers: { 'Authorization': 'Bearer ' + t }});
    const d = await res.json();
    return Array.isArray(d.data) ? d.data.length : (d.data?.results?.length ?? 0);
  });
  log(ordersAll > 0 ? 'PASS' : 'FAIL', '전체 모드 주문 ' + ordersAll + '건 (1건 이상 예상)');

  // 전체 모드 사이드바 라벨
  await page.goto(BASE + '/dashboard');
  await page.waitForTimeout(2000);
  const entityNameAll = await page.textContent('#entityName').catch(() => '');
  log(entityNameAll.includes('전체') ? 'PASS' : 'FAIL', '전체 모드 사이드바 라벨: ' + entityNameAll);

  // 15. 동산기획 복귀
  console.log('\n\x1b[36m▶ 동산기획 복귀 확인\x1b[0m');
  await page.evaluate(async () => {
    const t = localStorage.getItem('token');
    const res = await fetch('/api/auth/switch-entity', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + t, 'Content-Type': 'application/json' },
      body: JSON.stringify({ entity_id: 1 })
    });
    const data = await res.json();
    if (data.success) {
      localStorage.setItem('token', data.data.token);
      localStorage.setItem('entityId', '1');
    }
  });
  const ordersBack = await page.evaluate(async () => {
    const t = localStorage.getItem('token');
    const res = await fetch('/api/orders?limit=5', { headers: { 'Authorization': 'Bearer ' + t }});
    const d = await res.json();
    return Array.isArray(d.data) ? d.data.length : (d.data?.results?.length ?? 0);
  });
  log(ordersBack > 0 ? 'PASS' : 'FAIL', '동산기획 복귀 주문 ' + ordersBack + '건');

  // 16. 설정 페이지 — 법인 정보
  console.log('\n\x1b[36m▶ 설정 페이지 법인 정보\x1b[0m');
  const entityInfo = await page.evaluate(async () => {
    const t = localStorage.getItem('token');
    const res = await fetch('/api/settings/entity', { headers: { 'Authorization': 'Bearer ' + t }});
    return await res.json();
  });
  log(entityInfo.success && entityInfo.data?.name ? 'PASS' : 'FAIL', '법인 정보 API: ' + (entityInfo.data?.name || 'N/A'));

  // 17. 이관 페이지 접속
  await page.goto(BASE + '/migration');
  await page.waitForTimeout(1500);
  const migEntitySelect = await page.$('#migrationEntitySelect');
  log(migEntitySelect ? 'PASS' : 'FAIL', '이관 페이지 법인 선택 드롭다운');

  // 18. 500 에러 체크 — 주요 페이지 순회
  console.log('\n\x1b[36m▶ 주요 페이지 500 에러 확인\x1b[0m');
  const pages = [
    '/dashboard', '/orders', '/cards', '/shipments', '/clients', '/items',
    '/purchase-orders', '/ledger', '/tax-invoices', '/settings',
    '/hr', '/inventory', '/reports', '/migration'
  ];
  for (const p of pages) {
    await page.goto(BASE + p);
    await page.waitForTimeout(800);
    const hasError = await page.textContent('body').then(t => t.includes('500') && t.includes('Internal'));
    log(!hasError ? 'PASS' : 'FAIL', p + (hasError ? ' → 500 에러!' : ''));
  }

  // 결과 요약
  console.log('\n\x1b[1m=== 결과 ===\x1b[0m');
  console.log(`  \x1b[32mPASS: ${pass}\x1b[0m  \x1b[31mFAIL: ${fail}\x1b[0m  Total: ${pass + fail}`);

  await browser.close();
}

main().catch(e => { console.error('Error:', e); process.exit(1); });
