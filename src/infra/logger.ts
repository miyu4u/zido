import pino from 'pino'

/**
 * Pino 로거 인스턴스
 * stdio 모드에서는 stdout이 JSON-RPC 통신에 사용되므로,
 * 로그는 stderr로 출력하도록 설정합니다.
 */
export const logger = pino({
    enabled: false,
})
