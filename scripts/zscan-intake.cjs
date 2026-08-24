#!/usr/bin/env node
/**
 * zscan-intake.cjs — Z: 작업파일 스캔 → 가공대기함(designer_intakes) 적재
 *
 * 무엇을 메우는가:
 *   디자이너 세션 루프의 하류(대기함 → 주문서 프리필 → 주문 → 카드 → print_file_map → 출력완료)는
 *   이미 prod 다. 비어 있던 건 **입구 하나** — 이미 Z: 에 쌓여 있는 기존 작업파일을
 *   대기함에 올리는 경로다. 이 스크립트가 그 입구다.
 *
 *   타당성은 이카운트를 정답지로 오프라인 채점해 확인했다(docs/order-file-matching/).
 *   전량 일치 주문 76.7% · 유효 커버리지 58.8% · 정답지에 없음 7.3%(재출력·수정·샘플).
 *
 * ★ 자동 확정하지 않는다.
 *   status='waiting' 으로만 넣는다. 주문 생성은 사람이 트레이에서 확인하고 프리필로 한다.
 *   7.3% 는 대응 주문이 아예 없고(재출력·수정본 → docs/REWORK_RULES.md), 규격도 20% 는 어긋난다.
 *
 * ★ 파싱 실패분도 올린다.
 *   조용히 버리는 게 제일 위험하다. 규격·거래처를 못 읽으면 값을 비운 채 memo 에 사유를 남긴다.
 *
 * 사용법:
 *   node scripts/zscan-intake.cjs --from 2026-08-01 --to 2026-08-11           # dry-run(기본)
 *   node scripts/zscan-intake.cjs --from 2026-08-01 --to 2026-08-11 --commit  # 실제 적재
 *
 * 썸네일(카드에 그림이 붙게 하려면):
 *   python scripts/zscan-thumb.py --from … --to … --out thumbs.jsonl   # EPS 내장 프리뷰 추출
 *   node scripts/zscan-intake.cjs --from … --to … --thumbs thumbs.jsonl --commit
 *   일러스트레이터 없이 뽑는다 — 3축 EPS 는 100% DOS 헤더에 TIFF 프리뷰를 품고 있다.
 *   ZSCAN_URL=http://192.168.0.94:3000 ZSCAN_USER=admin ZSCAN_PASS=password ...
 *
 * 환경 변수:
 *   ZSCAN_URL  기본 http://localhost:3000
 *   ZSCAN_USER 기본 admin      ZSCAN_PASS 기본 password
 *   ZSCAN_ROOT 기본 Z:\
 *
 * 멱등:
 *   source_folder(=축\상대경로)를 보내면 라우트가 memo 로 중복을 걸러 기존 레코드를 돌려준다.
 *   같은 구간을 다시 돌려도 중복 적재되지 않는다.
 */

const fs = require('fs')
const path = require('path')

const BASE = (process.env.ZSCAN_URL || 'http://localhost:3000').replace(/\/$/, '')
const USER = process.env.ZSCAN_USER || 'admin'
const PASS = process.env.ZSCAN_PASS || 'password'
const ROOT = process.env.ZSCAN_ROOT || 'Z:\\'

// 스캔 축. 채점에서 기여가 확인된 3축만 켠다.
//   ☆간판·★시트 CUT★ 는 파일명에 규격이 1% 뿐이라 실측 대비 노이즈만 늘렸다(유효 커버리지 -0.8pp).
const AXES = [
  { name: '★UV솔벤★', dir: '★UV솔벤★', grammar: 'main' },
  { name: '★현수막-수성출력★', dir: '★현수막-수성출력★', grammar: 'main' },
  // ⚠️ 축 경로에 연도를 넣지 않는다. 넣으면 `2026` 이 루트에 흡수돼 상대경로에서 사라지고,
  //    날짜 파싱이 연도를 못 찾아 **축 전체가 조용히 탈락한다**(실측: 전사 1,355건 전량 유실).
  { name: '메인1', dir: path.join('메인1', '메인1'), grammar: 'jeonsa' },
]
const EXT_OK = new Set(['.eps', '.ai', '.pdf'])

// ── 파일명 문법 ────────────────────────────────────────────
// 27-(수정)(솔벤현수막)연안애드마트-농협공판장(506X92-1장)사방접어미싱_13일 오전직배.eps
//  |  |     |            |          |        |            |          납기·배송
//  |  |     제품유형      거래처     건명     규격+수량     후가공
//  |  상태플래그
//  그날 접수순번
// 연도 폴더는 축마다 표기가 다르다: `2026년도`(수성) · `2026년`(UV솔벤) · `2026`(전사).
// `년` 을 필수로 두면 전사축이 통째로 탈락한다 → 숫자만 있는 경우도 받는다.
const RX_Y = /^\s*(20\d\d)\s*(?:년도?)?\s*$/
const RX_M = /(\d{1,2})\s*월/
const RX_D = /(\d{1,2})\s*일/
const RX_SEQ = /^\s*(\d{1,3})\s*-/
const RX_SPEC_X = /(\d{1,4}(?:\.\d+)?)\s*[xX*×]\s*(\d{1,4}(?:\.\d+)?)/
// dash 형은 괄호 안으로 한정한다 — 안 그러면 날짜·전화번호를 규격으로 읽는다
const RX_SPEC_DASH = /\(\s*(\d{2,4}(?:\.\d+)?)\s*-\s*(\d{2,4}(?:\.\d+)?)\s*(?=[-)])/
const RX_QTY = /(\d+)\s*(장|번|개|조|벌|EA|ea)/
const RX_FLAG = /\((수정|재출력|재|샘플|추가)\)/
const RX_PAREN = /^\(([^()]*)\)/
const RX_FLAG_HEAD = /^\((수정|재출력|재|샘플|추가)\)/

// `조` = 1쌍 = 2개 (용준님 확정). `벌` 은 미확정이라 배수를 적용하지 않는다.
const QTY_MULT = { 조: 2 }

function isSpecToken(t) {
  t = t.trim()
  if (RX_SPEC_X.test(t)) return true
  return /^[\d.\s\-]+(장|번|개)?$/.test(t)
}

function parseDate(ctx) {
  let y = null, m = null, d = null
  for (const p of ctx.split(path.sep)) {
    if (y === null) { const mo = p.match(RX_Y); if (mo) { y = +mo[1]; continue } }
    if (y !== null && m === null) { const mo = p.match(RX_M); if (mo) { m = +mo[1]; continue } }
    if (m !== null && d === null) { const mo = p.match(RX_D); if (mo) { d = +mo[1]; continue } }
  }
  return { y, m, d }
}

function parseSpec(text) {
  let mo = text.match(RX_SPEC_X)
  if (!mo) mo = text.match(RX_SPEC_DASH)
  if (!mo) return { w: null, h: null, qty: null }
  const w = parseFloat(mo[1]), h = parseFloat(mo[2])
  // 수량은 규격 바로 뒤 ~ 닫는 괄호 사이. 사이에 후가공이 낀다: `(330x474-고주파접합 1장)`
  const tail = text.slice(mo.index + mo[0].length)
  const cut = tail.indexOf(')')
  const seg = cut >= 0 ? tail.slice(0, cut) : tail.slice(0, 30)
  const q = seg.match(RX_QTY)
  const qty = q ? +q[1] * (QTY_MULT[q[2]] || 1) : null
  return { w, h, qty }
}

// ★선두 괄호로 앵커한다. 아무 괄호나 집으면 꼬리의 `10일 오전직배` 가 제품유형이 된다.
function parseTypeClient(name) {
  let s = name.replace(RX_SEQ, '').trim()
  for (;;) {
    const mo = s.match(RX_FLAG_HEAD)
    if (!mo) break
    s = s.slice(mo[0].length).trim()
  }
  const mo = s.match(RX_PAREN)
  // 제품유형 괄호가 없는 형태도 흔하다: `29-선전인쇄-한밭전자거리(300X90-3장)…`
  // 이때 순번 바로 뒤가 거래처다. 이 폴백이 없으면 거래처를 통째로 놓친다(8월 표본의 13%).
  // ★단 weak 로 표시한다 — `반석동01(120x213-1장)출력만.eps` 처럼 **건명**이 올 때가 있고,
  //   그런 파일은 폴더(`07-모든광고-…`)가 진짜 거래처를 갖고 있다. 폴더가 이긴다.
  if (!mo || !mo[1].trim() || isSpecToken(mo[1].trim())) {
    const m0 = s.match(/^\s*([^-(\[_]{2,25})\s*[-(]/)
    if (m0) {
      const c = m0[1].trim()
      if (c && !/^\d/.test(c)) return { ptype: null, client: c, weak: true }
    }
    return { ptype: null, client: null }
  }
  const tok = mo[1].trim()
  let client = null
  const m2 = s.slice(mo[0].length).match(/^\s*([^-(\[_]{1,25})/)
  if (m2) {
    const c = m2[1].trim()
    if (c && !/^\d/.test(c)) client = c
  }
  return { ptype: tok, client }
}

// 전사축은 문법이 다르다: `디자인엠투 전국당구대회(50-150-40조).eps` — 제품유형·순번이 없다.
//
// ★품목 단서는 **폴더에** 있다(`광고월드-어구실명제\` · `주니그래픽-윈드배너\소형\` ·
//   `육군부사관학교-대대기,중대기\중대기\`). 파일명만 훑으면 1.0% 밖에 못 잡는데
//   경로 전체를 보면 25.3% 가 잡힌다. 규격까지 합치면 61.1%.
//   전사는 제품유형이 `전사` 하나로 뭉뚱그려져 품목 매핑이 42.6% 미해소였다 — 여기가 최대 덩어리다.
const JEONSA_KEYS = [
  ['어구실명제', '전사 어구실명제'], ['가로등배너', '전사 가로등배너'],
  ['자이언트배너', '전사 자이언트배너'], ['워킹배너', '전사 워킹배너'],
  ['윈드배너', '전사 윈드배너'], ['외국기배너', '전사 외국기배너'],
  ['태극기배너', '전사 태극기배너'], ['만장기', '전사 만장기'],
  ['군부대기', '전사 만장기'], ['대대기', '전사 만장기'], ['중대기', '전사 만장기'],
  ['만국기', '만국기'], ['근조기', '근조기'], ['새마을기', '새마을기'],
  ['민방위기', '민방위기'], ['무재해기', '무재해기'], ['노인회기', '노인회기'],
  ['태극기', '태극기'], ['수기', '태극기 수기'], ['깃발', '전사 깃발'],
]
// 원단(폰지/매쉬/샤틴)과 형(S/F/H)은 같은 품목 안에서 코드를 가른다
const JEONSA_FABRIC = [['폰지', '폰지'], ['매쉬', '매쉬'], ['메쉬', '매쉬'], ['샤틴', '샤틴']]
const JEONSA_FORM = [['H형', 'H형'], ['S형', 'S형'], ['F형', 'F형']]
// 키워드가 없을 때 **규격이 품번**이다(마스터 specification 과 같은 축).
//   정렬된 `짧은x긴` 형태로 조회한다. 호수 계열은 후보가 여럿이라 대표 품목만 적는다 —
//   최종 확정은 사람이 하고, 여기선 「전사」 뭉뚱그림을 벗기는 게 목적이다.
const JEONSA_BY_SPEC = {
  '60x150': '전사 가로등배너', '60x160': '전사 가로등배너', '60x180': '전사 가로등배너',
  '90x135': '태극기 7호', '80x120': '태극기 7호-1', '60x90': '태극기 8호',
  '70x105': '태극기 8호-1', '102x153': '태극기 6호', '120x180': '태극기 5호',
  '150x225': '태극기 4호', '140x210': '태극기 4호-1', '180x270': '태극기 3호',
  '204x306': '태극기 2호', '300x450': '태극기 1호', '40x60': '태극기 9호',
  '20x30': '태극기 수기 30×20', '30x45': '태극기 수기 45×30',
}

function parseJeonsa(base, rel) {
  const { w, h, qty } = parseSpec(base)
  const head = base.split(/[(\[]/)[0].trim()
  const client = head ? head.split(/\s+/)[0].slice(0, 25) : null
  // 경로 전체(폴더+파일명)에서 품목어를 찾는다 — 파일명만 보면 놓친다
  const ctx = String(rel || base)
  let ptype = null
  for (const [k, label] of JEONSA_KEYS) {
    if (ctx.includes(k)) { ptype = label; break }
  }
  // 키워드가 없으면 **규격이 품번**이다. 전사·태극기 품목은 호수가 치수로 정의돼 있다
  //   (7호=135×90 · 8호=90×60 · 가로등배너 60×150/160/180). 마스터 규격과 같은 축이다.
  if (!ptype && w && h) {
    const [a, b] = [Math.round(w), Math.round(h)].sort((x, y) => x - y)
    ptype = JEONSA_BY_SPEC[`${a}x${b}`] || null
  }
  if (ptype) {
    const fab = JEONSA_FABRIC.find(([f]) => ctx.includes(f))
    const frm = JEONSA_FORM.find(([f]) => ctx.includes(f))
    if (fab) ptype += ' ' + fab[1]
    if (frm) ptype += ' ' + frm[1]
  }
  return { ptype: ptype || '전사', client: client || null, w, h, qty }
}

function parseFile(axis, rel, name) {
  const base = name.replace(/\.[^.]+$/, '')
  const dirs = path.dirname(rel)
  const { y, m, d } = parseDate(path.join(axis.name, rel))

  let seq = null
  const mo = base.match(RX_SEQ)
  if (mo) seq = +mo[1]
  else {
    for (const seg of dirs.split(path.sep).reverse()) {
      const m2 = seg.match(RX_SEQ)
      if (m2) { seq = +m2[1]; break }
    }
  }

  let ptype, client, w, h, qty
  if (axis.grammar === 'jeonsa') {
    ({ ptype, client, w, h, qty } = parseJeonsa(base, rel))
  } else {
    ({ w, h, qty } = parseSpec(base))
    const own = parseTypeClient(base)
    ptype = own.ptype
    client = own.weak ? null : own.client        // weak 는 폴더를 먼저 물어본 뒤에 쓴다
    // 파일에 없으면 폴더에서 승계 — `15-모든광고-노랑통닭…\(포맥스3T)…(102x21-1장).eps`
    if ((!ptype || !client) && dirs && dirs !== '.') {
      for (const seg of dirs.split(path.sep).reverse()) {
        const r = parseTypeClient(seg)
        if (!ptype && r.ptype) ptype = r.ptype
        if (!client && r.client) client = r.client
        if (ptype && client) break
      }
      if (!client) {
        for (const seg of dirs.split(path.sep).reverse()) {
          // `11-[P-2050]그린팩토리-…` 처럼 순번 뒤에 코드 대괄호가 끼는 경우가 있다.
          // 그걸 안 건너뛰면 거래처를 통째로 놓친다(실측 8건 → 미지정).
          const m3 = seg.match(/^\s*\d{1,3}\s*-\s*(?:\[[^\]]*\]\s*)?([^-(\[_]{1,25})/)
          if (m3 && m3[1].trim() && !/^\d/.test(m3[1].trim())) { client = m3[1].trim(); break }
        }
      }
    }
    if (!client && own.weak) client = own.client  // 폴더도 모르면 그제야 파일의 약한 후보
  }

  const flag = base.match(RX_FLAG)
  return { axis: axis.name, rel, name, y, m, d, seq, ptype, client, w, h, qty, flag: flag ? flag[1] : null }
}

// ── 그룹 키 — 조인 단위는 파일이 아니라 「주문 그룹」이다 ────────────
// 파일 1개 ≠ 주문 1라인. `(600x70-1장)` 파일 7개 = 주문 `7장` 1라인.
// 대기함에서는 batch_key 로 실현된다(0477) — 트레이가 이 키로 묶어 보여준다.
// ★접수순번은 **축마다 따로** 매겨진다. 축을 키에 넣지 않으면 같은 날 같은 번호의
//   서로 다른 주문이 한 덩어리가 된다(실측: `02-호야디자인-BOB`(UV솔벤) + `02-디자인인포`(수성)).
//   축 이름은 짧은 코드로 줄인다 — batch_key 가 길어지면 목록에서 잘린다.
const AXIS_CODE = { '★UV솔벤★': 'U', '★현수막-수성출력★': 'A', '메인1': 'J' }

function groupKey(r) {
  const dt = `${r.y}-${String(r.m).padStart(2, '0')}-${String(r.d).padStart(2, '0')}`
  const ax = AXIS_CODE[r.axis] || 'X'
  if (r.seq != null) return `${dt}#${ax}S${r.seq}`
  if (r.client) return `${dt}#${ax}C${r.client.replace(/\s/g, '')}`
  // 폴백 leaf = 「작업 폴더」를 그룹으로 쓰려는 것이다. 그런데 출력이 끝나면 사람이 파일을
  // 완료·배송 폴더로 옮긴다 → leaf 가 `완`·`택배` 로 바뀌어 **같은 일이 다른 그룹이 된다**.
  // 완료성 폴더는 건너뛰고 위로 올라가 실제 작업 폴더를 찾는다(없으면 날짜 폴더).
  const segs = r.rel.split(/[\\/]/).slice(0, -1)
  let leaf = ''
  for (let i = segs.length - 1; i >= 3; i--) {     // 0..2 = 연/월/일 은 제외
    if (!isDoneFolder(segs[i])) { leaf = segs[i]; break }
  }
  return `${dt}#${ax}D${leaf || 'root'}`
}

// 출력완료·배송 표시용 폴더 이름 — 축마다 관행이 다르다(수성=`완`·출력실 / UV솔벤=택배·화물·방문·직배).
// 실측(2026-08-01~11): UV솔벤 261건 **전량**이 배송 폴더 안, 수성 `완` 195건.
const RX_DONE_FOLDER = /^(완(료)?|출력실|현수막(실)?|택배|화물|방문|직배|직배[.,]?방문|방문[.,]?직배|간판팀)$/

function isDoneFolder(name) {
  return RX_DONE_FOLDER.test(String(name || '').trim())
}

/**
 * 멱등 키 = 「축\연\월\일\파일명」.
 *
 * ★상대경로 전체를 키로 쓰면 안 된다. 출력이 끝나면 사람이 파일을 완료·배송 폴더로 **옮긴다** —
 *   경로가 바뀌므로 다음 스캔이 **같은 파일을 새 파일로 등록**한다(대기함 중복).
 *   실측: 8/1~8/11 1,337건 중 790건이 이미 완료·배송 폴더 안에 있었고, 그 **790건 전부**
 *   앞 3칸(연/월/일)은 그대로였다 → 날짜+파일명은 이동에 불변이다.
 *   같은 날짜 안 동일 파일명 충돌은 1,337건 중 2건(0.15%)뿐이라 키로 충분하다.
 */
function stableKey(r) {
  const segs = r.rel.split(/[\\/]/)
  return [r.axis, ...segs.slice(0, 3), segs[segs.length - 1]].join('\\')
}

// ── 파일 수집 ──────────────────────────────────────────────
/**
 * 축 루트에서 「연/월/일」 세 단계만 열거해 **대상 날짜 폴더**만 돌려준다.
 *
 * ★왜: Z: 는 네트워크 드라이브다. 축 루트부터 전체 트리를 walk 하면 대상이 하루치여도
 *   수천 개 항목을 SMB 로 훑는다 — 실측 **매 실행 88초**(처리할 파일 0건일 때도).
 *   10분 주기 자동 실행이 성립하려면 여기가 몇 초여야 한다.
 * 폴더 표기는 축마다 다르다: `2026년도`(수성) · `2026년`(UV솔벤) · `2026`(전사).
 */
function dayRoots(root, from, to) {
  const out = []
  const ls = (d) => { try { return fs.readdirSync(d, { withFileTypes: true }) } catch { return [] } }
  for (const y of ls(root)) {
    if (!y.isDirectory()) continue
    const my = y.name.match(RX_Y)
    if (!my) continue
    const yy = +my[1]
    if (yy < +from.slice(0, 4) || yy > +to.slice(0, 4)) continue
    for (const m of ls(path.join(root, y.name))) {
      if (!m.isDirectory()) continue
      const mm = m.name.match(RX_M)
      if (!mm) continue
      const ym = `${yy}-${String(+mm[1]).padStart(2, '0')}`
      if (ym < from.slice(0, 7) || ym > to.slice(0, 7)) continue
      for (const d of ls(path.join(root, y.name, m.name))) {
        if (!d.isDirectory()) continue
        const dd = d.name.match(RX_D)
        if (!dd) continue
        const dt = `${ym}-${String(+dd[1]).padStart(2, '0')}`
        if (dt < from || dt > to) continue
        out.push(path.join(root, y.name, m.name, d.name))
      }
    }
  }
  return out
}

function* walk(dir, depth = 0) {
  if (depth > 8) return
  let ents
  try { ents = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
  for (const e of ents) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) { yield* walk(p, depth + 1) }
    else if (EXT_OK.has(path.extname(e.name).toLowerCase())) yield p
  }
}

// ── HTTP ──────────────────────────────────────────────────
async function login() {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: USER, password: PASS }),
  })
  const data = await res.json().catch(() => null)
  if (!res.ok || !data || !data.success || !data.data || !data.data.token) {
    throw new Error(`로그인 실패 ${res.status}`)
  }
  return data.data.token
}

// ── 마스터 해소 (거래처·품목) ────────────────────────────────
// 대기함에 이름만 실어 보내면 사람이 트레이에서 매번 다시 고른다.
// 여기서 id 까지 해소해 보내면 프리필이 품목·거래처·**단가**까지 채운다
// (단가는 /api/prices 가 최근거래가 > 특약가 > 단가표 > 기본단가 순으로 제안).
const RX_NORM = /(주식회사|\(주\)|㈜|유한회사|주\)|\s|\.|,|-|\(|\)|_)/g
const norm = (s) => String(s || '').replace(RX_NORM, '').toLowerCase()

/**
 * 페이지네이션 전량 수집.
 *
 * ★근본 규칙 = **행 수로 「끝」을 추론하지 않는다. 서버가 알려주는 총건수와 대조한다.**
 *   빈 페이지를 끝으로 보는 방식은 일시적 5xx 한 번에 그대로 무너진다 —
 *   실측으로 거래처 2,845건 중 **1,000건만** 받고도 경고 없이 진행해 해소율이 58%→24.6% 로
 *   떨어졌고(6페이지째 일시 오류), 품목은 **1페이지가 실패해 0건**이 됐다.
 *   이 프로젝트에서 같은 사고를 세 번 냈다. 그래서 여기서는 두 겹으로 막는다:
 *     ① 5xx·네트워크 오류는 **횟수 제한 재시도**(무한 재시도는 그 자체가 사고다)
 *     ② 다 모은 뒤 `pagination.total` 과 **대조해 다르면 던진다** → 조용한 절단이 불가능해진다
 */
async function fetchAll(token, path, pageSize = 200, cap = 40) {
  const out = []
  let total = null
  for (let page = 1; page <= cap; page++) {
    const sep = path.includes('?') ? '&' : '?'
    const url = `${BASE}${path}${sep}page=${page}&limit=${pageSize}`
    let data = null
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
        if (res.ok) { data = await res.json().catch(() => null); if (data) break }
        if (res.status < 500 && res.status !== 429) {
          throw new Error(`${path} page=${page} 조회 실패 ${res.status}`)
        }
      } catch (e) {
        if (attempt === 3) throw e
      }
      await new Promise((r) => setTimeout(r, 500 * (attempt + 1)))
    }
    if (!data) throw new Error(`${path} page=${page} 조회 실패 — 재시도 소진`)

    // 응답 형태가 라우트마다 다르다: /api/clients 는 data.clients, /api/items 는 data 직접.
    const d = data.data
    const rows = Array.isArray(d) ? d : (d && (d.clients || d.items || d.rows)) || data.items || []
    const pg = (d && d.pagination) || data.pagination
    if (pg && Number.isFinite(Number(pg.total))) total = Number(pg.total)
    if (!Array.isArray(rows) || rows.length === 0) break
    out.push(...rows)
    if (rows.length < pageSize) break
    if (page === cap) throw new Error(`${path} 페이지 상한(${cap}) 초과 — 수집 ${out.length}건`)
    // 페이지당 ~230KB 인 목록 라우트를 쉬지 않고 15번 두드리면 중간에서 5xx 가 난다
    // (같은 페이지를 단건으로 부르면 200). 간격을 주면 재시도까지 갈 일이 거의 없다.
    await new Promise((r) => setTimeout(r, 150))
  }
  if (total != null && out.length !== total) {
    throw new Error(`${path} 수집 누락 — 받은 ${out.length} / 서버 총계 ${total}`)
  }
  return out
}

// ── 로컬 원장 ──────────────────────────────────────────────
// 왜 필요한가: 원장이 없으면 실행마다 **그날 파일 전량**을 다시 POST 한다(썸네일 base64 포함).
//   252건이 7분 넘게 걸려서 「10분마다 자동 실행」이 성립하지 않았다. 서버가 멱등으로 걸러주긴
//   하지만 그건 네트워크·CPU 를 다 쓴 뒤의 일이다. 원장으로 **보낼 것만** 고르면 몇 초로 끝난다.
// 키 = 멱등 키(축\연\월\일\파일명) · 값 = 수정시각·크기 → 파일이 바뀌면 자동으로 다시 올라간다.
//   ⚠️ 원장은 캐시일 뿐 정본이 아니다. 지워도 서버 멱등으로 복구된다(느려질 뿐).
const LEDGER = path.join(__dirname, '..', '.zscan-ledger.json')

function loadLedger() {
  try { return JSON.parse(fs.readFileSync(LEDGER, 'utf8')) } catch { return {} }
}

function saveLedger(led) {
  try { fs.writeFileSync(LEDGER, JSON.stringify(led), 'utf8') } catch (e) {
    console.warn(`  ! 원장 저장 실패(다음 실행이 느려질 뿐): ${e.message}`)
  }
}

function fileStamp(full) {
  try { const st = fs.statSync(full); return `${Math.floor(st.mtimeMs)}:${st.size}` } catch { return null }
}

// ── 규격 헤더 판독 폴백 (2026-08-24, file-dimension-probe P4) ──────────────
// 파일명에 규격이 없는 건은 EPS BoundingBox / PDF MediaBox 를 직접 읽어 복원한다.
// 정본 파서 = src/utils/fileDimensions.ts — **사본을 만들지 않고** esbuild 로 트랜스파일해 쓴다
// (orderline-selftest.cjs 와 같은 방식. 갈리면 웹과 스캐너의 판독이 어긋난다).
function loadFileDimsUtil() {
  const { execFileSync } = require('child_process')
  const os = require('os')
  const SRC = path.join(__dirname, '..', 'src', 'utils', 'fileDimensions.ts')
  const ESBUILD = path.join(__dirname, '..', 'node_modules', 'esbuild', 'bin', 'esbuild')
  const out = path.join(os.tmpdir(), `fileDimensions.zscan.${process.pid}.cjs`)
  execFileSync(process.execPath, [ESBUILD, SRC, '--format=cjs', '--platform=node', `--outfile=${out}`], {
    stdio: ['ignore', 'ignore', 'inherit'],
  })
  return require(out)
}

// 제품유형→작업배율 (learn_scale.py 학습 산출물). Z: 출력파일은 1/5·1/10 축소 저장이 흔해
// 헤더 크기 ≠ 실물이다 — specless.py 와 같은 기준(support/read ≥ 0.85)의 유형만 신뢰하고,
// 표에 없는 유형은 채우지 않는다(추측 금지 — 오늘처럼 NULL 로 남겨 사람이 본다).
function loadScaleTable() {
  const p = arg('--scale-table', path.join(__dirname, '..', 'docs', 'order-file-matching', 'scale_table.csv'))
  const tbl = new Map()
  try {
    const lines = fs.readFileSync(p, 'utf8').split('\n')
    for (const line of lines.slice(1)) {
      const [ptype, scale, support, read] = line.trim().split(',')
      if (!ptype || !scale) continue
      const sup = parseInt(support, 10) || 0
      const rd = Math.max(parseInt(read, 10) || 1, 1)
      if (sup / rd >= 0.85) tbl.set(norm(ptype), parseFloat(scale))
    }
  } catch (e) { console.warn(`  ! 배율표 로드 실패(${p}): ${e.message}`) }
  return tbl
}

/** 파일 머리(+필요 시 꼬리) 64KB 판독 → {w_cm,h_cm,source} | null. 실패는 조용히 null(폴백이므로). */
function probeFileDims(dims, full) {
  try {
    const st = fs.statSync(full)
    const fd = fs.openSync(full, 'r')
    const headBuf = Buffer.alloc(Math.min(dims.PROBE_BYTES, st.size))
    fs.readSync(fd, headBuf, 0, headBuf.length, 0)
    const head = headBuf.toString('utf8')
    let tail
    if (dims.needsTailScan(head) && st.size > dims.PROBE_BYTES) {
      const tailBuf = Buffer.alloc(dims.PROBE_BYTES)
      fs.readSync(fd, tailBuf, 0, dims.PROBE_BYTES, st.size - dims.PROBE_BYTES)
      tail = tailBuf.toString('utf8')
    }
    fs.closeSync(fd)
    const r = dims.parseFileDimensions(head, tail)
    return (r.source !== 'none' && r.w_cm > 0 && r.h_cm > 0) ? r : null
  } catch { return null }
}

/** 페이지네이션 없는 단일 응답 수집 — 5xx 는 재시도, 끝내 실패하면 던진다. */
async function fetchOne(token, path) {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(`${BASE}${path}`, { headers: { Authorization: `Bearer ${token}` } })
      if (res.ok) {
        const data = await res.json().catch(() => null)
        const rows = data && (Array.isArray(data.data) ? data.data : null)
        if (rows) return rows
      } else if (res.status < 500 && res.status !== 429) {
        throw new Error(`${path} 조회 실패 ${res.status}`)
      }
    } catch (e) {
      if (attempt === 3) throw e
    }
    await new Promise((r) => setTimeout(r, 500 * (attempt + 1)))
  }
  throw new Error(`${path} 조회 실패 — 재시도 소진`)
}

async function buildClientIndex(token) {
  // 경량 전용 라우트 = 한 응답에 전량(페이지네이션·상관 서브쿼리 없음).
  //   목록 라우트를 15페이지 긁던 방식은 중간에서 5xx 가 나 **조용히 잘렸다**.
  const rows = await fetchOne(token, '/api/clients/name-index')
  const exact = new Map()      // 정규화명 → [id]  (등록명 + **학습된 별칭**)
  const last = new Map()       // id → 마지막 거래일 (후보가 여럿일 때 가르는 근거)
  const add = (k, id) => {
    if (!k || k.length < 2) return
    if (!exact.has(k)) exact.set(k, [])
    if (!exact.get(k).includes(id)) exact.get(k).push(id)
  }
  for (const c of rows) {
    add(norm(c.client_name), c.id)
    // ★search_keywords = 흡수 때 학습된 파일 표기(workbench.ts absorb).
    //   사람이 한 번 고른 표기가 여기 쌓이므로 다음 스캔부터 자동 해소된다.
    for (const kw of String(c.search_keywords || '').split(',')) add(norm(kw), c.id)
    last.set(c.id, c.last_order_date || '')
  }

  return {
    size: rows.length,
    resolve(name) {
      const k = norm(name)
      if (!k) return null
      if (exact.has(k) && exact.get(k).length === 1) return exact.get(k)[0]
      const hits = []
      for (const [kk, ids] of exact) {
        if (kk.length >= 2 && (k.includes(kk) || kk.includes(k))) {
          for (const id of ids) if (!hits.includes(id)) hits.push(id)
        }
      }
      if (hits.length === 0) return null
      if (hits.length === 1) return hits[0]
      // ── 후보 여럿 ── 사람에게 넘기기 전에 **거래 이력**으로 가른다.
      //   ★억지로 붙이면 엉뚱한 거래처에 매출이 선다. 아래 두 경우만 인정한다.
      const withHist = hits.filter((id) => last.get(id))
      if (withHist.length === 1) return withHist[0]         // 거래가 있는 곳이 하나뿐
      if (withHist.length > 1) {
        // 최근성 압도: 1위가 2위보다 90일 이상 최근이면 사실상 그곳이다.
        //   (거래 '건수' 는 목록 API 가 안 주므로 최근일로 대신한다)
        const srt = withHist.slice().sort((a, b) => String(last.get(b)).localeCompare(String(last.get(a))))
        const d0 = Date.parse(last.get(srt[0])), d1 = Date.parse(last.get(srt[1]))
        if (d0 && d1 && d0 - d1 >= 90 * 86400000) return srt[0]
      }
      return null                                           // 여기까지 오면 사람이 고른다
    },
  }
}

// 품목 매핑표(docs/order-file-matching/item_map_draft.csv) — 파일 제품유형 → 품목코드
function loadItemMap(csvPath) {
  const map = new Map()
  if (!csvPath || !fs.existsSync(csvPath)) return map
  const lines = fs.readFileSync(csvPath, 'utf8').replace(/^﻿/, '').split(/\r?\n/)
  if (!lines.length) return map
  const head = splitCsv(lines[0])
  const iType = head.indexOf('파일표기')
  const iCode = head.indexOf('제안_품목코드')
  if (iType < 0 || iCode < 0) return map
  for (const line of lines.slice(1)) {
    if (!line.trim()) continue
    const cols = splitCsv(line)
    const t = (cols[iType] || '').trim()
    const code = (cols[iCode] || '').trim()
    if (t && code && !code.startsWith('(')) map.set(norm(t), code)
  }
  return map
}

function splitCsv(line) {
  const out = []
  let cur = '', q = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (q) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++ }
      else if (ch === '"') q = false
      else cur += ch
    } else if (ch === '"') q = true
    else if (ch === ',') { out.push(cur); cur = '' }
    else cur += ch
  }
  out.push(cur)
  return out
}

async function buildItemIndex(token) {
  const rows = await fetchAll(token, '/api/items?active=1')
  const byCode = new Map()
  for (const it of rows) {
    if (it.item_code && !byCode.has(it.item_code)) byCode.set(it.item_code, it.id)
  }
  return { size: rows.length, byCode }
}

// 일시적 5xx 는 재시도한다 — 실측 2026-08-12: 252건 적재에서 **42건이 500** 으로 떨어졌는데
// 같은 요청을 다시 보내면 통과했다(로그인조차 간헐 500). 썸네일 base64 + R2 외부화가 무거워
// 몰아치면 워커가 간헐적으로 던진다. 재시도가 없으면 그 42건은 **조용히 사라진다**
// (라우트가 source_folder 로 멱등이라 재시도는 안전 — 중복이 생기지 않는다).
async function postIntake(token, payload, tries = 4) {
  let last = { ok: false, status: 0, data: null }
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(`${BASE}/api/workbench/intakes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      })
      const data = await res.json().catch(() => null)
      last = { ok: res.ok && data && data.success, status: res.status, data }
      if (last.ok) return last
      if (res.status < 500 && res.status !== 429) return last      // 4xx = 재시도해도 같다
    } catch (e) {
      last = { ok: false, status: 0, data: { error: String(e && e.message || e) } }
    }
    await new Promise((r) => setTimeout(r, 500 * (i + 1)))         // 0.5s → 1s → 1.5s
  }
  return last
}

async function voidIntakes(token, ids) {
  if (!ids.length) return
  await fetch(`${BASE}/api/workbench/intakes/void-bulk`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ ids }),
  }).catch(() => {})
}

// ── 파일 변경 감지 ────────────────────────────────────────────
// 멱등 키(source_folder)만 보면 「전에 올린 파일」은 무조건 건너뛴다.
// 그래서 규격을 고쳐 다시 저장해도 MES 는 옛 값 그대로였다 — 조용히 틀리는 종류의 버그다.
// 이제 라우트가 기존 값을 돌려주므로 **의미값**을 비교해 바뀐 것만 다시 올린다.
//   ★파일 수정시각으로 판정하지 않는다 — 그림만 다시 저장해도 시각이 바뀌어 매번 재적재된다.
const CMP_KEYS = ['width_cm', 'height_cm', 'qty', 'client_id', 'item_id']

function changedFields(prev, next) {
  const out = []
  for (const k of CMP_KEYS) {
    const a = prev[k] == null ? null : Number(prev[k])
    const b = next[k] == null ? null : Number(next[k])
    if (a === null && b === null) continue
    if (a === null || b === null || Math.abs(a - b) > 0.01) {
      out.push({ key: k, from: prev[k], to: next[k] })
    }
  }
  return out
}

const LABEL = { width_cm: '가로', height_cm: '세로', qty: '수량', client_id: '거래처', item_id: '품목' }

// 내용에서 결정되는 짧은 지문. 같은 내용이면 같은 값이라 재실행이 수렴한다
// (버전 꼬리를 매번 새로 만들면 돌릴 때마다 새 대기물이 쌓인다).
function fingerprint(o) {
  const s = CMP_KEYS.map((k) => (o[k] == null ? '' : o[k])).join('|')
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0
  return h.toString(36)
}

// ── main ──────────────────────────────────────────────────
function arg(flag, def) {
  const i = process.argv.indexOf(flag)
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def
}

async function main() {
  const from = arg('--from', null)
  const to = arg('--to', null)
  const commit = process.argv.includes('--commit')
  const limit = parseInt(arg('--limit', '0'), 10) || 0
  const entityId = parseInt(arg('--entity', '1'), 10) || 1
  if (!from || !to) {
    console.error('사용법: node scripts/zscan-intake.cjs --from YYYY-MM-DD --to YYYY-MM-DD [--commit] [--limit N]')
    process.exit(2)
  }

  const rows = []
  for (const axis of AXES) {
    const root = path.join(ROOT, axis.dir)
    if (!fs.existsSync(root)) { console.warn(`  ! 축 없음: ${root}`); continue }
    // ★축 루트부터 전 연도를 훑지 않는다. Z: 는 네트워크 드라이브라 전체 트리 walk 만으로
    //   **매 실행 88초**가 나갔다(처리할 파일이 0건이어도). 날짜 폴더로 바로 내려가면 몇 초다.
    //   연/월/일 폴더 표기가 축마다 달라(2026년도·2026년·2026) 정규식으로 고른다.
    for (const dayDir of dayRoots(root, from, to)) {
    for (const full of walk(dayDir)) {
      const rel = path.relative(root, full)
      const r = parseFile(axis, rel, path.basename(full))
      if (!(r.y && r.m && r.d)) continue
      const dt = `${r.y}-${String(r.m).padStart(2, '0')}-${String(r.d).padStart(2, '0')}`
      if (dt < from || dt > to) continue
      r.dt = dt
      r.full = full
      rows.push(r)
    }
    }
  }

  const groups = new Map()
  for (const r of rows) {
    const k = groupKey(r)
    if (!groups.has(k)) groups.set(k, [])
    groups.get(k).push(r)
  }

  // 썸네일 사전 추출분(zscan-thumb.py) — 원본 절대경로로 찾는다
  const thumbPath = arg('--thumbs', null)
  const thumbs = new Map()
  if (thumbPath && fs.existsSync(thumbPath)) {
    for (const line of fs.readFileSync(thumbPath, 'utf8').split('\n')) {
      if (!line.trim()) continue
      try {
        const t = JSON.parse(line)
        if (t.path && t.b64) thumbs.set(t.path.toLowerCase(), t)
      } catch { /* 깨진 줄은 건너뛴다 — 썸네일은 부가정보다 */ }
    }
    console.log(`  썸네일 ${thumbs.size.toLocaleString()}건 로드`)
  } else if (thumbPath) {
    console.warn(`  ! 썸네일 파일 없음: ${thumbPath}`)
  }

  const nSpec = rows.filter((r) => r.w && r.h).length
  const nClient = rows.filter((r) => r.client).length
  console.log(`스캔 ${from} ~ ${to} · 축 ${AXES.length}개`)
  console.log(`  파일 ${rows.length.toLocaleString()} · 그룹 ${groups.size.toLocaleString()}`)
  console.log(`  규격 ${nSpec.toLocaleString()} (${(nSpec / Math.max(rows.length, 1) * 100).toFixed(0)}%)`
    + ` · 거래처 ${nClient.toLocaleString()} (${(nClient / Math.max(rows.length, 1) * 100).toFixed(0)}%)`)

  let targets = limit ? rows.slice(0, limit) : rows

  // 원장으로 「이미 올렸고 안 바뀐 파일」을 **네트워크 전에** 걸러낸다(10분 주기의 전제).
  //   --force = 원장 무시(전량 재시도). --json 은 파싱 결과 전량이 필요하므로 필터 전 값을 쓴다.
  const ledger = loadLedger()
  const jsonTargets = targets
  if (commit && !process.argv.includes('--force')) {
    const before = targets.length
    targets = targets.filter((r) => ledger[stableKey(r)] !== fileStamp(r.full))
    if (before !== targets.length) {
      console.log(`  원장 스킵 ${(before - targets.length).toLocaleString()}건 (변경분 ${targets.length.toLocaleString()}건만 처리)`)
    }
  }

  // --json <경로> : 파싱 결과를 기계판독으로 내보낸다.
  //   ★파서를 두 벌 만들지 않기 위해서다. 파일↔주문 연결기(`zscan-link-orders.py`)가 이걸 먹는다 —
  //     따로 파싱하면 그룹 키·규격 규칙이 갈리고, 갈리면 연결이 조용히 어긋난다(축 코드 때 겪음).
  const jsonOut = arg('--json', null)
  if (jsonOut) {
    // ★원장 필터 전 목록(jsonTargets)을 쓴다 — 연결기는 그날 **전량**이 필요하다.
    //   변경분만 넘기면 어제 올린 파일이 주문에 안 붙는다.
    fs.writeFileSync(jsonOut, JSON.stringify(jsonTargets.map((r) => ({
      group: groupKey(r), axis: r.axis, rel: r.rel, full: r.full, name: r.name,
      date: `${r.y}-${String(r.m).padStart(2, '0')}-${String(r.d).padStart(2, '0')}`,
      seq: r.seq ?? null, client: r.client || null, ptype: r.ptype || null,
      w: r.w || null, h: r.h || null, qty: r.qty || 1, flag: r.flag || null,
    })), null, 0), 'utf8')
    console.log(`  → JSON ${jsonTargets.length.toLocaleString()}건: ${jsonOut}`)
  }

  // ── 규격 미파싱 건 헤더 판독 폴백 (P4) ──────────────────────────
  //   ★--json 내보내기 **뒤**에 돌린다 — 연결기(zscan-link-orders.py)는 검증된 파일명 파싱만
  //   먹는 계약이라, 판독 추정값이 섞이면 채점 근거가 흔들린다. 여기서 채운 값은
  //   대기함(designer_intakes) 프리필 전용이고 post_desc 에 출처를 남긴다.
  if (!process.argv.includes('--no-probe')) {
    const need = targets.filter((r) => !(r.w && r.h))
    if (need.length) {
      let dimsUtil = null
      try { dimsUtil = loadFileDimsUtil() } catch (e) { console.warn(`  ! 규격판독 유틸 로드 실패(폴백 건너뜀): ${e.message}`) }
      const scaleTbl = dimsUtil ? loadScaleTable() : null
      if (dimsUtil && scaleTbl && scaleTbl.size) {
        let filled = 0, noScale = 0, unread = 0
        for (const r of need) {
          const s = r.ptype ? scaleTbl.get(norm(r.ptype)) : null
          if (!s) { noScale++; continue }
          const d = probeFileDims(dimsUtil, r.full)
          if (!d) { unread++; continue }
          const w = Math.round(d.w_cm * s * 10) / 10
          const h = Math.round(d.h_cm * s * 10) / 10
          // 실물 상식 밖(1cm 미만·50m 초과)은 버린다 — 틀린 값이 조용히 주문이 되는 게 최악
          if (w < 1 || h < 1 || w > 5000 || h > 5000) { unread++; continue }
          r.w = w; r.h = h; r.probedScale = s
          filled++
        }
        console.log(`  규격 헤더판독 — 대상 ${need.length.toLocaleString()} · 채움 ${filled.toLocaleString()}`
          + ` · 배율표 밖 ${noScale.toLocaleString()} · 판독불가 ${unread.toLocaleString()}`)
      }
    }
  }

  if (!commit) {
    // 축별 판독 실태 — 어디가 비는지 한눈에 본다(전사 품목 해소가 최대 덩어리였다)
    const byAxis = new Map()
    for (const r of rows) {
      if (!byAxis.has(r.axis)) byAxis.set(r.axis, { n: 0, spec: 0, cli: 0, pt: 0, ptGeneric: 0 })
      const a = byAxis.get(r.axis)
      a.n++
      if (r.w && r.h) a.spec++
      if (r.client) a.cli++
      if (r.ptype) a.pt++
      if (r.ptype === '전사') a.ptGeneric++
    }
    console.log('\n  축별 판독')
    for (const [ax, a] of byAxis) {
      const pct = (x) => `${(x / a.n * 100).toFixed(0)}%`
      console.log(`    ${ax.padEnd(16)} ${String(a.n).padStart(5)}건 · 규격 ${pct(a.spec).padStart(4)}`
        + ` · 거래처 ${pct(a.cli).padStart(4)} · 제품유형 ${pct(a.pt).padStart(4)}`
        + (a.ptGeneric ? ` (그중 「전사」 뭉뚱그림 ${pct(a.ptGeneric)})` : ''))
    }
    console.log(`\n[dry-run] 적재하지 않습니다. 실제 적재는 --commit.`)
    for (const r of targets.slice(0, 12)) {
      console.log(`  ${groupKey(r)}  ${r.client || '미지정'}  ${r.w || '?'}x${r.h || '?'}`
        + ` q=${r.qty || 1}${r.flag ? ` [${r.flag}]` : ''}  ${r.name.slice(0, 56)}`)
    }
    if (targets.length > 12) console.log(`  … 외 ${(targets.length - 12).toLocaleString()}건`)
    return
  }

  // 처리할 파일이 없으면 여기서 끝낸다 — 마스터 로드(거래처 2.8천·품목 1.2천)가 대부분의 시간이라
  //   이걸 안 건너뛰면 「새 파일 0건」인 주기도 1분 넘게 걸린다(10분 주기가 성립하지 않는다).
  if (targets.length === 0) {
    console.log('  변경분 없음 — 마스터 조회도 생략하고 종료')
    return
  }

  const token = await login()

  // 마스터 해소 — 거래처·품목 id 까지 붙여 보내야 프리필이 단가까지 채운다.
  // ★예전엔 실패해도 "이름만 적재" 로 **그냥 진행**했다. 그게 조용한 사고였다 —
  //   마스터가 안 붙은 대기물은 해소율 0% 라 사람이 전부 손으로 고르게 되는데,
  //   요약 한 줄만 보고는 그게 이번 실행에서 벌어진 일인지 알 수 없다.
  //   → 이제는 **중단**한다. 이름만으로 올리는 건 `--no-resolve` 로 **의도를 밝힐 때만**.
  const mapPath = arg('--item-map', path.join(__dirname, '..', 'docs', 'order-file-matching', 'item_map_draft.csv'))
  let clientIdx = null, itemIdx = null, itemMap = new Map()
  if (!process.argv.includes('--no-resolve')) {
    try {
      clientIdx = await buildClientIndex(token)
      itemIdx = await buildItemIndex(token)
      itemMap = loadItemMap(mapPath)
      console.log(`  마스터 로드 — 거래처 ${clientIdx.size.toLocaleString()} · 품목 ${itemIdx.size.toLocaleString()}`
        + ` · 매핑표 ${itemMap.size.toLocaleString()}종`)
    } catch (e) {
      console.error(`  ⛔ 마스터 로드 실패 — ${e.message}`)
      console.error('     이름만으로 적재하면 해소율 0% 가 되어 대기함을 사람이 전부 손으로 고르게 됩니다.')
      console.error('     그걸 의도한다면 --no-resolve 를 붙여 다시 실행하세요.')
      process.exit(1)
    }
    // 빈 인덱스로 통과하는 것도 막는다 — 1페이지가 실패해 품목이 0건이 된 전례가 있다.
    if (!clientIdx || clientIdx.size === 0 || !itemIdx || itemIdx.size === 0) {
      console.error(`  ⛔ 마스터가 비어 있습니다 (거래처 ${clientIdx ? clientIdx.size : 0} · 품목 ${itemIdx ? itemIdx.size : 0}) — 중단`)
      process.exit(1)
    }
  }

  let ok = 0, dup = 0, fail = 0, thumbed = 0, cHit = 0, iHit = 0, changed = 0
  const voidQueue = []          // 옛 값이 남은 대기물 — 새로 올린 뒤 일괄 취소
  const absorbedChanged = []    // 이미 주문서가 된 뒤 파일이 바뀐 건 — 사람이 주문을 고쳐야 한다
  for (const r of targets) {
    const th = thumbs.get(r.full.toLowerCase())
    if (th) thumbed++
    const clientId = clientIdx && r.client ? clientIdx.resolve(r.client) : null
    if (clientId) cHit++
    let itemId = null
    if (itemIdx && r.ptype) {
      const code = itemMap.get(norm(r.ptype))
      if (code && itemIdx.byCode.has(code)) { itemId = itemIdx.byCode.get(code); iHit++ }
    }
    // ★ 파싱 실패분도 올린다. 값은 비우고 사유를 memo 에 남겨 트레이에서 사람이 본다.
    const miss = []
    if (!(r.w && r.h)) miss.push('규격')
    if (!r.client) miss.push('거래처')
    const src = stableKey(r)
    const vals = {
      width_cm: r.w || null, height_cm: r.h || null, qty: r.qty || 1,
      client_id: clientId || null, item_id: itemId || null,
    }
    const base = {
      entity_id: entityId,
      client_name: r.client || '미지정',
      ...(clientId ? { client_id: clientId } : {}),
      ...(itemId ? { item_id: itemId } : {}),
      qty: r.qty || 1,
      measured_cm: r.w && r.h ? { w: r.w, h: r.h } : {},
      eps_path: r.full,
      batch_folder: groupKey(r),                   // ← 주문 그룹
      keyword: r.ptype || null,
      registered_by: 'zscan',
      pc_name: 'zscan',
      script_version: 'zscan-intake/2',
      // ⚠️ memo 는 라우트가 source_folder 전용으로 덮어쓴다(멱등 키). 사람이 볼 메모는 post_desc 로.
      //    트레이 행 2줄째에 그대로 표시된다(scripts/orderForm/intake.js:188).
      post_desc: [r.flag ? `상태:${r.flag}` : null,
        // 헤더 판독으로 채운 규격은 출처를 남긴다 — 트레이에서 사람이 "실측 추정"임을 보고 확인
        r.probedScale ? `규격:파일실측×${r.probedScale}` : null,
        miss.length ? `미파싱:${miss.join('·')}` : null]
        .filter(Boolean).join(' ') || null,
      // 라우트가 R2 로 외부화한다(externalizeGroups). 실패해도 base64 인라인으로 폴백하니 안전.
      ...(th ? { thumb_base64: th.b64 } : {}),
    }
    const res = await postIntake(token, { ...base, source_folder: src })
    if (!res.ok) {
      fail++
      // 상태코드만 찍으면 원인을 못 찾는다 — 실패 42건이 났을 때 본문이 없어 헤맸다.
      if (fail <= 5) {
        const why = res.data && (res.data.error || res.data.message)
        console.error(`  ! ${res.status} ${r.name.slice(0, 46)}${why ? ` :: ${String(why).slice(0, 90)}` : ''}`)
      }
      continue
    }
    const d = res.data.data || {}
    ledger[src] = fileStamp(r.full)              // 성공한 것만 원장에 남긴다(실패는 다음 실행이 재시도)
    if (!d.duplicated) { ok++; continue }

    // ── 이미 있는 파일 — 내용이 바뀌었나 ─────────────────────
    const prev = d.existing
    const diff = prev ? changedFields(prev, vals) : []
    if (!diff.length) { dup++; continue }

    // 바뀌었다. 내용 지문을 붙인 새 멱등 키로 다시 올린다(같은 내용이면 다음 실행에서 수렴).
    const note = diff.map((f) => `${LABEL[f.key] || f.key} ${f.from ?? '없음'}→${f.to ?? '없음'}`).join(' · ')
    const res2 = await postIntake(token, {
      ...base,
      source_folder: `${src}#${fingerprint(vals)}`,
      post_desc: `★변경됨: ${note}${base.post_desc ? ' · ' + base.post_desc : ''}`,
    })
    if (res2.ok && res2.data.data && !res2.data.data.duplicated) {
      changed++
      // 옛 대기물이 아직 대기 중이면 취소한다(트레이에 옛 값이 남아 둘 다 보이는 걸 막는다).
      //   ★이미 주문서로 흡수된 건(absorbed) 은 건드리지 않는다 — 주문 수정은 사람이 해야 한다.
      if (prev.status === 'waiting' && d.intake_id) voidQueue.push(d.intake_id)
      else if (prev.status === 'absorbed') absorbedChanged.push({ name: r.name, note })
    } else if (res2.ok) {
      dup++
    } else {
      fail++
    }
  }
  await voidIntakes(token, voidQueue)
  saveLedger(ledger)
  const n = targets.length || 1
  console.log(`\n적재 ${ok.toLocaleString()} · 중복 스킵 ${dup.toLocaleString()}`
    + ` · ★변경 재적재 ${changed.toLocaleString()} · 실패 ${fail.toLocaleString()}`
    + (thumbPath ? ` · 썸네일 동반 ${thumbed.toLocaleString()}` : ''))
  if (voidQueue.length) console.log(`  옛 대기물 취소 ${voidQueue.length.toLocaleString()}건`)
  if (absorbedChanged.length) {
    console.log(`\n  ⚠️ 이미 주문서로 만든 뒤 파일이 바뀐 건 ${absorbedChanged.length}건 — 주문을 손으로 고쳐야 합니다:`)
    for (const a of absorbedChanged.slice(0, 10)) console.log(`     ${a.note}  ${a.name.slice(0, 52)}`)
    if (absorbedChanged.length > 10) console.log(`     … 외 ${absorbedChanged.length - 10}건`)
  }
  if (clientIdx) {
    console.log(`  거래처 해소 ${cHit.toLocaleString()}/${n.toLocaleString()} = ${(cHit / n * 100).toFixed(1)}%`
      + ` · 품목 해소 ${iHit.toLocaleString()}/${n.toLocaleString()} = ${(iHit / n * 100).toFixed(1)}%`)
  }
  // ★마지막 겹: **회계가 맞아야 성공이다.** 스캔한 파일 수 = 적재+중복+재적재+실패 여야 하고,
  //   실패가 하나라도 있으면 exit 1. 실패한 파일은 대기함에 없으므로 주문에도 안 붙는데,
  //   요약만 보고 넘어가면 그 사실이 드러나지 않는다(실측: 42건이 500 으로 사라졌다).
  const accounted = ok + dup + changed + fail
  if (accounted !== targets.length) {
    console.error(`\n  ⛔ 집계 불일치 — 대상 ${targets.length} ≠ 적재+중복+재적재+실패 ${accounted}`)
    process.exitCode = 1
  }
  if (fail) {
    console.error(`\n  ⛔ ${fail}건이 적재되지 않았습니다. 재실행하면 멱등으로 이 건들만 다시 시도합니다.`)
    process.exitCode = 1
  }
}

main().catch((e) => { console.error(e.message); process.exit(1) })
