import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common'
import { Logger } from 'nestjs-pino'
import { LogContext } from '@distributed-social-platform/shared-kernel'
import { FastifyRequest, FastifyReply } from 'fastify'
import { finalize } from 'rxjs/operators'

@Injectable()
export class HttpLoggingInterceptor implements NestInterceptor {
  constructor(private readonly logger: Logger) {}

  intercept(context: ExecutionContext, next: CallHandler) {
    const http = context.switchToHttp()
    const req = http.getRequest<FastifyRequest>()
    const res = http.getResponse<FastifyReply>()

    if (req.url === '/health' || req.url === '/metrics') {
      return next.handle()
    }

    const start = process.hrtime.bigint()

    return next.handle().pipe(
      finalize(() => {
        const durationMs = Number(process.hrtime.bigint() - start) / 1_000_000

        const payload = {
          context: LogContext.HTTP,
          requestId: req.id,
          method: req.method,
          route: req.routeOptions?.url,
          url: req.url,
          statusCode: res.statusCode,
          durationMs: Number(durationMs.toFixed(2)),
          ip: req.ip,
          userAgent: req.headers['user-agent'],
        }

        if (res.statusCode >= 500) {
          this.logger.error(payload, 'HTTP request failed')
          return
        }

        if (res.statusCode >= 400) {
          this.logger.warn(payload, 'HTTP request client error')
          return
        }

        this.logger.log(payload, 'HTTP request success')
      }),
    )
  }
}
