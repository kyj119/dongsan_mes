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
            stamp_base64, bank_info, fax
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
  }
}

/**
 * 팝빌 Provider 생성에 필요한 corpNum을 entity에서 조회.
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
