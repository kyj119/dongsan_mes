---
name: 시트 배치 구현 교훈
description: 시트 배치 기능 구현 시 발생한 아키텍처 결정과 교훈 (IA PC 연동, 스케일, 파일 경로)
type: feedback
---

## auto_process_jobs vs orders 테이블
auto_process_jobs에 시트배치 job을 만들었으나 C#은 이 테이블을 폴링하지 않음. C#의 ProcessOrderAsync는 주문 자체를 처리. → 주문-레벨 결정은 orders 테이블에 저장해야 함.
**Why:** C#의 주문 처리 경로(Task Queue → ProcessOrderAsync)와 auto_process_jobs는 별도 시스템.
**How to apply:** IA PC와 연동하는 새 기능은 반드시 C#의 실제 폴링 경로를 확인한 후 설계.

## Illustrator 문서 크기 한계
Illustrator 최대 문서 크기 ~577cm. 스케일 10배 적용 시 좌표가 619cm → PARM 에러.
**Why:** MES에서 실제 크기로 좌표를 보냈으나 Illustrator가 처리 불가.
**How to apply:** C#에서 scale_factor로 나눠서 파일 원본 크기 기준으로 전달. 돔보/외곽선 두께도 스케일 적용.

## DXF 레이어 처리
Illustrator DXF 내보내기 시 `visible=false` 레이어는 잠금으로 변환됨. 플로터가 읽을 수 있음.
**Why:** DXF 포맷이 Illustrator의 printable/visible 속성을 다르게 해석.
**How to apply:** DXF에서 제외할 레이어는 `visible=false`가 아니라 `remove()` 사용.

## C# dotnet publish 경로
`dotnet publish`의 출력은 `bin/Release/net8.0/win-x64/publish/`이지, 프로젝트 루트의 `publish/`가 아님. JSX 파일은 `.csproj`에 등록해야 빌드에 포함됨.
**Why:** 프로젝트 루트 publish/ 폴더는 이전 빌드 잔여물.
**How to apply:** 새 JSX 추가 시 반드시 csproj에 `<None Include="파일.jsx"><CopyToOutputDirectory>Always</CopyToOutputDirectory></None>` 등록.
