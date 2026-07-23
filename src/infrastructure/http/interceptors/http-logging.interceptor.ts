import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common'
import { Logger } from 'nestjs-pino'
import { LogContext } from '@distributed-social-platform/shared-kernel'
import { FastifyRequest, FastifyReply } from 'fastify'

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

    // Listen on the raw Node response's 'finish' event, NOT RxJS `finalize()`
    // on next.handle() — verified with a real NestJS+Fastify app (2026-07-25)
    // that `finalize()` fires WHILE the exception is still propagating out of
    // the interceptor chain, BEFORE GlobalExceptionFilter has called
    // `reply.status(...)`. That means `res.statusCode` read inside `finalize()`
    // is always the Fastify default (200) for every thrown exception — this
    // interceptor was logging every 404/500 as a fake 200 "success", the
    // entire point of this gateway silently broken since it was written.
    // 'finish' fires only after the response is actually sent to the client
    // (same guarantee Fastify's own `onResponse` hook and pino-http's built-in
    // autoLogging rely on — auth-service's httpLoggingHook, registered via
    // `fastify.addHook('onResponse', ...)`, was never affected by this).
    res.raw.once('finish', () => {
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
    })

    return next.handle()
  }
}
