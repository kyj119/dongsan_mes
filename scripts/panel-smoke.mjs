// A0 패널 리모델 헤드리스 스모크 — Chromium + CSInterface/cep.fs 스텁으로 실제 DOM 동작 검증.
// 일러 없이 잡을 수 있는 것: 초기화 예외 · 탭=용도 파생 · 후가공 초기화 · 분리→목록→등록 게이트 · 1덩어리 경고.
import { chromium } from 'playwright'
import fs from 'fs'
import path from 'path'
import { pathToFileURL, fileURLToPath } from 'url'

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
    if (cb) setTimeout(function () { cb(res); }, delay);
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
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()) })

await page.addInitScript(hostStub)
await page.goto(pathToFileURL(PANEL).href)
await page.waitForTimeout(300)

// 1) 초기화 무예외 + 기본 탭 = 단건
ok('초기화 콘솔/페이지 에러 0', errors.length === 0, errors.join(' | '))
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
}ok('등록 결과에 work.ai 용량 표시', doneMsg.includes('work.ai 51.2MB'), doneMsg.slice(0, 140))
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
  await p7.evaluate(() => { window.__processDelay = 500 }) // 느린 호스트 재현
  await p7.click('#btnConfirm')
  await p7.waitForTimeout(250)
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
  await p7.waitForTimeout(2500)
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
  await p10.evaluate(() => { window.__processDelay = 600 })
  await p10.click('#btnConfirm')
  await p10.waitForTimeout(250)
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

await browser.close()
let pass = 0
for (const r of results) {
  console.log((r.c ? '  PASS  ' : '  FAIL  ') + r.n + (r.c ? '' : '   ← ' + r.extra))
  if (r.c) pass++
}
console.log(`\n요약: ${pass} / ${results.length}`)
process.exit(pass === results.length ? 0 : 1)
