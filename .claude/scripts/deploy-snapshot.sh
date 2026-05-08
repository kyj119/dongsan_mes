#!/usr/bin/env bash
# deploy-snapshot.sh — 배포 직전 상태를 JSON 스냅샷으로 기록
# 사용: bash .claude/scripts/deploy-snapshot.sh [baseline-ref]
# baseline-ref 생략 시 HEAD~5 사용 (최근 5개 커밋의 변경 파일 목록)
#
# 출력: .claude/deployments/deploy_YYYY-MM-DD_HHmmss.json
# exit 0 성공, exit 1 git 오류

set -u

BASELINE="${1:-HEAD~5}"
OUT_DIR=".claude/deployments"
mkdir -p "$OUT_DIR"

# 메타 수집
TS_FILE="$(date +%Y-%m-%d_%H%M%S)"
TS_ISO="$(date +%Y-%m-%dT%H:%M:%S%z)"
SHA="$(git rev-parse HEAD 2>/dev/null)"
if [ -z "$SHA" ]; then
  echo "[deploy-snapshot] ERROR: git repo not found" >&2
  exit 1
fi
BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null)"
SHORT_SHA="$(git rev-parse --short HEAD 2>/dev/null)"
LATEST_MIG="$(ls migrations/*.sql 2>/dev/null | tail -1 | xargs -I{} basename {} 2>/dev/null)"
# 실제 트래킹된 파일 기준의 수정 수 (git status --short은 untracked 포함해 과대계수됨)
UNCOMMITTED="$(git diff --name-only HEAD 2>/dev/null | wc -l | tr -d ' ')"

# 변경 파일 목록 (baseline..HEAD 범위) — jq 없이 JSON 배열 수동 구성
CHANGED_JSON="[]"
if git rev-parse --verify "$BASELINE" >/dev/null 2>&1; then
  files="$(git diff --name-only "$BASELINE" HEAD 2>/dev/null | head -50)"
  if [ -n "$files" ]; then
    CHANGED_JSON="["
    first=1
    while IFS= read -r line; do
      [ -z "$line" ] && continue
      # 백슬래시와 따옴표만 이스케이프 (파일명에 탭/개행 있는 희귀 케이스는 무시)
      esc="$(printf '%s' "$line" | sed 's/\\/\\\\/g; s/"/\\"/g')"
      if [ $first -eq 1 ]; then
        CHANGED_JSON="${CHANGED_JSON}\"${esc}\""
        first=0
      else
        CHANGED_JSON="${CHANGED_JSON},\"${esc}\""
      fi
    done <<< "$files"
    CHANGED_JSON="${CHANGED_JSON}]"
  fi
fi
# 변경 파일 개수 (출력용)
CHANGED_COUNT="$(git diff --name-only "$BASELINE" HEAD 2>/dev/null | grep -c . || echo 0)"

OUT_FILE="$OUT_DIR/deploy_${TS_FILE}.json"

cat > "$OUT_FILE" <<EOF
{
  "timestamp": "${TS_ISO}",
  "commit": "${SHA}",
  "short_commit": "${SHORT_SHA}",
  "branch": "${BRANCH}",
  "latest_migration": "${LATEST_MIG}",
  "uncommitted_files": ${UNCOMMITTED},
  "baseline": "${BASELINE}",
  "changed_files": ${CHANGED_JSON}
}
EOF

echo "[deploy-snapshot] Saved: ${OUT_FILE}"
echo "  commit: ${SHORT_SHA} (${BRANCH})"
echo "  latest_migration: ${LATEST_MIG}"
echo "  changed files (${BASELINE}..HEAD): ${CHANGED_COUNT}"
