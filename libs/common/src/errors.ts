import { HttpException, HttpStatus } from '@nestjs/common'

/**
 * MCP 요청 처리 실패를 HTTP Exception contract로 전달한다.
 */
export class McpException extends HttpException {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number = HttpStatus.INTERNAL_SERVER_ERROR,
  ) {
    super(message, statusCode)
    this.name = 'McpException'
  }
}

/**
 * 외부 provider 호출 실패에 provider 식별자를 추가한다.
 */
export class ProviderException extends McpException {
  constructor(
    message: string,
    public readonly provider: string,
    code: string = 'PROVIDER_ERROR',
  ) {
    super(message, code)
    this.name = 'ProviderException'
  }
}
