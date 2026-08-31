#!/usr/bin/env node
/**
 * 직배 배차 슬롯·완료기한 자체검증 — `src/utils/productionDeadline.ts` ↔ `src/scripts/shared/deliverySlot.js`
 *
 * 왜 있는가: 「오전 = 전날 18:00」의 **-1일**이 이 기능의 전부다. 이 한 칸이 틀어지면
 *   칸반 마감이 하루 어긋나 아침에 나가야 할 물건이 저녁까지 여유로 표시된다 —
 *   그런데 응답은 200 이고 타입체크·smoke 는 값을 보지 않는다.
 *   게다가 규칙 사본이 클라(주문서 토글·가드)에도 있어 갈리면
 *   "주문서에서 고른 슬롯 ≠ 칸반이 계산한 마감" 이 된다.
 *
 * 실행: node scripts/delivery-slot-selftest.cjs   (실패 시 exit 1)
 */
'use strict'

const fs = require('fs')
const path = require('path')
const { compileTs } = require('./lib/compile-ts.cjs')

const SRC = path.join(__dirname, '..', 'src', 'utils', 'productionDeadline.ts')
const CLIENT = path.join(__dirname, '..', 'src', 'scripts', 'shared', 'deliverySlot.js')

const { mod: S, cleanup } = compileTs(SRC, { bundle: true })   // constants/deliveryMethod 를 import 한다

// 클라 사본 로드 — ?raw IIFE 라 window shim 하나면 그대로 돈다
const win = {}
new Function('window', fs.readFileSync(CLIENT, 'utf8'))(win)
const C = win.MES_SLOT
if (!C) { console.error('❌ 클라 사본이 window.MES_SLOT 을 노출하지 않는다'); process.exit(1) }

let pass = 0
const fails = []
function eq(name, got, want) {
  const g = JSON.stringify(got), w = JSON.stringify(want)
  if (g === w) { pass++; return }
  fails.push(`${name}\n    기대 ${w}\n    실제 ${g}`)
}

// ── 1. 서버↔클라 상수 일치 (여기가 갈리면 나머지 검증이 무의미하다) ──
eq('상수: 라벨', C.LABELS, S.SLOT_LABELS)
eq('상수: 대표시각', C.REPRESENTATIVE_TIME, S.SLOT_REPRESENTATIVE_TIME)
eq('상수: 마감규칙', C.DEADLINE, S.SLOT_DEADLINE)
eq('상수: 오전 마감은 -1일 18:00', S.SLOT_DEADLINE.AM, { dayOffset: -1, time: '18:00' })
eq('상수: 오후 마감은 당일 13:00', S.SLOT_DEADLINE.PM, { dayOffset: 0, time: '13:00' })

// ── 2. 출고방법 판정 — 과거 표기(직배)도 받아야 한다 ──
for (const m of ['직접배송', '직배', '직접 배송', '자차배송']) {
  eq(`직배 판정: ${m}`, S.isSlotDeliveryMethod(m), true)
  eq(`직배 판정(클라): ${m}`, C.isSlotMethod(m), true)
}
for (const m of ['한진택배', '대신화물', '용차', '퀵', '방문수령', '', null]) {
  eq(`비직배 판정: ${m}`, S.isSlotDeliveryMethod(m), false)
  eq(`비직배 판정(클라): ${m}`, C.isSlotMethod(m), false)
}

// ── 3. 완료기한 파생 ──
const cases = [
  ['오전편 = 전날 18:00',
    { delivery_date: '2026-09-01', delivery_method: '직배', delivery_slot: 'AM' }, '2026-08-31 18:00'],
  ['오전편 월경계 = 전달 말일',
    { delivery_date: '2026-09-01', delivery_method: '직접배송', delivery_slot: 'AM' }, '2026-08-31 18:00'],
  ['오전편 연경계',
    { delivery_date: '2027-01-01', delivery_method: '직배', delivery_slot: 'AM' }, '2026-12-31 18:00'],
  ['오후편 = 당일 13:00',
    { delivery_date: '2026-09-01', delivery_method: '직배', delivery_slot: 'PM' }, '2026-09-01 13:00'],
  ['대표시각이 있어도 슬롯이 이긴다',
    { delivery_date: '2026-09-01', delivery_time: '09:00', delivery_method: '직배', delivery_slot: 'AM' }, '2026-08-31 18:00'],
  ['비직배는 종전대로 납품일+납품시간',
    { delivery_date: '2026-09-01', delivery_time: '18:00', delivery_method: '한진택배' }, '2026-09-01 18:00'],
  ['직배가 아니면 슬롯을 무시한다',
    { delivery_date: '2026-09-01', delivery_time: '16:00', delivery_method: '대신화물', delivery_slot: 'AM' }, '2026-09-01 16:00'],
  ['슬롯 NULL = 종전 동작',
    { delivery_date: '2026-09-01', delivery_time: '14:00', delivery_method: '직배', delivery_slot: null }, '2026-09-01 14:00'],
  ['슬롯도 시간도 없으면 마감 미정',
    { delivery_date: '2026-09-01', delivery_method: '직배' }, null],
  ['납품일이 없으면 null',
    { delivery_time: '13:00', delivery_method: '직배', delivery_slot: 'PM' }, null],
]
for (const [name, input, want] of cases) {
  eq(`마감: ${name}`, S.getProductionDeadline(input), want)
  eq(`마감(클라): ${name}`, C.deadline(input), want)
}

// ── 4. 표기 ──
const labels = [
  ['직배 오전', { delivery_method: '직배', delivery_slot: 'AM' }, '직배 오전'],
  ['직접배송 오후', { delivery_method: '직접배송', delivery_slot: 'PM' }, '직접배송 오후'],
  ['택배는 시각 그대로', { delivery_method: '한진택배', delivery_time: '18:00' }, '한진택배 18:00'],
  ['시간 없으면 방법만', { delivery_method: '방문수령' }, '방문수령'],
]
for (const [name, input, want] of labels) {
  eq(`표기: ${name}`, S.formatDeliveryTiming(input), want)
  eq(`표기(클라): ${name}`, C.timing(input), want)
}

// ── 5. 오전편 선택 가드 (전날 18:00 이 지나면 못 고른다) ──
const guards = [
  ['전날 오후 = 가능', 'AM', '2026-09-01', '2026-08-31 15:00', true],
  ['전날 18:00 정각 = 가능', 'AM', '2026-09-01', '2026-08-31 18:00', true],
  ['전날 18:01 = 불가', 'AM', '2026-09-01', '2026-08-31 18:01', false],
  ['당일 아침 = 불가', 'AM', '2026-09-01', '2026-09-01 08:00', false],
  ['이틀 전 = 가능', 'AM', '2026-09-01', '2026-08-30 09:00', true],
  ['오후편은 언제나 가능', 'PM', '2026-09-01', '2026-09-01 15:00', true],
]
for (const [name, slot, date, now, want] of guards) {
  eq(`가드: ${name}`, S.isSlotSelectable(slot, date, now), want)
  eq(`가드(클라): ${name}`, C.selectable(slot, date, now), want)
}

cleanup()

if (fails.length) {
  console.error(`❌ 직배 슬롯 검증 실패 ${fails.length}건 (통과 ${pass})`)
  for (const f of fails) console.error('  - ' + f)
  process.exit(1)
}
console.log(`✅ 직배 슬롯·완료기한 ${pass}항목 통과`)
