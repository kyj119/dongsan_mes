#!/usr/bin/env node
// check-xss.mjs — HEURISTIC advisory XSS lint (no deps, not a hard blocker).
//
// Scans src/scripts/**/*.js for likely-unescaped HTML sinks: lines that touch
// innerHTML or look like template/string HTML and interpolate a user-controlled
// field (name/notes/description/message/memo/content) WITHOUT an escape helper
// on the same interpolation. "Escape helper" means any call whose name contains
// esc/Esc (escapeHtml, esc, escAttr, escHtml, sgpEsc, iaeEscape, wbEscape,
// lvEscapeHtml, escTask, ...) — this codebase uses many prefix-scoped aliases,
// not just the literal escapeHtml name (CLAUDE.md/auto-improve Area 5 §prefix-
// scoped escape 래퍼). Checking for the literal name only made this script
// flag the entire codebase as unescaped even where every sink was covered by
// an alias. This is deliberately conservative and approximate — it can miss
// real issues and flag false positives. Treat findings as review hints, not
// proof of a vulnerability. Manually verify before acting.
//
// Exit 1 if any candidate found, else 0.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SCAN_DIR = join(ROOT, 'src', 'scripts');

// Sensitive field-name fragments to look for inside an interpolation.
const FIELDS = ['name', 'notes', 'description', 'message', 'memo', 'content'];
const FIELD_RE = new RegExp('(' + FIELDS.join('|') + ')', 'i');

// Match a ${...} interpolation OR a string-concat fragment that references a field.
// We check two HTML-ish contexts:
//   1) ${ ... } template-literal interpolations
//   2) classic string-concat ' + expr + ' fragments
const TEMPLATE_INTERP_RE = /\$\{([^}]*)\}/g;
const CONCAT_INTERP_RE = /\+\s*([^+;]*?)\s*\+/g;

function walk(dir) {
  const out = [];
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out; // dir may not exist yet
  }
  for (const e of entries) {
    const p = join(dir, e);
    const st = statSync(p);
    if (st.isDirectory()) out.push(...walk(p));
    else if (e.endsWith('.js')) out.push(p);
  }
  return out;
}

// Decide whether a line is "HTML-ish" enough to care about.
function isHtmlLine(line) {
  return (
    /innerHTML/.test(line) ||
    /<\w[^>]*>/.test(line) ||        // contains an HTML tag literal
    /\.(insertAdjacentHTML|outerHTML)/.test(line) ||
    /(html|markup)\s*\+?=/.test(line) // building an html/markup string var
  );
}

// Does this interpolation reference a sensitive field but NOT escape it?
// Any identifier containing esc/Esc immediately followed by a call — covers every
// alias this codebase uses (escapeHtml, esc, escAttr, escHtml, sgpEsc, iaeEscape,
// wbEscape, lvEscapeHtml, escTask, ...), not just the literal escapeHtml name.
const ESCAPE_CALL_RE = /[A-Za-z_]*[Ee]sc[A-Za-z]*\s*\(/;

function isSuspectInterp(expr) {
  if (!FIELD_RE.test(expr)) return false;
  if (ESCAPE_CALL_RE.test(expr)) return false;            // escaped (any esc* alias) — ok
  if (/encodeURIComponent\s*\(/.test(expr)) return false; // url-encoded — ok
  return true;
}

function scanLine(line) {
  const hits = [];
  let m;
  TEMPLATE_INTERP_RE.lastIndex = 0;
  while ((m = TEMPLATE_INTERP_RE.exec(line)) !== null) {
    if (isSuspectInterp(m[1])) hits.push(m[0]);
  }
  CONCAT_INTERP_RE.lastIndex = 0;
  while ((m = CONCAT_INTERP_RE.exec(line)) !== null) {
    if (isSuspectInterp(m[1])) hits.push('+ ' + m[1].trim() + ' +');
  }
  return hits;
}

const files = walk(SCAN_DIR);
const findings = [];

for (const file of files) {
  const text = readFileSync(file, 'utf8');
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!isHtmlLine(line)) continue;
    const hits = scanLine(line);
    if (hits.length === 0) continue;
    findings.push({
      file: relative(ROOT, file).replace(/\\/g, '/'),
      line: i + 1,
      snippet: line.trim().slice(0, 160),
    });
  }
}

if (findings.length === 0) {
  console.log('check-xss: no likely-unescaped sinks found (heuristic).');
  process.exit(0);
}

console.log('check-xss: ' + findings.length + ' likely-unescaped sink(s) (HEURISTIC — verify manually):\n');
for (const f of findings) {
  console.log(`${f.file}:${f.line}: ${f.snippet}`);
}
process.exit(1);
