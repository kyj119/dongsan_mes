#!/usr/bin/env node
/**
 * 실물 조각 진단 — 굽힌 PNG 를 패널과 **같은 엔진**으로 돌려 세 증상의 기전을 사실로 가른다.
 *
 *   node scripts/cut/sample-diagnose.mjs <piece.png> [배치격자mm/px] [미세mm/px]
 *
 * ★왜 필요한가 — "여백 0 에서 겹치고 글자마다 칼선이 난다"는 보고를 코드 읽기로만 설명하면
 *   그럴듯한 오진이 나온다(이 세션에서 DXF 조각 수를 두 번 틀렸다). 굽힌 실물 마스크를
 *   그대로 넣어 **숫자로** 확인한다.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import G, { decodePNG } from './geometry.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
// butt.js 는 UMD — 하네스(cut:butt)와 **같은 방식**으로 전역에 올려 쓴다
const BUTT_JS = path.join(ROOT, 'IllustratorAutomat/designer/poc-a0-cep/com.mes.a0.panel/js/butt.js');
await import('file:///' + BUTT_JS.split(path.sep).join('/'));
const BT = globalThis.MesCutButt;

const PNG = process.argv[2];
const BASE = parseFloat(process.argv[3] || '0.75');   // 배치 격자
const FINE = parseFloat(process.argv[4] || '0.25');   // 굽기 격자
const SUB = Math.max(1, Math.round(BASE / FINE));
const EDGE_ALPHA_THR = 128, PRESENCE_ALPHA_THR = 16, DOWNSAMPLE_COVER = 0.5;
const MIN_HOLE_MM = 2;

if (!PNG) { console.error('사용: node scripts/cut/sample-diagnose.mjs <piece.png> [base] [fine]'); process.exit(1); }

const img = decodePNG(fs.readFileSync(PNG));
console.log(`파일 ${path.basename(PNG)}  ${img.W}x${img.H}px @ ${FINE}mm/px  = ${(img.W * FINE).toFixed(1)} x ${(img.H * FINE).toFixed(1)} mm`);
console.log(`배치 격자 ${BASE}mm/px · sub ${SUB} (블록 ${SUB}x${SUB}, 50% 통과에 ${Math.ceil(SUB * SUB * 0.5)}/${SUB * SUB} 필요)\n`);

const fine = G.inkMask(img, 'alpha', EDGE_ALPHA_THR);
const count = (m) => { let n = 0; for (let i = 0; i < m.length; i++) n += m[i]; return n; };
const comps = (m, W, H) => { const c = G.components(m, W, H, 1); let n = 0; for (let i = 0; i < c.sizes.length; i++) if (c.sizes[i] >= 16) n++; return n; };

console.log('[A] 미세 마스크 (칼선이 보는 것)');
console.log(`   잉크 ${count(fine)}px · 연결요소(16px+) ${comps(fine, img.W, img.H)}개`);

console.log('\n[B] 배치 마스크 — 축소 후에도 테두리가 남는가');
for (const cover of [DOWNSAMPLE_COVER, 0.25, 0.01]) {
  const ds = G.downsampleMask(fine, img.W, img.H, SUB, cover);
  const n = comps(ds.m, ds.W, ds.H);
  const ink = count(ds.m);
  // 테두리 생존 판정 = 축소 마스크의 최외곽 행/열에 잉크가 연속으로 있는가
  let topRow = 0, leftCol = 0;
  const bb = BT.inkBBox({ W: ds.W, H: ds.H, m: ds.m });
  if (bb) {
    for (let x = 0; x < bb.W; x++) if (ds.m[(bb.T) * ds.W + bb.L + x]) topRow++;
    for (let y = 0; y < bb.H; y++) if (ds.m[(bb.T + y) * ds.W + bb.L]) leftCol++;
  }
  const tag = cover === DOWNSAMPLE_COVER ? '  ← 현재값' : '';
  console.log(`   피복 ${String(cover).padEnd(5)} → 잉크 ${String(ink).padStart(6)}px · 요소 ${String(n).padStart(3)}개 ·`
    + ` 윗변 연속 ${bb ? (topRow / bb.W * 100).toFixed(0) : '?'}% · 좌변 연속 ${bb ? (leftCol / bb.H * 100).toFixed(0) : '?'}%${tag}`);
}

console.log('\n[C] 직사각 판정 (맞붙임 게이트)');
{
  const ds = G.downsampleMask(fine, img.W, img.H, SUB, DOWNSAMPLE_COVER);
  const c = G.components(ds.m, ds.W, ds.H, 1);
  let best = 0;
  for (let i = 1; i < c.sizes.length; i++) if (c.sizes[i] > c.sizes[best]) best = i;
  const m2 = new Uint8Array(ds.W * ds.H);
  for (let i = 0; i < m2.length; i++) if (c.lab[i] === best) m2[i] = 1;
  const mainMask = { W: ds.W, H: ds.H, m: m2 };
  const bb = BT.inkBBox(mainMask);
  const fillPct = bb ? (count(m2) / (bb.W * bb.H) * 100) : 0;
  // ★본체가 무엇인가 — 테두리인가 글자인가. 이걸 안 보면 판정 실패 사유를 오진한다.
  const dsBB = BT.inkBBox({ W: ds.W, H: ds.H, m: ds.m });
  console.log(`   조각 전체 bbox ${dsBB.W}x${dsBB.H} · 본체 bbox ${bb.W}x${bb.H}`
    + `  → 본체는 ${(bb.W >= dsBB.W * 0.9 && bb.H >= dsBB.H * 0.9) ? '조각 전체(테두리)' : '★일부(글자)'}`);
  console.log(`   본체 채움 ${fillPct.toFixed(1)}%  (기준 98%)  → isRectish = ${BT.isRectish(mainMask)}`);

  // ★핵심 검증 — **조각 전체 마스크의 구멍을 채우면** 직사각으로 잡히는가
  const filledAll = fillHoles({ W: ds.W, H: ds.H, m: ds.m });
  const fb = BT.inkBBox(filledAll);
  const fPct = fb ? (count(filledAll.m) / (fb.W * fb.H) * 100) : 0;
  const fComp = comps(filledAll.m, ds.W, ds.H);
  console.log(`   ★전체 구멍 채운 뒤: 요소 ${fComp}개 · 채움 ${fPct.toFixed(1)}% → isRectish = ${BT.isRectish(filledAll)}`);
}

console.log('\n[D] 칼선 개수 (여백 0 = 팽창 없음)');
{
  const minCutPx = Math.max(16, Math.round(img.W * img.H * 0.01));
  const cps = G.traceAll(fine, img.W, img.H, minCutPx);
  const minHolePx = Math.max(4, Math.PI * Math.pow((MIN_HOLE_MM / 2) / FINE, 2));
  const holes = G.findHoles(fine, img.W, img.H, minHolePx);
  console.log(`   minCutPx ${minCutPx} · minHolePx ${Math.round(minHolePx)}`);
  console.log(`   외곽 컨투어 ${cps.length}개 · 구멍 ${holes.length}개 → 재단선 총 ${cps.length + holes.length}줄`);
  const filledFine = fillHoles({ W: img.W, H: img.H, m: fine });
  const cps2 = G.traceAll(filledFine.m, img.W, img.H, minCutPx);
  console.log(`   ★구멍 채운 뒤: 외곽 ${cps2.length}개 · 구멍 0개 → 재단선 총 ${cps2.length}줄`);
}

/** 바깥에서 못 닿는 배경을 잉크로 만든다 = 구멍 메우기 (flood fill from border) */
function fillHoles(mask) {
  const { W, H, m } = mask;
  const out = new Uint8Array(W * H);
  const outside = new Uint8Array(W * H);
  const st = [];
  for (let x = 0; x < W; x++) { st.push(x); st.push((H - 1) * W + x); }
  for (let y = 0; y < H; y++) { st.push(y * W); st.push(y * W + W - 1); }
  while (st.length) {
    const i = st.pop();
    if (i < 0 || i >= W * H || outside[i] || m[i]) continue;
    outside[i] = 1;
    const x = i % W, y = (i / W) | 0;
    if (x > 0) st.push(i - 1);
    if (x < W - 1) st.push(i + 1);
    if (y > 0) st.push(i - W);
    if (y < H - 1) st.push(i + W);
  }
  for (let i = 0; i < W * H; i++) out[i] = (m[i] || !outside[i]) ? 1 : 0;
  return { W, H, m: out };
}
