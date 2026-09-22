// A0 패널 리모델 헤드리스 스모크 — Chromium + CSInterface/cep.fs 스텁으로 실제 DOM 동작 검증.
// 일러 없이 잡을 수 있는 것: 초기화 예외 · 탭=용도 파생 · 후가공 초기화 · 분리→목록→등록 게이트 · 1덩어리 경고.
import { chromium } from 'playwright'
import fs from 'fs'
import path from 'path'
import { pathToFileURL, fileURLToPath } from 'url'
import stubScope from './lib/stub-scope.cjs'

// 패널 레지스트리 — 패널은 여러 개다(A0 + 재단). 경로 하드코딩이던 동안은 이 PC 밖에서 깨졌고,
// 새 패널은 아예 스모크 사각지대였다(spec 2026-07-31-cut-file-panel §5.2-③).
//   node scripts/panel-smoke.mjs [--panel=a0|cut]
// ⚠️ 이 파일의 검증 항목은 **A0 전용**이다(탭·후가공·큐·연동). 재단 패널은 자체 스위트를 갖는다.
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PANEL_DIRS = {
  a0: path.join(REPO, 'IllustratorAutomat', 'designer', 'poc-a0-cep', 'com.mes.a0.panel'),

}
const PANEL_ID = (process.argv.find((a) => a.startsWith('--panel=')) || '--panel=a0').split('=')[1]
if (!PANEL_DIRS[PANEL_ID]) { console.error(`알 수 없는 패널: ${PANEL_ID} (가능: ${Object.keys(PANEL_DIRS).join(', ')})`); process.exit(2) }
if (!fs.existsSync(PANEL_DIRS[PANEL_ID])) { console.error(`패널 폴더 없음: ${PANEL_DIRS[PANEL_ID]}`); process.exit(2) }
const PANEL = path.join(PANEL_DIRS[PANEL_ID], 'index.html')
const results = []
const ok = (n, c, extra = '') => results.push({ n, c, extra })

// 실제 config.json 스키마: methods[].method_group 로 가공자 도메인 필터가 걸린다(기본 'output').
//   ⚠️ clients 의 이름 필드는 `client_name` 이다(Z: 실물 config 실측 2026-07-30). 스텁이 `name` 이던
//      동안은 clientIdOf() 가 절대 일치하지 않아 거래처 id 해소 경로가 검증 사각이었다.
//   workers 에 매핑 없는 계정을 하나 섞어 둔다 — 가공자 목록이 도메인 매핑으로 걸러지는지 본다
//      (실제 prod config 에도 '123'·'디자이너' 같은 DESIGNER 롤 계정이 섞여 있다).
const CONFIG = JSON.stringify({
  methods: [
    { name: '접어미싱', margin_cm: 4, method_group: 'output' },
    { name: '열재단', margin_cm: 0, method_group: 'output' },
    { name: '쌍침', margin_cm: 0, method_group: 'transfer' },
  ],
  presets: [{ name: '양옆 접어미싱', method_group: 'output', config: JSON.stringify({ left: '접어미싱', right: '접어미싱' }) }],
  clients: [{ id: 1946, client_name: '테스트거래처' }],
  workers: [{ id: 14, name: '인호동' }, { id: 13, name: '123' }],
  worker_domains: [{ worker_name: '인호동', domain: 'output' }],
})
// 매핑이 0건인 상태(= 현재 prod) — 명단은 전량 폴백 + '도메인 미지정' 경고가 떠야 한다.
const CONFIG_NOMAP = JSON.stringify({
  methods: [{ name: '접어미싱', margin_cm: 4, method_group: 'output' }, { name: '쌍침', margin_cm: 0, method_group: 'transfer' }],
  presets: [], clients: [], workers: [{ id: 14, name: '인호동' }, { id: 13, name: '123' }], worker_domains: [],
})

// 호스트 응답 스텁. splitCount 를 바꿔 1덩어리/다조각을 모두 재현한다.
//   ⚠️ CSInterface 를 갈아끼우면 안 된다 — 패널이 자체 shim(js/CSInterface.js)을 나중에 로드해
//   덮어쓴다. shim 이 실제로 보는 `window.__adobe_cep__` 를 심어야 실제 경로가 그대로 검증된다.
const mkStub = (cfg) => `
window.__calls = [];
window.__splitCount = 3;
window.__failProcess = false;
window.__lockBusy = false;   // true = 재단 패널이 일러를 점유 중인 상황 재현
window.__processDelay = 0;   // 느린 호스트 재현 — 진행 중 잠금·취소를 관찰하려면 필요
// ★붙들기 — 「진행 중」을 관찰하는 시험은 **시계에 기대면 안 된다**(2026-09-21 실패).
//   종전엔 __processDelay 600ms 안에 시험 단계를 끝내야 했는데, ia:deploy 는 앞에서
//   게이트 12개(cut:smoke 도 Playwright)를 돌린 뒤라 기계가 바빴고, 배치가 먼저 끝나
//   취소 버튼이 사라져 클릭이 20초 타임아웃으로 죽었다. 붙들면 그 창이 무한해진다.
window.__processHold = false;   // true = process 응답을 붙들어 둔다 — 놓아 줄 때까지 안 끝난다
window.__held = [];             // 붙들린 콜백
window.__releaseProcess = function () {
  var h = window.__held; window.__held = []; window.__processHold = false;
  for (var i = 0; i < h.length; i++) h[i]();
};
// ── 실루엣 시드(2026-07-31) ────────────────────────────────────────────
// 호스트가 구운 PNG 를 **캔버스로 실제 생성**한다. 마스크를 흉내내지 않고 진짜 픽셀을 주므로
// inkMask→offsetMask→components→배정 경로가 스모크에서 그대로 돈다(계산부를 JS 에 둔 이유).
window.__seedMode = 'mask';   // 'mask'=실루엣 · 'bbox'=굽기 실패 폴백 재현
window.__seedCase = 'grid';   // grid=분리된 __splitCount 개 · diag=bbox 겹침·잉크 분리 · group=잉크 2덩어리·개체 1개
window.__seedPngB64 = '';
window.__lastSeedSpec = '';
window.__mkSeed = function (kind, n) {
  // rects=[x,y,w,h,색?](px) · bounds=[L,T,R,B](mm, y-up). mmpp=1·ox=0·oy=0 이므로 px y → mm T=-y.
  var rects, bounds;
  if (kind === 'white') {
    // ★ 흰색도 그림이다 — 검정 조각과 흰 조각이 맞닿은 **한 디자인**(개체 2개).
    //   inkMask 가 'white' 모드면 흰 조각이 배경으로 사라져 2건으로 갈린다 = 이 어서션이 잡는다.
    rects = [[0, 0, 30, 20, '#000'], [28, 0, 30, 20, '#fff']];
    bounds = [[0, 0, 30, -20], [28, 0, 58, -20]];
  } else if (kind === 'fringe') {
    // ★안티에일리어싱 **가짜 다리** — 두 디자인 사이를 옅은 알파(10%)가 잇는다.
    //   기본 임계(alpha≥16 = 6% 피복)면 이걸 잉크로 세어 **1덩어리로 붙는다**.
    //   50% 피복 임계면 배경으로 보고 2건으로 갈린다 = 이 어서션이 그 차이를 잡는다.
    //   ⚠️ 다리는 **양쪽 조각에 닿아야** 한다 — 한 픽셀이라도 뜨면 임계와 무관하게 안 붙어
    //      테스트가 통과만 하고 아무것도 못 잡는다(2026-08-01 실제로 그랬다).
    rects = [[0, 0, 20, 20, '#000'], [20, 8, 10, 4, 'rgba(0,0,0,0.10)'], [30, 0, 20, 20, '#000']];
    bounds = [[0, 0, 20, -20], [30, 0, 50, -20]];
  } else if (kind === 'translucent') {
    // 반투명 조각 — 50% 임계면 통째로 사라진다. 그때는 낮은 임계로 되돌리고 **알려야** 한다.
    rects = [[0, 0, 20, 20, '#000'], [40, 0, 20, 20, 'rgba(0,0,0,0.10)']];
    bounds = [[0, 0, 20, -20], [40, 0, 60, -20]];
  } else if (kind === 'diag') {
    // ★ 이 케이스가 이번 변경의 핵심 회귀 테스트다.
    //   'ㄴ'자 디자인 A 의 bbox 안에 디자인 B 가 들어앉는다 → 옛 사각 겹침이면 1덩어리로 뭉쳤다.
    //   잉크는 서로 닿지 않으므로 연결성분은 2개여야 하고, 각 개체는 자기 잉크로 배정돼야 한다.
    rects = [[0, 0, 60, 8], [0, 0, 8, 40], [40, 24, 30, 14]];
    bounds = [[0, 0, 60, -40], [40, -24, 70, -38]];
  } else if (kind === 'group') {
    // 잉크는 2덩어리인데 **개체가 1개** — 실루엣이어도 1행밖에 못 만든다(배정 단위가 개체라서).
    rects = [[0, 0, 20, 20], [40, 0, 20, 20]];
    bounds = [[0, 0, 60, -20]];
  } else {
    rects = []; bounds = [];
    for (var i = 0; i < n; i++) { var x = i * 30; rects.push([x, 0, 20, 20]); bounds.push([x, 0, x + 20, -20]); }
  }
  var W = 0, H = 0;
  for (var a = 0; a < rects.length; a++) { W = Math.max(W, rects[a][0] + rects[a][2]); H = Math.max(H, rects[a][1] + rects[a][3]); }
  W += 4; H += 4;
  var cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  var cx = cv.getContext('2d');
  for (var b = 0; b < rects.length; b++) {
    cx.fillStyle = rects[b][4] || '#000';
    cx.fillRect(rects[b][0], rects[b][1], rects[b][2], rects[b][3]);
  }
  window.__seedPngB64 = cv.toDataURL('image/png').split(',')[1];
  // grp = 후보 중 그룹 개체 수. "1건으로 나온 원인" 판정의 사실 근거(잉크 덩어리 수로 추정하지 않는다).
  return { w: W, h: H, bounds: bounds, grp: (kind === 'group') ? 1 : 0 };
};
window.cep = { fs: {
  readFile: function (p) {
    if (window.__seedPngB64 && String(p).indexOf('mes_a0_seed') >= 0) return { err: 0, data: window.__seedPngB64 };
    return { err: 1 };
  },
  // ★쓴 내용을 남긴다 — params JSON 이 실제로 무엇을 싣는지 봐야 검증이 성립한다(2026-09-03).
  writeFile: function (p, data) { (window.__written = window.__written || []).push(String(data)); return { err: 0 }; },
} };
window.__adobe_cep__ = {
  getExtensionID: function () { return 'com.mes.a0.panel'; },
  getSystemPath: function () { return 'C:/tmp'; },
  getHostEnvironment: function () { return JSON.stringify({ appName: 'ILST', appVersion: '29.0' }); },
  evalScript: function (script, cb) {
    window.__calls.push(script);
    var res = '';
    if (/^mesA0_ping/.test(script)) res = 'A0-CEP-TEST';
    else if (/^mesA0_config/.test(script)) res = ${JSON.stringify(cfg)};
    else if (/^mesA0_measure/.test(script)) res = JSON.stringify({ ok: true, w: 8.7, h: 19.7 });
    else if (/^mesA0_seedBegin/.test(script)) {
      if (window.__seedMode === 'bbox') {   // 굽기 실패 → 호스트가 옛 사각 방식으로 이미 큐를 채운 상태
        var sizes = [];
        for (var i = 0; i < window.__splitCount; i++) sizes.push({ w: 87 + i, h: 197, items: 1 });
        res = JSON.stringify({ ok: true, mode: 'bbox', added: sizes.length, total: sizes.length, sizes: sizes });
      } else {
        var sd = window.__mkSeed(window.__seedCase || 'grid', window.__splitCount);
        res = JSON.stringify({ ok: true, mode: 'mask', path: 'C:/tmp/mes_a0_seed.png',
          w: sd.w, h: sd.h, ox: 0, oy: 0, mmpp: 1, n: sd.bounds.length, grp: sd.grp,
          dup: sd.bounds.length, dx: 0, dy: 0, bounds: sd.bounds });
      }
    }
    else if (/^mesA0_seedApply/.test(script)) {
      // 패널이 계산한 배정(그룹 스펙)을 그대로 되받는다 — 그룹 수·구성이 어서션 대상이다.
      var spec = String(script).replace(/^mesA0_seedApply\\("/, '').replace(/"\\)$/, '');
      window.__lastSeedSpec = spec;
      var gs = spec ? spec.split(';') : [];
      var sz2 = [];
      for (var g = 0; g < gs.length; g++) sz2.push({ w: 87 + g, h: 197, items: gs[g].split(',').length });
      window.__hostQ = sz2.length;   // seedFlush 는 큐에 적재하고 total 을 돌려준다
      res = JSON.stringify({ ok: true, added: sz2.length, total: sz2.length, sizes: sz2 });
    }
    else if (/^mesA0_queueSelect/.test(script)) res = JSON.stringify({ ok: true, n: 2 });
    // ★호스트 큐 개수를 실제로 센다 — mesA0_queueRemove 는 **남은 개수를 문자열로** 돌려준다
    //   (mes-a0-host.jsx:1486). 전엔 폴백 '{"ok":true}' 를 돌려줘서, 패널이 성공 판정을 하도록
    //   고쳐도 스텁이 그 계약을 안 지키면 검증이 성립하지 않는다(2026-09-03).
    else if (/^mesA0_queueRemove/.test(script)) {
      if (window.__failQueueRemove) res = 'EvalScript error.';
      else { window.__hostQ = Math.max(0, (window.__hostQ || 0) - 1); res = String(window.__hostQ); }
    }
    else if (/^mesA0_queueAdd\\(/.test(script)) {
      window.__hostQ = (window.__hostQ || 0) + 1;
      res = JSON.stringify({ ok: true, n: window.__hostQ, w: 8.7, h: 19.7, items: 1 });
    }
    else if (/^mesA0_paramsPath/.test(script)) res = 'C:/tmp/ia_params.json';
    // 크로스 패널 잠금(mes-lock.jsx 위임). window.__lockBusy 로 "재단이 점유 중" 상황을 재현한다.
    else if (/^mesA0_lockAcquire/.test(script)) res = window.__lockBusy ? 'busy:cut:make-cut' : 'ok';
    else if (/^mesA0_lock(Release|Touch)/.test(script)) res = 'ok';
    else if (/^mesA0_lockProbe/.test(script)) res = window.__lockBusy ? 'seen:cut:make-cut:age=10ms' : 'none';
    else if (/^mesA0_batchBegin/.test(script)) res = JSON.stringify({ ok: true, folder: 'Z:/test/batch1' });
    // bytes·oversize·warn'E' = 용량 근본원인 계측(host 0.1.4). 51.2MB + 여분 래스터 2개 상태를 재현한다.
    else if (/^mesA0_process/.test(script)) res = window.__failProcess
      ? JSON.stringify({ ok: false, err: 'noart', items: 0, sel: 1 })
      : JSON.stringify({ ok: true, w: 87, h: 197, folder: 'Z:/test', items: 1, normed: 0, bytes: 53687091, oversize: 2, warn: 'E', eps: 'a.eps', dxf: 'a.dxf' });
    else res = JSON.stringify({ ok: true });
    var delay = /^mesA0_process/.test(script) ? (window.__processDelay || 0) : 0;
    if (cb && window.__processHold && /^mesA0_process/.test(script)) window.__held.push(function () { cb(res); });
    else if (cb) setTimeout(function () { cb(res); }, delay);
  }
};
`

const hostStub = mkStub(CONFIG)

const browser = await chromium.launch()
// 격리 케이스용 — 상태가 얽히면 뒤 어서션이 앞 케이스에 오염된다(탭 전환·연동·실패분은 새 페이지로).
// 신규 패널은 **가공자 미선택** 상태로 뜬다(첫 사용 오등록 차단 가드) → 등록을 보는 케이스는
//   먼저 가공자를 골라야 한다. 미선택 상태 자체를 검증하는 17c 만 pickWorker:false 로 연다.
async function openPanel(cfg, opts) {
  const p = await browser.newPage()
  const errs = []
  p.on('pageerror', (e) => errs.push(String(e)))
  p.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()) })
  await p.addInitScript(mkStub(cfg))
  await p.goto(pathToFileURL(PANEL).href)
  await p.waitForTimeout(300)
  if (!opts || opts.pickWorker !== false) await pickWorker(p)
  p.__errs = errs
  return p
}
async function pickWorker(p) {
  const names = await p.evaluate(() => Array.from(document.getElementById('worker').options)
    .map((o) => o.value).filter(Boolean))
  if (names.length) await p.selectOption('#worker', names[0])
}

const page = await browser.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
// warn 도 모은다(2026-09-11 S4) — 없는 요소를 찾는 `#x not found` 경고가 매 로드마다 남으면 진짜 경고가 묻힌다
const warns = []
page.on('console', (m) => {
  if (m.type() === 'error') errors.push('console: ' + m.text())
  if (m.type() === 'warning') warns.push(m.text())
})

await page.addInitScript(hostStub)
await page.goto(pathToFileURL(PANEL).href)
await page.waitForTimeout(300)

// 1) 초기화 무예외 + 기본 탭 = 단건
ok('초기화 콘솔/페이지 에러 0', errors.length === 0, errors.join(' | '))
const initNotFound = warns.filter((w) => /not found/.test(w))
ok('초기화 때 없는 요소 경고 0 (S4: 모아찍기 잔재가 남기던 #imposeBox)', initNotFound.length === 0, initNotFound.join(' | '))
// 첫 사용은 가공자 미선택이 정상 → 이후 등록 케이스를 위해 골라 둔다(가드 자체는 17c 에서 검증)
ok('신규 패널은 가공자 미선택', (await page.locator('#worker').inputValue()) === '')
await pickWorker(page)
ok('기본 탭 = 단건', await page.locator('.tab.active').innerText() === '단건')
ok('후가공은 접이식(기본 접힘)', await page.locator('#finBody').isHidden())
// 액션 동사 통일(P3) — 세 탭이 모두 '등록' 어간을 쓰고 범위만 다르다
ok('실행 버튼 = 1건 등록', await page.locator('#btnProcess').innerText() === '1건 등록')

// 2) 후가공 펼치기 → 값 입력
await page.click('#finToggle')
ok('후가공 펼침', await page.locator('#finBody').isVisible())
// ★재단선 = 변별 on/off 체크박스 (2026-08-06). 점선(fold/cut 2종)은 실사용에서 안 써 없앴다.
//   전달 포맷은 'cut' 그대로 — host 가 'fold'|'cut' 만 마크로 인정하고 옛 행에도 그 값이 있다.
ok('재단선은 체크박스', (await page.locator('input.finMark[data-side="top"]').count()) === 1)
ok('마크 드롭다운 없음', (await page.locator('select.finMark').count()) === 0)
ok('재단선 기본 해제', !(await page.isChecked('input.finMark[data-side="top"]')))
await page.selectOption('select.finM[data-side="left"]', '접어미싱')
await page.fill('#pTop', '3')
ok('후가공 값 입력됨', await page.inputValue('#pTop') === '3')

// 출력 경계선 토글 — **기본 OFF**(2026-08-06 용준님 지시).
//   원본에 테두리가 있는 디자인에서 선이 두 줄로 보이는 게 흔해, 켜는 쪽을 선택으로 돌렸다.
//   host 는 `P.border_line !== false` 로 읽으므로 **구 패널(키 없음)은 계속 ON** 이다 — 의도된 비대칭.
ok('출력 경계선 기본 OFF', !(await page.isChecked('#borderLine')))
await page.check('#borderLine')
ok('출력 경계선 켬', await page.isChecked('#borderLine'))
await page.uncheck('#borderLine')

// ── ★S2(2026-08-05) 「웹 모아찍기 등록」 탭 폐기 — spec 2026-08-05-ia-editor-sunset.md
//   재단 탭이 같은 일을 더 정확히 한다. 여기 있던 3~7)(탭 전환·분리·수량·재분리 거부·비우기)은
//   대상이 사라져 함께 지웠다. 대신 **폐기가 유지되는지**를 검증한다 —
//   버튼만 지우고 화면(data-page)을 남기면 저장된 탭 상태로 복원될 때 되살아난다.
ok('S2 모아찍기 탭 버튼 없음', (await page.locator('.tab[data-tab="impose"]').count()) === 0)
ok('S2 모아찍기 화면 없음', (await page.locator('[data-page="impose"]').count()) === 0)
ok('S2 남은 탭 = 단건·묶음', (await page.locator('.tabbar .tab').count()) === 2)
// 수량 소속은 그대로 검증(탭 폐기와 무관하게 지켜져야 한다)
ok('수량은 단건 탭 소속', (await page.locator('[data-page="single"] #qty').count()) === 1)
ok('기본수량은 묶음 탭 소속', (await page.locator('[data-page="bundle"] #seedQty').count()) === 1)

// 8) 묶음 탭에서 행 클릭 → 단건 탭으로 튕기지 않음
await page.click('.tab[data-tab="bundle"]')
await page.evaluate(() => { window.__splitCount = 3 }) // 7)에서 1로 낮췄던 것 복구
await page.fill('#seedQty', '4')
await page.click('#btnQueueBatch')
await page.waitForTimeout(400)

// 묶음: seedQty 가 새 행에 채워지고, 행에서 고친 값이 정본으로 남는다
ok('새 행에 기본수량 채워짐', (await page.inputValue('#queueBox .qqty[data-i="0"]')) === '4')
await page.fill('#queueBox .qqty[data-i="1"]', '7')
await page.dispatchEvent('#queueBox .qqty[data-i="1"]', 'change')
ok('행 수량 편집 유지', (await page.inputValue('#queueBox .qqty[data-i="1"]')) === '7')
ok('단건 수량은 행 편집에 안 끌려감', (await page.inputValue('#qty')) === '1')
await page.click('#queueBox .qrow[data-i="0"] .qmeta')
await page.waitForTimeout(150)
ok('묶음 탭 유지(행 클릭이 탭을 안 바꿈)', await page.locator('.tab.active').innerText() === '묶음')
ok('행 클릭 시 일러 선택 호출(P3)', await page.evaluate(() => window.__calls.some((c) => /mesA0_queueSelect/.test(c))))

// 9) 후가공 = 단건·묶음 공용 1벌(탭 전환 시 이동) — 묶음도 후가공이 필요하다(2026-07-30 지시).
//    복제가 아니라 이동이므로 어느 시점에도 폼이 2벌이 되면 안 된다(값 갈림 = 등록된 쪽 특정 불가).
ok('묶음 탭에 후가공 폼 이동', await page.evaluate(() => !!document.querySelector('[data-page="bundle"] #finToggleRow')))
// 주석 키워드 칸 = 묶음에선 행 키워드가 정본이라 숨긴다(2026-07-30 지적)
ok('묶음에서 주석 키워드칸 숨김', await page.locator('#annotKwRow').isHidden())
ok('후가공 폼은 항상 1벌', await page.evaluate(() => document.querySelectorAll('#finToggleRow').length === 1 && document.querySelectorAll('#finBody').length === 1))

// 9-2) 적용 버튼은 폼 옆(편집 도구) · 하단은 확정 액션만 (2026-07-30 ③)
ok('적용 버튼 2개가 폼 헤더에', await page.evaluate(() => !!document.querySelector('#finToggleRow #btnApplySel') && !!document.querySelector('#finToggleRow #btnApplyAll')))
ok('하단 확정줄에 적용 버튼 없음', await page.evaluate(() => {
  const r = document.querySelector('#btnConfirm').parentNode
  return !r.querySelector('#btnApplyAll') && !r.querySelector('#btnApplySel')
}))

// 9-3) 행 다중선택 → 선택 적용 (2026-07-30 ①) — 5+5 를 2회로 줄이는 경로
ok('묶음 행에 체크박스', (await page.locator('#queueBox .qsel').count()) === 3)
ok('체크 0개면 선택 적용 비활성', await page.locator('#btnApplySel').isDisabled())
await page.check('#queueBox .qsel[data-i="0"]')
await page.check('#queueBox .qsel[data-i="2"]')
ok('체크한 행 적용 라벨에 개수', (await page.locator('#btnApplySel').innerText()) === '체크한 행 적용 (2)')
await page.click('#btnApplySel')
await page.waitForTimeout(150)
ok('선택 행만 적용 메시지', (await page.locator('#out').innerText()).includes('#1 #3'), (await page.locator('#out').innerText()).slice(0, 90))

// 9-3b) ★숨은 주석 키워드 칸은 행에 쓰지 못한다(2026-07-30 P2 — 이전 동작을 의도적으로 뒤집었다).
//   전엔 묶음 탭에서 #annot 이 숨겨져 있는데도 그 값을 시드·폴백으로 써서, **지난번에 단건 탭에서
//   넣었던 키워드(localStorage 복원값)가 새 행에 조용히 주입**됐다. 사용자는 칸이 안 보이니 이유를
//   알 수 없다. 묶음에선 행별 키워드가 정본이므로 숨은 칸의 값은 무시한다.
await page.evaluate(() => { document.getElementById('annot').value = '숨은키워드' })
await page.click('#btnApplyAll')
await page.waitForTimeout(200)
ok('묶음: 숨은 키워드가 행에 주입되지 않음', await page.evaluate(() => {
  const v = Array.from(document.querySelectorAll('#queueBox .qkw')).map((e) => e.value)
  return v.length === 3 && v.every((x) => x !== '숨은키워드')
}), await page.evaluate(() => Array.from(document.querySelectorAll('#queueBox .qkw')).map((e) => e.value).join('|')))
ok('묶음: 주석 키워드칸 여전히 숨김', await page.locator('#annotKwRow').isHidden())
ok('재렌더 후에도 체크 유지', await page.evaluate(() => document.querySelector('#queueBox .qsel[data-i="0"]').checked && document.querySelector('#queueBox .qsel[data-i="2"]').checked))

// 9-4) 검토는 선택 사항 (2026-07-30 ②) — 검토 없이도 확정 가능해야 하고, 미검토가 눈에 보여야 한다
ok('검토 없이 확정 버튼 활성', !(await page.locator('#btnConfirm').isDisabled()))
ok('미검토 표시', (await page.locator('#btnConfirm').innerText()).indexOf('미검토') > 0, await page.locator('#btnConfirm').innerText())
// ★ disabled 만 보면 안 된다 — 게이트가 클릭 핸들러에도 있어서 버튼은 활성인데 확정이 막혔다
//   (2026-07-30 실사용 지적). 반드시 눌러서 실제로 진행되는지 본다.
await page.click('#btnConfirm')
await page.waitForTimeout(400)
const confMsg = await page.locator('#out').innerText()
ok('검토 없이 실제 확정 진행', !confMsg.includes('검토문서로 확인한 뒤') && confMsg.includes('일괄 확정 완료'), confMsg.slice(0, 120))
ok('미검토 확정이 결과에 기록', confMsg.includes('(미검토 확정)'), confMsg.slice(0, 120))

// 10) 등록 결과에 용량·임베드 여분 경고 노출 — 100MB work.ai 재발을 알아채는 유일한 지점.
//    (사고 당시엔 용량이 어디에도 안 보여 5건 524MB가 쌓인 뒤에야 발견됐다)
await page.click('.tab[data-tab="single"]')
await page.click('#btnProcess')
await page.waitForTimeout(300)
const doneMsg = await page.locator('#out').innerText()
ok('단건 복귀 시 후가공 폼도 단건으로', await page.evaluate(() => !!document.querySelector('[data-page="single"] #finToggleRow')))
ok('단건에선 주석 키워드칸 표시', await page.locator('#annotKwRow').isVisible())


// ★키워드가 없어도 주석은 만들어져야 한다(2026-08-05 용준님 재요청).
//   여태 `if (!keyword) return ''` 라 4방향을 다 체크해도 아무것도 안 그려졌고, 이유도 안 알려줬다.
//   수량은 언제나 있으므로 이 함수는 **빈 문자열을 돌려주면 안 된다**.
{
  const a0 = fs.readFileSync(path.join(REPO, 'IllustratorAutomat', 'designer', 'mes-a0-host.jsx'), 'utf8')
  const fn = /function mesA0_annotText\([\s\S]*?\n\}/.exec(a0)
  ok('주석: 키워드 없어도 생성', !!fn && !/if \(!keyword\) return ''/.test(fn[0]))
  ok('주석: 수량은 항상 붙는다', !!fn && /parts\.push\(qty \+ 'ea'\)/.test(fn[0]))
}ok('등록 결과에 산출물 용량 표시', doneMsg.includes('산출물 51.2MB'), doneMsg.slice(0, 140))
ok('임베드 여분 경고 표시', doneMsg.includes('임베드 이미지가 디자인 밖까지 큼'), doneMsg.slice(0, 200))
ok('돔보 등록분 DXF 표시', doneMsg.includes('DXF: a.dxf'), doneMsg.slice(0, 220))

// 10b) ★크로스 패널 잠금 (2026-07-31) — 패널이 둘이 됐다(A0 + 재단 com.mes.cut.panel).
//   setHostBusy 의 disabled 처리는 **이 패널 버튼만** 막는다. 재단 패널이 같은 일러를 동시에 때리는 것은
//   파일 잠금(%TEMP%\mes_host_lock.txt · 정본 mes-lock.jsx)으로만 막히므로, 작업 시작·종료에서
//   실제로 잡고 놓는지 회귀로 고정한다. 라벨은 ASCII 여야 한다 — 한글은 evalScript 브릿지에서 깨진다.
{
  const lockCalls = await page.evaluate(() => window.__calls.filter((c) => /mesA0_lock/.test(c)))
  ok('작업 시작 시 잠금 획득 호출', lockCalls.some((c) => /mesA0_lockAcquire\("single"\)/.test(c)), lockCalls.join(' | '))
  ok('잠금 라벨이 ASCII(한글 미포함)', lockCalls.every((c) => !/[^\x00-\x7f]/.test(c)), lockCalls.join(' | '))
  ok('작업 종료 시 잠금 해제 호출', lockCalls.some((c) => /mesA0_lockRelease\(\)/.test(c)), lockCalls.join(' | '))
}

ok('전체 콘솔/페이지 에러 0', errors.length === 0, errors.join(' | '))

// ── 11) 버전 = 로직(축2) + 화면(축3/축4) 두 축 (2026-07-30 점검 ⑤) ──
//    화면 버전이 없으면 껍데기 재설치를 안 한 PC 도 최신 번호로 보인다 = 배포 확인 수단 0.
{
  const ver = await page.locator('#ver').innerText()
  ok('버전에 host 축 표시', ver.includes('A0-CEP-TEST'), ver)
  ok('버전에 화면(껍데기) 축 표시', /화면 \d+\.\d+\.\d+/.test(ver), ver)
}

// ── 12) 가공자 명단 = config 정본 (하드코딩 제거, 점검 ④) ──
{
  // 빈 안내 항목('(가공자 선택)')은 명단이 아니므로 제외하고 센다
  const opts = await page.evaluate(() => Array.from(document.querySelectorAll('#worker option')).map((o) => o.value).filter(Boolean))
  ok('명단이 도메인 매핑으로 걸러짐', opts.length === 1 && opts[0] === '인호동', JSON.stringify(opts))
  ok('매핑 없는 계정(123) 제외', !opts.includes('123'), JSON.stringify(opts))
}

// ── 12b) 매핑 0건(= 현재 prod) → 전량 폴백 + 도메인 미지정 경고 ──
{
  const p2 = await openPanel(CONFIG_NOMAP)
  const opts = await p2.evaluate(() => Array.from(document.querySelectorAll('#worker option')).map((o) => o.value).filter(Boolean))
  ok('매핑 0건이면 전량 폴백', opts.length === 2, JSON.stringify(opts))
  const saved = await p2.locator('#saved').innerText()
  ok('도메인 미지정 경고 표시', saved.includes('도메인 미지정'), saved)
  ok('미지정 경고 색 클래스', (await p2.getAttribute('#saved', 'class')).includes('warn'))
  // 미지정이면 전사(봉제) 방식은 드롭다운에 없다 — 이 사실이 화면에 드러나는지가 요점
  const finOpts = await p2.evaluate(() => Array.from(document.querySelectorAll('select.finM[data-side="top"] option')).map((o) => o.value))
  ok('미지정 상태에선 전사 방식 미노출(폴백=현수막)', !finOpts.includes('쌍침'), JSON.stringify(finOpts))
  ok('12b 콘솔 에러 0', p2.__errs.length === 0, p2.__errs.join(' | '))
  await p2.close()
}

// ── 13) 탭 전환 시 행 연동 자동 해제 (점검 ②-가) ──
{
  const p3 = await openPanel(CONFIG)
  await p3.click('.tab[data-tab="bundle"]')
  await p3.click('#btnQueueBatch')
  await p3.waitForTimeout(400)
  await p3.click('#queueBox .qrow[data-i="0"] .qmeta')
  await p3.waitForTimeout(150)
  ok('행 연동 표시(sel)', (await p3.locator('#queueBox .qrow.sel').count()) === 1)
  await p3.click('.tab[data-tab="single"]')
  await p3.waitForTimeout(120)
  await p3.click('.tab[data-tab="bundle"]')
  ok('탭 전환으로 연동 해제됨', (await p3.locator('#queueBox .qrow.sel').count()) === 0)
  ok('13 콘솔 에러 0', p3.__errs.length === 0, p3.__errs.join(' | '))
  await p3.close()
}

// ── 14) (삭제) 모아찍기 행 유지 — S2(2026-08-05) 로 탭 자체가 없어져 대상이 사라졌다.
//    spec 2026-08-05-ia-editor-sunset.md. 폐기 검증은 위 S2 어서션이 맡는다.


// ── 15) 일괄 확정 실패분은 큐에 남는다 (H5 회귀 방지, 점검 ③) ──
{
  const p5 = await openPanel(CONFIG)
  await p5.click('.tab[data-tab="bundle"]')
  await p5.click('#btnQueueBatch')
  await p5.waitForTimeout(400)
  await p5.evaluate(() => { window.__failProcess = true })
  await p5.click('#btnConfirm')
  await p5.waitForTimeout(700)
  const msg = await p5.locator('#out').innerText()
  ok('실패 3건 보고', /실패 3/.test(msg), msg.slice(0, 60))
  ok('실패 행이 큐에 남음', (await p5.locator('#queueBox .qrow').count()) === 3)
  ok('재시도 안내 표시', msg.includes('재시도'), msg.slice(-90))
  // 부분 실패: 성공분만 빠지고 실패분만 남아야 한다
  await p5.evaluate(() => { window.__failProcess = false })
  await p5.click('#btnConfirm')
  await p5.waitForTimeout(700)
  ok('재시도 성공 시 큐 비움', (await p5.locator('#queueBox .qrow').count()) === 0,
    (await p5.locator('#out').innerText()).slice(0, 60))
  ok('15 콘솔 에러 0', p5.__errs.length === 0, p5.__errs.join(' | '))
  await p5.close()
}

// ── 15b) ★호스트가 못 지웠으면 패널 큐도 줄이지 않는다 (2026-09-03) ──
// 여태 `mesA0_queueRemove(i)` 결과를 보지 않고 splice 했다. 호스트 호출이 실패하면 패널만 줄어
// host `$.global.mesA0Q` 와 인덱스가 어긋나고, 이후 `mesA0_queueSelect(i)` 가 **다른 조각**을
// 골라 엉뚱한 행이 가공된다. 조용히 틀린 산출물이 나오는 형태라 가장 나쁘다.
{
  const p5b = await openPanel(CONFIG)
  await p5b.click('.tab[data-tab="bundle"]')
  await p5b.click('#btnQueueBatch')
  await p5b.waitForTimeout(400)
  ok('15b 큐 3행 준비', (await p5b.locator('#queueBox .qrow').count()) === 3)
  await p5b.evaluate(() => { window.__failQueueRemove = true })
  await p5b.click('#queueBox .qdel')
  await p5b.waitForTimeout(250)
  const m5b = await p5b.locator('#out').innerText()
  ok('15b 실패하면 행을 지우지 않는다', (await p5b.locator('#queueBox .qrow').count()) === 3, m5b.slice(0, 80))
  ok('15b 실패를 사람에게 알린다', /지우지 못했습니다/.test(m5b), m5b.slice(0, 80))
  // 성공하면 정상적으로 줄어든다(막아 놓기만 한 게 아니다)
  await p5b.evaluate(() => { window.__failQueueRemove = false })
  await p5b.click('#queueBox .qdel')
  await p5b.waitForTimeout(250)
  ok('15b 성공하면 행이 준다', (await p5b.locator('#queueBox .qrow').count()) === 2)
  ok('15b 콘솔 에러 0', p5b.__errs.length === 0, p5b.__errs.join(' | '))
  await p5b.close()
}

// ── 15c) ★「조」 단위 표기는 단건 칸이 보일 때만 (2026-09-03) ──
// `gatherParams` 는 `qty_unit` 을 무조건 싣는데, 묶음 행은 수량을 seedQty·행값으로 덮어쓰면서
// 단위는 그대로 뒀다 → **환산은 안 된 채 단위만 'set'** 으로 나가 대기함 「N개 (M조)」가 틀린다.
// ★환산 지점(gatherParams 한 곳)은 그대로다 — 여기서 보는 것은 표기뿐이다.
{
  const p5c = await openPanel(CONFIG)
  await p5c.selectOption('#qtyUnit', 'set')     // 단건 탭에서 「조」를 골라 두고
  await p5c.click('.tab[data-tab="bundle"]')    // 묶음 탭으로 옮기면 그 칸은 숨는다
  await p5c.click('#btnQueueBatch')
  await p5c.waitForTimeout(400)
  await p5c.evaluate(() => { window.__written = [] })
  await p5c.click('#btnConfirm')
  await p5c.waitForTimeout(900)
  const written = await p5c.evaluate(() => (window.__written || []).join('\n'))
  const parsed = written.split('\n').filter((s) => s.indexOf('{') === 0).map((s) => { try { return JSON.parse(s) } catch { return null } }).filter(Boolean)
  ok('15c params 가 실제로 나갔다', parsed.length === 3, String(parsed.length))
  ok('15c 묶음 행에 조 단위가 실리지 않는다',
    parsed.length > 0 && parsed.every((o) => o.qty_unit !== 'set'),
    parsed.map((o) => o.qty_unit).join(','))
  ok('15c 콘솔 에러 0', p5c.__errs.length === 0, p5c.__errs.join(' | '))
  await p5c.close()
}

// ── 15d) ★단건 탭에서는 「조」가 그대로 실린다 — 게이트가 기능을 죽인 게 아니다 ──
{
  const p5d = await openPanel(CONFIG)
  await p5d.selectOption('#qtyUnit', 'set')
  await p5d.fill('#qty', '3')
  await p5d.evaluate(() => { window.__written = [] })
  await p5d.click('#btnProcess')
  await p5d.waitForTimeout(900)
  const w = await p5d.evaluate(() => (window.__written || []).join('\n'))
  const o = w.split('\n').filter((s) => s.indexOf('{') === 0).map((s) => { try { return JSON.parse(s) } catch { return null } }).filter(Boolean)[0]
  ok('15d 단건은 조 표기를 유지한다', !!o && o.qty_unit === 'set', o ? String(o.qty_unit) : 'noparams')
  ok('15d 환산은 여전히 한 곳에서 한 번만(3조=6개)', !!o && o.qty === 6, o ? String(o.qty) : 'noparams')
  ok('15d 콘솔 에러 0', p5d.__errs.length === 0, p5d.__errs.join(' | '))
  await p5d.close()
}

// ── 17) P2: 호스트 작업 잠금 단일화 + 취소 (params 파일 경쟁 차단) ──
//    전엔 잠금이 버튼별 임시 disable 이라 새 진입점이 계속 새어 나갔다: 배치 중 [＋묶음분리]·
//    [비우기]·[◎자동감지]·[선택분 분리] 가 안 잠기고, 단건 가공 중 [일괄 확정]도 눌렸다.
//    두 파이프라인은 mesA0_paramsPath() 파일 1개를 공유하므로 설정이 섞일 수 있다.
{
  const p7 = await openPanel(CONFIG)
  await p7.click('.tab[data-tab="bundle"]')
  await p7.click('#btnQueueBatch')
  await p7.waitForTimeout(400)
  await p7.evaluate(() => { window.__processHold = true }) // 느린 호스트 재현 — 놓아 줄 때까지 안 끝난다
  await p7.click('#btnConfirm')
  // ★시계가 아니라 **상태**를 기다린다 — 첫 건이 실제로 호스트에 들어간 순간이 관찰 창의 시작이다.
  await p7.waitForFunction(() => window.__held.length > 0)
  const mid = await p7.evaluate(() => ({
    process: document.getElementById('btnProcess').disabled,
    queueBatch: document.getElementById('btnQueueBatch').disabled,
    queueClear: document.getElementById('btnQueueClear').disabled,
    autoDetect: document.getElementById('btnAutoDetect').disabled,
    measure: document.getElementById('btnMeasure').disabled,
    review: document.getElementById('btnReview').disabled,
    cancelShown: document.getElementById('btnCancel').style.display !== 'none',
  }))
  const allLocked = mid.process && mid.queueBatch && mid.queueClear && mid.autoDetect &&
    mid.measure && mid.review
  ok('배치 중 모든 호스트 진입점 잠김', allLocked, JSON.stringify(mid))
  ok('배치 중 취소 버튼 노출', mid.cancelShown)
  // 취소 → 남은 건은 큐에 남고 잠금이 풀려야 한다
  await p7.click('#btnCancel')
  // 붙들었던 첫 건을 놓아 준다 → 정상 취소가 마무리된다(2건째는 취소 플래그로 안 들어가야 한다).
  await p7.evaluate(() => window.__releaseProcess())
  await p7.waitForTimeout(1500)
  const after = await p7.evaluate(() => ({
    out: document.getElementById('out').textContent,
    rows: document.querySelectorAll('#queueBox .qrow').length,
    cancelShown: document.getElementById('btnCancel').style.display !== 'none',
    processEnabled: !document.getElementById('btnProcess').disabled,
  }))
  ok('취소 메시지 표시', /취소/.test(after.out), after.out.slice(0, 70))
  ok('취소 후 잠금 해제', after.processEnabled && !after.cancelShown, JSON.stringify(after))
  ok('취소 시 미처리분은 큐에 남음', after.rows > 0, 'rows=' + after.rows)
  ok('17 콘솔 에러 0', p7.__errs.length === 0, p7.__errs.join(' | '))
  await p7.close()
}

// ── 17c) 배포 전 점검: 가공자 미선택 방지 (첫 실사용 데이터 오염 차단) ──
//    prod 실측 — worker_domains 0건이라 전량 폴백이고 정렬상 맨 위가 테스트 계정 `123`(id 13).
//    드롭다운 첫 항목이 곧 기본값이므로 안 고르고 등록하면 남의 worker_id 로 기록돼
//    "내 작업" 에서 사라진다. → 빈 항목을 앞에 두고 등록 시점에 선택을 요구한다.
{
  const p11 = await openPanel(CONFIG_NOMAP, { pickWorker: false })   // 매핑 0건 = 현재 prod 상태
  const first = await p11.evaluate(() => {
    const s = document.getElementById('worker')
    return { value: s.value, firstOpt: s.options[0] ? s.options[0].textContent : '(없음)', count: s.options.length }
  })
  ok('매핑 0건이면 가공자 미선택 상태', first.value === '', JSON.stringify(first))
  ok('빈 안내 항목이 맨 위', first.firstOpt.includes('가공자 선택'), first.firstOpt)
  // 미선택으로 단건 등록 시도 → 차단되어야 하고 호스트를 부르지 않아야 한다
  await p11.click('#btnProcess')
  await p11.waitForTimeout(300)
  const blocked = await p11.evaluate(() => ({
    out: document.getElementById('out').textContent,
    processCalls: window.__calls.filter((c) => /mesA0_process/.test(c)).length,
  }))
  ok('가공자 미선택 시 등록 차단', /가공자를 먼저 고르세요/.test(blocked.out), blocked.out.slice(0, 60))
  ok('차단 시 호스트 호출 0', blocked.processCalls === 0, 'process 호출 ' + blocked.processCalls)
  // 고르면 통과
  await p11.selectOption('#worker', '인호동')
  await p11.click('#btnProcess')
  await p11.waitForTimeout(400)
  ok('가공자 선택 후에는 등록 진행', await p11.evaluate(() => window.__calls.some((c) => /mesA0_process/.test(c))))
  ok('17c 콘솔 에러 0', p11.__errs.length === 0, p11.__errs.join(' | '))
  await p11.close()
}

// ── 17b) 배포 전 점검: 잠금이 새는 두 경로 ──
//    ⓐ #scale·#trimInk 는 select/checkbox 라 setHostBusy 가 못 잠근다 → 배치 중 배율을 바꾸면
//       mesA0_measure 호출이 끼어들었다. 가드는 refreshMeasure 진입점 한 곳에서 한다.
//    ⓑ 호스트 콜백이 끝내 안 돌아오면(JSX 모달·COM wedge 전례) 잠금이 영영 안 풀려 패널이 굳는다
//       → 취소 2번째 클릭 = 강제 해제(탈출구).
{
  const p10 = await openPanel(CONFIG)
  await p10.click('.tab[data-tab="bundle"]')
  await p10.click('#btnQueueBatch')
  await p10.waitForTimeout(400)
  // ★ⓑ 의 전제 = 「호스트 콜백이 **끝내 안 돌아온다**」. 그러니 여기서는 놓아 주지 않는다 —
  //   종전의 600ms 타이머는 그 전제를 흉내 낸 것이라, 기계가 바쁘면 전제가 깨져 시험이 죽었다.
  await p10.evaluate(() => { window.__processHold = true })
  await p10.click('#btnConfirm')
  await p10.waitForFunction(() => window.__held.length > 0)
  const callsBefore = await p10.evaluate(() => window.__calls.filter((c) => /mesA0_measure/.test(c)).length)
  await p10.selectOption('#scale', '10')                 // 배치 중 배율 변경
  await p10.evaluate(() => document.getElementById('trimInk').click())
  await p10.waitForTimeout(400)
  const callsAfter = await p10.evaluate(() => window.__calls.filter((c) => /mesA0_measure/.test(c)).length)
  ok('배치 중 배율·잉크 변경이 호스트 실측을 부르지 않음', callsAfter === callsBefore,
    'measure 호출 ' + callsBefore + ' → ' + callsAfter)
  // 취소 2단: 1번째=정상 취소 요청, 2번째=강제 해제
  await p10.click('#btnCancel')
  ok('취소 1회 → 강제 해제 안내로 바뀜', (await p10.locator('#btnCancel').innerText()).includes('강제 해제'),
    await p10.locator('#btnCancel').innerText())
  await p10.click('#btnCancel')
  await p10.waitForTimeout(150)
  const forced = await p10.evaluate(() => ({
    processEnabled: !document.getElementById('btnProcess').disabled,
    out: document.getElementById('out').textContent,
  }))
  ok('취소 2회 → 잠금 강제 해제', forced.processEnabled, JSON.stringify(forced).slice(0, 120))
  ok('강제 해제 시 경고 표시', /강제로 풀었습니다/.test(forced.out), forced.out.slice(0, 80))
  await p10.waitForTimeout(1500)
  ok('17b 콘솔 에러 0', p10.__errs.length === 0, p10.__errs.join(' | '))
  await p10.close()
}

// ── 18) P2: 적용 버튼은 묶음 탭에서만 (탭=용도 원칙) ──
{
  const p8 = await openPanel(CONFIG)
  await p8.click('.tab[data-tab="bundle"]')
  await p8.click('#btnQueueBatch')
  await p8.waitForTimeout(400)
  await p8.check('#queueBox .qsel[data-i="0"]')
  ok('묶음 탭에선 전체 적용 활성', !(await p8.locator('#btnApplyAll').isDisabled()))
  await p8.click('.tab[data-tab="single"]')
  await p8.waitForTimeout(150)
  ok('단건 탭에선 전체 적용 잠김', await p8.locator('#btnApplyAll').isDisabled())
  ok('단건 탭에선 선택 적용 잠김', await p8.locator('#btnApplySel').isDisabled())
  ok('잠근 이유가 title 에 있음', (await p8.getAttribute('#btnApplyAll', 'title') || '').includes('묶음'))
  ok('18 콘솔 에러 0', p8.__errs.length === 0, p8.__errs.join(' | '))
  await p8.close()
}

// ── 19) P2: 행과 무관한 칸은 연동 행을 덮지 않는다 (제외목록 → 허용목록) ──
{
  const p9 = await openPanel(CONFIG)
  await p9.click('.tab[data-tab="bundle"]')
  await p9.click('#btnQueueBatch')
  await p9.waitForTimeout(400)
  await p9.click('#queueBox .qrow[data-i="0"] .qmeta')   // 행0 연동
  await p9.waitForTimeout(150)
  await p9.click('#finToggle')
  await p9.selectOption('select.finM[data-side="left"]', '접어미싱')
  await p9.waitForTimeout(200)
  const withFin = await p9.evaluate(() => document.querySelector('#queueBox .qmeta').textContent)
  // 폼만 비운 뒤(행에는 남아 있다) seedQty·splitGap 을 건드린다 → 행이 덮이면 결함
  await p9.evaluate(() => { document.querySelector('select.finM[data-side="left"]').value = '' })
  await p9.fill('#seedQty', '9')
  await p9.dispatchEvent('#seedQty', 'change')
  await p9.waitForTimeout(200)
  const afterSeed = await p9.evaluate(() => document.querySelector('#queueBox .qmeta').textContent)
  ok('seedQty 변경이 연동 행을 덮지 않음', afterSeed === withFin, 'before="' + withFin + '" after="' + afterSeed + '"')
  // 후가공 폼 변경은 여전히 반영되어야 한다(허용목록이 과하게 막지 않았는지)
  await p9.selectOption('select.finM[data-side="top"]', '열재단')
  await p9.waitForTimeout(200)
  ok('후가공 변경은 정상 반영', (await p9.evaluate(() => document.querySelector('#queueBox .qmeta').textContent)) !== afterSeed)
  ok('19 콘솔 에러 0', p9.__errs.length === 0, p9.__errs.join(' | '))
  await p9.close()
}

// ── 16) 패널 기본 크기가 콘텐츠를 담는가 (점검 ①) ──
//    manifest 기본값이 콘텐츠보다 작으면 첫 오픈에 실행 버튼·결과창이 화면 밖이다(실측 확인).
{
  const xml = fs.readFileSync(path.join(path.dirname(PANEL), 'CSXS/manifest.xml'), 'utf8')
  const size = /<Size>\s*<Height>(\d+)<\/Height>\s*<Width>(\d+)<\/Width>/.exec(xml)
  const min = /<MinSize>\s*<Height>(\d+)<\/Height>\s*<Width>(\d+)<\/Width>/.exec(xml)
  const p6 = await openPanel(CONFIG)
  await p6.setViewportSize({ width: Number(size[2]), height: Number(size[1]) })
  await p6.waitForTimeout(150)
  const fits = await p6.evaluate(() => {
    const btn = document.getElementById('btnProcess').getBoundingClientRect()
    const out = document.getElementById('out').getBoundingClientRect()
    return { btnBottom: Math.round(btn.bottom), outBottom: Math.round(out.bottom), h: document.documentElement.clientHeight }
  })
  ok('기본 크기에서 [단건 가공] 보임', fits.btnBottom <= fits.h, JSON.stringify(fits))
  ok('기본 크기에서 결과창 보임', fits.outBottom <= fits.h, JSON.stringify(fits))
  // 최소 폭에서 마감 방식 드롭다운이 읽을 수 있는 너비인가(220px 시절 36px 였다)
  await p6.setViewportSize({ width: Number(min[2]), height: Number(min[1]) })
  await p6.click('#finToggle')
  await p6.waitForTimeout(150)
  // ★기준은 매직넘버가 아니라 **가장 긴 방식 이름이 잘리지 않는가** 다 (2026-08-06).
  //   전엔 ≥90px 로 못박혀 있었는데 그 숫자의 근거가 어디에도 없었다. 그래서 ⓐ 폭을 조금
  //   줄이는 정당한 변경이 걸리고 ⓑ config 에 더 긴 이름이 생겨도 못 잡는다.
  //   방식 목록은 config 에서 온다(현재 최장 '게시대미싱') → 실제 글자폭을 재서 판정한다.
  const selFit = await p6.evaluate(() => {
    const sel = document.querySelector('select.finM[data-side="top"]')
    const opts = Array.from(sel.options).map((o) => o.textContent || '')
    const cs = window.getComputedStyle(sel)
    const cv = document.createElement('canvas').getContext('2d')
    cv.font = cs.fontSize + ' ' + cs.fontFamily
    const textPx = Math.max(0, ...opts.map((t) => cv.measureText(t).width))
    const chrome = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight) + 18  // 화살표 + 패딩
    return {
      w: Math.round(sel.getBoundingClientRect().width),
      need: Math.ceil(textPx + chrome),
      longest: opts.slice().sort((a, b) => b.length - a.length)[0] || '',
    }
  })
  ok('최소 폭에서 가장 긴 방식이 안 잘림', selFit.w >= selFit.need,
    `'${selFit.longest}' 필요 ${selFit.need}px · 실제 ${selFit.w}px @${min[2]}px`)
  // ★헤더가 접히면 **세로로 쌓여** 읽을 수 없다 (2026-09-04 용준님: "재단선이 세로로 있다").
  //   `table-layout: fixed` 라 열이 헤더 글자보다 좁으면 조용히 줄바꿈된다 — 눈으로만 보이고
  //   기능은 멀쩡해서 아무 게이트도 안 잡았다. 폭을 다시 줄이는 변경이 오면 여기서 걸린다.
  //   (.fhdr 에 white-space:nowrap 이 있으므로 넘치면 scrollWidth 로 드러난다)
  const hdrFit = await p6.evaluate(() => {
    const bad = []
    document.querySelectorAll('table.fin td.fhdr').forEach((td) => {
      if (td.scrollWidth > td.clientWidth + 1) {
        bad.push((td.textContent || '?') + ' ' + td.scrollWidth + '>' + td.clientWidth)
      }
    })
    return bad
  })
  ok('최소 폭에서 표 헤더가 안 접힘', hdrFit.length === 0, hdrFit.join(' · '))
  ok('16 콘솔 에러 0', p6.__errs.length === 0, p6.__errs.join(' | '))
  await p6.close()
}

// ── 20) 실루엣 분리 (2026-07-31) — 사각 겹침 폐기의 회귀 방지 ──────────────
//   왜 이 3건인가: ①이 변경이 실제로 고치려던 것 ②실루엣이어도 못 고치는 것 ③굽기가 죽었을 때.
{
  // ①-가 대각/포개짐: 'ㄴ'자 A 의 bbox 안에 B 가 들어앉는다. 옛 사각 겹침이면 1덩어리였다.
  const pa = await openPanel(CONFIG)
  await pa.evaluate(() => { window.__seedCase = 'diag' })
  await pa.click('.tab[data-tab="bundle"]')
  await pa.click('#btnQueueBatch')
  await pa.waitForTimeout(500)
  ok('bbox 겹쳐도 잉크가 떨어져 있으면 2건으로 분리',
    (await pa.locator('#queueBox .qrow').count()) === 2,
    await pa.locator('#out').innerText())
  ok('개체가 자기 잉크로 배정됨(0;1)', (await pa.evaluate(() => window.__lastSeedSpec)) === '0;1',
    await pa.evaluate(() => window.__lastSeedSpec))
  ok('20a 콘솔 에러 0', pa.__errs.length === 0, pa.__errs.join(' | '))
  await pa.close()

  // ②-나 배정 단위는 **개체**다 — 잉크가 2덩어리여도 개체가 1개면 1행. 그 사실을 근거로 말해야 한다.
  const pb = await openPanel(CONFIG)
  await pb.evaluate(() => { window.__seedCase = 'group' })
  await pb.click('.tab[data-tab="bundle"]')
  await pb.click('#btnQueueBatch')
  await pb.waitForTimeout(500)
  const gtxt = await pb.locator('#out').innerText()
  ok('개체 1개면 잉크가 갈려도 1건', (await pb.locator('#queueBox .qrow').count()) === 1, gtxt)
  // 원인 판정은 **개체 사실(grp)** 로 한다 — 잉크 덩어리 수로 추정하면 흰 요소 때문에 틀린다.
  ok('원인을 사실로 지목(선택이 그룹 1개)', gtxt.includes('선택이 그룹 1개'), gtxt.slice(0, 90))
  ok('20b 콘솔 에러 0', pb.__errs.length === 0, pb.__errs.join(' | '))
  await pb.close()

  // ②-라 ★흰색도 그림이다 — 검정+흰 조각이 맞닿은 한 디자인(개체 2개)이 **1건**으로 묶여야 한다.
  //   'white' 모드였다면 흰 조각이 배경으로 사라져 2건으로 갈린다.
  const pw = await openPanel(CONFIG)
  await pw.evaluate(() => { window.__seedCase = 'white' })
  await pw.click('.tab[data-tab="bundle"]')
  await pw.click('#btnQueueBatch')
  await pw.waitForTimeout(500)
  ok('흰 조각도 잉크로 세어 한 디자인으로 묶임',
    (await pw.evaluate(() => window.__lastSeedSpec)) === '0,1',
    await pw.evaluate(() => window.__lastSeedSpec))
  ok('20d 콘솔 에러 0', pw.__errs.length === 0, pw.__errs.join(' | '))
  await pw.close()

  // ②-마 ★안티에일리어싱 가짜 다리 (2026-08-01, 재단 패널에서 임계 이식)
  //   기본 임계(6% 피복)는 테두리 한 겹을 잉크로 세어 **없는 다리**를 만든다 —
  //   1mm/px 에서 사방 1px 이면 두 디자인 사이에 최대 2mm 의 가짜 잉크가 생긴다.
  const pf = await openPanel(CONFIG)
  await pf.evaluate(() => { window.__seedCase = 'fringe' })
  await pf.click('.tab[data-tab="bundle"]')
  await pf.click('#btnQueueBatch')
  await pf.waitForTimeout(500)
  ok('옅은 알파 다리로는 붙지 않음(2건 분리)',
    (await pf.evaluate(() => window.__lastSeedSpec)) === '0;1',
    await pf.evaluate(() => window.__lastSeedSpec))
  ok('20e 콘솔 에러 0', pf.__errs.length === 0, pf.__errs.join(' | '))
  await pf.close()

  // ②-바 반투명 조각 — 임계를 올리면 통째로 사라진다. 되돌리되 **조용히 하지 않는다**.
  const pt = await openPanel(CONFIG)
  await pt.evaluate(() => { window.__seedCase = 'translucent' })
  await pt.click('.tab[data-tab="bundle"]')
  await pt.click('#btnQueueBatch')
  await pt.waitForTimeout(500)
  const ttxt = await pt.locator('#out').innerText()
  ok('반투명 조각이 사라지지 않음(2건 유지)',
    (await pt.evaluate(() => window.__lastSeedSpec)) === '0;1',
    await pt.evaluate(() => window.__lastSeedSpec))
  ok('반투명 폴백을 사용자에게 알림', ttxt.includes('반투명'), ttxt.slice(0, 120))
  ok('20f 콘솔 에러 0', pt.__errs.length === 0, pt.__errs.join(' | '))
  await pt.close()

  // ③-다 굽기 실패 폴백 — 조용히 옛 방식으로 돌아가면 안 된다. 반드시 눈에 보여야 한다.
  const pc = await openPanel(CONFIG)
  await pc.evaluate(() => { window.__seedMode = 'bbox' })
  await pc.click('.tab[data-tab="bundle"]')
  await pc.click('#btnQueueBatch')
  await pc.waitForTimeout(500)
  const ftxt = await pc.locator('#out').innerText()
  ok('굽기 실패 시에도 큐는 채워짐', (await pc.locator('#queueBox .qrow').count()) === 3, ftxt)
  ok('폴백을 사용자에게 알림', ftxt.includes('사각(bbox) 방식'), ftxt.slice(0, 90))
  ok('20c 콘솔 에러 0', pc.__errs.length === 0, pc.__errs.join(' | '))
  await pc.close()
}

// ── 7c A0 자동감지 캡처 경로 (2026-08-31) ────────────────────────────
// 굽기용 임시 문서는 「무제」 창을 띄운다(실측 2.4초). `Document.imageCapture()` 는 문서를 안 만든다.
// ⚠️ 그런데 캡처는 **그 영역에 그려지는 전부**를 찍는다 — 후보에서 뺀 잠긴 개체·50mm↓ 노이즈까지.
//    픽스처 실측(2026-08-31): 잠근 다리를 두 디자인 사이에 두니 A=255 로 찍혀 한 덩어리가 됐다.
//    그래서 **증명 가능할 때만** 쓴다. 아래 가드 중 하나라도 빠지면 분리 결과가 조용히 달라진다.
// ⚠️ 해상도 하한 72dpi 도 실측이다(res=25.4 → "Specified value less than minimum allowed value").
{
  const a0h = fs.readFileSync(path.join(REPO, 'IllustratorAutomat', 'designer', 'mes-a0-host.jsx'), 'utf8')
  const a0m = fs.readFileSync(path.join(path.dirname(PANEL), 'js/main.js'), 'utf8')
  const capFn = (a0h.match(/function mesA0_seedCapture[\s\S]*?\n}/) || [''])[0]
  const rcFn = (a0h.match(/function mesA0_renderableCount[\s\S]*?\n}/) || [''])[0]
  const beginFn = (a0h.match(/function mesA0_seedBegin[\s\S]*?\n}/) || [''])[0]

  ok('7c 캡처는 자동감지에서만', /String\(source\) === 'auto'/.test(beginFn))
  // 'sel' 은 선택이 그룹 **안쪽**일 수 있어 최상위 개수로 집합 동일성을 증명할 수 없다
  ok('7c 캡처는 그려지는 개체 수 == 후보 수일 때만', /rc === kept\.length/.test(beginFn) && /rc >= 0/.test(beginFn))
  ok('7c 조건 불충족이면 굽기로 되돌아간다', /if \(!rz\) rz = mesA0_seedRaster\(/.test(beginFn))
  // 잠긴 개체도 **그려진다** — 세야 한다. 숨김·숨은 레이어는 안 그려진다 — 빼야 한다.
  ok('7c 렌더 개수는 잠금을 세고 숨김을 뺀다',
    /!ly\.visible/.test(rcFn) && /\.hidden/.test(rcFn) && !/\.locked/.test(rcFn))
  ok('7c 캡처 해상도는 하한(72dpi) 안', /MESA0_CAPTURE_MAX_MMPP = 25\.4 \/ 72/.test(a0h)
    && /mmppWant < MESA0_CAPTURE_MAX_MMPP/.test(capFn) && /resolution = 25\.4 \/ mmpp/.test(capFn))
  ok('7c 캡처도 픽셀 예산을 지킨다', /wPx \* hPx > MESA0_SEED_MAX_PX/.test(capFn))
  // 흰 배경이 깔리면 '흰 잉크'와 배경을 구분할 수 없다 — 굽기(transparency=true)와 같은 이유
  ok('7c 캡처 배경은 투명(matte 금지)', /transparency = true/.test(capFn) && /matte = false/.test(capFn))
  // ceil 은 부동소수 오차로 1px 더 준다(실측: 364mm/0.25 → 1457, 실제 PNG 1456)
  ok('7c 캡처 픽셀 수는 round(ceil 금지)',
    /Math\.round\(wMm \/ mmpp\)/.test(capFn) && !/Math\.ceil\(wMm \/ mmpp\)/.test(capFn))
  ok('7c 어느 경로로 구웠는지 응답에 남는다', /"via":"/.test(a0h) && /via: 'capture'/.test(a0h) && /via: 'bake'/.test(a0h))
  // ★1px 만 어긋나도 seedArgmaxLabel 의 행 인덱싱이 밀려 **엉뚱한 조각에 라벨이 붙는다**(조용히 틀린다)
  ok('7c 패널이 마스크 픽셀 수를 실제 PNG 에 맞춘다 · seedSplit 앞에서',
    /img\.W !== r\.w[\s\S]{0,500}seedSplit\(/.test(a0m))
}

// ── 7d 품목(item_id) 배선 (2026-09-01) ───────────────────────────────
// 대기물이 item_id 를 실어 오면 주문서가 품목과 **단가까지** 자동으로 채운다
// (orderForm/intake.js → applyItemSelection → /api/prices). 그 자리가 비어 있어서
// 라인마다 사람이 품목·단가를 다시 골랐다 — 남은 이중입력의 본체였다.
// ⚠️ 정확일치만 해소한다. 부분일치로 넘겨짚으면 **틀린 단가**가 주문서에 실린다.
{
  const a0h = fs.readFileSync(path.join(REPO, 'IllustratorAutomat', 'designer', 'mes-a0-host.jsx'), 'utf8')
  const a0m = fs.readFileSync(path.join(path.dirname(PANEL), 'js/main.js'), 'utf8')
  const html = fs.readFileSync(PANEL, 'utf8')
  const wb = fs.readFileSync(path.join(REPO, 'src', 'routes', 'workbench.ts'), 'utf8')
  const idFn = (a0m.match(/function idBySquash[\s\S]{0,700}/) || [''])[0]

  ok('7d 가공 폼에 품목 칸', /id="item"/.test(html) && /id="itemSug"/.test(html) && /id="itemHit"/.test(html))
  // ★id 해소 = 원문 정확일치 **먼저**, 그다음 공백만 지운 일치, 그것도 **후보가 하나일 때만**.
  //   일러 CEP 는 IME 조합을 웹뷰에 안 넘긴다(2026-09-02 실측: composition 이벤트 0건 ·
  //   `isComposing` 항상 false) — 마지막 글자를 스페이스로 확정해야 들어오고 그 공백이 이름
  //   안에 남는다. 제품 이름의 97%(254/263)가 공백을 포함하므로 예외가 아니라 기본 경로다.
  //   ⚠️ 되돌리면 「가로등배」로는 「가로등 배너」를 못 찾는다 — 기능이 죽은 채 조용히 남는다.
  //   ⚠️ 완화해도 **부분일치는 여전히 금지**다(`indexOf` 없음). 넘겨짚으면 틀린 단가가 실린다.
  //      공백만 다른 이름이 실제로 있어(거래처 1쌍) 모호하면 **안 고르고 null** 을 준다.
  ok('7d id 해소 = 원문 우선 · 공백무시는 유일할 때만 · 부분일치 금지', (() => {
    const exact = idFn.indexOf("[field] === t") >= 0
    const squash = /squash\(list\(\)\[i\]\[field\]\) !== q/.test(idFn)
    const ambiguous = /if \(hit !== null\) return null/.test(idFn)
    return exact && squash && ambiguous && !/indexOf/.test(idFn)
      && /var itemIdOf = idBySquash/.test(a0m) && /var clientIdOf = idBySquash/.test(a0m)
  })())
  ok('7d 제안 목록도 공백을 무시한다', (() => {
    const n = (a0m.match(/squash\(nm\)\.indexOf\(qq\)/g) || []).length
    return /function squash\(/.test(a0m) && n === 2   // 거래처 · 품목 둘 다
  })())
  ok('7d 패널이 item_id 를 싣는다', /item_id: itemIdOf\(/.test(a0m))
  ok('7d 호스트 manifest 에 item_id', /item_id: \(P\.item_id != null\)/.test(a0h))
  // 축은 is_sales_item 이 아니라 item_type 이다 — 판매 가능 여부로 거르면 원자재가 섞인다
  // (2026-09-01 실측: 818건 앞머리가 「300D 무연새틴 · 3M IJ35C-10」. PRODUCT 만 268종·라인의 74.2%)
  ok('7d 서버가 품목 목록을 config 로 내보낸다(제품만)',
    /item_type = 'PRODUCT'/.test(wb) && /items: items\.results/.test(wb))
  // 대기물의 법인 = 주문에 붙을 때 정해진다. 술어는 상태가 아니라 order_item_id 여야
  // 「취소는 되는데 복구가 안 되는」 비대칭이 안 생긴다.
  // ★「조」 = 가로등배너 전용. 파일 한 장(120×180)이 낱개 두 장(60×180)이고 청구는 **개**다
  //   (품목 `전사 가로등배너 폰지 60×180 · unit=EA · FIXED 5,000` · 이카운트도 2개로 청구).
  //   ⚠️ 환산이 없으면 「1」이 1조인지 1개인지 아무도 모른 채 **절반만 청구**된다(에러 없음).
  //   ⚠️ 환산 지점은 **gatherParams 하나**여야 한다. 행 적용 경로가 같은 함수를 다시 부르므로
  //      값이 누적되지 않는다 — 다른 곳에 또 넣으면 그 보장이 깨진다.
  ok('7d 수량 단위 [개|조] · 조는 ×2 · 환산은 한 곳', (() => {
    const gp = (a0m.match(/function gatherParams[\s\S]{0,600}/) || [''])[0]
    return /id="qtyUnit"/.test(html)
      && /qty = qty \* qtyPerUnit\(\)/.test(gp)
      && /'set' \? 2 : 1/.test(a0m)
      && (a0m.match(/qtyPerUnit\(\)/g) || []).length === 2   // 정의 1 + 호출 1
  })())
  // 값은 개로만 흐르고 단위는 **표시·검산용**으로만 남는다 — 계산에 쓰면 청구 축이 둘로 갈린다
  ok('7d 단위는 흔적만 남긴다(계산 아님)', (() => {
    const intake = fs.readFileSync(path.join(REPO, 'src', 'scripts', 'orderForm', 'intake.js'), 'utf8')
    return /qty_unit: \(P\.qty_unit === 'set'\)/.test(a0h)
      && /const qtyUnit = String\(body\.qty_unit \|\| ''\) === 'set'/.test(wb)
      && /r\.qty_unit === 'set'/.test(intake)
      && !/qty_unit[\s\S]{0,80}\* 2/.test(wb)   // 서버가 다시 곱하지 않는다
  })())
  ok('7d 미귀속 대기물은 법인 공용 · 흡수 시 주문 법인으로 확정',
    /order_item_id IS NULL OR \(1=1/.test(wb)
    && /entity_id = COALESCE\(\?, entity_id\)/.test(wb)
    && (wb.match(/absorbEntityOf\(c\.env\.DB/g) || []).length >= 2)
}

// ── 7e 주석 위치 좌표는 경계선 분기 밖 (2026-09-11) ─────────────────────
// 경계선 OFF 가 기본값이 된 2026-08-06 부터 한 달간 주석이 **전 건** 사라졌는데 어느 게이트도 못 봤다.
// 이유 = 여백 경계 bL~bB 가 경계선 `if` 안에 선언돼 OFF 면 undefined → 주석 position NaN → 빈 catch.
// 「기능이 켜진 채로 끝났는가」를 보는 게이트가 없던 자리다(CLAUDE.md §조용한 격하).
{
  const a0h = fs.readFileSync(path.join(REPO, 'IllustratorAutomat', 'designer', 'mes-a0-host.jsx'), 'utf8')
  const a0m = fs.readFileSync(path.join(path.dirname(PANEL), 'js/main.js'), 'utf8')
  const iB = a0h.indexOf('var bL = oL - finMargins.left')
  const iBorder = a0h.indexOf('if (P.border_line !== false) {')
  ok('7e 여백 경계 bL~bB 는 경계선 if 앞에서 선언된다', iB > 0 && iBorder > 0 && iB < iBorder,
    '경계선 OFF 면 주석 좌표가 NaN')
  ok('7e 주석 실패를 삼키지 않는다(annotation_error·warn A)',
    /catch \(eAnn\) \{ annotErr/.test(a0h) && /annotation_error: annotErr \|\| null/.test(a0h) && /\(annotErr \? 'A' : ''\)/.test(a0h))
  ok('7e 패널이 주석 실패 코드 A 를 사람 말로 띄운다', /A: '주석 그리기 실패/.test(a0m))
  // 호스트는 키워드 없이도 그린다 — 패널 안내문이 「안 나온다」고 말하면 오진을 만든다(2026-09-10 실기)
  ok('7e 키워드 없이도 주석이 나간다(호스트) · 패널 문구도 그렇게 말한다',
    /parts\.push\(qty \+ 'ea'\)/.test(a0h) && !/키워드가 비어 주석이 안 나옵니다/.test(a0m))
}

// ── 7f 펀칭 개수 = 실제 뚫리는 자리 (2026-09-11 용준님 「나」) ─────────────────
// 호스트는 변 N 을 **양 끝 포함**으로 분배해 상2 가 좌상·우상 자리와 겹친다. 사람이 머리로 세면 틀리므로
// 패널이 결과를 센다 — 그리고 그 문장은 웹 라벨(shared/finishingLabel.js `MES_FIN.punching`)과 **같아야** 한다.
// 셋(호스트 좌표 · 패널 개수 · 웹 라벨)이 각자 규칙을 갖던 것이 이 결함의 뿌리라, 셋을 한 번에 대조한다.
{
  const a0h = fs.readFileSync(path.join(REPO, 'IllustratorAutomat', 'designer', 'mes-a0-host.jsx'), 'utf8')
  const a0m = fs.readFileSync(path.join(path.dirname(PANEL), 'js/main.js'), 'utf8')
  const a0i = fs.readFileSync(PANEL, 'utf8')
  const agent = fs.readFileSync(path.join(REPO, 'IllustratorAutomat', 'ProcessOrderItem.jsx'), 'utf8')
  const sharedJs = path.join(REPO, 'src', 'scripts', 'shared', 'finishingLabel.js')
  // 호스트 규칙이 그대로인가 — 양 끝 포함 분배식 + dedupe. 여기가 바뀌면 패널 punchLayout 도 같이 바꿔야 한다.
  ok('7f 호스트 변 분배 = 양 끝 포함(N=1 가운데)', /\(iTop === 1\) \? \(\(hx0 \+ hx1\) \/ 2\) : \(hx0 \+ \(hx1 - hx0\) \* hi \/ \(iTop - 1\)\)/.test(a0h)
    && /var TOLP = 0\.1 \* MESA0_PT_PER_MM \/ sN/.test(a0h))
  // 에이전트(축1)도 같은 규칙 — 전엔 「코너 따로 + 안쪽 N」(W*(i+1)/(N+1)) 이라 같은 입력이 다른 판을 만들었다
  ok('7f 에이전트 변 분배 = 양 끝 포함 + dedupe', /\(n === 1\) \? \(a \+ b\) \/ 2 : a \+ \(b - a\) \* i \/ \(n - 1\)/.test(agent)
    && /var TOLP = 0\.1 \* ptPerMm/.test(agent) && !/designW \* \(ti\+1\) \/ \(sideTop\+1\)/.test(agent))
  ok('7f 「꼭짓점」은 화면·파일명에서 사라졌다(=모서리)', !/꼭짓점/.test(a0i) && !/'꼭짓점펀칭'/.test(a0m))
  ok('7f 파일명 세그먼트 = 위치어+총개수', /segs\.push\(pw \+ '펀칭' \+ L\.total\)/.test(a0m))

  // DOM: 칸에 넣은 값 → 결과 문장. 웹 라벨과 같은 입력을 넣어 **같은 문장**인지 본다.
  await page.click('.tab[data-tab="single"]')
  if (await page.locator('#finBody').isHidden()) await page.click('#finToggle')
  await page.addScriptTag({ path: sharedJs })
  const setPunch = async (v) => {
    for (const [id, k] of [['#pTop', 'top'], ['#pBottom', 'bottom'], ['#pLeft', 'left'], ['#pRight', 'right']]) await page.fill(id, String(v[k] || 0))
    for (const [id, k] of [['#pcTL', 'tl'], ['#pcTR', 'tr'], ['#pcBL', 'bl'], ['#pcBR', 'br']]) await page.setChecked(id, !!(v.corners && v.corners[k]))
    return page.locator('#punchResult').innerText()
  }
  const webParams = (v) => ({ side_top: v.top || 0, side_bottom: v.bottom || 0, side_left: v.left || 0, side_right: v.right || 0,
    corner_tl: v.corners && v.corners.tl ? 1 : 0, corner_tr: v.corners && v.corners.tr ? 1 : 0, corner_bl: v.corners && v.corners.bl ? 1 : 0, corner_br: v.corners && v.corners.br ? 1 : 0 })
  const cases = [
    [{ top: 3, bottom: 3, left: 3, right: 3 }, '펀칭 8개(모서리 4, 4변 1)'],
    [{ top: 3, bottom: 3 }, '펀칭 6개(모서리 4, 상하 1)'],
    [{ top: 2, bottom: 2, left: 3, right: 1 }, '펀칭 6개(모서리 4, 좌우 1)'],   // 용준님 예시: 좌 3 의 가운데 + 우 1 = 가운데 → 「좌우 1」
    [{ corners: { tl: true, tr: true, bl: true, br: true } }, '펀칭 4개(모서리 4)'],
    [{ top: 2, bottom: 2, corners: { tl: true, tr: true, bl: true, br: true } }, '펀칭 4개(모서리 4)'],
    [{ top: 4, corners: { tl: true, tr: true } }, '펀칭 4개(모서리 좌상·우상, 상 2)'],
    [{ left: 3, right: 3 }, '펀칭 6개(모서리 4, 좌우 1)'],
    [{ top: 1, bottom: 1 }, '펀칭 2개(상하 1)'],
    [{ top: 5, left: 3 }, '펀칭 7개(모서리 좌상·우상·좌하, 상 3, 좌 1)'],
  ]
  for (const [v, want] of cases) {
    const got = await setPunch(v)
    ok('7f 패널 결과 ' + JSON.stringify(v), got === want, `실제 「${got}」`)
    const web = await page.evaluate((p) => window.MES_FIN.punching(p), webParams(v))
    ok('7f 웹 라벨과 같은 문장 ' + JSON.stringify(v), '펀칭 ' + web === got, `웹 「펀칭 ${web}」 ≠ 패널 「${got}」`)
  }
  const empty = await setPunch({})
  ok('7f 비면 규칙 안내가 남는다', /펀칭 = 변마다 개수/.test(empty), empty)
  // 행 연동 복원에서도 결과가 따라온다 — applyRowToForm 이 updatePunchResult 를 부른다
  ok('7f 행→폼 복원·초기화가 결과를 갱신한다', (a0m.match(/updatePunchResult\(\);/g) || []).length >= 3)
}

// ── 7g 모아찍기 잔재 정리 = S4 (2026-09-11) ─────────────────────────────────
// S2(08-05)는 입구(탭 버튼·화면)만 막고 로직은 「S4 에서」라고 적어 두었다. 그 뒤 한 달간 없는 버튼 6개를
// 찾는 코드가 매 로드마다 경고를 남기고, `mode:'impose'` 분기 43줄이 살아 있었다. 입구가 사라진 기능의
// 로직이 되살아나지 않도록 심볼 자체가 없음을 본다.
{
  const a0m = fs.readFileSync(path.join(path.dirname(PANEL), 'js/main.js'), 'utf8')
  // 정의·호출만 본다 — SHELL_VERSION 변경 이력 문구에는 이름이 남아 있어도 된다
  ok('7g 모아찍기 로직 심볼 없음', !/(function |\b)(imposeSeed|queueAllImpose|updateImposeBar|stripFinishing|keepRowMode|setMode)\(/.test(a0m))
  ok('7g 없는 요소 참조 없음', !/\$\('(imposeBox|imposeGap|btnImpose\w+)'\)/.test(a0m))
  ok('7g 용도는 single 하나', /function modeValue\(\) \{ return 'single'; \}/.test(a0m))
}

// ── 8. 다른 PC 에서만 깨지던 축 (2026-09-08) ────────────────────────────────
//   전부 **이 PC 에서는 재현되지 않는다** — 한글 사용자명·Z: 미연결·호스트 사망은
//   개발 PC 에서 안 일어난다. 그래서 소스 규약으로 세는 것 말고는 세는 방법이 없다.
{
  const a0h = fs.readFileSync(path.join(REPO, 'IllustratorAutomat', 'designer', 'mes-a0-host.jsx'), 'utf8')
  const a0m = fs.readFileSync(path.join(path.dirname(PANEL), 'js/main.js'), 'utf8')
  const cutm = fs.readFileSync(path.join(path.dirname(PANEL), 'js/cut-main.js'), 'utf8')
  const inst = fs.readFileSync(path.join(REPO, 'scripts', 'install-a0-panel.ps1'), 'utf8')

  // evalScript 실패는 예외가 아니라 `'EvalScript error.'` 라는 평범한 문자열이다 →
  // 생짜 호출이 하나라도 남으면 그 자리에서 다시 `if (!res)` 가드를 통과한다.
  ok('8 가공 탭 evalScript 는 래퍼 한 곳만 부른다', (() => {
    const raw = (a0m.match(/csi\.evalScript\(/g) || []).length
    return raw === 1 && /function hostEval\(/.test(a0m) && /=== 'EvalScript error\.'/.test(a0m)
  })(), '생짜 csi.evalScript 잔존')
  ok('8 재단 탭도 같은 판정을 유지한다',
    (cutm.match(/cs\.evalScript\(/g) || []).length === 1 && /=== 'EvalScript error\.'/.test(cutm))

  // 원인 1건이 증상 N건으로 번역되지 않게 — 브릿지가 죽으면 남은 건은 '미시도'로 둔다.
  ok('8 배치·검토는 브릿지 사망 시 중단한다',
    /function abortBatch\(/.test(a0m) && /function abortLoop\(/.test(a0m)
    && /err: 'untried'/.test(a0m) && /untried:/.test(a0m))

  // params 는 파일이 안 써지면 인자로 간다(한글 사용자명 PC = cep.fs 실패).
  ok('8 params 는 cep.fs 실패 시 인자로 넘어간다',
    /function processExpr\(/.test(a0m)
    && /return 'mesA0_process\("'/.test(a0m)
    && /function mesA0_process\(inline\)/.test(a0h)
    && /\? String\(inline\)/.test(a0h))
  // 인자·반환 양쪽 다 ASCII 규약 — 한 쌍이라 한쪽만 있으면 의미가 없다.
  ok('8 브릿지는 양방향 ASCII 로 접는다',
    /function asciiJson\(/.test(a0m)
    && /\[\\u007F-\\uFFFF\]/.test(a0m)
    && /\[\\u007F-\\uFFFF\]/.test(a0h))

  // Z: 미연결·관리자 권한 실행을 `nofolder` 로 뭉개지 않는다(재단 호스트와 같은 문구).
  ok('8 Z: 루트 판정은 한 곳에서 나온다',
    /function mesA0_zReady\(/.test(a0h)
    && (a0h.match(/mesA0_zErrJson\(\)/g) || []).length >= 3   // 정의 1 + 단건 + 배치
    && /noz:/.test(a0m))

  // config 는 에이전트 PC 1대가 중계한다 — 멈추면 옛 파일이 그대로 남고 아무도 모른다.
  ok('8 config 나이를 화면에 표시한다',
    /function cfgAgeText\(/.test(a0m) && /data\.generated_at/.test(a0m) && /cfgAgeText\(gen\)/.test(a0m))

  // 설치기 검증 목록이 코드에 박히면 새 파일이 조용히 검증 밖으로 나간다(bleed·butt·placement 전례).
  ok('8 설치기 검증은 손목록이 아니다',
    /Get-ChildItem \$srcDir -Recurse -File/.test(inst)
    && !/foreach \(\$f in @\('CSXS/.test(inst)
    && /'13', '14'/.test(inst))

  // ★규약이 있다는 것과 **맞다는 것**은 다르다 — 이스케이프는 순서 하나만 뒤집혀도 조용히
  //   이중 이스케이프가 되고, 그건 존재 검사로는 절대 안 잡힌다. 실제 함수를 **소스에서 뽑아**
  //   값으로 돌린다(사본을 손으로 적으면 그 사본이 어긋나는 순간 검산이 거짓말을 한다).
  const grab = (src, header) => {
    const i = src.indexOf(header)
    if (i < 0) return null
    let d = 0
    for (let k = src.indexOf('{', i); k < src.length; k++) {
      if (src[k] === '{') d++
      else if (src[k] === '}') { d--; if (d === 0) return src.slice(i, k + 1) }
    }
    return null
  }
  const ASCII = /^[\x20-\x7E]*$/
  const bridge = (() => {
    const fa = grab(a0m, 'function asciiJson(o) {')
    const fp = grab(a0m, 'function processExpr(pp, obj) {')
    const fe = grab(a0h, 'function mesA0_jsonEsc(s) {')
    if (!fa || !fp || !fe) return { err: '함수를 못 찾음' }
    const asciiJson = new Function('return ' + fa + ';')()
    const jsonEsc = new Function('return ' + fe + ';')()
    // ★배포되는 `processExpr` **본체**를 돌린다. 이스케이프를 여기 다시 적으면 그 사본이
    //   맞는지를 재게 되고, 정작 나가는 코드의 순서가 뒤집혀도 게이트는 초록으로 남는다.
    //   cep.fs 는 항상 실패로 둔다 = 인자 경로 강제(이게 검산 대상이다).
    const processExpr = new Function('asciiJson', 'cepWriteUtf8',
      'var paramsViaArg = 0; ' + fp + '; return processExpr;')(asciiJson, () => false)
    // 값에 브릿지를 깨는 것들을 전부 섞는다: 한글 · 따옴표 · 역슬래시 · 줄바꿈 · 탭
    const obj = {
      client_name: '연안애드마트', keyword: '농협공판장 "특가"',
      post_desc: '사방접어미싱+\\백판', annotation: '줄바꿈\n둘째줄\t탭', qty: 3,
    }
    const expr = processExpr(null, obj)
    const m = /^mesA0_process\("([\s\S]*)"\)$/.exec(expr)
    if (!m) return { err: '인자 경로 표현식이 아니다: ' + expr.slice(0, 60) }
    const lit = m[1]
    // eval 2단 = ExtendScript 가 문자열 리터럴을 푸는 것 + 호스트의 eval('(' + raw + ')')
    let back = null
    try { back = eval('(' + eval('("' + lit + '")') + ')') } catch (e) { return { err: '복원 실패: ' + e } }
    const detail = '등록 폴더 없음(Z: 연결 확인): Z:/DESIGNS/IA-등록 | temp=OK'
    const res = '{"ok":false,"err":"noz","detail":"' + jsonEsc(detail) + '"}'
    let parsed = null
    try { parsed = JSON.parse(res) } catch (e) { parsed = null }
    return {
      argOk: ASCII.test(expr) && JSON.stringify(back) === JSON.stringify(obj),
      resOk: ASCII.test(res) && !!parsed && parsed.detail === detail,
    }
  })()
  ok('8 인자 왕복이 원본을 그대로 되돌린다(값 검산)', bridge.argOk === true, bridge.err || '왕복 불일치')
  ok('8 실패 응답이 ASCII 로 나가고 원문이 복원된다(값 검산)', bridge.resOk === true, bridge.err || '응답 불일치')

  // ── 9. 「이 PC 가 준비됐는가」를 물어보지 않고 재는 길 (2026-09-08) ──────
  const idx = fs.readFileSync(PANEL, 'utf8')
  ok('9 환경 점검 버튼이 탭 밖에 있다',
    /id="btnEnv"/.test(idx) && /id="envOut"/.test(idx)
    && idx.indexOf('id="envOut"') < idx.indexOf('data-main-page="a0"'))
  ok('9 호스트가 환경을 한 번에 잰다', (() => {
    const need = ['tempAscii', 'tempWrite', 'zWrite', 'cfgAgeH', 'installAscii', 'loadErr']
    for (let i = 0; i < need.length; i++) if (a0h.indexOf("'" + need[i] + "'") < 0) return false
    return /function mesA0_envCheck\(/.test(a0h)
  })(), 'mesA0_envCheck 항목 누락')
  // 구버전 호스트가 깔린 PC 에서 버튼이 조용히 아무것도 안 하면 안 된다.
  ok('9 구버전 호스트를 구분해 말한다',
    /typeof mesA0_envCheck === "function"/.test(a0m) && /구버전/.test(a0m))
  ok('9 manifest 가 일러 버전을 남긴다', /ai_version:/.test(a0h))

  // ── 10. 일러가 파일을 못 쓸 때 **누가 쓰는가** (2026-09-09) ──────────────
  //   실기(DESKTOP-6JSH6OL)에서 가공 도중 일러 프로세스의 파일 자원이 고갈된다:
  //   로컬 temp 와 Z: 가 동시에 I/O 오류이고, 일러 자신의 export 도 실패하며,
  //   config.json 180KB 가 0바이트로 읽혔다. CEP 는 별도 프로세스라 그 순간에도 멀쩡하다.
  //   ⇒ 등록의 마지막 한 조각(manifest)을 패널이 쓸 수 있어야 한다. 그 계약을 여기서 센다.
  ok('10 성공 응답을 쓰기보다 먼저 조립한다',
    a0h.indexOf('var okRes =') > 0
    && a0h.indexOf('var okRes =') < a0h.indexOf('if (!mesA0_writeText(mfPath'),
    '실패 시 성공 필드를 잃으면 패널이 구제해도 완료 화면을 못 만든다')
  // 정규식으로 형태를 통째로 박으면 필드 하나 늘 때마다 헛돈다 — 뜻(무엇을 물고 있나)만 본다.
  ok('10 못 쓴 manifest 를 호스트가 물고 있는다',
    a0m !== null
    && a0h.indexOf('$.global.mesA0MfPending = { path: mfPath, mf: mfJson, res: okRes') > 0
    // ★픽업 복사에 필요한 것은 더 이상 안 물고 간다 (2026-09-15) — 복사가 에이전트로 넘어가
    //   manifest 만 써지면 나머지는 따라온다. 물고 갈 것은 **쓸 것(path·mf)과 돌려줄 것(res)** 뿐이다.
    && a0h.indexOf('"mfpending":true') > 0)
  ok('10 인계 창구가 있다(가져가기·놓기)',
    /function mesA0_manifestPending\(/.test(a0h) && /function mesA0_manifestDone\(/.test(a0h))
  ok('10 성공하면 앞 건의 잔여를 지운다', /\$\.global\.mesA0MfPending = null;/.test(a0h))
  // 텍스트를 전부 아웃라인한 뒤라 임베드할 폰트가 없다 — true 고정은 폰트 2,159개 PC 에서
  // 저장할 때마다 문서 폰트를 열게 해 자원을 태운다(자원 고갈의 유력 원인).
  ok('10 EPS 폰트 임베드는 남은 텍스트가 있을 때만',
    /embedAllFonts = \(outlineFailed \|\| pfRemainingText > 0\)/.test(a0h)
    && !/embedAllFonts = true/.test(a0h), 'true 고정으로 되돌아갔다')
  // ⚠️ 닫는 괄호까지 본다 — `r.mfpending` 만 보면 `r.mfpendingX` 도 통과한다(실측 2026-09-09).
  ok('10 패널이 그 분기를 탄다',
    /r\.err === 'manifest' && r\.mfpending\)/.test(a0m) && /function rescueManifest\(/.test(a0m))
  // ★단건만 고치고 배치를 빼면 묶음 등록에서만 조용히 옛 실패로 남는다(형제 스윕).
  //   `mesA0_process` 를 실제로 등록에 쓰는 경로는 단건과 배치 둘이다(검토는 manifest 를 안 쓴다).
  ok('10 배치도 같은 구제를 받는다',
    (a0m.match(/r\.err === 'manifest' && r\.mfpending\)/g) || []).length === 2,
    '단건만 구제되고 일괄 확정·모아찍기 등록은 그대로 실패한다')
  ok('10 구제 구현은 한 벌이다',
    (a0m.match(/function rescuePending\(/g) || []).length === 1
    && (a0m.match(/rescuePending\(/g) || []).length === 3)
  ok('10 패널은 cep.fs 로 쓴다(일러를 안 거친다)',
    (a0m.match(/cepWriteUtf8\(p\.path, p\.mf\)/g) || []).length === 1)
  // 두 벌이면 한쪽만 고쳐진다 — 구제 경로와 정상 경로가 **같은 화면**을 써야 한다.
  ok('10 성공 화면은 한 벌이다',
    (a0m.match(/function renderOk\(/g) || []).length === 1
    && (a0m.match(/renderOk\(/g) || []).length === 3)
  ok('10 둘 다 실패하면 실패라고 말한다', /일러도 패널도 못 썼습니다/.test(a0m),
    '조용한 성공 금지')
  ok('10 환경 점검이 cep.fs 를 잰다',
    /function cepProbe\(/.test(a0m) && /cep\.fs 쓰기\(Z: 한글경로\)/.test(a0m),
    '폴백이 기대는 길을 PC 마다 재지 않으면 추측이 된다')

  // ★값 검산 — 인계가 **원문을 그대로** 되돌리는가. 배포되는 함수를 그대로 돌린다.
  const handoff = (() => {
    const fe = grab(a0h, 'function mesA0_jsonEsc(s) {')
    const fj = grab(a0h, 'function mesA0_toJson(v) {')
    const fp = grab(a0h, 'function mesA0_manifestPending() {')
    if (!fe || !fj || !fp) return { err: '함수를 못 찾음' }
    const jsonEsc = new Function('return ' + fe + ';')()
    const toJson = new Function('mesA0_jsonEsc', fj + '; return mesA0_toJson;')(jsonEsc)
    const BS = String.fromCharCode(92)
    const manifest = {
      client_name: '연안애드마트', keyword: '농협공판장 "특가"' + BS + '역슬래시',
      post_desc: '사방접어미싱+백판', qty: 3, measured_cm: { w: 280, h: 179 },
    }
    const mf = toJson(manifest)                       // 호스트가 파일에 쓰려던 원문
    const mfPath = 'Z:/DESIGNS/IA-등록/20260909_101936_PC_214/manifest.json'
    const res = '{"ok":true,"folder":"20260909_101936_PC_214","w":280,"h":179}'
    // ★배포되는 `mesA0_manifestPending` **본체**를 돌린다. 조립을 여기 다시 적으면
    //   그 사본이 맞는지를 재게 되고, 정작 나가는 코드가 틀려도 게이트는 초록으로 남는다.
    const G = { global: { mesA0MfPending: { path: mfPath, mf: mf, res: res } } }
    const manifestPending = new Function('$', 'mesA0_jsonEsc',
      fp + '; return mesA0_manifestPending;')(G, jsonEsc)
    const pending = manifestPending()
    if (!ASCII.test(pending)) return { err: '브릿지로 못 나가는 문자가 남았다' }
    let p = null
    try { p = JSON.parse(pending) } catch (e) { return { err: '패널 파싱 실패: ' + e } }
    if (p.path !== mfPath) return { err: '경로가 안 돌아옴: ' + p.path }
    if (p.res !== res) return { err: '성공 응답이 안 돌아옴' }
    let back = null
    try { back = JSON.parse(p.mf) } catch (e) { return { err: 'manifest 가 유효 JSON 이 아니다: ' + e } }
    return { okv: JSON.stringify(back) === JSON.stringify(manifest) }
  })()
  ok('10 인계가 manifest 원문을 그대로 되돌린다(값 검산)', handoff.okv === true,
    handoff.err || '원문 불일치')

  // ── 11. 「자원이 모자라서인가」를 **재는** 도구 (2026-09-09) ─────────────
  //   추측을 게이트가 지킬 수는 없다. 지킬 수 있는 것은 **계측이 계측 구실을 하는가**다.
  ok('11 프로브는 단계마다 다른 파일명을 쓴다',
    /mes_iop_' \+ tag/.test(a0h),
    '같은 이름이면 두 번째부터 덮어쓰기다 — 「만들 수 있는가」가 아니라 「고칠 수 있는가」를 재게 된다')
  ok('11 프로브는 만든 것을 지운다', /if \(f\.exists\) left = !f\.remove\(\)/.test(a0h))
  // 이등분이 되려면 **호출 순서대로** 박혀 있어야 한다.
  ok('11 프로브가 호출 흐름을 따라 박혀 있다', (() => {
    // outcopy 는 **커밋 뒤**로 옮겨져 프로브 대상이 아니다(2026-09-10, 13군 참조)
    const order = ['start', 'copy', 'outline', 'ai', 'eps', 'thumb']
    let prev = -1
    for (let i = 0; i < order.length; i++) {
      const at = a0h.indexOf("mesA0_ioProbe('" + order[i] + "')")
      if (at < 0 || at < prev) return false
      prev = at
    }
    return /MESA0_IOPROBE = '';/.test(a0h)
  })(), '지점 누락 또는 순서 뒤바뀜')
  ok('11 실패 응답이 프로브를 싣는다',
    (a0h.match(/"ioprobe":"' \+\s*\n?\s*mesA0_jsonEsc\(MESA0_IOPROBE\)|ioprobe":"' \+ mesA0_jsonEsc\(MESA0_IOPROBE\)/g) || []).length >= 1
    && /"ioprobe"/.test(a0h))
  // 정규식으로 쓰면 이스케이프가 한 겹 더 끼어 게이트가 조용히 헛돈다 — 문자열로 본다.
  ok('11 실패는 항상·성공은 이상할 때만 보여준다',
    a0m.indexOf('if (r.ioprobe) detail +=') > 0
    && a0m.indexOf('(r.ioprobe && /X|') > 0,
    '실패에도 안 띄우거나, 성공에 매번 띄워 사람이 안 읽게 된다')
  ok('11 부하 시험 버튼이 있고 구버전을 구분한다',
    /id="btnStress"/.test(idx) && /typeof mesA0_ioStress === "function"/.test(a0m))

  // ★값 검산 — 부하 시험이 **첫 실패에서 멈추고 만든 것을 전부 지우는가**.
  //   배포되는 함수를 파일 시스템만 갈아끼워 그대로 돌린다.
  const stress = (() => {
    const fs2 = grab(a0h, 'function mesA0_ioStress(n) {')
    if (!fs2) return { err: '함수를 못 찾음' }
    const existing = {}
    const removed = []
    const FolderStub = { temp: { fsName: 'C:/T' } }
    function FileStub(p) { this.p = p }
    Object.defineProperty(FileStub.prototype, 'exists', { get: function () { return !!existing[this.p] } })
    FileStub.prototype.remove = function () { removed.push(this.p); delete existing[this.p]; return true }
    let n2 = 0
    const writeText = (p) => { if (n2 >= 37) return false; n2++; existing[p] = 1; return true }
    const ioStress = new Function('Folder', 'File', 'mesA0_writeText', 'MESA0_IO_ERR', 'mesA0_jsonEsc',
      fs2 + '; return mesA0_ioStress;')(FolderStub, FileStub, writeText, '디스크가 가득 참', (s) => String(s))
    let o = null
    try { o = JSON.parse(ioStress(200)) } catch (e) { return { err: '응답 파싱 실패: ' + e } }
    if (o.n !== 200) return { err: 'n 불일치: ' + o.n }
    if (o.made !== 37) return { err: '첫 실패에서 안 멈춤: made=' + o.made }
    if (o.firstFail !== 37) return { err: '실패 번호가 틀림: ' + o.firstFail }
    if (removed.length !== 37) return { err: '만든 것을 다 안 지움: ' + removed.length }
    if (o.left !== 0) return { err: 'left 오계산: ' + o.left }
    if (o.err !== '디스크가 가득 참') return { err: '사유를 안 실음: ' + o.err }
    return { okv: true }
  })()
  ok('11 부하 시험이 첫 실패에서 멈추고 뒷정리한다(값 검산)', stress.okv === true,
    stress.err || '동작 불일치')

  // ── 12. 읽기가 죽어도 보낼 길 (2026-09-09) ──────────────────────────────
  //   파일 경로를 고르는 판단은 「쓸 수 있나」인데 실패하는 것은 「읽을 수 있나」다.
  ok('12 params 를 못 읽으면 인자로 재시도한다',
    /function runProcessExpr\(/.test(a0m)
    && /var PARAMS_UNREADABLE = \{ noparams: 1, emptyparams: 1, badparams: 1 \}/.test(a0m))
  // ★세 경로가 **전부** 이 길을 지나야 한다 — 하나라도 새면 거기서만 옛 실패로 남는다.
  ok('12 모든 process 호출이 그 길을 지난다', (() => {
    const raw = (a0m.match(/hostEval\(processExpr\(/g) || []).length      // runProcessExpr 안 1곳뿐
    const stale = (a0m.match(/hostEval\(pexpr/g) || []).length            // 배치·검토가 생짜로 부르면 안 된다
    const routed = (a0m.match(/runProcessExpr\(pexpr, p,/g) || []).length // 검토 + 배치
    return raw === 1 && stale === 0 && routed === 2 && /runProcess\(pp, params,/.test(a0m)
  })(), '한 경로가 새면 거기서만 옛 실패로 남는다')
  ok('12 호스트 미로드를 사람 말로 옮긴다',
    /function hostNotLoaded\(/.test(a0m) && /function isHostMissing\(/.test(a0m)
    && /함수가 아닙니다/.test(fs.readFileSync(path.join(path.dirname(PANEL), 'js/cut-main.js'), 'utf8')))
  // 백슬래시가 든 패턴은 이 파일을 거치며 한 겹 풀려 게이트가 조용히 헛돈다 — 위치로 본다.
  ok('12 배치 실패 줄에도 프로브가 실린다', (() => {
    const at = a0m.indexOf("lines.push('#' + (k + 1) + ' ✗ ' + lbl")
    return at > 0 && a0m.slice(at, at + 300).indexOf('[단계별 파일쓰기]') > 0
  })(), '일괄에서만 방아쇠를 못 보게 된다')

  // ★값 검산 — 배포되는 `runProcessExpr` 본체를 돌린다.
  //   ⓐ 파일로 보냈다가 noparams 를 받으면 **인자 경로로** 다시 보내는가
  //   ⓑ 이미 인자 경로였으면 **재시도하지 않는가**(무한 반복 방지)
  const flow = (() => {
    const fr = grab(a0m, 'function runProcessExpr(expr, obj, cb) {')
    const fpx = grab(a0m, 'function processExpr(pp, obj) {')
    const fa2 = grab(a0m, 'function asciiJson(o) {')
    if (!fr || !fpx || !fa2) return { err: '함수를 못 찾음' }
    const aj = new Function('return ' + fa2 + ';')()
    // cep.fs 는 **쓰기에 성공**한다 = 파일 경로가 선택된다(실기와 같은 조건)
    const pe = new Function('asciiJson', 'cepWriteUtf8',
      'var paramsViaArg = 0; ' + fpx + '; return processExpr;')(aj, () => true)
    const UNREAD = { noparams: 1, emptyparams: 1, badparams: 1 }
    const mk = (he) => new Function('hostEval', 'processExpr', 'PARAMS_UNREADABLE', 'paramsUnreadable',
      fr + '; return runProcessExpr;')(he, pe, UNREAD, 0)

    const seen = []
    const rp = mk((expr, cb) => {
      seen.push(expr)
      cb(seen.length === 1 ? '{"ok":false,"err":"noparams"}' : '{"ok":true,"folder":"F"}', null)
    })
    let got = null
    rp('mesA0_process()', { client_name: '연안애드마트', qty: 3 }, (r) => { got = r })
    if (seen.length !== 2) return { err: '재시도가 안 일어남(호출 ' + seen.length + '회)' }
    if (seen[1].indexOf('mesA0_process("') !== 0) return { err: '두 번째가 인자 경로가 아니다: ' + seen[1].slice(0, 40) }
    if (!got || got.ok !== true) return { err: '재시도 결과를 안 돌려줌' }

    const seen2 = []
    const rp2 = mk((expr, cb) => { seen2.push(expr); cb('{"ok":false,"err":"noparams"}', null) })
    rp2('mesA0_process("{}")', {}, () => {})
    if (seen2.length !== 1) return { err: '인자 경로인데도 재시도했다 — 무한 반복 위험' }
    return { okv: true }
  })()
  ok('12 파일→인자 재시도가 한 번만 일어난다(값 검산)', flow.okv === true, flow.err || '흐름 불일치')

  // ── 13. 커밋 경계 (2026-09-10 · 2026-09-15 축 이동) ─────────────────────
  //   `_출력` 복사는 산출이 아니라 **「출력해도 된다」는 신호**다. 등록이 확정되기 전에 놓으면
  //   MES 에 주문이 없는 출력물이 생긴다 — 실측 2026-09-09 에 188MB 2건이 그렇게 놓여 있었다.
  //   ★2026-09-15 복사가 **에이전트(.NET)** 로 넘어갔다. 지켜야 할 성질은 그대로이므로
  //     검사 대상만 옮긴다 — 성질을 지우면 사고가 조용히 돌아온다.
  const agentCs = fs.readFileSync(path.join(REPO, 'IllustratorAutomat', 'Program.cs'), 'utf8')
  //   ⚠️ 이름만으로 찾으면 **버전 이력 주석**이 걸린다(0.16.0 이 무엇을 뺐는지 적어 둔 그 줄).
  //      지워진 것은 코드이므로 호출·정의 형태(`(`)로만 센다.
  ok('13 픽업 복사가 JSX 축에 없다',
    !/mesA0_outCopy\(|mesA0_copyVerify\(/.test(a0h) && !/epsFile\.copy\(/.test(a0h),
    '복사 경로가 둘이면 한쪽만 고쳐진다 — 픽업 정본은 에이전트다')
  ok('13 패널이 못 보는 실패를 화면에 안 남긴다', !/r\.outcopy|rr\.outcopy/.test(a0m),
    '알 수 없는 것을 띄우면 다음 사람이 그걸 증상으로 읽는다')
  // ★에이전트 축의 같은 성질 — 복사는 **manifest 를 읽은 뒤**이고 `.ingested` 기록 뒤다.
  ok('13 에이전트 픽업이 커밋 뒤에 있다', (() => {
    const ing = agentCs.indexOf('".ingested"')
    const cp = agentCs.indexOf('EnsurePickupCopy(folder, manifestPath, sfx)')
    return ing > 0 && cp > ing
  })(), '등록이 확정되기 전에 출력물이 픽업 폴더에 놓인다')
  ok('13 에이전트 픽업은 빠진 것을 다시 메운다',
    /static void SweepPickupRecent\(/.test(agentCs) && /SweepPickupRecent\(root\);/.test(agentCs),
    '한 번 실패하면 영영 비는 자리가 된다')
  ok('13 manifest 는 커밋 시점의 사실만 담는다', /out_copy_error: null,/.test(a0h))
  // ★`work.ai` 는 모아찍기에서만 (2026-09-15) — 단건에서 되살아나면 Z: 쓰기가 조용히 2배가 된다.
  ok('13 work.ai 는 모아찍기에서만 쓴다',
    /if \(!review && mode === 'impose'\) \{/.test(a0h) && /files: \{ work_ai: workAiName,/.test(a0h),
    '단건이 다시 work.ai 를 쓰면 아무도 안 읽는 파일에 Z: 쓰기를 쓴다')

  // ── 조용히 쌓이는 것을 센다 ─────────────────────────────────────────────
  ok('13 커밋이 안 끝난 폴더를 센다',
    /function mesA0_scanRegister\(/.test(a0h)
    && /o\.orphan\+\+/.test(a0h) && /o\.pending\+\+/.test(a0h))
  // ⚠️ 나이 하한이 없으면 **지금 쓰는 중인 폴더**를 잔해로 세어 거짓 경보가 된다.
  ok('13 지금 쓰는 중인 폴더를 잔해로 세지 않는다',
    /if \(ageH > 1\)/.test(a0h) && /ageH > 0\.2/.test(a0h),
    '나이 하한이 없으면 다른 PC 가 쓰는 중인 폴더가 잔해로 잡힌다')
  ok('13 패널이 잔해·미반영을 띄운다',
    a0m.indexOf("'등록 잔해'") > 0 && a0m.indexOf('e.pendingIngest') > 0
    && a0m.indexOf('e.scanned !== undefined') > 0,
    '구버전 호스트에서 0건으로 보이면 안 된다')
  // ── 14. 픽업 이름 충돌을 **사람에게** 알린다 (2026-09-18) ────────────────
  //   픽업 폴더 `_출력/<날짜>` 는 **날짜당 한 자리**이고 에이전트는 크기가 다르면 덮어쓴다.
  //   같은 날 같은 이름으로 두 번 등록하면 **재단기에 가는 실물만 나중 것 하나**가 되는데,
  //   등록·주문·카드는 둘 다 멀쩡해서 아무 화면에도 안 나왔다(09-11·09-15 실측 2건).
  //   ★검사하는 것은 **성질**이다 — 「충돌을 재서 사람에게 말이 닿는가」. 어떻게 재는지는 묻지 않는다.
  const cuth = fs.readFileSync(path.join(REPO, 'IllustratorAutomat', 'designer', 'mes-cut-host.jsx'), 'utf8')
  const cutm2 = fs.readFileSync(path.join(path.dirname(PANEL), 'js/cut-main.js'), 'utf8')
  ok('14 픽업 이름 충돌을 등록 시점에 잰다(가공)', (() => {
    const save = a0h.indexOf('outBytes = mesA0_settleLen(')
    const meas = a0h.indexOf('pickClash = mesA0_pickupClash(')
    const mf = a0h.indexOf('pickup_clash: pickClash')
    return save > 0 && meas > save && mf > meas
  })(), 'EPS 를 저장한 뒤·manifest 를 쓰기 전에 재야 그 등록의 사실이 된다')
  ok('14 충돌이 경고 코드로 나간다(가공)', a0h.indexOf("(pickClash ? 'P' : '')") > 0,
    '재고도 응답에 안 실으면 패널이 알 길이 없다')
  ok('14 가공 패널이 그 코드를 사람 말로 옮긴다',
    /P: '[^']*덮/.test(a0m) && a0m.indexOf('warnKo') > 0,
    '코드만 뜨면 원인도 조치도 없다 — 덮어쓴다는 사실과 고치는 법이 문장에 있어야 한다')
  // ★형제 스윕 — 호스트가 둘이면 같은 결정도 둘이다(work.ai·embedAllFonts 가 같은 형태였다).
  ok('14 재단 호스트도 같은 결정을 한다',
    cuth.indexOf('function mesCut_pickupClash(') > 0
    && cuth.indexOf('mesCut_pickupClash(ymd, epsName') > 0
    && cuth.split(";pickdup=' + dup").length - 1 >= 2,   // ⚠️버전·규약 주석에 안 걸리게 실제 반환식으로 센다
    '한쪽만 고치면 재단에서만 실물이 조용히 사라진다')
  ok('14 재단 패널이 두 경로 모두에 붙인다',
    (cutm2.match(/pickDupText[(]k/g) || []).length >= 2,
    '정상 경로에만 붙이면 manifest 구제 경로에서만 조용해진다')
  // ⚠️ 시스템이 **이름을 바꾸지 않는다** — 이 파일명이 그대로 RIP 에 나가는 이름이고,
  //    그 규약이 08-27 에 출력완료 매칭 0% 를 되살린 근거다. 접미사를 붙이면 그게 깨진다.
  ok('14 픽업 파일 이름은 등록 이름 그대로다',
    agentCs.indexOf('Path.Combine(outDir, Path.GetFileName(rel))') > 0,
    '에이전트가 이름을 바꾸면 RIP 가 보는 이름이 달라져 출력완료 매칭이 끊긴다')
}

// ── §15 스텁이 축2 호스트를 **전부** 읽는가 ───────────────────────────
// ★2026-09-18 실기 — 스텁(jsx/host.jsx)이 a0·cut **둘만 이름으로** 읽어, Z: 에 배포까지 끝난
//   `mes-tr-host.jsx` 를 아무도 evalFile 하지 않았다. mesTr_* 가 전역에 안 생기고 패널은
//   「Z: 의 전사 호스트를 못 읽었습니다」를 띄웠다 — **Z: 는 멀쩡했다**. 사람은 드라이브를 보러 갔다.
//   `ia:deploy` 가 손목록 때문에 같은 사고를 세 번 낸 뒤 열거로 바꾼 것과 **같은 형태이자 네 번째**다.
// ★그래서 「그 자리에 그 이름이 있는가」가 아니라 **「손목록이 아닌가」**를 묻는다
//   (§게이트가 구현을 못박으면 개선을 막는다 — 이름을 세면 네 번째 호스트에서 또 같은 일이 난다).
{
  const stub = fs.readFileSync(path.join(PANEL_DIRS.a0, 'jsx', 'host.jsx'), 'utf8')
  // ★주석을 걷어내고 센다 — 이 스텁의 머리말은 「이렇게 하면 안 된다」를 **예시 코드로** 적어 놓았다.
  //   그대로 세면 경고문이 위반으로 잡힌다(첫 시도에서 실제로 그랬다).
  const stubCode = stub.split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n')
  const a0h15 = fs.readFileSync(path.join(REPO, 'IllustratorAutomat', 'designer', 'mes-a0-host.jsx'), 'utf8')
  const trm15 = fs.readFileSync(path.join(PANEL_DIRS.a0, 'js', 'tr-main.js'), 'utf8')
  const dDir = path.join(REPO, 'IllustratorAutomat', 'designer')
  const hosts = fs.readdirSync(dDir).filter((f) => /^mes-.+-host\.jsx$/i.test(f)).sort()

  ok('15 축2 에 호스트가 셋 이상 있다(가공·재단·전사)', hosts.length >= 3, hosts.join(','))

  // ⓐ 손목록이 아니다 — 폴더를 열거한다
  ok('15 ★스텁이 호스트를 손목록이 아니라 열거로 읽는다',
    /getFiles\(function/.test(stubCode) && stubCode.indexOf('/^mes-.+-host\\.jsx$/i') > 0,
    '이름을 하나씩 적으면 네 번째 호스트가 또 조용히 빠진다')
  // ★「앞에 함수가 있나」가 아니라 **「호출이 함수 본문 안에 있나」**를 센다 — 정본 = lib/stub-scope.cjs.
  //   `for`·`try` 는 ES3 에서 스코프를 만들지 않으므로 반복문 안의 호출은 여전히 전역이다.
  const sc15 = stubScope.evalFileScope(stub)
  ok('15 evalFile 호출 지점이 하나다(반복문 안)', sc15.calls === 1,
    JSON.stringify(sc15) + ' — 지점이 늘면 거기서부터 다시 손목록이 된다')
  ok('15 함수 본문 안에서 부르지 않는다(전역 선언이어야 한다)',
    sc15.nested === 0,
    '지역에 갇히면 evalScript 에서 「함수가 아닙니다」가 난다(2026-07-27 전례)')

  // ★검사기 자가시험 — **잡아야 할 것과 잡으면 안 되는 것**을 양방향으로 건다.
  //   이 검사기가 낡으면 위의 초록불이 아무 뜻도 없어진다(종전 정규식이 정확히 그렇게 낡았다).
  const SELF = [
    ['IIFE 로 감싼 것', 'var a=1;(function(){ $.evalFile(x); })();', 1, 1],
    ['함수 안', 'function load(){ $.evalFile(x); } load();', 1, 1],
    ['try 안은 전역이다', 'try { $.evalFile(x); } catch(e){}', 1, 0],
    ['for 안도 전역이다(ES3 는 블록 스코프가 없다)', 'for(var i=0;i<2;i++){ $.evalFile(x); }', 1, 0],
    ['콜백을 지나친 뒤의 전역 호출', 'd.getFiles(function(f){ return f; }); $.evalFile(x);', 1, 0],
    ['주석 속 「하지 말라」 예시는 안 센다', '// (function(){ $.evalFile(y); })()\n$.evalFile(x);', 1, 0],
  ]
  const selfBad = SELF.filter(([, code, c, n]) => {
    const r = stubScope.evalFileScope(code)
    return r.calls !== c || r.nested !== n
  }).map(([n]) => n)
  ok('15 ★검사기 자가시험(양방향)', selfBad.length === 0, selfBad.join(' / '))

  // ⓑ 자가시험 — 그 규칙이 축2 파일을 **전부** 집고, 이웃은 안 집는가 (양방향)
  const rx15 = /^mes-.+-host\.jsx$/i
  ok('15 그 규칙이 축2 호스트를 전부 집는다', hosts.every((h) => rx15.test(h)), hosts.join(','))
  ok('15 자가시험 — 이웃 파일은 안 집는다',
    !rx15.test('mes-lock.jsx') && !rx15.test('mes-whitering-probe.jsx')
    && !rx15.test('mes-cut-host.jsx.bak-20260918'),
    '잠금·프로브·백업까지 evalFile 하면 안 된다')

  // ⓒ 호스트마다 폴백 ping — 미로드 사유를 사람 말로 옮길 자리
  const pingMissing = hosts.map((h) => {
    const t = h.replace(/^mes-/, '').replace(/-host\.jsx$/i, '')
    return 'mes' + t.charAt(0).toUpperCase() + t.slice(1) + '_ping'
  }).filter((fn) => stubCode.indexOf(fn) < 0)
  ok('15 ★호스트마다 폴백 ping 이 있다', pingMissing.length === 0, pingMissing.join(','))

  // ⓓ 이름으로 읽는 쪽을 안 깬다 — cut-main.js 의 구호스트 감지, 환경 점검의 *_LOAD_ERROR
  ok('15 MESCUT_CORE_PATH 가 그대로 있다', /var MESCUT_CORE_PATH = /.test(stubCode),
    'cut-main.js 가 구 호스트 감지에 이 이름을 읽는다')
  ok('15 전사도 같은 이름 규약을 따른다',
    /var MESTR_CORE_PATH = /.test(stubCode) && /var MESTR_LOAD_ERROR/.test(stubCode))

  // ⓔ 1차 판정 도구가 전 축을 본다 — 여기 없으면 다음에도 엉뚱한 곳을 고친다
  ok('15 ★환경 점검이 전사 호스트 버전을 보여 준다', /putS\('tr',/.test(a0h15),
    '증상이 「Z: 연결 확인」으로 읽힌 근본 이유가 이 줄의 부재였다')
  ok('15 ★환경 점검이 **실제로 읽은** 파일 이름을 보여 준다',
    /putS\('hosts',/.test(a0h15) && /MESPANEL_HOSTS_LOADED/.test(stubCode),
    '「읽으려 했다」와 「읽었다」는 다른 값이다')
  ok('15 loadErr 이 전사 사유까지 합친다', /MESTR_LOAD_ERROR/.test(a0h15))

  // ⓕ 조용한 격하 — 미로드를 부팅 때 말한다 · 원인을 단정하지 않는다
  ok('15 ★전사 패널이 호스트 미로드를 부팅 때 알린다',
    /reason=oldstub/.test(trm15) && /hostMissingWhy\(/.test(trm15),
    '종전엔 none 을 조용히 넘겨 [판 만들기] 를 누르고서야 알았다')
  ok('15 사유가 조치가 다른 갈래로 나뉜다',
    /reason=loaderr/.test(trm15) && /reason=notloaded/.test(trm15))
  ok('15 ★문구가 Z: 를 범인으로 단정하지 않는다',
    trm15.indexOf('Z: 의 전사 호스트를 못 읽었습니다') < 0,
    '그 문구가 멀쩡한 Z: 를 지목해 사람이 드라이브를 보러 갔다')
}

// ── §16 전사 안쪽 탭이 **실제로** 전환되는가 ─────────────────────────
// ★텍스트 게이트로는 영원히 못 잡는 종류다 — 마크업도 JS 도 옳았고, 진 것은 **CSS 순서**였다.
//   `.trpage`(style.css L199)가 `.hidden`(L21)보다 뒤에 있어 특정도가 같으면 이겼고,
//   숨겨야 할 페이지가 계속 보였다. 가로등·윈드 입력이 **동시에 렌더돼** 실기에서
//   「탭이 나뉘어 있는데 입력창이 동일하다」로 보고됐다(2026-09-21).
//   그래서 여기서는 소스가 아니라 **브라우저가 계산한 가시성**을 잰다.
{
  const p16 = await openPanel(CONFIG)
  await p16.click('.mtab[data-main-tab="tr"]')
  await p16.waitForTimeout(150)

  const vis = (sel) => p16.evaluate((s) => {
    const el = document.querySelector(s)
    if (!el) return 'missing'
    return getComputedStyle(el).display !== 'none' && el.offsetParent !== null
  }, sel)

  ok('16 전사 탭이 열린다', await vis('[data-main-page="tr"]'))
  ok('16 처음엔 가로등 입력이 보인다', await vis('[data-trpage="plate"]'))
  ok('16 ★그때 윈드 입력은 **안 보인다**', (await vis('[data-trpage="frame"]')) === false,
    'CSS 순서가 뒤집히면 둘이 같이 뜬다 — 사람 눈에는 「입력창이 동일」로 보인다')
  ok('16 규격 입력칸은 가로등 쪽에만 있다', await vis('#trSpecW'))
  ok('16 ★틀 고르개는 그때 안 보인다', (await vis('#trFrame')) === false)

  await p16.click('.trtab[data-trtab="frame"]')
  await p16.waitForTimeout(150)
  ok('16 윈드로 바꾸면 윈드 입력이 보인다', await vis('[data-trpage="frame"]'))
  ok('16 ★그때 가로등 입력은 사라진다', (await vis('[data-trpage="plate"]')) === false)

  // 고를 수 없는 선택지를 남기지 않는다 — 탭이 곧 용도다
  ok('16 ★윈드에는 「판 만들기」가 없다', (await vis('#trBtnMake')) === false,
    '눌러도 거절 문구만 나오는 버튼이다')
  ok('16 윈드에는 「틀 열기」가 있다', await vis('#trBtnFrame'))

  await p16.click('.trtab[data-trtab="plate"]')
  await p16.waitForTimeout(150)
  ok('16 가로등으로 돌아오면 「판 만들기」가 있다', await vis('#trBtnMake'))
  ok('16 ★가로등에는 「틀 열기」가 없다', (await vis('#trBtnFrame')) === false)

  // ★벌마다 원본을 지정하는 칸이 있는가 — 1조의 두 벌은 **서로 다른 그림**이다
  //   (2026-08 완성판 22건 실측: 완전 동일 복제 0건 · 거울상 0건). 하나를 두 벌에 복제하면
  //   측정된 22건 전부에서 틀린 판이 나온다 — 0.2.x 까지가 그랬다.
  ok('16 ★벌마다 원본을 지정하는 칸이 있다', (await vis('#trPick1')) && (await vis('#trPick2')))
  ok('16 ★자동 분석이 주 경로로 있다', await vis('#trAuto'),
    '파일을 보고 좌우를 가르는 것이 기본이고, 수동 지정은 못 가를 때의 길이다')
  ok('16 좌우를 바꾸는 수단이 있다', await vis('#trPickSwap'),
    '좌우 순서는 디자이너가 정한다 — 바꿀 수 없으면 다시 지정해야 한다')
  ok('16 지정 상태가 화면에 보인다', await vis('#trPickState'))
  ok('16 1벌이면 벌② 칸이 사라진다', await p16.evaluate(() => {
    const v = document.getElementById('trVup'); v.value = '1'
    v.dispatchEvent(new Event('change'))
    const b = document.getElementById('trPick2')
    return getComputedStyle(b).display === 'none'
  }), '1벌짜리에 벌② 지정은 고를 수 없는 선택지다')

  ok('16 콘솔 에러 0', p16.__errs.length === 0, p16.__errs.join(' | '))
  await p16.close()
}

// ── §17d 전사 호스트 — 문서를 넘나드는 duplicate 은 그룹을 못 받는다 ──
// ★일러 30.7 최소 재현(2026-09-21): 같은 원본을 **다른 문서의 groupItem** 으로 복제하면
//   `1346458189 ('PARM')`, **다른 문서의 layer** 로 복제하면 ok. 오류는 코드번호 하나뿐이라
//   무엇이 틀렸는지 말해 주지 않는다 — 실기에서 [판 만들기] 가 매번 이걸로 죽었다.
//   makePlate 는 documents.add 로 **새 문서**를 만든 뒤 원본을 복제하므로 항상 이 경로를 지난다.
{
  const trh = fs.readFileSync(path.join(REPO, 'IllustratorAutomat', 'designer', 'mes-tr-host.jsx'), 'utf8')
  const dupArgs = [...trh.matchAll(/\.duplicate\(\s*([A-Za-z_$][\w$]*)/g)].map((m) => m[1])
  ok('17d duplicate 대상이 레이어다', dupArgs.length > 0 && dupArgs.every((a) => /^ly/.test(a)),
    '받은 인자: ' + dupArgs.join(',') + ' — 그룹(grp)을 주면 새 문서에서 PARM 으로 죽는다')
  // ★두 벌에 **같은 선택을 복제하지 않는다** — 실측 22건 중 그게 맞는 경우가 0건이었다.
  // ⚠️정규식을 셸로 주입하다 역슬래시가 삼켜져 한 번 깨졌다(CLAUDE.md §Bash 함정).
  //    괄호·대괄호가 든 패턴은 indexOf 로 쓰는 편이 읽기도 쉽고 안 깨진다.
  ok('17d 벌마다 원본을 따로 받는다',
    trh.indexOf('function mesTr_pick(') > 0 && trh.indexOf('MESTR_PICK[i]') > 0,
    '슬롯이 없으면 한 그림이 두 벌에 복제된다 — 실측 22건 중 그게 맞는 경우가 0건이었다')
  ok('17d 쓰기 전에 슬롯이 살아 있는지 본다', trh.indexOf('mesTr_pickAlive(') > 0,
    '지운 개체·닫은 문서를 그대로 쓰면 PARM 으로 죽는다')
  ok('17d 도련을 벌마다 정한다',
    trh.indexOf('panelCol[i]') > 0 && trh.indexOf('out.modes[idx]') > 0,
    '두 벌의 바탕색이 다른 판이 흔하다(미래엔1 = 좌 별색·우 백색)')
  ok('17d 빈 벌을 조용히 넘기지 않는다', trh.indexOf("'empty=' + (i + 1)") > 0)
  // ★자르는 게 없는 클립은 만들지 않는다 — 재단이 CUT-CEP-0.49.0 에서 배운 자리의 형제다.
  //   실측(2026-09-21): 벌 646x1859mm 안에 원본 600x1829mm 이 들어가 클립 2개 중 2개가 무의미했다.
  ok('17d 클립을 만들기 전에 자르는지 먼저 본다', trh.indexOf('var needClip =') > 0,
    '아무것도 안 자르는 클립은 <Clipping Path> 만 남긴다')
  ok('17d 건너뛴 클립을 **센다**', trh.indexOf('clipskip++') > 0 && /clipskip=/.test(trh),
    '거절을 안 세면 실행 횟수가 성공으로 읽힌다(§조용한 격하)')
  // ★자동 분석 — 파일을 보고 좌우를 가른다. 판정 잣대는 가공과 같아야 한다.
  ok('17d 자동 분석이 있다', trh.indexOf('function mesTr_autoPick(') > 0)
  // ★글자가 아니라 성질을 본다 — `by=artboard` 를 붙이며 문자열이 바뀌자 곧바로 걸렸다.
  ok('17d 덩어리 수가 안 맞으면 지정하지 않는다',
    /auto=no/.test(trh) && /want=/.test(trh),
    '억지로 가르면 반쪽짜리 판이 조용히 나간다')
  ok('17d 맨 위 개체를 모으는 잣대가 가공과 같다',
    trh.indexOf('ly.locked || !ly.visible') > 0 && trh.indexOf('!it.locked && !it.hidden') > 0,
    '두 탭이 같은 파일을 다르게 읽으면 디자이너가 개수 차이를 만난다')
  // ★아트보드를 먼저 본다 — 간격으로만 가르면 두 그림이 **딱 붙어 있을 때** 한 덩어리가 된다
  //   (2026-09-21 실측 ⓑ: 600mm 짜리 둘이 맞닿아 found=1 · 같은 배치에 아트보드 2개면 ⓒ found=2).
  ok('17d 아트보드가 있으면 그 경계를 먼저 쓴다',
    trh.indexOf('by=artboard') > 0 && /artboardRect/.test(trh),
    '사람이 이미 그어 둔 경계가 있으면 추측할 것이 없다')
  ok('17d 왜 그런지가 코드 옆에 적혀 있다', /PARM/.test(trh) && /1346458189/.test(trh),
    '코드번호만 뜨는 오류다 — 사유가 없으면 다음 사람이 처음부터 다시 찾는다')

  // ── §17e 클립을 존중하는 잉크 경계 — **호스트 셋을 대조한다** ──
  // ★A0 와 재단은 이미 「클립 ∩ 콘텐츠」로 통일했는데 **전사만 안 따라왔다**(2026-09-21 실기).
  //   공유 결정이 한 호스트에만 들어가면 나머지는 조용히 옛 값을 쓴다 — §형제 스윕의 호스트판이다.
  //   그래서 개별 호스트가 아니라 **셋이 같은 결정을 갖고 있는지**를 묻는다.
  // ⚠️**손으로 셋을 적지 않는다.** 이 저장소가 같은 사고를 세 번 낸 자리가 손목록이다
  //   (`ia:deploy` 대상 · `ia-jsx-audit` 목록 · 스텁의 호스트 목록). 여기서도 셋을 박아 두면
  //   **다음에 만드는 틀 호스트는 이 게이트에 안 걸린다** — 그때 이 결함이 통째로 되살아난다.
  //   → 디렉터리를 **열거해서** 「개체를 재는 호스트는 클립을 존중하는 입구를 갖는다」를 요구한다.
  const HOST_DIR = path.join(REPO, 'IllustratorAutomat', 'designer')
  const hostFiles = fs.readdirSync(HOST_DIR).filter((f) => /^mes-[a-z0-9-]+-host\.jsx$/i.test(f))
  ok('17e 호스트를 열거해서 본다 (손목록 금지)', hostFiles.length >= 3, hostFiles.join(','))
  for (const hf of hostFiles) {
    const src = fs.readFileSync(path.join(HOST_DIR, hf), 'utf8').replace(/\r\n/g, '\n')
    // 주석을 뺀 코드에서만 센다 — 주석 속 설명에 속으면 안 된다.
    const code = src.split('\n').filter((ln) => !/^\s*(\/\/|\*|\/\*)/.test(ln)).join('\n')
    const measures = /\.(visibleBounds|geometricBounds)\b/.test(code)
    if (!measures) continue                    // 개체를 안 재는 호스트는 이 함정 밖이다
    ok('17e ' + hf + ' 에 클립을 존중하는 입구가 있다',
      /function\s+mes[A-Za-z0-9]+_(inkBounds|itemBounds)\s*\(/.test(code) && /\.clipping\b/.test(code),
      '개체를 재는데 클립 입구가 없다 — visibleBounds 는 클립이 잘라 낸 부분까지 합쳐서 답한다'
      + '(실측 60x180 → 214.74x242.83). 입구 이름은 mes<축>_inkBounds 규약이다')
  }
  // 경계를 재는 자리가 **전부** 잉크를 지나는가 — 한 곳만 생짜로 남아도 그 경로가 틀린다.
  const bodyOf = (src, name) => {
    const s = src.replace(/\r\n/g, '\n')
    const at = s.indexOf('function ' + name + '(')
    if (at < 0) return ''
    const rest = s.slice(at)
    const end = rest.indexOf('\n}\n')
    return end < 0 ? rest : rest.slice(0, end + 2)
  }
  for (const fn of ['mesTr_measureItems', 'mesTr_autoPick', 'mesTr_makePlate']) {
    ok('17e ' + fn + ' 가 잉크로 잰다', bodyOf(trh, fn).indexOf('mesTr_inkBounds(') > 0,
      '겉보기로 재면 클립이 잘라 낸 부분까지 들어간다(실측 60x180 → 214.74x242.83)')
  }
  ok('17e 못 그리는 개체를 빼고 그 수를 알린다',
    trh.indexOf('function mesTr_draws(') > 0 && /blind=/.test(trh),
    '조용히 빼면 그게 다음 사각지대다 — 거절은 센다')
  // ── §17f 도련 3단 — 재단과 같은 엔진·같은 입출구 ──
  // ★엔진(bleed.js)은 2026-09-18 에 전사 축 때문에 비대칭까지 확장됐는데 **전사가 한 번도 안 불렀다**.
  //   여기서는 「부르는가」와 「사본이 없는가」를 본다 — 사본이 생기면 한쪽만 고쳐져 갈린다.
  const trm = fs.readFileSync(path.join(REPO, 'IllustratorAutomat', 'designer', 'poc-a0-cep', 'com.mes.a0.panel', 'js', 'tr-main.js'), 'utf8')
  const cutm = fs.readFileSync(path.join(REPO, 'IllustratorAutomat', 'designer', 'poc-a0-cep', 'com.mes.a0.panel', 'js', 'cut-main.js'), 'utf8')
  const idx = fs.readFileSync(path.join(REPO, 'IllustratorAutomat', 'designer', 'poc-a0-cep', 'com.mes.a0.panel', 'index.html'), 'utf8')
  ok('17f 호스트에 도련 세 경로가 다 있다',
    /function mesTr_bleedExtend\(/.test(trh) && /function mesTr_bleedPlacePng\(/.test(trh) && /function mesTr_bakeSlot\(/.test(trh),
    '하나만 빠져도 그 모드가 조용히 bleedskip 으로 떨어진다')
  ok('17f 방식별로 **센다**', /bleedhow=solid:/.test(trh) && /,ext:/.test(trh) && /,px:/.test(trh),
    '합계만 보면 격하가 안 보인다 — 재단의 bleedHow 와 같은 이유')
  ok('17f 전사가 재단과 **같은 엔진**을 부른다', /MesCutBleed/.test(trm) && /repeatLastPixel\(/.test(trm))
  ok('17f PNG 입출구는 공유 한 벌 — 전사·재단 둘 다 png-io 를 쓴다',
    /MesPngIo\b/.test(trm) && /MesPngIo\b/.test(cutm) && !/new Image\(\)/.test(trm) && !/new Image\(\)/.test(cutm),
    '사본이 생기면 한쪽에서 고친 것이 다른 쪽에 안 온다')
  ok('17f png-io 가 두 셸보다 먼저 실린다',
    idx.indexOf('js/png-io.js') > 0 && idx.indexOf('js/png-io.js') < idx.indexOf('js/cut-main.js') && idx.indexOf('js/png-io.js') < idx.indexOf('js/tr-main.js'))
  ok('17f 굽기는 투명을 켠다 (알파로 잉크를 가른다)', /opt\.transparency = true/.test(bodyOf(trh, 'mesTr_bakeSlot')),
    '흰 배경으로 굳히면 그림 없는 자리까지 잉크로 읽혀 가장자리가 흰색이 된다')
  ok('17f 실제로 구운 해상도로 되환산한다', /d\.w \/ img\.W/.test(trm),
    '요청한 mm/px 를 그대로 쓰면 반올림이 도련 폭에 실린다')
  ok('17f extend 는 사진을 거절한다', /kind === 'img'\) return false/.test(bodyOf(trh, 'mesTr_bleedExtend')),
    '사진은 늘리면 흐려진다 — 픽셀 경로가 받아야 한다')
  ok('17e position 으로 앉히지 않는다',
    bodyOf(trh, 'mesTr_makePlate').indexOf('grp.position') < 0
    && bodyOf(trh, 'mesTr_makePlate').indexOf('grp.translate(') > 0,
    'position 은 클립 밖까지 포함한 개체 상자를 보므로 그만큼 어긋난다')
}

await browser.close()
let pass = 0
for (const r of results) {
  console.log((r.c ? '  PASS  ' : '  FAIL  ') + r.n + (r.c ? '' : '   ← ' + r.extra))
  if (r.c) pass++
}
console.log(`\n요약: ${pass} / ${results.length}`)
process.exit(pass === results.length ? 0 : 1)
