/**
 * 커스텀 에러 클래스
 */
export class McpError extends Error {
    constructor(
        message: string,
        public code: string,
        public statusCode?: number,
    ) {
        super(message)
        this.name = 'McpError'
    }
}

export class ProviderError extends McpError {
    constructor(
        message: string,
        public provider: string,
        code: string = 'PROVIDER_ERROR',
    ) {
        super(message, code)
        this.name = 'ProviderError'
    }
}
