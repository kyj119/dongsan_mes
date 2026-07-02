/**
 * 법인(entity)별 회사 정보 조회 유틸리티.
 * 세금계산서, 현금영수증, 카카오톡 등에서 공급자 정보로 사용.
 */
export async function getEntityCompanyInfo(
  db: D1Database,
  entityId: number
): Promise<Record<string, string>> {
  const entity = await db.prepare(
    `SELECT name, business_reg_no, representative, address,
            business_type, business_item, popbill_corp_num, email, tax_email, phone,
            stamp_base64, bank_info, fax,
            email_from_address, email_from_name
     FROM entities WHERE id = ?`
  ).bind(entityId).first() as any

  if (!entity) {
    // 폴백: 글로벌 settings에서 조회 (마이그레이션 전 호환)
    const { results: settingRows } = await db.prepare(
      `SELECT setting_key, setting_value FROM settings
       WHERE setting_key IN (
         'company_name', 'company_business_registration_number',
         'company_representative', 'company_address',
         'company_business_type', 'company_business_item',
         'company_stamp_base64'
       )`
    ).all() as any
    const map: Record<string, string> = {}
    for (const row of settingRows || []) {
      map[row.setting_key] = row.setting_value || ''
    }
    return map
  }

  return {
    company_name: entity.name || '',
    company_business_registration_number: entity.business_reg_no || '',
    company_representative: entity.representative || '',
    company_address: entity.address || '',
    company_business_type: entity.business_type || '',
    company_business_item: entity.business_item || '',
    popbill_corp_num: entity.popbill_corp_num || (entity.business_reg_no || '').replace(/-/g, ''),
    tax_email: entity.tax_email || entity.email || '',
    company_stamp_base64: entity.stamp_base64 || '',
    company_phone: entity.phone || '',
    company_fax: entity.fax || '',
    company_bank_info: entity.bank_info || '',
    // Phase 1.2: entity별 이메일 발신 설정
    email_from_address: entity.email_from_address || '',
    email_from_name: entity.email_from_name || entity.name || '',
  }
}

/**
 * 바로빌 등 외부 Provider에 필요한 corpNum을 entity에서 조회.
 * 바로빌은 단일 파트너 CERTKEY + 회원사별 CorpNum 모델(검증 완료). 각 법인(동산기획·선명·청주)은
 * 자체 사업자번호로 회원사 등록 완료 → entity별 자체 corpNum 사용 (#14 재확정 2026-06-03: 청주도 자체 BRN).
 * 폴백: settings의 company_business_registration_number
 */
export async function getEntityCorpNum(
  db: D1Database,
  entityId: number
): Promise<string> {
  if (entityId && entityId > 0) {
    const entity = await db.prepare(
      'SELECT popbill_corp_num, business_reg_no FROM entities WHERE id = ?'
    ).bind(entityId).first() as any
    if (entity?.popbill_corp_num) return entity.popbill_corp_num
    if (entity?.business_reg_no) return entity.business_reg_no.replace(/-/g, '')
  }
  const row = await db.prepare(
    `SELECT setting_value FROM settings WHERE setting_key = 'company_business_registration_number'`
  ).first() as any
  return (row?.setting_value || '').replace(/-/g, '')
}

/**
 * 바로빌 연동회원 담당자 ID(senderId)를 법인별로 조회.
 * entity_settings(법인별) 우선 → 전역 settings → 'DONGSAN'(entity1 하위호환).
 *
 * ⚠️ 계좌/카드/세금계산서 *조회* API(GetDaily…TransLog·RefreshBankAccount 등)는 이 ID를
 * 필수 파라미터로 받는다. CorpNum(getEntityCorpNum, 법인별)과 **반드시 짝을 맞춰야** 하며,
 * 불일치(예: 선명 corpNum + DONGSAN ID) 시 바로빌 -24005(타법인 담당자)로 수집이 0건이 된다.
 * (등록 API RegistBankAccountEx/RegistCardEx는 ID를 안 보내므로 senderId 무관하게 성공 —
 *  그래서 "바로빌엔 등록됐는데 수집만 안 되는" 증상이 나타남.)
 * kakao.ts·fax.ts와 동일 소스·동일 우선순위를 사용해 멀티법인 일관성 보장.
 */
export async function getEntityBarobillSenderId(
  db: D1Database,
  entityId: number
): Promise<string> {
  if (entityId && entityId > 0) {
    try {
      const row = await db.prepare(
        `SELECT setting_value FROM entity_settings WHERE entity_id = ? AND setting_key = 'barobill_sender_id'`
      ).bind(entityId).first() as { setting_value: string } | null
      if (row?.setting_value) return row.setting_value
    } catch {
      // entity_settings 미존재(마이그 전) → 전역 fallback
    }
  }
  const g = await db.prepare(
    `SELECT setting_value FROM settings WHERE setting_key = 'barobill_sender_id'`
  ).first() as { setting_value: string } | null
  return g?.setting_value || 'DONGSAN'
}
