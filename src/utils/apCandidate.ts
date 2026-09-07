// ============================================================================
// 통장 출금 → 미등록 매입 후보 판정 (순수 함수)
// ----------------------------------------------------------------------------
// ★ 왜 있는가 (2026-09-07) — 발주 등록이 **동산 08-06 · 선명 07-31 이후 0건**이다.
//   통장·카드·판매는 정상 수집인데 매입만 끊겨, 재고가 나가기만 하고 들어오지 않는다
//   (선명 재고 228행 중 28행이 음수 · 최저 −983). 7월까지도 사람이 몰아서 넣고 있었고
//   (6월분 167건 중 73건을 7/15에, 48건을 8/10에 입력) **한 번 밀리자 벽이 되어 멈췄다**.
//   그래서 「사람이 더 부지런히」가 아니라 **돈이 나갔으면 후보가 뜨게** 만든다.
//
// ★ 이 파일은 DB 를 보지 않는다 — 픽스처로 그대로 테스트된다(`test:ap-candidate`).
//   판정이 틀려도 200 이 나오는 종류라 값 대조만이 잡는다.
//
// ★ 통장 적요는 **이름을 자른다**. `홈> 농협영광엔터김성` ← 「영광엔터테인먼트」(발주 9건).
//   전체 포함으로만 찾으면 못 잡아 접두 5자 매칭을 함께 쓴다.
//
// ⚠️ 매입 확정어를 **가장 먼저** 본다. 「외상대출금」이 제외어 「대출」에 걸려
//   운산직물 1,330만이 통째로 빠지는 버그가 실제로 있었다(2026-09-07 발견).
//
// ⚠️ 거래처 풀은 **전체 활성 거래처**다. 발주 이력이 있는데 `client_type='SALES'` 인 곳이 있어
//   (영광엔터테인먼트 발주 9건 · 현대광고기획(배너) 7건) 매입처로만 좁히면 통째로 놓친다.
// ============================================================================

/** 통장 출금 1건 — 판정에 필요한 것만 */
export interface ApTx {
  /** bank_transactions.counterpart_name — 통장 적요(은행이 자른 이름이 섞인다) */
  counterpart_name?: string | null
  /** expense_categories.name — 이미 분류된 계정. 없으면 빈 문자열 */
  category_name?: string | null
  entity_id?: number | null
}

/** 거래처 1곳 — `clients` + 발주 건수 */
export interface ApClient {
  id: number
  client_name: string
  /** 이 거래처로 낸 발주 건수. 0 이면 매출 명단에만 있는 곳이다. */
  po_count: number
  last_po?: string | null
}

/** 준비된 거래처 풀 1행 — 정규화 이름을 미리 계산해 둔다(출금마다 다시 만들지 않는다). */
export interface ApPoolEntry {
  norm: string
  client: ApClient
}

export type ApVerdict = 'STRONG' | 'LIKELY' | 'UNKNOWN' | 'EXCLUDE'

export interface ApResult {
  verdict: ApVerdict
  /** 왜 이렇게 판정했나 — 화면에 그대로 보여 준다. 사람이 뒤집을 수 있어야 한다. */
  reasons: string[]
  client_id: number | null
  client_name: string
  po_count: number
  /** 거래처 이름이 **통째로** 맞았나. false = 잘린 이름·짧은 이름으로 맞춘 것 */
  exact: boolean
}

/** 은행이 적요 앞에 붙이는 잡음. 떼고 나서 이름을 찾는다. */
const BANK_NOISE = ['홈>', '홈)', '홈】', '타행', '기업', '농협', '국민', '하나', '신한', '우리',
  '카카오', '케이', '새마을', '수협', '부산', '대구', '토스', 'SC', '씨티']

/** ★매입 확정어 — 다른 어떤 규칙보다 먼저 본다(위 주석의 「외상대출금」 사고). */
const AP_OVERRIDE = ['외상', '물대', '미지급', '매입대', '자재대', '원단대']
/** 계정만으로 매입성이 확정되는 것 */
const AP_CATEGORY = new Set(['외주가공비'])
/** 매입일 수 있다는 약한 신호 */
const AP_HINT = ['대금', '매입', '자재', '원단', '거래', '잔금', '수리대', '도색']

/** 계정이 이러면 매입이 아니다 */
const NOT_AP_CATEGORY = new Set(['급여', '4대보험', '차입금상환', '가수금', '부가세', '세금과공과',
  '이자비용', '리스료', '지급임차료', '수도광열비', '통신비', '복리후생비', '식대', '교육훈련비',
  '차량유지비', '유류비', '공제부금', '보험료', '지급수수료', '운반비', '유형자산취득'])
/** 적요가 이러면 매입이 아니다 */
const NOT_AP_KEYWORD = ['급여', '상여', '사회보험', '건강보험', '국민연금', '고용보험', '산재', '퇴직',
  '부가가치세', '법인세', '소득세', '지방소득', '원천세', '주민세', '국세', '지방세', '세외수입',
  '카드', '대출', '차입', '이자', '임차료', '월세', '전기', '한국전력', '수도', '가스',
  '통신', '인터넷', '보험', '자금이체', '계좌간', '정기예금', '적금', '수수료', '연금',
  '상조', '기부', '후원', '축의', '조의', '가수금', '렌탈', '캐피탈', '리스']

/** 법인이 자기 이름으로 빠져나간 것 = 계좌 이동. 법인간 매입(선명→동산)은 살려야 하므로 법인별로 본다. */
const ENTITY_SELF: Record<number, string[]> = {
  1: ['동산기획'],
  2: ['선명커뮤니케이션', '선명'],
  3: ['동산기획청주'],
}

/**
 * 접두 매칭 길이. 통장 적요가 이름을 잘라 쓴다 — 「영광엔터김성」 ← 「영광엔터테인먼트」는
 * 앞 **4자**만 공통이라 5자로는 못 잡는다(2026-09-07 실측).
 * ⚠️ 4자는 느슨하므로 **발주 이력이 있는 거래처에만** 허용한다. 전체 2,890곳에 4자 접두를 풀면
 *    오탐이 쏟아진다([[feedback-bank-name-matching-traps]] — 이름매칭 오탐 17.6% 전례).
 */
const PREFIX_LEN = 4

function stripBankNoise(s: string): string {
  let out = s || ''
  for (const b of BANK_NOISE) out = out.split(b).join('')
  return out.trim()
}

/** 법인격·구분자를 떼고 비교 가능한 형태로. 「주식회사 가유텍스타일」 → 「가유텍스타일」 */
export function normalizeName(s: string | null | undefined): string {
  const stripped = String(s ?? '').replace(/\((주|유|합|재)\)|주식회사|㈜|（주）/g, '')
  return stripped.replace(/[\s\-_.,·/()]/g, '')
}

/**
 * 거래처 풀 준비. 긴 이름이 먼저 오게 정렬해 **가장 구체적인 이름이 이긴다**.
 * ⚠️2글자 이름(호홍·바로·투맨)은 적요 아무 데나 걸려 오탐을 낸다 — **발주 이력이 있을 때만** 넣고
 *   판정에서 LIKELY 로 낮춘다. 아예 빼면 발주 16건짜리 「호홍 주식회사」가 통째로 사라진다.
 */
export function buildClientPool(clients: ApClient[]): ApPoolEntry[] {
  const pool: ApPoolEntry[] = []
  for (const c of clients || []) {
    const n = normalizeName(c.client_name)
    if (n.length >= 3 || (n.length === 2 && (Number(c.po_count) || 0) > 0)) {
      pool.push({ norm: n, client: c })
    }
  }
  return pool.sort((a, b) => b.norm.length - a.norm.length)
}

/** 적요에서 거래처를 찾는다. 전체 포함이 안 되면 접두 5자로 한 번 더 본다. */
function findClient(memoNorm: string, pool: ApPoolEntry[]):
  { client: ApClient; exact: boolean } | null {
  let best: { client: ApClient; exact: boolean; score: number } | null = null
  for (const { norm, client } of pool) {
    let hit = 0
    let exact = false
    if (norm && memoNorm.includes(norm)) {
      hit = norm.length; exact = true
    } else if ((Number(client.po_count) || 0) > 0 && norm.length > PREFIX_LEN
               && memoNorm.includes(norm.slice(0, PREFIX_LEN))) {
      // 잘린 이름 — 발주 이력이 있는 곳에만 허용한다(위 PREFIX_LEN 주석)
      hit = PREFIX_LEN
    } else continue
    // 길게 맞은 것 우선, 같으면 발주 이력이 많은 쪽
    const score = hit * 1000 + Math.min(Number(client.po_count) || 0, 999)
    if (!best || score > best.score) best = { client, exact, score }
  }
  return best ? { client: best.client, exact: best.exact } : null
}

/**
 * 출금 1건 판정. **순수 함수** — 같은 입력이면 항상 같은 결과다.
 *
 * @param tx   출금(적요·계정·법인)
 * @param pool `buildClientPool` 로 준비한 거래처 풀
 */
export function classifyWithdrawal(tx: ApTx, pool: ApPoolEntry[]): ApResult {
  const memo = String(tx.counterpart_name ?? '')
  const category = String(tx.category_name ?? '')
  const entityId = Number(tx.entity_id) || 0
  const memoNorm = normalizeName(stripBankNoise(memo))

  const found = findClient(memoNorm, pool)
  const client = found?.client ?? null
  const exact = found?.exact ?? false
  const poCount = Number(client?.po_count) || 0
  const isSupplier = poCount > 0
  // 약한 근거 = **잘린 이름**(접두 매칭)이거나 **2글자** 거래처. 확실로 올리지 않는다.
  //   ⚠️2글자(호홍·바로·투맨)는 적요 아무 데나 걸린다 — 「홈> 기업**바로**장선부」가 실제 사례다.
  //   3글자 정확일치(티피엠·지엘티)는 충분히 구체적이라 낮추지 않는다.
  const weak = !!client && (!exact || normalizeName(client.client_name).length <= 2)

  const reasons: string[] = []
  const base = (): ApResult => ({
    verdict: 'UNKNOWN', reasons, client_id: client?.id ?? null,
    client_name: client?.client_name ?? '', po_count: poCount, exact,
  })

  const apHard = AP_OVERRIDE.some((k) => memo.includes(k)) || AP_CATEGORY.has(category)
  const selfEntity = (ENTITY_SELF[entityId] || [])
    .some((x) => { const n = normalizeName(x); return !!n && memoNorm.includes(n) })

  let verdict: ApVerdict
  if (apHard) {
    verdict = (isSupplier && !weak) ? 'STRONG' : 'LIKELY'
    reasons.push(AP_CATEGORY.has(category) ? `계정=${category}` : '매입 확정어')
  } else if (selfEntity) {
    verdict = 'EXCLUDE'; reasons.push('자기법인 이체')
  } else if (NOT_AP_CATEGORY.has(category)) {
    verdict = 'EXCLUDE'; reasons.push(`계정=${category}`)
  } else if (NOT_AP_KEYWORD.some((k) => memo.includes(k))) {
    verdict = 'EXCLUDE'; reasons.push('적요 비매입어')
  } else if (isSupplier && !weak) {
    verdict = 'STRONG'
  } else if (client) {
    verdict = 'LIKELY'
  } else if (AP_HINT.some((k) => memo.includes(k))) {
    verdict = 'LIKELY'; reasons.push('적요 매입어')
  } else {
    verdict = 'UNKNOWN'; reasons.push('판정불가 — 미등록 거래처일 수 있음')
  }

  if (client && verdict !== 'EXCLUDE') {
    reasons.push(`${client.client_name}(발주 ${poCount}건${exact ? '' : ' · 적요가 잘린 이름'})`)
    if (!isSupplier) reasons.push('발주 이력 없음 — 매출거래처 명단에만 있음')
  }

  return { ...base(), verdict }
}

/** 후보인가(= 큐에 남는가). EXCLUDE 만 빠진다. */
export function isCandidate(v: ApVerdict): boolean {
  return v !== 'EXCLUDE'
}
