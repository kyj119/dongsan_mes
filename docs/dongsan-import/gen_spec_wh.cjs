/**
 * order_items.specification → width/height(cm) 파싱 소급 생성기 (2026-08-07)
 *
 * 이관 시 이카운트 「규격」 컬럼을 `specification` 문자열로만 넣고 숫자로 분해하지 않아
 * width/height 가 전 라인 비어 있다. 데이터는 손실되지 않았으므로 파싱으로 복구한다.
 *
 * ★ 단위 = cm. 근거 = `src/routes/postProcessing.ts:329` (`width/100 * height/100 = ㎡`).
 *
 * 규칙 (우선순위 — 순서를 바꾸면 mm 가 cm 로 들어가 100배 틀린다)
 *   R1  mm명시   `1000x1500mm` · `13800x900mm`  → /10 해서 cm
 *   R1b mm추정   `x` 구분자 + 단위 미표기 + 어느 한 변 ≥ 2000  → /10 해서 cm
 *   R2  선두WxH  `995*195` · `30*20 수기대 50CM` → 그대로 cm (뒤 텍스트 허용)
 *   R3  괄호안    `3구 R-150(120*80)` · `F형(51*122)` → 그대로 cm
 *   그 외(`1W`·`130cm`·`가정용`·`90폭`·`20A`)는 면적이 아니므로 건너뛴다.
 *
 * ★ R1b 가 왜 필요한가 (2026-08-07 실측으로 뒤늦게 발견 — 1차 실행 때 13라인이 100배 부풀었다)
 *   이카운트 규격은 구분자로 단위를 못 가른다. `1000x120cm`·`105x14cm` 처럼 `x` 인데 cm 인 것도 많다.
 *   가르는 건 **구분자 + 자릿수 조합**이다:
 *     · `*` 구분자 = cm — 2000 이상도 99라인 있지만 전부 실제 대형 현수막이다(원/㎡ 1,300~2,100 정상).
 *       여기에 /10 을 걸면 멀쩡한 현수막이 망가진다. **절대 `*` 에 적용하지 말 것.**
 *     · `x` 구분자 + 단위 미표기 + 2000 이상 = mm — 13라인 전부 간판·UV·솔벤후렉스·트러스바 계열로,
 *       mm 로 적는 관행이 있는 품목군이다(`7000x1250` 간판 = 700×125cm).
 *   검증 = 원/㎡. 교정 전 7~340원/㎡ 였던 것이 교정 후 3,300~33,000원/㎡ 로 정상 범위에 들어온다.
 *
 * 검증(수성 현수막 6,055라인): 파싱 면적 기준 원/㎡ 중앙값 2,451 · p05~p95 = 1,111~5,200.
 *   중앙값 20% 미만은 10라인(0.17%)뿐이라 cm 해석이 맞다.
 *   1500cm 초과 224라인도 원/㎡ 가 1,300~2,100 이라 mm 오인이 아니라 실제 대형 현수막이다.
 *
 * 안전장치: 대상은 `COALESCE(width,0)=0` 인 행뿐 — 실운영 입력값은 절대 건드리지 않는다.
 *   id 를 직접 찍어 UPDATE 하므로 규격 문자열 이스케이프 문제도 없고 롤백이 정확하다.
 *
 * 사용: node docs/dongsan-import/gen_spec_wh.cjs <targets.json> <out.sql> <rollback.sql>
 *   targets.json = [{id, sp}] — `SELECT id, specification sp FROM order_items
 *                               WHERE COALESCE(specification,'')<>'' AND COALESCE(width,0)=0`
 */
const fs = require('fs')

const [, , inPath, outPath, rbPath] = process.argv
if (!inPath || !outPath || !rbPath) {
  console.error('usage: gen_spec_wh.cjs <targets.json> <out.sql> <rollback.sql>')
  process.exit(1)
}

const NUM = '(\\d+(?:\\.\\d+)?)'
const SEP = '\\s*[*xX×]\\s*'
const R1 = new RegExp(NUM + SEP + NUM + '\\s*mm', 'i')
// R1b: `x`/`X` 만(= `*` 제외). cm 명시가 붙으면 해당 없음 — 캡처해서 아래에서 배제한다.
const R1B = new RegExp('^\\s*' + NUM + '\\s*[xX]\\s*' + NUM + '\\s*(cm)?')
const R2 = new RegExp('^\\s*' + NUM + SEP + NUM + '\\s*(?:cm)?\\b', 'i')
const R3 = new RegExp('\\(\\s*' + NUM + SEP + NUM + '\\s*(?:cm)?\\s*\\)', 'i')

const MM_MIN = 2000   // 어느 한 변이 이 이상이면 cm 로 볼 수 없다(20m 초과)

function parseSpec(raw) {
  const s = String(raw || '').trim()
  let m
  if ((m = s.match(R1))) return { w: +m[1] / 10, h: +m[2] / 10, rule: 'R1-mm' }
  if ((m = s.match(R1B)) && !m[3] && (+m[1] >= MM_MIN || +m[2] >= MM_MIN)) {
    return { w: +m[1] / 10, h: +m[2] / 10, rule: 'R1b-mm추정' }
  }
  if ((m = s.match(R2))) return { w: +m[1], h: +m[2], rule: 'R2-lead' }
  if ((m = s.match(R3))) return { w: +m[1], h: +m[2], rule: 'R3-paren' }
  return null
}

const rows = JSON.parse(fs.readFileSync(inPath, 'utf8'))
const byPair = new Map()          // "w|h" → [id...]
const ruleN = {}
const skipped = []
const round1 = n => Math.round(n * 10) / 10   // cm 소수 1자리 (mm 나눗셈 잔재 제거)

for (const r of rows) {
  const p = parseSpec(r.sp)
  if (!p || !(p.w > 0) || !(p.h > 0)) { skipped.push(r); continue }
  const w = round1(p.w), h = round1(p.h)
  const k = w + '|' + h
  if (!byPair.has(k)) byPair.set(k, [])
  byPair.get(k).push(r.id)
  ruleN[p.rule] = (ruleN[p.rule] || 0) + 1
}

const CHUNK = 400
const out = [
  '-- order_items.specification → width/height(cm) 파싱 소급 (2026-08-07)',
  '-- 생성기 = docs/dongsan-import/gen_spec_wh.cjs (규칙·검증 근거는 그 파일 헤더)',
  '-- 대상 = width 가 비어 있고 규격이 WxH 로 파싱되는 라인만. 실운영 입력값 불간섭.',
  '-- 롤백 = docs/dongsan-import/load/rollback_spec_wh.sql',
  '',
]
const rb = [
  '-- 규격 파싱 소급 롤백 (2026-08-07) — 이 스크립트가 채운 라인만 NULL 로 되돌린다',
  '-- 실행 전에도 이 행들의 width/height 는 비어 있었다(대상 조건이 COALESCE(width,0)=0).',
  '',
]

let updates = 0, lines = 0
const allIds = []
for (const [k, ids] of byPair) {
  const [w, h] = k.split('|')
  for (let i = 0; i < ids.length; i += CHUNK) {
    const part = ids.slice(i, i + CHUNK)
    out.push(`UPDATE order_items SET width = ${w}, height = ${h} WHERE id IN (${part.join(',')});`)
    updates++
  }
  lines += ids.length
  allIds.push(...ids)
}
allIds.sort((a, b) => a - b)
for (let i = 0; i < allIds.length; i += CHUNK) {
  rb.push(`UPDATE order_items SET width = NULL, height = NULL WHERE id IN (${allIds.slice(i, i + CHUNK).join(',')});`)
}

fs.writeFileSync(outPath, out.join('\n') + '\n')
fs.writeFileSync(rbPath, rb.join('\n') + '\n')

console.log('입력', rows.length, '라인')
console.log('파싱 성공', lines, '라인 (' + (100 * lines / rows.length).toFixed(1) + '%) · 규격쌍', byPair.size, '· UPDATE', updates, '문')
console.log('규칙별', JSON.stringify(ruleN))
console.log('건너뜀', skipped.length, '라인')
const sk = {}
for (const s of skipped) sk[s.sp] = (sk[s.sp] || 0) + 1
console.log('건너뛴 규격 상위 15:')
for (const k of Object.keys(sk).sort((a, b) => sk[b] - sk[a]).slice(0, 15)) console.log('  ', String(sk[k]).padStart(4), JSON.stringify(k))
