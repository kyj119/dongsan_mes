# bootstrap-local-db.ps1 — #555 스키마 베이스라인 부트스트랩 (신규/로컬 D1)
#
# 472개 마이그 풀리플레이가 카테고리 id 환경분기(수성=14 vs prod 15)로 0344에서 결정적 실패 →
# prod 스키마 스냅샷(schema/baseline_schema.sql) + prod 참조데이터(schema/baseline_reference.sql, PII/비밀 제외)로 부트스트랩.
# 참조데이터가 prod의 실제 카테고리 id(수성=15 등)를 시드 → 이후 하드코딩 category_id 마이그가 신규환경에서도 정합.
#
# 절차: 로컬 D1 초기화 → 스키마 → 참조데이터 → 0001~0474 applied 마킹 → 로그인 유저 → 미래 마이그(0475+) 증분.
# prod/기존 누적 D1 무관(로컬 전용). 사용: npm run db:reset  (또는 pwsh scripts/bootstrap-local-db.ps1)

$ErrorActionPreference = 'Stop'
$DB = 'webapp-production'

function Exec-Sql($file, $label) {
  if (-not (Test-Path $file)) { Write-Host "SKIP $label (없음: $file)"; return }
  Write-Host "→ $label ($file)"
  & npx wrangler d1 execute $DB --local --file=$file
  if ($LASTEXITCODE -ne 0) { throw "$label 실패 (exit $LASTEXITCODE)" }
}

Write-Host '=== #555 로컬 D1 부트스트랩 시작 ==='

# 1) workerd 종료 + 로컬 D1 sqlite 파일 제거 (비재귀 — DB 파일만, 디렉터리 구조 보존)
try { Get-Process workerd -ErrorAction SilentlyContinue | Stop-Process -Force } catch {}
Start-Sleep -Milliseconds 500
$d1dir = '.wrangler/state/v3/d1/miniflare-D1DatabaseObject'
if (Test-Path $d1dir) { Get-ChildItem $d1dir -Filter '*.sqlite*' -File -ErrorAction SilentlyContinue | Remove-Item -Force }

# 2) 스키마 → 참조데이터 → applied 마킹 → 로그인 유저
Exec-Sql 'schema/baseline_schema.sql'            '스키마 베이스라인(191테이블)'
Exec-Sql 'schema/baseline_reference.sql'         '참조데이터(카탈로그/설정)'
Exec-Sql 'schema/baseline_applied_migrations.sql' '마이그 applied 마킹(0001~0474)'
Exec-Sql 'seed/seed_users.sql'                   '로그인 유저(admin/password)'

# 3) 베이스라인 이후 추가 마이그(0475+)만 증분 적용 (현재는 no-op)
Write-Host '→ 미래 마이그 증분 적용 (db:migrate:local)'
& npx wrangler d1 migrations apply $DB --local
if ($LASTEXITCODE -ne 0) { throw "증분 마이그 적용 실패 (exit $LASTEXITCODE)" }

Write-Host '=== 부트스트랩 완료 — admin / password 로 로그인 ==='
