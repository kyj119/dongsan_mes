// 배송 알림 **본문 생성** 단일 소스 (2026-09-18)
//
// ★왜 여기 있나
//   미리보기와 실제 발송이 **다른 코드로 본문을 만들면**, 화면에서 확인한 것과 고객에게 간 것이
//   달라진다. 그건 「보여줬으니 괜찮다」는 확인 절차 자체를 무의미하게 만든다.
//   그래서 본문은 이 한 곳에서만 만들고, 미리보기(`notice-preview`)와 발송(`notify`)이 같이 쓴다.
//
// ★변수는 승인 템플릿에 실제로 있는 것만 채운다 (2026-09-18 바로빌 실측 4건)
//   · 공통      #{고객명} #{품목} #{날짜}
//   · 대신화물만 #{터미널}
//   · ⚠ `#{송장번호}` 를 쓰는 승인 템플릿은 **하나도 없다**. 그래서 택배·화물도 출고 즉시 보낼 수 있다.
//     (한진은 승인 템플릿이 없어 문자로 나가고, 그 본문에는 송장을 넣는다.)
//   치환은 **템플릿에 있는 변수만 바뀌는 구조**라 여분의 치환은 무해하다 — 남겨 둔다.

import type { D1Database } from '@cloudflare/workers-types'

export interface NoticeVars {
  clientName: string
  itemSummary: string
  terminal: string
  trackingNumber: string
  deliveryMethod: string
  dateStr: string
}

/**
 * 템플릿 본문(또는 문자 기본 문구)에 변수를 채운다.
 * 등록 템플릿과 **글자 단위로 일치해야** 발송이 승인되므로, 본문 자체는 절대 손대지 않고 변수만 바꾼다.
 */
export function fillNoticeBody(templateBody: string, v: NoticeVars): string {
  return String(templateBody || '')
    .replace(/#\{고객명\}/g, v.clientName || '고객')
    .replace(/#\{품목\}/g, v.itemSummary || '제품')
    .replace(/#\{터미널\}/g, v.terminal || '')
    .replace(/#\{송장번호\}/g, v.trackingNumber || '')
    .replace(/#\{배송방법\}/g, v.deliveryMethod || '')
    .replace(/#\{배송\}/g, v.deliveryMethod || '')
    .replace(/#\{날짜\}/g, v.dateStr || '')
}

/**
 * 승인 템플릿이 없는 배송수단(한진택배)의 **문자 본문**.
 * 알림톡과 달리 자유 문구라 송장번호를 넣을 수 있다 — 한진을 「송장 입력 후」로 두는 이유가 이것이다.
 */
export function buildSmsNoticeBody(v: NoticeVars): string {
  const lines = [
    `[동산기획] ${v.clientName || '고객'}님, 주문하신 제품이 발송되었습니다.`,
    '',
    `■ 품목: ${v.itemSummary || '제품'}`,
    `■ 배송: ${v.deliveryMethod || '택배'}`,
  ]
  if (v.trackingNumber) lines.push(`■ 송장번호: ${v.trackingNumber}`)
  lines.push(`■ 출고일: ${v.dateStr}`, '', '문의: 042-523-1982')
  return lines.join('\n')
}

/**
 * 출고 품목 요약 — 「현수막 외 2건」.
 * #385: 카드 출고(card_id 경유)·주문단위 출고(order_item_id 직접) 두 경로를 COALESCE 로 함께 본다.
 */
export async function loadItemSummary(db: D1Database, shipmentId: number): Promise<string> {
  const { results } = await db.prepare(
    `SELECT COALESCE(cdoi.item_name, oi.item_name) AS item_name FROM shipment_items si
      LEFT JOIN cards cd ON si.card_id = cd.id
      LEFT JOIN order_items cdoi ON cd.order_item_id = cdoi.id
      LEFT JOIN order_items oi ON si.order_item_id = oi.id
     WHERE si.shipment_id = ?`
  ).bind(shipmentId).all<{ item_name: string | null }>()
  const names = (results || []).map((r) => r.item_name).filter(Boolean) as string[]
  if (names.length === 0) return '제품'
  return names.length === 1 ? names[0] : `${names[0]} 외 ${names.length - 1}건`
}
