import { Hono } from 'hono'
import type { Context } from 'hono'
import type { HonoEnv } from '../types/env'
import { authMiddleware, requireRole } from '../middleware/auth'
import { entityFilter, getEntityId } from '../utils/entityFilter'
import { BarobillSmsProvider } from '../services/barobillSms'
import { getEntityCorpNum } from '../utils/entitySettings'
import { BAROBILL_UNIT_COST_VAT_EXCL } from '../constants/barobillCodes'
import { resolveKakaoIdentity } from '../utils/kakaoIdentity'
import { resolveShipmentNotice, NOTICE_BLOCK_LABEL } from '../utils/shipmentNotice'
import { fillNoticeBody, buildSmsNoticeBody, loadItemSummary } from '../utils/shipmentNoticeBody'
import { interpretSendStatus, BAROBILL_MESSAGING_ERROR } from '../constants/barobillMessagingCodes'
import { checkBulkLimit } from '../services/messageBulkLimit'
import { applyAudienceGuards, describeGuardResult, recordBulkRecipients } from '../services/messageAudience'
import type { SMSMessage, ATSMessage } from '../services/barobillSms'
export type { SMSMessage, ATSMessage }

// ────────────────────────────────────────────────────────────────────────────
// D1 row types
// ────────────────────────────────────────────────────────────────────────────
interface SettingRow { setting_value: string | null }
interface EntityRow { business_reg_no: string | null }
interface SettingKVRow { setting_key: string; setting_value: string | null }
interface IdRow { id: number }
interface CountRow { total: number }
interface ClientRow { id: number; client_name: string | null; mobile: string | null }

interface ShipmentJoinRow {
  id: number; order_number: string | null; client_name: string | null;
  mobile: string | null; client_id: number | null;
  [key: string]: unknown;
}

interface TaxInvoiceJoinRow {
  id: number; invoice_number: string | null; client_name: string | null;
  mobile: string | null; client_id: number | null;
  [key: string]: unknown;
}

interface KakaoLogRow {
  id: number; receipt_num: string | null; template_code: string | null;
  receiver_num: string | null; receiver_name: string | null;
  related_type: string | null; related_id: number | null;
  client_id: number | null; client_name: string | null;
  content: string | null; status: string | null;
  result_code: string | null; result_message: string | null;
  channel: string | null; sent_by: number | null;
  user_name: string | null; created_at: string | null;
}

const kakaoRouter = new Hono<HonoEnv>()
kakaoRouter.use('/*', authMiddleware, requireRole('ADMIN', 'MANAGER'))

// ────────────────────────────────────────────────────────────────────────────
// 공통 헬퍼: 법인별 설정(entity_settings) 조회 — 없으면 null (전역 fallback)
// 바로빌 멀티계정: 파트너 단일 CERTKEY + 법인별 corpNum/senderId/채널.
// entity_settings 미존재(프로덕션 마이그 전)여도 안전하게 null 반환.
// ────────────────────────────────────────────────────────────────────────────
async function getEntitySetting(db: D1Database, entityId: number, key: string): Promise<string | null> {
  try {
    const row = await db.prepare(
      `SELECT setting_value FROM entity_settings WHERE entity_id = ? AND setting_key = ?`
    ).bind(entityId, key).first<{ setting_value: string }>()
    return row ? (row.setting_value ?? null) : null
  } catch {
    return null
  }
}

// ────────────────────────────────────────────────────────────────────────────
// 공통 헬퍼: 카카오 Provider 인스턴스 생성
// ────────────────────────────────────────────────────────────────────────────
export async function getKakaoProvider(c: Context<HonoEnv>): Promise<BarobillSmsProvider | null> {
  try {
    const db = c.env.DB
    const entityId = c.get('entityId') || 1

    const certKey = c.env.BAROBILL_CERT_KEY
    const certKeyProd = c.env.BAROBILL_CERT_KEY_PROD

    const testModeSetting = await db.prepare(
      `SELECT setting_value FROM settings WHERE setting_key = 'barobill_test_mode'`
    ).first<SettingRow>()
    const isTest = testModeSetting?.setting_value !== '0'

    // corpNum: getEntityCorpNum 유틸로 통일 (popbill_corp_num 우선 → business_reg_no → 전역).
    // 팩스·세금계산서와 동일 소스를 사용해 법인별 corpNum 일관성 보장.
    const brn = await getEntityCorpNum(db, entityId)

    const key = isTest ? certKey : certKeyProd
    if (!key || !brn) return null

    // senderId(바로빌 연동회원 ID): 법인별 필수 (동산 DONGSAN / 선명 sunm2596).
    // entity_settings 우선 → 전역 settings → 'DONGSAN'(entity1 하위호환).
    const entitySenderId = await getEntitySetting(db, entityId, 'barobill_sender_id')
    const senderIdRow = entitySenderId == null
      ? await db.prepare(
          "SELECT setting_value FROM settings WHERE setting_key = 'barobill_sender_id'"
        ).first<SettingRow>()
      : null
    const senderId = entitySenderId || senderIdRow?.setting_value || 'DONGSAN'
    return new BarobillSmsProvider({ certKey: key, corpNum: brn, isTest, senderId })
  } catch (error) {
    console.error('src/routes/kakao.ts getKakaoProvider error:', error)
    return null
  }
}

// ────────────────────────────────────────────────────────────────────────────
// 공통 헬퍼: 카카오 알림톡 설정 일괄 조회
// ────────────────────────────────────────────────────────────────────────────
export interface KakaoSettings {
  enabled: boolean
  senderNum: string
  channelId: string
  altSendType: string
}

export async function getKakaoSettings(db: D1Database, entityId?: number): Promise<KakaoSettings> {
  const { results } = await db.prepare(
    `SELECT setting_key, setting_value FROM settings
     WHERE setting_key IN ('kakao_enabled', 'kakao_sender_num', 'kakao_channel_id', 'kakao_alt_send_type')`
  ).all<SettingKVRow>()

  const map: Record<string, string> = {}
  for (const r of results) map[r.setting_key] = r.setting_value || ''

  // 법인별 override: entity_settings에 명시된 값만 덮어씀 (빈값/미존재 → 전역 fallback)
  if (entityId != null) {
    try {
      const { results: entRows } = await db.prepare(
        `SELECT setting_key, setting_value FROM entity_settings
         WHERE entity_id = ? AND setting_key IN ('kakao_enabled', 'kakao_sender_num', 'kakao_channel_id', 'kakao_alt_send_type')`
      ).bind(entityId).all<SettingKVRow>()
      const entMap: Record<string, string> = {}
      for (const r of entRows) entMap[r.setting_key] = r.setting_value || ''
      Object.assign(map, resolveKakaoIdentity(map, entMap))
      // ★정체성(번호·채널)은 법인 간에 상속하지 않는다 — 규칙 정본 = `utils/kakaoIdentity` (2026-09-18)
    } catch {
      // entity_settings 미존재 시 전역값 유지
    }
  }

  return {
    enabled: map['kakao_enabled'] === '1',
    senderNum: map['kakao_sender_num'] || '',
    channelId: map['kakao_channel_id'] || '',
    altSendType: map['kakao_alt_send_type'] || 'C',
  }
}

// ────────────────────────────────────────────────────────────────────────────
// GET /settings — 카카오 알림톡 설정 조회
// ────────────────────────────────────────────────────────────────────────────
kakaoRouter.get('/settings', async (c) => {
  try {
    const db = c.env.DB
    const entityId = c.get('entityId') || 1

    // 이메일·팩스는 전역 공유 설정
    const { results: settingRows } = await db.prepare(
      `SELECT setting_key, setting_value FROM settings
       WHERE setting_key IN (
         'email_enabled', 'email_from_name', 'email_from_address',
         'fax_enabled', 'fax_sender_num'
       )`
    ).all<SettingKVRow>()

    const settings: Record<string, string> = {}
    for (const row of settingRows) settings[row.setting_key] = row.setting_value || ''

    // 카카오는 법인별(entity_settings 우선 → 전역 fallback)
    const kakao = await getKakaoSettings(db, entityId)
    const entitySenderId = await getEntitySetting(db, entityId, 'barobill_sender_id')
    const senderId = entitySenderId
      || (await db.prepare("SELECT setting_value FROM settings WHERE setting_key = 'barobill_sender_id'").first<SettingRow>())?.setting_value
      || ''

    return c.json({
      success: true,
      data: {
        kakao_enabled: kakao.enabled ? '1' : '0',
        kakao_sender_num: kakao.senderNum,
        kakao_channel_id: kakao.channelId,
        kakao_alt_send_type: kakao.altSendType,
        barobill_sender_id: senderId,
        email_enabled: settings.email_enabled || '0',
        email_from_name: settings.email_from_name || '',
        email_from_address: settings.email_from_address || '',
        fax_enabled: settings.fax_enabled || '0',
        fax_sender_num: settings.fax_sender_num || '',
      }
    })
  } catch (error) {
    console.error('src/routes/kakao.ts GET /settings error:', error)
    return c.json({ success: false, error: '설정 조회 실패' }, 500)
  }
})

// ────────────────────────────────────────────────────────────────────────────
// PATCH /settings — 카카오 알림톡 설정 업데이트
// ────────────────────────────────────────────────────────────────────────────
kakaoRouter.patch('/settings', async (c) => {
  try {
    const db = c.env.DB
    const body = await c.req.json() as any // TODO: #17 — external request body

    // 입력 유효성 검사
    const kakaoEnabled = body.kakao_enabled
    const kakaoSenderNum = body.kakao_sender_num?.trim() || ''
    const kakaoChannelId = body.kakao_channel_id?.trim() || ''
    const kakaoAltSendType = body.kakao_alt_send_type || 'C'

    // 활성화 시 경고 (저장은 허용, 실제 발송 시점에 체크)
    let warning = ''
    if (kakaoEnabled === '1' || kakaoEnabled === true) {
      if (!kakaoSenderNum) warning = '발신번호가 비어있습니다. 발송 시 오류가 발생합니다.'
      else if (!kakaoChannelId) warning = '채널ID가 비어있습니다. 카카오톡 발송이 제한될 수 있습니다.'
    }

    // Settings 테이블에 upsert
    const entityId = c.get('entityId') || 1
    // kakao -> per-entity entity_settings (멀티계정: 동산/선명 분리)
    const kakaoToUpdate: { key: string, value: string }[] = [
      { key: 'kakao_enabled', value: kakaoEnabled ? '1' : '0' },
      { key: 'kakao_sender_num', value: kakaoSenderNum },
      { key: 'kakao_channel_id', value: kakaoChannelId },
      { key: 'kakao_alt_send_type', value: kakaoAltSendType },
    ]
    if ('barobill_sender_id' in body) {
      kakaoToUpdate.push({ key: 'barobill_sender_id', value: body.barobill_sender_id?.trim() || '' })
    }
    for (const s of kakaoToUpdate) {
      await db.prepare(
        `INSERT INTO entity_settings (entity_id, setting_key, setting_value) VALUES (?, ?, ?)
         ON CONFLICT(entity_id, setting_key) DO UPDATE SET setting_value = excluded.setting_value`
      ).bind(entityId, s.key, s.value).run()
    }
    // email/fax -> global settings (공유)
    const settingsToUpdate: { key: string, value: string }[] = []

    // 이메일 설정
    if ('email_enabled' in body) settingsToUpdate.push({ key: 'email_enabled', value: body.email_enabled === '1' || body.email_enabled === true ? '1' : '0' })
    if ('email_from_name' in body) settingsToUpdate.push({ key: 'email_from_name', value: body.email_from_name?.trim() || '' })
    if ('email_from_address' in body) settingsToUpdate.push({ key: 'email_from_address', value: body.email_from_address?.trim() || '' })

    // 팩스 설정
    if ('fax_enabled' in body) settingsToUpdate.push({ key: 'fax_enabled', value: body.fax_enabled === '1' || body.fax_enabled === true ? '1' : '0' })
    if ('fax_sender_num' in body) settingsToUpdate.push({ key: 'fax_sender_num', value: body.fax_sender_num?.trim() || '' })

    for (const setting of settingsToUpdate) {
      const existing = await db.prepare(
        `SELECT id FROM settings WHERE setting_key = ?`
      ).bind(setting.key).first<IdRow>()

      if (existing) {
        await db.prepare(
          `UPDATE settings SET setting_value = ? WHERE setting_key = ?`
        ).bind(setting.value, setting.key).run()
      } else {
        await db.prepare(
          `INSERT INTO settings (setting_key, setting_value) VALUES (?, ?)`
        ).bind(setting.key, setting.value).run()
      }
    }

    return c.json({ success: true, data: { updated: true, warning } })
  } catch (error) {
    console.error('src/routes/kakao.ts PATCH /settings error:', error)
    return c.json({ success: false, error: '설정 업데이트 실패' }, 500)
  }
})

// ────────────────────────────────────────────────────────────────────────────
// GET /templates — 팝빌 알림톡 템플릿 목록 조회
// ────────────────────────────────────────────────────────────────────────────
kakaoRouter.get('/templates', async (c) => {
  try {
    const provider = await getKakaoProvider(c)
    if (!provider) {
      return c.json({ success: false, error: '바로빌 연동이 설정되지 않았습니다.' }, 400)
    }

    const templates = await provider.listATSTemplate()
    return c.json({ success: true, data: templates })
  } catch (error) {
    console.error('src/routes/kakao.ts GET /templates error:', error)
    return c.json({ success: false, error: '템플릿 조회 실패' }, 500)
  }
})

// ────────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────
// 배송 알림 — 미리보기 / 발송 (단계 2, 2026-09-18)
//   창구는 둘(주문 목록 일괄 출고 확인창 · 확정 대기 알림 버튼)인데 **엔진은 여기 하나**다.
//   창구마다 발송 로직을 붙이면 「판정이 두 벌」이 또 생긴다(P17·P25 가 그것이었다).
//
//   ★미리보기와 발송이 **같은 함수로 본문을 만든다**(`utils/shipmentNoticeBody`) —
//     화면에서 확인한 것과 고객에게 간 것이 다르면 확인 절차 자체가 무의미해진다.
//   ★상한은 기존 체계를 그대로 쓴다(`messageBulkLimit` #584, 알림톡 500·문자 500).
//     바로빌은 `SendATKakaotalks` 로 **한 번의 호출에 수신자 배열**을 받고 접수번호도 건별로 준다 —
//     건당 SOAP 1회가 아니므로 subrequest 한도와 무관하다.
// ─────────────────────────────────────────────────

interface NoticeTargetRow {
  order_id: number
  order_number: string
  delivery_method: string | null
  entity_id: number | null
  client_id: number | null
  client_name: string | null
  mobile: string | null
  shipment_id: number
  tracking_number: string | null
  receiver_address: string | null
  notified: number
}

/** 주문 id 목록 → 알림 판정에 필요한 행(대표 출고 기준). 합포장 부속은 애초에 제외된다. */
async function loadNoticeTargets(c: Context<HonoEnv>, orderIds: number[]): Promise<NoticeTargetRow[]> {
  const ef = entityFilter(c, 'o')
  const rows: NoticeTargetRow[] = []
  for (let i = 0; i < orderIds.length; i += 80) {   // D1 바인드 한도
    const chunk = orderIds.slice(i, i + 80)
    const ph = chunk.map(() => '?').join(',')
    const { results } = await c.env.DB.prepare(`
      SELECT o.id AS order_id, o.order_number, o.delivery_method, o.entity_id,
             cl.id AS client_id, cl.client_name, cl.mobile,
             sp.id AS shipment_id, sp.tracking_number, sp.receiver_address,
             CASE WHEN EXISTS (
               SELECT 1 FROM kakao_send_logs kl
                WHERE kl.related_type = 'shipments' AND kl.related_id = sp.id AND kl.status = 'SUCCESS'
             ) THEN 1 ELSE 0 END AS notified
        FROM orders o
        JOIN shipments sp ON sp.order_id = o.id AND sp.merged_into_id IS NULL
                         AND COALESCE(sp.status, '') <> 'CANCELLED'
        LEFT JOIN clients cl ON cl.id = o.client_id
       WHERE o.id IN (${ph})${ef.clause}
    `).bind(...chunk, ...ef.params).all<NoticeTargetRow>()
    rows.push(...(results || []))
  }
  return rows
}

/** 승인 템플릿 본문 맵 — 요청당 1회만 조회한다(SOAP 왕복이라 건별로 부르면 느리다). */
async function loadTemplateBodies(provider: BarobillSmsProvider): Promise<Record<string, string>> {
  try {
    const list = await provider.listATSTemplate()
    const map: Record<string, string> = {}
    for (const t of list || []) {
      const key = (t.templateName || t.templateCode || '').trim()
      if (key) map[key] = t.template || ''
    }
    return map
  } catch {
    return {}   // 조회 실패 시 폴백 본문으로 미리보기는 계속 보여 준다
  }
}

interface NoticeResolved {
  row: NoticeTargetRow
  decision: ReturnType<typeof resolveShipmentNotice>
  body: string
  cost: number
}

/** 행 + 템플릿 → 발송 판정과 본문. 미리보기·발송이 공유한다. */
async function buildNotice(
  db: HonoEnv['Bindings']['DB'],
  row: NoticeTargetRow,
  templates: Record<string, string>,
  dateStr: string
): Promise<NoticeResolved> {
  const decision = resolveShipmentNotice({
    deliveryMethod: row.delivery_method,
    hasMobile: !!(row.mobile || '').trim(),
    trackingNumber: row.tracking_number,
    alreadySent: Number(row.notified) === 1,
  })
  const vars = {
    clientName: row.client_name || '고객',
    itemSummary: await loadItemSummary(db, row.shipment_id),
    terminal: row.receiver_address || '',
    trackingNumber: row.tracking_number || '',
    deliveryMethod: (row.delivery_method || '').trim(),
    dateStr,
  }
  let body = ''
  if (decision.channel === 'kakao' && decision.template) {
    body = fillNoticeBody(templates[decision.template] || '', vars)
  } else if (decision.channel === 'sms') {
    body = buildSmsNoticeBody(vars)
  }
  const cost = decision.channel === 'kakao'
    ? BAROBILL_UNIT_COST_VAT_EXCL.alimtalk
    : decision.channel === 'sms' ? BAROBILL_UNIT_COST_VAT_EXCL.lms : 0
  return { row, decision, body, cost }
}

// POST /shipment-notice/preview — 보낼 수 있는가 · 본문은 무엇인가 (발송하지 않는다)
kakaoRouter.post('/shipment-notice/preview', async (c) => {
  try {
    const { order_ids } = await c.req.json<{ order_ids: number[] }>()
    const ids = (order_ids || []).map(Number).filter((n) => Number.isFinite(n) && n > 0)
    if (ids.length === 0) return c.json({ success: true, data: { items: [], summary: { sendable: 0, cost: 0 } } })

    const rows = await loadNoticeTargets(c, ids)
    const provider = await getKakaoProvider(c)
    const templates = provider ? await loadTemplateBodies(provider) : {}
    const dateRow = await c.env.DB.prepare(`SELECT date('now','+9 hours') AS d`).first<{ d: string }>()
    const dateStr = dateRow?.d || ''

    const items = []
    for (const row of rows) {
      const n = await buildNotice(c.env.DB, row, templates, dateStr)
      items.push({
        order_id: row.order_id,
        order_number: row.order_number,
        client_name: row.client_name,
        mobile: row.mobile,
        delivery_method: row.delivery_method,
        can_send: n.decision.canSendNow,
        is_target: n.decision.isTarget,
        blocked_reason: n.decision.blockedReason,
        blocked_label: n.decision.blockedReason ? NOTICE_BLOCK_LABEL[n.decision.blockedReason] : null,
        channel: n.decision.channel,
        template: n.decision.template,
        preview: n.decision.canSendNow ? n.body : '',
        cost: n.decision.canSendNow ? n.cost : 0,
      })
    }
    const sendable = items.filter((i) => i.can_send)
    return c.json({
      success: true,
      data: {
        items,
        summary: {
          sendable: sendable.length,
          cost: sendable.reduce((s, i) => s + i.cost, 0),
          // 화면 요약용 분류 — 「송장 대기」와 「대상 아님」은 전혀 다른 상태다
          waiting_tracking: items.filter((i) => i.blocked_reason === 'needs_tracking').length,
          not_target: items.filter((i) => i.blocked_reason === 'not_target').length,
          no_mobile: items.filter((i) => i.blocked_reason === 'no_mobile').length,
          already_sent: items.filter((i) => i.blocked_reason === 'already_sent').length,
        },
      },
    })
  } catch (error) {
    console.error('src/routes/kakao.ts POST /shipment-notice/preview error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// POST /shipment-notice/send — 실제 발송. 보낼 수 있는 건만 보내고 나머지는 사유와 함께 돌려준다.
kakaoRouter.post('/shipment-notice/send', requireRole('ADMIN', 'MANAGER'), async (c) => {
  try {
    const user = c.get('user')
    const { order_ids } = await c.req.json<{ order_ids: number[] }>()
    const ids = (order_ids || []).map(Number).filter((n) => Number.isFinite(n) && n > 0)
    if (ids.length === 0) return c.json({ success: false, error: '발송할 주문을 선택하세요.' }, 400)

    const settings = await getKakaoSettings(c.env.DB, getEntityId(c) || 1)
    if (!settings.enabled) return c.json({ success: false, error: '카카오톡이 비활성화되어 있습니다.' }, 400)
    if (!settings.senderNum) return c.json({ success: false, error: '발신번호가 설정되지 않았습니다. (법인 설정 확인)' }, 400)
    const provider = await getKakaoProvider(c)
    if (!provider) return c.json({ success: false, error: '바로빌 연동이 설정되지 않았습니다.' }, 400)

    const rows = await loadNoticeTargets(c, ids)
    const templates = await loadTemplateBodies(provider)
    const dateRow = await c.env.DB.prepare(`SELECT date('now','+9 hours') AS d`).first<{ d: string }>()
    const dateStr = dateRow?.d || ''

    const resolved: NoticeResolved[] = []
    for (const row of rows) resolved.push(await buildNotice(c.env.DB, row, templates, dateStr))
    const sendable = resolved.filter((r) => r.decision.canSendNow)
    const skipped = resolved.filter((r) => !r.decision.canSendNow).map((r) => ({
      order_id: r.row.order_id, order_number: r.row.order_number,
      status: 'SKIPPED', reason: r.decision.blockedReason,
      reason_label: r.decision.blockedReason ? NOTICE_BLOCK_LABEL[r.decision.blockedReason] : null,
    }))
    if (sendable.length === 0) return c.json({ success: true, data: { sent: 0, failed: 0, results: skipped } })

    // 상한 — 기존 대량 발송 가드를 그대로 쓴다(채널별 settings 로 조정 가능).
    const kakaoCount = sendable.filter((r) => r.decision.channel === 'kakao').length
    const smsCount = sendable.length - kakaoCount
    for (const [ch, n] of [['kakao', kakaoCount], ['sms', smsCount]] as const) {
      if (n > 0) {
        const over = await checkBulkLimit(c.env.DB, ch, n)
        if (over) return c.json({ success: false, error: over }, 400)
      }
    }

    // 템플릿별로 묶는다 — `SendATKakaotalks` 는 호출당 템플릿 1개이고 수신자는 배열이다.
    const groups = new Map<string, NoticeResolved[]>()
    for (const r of sendable) {
      const key = r.decision.channel === 'kakao' ? 'K:' + r.decision.template : 'S:'
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(r)
    }

    const results: Array<Record<string, unknown>> = [...skipped]
    let sent = 0, failed = 0
    const logStmts: ReturnType<typeof c.env.DB.prepare>[] = []

    for (const [key, list] of groups) {
      const isKakao = key.startsWith('K:')
      const templateCode = isKakao ? key.slice(2) : (list.length && list[0].body.length > 90 ? 'LMS' : 'SMS')
      let per: Array<{ ok: boolean; receiptNum: string; code: number }> = []
      let bulkErr = ''
      try {
        if (isKakao) {
          const res = await provider.sendATS({
            templateCode: key.slice(2),
            snd: settings.senderNum,
            content: list[0].body,
            altSendType: settings.altSendType,
            messages: list.map((r) => ({
              rcv: (r.row.mobile || '').trim(), rcvnm: r.row.client_name || '고객',
              msg: r.body, altmsg: r.body,
            })),
          })
          per = res.results && res.results.length === list.length
            ? res.results
            : list.map(() => ({ ok: !!res.receiptNum, receiptNum: res.receiptNum, code: res.code }))
        } else {
          // 문자는 본문이 건마다 다르므로 단건 루프(한진 한 축뿐이라 건수가 적다).
          for (const r of list) {
            const one = await provider.sendSMS({
              snd: settings.senderNum, content: r.body,
              messages: [{ rcv: (r.row.mobile || '').trim(), rcvnm: r.row.client_name || '고객' }],
            })
            per.push({ ok: !!one.receiptNum, receiptNum: one.receiptNum, code: one.code })
          }
        }
      } catch (e) {
        bulkErr = e instanceof Error ? e.message : '발송 오류'
        per = list.map(() => ({ ok: false, receiptNum: '', code: 0 }))
      }

      list.forEach((r, i) => {
        const p = per[i] || { ok: false, receiptNum: '', code: 0 }
        if (p.ok) sent++; else failed++
        results.push({
          order_id: r.row.order_id, order_number: r.row.order_number,
          status: p.ok ? 'SUCCESS' : 'FAILED',
          channel: r.decision.channel, template: r.decision.template,
          receipt_num: p.receiptNum,
          error: p.ok ? null : (bulkErr || BAROBILL_MESSAGING_ERROR[String(p.code)] || '발송 실패'),
        })
        logStmts.push(c.env.DB.prepare(
          `INSERT INTO kakao_send_logs (
             receipt_num, template_code, receiver_num, receiver_name,
             related_type, related_id, client_id, content, alt_content,
             status, result_code, result_message, sent_by, channel, entity_id, message_type
           ) VALUES (?, ?, ?, ?, 'shipments', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'INFO')`
        ).bind(
          p.receiptNum || '', templateCode, (r.row.mobile || '').trim(), r.row.client_name,
          r.row.shipment_id, r.row.client_id, r.body, r.body,
          p.ok ? 'SUCCESS' : 'FAILED', p.code,
          p.ok ? `접수완료 (${p.receiptNum})` : (bulkErr || BAROBILL_MESSAGING_ERROR[String(p.code)] || '발송 실패'),
          user?.id || null, isKakao ? 'kakao' : 'sms', r.row.entity_id || getEntityId(c) || 1
        ))
      })
    }

    for (let i = 0; i < logStmts.length; i += 40) await c.env.DB.batch(logStmts.slice(i, i + 40))
    return c.json({ success: true, data: { sent, failed, results } })
  } catch (error) {
    console.error('src/routes/kakao.ts POST /shipment-notice/send error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// ─────────────────────────────────────────────────
// GET /stats/monthly — 월별 발송 건수·비용 집계 (2026-09-18)
//   왜: 발송 로그는 전건 남는데 **합산해 보여주는 곳이 없었다**. 「한 달에 얼마 나가나」를
//       추정으로만 말할 수 있었고, 추정이 맞는지 나중에 검산할 방법도 없었다.
//   비용 = 건수 × 채널 단가(계약 상수 `BAROBILL_UNIT_COST_VAT_EXCL`, 부가세 별도).
//   ⚠️ 성공 건만 센다 — 실패·스킵은 과금되지 않는다(건수는 따로 돌려준다).
// ─────────────────────────────────────────────────
kakaoRouter.get('/stats/monthly', async (c) => {
  try {
    const months = Math.min(Math.max(Number(c.req.query('months')) || 6, 1), 24)
    const ef = entityFilter(c)
    const { results } = await c.env.DB.prepare(`
      SELECT substr(created_at, 1, 7) AS ym,
             COALESCE(NULLIF(channel, ''), 'kakao') AS channel,
             CASE WHEN UPPER(COALESCE(template_code, '')) = 'LMS' THEN 1 ELSE 0 END AS is_lms,
             SUM(CASE WHEN status = 'SUCCESS' THEN 1 ELSE 0 END) AS sent,
             SUM(CASE WHEN status = 'FAILED' THEN 1 ELSE 0 END) AS failed,
             SUM(CASE WHEN status = 'SKIPPED' THEN 1 ELSE 0 END) AS skipped,
             SUM(CASE WHEN COALESCE(related_type, '') = 'shipments' AND status = 'SUCCESS' THEN 1 ELSE 0 END) AS shipment_sent
        FROM kakao_send_logs
       WHERE created_at >= date('now', '+9 hours', '-' || ? || ' months')
         ${ef.clause}
       GROUP BY ym, channel, is_lms
       ORDER BY ym DESC
    `).bind(months, ...ef.params).all<{
      ym: string; channel: string; is_lms: number
      sent: number; failed: number; skipped: number; shipment_sent: number
    }>()

    const uc = BAROBILL_UNIT_COST_VAT_EXCL
    const unitCost = (channel: string, isLms: number): number => {
      switch (channel) {
        case 'kakao': return uc.alimtalk
        case 'sms': return isLms ? uc.lms : uc.sms
        case 'mms': return uc.mms
        case 'fax': return uc.fax
        default: return 0   // email 은 Resend 정액이라 건당 과금이 없다
      }
    }

    // 월 단위로 접는다 — 화면은 「9월 412건 2,884원」 한 줄이면 된다.
    const byMonth = new Map<string, { ym: string; sent: number; failed: number; skipped: number; shipment_sent: number; cost: number; channels: Record<string, number> }>()
    for (const r of results || []) {
      const m = byMonth.get(r.ym) || { ym: r.ym, sent: 0, failed: 0, skipped: 0, shipment_sent: 0, cost: 0, channels: {} }
      m.sent += r.sent || 0
      m.failed += r.failed || 0
      m.skipped += r.skipped || 0
      m.shipment_sent += r.shipment_sent || 0
      m.cost += (r.sent || 0) * unitCost(r.channel, r.is_lms)
      // 0건 채널은 싣지 않는다 — 화면에 「lms 0」 같은 빈 항목이 뜬다(실패만 있던 달).
      if ((r.sent || 0) > 0) {
        const label = r.channel === 'sms' && r.is_lms ? 'lms' : r.channel
        m.channels[label] = (m.channels[label] || 0) + (r.sent || 0)
      }
      byMonth.set(r.ym, m)
    }
    const rows = Array.from(byMonth.values()).sort((a, b) => (a.ym < b.ym ? 1 : -1))
    return c.json({
      success: true,
      data: {
        months: rows,
        unit_cost: { alimtalk: uc.alimtalk, sms: uc.sms, lms: uc.lms, mms: uc.mms, fax: uc.fax },
        note: '비용 = 성공 건수 × 채널 단가(부가세 별도). 이메일은 건당 과금 없음.',
      },
    })
  } catch (error) {
    console.error('src/routes/kakao.ts GET /stats/monthly error:', error)
    return c.json({ success: false, error: '서버 오류가 발생했습니다.' }, 500)
  }
})

// GET /balance — 포인트 잔액(실시간) + 발송 단가(정적 상수)
//   #466: 단가는 계약 기준 정적값이라 매 로드 SOAP fan-out(5콜) 제거 → 상수 반환.
//         잔액만 라이브(getBalance 2콜). 라이브 단가 갱신은 GET /unit-cost('단가 새로고침' 전용).
// ────────────────────────────────────────────────────────────────────────────
kakaoRouter.get('/balance', async (c) => {
  try {
    const provider = await getKakaoProvider(c)
    if (!provider) {
      return c.json({ success: false, error: '바로빌 연동이 설정되지 않았습니다.' }, 400)
    }

    const balance = await provider.getBalance()
    const uc = BAROBILL_UNIT_COST_VAT_EXCL

    return c.json({
      success: true,
      data: {
        remain_point: balance.remainPoint,
        partner_point: balance.partnerPoint,
        // 발송 단가 — 부가세 별도(정적 상수)
        unit_cost_alimtalk: uc.alimtalk,
        unit_cost_kko_image: uc.kkoImage,
        unit_cost_sms: uc.sms,
        unit_cost_lms: uc.lms,
        unit_cost_mms: uc.mms,
        unit_cost_fax: uc.fax,
        unit_cost_source: 'static'
      }
    })
  } catch (error) {
    console.error('src/routes/kakao.ts GET /balance error:', error)
    return c.json({ success: false, error: '잔액 조회 실패' }, 500)
  }
})

// ────────────────────────────────────────────────────────────────────────────
// GET /sms-diag — 문자(SMS/LMS/MMS) 발송 진단.
//   발신번호 사전등록 목록 + (code 지정 시) 바로빌 오류코드 한글 사유.
//   오류코드 문서가 SPA라 브라우저 없이는 못 읽는 문제를 API로 대체 — 발송 실패 원인 규명용.
// ────────────────────────────────────────────────────────────────────────────
kakaoRouter.get('/sms-diag', async (c) => {
  try {
    const provider = await getKakaoProvider(c)
    if (!provider) {
      return c.json({ success: false, error: '바로빌 연동이 설정되지 않았습니다.' }, 400)
    }
    const settings = await getKakaoSettings(c.env.DB, c.get('entityId') || 1)
    const codeParam = c.req.query('code')
    const code = codeParam ? parseInt(codeParam, 10) : null

    let fromNumbers: Array<{ number: string; validDate: string }> = []
    let fromNumbersError = ''
    try {
      fromNumbers = await provider.listFromNumbers()
    } catch (e) {
      fromNumbersError = e instanceof Error ? e.message : String(e)
    }

    const senderNorm = (settings.senderNum || '').replace(/-/g, '')
    return c.json({
      success: true,
      data: {
        sender_num: settings.senderNum,
        registered_numbers: fromNumbers,
        sender_registered: fromNumbers.some(n => n.number.replace(/-/g, '') === senderNorm),
        from_numbers_error: fromNumbersError || undefined,
        error_code: code,
        error_string: code != null && Number.isFinite(code) ? await provider.getErrString(code) : undefined,
      }
    })
  } catch (error) {
    console.error('src/routes/kakao.ts GET /sms-diag error:', error)
    return c.json({ success: false, error: '문자 발송 진단 실패' }, 500)
  }
})

// ────────────────────────────────────────────────────────────────────────────
// GET /unit-cost — 라이브 발송 단가 조회(바로빌 SOAP 5콜). '단가 새로고침' 전용.
//   #466: 상시 조회는 상수(/balance)로, 실측 대조가 필요할 때만 명시적으로 이 엔드포인트 호출.
// ────────────────────────────────────────────────────────────────────────────
kakaoRouter.get('/unit-cost', async (c) => {
  try {
    const provider = await getKakaoProvider(c)
    if (!provider) {
      return c.json({ success: false, error: '바로빌 연동이 설정되지 않았습니다.' }, 400)
    }
    const uc = await provider.getUnitCost()
    return c.json({
      success: true,
      data: {
        unit_cost_alimtalk: uc.alimtalk,
        unit_cost_kko_image: uc.kkoImage,
        unit_cost_sms: uc.sms,
        unit_cost_lms: uc.lms,
        unit_cost_mms: uc.mms,
        unit_cost_fax: uc.fax,
        unit_cost_source: 'live'
      }
    })
  } catch (error) {
    console.error('src/routes/kakao.ts GET /unit-cost error:', error)
    return c.json({ success: false, error: '단가 조회 실패' }, 500)
  }
})

// ────────────────────────────────────────────────────────────────────────────
// POST /send — 알림톡 수동 발송
// ────────────────────────────────────────────────────────────────────────────
kakaoRouter.post('/send', async (c) => {
  try {
    const db = c.env.DB
    const body = await c.req.json() as any // TODO: #17 — external request body
    const userId = c.get('user').id

    // 필수 파라미터 확인
    const templateCode = body.template_code?.trim()
    const receiverNum = body.receiver_num?.trim()
    const receiverName = body.receiver_name?.trim()
    const content = body.content?.trim()

    if (!templateCode || !receiverNum || !content) {
      return c.json(
        { success: false, error: '필수 항목(template_code, receiver_num, content)을 입력해주세요.' },
        400
      )
    }

    // 카카오 설정 일괄 조회
    const kakaoSettings = await getKakaoSettings(db, c.get('entityId') || 1)
    if (!kakaoSettings.enabled) {
      return c.json({ success: false, error: '카카오톡이 비활성화되어 있습니다.' }, 400)
    }
    if (!kakaoSettings.senderNum) {
      return c.json({ success: false, error: '발신번호가 설정되지 않았습니다.' }, 400)
    }

    // 바로빌 Provider 생성
    const provider = await getKakaoProvider(c)
    if (!provider) {
      return c.json({ success: false, error: '바로빌 연동이 설정되지 않았습니다.' }, 400)
    }

    // 알림톡 발송
    const sendResult = await provider.sendATS({
      templateCode,
      snd: kakaoSettings.senderNum,
      content,
      altSendType: kakaoSettings.altSendType,
      messages: [{
        rcv: receiverNum,
        rcvnm: receiverName || '고객',
        msg: content,
        altmsg: body.alt_content || content,
        btns: body.buttons || undefined,
      }]
    })

    // kakao_send_logs에 저장
    const clientId = body.client_id || null
    const relatedType = body.related_type || null
    const relatedId = body.related_id || null

    const insertResult = await db.prepare(
      `INSERT INTO kakao_send_logs (
        receipt_num, template_code, receiver_num, receiver_name,
        related_type, related_id, client_id, content, alt_content,
        status, result_code, result_message, sent_by, entity_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      sendResult.receiptNum,
      templateCode,
      receiverNum,
      receiverName || null,
      relatedType,
      relatedId,
      clientId,
      content,
      body.alt_content || content,
      sendResult.receiptNum ? 'SUCCESS' : 'FAILED',
      sendResult.code,
      sendResult.message,
      userId,
      getEntityId(c)
    ).run()

    return c.json({
      success: true,
      data: {
        log_id: insertResult.meta.last_row_id,
        receipt_num: sendResult.receiptNum,
        code: sendResult.code,
        message: sendResult.message,
        status: sendResult.receiptNum ? 'SUCCESS' : 'FAILED'
      }
    })
  } catch (error) {
    console.error('src/routes/kakao.ts POST /send error:', error)
    return c.json({ success: false, error: '카카오톡 발송 실패' }, 500)
  }
})

// ────────────────────────────────────────────────────────────────────────────
// POST /send-shipment — 출고 알림톡 발송
// ────────────────────────────────────────────────────────────────────────────
kakaoRouter.post('/send-shipment', async (c) => {
  try {
    const db = c.env.DB
    const body = await c.req.json() as any // TODO: #17 — external request body
    const userId = c.get('user').id

    const shipmentId = body.shipment_id
    if (!shipmentId) {
      return c.json({ success: false, error: 'shipment_id는 필수입니다.' }, 400)
    }

    // 출고 정보 조회
    const sef = entityFilter(c, 'o')
    const shipment = await db.prepare(
      `SELECT s.*, o.order_number, o.delivery_method, c.client_name, c.mobile
       FROM shipments s
       LEFT JOIN orders o ON s.order_id = o.id
       LEFT JOIN clients c ON o.client_id = c.id
       WHERE s.id = ?${sef.clause}`
    ).bind(shipmentId, ...sef.params).first<ShipmentJoinRow>()

    if (!shipment) {
      return c.json({ success: false, error: '출고 정보를 찾을 수 없습니다.' }, 400)
    }

    // 합포장 dedup (배송 후속 P4): 부속 shipment는 발송 스킵 — 알림 정본 = 대표 1건
    if (shipment.merged_into_id) {
      return c.json({ success: true, data: { status: 'SKIPPED', reason: 'merged_child', message: '합포장 부속 출고 — 대표 출고 건으로만 발송됩니다.' } })
    }

    if (!shipment.mobile) {
      return c.json({ success: false, error: '거래처 휴대폰 번호가 없습니다.' }, 400)
    }

    // 카카오 설정 일괄 조회
    const kakaoSettings = await getKakaoSettings(db, c.get('entityId') || 1)
    if (!kakaoSettings.enabled) {
      return c.json({ success: false, error: '카카오톡이 비활성화되어 있습니다.' }, 400)
    }
    if (!kakaoSettings.senderNum) {
      return c.json({ success: false, error: '발신번호가 설정되지 않았습니다.' }, 400)
    }

    // #alimtalk Phase2: 멱등 가드 — 이미 해당 출고로 발송 성공 로그 있으면 재발송 skip
    const dup = await db.prepare(
      `SELECT 1 FROM kakao_send_logs WHERE related_type = 'shipments' AND related_id = ? AND status = 'SUCCESS' LIMIT 1`
    ).bind(shipmentId).first()
    if (dup) {
      return c.json({ success: true, data: { status: 'SKIPPED', reason: 'already_sent', message: '이미 발송됨(멱등 skip)' } })
    }

    // #alimtalk Phase2: 템플릿 코드 해석 — 미지정 시 delivery_method → 승인 템플릿명(autoCodeMap과 동일).
    // 한진택배=템플릿 미등록(D3=가) / 기타 미매핑 → 발송 skip + 로그(자동발송 미동작 추적)
    let templateCode: string = body.template_code || ''
    const deliveryMethod = ((shipment.delivery_method as string) || '').trim()
    if (!templateCode) {
      // 2026-09-18: 판정 정본 = `utils/shipmentNotice`. 종전엔 여기 하드코딩 맵이 따로 있어
      //   화면 기본값(DB·섹션 축)과 어긋났다(퀵 섹션에 「방문 수령 준비 완료」가 걸려 있었다).
      const decision = resolveShipmentNotice({
        deliveryMethod,
        hasMobile: !!shipment.mobile,
        trackingNumber: shipment.tracking_number as string | null,
      })
      const resolved = decision.template || ''
      if (!resolved) {
        await db.prepare(
          `INSERT INTO kakao_send_logs (
            receipt_num, template_code, receiver_num, receiver_name,
            related_type, related_id, client_id, content, alt_content,
            status, result_code, result_message, sent_by, entity_id
          ) VALUES ('', ?, ?, ?, 'shipments', ?, ?, '', '', 'SKIPPED', 0, ?, ?, ?)`
        ).bind(
          deliveryMethod || '(미지정)', shipment.mobile, shipment.client_name,
          shipmentId, shipment.client_id,
          `자동발송 skip: ${NOTICE_BLOCK_LABEL[decision.blockedReason || 'unknown_method']}(${deliveryMethod || '미지정'})`,
          userId, getEntityId(c)
        ).run()
        return c.json({ success: true, data: { status: 'SKIPPED', reason: decision.blockedReason || 'unmapped_delivery_method', delivery_method: deliveryMethod } })
      }
      templateCode = resolved
    }

    // 바로빌 Provider 생성
    const provider = await getKakaoProvider(c)
    if (!provider) {
      return c.json({ success: false, error: '바로빌 연동이 설정되지 않았습니다.' }, 400)
    }

    // #alimtalk Phase2: 발송 내용 — 본문 미지정 시 등록 템플릿 본문 조회 + 변수 치환(등록본과 글자단위 일치 필수)
    // 본문 생성은 `utils/shipmentNoticeBody` 한 곳이다 — 미리보기(`/shipment-notice/preview`)·
    //   일괄 발송(`/shipment-notice/send`)·이 단건 경로가 **같은 함수**를 쓴다.
    //   각자 만들면 「화면에서 확인한 것」과 「고객에게 간 것」이 갈린다(게이트 test:shipment-notice ⑧).
    let content: string = body.content || ''
    if (!content) {
      let tplBody = ''
      try {
        const templates = await provider.listATSTemplate()
        const tpl = templates.find(t => t.templateCode === templateCode || t.templateName === templateCode)
        tplBody = tpl?.template || ''
      } catch (_e) { /* 조회 실패 시 폴백 본문 */ }
      const dateRow = await db.prepare(`SELECT date('now','+9 hours') as d`).first<{ d: string }>()
      const vars = {
        clientName: shipment.client_name || '고객',
        itemSummary: await loadItemSummary(db, shipmentId as number),
        terminal: (shipment.receiver_address as string) || '',
        trackingNumber: (shipment.tracking_number as string) || '',
        deliveryMethod,
        dateStr: dateRow?.d || '',
      }
      content = tplBody ? fillNoticeBody(tplBody, vars) : buildSmsNoticeBody(vars)
    }

    // 알림톡 발송
    const sendResult = await provider.sendATS({
      templateCode,
      snd: kakaoSettings.senderNum,
      content,
      altSendType: kakaoSettings.altSendType,
      messages: [{
        rcv: shipment.mobile,
        rcvnm: shipment.client_name || '고객',
        msg: content,
        altmsg: content,
      }]
    })

    // kakao_send_logs에 저장
    const insertResult = await db.prepare(
      `INSERT INTO kakao_send_logs (
        receipt_num, template_code, receiver_num, receiver_name,
        related_type, related_id, client_id, content, alt_content,
        status, result_code, result_message, sent_by, entity_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      sendResult.receiptNum,
      templateCode,
      shipment.mobile,
      shipment.client_name,
      'shipments',
      shipmentId,
      shipment.client_id,
      content,
      content,
      sendResult.receiptNum ? 'SUCCESS' : 'FAILED',
      sendResult.code,
      sendResult.message,
      userId,
      getEntityId(c)
    ).run()

    return c.json({
      success: true,
      data: {
        log_id: insertResult.meta.last_row_id,
        receipt_num: sendResult.receiptNum,
        code: sendResult.code,
        message: sendResult.message,
        status: sendResult.receiptNum ? 'SUCCESS' : 'FAILED'
      }
    })
  } catch (error) {
    console.error('src/routes/kakao.ts POST /send-shipment error:', error)
    return c.json({ success: false, error: '출고 카카오톡 발송 실패' }, 500)
  }
})

// ────────────────────────────────────────────────────────────────────────────
// POST /send-tax-invoice — 세금계산서 알림톡 발송
// ────────────────────────────────────────────────────────────────────────────
kakaoRouter.post('/send-tax-invoice', async (c) => {
  try {
    const db = c.env.DB
    const body = await c.req.json() as any // TODO: #17 — external request body
    const userId = c.get('user').id

    const taxInvoiceId = body.tax_invoice_id
    if (!taxInvoiceId) {
      return c.json({ success: false, error: 'tax_invoice_id는 필수입니다.' }, 400)
    }

    // 세금계산서 정보 조회
    const tief = entityFilter(c, 'ti')
    const taxInvoice = await db.prepare(
      `SELECT ti.*, c.client_name, c.mobile
       FROM tax_invoices ti
       LEFT JOIN clients c ON ti.buyer_client_id = c.id
       WHERE ti.id = ?${tief.clause}`
    ).bind(taxInvoiceId, ...tief.params).first<TaxInvoiceJoinRow>()

    if (!taxInvoice) {
      return c.json({ success: false, error: '세금계산서를 찾을 수 없습니다.' }, 400)
    }

    if (!taxInvoice.mobile) {
      return c.json({ success: false, error: '거래처 휴대폰 번호가 없습니다.' }, 400)
    }

    // 템플릿 코드 확인
    const templateCode = body.template_code
    if (!templateCode) {
      return c.json({ success: false, error: 'template_code는 필수입니다.' }, 400)
    }

    // 카카오 설정 일괄 조회
    const kakaoSettings = await getKakaoSettings(db, c.get('entityId') || 1)
    if (!kakaoSettings.enabled) {
      return c.json({ success: false, error: '카카오톡이 비활성화되어 있습니다.' }, 400)
    }
    if (!kakaoSettings.senderNum) {
      return c.json({ success: false, error: '발신번호가 설정되지 않았습니다.' }, 400)
    }

    // 발송 내용 구성
    const content = body.content || `세금계산서 ${taxInvoice.invoice_number} 발행되었습니다.`

    // 바로빌 Provider 생성
    const provider = await getKakaoProvider(c)
    if (!provider) {
      return c.json({ success: false, error: '바로빌 연동이 설정되지 않았습니다.' }, 400)
    }

    // 알림톡 발송
    const sendResult = await provider.sendATS({
      templateCode,
      snd: kakaoSettings.senderNum,
      content,
      altSendType: kakaoSettings.altSendType,
      messages: [{
        rcv: taxInvoice.mobile,
        rcvnm: taxInvoice.client_name || '고객',
        msg: content,
        altmsg: content,
      }]
    })

    // kakao_send_logs에 저장
    const insertResult = await db.prepare(
      `INSERT INTO kakao_send_logs (
        receipt_num, template_code, receiver_num, receiver_name,
        related_type, related_id, client_id, content, alt_content,
        status, result_code, result_message, sent_by, entity_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      sendResult.receiptNum,
      templateCode,
      taxInvoice.mobile,
      taxInvoice.client_name,
      'tax_invoices',
      taxInvoiceId,
      taxInvoice.client_id,
      content,
      content,
      sendResult.receiptNum ? 'SUCCESS' : 'FAILED',
      sendResult.code,
      sendResult.message,
      userId,
      getEntityId(c)
    ).run()

    return c.json({
      success: true,
      data: {
        log_id: insertResult.meta.last_row_id,
        receipt_num: sendResult.receiptNum,
        code: sendResult.code,
        message: sendResult.message,
        status: sendResult.receiptNum ? 'SUCCESS' : 'FAILED'
      }
    })
  } catch (error) {
    console.error('src/routes/kakao.ts POST /send-tax-invoice error:', error)
    return c.json({ success: false, error: '세금계산서 카카오톡 발송 실패' }, 500)
  }
})

// ────────────────────────────────────────────────────────────────────────────
// POST /send-portal-link — 거래처 포털 조회 링크 알림톡
// ────────────────────────────────────────────────────────────────────────────
kakaoRouter.post('/send-portal-link', async (c) => {
  try {
    const db = c.env.DB
    const body = await c.req.json() as any // TODO: #17 — external request body
    const userId = c.get('user').id

    const clientId = body.client_id
    const templateCode = body.template_code

    if (!clientId || !templateCode) {
      return c.json({ success: false, error: 'client_id, template_code는 필수입니다.' }, 400)
    }

    // 거래처 정보 조회
    const client = await db.prepare(
      `SELECT id, client_name, mobile FROM clients WHERE id = ?`
    ).bind(clientId).first<ClientRow>()

    if (!client) {
      return c.json({ success: false, error: '거래처를 찾을 수 없습니다.' }, 400)
    }

    if (!client.mobile) {
      return c.json({ success: false, error: '거래처 휴대폰 번호가 없습니다.' }, 400)
    }

    // 카카오 설정 일괄 조회
    const kakaoSettings = await getKakaoSettings(db, c.get('entityId') || 1)
    if (!kakaoSettings.enabled) {
      return c.json({ success: false, error: '카카오톡이 비활성화되어 있습니다.' }, 400)
    }
    if (!kakaoSettings.senderNum) {
      return c.json({ success: false, error: '발신번호가 설정되지 않았습니다.' }, 400)
    }

    // 포털 베이스 URL — settings에서 조회, 없으면 빈 문자열
    const portalBaseUrlRow = await db.prepare(
      `SELECT setting_value FROM settings WHERE setting_key = 'portal_base_url'`
    ).first<SettingRow>()
    const portalBaseUrl = portalBaseUrlRow?.setting_value || ''
    const portalLink = portalBaseUrl ? `${portalBaseUrl}/client/${clientId}` : ''

    // 발송 내용 구성
    const content = body.content || (portalLink
      ? `거래 정보를 조회하려면 아래 링크를 클릭하세요: ${portalLink}`
      : '거래 정보 조회 링크를 확인하세요.')

    // 바로빌 Provider 생성
    const provider = await getKakaoProvider(c)
    if (!provider) {
      return c.json({ success: false, error: '바로빌 연동이 설정되지 않았습니다.' }, 400)
    }

    // 버튼 구성 (포털링크가 있을 때만)
    const btns = portalLink
      ? [{ n: '포털 접속', t: 'WL', u1: portalLink, u2: portalLink }]
      : undefined

    // 알림톡 발송
    const sendResult = await provider.sendATS({
      templateCode,
      snd: kakaoSettings.senderNum,
      content,
      altSendType: kakaoSettings.altSendType,
      messages: [{
        rcv: client.mobile,
        rcvnm: client.client_name || '고객',
        msg: content,
        altmsg: content,
        btns,
      }]
    })

    // kakao_send_logs에 저장
    const insertResult = await db.prepare(
      `INSERT INTO kakao_send_logs (
        receipt_num, template_code, receiver_num, receiver_name,
        related_type, related_id, client_id, content, alt_content,
        status, result_code, result_message, sent_by, entity_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      sendResult.receiptNum,
      templateCode,
      client.mobile,
      client.client_name,
      'ledger',
      clientId,
      clientId,
      content,
      content,
      sendResult.receiptNum ? 'SUCCESS' : 'FAILED',
      sendResult.code,
      sendResult.message,
      userId,
      getEntityId(c)
    ).run()

    return c.json({
      success: true,
      data: {
        log_id: insertResult.meta.last_row_id,
        receipt_num: sendResult.receiptNum,
        code: sendResult.code,
        message: sendResult.message,
        status: sendResult.receiptNum ? 'SUCCESS' : 'FAILED',
        portal_link: portalLink
      }
    })
  } catch (error) {
    console.error('src/routes/kakao.ts POST /send-portal-link error:', error)
    return c.json({ success: false, error: '포털 링크 카카오톡 발송 실패' }, 500)
  }
})

// ────────────────────────────────────────────────────────────────────────────
// POST /send-sms — SMS/LMS 단건 발송
// ────────────────────────────────────────────────────────────────────────────
kakaoRouter.post('/send-sms', async (c) => {
  try {
    const db = c.env.DB
    const body = await c.req.json() as any // TODO: #17 — external request body
    const userId = c.get('user').id

    const receiverNum = body.receiver_num?.trim()
    const receiverName = body.receiver_name?.trim() || ''
    const content = body.content?.trim()
    const subject = body.subject?.trim() || ''

    if (!receiverNum || !content) {
      return c.json({ success: false, error: '필수 항목(receiver_num, content)을 입력해주세요.' }, 400)
    }

    // 발신번호 확인 (kakao_sender_num 공용)
    const kakaoSettings = await getKakaoSettings(db, c.get('entityId') || 1)
    if (!kakaoSettings.senderNum) {
      return c.json({ success: false, error: '발신번호가 설정되지 않았습니다.' }, 400)
    }

    const provider = await getKakaoProvider(c)
    if (!provider) {
      return c.json({ success: false, error: '바로빌 연동이 설정되지 않았습니다.' }, 400)
    }

    const messages: SMSMessage[] = [{
      rcv: receiverNum,
      rcvnm: receiverName || '수신자',
    }]

    // subject 있으면 LMS, 없으면 SMS
    const isLms = !!subject
    const templateCode = isLms ? 'LMS' : 'SMS'

    let sendResult
    if (isLms) {
      sendResult = await provider.sendLMS({
        snd: kakaoSettings.senderNum,
        subject,
        content,
        messages,
      })
    } else {
      sendResult = await provider.sendSMS({
        snd: kakaoSettings.senderNum,
        content,
        messages,
      })
    }

    // kakao_send_logs에 저장
    const clientId = body.client_id || null
    const relatedType = body.related_type || null
    const relatedId = body.related_id || null

    const insertResult = await db.prepare(
      `INSERT INTO kakao_send_logs (
        receipt_num, template_code, receiver_num, receiver_name,
        related_type, related_id, client_id, content, alt_content,
        status, result_code, result_message, sent_by, entity_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      sendResult.receiptNum,
      templateCode,
      receiverNum,
      receiverName || null,
      relatedType,
      relatedId,
      clientId,
      content,
      content,
      sendResult.receiptNum ? 'SUCCESS' : 'FAILED',
      sendResult.code,
      sendResult.message,
      userId,
      getEntityId(c)
    ).run()

    return c.json({
      success: true,
      data: {
        log_id: insertResult.meta.last_row_id,
        receipt_num: sendResult.receiptNum,
        code: sendResult.code,
        message: sendResult.message,
        status: sendResult.receiptNum ? 'SUCCESS' : 'FAILED',
        type: templateCode,
      }
    })
  } catch (error) {
    console.error('src/routes/kakao.ts POST /send-sms error:', error)
    return c.json({ success: false, error: 'SMS 발송 실패' }, 500)
  }
})

// ────────────────────────────────────────────────────────────────────────────
// POST /send-sms-bulk — 대량 SMS/LMS 발송 (사내 공지 등)
// ────────────────────────────────────────────────────────────────────────────
kakaoRouter.post('/send-sms-bulk', async (c) => {
  try {
    const db = c.env.DB
    const body = await c.req.json() as any // TODO: #17 — external request body
    const userId = c.get('user').id

    const content = body.content?.trim()
    const subject = body.subject?.trim() || ''
    const targetType: 'clients' | 'employees' | 'custom' = body.target_type || 'custom'

    if (!content) {
      return c.json({ success: false, error: 'content는 필수입니다.' }, 400)
    }

    // 발신번호 확인
    const kakaoSettings = await getKakaoSettings(db, c.get('entityId') || 1)
    if (!kakaoSettings.senderNum) {
      return c.json({ success: false, error: '발신번호가 설정되지 않았습니다.' }, 400)
    }

    // 수신자 목록 구성
    let messages: SMSMessage[] = []

    if (targetType === 'clients') {
      const { results: clientRows } = await db.prepare(
        `SELECT client_name, mobile FROM clients WHERE mobile IS NOT NULL AND mobile != '' ORDER BY client_name, id`
      ).all<{ client_name: string; mobile: string }>()
      messages = clientRows.map((r) => ({
        rcv: r.mobile,
        rcvnm: r.client_name || '고객',
      }))
    } else if (targetType === 'employees') {
      // #610 과 같은 이유 — employees 는 법인 소유(0148)라 필터가 없으면 타법인 직원에게 실제로
      // 발송되고 건당 과금된다. clients 는 entity_id 컬럼 자체가 없어(전사 공유 마스터) 위 분기는 무필터.
      const efEmp = entityFilter(c)
      const { results: empRows } = await db.prepare(
        `SELECT name, phone FROM employees WHERE phone IS NOT NULL AND phone != '' AND is_deleted = 0${efEmp.clause} ORDER BY name`
      ).bind(...efEmp.params).all<{ name: string; phone: string }>()
      messages = empRows.map((r) => ({
        rcv: r.phone,
        rcvnm: r.name || '직원',
      }))
    } else {
      // custom: body.receivers 사용
      const receivers: Array<{ num: string; name?: string }> = body.receivers || []
      messages = receivers.map((r) => ({
        rcv: r.num,
        rcvnm: r.name || '수신자',
      }))
    }

    if (messages.length === 0) {
      return c.json({ success: false, error: '발송 대상이 없습니다.' }, 400)
    }

    // 수신자 가드 — 번호 중복 통합 + 발송 피로도(settings message_fatigue_days, 0=끔).
    // 상한 판정보다 먼저 적용해야 "빠진 뒤의 실제 건수"로 상한이 걸린다.
    const smsGuard = await applyAudienceGuards(db, messages, m => m.rcv || '', m => m.rcvnm || '')
    messages = smsGuard.kept
    if (messages.length === 0) {
      const why = describeGuardResult(smsGuard)
      return c.json({ success: false, error: `발송할 대상이 남지 않았습니다${why ? ` (${why})` : ''}.` }, 400)
    }

    // #584 건수 상한 — target_type=clients면 전 거래처(수천 건)가 한 번에 나간다.
    const smsBulkLimitErr = await checkBulkLimit(db, subject ? 'lms' : 'sms', messages.length)
    if (smsBulkLimitErr) return c.json({ success: false, error: smsBulkLimitErr }, 400)

    const provider = await getKakaoProvider(c)
    if (!provider) {
      return c.json({ success: false, error: '바로빌 연동이 설정되지 않았습니다.' }, 400)
    }

    const isLms = !!subject
    const templateCode = isLms ? 'LMS' : 'SMS'

    let sendResult
    if (isLms) {
      sendResult = await provider.sendLMS({
        snd: kakaoSettings.senderNum,
        subject,
        content,
        messages,
      })
    } else {
      sendResult = await provider.sendSMS({
        snd: kakaoSettings.senderNum,
        content,
        messages,
      })
    }

    // kakao_send_logs에 bulk 기록 (1건으로 대표 저장)
    const insertResult = await db.prepare(
      `INSERT INTO kakao_send_logs (
        receipt_num, template_code, receiver_num, receiver_name,
        related_type, related_id, client_id, content, alt_content,
        status, result_code, result_message, sent_by, entity_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      sendResult.receiptNum,
      templateCode,
      `BULK(${messages.length})`,
      targetType,
      'bulk',
      null,
      null,
      content,
      content,
      sendResult.receiptNum ? 'SUCCESS' : 'FAILED',
      sendResult.code,
      sendResult.message,
      userId,
      getEntityId(c)
    ).run()

    // 수신자별 이력 — 대표 로그는 BULK(N) 한 줄뿐이라 피로도 판정 소스가 여기에만 남는다.
    // 기록 실패가 발송 결과를 덮지 않도록 예외는 삼킨다(이미 나간 발송이다).
    try {
      await recordBulkRecipients(db, {
        logId: Number(insertResult.meta.last_row_id) || null,
        items: messages.map(m => ({ phone: m.rcv || '', name: m.rcvnm })),
        channel: subject ? 'lms' : 'sms',
        messageType: 'INFO',
        entityId: getEntityId(c),
        defaultOk: !!sendResult.receiptNum,
      })
    } catch (e) {
      console.error('src/routes/kakao.ts recordBulkRecipients error:', e)
    }

    return c.json({
      success: true,
      data: {
        log_id: insertResult.meta.last_row_id,
        receipt_num: sendResult.receiptNum,
        code: sendResult.code,
        message: sendResult.message,
        status: sendResult.receiptNum ? 'SUCCESS' : 'FAILED',
        type: templateCode,
        receiver_count: messages.length,
        // 가드로 빠진 대상 — 화면이 "왜 요청보다 적게 나갔는지" 설명할 수 있어야 한다
        merged_duplicate: smsGuard.duplicates.length,
        fatigue_skipped: smsGuard.fatigued.length,
        fatigue_days: smsGuard.fatigueDays,
      }
    })
  } catch (error) {
    console.error('src/routes/kakao.ts POST /send-sms-bulk error:', error)
    return c.json({ success: false, error: '대량 SMS 발송 실패' }, 500)
  }
})

// ────────────────────────────────────────────────────────────────────────────
// POST /send-shipment-bulk — 출고 알림 일괄 발송 (체크박스 선택)
// ────────────────────────────────────────────────────────────────────────────
kakaoRouter.post('/send-shipment-bulk', async (c) => {
  try {
    const db = c.env.DB
    const body = await c.req.json() as any // TODO: #17 — external request body
    const userId = c.get('user').id
    const { channel, content, targets: rawTargets, template_code, subject, date } = body

    if (!rawTargets || !Array.isArray(rawTargets) || rawTargets.length === 0) {
      return c.json({ success: false, error: '발송 대상이 없습니다.' }, 400)
    }
    if (!content) {
      return c.json({ success: false, error: '메시지 내용이 없습니다.' }, 400)
    }

    const kakaoSettings = await getKakaoSettings(db, c.get('entityId') || 1)
    if (!kakaoSettings.senderNum) {
      return c.json({ success: false, error: '발신번호가 설정되지 않았습니다.' }, 400)
    }

    const provider = await getKakaoProvider(c)
    if (!provider) {
      return c.json({ success: false, error: '바로빌 연동이 설정되지 않았습니다.' }, 400)
    }

    // #dedup: 발송 전 (a) 이미 성공발송된 shipment (b) 합포장 자식(merged_into_id) 제외 — 재발송·자식 중복발송 방지(단건 :490 가드를 bulk로 확장). D1 바인드 한도 → 80청크.
    const allSids = (rawTargets as any[]).flatMap((t) => Array.isArray(t.shipment_ids) ? t.shipment_ids : []).map(Number).filter(Boolean)
    const sentSet = new Set<number>()
    const mergedSet = new Set<number>()
    for (let i = 0; i < allSids.length; i += 80) {
      const chunk = allSids.slice(i, i + 80)
      const ph = chunk.map(() => '?').join(',')
      const { results: sRows } = await db.prepare(
        `SELECT DISTINCT related_id AS id FROM kakao_send_logs WHERE related_type = 'shipments' AND status = 'SUCCESS' AND related_id IN (${ph})`
      ).bind(...chunk).all<{ id: number }>()
      for (const r of sRows) sentSet.add(Number(r.id))
      const { results: mRows } = await db.prepare(
        `SELECT id FROM shipments WHERE id IN (${ph}) AND merged_into_id IS NOT NULL`
      ).bind(...chunk).all<{ id: number }>()
      for (const r of mRows) mergedSet.add(Number(r.id))
    }
    const targets = (rawTargets as any[]).filter((t) => {
      const ids = (Array.isArray(t.shipment_ids) ? t.shipment_ids : []).map(Number).filter(Boolean)
      if (ids.length === 0) return true // shipment_id 없는 대상(수동입력 등)은 dedup 불가 → 통과
      return ids.some((id: number) => !sentSet.has(id) && !mergedSet.has(id))
    })
    const skippedDup = (rawTargets as any[]).length - targets.length
    if (targets.length === 0) {
      return c.json({ success: true, data: { status: 'SKIPPED', reason: 'all_already_sent_or_merged', skipped: skippedDup } })
    }

    // #584 건수 상한 — dedup 이후 실제 발송 건수 기준으로 판정한다.
    const shipBulkLimitErr = await checkBulkLimit(
      db,
      channel === 'alimtalk' ? 'kakao' : (subject ? 'lms' : 'sms'),
      targets.length
    )
    if (shipBulkLimitErr) return c.json({ success: false, error: shipBulkLimitErr }, 400)

    // 각 대상별 변수 치환
    const resolveMsg = (t: any): string => content
      .replace(/#{고객명}/g, t.client_name || '')
      .replace(/#{품목}/g, t.item_summary || '')
      .replace(/#{송장번호}/g, t.tracking_number || '')
      .replace(/#{터미널}/g, t.terminal || '')
      .replace(/#{배송방법}/g, t.delivery_type || '')
      .replace(/#{날짜}/g, date || '')

    let sendResult
    if (channel === 'alimtalk' && template_code) {
      const atsMessages: ATSMessage[] = targets.map((t: any) => {
        const msg: ATSMessage = {
          rcv: t.mobile,
          rcvnm: t.client_name || '고객',
          msg: resolveMsg(t),
          altmsg: resolveMsg(t)
        }
        // 한진택배 + 송장번호 있으면 배송조회 버튼 자동 추가
        if (t.tracking_number && t.delivery_type && /한진/.test(t.delivery_type)) {
          msg.btns = [{ n: '배송 조회', t: 'WL', u1: 'https://trace.hanjin.co.kr/newinfo/gonsang/tracking?waybillNo=' + t.tracking_number, u2: 'https://trace.hanjin.co.kr/newinfo/gonsang/tracking?waybillNo=' + t.tracking_number }]
        }
        return msg
      })
      sendResult = await provider.sendATS({
        templateCode: template_code,
        snd: kakaoSettings.senderNum,
        content,
        altSendType: kakaoSettings.altSendType || 'C',
        messages: atsMessages
      })
    } else {
      const smsMessages: SMSMessage[] = targets.map((t: any) => ({
        rcv: t.mobile,
        rcvnm: t.client_name || '고객',
        msg: resolveMsg(t)
      }))
      if (subject) {
        sendResult = await provider.sendLMS({
          snd: kakaoSettings.senderNum,
          subject,
          content,
          messages: smsMessages
        })
      } else {
        sendResult = await provider.sendSMS({
          snd: kakaoSettings.senderNum,
          content,
          messages: smsMessages
        })
      }
    }

    const templateLabel = channel === 'alimtalk' ? (template_code || 'ATS') : (subject ? 'LMS' : 'SMS')

    // #378: 건별 결과로 성공/실패 집계 (이전엔 sent_count=targets.length라 부분/전량 실패도 전량 성공 오보고)
    const itemResults = sendResult!.results
    let okCount: number, failCount: number
    let failures: Array<{ client_name: string; mobile: string; shipment_ids: any[]; reason: string }> = []
    if (itemResults && itemResults.length === targets.length) {
      targets.forEach((t: any, i: number) => {
        const r = itemResults[i]
        if (!r.ok) failures.push({
          client_name: t.client_name || '',
          mobile: t.mobile || '',
          shipment_ids: t.shipment_ids || [],
          reason: r.code < 0 ? `바로빌 오류코드 ${r.code}` : '발송 실패'
        })
      })
      failCount = failures.length
      okCount = targets.length - failCount
    } else {
      // 건별 식별 불가(SMS 다건 등) → 대표 결과로 전량 판정
      const allOk = !!sendResult!.receiptNum
      okCount = allOk ? targets.length : 0
      failCount = allOk ? 0 : targets.length
      if (!allOk) failures = targets.map((t: any) => ({
        client_name: t.client_name || '', mobile: t.mobile || '', shipment_ids: t.shipment_ids || [],
        reason: sendResult!.message || '발송 실패'
      }))
    }
    const status = failCount === 0 ? 'SUCCESS' : (okCount === 0 ? 'FAILED' : 'PARTIAL')

    // 로그 저장 (bulk 대표 1건 — 실제 성공/실패 수 반영)
    await db.prepare(
      `INSERT INTO kakao_send_logs (
        receipt_num, template_code, receiver_num, receiver_name,
        related_type, related_id, content, alt_content,
        status, result_code, result_message, sent_by, entity_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      sendResult!.receiptNum || '',
      templateLabel,
      `BULK(${targets.length})`,
      targets.map((t: any) => t.client_name).join(', '),
      'shipments',
      null,
      content,
      content,
      status,
      sendResult!.code || 0,
      `성공 ${okCount} / 실패 ${failCount} — ${sendResult!.message || ''}`,
      userId,
      getEntityId(c)
    ).run()

    return c.json({
      success: true,
      data: {
        status,
        total: targets.length,
        sent_count: okCount,
        fail_count: failCount,
        failures,
        receipt_num: sendResult!.receiptNum,
        code: sendResult!.code,
        message: sendResult!.message
      }
    })
  } catch (error) {
    console.error('src/routes/kakao.ts POST /send-shipment-bulk error:', error)
    return c.json({ success: false, error: '일괄 발송 실패' }, 500)
  }
})

// ────────────────────────────────────────────────────────────────────────────
// GET /logs — 발송 이력 조회
// ────────────────────────────────────────────────────────────────────────────
kakaoRouter.get('/logs', async (c) => {
  try {
    const db = c.env.DB

    // 쿼리 파라미터 파싱
    const page = Math.max(1, parseInt(c.req.query('page') || '1', 10))
    const limit = Math.min(100, Math.max(1, parseInt(c.req.query('limit') || '30', 10)))
    const clientId = c.req.query('client_id')
    const status = c.req.query('status')
    const relatedType = c.req.query('related_type')
    const dateFrom = c.req.query('date_from')
    const dateTo = c.req.query('date_to')
    const channel = c.req.query('channel')
    const search = c.req.query('search')

    // SQL 동적 구성
    let whereConditions: string[] = []
    let bindings: any[] = []

    // #418: 발송이력 멀티법인 격리 — 같은 파일의 INSERT(entity_id 저장)·template-defaults read는 격리되나 /logs read만 누락.
    // MANAGER는 항상 구체 entityId라 격리 대상(super-admin entityId=0만 전체 열람). count·본쿼리 공유 whereClause로 양쪽 적용.
    const efLogs = entityFilter(c)
    if (efLogs.params.length) {
      whereConditions.push('ksl.entity_id = ?')
      bindings.push(...efLogs.params)
    }

    if (clientId) {
      whereConditions.push('ksl.client_id = ?')
      bindings.push(parseInt(clientId, 10))
    }
    if (status) {
      whereConditions.push('ksl.status = ?')
      bindings.push(status)
    }
    if (relatedType) {
      whereConditions.push('ksl.related_type = ?')
      bindings.push(relatedType)
    }
    if (dateFrom) {
      whereConditions.push("DATE(ksl.created_at) >= ?")
      bindings.push(dateFrom)
    }
    if (dateTo) {
      whereConditions.push("DATE(ksl.created_at) <= ?")
      bindings.push(dateTo)
    }
    if (channel) {
      whereConditions.push('ksl.channel = ?')
      bindings.push(channel)
    }
    if (search) {
      whereConditions.push("(ksl.receiver_name LIKE ? OR ksl.receiver_num LIKE ?)")
      bindings.push('%' + search + '%', '%' + search + '%')
    }

    const whereClause = whereConditions.length > 0 ? ` WHERE ${whereConditions.join(' AND ')}` : ''

    // 총 건수 조회
    const countQuery = `SELECT COUNT(*) as total FROM kakao_send_logs ksl${whereClause}`
    const countResult = await db.prepare(countQuery).bind(...bindings).first<CountRow>()
    const total = countResult?.total || 0

    // 이력 조회
    const offset = (page - 1) * limit
    const query = `
      SELECT
        ksl.id,
        ksl.receipt_num,
        ksl.template_code,
        ksl.receiver_num,
        ksl.receiver_name,
        ksl.related_type,
        ksl.related_id,
        ksl.client_id,
        c.client_name,
        ksl.content,
        ksl.status,
        ksl.result_code,
        ksl.result_message,
        ksl.channel,
        ksl.sent_by,
        u.name as user_name,
        ksl.created_at
      FROM kakao_send_logs ksl
      LEFT JOIN clients c ON ksl.client_id = c.id
      LEFT JOIN users u ON ksl.sent_by = u.id
      ${whereClause}
      ORDER BY ksl.created_at DESC, ksl.id DESC
      LIMIT ? OFFSET ?
    `

    bindings.push(limit, offset)
    const { results: logs } = await db.prepare(query).bind(...bindings).all<KakaoLogRow>()

    return c.json({
      success: true,
      data: {
        logs: logs || [],
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      }
    })
  } catch (error) {
    console.error('src/routes/kakao.ts GET /logs error:', error)
    return c.json({ success: false, error: '발송 이력 조회 실패' }, 500)
  }
})

// ────────────────────────────────────────────────────────────────────────────
// GET /logs/:receiptNum/status — 팝빌에서 발송 결과 상세 조회
// ────────────────────────────────────────────────────────────────────────────
kakaoRouter.get('/logs/:receiptNum/status', async (c) => {
  try {
    const receiptNum = c.req.param('receiptNum')
    if (!receiptNum) {
      return c.json({ success: false, error: 'receiptNum은 필수입니다.' }, 400)
    }

    const provider = await getKakaoProvider(c)
    if (!provider) {
      return c.json({ success: false, error: '바로빌 연동이 설정되지 않았습니다.' }, 400)
    }

    // 채널별 조회 API가 다르다: 알림톡=GetSendKakaotalk, 문자(SMS/LMS/MMS)=GetSMSSendMessage.
    // channel 미지정 시 알림톡 먼저 조회하고 비면 문자로 폴백(레거시 호출 하위호환).
    // 2026-09-18: 상태값 해석을 **서버에서** 붙인다. 화면이 코드표를 따로 갖고 있으면 또 어긋난다
    //   (문자 라벨이 한 칸씩 밀려 있던 게 그 결과였다 — 1 은 전송중이 아니라 전송완료다).
    const withStatus = (data: Record<string, unknown> | null, ch: 'kakao' | 'sms') => {
      if (!data) return data
      const rawStatus = ch === 'kakao' ? (data.SendStatus as string) : (data.SendState as string)
      const s = interpretSendStatus(rawStatus, ch)
      return s ? { ...data, status_label: s.label, status_kind: s.kind, status_code: s.code } : data
    }

    const channel = (c.req.query('channel') || '').toLowerCase()
    if (channel === 'sms' || channel === 'mms') {
      const sms = await provider.getSmsSendMessage(receiptNum)
      return c.json({ success: true, data: withStatus(sms, 'sms') })
    }
    const messages = await provider.getMessages(receiptNum)
    if (messages && Object.keys(messages).length > 0) {
      return c.json({ success: true, data: withStatus(messages, 'kakao') })
    }
    return c.json({ success: true, data: withStatus(await provider.getSmsSendMessage(receiptNum), 'sms') })
  } catch (error) {
    console.error('src/routes/kakao.ts GET /logs/:receiptNum/status error:', error)
    return c.json({ success: false, error: '발송 결과 조회 실패' }, 500)
  }
})

// ────────────────────────────────────────────────────────────────────────────
// 발송 위치별 기본 템플릿 매핑 (kakao_template_defaults)
//  context: shipments / ledger / messages / shell:<related_type>
//  match_key: 배송방법(DELIVERY/FREIGHT/PICKUP/QUICK) 등, 빈값=context 공통
// ────────────────────────────────────────────────────────────────────────────

// 목록 조회 (관리자 설정 UI)
kakaoRouter.get('/template-defaults', async (c) => {
  try {
    const ef = entityFilter(c)
    const { results } = await c.env.DB.prepare(
      `SELECT id, context, match_key, entity_id, template_code, updated_at
       FROM kakao_template_defaults WHERE 1=1${ef.clause}
       ORDER BY context, match_key, entity_id`
    ).bind(...ef.params).all()
    return c.json({ success: true, data: results })
  } catch (error) {
    console.error('src/routes/kakao.ts GET /template-defaults error:', error)
    return c.json({ success: false, error: '기본 템플릿 조회 실패' }, 500)
  }
})

// 기본 템플릿 설정 (upsert)
kakaoRouter.put('/template-defaults', requireRole('ADMIN'), async (c) => {
  try {
    const body = await c.req.json() as any
    const context = (body.context || '').trim()
    const matchKey = (body.match_key || '').trim()
    const templateCode = (body.template_code || '').trim()
    if (!context) return c.json({ success: false, error: 'context는 필수입니다.' }, 400)
    // entity_id: body 지정(관리자가 법인별 행 편집) 우선, 없으면 현재 컨텍스트
    const entityId = (body.entity_id != null && String(body.entity_id) !== '') ? Number(body.entity_id) : (c.get('entityId') || 1)
    await c.env.DB.prepare(
      `INSERT INTO kakao_template_defaults (context, match_key, entity_id, template_code, updated_at)
       VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(context, match_key, entity_id)
       DO UPDATE SET template_code = excluded.template_code, updated_at = CURRENT_TIMESTAMP`
    ).bind(context, matchKey, entityId, templateCode).run()
    return c.json({ success: true })
  } catch (error) {
    console.error('src/routes/kakao.ts PUT /template-defaults error:', error)
    return c.json({ success: false, error: '기본 템플릿 설정 실패' }, 500)
  }
})

// 기본 템플릿 resolve — 발송 위치에서 호출. (context,key,entity) → (context,'',entity) → 빈값
kakaoRouter.get('/template-defaults/resolve', async (c) => {
  try {
    const context = (c.req.query('context') || '').trim()
    const key = (c.req.query('key') || '').trim()
    if (!context) return c.json({ success: true, data: { template_code: '' } })
    const entityId = c.get('entityId') || 1
    let row = await c.env.DB.prepare(
      `SELECT template_code FROM kakao_template_defaults WHERE context = ? AND match_key = ? AND entity_id = ?`
    ).bind(context, key, entityId).first<{ template_code: string }>()
    if (!row && key) {
      row = await c.env.DB.prepare(
        `SELECT template_code FROM kakao_template_defaults WHERE context = ? AND match_key = '' AND entity_id = ?`
      ).bind(context, entityId).first<{ template_code: string }>()
    }
    return c.json({ success: true, data: { template_code: row?.template_code || '' } })
  } catch (error) {
    console.error('src/routes/kakao.ts GET /template-defaults/resolve error:', error)
    return c.json({ success: true, data: { template_code: '' } })
  }
})

export default kakaoRouter
