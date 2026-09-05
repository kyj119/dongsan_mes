// 통장 상대방명 판정 — 정규화 · 은행앱 접두 제거 · 거래처 아님 판별 (2026-09-06)
//
// ■ 왜 라우트 밖으로 뺐나
//   「이 이름이 어느 거래처인가」는 자금 매칭 전체가 딛는 판정인데 2,700줄 라우트 파일 안에 있었다.
//   여기 있는 함수는 전부 입력→출력만 보므로 scripts/counterpart-selftest.cjs 가 픽스처로 직접 때린다.
//   (CLAUDE.md §조용한 격하 "판정을 순수 모듈로 뺀다")
//
// ■ prod 실측 (2026-09-06) — 매칭 백로그 2,240건 41.2억을 분류해서 나온 수치
//   · 은행앱 접두(`홈) `·은행명)에 막혀 매칭에 도달조차 못 한 것 = 118건 752,300,935원
//   · 카드 매출 정산금(가맹점번호)이 UNMATCHED 에 쌓여 사람 눈을 가린 것 = 428건 537,964,046원
//   · 전각 괄호 `（주）` 가 반각 제거 규칙을 빠져나가 영영 안 맞던 것 = 3건 30,241,200원

export function normalizeCounterpart(s: string | null | undefined): string {
  return String(s ?? '')
    // ★전각 괄호도 같이 지운다 — 은행 표기에 「（주）애니룩스」처럼 전각이 섞여 온다.
    //   반각만 지우면 「주애니룩스」가 남아 「애니룩스」와 영영 안 맞는다(prod 3건 3,024만).
    .replace(/주식회사|유한회사|합자회사|합명회사|[(（]주[)）]|[(（]유[)）]|㈜/g, '')
    .replace(/[\s()（）[\]{}.,\-_/·:'"]/g, '')
    .toLowerCase()
}

// 은행앱 표기 접두 — 「홈) 기업(주)정운교역」처럼 이체 경로와 은행명이 상호 앞에 붙어 온다.
//   ★거래 쪽에만 쓴다. 거래처명에 적용하면 '신한은행'·'기업은행' 같은 실제 상호가 깨진다.
const BANK_PREFIXES = [
  '기업', '국민', '농협', '하나', '신한', '우리', '새마을', '수협', '부산', '광주', '전북',
  '제주', '카카오뱅크', '카카오', '토스', '씨티', '케이뱅크', '산업', '대구', '경남', '신협', '우체국', '저축',
]
// ⚠️ 리터럴 정규식으로 쓴다. new RegExp 문자열이면 '\S' 가 JS 문자열 단계에서 'S' 로 죽어
//    (?=S) 가 되고, 조용히 아무것도 안 벗긴다(실제로 한 번 당했다).
const BANK_PREFIX_RE = new RegExp('^(' + BANK_PREFIXES.join('|') + ')(?=[^\\s])')

/**
 * 통장 상대방명에서 은행앱이 붙인 접두를 벗긴다: `홈) ` → 은행명 → 날짜(4자리).
 * prod 실측(2026-09-06): 이 접두 때문에 **118건 752,300,935원**이 매칭에 도달조차 못 하고 있었다.
 * 벗긴 결과가 비면 원문을 돌려준다(은행명이 곧 상호인 경우 보호).
 */
export function stripBankPrefix(s: string | null | undefined): string {
  let t = String(s ?? '').replace(/^\s*홈\s*[)）]\s*/, '').trim()
  const m = t.match(BANK_PREFIX_RE)
  if (m) {
    const rest = t.slice(m[1].length).trim()
    if (rest) t = rest
  }
  // 「0521유경컴퍼니」처럼 날짜가 앞에 붙는 표기 — 숫자만 남는 경우(계좌번호)는 건드리지 않는다.
  const noDate = t.replace(/^\d{4}(?=[^\d])/, '').trim()
  if (noDate) t = noDate
  return t
}

/**
 * 카드사 정산 입금(가맹점번호)·계좌번호 표기 — 거래처 수금이 아니라서 매칭 대상이 아니다.
 *
 * ★둘을 가르는 기준은 **카드사 표식**이다. 숫자만으로는 못 가린다 —
 *   `60298020073142`(대출 계좌)도 `756921567BC`(BC 가맹점)도 둘 다 긴 숫자다.
 *   기능상 둘 다 IGNORED 로 가지만 **원장에 남는 사유가 달라지므로** 라벨이 틀리면 안 된다.
 *   카드 = 브랜드 접두가 있거나 `BC` 로 끝나는 것 · 그 외 긴 숫자 = 계좌번호.
 */
const CARD_BRAND_RE = /^(KB|국민|하나|신한|삼성|롯데|현대|현|우리|NH|농협|씨티|비씨|BC)\d{6,}$/
const CARD_BC_SUFFIX_RE = /^\d{6,}BC$/
const ACCOUNT_NO_RE = /^\d[\d-]{8,}$/
export function isNonCounterpartName(s: string | null | undefined): 'CARD' | 'ACCOUNT' | null {
  const flat = String(s ?? '').replace(/\s/g, '')
  if (!flat) return null
  if (CARD_BRAND_RE.test(flat) || CARD_BC_SUFFIX_RE.test(flat)) return 'CARD'
  if (ACCOUNT_NO_RE.test(flat)) return 'ACCOUNT'
  return null
}
