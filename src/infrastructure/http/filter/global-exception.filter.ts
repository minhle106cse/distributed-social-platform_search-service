import { ArgumentsHost, Catch, ExceptionFilter, HttpException } from '@nestjs/common'
import { FastifyReply, FastifyRequest } from 'fastify'
import type { ErrorDetails } from '@distributed-social-platform/shared-kernel'
import {
  ApplicationError,
  buildErrorBody,
  httpStatusToCode,
  LogContext,
} from '@distributed-social-platform/shared-kernel'

interface HttpExceptionResponse {
  message?: string | string[]
  errors?: unknown
  code?: string
}

function isHttpExceptionResponse(value: unknown): value is HttpExceptionResponse {
  return typeof value === 'object' && value !== null
}

function isErrorDetails(value: unknown): value is ErrorDetails {
  if (value === undefined) return true
  if (Array.isArray(value)) return true
  return typeof value === 'object' && value !== null
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp()
    const reply = ctx.getResponse<FastifyReply>()
    const req = ctx.getRequest<FastifyRequest>()

    let status = 500
    let code = 'INTERNAL_SERVER_ERROR'
    let message = 'Internal server error'
    let details: ErrorDetails

    if (exception instanceof HttpException) {
      status = exception.getStatus()
      code = httpStatusToCode(status)
      const response = exception.getResponse()

      if (typeof response === 'string') {
        message = response
      } else if (isHttpExceptionResponse(response)) {
        if (Array.isArray(response.message)) {
          message = response.message.join(', ')
        } else if (typeof response.message === 'string') {
          message = response.message
        }
        if (isErrorDetails(response.errors)) {
          details = response.errors
        }
        if (typeof response.code === 'string') {
          code = response.code
        }
      }
    } else if (exception instanceof ApplicationError) {
      status = exception.statusCode
      code = exception.code
      message = exception.message
      details = exception.details
    } else {
      req.log.error({ context: LogContext.EXCEPTION, err: exception }, 'Unhandled exception')
    }

    reply.status(status).send(buildErrorBody({ code, message, details, requestId: req.id }))
  }
}
