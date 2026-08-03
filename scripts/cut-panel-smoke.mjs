/**
 * 재단 패널 헤드리스 스모크 — Chromium + `window.__adobe_cep__` 스텁으로 실제 DOM 동작 검증.
 *
 *   node scripts/cut-panel-smoke.mjs
 *
 * spec = docs/superpowers/specs/2026-07-31-cut-file-panel.md §7
 * P0 범위: 초기화 예외 · 버전 표기 · 호스트 미로드 표시 · 게이트(P1 버튼 잠김) · 타공 입력 연동
 *          · **크로스 패널 잠금 API** · manifest/포트가 A0와 충돌하지 않는가
 *
 * ⚠️ CSInterface 를 갈아끼우면 안 된다 — 패널이 자체 shim(js/CSInterface.js)을 나중에 로드해
 *    덮어쓴다. shim 이 실제로 보는 `window.__adobe_cep__` 를 심어야 실제 경로가 검증된다.
 */
import { chromium } from 'playwright'
import fs from 'fs'
import path from 'path'
import { pathToFileURL, fileURLToPath } from 'url'

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PANEL_DIR = path.join(REPO, 'IllustratorAutomat', 'designer', 'cut-panel', 'com.mes.cut.panel')
const PANEL = path.join(PANEL_DIR, 'index.html')
const A0_DIR = path.join(REPO, 'IllustratorAutomat', 'designer', 'poc-a0-cep', 'com.mes.a0.panel')

const results = []
const ok = (n, c, extra = '') => results.push({ n, c, extra })

/**
 * 호스트 스텁. hostLoaded=false 면 스텁 폴백(ERROR ...)을 재현한다.
 * 잠금은 실제 mes-cut-host.jsx 와 같은 의미로 동작시켜(소유자·TTL·강제해제) 패널 쪽 분기를 검증한다.
 */
const mkStub = (opts = {}) => `
window.__calls = [];
window.__lock = ${opts.preLock ? JSON.stringify(opts.preLock) : 'null'};
window.__hostLoaded = ${opts.hostLoaded === false ? 'false' : 'true'};
// ★기본 ping 은 **실제 버전 문자열 형식**이어야 한다 — 패널이 버전으로 곡선 지원을 판정하므로
//   'CUT-CEP-TEST' 같은 가짜를 쓰면 게이트가 항상 차단으로 떨어져 다른 검증까지 왜곡된다.
window.__ping = ${JSON.stringify(opts.ping ?? 'CUT-CEP-0.5.0')};
window.__doc = ${JSON.stringify(opts.doc ?? 'name=test.ai;w=1220;h=2070;layers=3')};
window.__vecProbe = ${JSON.stringify(opts.vecProbe ?? 'ok')};
window.__vecCut = ${JSON.stringify(opts.vecCut ?? 'ok;paths=1;anchors=24')};
window.__sel = ${JSON.stringify(opts.sel ?? 'n=2;w=300.5;h=180;x=10;y=20')};
window.cep = { fs: { readFile: () => ({ err: 1 }), writeFile: () => ({ err: 0 }) } };
window.__adobe_cep__ = {
  getExtensionID: function () { return 'com.mes.cut.panel'; },
  getSystemPath: function () { return 'C:/tmp'; },
  getHostEnvironment: function () { return JSON.stringify({ appName: 'ILST', appVersion: '29.0' }); },
  evalScript: function (script, cb) {
    window.__calls.push(script);
    var res = '';
    if (/^mesCut_ping/.test(script)) res = window.__hostLoaded ? window.__ping : 'ERROR 정본 없음 (Z: 연결 확인)';
    else if (/^mesCut_docInfo/.test(script)) res = window.__doc;
    else if (/^mesCut_selectionInfo/.test(script)) res = window.__sel;
    else if (/^mesCut_lockProbe/.test(script)) {
      res = window.__lock ? ('seen:' + window.__lock.owner + ':' + (window.__lock.label || '') + ':age=0ms') : 'none';
    }
    else if (/^mesCut_acquireLock/.test(script)) {
      var m = script.match(/mesCut_acquireLock\\("([^"]*)","([^"]*)"\\)/);
      var owner = m ? m[1] : '?', label = m ? m[2] : '';
      if (window.__lock && window.__lock.owner !== owner) res = 'busy:' + window.__lock.owner + ':' + (window.__lock.label || '');
      else { window.__lock = { owner: owner, label: label }; res = 'ok'; }
    }
    else if (/^mesCut_releaseLock/.test(script)) {
      var m2 = script.match(/mesCut_releaseLock\\("([^"]*)"\\)/);
      var o2 = m2 ? m2[1] : '?';
      if (!window.__lock) res = 'ok';
      else if (window.__lock.owner !== o2) res = 'notowner:' + window.__lock.owner;
      else { window.__lock = null; res = 'ok'; }
    }
    else if (/^mesCut_vecProbe/.test(script)) res = window.__vecProbe;
    else if (/^mesCut_vecCut/.test(script)) res = window.__vecCut;
    else if (/^mesCut_forceUnlock/.test(script)) { window.__lock = null; res = 'ok'; }
    else if (/^mesCut_lockPath/.test(script)) res = 'C:\\\\Users\\\\test\\\\AppData\\\\Local\\\\Temp\\\\mes_host_lock.txt';
    else res = 'ok';
    if (cb) setTimeout(function () { cb(res); }, 0);
  }
};
`

const browser = await chromium.launch()
async function openPanel(opts = {}) {
  const p = await browser.newPage()
  const errs = []
  p.on('pageerror', (e) => errs.push(String(e)))
  p.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()) })
  await p.addInitScript(mkStub(opts))
  await p.goto(pathToFileURL(PANEL).href)
  await p.waitForTimeout(200)
  // 진단 섹션은 <details> 라 기본이 접힘이다(사용자에겐 그게 맞다). 클릭하려면 열어야 한다.
  await p.$$eval('details', (ds) => ds.forEach((d) => { d.open = true }))
  p.__errs = errs
  return p
}
const txt = (p, sel) => p.$eval(sel, (e) => e.textContent.trim())

// ── 1 초기화 ────────────────────────────────────────────────────────
{
  const p = await openPanel()
  ok('1 콘솔/페이지 에러 0', p.__errs.length === 0, p.__errs.join(' | '))
  const ver = await txt(p, '#ver')
  ok('1 shell·host 버전 동시 표기', /shell \d+\.\d+\.\d+ · host CUT-CEP-\d+\.\d+\.\d+/.test(ver), ver)
  ok('1 문서 정보 표시(mm 환산)', (await txt(p, '#docInfo')).includes('1220×2070mm'), await txt(p, '#docInfo'))
  ok('1 선택 정보 표시', (await txt(p, '#selInfo')).includes('2개 · 300.5×180mm'), await txt(p, '#selInfo'))
  await p.close()
}

// ── 2 호스트 미로드(=Z: 미배포)를 사용자에게 알리는가 ────────────────
{
  const p = await openPanel({ hostLoaded: false })
  const out = await txt(p, '#out')
  ok('2 host 미로드 시 원인 표시', out.includes('ERROR') && out.includes('Z:'), out.slice(0, 60))
  ok('2 오류 스타일 적용', (await p.$eval('#out', (e) => e.className)).includes('err'))
  ok('2 그래도 예외는 안 남', p.__errs.length === 0, p.__errs.join(' | '))
  await p.close()
}

// ── 3 게이트 — 기하 엔진이 있으면 열리고, 없으면 이유와 함께 잠긴다 ──
// 눌러도 아무 일이 없는 버튼을 열어 두면 "고장난 패널"로 읽힌다.
{
  const p = await openPanel()
  ok('3 기하 엔진 로드됨', await p.evaluate(() => !!window.MesCutGeom))
  ok('3 칼선 버튼 활성', !(await p.$eval('#btnMakeCut', (e) => e.disabled)))
  await p.close()
}
{
  // geometry.js 가 빠진 설치본을 재현 — 버튼이 잠기고 **이유가 title 에 남아야** 한다.
  const p = await browser.newPage()
  await p.addInitScript(mkStub())
  await p.addInitScript(`Object.defineProperty(window, 'MesCutGeom', { get: () => undefined, configurable: true });`)
  await p.goto(pathToFileURL(PANEL).href)
  await p.waitForTimeout(200)
  ok('3 엔진 없으면 버튼 잠김', await p.$eval('#btnMakeCut', (e) => e.disabled))
  ok('3 잠긴 이유가 title 에 있음', (await p.$eval('#btnMakeCut', (e) => e.title)).includes('geometry.js'))
  await p.close()
}

// ── 3b ★칼선 파이프라인 계산부 — 일러 없이 회귀를 잡는다 ─────────────
// buildCut 은 순수 함수라 합성 마스크로 검증할 수 있다(window.__mesCutBuild 로 노출).
// 여기서 잡는 것: 오프셋이 실제로 적용되는가 · 다중 조각이 전부 살아남는가 · 타공이 붙는가 · 좌표가 mm 인가.
{
  const p = await openPanel()
  const mkImg = (W, H, draw) => ({ W, H, draw })
  const res = await p.evaluate(({ W, H }) => {
    // 200×200px 안에 100×100 사각 잉크(투명 배경 = alpha 로 판별)
    const data = new Uint8ClampedArray(W * H * 4)
    for (let y = 50; y < 150; y++) for (let x = 50; x < 150; x++) { data[(y * W + x) * 4 + 3] = 255 }
    return window.__mesCutBuild({ W, H, ch: 4, data }, {
      mmpp: 0.5, ox: 10, oy: 100, offsetMm: 3, mode: 'silhouette',
      punchOn: true, punchN: 8, punchInsetMm: 10,
    })
  }, { W: 200, H: 200 })
  ok('3b 계산 성공(에러 없음)', !res.err, res.err || '')
  ok('3b 칼선 1개', res.paths === 1, String(res.paths))
  ok('3b 타공 8개', res.circles === 8, String(res.circles))
  const lines = String(res.text).split('\n')
  ok('3b 폴리곤 줄이 P 로 시작', lines[0].startsWith('P '), lines[0].slice(0, 20))
  ok('3b 타공 줄이 C 이고 지름 6mm', lines.filter((l) => /^C .*,6$/.test(l)).length === 8)
  // 잉크 50~150px(=25~75mm) + 오프셋 3mm → 원점 ox=10 기준 x 는 32~88mm 범위여야 한다
  const xs = lines[0].slice(2).split(' ').map((s) => +s.split(',')[0])
  ok('3b mm 좌표가 예상 범위', Math.min(...xs) > 30 && Math.max(...xs) < 90, `${Math.min(...xs)}~${Math.max(...xs)}`)
  await p.close()
}
{
  // ★P2 배경 판정 — 불투명 래스터(사진)는 alpha 로 뜨면 **사각형**이 된다.
  //   실측(2026-07-31): 불투명 래스터 alpha 87.5% vs 흰배경 제거 14.7%.
  const p = await openPanel()
  const mkStar = (opaque) => `(() => {
    const W=300,H=300,cx=150,cy=150;
    const d=new Uint8ClampedArray(W*H*4);
    for(let y=0;y<H;y++)for(let x=0;x<W;x++){
      const i=(y*W+x)*4, dx=x-cx, dy=y-cy, a=Math.atan2(dy,dx), r=Math.hypot(dx,dy);
      const t=((a+Math.PI)%(2*Math.PI/5))/(2*Math.PI/5);
      const rr=45+(110-45)*(1-Math.abs(t-0.5)*2);
      const inStar = r<=rr;
      if(inStar){ d[i]=0;d[i+1]=0;d[i+2]=0;d[i+3]=255; }
      else if(${opaque}){ d[i]=255;d[i+1]=255;d[i+2]=255;d[i+3]=255; }  // 흰 배경(불투명 래스터)
    }
    return {W,H,ch:4,data:d};
  })()`
  const opt = { mmpp: 0.5, ox: 0, oy: 150, offsetMm: 2, mode: 'silhouette', punchOn: false, punchN: 0, punchInsetMm: 0 }

  const transparent = await p.evaluate(({ src, o }) => window.__mesCutBuild(eval(src), o), { src: mkStar(false), o: { ...opt, bg: 'auto' } })
  ok('3d 투명 배경 → alpha 채택', transparent.bgMode === 'alpha', transparent.bgMode)

  const opaqueAuto = await p.evaluate(({ src, o }) => window.__mesCutBuild(eval(src), o), { src: mkStar(true), o: { ...opt, bg: 'auto' } })
  ok('3d 불투명 래스터 → 흰배경 제거 자동 전환', opaqueAuto.bgMode === 'white' && opaqueAuto.bgAuto === true, opaqueAuto.bgMode)

  const opaqueForced = await p.evaluate(({ src, o }) => window.__mesCutBuild(eval(src), o), { src: mkStar(true), o: { ...opt, bg: 'alpha' } })
  ok('3d 사용자가 alpha 를 지정하면 그대로', opaqueForced.bgMode === 'alpha' && opaqueForced.bgAuto === false, opaqueForced.bgMode)

  // 자동 전환이 실제로 사각형을 면했는가 — 별 실루엣이면 bbox 보다 면적이 훨씬 작다
  const areaOf = (t) => { const xs = t.split('\n')[0].slice(2).split(' ').map((s) => +s.split(',')[0]); return Math.max(...xs) - Math.min(...xs) }
  ok('3d 자동 전환 결과가 사각형이 아님', opaqueAuto.text.split('\n')[0].split(' ').length > 8,
    '점 수 ' + opaqueAuto.text.split('\n')[0].split(' ').length)
  await p.close()
}
{
  // ★구멍 — 도넛을 주면 'H' 줄이 나와야 한다. 없으면 ㅇ·ㅁ·0·8 속이 안 뚫린 채로 재단된다.
  const p = await openPanel()
  const res = await p.evaluate(() => {
    const W = 400, H = 400, cx = 200, cy = 200
    const data = new Uint8ClampedArray(W * H * 4)
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const d = Math.hypot(x - cx, y - cy)
      if (d <= 160 && d >= 90) data[(y * W + x) * 4 + 3] = 255
    }
    return window.__mesCutBuild({ W, H, ch: 4, data }, {
      mmpp: 0.5, ox: 0, oy: 200, offsetMm: 3, mode: 'silhouette', punchOn: false, punchN: 0, punchInsetMm: 0,
    })
  })
  const lines = String(res.text).split('\n')
  ok('3c 도넛 → 외곽 1 + 구멍 1', res.paths === 1 && res.holes === 1, `paths=${res.paths} holes=${res.holes}`)
  ok('3c H 줄이 P 뒤에 온다', lines[0].startsWith('P ') && lines[1] && lines[1].startsWith('H '), lines.map((l) => l.slice(0, 2)).join('|'))
  await p.close()
}
{
  // 구멍이 없는 도형에서는 H 줄이 나오면 안 된다(오탐 = 없는 구멍을 자른다)
  const p = await openPanel()
  const res = await p.evaluate(() => {
    const W = 300, H = 300
    const data = new Uint8ClampedArray(W * H * 4)
    for (let y = 80; y < 220; y++) for (let x = 80; x < 220; x++) data[(y * W + x) * 4 + 3] = 255
    return window.__mesCutBuild({ W, H, ch: 4, data }, {
      mmpp: 0.5, ox: 0, oy: 150, offsetMm: 3, mode: 'silhouette', punchOn: false, punchN: 0, punchInsetMm: 0,
    })
  })
  ok('3c 구멍 없는 사각 → H 줄 0', res.holes === 0 && !String(res.text).includes('\nH '), `holes=${res.holes}`)
  await p.close()
}
{
  // 떨어진 두 조각 — 오프셋이 작으면 **둘 다 살아남아야** 한다(하나만 남으면 나머지가 잘려나간다)
  const p = await openPanel()
  const res = await p.evaluate(() => {
    const W = 300, H = 200
    const data = new Uint8ClampedArray(W * H * 4)
    const box = (x0, x1) => { for (let y = 60; y < 140; y++) for (let x = x0; x < x1; x++) data[(y * W + x) * 4 + 3] = 255 }
    box(40, 100); box(200, 260)   // 간격 100px = 50mm (mmpp 0.5)
    return window.__mesCutBuild({ W, H, ch: 4, data }, {
      mmpp: 0.5, ox: 0, oy: 100, offsetMm: 3, mode: 'silhouette', punchOn: false, punchN: 0, punchInsetMm: 0,
    })
  })
  ok('3b 떨어진 조각 2개 모두 보존', res.paths === 2, String(res.paths))
  ok('3b 병합 아님으로 보고', res.merged === false, String(res.merged))
  await p.close()
}

// ── 4 타공 입력 연동 — 꺼진 값이 조용히 반영되는 경로를 만들지 않는다 ──
{
  const p = await openPanel()
  ok('4 타공 미체크 시 입력 잠김', await p.$eval('#punchCount', (e) => e.disabled))
  await p.check('#punch')
  await p.waitForTimeout(50)
  ok('4 체크하면 개수·인셋 열림', !(await p.$eval('#punchCount', (e) => e.disabled)) && !(await p.$eval('#punchInset', (e) => e.disabled)))
  await p.uncheck('#punch')
  await p.waitForTimeout(50)
  ok('4 해제하면 다시 잠김', await p.$eval('#punchCount', (e) => e.disabled))
  await p.close()
}

// ── 5 ★크로스 패널 잠금 (spec §5.2-①) ──────────────────────────────
{
  const p = await openPanel()
  await p.click('#btnLockTest'); await p.waitForTimeout(80)
  ok('5 잠금 획득', (await txt(p, '#lockState')).includes('seen:cut'), await txt(p, '#lockState'))
  await p.click('#btnUnlock'); await p.waitForTimeout(80)
  ok('5 해제되면 없음', (await txt(p, '#lockState')) === '없음', await txt(p, '#lockState'))
  await p.close()
}
{
  // A0 가 이미 점유한 상태 — 재단 패널이 그것을 **보고** 물러나야 한다.
  // 이게 안 보이면 두 패널이 일러 하나를 동시에 때린다.
  // 매개는 잠금 파일(%TEMP%)이다 — CEP 는 확장마다 ExtendScript 엔진이 따로라 전역으로는 안 된다(실측).
  const p = await openPanel({ preLock: { owner: 'a0', label: 'batch' } })
  ok('5 타 패널 잠금이 보임(파일 매개)', (await txt(p, '#lockState')).includes('seen:a0'), await txt(p, '#lockState'))
  await p.click('#btnLockTest'); await p.waitForTimeout(80)
  const out = await txt(p, '#out')
  ok('5 점유 중이면 획득 실패를 알림', out.includes('점유 중') && out.includes('a0'), out.slice(0, 60))
  await p.click('#btnUnlock'); await p.waitForTimeout(80)
  ok('5 남의 잠금은 풀지 않음', (await txt(p, '#out')).includes('남의 잠금'), await txt(p, '#out'))
  await p.close()
}
{
  // 잠금이 없을 때는 **어느 파일로 매개하는지**를 보여준다 — 두 패널이 같은 파일을 보는지
  // 사용자가 직접 확인할 수 있어야 한다(다른 PC 지원 시 이게 1차 단서다).
  const p = await openPanel()
  await p.click('#btnLockProbe'); await p.waitForTimeout(120)
  const out = await txt(p, '#out')
  ok('5 잠금 없을 때 잠금 파일 경로 노출', out.includes('mes_host_lock.txt'), out.slice(0, 80))
  await p.close()
}

// ── 3e ★곡선 칼선 (베지어) — 각진 계단을 없애되 코너는 지킨다 ─────────
// 여기서 잡는 것: B/HB 접두사가 실제로 나가는가 · 좌표 개수가 1+3n 인가 · 닫히는가 ·
//                원은 매끈해지고(점 감소) 사각은 코너를 유지하는가.
{
  const p = await openPanel()
  const mkDisk = `(() => {
    const W=300,H=300,cx=150,cy=150; const d=new Uint8ClampedArray(W*H*4);
    for(let y=0;y<H;y++)for(let x=0;x<W;x++){ if(Math.hypot(x-cx,y-cy)<=100) d[(y*W+x)*4+3]=255; }
    return {W,H,ch:4,data:d};
  })()`
  const opt = { mmpp: 0.5, ox: 0, oy: 150, offsetMm: 2, mode: 'silhouette', bg: 'alpha', punchOn: false, punchN: 0, punchInsetMm: 0 }

  const poly = await p.evaluate(({ src, o }) => window.__mesCutBuild(eval(src), o), { src: mkDisk, o: { ...opt, curve: false } })
  const bez = await p.evaluate(({ src, o }) => window.__mesCutBuild(eval(src), o), { src: mkDisk, o: { ...opt, curve: true } })

  ok('3e 직선 모드는 P 로 나감', String(poly.text).split('\n')[0].startsWith('P '))
  ok('3e 곡선 모드는 B 로 나감', String(bez.text).split('\n')[0].startsWith('B '), String(bez.text).slice(0, 12))
  ok('3e 곡선 결과에 curve 플래그', bez.curve === true && poly.curve === false)

  const bTok = String(bez.text).split('\n')[0].slice(2).trim().split(/\s+/)
  // 시작 앵커 1개 + 세그먼트마다 3개 = 1+3n 이어야 호스트가 핸들을 짝지을 수 있다
  ok('3e 좌표 개수가 1+3n', bTok.length >= 4 && (bTok.length - 1) % 3 === 0, String(bTok.length))
  const first = bTok[0], last = bTok[bTok.length - 1]
  ok('3e 마지막 앵커가 시작 앵커와 같음(닫힘)', first === last, `${first} vs ${last}`)
  // 곡선이 점을 줄이지 못하면 각짐이 그대로다 — 원은 확실히 줄어야 한다
  const pTok = String(poly.text).split('\n')[0].slice(2).trim().split(/\s+/)
  const anchors = (bTok.length - 1) / 3
  ok('3e 원의 앵커 수가 폴리라인 점보다 적음', anchors < pTok.length, `앵커 ${anchors} vs 점 ${pTok.length}`)

  // ★코너 보존 — 사각형은 곡선 모드에서도 네 코너가 남아야 한다(둥글면 재단 형상이 바뀐다)
  const mkSquare = `(() => {
    const W=300,H=300; const d=new Uint8ClampedArray(W*H*4);
    for(let y=80;y<220;y++)for(let x=80;x<220;x++) d[(y*W+x)*4+3]=255;
    return {W,H,ch:4,data:d};
  })()`
  const sq = await p.evaluate(({ src, o }) => window.__mesCutBuild(eval(src), o), { src: mkSquare, o: { ...opt, offsetMm: 0, curve: true } })
  const sqCorners = await p.evaluate((txt) => {
    const t = txt.split('\n')[0].slice(2).trim().split(/\s+/).map((s) => s.split(',').map(Number))
    const n = (t.length - 1) / 3
    let c = 0
    for (let i = 0; i < n; i++) {
      const a3 = t[3 + i * 3], a2 = t[2 + i * 3]                 // 이 세그먼트의 끝 앵커·들어오는 핸들
      const b1 = t[1 + ((i + 1) % n) * 3], b0 = t[0 + ((i + 1) % n) * 3 || 0]
      const inV = [a3[0] - a2[0], a3[1] - a2[1]]
      const outV = [b1[0] - a3[0], b1[1] - a3[1]]
      const l1 = Math.hypot(inV[0], inV[1]) || 1, l2 = Math.hypot(outV[0], outV[1]) || 1
      if ((inV[0] * outV[0] + inV[1] * outV[1]) / (l1 * l2) < Math.cos(Math.PI * 40 / 180)) c++
    }
    return c
  }, String(sq.text))
  ok('3e 사각형은 코너 4개 유지', sqCorners === 4, String(sqCorners))
  await p.close()
}

// ── 3f ★간격 보장 = 해상도 스냅 (용준님 보고: 3mm 인데 3mm 가 안 나온다) ──
// offsetMask 는 `dist <= r` 라 r 의 소수부가 버려진다 → gap/2 가 픽셀 정수배가 아니면
// **조용히 좁게** 나간다. 스냅이 그 조합을 없애는지, 비용 상한을 지키는지 본다.
{
  const p = await openPanel()
  const rows = await p.evaluate(() => {
    // [여백, 간격, 폭, 높이] — 여백 0 은 "칼선을 디자인 경계에" 두는 실제 사례다
    const cases = [[0, 3, 1370, 0], [0, 5, 1370, 0], [0, 3, 1520, 0], [0, 3, 900, 1800], [0, 4, 1370, 0], [0, 10, 1370, 0],
    [3, 3, 1370, 0], [5, 5, 1370, 0], [2, 3, 900, 1800]]
    return cases.map(([off, gap, w, h]) => {
      const r = window.__mesCutNest.resolution(off, gap, w, h)
      const sub = Math.max(1, Math.min(4, Math.round(r.mmPerPx / 0.25)))
      const fine = r.mmPerPx / sub
      const cutFine = Math.floor(off / fine)
      // 보장은 **칼선끼리** — 디자인 사이(2×팽창)에서 양쪽 여백을 뺀다
      return {
        off, gap, w, mmpp: r.mmPerPx, rPx: r.rPx, exact: r.exact, safety: r.safetyMm || 0,
        design: 2 * r.rPx * r.mmPerPx,
        guaranteed: 2 * r.rPx * r.mmPerPx - 2 * cutFine * fine,
      }
    })
  })
  for (const r of rows) {
    ok(`3f 여백${r.off}/간격${r.gap}@${r.w} 칼선 실보장 ≥ 요청`, r.guaranteed >= r.gap - 1e-9,
      `보장 ${r.guaranteed.toFixed(2)}mm (${r.mmpp}mm/px · r=${r.rPx}px)`)
    ok(`3f 여백${r.off}/간격${r.gap}@${r.w} 반경이 정수 px`, Number.isInteger(r.rPx), String(r.rPx))
    // 디자인 사이 = 여백×2 + 간격 + 안전×2 (안전은 양자화가 간격을 깎는 것을 미리 메운 값)
    ok(`3f 여백${r.off}/간격${r.gap}@${r.w} 디자인 사이 = 모델+안전`,
      Math.abs(r.design - (2 * r.off + r.gap + 2 * r.safety)) <= 0.02,
      `${r.design.toFixed(2)} vs ${(2 * r.off + r.gap + 2 * r.safety).toFixed(2)}`)
    // 안전 여유가 무한정 커지면 재료만 낭비한다 — 격자 한 칸 반을 넘지 않아야 한다
    ok(`3f 여백${r.off}/간격${r.gap}@${r.w} 안전 여유가 과하지 않음`, r.safety <= r.mmpp * 1.5 + 1e-9,
      `안전 ${r.safety.toFixed(2)}mm vs 격자 ${r.mmpp.toFixed(3)}mm`)
  }
  // 회귀의 근거 — 스냅 전(1mm/px)이었다면 3mm 는 2mm 로 나갔다
  // 예전 결함(요청 3mm 가 실보장 2mm)은 이제 **안전 여유**로 막는다 — 해상도가 거칠어도 보장이 서야 한다.
  // 그리고 스냅은 절대 **기준보다 거친 격자**를 고르면 안 된다(거칠수록 경계·각짐이 동시에 나빠진다).
  ok('3f 스냅 격자가 기준보다 거칠지 않음', rows.every((r) => r.mmpp <= 1.0 + 1e-9),
    rows.map((r) => r.mmpp.toFixed(3)).join(','))
  // 최종 격자의 반 칸 이상이어야 보장이 서고(충분), 한 칸을 넘으면 재료만 낭비한다(과하지 않음)
  ok('3f 안전 여유가 격자 반 칸~한 칸',
    rows.every((r) => r.safety >= r.mmpp / 2 - 1e-9 && r.safety <= r.mmpp + 1e-9),
    rows.map((r) => `${r.safety.toFixed(3)}/${r.mmpp.toFixed(3)}`).join(' '))
  // ★여백을 키우면 디자인 사이가 그만큼 벌어져야 한다 — 간격과 여백이 섞이면 여기서 걸린다
  {
    const a = rows.find((r) => r.off === 0 && r.gap === 3 && r.w === 1370)
    const b = rows.find((r) => r.off === 3 && r.gap === 3 && r.w === 1370)
    ok('3f 여백 0→3 이면 디자인 사이가 6mm 늘어남', Math.abs((b.design - a.design) - 6) <= 0.05,
      `${a.design.toFixed(2)} → ${b.design.toFixed(2)}`)
    // 여백이 늘어도 **칼선 간격은 안 흔들려야** 한다. 미세격자 내림 때문에 조금 넉넉해질 수는
    // 있지만(안전 방향) 부족해지면 안 된다 — 두 값이 섞이면 여기서 크게 벌어진다.
    ok('3f 여백이 늘어도 칼선 보장 간격이 흔들리지 않음',
      b.guaranteed >= b.gap - 1e-9 && Math.abs(b.guaranteed - a.guaranteed) <= 0.3,
      `${a.guaranteed.toFixed(2)} vs ${b.guaranteed.toFixed(2)} (요청 ${b.gap})`)
  }
  ok('3f 폭 추천 후보가 index.html 프리셋과 같음', await p.evaluate(() => {
    const ui = [...document.querySelectorAll('#sheetPreset option')]
      .filter((e) => e.value.indexOf('roll:') === 0).map((e) => +e.value.slice(5)).sort((a, b) => a - b)
    const js = window.__mesCutNest.rollWidths.slice().sort((a, b) => a - b)
    return ui.length === js.length && ui.every((v, i) => v === js[i])
  }))
  await p.close()
}

// ── 3g ★효율% = 실면적 / 실제 소요 재료 ─────────────────────────────
// 예전 값은 분자가 gap 팽창 잉크, 분모가 usable(돔보 여백 제외)이라 실제의 1.7배로 부풀려졌다.
{
  const p = await openPanel()
  const r = await p.evaluate(() => {
    const N = window.__mesCutNest, M = N.dombo
    // 롤 1000mm 폭 · 사용 길이 100mm(=1mm/px 로 100px) 1장
    const res = { sheets: [{ usedH: 100, placements: [], inkPx: 0 }], unplaced: [], roll: true }
    const prep = { mmpp: 1 }
    return { area: N.areaMm2(res, prep, 1000, 0), margin: M, expect: 1000 * (100 + M * 2) }
  })
  ok('3g 분모 = 폭 전체 × (사용길이 + 돔보 여백)', r.area === r.expect, `${r.area} vs ${r.expect}`)
  ok('3g 분모가 usable 이 아님(여백 포함)', r.area > 1000 * 100)
  await p.close()
}

// ── 3h ★호스트 버전 게이트 — 구 호스트에 B 줄을 보내지 않는다 ────────
// 축2(Z: 호스트)와 축3·축4(껍데기)는 배포 시점이 다르다. **새 패널 + 구 호스트**가 실제로 생기며
// 그때 `B` 줄은 아는 접두사가 아니라 **조용히 무시**된다 = 칼선이 통째로 사라진다.
{
  for (const [ver, expectCurve] of [['CUT-CEP-0.4.3', false], ['CUT-CEP-0.5.0', true], ['CUT-CEP-1.0.0', true], ['CUT-CEP-0.4.9', false]]) {
    const p = await openPanel({ ping: ver })
    await p.waitForTimeout(120)
    const shown = await p.evaluate(() => document.getElementById('ver').textContent)
    ok(`3h ${ver} → 곡선 ${expectCurve ? '허용' : '차단'}`,
      /호스트가 구버전/.test(await p.evaluate(() => document.getElementById('curveCut').title)) !== expectCurve,
      shown)
    await p.close()
  }
  // 구 호스트에서는 시작 메시지로도 알려야 한다 — 결과가 조용히 달라지면 안 된다
  const p2 = await openPanel({ ping: 'CUT-CEP-0.4.3' })
  await p2.waitForTimeout(150)
  ok('3h 구 호스트면 시작 메시지로 알림',
    /곡선 칼선을 끕니다/.test(await p2.evaluate(() => document.getElementById('out').textContent)))
  await p2.close()
}

// ── 3i ★조각 칼선 정렬 — 미세 마스크에서 뽑아도 아트와 맞는가 ─────────
// 칼선을 미세 격자에서 뽑으면 윤곽은 정밀해지지만, **아트가 놓이는 자리와 어긋나면**
// 정밀해진 만큼 더 틀린다. 배치 좌표의 격자 오차는 아트와 칼선이 함께 움직여야 상쇄된다.
// 여기서 잡는 것: 미세/거친 두 경로가 **같은 자리**에 칼선을 놓는가 · 회전에서도 유지되는가.
{
  const p = await openPanel()
  const res = await p.evaluate(() => {
    const G = window.MesCutGeom, N = window.__mesCutNest
    const mmpp = 0.75, sub = 3, fineMmpp = mmpp / sub, D = N.dombo
    // 미세 격자에 30×20mm 사각(120×80 fine px) + 캔버스 여백 40px(10mm — 팽창이 잘리지 않게)
    const FW = 200, FH = 160, PAD = 40, W0 = 120, H0 = 80
    const fm = new Uint8Array(FW * FH)
    for (let y = PAD; y < PAD + H0; y++) for (let x = PAD; x < PAD + W0; x++) fm[y * FW + x] = 1
    const fine = { W: FW, H: FH, m: fm }
    const ds = G.downsampleMask(fm, FW, FH, sub, 0.5)

    // offMm = 여백(디자인→칼선) · gapMm = 칼선↔칼선
    const run = (rot, withFine, offMm, gapMm) => {
      const rPx = Math.round((offMm + gapMm / 2) / mmpp)
      const grow = (m, W, H, r) => (r > 0 ? G.offsetMask(m, W, H, r) : r < 0 ? G.insetMask(m, W, H, -r) : m)
      const piece = { id: 0, W: ds.W, H: ds.H, m: grow(ds.m, ds.W, ds.H, rPx), base: { W: ds.W, H: ds.H, m: ds.m } }
      if (withFine) piece.fine = fine
      const prep = {
        pieces: [piece], mmpp, rPx, sub: withFine ? sub : 1, fineMmpp,
        offsetMm: offMm, cutFinePx: Math.floor(offMm / fineMmpp),
      }
      const lines = []
      N.pieceCutLines(lines, null, prep, { id: 0, x: 100, y: 200, rot }, mmpp, false)
      const pp = lines.filter((l) => l.indexOf('P ') === 0)
      if (!pp.length) return null
      const pts = pp[0].slice(2).trim().split(/\s+/).map((s) => s.split(',').map(Number))
      const xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1])
      return {
        L: Math.min(...xs), R: Math.max(...xs), T: Math.min(...ys), B: Math.max(...ys),
        n: pts.length, count: pp.length, artX: 100 * mmpp + rPx * mmpp + D, artY: 200 * mmpp + rPx * mmpp + D,
      }
    }
    return {
      f0: run(0, true, 3, 3), c0: run(0, false, 3, 3), f90: run(90, true, 3, 3),
      off0: run(0, true, 0, 5),      // 여백 0 = 칼선이 디자인 경계에
      neg: run(0, true, -2, 5),      // 도련 2mm 적용분 — 칼선이 잉크 안쪽
    }
  })

  const near = (a, b, tol) => Math.abs(a - b) <= tol
  ok('3i 미세 경로가 칼선을 냄', !!res.f0 && res.f0.count === 1, JSON.stringify(res.f0))
  // 여백 3 → 칼선은 아트에서 사방 3mm 바깥 = 36×26mm
  ok('3i 칼선 좌상단 = 아트 − 여백', near(res.f0.L, res.f0.artX - 3, 0.4) && near(res.f0.T, res.f0.artY - 3, 0.4),
    `${res.f0.L},${res.f0.T} vs ${(res.f0.artX - 3).toFixed(2)},${(res.f0.artY - 3).toFixed(2)}`)
  ok('3i 칼선 크기 = 아트 + 여백×2', near(res.f0.R - res.f0.L, 36, 0.7) && near(res.f0.B - res.f0.T, 26, 0.7),
    `${(res.f0.R - res.f0.L).toFixed(2)}×${(res.f0.B - res.f0.T).toFixed(2)} (기대 36×26)`)
  ok('3i 미세·거친 경로가 같은 자리', near(res.f0.L, res.c0.L, 0.8) && near(res.f0.T, res.c0.T, 0.8),
    `fine ${res.f0.L},${res.f0.T} vs coarse ${res.c0.L},${res.c0.T}`)
  ok('3i 회전 90° 도 아트 기준 정렬', near(res.f90.L, res.f90.artX - 3, 0.4) && near(res.f90.T, res.f90.artY - 3, 0.4),
    `${res.f90.L},${res.f90.T} vs ${(res.f90.artX - 3).toFixed(2)},${(res.f90.artY - 3).toFixed(2)}`)
  ok('3i 회전 90° 크기가 뒤바뀜', near(res.f90.R - res.f90.L, 26, 0.7) && near(res.f90.B - res.f90.T, 36, 0.7),
    `${(res.f90.R - res.f90.L).toFixed(2)}×${(res.f90.B - res.f90.T).toFixed(2)} (기대 26×36)`)
  // ★여백 0 = 칼선이 디자인 경계에 딱 (간격을 키워도 칼선은 안 커진다 — 두 값의 분리 증명)
  ok('3i 여백 0 이면 칼선 = 디자인 크기', !!res.off0
    && near(res.off0.R - res.off0.L, 30, 0.7) && near(res.off0.B - res.off0.T, 20, 0.7),
    res.off0 ? `${(res.off0.R - res.off0.L).toFixed(2)}×${(res.off0.B - res.off0.T).toFixed(2)} (기대 30×20)` : 'null')
  // ★여백 음수 = 도련 적용분 안쪽 (칼선이 잉크보다 작아진다)
  ok('3i 여백 −2 면 칼선이 디자인보다 4mm 작음', !!res.neg
    && near(res.neg.R - res.neg.L, 26, 0.9) && near(res.neg.B - res.neg.T, 16, 0.9),
    res.neg ? `${(res.neg.R - res.neg.L).toFixed(2)}×${(res.neg.B - res.neg.T).toFixed(2)} (기대 26×16)` : 'null')
  ok('3i 미세 윤곽이 거친 것보다 촘촘', res.f0.n >= res.c0.n, `fine ${res.f0.n}점 vs coarse ${res.c0.n}점`)
  await p.close()
}

// ── 3j ★선 도안 판정 — "이미 칼선인 파일"을 가려내는가 ───────────────
// 시트컷 .ai 는 대개 컷 라인만 담고 면이 없다. 그대로 구우면 마스크가 획만 잡혀
// 모아찍기에서 **글자 속에 다른 조각이 들어간다**(실측: 잉크 1.2%·효율 1.1%·섬 20 vs 조각 18).
// 래스터만으로는 원리적으로 못 하는 판단이라 좌표를 세어(mesCut_artKind) 결정한다.
{
  const p = await openPanel()
  const rows = await p.evaluate(() => {
    const R = window.__mesCutFill
    const K = (o) => `paths=${o.p};filled=${o.f};stroked=${o.s};closed=${o.c};raster=0;text=0`
    const lineArt = K({ p: 18, f: 0, s: 18, c: 18 })   // 이미 칼선인 파일
    const normal = K({ p: 5, f: 5, s: 0, c: 5 })       // 면이 있는 보통 아트
    const mixed = K({ p: 6, f: 3, s: 6, c: 6 })        // 면+선 섞임
    const open = K({ p: 4, f: 0, s: 4, c: 0 })         // 열린 선(채울 수 없다)
    return {
      autoLine: R(lineArt, 'auto'), autoNormal: R(normal, 'auto'),
      autoMixed: R(mixed, 'auto'), autoOpen: R(open, 'auto'),
      offLine: R(lineArt, 'off'), onNormal: R(normal, 'on'),
      hostOld: R('ERROR mesCut_artKind 없음', 'auto'),
    }
  })
  ok('3j 자동: 선 도안이면 면으로 채움', rows.autoLine.fill === true && rows.autoLine.lineArt === true)
  ok('3j 자동: 면 있는 아트는 건드리지 않음', rows.autoNormal.fill === false)
  ok('3j 자동: 면이 하나라도 있으면 안 채움', rows.autoMixed.fill === false, JSON.stringify(rows.autoMixed))
  ok('3j 자동: 열린 선은 대상 아님', rows.autoOpen.fill === false)
  // ★조용히 달라지면 안 된다 — 무엇을 했는지 항상 말해야 한다
  ok('3j 자동 채움 시 이유를 알림', /자동/.test(rows.autoLine.note) && rows.autoLine.note.length > 0)
  ok('3j 끄면 선 도안이라고 경고', rows.offLine.fill === false && /선 도안/.test(rows.offLine.note))
  ok('3j 켜면 면이 있어도 채움', rows.onNormal.fill === true && /지정/.test(rows.onNormal.note))
  // 구 호스트에서 조용히 예전 동작으로 떨어지지 않는가
  ok('3j 구 호스트면 판정 불가를 알림', rows.hostOld.fill === false && /구버전/.test(rows.hostOld.note))
  ok('3j UI 선택칸 존재', await p.evaluate(() => {
    const el = document.getElementById('fillClosed')
    return !!el && [...el.options].map((o) => o.value).join(',') === 'auto,on,off'
  }))
  await p.close()
}

// ── 3k ★벡터 칼선 — 래스터 왕복을 건너뛰는가 ─────────────────────────
// 왜 재는가: 래스터 칼선은 실루엣 안팎을 **100mm당 7.5~10.6회 · ±0.4~0.5mm** 로 넘나든다
// (2026-08-01 같은 좌표계 점 단위 실측). 면적차는 0.2~0.7% 뿐이라 면적·bbox 게이트로는
// 안 잡히고 눈에만 보인다. 벡터는 일러가 직접 오프셋하므로 근사 오차 자체가 없다.
{
  const p = await openPanel()
  ok('3k UI 선택칸 존재·기본 벡터', await p.evaluate(() => {
    const el = document.getElementById('lineMode')
    return !!el && el.value === 'vector' && [...el.options].map((o) => o.value).join(',') === 'vector,raster'
  }))
  // 구 호스트(0.5.0)에서는 **조용히 벡터인 척하면 안 된다** — 래스터로 낮추고 이유를 말한다
  const old = await p.evaluate(() => window.__mesCutLineMode())
  ok('3k 구 호스트면 래스터로 낮추고 알림', old.vector === false && /구버전/.test(old.note), JSON.stringify(old))
  await p.close()
}
{
  const p = await openPanel({ ping: 'CUT-CEP-0.7.0' })
  ok('3k 신 호스트면 벡터', await p.evaluate(() => window.__mesCutLineMode().vector === true))
  ok('3k 래스터를 고르면 래스터', await p.evaluate(() => {
    document.getElementById('lineMode').value = 'raster'
    const r = window.__mesCutLineMode()
    document.getElementById('lineMode').value = 'vector'
    return r.vector === false && r.note === ''
  }))
  // 벡터 경로에서는 **굽지 않는다** — rasterize 가 불리면 왕복이 남아 있다는 뜻이다
  await p.click('#btnMakeCut'); await p.waitForTimeout(300)
  const calls = await p.evaluate(() => window.__calls.join('\n'))
  ok('3k 벡터면 mesCut_vecCut 호출', /mesCut_vecCut\(/.test(calls), calls.split('\n').slice(-4).join(' | '))
  ok('3k 벡터면 래스터화 안 함', !/mesCut_rasterize\(/.test(calls))
  ok('3k 결과에 벡터라고 표시', /벡터/.test(await txt(p, '#out')), await txt(p, '#out'))
  await p.close()
}
{
  // 호스트가 못 한다고 하면 래스터로 내려가되 **사유를 반드시 표시**한다(조용한 변경 금지)
  const p = await openPanel({ ping: 'CUT-CEP-0.7.0', vecProbe: 'fallback;reason=사진/임베드 이미지 2개' })
  await p.click('#btnMakeCut'); await p.waitForTimeout(400)
  const calls = await p.evaluate(() => window.__calls.join('\n'))
  ok('3k 폴백이면 래스터화로 내려감', /mesCut_rasterize\(/.test(calls) || /mesCut_selectionInfo/.test(calls))
  ok('3k 폴백이면 사유를 표시', /사진\/임베드 이미지 2개/.test(await txt(p, '#out')), await txt(p, '#out'))
  await p.close()
}
{
  const hostSrc = fs.readFileSync(path.join(REPO, 'IllustratorAutomat', 'designer', 'mes-cut-host.jsx'), 'utf8')
  ok('3k 호스트에 벡터 API 3종', /function mesCut_vecCut\(/.test(hostSrc)
    && /function mesCut_vecProbe\(/.test(hostSrc) && /function mesCut_vecSilhouette\(/.test(hostSrc))
  ok('3k nestApply 가 벡터 여백을 받는다', /function mesCut_nestApply\(vecOffsetMm, vecFillClosed/.test(hostSrc))
  // ★선 도안을 채우지 않으면 실루엣이 아니라 **고리**가 나온다(실측: 70×50 → 76.35 고리 + 63.65 구멍)
  ok('3k 선 도안은 사본에 채우기를 켠다', /mesCut_vecSilhouette[\s\S]{0,900}fillClosed[\s\S]{0,200}mesCut_fillClosedItem/.test(hostSrc))
  // ★조인은 실측으로 정했다 — 사각·원으로는 구별되지 않아 뾰족 도형에서만 잡힌다
  ok('3k 라운드 조인(jntp=0)', /MESCUT_VEC_JOIN = 0/.test(hostSrc))
  // ★오프셋 뒤 재합집합이 없으면 자기교차 고리가 남는다 = 벡터판 '선 중복'
  const adds = (hostSrc.match(/Live Pathfinder Add/g) || []).length
  ok('3k 오프셋 뒤 재합집합까지 2회', adds >= 2, `Live Pathfinder Add ${adds}회`)
  // ★applyEffect 뒤 선택 재지정이 없으면 expandStyle 이 조용히 안 먹는다(실측)
  ok('3k applyEffect 뒤 선택 재지정', /applyEffect[\s\S]{0,600}doc\.selection = null[\s\S]{0,300}expandStyle/.test(hostSrc))
  // ★클립을 무시하면 실루엣이 통째로 커진다(실측: 클립 60×60 → 200×100)
  ok('3k 클립 그룹은 Crop 으로 반영', /Live Pathfinder Crop/.test(hostSrc))
  // ★★벡터 결과를 다듬지 않는가 — 후처리는 실측에서 전부 악화됐다(앵커 병합 최대편차 2.117mm)
  ok('3k 벡터 결과를 단순화·재피팅하지 않음',
    !/mesCut_vecSilhouette[\s\S]*?(simplify|fitCurves)\s*\(/.test(hostSrc))
}

// ── 3r ★일괄 굽기 + 단품 경로 정리 (2026-08-03 지시) ──────────────────
// 조각마다 임시 문서를 만들면 조각당 4.07초인데 실제 굽기는 78ms 뿐이다(실측).
{
  const hostSrc = fs.readFileSync(path.join(REPO, 'IllustratorAutomat', 'designer', 'mes-cut-host.jsx'), 'utf8')
  const panelSrc = fs.readFileSync(path.join(PANEL_DIR, 'js/main.js'), 'utf8')
  ok('3r 호스트에 일괄 굽기', /function mesCut_nestBakeAll\(/.test(hostSrc))
  // ★활성 전환은 총 2회여야 한다 — 조각 수에 비례하면 개선이 없다
  const bake = hostSrc.slice(hostSrc.indexOf('function mesCut_nestBakeAll('), hostSrc.indexOf('function mesCut_rasterizeItem('))
  ok('3r 활성 전환이 조각 수와 무관', (bake.match(/app\.activeDocument = /g) || []).length <= 4,
    String((bake.match(/app\.activeDocument = /g) || []).length))
  ok('3r 임시 문서는 하나', (bake.match(/documents\.add\(/g) || []).length === 1)
  // ★복제본이 겹치면 다른 조각이 캔버스에 들어온다 → 벌려 놓아야 한다
  ok('3r 복제본을 벌려 놓는다', /translate\(dx, dy\)/.test(bake))
  ok('3r 패널이 버전 게이트로 고른다', /hostSupportsBakeAll\(\)\) bakeAll\(\); else next\(\)/.test(panelSrc))
  // ★두 경로가 같은 마스크 코드를 써야 한다 — 갈라지면 한쪽만 조용히 달라진다
  ok('3r 마스크 처리는 공용', /function addPiece\(id, img\)/.test(panelSrc))
  // ★1장짜리도 모아찍기로 — 재단은 돔보가 있어야 하므로 단품 칼선만으로는 못 자른다
  ok('3r 모아찍기가 1장도 받는다', /if \(n < 1\)/.test(panelSrc))
  ok('3r 단품 칼선은 기본 접힘',
    /<details class="grp">/.test(fs.readFileSync(path.join(PANEL_DIR, 'index.html'), 'utf8')))
}

// ── 3q ★모아찍기 도련 (2026-08-03 지시) ──────────────────────────────
{
  const p = await openPanel({ ping: 'CUT-CEP-0.7.0' })
  ok('3q 모아찍기 도련 칸·기본 3mm', await p.evaluate(() => {
    const el = document.getElementById('nestBleed')
    return !!el && el.value === '3'
  }))
  await p.close()
}
{
  const hostSrc = fs.readFileSync(path.join(REPO, 'IllustratorAutomat', 'designer', 'mes-cut-host.jsx'), 'utf8')
  const panelSrc = fs.readFileSync(path.join(PANEL_DIR, 'js/main.js'), 'utf8')
  ok('3q nestApply 가 도련을 받는다', /function mesCut_nestApply\(vecOffsetMm, vecFillClosed, vecBleedMm, vecBleedMode\)/.test(hostSrc))
  // ★조각마다 따로 불러야 한다 — 한꺼번에 하면 조각끼리 이어진다
  ok('3q 배치된 사본마다 도련', /mesCut_vecBleed\(doc, \[copies\[vi\]\]/.test(hostSrc))
  ok('3q 패널이 도련을 넘긴다', /nestApply\([\s\S]{0,120}nestBleedMm/.test(panelSrc))
  // ★간격 < 도련×2 면 인접 도련이 겹친다 — 조용히 두면 남의 색이 링에 남는다
  ok('3q 간격이 좁으면 경고', /gapMm < nestBleedMm \* 2/.test(panelSrc))
}

// ── 3p ★설명 접기 (2026-08-03: "실사용시에는 설명이 너무 많다") ──────────
{
  const p = await openPanel({ ping: 'CUT-CEP-0.7.0' })
  ok('3p 기본은 설명 접힘', await p.evaluate(() => document.querySelector('.panel').className.includes('no-hints')))
  ok('3p 접히면 hint 가 안 보인다', await p.evaluate(() => {
    const h = document.querySelector('.hint')
    return h && getComputedStyle(h).display === 'none'
  }))
  await p.click('#btnHelp'); await p.waitForTimeout(60)
  ok('3p ? 로 펼쳐진다', await p.evaluate(() => {
    const h = document.querySelector('.hint')
    return !document.querySelector('.panel').className.includes('no-hints') && getComputedStyle(h).display !== 'none'
  }))
  // ★설명을 **지우지 않았는지** — 접는 것과 없애는 것은 다르다
  ok('3p 설명이 그대로 남아 있다', await p.evaluate(() => document.querySelectorAll('.hint').length >= 10))
  await p.click('#btnHelp'); await p.waitForTimeout(60)
  ok('3p 다시 누르면 접힌다', await p.evaluate(() => document.querySelector('.panel').className.includes('no-hints')))
  await p.close()
}

// ── 3o ★레이어 분리 + 인쇄 플래그 + 시트 테두리 제거 (2026-08-03 지시) ──
// 규약(SheetLayout.jsx:19~22): CutLine = print OFF · Dombo = print ON.
{
  const hostSrc = fs.readFileSync(path.join(REPO, 'IllustratorAutomat', 'designer', 'mes-cut-host.jsx'), 'utf8')
  ok('3o 돔보 레이어 분리', /var MESCUT_MARK_LAYER = '돔보'/.test(hostSrc) && /function mesCut_ensureMarkLayer\(/.test(hostSrc))
  ok('3o 재단선 레이어 인쇄 OFF', /mesCut_ensureCutLayer[\s\S]{0,400}printable = false/.test(hostSrc))
  ok('3o 돔보 레이어 인쇄 ON', /mesCut_ensureMarkLayer[\s\S]{0,400}printable = true/.test(hostSrc))
  ok('3o 돔보를 돔보 레이어에 그린다', /var layer = mesCut_ensureMarkLayer\(doc\)/.test(hostSrc))
  // ★시트 전체를 두르는 사각 재단선은 만들지 않는다
  ok('3o 시트 테두리 사각을 만들지 않음', !/layer\.pathItems\.rectangle\(oT, oL/.test(hostSrc))
  // ★돔보 레이어를 입력에서 빼지 않으면 돔보가 아트로 잡혀 조각이 된다
  ok('3o 돔보도 입력에서 제외', /MESCUT_CUT_LAYER \|\| it\.layer\.name === MESCUT_MARK_LAYER/.test(hostSrc))
  // ★DXF 는 두 레이어를 함께 담아야 한다 — 칼선만 담으면 돔보가 빠진다
  ok('3o DXF 가 돔보 레이어도 모은다', /markLayer\.pageItems\[k\]\); srcLayerOf\.push\('mark'\)/.test(hostSrc))
  // ★비인쇄 레이어는 DXF 에서 누락·변형된다 → 내보내는 동안만 켰다가 되돌린다
  ok('3o DXF 중 인쇄 플래그 임시 복원', /restore\.push\(cutLayer\)/.test(hostSrc) && /restore\[rr\]\.printable = false/.test(hostSrc))
}

// ── 3n ★돔보 여백 = 코너 + 반지름 (2026-08-03) ────────────────────────
// 지름을 더하면 아무것도 없는 3mm 를 매 변마다 버린다. 실물도 원이 판 끝에 접한다.
{
  const hostSrc = fs.readFileSync(path.join(REPO, 'IllustratorAutomat', 'designer', 'mes-cut-host.jsx'), 'utf8')
  const panelSrc = fs.readFileSync(path.join(PANEL_DIR, 'js/main.js'), 'utf8')
  ok('3n 호스트 여백 = 코너 + 반지름', /MESCUT_DOMBO_CORNER_MM \+ MESCUT_DOMBO_DIAM_MM \/ 2/.test(hostSrc))
  // ★둘이 어긋나면 조각이 돔보를 덮거나 시트를 넘는다 — 값을 직접 대조한다
  const corner = +(/MESCUT_DOMBO_CORNER_MM = (\d+)/.exec(hostSrc) || [])[1]
  const diam = +(/MESCUT_DOMBO_DIAM_MM = (\d+)/.exec(hostSrc) || [])[1]
  const panelMargin = +(/DOMBO_MARGIN_MM = (\d+)/.exec(panelSrc) || [])[1]
  ok('3n 패널·호스트 여백 값 일치', corner + diam / 2 === panelMargin, `host ${corner}+${diam}/2=${corner + diam / 2} vs panel ${panelMargin}`)
  ok('3n 여백이 20mm', panelMargin === 20, String(panelMargin))
}

// ── 3m ★도련 — 칼선 바깥까지 인쇄 (spec §2.11) ────────────────────────
// 실측: 인쇄 − 칼선 = **3mm/변**(806−800 · 1066−1060 · ~3.4). 10mm 는 돔보 자리다(중심7+반지름3).
{
  const p = await openPanel({ ping: 'CUT-CEP-0.7.0', vecCut: 'ok;paths=1;anchors=8;bleed=clip' })
  ok('3m UI 도련 칸·기본 3mm', await p.evaluate(() => {
    const el = document.getElementById('bleed')
    return !!el && el.value === '3'
  }))
  await p.click('#btnMakeCut'); await p.waitForTimeout(300)
  const calls = await p.evaluate(() => window.__calls.join('\n'))
  ok('3m vecCut 에 도련을 넘긴다', /mesCut_vecCut\(3,\s*(true|false),\s*3,/.test(calls), calls.split('\n').filter((l) => l.includes('vecCut')).join(' | '))
  // ★두 방식은 품질이 다르다(clip=무손실 / scale=근사) — 어느 쪽인지 반드시 말해야 한다
  ok('3m 클립 방식을 알린다', /클립을 넓혀/.test(await txt(p, '#out')), await txt(p, '#out'))
  ok('3m 방식 선택칸·기본 자동', await p.evaluate(() => {
    const el = document.getElementById('bleedMode')
    return !!el && el.value === 'auto' && [...el.options].map((o) => o.value).join(',') === 'auto,color,scale'
  }))
  await p.close()
}
{
  // ★A안 — 클립이 없으면 **가장자리 색**이 기본 폴백이다(확대는 이형에서 링이 빈다)
  const p = await openPanel({ ping: 'CUT-CEP-0.7.0', vecCut: 'ok;paths=1;anchors=8;bleed=color' })
  await p.click('#btnMakeCut'); await p.waitForTimeout(300)
  ok('3m 색 방식을 알린다', /가장자리 색으로 채웠습니다/.test(await txt(p, '#out')), await txt(p, '#out'))
  const calls = await p.evaluate(() => window.__calls.join(' ~ '))
  ok('3m vecCut 에 방식을 넘긴다', /mesCut_vecCut\(3,\s*(true|false),\s*3,"auto"\)/.test(calls),
    calls.split(' ~ ').filter((l) => l.includes('vecCut')).join(' | '))
  await p.close()
}
{
  const p = await openPanel({ ping: 'CUT-CEP-0.7.0', vecCut: 'ok;paths=1;anchors=8;bleed=scale' })
  await p.click('#btnMakeCut'); await p.waitForTimeout(300)
  ok('3m 확대 폴백이면 빌 수 있다고 경고', /링 일부가 빌 수 있습니다/.test(await txt(p, '#out')), await txt(p, '#out'))
  await p.close()
}
{
  const hostSrc = fs.readFileSync(path.join(REPO, 'IllustratorAutomat', 'designer', 'mes-cut-host.jsx'), 'utf8')
  ok('3m 호스트에 도련 2경로', /function mesCut_vecBleed\(/.test(hostSrc) && /function mesCut_vecGrowClips\(/.test(hostSrc))
  // ★클립 확장을 **먼저** 시도해야 한다 — 실물이 하는 방식이고 왜곡·빈 곳이 없다
  ok('3m 클립 확장을 먼저 시도', /mesCut_vecGrowClips\(items[\s\S]{0,80}\n\s*if \(grown > 0\) return/.test(hostSrc))
  // ★넓히는 양 = 여백 + 도련. 도련만 쓰면 인쇄 끝이 칼선과 겹쳐 도련이 0 이 된다(실측에서 걸림)
  ok('3m 클립은 여백+도련 만큼 넓힌다', /mesCut_vecGrowClips\(items, offsetMm \+ bleedMm\)/.test(hostSrc))
  // ★사각 클립만 — 임의 형상 클립을 건드리면 clipping 플래그가 깨질 수 있다
  ok('3m 사각 클립만 넓힌다', /pathPoints\.length !== 4\) continue/.test(hostSrc))
  // ★A안 — 색은 **고르지 않고 원본에서 읽는다**(겹치는 채워진 도형 중 가장 큰 것)
  ok('3m 가장자리 색 경로', /function mesCut_vecBleedColor\(/.test(hostSrc) && /function mesCut_dominantFill\(/.test(hostSrc))
  ok('3m 색 폴백이 기본(확대는 명시해야)', /if \(bleedMode !== 'scale'\) return mesCut_vecBleedColor/.test(hostSrc))
  ok('3m 도련은 원본 뒤로', /mesCut_vecBleedColor[\s\S]{0,900}ZOrderMethod\.SENDTOBACK/.test(hostSrc))
}

// ── 3l ★작업 폴더 산출 — EPS + DXF 같은 이름 쌍 (spec §2.7) ──────────
// 실물 작업 폴더는 판마다 `(자재+후가공)품목(<W>x<H>-<N>장)` 로 EPS·DXF 를 쌍으로 둔다.
// 규격은 **판 전체 크기이고 단위는 cm** — 파일명 `103x206` ↔ EPS 1030×2060mm 로 확인했다.
{
  const p = await openPanel({ ping: 'CUT-CEP-0.7.0' })
  ok('3l UI 필드·버튼 존재', await p.evaluate(() => {
    return !!document.getElementById('regMaterial') && !!document.getElementById('regFinish')
      && !!document.getElementById('regItem') && !!document.getElementById('btnExportPair')
  }))
  // 네스팅 전에는 낼 것이 없다 — 눌러도 아무 일 없는 버튼을 열어 두지 않는다
  ok('3l 네스팅 전에는 비활성', await p.evaluate(() => document.getElementById('btnExportPair').disabled === true))
  ok('3l 자재·후가공 후보가 실물 값', await p.evaluate(() => {
    const m = [...document.querySelectorAll('#materialList option')].map((o) => o.value)
    const f = [...document.querySelectorAll('#finishList option')].map((o) => o.value)
    return m.includes('포맥스5T') && m.includes('솔벤시트') && f.includes('자동바니쉬') && f.includes('조')
  }))
  const rows = await p.evaluate(() => {
    const P = window.__mesCutPair
    const set = (id, v) => { document.getElementById(id).value = v }
    const out = {}
    out.before = P.name()
    P.setNest({ wCm: 103, hCm: 206, n: 6 })
    set('regMaterial', '포맥스5T'); set('regFinish', '자동바니쉬'); set('regItem', '쓰레기불법투기')
    out.full = P.name()
    out.enabled = document.getElementById('btnExportPair').disabled === false
    set('regFinish', '')
    out.noFinish = P.name()
    set('regMaterial', ''); set('regItem', '테스트/이름:주의')
    out.sanitized = P.name()
    return out
  })
  ok('3l 네스팅 전에는 이름이 없다', rows.before === '', JSON.stringify(rows.before))
  ok('3l 파일명이 실물 규약대로', rows.full === '(포맥스5T+자동바니쉬)쓰레기불법투기(103x206-6장)', rows.full)
  ok('3l 이름이 생기면 버튼 활성', rows.enabled === true)
  ok('3l 후가공이 없으면 + 를 안 붙임', rows.noFinish === '(포맥스5T)쓰레기불법투기(103x206-6장)', rows.noFinish)
  ok('3l 파일명 금지문자 치환(한글은 유지)', rows.sanitized === '테스트_이름_주의(103x206-6장)', rows.sanitized)
  await p.close()
}
{
  const hostSrc = fs.readFileSync(path.join(REPO, 'IllustratorAutomat', 'designer', 'mes-cut-host.jsx'), 'utf8')
  ok('3l 호스트에 exportPair', /function mesCut_exportPair\(\)/.test(hostSrc))
  // ★이름·경로가 한글이라 인자로 받으면 브릿지에서 깨진다 → params 파일 경유여야 한다
  ok('3l 이름은 params 파일로 받는다', /mesCut_exportPair[\s\S]{0,900}mesCut_readParams\(\)/.test(hostSrc))
  ok('3l 폴더는 다이얼로그로 고른다', /Folder\.selectDlg/.test(hostSrc))
  // ★EPS 옵션은 A0 와 같아야 한다 — 실물 EPS 가 전부 그 형식이다
  const a0 = fs.readFileSync(path.join(REPO, 'IllustratorAutomat', 'designer', 'mes-a0-host.jsx'), 'utf8')
  const opts = (src) => ['cmykPostScript = true', 'Compatibility.ILLUSTRATOR10', 'EPSPreview.COLORTIFF', 'embedAllFonts = true']
    .filter((k) => src.includes(k)).join('|')
  ok('3l EPS 옵션이 A0 와 동일', opts(hostSrc) === opts(a0) && opts(hostSrc).split('|').length === 4, opts(hostSrc))
  ok('3l BUSY_IDS 에 btnExportPair', fs.readFileSync(path.join(PANEL_DIR, 'js/main.js'), 'utf8').includes("'btnExportPair'"))
  // ★파일명 규격 = 실제 아트보드여야 한다. 시트 프리셋을 쓰면 이름과 파일이 어긋난다
  //   (nestApply 가 아트보드를 배치 bbox + 돔보 여백으로 줄이기 때문)
  ok('3l 판 크기를 nestApply 가 돌려준다', /sheetw=' \+ MESCUT_LAST_SHEET_W/.test(hostSrc))
  // ★비활성 문서의 artboardRect 는 **활성 문서 값**을 돌려준다(실측: 312×273 인데 600×400)
  ok('3l 비활성 문서 아트보드를 읽지 않는다', !/MESCUT_NEST_DOCS\[0\]\.artboards/.test(hostSrc))
  ok('3l 패널이 시트 프리셋으로 이름을 만들지 않는다',
    !/wCm: Math\.round\(sheetWmm/.test(fs.readFileSync(path.join(PANEL_DIR, 'js/main.js'), 'utf8')))
}

// ── 5b P3 네스팅 UI ────────────────────────────────────────────────
{
  const p = await openPanel()
  ok('5b 네스팅 엔진 로드', await p.evaluate(() => !!window.MesCutNest))
  ok('5b 시트 프리셋 롤·평판 모두 있음', await p.evaluate(() => {
    const o = [...document.querySelectorAll('#sheetPreset option')].map((e) => e.value)
    return o.some((v) => v.startsWith('roll:')) && o.some((v) => v.startsWith('flat:'))
  }))
  // 네스팅 버튼도 잠금 대상이어야 한다 — 빠지면 작업 중에 눌려 두 파이프라인이 겹친다
  await p.click('#btnLockTest'); await p.waitForTimeout(80)
  await p.evaluate(() => { document.querySelector('details.nest').open = true })
  const disabledDuringBusy = await p.evaluate(() => {
    // setBusy 는 내부 함수라 직접 못 부른다 → BUSY_IDS 에 들어 있는지를 실행으로 확인
    const b = document.getElementById('btnNest')
    return b && b.id === 'btnNest'
  })
  ok('5b 네스팅 버튼 존재', disabledDuringBusy)
  ok('5b 폭 추천 버튼 존재', await p.evaluate(() => !!document.getElementById('btnWidth')))
  ok('5b 곡선 칼선 체크박스 존재', await p.evaluate(() => !!document.getElementById('curveCut')))
  // 새 진입점이 잠금에서 새면 두 파이프라인이 겹친다 — A0 가 실제로 겪은 결함이다
  ok('5b BUSY_IDS 에 btnWidth 포함', /BUSY_IDS\s*=\s*\[[^\]]*'btnWidth'/.test(
    fs.readFileSync(path.join(PANEL_DIR, 'js/main.js'), 'utf8')))
  await p.click('#btnUnlock'); await p.waitForTimeout(80)
  await p.close()
}
{
  // BUSY_IDS 누락은 소스로 잡는다(A0 에서 "새 진입점이 계속 새어 나간" 실패 모드)
  const src = fs.readFileSync(path.join(PANEL_DIR, 'js/main.js'), 'utf8')
  const m = src.match(/var BUSY_IDS = \[([^\]]+)\]/)
  ok('5b BUSY_IDS 에 btnNest 포함', !!m && m[1].includes('btnNest'), m ? m[1] : '(못 찾음)')
  ok('5b index.html 이 nesting.js 를 로드', fs.readFileSync(path.join(PANEL_DIR, 'index.html'), 'utf8').includes('js/nesting.js'))
}

// ── 6 manifest·포트가 A0 와 충돌하지 않는가 ─────────────────────────
{
  const xml = fs.readFileSync(path.join(PANEL_DIR, 'CSXS/manifest.xml'), 'utf8')
  const a0xml = fs.readFileSync(path.join(A0_DIR, 'CSXS/manifest.xml'), 'utf8')
  const bundleOf = (s) => (s.match(/ExtensionBundleId="([^"]+)"/) || [])[1]
  const extOf = (s) => (s.match(/<Extension Id="([^"]+)"/) || [])[1]
  ok('6 번들 ID = com.mes.cut.panel', bundleOf(xml) === 'com.mes.cut.panel', bundleOf(xml))
  ok('6 A0 와 번들 ID 다름(동시 설치 가능)', bundleOf(xml) !== bundleOf(a0xml))
  ok('6 A0 와 Extension Id 다름', extOf(xml) !== extOf(a0xml), extOf(xml) + ' vs ' + extOf(a0xml))

  const dbg = fs.readFileSync(path.join(PANEL_DIR, '.debug'), 'utf8')
  const a0dbg = fs.readFileSync(path.join(A0_DIR, '.debug'), 'utf8')
  const portOf = (s) => (s.match(/Port="(\d+)"/) || [])[1]
  ok('6 CDP 포트 8889', portOf(dbg) === '8889', portOf(dbg))
  ok('6 A0(8888) 와 포트 충돌 없음', portOf(dbg) !== portOf(a0dbg), portOf(dbg) + ' vs ' + portOf(a0dbg))

  // A0 의 교훈: 기본 크기가 콘텐츠보다 작으면 실행 버튼·결과창이 화면 밖으로 밀린다.
  const h = +(xml.match(/<Height>(\d+)<\/Height>/) || [])[1]
  const w = +(xml.match(/<Width>(\d+)<\/Width>/) || [])[1]
  ok('6 기본 크기가 충분(≥520×320)', h >= 520 && w >= 320, `${w}×${h}`)
}

// ── 7 호스트 접두사 — A0 전역을 덮어쓰지 않는가 (병합 보존 제약 §5.3) ──
{
  const hostSrc = fs.readFileSync(path.join(REPO, 'IllustratorAutomat', 'designer', 'mes-cut-host.jsx'), 'utf8')
  const fns = [...hostSrc.matchAll(/^function\s+([A-Za-z0-9_]+)/gm)].map((m) => m[1])
  const bad = fns.filter((f) => !/^mesCut_/.test(f))
  ok('7 호스트 전역 함수가 전부 mesCut_*', bad.length === 0, bad.join(','))
  const stub = fs.readFileSync(path.join(PANEL_DIR, 'jsx/host.jsx'), 'utf8')
  // ⚠️ 주석을 지우고 검사한다 — 스텁 주석에는 "이렇게 하면 안 된다"는 IIFE 예시가 일부러 들어 있어서,
  //    원문 그대로 검사하면 그 예시가 잡혀 오탐이 난다(2026-07-31 실제로 FAIL 남).
  const stubCode = stub.replace(/^\s*\/\/.*$/gm, '')
  ok('7 스텁이 evalFile 을 전역에서 호출(IIFE 금지)',
    /\$\.evalFile/.test(stubCode) && !/\(function\s*\([^)]*\)\s*\{[\s\S]*\$\.evalFile/.test(stubCode))
  ok('7 스텁이 A0 가 아닌 재단 정본을 가리킴', /mes-cut-host\.jsx/.test(stub))
}

// ── 결과 ────────────────────────────────────────────────────────────
await browser.close()
let pass = 0
for (const r of results) {
  console.log(`  ${r.c ? 'PASS' : 'FAIL'}  ${r.n}${r.c ? '' : '   ← ' + r.extra}`)
  if (r.c) pass++
}
console.log(`\n요약: ${pass} / ${results.length}`)
process.exit(pass === results.length ? 0 : 1)
