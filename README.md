# Zido - MCP 서버 for 지도 검색

Node.js + TypeScript로 구현된 MCP (Model Context Protocol) 서버입니다. 카카오/네이버/구글 지도 API를 통합하여 장소 검색 및 지오코딩 기능을 제공합니다.

## 기능

- **place.resolve**: 키워드로 장소 검색 (단일 결과)
- **place.searchNearby**: 중심 좌표 기준 주변 장소 검색
- **geo.geocode**: 주소를 좌표로 변환 (지오코딩)

## 기술 스택

- Node.js 20+
- TypeScript (ESM)
- @modelcontextprotocol/sdk
- Express (HTTP 모드)
- Zod (입력 검증)
- Pino (로깅)

## 설치

```bash
npm install
```

## 설정

환경변수를 설정합니다:

```bash
# 서버 설정
export MCP_SERVER_NAME=zido
export MCP_SERVER_VERSION=1.0.0
export MCP_HTTP_PORT=8000

# Provider 우선순위 (쉼표로 구분)
export PROVIDER_ORDER=kakao,naver,google

# Kakao API 키
export KAKAO_REST_KEY=your_kakao_rest_api_key

# Naver API 키 (선택)
export NAVER_CLIENT_ID=your_naver_client_id
export NAVER_CLIENT_SECRET=your_naver_client_secret

# Google API 키 (선택)
export GOOGLE_API_KEY=your_google_api_key
```

또는 `.env` 파일을 생성하여 설정할 수 있습니다:

```env
MCP_SERVER_NAME=zido
MCP_SERVER_VERSION=1.0.0
MCP_HTTP_PORT=8000
PROVIDER_ORDER=kakao,naver,google
KAKAO_REST_KEY=your_kakao_rest_api_key
```

## 실행

### stdio 모드 (로컬 호스트용)

Claude Desktop 등 로컬 호스트에서 사용:

```bash
npm run dev:stdio
```

### HTTP 모드 (원격 클라이언트용)

MCP Inspector 등 원격 클라이언트에서 사용:

```bash
npm run dev:http
```

서버가 시작되면 `http://localhost:8000/mcp` 엔드포인트로 접근할 수 있습니다.

## 빌드

```bash
npm run build
```

빌드된 파일은 `dist/` 디렉토리에 생성됩니다:

```bash
# 빌드된 파일 실행
npm run start:stdio
npm run start:http
```

## 사용 예시

### place.resolve

키워드로 장소를 검색합니다:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "place.resolve",
    "arguments": {
      "query": "가산동 주민센터"
    }
  }
}
```

### place.searchNearby

중심 좌표 기준 주변 장소를 검색합니다:

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/call",
  "params": {
    "name": "place.searchNearby",
    "arguments": {
      "center": {
        "lat": 37.4785,
        "lng": 126.8886
      },
      "keyword": "사진관",
      "radiusM": 1000
    }
  }
}
```

### geo.geocode

주소를 좌표로 변환합니다:

```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "tools/call",
  "params": {
    "name": "geo.geocode",
    "arguments": {
      "address": "서울특별시 금천구 가산동"
    }
  }
}
```

## 프로젝트 구조

```
src/
├── app/              # 실행 진입점
│   ├── stdio.ts     # stdio 모드
│   └── http.ts      # HTTP 모드
├── core/            # MCP 서버 코어
│   ├── create-mcp-server.ts
│   └── register-tools.ts
├── providers/       # 지도 API 프로바이더
│   ├── provider-types.ts
│   ├── provider-router.ts
│   ├── mock-provider.ts
│   ├── kakao-provider.ts
│   ├── naver-provider.ts
│   └── google-provider.ts
├── tools/           # MCP 도구
│   ├── place-resolve.ts
│   ├── place-search-nearby.ts
│   ├── geo-geocode.ts
│   └── utils/
│       └── haversine.ts
├── transports/      # 전송 계층
│   ├── stdio.ts
│   └── streamable-http.ts
└── infra/           # 인프라
    ├── config.ts
    ├── logger.ts
    └── errors.ts
```

## Provider 우선순위

`PROVIDER_ORDER` 환경변수로 Provider 우선순위를 설정할 수 있습니다. 첫 번째 성공 응답을 반환하며, 모든 Provider가 실패하면 에러를 발생시킵니다.

예: `PROVIDER_ORDER=kakao,naver,google` → Kakao → Naver → Google 순서로 시도

## 라이선스

ISC
