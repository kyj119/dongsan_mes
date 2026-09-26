#!/usr/bin/env node
/**
 * 괄호 없는 **중첩 삼항**을 잡는다 — ExtendScript 가 사양과 반대로 파싱한다 (2026-09-18 실측).
 *
 * ★근거 — Illustrator 30.7 의 ExtendScript 실측:
 *     true ? 'A' : false ? 'B' : 'C'   →  'B'      (사양은 'A')
 *     (true) ? 'A' : ((false) ? 'B' : 'C')  →  'A'  (괄호를 치면 정상)
 *   즉 `?:` 가 **왼쪽 결합**으로 파싱된다. ECMAScript 는 오른쪽 결합이므로,
 *   브라우저·Node 에서 맞게 도는 코드가 일러 안에서만 **조용히 다른 값**을 낸다.
 *   예외도, 경고도 없다 — 값만 틀린다.
 *
 * ★실사고 — `mes-a0-host.jsx` 의 주석 밴드 선택:
 *     var annBand = (apos==='top') ? finMargins.top : (apos==='bottom') ? finMargins.bottom :
 *                   (apos==='left') ? finMargins.left : finMargins.right;
 *   apos 가 'top' 이어도 결과가 **좌/우 변의 여백**이 된다. 그 변이 0이면 주석이 통째로 사라지고
 *   (`annBand <= 0.5` 로 continue), 0이 아니면 **엉뚱한 변의 여백으로 글자 크기가 정해진다** —
 *   실기 보고 「주석이 너무 크게 생성」이 이것이다.
 *
 * 규칙: JSX 안에서 삼항을 이으려면 **뒤쪽 삼항을 괄호로 감싼다**.
 *   a ? b : (c ? d : (e ? f : g))
 */
const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')
const SCAN = [path.join(ROOT, 'IllustratorAutomat')]

function walk(dir, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === 'bin' || e.name === 'obj') continue
    const p = path.join(dir, e.name)
    if (e.isDirectory()) { walk(p, out); continue }
    if (/\.jsx$/i.test(e.name) && !/\.bak(-|$)/.test(e.name)) out.push(p)
  }
  return out
}

// 주석·문자열을 대충 걷어낸 뒤, `? … : … ?` 가 **같은 괄호 깊이**에서 이어지는지 본다.
function stripNoise(line) {
  let s = line.replace(/\/\/.*$/, '')
  s = s.replace(/'(\\.|[^'\\])*'/g, "''").replace(/"(\\.|[^"\\])*"/g, '""')
  s = s.replace(/\/(\\.|\[[^\]]*\]|[^/\\\n])+\/[gimsuy]*/g, '/RE/')
  return s
}

// 한 줄(또는 이어진 논리행) 안에서 깊이 0 기준의 ? 와 : 를 순서대로 뽑는다
function chainedAtSameDepth(expr) {
  let depth = 0
  const seq = []
  for (let i = 0; i < expr.length; i++) {
    const c = expr[i]
    if (c === '(' || c === '[') depth++
    else if (c === ')' || c === ']') depth--
    else if (c === '?' && depth === 0) {
      if (expr[i + 1] === '?' || expr[i + 1] === '.') { i++; continue }  // ?? · ?.
      seq.push('?')
    } else if (c === ':' && depth === 0) seq.push(':')
  }
  // `? : ?` 가 나오면 같은 깊이에서 삼항이 이어진 것 = 괄호가 없다
  const s = seq.join('')
  return /\?:\?/.test(s) || /\?:[^?]*\?:/.test(s)
}

// 삼항이 여러 줄에 걸친 형태를 한 논리행으로 잇는다. 두 가지 모양을 **둘 다** 본다(2026-09-26):
//   ① 줄 끝에 ?/: 가 있는 형태        a ? b :\n  c ? d : e
//   ② 다음 줄이 ?/: 로 **시작**하는 형태  cond\n  ? A\n  : c2 ? B : C   ← JSX 코드베이스에 흔한데 예전엔 못 봤다
function logicalLine(raw, i) {
  let joined = stripNoise(raw[i])
  let j = i
  while (j + 1 < raw.length && j - i < 8) {
    const cur = stripNoise(raw[j]); const next = stripNoise(raw[j + 1])
    if (/[?:]\s*$/.test(cur) || /^\s*[?:](?![?.])/.test(next)) { joined += ' ' + next; j++ } else break
  }
  return joined
}

function scanLines(raw, rel) {
  const out = []
  for (let i = 0; i < raw.length; i++) {
    const line = raw[i]
    if (/^\s*(\*|\/\/)/.test(line)) continue          // 주석 줄
    if (/^\s*[?:](?![?.])/.test(stripNoise(line))) continue   // 이어지는 줄은 시작 줄에서 이미 봤다
    const joined = logicalLine(raw, i)
    if ((joined.match(/\?/g) || []).length < 2) continue
    if (!chainedAtSameDepth(joined)) continue
    out.push({ file: rel, line: i + 1, text: line.trim().slice(0, 130) })
  }
  return out
}

// 자가시험 — 잡아야 할 것과 잡으면 안 되는 것을 같이 명세한다(CLAUDE.md 가 양방향이라고 적은 근거)
if (process.argv.includes('--selftest')) {
  const catchIt = [
    ["var a = x ? 1 : y ? 2 : 3;"],                               // 한 줄
    ["var a = x ? 1 :", "  y ? 2 : 3;"],                           // 줄 끝 연산자
    ["var a = x", "  ? 1", "  : y ? 2 : 3;"],                      // 줄 앞 연산자(예전 미탐)
  ]
  const passIt = [
    ["var a = x ? 1 : (y ? 2 : 3);"],                              // 괄호
    ["var a = x", "  ? 1", "  : (y ? 2 : 3);"],                    // 줄 앞 + 괄호
    ["var a = x ? 1 : 2;", "var b = y ? 3 : 4;"],                  // 별개 문장 둘
    ["var a = o?.b ?? c;"],                                        // ?. · ??
  ]
  let bad = 0
  catchIt.forEach((c, k) => { if (scanLines(c, 'c' + k).length !== 1) { bad++; console.error('  미탐:', c.join(' / ')) } })
  passIt.forEach((c, k) => { if (scanLines(c, 'p' + k).length !== 0) { bad++; console.error('  오탐:', c.join(' / ')) } })
  console.log(bad ? `[jsx-ternary] selftest FAIL ${bad}건` : `[jsx-ternary] selftest OK — 잡을 것 ${catchIt.length} · 안 잡을 것 ${passIt.length}`)
  process.exit(bad ? 1 : 0)
}

const files = SCAN.flatMap((d) => (fs.existsSync(d) ? walk(d, []) : []))
const hits = []

for (const f of files) {
  hits.push(...scanLines(fs.readFileSync(f, 'utf8').split('\n'), path.relative(ROOT, f)))
}

console.log('\nJSX 중첩 삼항 감사 — ExtendScript 는 왼쪽 결합으로 파싱한다\n' + '─'.repeat(58))
console.log(`  검사 ${files.length}개 .jsx`)
if (hits.length) {
  console.log(`\n❌ 괄호 없는 중첩 삼항 ${hits.length}건 — 뒤쪽 삼항을 괄호로 감쌀 것`)
  for (const h of hits) console.log(`   ${h.file}:${h.line}\n     ${h.text}`)
  console.log('\n  왜 = 일러 실측: true ? "A" : false ? "B" : "C"  →  "B" (사양은 "A").')
  console.log('       예외도 경고도 없이 **값만** 틀린다. 고치는 법: a ? b : (c ? d : (e ? f : g))')
  process.exit(1)
}
console.log('\n✅ 괄호 없는 중첩 삼항 없음')
