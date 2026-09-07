#!/usr/bin/env node
/**
 * 비용 계정 정합성 감사 — `expense_categories` ↔ 통장·카드 분류
 *
 * ★왜 있는가 (2026-09-07)
 *   이 축을 볼 도구가 없어서 다음이 전부 조용히 굴러가고 있었다:
 *     · 표준 계정 3종이 `is_active=0` 인데 데이터 8건이 그 안에 갇혀 있었다(화면에서 못 고른다)
 *     · 「차입금상환」에 **차입 실행(입금) 2건 1.2억** 이 섞여 상환 실적이 묻혔다
 *     · 「수도광열비」에 세금 성격 30건이 남아 있었다
 *   타입체크·smoke 는 이걸 절대 못 잡는다 — 계정이 틀려도 200 이고 화면도 정상이다.
 *
 * ★역할은 이제 `expense_categories.role`(0584) 이 정본이다 — 계정명 문자열로 가르던
 *   `CAT_ROLE` 사본 쌍은 폐기했다. 그래서 「사본이 어긋났나」 대신 **「역할 값이 성립하나」**를 본다.
 *   이름 기반 판정이 남은 곳은 아래 ⑥·⑦ 뿐이고, 그건 판단이 아니라 **의심**이다(게이트 안에만 산다).
 *
 * 보는 것:
 *   ① 비활성 계정에 남은 행                → 화면에서 고칠 수 없다 (P0)
 *   ② 입금에 **비용 역할** 계정이 붙음      → 부호가 반대다. NOT_EXPENSE 는 입금이 정상이라 제외 (P0)
 *   ③ 역할 어휘 밖의 값                    → 코드가 조용히 SGA(비용)로 떨어뜨린다 (P0)
 *   ④ 같은 이름인데 법인마다 역할이 다름    → 연간 손익은 **이름으로** 합산한다 → 어느 역할이 이길지 미정 (P0)
 *   ⑤ 역할 미지정(빈값)                    → 기본값이 안 먹은 행 (P0)
 *   ⑥ 방향을 말하는 계정에 반대 거래       → 「상환」에 입금, 「취득」에 입금 (P1)
 *   ⑦ 이름은 자금이동인데 역할이 비용       → 새 계정을 만들며 역할을 안 골랐을 때 (P1 의심)
 *
 * 실행: node scripts/expense-category-audit.cjs [--remote]   (발견 시 exit 1)
 */
'use strict'

const { execFileSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const REMOTE = process.argv.includes('--remote')
const C = { g: '\x1b[32m', r: '\x1b[31m', y: '\x1b[33m', d: '\x1b[2m', b: '\x1b[1m', x: '\x1b[0m' }

function d1(sql, tries = 3) {
  // ★wrangler 를 npx 로 부르지 않는다(Windows npx.cmd spawn 차단 · shell:true 면 SQL 이 토막난다).
  const wrangler = path.join(__dirname, '..', 'node_modules', 'wrangler', 'bin', 'wrangler.js')
  const args = [wrangler, 'd1', 'execute', 'webapp-production', REMOTE ? '--remote' : '--local', '--json',
                '--command', sql.replace(/\s+/g, ' ').trim()]
  for (let i = 0; i < tries; i++) {
    try {
      const out = execFileSync(process.execPath, args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, shell: false })
      const j = out.indexOf('[')
      if (j < 0) throw new Error('D1 응답 파싱 불가')
      return (JSON.parse(out.slice(j))[0] || {}).results || []
    } catch (e) {
      const m = String((e.stdout || '') + (e.stderr || ''))
      if (i < tries - 1 && /7403|fetch failed|not authorized/.test(m)) continue
      throw new Error(m.slice(0, 300) || e.message)
    }
  }
}
const won = (n) => Math.round(Number(n) || 0).toLocaleString('ko-KR')

// 역할 어휘는 src/utils/expenseRole.ts 가 정본 — 여기서 목록을 다시 적지 않는다.
const roleSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'utils', 'expenseRole.ts'), 'utf8')
const roleMatch = roleSrc.match(/export const EXPENSE_ROLES\s*=\s*\[([^\]]*)\]/)
if (!roleMatch) throw new Error('EXPENSE_ROLES 를 못 찾았다 — src/utils/expenseRole.ts')
const ROLES = roleMatch[1].split(',').map(x => x.trim().replace(/^'|'$/g, '')).filter(Boolean)
if (!ROLES.length) throw new Error('EXPENSE_ROLES 가 비었다')
const roleSql = ROLES.map(r => `'${r}'`).join(',')

// ⑦ 의심 이름 — **판단이 아니라 의심**이다. 제품 코드에 두면 다시 「이름이 역할을 정하는」 구조가 된다.
const FLOW_LIKE = ['%상환%', '%차입%', '%대출%', '%가수금%', '%가지급금%', '%보증금%', '%취득%',
                   '%부가세%', '%리스료%', '%공제부금%', '%예수금%', '%카드대금%']
const flowSql = FLOW_LIKE.map(p => `ec.name LIKE '${p}'`).join(' OR ')

let bad = 0
console.log(`\n${C.b}■ 비용 계정 정합성 감사${C.x} ${C.d}(${REMOTE ? 'prod' : '로컬'})${C.x}\n`)

const CHECKS = [
  ['P0', '비활성 계정에 남은 행 (통장)',
   `SELECT bt.id, bt.transaction_date d, bt.counterpart_name cn, bt.amount amt, ec.name nm
    FROM bank_transactions bt JOIN expense_categories ec ON ec.id = bt.matched_category_id
    WHERE ec.is_active = 0`],
  ['P0', '비활성 계정에 남은 행 (카드)',
   `SELECT ct.id, ct.transaction_date d, ct.merchant_name cn, ct.amount amt, ec.name nm
    FROM card_transactions ct JOIN expense_categories ec ON ec.id = ct.category_id
    WHERE ec.is_active = 0`],
  ['P0', '입금에 비용 역할 계정이 붙음',
   `SELECT bt.id, bt.transaction_date d, bt.counterpart_name cn, bt.amount amt, ec.name nm
    FROM bank_transactions bt JOIN expense_categories ec ON ec.id = bt.matched_category_id
    WHERE bt.transaction_type = 'DEPOSIT' AND COALESCE(ec.role,'') != 'NOT_EXPENSE'`],
  ['P0', '역할 어휘 밖의 값',
   `SELECT ec.id, ec.name nm, ec.role d, ec.entity_id cn, 0 amt
    FROM expense_categories ec WHERE COALESCE(ec.role,'') NOT IN (${roleSql})`],
  ['P0', '같은 이름인데 법인마다 역할이 다름',
   `SELECT MIN(ec.id) id, ec.name nm, GROUP_CONCAT(DISTINCT ec.role) d,
           COUNT(DISTINCT ec.role) cn, 0 amt
    FROM expense_categories ec GROUP BY ec.name HAVING COUNT(DISTINCT ec.role) > 1`],
  ['P1', '「상환」 계정에 입금',
   `SELECT bt.id, bt.transaction_date d, bt.counterpart_name cn, bt.amount amt, ec.name nm
    FROM bank_transactions bt JOIN expense_categories ec ON ec.id = bt.matched_category_id
    WHERE bt.transaction_type = 'DEPOSIT' AND ec.name LIKE '%상환%'`],
  ['P1', '「취득」 계정에 입금',
   `SELECT bt.id, bt.transaction_date d, bt.counterpart_name cn, bt.amount amt, ec.name nm
    FROM bank_transactions bt JOIN expense_categories ec ON ec.id = bt.matched_category_id
    WHERE bt.transaction_type = 'DEPOSIT' AND ec.name LIKE '%취득%'`],
  ['P1', '이름은 자금이동인데 역할이 비용 (의심)',
   `SELECT ec.id, ec.name nm, ec.role d, ec.entity_id cn, 0 amt
    FROM expense_categories ec
    WHERE ec.role != 'NOT_EXPENSE' AND (${flowSql})`],
]

for (const [sev, label, sql] of CHECKS) {
  const rows = d1(sql)
  if (!rows.length) { console.log(`  ${C.g}✓${C.x} ${label}`); continue }
  bad += rows.length
  const amt = rows.reduce((a, r) => a + Math.abs(Number(r.amt) || 0), 0)
  console.log(`  ${C.r}✗ [${sev}] ${label} — ${rows.length}건${amt ? ' ' + won(amt) : ''}${C.x}`)
  for (const r of rows.slice(0, 8))
    console.log(`      ${C.d}#${r.id} ${r.d} ${String(r.cn ?? '').slice(0, 22).padEnd(23)} ${(amt ? won(r.amt) : '').padStart(12)} → ${r.nm}${C.x}`)
  if (rows.length > 8) console.log(`      ${C.d}… 외 ${rows.length - 8}건${C.x}`)
}

if (bad) {
  console.log(`\n${C.r}✗ 계정 정합성 결함 ${bad}건${C.x}`)
  console.log(`${C.d}  역할 정본 = expense_categories.role (0584) · 어휘 = src/utils/expenseRole.ts.${C.x}`)
  console.log(`${C.d}  계정을 새로 만들면 역할을 함께 고른다 — 안 고르면 SGA(비용)로 잡힌다.${C.x}\n`)
  process.exit(1)
}
console.log(`\n${C.g}✓ 계정 정합성 이상 없음${C.x}\n`)
