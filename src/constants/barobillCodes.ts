/**
 * 바로빌 계좌조회/카드조회 수집등록 연동 코드값
 * (RegistBankAccountEx / RegistCardEx 파라미터용)
 * 출처: 바로빌 개발자센터 API 레퍼런스(계좌조회/카드조회), 2026-06-23 검증.
 *
 * ⚠️ 함정:
 *  - 은행/카드사 코드는 숫자가 아니라 영문 코드 (KB, SHINHAN, HYUNDAI …)
 *  - 카드 등록 파라미터명은 `CollectCylce` (바로빌 철자 오타) — barobillCard.ts 참조
 *  - 카카오뱅크·토스뱅크는 바로빌 계좌조회 미지원
 */

/** MES 은행 숫자코드(금융결제원 4자리) → 바로빌 영문 은행코드. 미정의=바로빌 미지원 */
export const MES_TO_BAROBILL_BANK: Record<string, string> = {
  '0002': 'KDB',        // 산업은행
  '0003': 'IBK',        // 기업은행
  '0004': 'KB',         // 국민은행
  '0007': 'SUHYUP',     // 수협은행
  '0011': 'NH',         // 농협은행
  '0020': 'WOORI',      // 우리은행
  '0023': 'SC',         // SC제일은행
  '0027': 'CITI',       // 씨티은행
  '0031': 'DGB',        // 대구은행
  '0032': 'BUSANBANK',  // 부산은행
  '0034': 'KJBANK',     // 광주은행
  '0035': 'EJEJUBANK',  // 제주은행
  '0037': 'JBBANK',     // 전북은행
  '0039': 'KNBANK',     // 경남은행
  '0045': 'KFCC',       // 새마을금고
  '0048': 'CU',         // 신협
  '0071': 'EPOST',      // 우체국
  '0081': 'HANA',       // 하나은행
  '0089': 'KBANK',      // 케이뱅크
  // 0090 카카오뱅크 · 0092 토스뱅크: 바로빌 계좌조회 미지원
}

/** MES 은행 숫자코드 → 바로빌 영문코드. 미지원 시 null. */
export function toBarobillBank(mesBankCode: string): string | null {
  return MES_TO_BAROBILL_BANK[mesBankCode] ?? null
}

/**
 * 카드사 한글명(프론트 #cardCompany value) → 바로빌 CardCompany 코드.
 * 바로빌 지원: BC/HANA(하나SK)/HYUNDAI/KB/CITI/LOTTE/NH/SAMSUNG/SHINHAN/WOORI/SUHYUP/KJBANK/JBBANK
 */
export const BAROBILL_CARD_COMPANY_CODES: Record<string, string> = {
  '신한': 'SHINHAN',
  '삼성': 'SAMSUNG',
  '현대': 'HYUNDAI',
  'KB국민': 'KB',
  '롯데': 'LOTTE',
  '하나': 'HANA',
  '우리': 'WOORI',
  'NH농협': 'NH',
  'BC': 'BC',
}

/** 카드사 한글명 → 바로빌 코드. 미지원 시 null. */
export function toBarobillCardCompany(name: string): string | null {
  return BAROBILL_CARD_COMPANY_CODES[name] ?? null
}

/**
 * 수집주기. 계좌=CollectCycle(필수), 카드=CollectCylce(바로빌 철자, 선택·미입력 시 DAY1).
 * 계좌만 분(MINUTE)·시간(HOUR) 단위 지원, 카드는 DAY1만.
 */
export const BAROBILL_COLLECT_CYCLE = {
  MINUTE10: 'MINUTE10',
  MINUTE30: 'MINUTE30',
  HOUR1: 'HOUR1',
  HOUR4: 'HOUR4',
  DAY1: 'DAY1',
  DEFAULT: 'DAY1',
} as const

/** 계좌 구분 (BankAccountType) */
export const BAROBILL_BANK_ACCOUNT_TYPE = {
  CORPORATE: 'C', // 법인계좌
  PERSONAL: 'P',  // 개인계좌
} as const

/** 카드 구분 (CardType) */
export const BAROBILL_CARD_TYPE = {
  CORPORATE: 'C', // 법인카드
  PERSONAL: 'P',  // 개인카드
} as const
