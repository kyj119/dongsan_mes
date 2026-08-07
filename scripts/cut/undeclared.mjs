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

/**
 * `var` 선언문에서 **선언되는 이름만** 뽑는다.
 * ⚠️ 쉼표로 그냥 자르면 안 된다 — `var hi = G.inkMask(img, mode, THR);` 의 `mode`·`THR` 까지
 *    선언으로 읽혀 오탐이 쏟아진다(2026-08-07 실제로 그랬다). **괄호 깊이 0 의 쉼표**만 구분자다.
 * @param code 조각  @param from 키워드(`var`/`let`/`const`) **바로 뒤** 위치
 */
function declList(code, from) {
  const names = []
  let i = from, depth = 0, expect = true
  while (i < code.length) {
    const c = code[i]
    if (depth === 0 && c === ';') break
    if ('([{'.includes(c)) { depth++; i++; continue }
    if (')]}'.includes(c)) { depth--; i++; continue }
    if (depth === 0 && c === ',') { expect = true; i++; continue }
    if (expect && /[A-Za-z_$]/.test(c)) {
      const m = code.slice(i).match(/^[A-Za-z_$][\w$]*/)
      names.push(m[0]); i += m[0].length; expect = false; continue
    }
    if (expect && !/\s/.test(c)) expect = false     // 구조분해 등 — 이름을 못 읽으면 건너뛴다
    i++
  }
  return names
}

/** 이 조각 안에서 선언되는 이름들 — var/let/const · function · 매개변수 · catch. */
function declaredIn(code) {
  const s = new Set()
  for (const m of code.matchAll(/\b(?:var|let|const)\s+/g)) {
    for (const n of declList(code, m.index + m[0].length)) s.add(n)
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

/** IIFE 최상위 함수(들여쓰기 2칸) 목록 — 본문 범위까지. */
function topFunctions(code) {
  const fns = []
  for (const m of code.matchAll(/^  function\s+([A-Za-z_$][\w$]*)\s*\(([^)]*)\)/gm)) {
    const end = blockEnd(code, m.index + m[0].length)
    if (end > 0) fns.push({ name: m[1], params: m[2], start: m.index, end })
  }
  return fns
}

/**
 * `var` 는 호이스팅돼 **선언보다 먼저 읽으면 `undefined`** 다 — 문법 오류도 ReferenceError 도 아니라
 * `.toFixed` 같은 데서 엉뚱하게 터진다(2026-08-07 `mmpp` 실사고: 선언이 200줄 아래에 있었다).
 * 미선언 검사(`findUndeclared`)로는 못 잡는다 — 선언은 **있기** 때문이다.
 *
 * ⚠️ 비교는 **같은 함수 스코프 안에서만** 한다. 다른(바깥) 스코프의 var 를 콜백이 먼저 읽는 건
 *    나중에 실행되므로 정상이다 — 이 코드베이스는 콜백투성이라 그걸 잡으면 오탐으로 게이트가 죽는다.
 *    그래서 **재귀로 스코프를 판다**. 실사고(`mmpp`)가 `nestPrepare(...)` 콜백 **안쪽** 스코프에서
 *    났으므로, 최상위 함수만 보는 판으로는 못 잡는다(실제로 못 잡아서 이렇게 고쳤다).
 * @returns [{fn, name}]
 */
export function findUseBeforeVar(src) {
  const code = stripLiterals(src)
  const bad = []

  /** 이 스코프에 **직접** 속한 위치만 보고, 자식 함수는 각자 재귀로 본다. */
  function scan(body, label) {
    const kids = []
    for (const m of body.matchAll(/\bfunction\b/g)) {
      if (m.index === 0) continue                      // 자기 자신의 머리
      if (kids.some((r) => m.index < r[1])) continue   // 이미 자식에 덮인 구간
      const end = blockEnd(body, m.index)
      if (end > 0) kids.push([m.index, end])
    }
    const mine = (i) => !kids.some((r) => i >= r[0] && i < r[1])

    // 매개변수는 **진입 시점에 이미 값이 있다** → 아래쪽에서 같은 이름을 `var` 로 다시 선언해도
    //   undefined 구간이 생기지 않는다. 제외하지 않으면 이 코드베이스에서만 6건이 오탐으로 나온다.
    const params = new Set()
    const head = body.match(/^\s*function\s*[A-Za-z_$][\w$]*\s*\(([^)]*)\)|^\s*function\s*\(([^)]*)\)/)
    if (head) for (const p of String(head[1] ?? head[2] ?? '').split(',')) { const t = p.trim(); if (t) params.add(t) }

    const declAt = new Map()
    for (const m of body.matchAll(/\bvar\s+/g)) {
      if (!mine(m.index)) continue
      for (const n of declList(body, m.index + m[0].length)) {
        if (!params.has(n) && !declAt.has(n)) declAt.set(n, m.index)
      }
    }
    if (declAt.size) {
      const firstUse = new Map()
      for (const m of body.matchAll(/(^|[^.\w$])([A-Za-z_$][\w$]*)\s*(?!:)/g)) {
        const name = m[2], at = m.index + m[1].length
        if (!declAt.has(name) || firstUse.has(name) || !mine(at)) continue
        firstUse.set(name, at)
      }
      for (const [name, at] of declAt) {
        const u = firstUse.get(name)
        if (u !== undefined && u < at) bad.push({ fn: label, name })
      }
    }
    for (const k of kids) scan(body.slice(k[0], k[1]), label)
  }

  for (const f of topFunctions(code)) scan(code.slice(f.start, f.end), f.name)
  return bad
}

/**
 * @returns [{fn, name}] — 함수 이름과 그 안에서 미선언으로 쓰인 식별자
 */
export function findUndeclared(src, extraGlobals = []) {
  const code = stripLiterals(src)
  const allow = new Set([...GLOBALS, ...extraGlobals])

  const fns = topFunctions(code)
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
