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
 * ★2026-08-14 개정 — 판관비를 **통장·카드 계정분류에서 뽑는다**.
 *   그전까지 판관비 = payroll + 카드전액 + fixed_expenses 였다. 통장 비용이 통째로 빠지고
 *   (급여·공과금·임대료·보험료…) 카드는 매입까지 비용으로 세는 구조였다. 통장 87% 미분류였을 땐
 *   그럴 수밖에 없었지만, 0813 분류 작업으로 통장이 정본이 됐다.
 *   이중계상 차단 = 통장의 「카드결제대금·법인간거래·자사이체」는 IGNORED, 「매입대금 지급」은
 *   matched_client_id 만 붙고 계정이 없다. 그래서 계정 있는 것만 세면 자동으로 안 겹친다.
 *
 * 사용:
 *   node scripts/finance-diagnose.cjs                     # e1 · 올해 · 표로 출력
 *   node scripts/finance-diagnose.cjs --entity 2
 *   node scripts/finance-diagnose.cjs --from 2026-01-01 --to 2026-06-30
 *   node scripts/finance-diagnose.cjs --json              # Claude 가 이어서 분석하기 좋은 형태
 *   node scripts/finance-diagnose.cjs --local             # 로컬 D1
 *   npm run diagnose:group -- --from 2026-01-01 --to 2026-07-31    # ★그룹 연결(3법인·법인간거래 제거)
 *
 * ★ 읽기 전용이다. SELECT 만 실행한다.
 */
const { execFileSync } = require('child_process')

const argv = process.argv.slice(2)
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d }
const has = k => argv.includes('--' + k)

const GROUP = has('group')
const E = Number(arg('entity', 1))
const TO = arg('to', new Date().toISOString().slice(0, 10))
const FROM = arg('from', TO.slice(0, 4) + '-01-01')
const AS_JSON = has('json')
const REMOTE = has('local') ? [] : ['--remote']

if (!/^\d{4}-\d{2}-\d{2}$/.test(FROM) || !/^\d{4}-\d{2}-\d{2}$/.test(TO)) {
  console.error('날짜는 YYYY-MM-DD 형식이어야 합니다.'); process.exit(1)
}
if (!GROUP && ![1, 2, 3].includes(E)) { console.error('--entity 는 1(동산기획)·2(선명)·3(청주) 중 하나입니다.'); process.exit(1) }

/**
 * 실사 재고 — **매출원가에서 기말재고를 빼려면 이 값이 있어야 한다.**
 *   매출원가 = 기초재고 + 매입 − 기말재고. 값이 없으면 기말=기초로 두고(=재고 증감 0) 「미반영」으로 표시한다.
 *   ★청주처럼 **신설 사업장은 매입의 상당 부분이 아직 재고**라, 미반영이면 원가가 통째로 과대해진다
 *     (실측: 청주 1~7월 매입 7,208만 중 3,961만이 7/31 재고 → 반영 전 −5,654만, 반영 후 −1,692만).
 *   `inventory` 테이블은 e3 0건이라 못 쓴다. 실사 엑셀이 유일한 원천이므로 출처를 여기 적어 둔다.
 */
const STOCK = {
  // entity: { 'YYYY-MM-DD': 금액 }   ※ 조회 기간의 FROM/TO 와 날짜가 정확히 맞을 때만 반영한다
  2: {
    // 선명 — 원천 `품목마스터/재고/선명_재고수불부_2601-2606.xlsx`(이카운트, 2026-01-01~06-30).
    //   기초 = 품목 블록의 「전일재고」 행 · 기말 = 「합계」 행. 수량 검산 77,417 → 64,590 (MES 적재분과 일치).
    //   금액 = 양끝 모두 **MES `avg_unit_cost` 동일 단가**로 환산했다. 서로 다른 단가를 쓰면 증감이 아니라
    //   단가차가 섞여 나온다. 산출기 = scratchpad `sm-value3.py`(코드일치 263/269·수량 100% 커버).
    //   ★MES 는 통합 품목의 이카운트 코드를 **쉼표로 묶어** 둔다(`A004,A404`) — 분해하지 않으면 41%만 매칭된다.
    //   ⚠️음수 재고가 실재한다(입고 미기록분). 그대로 쓴다 — 0 으로 클립하면 실제 소비가 숨는다(클립 시 −923만).
    '2026-01-01': 61465861,
    '2026-06-30': 47133689,   // 1~6월 재고 −1,433만 → 그만큼 매출원가 증가(적자 확대)
  },
  3: {
    '2026-01-01': 0,          // 청주 첫 매입이 2026-05-15 · 계좌 개시 2026-04 → 연초 재고 0
    '2026-04-01': 0,          // 계좌·매입 개시 이전 = 기초 0
    '2026-07-31': 39610750,   // Z:\Designs\재고조사(청주동산기획)26.7.31.xlsx 「(전체 7월31일)」 시트
    //                           ⚠️같은 시트에 「매입가 기준 현재 재고액」 합계행이 섞여 있다.
    //                           품목행만 단순합하면 79,221,500 = 정확히 2배가 된다.
  },
}
const stockAt = (e, d) => (STOCK[e] || {})[d]
// 기초는 기간 시작일 기준. 명시값이 없어도 그 법인의 최초 거래보다 이르면 0 으로 본다.
const openingStock = (e, d) => { const v = stockAt(e, d); return v === undefined ? undefined : v }

// 법인간거래 제외 — src/constants/intercompany.ts 와 같은 값. 내부 3사는 회계허브가 흡수한다.
const INTERNAL = '53,1271,3757'
// 현금소매 더미 — src/constants/arPolicy.ts. 채권 개념이 없어 AR 에서 뺀다.
const CASH_RETAIL = `(SELECT id FROM clients WHERE client_code = '000-00-00000')`
const NOT_INTERNAL = col => `${col} NOT IN (${INTERNAL}) AND ${col} NOT IN ${CASH_RETAIL}`

// 대표자 개인계좌 — 수금은 법인 실적이라 계좌는 살려 두되, 출금은 법인 비용이 아니다(용준님 0813 확정).
// 2026-08-19: 마이그 `0539` 로 `bank_accounts.is_personal` 컬럼이 생겨 그걸로 판정한다(웹도 같은 컬럼을 쓴다).
//   별칭은 사람이 언제든 바꾸는 값이라 판정 근거로 쓰면 조용히 새는 게 정상이었다.
const NOT_PERSONAL = `COALESCE(ba.is_personal,0) = 0`

const q = s => "'" + String(s).replace(/'/g, "''") + "'"
const ymd = s => s.replace(/-/g, '')          // bank/card 의 transaction_date 는 YYYYMMDD 문자열

/**
 * 계정을 손익 위치로 분류한다. `expense_categories` 에 성격 컬럼이 없어서 이름으로 판정한다.
 * ★NOT_EXPENSE 가 이 개정의 핵심 — 대출원금·부가세·가수금은 돈이 나가지만 비용이 아니다.
 *   이걸 안 빼면 동산 1~7월 지출 17.3억이 통째로 판관비가 되어 손익이 6.8억 과대 계상된다.
 */
const CAT_ROLE = {
  COGS: ['원재료비', '외주가공비'],
  // ★기부금 = 영업외비용(2026-08-19). 정치자금 후원금은 영업활동과 무관하고 **세법상 손금불산입**이라
  //   판관비에 섞으면 영업이익이 그만큼 과소해지고 세무조정 때 또 걸러야 한다.
  NONOP: ['이자비용', '기부금'],
  TAX: ['법인세'],
  // 비용이 아닌 현금흐름 — 부채 상환·예수금 정산·자금 대차·자산 취득
  //   ★「리스료」 추가(2026-08-19) — **세무장부 실측 근거**. WEHAGO 합계잔액시산표(21기, 2026-07-31)에
  //     **「리스부채」 계정이 아예 없고** 리스가 **장기차입금 18.49억**에 들어가 있다.
  //     즉 세무사는 리스·할부를 **차입금**으로 잡았다 → 납입액은 원금 상환이고 비용이 아니다.
  //     리스 장비는 이미 `fixed_assets` 로 감가상각 중이라(FA-*-L*) 리스료를 비용으로 또 넣으면 이중이다.
  //     ⚠️이자 부분은 여기서 같이 빠진다 — 세무장부 이자비용(931) **5,696만**이 정본이고
  //       MES 「이자비용」 계정 307만은 극히 일부만 잡은 값이다(아래 이자 표시가 과소인 이유).
  NOT_EXPENSE: ['대출상환', '대출금', '부가세', '가수금', '가지급금', '보증금(자산)', '고정자산취득', '리스료'],
}
const roleOf = nm => {
  for (const [role, names] of Object.entries(CAT_ROLE)) if (names.includes(nm)) return role
  return 'SGA'   // 나머지는 전부 판관비
}

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
const buildSQL = (E) => ({
  // A. 스냅샷 — 기준일 현재
  snapshot: `
    SELECT 'deposit' k, CAST(COALESCE(SUM(x.bal),0) AS INT) v FROM (
      SELECT ba.id, (SELECT t.balance_after FROM bank_transactions t WHERE t.bank_account_id=ba.id
                      ORDER BY t.transaction_date DESC, t.id DESC LIMIT 1) bal
      FROM bank_accounts ba WHERE ba.entity_id=${E} AND ba.is_active=1 AND ${NOT_PERSONAL}
                              AND COALESCE(ba.is_overdraft,0)=0) x;
    SELECT 'overdraft' k, CAST(COALESCE(SUM(x.bal),0) AS INT) v FROM (
      SELECT ba.id, (SELECT t.balance_after FROM bank_transactions t WHERE t.bank_account_id=ba.id
                      ORDER BY t.transaction_date DESC, t.id DESC LIMIT 1) bal
      FROM bank_accounts ba WHERE ba.entity_id=${E} AND ba.is_active=1 AND ${NOT_PERSONAL}
                              AND ba.is_overdraft=1) x;
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
    SELECT 'purchase_equip' k, CAST(COALESCE(SUM(poi.amount),0) AS INT) v, COUNT(*) cnt
      FROM purchase_order_items poi JOIN purchase_orders po ON po.id=poi.po_id
      JOIN items i ON i.id=poi.item_id
     WHERE po.entity_id=${E} AND po.status NOT IN ('DRAFT','CANCELLED')
       AND date(po.order_date) BETWEEN ${q(FROM)} AND ${q(TO)} AND po.po_number NOT LIKE '%-OPEN%'
       AND i.item_code LIKE 'GDS-EQ-%'
       AND ${E} = 1;   -- ★동산만. 선명이 산 장비는 **유통 상품**(사서 판다)이라 매출원가가 맞다(용준님 확인).
    SELECT 'depreciation' k, CAST(COALESCE(SUM(depreciation_amount),0) AS INT) v, COUNT(*) cnt
      FROM depreciation_records WHERE entity_id=${E}
       AND substr(period,1,7) BETWEEN substr(${q(FROM)},1,7) AND substr(${q(TO)},1,7);
    SELECT 'payroll' k, CAST(COALESCE(SUM(net_pay),0) AS INT) v, COUNT(*) cnt
      FROM payroll WHERE entity_id=${E} AND date(pay_date) BETWEEN ${q(FROM)} AND ${q(TO)};
    SELECT 'card' k, CAST(COALESCE(SUM(amount),0) AS INT) v, COUNT(*) cnt
      FROM card_transactions WHERE entity_id=${E} AND COALESCE(is_offset,0)=0
       AND date(substr(transaction_date,1,4)||'-'||substr(transaction_date,5,2)||'-'||substr(transaction_date,7,2))
           BETWEEN ${q(FROM)} AND ${q(TO)};
    SELECT 'fixed_monthly' k, CAST(COALESCE(SUM(amount),0) AS INT) v, COUNT(*) cnt
      FROM fixed_expenses WHERE entity_id=${E} AND is_active=1 AND frequency='MONTHLY'
       AND start_date <= ${q(TO)} AND (end_date IS NULL OR end_date >= ${q(FROM)});
    SELECT 'sales_internal' k, CAST(COALESCE(SUM(g.billed_amount),0) AS INT) v, COUNT(DISTINCT g.order_id) cnt
      FROM order_billing_groups g JOIN orders o ON o.id=g.order_id
     WHERE g.billing_status='BILLED' AND o.status!='CANCELLED' AND g.entity_id=${E}
       AND o.client_id IN (${INTERNAL})
       AND date(COALESCE(g.accounting_date, g.billed_at)) BETWEEN ${q(FROM)} AND ${q(TO)};
    SELECT 'purchase_internal' k, CAST(COALESCE(SUM(final_amount),0) AS INT) v, COUNT(*) cnt
      FROM purchase_orders WHERE entity_id=${E} AND status NOT IN ('DRAFT','CANCELLED')
       AND supplier_id IN (${INTERNAL})
       AND date(order_date) BETWEEN ${q(FROM)} AND ${q(TO)} AND po_number NOT LIKE '%-OPEN%';`,

  // B-2. 비용 실측 — 통장·카드 계정분류 (★판관비의 정본)
  expense: `
    SELECT 'bank' src, ec.name nm, COUNT(*) cnt, CAST(SUM(bt.amount) AS INT) amt
      FROM bank_transactions bt
      JOIN bank_accounts ba ON ba.id = bt.bank_account_id
      JOIN expense_categories ec ON ec.id = bt.matched_category_id
     WHERE ba.entity_id = ${E} AND ${NOT_PERSONAL} AND bt.transaction_type = 'WITHDRAWAL'
       AND bt.transaction_date BETWEEN ${q(ymd(FROM))} AND ${q(ymd(TO))}
     GROUP BY ec.name;
    SELECT 'card' src, ec.name nm, COUNT(*) cnt, CAST(SUM(t.amount) AS INT) amt
      FROM card_transactions t
      JOIN corporate_cards cc ON cc.id = t.card_id
      JOIN expense_categories ec ON ec.id = t.category_id
     WHERE cc.entity_id = ${E} AND COALESCE(t.is_offset,0) = 0
       AND t.transaction_date BETWEEN ${q(ymd(FROM))} AND ${q(ymd(TO))}
     GROUP BY ec.name;`,

  // B-3. 비용 커버리지 — 위 숫자를 어디까지 믿나. 미분류가 크면 판관비는 과소다.
  coverage: `
    SELECT 'bank_out' k, COUNT(*) tot, CAST(SUM(amount) AS INT) v,
           SUM(CASE WHEN matched_category_id IS NULL AND matched_client_id IS NULL
                     AND transfer_pair_id IS NULL AND match_status <> 'IGNORED' THEN 1 ELSE 0 END) bad,
           CAST(SUM(CASE WHEN matched_category_id IS NULL AND matched_client_id IS NULL
                     AND transfer_pair_id IS NULL AND match_status <> 'IGNORED' THEN amount ELSE 0 END) AS INT) badv
      FROM bank_transactions bt JOIN bank_accounts ba ON ba.id = bt.bank_account_id
     WHERE ba.entity_id = ${E} AND ${NOT_PERSONAL} AND bt.transaction_type = 'WITHDRAWAL'
       AND bt.transaction_date BETWEEN ${q(ymd(FROM))} AND ${q(ymd(TO))};
    SELECT 'bank_supplier' k, COUNT(*) tot, CAST(SUM(bt.amount) AS INT) v, 0 bad, 0 badv
      FROM bank_transactions bt JOIN bank_accounts ba ON ba.id = bt.bank_account_id
     WHERE ba.entity_id = ${E} AND ${NOT_PERSONAL} AND bt.transaction_type = 'WITHDRAWAL'
       AND bt.matched_client_id IS NOT NULL AND bt.matched_category_id IS NULL
       AND bt.transaction_date BETWEEN ${q(ymd(FROM))} AND ${q(ymd(TO))};
    SELECT 'bank_ignored' k, COUNT(*) tot, CAST(SUM(bt.amount) AS INT) v, 0 bad, 0 badv
      FROM bank_transactions bt JOIN bank_accounts ba ON ba.id = bt.bank_account_id
     WHERE ba.entity_id = ${E} AND ${NOT_PERSONAL} AND bt.transaction_type = 'WITHDRAWAL'
       AND bt.match_status = 'IGNORED'
       AND bt.transaction_date BETWEEN ${q(ymd(FROM))} AND ${q(ymd(TO))};
    SELECT 'card_all' k, COUNT(*) tot, CAST(SUM(t.amount) AS INT) v,
           SUM(CASE WHEN t.category_id IS NULL THEN 1 ELSE 0 END) bad,
           CAST(SUM(CASE WHEN t.category_id IS NULL THEN t.amount ELSE 0 END) AS INT) badv
      FROM card_transactions t JOIN corporate_cards cc ON cc.id = t.card_id
     WHERE cc.entity_id = ${E} AND COALESCE(t.is_offset,0) = 0
       AND t.transaction_date BETWEEN ${q(ymd(FROM))} AND ${q(ymd(TO))};
    SELECT 'card_offset' k, COUNT(*) tot, CAST(SUM(t.amount) AS INT) v, 0 bad, 0 badv
      FROM card_transactions t JOIN corporate_cards cc ON cc.id = t.card_id
     WHERE cc.entity_id = ${E} AND t.is_offset = 1
       AND t.transaction_date BETWEEN ${q(ymd(FROM))} AND ${q(ymd(TO))};`,

  // B-4. 이자비용 추정 — ★통장 「대출상환」은 원금+이자 합계라 분리가 안 된다.
  //   loan_payments 에 과거 회차가 없어(전부 미래 SCHEDULED) 실적에서 이자를 못 뽑는다.
  //   그래서 잔액×가중평균금리로 **추정만** 한다. 장부에 올리지 않고 경고로만 쓴다.
  interest: `
    SELECT 'loan' k, CAST(COALESCE(SUM(current_balance),0) AS INT) v,
           ROUND(SUM(current_balance * COALESCE(current_rate,0))
                 / NULLIF(SUM(CASE WHEN current_rate > 0 THEN current_balance ELSE 0 END),0), 3) rate,
           CAST(COALESCE(SUM(CASE WHEN COALESCE(current_rate,0)=0 THEN current_balance ELSE 0 END),0) AS INT) norate
      FROM loans WHERE entity_id = ${E} AND is_active = 1;`,

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
})

// ───────────────────────────────────────────────────────── 실행
const ENTITY_NAME = { 1: '동산기획', 2: '선명', 3: '동산기획 청주' }
const pick = (blocks, key) => { for (const b of blocks) if (b[0] && b[0].k === key) return b[0]; return null }

// ── 그룹(연결) 모드 — 3법인 합산 후 법인간거래를 **양변에서** 제거한다.
//   별도 기준으로는 내부매출·내부매입이 각각 정당하지만, 합치면 같은 거래가 매출과 원가에 동시에 남는다.
//   실측 1~7월: e2→e3 5,555만(선명이 청주에 원단·잉크 공급) · e1↔e2 나머지.
if (GROUP) {
  const parts = [1, 2, 3].map(e => {
    const S = buildSQL(e)
    const pnl = run(S.pnl), exp = run(S.expense), cov = run(S.coverage)
    const gv = k => n((pick(pnl, k) || {}).v)
    const rows = exp.flat().filter(r => r && r.nm)
    const sum = role => rows.filter(r => roleOf(r.nm) === role).reduce((a, r) => a + n(r.amt), 0)
    const cvRow = k => (cov.flat().find(x => x && x.k === k) || {})
    const open = openingStock(e, FROM), close = openingStock(e, TO)
    return {
      e, name: ENTITY_NAME[e],
      매출: gv('sales'), 매입: gv('purchase'),
      장비매입: gv('purchase_equip'), 감가상각비: gv('depreciation'),
      내부매출: gv('sales_internal'), 내부매입: gv('purchase_internal'),
      원가_비전표: sum('COGS'), 판관비: sum('SGA'), 영업외: sum('NONOP'), 법인세: sum('TAX'),
      기초재고: open, 기말재고: close,
      미분류액: n(cvRow('bank_out').badv) + n(cvRow('card_all').badv),
      cats: rows,
    }
  })

  const S = k => parts.reduce((a, p) => a + n(p[k]), 0)
  const 매출 = S('매출') - S('내부매출')
  const 매입 = S('매입') - S('내부매입')
  // 재고 증감은 값이 있는 법인만. 없는 법인은 0(=증감 미반영)으로 두고 아래에 명시한다.
  const 재고증감 = parts.reduce((a, p) =>
    (p.기초재고 === undefined || p.기말재고 === undefined) ? a : a + (p.기말재고 - p.기초재고), 0)
  const 재고반영 = parts.filter(p => p.기초재고 !== undefined && p.기말재고 !== undefined)
  // ★장비는 매출원가가 아니다(2026-08-19) — `fixed_assets` 에 자산으로 등록돼 감가상각으로 비용화된다.
  //   매입 전표에 그대로 두면 취득액이 원가에 한 번, 감가상각비가 또 한 번 = 이중계상.
  //   식별 = `items.item_code LIKE 'GDS-EQ-%'` **이면서 동산(e1)** 인 것만.
  //   ★같은 장비라도 **동산은 사서 쓰고(자산) 선명은 사서 판다(상품)**(용준님 2026-08-19).
  //     품목 코드로는 못 가른다 — 법인의 업(業)이 다르다. 선명 GDS-EQ 매입 2,113만은 원가에 남는 게 맞다.
  //   미연결 장비는 그 코드로 먼저 품목화해 둔다(_bak_0819_equip).
  const 장비매입 = S('장비매입')
  const 감가상각비 = S('감가상각비')
  const 매출원가 = 매입 - 장비매입 + S('원가_비전표') - 재고증감
  const 판관비 = S('판관비') + 감가상각비, 영업외 = S('영업외'), 법인세 = S('법인세')
  const 영업이익 = 매출 - 매출원가 - 판관비
  const pctOf = v => 매출 ? +(v / 매출 * 100).toFixed(1) : null

  const out = {
    기준: { 범위: '그룹 연결(e1+e2+e3)', 기간: `${FROM} ~ ${TO}`, 비고: '오다플래그(e4)는 MES 손익 대상 아님' },
    연결손익: {
      매출, 매입, 원가_비전표: S('원가_비전표'), 재고증감, 매출원가,
      매출총이익: 매출 - 매출원가, 매출총이익률: pctOf(매출 - 매출원가),
      판관비, 영업이익, 영업이익률: pctOf(영업이익), 이자비용: 영업외, 법인세,
      당기순이익: 영업이익 - 영업외 - 법인세,
    },
    제거한_법인간거래: { 내부매출: S('내부매출'), 내부매입: S('내부매입'), 차이: S('내부매출') - S('내부매입') },
    법인별: parts.map(p => ({
      법인: p.name, 매출: p.매출, 내부매출: p.내부매출, 매입: p.매입, 내부매입: p.내부매입,
      판관비: p.판관비, 기말재고: p.기말재고 ?? null, 미분류액: p.미분류액,
    })),
  }
  if (AS_JSON) { console.log(JSON.stringify(out, null, 2)); process.exit(0) }

  console.log('')
  console.log(`■ 그룹 연결손익 — 동산기획 + 선명 + 청주 · ${FROM} ~ ${TO}`)
  console.log('')
  console.table([
    { 항목: '매출(외부)', 금액: won(매출), 비고: `합산 ${won(S('매출'))} − 내부 ${won(S('내부매출'))}` },
    { 항목: '  − 매입(외부)', 금액: won(매입), 비고: `합산 ${won(S('매입'))} − 내부 ${won(S('내부매입'))}` },
    { 항목: '  + 장비 제외(고정자산)', 금액: won(-장비매입), 비고: 장비매입 ? 'GDS-EQ-* — 감가상각으로 비용화' : '해당 없음' },
    { 항목: '  − 원가(비전표·직불)', 금액: won(S('원가_비전표')), 비고: '원재료비·외주가공비' },
    { 항목: '  + 재고 증가(원가 차감)', 금액: won(-재고증감), 비고: 재고반영.length ? `${재고반영.map(p => p.name).join('·')} 실사 반영` : '★실사값 없음 — 미반영' },
    { 항목: '= 매출총이익', 금액: won(매출 - 매출원가), 비고: pctOf(매출 - 매출원가) + '%' },
    { 항목: '  − 판관비', 금액: won(판관비), 비고: `통장·카드 + 감가상각비 ${won(감가상각비)}` },
    { 항목: '= 영업이익', 금액: won(영업이익), 비고: pctOf(영업이익) + '%' },
    { 항목: '  − 이자비용', 금액: won(영업외), 비고: '실측분만(대출상환 혼입분 제외)' },
    { 항목: '  − 법인세', 금액: won(법인세), 비고: '' },
    { 항목: '= 당기순이익', 금액: won(영업이익 - 영업외 - 법인세), 비고: '' },
  ])
  console.log('▸ 제거한 법인간거래 (양변이 맞아야 이관이 정확한 것)')
  console.table([{ 내부매출: won(S('내부매출')), 내부매입: won(S('내부매입')), 차이: won(S('내부매출') - S('내부매입')) }])
  console.log('▸ 법인별 (별도 기준 · 내부거래 포함)')
  console.table(parts.map(p => ({
    법인: p.name, 매출: won(p.매출), '(내부)': won(p.내부매출), 매입: won(p.매입), '(내부)_': won(p.내부매입),
    판관비: won(p.판관비), 기말재고: p.기말재고 === undefined ? '미실사' : won(p.기말재고), 미분류: won(p.미분류액),
  })))
  console.log('')
  console.log('★ 이 숫자를 읽을 때')
  console.log('  · 법인간거래를 양변에서 뺐다. 법인별 합과 다른 이유가 이것이다.')
  const 미실사 = parts.filter(p => p.기초재고 === undefined || p.기말재고 === undefined)
  if (미실사.length) {
    console.log(`  · ★재고 미실사: ${미실사.map(p => p.name).join('·')} — 이 법인들은 **재고 증감이 0으로 취급**된다.`)
    console.log('    재고가 늘고 있으면 원가 과대(=이익 과소), 줄고 있으면 반대다. 실사값을 STOCK 에 넣으면 반영된다.')
  }
  console.log('  · 이자비용은 실측 계정분만이다. 통장 「대출상환」에 섞인 분은 여기 없다(별도 모드의 추정치 참조).')
  console.log('  · 오다플래그(e4)는 MES 에 손익 데이터가 없어 제외했다. 우회발행 조정도 반영돼 있지 않다.')
  console.log('')
  process.exit(0)
}

const SQL = buildSQL(E)
const [snapB, pnlB, expB, covB, intB, upB, healthB, skewB, icB] = [
  run(SQL.snapshot), run(SQL.pnl), run(SQL.expense), run(SQL.coverage), run(SQL.interest),
  run(SQL.upcoming), run(SQL.health), run(SQL.importSkew), run(SQL.intercompany),
]

const g = (blocks, key) => n((pick(blocks, key) || {}).v)
const gc = (blocks, key) => n((pick(blocks, key) || {}).cnt)

const deposit = g(snapB, 'deposit'), overdraft = g(snapB, 'overdraft'), loan = g(snapB, 'loan')
const ar = g(snapB, 'ar'), ap = g(snapB, 'ap')
const months = Math.max(1, Math.round((new Date(TO) - new Date(FROM)) / (30 * 86400000)))

// ── 비용 집계 — 계정을 손익 위치로 접는다
const rows = expB.flat().filter(r => r && r.nm)
const byCat = new Map()
for (const r of rows) {
  const e = byCat.get(r.nm) || { 계정: r.nm, 역할: roleOf(r.nm), 통장: 0, 카드: 0, 합계: 0, 건수: 0 }
  e[r.src === 'bank' ? '통장' : '카드'] += n(r.amt); e.합계 += n(r.amt); e.건수 += n(r.cnt)
  byCat.set(r.nm, e)
}
const cats = [...byCat.values()].sort((a, b) => b.합계 - a.합계)
const sumRole = role => cats.filter(c => c.역할 === role).reduce((a, c) => a + c.합계, 0)

const 매출 = g(pnlB, 'sales')
const 매입 = g(pnlB, 'purchase')
const 원가_비전표 = sumRole('COGS')          // 매입전표에 안 잡힌 자재·외주(통장·카드 직불)
// 재고 증감 — 실사값이 양끝에 다 있을 때만 반영한다. 없으면 0(미반영)이고 아래 주의사항에 명시된다.
const 기초재고 = openingStock(E, FROM), 기말재고 = openingStock(E, TO)
const 재고반영 = 기초재고 !== undefined && 기말재고 !== undefined
const 재고증감 = 재고반영 ? 기말재고 - 기초재고 : 0
// ★장비는 매출원가가 아니다(2026-08-19) — 그룹 모드 주석 참조. 취득액을 빼고 감가상각비를 넣는다.
const 장비매입 = g(pnlB, 'purchase_equip')
const 감가상각비 = g(pnlB, 'depreciation')
const 매출원가 = 매입 - 장비매입 + 원가_비전표 - 재고증감
const 판관비 = sumRole('SGA') + 감가상각비
const 영업이익 = 매출 - 매출원가 - 판관비
const 영업외 = sumRole('NONOP')
const 법인세 = sumRole('TAX')
const 비용아님 = sumRole('NOT_EXPENSE')

const cov = k => { const r = (covB.flat().find(x => x && x.k === k) || {}); return { 건수: n(r.tot), 금액: n(r.v), 미분류건: n(r.bad), 미분류액: n(r.badv) } }
const covBank = cov('bank_out'), covCard = cov('card_all')

// 이자 추정 — 대출 잔액×가중평균금리 + 마이너스통장(금리 미보유라 대출 평균금리를 그대로 적용)
const ln = (intB.flat()[0] || {})
const rate = n(ln.rate)
const 이자추정 = Math.round((n(ln.v) + Math.abs(overdraft)) * (rate / 100) * (months / 12))

const result = {
  기준: { 법인: `${E} ${ENTITY_NAME[E]}`, 기간: `${FROM} ~ ${TO}`, 개월수: months },
  스냅샷: {
    예금잔액: deposit, 마이너스통장: overdraft, 대출잔액: loan,
    순자금: deposit + overdraft - loan,
    미수금: ar, 미지급금: ap, 순채권: ar - ap,
  },
  손익_기간: {
    매출, 매출건수: gc(pnlB, 'sales'),
    매입, 매입건수: gc(pnlB, 'purchase'),
    원가_비전표, 기초재고: 기초재고 ?? null, 기말재고: 기말재고 ?? null, 재고증감, 매출원가,
    매출총이익: 매출 - 매출원가,
    판관비, 영업이익,
    이자비용: 영업외, 이자비용_추정: 이자추정, 법인세,
    당기순이익: 영업이익 - (영업외 || 이자추정) - 법인세,
    매출총이익률: 매출 ? +((매출 - 매출원가) / 매출 * 100).toFixed(1) : null,
    영업이익률: 매출 ? +(영업이익 / 매출 * 100).toFixed(1) : null,
    // 참고 — 판관비에 넣지 않는 값들
    참고_payroll테이블: g(pnlB, 'payroll'),
    참고_고정비월액: g(pnlB, 'fixed_monthly'),
    참고_비용아닌지출: 비용아님,
  },
  비용_계정별: cats,
  비용_커버리지: {
    통장출금: covBank, 통장매입지급: cov('bank_supplier').금액, 통장제외: cov('bank_ignored').금액,
    카드사용: covCard, 카드상계: cov('card_offset').금액,
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
line(`■ 재무·자금 진단 — ${ENTITY_NAME[E]}(e${E}) · ${FROM} ~ ${TO} (${months}개월)`)
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
line('▸ 손익 (기간 · 매입=order_date · 판관비=통장·카드 계정분류 · 전 축 법인 고정)')
const pct = v => v === null ? '' : v + '%'
console.table([
  { 항목: '매출', 금액: won(매출), 비고: `${gc(pnlB, 'sales')}건` },
  { 항목: '  − 매입(전표)', 금액: won(매입), 비고: `${gc(pnlB, 'purchase')}건` },
  { 항목: '  + 장비 제외(고정자산)', 금액: won(-장비매입), 비고: 장비매입 ? `GDS-EQ-* ${gc(pnlB, 'purchase_equip')}건 — 감가상각으로 비용화` : '해당 없음' },
  { 항목: '  − 원가(비전표·직불)', 금액: won(원가_비전표), 비고: '원재료비·외주가공비' },
  { 항목: '  + 재고 증가(원가 차감)', 금액: won(-재고증감), 비고: 재고반영 ? `실사 ${won(기초재고)} → ${won(기말재고)}` : '★실사값 없음 — 미반영' },
  { 항목: '= 매출총이익', 금액: won(매출 - 매출원가), 비고: pct(result.손익_기간.매출총이익률) },
  { 항목: '  − 판관비', 금액: won(판관비), 비고: `통장+카드 ${cats.filter(c => c.역할 === 'SGA').length}개 + 감가상각 ${won(감가상각비)}` },
  { 항목: '= 영업이익', 금액: won(영업이익), 비고: pct(result.손익_기간.영업이익률) },
  { 항목: '  − 이자비용', 금액: won(영업외 || 이자추정), 비고: 영업외 ? '실측' : `★추정(잔액×${rate}%×${months}/12)` },
  { 항목: '  − 법인세', 금액: won(법인세), 비고: '' },
  { 항목: '= 당기순이익', 금액: won(result.손익_기간.당기순이익), 비고: 영업외 ? '' : '이자 추정 반영' },
  { 항목: '(참고) 비용 아닌 지출', 금액: won(비용아님), 비고: '대출원금·부가세·가수금 등' },
])
line('▸ 비용 계정별 (통장·카드 합산 · 판관비 정본)')
console.table(cats.map(c => ({
  계정: c.계정, 역할: { COGS: '매출원가', SGA: '판관비', NONOP: '영업외', TAX: '법인세', NOT_EXPENSE: '비용아님' }[c.역할],
  통장: won(c.통장), 카드: won(c.카드), 합계: won(c.합계), 건수: c.건수,
})))
line('▸ 비용 커버리지 (미분류가 크면 판관비는 그만큼 과소다)')
console.table([
  { 원천: '통장 출금', 전체: won(covBank.금액), 미분류: won(covBank.미분류액), 비율: covBank.금액 ? (covBank.미분류액 / covBank.금액 * 100).toFixed(1) + '%' : '-', 건수: `${covBank.미분류건}/${covBank.건수}` },
  { 원천: '  ├ 매입대금 지급', 전체: won(result.비용_커버리지.통장매입지급), 미분류: '', 비율: '매입전표가 정본', 건수: '' },
  { 원천: '  └ 제외(카드대금·법인간·자사이체)', 전체: won(result.비용_커버리지.통장제외), 미분류: '', 비율: '이중계상 차단', 건수: '' },
  { 원천: '카드 승인', 전체: won(covCard.금액), 미분류: won(covCard.미분류액), 비율: covCard.금액 ? (covCard.미분류액 / covCard.금액 * 100).toFixed(1) + '%' : '-', 건수: `${covCard.미분류건}/${covCard.건수}` },
  { 원천: '  └ 상계·매입(제외분)', 전체: won(result.비용_커버리지.카드상계), 미분류: '', 비율: '매입전표가 정본', 건수: '' },
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
// ★비용 원천이 아예 없으면 손익을 내면 안 된다 — 청주(e3)가 그렇다(통장 0건·카드 미등록).
//   판관비 0 은 「비용이 없다」가 아니라 「비용이 다른 법인 통장에서 나간다」는 뜻이다.
if (!covBank.건수 && !covCard.건수) {
  line('')
  line(`⛔ ${ENTITY_NAME[E]}(e${E}) 는 통장 거래도 카드도 없다 — 위 영업이익 ${won(영업이익)} 은 손익이 아니다.`)
  line('   비용 원천이 0 이므로 판관비가 구조적으로 0 이고, 매입만 남아 적자로 보인다.')
  line('   실제 비용은 다른 법인 통장에서 나간다. 그룹 연결로만 읽을 것.')
}
line('★ 이 진단을 읽을 때')
line(`  · 법인간거래를 **제거하지 않은 별도 기준**이다. 1~7월 실측 내부매출/매입 = e1 646만/5,250만 ·`)
line('    e2 1억 1,022만/722만 · e3 0/5,555만(선명 미러 매입채무 `[ICM]`). 그룹 합산 시 양변에서 뺄 것.')
if (재고반영) {
  line(`  · 매출원가에 **실사 재고를 반영**했다(${FROM} ${won(기초재고)} → ${TO} ${won(기말재고)}).`)
  line('    매출원가 = 기초재고 + 매입 + 직불원가 − 기말재고. 주문별 원가 테이블은 여전히 없다.')
} else {
  line('  · ★매출원가에 **재고 증감이 반영돼 있지 않다** — 실사값이 없다(`STOCK` 상수 참조).')
  line('    재고가 늘고 있으면 원가 과대(=이익 과소), 줄고 있으면 반대다. 신설 사업장일수록 왜곡이 크다.')
}
line('  · 판관비는 **통장·카드에서 실제 나간 돈**이다(발생주의 아님). 미지급·미도래분은 안 잡힌다.')
line(`    payroll 테이블 급여는 ${won(result.손익_기간.참고_payroll테이블)} — 통장 급여와 다르면 현금/미지급 차이다.`)
line('  · 고정비(fixed_expenses)는 판관비에 넣지 않는다. 통장 실측과 이중계상이 되기 때문이다.')
line('  · 「비용 아닌 지출」은 대출원금·부가세 납부·가수금 반제 등이다. 현금은 나가지만 손익이 아니다.')
line('  · 리스료는 판관비로 넣었다. 금융리스라면 원금 부분은 비용이 아니다 — 계약 확인 전까지 과대 가능.')
if (!영업외 && 이자추정) {
  line(`  · ★이자비용이 통장 「대출상환」에 섞여 분리가 안 된다(loan_payments 에 과거 회차가 없다).`)
  line(`    잔액 ${won(n(ln.v) + Math.abs(overdraft))} × 가중평균 ${rate}% × ${months}/12 = 약 ${won(이자추정)} 으로 추정만 했다.`)
  line(`    영업이익은 영향 없고 당기순이익만 이만큼 줄어든다. 금리 미입력 대출 잔액 ${won(n(ln.norate))} 은 추정에서 빠졌다.`)
}
line('  · 매입은 order_date 기준이다. `created_at` 은 이관 실행 시각이라 업무상 의미가 없다')
line('    (위 「이관 편중」 표에서 두 기준이 얼마나 벌어지는지 직접 확인할 것).')
line('  · 미수금·미지급금은 법인간거래(내부 3사)와 현금소매 더미를 뺀 값이다.')
line('  · 대출 「기한경과 미처리」가 크면 실제 미납이 아니라 [납부] 처리를 안 한 것일 수 있다.')
line('')
