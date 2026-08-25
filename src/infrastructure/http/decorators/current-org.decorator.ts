import { createParamDecorator, ExecutionContext } from '@nestjs/common'
import type { FastifyRequest } from 'fastify'
import type { OrgContext } from '@/infrastructure/http/types/org-context.interface'

/**
 * Hands the handler the org context RemoteOrgMembershipGuard already verified.
 * Use this instead of @Headers('x-org-id') — the header is untrusted input, this
 * is the checked result. Same decorator as core-api's.
 */
export const CurrentOrg = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): OrgContext => {
    const request = ctx.switchToHttp().getRequest<FastifyRequest & { org: OrgContext }>()
    return request.org
  },
)
