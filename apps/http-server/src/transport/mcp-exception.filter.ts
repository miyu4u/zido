import { ArgumentsHost, Catch, ExceptionFilter } from '@nestjs/common'
import type { Response } from 'express'
import { McpException, ProviderException } from 'zido/common'

/**
 * MCP domain exception을 HTTP client가 읽을 수 있는 오류 body로 변환한다.
 */
@Catch(McpException)
export class McpExceptionFilter implements ExceptionFilter<McpException> {
  /**
   * response가 아직 열려 있을 때만 예외 payload를 작성한다.
   */
  catch(exception: McpException, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>()
    if (response.headersSent) return
    response.status(exception.getStatus()).json({
      statusCode: exception.getStatus(),
      code: exception.code,
      message: exception.message,
      ...(exception instanceof ProviderException ? { provider: exception.provider } : {}),
    })
  }
}
