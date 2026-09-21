#!/usr/bin/env node
/**
 * IA 스크립트 구문 감사 — `npm run audit:jsx-syntax`
 *
 * ★**여태 IA 의 `.jsx` 를 파싱해 보는 게이트가 하나도 없었다.**
 *   게이트들은 호스트 소스를 **문자열로 읽어** 정규식으로 검사했다(`cut:smoke`·`panel:smoke`).
 *   그래서 파일이 통째로 안 실리는 상태여도 전부 초록이었다.
 *
 * ★2026-09-21 실사고 — `mes-tr-host.jsx` 가 **한 번도 안 실렸다.**
 *   머리말 주석의 `const/let/화살표/(별표)JSON(별표)/Array.map` 에서 별표 뒤 슬래시가
 *   **블록 주석을 닫아**, 뒤 문장이 코드로 파싱되며 파일 전체가 구문 오류였다
 *   (ExtendScript: 「구문 오류: 필요 항목: ;」 · line 12). 0.1.0·0.2.0 두 번 Z: 에 나갔지만
 *   스텁이 애초에 그 파일을 안 읽어(이름 손목록) **증상 자체가 가려져 있었고**,
 *   스텁을 열거로 고치자(stub-3.0.0) 비로소 드러났다. 두 결함이 서로를 가린 것이다.
 *   ⚠️이 감사 파일의 주석을 쓰다가 **같은 자리에서 또 당했다** — 그래서 예시를 리터럴로 안 쓴다.
 *
 * ★`node --check` 는 `.jsx` 를 못 읽는다(확장자 거부 · `#target` 을 private field 로 파싱).
 *   그 사실은 메모리에 기록돼 있었지만 **아무도 자동으로 안 돌렸다** — 사람이 부를 때만 도는
 *   지식은 게이트가 아니다. 여기서 디렉티브를 주석 처리하고 `vm.Script` 로 파싱만 한다(실행 없음).
 *
 * 대상 = IllustratorAutomat 의 모든 `.jsx` + CEP 패널의 `js/*.js`.
 *   ⚠️**손목록을 두지 않는다** — 열거한다(같은 병으로 2026-09-18 에 전사 호스트를 놓쳤다).
 *   백업(`.bak-*`)과 `node_modules` 는 뺀다.
 *
 * 자가시험 = `--selftest` (잡아야 할 것 / 잡으면 안 되는 것 양방향).
 */
const fs = require('fs')
const path = require('path')
const vm = require('vm')

const REPO = path.resolve(__dirname, '..')
const ROOTS = [path.join(REPO, 'IllustratorAutomat')]
const SKIP_DIR = /(^|[\\/])(node_modules|bin|obj|_retired|\.git)([\\/]|$)/
const SKIP_FILE = /\.bak[-.]|\.orig$|~$/

/** `#target illustrator` 류 디렉티브는 JS 가 아니다 — 주석 처리해서 파서에 넘긴다. */
function neutralize(src) {
  return src.replace(/^[ \t]*#(target|targetengine|include|includepath|script|strict|engine)\b.*$/gm, (m) => '//' + m)
}

function walk(dir, out) {
  let items
  try { items = fs.readdirSync(dir, { withFileTypes: true }) } catch { return out }
  for (const it of items) {
    const p = path.join(dir, it.name)
    if (it.isDirectory()) { if (!SKIP_DIR.test(p)) walk(p, out); continue }
    if (SKIP_FILE.test(it.name)) continue
    if (/\.jsx$/i.test(it.name)) out.push(p)
    else if (/\.js$/i.test(it.name) && /com\.mes\.a0\.panel[\\/]js[\\/]/.test(p)) out.push(p)
  }
  return out
}

/** @returns {null | {line:number, message:string, hint:string}} */
function checkSource(src, label) {
  try {
    new vm.Script(neutralize(src), { filename: label || 'x.js' })
    return null
  } catch (e) {
    const m = /:(\d+)\b/.exec(String(e.stack || '').split('\n')[0] || '')
    return {
      line: m ? Number(m[1]) : 0,
      message: String(e.message || e),
      hint: hintFor(src),
    }
  }
}

/**
 * 구문 오류만 알려 주면 사람이 또 한참 찾는다 — **이 저장소에서 실제로 난 원인**을 먼저 짚는다.
 * 블록 주석 안에서 별표 강조 뒤에 슬래시가 붙으면 그 자리에서 주석이 닫힌다.
 */
function hintFor(src) {
  const CLOSE = '*' + '/'
  const lines = src.split(/\r?\n/)
  let inBlock = false
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]
    if (!inBlock && /\/\*/.test(l) && l.indexOf(CLOSE) < 0) { inBlock = true; continue }
    if (!inBlock) continue
    const at = l.indexOf(CLOSE)
    if (at < 0) continue
    // 줄이 ` */` 로 **끝나는** 정상 종료가 아니라 문장 한복판에서 닫히면 그게 범인이다.
    const after = l.slice(at + 2).trim()
    if (after.length > 0) {
      return `L${i + 1} 에서 블록 주석이 문장 도중에 닫힙니다 — 별표 강조 뒤에 슬래시가 붙은 자리를 보세요: ${l.trim().slice(0, 90)}`
    }
    inBlock = false
  }
  return ''
}

function selftest() {
  const OPEN = '/' + '*'
  const CLOSE = '*' + '/'
  const STAR = '*'
  const cases = [
    // [이름, 소스, 잡아야 하는가]
    ['정상 JSX', '#target illustrator\nvar a = 1;\nfunction f() { return a; }\n', false],
    ['디렉티브만', '#target illustrator\n#include "x.jsx"\nvar a = 1;\n', false],
    ['정상 블록 주석', OPEN + '*\n * ' + STAR + STAR + 'JSON' + STAR + STAR + ' 금지\n ' + CLOSE + '\nvar a = 1;\n', false],
    ['★강조 뒤 슬래시로 주석이 닫힘', OPEN + '*\n * a/' + STAR + STAR + 'JSON' + STAR + STAR + '/b.map 금지\n ' + CLOSE + '\nvar a = 1;\n', true],
    ['그냥 구문 오류', 'var a = ;\n', true],
    ['ES3 아닌 건 여기서 안 본다(파싱만)', 'const a = () => 1;\n', false],
  ]
  let bad = 0
  for (const [name, src, shouldFail] of cases) {
    const r = checkSource(src, name)
    const got = !!r
    const ok = got === shouldFail
    if (!ok) bad++
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${got ? '   ← ' + r.message : ''}`)
  }
  console.log(bad ? `\n자가시험 실패 ${bad}건` : '\n자가시험 통과')
  return bad
}

function main() {
  if (process.argv.includes('--selftest')) {
    console.log('\nIA 구문 감사 자가시험\n' + '='.repeat(56))
    process.exit(selftest() ? 1 : 0)
  }

  const files = []
  for (const r of ROOTS) walk(r, files)
  files.sort()

  console.log('\nIA 스크립트 구문 감사 — 문자열로 읽기 전에 **파싱**한다')
  console.log('='.repeat(64))

  const bad = []
  for (const f of files) {
    let src
    try { src = fs.readFileSync(f, 'utf8') } catch (e) { bad.push({ f, line: 0, message: '읽기 실패: ' + e.message, hint: '' }); continue }
    const r = checkSource(src, f)
    if (r) bad.push(Object.assign({ f }, r))
  }

  console.log(`  검사 ${files.length}개 (.jsx + 패널 js)`)
  if (!bad.length) { console.log('\n✅ 전부 파싱됩니다'); process.exit(0) }

  console.log(`\n❌ 파싱 실패 ${bad.length}건 — 이 파일은 런타임에 **통째로 안 실린다**`)
  for (const b of bad) {
    console.log(`\n  ${path.relative(REPO, b.f).replace(/\\/g, '/')}  L${b.line}`)
    console.log(`    ${b.message}`)
    if (b.hint) console.log(`    ↳ ${b.hint}`)
  }
  console.log('\n  ⚠️ 문자열 정규식 게이트(cut:smoke·panel:smoke)는 이걸 못 잡는다 — 전부 초록이다.')
  process.exit(1)
}

main()
