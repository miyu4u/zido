<INSTRUCTIONS project="zido">

<directive>
- 해야한다. 해야합니다 : MUST
- 하지 말아야한다. 해서는 안된다 : MUST NOT
- 해야할 필요가 있다 : SHOULD
- 할 수 있다. : COULD, MAY
</directive>

# zido AGENTS.md

## PURPOSE

Zido는 Nest CLI workspace 기반의 MCP(Model Context Protocol) server입니다. 여러 지도 API provider를 공통 interface로 감싸 장소 검색과 geocoding 기능을 제공하며, `stdio`와 HTTP transport를 통해 MCP client에 연결됩니다.

이 문서는 Zido의 runtime ownership, directory structure, 실행 명령어와 변경 후 verification 기준을 정의합니다. 구현 시에는 configuration, provider fallback, place domain, MCP tool registration의 경계를 유지하고, 운영자가 재현할 수 있는 명령어와 검증 절차를 우선합니다.

## STRUCTURE

- `apps`: application entry
  - `http-server` : zido http server /mcp transporter
  - `stdio` : zido stdio server
  - `cli` : zido cli application
- `libs` : libraries
  - `common` : common codes like validator, config ...
  - `map-providers` : map data API providers
    - `kakao` : Kakao map
    - `naver` : naver map
    - `google` : google map
  - `mcp-runtime` : mcp shim module
  - `place-domain` : place related codes

> 대표 Flow : apps > (mcp-runtime) > place-domain > map-providers

### STRUCTURE GUIDE

- 구조는 stale해지기 쉬우므로 변경이 생기거나 관측상 변경이 있는 경우 STRUCTURE 섹션을 갱신해야합니다.
- `common` library는 `config.ts`를 configuration의 단일 source of truth로 사용하며 Nest `ConfigurationService`와 `ConfigurationModule`을 두지 않습니다.

## RULES

- 작업 중 기록된 규칙에 벗어난 pattern을 발견하면, 동일한 pattern이 적용된 범위를 sweep하여 같은 task에서 함께 refactoring해야 한다. (MUST)
- 주의 : 문제가 생겼을 때, git clean revert를 하지 말 것 (변경사항 전체 취소 등)
- tool registration, schema wiring, query-only large-action gating, hook registration을 직접 소유하는 root runtime entrypoint로 `src/main.ts`를 유지
- 기술 용어, 핵심 용어는 알파벳을 유지하면서 서술은 한국어로 합니다.
- 사용자가 지시한 내용은 `AGENTS.md`에 기록한 후 해당 규칙에 따라 작업합니다.
- 작업 중 `AGENTS.md`의 `RULES`에 기술된 규칙에서 `drift` 또는 `stale` 상태인 부분을 발견하면 함께 `sweep`합니다.

## GUIDE

### HOW TO WRITE COMMENT

- Comment는 multi-line jsdoc 스타일로 해당 함수, 또는 메소드의 이름이 기계적으로 반복되지 않는 의미 있는 주석이어야합니다.
- 작업한 부분 중 const, type, property, function, method에는 multiline jsdoc 형식의 한글 주석을 작성해야합니다.
- comment는 method 또는 const name 의 반복된 서술이여서는 안되며, 구체적인 작동 방식 및 "어떤 역할을 하는지"를 충분히 설명 할 수 있어야합니다.
- property는 각 property에 inline multiline jsdoc으로 작성합니다.

## CODE STYLE

- 에러는 종류에따라 명시적인 Exception Class를 사용합니다.
- 구조는 단순해야하며, 구성 및 흐름이 한눈에 보일 수 있어야합니다.
- by-condition multi return 인 경우, funnel처럼 early return으로 조건이 처리되어야 합니다
- if-else, else if 의 chain 보다는 switch를 우선으로 사용하세요
- 2-depth 이상 if-else block, try-catch block을 사용하지 않습니다.
- arguments로 object를 전달 받은 경우, object내에 property를 inner-method에서 변경하지 않습니다.
- arguments, return result 객체의 타입은 zod schema -> z.infer를 사용한 type 객체를 사용합니다.
  - EX) `const UserSchema = z.object({}); type User = z.infer<typeof UserSchema>`
- Comment는 multi-line jsdoc 스타일로 해당 함수, 또는 메소드의 이름이 기계적으로 반복되지 않는 의미 있는 주석이어야합니다.
- SOLID 원칙을 준수하며, 특히 클래스는 단일 책임 원칙(SRP)에 따라 구현해야 합니다.
- 반드시 interface contract를 먼저 정의하고, 클래스는 해당 interface를 명시적으로 implement 해야 합니다.

### CODE STRUCTURE

- class에 implements로 상속되는 interface는 항상 class code의 바로 위에 위치해야합니다.
  - interface method에는 주석을 작성하고, 해당 interface 구현한 class에는 주석을 작성하지 않습니다.
  - private method는 주석이 있어야 합니다.
- file module 내에 class가 있다면, 재사용 해야하는 함수가 아니라면 function을 file module range로 spreading 하지 않습니다. 파일 내 method 로 흡수합니다.

### NAMING STYLE

- Extension Entrypoint는 `main.ts`에서 `export default`로 반드시 내보내야 합니다.
  - 진입점인 `main.ts`에는 다른 export를 re-export 하지 않습니다.
- Extension Entrypoint 메서드명은 반드시 `register`로 지정합니다.
- 파일명은 반드시 `kebab-case.<type>.ts` 혹은 `kebab-case.ts` 규칙을 따라야 합니다.
  - `<type>`은 파일 역할을 나타내는 단수 명사여야 하며, NestJS 스타일 명명 규칙(e.g., `module`, `service`, `controller`, `provider`, `factory`, `guard`, `interceptor`, `pipe`, `decorator`, `middleware`, `filter`, `exception`, `dto`, `entity`, `repository`, `spec`)을 따라야 합니다.
- 확장 기능 이름을 기계적으로 파일명 prefix로 반복해서는 안 됩니다.
  - 동일 확장 내부에서는 역할을 직접적으로 나타내는 파일명을 사용해, 목적이 명확히 드러나야 합니다(`advisor-...`, `apply-patch-...`와 같은 일반적 prefix 지양).
  - 누구라도 파일명만 보고 확장 내 역할을 유추할 수 있어야 합니다.
- 클래스/interface/type/constant 명칭 역시 NestJS 스타일을 엄격하게 따르며 역할에 맞게 정규화해야 합니다.
  - 예를 들어, `.service.ts`로 끝나는 파일은 반드시 `PascalCaseService`를, `.provider.ts` 파일은 `PascalCaseProvider`를, `.interface.ts` 파일은 `PascalCaseInterface` 또는 명시 규약에 맞는 contract 명칭만을 export 해야 합니다.
- 네이밍 규칙은 반드시 지켜야 하며, 신규 파일/심볼뿐만 아니라 파일을 수정하거나 인접 파일을 건드릴 때에도 꼭 적용해야 합니다. 네이밍 위반을 발견하면 반드시 동시에 수정해야 합니다.
  - 네이밍 위반을 남겨둔 채 기능 추가나 변경을 진행해서는 안 됩니다.

## COMMAND

### SETUP

```bash
npm install
cp .env.example .env
```

`.env`에는 최소 하나 이상의 provider API key를 설정합니다. provider 순서는 `PROVIDER_ORDER`로 지정합니다.

### DEVELOPMENT

- `npm run start:stdio`: local MCP client용 별도 stdio application을 실행합니다.
- `npm run start:http`: HTTP application을 실행하며 `/mcp` endpoint를 사용합니다.
- `npm run start:cli -- resolve "서울역"`: direct domain CLI command를 실행합니다.
- `npm run start:dev`: HTTP application을 watch mode로 실행합니다.

### BUILD AND QUALITY

- `npm run typecheck`: TypeScript type을 검사합니다.
- `npm run build:http`, `npm run build:stdio`, `npm run build:cli`: 각 application의 production build를 생성합니다.
- `npm run start:prod`, `npm run start:prod:http`, `npm run start:prod:stdio`, `npm run start:prod:cli`: 생성된 application build를 실행합니다.
- `npm run test`: 전체 Jest test를 실행합니다.
- `npm run test:providers`: 설정된 API key가 있는 provider의 live test만 실행합니다.
- `npm run lint`: `apps/`, `libs/`, `test/`의 TypeScript에 ESLint를 실행합니다.
- `npm run format`: `apps/`와 `libs/`의 TypeScript를 Prettier로 정리합니다.

## VERIFICATION

코드 또는 runtime wiring을 변경한 경우 다음 순서로 검증합니다.

1. `npm run typecheck`로 compile-time 오류를 확인합니다.
2. 변경된 domain 또는 provider와 관련된 Jest test를 먼저 실행하고, contract 영향이 있으면 `npm run test`로 전체 test를 실행합니다.
3. production entrypoint나 module wiring을 변경했다면 `npm run build:http`, `npm run build:stdio`, `npm run build:cli`를 실행합니다.
4. transport 동작을 변경했다면 API key와 `.env`를 준비한 뒤 `npm run start:stdio` 또는 `npm run start:http`로 실행합니다. HTTP mode는 `http://localhost:8000/mcp`에 연결하여 `tools/list`와 대표 `tools/call`을 확인합니다. stateful session은 initialize 뒤 발급된 `MCP-Session-Id`를 후속 요청과 `DELETE`에 사용합니다.
5. 외부 provider 호출을 검증할 때만 `npm run test:providers`를 사용합니다. 관련 API key가 없는 provider test는 실행되지 않으므로, skip을 성공적인 live provider 검증으로 간주하지 않습니다.

검증 명령어가 실패하면 원인을 수정한 뒤 동일한 범위의 검증을 다시 실행합니다. API key, network 또는 외부 service 장애로 live 검증을 완료할 수 없는 경우 해당 조건과 실행 결과를 작업 기록에 남깁니다.

## CAUTIONS

<!--
반복해서 충돌, 마찰, fitfalls이 생기는 부분에 대한 quick pass를 이곳에 적습니다
-->

## HOUSE KEEPING

- Source/runtime ownership이 변경되면 agent는 같은 task에서 이 file을 갱신해야 한다. (MUST)
- Human-facing setup, example 또는 operator mental model이 변경되면 agent는 같은 task에서 `README.md`를 갱신해야 한다. (SHOULD)

---

## APPENDED RULES

<!-- 작업하면서 생기는 추가 규칙들을 이곳에 추가합니다 -->

- payload 형식은 TypeScript `type`으로 정의하고, method 계약은 TypeScript `interface`로 정의합니다.
- `common` library의 configuration 설정값은 `config.ts`에서 직접 참조해야 하며 service/module shim을 추가하지 않습니다.
- 공통 configuration, logger, exception, input validation은 `libs/common`과 `zido/common`이 소유하며 legacy module alias를 남기지 않습니다.
- input validation 공개 함수의 JSDoc은 검증 대상과 허용 범위, 각 `@param`, 성공 및 실패 `@returns`를 한글로 구체적으로 서술합니다.
- TypeScript toolchain은 6.0 이상을 유지하고 `ts-jest`, `ts-loader`, `typescript-eslint`의 peer 호환 범위를 함께 갱신합니다.
- 도메인 및 provider 실패는 명시적 `Exception`으로 전달하고 HTTP 경계에서는 global `ExceptionFilter`로 응답을 작성합니다.
- service의 공개 메소드는 interface contract로 선언하고, arguments와 result payload는 `type` 또는 `class`로 정의하며 dependency는 constructor로 주입합니다.
- `mcp-runtime`의 선언에는 의미 있는 multiline JSDoc 한글 주석을 작성하고, dependency는 property `@Inject` decorator가 아닌 constructor로 주입합니다.
- application source directory는 `apps/http-server`, `apps/stdio-server`, `apps/cli`로 통일합니다.

<INSTRUCTIONS project="security">
