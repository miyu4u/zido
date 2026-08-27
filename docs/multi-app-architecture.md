# Zido Multi-App Architecture

## 문서 상태

이 문서는 현재 구현된 multi-app workspace의 구조와 제한 사항을 정리합니다.

- `http-server`: Streamable HTTP MCP server
- `stdio-server`: stdio MCP server
- `cli`: 직접 domain을 호출하는 CLI

세 application은 다음과 같습니다.

## 1. 설계 목표

### 목표

- HTTP, stdio, CLI의 process lifecycle을 독립적으로 관리합니다.
- MCP server와 tool contract를 HTTP·stdio application 사이에서 공유합니다.
- CLI가 MCP server lifecycle에 의존하지 않도록 합니다.
- HTTP session, CORS, 인증, rate limit을 HTTP application boundary에 둡니다.
- domain과 provider logic을 application별로 복사하지 않습니다.
- application 간 import를 금지하고 `apps -> libs` 의존성 방향을 유지합니다.

### 비목표

- MCP tool을 application마다 다시 등록하지 않습니다.
- HTTP controller를 stdio 또는 CLI에서 재사용하지 않습니다.
- CLI를 MCP client로 만들지 않습니다. MCP client CLI가 필요하면 별도 mode 또는 별도 application contract로 정의합니다.
- `mcp-runtime`을 당장 모든 domain에서 사용하는 generic framework로 확장하지 않습니다.

## 2. 현재 구조

현재 workspace는 세 개의 application으로 구성됩니다.

```text
apps/http-server/src/main.ts
apps/stdio-server/src/main.ts
apps/cli/src/main.ts
```

MCP server와 tool은 library에 있습니다.

```text
libs/mcp-runtime
  ├── McpServerFactory
  └── McpToolRegistrarService
        └── PlaceService
              └── ProviderRouterService
```

현재 관찰되는 책임은 다음과 같습니다.

| 영역 | 현재 책임 |
| --- | --- |
| `apps/http-server` | Nest bootstrap, HTTP controller, HTTP middleware |
| `apps/stdio-server` | Nest bootstrap, stdio transport |
| `apps/cli` | direct domain CLI |
| `libs/mcp-runtime` | `McpServer` 생성, capability 선언, tool 등록 |
| `libs/place-domain` | 장소 검색, geocoding, 거리 계산, domain orchestration |
| `libs/map-providers` | provider adapter와 fallback routing |
| `libs/charger-domain` | 충전소 검색, snapshot cache-aside, freshness/effective status |
| `libs/charger-providers` | KECO read-only HTTPS/XML adapter와 resultCode 분류 |
| `libs/charger-storage` | 단일 노드 SQLite snapshot schema와 transactional upsert |
| `libs/common` | 환경변수, validation, logger, exception |

`McpRuntimeModule`은 `PlaceDomainModule`과 `ChargerDomainModule`을 직접 import합니다. 따라서 `mcp-runtime`은 transport와는 분리되어 있지만 현재 Zido의 장소·충전 domain을 공통 MCP surface로 구성하는 application-oriented runtime입니다.

## 3. 현재 project structure

```text
apps/
├── http-server/
│   └── src/
│       ├── main.ts
│       ├── app.module.ts
│       └── transport/
│           ├── streamable-http.controller.ts
│           ├── streamable-http-session.registry.ts
│           └── mcp-exception.filter.ts
├── stdio-server/
│   └── src/
│       ├── main.ts
│       └── app.module.ts
└── cli/
    ├── src/
        ├── main.ts
        ├── app.module.ts
        └── commands/
            ├── resolve.command.ts
            ├── nearby.command.ts
            └── geocode.command.ts
    └── tsconfig.app.json

libs/
├── common/
├── map-providers/
├── place-domain/
├── charger-domain/
├── charger-providers/
├── charger-storage/
└── mcp-runtime/
```

의존성 방향은 다음과 같습니다.

```text
http-server ───┐
                     ├── mcp-runtime ── place-domain ── map-providers
stdio-server ──┘

cli ─────────────── place-domain ── map-providers

http-server ─────── charging REST ── charger-domain ──┬─ charger-storage (SQLite)
                                                       └─ charger-providers (KECO)
mcp-runtime ─────── charger_* tools ── charger-domain
```

다음 의존성은 금지합니다.

- application에서 다른 application import
- library에서 application import
- CLI에서 HTTP controller import
- stdio application에서 Express 또는 HTTP transport import
- `mcp-runtime`에서 `process.argv`, `app.listen`, HTTP `Request` 또는 `Response` 사용
- `charger-providers`에서 `map-providers` 또는 `place-domain` private 구현 import
- 충전 provider가 ServiceKey를 cache key, metric tag, log/error payload에 기록

## 4. Library ownership

### `mcp-runtime`

`mcp-runtime`은 MCP data layer와 tool composition을 담당합니다.

소유 항목:

- `McpRuntimeModule`
- `McpServerFactory`
- `McpToolRegistrarService`
- MCP server capability
- `place_resolve`, `place_search_nearby`, `place_geocode` schema
- MCP tool handler
- MCP `content` response envelope

`McpServerFactory`는 transport를 생성하지 않습니다.

```text
McpServerFactory.create()
  └── McpServer 생성
  └── tool 등록
  └── McpServer 반환
```

transport 연결은 호출 application이 담당합니다.

```text
const server = await factory.create()
await server.connect(transport)
```

### `place-domain`

`PlaceService`는 MCP가 아닌 domain contract를 제공합니다.

- 장소 resolve
- 주변 장소 검색
- geocoding
- 거리 계산
- 중복 제거
- provider 결과 orchestration

### `charger-domain`, `charger-providers`, `charger-storage`

충전 기능은 지도 `Provider` 계약과 분리된 세 경계로 소유합니다.

- `charger-domain`: 지역/반경 query key, cache-aside single-flight, `FRESH`/`STALE`/`UNKNOWN`,
  effective status, stale fallback, HTTP/MCP 공통 결과
- `charger-providers`: KECO `getChargerInfo`/`getChargerStatus` 요청, XML pagination,
  v1.25 필드 검증과 resultCode 오류 분류. ServiceKey는 호출 직전에만 사용합니다.
- `charger-storage`: Node 22 `node:sqlite` 기반 local file snapshot. station info와 charger
  status upsert를 분리하고 `(source, operatorId, stationId, chargerId)`를 상태 키로 사용합니다.

이 MVP는 cache-aside 요청 수집만 지원하며 scheduler, collector worker, 다중 replica용 shared
SQLite는 지원하지 않습니다. 운영 설정은 `CHARGER_SQLITE_PATH`, `CHARGER_CACHE_TTL_MS`,
`KECO_API_TIMEOUT`, `CHARGER_PROVIDER_MAX_RETRIES`, `KECO_API_KEY`로 주입합니다.

MCP tool과 CLI command는 이 service를 각자의 boundary에 맞게 호출합니다.

### `common`

공통 configuration과 boundary별 configuration을 구분합니다.

공통 configuration:

- server name과 version
- provider API key
- provider order
- logger
- 공통 input validation

HTTP 전용 configuration:

- HTTP port
- allowed origins
- authentication
- rate limit
- session TTL

CLI 전용 configuration:

- output format
- color 출력 여부
- command defaults

Transport를 environment variable로 선택하는 `config.transport`는 세 application으로 분리한 뒤 제거하는 것을 권장합니다. 실행할 application 자체가 transport를 결정해야 합니다.

## 5. `http-server`

### 책임

`http-server`는 Streamable HTTP와 HTTP 운영 설정을 소유합니다.

- Nest HTTP application 생성
- `StreamableHTTPServerTransport`
- `/mcp` `GET`, `POST`, `DELETE`
- HTTP exception filter
- `helmet`
- `cors`
- rate limit
- body parser
- authentication
- Origin validation
- HTTP port listen

### Module

```ts
@Module({
    imports: [McpRuntimeModule],
    controllers: [StreamableHttpController],
})
export class HttpServerModule {}
```

`McpRuntimeModule`이 `PlaceDomainModule`을 import하므로, HTTP module은 `PlaceDomainModule`을 중복 import하지 않습니다.

### `main.ts`

HTTP application의 entrypoint는 하나의 lifecycle만 시작합니다.

```text
http-server/src/main.ts
  ├── NestFactory.create(HttpServerModule)
  ├── HTTP middleware
  ├── global exception filter
  └── app.listen()
```

HTTP application에는 다음을 import하지 않습니다.

- `StdioServerTransport`
- `createApplicationContext`
- stdio 전용 logger 설정
- CLI command

## 6. Streamable HTTP session 설계

현재 `McpHttpTransportController`는 module 초기화 시 하나의 `StreamableHTTPServerTransport`를 생성합니다. 이 구조는 단일 client prototype에는 사용할 수 있지만, 여러 MCP client와 session을 지원하는 stateful HTTP server로는 부족합니다.

stateful mode에서는 client별로 별도의 MCP server connection과 transport를 관리해야 합니다.

```text
StreamableHttpController
  └── StreamableHttpSessionRegistry
        ├── sessionId -> transport
        ├── sessionId -> MCP server connection
        └── close / expire policy
```

### Session model

```ts
type McpSession = {
    transport: StreamableHTTPServerTransport
    server: McpServer
    createdAt: number
    lastAccessedAt: number
}
```

registry의 책임은 다음과 같습니다.

- initialize request를 위한 session 생성
- `MCP-Session-Id`로 transport 조회
- 존재하지 않는 session에 대한 404 처리
- `DELETE` 요청에 대한 session 종료
- transport `onclose` 시 registry 정리
- idle session expiration

### POST 흐름

```text
POST /mcp
  ├── MCP-Session-Id 없음
  │     ├── initialize request 확인
  │     ├── McpServerFactory.create()
  │     ├── 새 StreamableHTTPServerTransport 생성
  │     ├── server.connect(transport)
  │     └── sessionId와 transport를 registry에 저장
  │
  └── MCP-Session-Id 있음
        ├── registry lookup
        ├── 없으면 404
        └── transport.handleRequest()
```

### GET 흐름

```text
GET /mcp
  ├── MCP-Session-Id 조회
  ├── registry에서 transport 조회
  └── transport.handleRequest()
```

### DELETE 흐름

```text
DELETE /mcp
  ├── MCP-Session-Id 조회
  ├── transport.close()
  └── registry.delete(sessionId)
```

### Stateless mode

장소 검색처럼 request/response만 필요하고 session 상태가 필요하지 않다면 stateless mode를 선택할 수 있습니다.

```ts
const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
})
```

stateless transport는 request마다 새로 생성해야 합니다. 같은 transport를 여러 request에 재사용하지 않습니다.

```text
POST /mcp
  ├── 새 McpServer 생성
  ├── 새 StreamableHTTPServerTransport 생성
  ├── server.connect(transport)
  ├── transport.handleRequest()
  └── request 종료 후 정리
```

stateless mode에서는 다음을 명시합니다.

- session ID를 발급하지 않음
- session registry를 사용하지 않음
- `DELETE`는 `405 Method Not Allowed`로 처리하거나 지원하지 않음
- tool 실행이 request 외부 상태에 의존하지 않음
- long-lived SSE와 server-initiated request를 사용하지 않음

stateful과 stateless 중 하나를 선택해야 하며, singleton transport를 유지한 채 두 mode를 혼합하지 않습니다.

### Zido의 현재 HTTP 정책

Zido의 HTTP server는 **stateful mode와 process-local in-memory registry**를 사용합니다.

- session은 client별 `MCP-Session-Id`로 조회합니다.
- `DELETE /mcp`는 session 종료와 registry 정리를 수행합니다.
- idle session은 lazy expiry로 정리합니다.
- registry는 process-local이므로 수평 확장 환경에서는 공유 session store 또는 sticky session이 필요합니다.
- registry는 MCP transport/session 상태만 보관하며 provider 또는 장소 domain 상태는 보관하지 않습니다.

다음 조건이 생기면 정책을 다시 결정합니다.

- HTTP server를 여러 replica로 확장할 때: external session store 또는 sticky session을 도입합니다.
- session과 server-initiated SSE가 필요 없을 때: stateless mode로 전환합니다.
- 장시간 연결과 resumability가 필요할 때: stateful registry와 event store를 함께 검토합니다.

### Multi-replica 배포

stateful session을 여러 process 또는 replica에서 운영하면 in-memory `Map`만으로는 충분하지 않습니다.

선택지는 다음과 같습니다.

- sticky session
- Redis 등의 외부 session registry
- stateless transport
- session 상태를 공유 storage로 분리

단일 process 단계에서는 in-memory registry를 사용할 수 있지만, 수평 확장을 지원하는 storage로 간주해서는 안 됩니다.

## 7. CORS와 HTTP header

Streamable HTTP client가 session을 유지하려면 request와 response 양쪽 header를 설정해야 합니다.

```ts
cors({
    origin: config.http.allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
        'Content-Type',
        'Authorization',
        'MCP-Session-Id',
        'MCP-Protocol-Version',
        'Last-Event-ID',
    ],
    exposedHeaders: [
        'MCP-Session-Id',
        'MCP-Protocol-Version',
    ],
})
```

구분은 다음과 같습니다.

- `allowedHeaders`: browser client가 request에 보낼 수 있는 header
- `exposedHeaders`: browser client가 response에서 읽을 수 있는 header

현재 `allowedHeaders`가 `Content-Type`, `Authorization`만 포함하면 browser client의 후속 `MCP-Session-Id` request가 preflight에서 거부될 수 있습니다. 따라서 stateful HTTP를 지원할 때는 `MCP-Session-Id`를 `allowedHeaders`와 `exposedHeaders`에 모두 포함합니다.

`MCP-Protocol-Version`은 HTTP client가 protocol version을 전달하는 데 사용합니다. resumable stream을 사용할 경우 `Last-Event-ID`도 request header 허용 목록에 포함합니다.

Origin validation은 CORS 설정만으로 대체하지 않습니다. Streamable HTTP controller 또는 security middleware에서 허용 Origin을 명시적으로 검증해야 합니다.

## 8. `stdio-server`

### 책임

stdio application은 local MCP client가 실행하는 하나의 MCP server process입니다.

```text
stdio-server/src/main.ts
  ├── NestFactory.createApplicationContext()
  ├── context.get(McpServerFactory)
  ├── factory.create()
  └── server.connect(new StdioServerTransport())
```

### Module

```ts
@Module({
    imports: [McpRuntimeModule],
})
export class StdioServerModule {}
```

### 제약

- stdout에는 MCP JSON-RPC 이외의 값을 출력하지 않습니다.
- 일반 log는 stderr 경로를 사용합니다.
- Nest 기본 logger가 stdout을 오염시키지 않도록 합니다.
- Express와 HTTP middleware를 import하지 않습니다.
- HTTP session registry를 사용하지 않습니다.
- HTTP exception filter를 import하지 않습니다.

stdio application은 `McpServerFactory`와 `StdioServerTransport`를 한 번 연결하고 process lifecycle을 유지합니다.

## 9. `cli`

### 선택: direct domain CLI

이번 설계에서는 MCP server를 거치지 않고 `PlaceService`를 직접 호출하는 direct domain CLI를 선택합니다.

```text
cli
  └── PlaceDomainModule
        └── PlaceService
              └── ProviderRouterService
```

CLI는 `McpRuntimeModule`을 import하지 않습니다.

예시 command:

```bash
zido resolve "서울역"
zido nearby --lat 37.55 --lng 126.97 --keyword 카페 --radius 1000
zido geocode "서울특별시 중구 세종대로 110"
```

CLI가 소유하는 항목:

- command parsing
- option validation
- domain input 변환
- human-readable output
- JSON output
- `--help`, `--version`
- exit code

CLI가 소유하지 않는 항목:

- JSON-RPC request/response
- MCP `content` response envelope
- `McpServer`
- `StdioServerTransport`
- HTTP controller
- MCP session

### CLI output과 exit code

```text
0: 성공
1: provider, configuration, runtime 오류
2: command 또는 argument 오류
```

`--json` 옵션을 제공할 경우 human output과 JSON output을 명시적으로 구분합니다.

### MCP client CLI가 필요한 경우

현재 설계에서는 MCP client CLI를 선택하지 않습니다. CLI가 MCP server를 검증하거나 외부 MCP server를 호출해야 하는 요구가 생기면 direct domain CLI와 다른 application contract로 별도 정의합니다.

```text
cli
  └── MCP client adapter
        ├── StdioClientTransport
        └── StreamableHTTPClientTransport
```

이 mode에서는 CLI가 다음을 import하지 않습니다.

- `PlaceDomainModule`
- `MapProvidersModule`
- provider API key configuration

직접 domain CLI와 MCP client CLI를 한 command 경로에 암묵적으로 섞지 않습니다.

## 10. Nest project와 npm script

`nest-cli.json`에는 세 application을 등록합니다.

```json
{
  "projects": {
    "http-server": {
      "type": "application",
      "root": "apps/http-server",
      "entryFile": "main",
      "sourceRoot": "apps/http-server/src",
      "compilerOptions": {
        "tsConfigPath": "apps/http-server/tsconfig.app.json"
      }
    },
    "stdio-server": {
      "type": "application",
      "root": "apps/stdio-server",
      "entryFile": "main",
      "sourceRoot": "apps/stdio-server/src",
      "compilerOptions": {
        "tsConfigPath": "apps/stdio-server/tsconfig.app.json"
      }
    },
    "cli": {
      "type": "application",
      "root": "apps/cli",
      "entryFile": "main",
      "sourceRoot": "apps/cli",
      "compilerOptions": {
        "tsConfigPath": "apps/cli/tsconfig.app.json"
      }
    }
  }
}
```

애플리케이션별 실행 예시는 다음과 같습니다.

```bash
node dist/apps/http-server/main.js
node dist/apps/stdio-server/main.js
node dist/apps/cli/main.js
```

### 11. 구현 제약

### HTTP session policy

HTTP app은 stateful Streamable HTTP를 사용합니다.

- client별 `MCP-Session-Id`로 transport를 조회합니다.
- initialize 이후 요청은 같은 session을 재사용해야 합니다.
- 여러 client를 동시에 지원하려면 session registry와 expiry 정책이 필요합니다.
- singleton transport만으로는 multi-client HTTP server를 안정적으로 운영할 수 없습니다.

### CLI boundary

CLI는 MCP client가 아니라 direct domain caller입니다.

- `PlaceDomainModule`을 직접 호출합니다.
- command parser로 input을 변환합니다.
- output serializer로 결과를 출력합니다.
- MCP transport lifecycle에 의존하지 않습니다.

## 12. Verification

### 공통

공통 검증은 타입체크, 테스트, 그리고 각 application의 빌드를 수행합니다.

### Streamable HTTP

- HTTP server가 시작됩니다.
- `/mcp` endpoint가 응답합니다.
- `initialize`가 성공합니다.
- `tools/list`가 세 tool을 반환합니다.
- 대표 `tools/call`이 성공합니다.
- 잘못된 또는 만료된 session ID가 404로 처리됩니다.
- `DELETE`가 session을 종료합니다.
- browser client의 preflight가 `MCP-Session-Id`를 허용합니다.
- response에서 browser client가 `MCP-Session-Id`를 읽을 수 있습니다.

### stdio

- server process가 시작됩니다.
- `initialize`가 성공합니다.
- `tools/list`가 동일한 tool contract를 반환합니다.
- 대표 `tools/call`이 성공합니다.
- stdout에 MCP JSON-RPC 외의 로그가 없습니다.

### Direct CLI

- `--help`가 동작합니다.
- 잘못된 command가 exit code `2`를 반환합니다.
- `resolve`, `nearby`, `geocode`가 domain service를 호출합니다.
- human output과 `--json` output이 각각 정의된 형식으로 반환됩니다.
- provider/runtime 오류가 exit code `1`로 반환됩니다.

### Contract consistency

HTTP와 stdio application이 각각 tool을 등록하지 않았는지 확인합니다. 두 transport의 `tools/list` 결과는 `mcp-runtime`의 동일한 registration에서 나와야 합니다.

## 13. 설계 결정 요약

| 구분 | 소유 application/library |
| --- | --- |
| MCP server 생성 | `mcp-runtime` |
| MCP tool schema와 handler | `mcp-runtime` |
| 장소 검색 domain | `place-domain` |
| provider fallback | `map-providers` |
| Streamable HTTP | `http-server` |
| HTTP session registry | `http-server` |
| HTTP CORS와 security | `http-server` |
| stdio 연결 | `stdio-server` |
| direct CLI command | `cli` |
| 공통 configuration | `common` |

핵심 원칙은 다음과 같습니다.

> `http-server`와 `stdio-server`는 동일한 `mcp-runtime`을 서로 다른 transport로 연결하고, `cli`는 MCP response envelope가 아닌 domain 결과를 CLI contract로 표현합니다.

## 참고 자료

- [MCP Architecture Overview](https://modelcontextprotocol.io/docs/learn/architecture)
- [MCP Transport Specification](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports.md)
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
