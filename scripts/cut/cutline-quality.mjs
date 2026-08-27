#!/usr/bin/env node
/**
 * 칼선 품질 실측 — **mm 단위로** 얼마나 어긋나는가 (`npm run cut:quality`)
 *
 * ★왜 면적오차%로는 부족한가
 *   `cut:bench` 는 면적오차 0.2~0.6% 로 통과한다. 그런데 현장 판정은 면적이 아니라 **mm** 다.
 *   100mm 도형의 0.5% 면적오차는 경계에서 0.25mm 쯤이고, 그건 눈에 보인다.
 *   2026-08-07 에 "재단선이 삐뚤게 나온다"는 실사용 보고가 있었고, 그때는 **직사각만**
 *   bbox 로 우회했다(cut-main.js `rectOnly`). 이형은 지금도 그대로 추적한다.
 *
 * 생산 설정을 그대로 쓴다: 굽기 0.25mm/px · 곡선 허용오차 0.4mm(= ctol 1.6px).
 *
 * 재는 것
 *   ① 직선변이 얼마나 휘는가        — 곧아야 할 변의 최대 이탈(mm)
 *   ② 90° 모서리가 얼마나 깎이는가  — 참 모서리에서 안쪽으로 들어간 거리(mm)
 *   ③ 원이 얼마나 찌그러지는가      — 반지름 최대·최소 편차(mm)
 *   ④ 곡선 근사가 얼마나 벗어나는가 — 참 곡선까지의 최대 거리(mm)
 */
import path from 'path';
import { fileURLToPath } from 'url';
import G from './geometry.mjs';

const FINE_MM = 0.25;          // 굽기 격자(생산값)
const CTOL_MM = 0.4;           // 곡선 피팅 허용오차(생산값 — cut-main.js ctol)
const ctol = Math.max(1, CTOL_MM / FINE_MM);
const px = (mm) => Math.round(mm / FINE_MM);
const mm = (p) => p * FINE_MM;

function raster(W, H, inside) {
  const m = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (inside(x, y)) m[y * W + x] = 1;
  return m;
}
/** 생산 경로와 같은 순서: traceAll → (곡선이면) fitCurves → 평탄화 */
function cutPoly(m, W, H, curve) {
  const cps = G.traceAll(m, W, H, 16);
  if (!cps.length) return [];
  const poly = cps[0].poly;
  if (!curve) return G.simplify(poly, ctol);
  const segs = G.fitCurves(poly, ctol);
  const out = [];
  // flattenCubic(p0,c1,c2,p1,tol,out) — 결과를 out 배열에 밀어 넣는다(반환 아님)
  for (const s of segs) G.flattenCubic(s[0], s[1], s[2], s[3], 0.2, out);
  return out.length ? out : G.simplify(poly, ctol);
}
const distToSeg = (p, a, b) => {
  const vx = b[0] - a[0], vy = b[1] - a[1];
  const L = vx * vx + vy * vy;
  let t = L ? ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / L : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - (a[0] + t * vx), p[1] - (a[1] + t * vy));
};

console.log(`생산 설정 — 굽기 ${FINE_MM}mm/px · 곡선 허용오차 ${CTOL_MM}mm (ctol ${ctol.toFixed(1)}px)\n`);

// ── ① 직선변 + ② 모서리 : 200×120mm 직사각 (bbox 우회 없이 **추적**했을 때) ──
{
  const W = px(220), H = px(140), x0 = px(10), y0 = px(10), x1 = px(210), y1 = px(130);
  const m = raster(W, H, (x, y) => x >= x0 && x < x1 && y >= y0 && y < y1);
  for (const curve of [false, true]) {
    const poly = cutPoly(m, W, H, curve);
    // 윗변(y=y0) 위에 있어야 할 점들의 이탈
    let edgeMax = 0;
    for (const p of poly) {
      if (p[0] > x0 + 4 && p[0] < x1 - 4 && p[1] < (y0 + y1) / 2) edgeMax = Math.max(edgeMax, Math.abs(p[1] - y0));
    }
    // 모서리 4곳 — 참 모서리에서 폴리곤까지의 최단거리 = 깎인 양
    const corners = [[x0, y0], [x1 - 1, y0], [x1 - 1, y1 - 1], [x0, y1 - 1]];
    let cornerMax = 0;
    for (const c of corners) {
      let best = Infinity;
      for (let i = 0; i < poly.length; i++) best = Math.min(best, distToSeg(c, poly[i], poly[(i + 1) % poly.length]));
      cornerMax = Math.max(cornerMax, best);
    }
    console.log(`[직사각 200×120 을 **추적**했을 때]  ${curve ? '곡선' : '직선'}  앵커 ${poly.length}개`);
    console.log(`   직선변 최대 이탈  ${mm(edgeMax).toFixed(2)}mm`);
    console.log(`   모서리 최대 깎임  ${mm(cornerMax).toFixed(2)}mm   ${mm(cornerMax) > 0.5 ? '★눈에 보임' : ''}`);
  }
  console.log('   ※ 실제 판짜기는 사각을 추적하지 않고 bbox 로 우회한다(2026-08-07) — 위는 이형에서 벌어지는 일이다.\n');
}

// ── ③ 원 진원도 : 지름 100mm ──
{
  const R = px(50), W = px(120), H = px(120), cx = W / 2, cy = H / 2;
  const m = raster(W, H, (x, y) => Math.hypot(x - cx, y - cy) <= R);
  for (const curve of [false, true]) {
    const poly = cutPoly(m, W, H, curve);
    let rmin = Infinity, rmax = 0;
    for (const p of poly) { const r = Math.hypot(p[0] - cx, p[1] - cy); rmin = Math.min(rmin, r); rmax = Math.max(rmax, r); }
    console.log(`[원 ⌀100]  ${curve ? '곡선' : '직선'}  앵커 ${poly.length}개  반지름 ${mm(rmin).toFixed(2)}~${mm(rmax).toFixed(2)}mm (참 ${mm(R).toFixed(2)})`);
    console.log(`   최대 편차 ${mm(Math.max(rmax - R, R - rmin)).toFixed(2)}mm`);
  }
  console.log('');
}

// ── ④ 45° 사선 — 계단이 얼마나 남는가 ──
{
  const W = px(160), H = px(160);
  const m = raster(W, H, (x, y) => x >= px(10) && y >= px(10) && (x - px(10)) + (y - px(10)) <= px(120));
  for (const curve of [false, true]) {
    const poly = cutPoly(m, W, H, curve);
    // 사선 위에 있어야 할 점의 이탈 (x+y = const)
    const c = px(120) + px(10) + px(10);
    let dmax = 0, n = 0;
    for (const p of poly) {
      if (p[0] > px(20) && p[1] > px(20) && p[0] + p[1] > c - px(20)) { dmax = Math.max(dmax, Math.abs(p[0] + p[1] - c) / Math.SQRT2); n++; }
    }
    console.log(`[45° 사선]  ${curve ? '곡선' : '직선'}  사선 앵커 ${n}개  최대 이탈 ${mm(dmax).toFixed(2)}mm`);
  }
  console.log('');
}

// ── ⑤ 가는 획 — 얇은 부분이 살아남는가 ──
{
  console.log('[가는 획이 칼선으로 살아남는가]');
  for (const wMm of [0.5, 1, 2, 3]) {
    const W = px(60), H = px(40);
    const m = raster(W, H, (x, y) => y >= px(10) && y < px(30) && x >= px(10) && x < px(10) + px(wMm));
    const cps = G.traceAll(m, W, H, 16);
    const poly = cps.length ? cutPoly(m, W, H, true) : [];
    let wOut = 0;
    if (poly.length) {
      let x0 = Infinity, x1 = -Infinity;
      for (const p of poly) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); }
      wOut = x1 - x0;
    }
    console.log(`   획 ${wMm}mm → 칼선 폭 ${poly.length ? mm(wOut).toFixed(2) + 'mm' : '★사라짐'}  ${poly.length && Math.abs(mm(wOut) - wMm) > 0.3 ? '(★' + (mm(wOut) - wMm > 0 ? '+' : '') + (mm(wOut) - wMm).toFixed(2) + 'mm)' : ''}`);
  }
}
