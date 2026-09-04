#!/usr/bin/env node
/**
 * 재고 창고 해석 자체검증 — `src/utils/inventoryZone.ts`
 *
 * 왜 있는가: 이 헬퍼는 **어느 창고에 쓸지**를 정한다. 표시가 아니라 **쓰기 대상**이라
 *   틀리면 재고가 엉뚱한 구역에서 빠지거나, 구역 없는 행에 쌓여 **어느 실사에도 안 뜬다**.
 *   2026-09-04 에 그렇게 생긴 미배정 44행을 치웠고(`0565`) 규칙을 바꿨다:
 *     축1 NULL → **법인 기본창고**(종전엔 NULL 그대로)
 *   응답은 언제나 200 이고 타입체크·smoke 는 이 값을 안 본다 — 여기서만 잡힌다.
 *
 * ⚠️단수(getItemDefaultZone)와 복수(getItemDefaultZones)가 **같은 답**을 내야 한다.
 *   갈리면 배치 입고만 미배정이 된다.
 *
 * 실행: node scripts/inventory-zone-selftest.cjs   (실패 시 exit 1)
 */
'use strict'

const path = require('path')
const { DatabaseSync } = require('node:sqlite')
const { compileTs } = require('./lib/compile-ts.cjs')

const SRC = path.join(__dirname, '..', 'src', 'utils', 'inventoryZone.ts')
const { mod: Z, cleanup } = compileTs(SRC, { bundle: true })

// ── 픽스처: 법인 1(기본창고 10, 다른 구역 11) · 법인 2(기본창고 20) · 법인 3(구역 없음)
const db = new DatabaseSync(':memory:')
db.exec(`
  CREATE TABLE storage_zones (id INTEGER PRIMARY KEY, entity_id INTEGER, is_default INTEGER, is_active INTEGER, zone_name TEXT);
  CREATE TABLE items (id INTEGER PRIMARY KEY, storage_zone_id INTEGER);
  CREATE TABLE inventory (item_id INTEGER, entity_id INTEGER, storage_zone_id INTEGER, quantity REAL);
  INSERT INTO storage_zones VALUES (10,1,1,1,'출력실'), (11,1,0,1,'현수막실'), (12,1,0,0,'폐쇄구역'), (20,2,1,1,'선명2');
  INSERT INTO items VALUES
    (1, NULL),   -- 축1 없음        → 법인 기본창고
    (2, 11),     -- 자법인 활성 구역 → 그대로
    (3, 20),     -- 타법인 구역     → 요청 법인 기본창고
    (4, 12),     -- 자법인 **비활성** → 요청 법인 기본창고
    (5, 10),     -- 축1=출력실인데 재고는 현수막실에만  ← 차감이 틀리던 자리
    (6, 10),     -- 축1=출력실, 재고가 두 구역
    (7, 11),     -- 축1=현수막실, 재고가 두 구역인데 축1 이 그중에 있다
    (8, NULL);   -- 재고 없음 → 입고 규칙으로 폴백
  INSERT INTO inventory VALUES
    (5,1,11,50),            -- 실제 보유 = 현수막실
    (6,1,10,3), (6,1,11,9), -- 최다 = 현수막실(9) 인데 축1 은 출력실 → 축1 우선
    (7,1,10,9), (7,1,11,3), -- 최다 = 출력실(9) 인데 축1(현수막실)이 후보에 있다 → 축1 우선
    (2,1,10,0),             -- 수량 0 은 후보가 아니다
    (1,1,11,-5);            -- 음수도 후보가 아니다
`)

// D1 어댑터 — prepare().bind().first()/all() 만 쓴다
const D1 = {
  prepare(sql) {
    let params = []
    return {
      bind(...a) { params = a; return this },
      first() { const r = db.prepare(sql).get(...params); return r === undefined ? null : r },
      all() { return { results: db.prepare(sql).all(...params) } },
    }
  },
}

let pass = 0, fail = 0
function eq(label, got, want) {
  if (got === want) { pass++; return }
  fail++
  console.error(`❌ ${label}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`)
}

async function main() {
  // ── 단수
  eq('축1 없음 → 법인1 기본창고', await Z.getItemDefaultZone(D1, 1, 1), 10)
  eq('자법인 활성 구역은 그대로', await Z.getItemDefaultZone(D1, 2, 1), 11)
  eq('타법인 구역 → 요청 법인 기본창고', await Z.getItemDefaultZone(D1, 3, 1), 10)
  eq('자법인 비활성 구역 → 기본창고', await Z.getItemDefaultZone(D1, 4, 1), 10)
  eq('법인2 에서 축1 없음 → 선명2', await Z.getItemDefaultZone(D1, 1, 2), 20)
  eq('법인2 에서 법인1 구역 → 선명2', await Z.getItemDefaultZone(D1, 2, 2), 20)
  // ★구역이 하나도 없는 법인은 NULL 이 맞다 — 없는 창고를 만들어 낼 수는 없다
  eq('구역 없는 법인3 → NULL', await Z.getItemDefaultZone(D1, 1, 3), null)
  eq('없는 품목 → NULL', await Z.getItemDefaultZone(D1, 999, 1), null)

  // ── 복수 = 단수와 같은 답이어야 한다
  const m1 = await Z.getItemDefaultZones(D1, [1, 2, 3, 4], 1)
  eq('복수: 축1 없음', m1.get(1), 10)
  eq('복수: 자법인 활성', m1.get(2), 11)
  eq('복수: 타법인', m1.get(3), 10)
  eq('복수: 자법인 비활성', m1.get(4), 10)
  const m3 = await Z.getItemDefaultZones(D1, [1, 2], 3)
  eq('복수: 구역 없는 법인', m3.get(1), null)
  eq('복수: 빈 입력', (await Z.getItemDefaultZones(D1, [], 1)).size, 0)

  // ── 차감 = **재고가 실제로 있는 구역**. 입고(축1)와 다른 물음이다.
  const ded = (itemId, entityId) => Z.resolveDeductionZone(D1, { equipmentId: null, itemId, entityId })
  eq('차감: 축1=출력실이어도 재고가 현수막실이면 현수막실', await ded(5, 1), 11)
  eq('차감: 여러 구역이면 축1 우선 (최다가 아니어도)', await ded(6, 1), 10)
  eq('차감: 축1 이 후보에 있으면 최다보다 축1', await ded(7, 1), 11)
  eq('차감: 수량 0 은 후보가 아니다 → 입고 규칙', await ded(2, 1), 11)
  eq('차감: 음수도 후보가 아니다 → 입고 규칙', await ded(1, 1), 10)
  eq('차감: 재고 없으면 입고 규칙', await ded(8, 1), 10)
  eq('차감: 없는 품목 → NULL', await ded(999, 1), null)
  eq('차감: 타법인에서 보면 재고가 없다 → 그 법인 기본창고', await ded(5, 2), 20)

  console.log(fail === 0
    ? `✓ 재고 창고 해석 자체검증 ${pass}건 통과`
    : `✗ ${fail}건 실패 / ${pass}건 통과`)
  cleanup && cleanup()
  process.exit(fail === 0 ? 0 : 1)
}
main().catch((e) => { console.error('ERR', e); cleanup && cleanup(); process.exit(1) })
