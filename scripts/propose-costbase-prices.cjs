#!/usr/bin/env node
/**
 * propose-costbase-prices.cjs — 이력 없는 품목의 원가 기반 제안가 (판단자료, 읽기 전용)
 *
 * 대상: 매출 단가 공백(base_price=0·sales_price=0) 품목 중 derive-item-prices.cjs 가 못 다루는
 *   X_이력없음(판매이력 0) · N_표본부족(라인<5). 08-11 백필이 이력 축을 소진한 뒤 남은 잔여다.
 *
 * 방법: 카테고리별 참조 마진 — 이미 단가가 있는 품목들의 base_price ÷ avg_unit_cost 중앙값을
 *   같은 카테고리의 공백 품목 원가에 곱한다. **제안일 뿐 자동 적용하지 않는다**(가격 결정=용준님).
 *
 * ★FIXED 만 제안한다. AREA(출력제품)의 base_price 는 ㎡단가인데 avg_unit_cost 는 원단
 *   base 단위(M/L)당 원가라 단위가 어긋난다(폭 환산 없이는 곱하면 안 됨) — ㎡단가표 설계(나-v2) 대상.
 * ★참조 마진의 신뢰도를 그대로 노출한다 — 카테고리 참조 n<5 는 전역 중앙값 폴백(fallback 표기),
 *   마진 IQR 이 큰 카테고리는 단위 혼재 가능성이 있으므로 spread 컬럼으로 보인다.
 *
 * 사용법:
 *   node scripts/propose-costbase-prices.cjs                # prod(--remote) 리포트+CSV
 *   node scripts/propose-costbase-prices.cjs --local
 *   node scripts/propose-costbase-prices.cjs --out <path>
 */
'use strict'

const path = require('path')
const fs = require('fs')
const { execFileSync } = require('child_process')

const REMOTE = !process.argv.includes('--local')
const argIdx = process.argv.indexOf('--out')
const OUT = argIdx > -1 ? process.argv[argIdx + 1] : path.join(__dirname, '..', 'docs', 'pricing', 'costbase-proposals.csv')
const DB = 'webapp-production'
const WRANGLER = path.join(__dirname, '..', 'node_modules', 'wrangler', 'bin', 'wrangler.js')

// derive-item-prices.cjs d1() 과 동일 — wrangler JSON 앞뒤 배너 절단
function d1(sql) {
  const argv = [WRANGLER, 'd1', 'execute', DB, REMOTE ? '--remote' : '--local', '--json', '--command', sql]
  const raw = execFileSync(process.execPath, argv, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, windowsHide: true })
  const start = raw.indexOf('[')
  if (start < 0) throw new Error(`D1 응답에 JSON 이 없다:\n${raw.slice(0, 500)}`)
  const parsed = JSON.parse(raw.slice(start))
  const first = Array.isArray(parsed) ? parsed[0] : parsed
  if (!first || !first.results) throw new Error(`D1 응답 형식이 예상과 다르다: ${JSON.stringify(first).slice(0, 300)}`)
  return first.results
}

const median = (arr) => {
  if (!arr.length) return null
  const s = [...arr].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}
const q = (arr, p) => {
  if (!arr.length) return null
  const s = [...arr].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.floor(s.length * p))]
}

function main() {
  console.log(`[1/3] 참조 마진 수집 (${REMOTE ? 'prod' : 'local'}) — 단가·원가 둘 다 있는 품목`)
  // 필터는 derive-item-prices.cjs NO_PRICE 와 같은 축(is_sales_item — ⚠️is_sales 아님, PRAGMA 실확인)
  const refs = d1(`
    SELECT category, item_type, pricing_method, base_price, avg_unit_cost
      FROM items
     WHERE is_sales_item = 1
       AND COALESCE(base_price, 0) > 0 AND COALESCE(avg_unit_cost, 0) > 0
       AND COALESCE(pricing_method, 'FIXED') != 'AREA'`)

  // 카테고리별 마진(배수) 분포 — 0.8배 미만(역마진)·20배 초과는 단위 혼재/이상치로 참조에서 제외
  const byCat = new Map()
  const all = []
  for (const r of refs) {
    const mk = Number(r.base_price) / Number(r.avg_unit_cost)
    if (!(mk >= 0.8 && mk <= 20)) continue
    const k = r.category || '(미분류)'
    if (!byCat.has(k)) byCat.set(k, [])
    byCat.get(k).push(mk)
    all.push(mk)
  }
  const globalMk = median(all)
  console.log(`  참조 ${refs.length}건(유효 ${all.length}) · 카테고리 ${byCat.size}종 · 전역 마진 중앙값 ×${globalMk?.toFixed(2)}`)

  console.log('[2/3] 단가 공백 품목 조회')
  const gaps = d1(`
    SELECT i.id, i.item_code, i.item_name, i.category, i.item_type, i.is_active,
           COALESCE(i.pricing_method, 'FIXED') AS pricing_method, i.unit, i.avg_unit_cost,
           (SELECT COUNT(*) FROM order_items oi WHERE oi.item_id = i.id AND oi.unit_price > 0) AS hist_lines
      FROM items i
     WHERE i.is_sales_item = 1
       AND COALESCE(i.base_price, 0) = 0 AND COALESCE(i.sales_price, 0) = 0
     ORDER BY i.item_code, i.id`)

  console.log('[3/3] 제안가 산출')
  const rows = []
  let proposed = 0, noCost = 0, areaSkip = 0
  for (const g of gaps) {
    const cost = Number(g.avg_unit_cost) || 0
    const isArea = g.pricing_method === 'AREA'
    let mkSrc = '', mk = null, prop = null, spread = ''
    if (isArea) {
      areaSkip++
      mkSrc = 'AREA=㎡단가표 대상(원가 단위 부정합)'
    } else if (cost <= 0) {
      noCost++
      mkSrc = '원가 없음(매입이력 0)'
    } else {
      const catMks = byCat.get(g.category || '(미분류)') || []
      if (catMks.length >= 5) {
        mk = median(catMks)
        mkSrc = `카테고리(${g.category}, n=${catMks.length})`
        spread = `${q(catMks, 0.25).toFixed(2)}~${q(catMks, 0.75).toFixed(2)}`
      } else if (globalMk) {
        mk = globalMk
        mkSrc = `전역 폴백(카테고리 참조 ${catMks.length}건뿐)`
        spread = `${q(all, 0.25).toFixed(2)}~${q(all, 0.75).toFixed(2)}`
      }
      if (mk) {
        // 주문 산식과 같은 100원 반올림 · 하한 100원(저원가 부속이 0원 제안이 되면 무의미·위험)
        prop = Math.max(100, Math.round((cost * mk) / 100) * 100)
        proposed++
      }
    }
    rows.push({
      code: g.item_code, name: g.item_name, cat: g.category || '', type: g.item_type || '',
      pm: g.pricing_method, unit: g.unit || '', active: g.is_active ? '' : '비활성', hist: g.hist_lines, cost,
      mk: mk ? mk.toFixed(2) : '', mkSrc, spread, prop: prop ?? '',
    })
  }

  const esc = (s) => {
    const v = String(s ?? '')
    return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
  }
  const header = '품목코드,품목명,카테고리,유형,방식,단위,활성,판매이력라인,원가(avg_unit_cost),참조마진,마진출처,마진IQR,제안가(원가×마진 100원반올림)'
  fs.mkdirSync(path.dirname(OUT), { recursive: true })
  fs.writeFileSync(OUT, '﻿' + header + '\n' + rows.map((r) =>
    [r.code, r.name, r.cat, r.type, r.pm, r.unit, r.active, r.hist, r.cost, r.mk, r.mkSrc, r.spread, r.prop].map(esc).join(',')
  ).join('\n') + '\n', 'utf8')

  console.log(`\n공백 ${gaps.length}품목 = 제안 생성 ${proposed} · 원가 없음 ${noCost} · AREA 보류 ${areaSkip}`)
  console.log(`CSV: ${OUT}`)
  console.log('★자동 적용하지 않는다 — 가격 확정은 사람. 적용 시 마이그레이션으로(0529·0531 전례).')
}

main()
