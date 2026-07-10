/**
 * taxInvoices/helpers.ts — 세금계산서 공유 헬퍼 (taxInvoices.ts에서 분리, 2026-06-11 대형파일 분할)
 *
 * 바로빌 provider 팩토리(getTaxProvider) / 번호생성 / 회사설정 / 발행(issueTaxInvoice) /
 * 법인분할 발행(createSplitInvoices) + 공유 타입. queries·issue·batch·manage 라우트 그룹 +
 * portal.ts(getTaxProvider)에서 공유. ⚠️ 이동만, 로직 수정 0.
 */
import type { TaxInvoice, TaxInvoiceItem } from '../../types/models'
import type { TaxProvider } from '../../services/taxProvider'
import { sendEmail } from '../../services/emailProvider'
import { renderTemplate } from '../../services/emailTemplates'
import { getEntityCompanyInfo } from '../../utils/entitySettings'
import { kstYear } from '../../utils/kstDate'

export async function getTaxProvider(db: D1Database, env: any, corpNum: string): Promise<TaxProvider | null> {
  const testModeRow = await db.prepare(
    "SELECT setting_value FROM settings WHERE setting_key = 'barobill_test_mode'"
  ).first<{ setting_value: string }>()
  const isTest = testModeRow?.setting_value !== '0'
  const certKey = isTest ? env.BAROBILL_CERT_KEY : env.BAROBILL_CERT_KEY_PROD
  if (!certKey || !corpNum) return null
  const { createBarobillTaxProvider } = await import('../../services/barobillTax')
  return createBarobillTaxProvider({ certKey, corpNum, isTest })
}

// 세금계산서 + 주문번호 JOIN 결과 타입
export type TaxInvoiceWithOrder = TaxInvoice & { order_number?: string }

// settings 테이블 단건 조회 결과
export type SettingRow = { setting_value: string }

// 거래처 정보 조회 결과 (batch-create / 단건 공용)
export type ClientRow = {
  id: number; client_name: string; business_registration_number: string | null;
  representative: string | null; address: string | null; business_type: string | null;
  business_item: string | null; email: string | null; billing_group_id: number | null;
  mobile?: string;
}

// eligible-orders / monthly 쿼리 결과 행
export type EligibleOrderRow = {
  id: number; order_number: string; order_date: string; total_amount: string;
  vat_amount: string; final_amount: string; billing_status: string;
  client_id: number; client_name: string; business_registration_number: string | null;
  client_email: string | null; invoice_method: string | null;
}

// 주문 + 거래처 JOIN 결과
export type OrderWithClient = {
  id: number; order_number: string; order_date: string; total_amount: string;
  vat_amount: string; client_name: string; business_registration_number: string | null;
  representative: string | null; address: string | null; business_type: string | null;
  business_item: string | null; client_email: string | null; client_id: number;
  [key: string]: unknown;
}

// monthly-eligible 쿼리 결과 행
export type MonthlyEligibleRow = {
  client_id: number; client_name: string; business_registration_number: string | null;
  representative: string | null; address: string | null; business_type: string | null;
  business_item: string | null; buyer_email: string | null;
  order_id: number; order_number: string; total_amount: string; vat_amount: string;
  client_email?: string | null;
}


// ────────────────────────────────────────────────────────────────────────────
// 공통 헬퍼: 관리번호 채번
// ────────────────────────────────────────────────────────────────────────────
export async function generateInvoiceNumber(db: D1Database, entityId?: number): Promise<string> {
  // #171: 법인별 시퀀스 채번
  const year = kstYear()
  const entityClause = entityId && entityId > 0 ? ' AND entity_id = ?' : ''
  const entityParams = entityId && entityId > 0 ? [entityId] : []
  const lastRow = await db.prepare(
    `SELECT invoice_number FROM tax_invoices WHERE invoice_number LIKE ?${entityClause} ORDER BY invoice_number DESC LIMIT 1`
  ).bind(`TI-${year}-%`, ...entityParams).first<{ invoice_number: string }>()
  let nextSeq = 1
  if (lastRow?.invoice_number) {
    const parts = lastRow.invoice_number.split('-')
    nextSeq = parseInt(parts[parts.length - 1]) + 1
  }
  return `TI-${year}-${String(nextSeq).padStart(4, '0')}`
}

// ────────────────────────────────────────────────────────────────────────────
// 공통 헬퍼: 회사 설정 조회 (entities 테이블 우선, 폴백: settings)
// ────────────────────────────────────────────────────────────────────────────

export async function getCompanySettings(db: D1Database, entityId?: number): Promise<Record<string, string>> {
  if (entityId && entityId > 0) {
    return getEntityCompanyInfo(db, entityId)
  }
  // 레거시 폴백
  const { results: settingRows } = await db.prepare(
    `SELECT setting_key, setting_value FROM settings
     WHERE setting_key IN (
       'company_name', 'company_business_registration_number',
       'company_representative', 'company_address',
       'company_business_type', 'company_business_item'
     )`
  ).all()
  const settings: Record<string, string> = {}
  for (const row of settingRows as Array<{ setting_key: string; setting_value: string }>) {
    settings[row.setting_key] = row.setting_value || ''
  }
  return settings
}

// ────────────────────────────────────────────────────────────────────────────
// 공통 헬퍼: issue 로직 (POST /:id/issue + auto_issue 공유)
// ────────────────────────────────────────────────────────────────────────────
export async function issueTaxInvoice(
  db: D1Database,
  taxInvoiceId: number,
  userId: number,
  env: any,
  entityId?: number
): Promise<{ success: boolean; error?: string; data?: any }> {
  const entityScope = entityId != null && entityId !== 0 ? ' AND ti.entity_id = ?' : ''
  const existing = await db.prepare(
    `SELECT ti.*, o.order_number FROM tax_invoices ti
     LEFT JOIN orders o ON ti.order_id = o.id
     WHERE ti.id = ?${entityScope}`
  ).bind(...(entityScope ? [taxInvoiceId, entityId] : [taxInvoiceId])).first<TaxInvoiceWithOrder>()

  if (!existing) {
    return { success: false, error: '세금계산서를 찾을 수 없습니다.' }
  }
  // #420: DRAFT 또는 stale ISSUING(2분 경과, 크래시 잔재)만 발행 진입 허용.
  if (existing.status !== 'DRAFT' && existing.status !== 'ISSUING') {
    return { success: false, error: '임시저장 상태의 세금계산서만 발행할 수 있습니다.' }
  }

  // #420: 원자적 발행 선점(claim) — DRAFT→ISSUING. 동시 더블클릭/멀티탭/재시도 시 단 1건만 provider.issue()에 도달
  //       (국세청 중복발행 방지). 직전 status 검사와 이 claim 사이에 await 없음 → 정상 단건은 changes=1 보장.
  //       크래시로 ISSUING 고착 시: 2분 경과한 stale ISSUING은 재선점 허용(barobill 발행은 초 단위라 2분이면 안전,
  //       이미 발행됐다면 mgtKey unique로 재호출이 거부됨). 0행이면 다른 요청이 이미 처리 중.
  // UPDATE는 테이블 alias 없음 → entity 스코프도 alias 없이(entity_id). entityScope는 SELECT용(ti.entity_id)이라 재사용 불가.
  const claimScope = entityId != null && entityId !== 0 ? ' AND entity_id = ?' : ''
  const claimRes = await db.prepare(
    `UPDATE tax_invoices SET status = 'ISSUING', updated_at = CURRENT_TIMESTAMP
     WHERE id = ?${claimScope}
       AND (status = 'DRAFT' OR (status = 'ISSUING' AND updated_at <= datetime('now', '-2 minutes')))`
  ).bind(...(claimScope ? [taxInvoiceId, entityId] : [taxInvoiceId])).run()
  if (!claimRes.meta.changes) {
    return { success: false, error: '이미 발행 처리 중인 세금계산서입니다. 잠시 후 상태를 새로고침하세요.' }
  }

  const { results: items } = await db.prepare(
    'SELECT id, tax_invoice_id, item_date, item_name, specification, quantity, unit_price, supply_amount, tax_amount, notes, sort_order FROM tax_invoice_items WHERE tax_invoice_id = ? ORDER BY sort_order'
  ).bind(taxInvoiceId).all()

  // 세금계산서 Provider (바로빌)
  const provider = await getTaxProvider(db, env, existing.supplier_brn.replace(/-/g, ''))
  if (provider) {
    const supplierEmailSetting = await db.prepare(
      `SELECT setting_value FROM settings WHERE setting_key IN ('email_from_address', 'company_email') ORDER BY setting_key`
    ).all()
    const supplierEmail = (supplierEmailSetting.results as Array<{ setting_value: string }>)
      .map(r => r.setting_value).find(v => v) || ''

    const result = await provider.issue({
      supplierBRN: existing.supplier_brn.replace(/-/g, ''),
      supplierName: existing.supplier_name,
      supplierRepresentative: existing.supplier_representative || '',
      supplierAddress: existing.supplier_address || '',
      supplierBusinessType: existing.supplier_business_type || '',
      supplierBusinessItem: existing.supplier_business_item || '',
      supplierEmail,
      buyerBRN: existing.buyer_brn.replace(/-/g, ''),
      buyerName: existing.buyer_name,
      buyerRepresentative: existing.buyer_representative || '',
      buyerAddress: existing.buyer_address || '',
      buyerBusinessType: existing.buyer_business_type || '',
      buyerBusinessItem: existing.buyer_business_item || '',
      buyerEmail: existing.buyer_email || '',
      supplyAmount: existing.supply_amount,
      taxAmount: existing.tax_amount,
      totalAmount: existing.total_amount,
      mgtKey: existing.invoice_number,
      issueDate: existing.issue_date.replace(/-/g, ''),
      invoiceType: existing.invoice_type === 'MODIFY' ? 'modify' : 'normal',
      modifyCode: existing.modify_code ? parseInt(existing.modify_code) : undefined,
      items: (items as unknown as TaxInvoiceItem[]).map((item, i) => ({
        serialNum: i + 1,
        itemDate: (item.item_date || existing.issue_date).replace(/-/g, ''),
        itemName: item.item_name,
        specification: item.specification || '',
        quantity: item.quantity,
        unitPrice: item.unit_price,
        supplyAmount: item.supply_amount,
        taxAmount: item.tax_amount,
        remark: item.notes || '',
      })),
      notes: existing.notes || '',
    })

    if (result.success) {
      await db.prepare(`
        UPDATE tax_invoices
        SET status = 'SENT', issued_by = ?, nts_approval_number = ?,
            nts_sent_at = CURRENT_TIMESTAMP, provider_name = 'barobill',
            provider_response = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).bind(userId, result.ntsApprovalNumber || null, result.rawResponse || null, taxInvoiceId).run()
    } else {
      await db.prepare(`
        UPDATE tax_invoices
        SET status = 'FAILED', issued_by = ?, provider_name = 'barobill',
            nts_result_code = ?, nts_result_message = ?,
            provider_response = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).bind(userId, result.errorCode || null, result.errorMessage || null, result.rawResponse || null, taxInvoiceId).run()

      return {
        success: false,
        error: `바로빌 발행 실패: ${result.errorMessage || 'Unknown'}`,
        data: { providerError: result }
      }
    }
  } else {
    // 바로빌 미설정 → 로컬 발행만
    await db.prepare(
      `UPDATE tax_invoices SET status = 'ISSUED', issued_by = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
    ).bind(userId, taxInvoiceId).run()
  }

  const updated = await db.prepare(`
    SELECT ti.*, o.order_number FROM tax_invoices ti
    LEFT JOIN orders o ON ti.order_id = o.id
    WHERE ti.id = ?
  `).bind(taxInvoiceId).first<TaxInvoiceWithOrder>()

  // 이메일 자동 발송 (발행 성공 시 buyer_email로)
  if (updated && (updated.status === 'SENT' || updated.status === 'ISSUED') && updated.buyer_email) {
    try {
      // 연결된 주문번호들 조회
      const { results: tioRows } = await db.prepare(
        `SELECT o.order_number FROM tax_invoice_orders tio JOIN orders o ON tio.order_id = o.id WHERE tio.tax_invoice_id = ?`
      ).bind(taxInvoiceId).all()
      const orderNumbers = (tioRows as Array<{ order_number: string }>).map(r => r.order_number).join(', ') || updated.order_number || ''

      const { subject, html } = renderTemplate('INVOICE_ISSUED', {
        buyerName: updated.buyer_name,
        invoiceNumber: updated.invoice_number,
        issueDate: updated.issue_date,
        supplyAmount: Number(updated.supply_amount) || 0,
        taxAmount: Number(updated.tax_amount) || 0,
        totalAmount: Number(updated.total_amount) || 0,
        ntsApprovalNumber: updated.nts_approval_number,
        orderNumbers,
      })

      await sendEmail(env, db, { to: updated.buyer_email, subject, html }, {
        template: 'INVOICE_ISSUED',
        relatedType: 'tax_invoice',
        relatedId: taxInvoiceId,
        sentBy: userId,
      })
    } catch (_emailErr) {
      // 이메일 실패해도 발행은 성공 처리
    }
  }

  // 알림톡 자동 발송 (fire-and-forget)
  if (updated && (updated.status === 'SENT' || updated.status === 'ISSUED')) {
    try {
      const kakaoEnabled = await db.prepare(
        `SELECT setting_value FROM settings WHERE setting_key = 'kakao_enabled'`
      ).first<SettingRow>()
      if (kakaoEnabled?.setting_value === '1') {
        // 거래처 mobile 번호 조회
        const buyerClient = await db.prepare(
          `SELECT id, mobile FROM clients WHERE business_registration_number = ?`
        ).bind(updated.buyer_brn?.replace(/-/g, '')).first<{ id: number; mobile: string | null }>()
        if (buyerClient?.mobile) {
          const kakaoSenderNum = await db.prepare(
            `SELECT setting_value FROM settings WHERE setting_key = 'kakao_sender_num'`
          ).first<SettingRow>()
          if (kakaoSenderNum?.setting_value) {
              // TODO: 세금계산서 전용 템플릿 코드 설정 추가 후 활성화
              console.log(`[kakao] 세금계산서 ${updated.invoice_number} 알림톡 발송 대상: ${buyerClient.mobile}`)
              await db.prepare(`
                INSERT INTO kakao_send_logs (template_code, receiver_num, receiver_name, related_type, related_id, client_id, content, status, sent_by, created_at, entity_id)
                VALUES ('TAX_INVOICE', ?, ?, 'tax_invoices', ?, ?, ?, 'PENDING', ?, datetime('now'), ?)
              `).bind(
                buyerClient.mobile, updated.buyer_name || '',
                taxInvoiceId, buyerClient.id,
                `세금계산서 ${updated.invoice_number} 발행 안내`,
                userId,
                (updated as any).entity_id || 1
              ).run()
          }
        }
      }
    } catch (_kakaoErr) {
      console.warn('알림톡 발송 오류 (세금계산서):', _kakaoErr)
    }
  }

  // P4 split billing: 이 계산서(법인)의 청구그룹만 BILLED + group↔invoice 연결.
  // orders 미러는 그 주문의 전(全) 그룹이 BILLED/PAID일 때만 갱신(혼합주문 부분청구 대응).
  // 가드: NULL(미청구)도 매칭하도록 IS NOT 사용(SQLite `NULL != 'BILLED'`=NULL 버그 회피).
  try {
    const invEntity = Number(updated?.entity_id) || Number(existing.entity_id) || null
    const { results: linkedOrders } = await db.prepare(
      `SELECT order_id FROM tax_invoice_orders WHERE tax_invoice_id = ?`
    ).bind(taxInvoiceId).all()
    const orderIds = (linkedOrders as Array<{ order_id: number }>).map(r => r.order_id).filter(Boolean)
    // 직접 연결된 order_id도 포함
    if (updated?.order_id && !orderIds.includes(updated.order_id)) orderIds.push(updated.order_id)
    if (orderIds.length > 0 && invEntity) {
      const ph = orderIds.map(() => '?').join(',')
      await db.batch([
        // 이 법인 그룹만 청구확정 + 발행 계산서 연결
        db.prepare(
          // 회계반영일 = 이 계산서 작성일자(issue_date) — 출고월과 다른 달로 발행 시 매출인식/입금예정이 작성일자 기준으로 따라감
          `UPDATE order_billing_groups SET billing_status = 'BILLED', billed_at = CURRENT_TIMESTAMP, billed_by = ?, tax_invoice_id = ?,
             accounting_date = COALESCE((SELECT issue_date FROM tax_invoices WHERE id = ?), date('now','+9 hours'))
           WHERE order_id IN (${ph}) AND entity_id = ? AND billing_status IS NOT 'BILLED' AND billing_status IS NOT 'PAID'`
        ).bind(userId, taxInvoiceId, taxInvoiceId, ...orderIds, invEntity),
        // orders 미러: 그 주문의 모든 그룹이 청구완료된 경우에만 BILLED (회계반영일도 계산서 작성일자로 동기화)
        db.prepare(
          `UPDATE orders SET billing_status = 'BILLED',
             accounting_date = COALESCE((SELECT issue_date FROM tax_invoices WHERE id = ?), accounting_date, date('now','+9 hours')),
             updated_at = CURRENT_TIMESTAMP
           WHERE id IN (${ph}) AND billing_status IS NOT 'BILLED'
             AND NOT EXISTS (SELECT 1 FROM order_billing_groups g WHERE g.order_id = orders.id AND COALESCE(g.billing_status,'') NOT IN ('BILLED','PAID'))`
        ).bind(taxInvoiceId, ...orderIds)
      ])
    }
  } catch (_billingErr) {
    console.error('[taxInvoices] billing_status 업데이트 실패 — 수동 확인 필요 (invoice:', taxInvoiceId, '):', _billingErr)
  }

  return { success: true, data: { ...updated, items } }
}

// ────────────────────────────────────────────────────────────────────────────
// P4 split billing: 선택 주문들을 **생산법인별**로 분할해 법인당 1장의 세금계산서 생성.
// 청구그룹(order_billing_groups) 기준으로 법인을 가르고, 각 법인 회사정보·채번·금액·품목으로 발행.
// 단일법인 주문 = 1장 (기존 동작 동일). 혼합주문 = 법인 수만큼 N장.
// 반환: 법인별 생성 결과. autoIssue 시 issueTaxInvoice(법인 스코프) 호출.
// ────────────────────────────────────────────────────────────────────────────
interface SplitBuyer {
  id: number
  business_registration_number: string | null
  client_name: string
  representative?: string | null
  address?: string | null
  business_type?: string | null
  business_item?: string | null
  email?: string | null
}
export async function createSplitInvoices(
  db: D1Database,
  env: any,
  params: {
    orderIds: number[]
    buyer: SplitBuyer
    buyerEmail?: string | null
    issueDate: string
    notes?: string | null
    itemMode: 'detail' | 'summary'
    summaryLabel?: string
    autoIssue?: boolean
    userId: number
  }
): Promise<Array<{ entity_id: number; invoice_id: number; invoice_number: string; supply: number; tax: number; total: number; issued: boolean; error?: string }>> {
  const { orderIds, buyer, issueDate } = params
  if (!orderIds.length) return []
  const ph = orderIds.map(() => '?').join(',')

  // 청구그룹 → 법인별 집계 (supply/tax는 recalc·마이그가 채운 값). 그룹별 group_id 보유.
  const { results: grows } = await db.prepare(
    `SELECT g.id AS group_id, g.order_id, g.entity_id,
            CAST(COALESCE(g.supply_amount,0) AS INTEGER) AS supply,
            CAST(COALESCE(g.tax_amount,0)    AS INTEGER) AS tax
     FROM order_billing_groups g WHERE g.order_id IN (${ph})`
  ).bind(...orderIds).all<{ group_id: number; order_id: number; entity_id: number; supply: number; tax: number }>()

  // 법인별 그룹화
  const byEntity = new Map<number, { supply: number; tax: number; orderIds: Set<number>; groupIds: number[] }>()
  for (const g of grows) {
    let e = byEntity.get(g.entity_id)
    if (!e) { e = { supply: 0, tax: 0, orderIds: new Set(), groupIds: [] }; byEntity.set(g.entity_id, e) }
    e.supply += Number(g.supply) || 0
    e.tax += Number(g.tax) || 0
    e.orderIds.add(g.order_id)
    e.groupIds.push(g.group_id)
  }

  const out: Array<{ entity_id: number; invoice_id: number; invoice_number: string; supply: number; tax: number; total: number; issued: boolean; error?: string }> = []

  for (const [entityId, agg] of byEntity) {
    const supplyAmount = agg.supply
    const taxAmount = agg.tax
    const totalAmount = supplyAmount + taxAmount
    if (totalAmount <= 0) {
      out.push({ entity_id: entityId, invoice_id: 0, invoice_number: '', supply: 0, tax: 0, total: 0, issued: false, error: '금액 0 (주문 재저장 필요 — 청구그룹 금액 미산정)' })
      continue
    }
    const entOrderIds = [...agg.orderIds]
    const supplier = await getCompanySettings(db, entityId)
    if (!supplier.company_business_registration_number) {
      out.push({ entity_id: entityId, invoice_id: 0, invoice_number: '', supply: supplyAmount, tax: taxAmount, total: totalAmount, issued: false, error: `법인 ${entityId} 사업자등록번호 미설정` })
      continue
    }
    const invoiceNumber = await generateInvoiceNumber(db, entityId)

    const ins = await db.prepare(`
      INSERT INTO tax_invoices (
        invoice_number, order_id, invoice_type,
        supplier_brn, supplier_name, supplier_representative,
        supplier_address, supplier_business_type, supplier_business_item,
        buyer_client_id, buyer_brn, buyer_name, buyer_representative,
        buyer_address, buyer_business_type, buyer_business_item, buyer_email,
        supply_amount, tax_amount, total_amount,
        status, issue_date, notes, entity_id,
        created_at, updated_at
      ) VALUES (?, ?, 'NORMAL', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'DRAFT', ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).bind(
      invoiceNumber, entOrderIds[0],
      supplier.company_business_registration_number, supplier.company_name || '',
      supplier.company_representative || null, supplier.company_address || null,
      supplier.company_business_type || null, supplier.company_business_item || null,
      buyer.id, buyer.business_registration_number, buyer.client_name,
      buyer.representative || null, buyer.address || null,
      buyer.business_type || null, buyer.business_item || null,
      params.buyerEmail || buyer.email || null,
      supplyAmount, taxAmount, totalAmount,
      issueDate, params.notes || null, entityId
    ).run()
    const taxInvoiceId = ins.meta.last_row_id as number

    // junction(이 법인 주문) + group↔invoice 연결 + 품목
    const eph = entOrderIds.map(() => '?').join(',')
    const stmts: D1PreparedStatement[] = [
      ...entOrderIds.map(oid =>
        db.prepare('INSERT OR IGNORE INTO tax_invoice_orders (tax_invoice_id, order_id) VALUES (?, ?)').bind(taxInvoiceId, oid)
      ),
      db.prepare(`UPDATE order_billing_groups SET tax_invoice_id = ? WHERE id IN (${agg.groupIds.map(() => '?').join(',')})`).bind(taxInvoiceId, ...agg.groupIds),
    ]
    if (params.itemMode === 'summary') {
      stmts.push(db.prepare(`
        INSERT INTO tax_invoice_items (tax_invoice_id, item_date, item_name, quantity, unit_price, supply_amount, tax_amount, sort_order)
        VALUES (?, ?, ?, 1, ?, ?, ?, 1)
      `).bind(taxInvoiceId, issueDate, params.summaryLabel || '합산', supplyAmount, supplyAmount, taxAmount))
    } else {
      // 이 법인 담당 품목만 (COALESCE(assigned_entity_id, 주법인) = entityId)
      const { results: items } = await db.prepare(
        `SELECT oi.item_name, oi.specification, oi.width, oi.height, oi.quantity, oi.unit_price, oi.amount, oi.vat_included
         FROM order_items oi JOIN orders o ON o.id = oi.order_id
         WHERE oi.order_id IN (${eph}) AND COALESCE(oi.assigned_entity_id, o.entity_id) = ?
         ORDER BY oi.order_id, oi.sort_order`
      ).bind(...entOrderIds, entityId).all<Record<string, unknown>>()
      const vatRate = 0.1
      items.forEach((oi, idx) => {
        const itemAmount = parseFloat(String(oi.amount)) || 0
        const itemTax = oi.vat_included ? Math.round(itemAmount * vatRate) : 0
        const spec = (oi.specification as string | null) || ((oi.width && oi.height) ? `${oi.width}x${oi.height}` : null)
        stmts.push(db.prepare(`
          INSERT INTO tax_invoice_items (tax_invoice_id, item_date, item_name, specification, quantity, unit_price, supply_amount, tax_amount, sort_order)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(taxInvoiceId, issueDate, oi.item_name, spec, oi.quantity, parseFloat(String(oi.unit_price)) || 0, itemAmount, itemTax, idx))
      })
    }
    for (let i = 0; i < stmts.length; i += 80) await db.batch(stmts.slice(i, i + 80))

    let issued = false
    let issueErr: string | undefined
    if (params.autoIssue) {
      const r = await issueTaxInvoice(db, taxInvoiceId, params.userId, env, entityId)
      issued = r.success
      if (!r.success) issueErr = r.error
    }
    out.push({ entity_id: entityId, invoice_id: taxInvoiceId, invoice_number: invoiceNumber, supply: supplyAmount, tax: taxAmount, total: totalAmount, issued, error: issueErr })
  }
  return out
}
