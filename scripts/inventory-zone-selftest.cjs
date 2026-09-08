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
    (8, NULL),   -- 재고 없음 → 입고 규칙으로 폴백
    -- ↓ 2026-09-09 배정 축(축2). 「품목 배정」 화면이 만드는 건 **수량 0 인 inventory 행**이다.
    (21, NULL),  -- 배정만 있고 실물 0      ← 오늘 배정할 571종의 모양
    (22, 10),    -- 배정이 축1 을 이긴다
    (23, NULL),  -- 배정 + 다른 구역에 실물 → 실물 우선
    (24, NULL),  -- 배정 2곳 다 0          → zone id 오름차순
    (25, NULL),  -- 비활성 구역에만 재고    → 무시하고 기본창고
    (26, NULL);  -- 법인2 에만 재고         → 법인1 에서는 안 보인다
  INSERT INTO inventory VALUES
    (5,1,11,50),            -- 실제 보유 = 현수막실
    (6,1,10,3), (6,1,11,9), -- 최다 = 현수막실(9) 인데 축1 은 출력실 → 축1 우선
    (7,1,10,9), (7,1,11,3), -- 최다 = 출력실(9) 인데 축1(현수막실)이 후보에 있다 → 축1 우선
    (2,1,10,0),             -- 수량 0 은 **차감** 후보가 아니다 (배정 축에는 잡힌다)
    (1,1,11,-5),            -- 음수도 **차감** 후보가 아니다 (배정 축에는 잡힌다)
    (21,1,11,0),            -- 배정만
    (22,1,11,0),            -- 배정(현수막실) vs 축1(출력실)
    (23,1,11,0), (23,1,10,5),
    (24,1,10,0), (24,1,11,0),
    (25,1,12,7),            -- 12 = 비활성
    (26,2,20,5);
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
  eq('음수 재고 행도 그 구역 소속', await Z.getItemDefaultZone(D1, 1, 1), 11)   // 종전 10 — 배정 축 추가로 변경
  eq('배정 행(수량 0)이 축1 을 이긴다', await Z.getItemDefaultZone(D1, 2, 1), 10)  // 종전 11
  eq('타법인 구역 → 요청 법인 기본창고', await Z.getItemDefaultZone(D1, 3, 1), 10)
  eq('자법인 비활성 구역 → 기본창고', await Z.getItemDefaultZone(D1, 4, 1), 10)
  eq('법인2 에서 축1 없음 → 선명2', await Z.getItemDefaultZone(D1, 1, 2), 20)
  eq('법인2 에서 법인1 구역 → 선명2', await Z.getItemDefaultZone(D1, 2, 2), 20)
  // ★구역이 하나도 없는 법인은 NULL 이 맞다 — 없는 창고를 만들어 낼 수는 없다
  eq('구역 없는 법인3 → NULL', await Z.getItemDefaultZone(D1, 1, 3), null)
  eq('없는 품목 → NULL', await Z.getItemDefaultZone(D1, 999, 1), null)

  // ── 복수 = 단수와 같은 답이어야 한다
  const m1 = await Z.getItemDefaultZones(D1, [1, 2, 3, 4], 1)
  eq('복수: 음수 재고 행', m1.get(1), 11)
  eq('복수: 배정 행 우선', m1.get(2), 10)
  eq('복수: 타법인', m1.get(3), 10)
  eq('복수: 자법인 비활성', m1.get(4), 10)
  const m3 = await Z.getItemDefaultZones(D1, [1, 2], 3)
  eq('복수: 구역 없는 법인', m3.get(1), null)
  eq('복수: 빈 입력', (await Z.getItemDefaultZones(D1, [], 1)).size, 0)

  // ── 배정 축(축2) — 「품목 배정」 화면이 저장하는 수량 0 행. **오늘의 P0**.
  //    이게 없으면 담당자가 배정해도 입고가 법인 기본창고(동산=출력실)로 간다.
  eq('배정만 있고 실물 0 → 그 구역', await Z.getItemDefaultZone(D1, 21, 1), 11)
  eq('배정이 축1 을 이긴다', await Z.getItemDefaultZone(D1, 22, 1), 11)
  eq('실물이 있는 구역 우선', await Z.getItemDefaultZone(D1, 23, 1), 10)
  eq('배정 2곳 다 0 → zone id 오름차순', await Z.getItemDefaultZone(D1, 24, 1), 10)
  eq('비활성 구역 재고는 무시 → 기본창고', await Z.getItemDefaultZone(D1, 25, 1), 10)
  eq('법인2 재고는 법인1 에서 안 보인다', await Z.getItemDefaultZone(D1, 26, 1), 10)
  eq('법인2 에서는 보인다', await Z.getItemDefaultZone(D1, 26, 2), 20)
  const m2 = await Z.getItemDefaultZones(D1, [21, 22, 23, 24, 25, 26], 1)
  for (const id of [21, 22, 23, 24, 25, 26]) {
    eq('복수=단수 (' + id + ')', m2.get(id), await Z.getItemDefaultZone(D1, id, 1))
  }

  // ── 차감 = **재고가 실제로 있는 구역**. 입고(축1)와 다른 물음이다.
  const ded = (itemId, entityId) => Z.resolveDeductionZone(D1, { equipmentId: null, itemId, entityId })
  eq('차감: 축1=출력실이어도 재고가 현수막실이면 현수막실', await ded(5, 1), 11)
  eq('차감: 여러 구역이면 축1 우선 (최다가 아니어도)', await ded(6, 1), 10)
  eq('차감: 축1 이 후보에 있으면 최다보다 축1', await ded(7, 1), 11)
  eq('차감: 수량 0 은 차감 후보가 아니다 → 입고 규칙(=배정 구역)', await ded(2, 1), 10)
  eq('차감: 음수도 차감 후보가 아니다 → 입고 규칙(=그 구역)', await ded(1, 1), 11)
  eq('차감: 재고 없으면 입고 규칙', await ded(8, 1), 10)
  eq('차감: 없는 품목 → NULL', await ded(999, 1), null)
  eq('차감: 타법인에서 보면 재고가 없다 → 그 법인 기본창고', await ded(5, 2), 20)

  // ★불변식 — **양수 재고가 있으면 입고와 차감이 같은 구역이어야 한다.**
  //   갈리면 한 구역은 끝없이 늘고 다른 구역은 끝없이 줄어 조용히 음수가 된다.
  //   그래서 `zoneByInventorySql` 의 정렬(②축1 ③최다)이 `resolveDeductionZone` 과 같아야 한다.
  for (const id of [5, 6, 7, 23]) {
    eq('입고=차감 (' + id + ')', await Z.getItemDefaultZone(D1, id, 1), await ded(id, 1))
  }

  console.log(fail === 0
    ? `✓ 재고 창고 해석 자체검증 ${pass}건 통과`
    : `✗ ${fail}건 실패 / ${pass}건 통과`)
  cleanup && cleanup()
  process.exit(fail === 0 ? 0 : 1)
}
main().catch((e) => { console.error('ERR', e); cleanup && cleanup(); process.exit(1) })
