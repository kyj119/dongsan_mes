---
name: mes-ui-consistency
description: "동산현수막 ERP+MES UI 일관성 가이드. 프론트엔드 작업 시 참조. TRIGGERS: UI 수정, 페이지 생성, 스타일 변경, CSS, Tailwind, 버튼, 테이블, 카드, 뱃지."
---

# UI/UX 일관성 가이드 (핵심)

> 상세 HTML 예제·스켈레톤·트랜지션 → `references/ui-detail.md`
> 금액 포맷 규칙 → `.claude/references/decisions-money.md`

## 1. 색상 시스템

### 배경 & 텍스트
| 역할 | 값 |
|------|-----|
| 페이지 배경 | `#F0F1F3` |
| 카드/패널 | `#FFFFFF` |
| 본문 텍스트 | `#212529` (소프트 블랙) |
| 보조 텍스트 | `#6B7280` (gray-500) |
| 비활성 | `#9CA3AF` (gray-400) |

### 시맨틱 5색
| 역할 | Tailwind | 사용처 |
|------|---------|--------|
| Primary | `blue-600` | CTA 버튼, 활성 탭, 링크 |
| Success | `green-600` | 완료, 정상, 가동 |
| Warning | `amber-600` | 주의, 대기, 보류 |
| Danger | `red-600` | 에러, 삭제, 지연 |
| Neutral | `gray-400` | 비활성, 미접수 |

- 보라/핑크/틸은 **차트 전용**. 같은 데이터는 어디서든 같은 색.

## 2. 버튼 (4종만)

| 종류 | 용도 | 스타일 |
|------|------|--------|
| Primary | 생성/검색 (페이지당 1~2개) | `bg-blue-600 text-white rounded` |
| Danger | 삭제, 위험 액션 | `bg-red-600 text-white rounded` |
| Secondary | CSV, 내보내기 | `border border-gray-300 text-gray-700 bg-white rounded` |
| Ghost | 초기화, 닫기 | `text-gray-500` (배경 없음) |

- 검색 버튼 텍스트: 항상 **"검색"**. 새 변형 금지.

## 3. 아이콘
- **Font Awesome `fas`/`far`만**. 이모지 UI 금지. 버튼 내 `mr-1` 간격.

## 4. 요약 카드
- 배경 `bg-white`, 테두리 `border`, 그림자 `shadow-sm hover:shadow-md`
- 숫자: 기본 `#212529`, 위험만 `red-600` + `border-red-200`
- `tabular-nums` 필수. 노랑/보라/분홍 배경 금지.

## 5. 뱃지 — 아이콘+텍스트+색상 3요소 (WCAG 1.4.1)

배경 `bg-*-50`, 텍스트 `*-700`:
| 상태 | 아이콘 | 스타일 |
|------|--------|--------|
| 완료/정상 | `fa-check-circle` | `bg-green-50 text-green-700` |
| 진행중/확정 | `fa-check`/`fa-spinner` | `bg-blue-50 text-blue-700` |
| 대기/보류 | `fa-pause`/`far fa-clock` | `bg-amber-50 text-amber-700` |
| 에러/지연 | `fa-exclamation-triangle` | `bg-red-50 text-red-700` |
| 미접수 | `far fa-clock` | `bg-gray-100 text-gray-600` |

## 6. 테이블
- 헤더: `bg-gray-50 text-gray-600 text-xs font-semibold sticky top-0 z-5`
- 행: `hover:bg-blue-50/30 border-b border-gray-100`
- 숫자 셀: `tabular-nums text-right`
- 액션 버튼: 호버 시에만 노출
- 줄무늬: `ds-table-striped` (짝수행 `#f8fafc`)
- 밀도 토글: `ds-table-compact`

## 7. 필터/폼
- 필터: `bg-white rounded-lg border p-3 shadow-sm`, 검색은 `flex-1`, 액션 `ml-auto`
- 폼 라벨: `text-sm font-medium`, 입력: `text-sm`, 포커스 링: 은은한 그레이 쉐도우
- 금액 입력: `type="text" inputmode="numeric" data-money` (상세 → decisions-money.md)

## 체크리스트

### 기본
- [ ] 페이지 배경 `#F0F1F3`, 본문 `#212529`
- [ ] 카드 숫자 기본 `#212529`, 위험만 시맨틱 색상
- [ ] 뱃지에 아이콘+텍스트+색상 3요소 (bg-*-50)
- [ ] 테이블 액션 호버 시에만 노출, `tabular-nums`
- [ ] CTA Primary Blue, 검색 버튼 "검색", 이모지 미사용

### 비주얼+UX
- [ ] 카드 `hover:shadow-md`, 인터랙티브 요소 트랜지션
- [ ] 상단바 글래스톱 `backdrop-filter: blur`, Inter 폰트
- [ ] API 대기 시 스켈레톤, 빈 상태(아이콘+메시지+CTA)
- [ ] 테이블 줄무늬, 밀도 토글, 헤더 고정
