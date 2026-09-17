#!/usr/bin/env node
/**
 * 배송 알림 정책 자체검증 — `src/utils/shipmentNotice.ts`
 *
 * ★왜 있는가 (2026-09-18)
 *   판정이 두 벌이었다 — 서버 자동 발송은 코드 하드코딩 맵(배송방법 축), 화면 기본 템플릿은
 *   DB 테이블(섹션 축). 축이 달라 **퀵·용차 섹션에 「방문 수령 준비 완료」**가 걸려 있었다
 *   (우리가 가져다 주는 건인데 「방문 수령이 가능합니다」로 나간다). 최다 배송수단인
 *   방문수령(583건)은 `etc` 섹션이라 기본 템플릿이 아예 없었다.
 *
 *   이 종류는 타입체크·smoke 를 전부 통과한다 — 「방문 수령 준비 완료」도 유효한 문자열이다.
 *   값 대조만이 잡는다.
 *
 * 검사
 *   ① 템플릿명이 **바로빌 승인본과 글자 단위로 일치**(다르면 발송이 거절된다)
 *   ② 송장이 필요한 건 한진뿐 — 승인 템플릿 셋 중 `#{송장번호}` 를 쓰는 것이 없다(2026-09-18 실측)
 *   ③ ★직배·퀵·용차는 **알림 대상이 아니다**(용준님 결정) — 「미발송」과 다른 상태다
 *   ④ 차단 사유 우선순위 — 이미 발송 > 연락처 없음 > 송장 대기
 *   ⑤ 이름 변형 흡수 · 부분일치가 정확일치를 앞지르지 않는다
 *
 * 실행: node scripts/shipment-notice-selftest.cjs   (실패 시 exit 1) — test:calc 편입
 */
'use strict'
const path = require('path')
const { compileTs } = require('./lib/compile-ts.cjs')

const { mod, cleanup } = compileTs(path.join(__dirname, '..', 'src', 'utils', 'shipmentNotice.ts'), { bundle: true })
const { resolveShipmentNotice, noticePolicyFor, NOTICE_POLICY, NOTICE_BLOCK_LABEL } = mod

let fails = 0
const check = (name, cond, detail) => {
  if (cond) console.log('  ✓', name)
  else { fails++; console.log('  ✗', name, detail !== undefined ? '→ ' + JSON.stringify(detail) : '') }
}
const ok = (method, extra) => resolveShipmentNotice({ deliveryMethod: method, hasMobile: true, ...(extra || {}) })

// 2026-09-18 바로빌에서 받은 승인 템플릿 4건 중 출고용 3건의 **정확한 이름**
const APPROVED = ['대신화물 출고', '대신택배 출고', '방문 수령 준비 완료']

console.log('[shipment-notice] ① 승인 템플릿명 일치')
{
  check('방문수령 → 방문 수령 준비 완료', ok('방문수령').template === '방문 수령 준비 완료', ok('방문수령'))
  check('직접수령 → 방문 수령 준비 완료', ok('직접수령').template === '방문 수령 준비 완료')
  check('대신화물 → 대신화물 출고', ok('대신화물').template === '대신화물 출고')
  check('대신택배 → 대신택배 출고', ok('대신택배').template === '대신택배 출고')
  const used = Object.values(NOTICE_POLICY).map((p) => p.template).filter(Boolean)
  check('★쓰이는 템플릿명이 전부 승인본 목록 안에 있다(오타 = 발송 거절)',
    used.every((t) => APPROVED.includes(t)), used.filter((t) => !APPROVED.includes(t)))
}

console.log('[shipment-notice] ② 송장이 필요한 건 한진뿐')
{
  const h = ok('한진택배')
  check('한진 = 문자(승인 템플릿 없음)', h.channel === 'sms' && h.template === null, h)
  check('한진 = 송장 없으면 못 보낸다', h.canSendNow === false && h.blockedReason === 'needs_tracking', h)
  check('한진 = 송장 넣으면 보낼 수 있다', ok('한진택배', { trackingNumber: '1234567890' }).canSendNow === true)
  for (const m of ['대신화물', '대신택배', '방문수령']) {
    check(`${m} 은 송장 없이도 즉시 발송 가능(템플릿에 송장 변수가 없다)`, ok(m).canSendNow === true, ok(m))
  }
}

console.log('[shipment-notice] ③ ★알림 대상이 아닌 배송수단')
{
  for (const m of ['직배', '직접배송', '자차배송', '퀵', '용차']) {
    const d = ok(m)
    check(`${m} = 대상 아님(미발송으로 세지 않는다)`,
      d.isTarget === false && d.blockedReason === 'not_target' && d.canSendNow === false, d)
  }
  check('「대상 아님」과 「연락처 없음」은 다른 상태다',
    ok('직배').blockedReason !== resolveShipmentNotice({ deliveryMethod: '방문수령', hasMobile: false }).blockedReason)
}

console.log('[shipment-notice] ④ 차단 사유 우선순위')
{
  const sent = resolveShipmentNotice({ deliveryMethod: '한진택배', hasMobile: false, alreadySent: true })
  check('이미 발송 > 연락처 없음', sent.blockedReason === 'already_sent', sent)
  const noMob = resolveShipmentNotice({ deliveryMethod: '한진택배', hasMobile: false })
  check('연락처 없음 > 송장 대기', noMob.blockedReason === 'no_mobile', noMob)
  check('이미 발송이어도 대상이긴 하다(배지는 발송됨)', sent.isTarget === true, sent)
}

console.log('[shipment-notice] ⑤ 이름 변형 · 부분일치 순서')
{
  check('「동산에서 대신화물」 → 대신화물 출고', ok('동산에서 대신화물').template === '대신화물 출고', ok('동산에서 대신화물'))
  check('「동산으로 방문수령」 → 방문 수령 준비 완료', ok('동산으로 방문수령').template === '방문 수령 준비 완료')
  check('「택배(한진)」 → 문자', ok('택배(한진)').channel === 'sms')
  check('★「직접배송」이 정확일치로 먼저 잡힌다(대상 아님)', ok('직접배송').blockedReason === 'not_target')
  check('모르는 배송수단 = unknown_method(사람이 정한다) · 대상 아님으로 세지 않는다',
    ok('배송').blockedReason === 'unknown_method' && ok('배송').isTarget === false, ok('배송'))
  check('빈 배송수단도 unknown_method', ok('').blockedReason === 'unknown_method' && ok(null).blockedReason === 'unknown_method')
  check('정책 조회 자체는 null 을 돌려준다', noticePolicyFor('없는수단') === null)
}

console.log('[shipment-notice] ⑥ 화면 문구')
{
  for (const k of ['not_target', 'no_mobile', 'needs_tracking', 'already_sent', 'unknown_method']) {
    check(`${k} 문구 있음`, typeof NOTICE_BLOCK_LABEL[k] === 'string' && NOTICE_BLOCK_LABEL[k].length > 0)
  }
}

cleanup && cleanup()
console.log(fails ? `[shipment-notice] FAIL ${fails}건` : '[shipment-notice] OK — 템플릿명·송장 조건·대상 분류·우선순위 전부 통과')
process.exit(fails ? 1 : 0)
