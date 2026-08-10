#!/usr/bin/env node
/**
 * 재무·자금 일회성 진단 (읽기 전용)
 *
 * 왜 이게 있나 — /reports 재무보고와 /cash-schedule 은 **지금 숫자를 믿으면 안 된다**(2026-08-10 점검).
 *   · `financialReports.ts` 가 없는 테이블 2개(`order_costs`·`payroll_slips`)를 참조하고 `.catch` 로 **조용히 0**
 *   · 매입 집계가 `date(created_at)` = **이관 실행 시각** 기준 (실제 8월 발주 276만이 6.68억으로 뜬다)
 *   · 매입·고정비 집계에 **entityFilter 가 없다**(3법인 합산)
 * 이 스크립트는 **정의를 바로잡아** 같은 질문에 정확히 답한다. 페이지를 고치는 대신 여기서 뽑아 쓴다.
 *
 * 사용:
 *   node scripts/finance-diagnose.cjs                     # e1 · 올해 · 표로 출력
 *   node scripts/finance-diagnose.cjs --entity 2
 *   node scripts/finance-diagnose.cjs --from 2026-01-01 --to 2026-06-30
 *   node scripts/finance-diagnose.cjs --json              # Claude 가 이어서 분석하기 좋은 형태
 *   node scripts/finance-diagnose.cjs --local             # 로컬 D1
 *
 * ★ 읽기 전용이다. SELECT 만 실행한다.
 */
const { execFileSync } = require('child_process')

const argv = process.argv.slice(2)
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d }
const has = k => argv.includes('--' + k)

const E = Number(arg('entity', 1))
const TO = arg('to', new Date().toISOString().slice(0, 10))
const FROM = arg('from', TO.slice(0, 4) + '-01-01')
const AS_JSON = has('json')
const REMOTE = has('local') ? [] : ['--remote']

if (!/^\d{4}-\d{2}-\d{2}$/.test(FROM) || !/^\d{4}-\d{2}-\d{2}$/.test(TO)) {
  console.error('날짜는 YYYY-MM-DD 형식이어야 합니다.'); process.exit(1)
}
if (![1, 2, 3].includes(E)) { console.error('--entity 는 1(동산기획)·2(선명)·3(청주) 중 하나입니다.'); process.exit(1) }

// 법인간거래 제외 — src/constants/intercompany.ts 와 같은 값. 내부 3사는 회계허브가 흡수한다.
const INTERNAL = '53,1271,3757'
// 현금소매 더미 — src/constants/arPolicy.ts. 채권 개념이 없어 AR 에서 뺀다.
const CASH_RETAIL = `(SELECT id FROM clients WHERE client_code = '000-00-00000')`
const NOT_INTERNAL = col => `${col} NOT IN (${INTERNAL}) AND ${col} NOT IN ${CASH_RETAIL}`

const q = s => "'" + String(s).replace(/'/g, "''") + "'"

function run(sql) {
  const one = sql.replace(/--[^\n]*\n/g, ' ').replace(/\s+/g, ' ').trim()
  const out = execFileSync('npx',
    ['wrangler', 'd1', 'execute', 'webapp-production', ...REMOTE, '--json', '--command', JSON.stringify(one)],
    { encoding: 'utf8', maxBuffer: 1 << 28, shell: true, stdio: ['ignore', 'pipe', 'ignore'] })
  const s = out.indexOf('[\n  {')
  if (s < 0) throw new Error('wrangler 응답을 해석하지 못했습니다:\n' + out.slice(0, 400))
  return JSON.parse(out.slice(s)).map(b => b.results || [])
}

const n = v => Number(v || 0)
const won = v => n(v).toLocaleString('ko-KR')

// ───────────────────────────────────────────────────────── 쿼리
const SQL = {
  // A. 스냅샷 — 기준일 현재
  snapshot: `
    SELECT 'deposit' k, CAST(COALESCE(SUM(x.bal),0) AS INT) v FROM (
      SELECT ba.id, (SELECT t.balance_after FROM bank_transactions t WHERE t.bank_account_id=ba.id
                      ORDER BY t.transaction_date DESC, t.id DESC LIMIT 1) bal
      FROM bank_accounts ba WHERE ba.entity_id=${E} AND ba.is_active=1 AND COALESCE(ba.is_overdraft,0)=0) x;
    SELECT 'overdraft' k, CAST(COALESCE(SUM(x.bal),0) AS INT) v FROM (
      SELECT ba.id, (SELECT t.balance_after FROM bank_transactions t WHERE t.bank_account_id=ba.id
                      ORDER BY t.transaction_date DESC, t.id DESC LIMIT 1) bal
      FROM bank_accounts ba WHERE ba.entity_id=${E} AND ba.is_active=1 AND ba.is_overdraft=1) x;
    SELECT 'loan' k, CAST(COALESCE(SUM(current_balance),0) AS INT) v FROM loans WHERE entity_id=${E} AND is_active=1;
    SELECT 'ar' k, CAST(COALESCE(SUM(bal),0) AS INT) v FROM (
      SELECT c.id, (SELECT COALESCE(SUM(g.billed_amount),0) FROM order_billing_groups g JOIN orders o ON o.id=g.order_id
         WHERE g.billing_status='BILLED' AND o.status!='CANCELLED' AND o.client_id=c.id AND g.entity_id=${E})
       - (SELECT COALESCE(SUM(amount),0) FROM payments WHERE client_id=c.id AND entity_id=${E})
       - (SELECT COALESCE(SUM(amount),0) FROM adjustments WHERE client_id=c.id AND entity_id=${E}) bal
      FROM clients c WHERE c.is_active=1 AND ${NOT_INTERNAL('c.id')}) z WHERE bal > 0;
    SELECT 'ap' k, CAST(COALESCE(SUM(bal),0) AS INT) v FROM (
      SELECT c.id, (SELECT COALESCE(SUM(final_amount),0) FROM purchase_orders
                     WHERE supplier_id=c.id AND entity_id=${E} AND status NOT IN ('DRAFT','CANCELLED'))
       - (SELECT COALESCE(SUM(amount),0) FROM purchase_payments WHERE supplier_id=c.id AND entity_id=${E})
       - (SELECT COALESCE(SUM(amount),0) FROM purchase_adjustments WHERE supplier_id=c.id AND entity_id=${E}) bal
      FROM clients c WHERE c.is_active=1 AND ${NOT_INTERNAL('c.id')}) z WHERE bal > 0;`,

  // B. 손익 — ★정정 정의(매입=order_date · 전 축 entity 고정)
  pnl: `
    SELECT 'sales' k, CAST(COALESCE(SUM(g.billed_amount),0) AS INT) v, COUNT(DISTINCT g.order_id) cnt
      FROM order_billing_groups g JOIN orders o ON o.id=g.order_id
     WHERE g.billing_status='BILLED' AND o.status!='CANCELLED' AND g.entity_id=${E}
       AND date(COALESCE(g.accounting_date, g.billed_at)) BETWEEN ${q(FROM)} AND ${q(TO)};
    SELECT 'purchase' k, CAST(COALESCE(SUM(final_amount),0) AS INT) v, COUNT(*) cnt
      FROM purchase_orders WHERE entity_id=${E} AND status NOT IN ('DRAFT','CANCELLED')
       AND date(order_date) BETWEEN ${q(FROM)} AND ${q(TO)} AND po_number NOT LIKE '%-OPEN%';
    SELECT 'payroll' k, CAST(COALESCE(SUM(net_pay),0) AS INT) v, COUNT(*) cnt
      FROM payroll WHERE entity_id=${E} AND date(pay_date) BETWEEN ${q(FROM)} AND ${q(TO)};
    SELECT 'card' k, CAST(COALESCE(SUM(amount),0) AS INT) v, COUNT(*) cnt
      FROM card_transactions WHERE entity_id=${E} AND COALESCE(is_offset,0)=0
       AND date(substr(transaction_date,1,4)||'-'||substr(transaction_date,5,2)||'-'||substr(transaction_date,7,2))
           BETWEEN ${q(FROM)} AND ${q(TO)};
    SELECT 'fixed_monthly' k, CAST(COALESCE(SUM(amount),0) AS INT) v, COUNT(*) cnt
      FROM fixed_expenses WHERE entity_id=${E} AND is_active=1 AND frequency='MONTHLY'
       AND start_date <= ${q(TO)} AND (end_date IS NULL OR end_date >= ${q(FROM)});`,

  // C. 자금 예정 — 기준일 이후
  upcoming: `
    SELECT 'loan_sched' k, CAST(COALESCE(SUM(lp.total_amount),0) AS INT) v, COUNT(*) cnt,
           MIN(lp.scheduled_date) d1, MAX(lp.scheduled_date) d2
      FROM loan_payments lp JOIN loans l ON l.id=lp.loan_id
     WHERE l.entity_id=${E} AND lp.status='SCHEDULED' AND lp.scheduled_date > ${q(TO)};
    SELECT 'loan_overdue' k, CAST(COALESCE(SUM(lp.total_amount),0) AS INT) v, COUNT(*) cnt
      FROM loan_payments lp JOIN loans l ON l.id=lp.loan_id
     WHERE l.entity_id=${E} AND lp.status='SCHEDULED' AND lp.scheduled_date <= ${q(TO)};
    SELECT 'cash_schedule_in' k, CAST(COALESCE(SUM(amount),0) AS INT) v, COUNT(*) cnt
      FROM cash_schedule WHERE entity_id=${E} AND flow_type='IN' AND status='PENDING' AND schedule_date > ${q(TO)};
    SELECT 'cash_schedule_out' k, CAST(COALESCE(SUM(amount),0) AS INT) v, COUNT(*) cnt
      FROM cash_schedule WHERE entity_id=${E} AND flow_type='OUT' AND status='PENDING' AND schedule_date > ${q(TO)};`,

  // D. 데이터 건강도 — 이 진단을 어디까지 믿어도 되는지
  health: `
    SELECT 'po_expected_null' k, COUNT(*) tot, SUM(CASE WHEN expected_date IS NULL THEN 1 ELSE 0 END) bad
      FROM purchase_orders WHERE entity_id=${E} AND status NOT IN ('DRAFT','CANCELLED');
    SELECT 'po_shell' k, COUNT(*) tot, SUM(CASE WHEN (SELECT COUNT(*) FROM purchase_order_items x WHERE x.po_id=po.id)=0 THEN 1 ELSE 0 END) bad
      FROM purchase_orders po WHERE po.entity_id=${E} AND po.po_number NOT LIKE '%-OPEN%';
    SELECT 'loan_payment_done' k, COUNT(*) tot, SUM(CASE WHEN lp.status='SCHEDULED' THEN 1 ELSE 0 END) bad
      FROM loan_payments lp JOIN loans l ON l.id=lp.loan_id WHERE l.entity_id=${E};
    SELECT 'loan_maturity' k, COUNT(*) tot, SUM(CASE WHEN maturity_confirmed=0 THEN 1 ELSE 0 END) bad
      FROM loans WHERE entity_id=${E} AND is_active=1;
    SELECT 'bank_linked' k, COUNT(*) tot,
           SUM(CASE WHEN (SELECT COUNT(*) FROM bank_transactions t WHERE t.bank_account_id=ba.id)=0 THEN 1 ELSE 0 END) bad
      FROM bank_accounts ba WHERE ba.entity_id=${E} AND ba.is_active=1;
    SELECT 'card_cutoff' k, COUNT(*) tot, SUM(CASE WHEN cutoff_day IS NULL THEN 1 ELSE 0 END) bad
      FROM corporate_cards WHERE entity_id=${E} AND is_active=1;
    SELECT 'item_avg_cost' k, COUNT(*) tot, SUM(CASE WHEN avg_unit_cost IS NULL OR avg_unit_cost=0 THEN 1 ELSE 0 END) bad
      FROM items WHERE is_active=1;`,

  // E. 이관 편중 — created_at 을 업무일로 쓰면 얼마나 틀리는지 실측
  importSkew: `
    SELECT substr(order_date,1,7) m,
           CAST(SUM(final_amount) AS INT) by_order_date,
           CAST((SELECT COALESCE(SUM(p2.final_amount),0) FROM purchase_orders p2
                  WHERE p2.entity_id=${E} AND p2.status NOT IN ('DRAFT','CANCELLED')
                    AND substr(p2.created_at,1,7)=substr(po.order_date,1,7)) AS INT) by_created_at
      FROM purchase_orders po WHERE po.entity_id=${E} AND po.status NOT IN ('DRAFT','CANCELLED')
       AND po.order_date >= ${q(FROM)} GROUP BY 1 ORDER BY 1;`,

  // F. 내부거래 대사 — 법인간 채권채무가 서로 맞는지(맞아야 법인별 숫자를 믿을 수 있다)
  intercompany: `
    SELECT '2->1' pair,
      (SELECT COALESCE(SUM(g.billed_amount),0) FROM order_billing_groups g JOIN orders o ON o.id=g.order_id
        WHERE g.billing_status='BILLED' AND o.status!='CANCELLED' AND g.entity_id=2 AND o.client_id=53)
      - (SELECT COALESCE(SUM(amount),0) FROM payments WHERE entity_id=2 AND client_id=53)
      - (SELECT COALESCE(SUM(amount),0) FROM adjustments WHERE entity_id=2 AND client_id=53) ar,
      (SELECT COALESCE(SUM(final_amount),0) FROM purchase_orders WHERE status NOT IN ('DRAFT','CANCELLED') AND entity_id=1 AND supplier_id=1271)
      - (SELECT COALESCE(SUM(amount),0) FROM purchase_payments WHERE entity_id=1 AND supplier_id=1271) ap;
    SELECT '1->2' pair,
      (SELECT COALESCE(SUM(g.billed_amount),0) FROM order_billing_groups g JOIN orders o ON o.id=g.order_id
        WHERE g.billing_status='BILLED' AND o.status!='CANCELLED' AND g.entity_id=1 AND o.client_id=1271) ar,
      (SELECT COALESCE(SUM(final_amount),0) FROM purchase_orders WHERE status NOT IN ('DRAFT','CANCELLED') AND entity_id=2 AND supplier_id=53) ap;
    SELECT '2->3' pair,
      (SELECT COALESCE(SUM(g.billed_amount),0) FROM order_billing_groups g JOIN orders o ON o.id=g.order_id
        WHERE g.billing_status='BILLED' AND o.status!='CANCELLED' AND g.entity_id=2 AND o.client_id=3757)
      - (SELECT COALESCE(SUM(amount),0) FROM payments WHERE entity_id=2 AND client_id=3757) ar,
      (SELECT COALESCE(SUM(final_amount),0) FROM purchase_orders WHERE status NOT IN ('DRAFT','CANCELLED') AND entity_id=3 AND supplier_id=1271)
      - (SELECT COALESCE(SUM(amount),0) FROM purchase_payments WHERE entity_id=3 AND supplier_id=1271) ap;`,
}

// ───────────────────────────────────────────────────────── 실행
const ENTITY_NAME = { 1: '동산기획', 2: '선명', 3: '동산기획 청주' }[E]
const pick = (blocks, key) => { for (const b of blocks) if (b[0] && b[0].k === key) return b[0]; return null }

const [snapB, pnlB, upB, healthB, skewB, icB] = [
  run(SQL.snapshot), run(SQL.pnl), run(SQL.upcoming), run(SQL.health), run(SQL.importSkew), run(SQL.intercompany),
]

const g = (blocks, key) => n((pick(blocks, key) || {}).v)
const gc = (blocks, key) => n((pick(blocks, key) || {}).cnt)

const deposit = g(snapB, 'deposit'), overdraft = g(snapB, 'overdraft'), loan = g(snapB, 'loan')
const ar = g(snapB, 'ar'), ap = g(snapB, 'ap')
const months = Math.max(1, Math.round((new Date(TO) - new Date(FROM)) / (30 * 86400000)))

const result = {
  기준: { 법인: `${E} ${ENTITY_NAME}`, 기간: `${FROM} ~ ${TO}`, 개월수: months },
  스냅샷: {
    예금잔액: deposit, 마이너스통장: overdraft, 대출잔액: loan,
    순자금: deposit + overdraft - loan,
    미수금: ar, 미지급금: ap, 순채권: ar - ap,
  },
  손익_기간: {
    매출: g(pnlB, 'sales'), 매출건수: gc(pnlB, 'sales'),
    매입: g(pnlB, 'purchase'), 매입건수: gc(pnlB, 'purchase'),
    인건비: g(pnlB, 'payroll'),
    카드사용: g(pnlB, 'card'),
    고정비_월액: g(pnlB, 'fixed_monthly'),
    고정비_기간추정: g(pnlB, 'fixed_monthly') * months,
    매출원가: null,  // ★ 산정 불가 — 아래 주의사항 참조
  },
  자금예정: {
    대출_예정: g(upB, 'loan_sched'), 대출_예정건수: gc(upB, 'loan_sched'),
    대출_기한경과_미처리: g(upB, 'loan_overdue'), 대출_기한경과_건수: gc(upB, 'loan_overdue'),
    예정입금: g(upB, 'cash_schedule_in'), 예정출금: g(upB, 'cash_schedule_out'),
  },
  건강도: Object.fromEntries(healthB.map(b => b[0]).filter(Boolean).map(r => [r.k, { 전체: n(r.tot), 결측: n(r.bad) }])),
  이관편중: skewB[0] || [],
  내부거래대사: (icB || []).map(b => b[0]).filter(Boolean).map(r => ({ 쌍: r.pair, AR: n(r.ar), AP: n(r.ap), 차이: n(r.ar) - n(r.ap) })),
}

if (AS_JSON) { console.log(JSON.stringify(result, null, 2)); process.exit(0) }

const line = s => console.log(s)
line('')
line(`■ 재무·자금 진단 — ${ENTITY_NAME}(e${E}) · ${FROM} ~ ${TO} (${months}개월)`)
line('')
line('▸ 스냅샷 (기준일 현재)')
console.table([
  { 항목: '예금 잔액', 금액: won(deposit) },
  { 항목: '마이너스통장', 금액: won(overdraft) },
  { 항목: '대출 잔액', 금액: won(-loan) },
  { 항목: '= 순자금', 금액: won(deposit + overdraft - loan) },
  { 항목: '미수금(AR)', 금액: won(ar) },
  { 항목: '미지급금(AP)', 금액: won(-ap) },
  { 항목: '= 순채권', 금액: won(ar - ap) },
])
line('▸ 손익 (기간 · ★매입은 order_date 기준 · 전 축 법인 고정)')
console.table([
  { 항목: '매출', 금액: won(result.손익_기간.매출), 건수: result.손익_기간.매출건수 },
  { 항목: '매입', 금액: won(result.손익_기간.매입), 건수: result.손익_기간.매입건수 },
  { 항목: '인건비', 금액: won(result.손익_기간.인건비), 건수: '' },
  { 항목: '카드사용', 금액: won(result.손익_기간.카드사용), 건수: '' },
  { 항목: '고정비(기간추정)', 금액: won(result.손익_기간.고정비_기간추정), 건수: `월 ${won(result.손익_기간.고정비_월액)}` },
  { 항목: '매출원가', 금액: '★산정 불가', 건수: '' },
])
line('▸ 자금 예정 (기준일 이후)')
console.table([
  { 항목: '대출 상환 예정', 금액: won(result.자금예정.대출_예정), 건수: result.자금예정.대출_예정건수 },
  { 항목: '대출 기한경과 미처리', 금액: won(result.자금예정.대출_기한경과_미처리), 건수: result.자금예정.대출_기한경과_건수 },
  { 항목: '예정 입금(cash_schedule)', 금액: won(result.자금예정.예정입금), 건수: '' },
  { 항목: '예정 출금(cash_schedule)', 금액: won(result.자금예정.예정출금), 건수: '' },
])
line('▸ 데이터 건강도 (결측이 크면 그 축의 숫자를 믿으면 안 된다)')
console.table(Object.entries(result.건강도).map(([k, v]) => ({
  지표: k, 전체: v.전체, 결측: v.결측, 비율: v.전체 ? Math.round(v.결측 / v.전체 * 100) + '%' : '-',
})))
line('▸ 이관 편중 — 같은 달을 order_date 로 볼 때 vs created_at 으로 볼 때')
console.table(result.이관편중.map(r => ({ 월: r.m, order_date기준: won(r.by_order_date), created_at기준: won(r.by_created_at) })))
line('▸ 내부거래 대사 (차이 0 이어야 법인별 숫자를 믿을 수 있다)')
console.table(result.내부거래대사.map(r => ({ 쌍: r.쌍, AR: won(r.AR), AP: won(r.AP), 차이: won(r.차이) })))

line('')
line('★ 이 진단을 읽을 때')
line('  · 매출원가는 산정하지 않는다 — 주문별 원가 테이블이 없다(`order_costs` 미존재).')
line('    따라서 매출총이익·영업이익은 이 도구가 내지 않는다. 내면 반드시 과대해진다.')
line('  · 매입은 order_date 기준이다. `created_at` 은 이관 실행 시각이라 업무상 의미가 없다')
line('    (위 「이관 편중」 표에서 두 기준이 얼마나 벌어지는지 직접 확인할 것).')
line('  · 미수금·미지급금은 법인간거래(내부 3사)와 현금소매 더미를 뺀 값이다.')
line('  · 대출 「기한경과 미처리」가 크면 실제 미납이 아니라 [납부] 처리를 안 한 것일 수 있다.')
line('')
