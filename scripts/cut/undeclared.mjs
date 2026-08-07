/**
 * 미선언 식별자 검출 — **스코프 사고 방지 게이트** (2026-08-07)
 *
 * 왜 있나: 패널 JS 는 `img.onload` · `evalScript` 콜백 안에서 돈다. 거기서 난 ReferenceError 는
 * 아무 데도 안 잡히고 **조용히 사라진다** — 화면엔 마지막 상태 문구만 남아 "느리다/멈췄다" 로 보인다.
 * 실제로 타이밍 계측 블록(`var T`)이 편집 중 **다른 함수로 들어가** `runNest()` 전체가 죽었는데,
 * 성능 문제로 두 번 오진하고 몇 시간을 썼다. `node --check` 는 문법만 보므로 이걸 못 잡는다.
 *
 * 방식(파서 없이):
 *   ① 주석·문자열·정규식 리터럴을 지운다(길이를 보존해 위치가 안 밀리게 공백으로 치환)
 *   ② IIFE 최상위 함수(`^  function NAME(`)를 중괄호 세기로 잘라낸다
 *   ③ 각 함수에서 `X.` / `X(` 로 쓰인 식별자를 모아, **그 함수 본문 + 모듈 최상위 + 전역**에
 *      선언이 없으면 보고한다
 *
 * ⚠️ 일부러 **과대 허용**이다(중첩 함수의 선언도 바깥 함수 것으로 친다). 오탐이 나면 게이트를
 *    아무도 안 믿게 되므로, 놓치는 쪽을 택했다 — 그래도 이번 사고 유형은 확실히 잡는다.
 */

const GLOBALS = new Set([
  'window', 'document', 'navigator', 'location', 'console', 'globalThis', 'self',
  'Math', 'Date', 'JSON', 'String', 'Number', 'Boolean', 'Array', 'Object', 'RegExp',
  'Error', 'TypeError', 'RangeError', 'Function', 'Promise', 'Map', 'Set', 'Symbol',
  'parseInt', 'parseFloat', 'isNaN', 'isFinite', 'encodeURIComponent', 'decodeURIComponent',
  'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'requestAnimationFrame',
  'Uint8Array', 'Uint8ClampedArray', 'Int8Array', 'Int16Array', 'Uint16Array', 'Int32Array',
  'Uint32Array', 'Float32Array', 'Float64Array', 'ArrayBuffer', 'DataView',
  'Image', 'Blob', 'URL', 'FileReader', 'XMLHttpRequest', 'performance', 'atob', 'btoa',
  'Event', 'CustomEvent', 'MouseEvent', 'KeyboardEvent', 'FormData', 'fetch', 'alert',
  'module', 'require', 'exports', 'CSInterface', 'CSEvent', 'cep', 'arguments',
])

const KEYWORDS = new Set([
  'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'default', 'break', 'continue',
  'return', 'function', 'var', 'let', 'const', 'new', 'delete', 'typeof', 'instanceof',
  'in', 'of', 'this', 'try', 'catch', 'finally', 'throw', 'void', 'with', 'class',
  'extends', 'super', 'yield', 'await', 'async', 'true', 'false', 'null', 'undefined',
])

/** 주석·문자열·정규식을 같은 길이의 공백으로 — 위치가 밀리지 않아야 중괄호 세기가 맞는다. */
export function stripLiterals(src) {
  const out = src.split('')
  const blank = (a, b) => { for (let i = a; i < b && i < out.length; i++) if (out[i] !== '\n') out[i] = ' ' }
  let i = 0
  // 정규식 리터럴 판정용 — 직전 유효 문자가 값이면 나눗셈, 연산자/구두점이면 정규식.
  let prev = ''
  while (i < src.length) {
    const c = src[i], c2 = src[i + 1]
    if (c === '/' && c2 === '/') { let j = i; while (j < src.length && src[j] !== '\n') j++; blank(i, j); i = j; continue }
    if (c === '/' && c2 === '*') { let j = src.indexOf('*/', i + 2); j = j < 0 ? src.length : j + 2; blank(i, j); i = j; continue }
    if (c === '"' || c === "'" || c === '`') {
      let j = i + 1
      while (j < src.length) { if (src[j] === '\\') { j += 2; continue } if (src[j] === c) { j++; break } j++ }
      blank(i, j); i = j; prev = 'x'; continue
    }
    if (c === '/' && !/[\w$)\]]/.test(prev)) {          // 값 뒤가 아니면 정규식
      let j = i + 1, cls = false
      while (j < src.length) {
        if (src[j] === '\\') { j += 2; continue }
        if (src[j] === '[') cls = true
        else if (src[j] === ']') cls = false
        else if (src[j] === '/' && !cls) { j++; break }
        else if (src[j] === '\n') break
        j++
      }
      blank(i, j); i = j; prev = 'x'; continue
    }
    if (!/\s/.test(c)) prev = c
    i++
  }
  return out.join('')
}

/** 중괄호를 세어 `from` 위치의 `{` 부터 짝이 맞는 `}` 까지 인덱스를 돌려준다. */
function blockEnd(src, from) {
  const open = src.indexOf('{', from)
  if (open < 0) return -1
  let depth = 0
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++
    else if (src[i] === '}') { depth--; if (depth === 0) return i + 1 }
  }
  return -1
}

/** 이 조각 안에서 선언되는 이름들 — var/let/const · function · 매개변수 · catch. */
function declaredIn(code) {
  const s = new Set()
  for (const m of code.matchAll(/\b(?:var|let|const)\s+([^;\n]+)/g)) {
    for (const part of m[1].split(',')) {
      const id = part.trim().match(/^([A-Za-z_$][\w$]*)/)
      if (id) s.add(id[1])
    }
  }
  for (const m of code.matchAll(/\bfunction\s*([A-Za-z_$][\w$]*)?\s*\(([^)]*)\)/g)) {
    if (m[1]) s.add(m[1])
    for (const p of m[2].split(',')) { const t = p.trim(); if (t) s.add(t) }
  }
  for (const m of code.matchAll(/\bcatch\s*\(\s*([A-Za-z_$][\w$]*)/g)) s.add(m[1])
  return s
}

/** `X.` 또는 `X(` 로 쓰인 bare 식별자 — 실제로 터지는 건 이 형태다. */
function usedIn(code) {
  const s = new Set()
  for (const m of code.matchAll(/(^|[^.\w$])([A-Za-z_$][\w$]*)\s*(?=[.(])/g)) {
    if (!KEYWORDS.has(m[2])) s.add(m[2])
  }
  return s
}

/**
 * @returns [{fn, name}] — 함수 이름과 그 안에서 미선언으로 쓰인 식별자
 */
export function findUndeclared(src, extraGlobals = []) {
  const code = stripLiterals(src)
  const allow = new Set([...GLOBALS, ...extraGlobals])

  // IIFE 최상위 함수(들여쓰기 2칸) 를 잘라낸다
  const fns = []
  for (const m of code.matchAll(/^  function\s+([A-Za-z_$][\w$]*)\s*\(([^)]*)\)/gm)) {
    const end = blockEnd(code, m.index + m[0].length)
    if (end > 0) fns.push({ name: m[1], params: m[2], start: m.index, end })
  }
  // 모듈 스코프 = 전체에서 위 함수 본문을 뺀 나머지
  let rest = code, cut = 0
  for (const f of fns) { rest = rest.slice(0, f.start - cut) + rest.slice(f.end - cut); cut += f.end - f.start }
  const moduleScope = declaredIn(rest)
  for (const f of fns) moduleScope.add(f.name)

  const bad = []
  for (const f of fns) {
    const body = code.slice(f.start, f.end)
    const decl = declaredIn(body)
    for (const p of f.params.split(',')) { const t = p.trim(); if (t) decl.add(t) }
    for (const u of usedIn(body)) {
      if (decl.has(u) || moduleScope.has(u) || allow.has(u)) continue
      bad.push({ fn: f.name, name: u })
    }
  }
  return bad
}
