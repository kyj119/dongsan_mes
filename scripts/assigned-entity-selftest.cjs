'use strict'
/**
 * 담당 법인 결정 규칙 픽스처 — `npm run test:assigned-entity` (test:calc 체인 포함)
 *
 * 왜 있나: 2026-09-04 8월 이관이 `item_name` 을 실어 보내 품목 마스터 조회를 건너뛰었고,
 * 축(category·item_type) 이 빈 라인은 카드그룹 기본값 OUTPUT → 동산 담당으로 흘러
 * 선명 749라인 전부(자재·상품 467 포함)가 동산 담당 + 동산 청구그룹 1.6억이 됐다.
 * typecheck·build·smoke 는 전부 통과했다 — 값 대조 게이트만 잡는다.
 *
 * 정본 = src/routes/orders/helpers.ts resolveAssignedEntity / recommendAssignedEntity
 */
const { compileTs } = require('./lib/compile-ts.cjs')
const path = require('path')

const SRC = path.join(__dirname, '..', 'src', 'routes', 'orders', 'helpers.ts')
const { mod: _m, cleanup: _cleanup } = compileTs(SRC, { bundle: true })
const { resolveAssignedEntity, recommendAssignedEntity } = _m

const DONGSAN = 1, SEONMYEONG = 2

let pass = 0
const fails = []
function eq(name, got, want) {
  if (got === want) { pass++; return }
  fails.push(`${name}\n    기대 「${want}」\n    실제 「${got}」`)
}

// ── 추천 규칙 (품목 축 기준) ──
eq('간판 → 선명. 청구법인이 선명이면 태그 불필요(null)',
  recommendAssignedEntity({ category_name: '간판' }, SEONMYEONG), null)
eq('간판 → 선명. 청구법인이 동산이면 선명(2)',
  recommendAssignedEntity({ category_name: '간판' }, DONGSAN), SEONMYEONG)
eq('UV 출력 → 동산. 청구법인이 선명이면 동산(1) — 멀티법인 협업 정상 경로',
  recommendAssignedEntity({ category_name: 'UV' }, SEONMYEONG), DONGSAN)
eq('자재(MATERIAL)는 카드그룹 없음 → 추천 없음',
  recommendAssignedEntity({ item_type: 'MATERIAL' }, SEONMYEONG), null)
eq('상품(GOODS)도 추천 없음',
  recommendAssignedEntity({ item_type: 'GOODS' }, SEONMYEONG), null)
eq('기성품(production_required=0)은 카테고리보다 우선 → 추천 없음',
  recommendAssignedEntity({ category_name: 'UV', production_required: 0 }, SEONMYEONG), null)
eq('축이 아예 없으면 기본값 OUTPUT → 동산 (이게 8월 이관 사고의 경로)',
  recommendAssignedEntity({}, SEONMYEONG), DONGSAN)

// ── 결정 규칙: 요청 명시값 · 마스터 축 · 추천 ──
const MASTER_MATERIAL = { item_name: '잉크테크 1L', category: '원자재', unit: 'EA', item_type: 'MATERIAL', production_required: 1 }
const MASTER_SIGN = { item_name: '아크릴 가공', category: '간판', unit: 'EA', item_type: 'PRODUCT', production_required: 1 }
const MASTER_UV = { item_name: 'UV 판재', category: 'UV', unit: 'EA', item_type: 'PRODUCT', production_required: 1 }

eq('★이관 재현: 이름만 보낸 자재 라인 + 마스터 → null (종전엔 동산)',
  resolveAssignedEntity({ item_id: 10, item_name: '잉크테크 1L' }, MASTER_MATERIAL, SEONMYEONG), null)
eq('★이관 재현: 이름만 보낸 간판 라인 + 마스터 → null (선명 청구 = 선명 담당)',
  resolveAssignedEntity({ item_id: 11, item_name: '아크릴 가공' }, MASTER_SIGN, SEONMYEONG), null)
eq('이름만 보낸 UV 라인 + 마스터 → 동산 (협업 추천은 살아 있어야 한다)',
  resolveAssignedEntity({ item_id: 12, item_name: 'UV 판재' }, MASTER_UV, SEONMYEONG), DONGSAN)
eq('요청 본문 category_name 이 마스터보다 우선',
  resolveAssignedEntity({ item_id: 12, category_name: '간판' }, MASTER_UV, SEONMYEONG), null)
eq('마스터 없음(품목 미연결) + 축 없음 → 기본값 OUTPUT → 동산 (종전 동작 유지)',
  resolveAssignedEntity({ item_name: '현장 가공' }, undefined, SEONMYEONG), DONGSAN)

// ── 명시값 ──
eq('명시 1 → 1', resolveAssignedEntity({ assigned_entity_id: 1 }, MASTER_SIGN, SEONMYEONG), DONGSAN)
eq('명시 2 → 2 (마스터가 자재여도 요청이 이긴다)', resolveAssignedEntity({ assigned_entity_id: 2 }, MASTER_MATERIAL, DONGSAN), SEONMYEONG)
eq('★명시 null = 담당 없음 (이관 스크립트 opt-out) — UV 라인이라도 추천하지 않는다',
  resolveAssignedEntity({ assigned_entity_id: null, item_name: 'UV 판재' }, MASTER_UV, SEONMYEONG), null)
eq('키 없음(undefined) = 추천 — UI 미선택 경로',
  resolveAssignedEntity({ item_name: 'UV 판재' }, MASTER_UV, SEONMYEONG), DONGSAN)

_cleanup()

if (fails.length) {
  console.error(`[assigned-entity] FAIL ${fails.length} / PASS ${pass}`)
  for (const f of fails) console.error('  ✗ ' + f)
  process.exit(1)
}
console.log(`[assigned-entity] PASS ${pass}/${pass}`)
