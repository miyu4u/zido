---
plan_name: "cli-ux-improvement"
status: "completed"
mode: "deep"
authoring_phase: "upgrade"
goal: "apps/cli의 첫 사용 discoverability와 도움말, 오류, 출력 계약을 개선한다"
budgets:
  max_document_lines: 360
  max_action_tasks: 12
  max_parallel_lanes: 4
  appended_policy: "compact-then-split"
---

# Zido CLI UX Improvement

## Human Review Block

### 목표

- Zido를 모르는 사용자가 `zido` 또는 `zido --help`만 실행해도 usage, example, input, output, 필수 설정을 함께 이해하고 실패 시 복구할 수 있게 한다.

### 간략한 브리핑 설명

- 현재 root help는 command 이름과 짧은 형식만 제공하며, no-argument 실행은 `A command is required`로 끝난다.
- command별 help가 없고 usage/configuration 오류는 remediation이나 stable code 없이 raw message와 exit `2`로 합쳐진다.
- 기존 `resolve`, `nearby`, `geocode` 호출은 유지하면서 기본 spreading output, `--json`, package version, 명시적 exit code contract를 만든다.

### NEED DECISIONS

- 없음: 열린 결정 없음

### AS IS

- root parser, usage, 출력, error mapping, Nest lifecycle이 `apps/cli/src/main.ts`에 결합되어 있다.
- `--help`는 command 위치와 무관하게 동일한 root usage만 출력하며 no-argument는 사용 안내 없이 실패한다.
- ASCII Graph:

  ```text
  argv --> ad-hoc parser --> domain command --> stdout
                |                |
                +--> raw Error --+--> stderr + exit 2
  no args ---------------------------------> raw Error
  ```

### TO BE

- root/no-argument와 각 public command help 한 화면에 usage, examples, input 형식·제약, spreading/JSON output 설명, provider configuration 안내를 제공한다.
- 기본 spreading output은 결과 field를 사람이 읽기 쉽게 여러 줄로 펼치고, `--json`은 같은 결과를 parse-clean JSON으로 출력한다.
- `--version`은 별도 version 설정값이 아니라 repository root `package.json`의 `version`을 canonical source로 사용한다.
- exit code는 `0` success/help/version, `2` usage, `3` configuration/authentication, `4` provider/runtime, `5` no-result로 구분한다.
- 현재 command surface와 domain/provider ownership은 유지하고 CLI 경계만 개선한다.
- ASCII Graph:

  ```text
  argv --> command-aware parser --> help/package version -> stdout + exit 0
                |                   domain command -------> spreading|JSON stdout
                +--> typed CLI error --> code + hint ----> stderr + mapped exit
  no args -------------------------> onboarding root help + exit 0
  ```

### DoD

- 인자 없는 실행과 `--help`, 모든 `<command> --help`가 side effect 없이 exit `0`이며 usage, examples, input 제약, spreading/JSON output 예시, configuration next step을 함께 제공한다.
- `--version` 출력이 `package.json`의 `version`과 일치하고 다른 config/env 값으로 drift하지 않는다.
- invalid input, configuration/authentication, provider/runtime, no-result가 각각 exit `2`, `3`, `4`, `5`로 구분되며 human mode는 원인과 remediation을, JSON mode는 stable `code`, `message`, `hint` envelope를 stderr에 출력한다.
- 기본 spreading stdout은 결과 field를 식별 가능한 label과 함께 펼치고, `--json` stdout은 같은 의미를 parse-clean JSON으로 제공하며 기존 command input/domain result contract를 유지한다.
- targeted CLI test와 `npm run typecheck`가 통과하며 README와 `AGENTS.md`가 확정된 UX contract와 일치한다.

### Evidence Pack

- `apps/cli/src/main.ts`: 현재 parser, root usage, output, error/exit 처리의 source of truth.
- `apps/cli/test/cli.e2e.spec.ts`: 현재 CLI observable behavior 검증 경계.
- `apps/cli/src/commands/`: 기존 세 command의 input/domain contract.
- `package.json`: `--version`의 canonical version source.
- `README.md`: human-facing setup과 CLI examples.
- `AGENTS.md`: repository-local CLI 및 verification 규칙.

### 리뷰 포인트

- 아래 예상 포인트는 우선 점검 권장 항목이며, 예상되는 포인트만으로 리뷰 범위를 한정해서는 안 된다. 구현 중 드러나는 추가 위험도 함께 점검한다.
- Fragile: global option 위치와 `<command> --help`가 domain context를 만들지 않는지, spreading field label과 JSON 의미가 일치하는지 확인한다.
- Drift: help examples, parser grammar, README, `package.json` version, exit/error table이 같은 contract를 설명하는지 확인한다.
- Regression: positional/named input, Unicode query/address, `--version`, provider fallback, stdout/stderr 분리가 유지되는지 확인한다.
- Border value: no args, unknown command/option, missing option value, no-result, negative coordinate/radius token, `--` end-of-options를 점검한다.

### Decision Tree

- DT-1 first-run behavior
  - considered_options:
    - 권고: no-argument 실행에서 concise onboarding help를 출력하고 exit `0`
    - 대안: usage error를 유지하되 full help와 remediation을 stderr에 출력
  - chosen_path: no-argument onboarding help와 exit `0`
  - rationale: CLI 기본 정보가 없는 사용자의 첫 실행을 discovery entrypoint로 만들며 side effect가 없다.
  - drift_guard: explicit invalid input은 성공 처리하지 않고 usage error로 남긴다.
  - blocker_fallback:
    - blocker: 기존 automation이 no-argument exit `2`에 의존한다는 concrete evidence가 발견된다.
    - fallback: no-argument는 exit `2`를 유지하되 동일 onboarding help와 stable usage error를 stderr로 제공한다.
- DT-2 implementation boundary
  - considered_options:
    - 권고: dependency 추가 없이 현재 parser를 command-aware contract로 정리
    - 대안: 외부 CLI framework를 도입해 help와 parser를 전면 교체
  - chosen_path: 기존 parser 기반 clean cutover
  - rationale: 세 command 규모에서 dependency와 migration risk를 늘리지 않고 필요한 UX contract를 충족한다.
  - drift_guard: parser, help, error code가 중복된 별도 convention으로 갈라지지 않게 한 metadata source에서 파생한다.
  - blocker_fallback:
    - blocker: command metadata와 parsing 규칙의 단일화가 `main.ts` 책임을 더 복잡하게 만든다.
    - fallback: repository naming/SRP 규칙에 맞는 CLI contract service로 분리하되 public command grammar는 유지한다.
- DT-3 output and exit contract
  - considered_options:
    - 권고: default spreading output과 opt-in `--json`, outcome별 exit code
    - 대안: JSON-only output과 success/error 이진 exit code
  - chosen_path: default spreading output, opt-in `--json`, `0/2/3/4/5` exit table
  - rationale: 처음 쓰는 사람의 가독성과 script 소비자의 안정적 분기를 함께 제공한다.
  - drift_guard: 두 output mode는 같은 domain result 의미를 보존하고 exit code 의미를 message text에 의존시키지 않는다.
  - blocker_fallback:
    - blocker: 특정 domain exception을 configuration과 provider/runtime으로 안정적으로 분류할 수 없다.
    - fallback: 분류 가능한 exception부터 `3/4`에 매핑하고 미분류 runtime은 `4`로 수렴시킨다.

## Agent Working Block

### Scope / Non-goals

- In scope: root/subcommand help, usage/example/input/output 설명, spreading/JSON output, package version, typed error/exit table, focused tests, README/AGENTS alignment.
- Non-goals: 새 place command, interactive prompt, provider API 변경, table/color framework, destructive command safety, pagination 기능.

### Assumption Register

- A1: 실행 주체는 long-context에 약하고 약 40 turns / 5분 내외 soft cutoff lifetime을 가진 agents swarm이다.
- A2: 기존 public command는 `resolve`, `nearby`, `geocode`이며 compatibility를 유지한다.
- A3: human prose는 한국어, option/error code/JSON key는 locale-independent ASCII token을 사용한다.
- A4: default는 labeled spreading output, machine output은 `--json`, primary data는 stdout, diagnostics와 error envelope는 stderr가 소유한다.

### Guardrail

#### 경고
- 경고: help/version/no-argument 경로에서 Nest context나 provider를 초기화하지 않는다.
- 경고: JSON stdout에 help, warning, logger, ANSI escape를 섞지 않는다.
- 경고: `--version` 값을 `package.json` 외 config/env에 중복 정의하지 않는다.
- 경고: 기존 command 입력 또는 result schema를 UX 편의 명목으로 변경하지 않는다.

#### 주의
- 주의: 수정한 symbol에는 repository JSDoc/interface/naming 규칙을 적용하고 인접 naming 위반은 함께 sweep한다.
- 주의: negative numeric operand와 `--` 경계를 option missing-value로 오판하지 않는다.
- 주의: README와 `AGENTS.md`는 usage/example/input/output 및 `0/2/3/4/5` exit contract를 구현과 동일하게 기록한다.

### Nested Decomposition

- `T1` CLI invocation contract
  - `T1.1` usage/example/input/output를 포함한 root/subcommand help와 package version 구현
  - `T1.2` parser grammar, spreading/JSON output, typed error envelope와 exit mapping 구현
- `T2` observable contract protection
  - `T2.1` help, streams, JSON, invalid input, compatibility를 검증하는 focused CLI test 보강
- `T3` operator contract alignment
  - `T3.1` README와 AGENTS CLI 사용·검증 규칙 갱신 및 targeted verification 실행

### Board

- [x] `T1.1` 완결된 help와 package version 구현 (`apps/cli/src/main.ts`, `package.json`; depends_on: none)
  - expected_file_ownership:
    - `apps/cli/src/main.ts`
    - `package.json`
- [x] `T1.2` spreading/JSON/error/exit contract 구현 (`apps/cli/src/main.ts`; depends_on: `T1.1`)
  - expected_file_ownership:
    - `apps/cli/src/main.ts`
- [x] `T2.1` CLI observable contract test 보강 (`apps/cli/test/cli.e2e.spec.ts`; depends_on: `T1.1`, `T1.2`)
  - expected_file_ownership:
    - `apps/cli/test/cli.e2e.spec.ts`
- [x] `T3.1` operator 문서 정합성과 검증 완료 (`README.md`, `AGENTS.md`; depends_on: `T1.1`, `T1.2`)
  - expected_file_ownership:
    - `README.md`
    - `AGENTS.md`

### DAG

- L1: T1.1
- L2: T1.2
- L3: T2.1, T3.1
- critical_path: T1.1 -> T1.2 -> T2.1
- review_gates: T2.1, T3.1

### Verification / Rollback

- Verification:
  - targeted CLI test: `npm test -- --runInBand apps/cli/test/cli.e2e.spec.ts`
  - compile contract: `npm run typecheck`
  - reviewer gate: help의 usage/example/input/output, package version, spreading/JSON, exit table이 실제 behavior에 대응하는지 확인
- Rollback:
  - CLI entrypoint, focused test, README/AGENTS 변경만 leaf 단위로 되돌리고 domain/provider contract는 건드리지 않는다.
  - compatibility blocker가 확인되면 DT-1 fallback을 적용하고 no-argument exit만 보존한다.

### Replan / Review Queue

- Replan trigger: external framework가 필요해지거나, 새 public command/API 변경이 필요하거나, 한 leaf가 A1의 40 turns / 5분 내외를 넘길 때
- Review queue:
  - no-argument exit compatibility evidence
  - spreading output의 command별 field label과 null/empty 표현
  - negative numeric operand와 `--` parsing semantics
  - provider configuration hint가 secret 값을 노출하지 않는지

## APPENDED

  - 계획은 `design` mode이며 구현은 포함하지 않는다.
  - machine mode에서 human prose를 parser contract로 사용하지 않는다.
  - 구현 후 반복 review에서 확인된 parser boundary와 문서 drift를 수정했으며 targeted CLI test 24건, provider/router targeted 42건, `npm run typecheck`가 통과했다.
