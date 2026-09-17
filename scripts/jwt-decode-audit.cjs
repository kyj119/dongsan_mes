#!/usr/bin/env node
/**
 * JWT 를 **손으로 까는 자리**를 잡는다 (2026-09-17).
 *
 * ★왜 있나 — `atob(token.split('.')[1])` 은 **틀린 코드**다. JWT 는 base64url(`-`·`_`·패딩 없음)이고
 *   `atob` 은 표준 base64 만 받는다. 게다가 이 시스템의 페이로드에는 `"username":"인호동"` 처럼
 *   한글이 들어가서, 인코딩 바이트에 따라 `InvalidCharacterError` 로 **던진다**.
 *   실기 2026-09-17: `shell.js` 의 로컬 exp 체크가 그 예외를 「손상된 토큰」으로 읽고 **토큰을 지우고
 *   /login 으로 보냈다**. 로그인 API 는 200 이었는데 다음 화면에서 조용히 로그아웃된 것이라,
 *   증상이 「로그인했는데 바로 로그인창으로 되돌아온다」였고 `exp` 가 매번 달라 **되다 안 되다** 했다.
 *   당시 이런 자리가 **7곳**이었고 정확도가 제각각이었다(생짜 3 · 패딩 누락 3 · 정본 0).
 *
 * 규칙: JWT 페이로드는 `mesJwtPayload()`(shell.js) 하나로만 읽는다.
 *   여기서 잡는 것 = `atob(` 의 인자에 `split('.')` 이나 `parts[1]` 이 섞인 표현.
 *   (favicon·팩스 첨부처럼 **JWT 가 아닌** base64 디코드는 대상이 아니다)
 */
const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')
const SCAN = [path.join(ROOT, 'src')]
const CANON = 'mesJwtPayload'

// atob( ... ) 한 줄 안에 JWT 조각 접근이 같이 있으면 손으로 까는 것이다
const JWT_ISH = /atob\s*\(([^)]*(?:split\s*\(\s*['"]\.['"]\s*\)|parts\s*\[\s*1\s*\]|\[\s*1\s*\])[^)]*)\)/

function walk(dir, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) { if (e.name !== 'node_modules') walk(p, out); continue }
    if (/\.(js|ts|tsx)$/.test(e.name)) out.push(p)
  }
  return out
}

const files = SCAN.flatMap((d) => (fs.existsSync(d) ? walk(d, []) : []))
const hits = []
let canonDefined = false

for (const f of files) {
  const src = fs.readFileSync(f, 'utf8')
  if (/function\s+mesJwtPayload\s*\(/.test(src)) canonDefined = true
  src.split('\n').forEach((line, i) => {
    if (line.trim().startsWith('*') || line.trim().startsWith('//')) return   // 주석은 설명이지 코드가 아니다
    if (JWT_ISH.test(line)) hits.push({ file: path.relative(ROOT, f), line: i + 1, text: line.trim().slice(0, 120) })
  })
}

console.log('\nJWT 디코드 감사 — 손으로 까는 자리\n' + '─'.repeat(46))
console.log(`  검사 ${files.length}개 파일 · 정본(${CANON}) ${canonDefined ? '있음' : '없음'}`)

if (!canonDefined) {
  console.log(`\n❌ 정본 ${CANON}() 이 없다 — shell.js 에 있어야 한다`)
  process.exit(1)
}
if (hits.length) {
  console.log(`\n❌ 손으로 까는 자리 ${hits.length}건 — ${CANON}() 을 쓸 것`)
  for (const h of hits) console.log(`   ${h.file}:${h.line}\n     ${h.text}`)
  console.log('\n  왜 = base64url(-·_·패딩 없음) + 한글 페이로드라 atob 이 던진다.')
  console.log('       던진 예외를 「손상된 토큰」으로 읽으면 멀쩡한 사용자를 로그아웃시킨다(2026-09-17 실기).')
  process.exit(1)
}
console.log('\n✅ 전부 정본 경유')
