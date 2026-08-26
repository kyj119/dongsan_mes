#!/usr/bin/env node
/**
 * 셸 자동 갱신(mesPanel_*) 하네스 — `npm run cut:shellsync`
 *
 * spec = docs/superpowers/specs/2026-08-26-panel-flow-restructure.md §2
 *
 * ★왜 소스를 잘라내 직접 돌리는가
 *   이 로직은 **디자이너 PC 의 설치 폴더를 덮어쓴다**. 잘못되면 전 PC 패널이 반쪽이 된다.
 *   그런데 ExtendScript 는 테스트가 사실상 불가능하고, 실기 확인은 일러를 붙잡아야 한다.
 *   → `geometry.js`·`mesCutSplitBleed` 와 같은 방식으로 **원본 함수를 절취해** File/Folder 를
 *     실제 파일시스템에 얹은 shim 으로 돌린다. 소스 패턴 검사가 아니라 **동작**을 본다.
 *
 * ⚠️ 여기서 통과해도 ExtendScript 의 File.copy()·Folder.getFiles() 실동작은 별개다.
 *    실기 1회 확인이 반드시 남는다(spec §7-B).
 */
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const HOST = path.join(ROOT, 'IllustratorAutomat', 'designer', 'mes-a0-host.jsx');

let pass = 0, fail = 0;
const ok = (cond, name, extra) => {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (extra ? '  → ' + extra : '')); }
};

// ── 원본에서 mesPanel_* 블록 절취 ──────────────────────────────────────
// 시작 = `var MESPANEL_EXT_ID`, 끝 = `function mesA0_ping`(그 앞까지).
// 범위가 어긋나면 조용히 옛 코드를 검사하게 되므로 **경계를 확인하고 죽는다**.
const src = fs.readFileSync(HOST, 'utf8').replace(/\r\n/g, '\n');
const i0 = src.indexOf('var MESPANEL_EXT_ID');
const i1 = src.indexOf('function mesA0_ping()');
if (i0 < 0 || i1 < 0 || i1 <= i0) {
  console.error('[shell-sync] mesPanel_* 블록을 못 찾았다 — 절취 경계를 확인하라 (mes-a0-host.jsx)');
  process.exit(1);
}
const block = src.slice(i0, i1);
for (const need of ['mesPanel_sign', 'mesPanel_copyTree', 'mesPanel_syncShell', 'mesPanel_isDeployable', 'mesPanel_rollback', 'mesPanel_probeCopy']) {
  if (block.indexOf('function ' + need) < 0) {
    console.error('[shell-sync] 절취 블록에 ' + need + ' 이 없다');
    process.exit(1);
  }
}

// ── ExtendScript File/Folder shim (실제 fs 사용) ────────────────────────
const norm = (p) => String(p).replace(/\\/g, '/');
const FAIL_REMOVE = new Set();   // 여기에 basename 을 넣으면 그 파일의 remove 가 실패한다
class ESFolder {
  constructor(p) { this.__p = norm(p); }
  get fsName() { return this.__p.replace(/\//g, path.sep); }
  get name() { return encodeURI(path.basename(this.__p)); }
  get exists() { try { return fs.statSync(this.__p).isDirectory(); } catch { return false; } }
  create() { try { fs.mkdirSync(this.__p, { recursive: true }); return true; } catch { return false; } }
  getFiles() {
    let ents = [];
    try { ents = fs.readdirSync(this.__p, { withFileTypes: true }); } catch { return []; }
    return ents.map((e) => (e.isDirectory() ? new ESFolder(this.__p + '/' + e.name) : new ESFile(this.__p + '/' + e.name)));
  }
}
class ESFile {
  constructor(p) { this.__p = norm(p); this.encoding = 'UTF-8'; }
  get fsName() { return this.__p.replace(/\//g, path.sep); }
  get name() { return encodeURI(path.basename(this.__p)); }
  get exists() { try { return fs.statSync(this.__p).isFile(); } catch { return false; } }
  get length() { try { return fs.statSync(this.__p).size; } catch { return 0; } }
  remove() {
    // ★잠긴 파일 재현 — 실기(2026-08-26)에서 tabs.js 를 잡아두면 remove 가 실패했다(여기선 main.js).
    if (FAIL_REMOVE.has(path.basename(this.__p))) return false;
    try { fs.unlinkSync(this.__p); return true; } catch { return false; }
  }
  copy(dest) {
    try {
      fs.mkdirSync(path.dirname(norm(dest)), { recursive: true });
      if (fs.existsSync(norm(dest))) return false;   // ExtendScript 와 같은 규약: 대상이 있으면 실패
      fs.copyFileSync(this.__p, norm(dest));
      return true;
    } catch { return false; }
  }
  open() { return true; }
  read() { try { return fs.readFileSync(this.__p, 'utf8'); } catch { return ''; } }
  close() { return true; }
  write() { return true; }
}

function makeSandbox(env) {
  const sb = {
    Folder: ESFolder,
    File: ESFile,
    $: { getenv: (k) => (k === 'APPDATA' ? env.appdata : null) },
    mesA0_readText: (p) => { try { return fs.readFileSync(norm(p), 'utf8'); } catch { return null; } },
    mesA0_writeText: (p, s) => { try { fs.mkdirSync(path.dirname(norm(p)), { recursive: true }); fs.writeFileSync(norm(p), s, 'utf8'); return true; } catch { return false; } },
    mesA0_pad2: (n) => (n < 10 ? '0' : '') + n,
    Date,
    parseInt,
    String,
  };
  ESFolder.temp = new ESFolder(env.temp);
  const names = Object.keys(sb);
  // eslint-disable-next-line no-new-func
  const factory = new Function(...names, block + '\nreturn { syncShell: mesPanel_syncShell, sign: mesPanel_sign, copyTree: mesPanel_copyTree, deployable: mesPanel_isDeployable, setSrc: function(v){ MESPANEL_SRC_DIR = v; }, reset: function(){ MESPANEL_SYNC = "idle"; MESPANEL_SYNC_DONE = false; }, status: function(){ return MESPANEL_SYNC; } };');
  return factory(...names.map((n) => sb[n]));
}

// ── 픽스처 ────────────────────────────────────────────────────────────
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'shellsync-'));
const write = (p, s) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, s, 'utf8'); };

function makePanel(dir, shellVer, extra) {
  write(path.join(dir, 'index.html'), '<html>' + shellVer + '</html>');
  write(path.join(dir, 'CSXS', 'manifest.xml'), '<x/>');
  write(path.join(dir, 'css', 'style.css'), 'body{}');
  write(path.join(dir, 'js', 'cut-main.js'), "  var SHELL_VERSION = '" + shellVer + "';\n");
  write(path.join(dir, 'js', 'main.js'), "  var SHELL_VERSION = '0.5.0';\n");
  write(path.join(dir, 'jsx', 'host.jsx'), '// stub');
  for (const f of (extra || [])) write(path.join(dir, f), 'junk');
}

function scenario(name, { srcVer, dstVer, dstExtra, srcExtra }) {
  const base = path.join(TMP, name.replace(/\W+/g, '_'));
  const srcDir = path.join(base, 'z', 'com.mes.a0.panel');
  const appdata = path.join(base, 'AppData');
  const dstDir = path.join(appdata, 'Adobe', 'CEP', 'extensions', 'com.mes.a0.panel');
  makePanel(srcDir, srcVer, srcExtra);
  makePanel(dstDir, dstVer, dstExtra);
  const api = makeSandbox({ appdata, temp: path.join(base, 'temp') });
  api.setSrc(norm(srcDir));
  api.reset();
  return { api, srcDir, dstDir, appdata, base, r: api.syncShell() };
}

console.log('\n[1] 서명 — .bak 잔재는 세지 않는다');
{
  const s = scenario('sig', { srcVer: '1.0.0', dstVer: '1.0.0', dstExtra: ['js/cut-main.js.bak-20260805', 'index.html.bak-1'] });
  ok(s.r.indexOf('same;') === 0, '버전·내용 같고 .bak 개수만 달라도 same', s.r);
  ok(!fs.existsSync(path.join(s.appdata, 'Adobe', 'CEP', '_panel_backups')), 'same 이면 백업을 만들지 않는다');
}

console.log('\n[2] 갱신 — 다르면 복사하고 검증까지 수렴한다');
{
  const s = scenario('upd', { srcVer: '2.0.0', dstVer: '1.0.0', dstExtra: ['js/geometry.js.bak-x'] });
  ok(s.r.indexOf('updated;') === 0, 'updated 를 돌려준다', s.r);
  const got = fs.readFileSync(path.join(s.dstDir, 'js', 'cut-main.js'), 'utf8');
  ok(/2\.0\.0/.test(got), '설치본 cut-main.js 가 새 버전으로 바뀐다');
  ok(fs.existsSync(path.join(s.dstDir, 'js', 'geometry.js.bak-x')), '기존 .bak 은 지우지 않는다(남의 파일)');
  ok(s.api.sign(norm(s.srcDir)) === s.api.sign(norm(s.dstDir)), '복사 후 서명이 일치(수렴)');
  const bakRoot = path.join(s.appdata, 'Adobe', 'CEP', '_panel_backups');
  ok(fs.existsSync(bakRoot), '백업이 extensions **밖**에 생긴다');
  ok(!fs.existsSync(path.join(s.dstDir, '..', 'com.mes.a0.panel.autobak-0')), 'extensions 안에는 백업을 만들지 않는다');
}

console.log('\n[3] 잔재를 옮기지 않는다');
{
  const s = scenario('nojunk', { srcVer: '3.0.0', dstVer: '1.0.0', srcExtra: ['js/cut-main.js.bak-source'] });
  ok(s.r.indexOf('updated;') === 0, 'updated', s.r);
  ok(!fs.existsSync(path.join(s.dstDir, 'js', 'cut-main.js.bak-source')), 'Z: 의 .bak 을 설치본에 퍼뜨리지 않는다');
}

console.log('\n[4] 안전 — 없는 것은 만들지 않는다');
{
  const base = path.join(TMP, 'noinstall');
  const srcDir = path.join(base, 'z', 'com.mes.a0.panel');
  const appdata = path.join(base, 'AppData');
  makePanel(srcDir, '4.0.0');
  const api = makeSandbox({ appdata, temp: path.join(base, 'temp') });
  api.setSrc(norm(srcDir)); api.reset();
  const r = api.syncShell();
  ok(r === 'skip;why=noinstall', '설치본이 없으면 새로 만들지 않는다(최초 설치는 설치기 담당)', r);

  const base2 = path.join(TMP, 'nosrc');
  const appdata2 = path.join(base2, 'AppData');
  makePanel(path.join(appdata2, 'Adobe', 'CEP', 'extensions', 'com.mes.a0.panel'), '1.0.0');
  const api2 = makeSandbox({ appdata: appdata2, temp: path.join(base2, 'temp') });
  api2.setSrc(norm(path.join(base2, 'z', 'com.mes.a0.panel'))); api2.reset();
  const r2 = api2.syncShell();
  ok(r2 === 'skip;why=nosrc', 'Z: 미연결이면 조용히 넘어간다(패널 사용을 막지 않는다)', r2);
}

console.log('\n[5] 로드당 1회만 돈다');
{
  const s = scenario('once', { srcVer: '5.0.0', dstVer: '1.0.0' });
  ok(s.r.indexOf('updated;') === 0, '1회차 updated', s.r);
  const again = s.api.syncShell();
  ok(again === s.r, '2회차는 캐시된 결과(재복사 없음)', again);
}

console.log('\n[6] 재시도 한도 — 같은 목표로 무한 반복하지 않는다');
{
  const base = path.join(TMP, 'retry');
  const srcDir = path.join(base, 'z', 'com.mes.a0.panel');
  const appdata = path.join(base, 'AppData');
  const dstDir = path.join(appdata, 'Adobe', 'CEP', 'extensions', 'com.mes.a0.panel');
  makePanel(srcDir, '6.0.0');
  makePanel(dstDir, '1.0.0');
  const temp = path.join(base, 'temp');
  const guard = path.join(temp, 'mes_panel_sync.txt');
  const sign = makeSandbox({ appdata, temp }).sign(norm(srcDir));
  fs.mkdirSync(temp, { recursive: true });
  fs.writeFileSync(guard, sign + '|2', 'utf8');           // 이미 두 번 실패한 상태
  const api = makeSandbox({ appdata, temp });
  api.setSrc(norm(srcDir)); api.reset();
  const r = api.syncShell();
  ok(r.indexOf('skip;why=retrylimit') === 0, '두 번 실패한 목표는 더 시도하지 않는다', r);
  ok(/1\.0\.0/.test(fs.readFileSync(path.join(dstDir, 'js', 'cut-main.js'), 'utf8')), '설치본을 건드리지 않았다');
}

console.log('\n[7] 배포 대상 판정');
{
  const api = makeSandbox({ appdata: path.join(TMP, 'x'), temp: path.join(TMP, 'x', 't') });
  ok(api.deployable('cut-main.js') === true, '정상 파일은 배포 대상');
  ok(api.deployable('cut-main.js.bak-20260805-1127') === false, '.bak-타임스탬프 제외');
  ok(api.deployable('index.html.bak') === false, '.bak 로 끝나도 제외');
  ok(api.deployable('.debug') === true, 'CEP .debug 는 배포 대상');
}

console.log('\n[8] 롤백 — 본복사 중 실패해도 설치본이 남아 있어야 한다');
{
  // 백업은 성공하고(대상이 없어 remove 를 안 부른다) 본복사의 remove 만 실패시킨다 = 실기 재현
  FAIL_REMOVE.add('main.js');   // 픽스처에 실제로 있는 파일이어야 주입이 걸린다
  let s;
  try { s = scenario('rollback', { srcVer: '8.0.0', dstVer: '1.0.0' }); } finally { FAIL_REMOVE.delete('main.js'); }
  ok(s.r.indexOf('ERROR copy:') === 0, '복사 실패를 ERROR 로 보고', s.r);
  ok(s.r.indexOf(';rolledback') > 0, '설치본이 멀쩡하면 rolledback 으로 판정(ROLLBACKFAIL 아님)', s.r);
  ok(/1\.0\.0/.test(fs.readFileSync(path.join(s.dstDir, 'js', 'cut-main.js'), 'utf8')), '되돌아간 셸 버전이 원래대로');
  ok(fs.existsSync(path.join(s.dstDir, 'index.html')), '중간에 지워진 파일이 복구됨');
}

console.log('\n요약: ' + pass + ' / ' + (pass + fail));
if (fail) process.exit(1);
