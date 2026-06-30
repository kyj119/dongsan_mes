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

/**
 * 바로빌 통합 과금 단가코드 (GetChargeUnitCost ChargeCode).
 * 전 서비스 공통 단일 테이블 — KakaoTalk.asmx·SMS.asmx 어느 엔드포인트로 조회해도 동일값.
 * ⚠️ GetChargeUnitCost 시그니처는 (CERTKEY, CorpNum, ChargeCode:int) 단 하나.
 *    (구코드의 ID/ServiceType 파라미터는 현행 WSDL에 존재하지 않음 → 단가 0/오류 원인)
 * 출처: 라이브 prod API 실측 (동산기획 corpNum, 2026-07-01). 가격은 회원사 계약단가.
 *   15=알림톡 7원(최저=알림톡) · 9=SMS 11원 · 17=LMS 23원 · 1·14=110원(MMS) · 3~8,12=55원(팩스).
 * ⚠️ FAX: 55원을 반환하는 코드가 {3~8,12} 다수(전부 동일값). 사용자 확인 팩스=55원.
 *    의미상 격리된 12를 채택(3~8은 연속 변형군). 현재 전부 55원이라 표시값은 코드 무관 동일.
 */
export const BAROBILL_CHARGE_CODE = {
  ALIMTALK: 15, // 알림톡 7원
  SMS: 9,       // 문자 단문 11원
  LMS: 17,      // 문자 장문 23원
  FAX: 12,      // 팩스 1장 55원 (55원 클러스터 {3~8,12} 중 채택)
} as const

/** 바로빌 결과코드(음수) → 한글 사유. 등록/해지/즉시조회·과금 관련. 출처: 개발자센터 오류코드. */
export const BAROBILL_ERROR_MESSAGES: Record<number, string> = {
  // 과금/포인트
  [-26004]: '과금에 실패했습니다.',
  [-26006]: '회원사 충전잔액이 부족합니다.',
  [-26011]: '파트너(연동사) 충전잔액이 부족합니다.',
  // 서비스 상태
  [-51001]: '바로빌 카드/계좌조회 서비스가 신청되지 않았습니다.',
  [-51002]: '이미 신청되어 있습니다.',
  [-51008]: '이미 수집중입니다.',
  // 카드 등록
  [-50101]: '카드를 찾을 수 없습니다.',
  [-50111]: '카드사 코드가 잘못되었습니다.',
  [-50112]: '카드유형이 잘못되었습니다.',
  [-50113]: '카드번호가 잘못되었습니다.',
  [-50114]: '카드사 홈페이지 아이디가 잘못되었습니다.',
  [-50115]: '카드사 홈페이지 비밀번호가 잘못되었습니다.',
  [-50116]: '유효한 카드정보가 아닙니다. 카드정보를 확인하세요.',
  [-50117]: '카드정보 검증에 실패했습니다. 잠시 후 다시 시도하세요.',
  [-50118]: '이미 등록된 카드번호입니다.',
  [-50119]: '수집주기가 잘못되었습니다.',
  [-50120]: '중복된 카드번호는 등록할 수 없습니다.',
  [-50161]: '현대카드(개인)은 카드사 보안(2차인증)으로 서비스가 중단되었습니다.',
  // 계좌 등록
  [-50001]: '계좌를 찾을 수 없습니다.',
  [-50004]: '일일 즉시조회 횟수(10회)를 초과했습니다.',
  [-50211]: '수집주기가 잘못되었습니다.',
  [-50212]: '은행 코드가 잘못되었습니다.',
  [-50213]: '계좌유형이 잘못되었습니다.',
  [-50214]: '계좌번호가 잘못되었습니다.',
  [-50215]: '계좌 비밀번호가 잘못되었습니다.',
  [-50216]: '이 은행은 계좌 비밀번호를 입력하지 않아야 합니다.',
  [-50217]: '빠른조회 아이디가 잘못되었습니다.',
  [-50218]: '이 은행은 빠른조회 아이디를 입력하지 않아야 합니다.',
  [-50219]: '빠른조회 비밀번호가 잘못되었습니다.',
  [-50220]: '이 은행은 빠른조회 비밀번호를 입력하지 않아야 합니다.',
  [-50221]: '사업자번호 또는 주민번호(앞6자리)가 잘못되었습니다.',
  [-50222]: '이 은행은 사업자번호/주민번호를 입력하지 않아야 합니다.',
  [-50223]: '유효한 계좌정보가 아닙니다. 계좌정보를 확인하세요.',
  [-50224]: '계좌정보 검증에 실패했습니다. 잠시 후 다시 시도하세요.',
  [-50225]: '이미 등록된 계좌번호입니다.',
  [-50226]: '간편조회(빠른조회) 서비스에 등록되지 않은 계좌입니다.',
  [-50229]: '중복된 계좌번호는 등록할 수 없습니다.',
}

/** 바로빌 결과코드 → "사유 (코드)" 형태 메시지. 미등록 코드는 코드만. */
export function barobillErrorMessage(code: number): string {
  const msg = BAROBILL_ERROR_MESSAGES[code]
  return msg ? `${msg} (코드 ${code})` : `바로빌 오류 (코드 ${code})`
}
