#!/usr/bin/env node
/**
 * 재단 판짜기 **E2E 게이트** — `npm run cut:e2e`
 *
 * 왜 있나 (2026-08-31):
 *   `cut:smoke` 는 소스를 읽는 정적 검사라 "코드가 이렇게 생겼다"까지만 본다.
 *   실제 결함은 **일러가 실제로 무엇을 그리는가**에서 났다 — 불투명도 마스크가 변형을
 *   따라오지 않아 배경이 통째로 사라졌고, 정적 게이트 452항목을 **전부 통과**했다.
 *   그날 반나절을 태운 이유가 셋이었고 셋 다 여기서 막는다:
 *     ① 판 만드는 코드(`mesCut_nestApply`)를 한 번도 직접 돌려보지 않았다 → 여기서 돌린다
 *     ② 패널이 호스트를 캐싱해 검증한 코드와 도는 코드가 달랐다 → 여기는 패널을 안 거친다
 *     ③ 기준 원본이 실험 중 계속 변했다 → 고정 픽스처를 쓴다
 *
 * 판정 = **숫자 + 색** 두 축. 눈대중 금지.
 *   숫자: 조각 잉크가 기대 크기·위치와 맞는가 · 폴백(placefail)이 0인가
 *   색:   판의 아트 영역에서 **마젠타 비율**이 원본과 같은가
 *         (픽스처 뒤판이 마젠타다. 마스크가 죽으면 그 색이 드러나 비율이 치솟는다)
 *
 * ⚠️ 일러스트레이터가 **실행 중이어야** 한다. 없으면 실패가 아니라 **건너뛴다**(exit 0) —
 *    CI·다른 PC 에서 못 도는 게 정상이고, 못 도는 걸 실패로 만들면 사람이 게이트를 끈다.
 *    반드시 돌려야 하는 자리에서는 `--require` 로 강제한다.
 * ⚠️ 임시 문서를 만들고 닫는다. `nestApply` 는 **직전에 자기가 만든 판 문서**도 닫으므로,
 *    작업 중인 판이 있으면 먼저 저장할 것.
 */
'use strict'
const fs = require('fs')
const os = require('os')
const path = require('path')
const { execFileSync } = require('child_process')

const NL = String.fromCharCode(10)
const REPO = path.resolve(__dirname, '..')
const FIXTURE = path.join(REPO, 'IllustratorAutomat', 'designer', 'fixtures', 'opacity-mask.ai')
const HOST = path.join(REPO, 'IllustratorAutomat', 'designer', 'mes-cut-host.jsx')
const REQUIRE = process.argv.includes('--require')

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

// ── 준비 확인 ────────────────────────────────────────────────────────
if (process.platform !== 'win32') skip('Windows 가 아닙니다')
if (!fs.existsSync(FIXTURE)) skip('픽스처가 없습니다: ' + FIXTURE)
if (!fs.existsSync(HOST)) skip('호스트가 없습니다: ' + HOST)

let alive = ''
try {
  alive = ps('try { $null = [Runtime.InteropServices.Marshal]::GetActiveObject("Illustrator.Application"); "yes" } catch { "no" }').trim()
} catch (e) { alive = 'no' }
if (alive !== 'yes') skip('일러스트레이터가 실행 중이 아닙니다')

// ── 하네스 JSX 생성 ──────────────────────────────────────────────────
// ★역슬래시를 한 글자도 쓰지 않는다 — 이 문자열은 파일을 거쳐 일러로 가고, 그 과정에서
//   역슬래시가 사라지면 **조용히 다른 코드**가 된다(2026-08-31 에 세 번 겪었다).
//   개행은 `writeln`, 경로는 슬래시.
const TMP = fwd(fs.mkdtempSync(path.join(os.tmpdir(), 'mescut-e2e-')))
const SCALE = 1000            // 배율 확대 %
const ROT = 90                // 회전 (Konva CW)
const SHEET_W = 850, SHEET_H = 1280, AT = 20   // 시트와 배치 원점(mm)

const jsx = [
  'var OUT = "' + TMP + '";',
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
  '  var fx = app.open(new File("' + fwd(FIXTURE) + '"));',
  '  opened.push(fx);',
  '  app.activeDocument = fx;',
  '  var tops = mesCut_topItems(fx);',
  '  var ib = mesCut_unionOf(tops);',
  '  var w0 = ib[2]-ib[0], h0 = ib[1]-ib[3];',
  '  say("fixture=" + mmv(w0) + "x" + mmv(h0));',
  '  shot(fx, [ib[0], ib[1], ib[2], ib[3]], "ref.png");',
  '  fx.selection = null;',
  '  for (var s2 = 0; s2 < tops.length; s2++) tops[s2].selected = true;',
  '  say("begin=" + mesCut_nestBegin("0"));',
  '  var pf = new File(mesCut_paramsPath());',
  '  pf.encoding = "UTF-8"; pf.open("w");',
  '  pf.writeln("RS ' + SCALE + '");',
  '  pf.writeln("S 0 ' + SHEET_W + ' ' + SHEET_H + '");',
  '  pf.writeln("I 0 ' + AT + ' ' + AT + ' ' + ROT + '");',
  '  pf.close();',
  '  var r = mesCut_nestApply(undefined, undefined, undefined, undefined, "raster");',
  '  say("apply=" + r);',
  '  var plate = null;',
  '  for (var d = 0; d < app.documents.length; d++) {',
  '    var dd = app.documents[d];',
  '    if (dd === fx) continue;',
  '    if (dd.saved) continue;',
  '    var da = dd.artboards[0].artboardRect;',
  '    if (da[2] - da[0] < 300 * PT) continue;',
  '    plate = dd; break;',
  '  }',
  '  if (!plate) { say("piece=none"); }',
  '  else {',
  '    opened.push(plate);',
  '    var art = null, bestA = 0;',
  '    for (var Lj = 0; Lj < plate.layers.length; Lj++) {',
  '      var pl2 = plate.layers[Lj];',
  '      for (var q = 0; q < pl2.pageItems.length; q++) {',
  '        var kb = mesCut_inkBounds(pl2.pageItems[q]);',
  '        if (!kb) continue;',
  '        var ar = (kb[2]-kb[0]) * (kb[1]-kb[3]);',
  '        if (ar > bestA) { bestA = ar; art = pl2.pageItems[q]; }',
  '      }',
  '    }',
  '    var pab = plate.artboards[0].artboardRect;',
  '    var kb2 = art ? mesCut_inkBounds(art) : null;',
  '    say("piece=" + (kb2 ? (mmv(kb2[2]-kb2[0]) + "x" + mmv(kb2[1]-kb2[3])) : "none"));',
  '    say("at=" + (kb2 ? (mmv(kb2[0] - pab[0]) + "," + mmv(pab[1] - kb2[1])) : "none"));',
  '    app.activeDocument = plate;',
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

const jsxPath = path.join(TMP, 'harness.jsx')
fs.writeFileSync(jsxPath, jsx, 'utf8')

console.log(C.b(NL + '재단 E2E — 픽스처로 실제 판짜기'))
console.log(C.dim('  픽스처 ' + path.relative(REPO, FIXTURE)))
console.log(C.dim('  배율 ' + SCALE + '% · 회전 ' + ROT + '도 · 시트 ' + SHEET_W + 'x' + SHEET_H + 'mm'))
console.log(C.dim('  임시 문서를 만들고 닫습니다 — 작업 중인 판은 먼저 저장하세요.'))

try {
  ps('$ai = [Runtime.InteropServices.Marshal]::GetActiveObject("Illustrator.Application"); $null = $ai.DoJavaScriptFile("' + fwd(jsxPath) + '")')
} catch (e) {
  console.error(C.r(NL + 'X 하네스 실행 실패'))
  console.error(String(e.stdout || '') + String(e.stderr || e.message))
  process.exit(1)
}

const resPath = path.join(TMP, 'result.txt')
if (!fs.existsSync(resPath)) {
  console.error(C.r(NL + 'X 결과 파일이 없습니다 — 하네스가 죽었습니다. ' + TMP))
  process.exit(1)
}
const res = {}
for (const line of fs.readFileSync(resPath, 'utf8').split(/\r?\n/)) {
  const k = line.indexOf('=')
  if (k > 0) res[line.slice(0, k)] = line.slice(k + 1)
}

// ── 색 분석 — 뒤판(마젠타)이 원본과 같은 비율인가 ────────────────────
// 흰색(판 여백)은 세지 않는다. 분모는 **아트 영역**이라 판 크기가 달라도 비교가 성립한다.
const psPix = [
  'Add-Type -AssemblyName System.Drawing',
  '$r = @()',
  'foreach ($n in @("ref.png","plate.png")) {',
  '  $p = Join-Path "' + TMP + '" $n',
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

let pix = ''
try { pix = ps(psPix).trim() } catch (e) { console.error(C.r('X 색 분석 실패: ') + (e.message || e)); process.exit(1) }

const ratios = {}
for (const part of pix.split('|')) {
  const f = part.trim().split(/\s+/)
  if (f.length >= 3) ratios[f[0]] = { ratio: parseFloat(f[1]), n: parseInt(f[2], 10) }
}

// ── 판정 ─────────────────────────────────────────────────────────────
const fxDim = (res.fixture || '').split('x').map(Number)
const expW = Math.round((ROT % 180 === 90 ? fxDim[1] : fxDim[0]) * SCALE / 100)
const expH = Math.round((ROT % 180 === 90 ? fxDim[0] : fxDim[1]) * SCALE / 100)
const got = (res.piece || '').split('x').map(Number)
const apply = res.apply || ''
const kvOf = (k) => {
  const m = apply.split(';').find((s) => s.indexOf(k + '=') === 0)
  return m ? m.slice(k.length + 1) : ''
}
const near = (a, b, tol) => (typeof a === 'number' && !isNaN(a) && Math.abs(a - b) <= tol)

const rr = ratios['ref.png'], pr = ratios['plate.png']
const colourOk = !!(rr && pr && rr.ratio >= 0 && pr.ratio >= 0 && Math.abs(rr.ratio - pr.ratio) <= 0.05)

const checks = [
  ['호스트 응답', /^CUT-CEP-\d/.test(res.host || ''), res.host || '(없음)'],
  ['판 생성', apply.indexOf('ok;') === 0, apply || '(없음)'],
  ['폴백 0건', kvOf('placefail') === '0', 'placefail=' + (kvOf('placefail') || '?')],
  ['배치 경로 사용', parseInt(kvOf('placed') || '0', 10) > 0, 'placed=' + (kvOf('placed') || '?')],
  ['조각 크기', near(got[0], expW, 0.5) && near(got[1], expH, 0.5),
    (res.piece || '?') + ' (기대 ' + expW + 'x' + expH + ')'],
  ['조각 위치', (res.at || '').split(',').length === 2
    && (res.at || '').split(',').every((v) => near(parseFloat(v), AT, 0.5)),
    (res.at || '?') + ' (기대 ' + AT + ',' + AT + ')'],
  ['배경 색(마스크 보존)', colourOk,
    (rr && pr)
      ? ('원본 마젠타 ' + (rr.ratio * 100).toFixed(1) + '% vs 판 ' + (pr.ratio * 100).toFixed(1) + '% · 허용 5%p')
      : '분석 실패'],
]

console.log('')
let bad = 0
for (const row of checks) {
  console.log('  ' + (row[1] ? C.g('PASS') : C.r('FAIL')) + '  ' + row[0] + '  ' + C.dim(row[2]))
  if (!row[1]) bad++
}
console.log('')
if (bad) {
  console.log(C.r('요약: ' + (checks.length - bad) + ' / ' + checks.length + ' — 산출물 ' + TMP))
  console.log(C.dim('  ref.png(원본) 과 plate.png(판) 을 나란히 보세요.'))
  console.log(C.dim('  마젠타가 늘었으면 마스크가 변형을 안 따라온 것입니다(뒤판이 드러남).'))
  process.exit(1)
}
console.log(C.g('요약: ' + checks.length + ' / ' + checks.length + ' 통과'))
try { fs.rmSync(TMP, { recursive: true, force: true }) } catch (e) { /* 남아도 무해 */ }
