#!/usr/bin/env node
/**
 * CSV 가드 자체검증 — `src/utils/csv.ts`
 *
 * 왜 있는가: CSV 수식(formula) 인젝션은 **200 OK 로 조용히 나간다**. 타입체크·build·smoke 가
 * 전부 통과하고, 파일을 Excel 로 열어 봐야 `=HYPERLINK`/`=WEBSERVICE` 가 살아 있는 게 보인다.
 * 게다가 가드 규칙이 서버(escapeCsvField)와 클라(CSV_UTIL_JS 의 window.dsCsvCell) **두 벌**로
 * 존재해서 한쪽만 고치면 조용히 갈린다 → 두 구현을 같은 입력으로 대조한다.
 *
 * 실행: node scripts/csv-guard-selftest.cjs   (실패 시 exit 1)
 */
'use strict'

const { compileTs } = require('./lib/compile-ts.cjs')
const path = require('path')

const SRC = path.join(__dirname, '..', 'src', 'utils', 'csv.ts')
const { mod, cleanup } = compileTs(SRC)
const { escapeCsvField, generateCsv, CSV_UTIL_JS } = mod

// 클라 SSOT(문자열로 주입되는 코드)를 그대로 평가해 같은 규칙인지 대조한다.
const fakeWindow = {}
new Function('window', CSV_UTIL_JS)(fakeWindow)
const dsCsvCell = fakeWindow.dsCsvCell
const dsBuildCsv = fakeWindow.dsBuildCsv

let pass = 0
const fails = []
function eq(name, got, want) {
  if (got === want) { pass++; return }
  fails.push(`${name}\n    기대 「${want}」\n    실제 「${got}」`)
}
function ok(name, cond, detail) {
  if (cond) { pass++; return }
  fails.push(`${name}\n    ${detail || '조건 불충족'}`)
}

// ── 수식 인젝션 차단 ──
eq('=HYPERLINK 는 중화된다',
  escapeCsvField('=HYPERLINK("http://evil","click")'),
  '"\'=HYPERLINK(""http://evil"",""click"")"')
eq('@SUM 도 중화', escapeCsvField('@SUM(1)'), "'@SUM(1)")
eq('+ 로 시작하는 전화번호도 중화', escapeCsvField('+82-10-1234'), "'+82-10-1234")
eq('- 로 시작하는 비숫자 텍스트는 중화', escapeCsvField('-대금감액'), "'-대금감액")
eq('탭 선행', escapeCsvField('\tcmd'), "'\tcmd")
eq('CR 선행', escapeCsvField('\rcmd'), "'\rcmd")

// ── 숫자 음수는 보존 (금융 CSV 가 텍스트로 바뀌면 안 된다) ──
eq('문자열 음수 -1234 는 그대로', escapeCsvField('-1234'), '-1234')
eq('number 타입 음수도 그대로', escapeCsvField(-1234), '-1234')
eq('자릿수 콤마 음수는 인용만', escapeCsvField('-1,234'), '"-1,234"')
eq('소수 음수', escapeCsvField('-12.5'), '-12.5')

// ── 인용/이스케이프 ──
eq('내부 따옴표는 두 번 겹친다', escapeCsvField('a"b'), '"a""b"')
eq('콤마 포함은 인용', escapeCsvField('a,b'), '"a,b"')
eq('개행 포함은 인용', escapeCsvField('a\nb'), '"a\nb"')
eq('따옴표만 있는 상호명', escapeCsvField('(주)"동산"기획'), '"(주)""동산""기획"')
eq('평범한 값은 그대로', escapeCsvField('동산기획'), '동산기획')
eq('null 은 빈칸', escapeCsvField(null), '')
eq('undefined 는 빈칸', escapeCsvField(undefined), '')
eq('0 은 0 (빈칸 아님)', escapeCsvField(0), '0')

// ── generateCsv 조립 ──
const csv = generateCsv(['거래처', '금액'], [['=cmd|calc', -500], ['a,b', 100]])
ok('BOM 으로 시작', csv.charCodeAt(0) === 0xFEFF, `charCode=${csv.charCodeAt(0)}`)
ok('CRLF 로 줄을 나눈다', csv.includes('\r\n'), 'CRLF 없음')
eq('행 조립 결과', csv.slice(1), '거래처,금액\r\n\'=cmd|calc,-500\r\n"a,b",100')

// ── 서버/클라 규칙 대조 (한쪽만 고치면 여기서 걸린다) ──
const samples = [
  '=1+1', '+82', '-1234', '-abc', '@x', '\tt', '\rr',
  'a,b', 'a"b', 'a\nb', '', '동산기획', '(주)"A"', '-1,234', '0', null, undefined, 0, -500, 12.5
]
for (const s of samples) {
  const a = escapeCsvField(s)
  const b = dsCsvCell(s)
  if (a === b) { pass++ } else {
    fails.push(`서버/클라 규칙 불일치 입력 ${JSON.stringify(s)}\n    서버 「${a}」\n    클라 「${b}」`)
  }
}

eq('dsBuildCsv 도 같은 규칙으로 조립',
  dsBuildCsv(['거래처', '금액'], [['=cmd|calc', -500], ['a,b', 100]]),
  '거래처,금액\r\n\'=cmd|calc,-500\r\n"a,b",100')

if (typeof cleanup === 'function') cleanup()

if (fails.length > 0) {
  console.error(`\n✗ CSV 가드 자체검증 실패 ${fails.length}건 (통과 ${pass})\n`)
  for (const f of fails) console.error('  ✗ ' + f)
  process.exit(1)
}
console.log(`✓ CSV 가드 자체검증 ${pass}건 통과`)
