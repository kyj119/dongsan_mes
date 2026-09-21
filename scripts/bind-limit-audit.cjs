#!/usr/bin/env node
/**
 * bind-limit-audit — 변수 길이 `IN (?,?,…)` 이 D1 바인드 한도(~100)를 넘을 수 있는 자리를 잡는다.
 *
 * **왜 필요한가** — `arr.map(() => '?')` + `.bind(...arr)` 로 IN 절을 만드는 자리는 배열이 100을 넘는
 * 순간 「too many SQL variables」로 throw 한다. 응답은 500 이고 **타입체크·빌드·스모크가 전부 통과한다**
 * (#409 칸반 `limit=100`→200 경계 500 이 그 실물이다. 2026-09-21 `deriveOrderType` 도 같은 형태였다).
 * 코드베이스 표준은 80 청크인데, 새로 쓰는 자리가 그걸 빠뜨려도 아무도 모른다.
 *
 * **판정** — TypeScript 파서로 `X.map(() => '?')` 를 찾아 X 가 청크된 것인지 본다. 주석·문자열·정규식에
 * 안 속는다(`check:fn` 과 같은 축). 안전으로 보는 것:
 *   ① X 가 `…slice(i, i + N)` (N ≤ 100) — 인라인 청크
 *   ② X 가 그런 slice 로 선언된 식별자 — 표준 80 청크 패턴
 *   ③ X 가 원소 ≤ 100 인 배열 리터럴 / `Array.from({ length: K })` (K ≤ 100)
 * 그 밖은 보고한다. **길이를 정적으로 알 수 없는 것이 곧 결함은 아니다** — 자연 bounded(단일 주문의
 * 라인, 고정 enum)인 자리는 기준선에 사유와 함께 넣어 두고, 기준선에 없는 새 자리만 실패시킨다.
 *
 * 사용:
 *   node scripts/bind-limit-audit.cjs              # 새 위반이 있으면 exit 1
 *   node scripts/bind-limit-audit.cjs --update     # 현재 상태를 기준선으로 (줄일 때도 이걸로)
 *   node scripts/bind-limit-audit.cjs --selftest   # 양방향 자가시험 (잡아야 할 것 / 잡으면 안 되는 것)
 */
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const BASELINE = path.join(__dirname, 'bind-limit-baseline.json');
const LIMIT = 100; // D1 쿼리당 바인드 한도. 표준 청크는 80(안전 마진)

function walkFiles(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walkFiles(p, out);
    else if (/\.(ts|js|tsx)$/.test(e.name)) out.push(p);
  }
  return out;
}

/** `X.map(() => '?')` 인가 — 인자 없는 화살표가 문자열 '?' 를 바로 반환하는 map 호출만. */
function isPlaceholderMap(node) {
  if (!ts.isCallExpression(node)) return false;
  const ex = node.expression;
  if (!ts.isPropertyAccessExpression(ex) || ex.name.text !== 'map') return false;
  if (node.arguments.length !== 1) return false;
  const fn = node.arguments[0];
  if (!ts.isArrowFunction(fn) || fn.parameters.length !== 0) return false;
  const b = fn.body;
  const lit = ts.isStringLiteral(b) ? b : null;
  return !!lit && lit.text === '?';
}

/** 숫자로 환원되는 값인가 — 리터럴, 또는 `const EMP_CHUNK = 40` 같은 상수 식별자. */
function constNumValue(node, sf) {
  if (!node) return null;
  if (ts.isNumericLiteral(node)) return Number(node.text);
  if (ts.isIdentifier(node) && sf) {
    let val = null;
    const visit = (n) => {
      if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.name.text === node.text
          && n.initializer && ts.isNumericLiteral(n.initializer)) {
        val = Number(n.initializer.text);
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
    return val;
  }
  return null;
}

/** `…slice(a, b)` 에서 b 가 `i + N` 이거나 N (N ≤ LIMIT) 이면 청크로 본다. N 은 상수 식별자도 허용. */
function sliceIsChunked(node, sf) {
  if (!ts.isCallExpression(node)) return false;
  const ex = node.expression;
  if (!ts.isPropertyAccessExpression(ex) || ex.name.text !== 'slice') return false;
  const args = node.arguments;
  if (args.length < 2) return false;
  const end = args[1];
  const direct = constNumValue(end, sf);
  if (direct !== null) return direct <= LIMIT;
  if (ts.isBinaryExpression(end) && end.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const v = constNumValue(end.right, sf);
    if (v !== null) return v <= LIMIT;
  }
  return false;
}

/**
 * `for (const chunk of chunks)` 형태 — chunks 가 청크된 slice 로 채워졌는지 본다.
 * (`for (let i=…; i+=50) chunks.push(ids.slice(i, i+50))` 패턴)
 */
function isForOfChunk(sf, name, pos) {
  let src = null;
  const findBinding = (n) => {
    if (ts.isForOfStatement(n) && n.initializer && ts.isVariableDeclarationList(n.initializer)) {
      for (const d of n.initializer.declarations) {
        if (ts.isIdentifier(d.name) && d.name.text === name
            && n.getStart() <= pos && pos <= n.getEnd()) src = n.expression;
      }
    }
    ts.forEachChild(n, findBinding);
  };
  findBinding(sf);
  if (!src || !ts.isIdentifier(src)) return false;
  let filled = false;
  const findPush = (n) => {
    if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression)
        && n.expression.name.text === 'push'
        && ts.isIdentifier(n.expression.expression) && n.expression.expression.text === src.text) {
      for (const a of n.arguments) if (sliceIsChunked(a, sf)) filled = true;
    }
    ts.forEachChild(n, findPush);
  };
  findPush(sf);
  return filled;
}

/**
 * 같은 파일에 `if (X.length > N)` / `>= N` 형태의 **명시적 길이 가드**(N ≤ LIMIT)가 있는가.
 * 예) `if (body.item_ids.length > 90) return c.json(... 400)` — 400 으로 막으니 IN 절이 한도를 못 넘는다.
 * 텍스트 동일성으로 대상을 맞춘다(같은 식을 쓰는 게 관례라 실용상 충분하고, 놓치면 보고 쪽으로 기운다).
 */
function hasLengthGuard(sf, recvText) {
  let guarded = false;
  const visit = (n) => {
    if (ts.isBinaryExpression(n)
        && (n.operatorToken.kind === ts.SyntaxKind.GreaterThanToken
            || n.operatorToken.kind === ts.SyntaxKind.GreaterThanEqualsToken)
        && ts.isPropertyAccessExpression(n.left) && n.left.name.text === 'length'
        && n.left.expression.getText() === recvText) {
      const v = constNumValue(n.right, sf);
      if (v !== null && v <= LIMIT) guarded = true;
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return guarded;
}

/** 원소 수가 정적으로 ≤ LIMIT 임이 보이는가 (배열 리터럴 / Array.from({length: K})). */
function isStaticallySmall(node) {
  if (ts.isArrayLiteralExpression(node)) return node.elements.length <= LIMIT;
  if (ts.isCallExpression(node) && node.expression.getText().endsWith('Array.from')) {
    const a = node.arguments[0];
    if (a && ts.isObjectLiteralExpression(a)) {
      for (const p of a.properties) {
        if (ts.isPropertyAssignment(p) && p.name.getText() === 'length' && ts.isNumericLiteral(p.initializer)) {
          return Number(p.initializer.text) <= LIMIT;
        }
      }
    }
  }
  return false;
}

/** 식별자 name 의 가장 가까운 선언 initializer 를 찾는다(같은 파일 내, 단순 탐색). */
function findDeclInit(sourceFile, name, beforePos) {
  let best = null;
  const visit = (n) => {
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.name.text === name && n.initializer) {
      if (n.getStart() < beforePos && (!best || n.getStart() > best.getStart())) best = n.initializer;
    }
    ts.forEachChild(n, visit);
  };
  visit(sourceFile);
  return best;
}

function analyze(file, text) {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const hits = [];
  const visit = (node) => {
    if (isPlaceholderMap(node)) {
      const recv = node.expression.expression;
      let safe = false;
      let why = '';
      if (sliceIsChunked(recv, sf)) { safe = true; why = '인라인 slice 청크'; }
      else if (isStaticallySmall(recv)) { safe = true; why = '정적 소형 배열'; }
      else if (ts.isIdentifier(recv)) {
        const init = findDeclInit(sf, recv.text, node.getStart());
        if (init && sliceIsChunked(init, sf)) { safe = true; why = `${recv.text} = slice 청크`; }
        else if (init && isStaticallySmall(init)) { safe = true; why = '정적 소형 배열'; }
        else if (isForOfChunk(sf, recv.text, node.getStart())) { safe = true; why = 'for-of 청크 배열'; }
      }
      if (!safe && hasLengthGuard(sf, recv.getText())) { safe = true; why = '명시적 길이 가드'; }
      if (!safe) {
        const { line } = sf.getLineAndCharacterOfPosition(node.getStart());
        hits.push({
          file: path.relative(ROOT, file).replace(/\\/g, '/'),
          line: line + 1,
          recv: recv.getText().slice(0, 60),
          snippet: text.split('\n')[line].trim().slice(0, 120),
        });
      }
      void why;
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return hits;
}

function collect() {
  const out = [];
  for (const f of walkFiles(SRC)) out.push(...analyze(f, fs.readFileSync(f, 'utf8')));
  return out;
}

function keyOf(h) { return `${h.file}|${h.recv}`; }

function selftest() {
  const cases = [
    ['청크 안 함 → 잡아야 한다', "const ph = ids.map(() => '?').join(',')", 1],
    ['80 청크 인라인 → 잡으면 안 된다', "const ph = ids.slice(i, i + 80).map(() => '?').join(',')", 0],
    ['80 청크 변수 → 잡으면 안 된다', "const chunk = ids.slice(i, i + 80)\nconst ph = chunk.map(() => '?').join(',')", 0],
    ['120 청크 → 잡아야 한다(한도 초과)', "const chunk = ids.slice(i, i + 120)\nconst ph = chunk.map(() => '?').join(',')", 1],
    ['정적 소형 배열 → 잡으면 안 된다', "const ph = [1,2,3].map(() => '?').join(',')", 0],
    ['주석 안 → 잡으면 안 된다', "// const ph = ids.map(() => '?')", 0],
    ['문자열 안 → 잡으면 안 된다', "const s = \"ids.map(() => '?')\"", 0],
    ['다른 map → 잡으면 안 되다', "const ph = ids.map((x) => '?').join(',')", 0],
    ['상수 식별자 청크 → 잡으면 안 된다', "const N = 40\nfor (let i=0;i<a.length;i+=N){ const c = a.slice(i, i + N); const ph = c.map(() => '?') }", 0],
    ['상수 식별자가 한도 초과 → 잡아야 한다', "const N = 500\nconst c = a.slice(i, i + N)\nconst ph = c.map(() => '?')", 1],
    ['for-of 청크 배열 → 잡으면 안 된다', "const chunks = []\nfor (let i=0;i<ids.length;i+=50) chunks.push(ids.slice(i, i + 50))\nfor (const chunk of chunks) { const ph = chunk.map(() => '?') }", 0],
    ['명시적 길이 가드 → 잡으면 안 된다', "if (body.item_ids.length > 90) return bad()\nconst ph = body.item_ids.map(() => '?')", 0],
    ['가드가 한도 초과 → 잡아야 한다', "if (ids.length > 500) return bad()\nconst ph = ids.map(() => '?')", 1],
    ['다른 배열의 가드 → 잡아야 한다', "if (other.length > 90) return bad()\nconst ph = ids.map(() => '?')", 1],
  ];
  let fail = 0;
  for (const [name, code, expect] of cases) {
    const got = analyze('selftest.ts', code).length;
    const ok = got === expect;
    if (!ok) fail++;
    console.log(`  ${ok ? 'OK ' : 'NG '} ${name} (잡힘 ${got} / 기대 ${expect})`);
  }
  console.log(fail === 0 ? `[bind-limit] 자가시험 ${cases.length}/${cases.length} 통과` : `[bind-limit] 자가시험 NG ${fail}건`);
  process.exit(fail === 0 ? 0 : 1);
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('--selftest')) return selftest();

  const hits = collect();
  const byKey = new Map(hits.map((h) => [keyOf(h), h]));

  if (argv.includes('--update')) {
    const known = {};
    for (const [k, h] of byKey) known[k] = { line: h.line, reason: '' };
    fs.writeFileSync(BASELINE, JSON.stringify({
      note: '이미 알려진 미청크 IN 절. 「정상」이 아니라 새로 생긴 것만 잡기 위한 출발점이다. reason 에 왜 안전한지(자연 bounded 근거)를 적을 것.',
      updated: new Date().toISOString().slice(0, 10),
      limit: LIMIT,
      known,
    }, null, 2) + '\n', 'utf8');
    console.log(`[bind-limit] 기준선 갱신 — ${byKey.size}건`);
    return;
  }

  let base = { known: {} };
  if (fs.existsSync(BASELINE)) base = JSON.parse(fs.readFileSync(BASELINE, 'utf8'));
  const knownKeys = new Set(Object.keys(base.known || {}));

  const fresh = [...byKey.values()].filter((h) => !knownKeys.has(keyOf(h)));
  const gone = [...knownKeys].filter((k) => !byKey.has(k));

  console.log(`[bind-limit] src ${walkFiles(SRC).length}파일 · 미청크 IN 절 ${byKey.size}건 (기준선 ${knownKeys.size})`);
  if (gone.length) {
    console.log(`[bind-limit] 해소 ${gone.length}건: ${gone.slice(0, 6).join(', ')}${gone.length > 6 ? ' …' : ''}`);
    console.log('  → 고쳤으면 --update 로 기준선을 줄이세요(안 줄이면 다음에 되돌아가도 안 잡힙니다).');
  }
  if (fresh.length) {
    console.log(`\n[bind-limit] ★새 미청크 IN 절 ${fresh.length}건 — 배열이 100을 넘으면 500 입니다`);
    for (const h of fresh) console.log(`  ${h.file}:${h.line}  [${h.recv}]  ${h.snippet}`);
    console.log('\n  고치는 법: 80 청크로 나눈다 —');
    console.log("    for (let i = 0; i < ids.length; i += 80) { const chunk = ids.slice(i, i + 80); … }");
    console.log('  자연 bounded 라 안전하면: --update 로 기준선에 넣고 reason 에 근거를 적는다.');
    process.exit(1);
  }
  console.log('[bind-limit] OK — 새 미청크 IN 절 없음');
}

main();
