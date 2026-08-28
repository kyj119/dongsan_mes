const fs = require('fs');

// ── 샘플 시안 SVG (실제 비율 그대로) ──────────────────────────────
function svgBanner(w, h, opt) {
  const vertical = h > w;
  const em = /^[\x00-\x7F]+$/.test(opt.title) ? 0.62 : 1.0;
  const byW = Math.round((w * 0.88) / Math.max(1, opt.title.length) / em);
  const fs1 = vertical ? Math.min(Math.round(w * 0.55), Math.round(h * 0.60 / opt.title.length * 0.78))
                       : Math.min(Math.round(h * 0.24), byW);
  const fs2 = Math.round(fs1 * 0.42);
  const cx = w / 2, cy = h / 2;
  let body = `<rect width="${w}" height="${h}" fill="${opt.bg}"/>`;
  if (opt.band) body += `<rect x="0" y="${h * 0.72}" width="${w}" height="${h * 0.28}" fill="${opt.band}"/>`;
  if (vertical) {
    const chars = opt.title.split('');
    const step = h * 0.60 / chars.length, top = h * 0.10;
    chars.forEach((ch, i) => {
      body += `<text x="${cx}" y="${top + step * (i + 0.85)}" font-family="Malgun Gothic, sans-serif" font-size="${fs1}" font-weight="bold" fill="${opt.fg}" text-anchor="middle">${ch}</text>`;
    });
    if (opt.sub) body += `<text x="${cx}" y="${h * 0.95}" font-family="Malgun Gothic, sans-serif" font-size="${fs2}" fill="${opt.fg}" text-anchor="middle" opacity="0.85">${opt.sub}</text>`;
  } else {
    body += `<text x="${cx}" y="${cy + fs1 * 0.34}" font-family="Malgun Gothic, sans-serif" font-size="${fs1}" font-weight="bold" fill="${opt.fg}" text-anchor="middle">${opt.title}</text>`;
    if (opt.sub) body += `<text x="${cx}" y="${cy + fs1 * 0.34 + fs2 * 1.7}" font-family="Malgun Gothic, sans-serif" font-size="${fs2}" fill="${opt.fg}" text-anchor="middle" opacity="0.85">${opt.sub}</text>`;
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`;
  return 'data:image/svg+xml;base64,' + Buffer.from(svg, 'utf8').toString('base64');
}

const IMG = {
  h41:  svgBanner(4000, 1000, { bg: 'rgb(190,28,28)',  fg: '#fff', band: 'rgb(250,204,21)',  title: '가을맞이 특별 대축제', sub: '2026.09.20 ~ 09.28  중앙광장' }),
  h31:  svgBanner(3000, 1000, { bg: 'rgb(30,64,175)',  fg: '#fff', band: 'rgb(147,197,253)', title: '제12회 지역 문화제', sub: '주최 : 동산문화재단' }),
  h31b: svgBanner(3000, 1000, { bg: 'rgb(15,118,110)', fg: '#fff', band: 'rgb(153,246,228)', title: '신규 지점 오픈 안내', sub: '10.01 GRAND OPEN' }),
  h51:  svgBanner(5000, 1000, { bg: 'rgb(88,28,135)',  fg: '#fff', title: '전 품목 최대 50% 할인' }),
  h15:  svgBanner(1500, 1000, { bg: 'rgb(51,65,85)',   fg: '#fff', band: 'rgb(203,213,225)', title: '입주자 모집', sub: '문의 043-000-0000' }),
  h21:  svgBanner(2000, 1000, { bg: 'rgb(157,23,77)',  fg: '#fff', band: 'rgb(251,207,232)', title: '창립 30주년', sub: '감사 대잔치' }),
  v13:  svgBanner(600, 1800,  { bg: 'rgb(21,128,61)',  fg: '#fff', band: 'rgb(187,247,208)', title: '환영합니다', sub: '동산시' }),
  v13b: svgBanner(600, 1800,  { bg: 'rgb(180,83,9)',   fg: '#fff', band: 'rgb(254,215,170)', title: '가을축제', sub: '10.05' }),
  v15:  svgBanner(600, 3000,  { bg: 'rgb(190,18,60)',  fg: '#fff', title: '개점' }),
  s11:  svgBanner(1000, 1000, { bg: 'rgb(3,105,161)',  fg: '#fff', band: 'rgb(186,230,253)', title: 'DONGSAN', sub: '안전제일' }),
  s11b: svgBanner(1000, 1000, { bg: 'rgb(120,53,15)',  fg: '#fff', title: '주차금지' }),
};

// ── 판 미리보기 SVG — 재단 패널이 이미 굽는 `mes_cut_nest_<idx>.png` 자리 ──
//   조각이 배치된 판 전체 그림. 실물에서는 패널이 만든 PNG 가 그대로 들어간다.
function svgSheet(wCm, hCm, pieces, seed) {
  const W = Math.round(wCm * 10), H = Math.round(hCm * 10);
  const pad = W * 0.028;
  const cols = Math.max(1, Math.round(Math.sqrt(pieces * (W / H))));
  const rows = Math.ceil(pieces / cols);
  const cw = (W - pad * (cols + 1)) / cols;
  const ch = (H - pad * (rows + 1)) / rows;
  let body = `<rect width="${W}" height="${H}" fill="#f2f2ef" stroke="#8a8a8a" stroke-width="${W * 0.005}"/>`;
  for (let i = 0; i < pieces; i++) {
    const gx = i % cols, gy = Math.floor(i / cols);
    const x = pad + gx * (cw + pad), y = pad + gy * (ch + pad);
    const hue = (seed * 53 + i * 67) % 360;
    body += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${cw.toFixed(1)}" height="${ch.toFixed(1)}"`
          + ` rx="${(Math.min(cw, ch) * 0.05).toFixed(1)}" fill="hsl(${hue} 58% 52%)"/>`;
    body += `<text x="${(x + cw / 2).toFixed(1)}" y="${(y + ch / 2 + Math.min(cw, ch) * 0.16).toFixed(1)}"`
          + ` font-family="sans-serif" font-size="${(Math.min(cw, ch) * 0.44).toFixed(1)}" font-weight="bold"`
          + ` fill="#fff" text-anchor="middle">${i + 1}</text>`;
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${body}</svg>`;
  return 'data:image/svg+xml;base64,' + Buffer.from(svg, 'utf8').toString('base64');
}

// ── A5 슬롯 규격 (mm). 유효 폭 138mm = 148 - 좌우여백 5mm ──────────
//   실측 분포: 가로계 63.9% / 정사각 7.7% / 세로계 28.4% (order_items 16,351줄)
const SLOT = {
  H: { w: 38, h: 14, row: 17, cols: [39, 44, 20, 14, 21] },
  V: { w: 24, h: 33, row: 36, cols: [25, 43, 21, 14, 35] },
  S: { w: 24, h: 24, row: 27, cols: [25, 43, 21, 14, 35] },
};
const ORIENT_LABEL = { H: '가로형', V: '세로형', S: '정사각형' };
const NO = ['①','②','③','④','⑤','⑥','⑦','⑧','⑨','⑩'];
// 지면 예산(mm): 유효높이 200 - 헤더 21 - 푸터 24 = 155 가 표머리(7)+표+시안확대 몫
const BUDGET = 155 - 7;

const esc = s => String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const orientOf = r => { const a = r.w / r.h; return a >= 1.2 ? 'H' : (a >= 0.83 ? 'S' : 'V'); };

// 한 라벨에 담을 수 있는 만큼만 끊는다 (넘치면 1/2, 2/2 로 분할)
function paginate(rows) {
  const pages = []; let cur = [], used = 0;
  rows.forEach(r => {
    const h = SLOT[orientOf(r)].row;
    if (cur.length && used + h > BUDGET) { pages.push(cur); cur = []; used = 0; }
    cur.push(r); used += h;
  });
  if (cur.length) pages.push(cur);
  return pages;
}

// 남는 지면 = 시안 확대 영역. 행 수만큼 나눠 **행별로** 키운다.
//   ⚠️ 「대표 시안 1장」 금지 — 다품목을 첫 품목으로 요약하면 봉제실 오재단이 난다(기존 결함 이력).
function renderProof(rows, o, freeH) {
  if (freeH < 26) return { html: '', used: 0 };
  const n = rows.length;
  let cells = '', used = 0;
  if (o === 'H') {                                   // 가로형 = 전폭 스트립을 세로로 쌓기
    const need = rows.map(r => Math.min(138 / (r.w / r.h), 48));
    const sum = need.reduce((a, b) => a + b, 0);
    const scale = Math.min(1, (freeH - n * 1.5) / sum);
    if (Math.min(...need) * scale < 7) return { html: '', used: 0 };
    rows.forEach((r, i) => {
      const hh = need[i] * scale; used += hh + 1.5;
      cells += `<div class="pf-row" style="height:${hh.toFixed(1)}mm"><span class="pf-no">${NO[i]}</span><img src="${r.img}"></div>`;
    });
    return { html: `<div class="pf">${cells}</div>`, used: used + 2 };
  }
  const cw = (138 - (n - 1) * 1.5) / n;              // 세로형/정사각 = 나란히
  rows.forEach((r, i) => {
    cells += `<div class="pf-col" style="width:${cw.toFixed(1)}mm;height:${freeH}mm"><span class="pf-no">${NO[i]}</span><img src="${r.img}"></div>`;
  });
  return { html: `<div class="pf pf-h">${cells}</div>`, used: freeH + 2 };
}

function renderLabel(cfg) {
  const rows = cfg.rows;
  // 열 폭은 주문 단위(지배 방향), 행 높이·슬롯은 행별 방향 — 혼재 주문에서 세로 품목이 뭉개지지 않게
  const tally = { H: 0, V: 0, S: 0 };
  rows.forEach(r => tally[orientOf(r)]++);
  const o = cfg.forceOrient || Object.keys(tally).sort((x, y) => tally[y] - tally[x] || (x === 'H' ? -1 : 1))[0];
  const c = SLOT[o].cols;
  const per = rows.map(r => {
    const ro = orientOf(r), RS = SLOT[ro], a = r.w / r.h;
    const sw = Math.min(RS.w, c[0] - 1);
    return { sw, sh: RS.h, row: RS.row, a };
  });
  const freeH = Math.max(0, Math.floor(BUDGET - per.reduce((t, x) => t + x.row, 0)) - 2);

  let h = `<div class="label" data-o="${o}">`;
  h += `<div class="lb-head"><div class="lb-client">${esc(cfg.client)}</div>`
     + `<div class="lb-box">박스 <span class="wm"></span>/<span class="wm"></span></div></div>`;
  h += `<div class="lb-meta">${esc(cfg.orderNo)}<span class="dot">·</span>납품 ${esc(cfg.due)}`
     + `<span class="dot">·</span>${esc(cfg.ship)}${cfg.part ? `<span class="pg">${esc(cfg.part)}</span>` : ''}</div>`;
  h += `<table class="lb-tb"><colgroup>${c.map(w => `<col style="width:${w}mm">`).join('')}</colgroup>`
     + `<thead><tr><th>시안</th><th>품목</th><th>규격</th><th>지시</th><th class="th-ac">실제</th></tr></thead><tbody>`;
  rows.forEach((r, i) => {
    h += `<tr style="height:${per[i].row}mm">`
       + `<td class="td-th"><div class="slot" style="width:${per[i].sw}mm;height:${per[i].sh}mm"><img src="${r.img}"></div></td>`
       + `<td class="td-nm"><span class="no">${NO[i]}</span>${esc(r.name)}${r.memo ? `<div class="memo">${esc(r.memo)}</div>` : ''}</td>`
       + `<td class="td-sp">${esc(r.spec)}</td>`
       + `<td class="td-qt">${r.qty}</td>`
       + `<td class="td-ac"><div class="wbox"></div></td></tr>`;
  });
  h += `</tbody></table>`;
  const mixed = Object.values(tally).filter(n => n > 0).length > 1;
  const pf = mixed ? { html: '', used: 0 } : renderProof(rows, o, freeH);
  h += pf.html;
  const memoH = freeH - pf.used;   // 남는 지면은 버리지 않고 메모칸으로
  if (memoH >= 16) h += `<div class="lb-memo" style="height:${Math.min(memoH, 64).toFixed(1)}mm"><span>메모</span></div>`;
  h += `<div class="lb-foot"><div class="lb-fin"><b>마감</b> ${esc(cfg.finish)}</div>`
     + `<div class="lb-sign">확인 <span class="wl"></span></div></div>`;
  h += `<div class="lb-tag">${ORIENT_LABEL[o]} · ${rows.length}줄</div></div>`;
  return h;
}

// 품목이 많으면 분할해서 라벨 여러 장 (1/2, 2/2)
function renderOrder(cfg) {
  const pages = paginate(cfg.rows);
  return pages.map((rs, i) => renderLabel({
    ...cfg, rows: rs,
    part: pages.length > 1 ? `${i + 1} / ${pages.length}` : null,
  }));
}

// ── 샘플 주문 (실측 분포를 대표하는 케이스) ───────────────────────
const O1 = { client: '(주)한국광고기획', orderNo: 'E1-20260818-0031', due: '08/20(목)', ship: '직배',
  finish: '3면쌍침 / 하도매 5호2구 / 열재단', rows: [
  { img: IMG.h41, name: '현수막 실사출력', spec: '3.0×1.0m', qty: 5, w: 4000, h: 1000, memo: '가을축제' },
  { img: IMG.h31, name: '현수막 실사출력', spec: '3.0×1.0m', qty: 3, w: 3000, h: 1000, memo: '문화제' },
  { img: IMG.h51, name: '현수막 실사출력', spec: '5.0×1.0m', qty: 2, w: 5000, h: 1000, memo: '할인행사' },
  { img: IMG.h31b, name: '현수막 실사출력', spec: '3.0×1.0m', qty: 4, w: 3000, h: 1000, memo: '오픈안내' },
]};
const O2 = { client: '청주시청 도시경관과', orderNo: 'E3-20260818-0007', due: '08/21(금)', ship: '화물',
  finish: '3면쌍침 / 상하 지지대 / 부직포 7cm', rows: [
  { img: IMG.v13, name: '가로등배너', spec: '0.6×1.8m', qty: 4, w: 600, h: 1800, memo: '좌' },
  { img: IMG.v13b, name: '가로등배너', spec: '0.6×1.8m', qty: 2, w: 600, h: 1800, memo: '우' },
  { img: IMG.v15, name: '윈드배너', spec: '0.6×3.0m', qty: 6, w: 600, h: 3000 },
]};
const O3 = { client: '(주)대신기획', orderNo: 'E1-20260818-0033', due: '08/19(수)', ship: '퀵',
  finish: '1면쌍침2면오바 / 열재단', rows: [
  { img: IMG.h41, name: '현수막 실사출력', spec: '4.0×1.0m', qty: 12, w: 4000, h: 1000, memo: '가을맞이 대축제' },
]};
const O4 = { client: '동산산업(주)', orderNo: 'E2-20260818-0012', due: '08/22(토)', ship: '택배',
  finish: '코팅 / 모서리 라운드', rows: [
  { img: IMG.s11, name: '아크릴 표지판', spec: '0.5×0.5m', qty: 8, w: 1000, h: 1000 },
  { img: IMG.s11b, name: '알루미늄 표지판', spec: '0.6×0.6m', qty: 4, w: 1000, h: 1000 },
]};
const O5 = { client: '선명기획 (방향 혼재)', orderNo: 'E2-20260818-0021', due: '08/20(목)', ship: '직배',
  finish: '3면쌍침 / 부직포 7cm', rows: [
  { img: IMG.h31, name: '현수막 실사출력', spec: '3.0×1.0m', qty: 4, w: 3000, h: 1000 },
  { img: IMG.h15, name: '현수막 실사출력', spec: '1.5×1.0m', qty: 2, w: 1500, h: 1000 },
  { img: IMG.v13, name: '가로등배너', spec: '0.6×1.8m', qty: 6, w: 600, h: 1800, memo: '세로 혼재' },
  { img: IMG.s11, name: '아크릴 표지판', spec: '0.5×0.5m', qty: 2, w: 1000, h: 1000 },
]};
const O6 = { client: '동산유통(주)', orderNo: 'E1-20260818-0040', due: '08/23(일)', ship: '화물',
  finish: '3면쌍침 / 하도매 3호4구', rows: [
  { img: IMG.h41,  name: '현수막 실사출력', spec: '4.0×1.0m', qty: 5,  w: 4000, h: 1000, memo: '대축제' },
  { img: IMG.h31,  name: '현수막 실사출력', spec: '3.0×1.0m', qty: 3,  w: 3000, h: 1000, memo: '문화제' },
  { img: IMG.h31b, name: '현수막 실사출력', spec: '3.0×1.0m', qty: 6,  w: 3000, h: 1000, memo: '오픈' },
  { img: IMG.h51,  name: '현수막 실사출력', spec: '5.0×1.0m', qty: 2,  w: 5000, h: 1000, memo: '할인' },
  { img: IMG.h15,  name: '현수막 실사출력', spec: '1.5×1.0m', qty: 10, w: 1500, h: 1000, memo: '입주자' },
  { img: IMG.h21,  name: '벽면 부착 시트',  spec: '2.0×1.0m', qty: 1,  w: 2000, h: 1000, memo: '30주년' },
  { img: IMG.h41,  name: '현수막 실사출력', spec: '4.0×1.0m', qty: 4,  w: 4000, h: 1000, memo: '추가분' },
  { img: IMG.h31,  name: '현수막 실사출력', spec: '3.0×1.0m', qty: 2,  w: 3000, h: 1000, memo: '재출력' },
  { img: IMG.h21,  name: '현수막 실사출력', spec: '2.0×1.0m', qty: 3,  w: 2000, h: 1000, memo: '예비' },
]};

// ══ 시트(재단) 라벨 — 판 전체 이미지 N개 ════════════════════════════
// ★왜 렌더러가 두 벌인가 (2026-08-28 용준님 확정)
//   현수막·봉제 계열은 **행별 시안**이 정본이다 — 다품목을 첫 품목으로 요약하면 봉제실
//   오재단이 난다([[design-work-order-system]] 결함 이력). 그래서 「대표 시안 1장 금지」다.
//   시트·재단 계열은 다르다. 재단 패널이 판을 짜므로 **판 이미지 자체가 그 판의 전량**이고
//   요약이 아니다 — 금지 조항의 실패 모드가 성립하지 않는다.
//
// ★판이 여러 장이면 **한 장에 같이 붙인다**(용준님). 이유는 단위가 어긋나기 때문이다:
//     주문 30 이미지 → 판 3장(10/10/10) → 박스 2개(15/15)
//   박스 경계가 판을 가로지르므로 「이 박스에 뭐가 들었나」는 어차피 못 적는다.
//   대신 「이 작업은 판 3장짜리다」를 보여 주면 현장에서 작업 식별이 된다.
//
// ★박스 번호는 **인쇄**한다. 08-18 설계는 「박스 __/__ 손기입」이었는데,
//   출력 시 박스 수를 입력받아 1/4·2/4… 로 N부를 뽑는 편이 낫다(용준님 2026-08-28).
//   여전히 테이블은 신설하지 않는다 — 종이에만 존재하는 번호다.
// 판 아래 캡션 = 판번호·규격 / 지시장수 + **실제 기입칸** 2줄.
// ★체크박스가 아니라 「빈 칸에 실제 담은 수량 기입」이다(08-18 확정, 보드마카).
//   체크는 담았다/안 담았다만 남지만, 수량은 **부족·초과를 잡는다**.
//   초안에서 이 칸을 빠뜨렸다 — 스티커가 「작업지시+검수」 한 장인데 검수 절반이 없었다.
//   지면은 어차피 남는다(판 6장 혼재 채움률 70%) — 남는 자리를 검수에 쓴다.
const SHEET_CAP_MM = 9.6;

// 판 이미지 N개를 W×H(mm) 안에 어떻게 나눌지 — 열×행을 전부 시도한다.
// 정사각 슬롯 + contain 은 쓰지 않는다(08-18 실측: 평균 46%가 흰 여백).
//
// ★목표는 「지면을 많이 덮기」가 아니라 **「가장 작은 판을 최대한 크게」**다(총면적은 동점 처리).
//   총면적으로 고르면 한 판만 커지는 배치가 이긴다 — 판 3장에서 실제로 2열×2행(최소변 40mm·
//   빈칸 1개)이 3열×1행(44mm·빈칸 0)을 이겼다. 이 라벨의 목적은 **판을 구분하는 것**이라
//   제일 작은 판이 읽히느냐가 전부고, 큰 판이 더 커지는 건 아무 값이 없다.
function sheetGrid(items, W, H, gap) {
  let best = null;
  for (let cols = 1; cols <= items.length; cols++) {
    const rows = Math.ceil(items.length / cols);
    const cw = (W - gap * (cols - 1)) / cols;
    const ch = (H - gap * (rows - 1)) / rows;
    const ih = ch - SHEET_CAP_MM;
    if (cw <= 6 || ih <= 10) continue;
    let area = 0, minSide = Infinity;
    for (const it of items) {
      const s = Math.min(cw / it.w, ih / it.h);
      const dw = it.w * s, dh = it.h * s;
      area += dw * dh;
      minSide = Math.min(minSide, Math.min(dw, dh));
    }
    const cand = { cols, rows, cw, ch, ih, area, minSide };
    if (!best || minSide > best.minSide || (minSide === best.minSide && area > best.area)) best = cand;
  }
  return best;
}

function renderSheetLabel(cfg) {
  const W = 138, GAP = 3;
  // 지면 예산(mm): 유효 200 - 헤더 15 - 메타 8 - 푸터 13
  const H = 200 - 15 - 8 - 13;
  const g = sheetGrid(cfg.sheets, W, H, GAP);

  let h = `<div class="label sheetlb">`;
  h += `<div class="lb-head"><div class="lb-client">${esc(cfg.client)}</div>`
     + `<div class="lb-boxn">박스 <b>${cfg.box}</b> / ${cfg.boxes}</div></div>`;
  h += `<div class="lb-meta">${esc(cfg.date)}<span class="dot">·</span>${esc(cfg.content)}`
     + `<span class="dot">·</span>판 ${cfg.sheets.length}장`
     + `${cfg.part ? `<span class="pg">장 ${esc(cfg.part)}</span>` : ''}</div>`;
  h += `<div class="sh-grid" style="height:${H}mm;gap:${GAP}mm;`
     + `grid-template-columns:repeat(${g.cols}, ${g.cw.toFixed(1)}mm)">`;
  cfg.sheets.forEach((s, i) => {
    const sc = Math.min(g.cw / s.w, g.ih / s.h);
    h += `<div class="sh-cell" style="height:${g.ch.toFixed(1)}mm">`
       + `<div class="sh-img" style="width:${(s.w * sc).toFixed(1)}mm;height:${(s.h * sc).toFixed(1)}mm">`
       + `<img src="${s.img}"></div>`
       + `<div class="sh-cap"><div class="sh-cap1"><b>판${s.no}</b> ${esc(s.spec)}</div>`
       + `<div class="sh-cap2">지시 <b>${s.pieces}</b>장<span class="dot">·</span>실제 <span class="wbox2"></span></div>`
       + `</div></div>`;
  });
  h += `</div>`;
  h += `<div class="lb-foot"><div class="lb-fin"><b>파일</b> ${esc(cfg.file)}</div>`
     + `<div class="lb-sign">확인 <span class="wl"></span></div></div>`;
  h += `<div class="lb-tag">시트·재단 · 판 ${cfg.sheets.length} · 최소변 ${g.minSide.toFixed(0)}mm</div></div>`;
  return h;
}

// 판이 너무 많으면 최소변이 우표만 해진다 — 그 아래로 내려가면 라벨을 나눈다.
// ⚠️ 20mm 는 **가설이다**. 목적이 「조각을 읽는 것」이 아니라 「판을 구분하는 것」이라
//    실물 인쇄로 확인해 조정할 값이다(판 6장 = 최소변 32mm 이 지금 표본).
const SHEET_MIN_MM = 20;
function renderSheetOrder(cfg) {
  const pages = [];
  let cur = [];
  for (const s of cfg.sheets) {
    const t = cur.concat([s]);
    const g = sheetGrid(t, 138, 200 - 15 - 8 - 13, 3);
    if (cur.length && (!g || g.minSide < SHEET_MIN_MM)) { pages.push(cur); cur = [s]; }
    else cur = t;
  }
  if (cur.length) pages.push(cur);
  return pages.map((ss, i) => renderSheetLabel({
    ...cfg, sheets: ss,
    part: pages.length > 1 ? `${i + 1} / ${pages.length}` : null,
  }));
}

const SH = (no, wCm, hCm, pieces) => ({
  no, w: wCm, h: hCm, pieces,
  spec: `${wCm}×${hCm}cm`,
  img: svgSheet(wCm, hCm, pieces, no * 3 + pieces),
});

// 판 1장 — 가장 흔한 경우
const S1 = { client: '청주시청 도시경관과', date: '2026-08-28(금)', content: '쓰레기불법투기',
  file: '청주시청-(포맥스5T+자동바니쉬)쓰레기불법투기(103x206-6장)', box: 1, boxes: 1,
  sheets: [SH(1, 103, 206, 6)] };
// 판 3장 — 용준님 예시(이미지 30개 → 10/10/10 → 박스 15/15)
const S2 = { client: '(주)한국광고기획', date: '2026-08-28(금)', content: '안전표지 30종',
  file: '한국광고기획-(솔벤시트)안전표지(137x240-10장)', box: 2, boxes: 4,
  sheets: [SH(1, 137, 240, 10), SH(2, 137, 240, 10), SH(3, 137, 180, 10)] };
// 판 6장 — 한 장에 어디까지 담기는지
const S3 = { client: '동산산업(주)', date: '2026-08-28(금)', content: '주차금지 표지',
  file: '동산산업-(포맥스3T)주차금지(90x180-8장)', box: 1, boxes: 2,
  sheets: [SH(1, 90, 180, 8), SH(2, 90, 180, 8), SH(3, 90, 180, 6),
           SH(4, 137, 100, 4), SH(5, 137, 100, 4), SH(6, 90, 120, 3)] };

// ── 비교: 같은 A5 지면·같은 행 높이에서 정사각 슬롯 vs 방향 적응형 ──
function renderCompare() {
  const cases = [
    { img: IMG.h41, a: 4,     label: '4:1 현수막',    sub: '가로형 슬롯 적용',   pct: 63.9, k: 'H' },
    { img: IMG.v13, a: 1 / 3, label: '1:3 가로등배너', sub: '세로형 슬롯 적용',   pct: 28.4, k: 'V' },
    { img: IMG.s11, a: 1,     label: '1:1 표지판',    sub: '정사각 슬롯 적용',   pct: 7.7,  k: 'S' },
  ].map(x => ({ ...x, row: SLOT[x.k].h, nw: SLOT[x.k].w, nh: SLOT[x.k].h }));
  const fit = (sw, sh, a) => [Math.min(sw, sh * a), Math.min(sh, sw / a)];
  let h = `<div class="label cmp"><div class="cmp-title">정사각 슬롯 vs 방향 적응형<div class="cmp-sub">같은 A5 · 같은 행 높이 기준</div></div>`;
  h += `<table class="cmp-tb"><colgroup><col style="width:32mm"><col style="width:37mm"><col style="width:41mm"><col style="width:28mm"></colgroup>`
     + `<thead><tr><th>시안</th><th>정사각<br><span>행높이 맞춤</span></th><th>방향 적응형<br><span>제안</span></th><th>차이</th></tr></thead><tbody>`;
  cases.forEach(cs => {
    const [ow, oh] = fit(cs.row, cs.row, cs.a), [nw, nh] = fit(cs.nw, cs.nh, cs.a);
    const oldA = ow * oh, newA = nw * nh, gain = Math.round((newA / oldA - 1) * 100);
    const cOld = cs.row + 1, cNew = cs.nw + 1, dCol = cNew - cOld;
    h += `<tr><td class="cmp-lb">${esc(cs.label)}<div class="cmp-pct">${esc(cs.sub)}<br>전체 ${cs.pct}%</div></td>`
       + `<td><div class="slot old" style="width:${cs.row}mm;height:${cs.row}mm"><img src="${cs.img}"></div><div class="cmp-mm">열폭 ${cOld}mm</div></td>`
       + `<td><div class="slot" style="width:${cs.nw}mm;height:${cs.nh}mm"><img src="${cs.img}"></div><div class="cmp-mm">열폭 ${cNew}mm</div></td>`
       + `<td class="cmp-g"><b class="${gain > 0 ? 'up' : (gain < 0 ? 'dn' : 'eq')}">${gain > 0 ? '+' : ''}${gain}%</b>`
       + `<div class="cmp-mm">그림 ${Math.round(oldA)}→${Math.round(newA)}mm²</div>`
       + `<div class="cmp-mm ${dCol > 0 ? 'dn' : (dCol < 0 ? 'up' : '')}">열폭 ${dCol > 0 ? '+' : ''}${dCol}mm</div></td></tr>`;
  });
  h += `</tbody></table><div class="cmp-note">`
     + `<b>가로형(64%)</b> — 그림이 ${Math.round((fit(SLOT.H.w, SLOT.H.h, 4)[0] * fit(SLOT.H.w, SLOT.H.h, 4)[1]) / (fit(SLOT.H.h, SLOT.H.h, 4)[0] * fit(SLOT.H.h, SLOT.H.h, 4)[1]) * 10) / 10}배. 대신 시안 열이 ${SLOT.H.w - SLOT.H.h}mm 넓어져 품목명·규격 열에서 그만큼 빠진다. <b>이게 설계의 실제 대가다.</b><br>`
     + `<b>세로형(28%)</b> — 그림 면적은 같고 열 폭을 <b>${SLOT.V.h - SLOT.V.w}mm 돌려받는다</b>.<br>`
     + `<b>정사각(8%)</b> — 완전히 동일.<br>`
     + `<span class="cmp-q">판단 기준 : 가로형 칸의 품목명이 잘리지 않는가?</span></div></div>`;
  return h;
}

const CSS = `
@page { size: A4 landscape; margin: 0; }
* { box-sizing:border-box; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
html, body { margin:0; padding:0; }
body { font-family:'Malgun Gothic','맑은 고딕',sans-serif; background:#525659; }
.sheet { width:297mm; height:210mm; margin:0 auto 8mm; background:#fff; page-break-after:always;
         display:flex; position:relative; box-shadow:0 2mm 8mm rgba(0,0,0,.4); }
.sheet:last-of-type { page-break-after:auto; }
.cutline { position:absolute; left:148.5mm; top:0; bottom:0; width:0; border-left:0.3mm dashed #d00; z-index:5; }
.cutline::before { content:'재단선'; position:absolute; top:1mm; left:1mm; font-size:6pt; color:#d00; white-space:nowrap; }
body.nocut .cutline { display:none; }
.label { width:148.5mm; height:210mm; padding:5mm; overflow:hidden; display:flex; flex-direction:column; position:relative; color:#111; }
body.guides .label { outline:0.2mm dashed #bbb; outline-offset:-0.1mm; }
.lb-head { display:flex; align-items:flex-end; justify-content:space-between; gap:3mm; border-bottom:0.7mm solid #111; padding-bottom:1.6mm; }
.lb-client { font-size:16pt; font-weight:800; letter-spacing:-0.03em; line-height:1.05; }
.lb-box { font-size:9.5pt; white-space:nowrap; padding-bottom:0.6mm; }
.wm { display:inline-block; width:10mm; border-bottom:0.4mm solid #111; margin:0 1mm; }
.lb-meta { font-size:9.5pt; color:#333; margin-top:1.8mm; white-space:nowrap; overflow:hidden; }
.dot { margin:0 1.6mm; color:#aaa; }
.pg { margin-left:2.5mm; background:#111; color:#fff; padding:0.4mm 2mm; border-radius:1mm; font-weight:700; font-size:9pt; }
.lb-tb { width:138mm; border-collapse:collapse; margin-top:2.2mm; table-layout:fixed; }
.lb-tb th { font-size:8.5pt; font-weight:700; background:#eee; border:0.25mm solid #888; height:7mm; }
.lb-tb td { border:0.25mm solid #888; padding:0.8mm; vertical-align:middle; }
.th-ac { background:#fde2e2 !important; }
.td-th { padding:0.6mm !important; }
.slot { display:flex; align-items:center; justify-content:center; overflow:hidden; background:#fbfbfb; margin:0 auto; }
.slot img { width:100%; height:100%; object-fit:contain; }
.td-nm { font-size:11.5pt; font-weight:700; line-height:1.15; }
.no { display:inline-block; font-size:9pt; color:#666; margin-right:1.2mm; vertical-align:0.3mm; }
.memo { font-size:8.5pt; font-weight:400; color:#666; margin-top:0.5mm; }
.td-sp { font-size:10pt; text-align:center; line-height:1.15; }
.td-qt { font-size:16pt; font-weight:800; text-align:center; }
.td-ac { padding:1.2mm !important; }
.wbox { width:100%; height:100%; min-height:10mm; border:0.3mm dashed #aaa; border-radius:1mm; background:#fff; }
.pf { width:138mm; margin-top:2.4mm; flex:0 0 auto; }
.pf .pf-row { display:flex; align-items:center; gap:2mm; width:138mm; background:#fff; margin-bottom:1.5mm; overflow:hidden; }
.pf .pf-row img { width:auto; height:100%; max-width:132mm; object-fit:contain; }
.pf .pf-row .pf-no { position:static; flex:0 0 auto; background:none; }
.pf-h { display:flex; gap:1.5mm; }
.pf-h .pf-col { position:relative; background:#fff; overflow:hidden; }
.pf-h .pf-col img { width:100%; height:100%; object-fit:contain; }
.pf-no { position:absolute; left:0.8mm; top:0.5mm; font-size:8pt; color:#888; background:rgba(255,255,255,.85); border-radius:0.8mm; padding:0 0.8mm; z-index:2; }
.lb-memo { width:138mm; margin-top:2.5mm; border:0.3mm dashed #bbb; border-radius:1.2mm; position:relative; flex:0 0 auto; }
.lb-memo span { position:absolute; left:2mm; top:1.2mm; font-size:8.5pt; color:#aaa; }
.lb-foot { margin-top:auto; border-top:0.5mm solid #111; padding-top:1.8mm; }
.lb-fin { font-size:10pt; line-height:1.3; }
.lb-sign { font-size:10pt; margin-top:3mm; }
.wl { display:inline-block; width:45mm; border-bottom:0.4mm solid #111; }
.lb-tag { position:absolute; right:5mm; bottom:2mm; font-size:7pt; color:#ccc; letter-spacing:0.04em; }
.cmp-title { font-size:12pt; font-weight:800; border-bottom:0.6mm solid #111; padding-bottom:1.6mm; }
.cmp-sub { font-size:8pt; font-weight:400; color:#777; margin-top:0.8mm; }
.cmp-tb { width:138mm; border-collapse:collapse; margin-top:4mm; table-layout:fixed; }
.cmp-tb th { font-size:8.5pt; border:0.25mm solid #888; background:#eee; padding:1.5mm 0; }
.cmp-tb th span { font-weight:400; color:#666; font-size:7pt; }
.cmp-tb td { border:0.25mm solid #888; padding:2.5mm 1mm; text-align:center; vertical-align:middle; }
.cmp-tb td .slot { margin-bottom:1.2mm; }
.cmp-lb { font-size:10pt; font-weight:700; text-align:left !important; padding-left:2mm !important; }
.cmp-pct { font-size:7.5pt; font-weight:400; color:#777; margin-top:0.8mm; }
.slot.old { border:0.25mm dotted #c00; }
.cmp-g b { font-size:14pt; } .cmp-g b.up { color:#047857; } .cmp-g b.dn { color:#b91c1c; } .cmp-g b.eq { color:#555; }
.cmp-mm { font-size:7.5pt; color:#777; }
.cmp-mm.up { color:#047857; font-weight:700; } .cmp-mm.dn { color:#b91c1c; font-weight:700; }
.cmp-note { font-size:9pt; color:#444; line-height:1.5; margin-top:auto; border-top:0.4mm solid #ccc; padding-top:2mm; }
.cmp-q { display:block; margin-top:2mm; padding-top:1.6mm; border-top:0.3mm dotted #bbb; font-weight:700; color:#111; }
.ui { max-width:297mm; margin:8mm auto; background:#fff; padding:7mm 8mm; border-radius:2mm; font-size:10.5pt; line-height:1.65; color:#222; }
.ui h1 { font-size:15pt; margin:0 0 2mm; } .ui h2 { font-size:11pt; margin:6mm 0 1.5mm; padding-top:4mm; border-top:1px solid #e5e5e5; }
.ui ol, .ui ul { margin:1.5mm 0; padding-left:6mm; } .ui li { margin:1mm 0; }
.ui .chk { display:inline-block; width:3.5mm; height:3.5mm; border:1.5px solid #888; border-radius:1px; vertical-align:-0.5mm; margin-right:2mm; }
/* 시트(재단) 라벨 — 판 전체 이미지 N개 */
.lb-boxn { font-size:11pt; white-space:nowrap; padding-bottom:0.4mm; }
.lb-boxn b { font-size:15pt; }
.sh-grid { display:grid; margin-top:2.2mm; align-content:start; justify-content:start; }
.sh-cell { display:flex; flex-direction:column; align-items:center; justify-content:flex-start; overflow:hidden; }
.sh-img { border:0.25mm solid #888; background:#fff; overflow:hidden; }
.sh-img img { width:100%; height:100%; display:block; }
.sh-cap { font-size:7.5pt; color:#222; margin-top:1.1mm; white-space:nowrap; text-align:center; line-height:1.25; }
.sh-cap1 b { font-size:8.5pt; }
.sh-cap2 { margin-top:0.8mm; }
/* 실제 기입칸 — 체크박스가 아니라 보드마카로 숫자를 쓰는 칸(08-18 확정) */
.wbox2 { display:inline-block; width:11mm; height:5mm; border:0.3mm solid #111; background:#fde2e2;
         border-radius:0.6mm; vertical-align:-1.4mm; }
.sheetlb .lb-fin { font-size:7.5pt; color:#333; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:100mm; }
.ui code { background:#f2f2f2; padding:0.5mm 1.2mm; border-radius:1mm; font-size:9.5pt; }
.ui .warn { background:#fff7ed; border-left:3px solid #ea580c; padding:3mm 4mm; margin:3mm 0; }
.tgl { background:#111; color:#fff; padding:2.5mm 5mm; border-radius:1.5mm; cursor:pointer; font-size:10pt; border:none; margin-right:2mm; }
@media print { .ui { display:none !important; } body { background:#fff; } .sheet { margin:0; box-shadow:none; } }
`;

// A4 가로 1장 = A5 라벨 2장 (재단선 기준).
//   운영 인쇄도 이 출력물을 반 자르거나, 미리 재단해둔 A5 낱장을 급지하면 그대로 쓴다.
const labels = [].concat(
  renderOrder(O1), renderOrder(O2), renderOrder(O3), renderOrder(O4),
  renderOrder(O5), renderOrder(O6),
  // 시트·재단 계열 = 판 전체 이미지(2026-08-28). 위 6건과 **같은 A5**를 쓴다.
  renderSheetOrder(S1), renderSheetOrder(S2), renderSheetOrder(S3),
  [renderCompare()]
);
const sheets = [];
for (let i = 0; i < labels.length; i += 2) {
  sheets.push('<div class="sheet"><div class="cutline"></div>' + labels[i] + (labels[i + 1] || '<div class="label"></div>') + '</div>');
}

const html = `<!DOCTYPE html>
<html lang="ko"><head><meta charset="utf-8">
<title>마감 스티커 A5 목업 — 동산기획 MES</title>
<style>${CSS}</style></head><body class="guides">
<div class="ui">
  <h1>마감 스티커 A5 목업 (인쇄 테스트용)</h1>
  <p><b>A4 가로 1장 = A5 라벨 2장</b>입니다. 인쇄소에서 A4로 뽑아 <b>가운데 재단선을 자르면 실물 A5</b>가 됩니다.
  운영 시에도 같은 출력물을 반 자르거나, 미리 재단해둔 A5 낱장을 급지하면 됩니다.
  총 <b>${sheets.length}장</b>(라벨 ${labels.length}개).</p>
  <p><button class="tgl" onclick="document.body.classList.toggle('guides')">라벨 테두리 켜기/끄기</button>
  <button class="tgl" onclick="document.body.classList.toggle('nocut')">재단선 켜기/끄기</button></p>
  <div class="warn"><b>인쇄 설정 필수</b> — 용지 A4 · 방향 <b>가로</b> · 배율 <b>100%(실제 크기)</b> · 여백 <b>없음</b> · <b>배경 그래픽 켜기</b> · <b>컬러</b>.
  「페이지에 맞춤」이 켜져 있으면 mm 치수가 어긋나 검증이 무의미해집니다.</div>
  <h2>확인할 것</h2>
  <ol>
    <li><span class="chk"></span><b>썸네일 식별력</b> — 표 안 38×14mm(가로형)로 시안이 구분되는지. <b>이번 설계의 핵심입니다.</b></li>
    <li><span class="chk"></span><b>「실제」 칸</b> — 보드마카로 숫자 쓰기에 충분한지(21~35mm 폭).</li>
    <li><span class="chk"></span><b>크기 감각</b> — A5가 현수막 묶음·박스에 붙이기 적당한지, 너무 크지 않은지.</li>
    <li><span class="chk"></span><b>품목명 잘림</b> — 가로형 라벨에서 품목명이 잘리지 않는지. 시안 열을 넓힌 대가입니다.</li>
    <li><span class="chk"></span><b>마지막 장 비교표</b> — 방향 적응형이 정말 나은지.</li>
  </ol>
  <h2>담긴 케이스</h2>
  <ul>
    <li><b>현수막·봉제 계열(행별 시안)</b> — 가로형 4줄 / 세로형 3줄 / 가로형 1줄 / 정사각형 2줄 / <b>방향 혼재 4줄</b> / <b>9줄 → 자동 분할(1·2 / 2)</b></li>
    <li><b>시트·재단 계열(판 전체 이미지)</b> — 판 1장 / <b>판 3장</b>(이미지 30개 → 10·10·10 → 박스 15·15) / <b>판 6장</b>(한 장에 어디까지 담기는지)</li>
    <li>마지막 = 정사각 슬롯 vs 방향 적응형 비교표</li>
  </ul>
  <h2>시트·재단 라벨에서 특히 볼 것</h2>
  <ol>
    <li><span class="chk"></span><b>판 이미지 식별력</b> — 판이 3장·6장일 때 조각 번호가 읽히는지. 안 읽혀도 <b>판을 구분</b>할 수 있으면 목적은 달성입니다.</li>
    <li><span class="chk"></span><b>박스 번호</b> — <code>박스 2 / 4</code> 가 붙인 채로 멀리서 읽히는지. 출력 시 박스 수를 입력하면 N부가 자동 연번으로 나옵니다(손기입 아님).</li>
    <li><span class="chk"></span><b>판 6장</b> — 최소변이 12mm 아래로 내려가면 라벨을 자동으로 나눕니다(<code>장 1/2</code>). 그 경계가 적절한지.</li>
    <li><span class="chk"></span><b>「장 n/m」 과 「박스 n/N」 이 헷갈리지 않는지</b> — 서로 다른 수이고 한 장에 같이 나옵니다.</li>
  </ol>
</div>
${sheets.join('\n')}
</body></html>`;

fs.writeFileSync(process.argv[2], html, 'utf8');
console.log('written:', process.argv[2], (html.length / 1024).toFixed(0) + 'KB', '| labels:', labels.length, '| sheets:', sheets.length);
