#!/usr/bin/env node
// ============================================================================
// 표 열 잘림 감사 — `npm run audit:table-clip`
//
// 왜 있나(2026-09-18 전수 조사): `.ds-table` 은 `table-layout:fixed` +
// `td{overflow:hidden;white-space:nowrap}`(shared-styles.ts:612,621)이라 배정 폭을
// 넘긴 값이 **경고 없이 사라진다**. 응답은 200 이고 tsc·build·smoke·check:dom·check:fn 이
// 전부 통과한다 — 사람이 화면을 봐야만 보이는 축이다(CLAUDE.md §조용한 격하 계열).
//
// 실제로 56화면에서 41열이 잘려 있었고 그중 35열은 title 조차 없어 마우스오버로도
// 복구되지 않았다. 그 목록은 2026-08-09 에도 한 번 만들어졌는데 **게이트가 아니라서**
// 한 달간 방치됐다 — 그래서 이번엔 배포 경로에 물린다.
//
// ★기준선 방식 — 기존 41건을 총량으로 재면 영원히 빨간불이라 판정이 안 된다.
//   이미 아는 (화면, 열)은 기준선에 고정하고 **거기서 벗어난 것만** 잡는다
//   (`audit:stock-ledger` 와 같은 구조). 새 표·새 열·넓어진 데이터가 여기 걸린다.
//
// 사용:
//   npm run audit:table-clip                  로컬 서버(기본) 대상, 기준선과 대조
//   npm run audit:table-clip -- --update      현재 상태를 기준선으로 고정
//   npm run audit:table-clip -- --base https://webapp-9i0.pages.dev
// exit 1 = 새 잘림 · exit 2 = 서버 없음(안 돌았는데 통과로 세지 않는다)
// ============================================================================
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const BASELINE = path.join(__dirname, 'table-clip-baseline.json');

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const has = (k) => process.argv.includes(k);

const BASE = (arg('--base', process.env.CLIP_URL || 'http://localhost:3000')).replace(/\/$/, '');
const WIDTH = parseInt(arg('--width', '1920'), 10);
const HEIGHT = parseInt(arg('--height', '1080'), 10);
const MIN_SHORT = parseInt(arg('--min', '4'), 10);
const PARALLEL = parseInt(arg('--parallel', '4'), 10);
const UPDATE = has('--update') || has('--update-baseline');
const VERBOSE = has('--verbose');

const USER = process.env.SMOKE_USER || 'admin';
const PASS = process.env.SMOKE_PASS || 'password';

// 부수효과가 있을 수 있는 관리 화면은 열지 않는다 — 감사는 읽기 전용이어야 한다
const SKIP = new Set(['/migration']);

/** 메뉴가 곧 사람이 여는 화면 목록(정본 = src/layout/menu.ts).
 *  주석 처리된 항목도 포함한다 — 사이드바에서 은퇴해도 라우트는 살아 있고 주소로 들어간다(/bank). */
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

// 브라우저 안에서 도는 측정자. td 하나하나가 아니라 **열 단위 최악값**을 남긴다.
const MEASURE = (minShort) => {
  const res = [];
  document.querySelectorAll('table').forEach((tbl) => {
    const ths = [...tbl.querySelectorAll('thead th')].map((th) =>
      (th.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 14));
    const worst = new Map();
    for (const tr of [...tbl.querySelectorAll('tbody tr')].slice(0, 40)) {
      const tds = [...tr.children].filter((c) => c.tagName === 'TD');
      if (tds.length <= 1) continue;               // 「없습니다」 colspan 행
      tds.forEach((td, i) => {
        if (td.colSpan > 1) return;
        const cs = getComputedStyle(td);
        // ds-wrap 등 overflow:visible 은 넘쳐도 화면에 보인다 — 잘림이 아니다
        if (cs.overflowX !== 'hidden' && cs.overflow !== 'hidden') return;
        const short = td.scrollWidth - td.clientWidth;
        if (short < minShort) return;
        const prev = worst.get(i);
        if (prev && prev.short >= short) return;
        worst.set(i, {
          col: ths[i] || `#${i + 1}`,
          gave: Math.round(td.getBoundingClientRect().width),
          need: td.scrollWidth,
          short,
          title: td.hasAttribute('title') || !!td.querySelector('[title]'),
          text: (td.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 34),
        });
      });
    }
    if (worst.size) res.push([...worst.values()]);
  });
  return res;
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
    console.error(`[table-clip] ${BASE} 에 연결할 수 없습니다 — 서버를 먼저 띄우세요 (npm run dev:d1).`);
    console.error(`  ${err.message}`);
    process.exit(2);           // 안 돌았는데 통과로 세지 않는다
  }
  const data = await res.json().catch(() => null);
  if (!res.ok || !data || !data.data || !data.data.token) {
    console.error(`[table-clip] 로그인 실패(${res.status}) — SMOKE_USER/SMOKE_PASS 확인`);
    process.exit(2);
  }
  return data.data.token;
}

/** 한 화면을 열어 표(탭 포함)를 재고 잘린 열을 돌려준다 */
async function auditPage(page, target) {
  const hits = [];
  let note = '';
  try {
    await page.goto(BASE + target.path, { waitUntil: 'domcontentloaded', timeout: 45000 });
    if (new URL(page.url()).pathname === '/login') return { ...target, note: '로그인으로 튕김', hits };
    await page.waitForFunction(
      () => [...document.querySelectorAll('tbody tr')].some((tr) => tr.querySelectorAll('td').length > 1),
      null, { timeout: 12000 },
    ).catch(() => { note = '표 없음/빈 표'; });
    await page.waitForTimeout(800);
    for (const cols of await page.evaluate(MEASURE, MIN_SHORT)) hits.push(...cols);
    // 탭 안쪽 표도 본다 — 기본 탭에만 표가 있는 화면은 드물다(/bank 가 그렇다)
    const tabs = await page.$$('.tab-btn');
    for (let i = 0; i < Math.min(tabs.length, 8); i++) {
      try {
        await tabs[i].click({ timeout: 4000 });
        await page.waitForTimeout(1200);
        for (const cols of await page.evaluate(MEASURE, MIN_SHORT)) hits.push(...cols);
      } catch (e) { /* ignore: 못 여는 탭은 건너뛴다 — 나머지 탭 측정을 막지 않는다 */ }
    }
  } catch (e) {
    note = String(e.message || e).slice(0, 60);
  }
  // 같은 (열) 이 여러 탭에서 나오면 최악만 남긴다
  const byCol = new Map();
  for (const h of hits) {
    const p = byCol.get(h.col);
    if (!p || h.short > p.short) byCol.set(h.col, h);
  }
  return { ...target, note, hits: [...byCol.values()] };
}

// 기준선을 **다른 대상**으로 덮어쓰지 않는다. 로컬은 데이터가 적어 잘림이 덜 잡히므로,
// prod 기준선 위에 로컬 측정치를 쓰면 기준선이 조용히 줄어들고 prod 의 알려진 잘림이
// 「해소됨」으로 사라진다(2026-09-18 실제로 44→14 로 깎았다). 대조 경로에는 경고가 있었는데
// 쓰기 경로가 무방비였던 것이 원인 — 되돌릴 수 없는 쪽을 막는다. 재기 전에 판정한다(측정 2분).
function assertUpdateTarget() {
  if (!UPDATE) return;
  let prev = null;
  try { prev = JSON.parse(fs.readFileSync(BASELINE, 'utf8')); } catch (e) { /* ignore: 최초 생성이면 없다 */ }
  if (!prev || !prev.base || prev.base === BASE || has('--force-base')) return;
  console.error(`[table-clip] 기준선은 ${prev.base} 것인데 지금 측정 대상은 ${BASE} 입니다 — 덮어쓰지 않았습니다.`);
  console.error(`  같은 대상으로 다시 재세요:  npm run audit:table-clip -- --base ${prev.base} --update`);
  console.error('  대상을 정말 바꾸려면 --force-base 를 붙이세요(기준선 전체가 새 대상 기준으로 다시 만들어집니다).');
  process.exit(2);
}

(async () => {
  assertUpdateTarget();
  const { chromium } = require('@playwright/test');
  const token = await login();
  const targets = menuPaths();
  console.log(`[table-clip] ${BASE} · ${WIDTH}px · ${targets.length}화면 · 부족 ${MIN_SHORT}px 이상`);

  const browser = await chromium.launch();
  const workers = [];
  const queue = targets.slice();
  const report = [];

  for (let w = 0; w < Math.max(1, PARALLEL); w++) {
    workers.push((async () => {
      const ctx = await browser.newContext({ viewport: { width: WIDTH, height: HEIGHT } });
      await ctx.addInitScript((t) => {
        try { localStorage.setItem('token', t); } catch (e) { /* ignore: 못 넣으면 로그인으로 튕겨 결과에 남는다 */ }
        // 감시자의 outline 이 폭 측정에 끼어들지 않게 끈다
        try { localStorage.setItem('mesClipDebug', '0'); } catch (e) { /* ignore: 기본값이 꺼짐이다 */ }
      }, token);
      const page = await ctx.newPage();
      for (;;) {
        const t = queue.shift();
        if (!t) break;
        const r = await auditPage(page, t);
        report.push(r);
        if (VERBOSE) console.log(`  ${t.path.padEnd(26)} ${r.hits.length ? '잘림 ' + r.hits.length : (r.note || 'OK')}`);
      }
      await ctx.close();
    })());
  }
  await Promise.all(workers);
  await browser.close();
  report.sort((a, b) => a.path.localeCompare(b.path));

  // ── 기준선 대조 ──────────────────────────────────────────────
  const current = {};
  for (const p of report) for (const h of p.hits) current[`${p.path}|${h.col}`] = { short: h.short, title: h.title };

  if (UPDATE) {
    fs.writeFileSync(BASELINE, JSON.stringify({
      base: BASE, width: WIDTH, minShort: MIN_SHORT, updated: new Date().toISOString().slice(0, 10),
      note: '이미 알려진 잘림. 새로 생긴 것만 잡기 위한 출발점이지 「정상」이 아니다.',
      known: current,
    }, null, 2) + '\n', 'utf8');
    console.log(`[table-clip] 기준선 갱신 — ${Object.keys(current).length}건 → ${path.relative(ROOT, BASELINE)}`);
    return;
  }

  let baseline = null;
  try { baseline = JSON.parse(fs.readFileSync(BASELINE, 'utf8')); } catch (e) { /* ignore: 없으면 아래에서 안내한다 */ }
  if (!baseline) {
    console.error('[table-clip] 기준선이 없습니다 — 먼저 `npm run audit:table-clip -- --update` 를 돌리세요.');
    process.exit(2);
  }
  if (baseline.width !== WIDTH) {
    console.error(`[table-clip] 기준선 폭(${baseline.width}px)과 측정 폭(${WIDTH}px)이 다릅니다 — 열 폭이 달라져 대조할 수 없습니다.`);
    process.exit(2);
  }
  // 기준선은 **대상별**이다. prod 기준선으로 로컬(데이터 적음)을 재면 놓칠 뿐 헛경보는 없지만,
  // 반대(로컬 기준선 → prod)는 없던 잘림이 무더기로 뜬다. 어느 쪽이든 사람이 알고 있어야 한다.
  if (baseline.base !== BASE) {
    console.log(`[table-clip] ⚠️기준선은 ${baseline.base} 에서 만들어졌고 지금 대상은 ${BASE} 입니다`
      + (/localhost|127\.0\.0\.1|192\.168\./.test(BASE) ? ' — 로컬은 데이터가 적어 놓치는 게 있습니다.' : ' — 없던 잘림이 뜨면 대상 차이부터 의심하세요.'));
  }

  const known = baseline.known || {};
  const added = Object.keys(current).filter((k) => !(k in known));
  const worse = Object.keys(current).filter((k) => k in known && current[k].short > known[k].short + 24);
  const lostTitle = Object.keys(current).filter((k) => k in known && known[k].title && !current[k].title);
  const fixed = Object.keys(known).filter((k) => !(k in current));

  const lookup = (k) => { const [pg, col] = k.split('|'); const p = report.find((r) => r.path === pg); return { pg, col, h: p && p.hits.find((x) => x.col === col) }; };
  const line = (k, extra) => { const { pg, col, h } = lookup(k); return `  ${pg} · ${col} — ${h ? `${h.gave}→${h.need} (부족 ${h.short}px, title ${h.title ? '있음' : '없음'}) 「${h.text}」` : ''}${extra || ''}`; };

  if (fixed.length) console.log(`[table-clip] 해소 ${fixed.length}건: ${fixed.slice(0, 6).join(', ')}${fixed.length > 6 ? ' …' : ''}\n  → 고쳤으면 --update 로 기준선을 줄이세요(안 줄이면 다음에 되돌아가도 안 잡힙니다).`);

  let failed = false;
  if (added.length) { failed = true; console.error(`\n[table-clip] ★새 잘림 ${added.length}건 — 열 폭이 콘텐츠를 못 담습니다`); added.forEach((k) => console.error(line(k))); }
  if (worse.length) { failed = true; console.error(`\n[table-clip] ★기존 잘림이 24px 넘게 악화 ${worse.length}건`); worse.forEach((k) => console.error(line(k, ` (기준선 ${known[k].short}px)`))); }
  if (lostTitle.length) { failed = true; console.error(`\n[table-clip] ★title 이 사라진 열 ${lostTitle.length}건 — 잘린 값을 호버로도 못 봅니다`); lostTitle.forEach((k) => console.error(line(k))); }

  if (failed) {
    console.error('\n  고치는 법: ①열 폭을 데이터 실측값에 맞춘다 ②한 칸에 정보 둘이면 ds-wrap + 세로 스택');
    console.error('            ③배지는 .ds-chip ④평문 셀은 dsTd() 로 만들면 title 이 자동으로 붙는다');
    console.error('  의도된 변경이면: npm run audit:table-clip -- --update');
    process.exit(1);
  }
  const measured = report.filter((r) => !r.note).length;
  console.log(`[table-clip] OK — 새 잘림 없음 (측정 ${measured}화면 · 기준선 ${Object.keys(known).length}건 · 표 미렌더 ${report.length - measured}화면)`);
})().catch((e) => { console.error('[table-clip] 실패:', e.message); process.exit(2); });
