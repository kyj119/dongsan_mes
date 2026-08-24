# 세션 핸드오프 — 2026-08-24 파일 규격 판독 후속 2건 (배율표 학습·status-trim)

## 상태
- **완료·main 머지**: `23ef6f38`(status-trim 계약 재정렬+트림 실행) · `f94d4169`(배율표 학습기) · `1400f370`(docs). 워크트리 `scale-trim` 종료.
- 앞선 같은 날 작업(파일 규격 자동 판독 P1~P5 prod 배포)은 직전 핸드오프·memory `design-file-dimension-probe` 참조.

## 결정 + 이유
1. **status-trim**: 계약 11항목이 2026-08-10 다이어트 이전의 구 구조(현재 초점/블로커/다음 액션 배너, 구 절명)를 봐서 **모든 트림이 검증 실패→자가 복구**만 하고 있었다(배너 13>임계 12인데 이관 불가). 계약을 현행 정본 구조(✅ 최근 완료/🔴 진행 중/🟡 결정·확인 대기/🆕 설계 확정/🗄️ 보류함/🔒 편집 중/⚠️ 잠복·블로커/📌 기존 에러)로 재정렬 — **문서를 계약에 맞추지 않고 계약이 문서를 따른다**. 절 이름 텍스트 매칭(이모지 VS16 변형 무관). 트림 실행: 배너 7건 ARCHIVE 이관(13→6·37→32KB), 무손실·계약 전항목 통과.
2. **배율표 학습기** `zscan-learn-scale.cjs`: 파싱=zscan-intake `--json`(정본 파서 재사용)·실측=fileDimensions.ts(esbuild, 사본 금지)·스냅=[1,2,2.5,4,5,10] 5%(learn_scale.py와 동일)·게이트=합의≥85%+판독≥10. **append 전용**(기존 행 불변 — 검증된 폴백 동작 보호)·백업 선행. ⚠️norm 정규식은 zscan-intake.cjs:357 RX_NORM 원문 사본(1줄) — 바꿀 땐 두 곳 동시.
3. **학습 결과(6/1~8/24, 9,508행·302유형)**: 기존 표 유형 **전부 동일 배율 재현**(교차검증 통과) · 신규 21종 채택(태극기 3~8호·전사 윈드배너·280/200폭 등) → `scale_table.csv` append(백업 `scale_table.csv.bak-2026-08-24`). ★「전사」 generic은 합의 38%로 기각 — 혼합 라벨이라 채우면 추측. 채움 실측은 6월 3건 그대로: **미파싱의 86%가 전사 generic(115)+유형없음(108)이라 표 확장으로 못 채우는 구조적 잔여**. 근본 해소 경로=파일명 규칙 배포(규격·유형 표기, 기존 대기 항목).

## 주의사항
- ⚠️ 메인 체크아웃에 **타 작업 미커밋 src 4건 잔존**(LogWatcher/Tools/MarkerProbe.cs·routes/dashboard.ts·orders/listFilter.ts·reports.ts — auto-improve 추정). 건드리지 않았고 pull은 `--autostash`로 우회함. **docs 커밋 시 같이 쓸려가지 않게 파일 지정 add 필수**(08-19 `acb0431c` 사고 패턴).
- `scale_table.csv`는 gitignore(메인 체크아웃 전용 데이터). 학습 재실행: `node scripts/zscan-learn-scale.cjs --from … --to … [--commit]`.
- status-trim은 이제 배너 12건 도달 시 정상 작동. `--check`로 미리보기.

## 다음 세션 TODO
1. 없음(이 두 건은 완결). 잔여 미파싱 해소는 「파일명 규칙 배포」(용준님, 기존 08-11~12 항목)와 묶임.
2. 8월 주문 재적재 결정 시 `GET /api/ai-analysis/audit-dimensions` 재실행(직전 핸드오프 참조).

## 검증 명령
```powershell
node scripts/status-trim.cjs --check
node scripts/zscan-learn-scale.cjs --from 2026-06-01 --to 2026-08-24   # dry-run 리포트
node scripts/zscan-intake.cjs --from 2026-08-01 --to 2026-08-08        # 폴백 로그 확인
```
