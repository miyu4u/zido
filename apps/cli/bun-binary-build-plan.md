# Zido CLI Bun Binary Build 계획

## 목표

`apps/cli/src/main.ts`를 Bun runtime이 포함된 standalone executable로 compile하여 대상 시스템에 Node.js나 Bun이 없어도 `zido` binary를 실행할 수 있게 한다.

기본 산출물은 현재 platform 기준 `dist/bin/zido`로 둔다. HTTP 및 stdio application의 기존 Nest build는 유지하고, CLI production artifact만 Bun binary로 전환한다.

## 현재 상태

- CLI entrypoint: `apps/cli/src/main.ts`
- 현재 build: `nest build zido-cli`
- 현재 실행: `node dist/apps/cli/main.js`
- TypeScript path alias: `zido/common`, `zido/map-providers`, `zido/place-domain`
- Nest decorator, `reflect-metadata`, `dotenv/config`를 사용한다.
- repository에는 `bun.lock`과 `package-lock.json`이 모두 존재한다.
- 확인된 Bun version은 `1.3.14`이다.

Bun은 `bun build --compile`로 source, dependency, Bun runtime을 하나의 executable로 만들고 cross-compile target도 제공한다. 구현은 [Bun Single-file executable 공식 문서](https://bun.sh/docs/bundler/executables)를 기준으로 한다.

## 완료 조건

- `npm run build:cli`이 `dist/bin/zido`를 생성한다.
- 생성된 artifact는 `node` 또는 `bun` command 없이 직접 실행된다.
- 기존 `resolve`, `nearby`, `geocode` command와 `--json`, `--help`, `--version` option을 유지한다.
- 정상/help/version (exit code `0`), usage/argument 오류 (exit code `2`), config/auth 오류 (exit code `3` - config/auth), provider/runtime 오류 (exit code `4` - provider/runtime), 결과 없음 (exit code `5` - no-result)의 3/4/5 contract를 유지한다.
- provider credential과 `.env` 값은 binary에 embed하지 않고 runtime environment에서 읽는다.
- 기존 CLI in-process test와 실제 binary subprocess smoke test의 책임이 분리된다.
- CLI 사용법과 build command가 `README.md` 및 `AGENTS.md`에 반영된다.

## 구현 단계

### 1. CLI contract를 test로 고정

기존 `apps/cli/test/cli.e2e.spec.ts`와 command spec이 다음 contract를 이미 방어하는지 확인하고 부족한 항목만 추가한다.

- command 및 option parsing
- `--help`, `--version` output
- 정상/help/version 실행의 exit code `0`
- 잘못된 command 또는 누락된 argument/usage의 exit code `2`
- config/auth 오류의 exit code `3` (3=config/auth)
- provider/runtime 오류의 exit code `4` (4=provider/runtime)
- 결과 없음(no-result)의 exit code `5` (5=no-result)
- `resolve`, `nearby`, `geocode`의 domain 호출과 output 형식

Provider 호출 검증은 기존처럼 Jest process 안에서 concrete provider method를 `jest.spyOn`하여 대체한다. 이 검증은 별도 process인 compiled binary 내부까지 intercept할 수 없으므로 binary smoke test와 혼합하지 않는다.

### 2. Bun compile compatibility spike

repository root에서 다음 최소 build를 실행한다.

```bash
bun build apps/cli/src/main.ts \
  --compile \
  --outfile dist/bin/zido
```

다음을 확인한다.

- root `tsconfig.json`의 `paths` alias resolve
- Nest legacy decorator 및 `emitDecoratorMetadata`
- `reflect-metadata` 포함 여부
- Nest dependency injection bootstrap
- `dotenv/config`의 runtime loading
- `axios`, `pino`, `rxjs`, provider module bundling

단순 command가 성공하면 별도 build abstraction을 만들지 않는다. 호환성 문제나 target matrix 관리가 실제로 필요할 때만 `apps/cli/build.ts`를 추가한다.

### 3. Package script를 binary 중심으로 전환

`package.json`을 다음 책임으로 정리한다.

```json
{
  "scripts": {
    "build:cli": "bun build apps/cli/src/main.ts --compile --outfile dist/bin/zido",
    "start:cli": "./dist/bin/zido",
    "start:prod:cli": "./dist/bin/zido"
  }
}
```

- aggregate `build`는 HTTP, stdio, CLI binary를 모두 생성한다.
- 기존 `nest build zido-cli`와 `dist/apps/cli/main.js` production path는 제거한다.
- Node artifact를 유지해야 할 구체적인 사용처가 발견된 경우에만 별도 development script로 보존한다.
- `dist/bin/`은 generated artifact로 유지하고 repository에 commit하지 않는다.
- Bun compiler/runtime behavior의 재현성을 위해 `packageManager`에 Bun version을 고정한다.

예상 설정:

```json
{
  "packageManager": "bun@1.3.14"
}
```

Dependency manager 전체를 Bun으로 전환하는 것은 이 작업 범위에 포함하지 않는다. `package-lock.json`과 npm 기반 command는 유지하고 Bun은 binary compiler 역할만 담당한다.

### 4. Binary version source 통합

현재 CLI `--version`은 root `package.json`의 `version` 필드를 canonical source로 읽는다. 배포 standalone binary artifact에서도 동일한 version 정보가 보존되도록(same version preservation) 동일한 canonical version을 compile-time constant로 주입한다.

- root `package.json`의 `version` 필드 값을 Bun `--define` 등으로 삽입한다.
- CLI `--version`은 compile-time에 주입된 standalone binary version을 출력하여 동일한 version이 보존되도록(same version preservation) 한다.
- `MCP_SERVER_VERSION`은 MCP server identity 설정으로 한정한다.
- version 외 configuration과 credential은 `--define`에 전달하지 않는다.

단순 shell quoting이 platform별로 불안정하거나 package version 조회가 복잡해질 경우에만 Bun build API를 사용하는 `apps/cli/build.ts`로 옮긴다.

### 5. 실제 binary subprocess smoke test 추가

Binary smoke test는 compile된 artifact를 child process로 직접 실행하며 외부 provider 호출이 필요 없는 경로만 검증한다.

- `zido --help`: exit code `0`, usage output
- `zido --version`: exit code `0`, compile-time version output
- invalid argument: exit code `2`, stderr message
- runtime command 없이도 artifact가 직접 실행되는지 확인

Binary build는 test case마다 반복하지 않는다. Targeted smoke script 또는 Jest setup에서 한 번 compile한 artifact를 각 subprocess assertion이 공유한다.

Provider/domain behavior는 별도의 기존 in-process Jest contract test가 맡는다. `jest.spyOn`으로 provider를 대체하는 검증을 compiled binary subprocess test에 적용하지 않는다.

### 6. Cross-compile release matrix 준비

초기 구현은 현재 platform용 `build:cli` 하나를 제공한다. 실제 배포가 필요할 때 다음 target을 release build에 추가한다.

| Platform | Bun target | Artifact |
| --- | --- | --- |
| macOS ARM64 | `bun-darwin-arm64` | `zido-darwin-arm64` |
| macOS x64 | `bun-darwin-x64` | `zido-darwin-x64` |
| Linux x64 | `bun-linux-x64-baseline` | `zido-linux-x64` |
| Linux ARM64 | `bun-linux-arm64` | `zido-linux-arm64` |
| Windows x64 | `bun-windows-x64` | `zido-windows-x64.exe` |

Linux x64은 구형 CPU 호환성을 위해 `baseline`을 기본으로 한다. 여러 target command가 중복되기 시작하면 Bun build API 기반 script 하나로 통합한다.

### 7. 문서와 repository 규칙 갱신

`README.md`의 CLI section을 binary 실행 기준으로 변경한다.

```bash
npm run build:cli
./dist/bin/zido --help
./dist/bin/zido resolve "서울역"
```

다음을 함께 설명한다.

- 배포된 binary 실행에는 Bun 또는 Node.js가 필요하지 않다.
- API credential은 binary에 포함되지 않는다.
- `.env`는 실행 process의 current working directory를 기준으로 읽는다.
- OS 및 architecture별 artifact 이름
- PATH 설치 예시와 Windows 실행 예시

`AGENTS.md`에는 CLI production artifact가 Bun standalone binary이며 credential을 embed하지 않는다는 규칙을 기록한다.

## 검증 계획

중복되는 runtime/E2E 검증을 쌓지 않고 다음 두 책임만 검증한다.

### In-process contract test

Provider/domain 호출, exit code 0/2/3/4/5 contract, 그리고 CLI output contract를 검증하는 기존/신규 Jest test를 실행한다.

```bash
npx jest apps/cli/test/cli.e2e.spec.ts --runInBand
```

Concrete provider method는 `jest.spyOn`으로 대체하여 외부 API를 호출하지 않는다.

### Compiled binary smoke

```bash
npm run build:cli
./dist/bin/zido --help
```

Targeted binary smoke test가 구현되면 위 수동 subprocess 확인 대신 해당 test 하나를 실행한다. 이 smoke는 `--help`, `--version`, invalid argument처럼 provider 호출이 없는 observable path만 다룬다.

## 예상 변경 파일

- `package.json`
- `apps/cli/src/main.ts`
- `apps/cli/test/cli.e2e.spec.ts` 또는 별도 binary smoke spec
- 필요할 때만 `apps/cli/build.ts`
- `README.md`
- `AGENTS.md`
- Bun version 또는 dependency metadata가 바뀌는 경우 해당 lockfile

## 위험과 대응

### Nest decorator metadata 손실

먼저 실제 compile과 binary bootstrap smoke로 확인한다. 문제가 있을 때만 TypeScript pre-transpile 후 Bun compile 경로를 검토한다.

### TypeScript path alias resolve 실패

Repository root에서 build하여 root `tsconfig.json`을 사용한다. 실패할 때만 Bun build script의 alias 설정을 명시한다.

### `.env` 탐색 위치 혼동

현재 `dotenv/config`의 current working directory 기준 동작을 유지하고 README에 명시한다. Binary 위치 기준으로 임의 변경하지 않는다.

### Secret embedding

Credential과 `.env` 값을 build argument, `--define`, source constant에 전달하지 않는다. 공개 가능한 root `package.json`의 `version` 필드 값만 compile-time에 주입하여 동일한 version이 보존되도록(same version preservation) 한다.

### Binary smoke에서 provider spy 불가

Compiled binary는 별도 process이므로 Jest process의 spy가 적용되지 않는다. Binary smoke는 provider가 필요 없는 path만 검증하고 provider contract는 in-process Jest test가 담당한다.

### Cross-compiled artifact 검증 범위

초기 acceptance는 native binary로 제한한다. Release matrix 도입 시 각 target OS runner에서 동일한 provider-free binary smoke를 수행한다.

### Binary 크기

Bun runtime과 Nest dependency가 포함되므로 artifact가 커질 수 있다. Correctness 확인 후 release build에만 `--minify`를 검토하며 stack trace 가독성과 크기를 함께 비교한다.
