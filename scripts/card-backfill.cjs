/**
 * 법인카드 승인내역 소급 수집 (바로빌)
 *
 * 왜 필요한가 — 카드 등록 화면이 「과거 3개월」만 자동 수집한다(`src/scripts/cardExpenses.js`
 * saveCard 의 `setUTCMonth(-3)`). 그래서 등록이 늦은 카드는 그 이전 사용분이 통째로 비어 있고,
 * 비용 정본이 카드 승인내역이라 판관비가 그만큼 빠진다.
 * 2026-08-12 실측: 동산(e1) 통장 카드결제 1.91억 vs 승인 수집 5,787만 → 격차 1.33억.
 *
 * 소급이 되는 건 확인됐다 — 선명(e2) 하나카드 1~3월 134건이 등록일(07-08)보다 이른데도
 * 08-10 에 `codef_transaction_id` 를 달고 적재됐다. 바로빌은 등록 전 구간도 내준다.
 *
 * 중복은 서버가 codef_transaction_id 로 걸러내므로 몇 번 돌려도 안전하다.
 *
 * 사용:
 *   CARD_URL=https://webapp-9i0.pages.dev CARD_USER=<id> CARD_PASS=<pw> \
 *     node scripts/card-backfill.cjs --entity 1 --from 2026-01 --to 2026-04
 *
 *   --dry-run  로그인·카드 목록까지만 확인하고 수집은 하지 않는다
 *
 * ⚠️ 바로빌 SOAP 유료 호출이다. 월 단위로 끊어 부르므로(타임아웃·호출량 회피)
 *    기간이 길수록 호출이 늘어난다. 먼저 한 달만 돌려 결과를 보고 늘리는 것을 권한다.
 */
const BASE = (process.env.CARD_URL || 'http://localhost:3000').replace(/\/$/, '')
const USER = process.env.CARD_USER || 'admin'
const PASS = process.env.CARD_PASS || 'password'

const arg = (k, d) => {
  const i = process.argv.indexOf('--' + k)
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : d
}
const DRY = process.argv.includes('--dry-run')
const ENTITY = Number(arg('entity', 1))
const FROM = arg('from', '2026-01')
const TO = arg('to', '2026-04')

const won = v => Number(v || 0).toLocaleString('ko-KR')

async function api(path, { method = 'GET', body, token } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let json
  try { json = JSON.parse(text) } catch { json = { raw: text.slice(0, 300) } }
  return { status: res.status, json }
}

// 달 목록 (YYYY-MM 포함 구간)
function months(from, to) {
  const out = []
  let [y, m] = from.split('-').map(Number)
  const [ey, em] = to.split('-').map(Number)
  while (y < ey || (y === ey && m <= em)) {
    out.push([y, m])
    if (++m > 12) { m = 1; y++ }
  }
  return out
}
const lastDay = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate()
const pad = n => String(n).padStart(2, '0')

;(async () => {
  console.log(`카드 승인내역 소급 수집 — ${BASE} · 법인 e${ENTITY} · ${FROM} ~ ${TO}${DRY ? ' (dry-run)' : ''}\n`)

  const login = await api('/api/auth/login', { method: 'POST', body: { username: USER, password: PASS } })
  if (login.status !== 200 || !login.json?.data?.token) {
    console.error('로그인 실패:', login.status, JSON.stringify(login.json).slice(0, 200))
    console.error('CARD_URL / CARD_USER / CARD_PASS 를 확인하세요.')
    process.exit(1)
  }
  let token = login.json.data.token

  // 대상 법인으로 전환 (수집은 세션 법인 기준으로 카드를 고른다)
  const sw = await api('/api/auth/switch-entity', { method: 'POST', token, body: { entity_id: ENTITY } })
  if (sw.status !== 200 || !sw.json?.data?.token) {
    console.error('법인 전환 실패:', sw.status, JSON.stringify(sw.json).slice(0, 200))
    process.exit(1)
  }
  token = sw.json.data.token

  const cards = await api('/api/card-expenses/cards', { token })
  const list = cards.json?.data || []
  console.log(`대상 카드 ${list.length}장`)
  for (const c of list) {
    console.log(`  ${String(c.card_company || '').padEnd(6)} ${c.card_number_last4 || '(번호없음)'}  ${c.card_name || ''}`
      + (c.barobill_registered ? '' : '   ← 바로빌 미등록: 수집 안 됨'))
  }
  const unreg = list.filter(c => !c.barobill_registered || !c.card_number_last4)
  if (unreg.length) {
    console.log(`\n⚠️ ${unreg.length}장은 바로빌에 등록돼 있지 않아 아무리 돌려도 0건이다.`)
    console.log('   카드 관리에서 「바로빌 연동」으로 등록해야 수집 경로가 생긴다.')
  }
  if (DRY) { console.log('\n(dry-run — 수집하지 않고 종료)'); return }

  console.log('\n월별 수집 (중복은 서버가 codef_transaction_id 로 무시)\n')
  let total = 0
  for (const [y, m] of months(FROM, TO)) {
    const ds = `${y}-${pad(m)}-01`
    const de = `${y}-${pad(m)}-${pad(lastDay(y, m))}`
    const t0 = Date.now()
    const r = await api('/api/card-expenses/sync', { method: 'POST', token, body: { date_start: ds, date_end: de } })
    const d = r.json?.data || {}
    const ok = r.status === 200 && r.json?.success
    total += Number(d.inserted || 0)
    console.log(`  ${y}-${pad(m)}  ${ok ? '신규 ' + String(d.inserted ?? '?').padStart(4) + '건'
      : '실패 ' + r.status + ' ' + String(r.json?.error || '').slice(0, 60)}`
      + `  (중복 ${d.skipped ?? '-'} · 월별 ${d.monthlyFetched ?? '-'} · 일별 ${d.dailyFetched ?? '-'} · ${((Date.now() - t0) / 1000).toFixed(1)}s)`)
    if (Array.isArray(d.errors) && d.errors.length) {
      d.errors.slice(0, 3).forEach(e => console.log(`        ! ${String(e).slice(0, 120)}`))
    }
  }
  console.log(`\n합계 신규 ${total}건`)
  console.log('확인: /card-expenses 에서 해당 월을 조회하거나')
  console.log('      npx wrangler d1 execute webapp-production --remote --command "SELECT substr(transaction_date,1,6) ym, COUNT(*) n, SUM(amount) amt FROM card_transactions WHERE entity_id=' + ENTITY + ' GROUP BY ym ORDER BY ym"')
})().catch(e => { console.error(e); process.exit(1) })
