---
name: ia-automat
description: IllustratorAutomat 통합 관리 — 빌드/배포, JSX 동기화, 로그 분석. C# 또는 JSX 변경 후, IA 관련 에러 확인 시, JSX 동기화 필요 시 사용.
disable-model-invocation: true
---

# IllustratorAutomat 통합 관리

`$ARGUMENTS`에 따라 실행할 작업 결정:
- `build` 또는 인자 없음 → §1 빌드/배포
- `sync` → §2 JSX 동기화만
- `log` → §3 로그 분석

---

## §1. 빌드 및 배포

### 변경 타입 판별

`git diff --name-only`로 확인:
- `*.cs` / `*.csproj` → **풀 빌드** (dotnet publish → NAS 배포)
- `*.jsx` 만 → **JSX 동기화만** (§2로 이동)

### 풀 빌드

```bash
cd C:\Users\user\dongsan_mes\IllustratorAutomat
dotnet publish -c Release -r win-x64 --self-contained true -o publish
```

빌드 성공 → NAS 배포:
```bash
cp -r IllustratorAutomat/publish/* "Z:/Designs/IllustratorAutomat/publish/"
```

### ERP API URL 검증

`Program.cs`에서 `ERP_API_URL = "http://192.168.0.94:3000"` 확인. 다른 IP 경고.

### 완료 안내

```
✅ 빌드/배포 완료
- 빌드 타입: [풀 빌드 / JSX 동기화]
- NAS 배포: [완료 / 수동 필요]
- ⚠️ Illustrator PC에서 IllustratorAutomat.exe 재시작 필요
```

---

## §2. JSX 동기화

source와 publish 간 JSX 불일치는 가장 빈번한 버그 (AP-003).

### 대상 파일 쌍

| Source | Publish |
|--------|---------|
| `IllustratorAutomat/ExtractGroups.jsx` | `IllustratorAutomat/publish/ExtractGroups.jsx` |
| `IllustratorAutomat/ProcessOrderItem.jsx` | `IllustratorAutomat/publish/ProcessOrderItem.jsx` |
| `IllustratorAutomat/PackGroups.jsx` | `IllustratorAutomat/publish/PackGroups.jsx` |

### 절차

1. 3개 쌍 diff 확인
2. 차이 발견 → 수정 시간으로 최신 판별 → 사용자에게 방향 확인
3. 동기화 실행 (source가 항상 정본)
4. NAS 복사 (Z: 접근 가능 시):
   ```bash
   cp IllustratorAutomat/publish/*.jsx "Z:/Designs/IllustratorAutomat/publish/"
   ```
5. 검증: 다시 diff → 일치 확인
6. "Illustrator PC에서 재시작 필요" 안내

### 주의

- `dotnet publish` 시 source JSX가 publish로 자동 복사됨 → publish 직접 수정분 덮어씌워짐
- source가 항상 정본(canonical)

---

## §3. 로그 분석

### 로그 파일

| 파일 | 위치 | 내용 |
|------|------|------|
| ia_diag.log | `Z:\Designs\IllustratorAutomat\publish\` | ExtractGroups 진단 |
| ia_error.log | 동일 | JSX 예외 |
| ia_debug.log | 동일 | ProcessOrderItem 파라미터 |
| error.log | 동일 | PackGroups 예외 |

각 파일의 **마지막 100줄**만 Read. Z: 불가 시 로컬 `IllustratorAutomat/publish/` 확인.

### 분석

- **에러 패턴**: "error", "fail", "exception", "warning" 추출
- **최근 주문**: `\d{8}-\d{3}` 패턴 추출
- **마지막 실행**: 타임스탬프 기준 최근 엔트리

### 출력

```
## IA 로그 분석 (YYYY-MM-DD HH:MM)

### 에러 (N건)
- [파일:줄] 에러 내용

### 최근 처리 주문
- 20260301-001, ...

### 마지막 활동
- 시간: YYYY-MM-DD HH:MM:SS
- 상태: 정상 / 에러 있음
```
