// ============================================================================
// 매입 후보 큐 — 통장에서 돈이 나갔는데 발주가 없는 것을 띄운다
// ----------------------------------------------------------------------------
// ★ 왜 (2026-09-07) — 발주 등록이 **동산 08-06 · 선명 07-31 이후 0건**이다. 7월까지도
//   사람이 몰아서 넣고 있었고(6월분 167건 중 73건을 7/15, 48건을 8/10에 입력) 한 번 밀리자 멈췄다.
//   통장·카드·판매는 정상 수집이라 **재고가 나가기만** 한다(선명 재고 228행 중 28행 음수).
//   ⇒ 「사람이 더 부지런히」가 아니라 **돈이 나갔으면 화면에 남게** 만든다.
//
// ★ 1:1 매칭을 하지 않는다 — 지급은 「6월 외상대」처럼 **여러 발주를 월단위로 묶어** 나간다.
//   금액을 건별로 맞추려 들면 대부분 안 맞아 큐가 거짓말을 한다.
//   그래서 **거래처 × 기간 대조**가 정본이다: 통장 지급 합계 ↔ 같은 기간 발주 합계 → 차액.
//   발주를 등록하면 차액이 줄어 **큐가 스스로 비워진다**(별도 상태 컬럼이 필요 없다).
//
// ★ 판정 규칙은 여기 없다 — `utils/apCandidate` 가 정본이고 픽스처로 검증된다
//   (`npm run test:ap-candidate`). 이 파일은 데이터를 모아 그 함수에 넘기기만 한다.
//
// ⚠️ 제외 축 3개는 **이미 있는 것을 쓴다**(새 플래그를 만들지 않는다):
//     · `bank_accounts.is_personal` — 대표자 개인통장([[design-personal-bank-account]])
//     · `bank_transactions.transfer_pair_id` — 자기계좌 이체
//     · `bank_transactions.matched_purchase_payment_id` — 이미 매입지급으로 연결된 건
// ============================================================================
import { Hono } from 'hono'
import type { HonoEnv } from '../types/env'
import { authMiddleware } from '../middleware/auth'
import { requireAccessOrRole } from '../middleware/permissions'
import { entityFilter } from '../utils/entityFilter'
import { kstYmd } from '../utils/kstDate'
import {
  buildClientPool, classifyWithdrawal, isCandidate,
  type ApClient, type ApVerdict,
} from '../utils/apCandidate'

const purchaseCandidatesRouter = new Hono<HonoEnv>()
purchaseCandidatesRouter.use('/*', authMiddleware, requireAccessOrRole('/purchase-candidates', 'MANAGER'))

interface WdRow {
  id: number
  transaction_date: string
  entity_id: number
  amount: number
  counterpart_name: string | null
  category_name: string | null
  bank_name: string | null
}
interface ClientRow { id: number; client_name: string; po_count: number; last_po: string | null }
interface OwnerRow { entity_id: number; client_id: number; owner_id: number | null; owner_name: string | null }
interface PoSumRow { supplier_id: number; po_count: number; po_amount: number; last_po: string | null }

/** `YYYY-MM-DD` → `YYYYMMDD`. bank_transactions.transaction_date 가 구분자 없는 문자열이다. */
const compact = (s: string) => String(s || '').replace(/-/g, '')

/** N개월 전 1일(KST). 기본 조회창. */
function monthsAgoYmd(months: number): string {
  const now = new Date(Date.now() + 9 * 3600 * 1000)
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - months, 1))
  return d.toISOString().slice(0, 10)
}

purchaseCandidatesRouter.get('/', async (c) => {
  try {
    const months = Math.min(Math.max(parseInt(c.req.query('months') || '2', 10) || 2, 1), 12)
    const from = c.req.query('from') || monthsAgoYmd(months - 1)
    const to = c.req.query('to') || kstYmd()
    const fromC = compact(from)
    const toC = compact(to)

    // ── ① 출금 ────────────────────────────────────────────────────────────
    const ef = entityFilter(c, 'b')
    const { results: wds } = await c.env.DB.prepare(`
      SELECT b.id, b.transaction_date, b.entity_id, b.amount,
             b.counterpart_name, ec.name AS category_name, a.bank_name
        FROM bank_transactions b
        JOIN bank_accounts a ON a.id = b.bank_account_id
        LEFT JOIN expense_categories ec ON ec.id = b.matched_category_id
       WHERE b.transaction_type = 'WITHDRAWAL'
         AND REPLACE(b.transaction_date, '-', '') BETWEEN ? AND ?
         AND COALESCE(a.is_personal, 0) = 0
         AND b.transfer_pair_id IS NULL
         AND b.matched_purchase_payment_id IS NULL${ef.clause}
       ORDER BY b.amount DESC
    `).bind(fromC, toC, ...ef.params).all<WdRow>()

    // ── ② 거래처 풀 — **전체 활성 거래처**(발주 이력이 있는데 SALES 인 곳이 있다) ──
    const { results: clients } = await c.env.DB.prepare(`
      SELECT c.id, c.client_name,
             (SELECT COUNT(*) FROM purchase_orders po WHERE po.supplier_id = c.id) AS po_count,
             (SELECT MAX(po.order_date) FROM purchase_orders po WHERE po.supplier_id = c.id) AS last_po
        FROM clients c
       WHERE c.is_active = 1
    `).all<ClientRow>()
    const pool = buildClientPool((clients || []) as ApClient[])

    // ── ②-b 거래처별 발주 담당자 (0586) ──────────────────────────────────
    //   자재를 **받는** 사람(구역 담당)과 다른 축이다 — 이 거래처에 **주문하는** 사람.
    //   후보를 사람에게 붙여 주면 「전부 경리 몫」이 아니라 담당자별로 갈린다.
    const { results: owners } = await c.env.DB.prepare(`
      SELECT so.entity_id, so.client_id, so.user_id AS owner_id, u.name AS owner_name
        FROM supplier_owners so LEFT JOIN users u ON u.id = so.user_id
    `).all<OwnerRow>()
    const ownerMap = new Map<string, OwnerRow>()
    for (const o of owners || []) ownerMap.set(`${o.entity_id}:${o.client_id}`, o)

    // ── ③ 같은 기간 발주 합계 (거래처별) — 차액의 반대편 ──────────────────
    const efPo = entityFilter(c, 'po')
    const { results: poSums } = await c.env.DB.prepare(`
      SELECT po.supplier_id, COUNT(*) AS po_count,
             COALESCE(SUM(po.total_amount), 0) AS po_amount,
             MAX(po.order_date) AS last_po
        FROM purchase_orders po
       WHERE po.order_date BETWEEN ? AND ?${efPo.clause}
       GROUP BY po.supplier_id
    `).bind(from, to, ...efPo.params).all<PoSumRow>()
    const poBySupplier = new Map<number, PoSumRow>()
    for (const p of poSums || []) poBySupplier.set(Number(p.supplier_id), p)

    // ── ④ 판정 ────────────────────────────────────────────────────────────
    const rows = (wds || []).map((w) => {
      const r = classifyWithdrawal({
        counterpart_name: w.counterpart_name,
        category_name: w.category_name,
        entity_id: w.entity_id,
      }, pool)
      const owner = r.client_id ? ownerMap.get(`${w.entity_id}:${r.client_id}`) : undefined
      return {
        id: w.id,
        date: w.transaction_date,
        entity_id: w.entity_id,
        amount: Math.round(Number(w.amount) || 0),
        memo: w.counterpart_name || '',
        category: w.category_name || '',
        bank: w.bank_name || '',
        verdict: r.verdict,
        reasons: r.reasons,
        client_id: r.client_id,
        client_name: r.client_name,
        po_count: r.po_count,
        owner_id: owner?.owner_id ?? null,
        owner_name: owner?.owner_name ?? '',
      }
    })
    const candidates = rows.filter((r) => isCandidate(r.verdict as ApVerdict))

    // ── ⑤ 거래처 × 기간 대조 ─────────────────────────────────────────────
    interface Agg {
      key: string; client_id: number | null; name: string; paid: number; n: number
      entities: Set<number>; last: string; verdict: ApVerdict; memos: string[]
      po_count: number; po_amount: number; owner_name: string
    }
    const RANK: Record<string, number> = { STRONG: 3, LIKELY: 2, UNKNOWN: 1 }
    const aggMap = new Map<string, Agg>()
    for (const r of candidates) {
      const key = r.client_id ? `c${r.client_id}` : `m${r.memo}`
      let a = aggMap.get(key)
      if (!a) {
        const po = r.client_id ? poBySupplier.get(r.client_id) : undefined
        a = {
          key, client_id: r.client_id, name: r.client_name || r.memo || '(무명)',
          paid: 0, n: 0, entities: new Set(), last: '', verdict: 'UNKNOWN', memos: [],
          po_count: Number(po?.po_count) || 0, po_amount: Math.round(Number(po?.po_amount) || 0),
          owner_name: r.owner_name || '',
        }
        aggMap.set(key, a)
      }
      a.paid += r.amount
      a.n += 1
      a.entities.add(r.entity_id)
      if (r.date > a.last) a.last = r.date
      if ((RANK[r.verdict] || 0) > (RANK[a.verdict] || 0)) a.verdict = r.verdict as ApVerdict
      if (a.memos.length < 4 && r.memo && !a.memos.includes(r.memo)) a.memos.push(r.memo)
      if (!a.owner_name && r.owner_name) a.owner_name = r.owner_name
    }
    const suppliers = [...aggMap.values()]
      .map((a) => ({
        client_id: a.client_id, name: a.name, paid: a.paid, lines: a.n,
        entities: [...a.entities].sort(), last: a.last, verdict: a.verdict, memos: a.memos,
        po_count: a.po_count, po_amount: a.po_amount, owner_name: a.owner_name,
        // ★차액 = 통장에서 나간 돈 − 같은 기간 등록된 발주. 양수면 「발주가 모자라다」
        gap: a.paid - a.po_amount,
      }))
      .sort((x, y) => y.gap - x.gap)

    const sum = (list: typeof rows) => list.reduce((s, r) => s + r.amount, 0)
    const byV = (v: string) => candidates.filter((r) => r.verdict === v)
    const summary = {
      from, to,
      withdrawal_lines: rows.length,
      withdrawal_amount: sum(rows),
      candidate_lines: candidates.length,
      candidate_amount: sum(candidates),
      strong: { lines: byV('STRONG').length, amount: sum(byV('STRONG')) },
      likely: { lines: byV('LIKELY').length, amount: sum(byV('LIKELY')) },
      unknown: { lines: byV('UNKNOWN').length, amount: sum(byV('UNKNOWN')) },
      excluded: { lines: rows.length - candidates.length, amount: sum(rows) - sum(candidates) },
      supplier_count: suppliers.length,
      owned_suppliers: suppliers.filter((x) => x.owner_name).length,
      total_gap: suppliers.reduce((s, x) => s + Math.max(0, x.gap), 0),
    }

    return c.json({ success: true, data: { summary, suppliers, rows } })
  } catch (error) {
    console.error('src/routes/purchaseCandidates.ts error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

export default purchaseCandidatesRouter
