#!/usr/bin/env node
/**
 * 재단 판짜기 **E2E 게이트** — `npm run cut:e2e`  (케이스 하나만: `--only=A` · `--only=S`)
 *
 * 왜 있나 (2026-08-31):
 *   `cut:smoke` 는 소스를 읽는 정적 검사라 "코드가 이렇게 생겼다"까지만 본다.
 *   실제 결함은 **일러가 실제로 무엇을 그리는가**에서 났다 — 불투명도 마스크가 변형을
 *   따라오지 않아 배경이 통째로 사라졌고, 정적 게이트 452항목을 **전부 통과**했다.
 *
 * ── 판정 세 종류 ─────────────────────────────────────────────────────
 * **절대 판정**(`absolute`) = 판의 마젠타 비율이 원본과 같은가. 기준이 확립된 케이스에만 쓴다(A).
 * **동등 판정**(pairs) = 같은 입력을 새 경로(격자 마스터)와 옛 경로(조각별)로 돌려 결과가 같은가.
 *   「굳히기 판당 1회」(0.32.0)는 빨라지는 변경이고 결과를 바꾸지 않는다 — 그 성질을 직접 못박는다.
 * **모양 판정**(S) = 굳힌 조각의 칼선이 **바깥 사각**이 되지 않는가.
 *   2026-09-04 실물에서 회전한 조각만 칼선이 사각으로 나왔다(곡선 도형 → 4점 정사각).
 *   원인 = PDF 굳히기 임베드가 만든 **사각 클립 2겹**을 `vecCropClip` 이 최상위만 풀어
 *   남은 사각이 OffsetPath+Pathfinder 에 섞인 것. 색·크기 게이트는 이걸 **원리적으로 못 잡는다**
 *   — 크기도 위치도 색도 정확하고 **모양만** 틀리다. 그래서 별도 축이 필요하다.
 *
 * ⚠️ **절대 기준이 확립되지 않은 케이스로 게이트를 실패시키지 않는다**([[feedback-gate-must-be-fixable]]).
 *    2026-09-04 에 시트를 3000x3000mm 로 키운 새 케이스가 마젠타 98%로 떴는데 원인은 제품이 아니라
 *    **하네스가 만든 거대 문서**였다(850x1280 으로 되돌리니 57.1% 복귀). 확립 안 된 기준으로
 *    빨간불을 켜면 사람이 게이트를 끈다 → 그런 관측은 `info` 로 **보고만** 한다.
 *
 * ★미해결 관측 (info=G) — 판이 작을 때 픽스처 마스크가 판에 안 실린다. G 는 회전 0·배율 1배라
 *    **굳히기 경로를 아예 안 탄다**(`placed=0`). 즉 굳히기·회전·배율과 무관한 축이고 0.32.0
 *    이전에도 같다. 하네스 아티팩트인지 제품 결함인지 아직 안 갈렸다 — 가리기 전엔 실패로 안 만든다.
 *
 * ⚠️ 일러스트레이터가 **실행 중이어야** 한다. 없으면 실패가 아니라 **건너뛴다**(exit 0).
 *    반드시 돌려야 하는 자리에서는 `--require` 로 강제한다.
 * ⚠️ 임시 문서를 만들고 닫는다(전부 DONOTSAVECHANGES — 픽스처 파일은 절대 안 바뀐다).
 * ⚠️ 시트 크기를 함부로 키우지 말 것 — 위 3000mm 사고가 그것이다. 조각이 들어갈 만큼만.
 */
'use strict'
const fs = require('fs')
const os = require('os')
const path = require('path')
const { execFileSync } = require('child_process')

const NL = String.fromCharCode(10)
const REPO = path.resolve(__dirname, '..')
const FIXTURE = path.join(REPO, 'IllustratorAutomat', 'designer', 'fixtures', 'opacity-mask.ai')
const FIX_NESTED = path.join(REPO, 'IllustratorAutomat', 'designer', 'fixtures', 'nested-group.ai')
const FIX_LETTERS = path.join(REPO, 'IllustratorAutomat', 'designer', 'fixtures', 'separated-letters.ai')
const HOST = path.join(REPO, 'IllustratorAutomat', 'designer', 'mes-cut-host.jsx')
const REQUIRE = process.argv.includes('--require')
// 케이스 하나만 돌린다 — 원인을 가를 때 일러를 덜 때리려고(`--only=A` 또는 `--only=D,E`)
const ONLY = (process.argv.find((a) => a.indexOf('--only=') === 0) || '').slice(7).split(',').filter(Boolean)

const ESC = String.fromCharCode(27)
const C = {
  b: (s) => ESC + '[1m' + s + ESC + '[0m',
  dim: (s) => ESC + '[2m' + s + ESC + '[0m',
  r: (s) => ESC + '[31m' + s + ESC + '[0m',
  g: (s) => ESC + '[32m' + s + ESC + '[0m',
  y: (s) => ESC + '[33m' + s + ESC + '[0m',
}
const fwd = (p) => p.split(path.sep).join('/')

function skip(why) {
  if (REQUIRE) { console.error(C.r('X ') + why + ' (--require 이므로 실패로 처리)'); process.exit(1) }
  console.log(C.y('건너뜀 — ') + why)
  console.log(C.dim('   일러스트레이터를 켜고 다시 실행하세요. 강제하려면 --require.'))
  process.exit(0)
}

function ps(script) {
  return execFileSync('powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
    { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, timeout: 15 * 60 * 1000 })
}

function runJsx(dir, jsx, file) {
  const jp = path.join(dir, file)
  fs.writeFileSync(jp, jsx, 'utf8')
  try {
    ps('$ai = [Runtime.InteropServices.Marshal]::GetActiveObject("Illustrator.Application"); $null = $ai.DoJavaScriptFile("' + fwd(jp) + '")')
  } catch (e) { return { fatal: '하네스 실행 실패: ' + String(e.stdout || '') + String(e.stderr || e.message) } }
  const rp = path.join(dir, 'result.txt')
  if (!fs.existsSync(rp)) return { fatal: '결과 파일이 없습니다 — 하네스가 죽었습니다' }
  const res = {}
  for (const line of fs.readFileSync(rp, 'utf8').split(/\r?\n/)) {
    const k = line.indexOf('=')
    if (k > 0) res[line.slice(0, k)] = line.slice(k + 1)
  }
  return { res }
}

// ── 준비 확인 ────────────────────────────────────────────────────────
if (process.platform !== 'win32') skip('Windows 가 아닙니다')
if (!fs.existsSync(FIXTURE)) skip('픽스처가 없습니다: ' + FIXTURE)
if (!fs.existsSync(HOST)) skip('호스트가 없습니다: ' + HOST)

let alive = ''
try {
  alive = ps('try { $null = [Runtime.InteropServices.Marshal]::GetActiveObject("Illustrator.Application"); "yes" } catch { "no" }').trim()
} catch (e) { alive = 'no' }
if (alive !== 'yes') skip('일러스트레이터가 실행 중이 아닙니다')

// ── 케이스 정의 ──────────────────────────────────────────────────────
// AT = 배치 원점(mm) · step = 조각 사이 간격(mm). **배율을 반영**해야 한다 — 안 하면 조각이 겹쳐
//      앞 조각의 뒤판이 뒤 조각 그라디언트를 덮고 색 판정이 무의미해진다(2026-09-04 실제로 그랬다).
const AT = 20, SHEET_W = 850, SHEET_H = 1280
const CASES = [
  { key: 'A', name: '배율 1000%·90도 (1조각)', scale: 1000, rot: 90, pieces: 1, off: false, step: 830, absolute: true },
  { key: 'D', name: '회전만 90도 (1조각) — 실사용 시나리오', scale: 100, rot: 90, pieces: 1, off: false, step: 110 },
  { key: 'E', name: '같은 입력을 옛 경로로 (1조각)', scale: 100, rot: 90, pieces: 1, off: true, step: 110 },
  { key: 'B', name: '회전만 90도 (2조각·격자 나누기)', scale: 100, rot: 90, pieces: 2, off: false, step: 110 },
  { key: 'C', name: '같은 입력을 옛 경로로 (2조각)', scale: 100, rot: 90, pieces: 2, off: true, step: 110 },
  { key: 'G', name: '회전 0도·배율 1배 (굳히기를 아예 안 탄다)', scale: 100, rot: 0, pieces: 1, off: false, step: 150, info: true },
]

// ── 하네스 JSX 생성 ──────────────────────────────────────────────────
// ★역슬래시를 한 글자도 쓰지 않는다 — 이 문자열은 파일을 거쳐 일러로 가고, 그 과정에서
//   역슬래시가 사라지면 **조용히 다른 코드**가 된다(2026-08-31 에 세 번 겪었다).
function buildJsx(cs, out) {
  return [
    'var OUT = "' + out + '";',
    'var L = [];',
    'function say(s){ L.push(String(s)); }',
    'var PT = 2.834645;',
    'function mmv(v){ return Math.round(v / PT * 1000) / 1000; }',
    'function shot(doc, ab, name){',
    '  doc.artboards[0].artboardRect = ab;',
    '  var o = new ExportOptionsPNG24();',
    '  o.antiAliasing = true; o.transparency = false; o.artBoardClipping = true;',
    '  var w = ab[2]-ab[0], h = ab[1]-ab[3];',
    '  var sc = (700 / Math.max(w,h)) * 100;',
    '  o.horizontalScale = sc; o.verticalScale = sc;',
    '  doc.exportFile(new File(OUT + "/" + name), ExportType.PNG24, o);',
    '}',
    'var opened = [];',
    'try {',
    '  $.evalFile(new File("' + fwd(HOST) + '"));',
    '  say("host=" + mesCut_ping());',
    '  MESCUT_HARDEN_OFF = ' + (cs.off ? 'true' : 'false') + ';',
    '  var fx = app.open(new File("' + fwd(FIXTURE) + '"));',
    '  opened.push(fx);',
    '  app.activeDocument = fx;',
    '  var tops = mesCut_topItems(fx);',
    '  if (tops.length !== 1) throw new Error("fixture tops " + tops.length);',
    '  var ib0 = mesCut_inkBounds(tops[0]);',
    '  var w0 = ib0[2]-ib0[0], h0 = ib0[1]-ib0[3];',
    '  say("fixture=" + mmv(w0) + "x" + mmv(h0));',
    '  shot(fx, [ib0[0], ib0[1], ib0[2], ib0[3]], "ref.png");',
    '  var pieces = [tops[0]];',
    '  for (var d2 = 1; d2 < ' + cs.pieces + '; d2++) {',
    '    var dup = tops[0].duplicate(fx.layers[0], ElementPlacement.PLACEATEND);',
    '    dup.translate((w0 + 30 * PT) * d2, 0);',
    '    pieces.push(dup);',
    '  }',
    '  fx.selection = null;',
    '  for (var s2 = 0; s2 < pieces.length; s2++) pieces[s2].selected = true;',
    '  say("begin=" + mesCut_nestBegin("0"));',
    '  var pf = new File(mesCut_paramsPath());',
    '  pf.encoding = "UTF-8"; pf.open("w");',
    '  pf.writeln("RS ' + cs.scale + '");',
    '  pf.writeln("S 0 ' + SHEET_W + ' ' + SHEET_H + '");',
    '  for (var q2 = 0; q2 < pieces.length; q2++) {',
    '    pf.writeln("I " + q2 + " " + (' + AT + ' + q2 * ' + cs.step + ') + " ' + AT + ' ' + cs.rot + '");',
    '  }',
    '  pf.close();',
    '  var t0 = new Date().getTime();',
    '  var r = mesCut_nestApply(undefined, undefined, undefined, undefined, "raster");',
    '  say("ms=" + (new Date().getTime() - t0));',
    '  say("apply=" + r);',
    '  var plate = (MESCUT_NEST_DOCS && MESCUT_NEST_DOCS.length) ? MESCUT_NEST_DOCS[0] : null;',
    '  if (!plate) { say("found=0"); }',
    '  else {',
    '    opened.push(plate);',
    '    app.activeDocument = plate;',
    '    var cand = [], tp = mesCut_topItems(plate);',
    '    for (var q3 = 0; q3 < tp.length; q3++) {',
    '      if (mesCut_isCutItem(tp[q3])) continue;',
    '      var kb = mesCut_inkBounds(tp[q3]);',
    '      if (!kb) continue;',
    '      cand.push({ b: kb, a: (kb[2]-kb[0]) * (kb[1]-kb[3]) });',
    '    }',
    '    cand.sort(function(x, y){ return y.a - x.a; });',
    '    var pab = plate.artboards[0].artboardRect;',
    '    var keep = cand.slice(0, pieces.length);',
    '    keep.sort(function(x, y){ return x.b[0] - y.b[0]; });',
    '    for (var q4 = 0; q4 < keep.length; q4++) {',
    '      var kb2 = keep[q4].b;',
    '      say("piece" + q4 + "=" + mmv(kb2[2]-kb2[0]) + "x" + mmv(kb2[1]-kb2[3]));',
    '      say("at" + q4 + "=" + mmv(kb2[0] - pab[0]) + "," + mmv(pab[1] - kb2[1]));',
    '    }',
    '    say("found=" + keep.length);',
    '    shot(plate, [pab[0], pab[1], pab[2], pab[3]], "plate.png");',
    '  }',
    '} catch (e) { say("EXC " + e + (e.line ? (" line " + e.line) : "")); }',
    'for (var c = opened.length - 1; c >= 0; c--) { try { opened[c].close(SaveOptions.DONOTSAVECHANGES); } catch (eC) {} }',
    'var of = new File(OUT + "/result.txt");',
    'of.encoding = "UTF-8"; of.open("w");',
    'for (var i2 = 0; i2 < L.length; i2++) of.writeln(L[i2]);',
    'of.close();',
    '"ok";',
  ].join(NL)
}

// ── 색 분석 — 뒤판(마젠타)이 원본과 같은 비율인가 ────────────────────
function analyse(dir) {
  const psPix = [
    'Add-Type -AssemblyName System.Drawing',
    '$r = @()',
    'foreach ($n in @("ref.png","plate.png")) {',
    '  $p = Join-Path "' + dir + '" $n',
    '  if (-not (Test-Path $p)) { $r += ("{0} -1 0" -f $n); continue }',
    '  $b = [Drawing.Bitmap]::FromFile($p)',
    '  $mag = 0; $art = 0',
    '  for ($y = 0; $y -lt $b.Height; $y += 2) {',
    '    for ($x = 0; $x -lt $b.Width; $x += 2) {',
    '      $c = $b.GetPixel($x, $y)',
    '      if ($c.R -gt 240 -and $c.G -gt 240 -and $c.B -gt 240) { continue }',
    '      if ($c.R -gt 150 -and $c.B -gt 100 -and $c.G -lt 110 -and ($c.R - $c.G) -gt 60) { $mag++ } else { $art++ }',
    '    }',
    '  }',
    '  $b.Dispose()',
    '  $tot = $mag + $art',
    '  if ($tot -gt 0) { $ratio = $mag / $tot } else { $ratio = -1 }',
    '  $r += ("{0} {1:F4} {2}" -f $n, $ratio, $tot)',
    '}',
    '$r -join "|"',
  ].join(NL)
  const out = {}
  let pix = ''
  try { pix = ps(psPix).trim() } catch (e) { return out }
  for (const part of pix.split('|')) {
    const f = part.trim().split(/\s+/)
    if (f.length >= 3) out[f[0]] = { ratio: parseFloat(f[1]), n: parseInt(f[2], 10) }
  }
  return out
}

// ── [S] 칼선 실루엣 — 굳힌 조각이 바깥 사각이 되지 않는가 ────────────
// 픽스처를 쓰지 않는다 — 필요한 건 "사각이 아닌 도형" 하나라 하네스가 직접 그린다.
// ★구조를 **실물과 같게** 만든다: 그룹이 중첩돼 있어야 PDF 임베드가 클립을 **2겹** 만들고
//   그래야 이 결함이 재현된다. 평평한 그룹 하나로 시험했더니 수정을 되돌려도 통과했다
//   (2026-09-04 — 게이트가 결함을 못 잡는 것을 실측으로 확인하고 구조를 고쳤다).
function buildSilJsx(dir) {
  return [
    'var OUT = "' + dir + '";',
    'var L = [];',
    'function say(s){ L.push(String(s)); }',
    'var PT = 2.834645;',
    'function isRect(c){',
    '  if (c.typename !== "PathItem") return false;',
    '  if (c.pathPoints.length !== 4) return false;',
    '  var b = c.geometricBounds, good = 0;',
    '  for (var j = 0; j < 4; j++) {',
    '    var a = c.pathPoints[j].anchor;',
    '    var okx = (Math.abs(a[0]-b[0]) < 0.8) || (Math.abs(a[0]-b[2]) < 0.8);',
    '    var oky = (Math.abs(a[1]-b[1]) < 0.8) || (Math.abs(a[1]-b[3]) < 0.8);',
    '    if (okx && oky) good++;',
    '  }',
    '  return good === 4;',
    '}',
    'function measure(doc, item){',
    '  var cl = mesCut_ensureCutLayer(doc);',
    '  mesCut_vecSilhouette(doc, [item], cl, 0, false);',
    '  var n = 0, r = 0, sv = 0, lim = 0.2 * 2.834645;',
    '  function sliver(p){ var b = p.geometricBounds; return Math.min(b[2]-b[0], b[1]-b[3]) < lim; }',
    '  for (var k = 0; k < cl.pageItems.length; k++) {',
    '    var it = cl.pageItems[k]; n++;',
    '    if (isRect(it)) r++;',
    '    if (it.typename === "PathItem") { if (sliver(it)) sv++; }',
    '    else if (it.typename === "CompoundPathItem") {',
    '      for (var q = 0; q < it.pathItems.length; q++) { if (sliver(it.pathItems[q])) sv++; }',
    '    }',
    '  }',
    '  return n + "," + r + "," + sv;',
    '}',
    'var made = [];',
    'try {',
    '  $.evalFile(new File("' + fwd(HOST) + '"));',
    '  say("host=" + mesCut_ping());',
    // ★합성 도형으로는 재현이 안 된다 — 2026-09-04 에 타원 중첩그룹으로 시험했더니 수정을
    //   되돌려도 통과했다. PDF 임베드가 문제의 클립 2겹을 만드는 조건이 실물 아트에만 있다.
    //   그래서 **실물에서 뽑은 픽스처**를 쓴다(opacity-mask.ai 와 같은 방식).
    '  var srcDoc = app.open(new File("' + fwd(FIX_NESTED) + '"));',
    '  made.push(srcDoc);',
    '  app.activeDocument = srcDoc;',
    '  var tops = mesCut_topItems(srcDoc);',
    '  if (tops.length !== 1) throw new Error("fixture tops " + tops.length);',
    '  var grp = tops[0];',
    '  var silent = mesCut_silentBegin();',
    '  var d1 = mesCut_newDocMM(400 * PT, 400 * PT); made.push(d1);',
    '  app.activeDocument = srcDoc;',
    '  var c1 = grp.duplicate(d1.layers[0], ElementPlacement.PLACEATEND);',
    '  app.activeDocument = d1;',
    '  say("plain=" + measure(d1, c1));',
    '  var d2 = mesCut_newDocMM(400 * PT, 400 * PT); made.push(d2);',
    '  app.activeDocument = d2;',
    '  var c2 = mesCut_scaleAsPlaced(d2, d2.layers[0], grp, srcDoc, 100, 77, 90);',
    '  if (!c2) { say("hardened=FAIL"); } else { say("hardened=" + measure(d2, c2)); }',
    // ★글자 조각 — 「조각 하나 = 칼선 하나」가 벡터 경로에도 걸리는가.
    //   걸지 않으면 글자마다 칼선이 생겨 재단 시 낱개로 떨어진다(2026-09-04 실측 8줄).
    //   단품 칼선은 **낱개가 목적**이라 그대로여야 한다 — 둘 다 본다.
    '  var lt = app.open(new File("' + fwd(FIX_LETTERS) + '"));',
    '  made.push(lt);',
    '  app.activeDocument = lt;',
    '  var ltop = mesCut_topItems(lt);',
    '  if (ltop.length !== 1) throw new Error("letters tops " + ltop.length);',
    '  var d3 = mesCut_newDocMM(400 * PT, 400 * PT); made.push(d3);',
    '  app.activeDocument = lt;',
    '  var c3 = ltop[0].duplicate(d3.layers[0], ElementPlacement.PLACEATEND);',
    '  app.activeDocument = d3;',
    '  say("letters_weld=" + measure(d3, c3));',
    '  mesCut_silentEnd(silent);',
    '} catch (e) { say("EXC " + e + (e.line ? (" line " + e.line) : "")); }',
    'for (var q = made.length - 1; q >= 0; q--) { try { made[q].close(SaveOptions.DONOTSAVECHANGES); } catch (eC) {} }',
    'var of = new File(OUT + "/result.txt");',
    'of.encoding = "UTF-8"; of.open("w");',
    'for (var i2 = 0; i2 < L.length; i2++) of.writeln(L[i2]);',
    'of.close();',
    '"ok";',
  ].join(NL)
}

// ── 실행 ─────────────────────────────────────────────────────────────
console.log(C.b(NL + '재단 E2E — 픽스처로 실제 판짜기'))
console.log(C.dim('  픽스처 ' + path.relative(REPO, FIXTURE) + ' · 시트 ' + SHEET_W + 'x' + SHEET_H + 'mm'))
console.log(C.dim('  임시 문서를 만들고 닫습니다 — 작업 중인 판은 먼저 저장하세요.'))

const near = (a, b, tol) => (typeof a === 'number' && !isNaN(a) && Math.abs(a - b) <= tol)

let bad = 0
const keepDirs = []
const seen = {}

for (const cs of CASES) {
  if (ONLY.length && ONLY.indexOf(cs.key) < 0) continue
  console.log(C.b(NL + '  [' + cs.key + '] ' + cs.name) + (cs.info ? C.y('  (참고 — 실패로 세지 않음)') : ''))
  const dir = fwd(fs.mkdtempSync(path.join(os.tmpdir(), 'mescut-e2e-')))
  const run = runJsx(dir, buildJsx(cs, dir), 'harness.jsx')
  if (run.fatal) {
    console.log('    ' + C.r('FAIL') + '  하네스  ' + C.dim(run.fatal))
    if (!cs.info) bad++
    keepDirs.push(dir); continue
  }
  const res = run.res, ratios = analyse(dir)
  const apply = res.apply || ''
  const kvOf = (k) => {
    const m = apply.split(';').find((s) => s.indexOf(k + '=') === 0)
    return m ? m.slice(k.length + 1) : ''
  }
  const fxDim = (res.fixture || '').split('x').map(Number)
  const swap = (cs.rot % 180 === 90)
  const expW = Math.round((swap ? fxDim[1] : fxDim[0]) * cs.scale / 100)
  const expH = Math.round((swap ? fxDim[0] : fxDim[1]) * cs.scale / 100)
  // 회전 0 + 배율 1배는 굳히기가 **필요 없다** — 그때는 placed 가 0 이어야 정상이다
  const needsHarden = (cs.scale !== 100 || cs.rot !== 0)
  const rr = ratios['ref.png'], pr = ratios['plate.png']

  const checks = [
    ['호스트 응답', /^CUT-CEP-\d/.test(res.host || ''), res.host || '(없음)'],
    ['판 생성', apply.indexOf('ok;') === 0, apply || '(없음)'],
    ['폴백 0건', kvOf('placefail') === '0', 'placefail=' + (kvOf('placefail') || '?')],
    ['굳히기 배치 수', parseInt(kvOf('placed') || '0', 10) === (needsHarden ? cs.pieces : 0),
      'placed=' + (kvOf('placed') || '?') + ' (기대 ' + (needsHarden ? cs.pieces : 0) + ')'],
    [!needsHarden ? '굳히기를 아예 안 했다' : (cs.off ? '옛 경로(조각별)로 돌았다' : '격자 마스터로 돌았다'),
      !needsHarden
        ? (kvOf('fast') === '0' && kvOf('masters') === '0' && !kvOf('hardenwhy'))
        : (cs.off
          ? (kvOf('fast') === '0' && kvOf('hardenwhy') === 'off')
          : (parseInt(kvOf('fast') || '0', 10) === cs.pieces && parseInt(kvOf('masters') || '0', 10) === 1)),
      'fast=' + (kvOf('fast') || '0') + ' · masters=' + (kvOf('masters') || '0')
        + (kvOf('hardenwhy') ? (' · why=' + kvOf('hardenwhy')) : '')],
    ['조각을 전부 찾음', res.found === String(cs.pieces), 'found=' + (res.found || '?')],
  ]

  const geom = []
  for (let q = 0; q < cs.pieces; q++) {
    const got = (res['piece' + q] || '').split('x').map(Number)
    const at = (res['at' + q] || '').split(',').map(Number)
    geom.push((res['piece' + q] || '?') + '@' + (res['at' + q] || '?'))
    checks.push(['조각 ' + q + ' 크기', near(got[0], expW, 0.5) && near(got[1], expH, 0.5),
      (res['piece' + q] || '?') + ' (기대 ' + expW + 'x' + expH + ')'])
    checks.push(['조각 ' + q + ' 위치', near(at[0], AT + q * cs.step, 0.5) && near(at[1], AT, 0.5),
      (res['at' + q] || '?') + ' (기대 ' + (AT + q * cs.step) + ',' + AT + ')'])
  }

  const colourTxt = (rr && pr)
    ? ('원본 마젠타 ' + (rr.ratio * 100).toFixed(1) + '% vs 판 ' + (pr.ratio * 100).toFixed(1) + '%')
    : '분석 실패'
  if (cs.absolute) {
    checks.push(['배경 색(마스크 보존)',
      !!(rr && pr && rr.ratio >= 0 && pr.ratio >= 0 && Math.abs(rr.ratio - pr.ratio) <= 0.05),
      colourTxt + ' · 허용 5%p'])
  }

  let localBad = 0
  for (const row of checks) {
    console.log('    ' + (row[1] ? C.g('PASS') : (cs.info ? C.y('참고') : C.r('FAIL'))) + '  ' + row[0] + '  ' + C.dim(row[2]))
    if (!row[1]) localBad++
  }
  if (!cs.absolute) console.log('    ' + C.y('참고') + '  배경 색  ' + C.dim(colourTxt + ' — 절대 기준 미확립(파일 머리말 참조)'))
  console.log('    ' + C.dim('소요 ' + (parseInt(res.ms || '0', 10) / 1000).toFixed(1) + '초 (nestApply)'))

  seen[cs.key] = { ms: parseInt(res.ms || '0', 10), magenta: pr ? pr.ratio : -1, geom }
  if (cs.info) localBad = 0
  bad += localBad
  if (localBad) keepDirs.push(dir)
  else { try { fs.rmSync(dir, { recursive: true, force: true }) } catch (e) { /* 무해 */ } }
}

// ── [S] 칼선 실루엣 ──────────────────────────────────────────────────
if (!ONLY.length || ONLY.indexOf('S') >= 0) {
  console.log(C.b(NL + '  [S] 칼선 실루엣 — 굳힌 조각이 바깥 사각이 되지 않는가'))
  const dir = fwd(fs.mkdtempSync(path.join(os.tmpdir(), 'mescut-sil-')))
  const run = runJsx(dir, buildSilJsx(dir), 'sil.jsx')
  if (run.fatal) {
    console.log('    ' + C.r('FAIL') + '  하네스  ' + C.dim(run.fatal))
    bad++; keepDirs.push(dir)
  } else {
    const plain = (run.res.plain || '').split(',').map(Number)
    const hard = (run.res.hardened || '').split(',').map(Number)
    const lw = (run.res.letters_weld || '').split(',').map(Number)
    // 값은 "칼선수,사각수,부스러기수"
    const rows = [
      ['대조군(안 굳힘)이 사각이 아니다', plain[0] === 1 && plain[1] === 0, run.res.plain || '?'],
      ['굳힌 뒤에도 사각이 아니다', hard[0] === 1 && hard[1] === 0, run.res.hardened || '?'],
      // ★글자는 **글자대로** 나와야 한다 (2026-09-04 용준님 정정) — 감싸면 안 된다.
      ['글자는 낱개로 그대로 나온다', lw[0] > 1 && lw[1] === 0, run.res.letters_weld || '?'],
      // ★★진짜 요구 = 칼선 하나하나가 끊김 없이 닫혀 있을 것. 자를 수 없는 부스러기가 섞이면
      //   재단기가 제자리에서 칼을 내렸다 올린다(실물 판 131개 중 15개가 0.01x0mm 3점 조각이었다).
      ['부스러기 칼선이 없다 (대조군)', plain[2] === 0, 'slivers=' + (isNaN(plain[2]) ? '?' : plain[2])],
      ['부스러기 칼선이 없다 (굳힌 뒤)', hard[2] === 0, 'slivers=' + (isNaN(hard[2]) ? '?' : hard[2])],
      ['부스러기 칼선이 없다 (글자)', lw[2] === 0, 'slivers=' + (isNaN(lw[2]) ? '?' : lw[2])],
    ]
    let lb = 0
    for (const row of rows) {
      console.log('    ' + (row[1] ? C.g('PASS') : C.r('FAIL')) + '  ' + row[0] + '  ' + C.dim(row[2]))
      if (!row[1]) lb++
    }
    if (run.res.EXC) console.log('    ' + C.dim('EXC ' + run.res.EXC))
    bad += lb
    if (lb) keepDirs.push(dir)
    else { try { fs.rmSync(dir, { recursive: true, force: true }) } catch (e) { /* 무해 */ } }
  }
}

// ── 동등 판정 — 새 경로(격자 마스터) ≡ 옛 경로(조각별) ───────────────
// 이게 「굳히기 판당 1회」의 **본 판정**이다. 빨라진 것이지 달라진 게 아니어야 한다.
const PAIRS = [['D', 'E', '1조각'], ['B', 'C', '2조각']]
console.log('')
for (const pr2 of PAIRS) {
  const a = seen[pr2[0]], b = seen[pr2[1]], label = pr2[2]
  if (!a || !b) continue
  const rows = [
    ['조각 크기·위치가 같다 (' + label + ')', a.geom.join('|') === b.geom.join('|'),
      a.geom.join(' ') + '  vs  ' + b.geom.join(' ')],
    ['판의 색이 같다 (' + label + ')',
      (a.magenta >= 0 && b.magenta >= 0 && Math.abs(a.magenta - b.magenta) <= 0.01),
      (a.magenta * 100).toFixed(1) + '% vs ' + (b.magenta * 100).toFixed(1) + '% · 허용 1%p'],
  ]
  for (const row of rows) {
    console.log('  ' + (row[1] ? C.g('PASS') : C.r('FAIL')) + '  ' + row[0] + '  ' + C.dim(row[2]))
    if (!row[1]) bad++
  }
  console.log('  ' + C.b('속도 (' + label + ') — ') + '격자 마스터 ' + (a.ms / 1000).toFixed(1)
    + '초 vs 조각별 ' + (b.ms / 1000).toFixed(1) + '초'
    + (b.ms > 0 ? ('  (' + (a.ms / b.ms).toFixed(2) + '배)') : ''))
}
if (seen.D && seen.E) {
  console.log(C.dim('  ⚠️ 옛 경로는 **회전한 조각 수에 비례**해 늘고 격자 마스터는 거의 안 는다 —'))
  console.log(C.dim('     조각이 많을수록 차이가 벌어진다(그게 이 변경의 전부다).'))
}

console.log('')
if (bad) {
  console.log(C.r('요약: ' + bad + '개 실패'))
  for (const d of keepDirs) console.log(C.dim('  산출물 ' + d))
  process.exit(1)
}
console.log(C.g('요약: 전 케이스 통과'))
