import { Injectable, NestMiddleware } from '@nestjs/common'
import type { FastifyRequest } from 'fastify'
import { runWithTraceContext, startTraceContext } from '@distributed-social-platform/shared-kernel'

// Opens the trace-context ALS for the WHOLE request — same reasoning as
// core-api's TraceContextMiddleware (interceptor's Observable subscribe runs
// outside the ALS scope, middleware's synchronous next() call doesn't).
// Reuses the traceId of an inbound `traceparent` header (e.g. core-api
// forwarding a request, or a directly-hit search endpoint) or starts a new
// trace otherwise; mints a fresh spanId for this service's own handling.
@Injectable()
export class TraceContextMiddleware implements NestMiddleware {
  use(req: FastifyRequest, _res: unknown, next: () => void): void {
    const header = req.headers['traceparent']
    const inbound = Array.isArray(header) ? header[0] : header
    runWithTraceContext(startTraceContext(inbound), () => next())
  }
}
