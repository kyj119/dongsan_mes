#!/usr/bin/env node
/**
 * check-fn-refs.cjs — 미정의 전역 함수 호출 린트 (P13 부류, 2026-09-15)
 *
 * 무엇을 잡나: ?raw 로 실리는 src/scripts/**\/*.js 가 어디에도 정의되지 않은 함수를 bare 로 호출하거나
 * (`loadPendingPOs()`), 페이지·레이아웃·스크립트의 on*="fn(" 핸들러가 없는 함수를 가리키는 것.
 * tsc 는 ?raw JS 를 안 보고, check:dom 은 id 만 보고, smoke 는 200 만 본다 — 이 부류는 런타임 ReferenceError 로만
 * 드러나고 try/catch 가 삼키면 토스트 한 줄로 격하된다(P13: receiving.js 가 #328 에서 지워진 loadPendingPOs() 를
 * 불러 「발주 생성 실패」 토스트만 뜨고 입고 모달이 영영 안 열렸다 — 게이트 전부 통과).
 *
 * 방법: TypeScript 컴파일러 API 로 AST 를 읽는다(의존성 추가 없음). 정규식만으로는 문자열·정규식 리터럴이 정의를
 * 삼켜 오탐이 난다(프로토타입 실측: 5건 보고 → 5건 전부 오탐).
 *   정의 = raw 스크립트의 최상위 function/var/let/const/class (스크립트는 <script> 에 그대로 이어붙여진다)
 *        + 어디서든 window.X= / globalThis.X= / window['X']=
 *        + .ts 의 **문자열·템플릿 리터럴 안**의 function X( / window.X= / var X (인라인 <script>·
 *          `${tabScript}` 로 주입되는 스크립트 문자열. 리터럴 밖=서버 코드는 지워서 섞이지 않게 한다)
 *        + 브라우저·JS 전역 + 외부 라이브러리 허용목록(EXTERNAL)
 *   호출 = raw 스크립트의 bare 식별자 CallExpression — 그 파일 안 어디서든 선언된 이름(함수·변수·파라미터·catch)은
 *          지역으로 보고 제외한다(스코프 근사: 오탐을 줄이는 쪽으로 기울였다)
 *        + 리터럴 안의 on*="…" 속성값을 같은 규칙으로 파싱(${…} 는 0 으로 치환)
 *   범위 = **페이지 번들**. 페이지(src/pages/**\/*.ts)가 `import x from '../scripts/foo.js?raw'` 로 실어 나르는
 *          스크립트 + 레이아웃(src/layout.ts 의 shell.js·src/layout/*.ts 리터럴) + 페이지가 상대 import 하는
 *          형제 페이지·partial 의 리터럴. 어느 페이지에도 안 실리는 스크립트는 전역 집합으로 본다.
 *          (전역 집합만 보면 A 페이지 스크립트가 B 페이지에만 실리는 함수를 불러도 「정의됨」이 된다.)
 *
 * 한계: 동적 호출(window[name]())·`<script src>` 로 따로 싣는 파일·typeof 가드 뒤의 선택적 호출은 구분 못 한다.
 *
 * 사용:
 *   node scripts/check-fn-refs.cjs            # 보고만 (exit 0)
 *   node scripts/check-fn-refs.cjs --strict   # 발견 시 exit 1 (편집 훅·커밋 훅·CI)
 *   node scripts/check-fn-refs.cjs --verbose  # 정의 출처·통계
 *   node scripts/check-fn-refs.cjs --selftest # 「잡아야 할 것 · 잡으면 안 되는 것」 픽스처 — 게이트가 도는지 증명
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const ts = require('typescript');

const ROOT = path.resolve(__dirname, '..');
const strict = process.argv.includes('--strict');
const verbose = process.argv.includes('--verbose');
const selftest = process.argv.includes('--selftest');

function walk(dir, exts, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, exts, out);
    else if (exts.some((x) => e.name.endsWith(x))) out.push(p);
  }
  return out;
}
const parse = (name, text, kind) => ts.createSourceFile(name, text, ts.ScriptTarget.ES2022, true, kind);
const kindOf = (f) => (f.endsWith('.tsx') ? ts.ScriptKind.TSX : f.endsWith('.ts') ? ts.ScriptKind.TS : ts.ScriptKind.JS);

function bindingNames(name, out) {
  if (!name) return;
  if (ts.isIdentifier(name)) out.add(name.text);
  else if (ts.isObjectBindingPattern(name) || ts.isArrayBindingPattern(name)) {
    for (const el of name.elements) if (ts.isBindingElement(el)) bindingNames(el.name, out);
  }
}

/** 문자열·템플릿 리터럴만 남기고 나머지(코드·주석)는 공백으로 지운 같은 길이의 텍스트 — 줄 번호가 보존된다. */
function literalOnlyText(sf, text) {
  const keep = [];
  (function visit(n) {
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) || ts.isTemplateExpression(n)) {
      keep.push([n.getStart(sf), n.getEnd()]);
      return;
    }
    ts.forEachChild(n, visit);
  })(sf);
  keep.sort((a, b) => a[0] - b[0]);
  const parts = [];
  let pos = 0;
  for (const [s, e] of keep) {
    if (s < pos) continue;
    parts.push(text.slice(pos, s).replace(/[^\n]/g, ' '), text.slice(s, e));
    pos = e;
  }
  parts.push(text.slice(pos).replace(/[^\n]/g, ' '));
  return parts.join('');
}

// ── 전역으로 볼 이름 ────────────────────────────────────────────────────────────
// 브라우저·JS 전역. Node 의 globalThis 로 언어 전역(parseInt·setTimeout·fetch·structuredClone·Promise·JSON …)을 받고
// 브라우저에만 있는 것을 더한다.
const BUILTIN = new Set([
  ...Object.getOwnPropertyNames(globalThis),
  'alert', 'confirm', 'prompt', 'open', 'close', 'print', 'stop', 'focus', 'blur', 'find', 'scroll', 'scrollTo', 'scrollBy',
  'getComputedStyle', 'getSelection', 'matchMedia', 'requestAnimationFrame', 'cancelAnimationFrame', 'requestIdleCallback',
  'cancelIdleCallback', 'postMessage', 'addEventListener', 'removeEventListener', 'dispatchEvent', 'createImageBitmap',
  'reportError', 'moveTo', 'moveBy', 'resizeTo', 'resizeBy', 'import', 'super', 'eval',
]);
// 외부 라이브러리 전역(CDN <script>). 여기 없는 라이브러리를 새로 쓰면 이 목록에 추가한다 — 기준선이 아니라 목록이다.
const EXTERNAL = new Set([
  'flatpickr', 'html2pdf', 'html2canvas', 'axios', 'dayjs', 'Chart', 'Quill', 'Html5Qrcode', 'Html5QrcodeScanner',
  'Sortable', 'XLSX', 'jsPDF', 'QRCode', 'daum', 'kakao', 'tailwind', 'lucide', 'hljs', 'marked', 'DOMPurify',
  'Papa', 'saveAs', 'io', 'pdfjsLib', 'Tesseract', 'echarts', 'ApexCharts', 'd3', 'L', 'interact', 'Hammer', 'tippy',
]);
// 인라인 on* 핸들러 안에서만 암묵적으로 있는 이름
const INLINE_LOCALS = new Set(['event', 'arguments']);

const RE_LITERAL_DEFS = [
  /\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/g,
  /\b(?:window|globalThis)\.([A-Za-z_$][\w$]*)\s*=[^=]/g,
  /\b(?:var|let|const)\s+([A-Za-z_$][\w$]*)\s*[=;,]/g,
  /\bclass\s+([A-Za-z_$][\w$]*)/g,
];
const RE_ATTR = /\bon[a-z]+\s*=\s*\\?(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)')/g;
const RE_IMPORT = /^\s*import\s+[\w$]+\s+from\s+['"]([^'"]+)['"]/gm;
function cleanAttr(v) {
  let s = v.replace(/\\(["'`])/g, '$1').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'");
  for (let i = 0; i < 5 && /\$\{[^{}]*\}/.test(s); i++) s = s.replace(/\$\{[^{}]*\}/g, '0');
  return s;
}
function collectLocals(sf) {
  const locals = new Set();
  (function visit(n) {
    if ((ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n) || ts.isClassDeclaration(n) || ts.isClassExpression(n)) && n.name) locals.add(n.name.text);
    if (ts.isParameter(n) || ts.isVariableDeclaration(n)) bindingNames(n.name, locals);
    if (ts.isCatchClause(n) && n.variableDeclaration) bindingNames(n.variableDeclaration.name, locals);
    ts.forEachChild(n, visit);
  })(sf);
  return locals;
}
function bareCalls(sf) {
  const out = [];
  (function visit(n) {
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression)) {
      out.push({ name: n.expression.text, line: sf.getLineAndCharacterOfPosition(n.expression.getStart(sf)).line + 1 });
    } else if (ts.isTaggedTemplateExpression(n) && ts.isIdentifier(n.tag)) {
      out.push({ name: n.tag.text, line: sf.getLineAndCharacterOfPosition(n.tag.getStart(sf)).line + 1 });
    }
    ts.forEachChild(n, visit);
  })(sf);
  return out;
}

/** srcDir 전체를 분석한다. 반환 = { missing:[{file,line,name,kind,where}], stats } */
function analyze(srcDir) {
  const rel = (f) => path.relative(path.dirname(srcDir), f).split(path.sep).join('/');
  const defsByFile = new Map(); // file → Set(name)
  const addDef = (f, name) => { if (!defsByFile.has(f)) defsByFile.set(f, new Set()); defsByFile.get(f).add(name); };
  // typeof X / typeof window.X 로 존재를 확인하는 이름 = 작성자가 부재를 아는 선택적 호출 → 그 파일에서는 안 잡는다
  const optionalByFile = new Map();
  const addOpt = (f, name) => { if (!optionalByFile.has(f)) optionalByFile.set(f, new Set()); optionalByFile.get(f).add(name); };
  const RE_TYPEOF = /\btypeof\s+(?:(?:window|globalThis|self)\.)?([A-Za-z_$][\w$]*)/g;

  // 1) 정의 — raw 스크립트(AST): 최상위 선언 + 어디서든 window.X=
  const rawFiles = walk(path.join(srcDir, 'scripts'), ['.js']).sort();
  const asts = new Map();
  const literal = new Map();
  for (const f of rawFiles) {
    const text = fs.readFileSync(f, 'utf8');
    const sf = parse(f, text, ts.ScriptKind.JS);
    asts.set(f, sf);
    literal.set(f, literalOnlyText(sf, text));
    defsByFile.set(f, new Set());
    for (const st of sf.statements) {
      if ((ts.isFunctionDeclaration(st) || ts.isClassDeclaration(st)) && st.name) addDef(f, st.name.text);
      else if (ts.isVariableStatement(st)) {
        const names = new Set();
        for (const d of st.declarationList.declarations) bindingNames(d.name, names);
        for (const n of names) addDef(f, n);
      }
    }
    (function visit(n) {
      if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
        const l = n.left;
        const isGlobalObj = (e) => ts.isIdentifier(e) && /^(window|globalThis|self)$/.test(e.text);
        if (ts.isPropertyAccessExpression(l) && isGlobalObj(l.expression)) addDef(f, l.name.text);
        else if (ts.isElementAccessExpression(l) && isGlobalObj(l.expression) && ts.isStringLiteral(l.argumentExpression)) addDef(f, l.argumentExpression.text);
      }
      if (ts.isTypeOfExpression(n)) {
        const e = n.expression;
        if (ts.isIdentifier(e)) addOpt(f, e.text);
        else if (ts.isPropertyAccessExpression(e) && ts.isIdentifier(e.expression) && /^(window|globalThis|self)$/.test(e.expression.text)) addOpt(f, e.name.text);
      }
      ts.forEachChild(n, visit);
    })(sf);
  }
  // 1b) 정의 — .ts 의 리터럴(페이지 HTML·인라인 <script>·`${tabScript}` 문자열) 안. 파싱 불가라 정규식
  const tsFiles = walk(srcDir, ['.ts', '.tsx']).sort();
  const imports = new Map(); // ts file → { raw:[script paths], mods:[ts paths] }
  for (const f of tsFiles) {
    const text = fs.readFileSync(f, 'utf8');
    const lit = literalOnlyText(parse(f, text, kindOf(f)), text);
    literal.set(f, lit);
    defsByFile.set(f, new Set());
    for (const re of RE_LITERAL_DEFS) {
      re.lastIndex = 0;
      let d;
      while ((d = re.exec(lit))) addDef(f, d[1]);
    }
    RE_TYPEOF.lastIndex = 0;
    let t;
    while ((t = RE_TYPEOF.exec(lit))) addOpt(f, t[1]);
    const im = { raw: [], mods: [] };
    let m;
    RE_IMPORT.lastIndex = 0;
    while ((m = RE_IMPORT.exec(text))) {
      const spec = m[1];
      if (!spec.startsWith('.')) continue;
      if (spec.endsWith('?raw')) im.raw.push(path.resolve(path.dirname(f), spec.slice(0, -4)));
      else {
        const base = path.resolve(path.dirname(f), spec);
        for (const cand of [base + '.ts', base + '.tsx', path.join(base, 'index.ts')]) if (fs.existsSync(cand)) { im.mods.push(cand); break; }
      }
    }
    imports.set(f, im);
  }

  // 2) 페이지 번들 — 레이아웃(모든 페이지 공통) + 페이지의 ?raw + 상대 import 한 페이지·partial(재귀)
  const layoutFiles = tsFiles.filter((f) => /[\\/]src[\\/]layout(\.ts|[\\/])/.test(f));
  const layoutScripts = new Set(layoutFiles.flatMap((f) => imports.get(f).raw));
  const layoutDefs = new Set();
  for (const f of [...layoutFiles, ...layoutScripts]) for (const n of defsByFile.get(f) || []) layoutDefs.add(n);
  const pageFiles = tsFiles.filter((f) => /[\\/]src[\\/]pages[\\/]/.test(f));
  const bundles = new Map(); // page → { scripts:Set, defs:Set }
  for (const p of pageFiles) {
    const scripts = new Set(layoutScripts);
    const defs = new Set(layoutDefs);
    const seenMod = new Set();
    (function pull(f) {
      if (seenMod.has(f) || !imports.has(f)) return;
      seenMod.add(f);
      for (const n of defsByFile.get(f) || []) defs.add(n);
      for (const s of imports.get(f).raw) { scripts.add(s); for (const n of defsByFile.get(s) || []) defs.add(n); }
      for (const m of imports.get(f).mods) if (/[\\/]src[\\/](pages|layout)/.test(m)) pull(m);
    })(p);
    bundles.set(p, { scripts, defs });
  }
  const pagesOf = new Map(); // script → [page]
  for (const [p, b] of bundles) for (const s of b.scripts) { if (!pagesOf.has(s)) pagesOf.set(s, []); pagesOf.get(s).push(p); }
  const globalDefs = new Set();
  for (const set of defsByFile.values()) for (const n of set) globalDefs.add(n);

  // 어느 집합으로 판정할지: 페이지에 실리는 스크립트 → 각 페이지 번들, 아니면 전역
  const scopesFor = (f) => {
    if (bundles.has(f)) return [{ label: '', defs: bundles.get(f).defs }];
    const pages = pagesOf.get(f);
    if (pages && pages.length) return pages.map((p) => ({ label: rel(p), defs: bundles.get(p).defs }));
    return [{ label: '', defs: globalDefs }];
  };
  const missing = [];
  const seenKey = new Set();
  function judge(file, line, name, kind, locals) {
    if (locals.has(name) || BUILTIN.has(name) || EXTERNAL.has(name)) return;
    if (optionalByFile.has(file) && optionalByFile.get(file).has(name)) return;
    const bad = scopesFor(file).filter((s) => !s.defs.has(name));
    if (!bad.length) return;
    const key = rel(file) + ':' + line + ':' + name;
    if (seenKey.has(key)) return;
    seenKey.add(key);
    const where = bad[0].label ? `${bad.map((s) => s.label).slice(0, 2).join(', ')}${bad.length > 2 ? ` 외 ${bad.length - 2}` : ''} 번들에 없음` : '어디에도 없음';
    missing.push({ file: rel(file), line, name, kind, where });
  }

  // 3) 호출 — raw 스크립트의 bare 호출(AST)
  let callCount = 0;
  for (const f of rawFiles) {
    const sf = asts.get(f);
    const locals = collectLocals(sf);
    for (const c of bareCalls(sf)) { callCount++; judge(f, c.line, c.name, 'bare call', locals); }
  }
  // 3b) on*="…" 핸들러 — 리터럴 안에서만(주석·코드 제외). 문자열 연결(' + x + ')로 끊긴 부분은 공백이 된다.
  let attrCount = 0;
  for (const f of [...tsFiles, ...rawFiles]) {
    const txt = literal.get(f);
    let m;
    RE_ATTR.lastIndex = 0;
    while ((m = RE_ATTR.exec(txt))) {
      const raw = m[1] !== undefined ? m[1] : m[2];
      if (!raw || !/[A-Za-z_$][\w$]*\s*\(/.test(raw)) continue;
      attrCount++;
      const sf = parse('inline.js', cleanAttr(raw), ts.ScriptKind.JS);
      const locals = new Set([...collectLocals(sf), ...INLINE_LOCALS]);
      const line = txt.slice(0, m.index).split('\n').length;
      for (const c of bareCalls(sf)) judge(f, line, c.name, 'on* handler', locals);
    }
  }
  missing.sort((a, b) => (a.file === b.file ? a.line - b.line : a.file < b.file ? -1 : 1));
  const unbundled = rawFiles.filter((f) => !pagesOf.has(f)).map(rel);
  return { missing, stats: { raw: rawFiles.length, pages: pageFiles.length, calls: callCount, attrs: attrCount, globals: globalDefs.size, unbundled } };
}

// ── 자가시험: 잡아야 할 것과 잡으면 안 되는 것을 같이 명세한다 ───────────────────
function runSelftest() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fn-refs-'));
  const src = path.join(dir, 'src');
  for (const d of ['scripts/layout', 'pages', 'layout']) fs.mkdirSync(path.join(src, d), { recursive: true });
  const w = (f, lines) => fs.writeFileSync(path.join(src, f), lines.join('\n'));
  w('scripts/layout/shell.js', ['function showToast(m) {} window.openModal = function () {};']);
  w('layout.ts', ["import SHELL from './scripts/layout/shell.js?raw'", 'export const layout = `<script>${SHELL}</script><nav onclick="toggleNav()"></nav><script>function toggleNav(){}</script>`']);
  w('scripts/a.js', [
    'function defined1() { return 1; }',
    'window.exposed = function () {};',
    'var top = 1;',
    '(function () { function inner() {} inner(); helperLocal(); function helperLocal() {} })();',
    'function useAll(cb) { defined1(); exposed(); fromPage(); missingCall(); flatpickr("#d"); cb(); showToast(1); openModal(); const { x } = {}; x(); }',
    '// onclick="commentOnly()" ← 주석은 무시',
    'var re = /onclick="regexOnly\\(/; function jsStrLike(s) { return s; }',
    'var h = \'<button onclick="defined1(\' + top + \', \\\'\' + jsStrLike(top) + \'\\\')">x</button>\';',
    'var t = `<a onclick="missingHandler(${top})">y</a><a onclick="event.stopPropagation(); exposed()">z</a>`;',
    'function crossPage() { onlyInB(); }',
    'function opt() { if (typeof maybeAbsent === "function") maybeAbsent(); }',
  ]);
  w('scripts/b.js', ['function onlyInB() {} function useA() { defined1(); }']);
  w('pages/p.ts', [
    "import { layout } from '../layout'",
    "import pageScript from '../scripts/a.js?raw'",
    'const tabScript = `window.fromPage = function(){}; function pageFn(){}`',
    'function serverOnly() { return 1 }',
    'export const html = `<script>${tabScript}</script><script>${pageScript}</script><button onclick="pageFn()">a</button>',
    '<button onclick="serverOnly()">b</button><button onclick="ghost(\'${"x"}\')">c</button><button onclick="toggleNav()">d</button>`',
  ]);
  w('pages/q.ts', ["import bScript from '../scripts/b.js?raw'", 'export const html = `<script>${bScript}</script><button onclick="onlyInB()">a</button><button onclick="defined1()">b</button>`']);
  const { missing } = analyze(src);
  fs.rmSync(dir, { recursive: true, force: true });
  const got = missing.map((m) => `${path.basename(m.file)}:${m.line} ${m.name} [${m.kind}]`).sort();
  const want = [
    'a.js:5 missingCall [bare call]',       // 지워진 전역 함수 호출 = P13
    'a.js:9 missingHandler [on* handler]',   // innerHTML 템플릿의 onclick
    'a.js:10 onlyInB [bare call]',          // 다른 페이지(q)에만 실리는 스크립트의 함수 — 전역 집합만 보면 통과
    'b.js:1 defined1 [bare call]',          // b.js 가 실리는 q 페이지에는 a.js 가 없다
    'p.ts:6 ghost [on* handler]',           // 페이지 템플릿의 onclick
    'p.ts:6 serverOnly [on* handler]',      // 서버 코드에만 있는 함수를 브라우저 onclick 이 부른다
    'q.ts:2 defined1 [on* handler]',        // q 페이지 번들에 없는 함수
  ].sort();
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(ok ? '[check-fn-refs] selftest OK — 잡아야 할 7건만 잡고, 지역·window 노출·레이아웃 공통·페이지 리터럴 정의·typeof 가드·주석·정규식·문자열 연결·외부 라이브러리는 안 잡는다'
    : `[check-fn-refs] selftest FAIL\n  기대: ${want.join(' | ')}\n  실제: ${got.join(' | ')}`);
  process.exit(ok ? 0 : 1);
}

if (selftest) runSelftest();

// ── 본 실행 ─────────────────────────────────────────────────────────────────────
const { missing, stats } = analyze(path.join(ROOT, 'src'));
const statLine = `raw 스크립트 ${stats.raw}개 · 페이지 ${stats.pages}개 · bare 호출 ${stats.calls}건 · on* 핸들러 ${stats.attrs}건 · 전역 정의 ${stats.globals}개`;
if (verbose) console.log(`[check-fn-refs] 어느 페이지에도 안 실리는 스크립트(전역 집합으로 판정) ${stats.unbundled.length}개:\n  ${stats.unbundled.join('\n  ') || '(없음)'}`);
if (missing.length === 0) {
  console.log(`[check-fn-refs] OK — 미정의 전역 함수 호출 없음 (${statLine})`);
  process.exit(0);
}
console.log(`[check-fn-refs] 정의처 없는 함수 호출 ${missing.length}건 — ReferenceError 가 try/catch 에 삼켜지면 조용한 격하 (${statLine}):`);
for (const x of missing) console.log(`  ${x.file}:${x.line}  ${x.name}()  ← ${x.kind} · ${x.where}`);
console.log('\n고치는 법: 함수를 정의하거나 호출을 지운다. 그 페이지에 안 실리는 스크립트의 함수면 스크립트를 페이지에 싣거나 공용(shell.js)으로 옮긴다. 외부 라이브러리 전역이면 scripts/check-fn-refs.cjs 의 EXTERNAL 에 추가.');
process.exit(strict ? 1 : 0);
