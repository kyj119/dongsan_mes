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
  node = unwrap(node);
  if (!ts.isCallExpression(node)) return false;
  const ex = node.expression;
  // `ids.slice(i, i + 80).map(x => x.k)` — 청크 뒤에 map/filter 를 물린 형태. 밑단으로 내려간다.
  if (ts.isPropertyAccessExpression(ex) && ['map', 'filter', 'flatMap'].includes(ex.name.text)) {
    return sliceIsChunked(ex.expression, sf);
  }
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
 * 같은 파일에 `if (X.length > N) return ...` 형태의 **명시적 길이 가드**(2 <= N <= LIMIT)가 있는가.
 * 예) `if (body.item_ids.length > 90) return c.json(... 400)` - 400 으로 막으니 IN 절이 한도를 못 넘는다.
 * 텍스트 동일성으로 대상을 맞춘다(같은 식을 쓰는 게 관례라 실용상 충분하고, 놓치면 보고 쪽으로 기운다).
 *
 * 두 조건을 **같이** 봐야 한다 - 종전엔 `>`/`>=` 이기만 하면 가드로 세서, 「비었나」를 묻는
 *   `if (orderIds.length > 0)` 가 **상한 가드로 둔갑**했다(2026-09-21 실기: taxInvoices/helpers.ts 의
 *   3자리가 그래서 감사망 밖에 있었다 - 기준선에 이름조차 없었다). 상한 가드의 성질은 둘이다:
 *   (1) 넘치면 **빠져나간다**(return/throw/continue/break) (2) N 이 실제 상한이다(0/1 은 빈 배열/단건 분기).
 */
function hasLengthGuard(sf, recvText, useNode) {
  let guarded = false;
  const visit = (n) => {
    if (ts.isBinaryExpression(n)
        && ts.isPropertyAccessExpression(n.left) && n.left.name.text === 'length'
        && n.left.expression.getText() === recvText) {
      const k = n.operatorToken.kind;
      const v = constNumValue(n.right, sf);
      // 거부형 - `if (X.length > N) return 400`. 파일 어디에 있든 그 배열의 상한이 된다.
      if (v !== null && v >= 2 && v <= LIMIT
          && (k === ts.SyntaxKind.GreaterThanToken || k === ts.SyntaxKind.GreaterThanEqualsToken)
          && rejectsWhenTrue(n)) guarded = true;
      // 허용형 - `if (X.length > 0 && X.length <= 90) { ...IN 절... }`. 이건 then 가지 **안에서만** 유효하다
      //   (다른 곳의 `length <= 5` 특수분기를 상한으로 오인하지 않게 한다).
      const ub = k === ts.SyntaxKind.LessThanEqualsToken ? v
        : k === ts.SyntaxKind.LessThanToken && v !== null ? v - 1 : null;
      if (ub !== null && ub >= 2 && ub <= LIMIT && useNode && usedInsideThen(n, useNode)) guarded = true;
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return guarded;
}

/** 이 비교를 담은 if 를 찾는다(`||`/`&&` 중 지정한 연산자만 타고 올라간다). */
function enclosingIf(cmp, joinKind) {
  let cond = cmp;
  let n = cmp.parent;
  while (n && !ts.isIfStatement(n)) {
    if (ts.isParenthesizedExpression(n)
        || (ts.isBinaryExpression(n) && n.operatorToken.kind === joinKind)) {
      cond = n; n = n.parent; continue;
    }
    return null;
  }
  return n && n.expression === cond ? n : null;
}

/**
 * 이 비교가 참일 때 **빠져나가는가** - 가장 가까운 if 의 then 가지가 return/throw/continue/break 로 끝나는가.
 * `&&` 로 묶인 조건은 가드로 안 센다(둘 다 참일 때만 막히므로 상한 보장이 아니다). `||` 는 센다.
 */
function rejectsWhenTrue(cmp) {
  const iff = enclosingIf(cmp, ts.SyntaxKind.BarBarToken);
  if (!iff) return false;
  const then = iff.thenStatement;
  const last = ts.isBlock(then) ? then.statements[then.statements.length - 1] : then;
  return !!last && (ts.isReturnStatement(last) || ts.isThrowStatement(last)
    || ts.isContinueStatement(last) || ts.isBreakStatement(last));
}

/** 허용형 가드 - 이 비교가 참일 때만 실행되는 자리(then 가지)에 그 IN 절이 들어 있는가. */
function usedInsideThen(cmp, useNode) {
  const iff = enclosingIf(cmp, ts.SyntaxKind.AmpersandAmpersandToken);
  if (!iff) return false;
  const then = iff.thenStatement;
  return useNode.getStart() >= then.getStart() && useNode.getEnd() <= then.getEnd();
}

/**
 * 이 비교가 참일 때 **빠져나가는가** - 가장 가까운 if 의 then 가지가 return/throw/continue/break 로 끝나는가.
 * `&&` 로 묶인 조건은 가드로 안 센다(둘 다 참일 때만 막히므로 상한 보장이 아니다). `||` 는 센다.
 */
function rejectsWhenTrue(cmp) {
  let cond = cmp;
  let n = cmp.parent;
  while (n && !ts.isIfStatement(n)) {
    if (ts.isParenthesizedExpression(n)
        || (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.BarBarToken)) {
      cond = n; n = n.parent; continue;
    }
    return false;
  }
  if (!n || n.expression !== cond) return false;
  const then = n.thenStatement;
  const last = ts.isBlock(then) ? then.statements[then.statements.length - 1] : then;
  return !!last && (ts.isReturnStatement(last) || ts.isThrowStatement(last)
    || ts.isContinueStatement(last) || ts.isBreakStatement(last));
}

/** `x as const` · 괄호 같은 껍데기를 벗긴다. */
function unwrap(node) {
  while (node && (ts.isAsExpression(node) || ts.isParenthesizedExpression(node)
                  || ts.isNonNullExpression(node) || ts.isSatisfiesExpression?.(node))) {
    node = node.expression;
  }
  return node;
}

/**
 * 같은 파일의 `const X = { … }` 를 찾아 프로퍼티 수를 센다 — `Object.keys(X)`/`values(X)` 의 상한.
 */
function objectLiteralSize(sf, name) {
  let size = null;
  const visit = (n) => {
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.name.text === name && n.initializer) {
      const init = unwrap(n.initializer);
      if (ts.isObjectLiteralExpression(init)) size = init.properties.length;
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return size;
}

/** 원소 수가 정적으로 ≤ LIMIT 임이 보이는가 (배열 리터럴 / Array.from({length: K}) / as const / 삼항 / Object.keys). */
function isStaticallySmall(node, sf) {
  node = unwrap(node);
  if (!node) return false;
  // `cond ? ['A'] : ['B','C']` — 양쪽 다 작으면 작다
  if (ts.isConditionalExpression(node)) {
    return isStaticallySmall(node.whenTrue, sf) && isStaticallySmall(node.whenFalse, sf);
  }
  // `Object.keys(X)` / `Object.values(X)` — X 가 같은 파일의 객체 리터럴이면 그 크기가 상한
  if (sf && ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
      && ['keys', 'values'].includes(node.expression.name.text)
      && node.expression.expression.getText() === 'Object'
      && node.arguments.length === 1 && ts.isIdentifier(node.arguments[0])) {
    const size = objectLiteralSize(sf, node.arguments[0].text);
    if (size !== null) return size <= LIMIT;
  }
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

/** 공용 청크 헬퍼의 이름과 정의 파일. 이름만 믿지 않고 **그 파일의 실제 청크 폭을 읽어** 검증한다. */
const CHUNK_HELPER = 'chunk80';
const CHUNK_HELPER_FILE = path.join(SRC, 'utils', 'chunk.ts');

/**
 * `src/utils/chunk.ts` 의 chunk80 이 정말 LIMIT 이하로 자르는가.
 * 게이트가 **이름만 보고 안전하다고 세는 것**을 막는다 - 누가 80 을 500 으로 올리면 여기서 죽는다.
 */
function verifyChunkHelper() {
  if (!fs.existsSync(CHUNK_HELPER_FILE)) return null;
  const sf = ts.createSourceFile(CHUNK_HELPER_FILE, fs.readFileSync(CHUNK_HELPER_FILE, 'utf8'), ts.ScriptTarget.Latest, true);
  let width = null;
  const visit = (n) => {
    if (ts.isFunctionDeclaration(n) && n.name && n.name.text === CHUNK_HELPER && n.body) {
      const inner = (m) => {
        if (ts.isCallExpression(m) && ts.isPropertyAccessExpression(m.expression)
            && m.expression.name.text === 'slice' && m.arguments.length === 2) {
          const end = m.arguments[1];
          let w = constNumValue(end, sf);
          if (w === null && ts.isBinaryExpression(end) && end.operatorToken.kind === ts.SyntaxKind.PlusToken) {
            w = constNumValue(end.right, sf);
          }
          if (w !== null) width = width === null ? w : Math.max(width, w);
        }
        ts.forEachChild(m, inner);
      };
      inner(n.body);
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return width;
}

/** 이 식별자가 `chunk80(...)` 이 만든 배열의 **원소**인가 - for-of 바인딩 또는 .map/.forEach 콜백 인자. */
function isChunkHelperElement(sf, name) {
  let found = false;
  const isHelperCall = (e) => e && ts.isCallExpression(e) && ts.isIdentifier(e.expression) && e.expression.text === CHUNK_HELPER;
  const visit = (n) => {
    if (ts.isForOfStatement(n) && isHelperCall(n.expression)
        && n.initializer && ts.isVariableDeclarationList(n.initializer)
        && n.initializer.declarations.some((d) => ts.isIdentifier(d.name) && d.name.text === name)) found = true;
    if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression)
        && (n.expression.name.text === 'map' || n.expression.name.text === 'forEach')
        && isHelperCall(n.expression.expression) && n.arguments.length >= 1) {
      const fn = n.arguments[0];
      if ((ts.isArrowFunction(fn) || ts.isFunctionExpression(fn)) && fn.parameters.length >= 1) {
        const p = fn.parameters[0].name;
        if (ts.isIdentifier(p) && p.text === name) found = true;
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return found;
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
      else if (isStaticallySmall(recv, sf)) { safe = true; why = '정적 소형 배열'; }
      else if (ts.isIdentifier(recv)) {
        const init = findDeclInit(sf, recv.text, node.getStart());
        if (init && sliceIsChunked(init, sf)) { safe = true; why = `${recv.text} = slice 청크`; }
        else if (init && isStaticallySmall(init, sf)) { safe = true; why = '정적 소형 배열'; }
        else if (isForOfChunk(sf, recv.text, node.getStart())) { safe = true; why = 'for-of 청크 배열'; }
        else if (isChunkHelperElement(sf, recv.text)) { safe = true; why = `${CHUNK_HELPER} 청크 원소`; }
      }
      if (!safe && hasLengthGuard(sf, recv.getText(), node)) { safe = true; why = '명시적 길이 가드'; }
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
    ['chunk80 for-of 원소 → 잡으면 안 된다', "for (const cc of chunk80(ids)) { const ph = cc.map(() => '?') }", 0],
    ['chunk80 map 인자 → 잡으면 안 된다', "const st = chunk80(ids).map((cc) => q(`IN (${cc.map(() => '?').join(',')})`))", 0],
    ['다른 함수가 만든 배열 원소 → 잡아야 한다', "for (const cc of splitAll(ids)) { const ph = cc.map(() => '?') }", 1],
    ['허용형 가드(<= 90) 토막 안 → 잡으면 안 된다', "if (a.length > 0 && a.length <= 90) { const ph = a.map(() => '?') }", 0],
    ['허용형 가드 밖에서 쓰면 → 잡아야 한다', "if (a.length <= 90) { ok() } const ph = a.map(() => '?')", 1],
    ['비었나 검사(> 0)는 상한 가드가 아니다 → 잡아야 한다', "if (ids.length > 0) { const ph = ids.map(() => '?') }", 1],
    ['빠져나가지 않는 비교는 가드가 아니다 → 잡아야 한다', "if (ids.length > 90) { warn() } const ph = ids.map(() => '?')", 1],
    ['&& 로 묶인 가드는 상한 보장이 아니다 → 잡아야 한다', "if (ids.length > 90 && strict) return bad(); const ph = ids.map(() => '?')", 1],
    ['|| 로 묶인 가드는 유효 → 잡으면 안 된다', "if (ids.length > 90 || bad2) return bad(); const ph = ids.map(() => '?')", 0],
    ['가드가 한도 초과 → 잡아야 한다', "if (ids.length > 500) return bad()\nconst ph = ids.map(() => '?')", 1],
    ['다른 배열의 가드 → 잡아야 한다', "if (other.length > 90) return bad()\nconst ph = ids.map(() => '?')", 1],
    ['as const 리터럴 → 잡으면 안 된다', "const R = ['A','B'] as const\nconst ph = R.map(() => '?')", 0],
    ['삼항 리터럴 → 잡으면 안 된다', "const s = x ? ['A'] : ['B','C']\nconst ph = s.map(() => '?')", 0],
    ['청크 뒤 map 체인 → 잡으면 안 된다', "const keys = cands.slice(i, i + 80).map((x) => x.k)\nconst ph = keys.map(() => '?')", 0],
    ['Object.keys(객체리터럴) → 잡으면 안 된다', "const D = { a: 1, b: 2 }\nconst keys = Object.keys(D)\nconst ph = keys.map(() => '?')", 0],
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

  const w = verifyChunkHelper();
  if (w !== null && w > LIMIT) {
    console.log(`[bind-limit] ★청크 헬퍼 ${CHUNK_HELPER} 의 폭이 ${w} — 한도(${LIMIT})를 넘습니다. src/utils/chunk.ts 를 고치세요.`);
    process.exit(1);
  }

  const hits = collect();
  const byKey = new Map(hits.map((h) => [keyOf(h), h]));

  if (argv.includes('--update')) {
    // ★사람이 적은 reason·risk 는 **보존한다**. 종전엔 매번 빈 문자열로 덮어써서, 해소 1건을 반영하려고
    //   --update 를 부르면 **나머지 전부의 사유가 조용히 사라졌다**(2026-09-21 실기 — 39건 사유가 한 번에
    //   날아갔다). 기준선의 값어치는 목록이 아니라 「왜 안전한가」에 있고, 그걸 지우는 갱신은 갱신이 아니다.
    let prev = { known: {} };
    if (fs.existsSync(BASELINE)) { try { prev = JSON.parse(fs.readFileSync(BASELINE, 'utf8')); } catch (_) { /* ignore: 처음이면 빈 기준선 */ } }
    const known = {};
    let kept = 0;
    for (const [k, h] of byKey) {
      const old = (prev.known || {})[k] || {};
      if (old.reason) kept++;
      known[k] = { line: h.line, risk: old.risk || '', reason: old.reason || '' };
    }
    const dropped = Object.keys(prev.known || {}).filter((k) => !byKey.has(k));
    fs.writeFileSync(BASELINE, JSON.stringify({
      note: prev.note || '이미 알려진 미청크 IN 절. 「정상」이 아니라 새로 생긴 것만 잡기 위한 출발점이다.',
      updated: new Date().toISOString().slice(0, 10),
      reviewed: prev.reviewed,
      limit: LIMIT,
      known,
    }, null, 2) + '\n', 'utf8');
    console.log(`[bind-limit] 기준선 갱신 — ${byKey.size}건 (사유 보존 ${kept}건${dropped.length ? ` · 해소로 제거 ${dropped.length}건` : ''})`);
    if (byKey.size - kept > 0) console.log(`  ⚠️사유 없는 항목 ${byKey.size - kept}건 — reason 은 「검토했다」는 뜻이지 「안전하다」는 뜻이 아니다.`);
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
