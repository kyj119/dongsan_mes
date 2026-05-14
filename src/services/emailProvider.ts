// ============================================================================
// 이메일 발송 서비스 (Resend API)
// Cloudflare Workers 호환 — fetch만 사용
// ============================================================================

import type { Bindings } from '../types/env'

export interface EmailOptions {
  to: string | string[]
  subject: string
  html: string
  from?: string
  replyTo?: string
  attachments?: Array<{ filename: string; content: string }>
}

export interface EmailResult {
  success: boolean
  id?: string
  error?: string
}

interface EmailSettings {
  enabled: boolean
  fromName: string
  fromAddress: string
  replyTo: string
}

async function getEmailSettings(db: D1Database, entityId?: number): Promise<EmailSettings> {
  // 1) 글로벌 settings 조회 (기본값 fallback용)
  const { results } = await db.prepare(
    `SELECT setting_key, setting_value FROM settings
     WHERE setting_key IN ('email_enabled', 'email_from_name', 'email_from_address', 'email_reply_to')`
  ).all()

  const map: Record<string, string> = {}
  for (const row of results as any[]) {
    map[row.setting_key] = row.setting_value || ''
  }

  let fromName = map['email_from_name'] || '동산기획'
  let fromAddress = map['email_from_address'] || 'onboarding@resend.dev'

  // Phase 1.2: 2) entity별 발신 주소가 있으면 우선 사용
  if (entityId && entityId > 0) {
    const entity = await db.prepare(
      `SELECT name, email_from_address, email_from_name FROM entities WHERE id = ?`
    ).bind(entityId).first() as any
    if (entity) {
      if (entity.email_from_address) fromAddress = entity.email_from_address
      if (entity.email_from_name) fromName = entity.email_from_name
      else if (entity.name && !map['email_from_name']) fromName = entity.name
    }
  }

  return {
    enabled: map['email_enabled'] !== '0',
    fromName,
    fromAddress,
    replyTo: map['email_reply_to'] || '',
  }
}

export async function sendEmail(
  env: Bindings,
  db: D1Database,
  options: EmailOptions,
  meta?: { template?: string; relatedType?: string; relatedId?: number; sentBy?: number; entityId?: number }
): Promise<EmailResult> {
  // Phase 1.2: meta.entityId가 있으면 entity별 발신 주소 사용
  const settings = await getEmailSettings(db, meta?.entityId)

  if (!settings.enabled) {
    return { success: false, error: '이메일 발송이 비활성화되어 있습니다.' }
  }

  if (!env.RESEND_API_KEY) {
    return { success: false, error: 'RESEND_API_KEY가 설정되지 않았습니다.' }
  }

  const from = options.from || `${settings.fromName} <${settings.fromAddress}>`
  const recipients = Array.isArray(options.to) ? options.to : [options.to]

  try {
    const payload: Record<string, any> = {
      from,
      to: recipients,
      subject: options.subject,
      html: options.html,
    }

    const replyTo = options.replyTo || settings.replyTo
    if (replyTo) {
      payload.reply_to = replyTo
    }

    if (options.attachments && options.attachments.length > 0) {
      payload.attachments = options.attachments
    }

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    const data = await res.json() as any

    if (!res.ok) {
      const errorMsg = data?.message || data?.error || `HTTP ${res.status}`

      // 도메인 미인증 에러 → onboarding@resend.dev로 자동 재시도
      if (errorMsg.includes('not verified') && !from.includes('resend.dev')) {
        const fallbackFrom = `${settings.fromName} <onboarding@resend.dev>`
        payload.from = fallbackFrom
        const retryRes = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${env.RESEND_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        })
        const retryData = await retryRes.json() as any
        if (retryRes.ok) {
          await logEmail(db, {
            template: meta?.template || 'MANUAL',
            recipientEmail: recipients.join(', '),
            subject: options.subject,
            relatedType: meta?.relatedType,
            relatedId: meta?.relatedId,
            status: 'SENT',
            errorMessage: `Fallback: ${errorMsg}`,
            sentBy: meta?.sentBy,
          })
          return { success: true, id: retryData.id }
        }
      }

      await logEmail(db, {
        template: meta?.template || 'MANUAL',
        recipientEmail: recipients.join(', '),
        subject: options.subject,
        relatedType: meta?.relatedType,
        relatedId: meta?.relatedId,
        status: 'FAILED',
        errorMessage: errorMsg,
        sentBy: meta?.sentBy,
      })
      return { success: false, error: errorMsg }
    }

    await logEmail(db, {
      template: meta?.template || 'MANUAL',
      recipientEmail: recipients.join(', '),
      subject: options.subject,
      relatedType: meta?.relatedType,
      relatedId: meta?.relatedId,
      status: 'SENT',
      sentBy: meta?.sentBy,
    })

    return { success: true, id: data.id }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error'
    await logEmail(db, {
      template: meta?.template || 'MANUAL',
      recipientEmail: recipients.join(', '),
      subject: options.subject,
      relatedType: meta?.relatedType,
      relatedId: meta?.relatedId,
      status: 'FAILED',
      errorMessage: errorMsg,
      sentBy: meta?.sentBy,
    }).catch(() => {})
    return { success: false, error: errorMsg }
  }
}

async function logEmail(db: D1Database, log: {
  template: string
  recipientEmail: string
  recipientName?: string
  subject: string
  relatedType?: string
  relatedId?: number
  status: string
  errorMessage?: string
  sentBy?: number
}) {
  await db.prepare(`
    INSERT INTO email_logs (template, recipient_email, recipient_name, subject, related_type, related_id, status, error_message, sent_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    log.template,
    log.recipientEmail,
    log.recipientName || null,
    log.subject,
    log.relatedType || null,
    log.relatedId || null,
    log.status,
    log.errorMessage || null,
    log.sentBy || null,
  ).run()
}
