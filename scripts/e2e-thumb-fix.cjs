// E2E: 직접연결(-3) 썸네일 공백 버그 수정 검증 (prod)
// 공백 거래처(2163 "주식회사 현대광고") + 직접연결 EPS(-3) 신규 주문 → 에이전트가 자동으로 PNG 미스매치를
// 폴백 탐색해 썸네일 콜백 발송하는지 확인. (upload + create. 처리/검증은 별도 폴링 스크립트)
const fs = require('fs');
const BASE = (process.env.SMOKE_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
if (/pages\.dev|dongsanplan\.com/i.test(BASE) && process.env.ALLOW_PROD !== '1') {
  console.error('\x1b[31m[guard] 프로덕션 대상 e2e 차단:\x1b[0m ' + BASE + '\n  → prod에 테스트 데이터가 쌓입니다. 로컬에서 실행하세요. 정말 필요하면 ALLOW_PROD=1 설정.');
  process.exit(1);
}
const EPS = 'C:\\Users\\user\\dongsan_mes\\e2e-thumb-src.eps';

async function main() {
  const lg = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'password' }) });
  const token = (await lg.json()).data.token;
  if (!token) throw new Error('login 실패');

  // 1. 직접연결 업로드 (skip_analysis=1 → status='direct')
  const buf = fs.readFileSync(EPS);
  const fd = new FormData();
  fd.append('file', new Blob([buf], { type: 'application/postscript' }), 'e2e-thumb-test.eps');
  fd.append('skip_analysis', '1');
  const up = await fetch(`${BASE}/api/ai-analysis/upload`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd });
  const upd = await up.json();
  if (!upd.success) throw new Error('upload 실패 ' + JSON.stringify(upd));
  const aid = upd.data.id, r2 = upd.data.file_path;
  console.log(`upload OK: analysis #${aid} ${r2} status=${upd.data.status}`);

  // 2. 주문 생성 (공백 거래처 2163, -3 직접연결 라인). ai_file_path → AI_PROCESS task enqueue
  const today = new Date().toISOString().slice(0, 10);
  const body = {
    client_id: 2163, delivery_date: today,
    ai_file_path: r2, ai_analysis_id: aid, ai_files: [{ file_path: r2, analysis_id: aid }],
    items: [{ item_id: 16, item_name: '수성 현수막', width_mm: 5000, height_mm: 900, quantity: 1, unit: 'EA',
              unit_price: 10000, vat_included: 1, ai_group_index: -3, ai_analysis_id: aid, content: '썸네일픽스E2E' }],
  };
  const cr = await fetch(`${BASE}/api/orders`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
  const crd = await cr.json();
  if (!crd.success) throw new Error('주문 생성 실패 ' + JSON.stringify(crd));
  console.log(`order OK: #${crd.data.id} ${crd.data.order_number}`);
  console.log(`E2E_IDS analysis=${aid} order=${crd.data.id} order_number=${crd.data.order_number}`);
}
main().catch((e) => { console.error('E2E setup ERR:', e.message); process.exit(1); });
