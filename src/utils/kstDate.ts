/**
 * 업무일(영업일) 기준 KST SQL 조각 헬퍼 — #366.
 *
 * D1/SQLite의 `date('now')`·`CURRENT_TIMESTAMP`은 **항상 UTC**라, "업무 의미를 갖는 날짜"
 * (주문일·납기·처분일·'오늘/이번달' 집계 등)를 비교/저장할 때는 반드시 +9h(KST) 보정해야
 * KST 00:00~09:00 입력이 전일로 어긋나는 off-by-one을 막는다.
 *
 * 정책: **저장=UTC(불변·감사 표준), 업무일 비교/집계=KST**.
 *  - 신규 업무일 쿼리는 raw `date('now')` 대신 이 헬퍼를 사용할 것 (재발 방지의 단일 소스).
 *  - `created_at`/`updated_at` 같은 순수 감사 타임스탬프는 UTC 유지가 정상(보정 대상 아님).
 *  - 표시(프론트)는 layout.ts `formatKST`로 UTC→KST 변환.
 */

/** KST 기준 오늘 날짜식. 예: kstDate() → `date('now', '+9 hours')`, kstDate("'+2 days'") → `date('now', '+9 hours', '+2 days')` */
export function kstDate(...mods: string[]): string {
  return `date('now', '+9 hours'${mods.length ? ', ' + mods.join(', ') : ''})`
}

/** UTC 타임스탬프 컬럼을 KST 업무일(date)로 변환. 예: kstDateOf('created_at') → `date(created_at, '+9 hours')` */
export function kstDateOf(col: string, ...mods: string[]): string {
  return `date(${col}, '+9 hours'${mods.length ? ', ' + mods.join(', ') : ''})`
}

/** KST 기준 'YYYY-MM'(월). 예: kstMonth() → `strftime('%Y-%m','now','+9 hours')`, kstMonth('created_at') → `strftime('%Y-%m', created_at, '+9 hours')` */
export function kstMonth(col: string = "'now'", ...mods: string[]): string {
  return `strftime('%Y-%m', ${col}, '+9 hours'${mods.length ? ', ' + mods.join(', ') : ''})`
}

// ── JS측 헬퍼 (SQL 조각이 아닌 문자열 생성 — 채번·업무일 기본값·범위 계산의 단일 소스) ──
// `new Date().toISOString().slice(0,10)`은 UTC라 KST 00~09시에 전날이 됨 → 아래 헬퍼로만 생성할 것.

/** KST 기준 'YYYY-MM-DD'. offsetDays로 어제(-1)/내일(+1) 계산. */
export function kstYmd(offsetDays = 0): string {
  return new Date(Date.now() + (9 * 3600 + offsetDays * 86400) * 1000).toISOString().slice(0, 10)
}

/** KST 기준 'YYYYMMDD' — 문서번호 프리픽스용. */
export function kstYmdCompact(): string {
  return kstYmd().replace(/-/g, '')
}

/** KST 기준 'YYYY-MM'. */
export function kstYm(): string {
  return kstYmd().slice(0, 7)
}

/** KST 기준 연도(number). */
export function kstYear(): number {
  return Number(kstYmd().slice(0, 4))
}

/** KST 기준 'YYYYMMDDHHMMSS' — 초 단위 채번용(예: 실사 IC-번호). */
export function kstStamp14(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().replace(/[-:T]/g, '').slice(0, 14)
}
