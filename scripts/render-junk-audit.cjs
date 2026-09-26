#!/usr/bin/env node
// ============================================================================
// 화면 쓰레기 문자열 감사 — `npm run audit:render-junk`
//
// 왜 있나(2026-09-22 실기): `/production-reports` 「미완료 주문」 표가 API 가 주지 않는
// 칸(`o.due_date`·`o.item_count`)을 읽어 두 열이 **「undefined」**로 떠 있었다. 더 나쁜 건
// `undefined < today` 가 **항상 false** 라 「(지연)」이 영영 안 붙은 것 — 지연을 보라고 만든
// 표에서 지연 표시만 빠져 있었다.
//
// ★이 축은 지금 **아무 게이트도 안 본다.** 응답은 200 이고 tsc·build·smoke·check:dom·
//   check:fn 이 전부 통과한다. 실제로 드러난 경로는 `audit:table-clip` 이었는데, 그것도
//   「undefined」라는 글자가 87px 로 76px 열을 넘겨서였다 — **우연이다.**
//
// ★정적 대조는 답이 아니었다 — API 응답 칸 이름 ↔ 화면이 읽는 이름을 정적으로 맞춰 보는
//   시제품은 **후보 566건**을 냈다(스크립트 1개가 여러 라우트를 부르고, 라우트가 조인으로
//   남의 칸을 실어 나르기 때문). 오탐이 그만큼이면 아무도 안 본다(§게이트=고칠 것).
//   그래서 **증상을 직접 본다** — 사람 눈에 보이는 자리에 쓰레기 문자열이 있는가.
//   같은 계열의 모든 원인(칸 이름 불일치·널 전파·날짜 파싱 실패)을 한 그물로 잡는다.
//
// 기준선 방식 = `audit:table-clip` 과 동일. 이미 아는 (화면, 자리)는 고정하고 **새 것만** 잡는다.
//
// 사용:
//   npm run audit:render-junk                 로컬 서버(기본) 대상, 기준선과 대조
//   npm run audit:render-junk -- --update     현재 상태를 기준선으로 고정
//   npm run audit:render-junk -- --base https://webapp-9i0.pages.dev
//   npm run audit:render-junk -- --selftest   자가시험(일부러 심은 쓰레기를 잡는가·양방향)
// exit 1 = 새 쓰레기 · exit 2 = 서버 없음(안 돌았는데 통과로 세지 않는다)
// ============================================================================
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const BASELINE = path.join(__dirname, 'render-junk-baseline.json');

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const has = (k) => process.argv.includes(k);

const BASE = (arg('--base', process.env.CLIP_URL || 'http://localhost:3000')).replace(/\/$/, '');
const WIDTH = parseInt(arg('--width', '1920'), 10);
const HEIGHT = parseInt(arg('--height', '1080'), 10);
const PARALLEL = parseInt(arg('--parallel', '4'), 10);
const UPDATE = has('--update') || has('--update-baseline');
const SELFTEST = has('--selftest');
const VERBOSE = has('--verbose');

const USER = process.env.SMOKE_USER || 'admin';
const PASS = process.env.SMOKE_PASS || 'password';

// 부수효과가 있을 수 있는 관리 화면은 열지 않는다 — 감사는 읽기 전용이어야 한다.
// /ui-guide·/ui-compare 는 컴포넌트 전시장이라 예시 문자열이 그대로 뜬다(제외).
const SKIP = new Set(['/migration', '/ui-guide', '/ui-compare']);

/** 메뉴가 곧 사람이 여는 화면 목록(정본 = src/layout/menu.ts). table-clip 과 같은 규칙. */
function menuPaths() {
  const src = fs.readFileSync(path.join(ROOT, 'src/layout/menu.ts'), 'utf8');
  const seen = new Set();
  const out = [];
  for (const line of src.split(/\r?\n/)) {
    const m = line.match(/path:\s*'([^']+)'/);
    if (!m || seen.has(m[1]) || SKIP.has(m[1])) continue;
    seen.add(m[1]);
    out.push({ path: m[1], hidden: /^\s*\/\//.test(line) });
  }
  return out;
}

// ── 브라우저 안에서 도는 탐지자 ─────────────────────────────────
// 사람 눈에 보이는 텍스트와 title/alt 만 본다. 스크립트·스타일·입력값은 제외.
const SCAN = () => {
  // 낱말 경계로만 잡는다 — 「nullable」·「undefined 를 쓰지 마세요」 같은 본문을 안 건드린다.
  const TOKENS = [
    ['undefined', /(^|[\s>(\[|·,:/\-])undefined($|[\s<)\]|·,:/\-.])/],
    ['NaN', /(^|[\s>(\[|·,:/\-])NaN($|[\s<)\]|·,:%/\-.])/],
    ['[object Object]', /\[object Object\]/],
    ['Invalid Date', /Invalid Date/],
    ['null', /(^|[\s>(\[|·,:/\-])null($|[\s<)\]|·,:/\-.])/],
  ];
  const SKIP_TAG = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'PRE', 'CODE', 'TEMPLATE']);
  const out = [];
  const seen = new Set();

  function visible(el) {
    if (!el || !el.getClientRects) return false;
    if (!el.getClientRects().length) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== 'hidden' && cs.display !== 'none' && cs.opacity !== '0';
  }

  // 그 자리가 어디인지 — 표 안이면 열 이름, 아니면 가장 가까운 라벨
  function where(el) {
    const td = el.closest ? el.closest('td') : null;
    if (td) {
      const tr = td.parentElement;
      const tbl = td.closest('table');
      const i = [...tr.children].indexOf(td);
      const th = tbl && tbl.querySelectorAll('thead th')[i];
      const col = th ? (th.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 16) : '#' + (i + 1);
      return '표:' + col;
    }
    const id = el.id || (el.closest('[id]') && el.closest('[id]').id) || '';
    return id ? '#' + id : (el.tagName || '?').toLowerCase();
  }

  function record(el, token, text) {
    const w = where(el);
    const key = w + '|' + token;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ at: w, token, text: String(text).replace(/\s+/g, ' ').trim().slice(0, 60) });
  }

  // ① 보이는 텍스트 노드
  const it = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = it.nextNode())) {
    const p = n.parentElement;
    if (!p || SKIP_TAG.has(p.tagName)) continue;
    const t = n.nodeValue;
    if (!t || t.length > 400) continue;
    for (const [name, re] of TOKENS) {
      if (re.test(t) && visible(p)) { record(p, name, t); break; }
    }
  }
  // ② title/alt — 마우스오버로 보이는 자리도 사람이 읽는 자리다
  for (const el of document.querySelectorAll('[title],[alt]')) {
    for (const a of ['title', 'alt']) {
      const v = el.getAttribute(a);
      if (!v) continue;
      for (const [name, re] of TOKENS) {
        if (re.test(v) && visible(el)) { record(el, name, a + '=' + v); break; }
      }
    }
  }
  return out;
};

async function login() {
  let res;
  try {
    res = await fetch(`${BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: USER, password: PASS }),
    });
  } catch (err) {
    console.error(`[render-junk] ${BASE} 에 연결할 수 없습니다 — 서버를 먼저 띄우세요 (npm run dev:d1).`);
    console.error(`  ${err.message}`);
    process.exit(2);           // 안 돌았는데 통과로 세지 않는다
  }
  const data = await res.json().catch(() => null);
  if (!res.ok || !data || !data.data || !data.data.token) {
    console.error(`[render-junk] 로그인 실패(${res.status}) — SMOKE_USER/SMOKE_PASS 확인`);
    process.exit(2);
  }
  return data.data.token;
}

/** 한 화면을 열어(탭 포함) 쓰레기 문자열을 돌려준다 */
async function auditPage(page, target) {
  const hits = [];
  let note = '';
  try {
    await page.goto(BASE + target.path, { waitUntil: 'domcontentloaded', timeout: 45000 });
    if (new URL(page.url()).pathname === '/login') return { ...target, note: '로그인으로 튕김', hits };
    // 데이터가 들어오기를 기다린다 — 빈 화면은 쓰레기도 없어서 조용히 통과한다
    await page.waitForFunction(
      () => document.querySelectorAll('tbody tr, .ds-card, [id]').length > 3,
      null, { timeout: 12000 },
    ).catch(() => { note = '렌더 지연'; });
    await page.waitForTimeout(1000);
    hits.push(...await page.evaluate(SCAN));
    const tabs = await page.$$('.tab-btn');
    for (let i = 0; i < Math.min(tabs.length, 8); i++) {
      try {
        await tabs[i].click({ timeout: 4000 });
        await page.waitForTimeout(1200);
        hits.push(...await page.evaluate(SCAN));
      } catch (e) { /* ignore: 못 여는 탭은 건너뛴다 — 나머지 탭 측정을 막지 않는다 */ }
    }
  } catch (e) {
    note = String(e.message || e).slice(0, 60);
  }
  const byKey = new Map();
  for (const h of hits) byKey.set(h.at + '|' + h.token, h);
  return { ...target, note, hits: [...byKey.values()] };
}

// 기준선을 **다른 대상**으로 덮어쓰지 않는다(table-clip 과 같은 이유 — 로컬은 데이터가 적어
// 쓰레기가 덜 잡히고, prod 기준선 위에 쓰면 알려진 것이 조용히 「해소됨」으로 사라진다).
function assertUpdateTarget() {
  if (!UPDATE) return;
  let prev = null;
  try { prev = JSON.parse(fs.readFileSync(BASELINE, 'utf8')); } catch (e) { /* ignore: 최초 생성이면 없다 */ }
  if (!prev || !prev.base || prev.base === BASE || has('--force-base')) return;
  console.error(`[render-junk] 기준선은 ${prev.base} 것인데 지금 측정 대상은 ${BASE} 입니다 — 덮어쓰지 않았습니다.`);
  console.error(`  같은 대상으로 다시 재세요:  npm run audit:render-junk -- --base ${prev.base} --update`);
  console.error('  대상을 정말 바꾸려면 --force-base 를 붙이세요.');
  process.exit(2);
}

// ── 자가시험 — 탐지자가 실제로 잡는가/안 잡는가(양방향) ─────────
async function selftest() {
  const { chromium } = require('@playwright/test');
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const cases = [
    ['표의 undefined 셀', '<table><thead><tr><th>마감일</th><th>품목 수</th></tr></thead>'
      + '<tbody><tr><td>2026-09-18</td><td>undefined</td></tr></tbody></table>', true],
    ['NaN 금액', '<div id="kpi">합계 NaN 원</div>', true],
    ['[object Object]', '<div id="x">[object Object]</div>', true],
    ['Invalid Date', '<div id="y">Invalid Date</div>', true],
    ['null 단독', '<div id="z">담당자 null</div>', true],
    ['title 속성', '<div id="t" title="undefined">값</div>', true],
    ['★본문에 쓰인 낱말은 안 잡는다', '<div id="ok1">nullable 컬럼입니다</div>', false],
    ['★undefined 가 단어 일부면 안 잡는다', '<div id="ok2">undefinedValue</div>', false],
    ['★숨은 요소는 안 잡는다', '<div id="ok3" style="display:none">undefined</div>', false],
    ['★code/pre 안은 안 잡는다', '<pre id="ok4">undefined</pre>', false],
    ['★정상 화면', '<table><tbody><tr><td>2026-09-18 (지연)</td><td>3</td></tr></tbody></table>', false],
  ];
  let fails = 0;
  for (const [name, html, shouldHit] of cases) {
    await page.setContent('<body>' + html + '</body>');
    const hits = await page.evaluate(SCAN);
    const got = hits.length > 0;
    const ok = got === shouldHit;
    console.log((ok ? '  OK   ' : '  FAIL ') + name + (ok ? '' : ` -> 기대 ${shouldHit ? '잡음' : '안잡음'}, 실제 ${got ? '잡음' : '안잡음'} ${JSON.stringify(hits).slice(0, 120)}`));
    if (!ok) fails++;
  }
  await browser.close();
  console.log(fails ? `[render-junk] 자가시험 FAIL ${fails}` : '[render-junk] 자가시험 OK — 잡아야 할 것 6 · 잡으면 안 되는 것 5');
  process.exit(fails ? 1 : 0);
}

(async () => {
  if (SELFTEST) return selftest();
  assertUpdateTarget();
  const { chromium } = require('@playwright/test');
  const token = await login();
  const targets = menuPaths();

  const browser = await chromium.launch();
  const results = [];
  let cursor = 0;
  async function worker() {
    const ctx = await browser.newContext({ viewport: { width: WIDTH, height: HEIGHT } });
    await ctx.addInitScript((t) => {
      try { localStorage.setItem('token', t); } catch (e) { /* ignore: 스토리지 차단 환경 */ }
    }, token);
    const page = await ctx.newPage();
    page.on('dialog', (d) => d.dismiss().catch(() => {}));
    while (cursor < targets.length) {
      const t = targets[cursor++];
      results.push(await auditPage(page, t));
      if (VERBOSE) console.log('  · ' + t.path);
    }
    await ctx.close();
  }
  await Promise.all(Array.from({ length: Math.min(PARALLEL, targets.length) }, worker));
  await browser.close();

  const current = {};
  let rendered = 0;
  for (const r of results) {
    if (!r.note) rendered++;
    for (const h of r.hits) current[`${r.path}|${h.at}|${h.token}`] = { text: h.text };
  }

  console.log(`[render-junk] ${BASE} · ${WIDTH}px · ${targets.length}화면`);

  // 못 잰 화면을 「쓰레기 0건」으로 세지 않는다 — 인증이 깨지면 전 화면이 /login 으로 튕겨도 OK 가 났다
  const bounced = results.filter((r) => r.note === '로그인으로 튕김').map((r) => r.path);
  if (bounced.length || rendered === 0) {
    console.error(`[render-junk] 측정 불가 — 렌더 ${rendered}화면 · 로그인 튕김 ${bounced.length}화면${bounced.length ? ': ' + bounced.slice(0, 6).join(', ') : ''}`);
    process.exit(2);
  }

  if (UPDATE) {
    fs.writeFileSync(BASELINE, JSON.stringify({ base: BASE, width: WIDTH, known: current }, null, 2) + '\n');
    console.log(`[render-junk] 기준선 갱신 — ${Object.keys(current).length}건 고정`);
    return;
  }

  let baseline = null;
  try { baseline = JSON.parse(fs.readFileSync(BASELINE, 'utf8')); } catch (e) { /* ignore: 없으면 아래에서 안내한다 */ }
  if (!baseline) {
    console.error('[render-junk] 기준선이 없습니다 — 먼저 만드세요: npm run audit:render-junk -- --update');
    process.exit(2);
  }
  if (baseline.base !== BASE) {
    console.log(`[render-junk] ⚠️기준선은 ${baseline.base} 것이고 지금 대상은 ${BASE} 입니다 — 대조가 헐거울 수 있습니다`);
  }

  const known = baseline.known || {};
  const fresh = Object.keys(current).filter((k) => !(k in known));
  const gone = Object.keys(known).filter((k) => !(k in current));

  if (gone.length) {
    console.log(`[render-junk] 해소 ${gone.length}건: ${gone.slice(0, 6).join(', ')}${gone.length > 6 ? ' …' : ''}`);
    console.log('  → ⚠️**데이터가 비어서 안 잡힌 것일 수 있다.** 그 화면에 실제로 행이 있는지 보고 나서');
    console.log('     고친 게 맞을 때만 --update 로 기준선을 줄이세요(2026-09-22 실기: shipments 1행·장비배정 0건이 「해소」로 보고됐다).');
  }

  if (!fresh.length) {
    console.log(`[render-junk] OK — 새 쓰레기 문자열 없음 (렌더 ${rendered}화면 · 기준선 ${Object.keys(known).length}건)`);
    return;
  }

  console.error(`\n[render-junk] ★새 쓰레기 문자열 ${fresh.length}건 — 화면에 값 대신 이게 떠 있습니다`);
  for (const k of fresh.slice(0, 20)) {
    const [p, at, token] = k.split('|');
    console.error(`  ${p} · ${at} — 「${token}」  ${JSON.stringify(current[k].text)}`);
  }
  if (fresh.length > 20) console.error(`  … 외 ${fresh.length - 20}건`);
  console.error('\n  거의 언제나 **화면이 읽는 칸 이름과 API 가 주는 칸 이름이 다른 것**입니다.');
  console.error('  라우트의 SELECT 별칭과 스크립트의 `o.필드` 를 대조하세요. 빈 값이 정상이면 `|| \'-\'` 로 떨어뜨립니다.');
  console.error('  의도된 것이면: npm run audit:render-junk -- --update');
  process.exit(1);
})();
