# Zido - MCP 서버 for 지도 검색

Zido는 Nest CLI workspace로 구현된 MCP(Model Context Protocol) 서버입니다. 카카오/네이버/구글 지도 API를 하나의 인터페이스로 묶어 장소 검색과 지오코딩을 일관된 방식으로 제공합니다.

## 핵심 기능

- place_resolve: 키워드로 장소 검색 (단일 결과)
- place_search_nearby: 중심 좌표 기준 주변 장소 검색
- place_geocode 주소를 좌표로 변환 (지오코딩)

## 주요 특징

- Multi-provider 통합: Kakao/Naver/Google API를 동일 인터페이스로 통합
- `PROVIDER_ORDER` 순서대로 자동 재시도
- `tools/list`, `tools/call` 흐름 지원

## 기술 스택

- Node.js 20+
- NestJS 11
- TypeScript (ESM)
- @modelcontextprotocol/sdk
- Express (HTTP 모드)
- Zod (입력 검증)
- Pino (로깅)

## 아키텍처 요약

Zido는 현재 세 개의 application으로 구현되어 있습니다.

- `apps/http-server` — Streamable HTTP MCP server
- `apps/stdio-server` — stdio MCP server
- `apps/cli` — domain을 직접 호출하는 CLI

### Provider

각 지도 API는 `Provider` 인터페이스를 구현하며, `ProviderRouterService`가 설정된 우선순위에 따라 provider를 초기화합니다.

### Fallback

각 요청은 첫 번째 성공 응답을 반환하며, 실패 시 다음 provider로 자동 전환합니다. 모든 provider가 실패하면 원인을 합친 에러 메시지를 반환합니다.

### 전송 계층 분리

HTTP, stdio, CLI는 서로 다른 application으로 분리되어 있습니다. 각 application은 독립 entrypoint와 실행 경로를 가집니다.

```bash
npm run start:http   # HTTP server
npm run start:stdio  # stdio server
node dist/apps/cli/main.js  # CLI
```

Streamable HTTP는 세션 기반의 stateful mode를 사용합니다. session은 process-local in-memory registry로 관리되므로, 수평 확장 환경에서는 shared store나 sticky session이 필요합니다. 현재 구현과 제한 사항은 [Multi-App Architecture](docs/multi-app-architecture.md)를 참고합니다.

## 프로젝트 구조

```
apps/http-server/
  src/          # Streamable HTTP MCP server
apps/stdio-server/
  src/          # stdio MCP server
apps/cli/
  src/main.ts   # domain 직접 호출 CLI entrypoint
  src/commands/
  src/app.module.ts
  tsconfig.app.json
libs/
  common/         # 환경변수, logger, error, validation
  map-providers/  # Kakao/Naver/Google provider와 fallback
  place-domain/   # 장소 orchestration과 거리 계산
  mcp-runtime/    # MCP server factory와 tool registrar
```

## 설치

```bash
npm install
```

## 설정

### 1. API 키 발급

최소 하나 이상의 Provider API 키가 필요합니다:

#### Kakao Local API (권장)

1. [Kakao Developers 콘솔](https://developers.kakao.com/console/app)에 접속하여 카카오 계정으로 로그인합니다.
2. '내 애플리케이션' 메뉴에서 '애플리케이션 추가하기'를 클릭합니다.
3. 앱 이름, 사업자명 등을 입력하고 저장합니다.
4. 생성된 앱의 '앱 키' 섹션에서 **REST API 키**를 복사합니다.
5. 제품 설정 - 카카오맵 에서 사용을 설정합니다

#### Naver Local API (선택)

1. [네이버 개발자 센터](https://developers.naver.com/apps/#/register)에 접속하여 네이버 계정으로 로그인합니다.
2. 상단 메뉴에서 '애플리케이션 등록'을 클릭합니다.
3. 애플리케이션 정보를 입력합니다:
   - 애플리케이션 이름: 원하는 이름 입력
   - 사용 API: '검색' API 선택
   - 서비스 환경: 웹 서비스 URL 또는 로컬 개발 환경 설정
4. '등록하기' 버튼을 클릭하여 애플리케이션을 생성합니다.
5. 생성된 애플리케이션의 상세 정보 페이지에서 다음 정보를 확인합니다:
   - **Client ID**: 클라이언트 ID 복사
   - **Client Secret**: 클라이언트 시크릿 복사
6. 'API 권한 관리' 섹션에서 '검색' API 권한이 활성화되어 있는지 확인합니다.

#### Google Maps API (선택)

1. [Google Cloud Console](https://console.cloud.google.com/)에 접속하여 Google 계정으로 로그인합니다.
2. 프로젝트 생성 또는 선택:
   - 왼쪽 상단의 드롭다운 메뉴에서 '프로젝트 선택'을 클릭합니다.
   - '새 프로젝트'를 선택하여 프로젝트를 생성하거나, 기존 프로젝트를 선택합니다.
3. 필요한 API 활성화:
   - 왼쪽 메뉴에서 'API 및 서비스' > '라이브러리'를 선택합니다.
   - 다음 API를 검색하여 각각 '사용 설정'을 클릭합니다:
     - Maps JavaScript API: 지도 표시용
     - Geocoding API: 주소-좌표 변환용
     - Places API: 장소 검색용
4. API 키 생성:
   - 왼쪽 메뉴에서 'API 및 서비스' > '자격 증명'을 선택합니다.
   - '자격 증명 만들기'를 클릭한 후, 'API 키'를 선택합니다.

### 2. 환경변수 설정

`.env.example` 파일을 복사하여 `.env` 파일을 생성합니다:

```bash
cp .env.example .env
```

`.env` 파일을 열어 API 키를 설정합니다:

```env
# 필수: 최소 하나 이상의 Provider API 키 설정
KAKAO_REST_KEY=your_kakao_rest_api_key_here

# 선택: 추가 Provider
NAVER_CLIENT_ID=your_naver_client_id_here
NAVER_CLIENT_SECRET=your_naver_client_secret_here

# 선택: Google Maps API
GOOGLE_API_KEY=your_google_api_key_here

# Provider 우선순위 (쉼표로 구분)
PROVIDER_ORDER=kakao,naver,google
```

## 실행

### stdio 모드 (로컬 호스트용)

Claude Desktop 등 로컬 호스트에서 사용:

```bash
npm run start:stdio
```

### HTTP 모드 (원격 클라이언트용)

MCP Inspector 등 원격 클라이언트에서 사용:

```bash
npm run start:http
```

서버가 시작되면 `http://localhost:8000/mcp` 엔드포인트로 접근할 수 있습니다.

stateful Streamable HTTP에서는 클라이언트별 session이 유지되므로, `MCP-Session-Id`가 없는 요청은 initialize로 처리되고 이후 요청은 같은 session을 재사용해야 합니다. 여러 client를 동시에 지원하려면 session registry와 expiry 정책이 필요합니다.

### CLI 모드

장소 검색과 지오코딩을 직접 실행할 때 사용합니다:

```bash
node dist/apps/cli/main.js
```

## 빌드

```bash
npm run build
```

빌드된 파일은 각 application별 디렉토리에 생성됩니다:

```bash
node dist/apps/http-server/main.js
node dist/apps/stdio-server/main.js
node dist/apps/cli/main.js
```

## 데모 시나리오

MCP Inspector 또는 Claude Desktop에서 `tools/list`로 도구 목록을 확인한 뒤, `place_resolve`로 특정 장소를 검색해 결과를 확인합니다. API 키가 누락된 provider는 건너뛰고, 설정된 우선순위대로 자동 fallback 됩니다.

### Claude Desktop 의 경우

`설정 > 개발자 > 구성 편집` 으로 들어가서 `claude_desktop_config.json`을 변경합니다.

예시:
```json
{
  "mcpServers": {
    "zido": {
      "command": "node",
      "args": [
        "$WORKSPACE/dist/apps/stdio-server/main.js"
      ],
      "env": {
        "KAKAO_REST_KEY": ""
      }
    }
  }
}
```


## 사용 예시

### place_resolve

키워드로 장소를 검색합니다:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "place_resolve",
    "arguments": {
      "query": "서울역, 카페"
    }
  }
}
```

응답 데이터 예시:

```json
{
  "name": "서울역, 카페",
  "address": "서울특별시 중구 한강대로 ...",
  "lat": 37.5532,
  "lng": 126.9726,
  "provider": "kakao",
  "raw": {}
}
```

### place_search_nearby

중심 좌표 기준 주변 장소를 검색합니다:

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/call",
  "params": {
    "name": "place_search_nearby",
    "arguments": {
      "center": {
        "lat": 37.4785,
        "lng": 126.8886
      },
      "keyword": "카페",
      "radiusM": 1000
    }
  }
}
```

응답 데이터 예시:

```json
{
  "items": [
    {
      "name": "서울역 인근 카페",
      "address": "서울특별시 중구 한강대로 ...",
      "roadAddress": "서울특별시 중구 한강대로 ...",
      "lat": 37.5532,
      "lng": 126.9726,
      "provider": "kakao",
      "distanceM": 310,
      "raw": {}
    }
  ]
}
```

### place_geocode

주소를 좌표로 변환합니다:

```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "tools/call",
  "params": {
    "name": "place_geocode",
    "arguments": {
      "address": "서울특별시 중구 한강대로"
    }
  }
}
```

응답 데이터 예시:

```json
{
  "lat": 37.5532,
  "lng": 126.9726,
  "provider": "naver",
  "raw": {}
}
```
