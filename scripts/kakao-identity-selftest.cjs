#!/usr/bin/env node
/**
 * 발신 정체성 해석 자체검증 — `src/utils/kakaoIdentity.ts`
 *
 * ★왜 있는가 (2026-09-18 prod 실측)
 *   전역 `settings.kakao_sender_num` 이 **선명 번호(01043481973)**, 채널도 **@sunm2596** 이다.
 *   법인별 override 는 「빈값이면 전역 폴백」이었으므로, 자기 설정이 없는 법인(청주 3)이 발송하면
 *   **고객에게 남의 회사 번호·채널로** 나간다. 화면에는 아무 표시도 안 난다.
 *
 *   폴백이 성립하는 값과 아닌 값이 섞여 있는 게 원인이다 —
 *     정책(enabled·alt_send_type)은 상속하고, 정체성(sender_num·channel_id)은 상속하지 않는다.
 *
 *   타입체크·smoke 는 이걸 절대 못 잡는다(번호도 유효한 문자열이다). 값 대조만이 잡는다.
 *
 * 실행: node scripts/kakao-identity-selftest.cjs   (실패 시 exit 1) — test:calc 편입
 */
'use strict'
const path = require('path')
const { compileTs } = require('./lib/compile-ts.cjs')

const { mod, cleanup } = compileTs(path.join(__dirname, '..', 'src', 'utils', 'kakaoIdentity.ts'), { bundle: true })
const { resolveKakaoIdentity, KAKAO_IDENTITY_KEYS } = mod

let fails = 0
const check = (name, cond, detail) => {
  if (cond) console.log('  ✓', name)
  else { fails++; console.log('  ✗', name, detail !== undefined ? '→ ' + JSON.stringify(detail) : '') }
}

// prod 실측값
const GLOBAL = {
  kakao_enabled: '1',
  kakao_sender_num: '01043481973',        // ← 선명 번호가 전역에 있다
  kakao_channel_id: '@sunm2596',          // ← 선명 채널
  kakao_alt_send_type: 'C',
}
const 동산 = { kakao_enabled: '1', kakao_sender_num: '01043001972', kakao_channel_id: '@실사출력_깃발_베너_현수막', kakao_alt_send_type: 'C' }
const 선명 = { kakao_enabled: '1', kakao_sender_num: '01043481973', kakao_channel_id: '@sunm2596', kakao_alt_send_type: 'C' }
const 청주 = {}                            // ← 자기 설정이 없다(실측)

console.log('[kakao-identity] ① 자기 설정이 있는 법인은 그대로')
{
  const r = resolveKakaoIdentity(GLOBAL, 동산)
  check('동산 발신번호 = 자기 것', r.kakao_sender_num === '01043001972', r)
  check('동산 채널 = 자기 것', r.kakao_channel_id === '@실사출력_깃발_베너_현수막', r)
  const r2 = resolveKakaoIdentity(GLOBAL, 선명)
  check('선명도 자기 것', r2.kakao_sender_num === '01043481973' && r2.kakao_channel_id === '@sunm2596', r2)
}

console.log('[kakao-identity] ② ★자기 설정이 없는 법인은 남의 번호를 물려받지 않는다')
{
  const r = resolveKakaoIdentity(GLOBAL, 청주)
  check('청주 발신번호가 비어 있다(선명 번호가 새지 않는다)', r.kakao_sender_num === '', r)
  check('청주 채널도 비어 있다', r.kakao_channel_id === '', r)
  check('정책(사용여부)은 전역 상속 — 1', r.kakao_enabled === '1', r)
  check('정책(대체발송)도 전역 상속 — C', r.kakao_alt_send_type === 'C', r)
}

console.log('[kakao-identity] ③ 부분 설정 — 번호만 있고 채널이 없는 법인')
{
  const r = resolveKakaoIdentity(GLOBAL, { kakao_sender_num: '0421234567' })
  check('있는 번호는 쓴다', r.kakao_sender_num === '0421234567', r)
  check('없는 채널은 비운다(전역 채널로 새지 않는다)', r.kakao_channel_id === '', r)
}

console.log('[kakao-identity] ④ 빈 문자열은 「없음」과 같다')
{
  const r = resolveKakaoIdentity(GLOBAL, { kakao_sender_num: '', kakao_channel_id: '   ' ? '' : '' })
  check('빈 문자열 override 는 전역을 끌어오지 않는다', r.kakao_sender_num === '', r)
}

console.log('[kakao-identity] ⑤ 법인 지정이 없는 호출은 종전 그대로(전역 발송)')
{
  const r = resolveKakaoIdentity(GLOBAL, null)
  check('전역값 보존', r.kakao_sender_num === '01043481973' && r.kakao_channel_id === '@sunm2596', r)
}

console.log('[kakao-identity] ⑥ 상속 금지 키 목록')
{
  check('정체성 키 = sender_num · channel_id 둘',
    Array.isArray(KAKAO_IDENTITY_KEYS) && KAKAO_IDENTITY_KEYS.length === 2
    && KAKAO_IDENTITY_KEYS.includes('kakao_sender_num') && KAKAO_IDENTITY_KEYS.includes('kakao_channel_id'),
    KAKAO_IDENTITY_KEYS)
  check('★정책 키는 목록에 없다(상속되어야 한다)',
    !KAKAO_IDENTITY_KEYS.includes('kakao_enabled') && !KAKAO_IDENTITY_KEYS.includes('kakao_alt_send_type'))
}

cleanup && cleanup()
console.log(fails ? `[kakao-identity] FAIL ${fails}건` : '[kakao-identity] OK — 정체성 비상속·정책 상속 전부 통과')
process.exit(fails ? 1 : 0)
