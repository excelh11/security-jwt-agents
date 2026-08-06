---
description: Security/JWT 작업을 SPEC → PLAN → TASKS → IMPLEMENT 4단계로 진행
argument-hint: <하고 싶은 작업 설명>
---

# Security/JWT 파이프라인 실행

요청: **$ARGUMENTS**

아래 4단계를 **순서대로** 진행한다. 각 단계가 끝나면 결과를 보여주고 **사용자 승인을 받은 뒤** 다음 단계로 넘어간다.

```
SPEC (무엇을?) → PLAN (어떻게?) → TASKS (어떤 순서로?) → IMPLEMENT (코드로 구현)
```

| 단계 | 담당 에이전트 | 산출물 | 기준 문서 |
|---|---|---|---|
| 1. SPEC | `sjwt-spec` | 요구사항 명세, 계약 영향 분석 | `docs/1-SPEC.md` |
| 2. PLAN | `sjwt-plan` | 기술 선택, 설계 결정, 위험 요소 | `docs/2-PLAN.md` |
| 3. TASKS | `sjwt-tasks` | 의존성 순서대로 쪼갠 작업 목록 | `docs/1-SPEC.md` |
| 4. IMPLEMENT | `sjwt-impl` | 코드 + 테스트 + 검증 결과 | `docs/3-TEST.md` |

## 진행 규칙

1. **한 번에 한 단계만.** 4단계를 몰아서 실행하지 않는다.
2. SPEC 단계에서 **기존 명세(F1~F8)가 깨지는 것이 발견되면 즉시 멈추고** 사용자에게 알린다.
3. PLAN 단계에서 **신규 의존성이 필요하면 승인을 받기 전까지** TASKS로 넘어가지 않는다.
4. IMPLEMENT 단계는 **TASKS 목록 없이 시작하지 않는다.**
5. 요청이 명백한 단순 수정(오타, 상수값 하나, 로그 문구)이면 SPEC/PLAN을 2~3줄로 압축하고 바로 IMPLEMENT로 간다.

## 마무리

IMPLEMENT 완료 후 반드시 아래를 보고한다.

- 변경 파일 목록
- `gradlew compileJava` / `gradlew test` 실행 결과 (실패는 원문 그대로)
- `docs/3-TEST.md` §6 회귀 체크리스트 중 확인한 항목
- 프론트엔드에 영향 가는 계약 변경 (없으면 "없음")
- 명세가 바뀌었다면 `docs/1-SPEC.md` 갱신 여부
