/**
 * #135: 일련번호 생성 공통 유틸리티
 * MAX+SUBSTR 패턴으로 통일 + UNIQUE 충돌 시 재시도
 */

/**
 * 다음 일련번호를 조회한다 (MAX 기반).
 * @param prefix  번호 접두사 (예: "20260520-", "SHP-20260520-", "20260520-P")
 * @param padLength  시퀀스 자릿수 (기본 3 → "001")
 */
export async function getNextSeqNumber(
  db: D1Database,
  table: string,
  column: string,
  prefix: string,
  padLength: number = 3,
  entityId?: number
): Promise<string> {
  const substrPos = prefix.length + 1
  const entityClause = entityId != null ? ` AND entity_id = ?` : ''
  const binds: any[] = [`${prefix}%`]
  if (entityId != null) binds.push(entityId)
  const row = await db.prepare(`
    SELECT COALESCE(MAX(CAST(SUBSTR(${column}, ${substrPos}) AS INTEGER)), 0) as max_seq
    FROM ${table} WHERE ${column} LIKE ?${entityClause}
  `).bind(...binds).first<{ max_seq: number }>()
  const seq = (row?.max_seq || 0) + 1
  return `${prefix}${String(seq).padStart(padLength, '0')}`
}

/**
 * UNIQUE 충돌 시 번호를 재생성하며 최대 maxRetries번 재시도한다.
 * fn 안에서 getNextSeqNumber + INSERT를 함께 수행해야 한다.
 */
export async function withSeqRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3
): Promise<T> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn()
    } catch (e: any) {
      const isUnique = e.message?.includes('UNIQUE') || e.message?.includes('unique')
      if (isUnique && attempt < maxRetries - 1) continue
      throw e
    }
  }
  throw new Error('Sequence generation failed after max retries')
}
