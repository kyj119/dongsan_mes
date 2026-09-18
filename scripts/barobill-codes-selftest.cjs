#!/usr/bin/env node
/**
 * 바로빌 메시징 상태·오류 코드 자체검증 — `src/constants/barobillMessagingCodes.ts`
 *
 * ★왜 있는가 (2026-09-18)
 *   실발송 테스트에서 알림톡 상세 조회가 `SendStatus: -10101` 을 돌려주는데 **뜻을 몰라 도착 여부를
 *   판정할 수 없었다.** 공식 코드표를 받아 보니 두 가지가 한꺼번에 드러났다 —
 *     ① `-10101 = 해당 발송정보가 없습니다` = **전송 상태가 아니라 조회 실패**.
 *        원인은 `GetSendKakaotalk` 파라미터를 `ReceiptNum` 으로 보낸 것(문서상 이름은 `SendKey`).
 *     ② 문자 상태 라벨이 **한 칸씩 밀려 있었다** — 공식은 0=전송중·1=전송완료인데
 *        화면은 0=대기·1=전송중·2=성공 으로 그리고 있었다(= 완료를 전송중으로 표시).
 *
 *   이 종류는 타입체크·smoke 를 전부 통과한다(라벨도 유효한 문자열이다). 값 대조만이 잡는다.
 *
 * 검사
 *   ① 양수=상태 / 음수=오류 로 갈린다
 *   ② 실측으로 받은 코드의 뜻이 문서와 같다(-10101 · -24005 성격)
 *   ③ 문자·알림톡 상태값이 공식 샘플코드와 일치(0 전송중 · 1 전송완료)
 *   ④ ★모르는 값을 「성공」으로 만들지 않는다
 *
 * 실행: node scripts/barobill-codes-selftest.cjs   (실패 시 exit 1) — test:calc 편입
 */
'use strict'
const path = require('path')
const { compileTs } = require('./lib/compile-ts.cjs')

const { mod, cleanup } = compileTs(path.join(__dirname, '..', 'src', 'constants', 'barobillMessagingCodes.ts'), { bundle: true })
const { interpretSendStatus, KAKAO_SEND_STATUS, SMS_SEND_STATE, BAROBILL_MESSAGING_ERROR } = mod

let fails = 0
const check = (name, cond, detail) => {
  if (cond) console.log('  ✓', name)
  else { fails++; console.log('  ✗', name, detail !== undefined ? '→ ' + JSON.stringify(detail) : '') }
}

console.log('[barobill-codes] ① 양수=상태 · 음수=오류')
{
  const sending = interpretSendStatus('0', 'kakao')
  const done = interpretSendStatus(1, 'kakao')
  const err = interpretSendStatus('-10101', 'kakao')
  check('0 → 전송중(sending)', sending.kind === 'sending' && sending.label === '전송중', sending)
  check('1 → 전송완료(done)', done.kind === 'done' && done.label === '전송완료', done)
  check('음수 → failed 로 분류', err.kind === 'failed', err)
  check('음수는 상태표가 아니라 오류표에서 찾는다', err.label.indexOf('발송정보') >= 0, err)
}

console.log('[barobill-codes] ② 실측 코드의 뜻')
{
  check('-10101 = 해당 발송정보가 없습니다.', BAROBILL_MESSAGING_ERROR['-10101'] === '해당 발송정보가 없습니다.', BAROBILL_MESSAGING_ERROR['-10101'])
  check('-10191 = 발신번호가 올바르지 않습니다.', BAROBILL_MESSAGING_ERROR['-10191'] === '발신번호가 올바르지 않습니다.')
  check('-10107 = 잘못된 전화번호(문자 실패코드)', BAROBILL_MESSAGING_ERROR['-10107'] === '잘못된 전화번호')
  check('-31314 = 승인되지 않은 템플릿입니다.', BAROBILL_MESSAGING_ERROR['-31314'] === '승인되지 않은 템플릿입니다.')
  check('-31302 = 채널을 찾을 수 없습니다.', BAROBILL_MESSAGING_ERROR['-31302'] === '채널을 찾을 수 없습니다.')
  check('코드표가 충분히 실렸다(60건 이상)', Object.keys(BAROBILL_MESSAGING_ERROR).length >= 60, Object.keys(BAROBILL_MESSAGING_ERROR).length)
}

console.log('[barobill-codes] ③ 공식 상태값과 일치')
{
  check('알림톡 0·1·2·3·4 전부 있다',
    ['0', '1', '2', '3', '4'].every((k) => typeof KAKAO_SEND_STATUS[k] === 'string'), KAKAO_SEND_STATUS)
  check('알림톡 2 = 전송실패 · 3 = 예약대기 · 4 = 예약취소',
    KAKAO_SEND_STATUS['2'] === '전송실패' && KAKAO_SEND_STATUS['3'] === '예약대기' && KAKAO_SEND_STATUS['4'] === '예약취소')
  check('★문자는 0·1 만 상태다(2 는 상태가 아니다)',
    SMS_SEND_STATE['0'] === '전송중' && SMS_SEND_STATE['1'] === '전송완료' && SMS_SEND_STATE['2'] === undefined, SMS_SEND_STATE)
  const sms1 = interpretSendStatus(1, 'sms')
  check('★문자 1 = 전송완료 (종전 화면은 「전송중」으로 그렸다)', sms1.label === '전송완료' && sms1.kind === 'done', sms1)
  const smsFail = interpretSendStatus(-10104, 'sms')
  check('문자 음수 = 실패코드 해석(-10104 음영지역)', smsFail.kind === 'failed' && smsFail.label === '음영지역', smsFail)
}

console.log('[barobill-codes] ④ 모르는 값을 성공으로 만들지 않는다')
{
  const unk = interpretSendStatus(99, 'kakao')
  check('모르는 양수 → unknown', unk.kind === 'unknown', unk)
  check('모르는 양수를 done 이라 하지 않는다', unk.kind !== 'done')
  const unkErr = interpretSendStatus(-99999, 'sms')
  check('모르는 음수도 failed 로만 분류하고 뜻은 코드로 남긴다',
    unkErr.kind === 'failed' && unkErr.label.indexOf('-99999') >= 0, unkErr)
  for (const v of [null, undefined, '', 'abc']) {
    check('값이 없거나 숫자가 아니면 null (' + JSON.stringify(v) + ')', interpretSendStatus(v, 'kakao') === null)
  }
}

cleanup && cleanup()
console.log(fails ? `[barobill-codes] FAIL ${fails}건` : '[barobill-codes] OK — 상태/오류 구분·실측 코드·공식 상태값·미지값 처리 전부 통과')
process.exit(fails ? 1 : 0)
