---
name: deploy
description: 프로덕션 배포 체크리스트 자동화. git 상태 확인 → 빌드 → 마이그레이션 감지 → 배포 → DB 마이그레이션 → health check를 순서대로 실행. "배포해줘", "프로덕션 올려줘", "deploy" 등의 요청 시 이 스킬을 사용한다. 배포 순서 실수(마이그레이션 빼먹기 등)를 방지한다.
disable-model-invocation: true
---

# 프로덕션 배포 체크리스트

안전한 배포를 위해 6단계를 순서대로 실행한다. 각 단계에서 문제 발견 시 즉시 중단하고 사용자에게 보고한다.

## 절차

### Step 1: 사전 점검

```bash
git status
git log --oneline -5
```

확인 사항:
- **uncommitted 변경사항이 있으면 경고** — 커밋 먼저 하라고 안내
- **현재 브랜치가 main인지 확인** — 아니면 사용자에게 확인

---

### Step 2: 빌드

```bash
npm run build
```

빌드 실패 시 에러 출력하고 중단.

---

### Step 3: 마이그레이션 감지

로컬과 프로덕션의 마이그레이션 상태를 비교한다.

1. `migrations/` 디렉토리에서 최신 마이그레이션 번호 확인 (Glob)
2. 사용자에게 **새 마이그레이션이 있는지 확인**:
   - 있으면: Step 5에서 프로덕션 DB 마이그레이션 실행 예정임을 안내
   - 없으면: Step 5 건너뜀

---

### Step 4: 배포 스냅샷 + 배포

**4-1. 스냅샷 저장** (배포 직전):
```bash
bash .claude/scripts/deploy-snapshot.sh HEAD~5
```
- 자동 생성: `.claude/deployments/deploy_YYYY-MM-DD_HHmmss.json`
- 포함 필드: timestamp, commit(SHA), short_commit, branch, latest_migration, uncommitted_files(카운트), baseline, changed_files(배열, 최대 50건)
- 인자 생략 시 baseline=HEAD~5. 더 긴 범위 원하면 `HEAD~10` 등 지정
- jq 불필요 (POSIX sh + git만 사용)
- 실패 시 exit 1, 성공 시 exit 0 + 파일 경로/메타 출력

**4-2. 실제 배포**:
```bash
npm run deploy:prod
```

배포 실패 시 에러 출력하고 중단. 스냅샷은 유지(사후 분석용).
성공 시 Cloudflare Pages 배포 URL 출력.

---

### Step 5: 프로덕션 DB 마이그레이션 (해당 시)

Step 3에서 새 마이그레이션이 감지된 경우에만 실행.

**실행 전 반드시 사용자 확인을 받는다** — 프로덕션 DB 변경은 되돌리기 어려우므로.

```bash
npm run db:migrate:prod
```

---

### Step 6: Health Check

프로덕션 URL에 접속하여 정상 동작 확인:

```bash
curl -s -o /dev/null -w "%{http_code}" https://webapp-9i0.pages.dev/api/dashboard
```

- **200 응답**: 배포 성공
- **그 외**: 문제 보고 + 롤백 안내

---

### 완료 요약

```
배포 완료:
  - 빌드: OK
  - 배포: OK (URL: https://webapp-9i0.pages.dev)
  - DB 마이그레이션: OK / 해당 없음
  - Health Check: OK (HTTP 200)
```

## 배포 스냅샷 저장 (Step 4 직전 자동 실행)

배포 실패/장애 시 복구 경로를 확보하기 위해, 배포 직전 상태를 JSON으로 기록한다.

```bash
# 경로: .claude/deployments/deploy_YYYY-MM-DD_HHmmss.json
{
  "timestamp": "2026-04-15T14:30:00+09:00",
  "commit": "<HEAD sha>",
  "branch": "main",
  "latest_migration": "0091_xxx.sql",
  "changed_files": ["src/routes/xxx.ts", ...],
  "deploy_url_before": "<직전 프로덕션 URL의 배포 id>"
}
```

목적:
- 롤백 시 어느 커밋/마이그레이션으로 되돌릴지 즉시 확인
- 여러 배포가 짧은 시간에 쌓였을 때 타임라인 복원

---

## 롤백 절차 (장애 발생 시)

### 1단계: Cloudflare Pages 대시보드 롤백 (코드만)
- Cloudflare Pages → webapp 프로젝트 → Deployments 탭
- 직전 성공 배포 선택 → "Rollback to this deployment"
- **주의**: 이는 Worker 코드만 되돌림. **DB 스키마는 그대로 유지됨**

### 2단계: DB 마이그레이션 롤백 (필요 시)
- `.claude/deployments/` 스냅샷에서 직전 마이그레이션 번호 확인
- forward-only 구조이므로 자동 롤백 불가 → **수동 SQL 작성 필요**
- 옵션 A: 새 역방향 마이그레이션 작성 (DROP/ALTER) → 정상 배포 경로로 적용
- 옵션 B: D1 백업 복원 (Cloudflare D1 Time Travel, 30일 이내)

### 3단계: Health check 재실행
```bash
curl -s -o /dev/null -w "%{http_code}" https://webapp-9i0.pages.dev/api/dashboard
```

### 롤백 체크리스트
- [ ] 장애 유형 기록 (Worker 버그 vs DB 스키마 vs 외부 연동)
- [ ] 1단계(코드 롤백)만으로 복구되는지 먼저 확인
- [ ] DB 변경이 있었던 배포면 반드시 사용자 승인 후 2단계 진행
- [ ] 롤백 후 `.claude/deployments/`에 `rollback_YYYY-MM-DD.md` 사유 기록

---

## 주의사항

- **프로덕션 DB 마이그레이션은 항상 사용자 확인 후 실행** — 자동 실행 금지
- 배포 전 `/review-checklist` 실행 권장
- **스냅샷은 배포 직전에만 생성** — 빌드 실패 시에는 생성하지 않음
- 30일 이상 된 `.claude/deployments/*.json`은 정리 대상 (과도한 누적 방지)
