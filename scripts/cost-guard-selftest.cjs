#!/usr/bin/env node
/**
 * 비용 차단기 자체검증 — `src/services/costGuard.ts`(만료 시각) + `src/middleware/costGuard.ts`(차단 대상)
 *
 * 왜 있는가: 이 두 판정은 **틀려도 200 이 뜬다**.
 *   ① 만료 시각이 틀리면 차단이 안 풀리거나(업무 정지) 즉시 풀린다(과금 계속). 둘 다 조용하다.
 *      특히 KST↔UTC 9시간 — `new Date().toISOString().slice(0,10)` 계열 실수는 이 프로젝트의 상습 함정이다.
 *   ② 차단 대상 판정이 넓어지면 **쓰기·로그인까지 죽는다** = 비용 사고를 업무 사고로 바꾼 것뿐이다.
 *
 * 실행: node scripts/cost-guard-selftest.cjs   (실패 시 exit 1)
 */
'use strict'

const path = require('path')
const { compileTs } = require('./lib/compile-ts.cjs')

const svc = compileTs(path.join(__dirname, '..', 'src', 'services', 'costGuard.ts'), { bundle: true })
const mw = compileTs(path.join(__dirname, '..', 'src', 'middleware', 'costGuard.ts'), { bundle: true })
const S = svc.mod
const M = mw.mod

let pass = 0
const fails = []
function eq(name, got, want) {
  const g = JSON.stringify(got), w = JSON.stringify(want)
  if (g === w) { pass++; return }
  fails.push(`${name}\n    기대 ${w}\n    실제 ${g}`)
}

// ── 1. 일일 차단 만료 = 다음 KST 자정 (UTC 로는 15:00) ──
eq('KST 14시 → 오늘 자정', S.nextKstMidnight(new Date('2026-09-08T05:00:00Z')), '2026-09-08T15:00:00.000Z')
eq('KST 00:30(UTC 전날 15:30) → 그날 자정', S.nextKstMidnight(new Date('2026-09-08T15:30:00Z')), '2026-09-09T15:00:00.000Z')
// ★UTC 자정 직후(=KST 09시)에도 「오늘」이 밀리면 안 된다 — 여기가 어긋나면 차단이 하루 더 간다.
eq('UTC 00:10(KST 09:10) → 같은 KST 날의 자정', S.nextKstMidnight(new Date('2026-09-08T00:10:00Z')), '2026-09-08T15:00:00.000Z')

// ── 2. 월 차단 만료 = 다음 달 1일 KST 00:00 ──
eq('9월 → 10/1 KST', S.nextKstMonthStart(new Date('2026-09-08T05:00:00Z')), '2026-09-30T15:00:00.000Z')
eq('연말 → 2027-01-01 KST', S.nextKstMonthStart(new Date('2026-12-20T05:00:00Z')), '2026-12-31T15:00:00.000Z')
// ★KST 로는 이미 10월인데 UTC 는 9/30 인 구간. UTC 기준으로 달을 세면 만료가 한 달 짧아진다.
eq('UTC 9/30 16시(KST 10/1) → 11/1 KST', S.nextKstMonthStart(new Date('2026-09-30T16:00:00Z')), '2026-10-31T15:00:00.000Z')
// 31일 달·윤달 경계
eq('1/31 → 2/1 KST', S.nextKstMonthStart(new Date('2026-01-31T05:00:00Z')), '2026-01-31T15:00:00.000Z')
eq('2/15 → 3/1 KST', S.nextKstMonthStart(new Date('2026-02-15T05:00:00Z')), '2026-02-28T15:00:00.000Z')

// 만료는 항상 미래여야 한다 — 과거면 차단이 걸리는 순간 풀린다(감시하는 척).
const now = new Date()
eq('일일 만료는 미래', S.nextKstMidnight(now) > now.toISOString(), true)
eq('월 만료는 미래', S.nextKstMonthStart(now) > now.toISOString(), true)
eq('월 만료 ≥ 일일 만료', S.nextKstMonthStart(now) >= S.nextKstMidnight(now), true)

// ── 3. 차단 대상 판정 ──
const t = (method, p, poll, agent) => M.guardTarget({ method, path: p, poll: !!poll, agent: !!agent })

// 끊는다: 자동 폴링
eq('폴링 배지', t('GET', '/api/notifications/nav-badges', true), { target: true, kind: 'poll' })
eq('폴링 알림생성(POST)', t('POST', '/api/notifications/generate', true), { target: true, kind: 'poll' })
// 끊는다: 무거운 읽기 집계
eq('리포트', t('GET', '/api/reports/client-revenue', false), { target: true, kind: 'heavy' })
eq('자금계획', t('GET', '/api/cash-flow/schedule/overview', false), { target: true, kind: 'heavy' })

// 남긴다 — 여기가 뚫리면 비용 사고가 업무 사고가 된다
eq('사람이 연 화면(같은 URL, 헤더 없음)', t('GET', '/api/notifications/nav-badges', false), { target: false, kind: null })
eq('주문 저장', t('POST', '/api/orders', false), { target: false, kind: null })
eq('주문 수정', t('PUT', '/api/orders/1', false), { target: false, kind: null })
eq('삭제', t('DELETE', '/api/orders/1', false), { target: false, kind: null })
eq('로그인', t('POST', '/api/auth/login', false), { target: false, kind: null })
eq('일반 목록 조회', t('GET', '/api/orders', false), { target: false, kind: null })
eq('자금 일별(무거운 축 아님)', t('GET', '/api/cash-flow/daily', false), { target: false, kind: null })
// 에이전트는 폴링 헤더가 붙어 있어도 통과 — 끊으면 수집·출력 이벤트가 조용히 유실된다
eq('에이전트 폴링', t('GET', '/api/tasks/claim', true, true), { target: false, kind: null })
eq('에이전트 리포트', t('GET', '/api/reports/client-revenue', false, true), { target: false, kind: null })

// ── 4. 기본 상한 = 무료 포함량 **안쪽**이어야 한다 ──
// 상한이 포함량보다 크면 "차단은 됐는데 요금은 이미 나온" 상태가 된다. 차단선의 존재 이유가 사라진다.
eq('월 상한 < D1 무료 포함량(25B)', S.GUARD_DEFAULTS.budget_cf_rows_read_monthly < 25_000_000_000, true)
eq('일 상한 × 31 ≤ 월 상한 이하로 셀 수 있어야', S.GUARD_DEFAULTS.budget_cf_rows_read_daily_hard * 31 < 25_000_000_000, true)

// ── 5. 상태 읽기·걸기·풀기 (가짜 D1) ──
// settings 한 테이블에 값만 넣고 빼는 구조라 **문자열 판정 실수가 그대로 정책이 된다**
//   (`'0'` 을 truthy 로 읽으면 꺼 둔 차단기가 켜져 있는 것으로 보인다).
function fakeDb(initial) {
  const store = new Map(Object.entries(initial || {}))
  const stmt = (sql) => {
    const st = {
      params: [],
      bind(...p) { st.params = p; return st },
      async all() {
        return { results: [...store.entries()].filter(([k]) => st.params.includes(k)).map(([setting_key, setting_value]) => ({ setting_key, setting_value })) }
      },
      async run() { if (/INSERT INTO settings/.test(sql)) store.set(st.params[0], st.params[1]); return { success: true } },
    }
    return st
  }
  return { store, prepare: stmt, async batch(list) { for (const s of list) await s.run(); return [] } }
}

async function stateChecks() {
  // ★새 db 로 넘어갈 때는 isolate 캐시를 반드시 비운다 — 안 비우면 앞 테스트의 상태를 본다.
  //   (운영에서도 같은 성질이다: 차단을 건 isolate 와 보는 isolate 가 달라 최대 60초 전파가 늦다.)
  S.invalidateGuardCache()
  const empty = fakeDb({})
  eq('초기: 차단 아님·기능은 켜짐', await S.getGuardState(empty), { enabled: true, until: null, reason: null, active: false })

  S.invalidateGuardCache()
  const db = fakeDb({})
  const until = S.nextKstMidnight()
  await S.tripGuard(db, '테스트 사유', until)
  const after = await S.getGuardState(db)
  eq('걸린 뒤 active', after.active, true)
  eq('걸린 뒤 사유', after.reason, '테스트 사유')

  // 월 차단이 걸린 날 일일 차단이 또 걸려도 만료가 **당겨지지 않는다**(당겨지면 월 한도가 무력화된다).
  const monthEnd = S.nextKstMonthStart()
  await S.tripGuard(db, '월 상한', monthEnd)
  await S.tripGuard(db, '일 상한', S.nextKstMidnight())
  eq('만료는 연장만·단축 없음', (await S.getGuardState(db)).until, monthEnd)

  await S.releaseGuard(db)
  eq('해제 뒤 active=false', (await S.getGuardState(db)).active, false)

  // 꺼 둔 상태('0')는 만료가 미래여도 차단하지 않는다
  S.invalidateGuardCache()
  const off = fakeDb({ cost_guard_enabled: '0', cost_guard_until: S.nextKstMonthStart(), cost_guard_reason: 'x' })
  eq('cost_guard_enabled=0 이면 차단 안 함', (await S.getGuardState(off)).active, false)

  // 조회가 실패해도 **차단하지 않는다** — 차단기 자체의 장애가 업무를 멈추면 안 된다.
  S.invalidateGuardCache()
  const broken = { prepare: () => ({ bind: () => ({ all: () => Promise.reject(new Error('D1 down')) }) }) }
  eq('설정 조회 실패 시 통과', (await S.getGuardState(broken)).active, false)
}

stateChecks().then(finish).catch((e) => { console.error('❌ 상태 검증 중 예외:', e); process.exit(1) })

function finish() {
svc.cleanup(); mw.cleanup()

if (fails.length) {
  console.error(`\n❌ 비용 차단기 검증 실패 ${fails.length}건 (통과 ${pass})\n`)
  fails.forEach((f) => console.error('  • ' + f))
  process.exit(1)
}
console.log(`✅ 비용 차단기 ${pass}항목 통과 (만료 시각 KST 경계 · 차단 대상 · 상한 기본값)`)
}
