/**
 * CEP 스텁(`jsx/host.jsx`)의 `$.evalFile` 이 **전역 스코프**에서 호출되는가.
 *
 * ★왜 따로 재는가 — ExtendScript 는 `$.evalFile` 을 **부른 자리의 스코프**에 심는다.
 *   함수 안에서 부르면 mesA0_*·mesCut_*·mesTr_* 가 그 함수의 지역 변수가 되고,
 *   evalScript 에서는 「함수가 아닙니다」만 돌아온다(2026-07-27 실제 발생).
 *
 * ★게이트는 「그 자리에 그 글자가 있는가」가 아니라 **「그 성질이 지켜지는가」**를 물어야 한다.
 *   종전 표현은 정규식 `\(function\s*\([^)]*\)\s*\{[\s\S]*\$\.evalFile` 이었다 —
 *   「evalFile 앞에 함수 리터럴이 하나라도 있으면 위반」이라, 2026-09-18 에 스텁이
 *   `getFiles(function (f) {...})` **콜백**으로 폴더를 열거하기 시작하자 곧바로 오탐이 났다.
 *   (그 정규식은 IIFE 의 핵심인 **즉시 호출 `()`** 을 한 번도 검사하지 않았다.)
 *   → 여기서는 브레이스를 세어 **호출이 열린 함수 본문 안에 있는지**를 직접 본다.
 *     `for`·`try` 블록은 ES3 에서 스코프를 만들지 않으므로 함수 본문만 센다.
 *
 * ⚠️ 한계 — 정규식 리터럴 안의 `{`·`}`·따옴표는 세지 못한다(토크나이저가 아니다).
 *    스텁은 그런 리터럴을 쓰지 않으므로 충분하고, 쓰게 되면 이 주석을 보고 고쳐라.
 */

/** 주석과 문자열을 지운다 — 남는 건 구조뿐이라 브레이스를 셀 수 있다. */
function stripNoise(src) {
  let out = ''
  let i = 0
  const n = src.length
  while (i < n) {
    const c = src[i]
    const d = src[i + 1]
    if (c === '/' && d === '/') { while (i < n && src[i] !== '\n') i++; continue }
    if (c === '/' && d === '*') { i += 2; while (i < n && !(src[i] === '*' && src[i + 1] === '/')) i++; i += 2; continue }
    if (c === '"' || c === "'") {
      const q = c
      i++
      while (i < n && src[i] !== q) { if (src[i] === '\\') i++; i++ }
      i++
      out += '""'
      continue
    }
    out += c
    i++
  }
  return out
}

/**
 * @returns {{calls:number, nested:number, depths:number[]}}
 *   calls  = `$.evalFile` 호출 수 (주석·문자열 제외)
 *   nested = 그중 **함수 본문 안**에 있는 것 (0 이어야 한다)
 */
function evalFileScope(src) {
  const code = stripNoise(src)
  const depths = []
  const stack = []      // 열린 `{` 가 함수 본문인가
  let depth = 0
  let pendingFn = false
  for (let i = 0; i < code.length; i++) {
    if (code.startsWith('function', i) && !/[A-Za-z0-9_$]/.test(code[i - 1] || ' ')) {
      pendingFn = true
      i += 7
      continue
    }
    if (code.startsWith('$.evalFile', i)) { depths.push(depth); i += 9; continue }
    const ch = code[i]
    if (ch === '{') { stack.push(pendingFn); if (pendingFn) depth++; pendingFn = false; continue }
    if (ch === '}') { if (stack.pop()) depth--; continue }
  }
  return { calls: depths.length, nested: depths.filter((d) => d > 0).length, depths }
}

module.exports = { evalFileScope, stripNoise }
