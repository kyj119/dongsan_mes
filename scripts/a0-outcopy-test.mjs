#!/usr/bin/env node
/**
 * 픽업 복사 하네스 — `npm run test:outcopy`
 *
 * ★왜 소스를 잘라내 직접 돌리는가
 *   `_출력` 픽업 폴더는 **재단기가 집어 가는 곳**이다. 여기가 비면 등록은 멀쩡한데 현장에 파일이 없다.
 *   2026-09-15 실기가 정확히 그랬다: 등록·EPS(8.0MB)·work.ai(1.7MB)·manifest 전부 정상인데
 *   `File.copy` 한 번이 `I/O 오류` 로 떨어져 픽업 폴더가 비었다. 같은 실행의 ioprobe 가
 *   `outline=X ai=X` → `eps=OK thumb=OK` 로 **회복**했으므로 자원 고갈이 아니라 **구간 실패**다.
 *   → `cut:shellsync` 와 같은 방식으로 원본 함수를 절취해 File/Folder shim 위에서 **동작**을 본다.
 *
 * ⚠️ 여기서 통과해도 ExtendScript File.copy() 의 실동작은 별개다 — 실기 1회 확인이 남는다.
 */
import fs from 'fs'
import path from 'path'
import os from 'os'
import { fileURLToPath } from 'url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const HOST = path.join(ROOT, 'IllustratorAutomat', 'designer', 'mes-a0-host.jsx')

let pass = 0, fail = 0
const ok = (cond, name, extra) => {
  if (cond) { pass++; console.log('  PASS  ' + name) }
  else { fail++; console.log('  FAIL  ' + name + (extra ? '  → ' + extra : '')) }
}

// ── 원본 절취: mesA0_copyVerify ~ mesA0_outCopy ────────────────────────
const src = fs.readFileSync(HOST, 'utf8').replace(/\r\n/g, '\n')
const i0 = src.indexOf('function mesA0_copyVerify')
const i1 = src.indexOf('function mesA0_scanRegister')
if (i0 < 0 || i1 < 0 || i1 <= i0) {
  console.error('[outcopy] 절취 경계를 못 찾았다 — mes-a0-host.jsx 의 함수 순서를 확인하라')
  process.exit(1)
}
const block = src.slice(i0, i1)
for (const need of ['mesA0_copyVerify', 'mesA0_outCopy']) {
  if (block.indexOf('function ' + need) < 0) { console.error('[outcopy] 절취 블록에 ' + need + ' 없음'); process.exit(1) }
}

// ── ExtendScript shim ─────────────────────────────────────────────────
const BS = String.fromCharCode(92)   // 리터럴 역슬래시를 소스에 두지 않는다(셸 heredoc 에서 먹힌다)
const norm = (p) => String(p).split(BS).join('/')
let copyFailsLeft = 0      // 이 횟수만큼 copy 가 I/O 오류로 떨어진다
let copyTruncate = false   // copy 는 true 를 돌려주는데 내용이 0바이트(무증상 실패 재현)
let copyCalls = 0

class ESFile {
  constructor(p) { this.__p = norm(p); this.error = '' }
  get fsName() { return this.__p.replace(/\//g, path.sep) }
  get exists() { try { return fs.statSync(this.__p).isFile() } catch { return false } }
  get length() { return fs.statSync(this.__p).size }   // 없으면 throw = 실물과 같은 모양
  remove() { try { fs.unlinkSync(this.__p); return true } catch { return false } }
  copy(dst) {
    copyCalls++
    if (copyFailsLeft > 0) { copyFailsLeft--; this.error = 'I/O 오류'; return false }
    try {
      fs.mkdirSync(path.dirname(norm(dst)), { recursive: true })
      fs.writeFileSync(norm(dst), copyTruncate ? '' : fs.readFileSync(this.__p))
      return true
    } catch (e) { this.error = String(e); return false }
  }
}
class ESFolder {
  constructor(p) { this.__p = norm(p) }
  get fsName() { return this.__p.replace(/\//g, path.sep) }
  get exists() { try { return fs.statSync(this.__p).isDirectory() } catch { return false } }
  create() { try { fs.mkdirSync(this.__p, { recursive: true }); return true } catch { return false } }
}

let slept = 0
const sandbox = {
  File: ESFile, Folder: ESFolder,
  $: { sleep: (ms) => { slept += ms } },
  MESA0_REGISTER_ROOT: '',
}
const factory = new Function('File', 'Folder', '$', 'MESA0_REGISTER_ROOT',
  block + '\nreturn { mesA0_copyVerify: mesA0_copyVerify, mesA0_outCopy: mesA0_outCopy };')

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'a0outcopy-'))
const REG = norm(path.join(TMP, 'IA-등록'))
const JOB = REG + '/job1'
fs.mkdirSync(JOB, { recursive: true })
const EPS = 'design(600x70)-1EA.eps'
const DXF = 'design(600x70)-1EA.dxf'
fs.writeFileSync(JOB + '/' + EPS, Buffer.alloc(8 * 1024, 7))
fs.writeFileSync(JOB + '/' + DXF, Buffer.alloc(512, 3))

const M = factory(ESFile, ESFolder, sandbox.$, REG)
const dstOf = (ymd, name) => REG + '/_출력/' + ymd + '/' + name
const reset = (ymd) => { try { fs.rmSync(REG + '/_출력/' + ymd, { recursive: true, force: true }) } catch { /* 없으면 그만 */ } copyCalls = 0; copyFailsLeft = 0; copyTruncate = false; slept = 0 }

console.log('\n\x1b[1m픽업 복사(_출력) 하네스\x1b[0m  ' + TMP + '\n')

// 1) 정상
reset('d1')
ok(M.mesA0_outCopy(JOB, 'd1', EPS, null) === '', '정상 복사는 사유가 비어 있다')
ok(fs.existsSync(dstOf('d1', EPS)) && fs.statSync(dstOf('d1', EPS)).size === 8192, '목적지 바이트가 원본과 같다')
ok(copyCalls === 1, '정상이면 1회만 시도한다', 'calls=' + copyCalls)

// 2) ★구간 실패 — 첫 시도만 죽고 다음이 산다 (이 게이트의 존재 이유)
reset('d2'); copyFailsLeft = 1
ok(M.mesA0_outCopy(JOB, 'd2', EPS, null) === '', '★첫 시도가 I/O 오류여도 재시도로 살아난다')
ok(fs.existsSync(dstOf('d2', EPS)) && fs.statSync(dstOf('d2', EPS)).size === 8192, '재시도 사본이 온전하다')
ok(copyCalls === 2 && slept > 0, '두 번째 시도였고 사이에 쉬었다', 'calls=' + copyCalls + ' slept=' + slept)

// 3) ★반환값이 true 인데 내용이 비었다 = 무증상 실패 → 실패로 보고 잔해를 지운다
reset('d3'); copyTruncate = true
const r3 = M.mesA0_outCopy(JOB, 'd3', EPS, null)
ok(r3 !== '', '★copy 가 성공을 돌려줘도 0바이트면 실패로 본다', 'r=' + JSON.stringify(r3))
ok(!fs.existsSync(dstOf('d3', EPS)), '★불완전 사본을 남기지 않는다 (재단기가 잘린 파일을 집어 간다)')
ok(copyCalls === 3, '3회까지만 시도한다', 'calls=' + copyCalls)

// 4) 계속 실패 — 사유에 원인이 남는다
reset('d4'); copyFailsLeft = 99
const r4 = M.mesA0_outCopy(JOB, 'd4', EPS, null)
ok(/I\/O/.test(r4) && /eps copy 실패/.test(r4), '실패 사유에 원인이 실린다', 'r=' + JSON.stringify(r4))

// 5) DXF 도 같은 규칙
reset('d5'); copyFailsLeft = 1
ok(M.mesA0_outCopy(JOB, 'd5', EPS, DXF) === '', 'DXF 도 재시도로 살아난다')
ok(fs.existsSync(dstOf('d5', DXF)) && fs.statSync(dstOf('d5', DXF)).size === 512, 'DXF 바이트가 원본과 같다')

// 6) EPS 이름이 없으면 아무 일도 하지 않는다(모아찍기 = work.ai 만)
reset('d6')
ok(M.mesA0_outCopy(JOB, 'd6', null, null) === '' && copyCalls === 0, 'EPS 가 없으면 복사하지 않는다')

try { fs.rmSync(TMP, { recursive: true, force: true }) } catch { /* 지워지면 좋고 아니면 temp 청소에 맡긴다 */ }
console.log('\n요약: ' + (fail ? '\x1b[31m' : '\x1b[32m') + pass + ' / ' + (pass + fail) + '\x1b[0m\n')
process.exit(fail ? 1 : 0)
