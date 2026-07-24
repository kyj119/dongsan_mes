-- 0473_worker_domains.sql
-- 후가공 도메인 프로파일 A1 — 가공자↔도메인 매핑
-- spec: docs/superpowers/specs/2026-07-24-postproc-domain-profiles.md
-- CEP 가공자 선택 → 도메인(output=현수막/transfer=전사/sign=간판) 자동 판별 → 해당 방식·프리셋만 로드.
-- 성격: 신규 테이블 1(additive). finishing_methods.method_group엔 CHECK 없어 'sign' 값 추가 자유.

CREATE TABLE IF NOT EXISTS designer_worker_domains (
  worker_name TEXT PRIMARY KEY,
  domain      TEXT NOT NULL DEFAULT 'output',   -- output|transfer|sign
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
