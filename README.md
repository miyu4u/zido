# Zido

Zido는 Kakao, Naver, Google 지도 API를 공통 interface로 묶어 장소 검색과 geocoding을 제공하는 MCP 및 CLI application입니다.

동일한 place domain을 두 가지 방식으로 사용할 수 있습니다.

- **MCP**: AI client에서 `place_resolve`, `place_search_nearby`, `place_geocode` tool 사용
- **CLI**: terminal에서 같은 기능을 `resolve`, `nearby`, `geocode` command로 직접 실행

## 목적

AI Agent 시스템은 지역에 대한 검색을 요청하면 해당 지역의 상호를 전수조사 하는 경향이 있습니다.

예를 들어:

사용자:

```text
강남역 인근 사진관 찾아줘. 가까운 순으로
```

라고 하는 경우, 에이전트는 다음과 같이 행동합니다.

```text
강남역 사진관 검색 > 강남역 인근 도로명 주소 전체 검색 > 사진관 검색 결과와 도로명 주소를 비교
```

또는 이렇게 작동합니다.

```text
구청 홈페이지에서 "사진 촬영 및 처리업 또는 인물 사진 및 행사용 영상 촬영업"으로 등록된 법인 전체 조회 > PDF, 또는 CSV, 엑셀 파일을 기반으로  도로명 주소를 전체 비교
```

웃긴 이야기이지만, 실제로 이러고 있는 것을 보면 웃음이 나오지 않습니다.

이 어플리케이션은 다음 프롬프트에 대한 요청들을 처리합니다.

```text
강남역 인근 사진관 중 역에서 가까운 세곳을 조사해서 알려줘
```

```text
대전에서 24시간 하는 국밥집을 조사하고 근처 200m내에 전기차 충전소가 있는 곳들만 알려줘.
```

이러면 음식점과 해당 음식점 인근의 충전소 정보까지 같이 브리핑합니다.

## 기능

| 기능 | MCP tool | CLI command |
| --- | --- | --- |
| 키워드로 단일 장소 검색 | `place_resolve` | `resolve` |
| 중심 좌표 주변 장소 검색 | `place_search_nearby` | `nearby` |
| 주소를 좌표로 변환 | `place_geocode` | `geocode` |

Zido는 `PROVIDER_ORDER`에 지정된 순서로 provider를 호출합니다. API key가 없는 provider는 제외하며, 호출이 실패하면 다음 provider로 자동 fallback합니다.

## 요구 사항

- Node.js `^24.15.0 || >=26.0.0` (Nest CLI toolchain과 Jest의 ESM 로딩 요구 범위)
- 하나 이상의 지도 API credential

## 설치

```bash
npm install
cp .env.example .env
```

## 설정

`.env`에 사용할 provider credential과 우선순위를 설정합니다.

```env
# 최소 하나는 필수
KAKAO_REST_KEY=your_kakao_rest_api_key

# 선택
NAVER_CLIENT_ID=your_naver_client_id
NAVER_CLIENT_SECRET=your_naver_client_secret
GOOGLE_API_KEY=your_google_api_key

# 앞에 있는 provider부터 시도
PROVIDER_ORDER=kakao,naver,google
```

### Provider credential

- **Kakao**: [Kakao Developers](https://developers.kakao.com/console/app)에서 application을 만들고 Local API를 활성화한 뒤 REST API key를 발급합니다.
- **Naver**: [Naver Developers](https://developers.naver.com/apps/#/register)에서 application을 등록하고 검색 API의 Client ID와 Client Secret을 발급합니다.
- **Google**: [Google Cloud Console](https://console.cloud.google.com/)에서 Places API와 Geocoding API를 활성화하고 API key를 발급합니다.

## MCP

Zido는 local client용 stdio transport와 remote client용 Streamable HTTP transport를 제공합니다.

### stdio

Claude Desktop처럼 local process를 실행하는 MCP client에서 사용합니다.

```bash
npm run start:stdio
```

Production build를 사용하는 Claude Desktop 설정 예시:

```json
{
  "mcpServers": {
    "zido": {
      "command": "node",
      "args": ["/absolute/path/to/zido/dist/apps/stdio-server/main.js"],
      "env": {
        "KAKAO_REST_KEY": "your_kakao_rest_api_key",
        "PROVIDER_ORDER": "kakao"
      }
    }
  }
}
```

먼저 stdio application을 build해야 합니다.

```bash
npm run build:stdio
```

### Streamable HTTP

MCP Inspector나 remote MCP client에서 사용합니다.

```bash
npm run start:http
```

MCP endpoint:

```text
http://localhost:8000/mcp
```

HTTP transport는 stateful session을 사용합니다. `initialize` 응답의 `MCP-Session-Id`를 이후 `tools/list`, `tools/call`, `DELETE` 요청에 전달해야 합니다. Session registry는 process-local memory에 있으므로 여러 instance로 운영할 때는 sticky session 또는 shared store가 필요합니다.

### MCP tool 호출 예시

#### `place_resolve`

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "place_resolve",
    "arguments": {
      "query": "서울역 카페"
    }
  }
}
```

#### `place_search_nearby`

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/call",
  "params": {
    "name": "place_search_nearby",
    "arguments": {
      "center": {
        "lat": 37.556,
        "lng": 126.972
      },
      "keyword": "카페",
      "radiusM": 1000
    }
  }
}
```

#### `place_geocode`

```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "tools/call",
  "params": {
    "name": "place_geocode",
    "arguments": {
      "address": "서울특별시 중구 한강대로 405"
    }
  }
}
```

## CLI

CLI는 MCP client 없이 place domain을 직접 호출합니다.

먼저 CLI application을 build합니다.

```bash
npm run build:cli
```

### 장소 검색

```bash
npm run start:cli -- resolve "서울역 카페"
```

Named option도 사용할 수 있습니다.

```bash
npm run start:cli -- resolve --query "서울역 카페"
```

### 주변 검색

```bash
npm run start:cli -- nearby \
  --lat 37.556 \
  --lng 126.972 \
  --keyword "카페" \
  --radius 1000
```

### Geocoding

```bash
npm run start:cli -- geocode "서울특별시 중구 한강대로 405"
```

### JSON 출력

`--json`을 command 앞에 지정하면 machine-readable JSON으로 출력합니다.

```bash
npm run start:cli -- --json resolve "서울역"
```

사용법과 version을 확인할 수 있습니다.

```bash
npm run start:cli -- --help
npm run start:cli -- --version
```

## Architecture

```text
MCP client
  ├─ stdio-server ─┐
  └─ http-server ──┼─ mcp-runtime ─┐
CLI ───────────────┘               ├─ place-domain ─ map-providers
                                  └─ common
```

- `apps/http-server`: Streamable HTTP MCP transport와 session lifecycle
- `apps/stdio-server`: stdio MCP transport
- `apps/cli`: direct domain CLI
- `libs/mcp-runtime`: MCP server factory와 tool registration
- `libs/place-domain`: place orchestration과 거리 계산
- `libs/map-providers`: Kakao, Naver, Google adapter와 fallback routing
- `libs/common`: configuration, logger, exception, validation

각 application의 e2e smoke test는 해당 application의 `test/` 디렉터리에 있습니다.

```text
apps/
  http-server/
    src/
    test/
  stdio-server/
    src/
    test/
  cli/
    src/
    test/
libs/
  common/
  map-providers/
  mcp-runtime/
  place-domain/
```

## Build 및 검증

```bash
npm run typecheck
npm run test
npm run build
```

Jest의 모든 test script는 `--experimental-vm-modules`로 NestJS 12의 ESM package를 로드합니다. 테스트 프로세스에서는 `--disable-warning=ExperimentalWarning`으로 ExperimentalWarning 종류 전체의 출력을 억제합니다.

Nest CLI 12에서 webpack은 deprecated 상태입니다. 기존 webpack configuration의 alias를 사용하는 build를 위해 compiler peer package를 직접 devDependency로 관리합니다.

Application별 build:

```bash
npm run build:http
npm run build:stdio
npm run build:cli
```

Production entrypoint:

```bash
node dist/apps/http-server/main.js
node dist/apps/stdio-server/main.js
node dist/apps/cli/main.js
```

## 기술 스택

- NestJS 12
- TypeScript
- `@modelcontextprotocol/sdk`
- Express
- Zod
- Pino
