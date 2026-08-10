// 스킬·서브에이전트 정의 감사 게이트 (2026-08-11 신설)
// 배경: auto-improve/SKILL.md 가 「Area 6 자기진화」 자기추가로 8KB(2026-05-11)→197KB(2026-08-07) 24배 비대화.
//       doc-diet-audit 은 PROJECT_STATUS.md·MEMORY.md 만 봐서 스킬은 감사망 밖이었다.
// 근거(공식 문서, 2026-08-11 실측 확인):
//   - https://code.claude.com/docs/en/skills.md  "Keep SKILL.md under 500 lines."
//   - 같은 문서 §Skill content lifecycle: 자동압축 시 각 스킬은 "첫 5,000토큰"만 재첨부되고
//     재첨부 스킬 전체가 25,000토큰 공동예산을 나눠 쓴다(최근 호출 순으로 채우고 나머지는 통째 삭제).
//     → 본문이 5,000토큰을 넘으면 압축 후 뒷부분이 조용히 사라진다. 누적형 스킬에 치명적.
//   - 스킬 목록(name+description)은 항상 컨텍스트에 상주하고 description+when_to_use 합계는
//     1,536자에서 잘린다. 목록 예산 초과 시 「덜 쓰는 스킬」의 description 부터 삭제된다.
//   - 서브에이전트 필드 정본: https://code.claude.com/docs/en/sub-agents.md §Supported frontmatter fields
// 사용: node scripts/skill-audit.cjs [--json]   (P1 발견 시 exit 1)
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SKILL_DIR = path.join(ROOT, '.claude', 'skills');
const AGENT_DIR = path.join(ROOT, '.claude', 'agents');
const JSON_OUT = process.argv.includes('--json');

// Claude Code 가 지원하는 SKILL.md frontmatter 키 (공식 문서 표 전량)
const SKILL_KEYS = new Set([
  'name', 'description', 'when_to_use', 'argument-hint', 'arguments',
  'disable-model-invocation', 'user-invocable', 'allowed-tools', 'disallowed-tools',
  'model', 'effort', 'context', 'agent', 'background', 'hooks', 'paths', 'shell',
  'metadata', 'license', 'compatibility',
]);
// 이식 가능한 Agent Skills 표준(agentskills.io)이 허용하는 부분집합.
// 이 밖의 키는 Claude Code 전용 — 다른 런타임으로 스킬을 옮기면 무시되거나 거부된다.
const PORTABLE_KEYS = new Set(['name', 'description', 'license', 'allowed-tools', 'metadata', 'compatibility']);

const AGENT_KEYS = new Set([
  'name', 'description', 'tools', 'disallowedTools', 'model', 'permissionMode',
  'maxTurns', 'skills', 'mcpServers', 'hooks', 'memory', 'background', 'effort',
  'isolation', 'color', 'initialPrompt',
]);

const MAX_BODY_LINES = 500;       // 공식 Tip
const COMPACT_TOKEN_CAP = 5000;   // 압축 후 살아남는 스킬당 토큰
const MAX_DESC = 1024;            // 이식 표준 상한
const WARN_DESC = 600;            // 목록 예산 압박 경고선

// 한글 혼용 텍스트의 토큰 추정. 한글은 대략 char 당 ~1토큰, ASCII 는 ~4자당 1토큰.
function estimateTokens(s) {
  let hangul = 0, other = 0;
  for (const ch of s) (ch >= '가' && ch <= '힣') || (ch >= '㄰' && ch <= '㆏') ? hangul++ : other++;
  return Math.round(hangul + other / 4);
}

function parseFrontmatter(raw, file) {
  if (!raw.startsWith('---')) return { err: 'YAML frontmatter 없음' };
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { err: 'frontmatter 종료 구분자(---) 없음' };
  const keys = {};
  let cur = null;
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z_][A-Za-z0-9_-]*):\s?(.*)$/);
    if (kv) { cur = kv[1]; keys[cur] = kv[2]; }
    else if (cur && /^\s+\S/.test(line)) keys[cur] += '\n' + line.trim(); // 이어지는 줄
  }
  return { keys, body: raw.slice(m[0].length), fmLines: m[1].split(/\r?\n/).length };
}

function unquote(v) {
  if (!v) return '';
  const t = v.trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) return t.slice(1, -1);
  return t;
}

const findings = [];
const rows = [];
function add(sev, label, msg, hint) { findings.push({ sev, label, msg, hint }); }

function auditDefinition(file, label, kind) {
  const raw = fs.readFileSync(file, 'utf8');
  const fm = parseFrontmatter(raw, file);
  if (fm.err) { add('P1', label, fm.err, 'name·description 을 담은 --- 블록으로 시작해야 로드된다'); return; }

  const { keys, body } = fm;
  const allowed = kind === 'skill' ? SKILL_KEYS : AGENT_KEYS;
  const name = unquote(keys.name);
  const desc = unquote(keys.description);
  const bodyLines = body.split(/\r?\n/).length;
  const tokens = estimateTokens(body);

  // --- P1: 로드 자체를 막거나 동작을 조용히 바꾸는 것 ---
  if (!('name' in keys) && kind === 'agent') add('P1', label, 'name 누락', '서브에이전트는 name 필수');
  if (!('description' in keys)) add('P1', label, 'description 누락', '자동 호출의 유일한 라우팅 신호 — 없으면 본문 첫 문단으로 추론(비신뢰)');
  if (name && !/^[a-z0-9-]+$/.test(name)) add('P1', label, `name '${name}' 이 kebab-case 아님`, '소문자·숫자·하이픈만');
  if (name && name.length > 64) add('P1', label, `name ${name.length}자 > 64자`, '');
  if (kind === 'agent' && name.includes(':')) add('P1', label, "name 에 ':' 포함", '플러그인 스코프 예약 문자 — 파일이 로드되지 않는다');
  if (desc.length > MAX_DESC) add('P1', label, `description ${desc.length}자 > ${MAX_DESC}자`, '이식 표준 상한. Claude Code 는 1,536자에서 잘림');
  if (kind === 'skill' && /[<>]/.test(desc)) add('P1', label, 'description 에 꺾쇠(< >) 포함', '이식 표준이 금지 — 서브에이전트 description 은 <example> 허용이나 스킬은 불가');

  const unknown = Object.keys(keys).filter((k) => !allowed.has(k));
  if (unknown.length) add('P1', label, `미지원 frontmatter 키: ${unknown.join(', ')}`, '오타면 조용히 무시된다 — 공식 필드표 대조 필요');

  if (kind === 'skill' && bodyLines > MAX_BODY_LINES) {
    add('P1', label, `본문 ${bodyLines}줄 > ${MAX_BODY_LINES}줄`, 'references/ 로 분리하고 SKILL.md 는 목차·분기만 (progressive disclosure)');
  }
  if (kind === 'skill' && tokens > COMPACT_TOKEN_CAP) {
    add('P1', label, `본문 ~${tokens.toLocaleString()}토큰 > 압축 생존 한도 ${COMPACT_TOKEN_CAP.toLocaleString()}토큰`,
      '자동압축 후 앞 5,000토큰만 재첨부 → 뒷부분이 조용히 사라진다. 누적 지식은 references/ 로 옮길 것');
  }

  // --- P2: 품질·예산 ---
  if (desc && desc.length > WARN_DESC && desc.length <= MAX_DESC) {
    add('P2', label, `description ${desc.length}자`, '스킬 목록은 상시 상주 — 핵심 용도를 앞에 두고 압축');
  }
  // 자동 호출이 꺼진 스킬은 description 이 라우팅이 아니라 `/` 메뉴 설명이라 이 검사에서 제외.
  const autoInvocable = unquote(keys['disable-model-invocation']) !== 'true';
  const hasWhen = /사용|트리거|TRIGGER|[Uu]se when|시|후|"|'/.test(desc); // 따옴표 = 트리거 문구 인용
  if (kind === 'skill' && autoInvocable && !hasWhen) {
    add('P2', label, 'description 에 「언제 쓰는지」 신호 없음', '「무엇을 한다 + 언제 쓴다」 2요소가 자동 호출 정확도를 만든다');
  }

  rows.push({ label, kind, name, descLen: desc.length, bodyLines, tokens, keys: Object.keys(keys),
    portableViolations: kind === 'skill' ? Object.keys(keys).filter((k) => !PORTABLE_KEYS.has(k)) : [] });
}

// --- 수집 ---
if (fs.existsSync(SKILL_DIR)) {
  for (const d of fs.readdirSync(SKILL_DIR, { withFileTypes: true }).filter((e) => e.isDirectory())) {
    const f = path.join(SKILL_DIR, d.name, 'SKILL.md');
    if (fs.existsSync(f)) auditDefinition(f, `skills/${d.name}`, 'skill');
    else add('P1', `skills/${d.name}`, 'SKILL.md 없음', '디렉터리만 있으면 스킬로 인식되지 않는다');
  }
}
if (fs.existsSync(AGENT_DIR)) {
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).forEach((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith('.md')) auditDefinition(p, `agents/${path.relative(AGENT_DIR, p).replace(/\\/g, '/')}`, 'agent');
  });
  walk(AGENT_DIR);
}

// --- 서브에이전트 name 중복 (같은 트리에서 중복이면 파일시스템 순서로 하나만 로드됨) ---
const byName = {};
rows.filter((r) => r.kind === 'agent').forEach((r) => { (byName[r.name] ||= []).push(r.label); });
Object.entries(byName).filter(([, v]) => v.length > 1).forEach(([n, v]) => {
  add('P1', v.join(' / '), `서브에이전트 name '${n}' 중복`, '한쪽만 로드되며 어느 쪽인지 미정의 — 이름을 분리할 것');
});

if (JSON_OUT) {
  console.log(JSON.stringify({ findings, rows }, null, 2));
  process.exit(findings.some((f) => f.sev === 'P1') ? 1 : 0);
}

// --- 출력 ---
const p1 = findings.filter((f) => f.sev === 'P1');
const p2 = findings.filter((f) => f.sev === 'P2');
console.log(`[skill-audit] 스킬 ${rows.filter((r) => r.kind === 'skill').length}개 · 서브에이전트 ${rows.filter((r) => r.kind === 'agent').length}개`);
for (const f of p1) { console.error(`  P1 ${f.label}: ${f.msg}`); if (f.hint) console.error(`       → ${f.hint}`); }
for (const f of p2) { console.log(`  P2 ${f.label}: ${f.msg}`); if (f.hint) console.log(`       → ${f.hint}`); }

const listing = rows.filter((r) => r.kind === 'skill').reduce((a, r) => a + r.descLen, 0);
console.log(`[skill-audit] 스킬 목록 상주 비용 ~${listing.toLocaleString()}자 (description 합계)`);

// 트리거 키워드 충돌 — 같은 낱말이 여러 description 에 있으면 자동 호출이 어느 쪽으로 갈지 불안정해진다.
// 실패로 처리하지 않는다(중복 자체가 죄는 아님). 4개 이상 겹칠 때만 「구분 문구를 넣을 후보」로 보고.
const skillDescs = rows.filter((r) => r.kind === 'skill');
if (skillDescs.length) {
  const raws = {};
  for (const d of fs.readdirSync(SKILL_DIR, { withFileTypes: true }).filter((e) => e.isDirectory())) {
    const f = path.join(SKILL_DIR, d.name, 'SKILL.md');
    if (fs.existsSync(f)) raws[d.name] = unquote((parseFrontmatter(fs.readFileSync(f, 'utf8')).keys || {}).description || '');
  }
  const collide = [];
  for (const kw of ['점검', '검증', '확인', '감사', '배포', '테스트', '리뷰', '상태', '스캔', '분석']) {
    const hit = Object.entries(raws).filter(([, v]) => v.includes(kw)).map(([k]) => k);
    if (hit.length >= 4) collide.push(`${kw}(${hit.length}): ${hit.join(', ')}`);
  }
  if (collide.length) {
    console.log('[skill-audit] 트리거 낱말 중복 — 겹치는 쪽 description 에 「~는 X 스킬」 같은 구분 문구 권장');
    collide.forEach((c) => console.log('  · ' + c));
  }
}

if (p1.length) { console.error(`[skill-audit] P1 ${p1.length}건 — 실패`); process.exit(1); }
console.log('[skill-audit] OK');
