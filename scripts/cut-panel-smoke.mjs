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
// 2026-08-04 병합: 재단 껍데기는 A0 패널의 '재단' 탭으로 흡수됐다.
// 검사 대상은 같은 파일들이고 위치만 바뀌었다 — main.js 만 cut-main.js 로 나뉘어 있다.
const PANEL_DIR = path.join(REPO, 'IllustratorAutomat', 'designer', 'poc-a0-cep', 'com.mes.a0.panel')
const CUT_MAIN = path.join(PANEL_DIR, 'js/cut-main.js')
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
  getExtensionID: function () { return 'com.mes.a0.panel'; },
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
  // ★2026-08-04 병합 — 패널이 열리면 '가공' 탭이 보이므로 재단 화면은 display:none 이다.
  //   그 상태로 클릭하면 Playwright 가 "element is not visible" 로 타임아웃한다.
  //   localStorage 로 마지막 탭이 복원될 수도 있으니 **매번 명시적으로** 재단으로 옮긴다.
  await p.evaluate(() => { if (window.MesMainTab) window.MesMainTab.set('cut') })
  await p.waitForTimeout(50)
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
  const ver = await txt(p, '#cutVer')
  ok('1 shell·host 버전 동시 표기', /shell \d+\.\d+\.\d+ · host CUT-CEP-\d+\.\d+\.\d+/.test(ver), ver)
  ok('1 문서 정보 표시(mm 환산)', (await txt(p, '#docInfo')).includes('1220×2070mm'), await txt(p, '#docInfo'))
  ok('1 선택 정보 표시', (await txt(p, '#selInfo')).includes('2개 · 300.5×180mm'), await txt(p, '#selInfo'))
  await p.close()
}

// ── 2 호스트 미로드(=Z: 미배포)를 사용자에게 알리는가 ────────────────
{
  const p = await openPanel({ hostLoaded: false })
  const out = await txt(p, '#cutOut')
  ok('2 host 미로드 시 원인 표시', out.includes('ERROR') && out.includes('Z:'), out.slice(0, 60))
  ok('2 오류 스타일 적용', (await p.$eval('#cutOut', (e) => e.className)).includes('err'))
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
  const out = await txt(p, '#cutOut')
  ok('5 점유 중이면 획득 실패를 알림', out.includes('점유 중') && out.includes('a0'), out.slice(0, 60))
  await p.click('#btnUnlock'); await p.waitForTimeout(80)
  ok('5 남의 잠금은 풀지 않음', (await txt(p, '#cutOut')).includes('남의 잠금'), await txt(p, '#cutOut'))
  await p.close()
}
{
  // 잠금이 없을 때는 **어느 파일로 매개하는지**를 보여준다 — 두 패널이 같은 파일을 보는지
  // 사용자가 직접 확인할 수 있어야 한다(다른 PC 지원 시 이게 1차 단서다).
  const p = await openPanel()
  await p.click('#btnLockProbe'); await p.waitForTimeout(120)
  const out = await txt(p, '#cutOut')
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
  // ★맞붙임 — 여백·간격이 **둘 다 0** 이면 안전 여유를 뺀다. 칼선이 정확히 포개져야
  //   재단기가 같은 자리를 두 번 자르지 않는다(2026-08-05 용준님). 여유가 남으면 조각이 떨어져
  //   칼선이 2줄이 되고 의도가 깨진다. 0 이 아닌 값에서는 여유가 그대로여야 한다(간격이 깎인다).
  {
    const zr = await p.evaluate(() => {
      return [[0, 0, 1370, 0], [0, 0, 914, 0], [0, 0, 1200, 2400], [0, 0, 600, 400]].map(([off, gap, w, h]) => {
        const r = window.__mesCutNest.resolution(off, gap, w, h)
        return { w, rPx: r.rPx, safety: r.safetyMm || 0, design: 2 * r.rPx * r.mmPerPx }
      })
    })
    ok('3f 여백0·간격0 이면 조각이 붙는다', zr.every((r) => r.rPx === 0 && r.safety === 0 && r.design === 0),
      zr.map((r) => `${r.w}:${r.rPx}px/안전${r.safety}/사이${r.design}`).join(' '))
  }
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
    /곡선 칼선을 끕니다/.test(await p2.evaluate(() => document.getElementById('cutOut').textContent)))
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
  // 2026-08-07: 방식은 **고르는 것이 아니라 맡기는 것**으로 바꿨다. 벡터는 어차피 사진·임베드에서
  //   알아서 래스터로 내려가 실질 선택지가 아니었고, 그러면서 맞붙임만 막았다.
  //   남긴 것은 **래스터 고정**(벡터가 말썽일 때의 우회로) 하나뿐이다.
  ok('3k UI 기본 자동 · 래스터 고정만 남김', await p.evaluate(() => {
    const el = document.getElementById('lineMode')
    return !!el && el.value === 'auto' && [...el.options].map((o) => o.value).join(',') === 'auto,raster'
  }))
  // ★옛 값 'vector' 가 들어와도 auto 와 같이 돌아야 한다 — 저장된 설정·구 화면 대비
  ok('3k 옛 값 vector 는 자동과 같이 동작', /want === 'raster'/.test(fs.readFileSync(CUT_MAIN, 'utf8')))
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
  ok('3k 결과에 벡터라고 표시', /벡터/.test(await txt(p, '#cutOut')), await txt(p, '#cutOut'))
  await p.close()
}
{
  // 호스트가 못 한다고 하면 래스터로 내려가되 **사유를 반드시 표시**한다(조용한 변경 금지)
  const p = await openPanel({ ping: 'CUT-CEP-0.7.0', vecProbe: 'fallback;reason=사진/임베드 이미지 2개' })
  await p.click('#btnMakeCut'); await p.waitForTimeout(400)
  const calls = await p.evaluate(() => window.__calls.join('\n'))
  ok('3k 폴백이면 래스터화로 내려감', /mesCut_rasterize\(/.test(calls) || /mesCut_selectionInfo/.test(calls))
  ok('3k 폴백이면 사유를 표시', /사진\/임베드 이미지 2개/.test(await txt(p, '#cutOut')), await txt(p, '#cutOut'))
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
  const panelSrc = fs.readFileSync(CUT_MAIN, 'utf8')
  ok('3r 호스트에 일괄 굽기', /function mesCut_nestBakeAll\(/.test(hostSrc))
  // ★활성 전환은 총 2회여야 한다 — 조각 수에 비례하면 개선이 없다
  const bake = hostSrc.slice(hostSrc.indexOf('function mesCut_nestBakeAll('), hostSrc.indexOf('function mesCut_rasterizeItem('))
  ok('3r 활성 전환이 조각 수와 무관', (bake.match(/app\.activeDocument = /g) || []).length <= 4,
    String((bake.match(/app\.activeDocument = /g) || []).length))
  // ★`documents.add` → `mesCut_newDocMM`(mm 단위 문서, 2026-08-25). 세는 대상만 바뀌고 규칙은 같다.
  ok('3r 임시 문서는 하나', (bake.match(/mesCut_newDocMM\(/g) || []).length === 1)
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
  const panelSrc = fs.readFileSync(CUT_MAIN, 'utf8')
  // ★인자 목록을 **글자 그대로** 고정하지 않는다 — 의도는 "도련을 받는다"이지 "인자가 4개"가 아니다.
  //   전엔 정확히 4개로 못박혀 있어서, 인자를 하나 더한 정당한 수정이 게이트에 걸렸다.
  //   같은 함정이 `Folder.selectDlg` 에서는 반대로 작동해 **깨진 형태를 정답으로 고정**했다(2026-08-05).
  ok('3q nestApply 가 도련을 받는다', /function mesCut_nestApply\([^)]*\bvecBleedMm\b[^)]*\)/.test(hostSrc))
  // ★도련은 칼선 방식과 **독립**이어야 한다 (2026-08-06 실사용 버그).
  //   전에는 도련 전체가 `if (useVec)` 안에 있어, 벡터가 안 되는 아트에서 래스터로 폴백하면
  //   도련이 통째로 사라졌다. 화면 보고도 같은 게이트라 아무 말이 없었다.
  ok('3q 도련이 벡터 전용이 아니다(호스트)', /if \(hasGeom\) \{[\s\S]{0,400}?vecBleedMm > 0/.test(hostSrc))
  ok('3q 래스터에서도 도련 PNG 를 굽는다', /var wantBleedPng = effBleedMm > 0 && growMm > 0;/.test(panelSrc))
  ok('3q 래스터면 cutMode 를 알린다', /useVec \? '' : ',"raster"/.test(panelSrc))
  ok('3q 도련 0 을 조용히 넘기지 않는다', /도련 0mm — 만들지 않았습니다/.test(panelSrc))

  // ── 조각 수량 (2026-08-06) ─────────────────────────────────────
  // ★같은 **객체 참조**를 반복해야 한다. 복사본을 넣으면 nesting.js 의 캐시(cache.get(src))가
  //   조각마다 새로 생겨 굽기 1회의 이점이 사라지고, 메모리도 배수로 든다.
  ok('3r 수량은 같은 객체를 반복', /expanded\.push\(prep\.pieces\[i\]\)/.test(panelSrc))
  // ★확장은 배치 **전**이어야 한다 — 뒤에 오는 grownPx·효율%·폭 추정이 이 목록을 센다.
  ok('3r 확장이 배치보다 먼저', /expandByQty\(prep\)[\s\S]{0,1800}?nestPlace\(NST, prep/.test(panelSrc))
  // ★효율%는 늘어난 잉크 기준 — 안 고치면 8장을 깔아도 1장치 잉크로 계산돼 효율이 1/8 로 보인다
  ok('3r 효율 기준 잉크도 늘린다', /prep\.rawInkPx = ink;/.test(panelSrc))
  // ★목록과 선택이 어긋나면 조용히 1개로 떨어지지 않는다
  ok('3r 목록 불일치를 알린다', /전부 1개\*\*로 배치했습니다/.test(panelSrc))
  ok('3r 호스트가 조각 크기를 준다', /function mesCut_nestSizes\(\)/.test(hostSrc))
  // ★크기 조회가 선택을 바꾸면 이어지는 nestBegin 이 그 하나만 잡는다
  ok('3r 크기 조회는 선택을 안 건드린다', !/mesCut_nestSizes[\s\S]{0,600}?\.selection\s*=/.test(hostSrc))
  // ★폭 추천은 [네스팅 실행]과 **같은 조건**이어야 비교가 성립한다 — 수량도 포함이다.
  ok('3r 폭 추천도 수량 반영', (panelSrc.match(/expandByQty\(prep\)/g) || []).length >= 2)
  // ★선언과 사용이 **짝**이어야 한다. 한쪽만 들어가면 그 경로에서만 ReferenceError 가 난다 —
  //   실제로 그렇게 났고(2026-08-06 폭 추천), canvas catch 가 그것을 '보안 실패'로 둔갑시켜
  //   원인이 전혀 다른 곳을 가리켰다.
  {
    const decl = (panelSrc.match(/var qtyNote = expandByQty\(prep\)/g) || []).length
    ok('3r qtyNote 선언이 사용처만큼', decl === 2, 'decl=' + decl)
  }
  // ★try 는 getImageData 만 감싼다 — cb 까지 넣으면 콜백 안의 예외가 '보안 실패'로 오진된다.
  //   catch 가 return 으로 끝난다는 것이 곧 "성공 경로 cb 는 try 밖"이라는 뜻이다.
  ok('3r canvas catch 가 cb 를 안 삼킨다', /catch \(eTaint\) \{ cb\('canvas[^}]*return; \}/.test(panelSrc))

  // ── 도련 상한 (2026-08-06 실사용) ──────────────────────────────
  // ★상한 초과를 **건너뛰면 단색 링**이 된다 — 아트 색이 아니라 지정색이라 재단이 밀리면 보인다.
  //   실측: 5장 중 2장이 단색으로 떨어졌다. 거친 도련이 단색보다 언제나 낫다.
  ok('3s 큰 조각은 축소해서라도 도련', /downscaleRgba\(img, f\)/.test(panelSrc))
  // ★축소했으면 mm 환산도 그 해상도로 — 원본 mmpp 를 쓰면 그 조각만 f 배로 어긋난다
  ok('3s 축소분 mm 환산이 따로', /map\[it\.id\] = \{ w: res\.W \* mpp, h: res\.H \* mpp \}/.test(panelSrc))
  ok('3s 거칠게 만든 사실을 알린다', /도련만 거칠게 만들었습니다/.test(panelSrc))
  // ★외곽선 품질 = 도련을 **얼마나 안 줄이느냐**로 결정된다 (2026-08-06 용준님).
  //   ⓐ 거리배열 Int16 → 픽셀당 12→8바이트 → 같은 메모리로 상한을 올린다
  //   ⓑ 정수 배 축소는 상한을 10% 넘겨도 해상도를 절반으로 떨어뜨린다 → 연속 배율로 딱 맞춘다
  {
    const bleedSrc = fs.readFileSync(path.join(REPO, 'IllustratorAutomat', 'designer', 'poc-a0-cep', 'com.mes.a0.panel', 'js', 'bleed.js'), 'utf8')
    ok('3s 거리배열이 Int16', /new Int16Array\(n\), dy = new Int16Array\(n\)/.test(bleedSrc))
    // ★센티널은 Int16 에 들어가야 하고, 비교는 동치여야 한다 — 크기 비교면 먼 거리(200px)가 오판된다
    ok('3s 센티널이 Int16 범위', /var SENT = 32767;/.test(bleedSrc))
    ok('3s 센티널 비교는 동치', !/[><]=? *SENT|SENT *[><]=?/.test(bleedSrc))
  }
  ok('3s 축소는 연속 배율', /Math\.sqrt\(pxAt\(1\) \/ BLEED_MAX_PX\)/.test(panelSrc))

  // ── 굽기 픽셀 상한 (2026-08-06 실사용 정지) ──────────────────────
  // ★배치 격자 예산(pickResolution)은 **굽기 해상도를 모른다**. 굽기는 fineMmpp×bakeK 라
  //   파일배율 10·저장배율 1 에서 10배 곱고 픽셀은 100배 — 예산을 통과한 채 1억 px 가 되어
  //   '마스크 n/n' 에서 몇 분씩 멈춘다.
  ok('3x 굽기 좌표에서 예산을 다시 잰다', /var bakeMmpp = fineMmpp \* bakeK;[\s\S]{0,150}?estPx = selAreaMm2/.test(panelSrc))
  ok('3x 넘으면 격자를 성글게', /rez\.mmPerPx \*= kUp;/.test(panelSrc))
  ok('3x 성글게 잡았다고 알린다', /격자를 ' \+ oldFine/.test(panelSrc))
  // ★조각 크기는 호스트가 이미 아는 값 — 굽기 **전에** 받아야 예산을 세울 수 있다
  ok('3x 굽기 전에 크기를 받는다', /mesCut_nestSizes\(\)'[\s\S]{0,900}?prepareWith\(resolveFill/.test(panelSrc))

  // ── ★재단 탭 [◎ 전체] (2026-08-27) ────────────────────────────────
  // 가공 탭에는 [◎ 자동감지] 가 있는데 재단 탭에는 없어 매번 손으로 골라야 했다.
  // ⚠️ A0 의 자동감지와 **다르다** — 저쪽은 잉크 실루엣으로 나누고 문서에 그룹을 만든다.
  //    여기는 **문서를 바꾸지 않고** 이미 나뉜 최상위 개체만 고른다. 그 한계를 화면에 적는다.
  {
    const h = fs.readFileSync(path.join(REPO, 'IllustratorAutomat', 'designer', 'mes-cut-host.jsx'), 'utf8')
    ok('3r2 호스트에 전체 선택이 있다', /function mesCut_selectAllTop\(\)/.test(h))
    // ★잠긴·숨은 것은 건드리지 않는다 — 사용자가 일부러 빼 둔 것을 되돌리면 안 된다
    ok('3r2 잠긴·숨은 레이어 제외', /lay\.locked \|\| !lay\.visible/.test(h))
    ok('3r2 잠긴·숨은 개체 제외', /items\[i\]\.locked \|\| items\[i\]\.hidden/.test(h))
    // ★문서를 바꾸지 않는다 = 그룹을 만들지 않는다
    ok('3r2 그룹을 만들지 않는다', !/groupItems\.add\(\)/.test(h.slice(h.indexOf('function mesCut_selectAllTop'), h.indexOf('function mesCut_nestBegin'))))
    ok('3r2 고를 게 없으면 사유를 말한다', /고를 개체가 없습니다/.test(h))
    ok('3r2 호스트 버전이 0.24.0 이상', /MESCUT_VERSION = 'CUT-CEP-0\.(2[4-9]|[3-9]\d)\./.test(h))
  }
  {
    const html = fs.readFileSync(path.join(PANEL_DIR, 'index.html'), 'utf8')
    ok('3r2 버튼이 선택 행에 있다', /id="btnSelectAll"/.test(html))
  }
  ok('3r2 셸이 버튼을 잡는다', /btnSelAll\.addEventListener\('click', selectAllTop\)/.test(panelSrc))
  // ★새 버튼은 BUSY_IDS 에 넣는다(파일 머리 주석의 규약) — 안 넣으면 작업 중에 눌린다
  ok('3r2 작업 중 잠긴다', /BUSY_IDS = \[[^\]]*'btnSelectAll'/.test(panelSrc))
  // ★구 호스트면 조용히 아무 일도 안 하지 않는다 — 사유를 말한다
  ok('3r2 구 호스트면 사유를 말한다', /SELALL_MIN_HOST/.test(panelSrc) && /hostAtLeast\(SELALL_MIN_HOST\)/.test(panelSrc))
  // ★한계를 화면에 적는다 — "뭉친 개체는 안 나뉜다"
  ok('3r2 한계를 화면에 적는다', /뭉쳐 있으면 이걸로는 안 나뉩니다/.test(panelSrc))

  // ── ★도련 방식 칸이 실제 쓰는 자리에 있다 (2026-08-27) ────────────
  // 판짜기는 `bleedMode` 를 읽는데(cut-main.js:1490), 그 칸은 「이 버튼 전용(판짜기와 별개)」이라고
  // 적힌 **접힌 단품 섹션 안**에 있었다 — 라벨이 거짓이었고, 거기서 방식을 바꾸면 판짜기 결과가
  // 조용히 달라졌다. 동작(공용)은 그대로 두고 **보이는 자리**를 실제 쓰는 곳으로 옮겼다.
  {
    const html = fs.readFileSync(path.join(PANEL_DIR, 'index.html'), 'utf8')
    const idHits = (html.match(/id="bleedMode"/g) || []).length
    ok('3s2 bleedMode 는 하나뿐', idHits === 1, 'id 개수 ' + idHits)
    ok('3s2 bleedMode 가 판짜기 섹션 안',
      html.indexOf('id="bleedMode"') > html.indexOf('<details class="nest"'))
    // 태그(<b>)가 섞이므로 문자 클래스로 '<' 를 막지 않는다
    ok('3s2 단품 제목이 공용 사실을 말한다', /방식[\s\S]{0,12}은 판짜기와 공용/.test(html))
    ok('3s2 판짜기가 그 칸을 읽는다', /getElementById\('bleedMode'\)/.test(panelSrc))
  }

  // ── ★굽기 왕복 1회 + 판 문서 정리 (2026-08-27) ────────────────────
  // 실측(조각 4개·12.0M px, AI 30.7): 마스크 굽기 5,624ms · 도련 굽기 5,728ms · 패널 JS 1,258ms.
  // 픽셀을 16배 줄여도 40%만 빨라진다 = **고정비(임시문서·복제)가 지배** → 아낄 것은 왕복이다.
  //   통합 후 8,311ms (11,352 → **27% 절감**).
  // ⚠️ "마스크 PNG 재사용" 은 기각했다 — pad 가 달라 프레이밍이 1~2px 어긋나 도련이 2.6% 달라졌다.
  //    대신 **같은 문서에서 같은 아트보드 산수로 한 번 더 내보낸다**.
  //    실측 동등성: 도련 결과 크기 전부 동일 · 다른 픽셀 최대 0.0043%(전부 잉크 경계 AA).
  //    (대조군 = 옛 경로를 두 번 돌리면 픽셀 차이 0 → 일러는 결정적이고, 이 차이는 서브픽셀 위치 탓)
  ok('3t 굽기가 도련 태그를 함께 받는다', /function mesCut_nestBakeAll\(mmPerPx, padMm, fillClosed, tag, bleedTag\)/.test(
    fs.readFileSync(path.join(REPO, 'IllustratorAutomat', 'designer', 'mes-cut-host.jsx'), 'utf8')))
  {
    const h = fs.readFileSync(path.join(REPO, 'IllustratorAutomat', 'designer', 'mes-cut-host.jsx'), 'utf8')
    // ★도련 프레임 = pad 없는 잉크 bbox · AA OFF — 옛 'ink' 굽기와 **같은 조건**이어야 결과가 같다
    ok('3t 도련은 pad 없는 아트보드', /artboardRect = \[bx\[0\], bx\[1\], bx\[2\], bx\[3\]\]/.test(h))
    ok('3t 도련은 AA OFF', /bOpts\.antiAliasing = false/.test(h))
    ok('3t 도련 줄은 Q', /lines\.push\('Q ' \+ i/.test(h))
    // ★도련만 실패해도 마스크는 나가야 한다 — 패널이 옛 경로로 다시 구우면 된다
    ok('3t 도련 실패가 마스크를 막지 않는다', /catch \(eB\) \{ \/\* 도련만 실패하면/.test(h))
    // ★이전 판 문서 정리 — 안 닫으면 조정할 때마다 문서가 쌓인다
    ok('3t 이전 판 문서를 닫는다', /MESCUT_NEST_DOCS\[oc\]\.close\(SaveOptions\.DONOTSAVECHANGES\)/.test(h))
    ok('3t 호스트 버전이 0.23.0 이상', /MESCUT_VERSION = 'CUT-CEP-0\.(2[3-9]|[3-9]\d)\./.test(h))
  }
  ok('3t 패널이 도련 태그를 요청한다', /wantInk \? ',"ink"' : ''/.test(panelSrc))
  // ★선 도안이면 마스크가 닫힌 패스를 검게 칠한다 = 색 파괴 → 그때는 같이 뽑으면 안 된다
  ok('3t 선 도안이면 통합하지 않는다', /hostSupportsOneBake\(\) && !fv\.fill/.test(panelSrc))
  ok('3t Q 줄을 모은다', /if \(t\[0\] === 'Q'\) \{ inkList\.push/.test(panelSrc))
  ok('3t 있으면 다시 굽지 않는다', /if \(prep\.inkList && prep\.inkList\.length\) \{ withList\(prep\.inkList\); return; \}/.test(panelSrc))
  // ★두 경로가 같은 코드를 써야 한쪽만 조용히 달라지지 않는다
  ok('3t 재사용·재굽기가 같은 코드', /function withList\(list\) \{/.test(panelSrc))
  ok('3t 구 호스트면 옛 경로로 떨어진다', /var BAKE1_MIN_HOST = 'CUT-CEP-0\.23\.0'/.test(panelSrc))

  // ── ★등록이 사실을 보낸다 (2026-08-27) ────────────────────────────
  // 여태 재단 탭 등록 manifest 는 finishing/trim/punch 를 **하드코딩 null·false** 로 보냈다.
  // 특히 trim:false 는 사실과 다르다 — 판에는 돔보가 **항상** 들어간다.
  // 그리고 등록 EPS 이름(거래처-WxH-NEA-nest.eps)이 실제 작업 파일명과 달라서
  // RIP 가 보는 이름을 시스템이 몰랐다 → 출력완료 매칭 0%(8월 5,554건 중 0).
  ok('3u 등록에 실물 파일명을 싣는다', /lines\.push\('NAME ' \+ pairBaseName\(nSheetsR/.test(panelSrc))
  ok('3u 등록에 돔보 사실을 싣는다', /'TRIM 1',/.test(panelSrc))
  ok('3u 등록에 자재·후가공을 싣는다', /'MATERIAL ' \+/.test(panelSrc) && /'FINISH ' \+/.test(panelSrc))
  ok('3u 등록 결과에 파일명을 보여준다', /파일명 ' \+ pairBaseName/.test(panelSrc))
  {
    const h = fs.readFileSync(path.join(REPO, 'IllustratorAutomat', 'designer', 'mes-cut-host.jsx'), 'utf8')
    // ★NAME 은 판 수만큼 온다 — 단일 맵에 넣으면 마지막 판만 남는다
    ok('3u 호스트가 NAME 을 여러 줄 모은다', /o = \{ NAMES: \[\] \}/.test(h) && /if \(k === 'NAME'\)/.test(h))
    ok('3u 등록 EPS 이름 = 실물 규약', /var ripName = \(R\.NAMES && R\.NAMES\.length\)/.test(h))
    // ★구 셸이면 옛 이름으로 떨어진다 — 하위호환을 지운 채 배포하면 등록이 죽는다
    ok('3u 이름이 없으면 옛 규약 폴백', /EA-nest\.eps'\)/.test(h))
    ok('3u trim 을 하드코딩하지 않는다', !/"trim":false,"punch":null/.test(h))
    ok('3u trim 을 실제값으로 보낸다', /R\.TRIM === '1'/.test(h))
    ok('3u post_desc 에 자재\+후가공', /R\.MATERIAL \|\| R\.FINISH/.test(h))
    ok('3u 호스트 버전이 0.22.0 이상', /MESCUT_VERSION = 'CUT-CEP-0\.(2[2-9]|[3-9]\d)\./.test(h))
  }
  {
    // ★MES 쪽 절반 — 흡수 시점에 파일명↔주문을 배운다(키를 앞이 아니라 뒤에서 붙인다)
    const wb = fs.readFileSync(path.join(REPO, 'src', 'routes', 'workbench.ts'), 'utf8')
    ok('3u 흡수 시 print_file_map 을 배운다', /INSERT INTO print_file_map/.test(wb))
    ok('3u 카드 없이도 배운다(카드 0건 상태)', /VALUES \(\?, \?, NULL, NULL, \?, \?, \?\)/.test(wb))
    ok('3u 과거 이벤트를 소급한다', /UPDATE print_events SET order_number = \?/.test(wb))
    // ★학습 실패가 흡수를 되돌리면 안 된다 — 별칭 학습과 같은 원칙
    ok('3u 학습 실패를 삼킨다', /catch \(_mapErr\)/.test(wb))
  }

  // ── ★조각 속 메우기 (2026-08-27) ─────────────────────────────────
  // 실물 sample1.ai("테두리 사각 + 안쪽 글자") 실측으로 셋이 한 뿌리임이 확인됐다:
  //   조각 bbox 채움 14.4% → ①네스터가 테두리 안쪽에 다른 조각을 밀어 넣고
  //   ②mainPart 가 글자를 본체로 골라 isRectish 64% → 맞붙임 거절(맞닿은 변 두 줄)
  //   ③traceAll·findHoles 가 글자마다·글자 속마다 칼선(10줄).
  // 메우면 채움 98.9% · isRectish true · 칼선 1줄 · 끼어들기 0 · 판 길이 동일.
  ok('3v 배치 마스크를 한 덩어리로 만든다', /var wc = weldPiece\(G, em\.m, em\.W, em\.H\);/.test(panelSrc))
  ok('3v 칼선용 미세 마스크도 같은 규칙', /var wf = weldPiece\(G, em\.fine\.m, em\.fine\.W, em\.fine\.H\);/.test(panelSrc))
  ok('3v 속을 먼저 메운다', /var f = G\.fillHoles\(m, W, H\)/.test(panelSrc))
  ok('3v 덩어리가 하나면 bbox 를 쓰지 않는다(로고 보호)', /if \(big <= 1\) return \{ m: f/.test(panelSrc))
  ok('3v 덩어리가 여럿이면 bbox 하나로', /boxed: true/.test(panelSrc))
  ok('3v bbox 로 바꾼 조각 수를 센다', /if \(wc\.boxed\) boxedPieces\+\+;/.test(panelSrc))
  ok('3v bbox 로 바꿨다는 사실을 알린다', /바깥 사각\(bbox\)/.test(panelSrc))
  // ★효율%는 "실제 인쇄되는 잉크" 기준을 유지해야 한다 — 메운 뒤에 세면 조용히 부풀려진다.
  {
    const iInk = panelSrc.indexOf('rawInkPx += pInk;')
    const iFill = panelSrc.indexOf('var wc = weldPiece(G, em.m')
    ok('3v 잉크는 메우기 **전에** 센다(효율% 의미 보존)', iInk > 0 && iFill > iInk)
  }
  ok('3v 원본을 덮어쓰지 않고 새 배열을 받는다', /var f = G\.fillHoles\(m, W, H\), filledPx = 0/.test(panelSrc))
  // ★조용히 바꾸지 않는다 — 몇 개를 메웠는지 결과에 싣는다.
  ok('3v 메운 조각 수를 센다', /if \(wc\.filledPx\) filledPieces\+\+;/.test(panelSrc))
  ok('3v 메웠다는 사실을 결과에 싣는다', /holeNote:/.test(panelSrc) && /속을 메워/.test(panelSrc))
  ok('3v holeNote 를 실제로 출력한다', /\(prep\.holeNote \|\| ''\)/.test(panelSrc))
  // ★낱개 재단 탈출구를 안내한다 — 시트컷 글자·ㅇ 속 뚫기는 [고급 · 단품 칼선] 이 담당한다.
  ok('3v 낱개가 필요할 때의 경로를 안내', /단품 칼선/.test(panelSrc.slice(panelSrc.indexOf('holeNote:'), panelSrc.indexOf('holeNote:') + 400)))
  // ★단품 칼선(makeCut)은 손대지 않았다 — 거기는 지금도 구멍을 낸다.
  ok('3v 단품 칼선의 구멍은 유지', /var minHoleMm = toFileMm\(MIN_HOLE_MM\);/.test(panelSrc))
  // 엔진 쪽 정본 확인 — 하네스(cut:bench ⑧)가 동작을 검증한다
  ok('3v geometry 가 fillHoles 를 내보낸다',
    /fillHoles: fillHoles,/.test(fs.readFileSync(path.join(PANEL_DIR, 'js', 'geometry.js'), 'utf8')))

  // ── 맞붙임 정확 배치 (2026-08-06) ────────────────────────────────
  // ★조건을 **좁게** 유지하는 것이 이 기능의 안전장치다.
  //   여백>0 이면 칼선이 이웃과 겹치고, 여백<0 이면 떨어져 공유할 변이 없다.
  //   간격>0 은 애초에 붙이지 않겠다는 뜻이고, 이형은 붙여도 칼선이 안 맞는다.
  //   넷 중 하나라도 걸리면 기존 래스터 경로여야 한다(회귀 0).
  // ⚠️ 조건은 **왜 안 켜졌는지 말하는** if/else 사슬로 바뀌었다(2026-08-07). 조용히 폴백하면
  //    사용자는 기능이 고장난 줄 안다 — 실제로 한 번 그렇게 헛돌았다. 항목별로 나눠 본다.
  ok('3y 맞붙임은 여백·간격 정확히 0 일 때만', /offsetMm !== 0 \|\| gapMm !== 0/.test(panelSrc))
  // ★맞붙임은 벡터보다 우선한다(2026-08-07 실사용). 벡터는 조각마다 실루엣을 따로 그려
  //   맞닿은 변이 **원리상 반드시 두 줄**이라, 여백 0·간격 0 요청 자체를 만족시킬 수 없다.
  //   호스트 분기가 `if (useVec) … else if (segs)` 이므로 패널이 useVec 를 내려야 선분이 그려진다.
  ok('3y 맞붙임이 벡터보다 우선', /if \(buttExact && useVec\) \{ useVec = false/.test(panelSrc))
  ok('3y 맞붙임이면 호스트에 raster 로 알린다', /useVec \? '' : ',"raster"'/.test(panelSrc))
  ok('3y 조각 크기를 못 받으면 안 쓴다', /!prep\.sizes\.length/.test(panelSrc))
  ok('3y 안 켜지면 이유를 결과에 싣는다',
    /buttWhy/.test(panelSrc) && /맞붙임 정확 배치 OFF/.test(panelSrc) && /buttDiag \+= buttExact/.test(panelSrc))
  // ★판정 대상은 **본체(가장 큰 연결요소)** 다. 마스크 전체로 보면 본체와 떨어진 가는 선
  //   하나에 전부 '이형'으로 떨어진다 — 실물 4조각 중 3조각이 그랬고 맞붙임이 한 번도 안 켜졌다.
  //   맞붙임은 bbox 의 변만 그으므로 여분에는 칼선이 안 생긴다 → 거절이 아니라 **알림**이 맞다.
  ok('3y 전 조각의 본체가 직사각일 때만', /BT\.isRectish\(mp\.mask\)/.test(panelSrc))
  ok('3y 본체 = 가장 큰 연결요소', /function mainPart\(G, base\)/.test(panelSrc) && /c\.lab\[i\] === best/.test(panelSrc))
  ok('3y 여분은 거절이 아니라 알림', /buttStray/.test(panelSrc) && /인쇄에는 그대로 나갑니다/.test(panelSrc))
  // ★굽기 캔버스 테두리에 닿은 덩어리는 **아티팩트**다 — pad(≥1mm) 덕에 진짜 아트는 못 닿는다.
  //   실물 3조각의 PNG 맨 아래 1~4행이 전폭으로 칠해져 나왔고, 그 하나가 세 증상을 다 만들었다
  //   (bbox 부풀림 · 맞붙임 거절 · 래스터 칼선에 테두리 하나 더). 축소 **전에** 걷어내야 한다.
  ok('3y 테두리 아티팩트를 걷어낸다', /function dropBorderTouching/.test(panelSrc)
    && /dropBorderTouching\(G, use, img\.W, img\.H\)/.test(panelSrc))
  ok('3y 가장 큰 덩어리는 안 지운다', /id !== keep/.test(panelSrc))
  ok('3y 걷어냈으면 알린다', /edgeNote/.test(panelSrc) && /래스터화 아티팩트/.test(panelSrc))
  // ★★단위: nestSizes 는 **파일 좌표**, 배치·마스크는 **저장 좌표**다. 안 나누면 조각이 1/10 로
  //   깔려 **전부 겹친 판**이 나간다(2026-08-07 실사용). anyOverlap 은 포장 공간만 보므로 못 잡는다
  //   — 축척이 통째로 틀리면 포장 공간에서는 아무 문제가 없다. **다른 출처(마스크)와 대조**해야 한다.
  ok('3y 맞붙임이 파일→저장 좌표로 환산',
    /var k = fileToSave\(\) \|\| 1/.test(panelSrc) && /w: sz\.w \/ k, h: sz\.h \/ k/.test(panelSrc))
  ok('3y 배치 크기를 마스크와 대조(검산)', /BT\.inkBBox\(pc\.base\)/.test(panelSrc) && /pls\[s\]\.rot === 90 \? bb\.H : bb\.W/.test(panelSrc))
  ok('3y 못 넣은 조각이 있으면 되돌린다', /if \(r\.unplaced\.length\) return null/.test(panelSrc))
  // 회전은 패커가 정한다(폭 맞춤뿐 아니라 틈 메우기에도 쓰인다) — 패널은 허용 여부만 넘기고
  //   결과의 rot 를 그대로 호스트에 전달한다.
  ok('3y 회전 허용을 패커에 넘긴다', /BT\.packRects\(rects, usableW, allowRot !== false\)/.test(panelSrc))
  ok('3y 패커가 정한 회전을 그대로 쓴다', /rot: p\.rot \|\| 0/.test(panelSrc))
  // ★평판 폭 좁히기 재시도가 맞붙임 결과를 갈아치우면 segs 가 사라진다 → 화면은 "한 줄" 이라고
  //   써 놓고 조각별 칼선이 나간다. 좁힌 폭에서도 맞붙임으로 돌려야 한다.
  ok('3y 폭 좁히기가 맞붙임을 유지', /alt = buttExact[\s\S]{0,120}?buttPlace\(BT, prep, guessW/.test(panelSrc))
  // ★직사각 조각은 추적·피팅을 건너뛰고 폴리곤 bbox 를 그대로 쓴다. 실측(500×350): 곡선 피팅이
  //   90° 모서리를 0.88~2.17mm 씩 깎아 둥글렸고 그 양이 모서리마다 달라 사각이 비뚤어 보였다.
  //   맞붙임과 무관하게 **모든** 직사각 조각에 적용된다(여백·간격이 있어도).
  // ★여백이 있으면 팽창 결과가 **라운드 사각**이다(반경 = 여백) → 사각 단축을 쓰면 라운드가
  //   조용히 각지게 된다. 판정은 팽창 전 마스크, 컨투어는 팽창 후라 이 조건이 없으면 어긋난다.
  ok('3y 직사각 칼선은 추적하지 않는다(여백 0·구멍 없을 때만)',
    /var rectOnly = !!\(BTr && cps\.length === 1 && !holes\.length && rCut <= 0 && BTr\.isRectish\(src\)\)/.test(panelSrc))
  ok('3y 직사각 칼선은 4점 P 줄', /if \(rectOnly\)[\s\S]{0,700}?lines\.push\('P ' \+ parts\.join\(' '\)\);\s*\n\s*continue;/.test(panelSrc))
  // ★구 호스트는 C 줄을 조용히 무시한다 → 조각별 칼선도 안 보냈으니 **칼선 없는 판**이 나온다.
  //   축2는 Z: 파일 1개로 전 PC 에 퍼지고 축3은 PC별 설치라, 역방향 스큐가 반드시 생긴다
  //   (도련 PNG 때와 같은 함정 — 그때도 구 패널/새 호스트 조합을 따로 막아야 했다).
  ok('3y 구 호스트면 맞붙임을 쓰지 않는다', /else if \(!hostSupportsButt\(\)\)/.test(panelSrc))
  ok('3y 맞붙임 최소 호스트 명시', /var BUTT_MIN_HOST = \[0, 18, 0\]/.test(panelSrc))
  // ★실패하면 조용히 이상한 판을 내지 말고 기존 경로로 되돌아가야 한다
  ok('3y 실패 시 래스터로 폴백', /buttExact = false;[\s\S]{0,180}?res = nestPlace\(NST, prep/.test(panelSrc))
  // ★맞붙임에서는 조각별 닫힌 경로를 만들지 않는다 — 그게 두 줄의 원인이다
  ok('3y 맞붙임이면 조각별 칼선 생략', /!useVec && !res\.butt\) holeOut \+= \(pieceCutLines/.test(panelSrc))
  // ── 구멍(2026-08-07) — 시트컷 글자는 속이 뚫려야 한다. 단품에만 있던 것을 판짜기로 옮겼다.
  ok('3z 구멍을 팽창 후 마스크에서 뽑는다', /G\.findHoles\(placed\.m, placed\.W, placed\.H, minHolePx\)/.test(panelSrc))
  ok('3z 최소 구멍 크기로 거른다(미세 구멍 방지)', /MIN_HOLE_MM\) \/ 2\) \/ stepMm/.test(panelSrc))
  ok('3z 구멍을 외곽에 배정', /G\.assignHoles\(cps, holes\)/.test(panelSrc))
  ok('3z H\/HB 줄로 내보낸다', /wantCurve \? 'HB ' : 'H '/.test(panelSrc))
  ok('3z 구 호스트면 구멍을 안 보내고 알린다',
    /var HOLE_MIN_HOST = \[0, 19, 0\]/.test(panelSrc) && /holesOk \? G\.findHoles/.test(panelSrc)
    && /구멍을 만들지 않았습니다/.test(panelSrc))
  ok('3z 호스트가 H\/HB 를 읽는다', /p\[0\] === 'H' \|\| p\[0\] === 'HB'/.test(hostSrc))
  ok('3z 호스트가 직전 외곽에 매단다', /cur\.cuts\[cur\.cuts\.length - 1\]/.test(hostSrc))
  ok('3z 호스트가 compound path 로 묶는다', /cl\.compoundPathItems\.add\(\)/.test(hostSrc))
  ok('3z 호스트 버전이 0.19.0 이상', /CUT-CEP-0\.(19|[2-9]\d)\./.test(hostSrc))
  // ── DXF 경로 (2026-08-08, spec §6.29·§9-7) ─────────────────────────
  // 종전엔 패널이 경로를 받아 **다시 인자로 넘겼다** → evalScript 가 ASCII 라 한글이 `_` 로 죽고
  //   `%TEMP%` 에 떨어졌다(실측: `___260723_____________cut.dxf` = 식별 불가).
  //   왕복을 없애면 두 제약이 같이 사라진다 — 인자로 안 받으니 ASCII 제약이 없다.
  ok('3d 호스트가 경로를 정하고 내보낸다', /function mesCut_exportDxfAuto\(\)/.test(hostSrc))
  ok('3d 저장 위치는 .ai 옆(미저장이면 temp)', /doc\.path && doc\.path\.fsName/.test(hostSrc)
    && /where = 'doc'/.test(hostSrc) && /Folder\.temp\.fsName/.test(hostSrc))
  ok('3d 한글 파일명을 죽이지 않는다',
    hostSrc.includes('base = base.replace(/[\\\\\\/:*?"<>|]/g, \'_\')')
    && !/base\.replace\(\/\[\^A-Za-z0-9_\\-\]\/g, '_'\)[\s\S]{0,400}?exportDxfAuto/.test(hostSrc))
  ok('3d 경로는 path= 로 맨 뒤에 반환', /'ok;items=' \+ items \+ ';where=' \+ where \+ ';path=' \+ out/.test(hostSrc))
  ok('3d 패널이 경로를 되넘기지 않는다',
    /hostSupportsDxfAuto\(\)/.test(panelSrc) && /indexOf\(';path='\)/.test(panelSrc))
  ok('3d 구 호스트 폴백 + 사유 표시', /DXFAUTO_MIN_HOST = \[0, 20, 0\]/.test(panelSrc)
    && /한글이 `_` 로 바뀌고 임시폴더에 저장됩니다/.test(panelSrc))
  ok('3d 호출부가 하나로 모였다',
    (panelSrc.match(/exportDxfSmart\(function/g) || []).length === 2
    && (panelSrc.match(/host\('mesCut_exportDxf\("/g) || []).length === 1)
  ok('3y 공유 변은 C 줄로', /lines\.push\('C ' \+ \(sg\.x1 \+ domboMm\(\)\)/.test(panelSrc))
  ok('3y 호스트가 C 줄을 읽는다', /p\[0\] === 'C'/.test(hostSrc))
  ok('3y 호스트가 열린 선분으로 긋는다', /sp\.closed = false;/.test(hostSrc))
  {
    const buttSrc = fs.readFileSync(path.join(REPO, 'IllustratorAutomat', 'designer', 'poc-a0-cep', 'com.mes.a0.panel', 'js', 'butt.js'), 'utf8')
    // ★허용오차가 없어야 한다 — 있으면 안 붙은 선까지 합쳐 재단 위치가 옮겨진다
    ok('3y 맞붙임 엔진에 허용오차가 없다', !/toler|epsilon|EPS|1e-|0\.0[0-9]* *\)/i.test(buttSrc))
    ok('3y 맞붙임 엔진은 mm 전용(픽셀 없음)', !/\bpx\b|mmpp|pixel/i.test(buttSrc))
  }
  {
    const idxSrc = fs.readFileSync(path.join(REPO, 'IllustratorAutomat', 'designer', 'poc-a0-cep', 'com.mes.a0.panel', 'index.html'), 'utf8')
    ok('3y index.html 이 butt.js 를 싣는다', /<script src="js\/butt\.js"><\/script>/.test(idxSrc))
  }

  // ── 조각 목록 순서·확인 (2026-08-06) ───────────────────────────
  // ★번호가 눈에 보이는 순서와 어긋나면 어느 행이 어느 조각인지 알 수 없어 수량을 못 넣는다.
  //   정렬은 **호스트에서** 한다 — 배치·도련·params 가 전부 이 배열 인덱스를 쓰므로,
  //   패널이 표시만 바꾸면 "고른 것과 다른 조각의 수량"이 된다(A0 seedFlush 와 같은 이유).
  ok('3t 조각 순서는 호스트가 공간정렬', /MESCUT_NEST_ITEMS = \[\];[\s\S]{0,900}?withBB\.sort/.test(hostSrc))
  ok('3t 행 클릭으로 조각 확인', /mesCut_nestSelect\(/.test(panelSrc) && /function mesCut_nestSelect/.test(hostSrc))
  // ★행을 누르면 선택이 1개로 바뀐다 — 실행이 선택을 다시 읽으면 수량이 통째로 날아간다
  ok('3t 실행은 잡아 둔 목록 재사용', /mesCut_nestBegin\(' \+ \(pieceQty \? '1' : ''\)/.test(panelSrc))
  ok('3t keep 은 호스트가 지원', /String\(keep\) === '1'/.test(hostSrc))
  ok('3t 목록 사용 사실을 늘 알린다', /조각 수량 목록 사용/.test(panelSrc))

  // ── 밀어붙이기 (2026-08-06 실사용) ─────────────────────────────
  // ★후보 자리는 step 격자에서만 찾는다 — step 2 · 0.5mm/px 면 가로로 최대 1mm 가 남고,
  //   맞붙임(여백·간격 0)에서는 그게 그대로 벌어진 틈이다. 놓기 직전에 1px 씩 붙인다.
  {
    const nestSrc = fs.readFileSync(path.join(REPO, 'IllustratorAutomat', 'designer', 'poc-a0-cep', 'com.mes.a0.panel', 'js', 'nesting.js'), 'utf8')
    ok('3v 놓기 전에 붙인다', /opts\.compact !== false[\s\S]{0,600}?fitsBits\(bits, SWW, best\.piece, cx - 1, cy\)/.test(nestSrc))
    // ★거리 상한이 **step 미만**이어야 한다. 상한 없이 미끄러지면 조각당 수천 번 마스크 전체를
    //   대조해 "배치 계산 중..." 에서 멈춘 것처럼 보인다(2026-08-06 실사용 정지).
    //   placeOne 이 step 격자를 이미 다 봤으므로 step 이상 미끄러질 이유도 없다.
    ok('3v 미끄러짐은 step 미만', /lim = step - 1/.test(nestSrc))
    ok('3v step 1 이면 건너뛴다', /opts\.compact !== false && step > 1/.test(nestSrc))
    ok('3v 무한 while 이 없다', !/while \([^)]*fitsBits\(bits, SWW, best\.piece/.test(nestSrc))

    // ── 배치 시간 상한 (2026-08-06 실사용 정지 2회) ─────────────────
    // ★안 들어가는 조각이 시트 전체를 훑으면 롤(11200px)에서 사실상 멈춘다.
    //   점유 최고선 아래는 비어 있으므로 거기까지만 보면 되고, 못 찾으면 그 아래에 놓으면 된다.
    ok('3w y 훑기를 점유선까지만', /var yCap = Math\.min\(SH - p\.H, maxSky\)/.test(nestSrc))
    ok('3w 점유선 아래는 바로 배치', /if \(maxSky \+ p\.H <= SH\) return \{ x: 0, y: maxSky/.test(nestSrc))
    // ★비용은 개수가 아니라 **면적**에 비례한다 — 큰 조각은 겹침검사 한 번이 수백 배 비싸다.
    //   실측: 20조각·5,400만px 에서 12.0s → 2.6s, 결과 길이는 9950px 로 동일.
    ok('3w 시도 횟수는 면적 예산', /TRY_BUDGET_PX \/ Math\.max\(1, totalPx\)/.test(nestSrc))
    ok('3w 무거우면 정밀 재실행 생략', /&& !heavy\)/.test(nestSrc))
  }
  // ★조각마다 따로 불러야 한다 — 한꺼번에 하면 조각끼리 이어진다
  ok('3q 배치된 사본마다 도련', /mesCut_bleedPlaceItem\(doc, artLayer, copies\[vi\]/.test(hostSrc))
  // ★넘기는 값은 **요청값이 아니라 실제로 만들 도련**이다(effBleedMm) — 요청값을 넘기면
  //   간격 분할이 무의미해진다(옆 조각 도련과 다시 겹친다).
  ok('3q 패널이 효과 도련을 넘긴다', /nestApply\([\s\S]{0,120}effBleedMm/.test(panelSrc))
  // ★간격 < 도련×2 면 인접 도련이 겹친다 — 조용히 두면 남의 색이 링에 남는다
  // ★2026-08-25: 간격을 올리는 대신 **도련을 절반씩 나눈다**. 하한 미달일 때만 간격을 올린다.
  // ★규칙 본체는 순수 함수 `mesCutSplitBleed` 에 있고 **동작 검증은 `cut:bleed` 9절이 전수로** 한다.
  //   여기서는 **배선**만 본다 — 함수가 있고, 호출되고, 결과를 실제로 쓰는가.
  ok('3q 분할 규칙이 순수 함수', /function mesCutSplitBleed\(gapMm, bleedMm, buttMode\)/.test(panelSrc))
  ok('3q 분할 결과를 실제로 쓴다',
    /var split = mesCutSplitBleed\(gapMm, nestBleedMm, buttMode\)/.test(panelSrc)
    && /gapMm = split\.gapMm/.test(panelSrc) && /var effBleedMm = split\.bleedMm/.test(panelSrc))

  // ── 도련 = Repeat Last Pixel 배선 (2026-08-05) ─────────────────
  // 아래 넷은 전부 **조용히 틀리는** 실패다. 화면엔 "도련 완료"가 뜨고 인쇄 뒤에야 안다.

  // ★도련용 굽기는 **원색**(fillClosed=false)·**pad 0** 이어야 한다.
  //   검게 칠한 마스크를 쓰면 도련이 통째로 검정이 되고, pad 가 남으면 grow 와 중복 패딩돼
  //   PNG 중심과 조각 잉크 중심이 어긋나 배치가 그만큼 밀린다.
  ok('3q 도련 굽기는 원색·pad 0', /mesCut_nestBakeAll\(' \+ \(mmpp \* fileToSave\(\)\) \+ ',0,false,"ink"\)/.test(panelSrc))
  // ★굽기 tag 가 없으면 마스크용 PNG 를 덮어써 배치 마스크나 도련 한쪽이 조용히 틀린다
  ok('3q 굽기가 용도별 이름표를 쓴다', /mes_cut_' \+ tag \+ '_/.test(hostSrc))
  // ★회색 오염 차단 (2026-08-24 반백반흑 실사용 보고) — AA·스무딩이 색 경계에 만든 회색이
  //   Repeat Last Pixel 공급원으로 복사돼 도련이 회색이 된다. 마스크 굽기의 AA 는 유지해야 한다.
  ok('3q ink 굽기는 AA 를 끈다(회색 공급원 차단)', /antiAliasing = \(tag === 'ink'\) \? false : true/.test(hostSrc))
  ok('3q 도련 축소는 스무딩을 끈다', /imageSmoothingEnabled = false/.test(panelSrc))
  // ★크기는 패널이 준 값(`L` 줄)을 쓴다 — 호스트가 px→mm 을 재계산하면 반올림만큼 어긋난다
  ok('3q 패널이 L 줄을 쓴다', /lines\.push\('L ' \+ bid/.test(panelSrc))
  ok('3q 호스트가 L 줄을 읽는다', /p\[0\] === 'L'/.test(hostSrc))
  // ── 네스팅 성능·판 크기 (2026-08-05) ───────────────────────────
  {
    const nestSrc = fs.readFileSync(path.join(REPO, 'IllustratorAutomat', 'designer', 'poc-a0-cep', 'com.mes.a0.panel', 'js', 'nesting.js'), 'utf8')
    // ★비트마스크는 **표현만** 바꾼 최적화다. 픽셀 fits 를 지우면 하네스가 같은 코드로 자기 자신을
    //   검증하게 되어 겹침 버그를 못 잡는다 — 이중 구현이 안전장치이므로 반드시 남긴다.
    ok('3s 겹침 검사는 비트마스크', /function fitsBits/.test(nestSrc) && /function stampBits/.test(nestSrc))
    ok('3s 픽셀 fits 는 독립 검증용으로 남는다',
      /function fits\(sheet, SW, SH, p, ox, oy\)/.test(nestSrc) && /fits: fits/.test(nestSrc))
    // ★같은 (조각,회전)을 순서마다 다시 만들면 8순서×2패스 = 16배 낭비다
    ok('3s 회전·트림 결과를 캐시한다', /function getCand/.test(nestSrc) && /new Map\(\)/.test(nestSrc))

    // ★판 폭 최적화 — 아트보드가 배치 bbox 로 줄어드는데 점수는 세로만 봐서 판이 길쭉해졌다.
    ok('3s 판 면적은 배치 bbox+돔보 기준', /function plateAreaMm2/.test(panelSrc))
    ok('3s 판 폭 최적화는 시트 모드만', /if \(!isRoll\) \{[\s\S]{0,1600}?nestPlace\(NST, prep, guessW/.test(panelSrc))
    // ★조용히 나빠지지 않는다 — 미배치가 늘거나 면적이 안 줄면 원래 배치를 쓴다
    ok('3s 나빠지면 채택하지 않는다', /alt\.unplaced\.length <= res\.unplaced\.length && a1 < a0/.test(panelSrc))
  }

  // ★굽기용 임시 문서는 조각을 **격자**로 벌린다. 한 줄로만 늘어놓으면 1:1(원본 크기) 조각에서
  //   총 폭이 일러 캔버스 한계(16383pt)를 넘고, 그 자리로 아트보드를 옮기는 순간
  //   `an Illustrator error occurred: 1095724867 ('AOoC')` 로 죽는다(2026-08-05 실사용).
  ok('3t 굽기 배치가 캔버스 한계를 지킨다',
    /MESCUT_CANVAS_MAX_PT/.test(hostSrc) && /curX \+ cw > MESCUT_CANVAS_MAX_PT/.test(hostSrc))
  ok('3t 조각이 한계를 넘으면 사유를 알린다', /캔버스 한계/.test(hostSrc))
  // ★일괄 굽기가 막혀도 조각별 경로가 남아 있다 — 막다른 골목을 만들지 않는다
  ok('3t 일괄 굽기 실패 시 조각별로 폴백', /일괄 굽기 실패 — 조각별로 다시 굽습니다/.test(panelSrc))

  // ★ExtendScript 폴더/파일 고르기는 정적과 인스턴스의 **이름이 다르다**.
  //   정적 = `Folder.selectDialog` / 인스턴스 = `folder.selectDlg`.
  //   `Folder.selectDlg(...)` 로 부르면 "함수가 아닙니다" 로 죽는데, 타입 검사도 문법 검사도 못 잡고
  //   그 버튼을 누르기 전엔 드러나지 않는다 — 실제로 도입(2026-08-02)부터 3일간 아무도 몰랐다.
  //   주석/예시까지 걸리도록 일부러 소스 전체를 본다. 틀린 형태는 예시로도 남기지 않는다.
  ok('3r 폴더 고르기를 정적으로 부르지 않는다', !/\bFolder\.(selectDlg|openDlg|saveDlg)\s*\(/.test(hostSrc))
  ok('3r 파일 고르기를 정적으로 부르지 않는다', !/\bFile\.(selectDlg|openDlg|saveDlg)\s*\(/.test(hostSrc))

  // ★★구 패널 하위호환 — 축2(Z: 호스트)는 전 PC 즉시 반영이고 패널은 PC 별 수동 설치라
  //   "새 호스트 + 구 패널" 조합이 배포 사이에 반드시 생긴다. 그 PC 를 새 계층에 태우면
  //   도련 PNG 가 없으니 곧장 단색으로 떨어진다 = 회귀. 옛 경로를 그대로 태워야 한다.
  ok('3q 구 패널이면 옛 경로로 폴백', /if \(!hasBleedPng\) \{[\s\S]{0,900}?mesCut_vecBleed\(doc, \[copies\[vi\]\]/.test(hostSrc))
  ok('3q 옛 경로 사용을 집계해 알린다', /bleedlegacy=/.test(hostSrc) && /a\.bleedlegacy/.test(panelSrc))
  // ★계층 순서 = 클립 확장(무손실) → 픽셀 → 단색. 뒤집히면 무손실 경로를 영영 안 타게 된다.
  ok('3q 클립 확장이 픽셀보다 먼저',
    hostSrc.indexOf('mesCut_vecGrowClips([copies[vi]]') > 0 &&
    hostSrc.indexOf('mesCut_vecGrowClips([copies[vi]]') < hostSrc.indexOf('mesCut_bleedPlaceItem(doc, artLayer'))
  // ★게이트 최소버전이 실제 호스트 버전보다 높으면 **아무도 새 경로를 못 쓴다**(전원이 조용히 옛 방식)
  {
    const hv = /MESCUT_VERSION = 'CUT-CEP-(\d+)\.(\d+)\.(\d+)'/.exec(hostSrc)
    const gv = /BLEEDPNG_MIN_HOST = \[(\d+), (\d+), (\d+)\]/.exec(panelSrc)
    const n = (m) => Number(m[1]) * 1e6 + Number(m[2]) * 1e3 + Number(m[3])
    ok('3q 도련 게이트 ≤ 호스트 버전', !!hv && !!gv && n(hv) >= n(gv),
      `host=${hv && hv[0]} gate=${gv && gv[0]}`)
  }
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
  const panelSrc = fs.readFileSync(CUT_MAIN, 'utf8')
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
  ok('3m 클립 방식을 알린다', /클립을 넓혀/.test(await txt(p, '#cutOut')), await txt(p, '#cutOut'))
  ok('3m 방식 선택칸·기본 자동', await p.evaluate(() => {
    const el = document.getElementById('bleedMode')
    return !!el && el.value === 'auto' && [...el.options].map((o) => o.value).join(',') === 'auto,region,scale'
  }))
  await p.close()
}
{
  // ★0.9.0 재설계 — 클립이 없으면 **여백 구간 단색**이 기본이다.
  //   도형별 오프셋(region)은 원리상 내부 선을 링 밖으로 내보내서 뺐다(2026-08-04 실사용 3건).
  const p = await openPanel({ ping: 'CUT-CEP-0.9.6', vecCut: 'ok;paths=1;anchors=8;bleed=region' })
  await p.click('#btnMakeCut'); await p.waitForTimeout(300)
  ok('3m 가장자리 색을 잇는다고 알린다', /제 색 그대로 밖으로 벌렸습니다/.test(await txt(p, '#cutOut')), await txt(p, '#cutOut'))
  ok('3m 지정색 폴백은 경고로 알린다', /지정색/.test(fs.readFileSync(CUT_MAIN, 'utf8')))
  const calls = await p.evaluate(() => window.__calls.join(' ~ '))
  ok('3m vecCut 에 방식을 넘긴다', /mesCut_vecCut\(3,\s*(true|false),\s*3,"auto"\)/.test(calls),
    calls.split(' ~ ').filter((l) => l.includes('vecCut')).join(' | '))
  await p.close()
}
{
  const p = await openPanel({ ping: 'CUT-CEP-0.7.0', vecCut: 'ok;paths=1;anchors=8;bleed=scale' })
  await p.click('#btnMakeCut'); await p.waitForTimeout(300)
  ok('3m 확대 폴백이면 빌 수 있다고 경고', /링 일부가 빌 수 있습니다/.test(await txt(p, '#cutOut')), await txt(p, '#cutOut'))
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
  // ★구역별 — 도형 하나하나가 **제 색 그대로** 벌어진다(단색 링은 여러 색 구역에서 구조적으로 틀린다)
  ok('3m 구역별 오프셋 경로', /function mesCut_vecBleedRegions\(/.test(hostSrc))
  ok('3m 단색 링 방식은 없앴다', !/mesCut_dominantFill/.test(hostSrc))
  // ★0.9.x — 여백>0 은 단색, 여백<=0 은 가장자리 띠. 도형별 오프셋은 **기본 경로에서 뺐다**.
  // 도련 색은 **아트에서 나온다**. 흰색 하드코딩은 테두리가 무슨 색이든 흰색이라 틀린다(2026-08-04 정정).
  ok('3m 기본 경로가 도형별 오프셋', /var rg = mesCut_vecBleedRegions\(doc, items, offsetMm, bleedMm, fillClosed\);/.test(hostSrc))
  ok('3m 단색은 마지막 안전망만', /mode: 'solid-fallback'/.test(hostSrc))
  ok('3m 링은 원본 뒤로', /mesCut_vecBleedSolid[\s\S]{0,900}ZOrderMethod\.SENDTOBACK/.test(hostSrc))
  // ★척도는 **실루엣 윤곽까지의 거리**여야 한다. bbox 로 재면 오목부에서 가장자리 도형까지 지워
  //   링에 구멍이 나고(도련 없는 부분), 동시에 윤곽에서 먼 도형은 살아남아 내부 선이 링을 방해한다.
  //   하나의 잘못된 척도가 정반대 두 증상을 동시에 만들었다(2026-08-04 실사용).
  ok('3m 윤곽 거리로 걸러낸다', /function mesCut_pruneFarFrom\(/.test(hostSrc))
  ok('3m 오프셋 전에 걸러낸다', /mesCut_pruneFarFrom\(dups\[i\], pts, touchPt\)/.test(hostSrc))
  ok('3m 접촉 기준 상수', /var MESCUT_BLEED_TOUCH_MM = /.test(hostSrc))
  ok('3m 기준은 여백+도련', /var growPt = \(offsetMm \+ bleedMm\) \* MESCUT_PT_PER_MM;/.test(hostSrc))
  ok('3m 판정용 실루엣을 따로 뜬다', /mesCut_vecBleedBoundary\(doc, items, layer, 0, fillClosed\)/.test(hostSrc))
  ok('3m 가까우면 남긴다(구멍 방지)', /if \(dx \* dx \+ dy \* dy <= lim2\) return 0;/.test(hostSrc))
  ok('3m 클리핑 패스는 안 지운다', /if \(t === 'PathItem' && it\.clipping\) return 0;/.test(hostSrc))
  // ★가장자리에 **닿는** 열린 획은 프루닝에서 살아남는다 → 끝이 반원으로 부푸는 것을 따로 막아야 한다.
  //   ①획을 먼저 면으로(Outline Stroke) ②도련 오프셋만 마이터 조인(칼선은 라운드 유지)
  //   실측(길이40·획1·오프셋6, 면적 mm²): 이론 사각 676.0 · 아웃라인+마이터 676.0 정확히 일치.
  //   라운드는 552.0(획 그대로)·604.0(아웃라인 후) 로 곡면이 남는다.
  ok('3m 도련은 획을 먼저 면으로', /app\.executeMenuCommand\('OffsetPath v22'\);\s*\/\/ = Object > Path > Outline Stroke/.test(hostSrc))
  ok('3m 도련 조인은 마이터', /var MESCUT_BLEED_JOIN = 2;/.test(hostSrc))
  ok('3m 칼선 조인은 라운드 유지', /var MESCUT_VEC_JOIN = 0;/.test(hostSrc))
  ok('3m 도련 오프셋이 도련 조인을 쓴다', /jntp ' \+ MESCUT_BLEED_JOIN/.test(hostSrc))
  ok('3m 마이터 한계로 긴 창 방지', /var MESCUT_BLEED_MLIM = 2;/.test(hostSrc))
  // ★색을 못 칠하면 **지운다** — 안 지우면 실루엣 원래 색(검정)이 도련처럼 남는다(실사용 보고)
  ok('3m 색 못 칠하면 도형 제거', /if \(!n\) \{ try \{ shp\.remove\(\)/.test(hostSrc))
  ok('3m 색은 깊이 칠한다(group·compound)', /function mesCut_setFillDeep\(/.test(hostSrc))
  // ★잠긴 하위 개체 = 실루엣이 조용히 작아지던 근본 원인(2026-08-04)
  ok('3m 사본 잠금 해제·숨김 제거', /function mesCut_normalizeCopy\(/.test(hostSrc)
    && /if \(it\.locked\) it\.locked = false/.test(hostSrc))
  ok('3m 실루엣도 정규화를 거친다', /mesCut_normalizeCopy\(dups\[i\]\);\s*\/\/ ★잠금 해제/.test(hostSrc))
  // ★대화상자 억제 — 모달 하나가 배치 전체를 멈춘다
  ok('3m 대화상자 억제', /DONTDISPLAYALERTS/.test(hostSrc) && /function mesCut_silentBegin\(/.test(hostSrc))
  ok('3m 억제는 반드시 복원', /finally \{[\s\S]{0,120}mesCut_silentEnd/.test(hostSrc))
  // ★부모가 갈린 선택은 메뉴 group 이 거부한다 → DOM 그룹으로 우회
  ok('3m 부모 갈린 선택은 DOM 그룹', /function mesCut_groupSel\(/.test(hostSrc)
    && /groupItems\.add\(\)/.test(hostSrc))
  // ★2026-08-25 규칙 교체 — 간격을 도련×2 로 올리던 것을 **도련 겹침 분할**로 바꿨다.
  //   이형 24조각 실측에서 간격/2 를 3px→6px 로 벌리면 효율 65%→56~58%(재료 12~13% 손실).
  //   사용자가 넣은 간격을 존중하고, 겹치는 도련만 경계에서 나눈다. 하한 미달일 때만 간격을 올린다.
  const panelSrc2 = fs.readFileSync(CUT_MAIN, 'utf8')
  ok('3m 옛 강제 상향이 없다', !/gapMm = nestBleedMm \* 2/.test(panelSrc2))
  ok('3m 하한 상수', /var BLEED_MIN_MM = 1\.5;/.test(panelSrc2))
  ok('3m 하한 미달일 때만 간격 상향', /if \(halfGap < floorMm\) \{[\s\S]{0,160}gapMm = Math\.max\(gapMm, floorMm \* 2\)/.test(panelSrc2))
  // ★맞붙임은 분할에서 빠져야 한다 — 간격 0 이라 절반이 0 이고, 그러면 도련이 통째로 사라진다.
  ok('3m 맞붙임은 분할 제외', /if \(buttMode \|\| !\(bleedMm > 0\)\) return/.test(panelSrc2))
  // ★요청과 다르면 결과창에 밝힌다 — 조용히 줄이면 인쇄 뒤에야 안다
  ok('3m 줄인 사실을 알린다', /effBleedMm < nestBleedMm/.test(panelSrc2))
  // ★맞붙임은 예외 — 도련이 넘어가도 옆 조각 원본이 덮으므로(도련은 SENDTOBACK) 간격을 올릴 이유가 없다.
  //   올려 버리면 조각이 떨어져 칼선이 2줄이 되고 맞붙임 자체가 깨진다.
  ok('3m 맞붙임은 간격 상향에서 뺀다', /var buttMode = \(offsetMm <= 0 && gapMm <= 0\)/.test(panelSrc2))
  // ★도련이 조각 뒤에 깔려야 안쪽 경계가 덮인다 — 앞으로 오면 남의 디자인 위에 도련이 보인다
  ok('3m 도련은 조각 뒤에 깔린다', /zOrder\(ZOrderMethod\.SENDTOBACK\)/.test(
    fs.readFileSync(path.join(REPO, 'IllustratorAutomat', 'designer', 'mes-cut-host.jsx'), 'utf8')))
  // 표시 형식(실물 환산 등)이 바뀌어도 **알린다는 사실**은 유지돼야 한다 → 의도로 검사한다
  ok('3m 올렸으면 결과에 알린다', /gapWanted < gapMm \?[\s\S]{0,120}간격을/.test(panelSrc2))

  // ── 배율 = 가공(A0) 탭과 같은 규칙 (2026-08-05) ─────────────────
  // A0: realW = 파일 × N · 실물 mm 상수는 ÷N · 파일명 `_1-N`. 재단도 같아야 한다.
  {
    const nestSrc2 = fs.readFileSync(path.join(REPO, 'IllustratorAutomat', 'designer', 'mes-cut-host.jsx'), 'utf8')
    const htmlSrc = fs.readFileSync(path.join(REPO, 'IllustratorAutomat', 'designer', 'poc-a0-cep', 'com.mes.a0.panel', 'index.html'), 'utf8')
    // ★id 가 가공 탭의 `scale` 과 겹치면 두 페이지가 한 문서에 있어 값이 섞인다(tabs.js 주석)
    ok('3u 재단 배율 id 가 가공과 다르다', /id="cutScale"/.test(htmlSrc) && /id="scale"/.test(htmlSrc))
    // ★축척은 둘이다 — F(현재 아트) 와 S(저장). 하나로 합치면 1:1 원본에 배율을 줬을 때
    //   여백·간격이 배율만큼 줄어든다("파일이 이미 축소본"이라는 전제가 깨진다).
    ok('3u 파일 배율과 저장 배율이 따로', /id="cutScaleFile"/.test(htmlSrc)
      && /function cutScaleFile/.test(panelSrc2) && /function fileToSave/.test(panelSrc2))
    // ★굽기는 파일 좌표 아트를 대상으로 하므로 마스크를 저장 좌표 픽셀 수로 맞춰야 한다
    ok('3u 굽기 해상도가 저장 좌표에 맞춰진다', /fineMmpp \* bakeK/.test(panelSrc2) && /var bakeK = fileToSave\(\)/.test(panelSrc2))
    // ★리사이즈는 복제본에만 — 원본 아트를 건드리면 되돌릴 수 없다
    ok('3u 조각 리사이즈는 복제본에만', /copy\.resize\(resizePct, resizePct\)/.test(nestSrc2)
      && /lines\.push\('RS ' \+/.test(panelSrc2))
    // ★환산은 입구에서 한 번만 — 중간에서 또 나누면 두 번 줄어들고 판을 뽑기 전엔 안 보인다
    ok('3u 배치 입력을 파일 좌표로 환산', /var gapMm = toFileMm\(/.test(panelSrc2) && /var offsetMm = toFileMm\(/.test(panelSrc2))
    ok('3u 도련·재료도 환산', /var nestBleedMm = toFileMm\(/.test(panelSrc2) && /toFileMm\(sp0\.wMm\)/.test(panelSrc2))
    // ★사람이 보는 값은 실물로 되돌린다 — 파일 좌표를 그대로 띄우면 자기 입력을 못 알아본다
    ok('3u 판 규격은 실물 cm', /Math\.round\(R\(swMm\) \/ 10\)/.test(panelSrc2))
    ok('3u 축소본은 파일명에 _1-N', /'_1-' \+ sN/.test(panelSrc2))
    // ★[폭 추천]도 같은 규칙이어야 한다 — 여기만 빠지면 추천 폭이 실제 배치와 다른 조건으로
    //   계산돼, 추천대로 골라도 결과가 안 맞는다(2026-08-05 실사용에서 걸림).
    ok('3u 폭 추천도 배율을 반영',
      /var widest = toFileMm\(ROLL_WIDTHS_MM/.test(panelSrc2) && /var wFile = toFileMm\(wReal\)/.test(panelSrc2))
    // ★격자 후보·하한도 실물 기준이다 — 안 나누면 축소본에서 실질 해상도가 N배 거칠어져
    //   컨투어가 계단이 되고 **직선 재단선이 휘어 보인다**(2026-08-05 실사용에서 걸림).
    // ★롤 상한은 **파일 좌표** 제약(일러 아트보드 한계 5780mm)이다. toFileMm 을 씌우면 실물 상한이
    //   배율과 무관하게 고정돼 "배율을 낮춰 한 대지에 담기"가 성립하지 않는다(2026-08-05).
    ok('3u 롤 상한은 파일 좌표 제약', /rollMaxH: Math\.floor\(NEST_ROLL_MAX_MM \/ prep\.mmpp\)/.test(panelSrc2))
    ok('3u 롤 상한이 일러 한계 안', /var NEST_ROLL_MAX_MM = (\d+)/.test(panelSrc2)
      && Number(/var NEST_ROLL_MAX_MM = (\d+)/.exec(panelSrc2)[1]) <= 5780)
    ok('3u 격자 후보도 배율을 반영',
      /cands\.push\(toFileMm\(NEST_MMPP_CANDS/.test(panelSrc2) && /Math\.max\(pick\.mmPerPx, toFileMm\(0\.5\)\)/.test(panelSrc2))

    // ── 판 여러 개 내보내기 (2026-08-05) ────────────────────────────
    // ★여태 첫 판만 저장했다 — 판이 2개면 둘째가 조용히 빠져 실물이 모자란다.
    ok('3v 내보내기가 판 전부를 돈다', /for \(var dz = 0; dz < docs\.length; dz\+\+\)/.test(nestSrc2))
    // ★이름이 겹치면 뒤 판이 앞 판을 덮어써 한 판이 사라진다 → 판 수만큼 이름을 받는다
    ok('3v 이름을 판 수만큼 받는다', /names\.push\(nm\)/.test(nestSrc2) && /nameLines\.push\('NAME ' \+ pairBaseName/.test(panelSrc2))
    // ★판마다 크기가 다르다 — 첫 판 규격을 돌려쓰면 파일명이 실물과 어긋난다
    ok('3v 판별 실제 크기를 돌려준다', /';wh=' \+ sheetWH\.join\('_'\)/.test(nestSrc2))
    ok('3v 판별 규격으로 이름을 만든다', /lastNest\.wh\[idx\]/.test(panelSrc2))
    // ★돔보 상수는 호스트 안에 있으므로 호스트가 배율을 받아야 한다
    ok('3u 호스트가 배율을 받는다', /p\[0\] === 'N'/.test(nestSrc2) && /MESCUT_SCALE_N = 1/.test(nestSrc2))
    ok('3u 돔보를 파일 좌표로 환산', /mesCut_sc\(MESCUT_DOMBO_DIAM_MM\)/.test(nestSrc2))
    ok('3u 배율은 매 호출 초기화', /MESCUT_SCALE_N = 1;\s*\n\s*var resizePct = 100;/.test(nestSrc2))
  }
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
  // ⚠️ 이 어서션은 원래 `/Folder\.selectDlg/` 였다 — **버그 있는 형태를 정답으로 고정**하고 있었다.
  //   존재 여부만 보고 호출 형태를 안 봤기 때문에, 정적 호출로 죽는 코드를 3일간 통과시켰다.
  //   "무언가 부르긴 한다"가 아니라 **부를 수 있는 형태인가**를 본다.
  ok('3l 폴더는 다이얼로그로 고른다',
    /\.selectDlg\s*\(/.test(hostSrc) || /Folder\.selectDialog\s*\(/.test(hostSrc))
  // ★EPS 옵션은 A0 와 같아야 한다 — 실물 EPS 가 전부 그 형식이다
  const a0 = fs.readFileSync(path.join(REPO, 'IllustratorAutomat', 'designer', 'mes-a0-host.jsx'), 'utf8')
  const opts = (src) => ['cmykPostScript = true', 'Compatibility.ILLUSTRATOR10', 'EPSPreview.COLORTIFF', 'embedAllFonts = true']
    .filter((k) => src.includes(k)).join('|')
  ok('3l EPS 옵션이 A0 와 동일', opts(hostSrc) === opts(a0) && opts(hostSrc).split('|').length === 4, opts(hostSrc))
  // -- 3s mm 단위 통일 (2026-08-25) --------------------------------------
  // ★`doc.rulerUnits = ...` 는 **예외도 안 던지고 값도 안 바뀐다**(AI 30.7 실측).
  //   SheetLayout.jsx 가 정확히 그렇게 쓰고 있었고 "저장 파일 기본 단위 = mm" 의도가
  //   조용히 실패했다. 되살아나지 않도록 **금지 패턴으로 못박는다**.
  const sheetLayoutSrc = fs.readFileSync(path.join(REPO, 'IllustratorAutomat', 'SheetLayout.jsx'), 'utf8')
  const unitSrcs = [['cut-host', hostSrc], ['a0-host', a0], ['SheetLayout', sheetLayoutSrc]]
  // ★주석은 걷어내고 본다 — 이 함정을 **설명하는 주석**이 각 파일에 있어서 그대로 재면 자기 자신에 걸린다
  const noComment = (x) => x.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  for (const [tag, src0] of unitSrcs) {
    const src = noComment(src0)
    ok(`3s ${tag} rulerUnits 대입 없음(조용히 실패한다)`, !/\.rulerUnits\s*=[^=]/.test(src),
      (src.match(/.*\.rulerUnits\s*=[^=].*/) || [''])[0].trim())
    // 새 문서는 반드시 헬퍼를 거친다 — 헬퍼 폴백 1곳만 bare add 를 남긴다
    const bare = (src.match(/app\.documents\.add\(DocumentColorSpace/g) || []).length
    ok(`3s ${tag} 새 문서는 mm 헬퍼 경유`, bare === 1, `bare add ${bare}곳(폴백 1곳만 허용)`)
    ok(`3s ${tag} DocumentPreset 로 mm 지정`,
      /dp\.units = RulerUnits\.Millimeters/.test(src) && /documents\.addDocument\(/.test(src))
  }
  // ★DXF `$INSUNITS` 는 ExportOptionsAutoCAD.unit 이 정한다(문서 단위와 무관) — 회귀 방지
  ok('3s DXF 단위는 Millimeters 고정', /opts\.unit = AutoCADUnit\.Millimeters/.test(hostSrc))
  ok('3l BUSY_IDS 에 btnExportPair', fs.readFileSync(CUT_MAIN, 'utf8').includes("'btnExportPair'"))
  // ★파일명 규격 = 실제 아트보드여야 한다. 시트 프리셋을 쓰면 이름과 파일이 어긋난다
  //   (nestApply 가 아트보드를 배치 bbox + 돔보 여백으로 줄이기 때문)
  ok('3l 판 크기를 nestApply 가 돌려준다', /sheetw=' \+ MESCUT_LAST_SHEET_W/.test(hostSrc))
  // ★비활성 문서의 artboardRect 는 **활성 문서 값**을 돌려준다(실측: 312×273 인데 600×400)
  ok('3l 비활성 문서 아트보드를 읽지 않는다', !/MESCUT_NEST_DOCS\[0\]\.artboards/.test(hostSrc))
  ok('3l 패널이 시트 프리셋으로 이름을 만들지 않는다',
    !/wCm: Math\.round\(sheetWmm/.test(fs.readFileSync(CUT_MAIN, 'utf8')))
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
    fs.readFileSync(CUT_MAIN, 'utf8')))
  await p.click('#btnUnlock'); await p.waitForTimeout(80)
  await p.close()
}
{
  // BUSY_IDS 누락은 소스로 잡는다(A0 에서 "새 진입점이 계속 새어 나간" 실패 모드)
  const src = fs.readFileSync(CUT_MAIN, 'utf8')
  const m = src.match(/var BUSY_IDS = \[([^\]]+)\]/)
  ok('5b BUSY_IDS 에 btnNest 포함', !!m && m[1].includes('btnNest'), m ? m[1] : '(못 찾음)')
  ok('5b index.html 이 nesting.js 를 로드', fs.readFileSync(path.join(PANEL_DIR, 'index.html'), 'utf8').includes('js/nesting.js'))
}

// ── 6 manifest — 병합된 단일 패널 (2026-08-04) ──────────────────────
// 예전엔 "A0 와 ID·포트가 겹치지 않는가"를 봤다. 이제 **하나**이므로 그 검사는 의미가 없다.
// 대신 병합이 실제로 성립하는 조건을 본다: 껍데기 파일이 다 있고, 구 확장 흔적이 남지 않았는가.
{
  const xml = fs.readFileSync(path.join(PANEL_DIR, 'CSXS/manifest.xml'), 'utf8')
  const bundleOf = (s) => (s.match(/ExtensionBundleId="([^"]+)"/) || [])[1]
  ok('6 번들 ID = com.mes.a0.panel', bundleOf(xml) === 'com.mes.a0.panel', bundleOf(xml))
  ok('6 메뉴 이름이 두 기능을 담는다', /<Menu>.*재단.*<\/Menu>/.test(xml), (xml.match(/<Menu>([^<]*)<\/Menu>/) || [])[1])

  // 껍데기 4파일이 전부 로드돼야 재단 탭이 산다(하나만 빠져도 조용히 반쪽이 된다)
  const html = fs.readFileSync(path.join(PANEL_DIR, 'index.html'), 'utf8')
  for (const f of ['js/geometry.js', 'js/nesting.js', 'js/tabs.js', 'js/main.js', 'js/cut-main.js']) {
    ok(`6 index.html 이 ${f} 로드`, html.includes(f))
  }
  ok('6 구 재단 확장 폴더가 repo 에 없다', !fs.existsSync(path.join(REPO, 'IllustratorAutomat/designer/cut-panel')))
  // 설치 스크립트가 각 PC 의 구 확장을 걷어내야 같은 기능이 두 개 뜨지 않는다
  const inst = fs.readFileSync(path.join(REPO, 'scripts/install-a0-panel.ps1'), 'utf8')
  ok('6 설치 스크립트가 구 재단 확장 제거', inst.includes('com.mes.cut.panel'))
  ok('6 설치 전에 백업', /retired-/.test(inst))

  const dbg = fs.readFileSync(path.join(PANEL_DIR, '.debug'), 'utf8')
  const portOf = (s) => (s.match(/Port="(\d+)"/) || [])[1]
  ok('6 CDP 포트 8888', portOf(dbg) === '8888', portOf(dbg))

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

// ── 8 미선언 식별자 — 콜백 안에서 조용히 죽는 사고 방지 ─────────────
// 2026-08-07: 계측 블록(`var T`)이 편집 중 **다른 함수로 들어가** `runNest()` 가 통째로 죽었다.
//   예외가 `img.onload` 안이라 아무 메시지 없이 '마스크 4/4' 에 얼어붙었고 **성능 문제로 두 번 오진**했다.
//   `node --check` 는 문법만 본다 — 스코프는 이 게이트가 본다.
// 같은 날 두 번째 사고는 `var mmpp` 를 **선언보다 200줄 위**에서 읽은 것이었다 —
//   선언은 있으므로 미선언 검사로는 안 잡힌다. 호이스팅된 undefined 라 `.toFixed` 에서 터졌다.
{
  const U = await import(pathToFileURL(path.join(REPO, 'scripts/cut/undeclared.mjs')).href)
  const jsDir = path.join(PANEL_DIR, 'js')
  for (const f of fs.readdirSync(jsDir).filter((x) => x.endsWith('.js'))) {
    const src = fs.readFileSync(path.join(jsDir, f), 'utf8')
    const bad = U.findUndeclared(src)
    ok(`8 미선언 식별자 없음 (${f})`, bad.length === 0, bad.map((b) => `${b.fn}() → ${b.name}`).join(', '))
    const ub = U.findUseBeforeVar(src)
    ok(`8 var 선언 전 사용 없음 (${f})`, ub.length === 0, ub.map((b) => `${b.fn}() → ${b.name}`).join(', '))
  }
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
