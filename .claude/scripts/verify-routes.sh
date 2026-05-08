#!/usr/bin/env bash
# verify-routes.sh — 라우터/페이지/권한 정합성 빠른 검증
#
# Usage:
#   bash .claude/scripts/verify-routes.sh [file_pattern|all|permissions]
#
# 모드:
#   (인자 없음/파일 패턴) — import 정합성 (최근 변경 파일)
#   all          — 전체 src/routes + src/pages import 정합성 + permissions 체크
#   permissions  — 사이드바 ↔ permission_pages 마스터 ↔ index.tsx 라우트 정합성
#
# Exit code: 0 = OK / 1 = CRITICAL 발견

set -u
cd "$(git rev-parse --show-toplevel 2>/dev/null || pwd)"

# ---------- 모드 1: import 정합성 ----------
run_import_check() {
  local files="$1"
  local identifiers="requireRole authMiddleware requireAdmin requireManager pageAuthMiddleware agentKeyMiddleware logActivity notifyRoles requirePagePermission"
  local errors=0
  local checked=0

  echo "=== [imports] 라우터/페이지 import 정합성 ==="

  for f in $files; do
    [ -f "$f" ] || continue
    checked=$((checked+1))
    for ident in $identifiers; do
      if grep -qE "(^|[^a-zA-Z_])${ident}\s*\(" "$f" 2>/dev/null; then
        if ! grep -qE "^import.*\b${ident}\b" "$f" 2>/dev/null; then
          echo "❌ $f: uses $ident() but is NOT imported"
          errors=$((errors+1))
        fi
      fi
    done
  done

  echo ""
  echo "Checked: $checked files, Errors: $errors"
  if [ "$errors" -eq 0 ]; then
    echo "✅ import 정합성 통과"
    return 0
  else
    echo "→ 수정 후 다시 실행하거나 'npm run typecheck'"
    return 1
  fi
}

# ---------- 모드 2: 권한 정합성 ----------
run_permissions_check() {
  echo ""
  echo "=== [permissions] 사이드바 ↔ permission_pages ↔ index.tsx 정합성 ==="

  local tmp_sidebar=$(mktemp)
  local tmp_master=$(mktemp)
  local tmp_routes=$(mktemp)
  trap "rm -f $tmp_sidebar $tmp_master $tmp_routes" RETURN

  # 1) 사이드바 path 추출 — { path: '/...', ... } 패턴
  grep -oE "path:\s*'(/[^']+)'" src/layout.ts \
    | grep -oE "'(/[^']+)'" | tr -d "'" | sort -u > "$tmp_sidebar"

  # 2) permission_pages 마스터 page_key 추출 — INSERT INTO permission_pages 가 있는 마이그레이션에서 ('/xxx', 패턴
  grep -lE "INSERT (INTO|OR (IGNORE|REPLACE) INTO) permission_pages" migrations/*.sql 2>/dev/null \
    | xargs grep -hoE "\('(/[^']+)'" 2>/dev/null \
    | grep -oE "'(/[^']+)'" | tr -d "'" | sort -u > "$tmp_master"

  # 3) index.tsx 페이지 라우트 — app.get('/...', pageAuthMiddleware
  grep -oE "app\.get\('(/[^']+)',\s*pageAuthMiddleware" src/index.tsx \
    | grep -oE "'(/[^']+)'" | tr -d "'" | sort -u > "$tmp_routes"

  local sidebar_count=$(wc -l < "$tmp_sidebar")
  local master_count=$(wc -l < "$tmp_master")
  local routes_count=$(wc -l < "$tmp_routes")
  echo "✓ sidebar items:  $sidebar_count"
  echo "✓ master entries: $master_count"
  echo "✓ page routes:    $routes_count"

  # 사이드바엔 있는데 마스터에 없음 → CRITICAL
  local missing_in_master
  missing_in_master=$(comm -23 "$tmp_sidebar" "$tmp_master")
  if [ -n "$missing_in_master" ]; then
    echo ""
    echo "❌ CRITICAL: 사이드바엔 있는데 permission_pages 마스터에 없음"
    echo "$missing_in_master" | sed 's/^/  - /'
    echo "  → 새 마이그레이션 작성 후 적용 필요 (0138 패턴 참조)"
    return 1
  fi
  echo "✅ all sidebar items registered in master"

  # 마스터엔 있는데 사이드바 없음 → INFO (의도된 hidden 페이지 가능)
  local hidden_master
  hidden_master=$(comm -13 "$tmp_sidebar" "$tmp_master")
  if [ -n "$hidden_master" ]; then
    echo ""
    echo "ℹ master entries not in sidebar (hidden pages, OK if intended):"
    echo "$hidden_master" | sed 's/^/  - /'
  fi

  # 페이지 라우트엔 있는데 마스터 없음 → INFO (상세/폼 페이지)
  local routes_without_master
  routes_without_master=$(comm -23 "$tmp_routes" "$tmp_master")
  if [ -n "$routes_without_master" ]; then
    echo ""
    echo "ℹ page routes (index.tsx) without master entry (will be ADMIN-only):"
    echo "$routes_without_master" | sed 's/^/  - /'
  fi

  return 0
}

# ---------- 디스패치 ----------
MODE="${1:-}"

case "$MODE" in
  permissions)
    run_permissions_check
    exit $?
    ;;
  all)
    files="$(ls src/routes/*.ts src/routes/*/*.ts src/pages/*.ts 2>/dev/null | tr '\n' ' ')"
    e1=0; e2=0
    run_import_check "$files" || e1=1
    run_permissions_check || e2=1
    [ "$e1" -eq 0 ] && [ "$e2" -eq 0 ] && exit 0 || exit 1
    ;;
  *)
    if [ -z "$MODE" ]; then
      files="$(git diff --name-only HEAD~5 HEAD 2>/dev/null | grep -E '^src/(routes|pages)/.*\.ts$' | tr '\n' ' ')"
      [ -z "$files" ] && files="$(ls src/routes/*.ts src/routes/*/*.ts src/pages/*.ts 2>/dev/null | tr '\n' ' ')"
    else
      files="$MODE"
    fi
    run_import_check "$files"
    exit $?
    ;;
esac
