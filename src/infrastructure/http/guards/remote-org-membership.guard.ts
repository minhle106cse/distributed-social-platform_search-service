import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import type { FastifyRequest } from 'fastify'
import type { OrgPermissionValue } from '@distributed-social-platform/shared-kernel'
import type { JwtPayload } from './jwt-auth.guard'
import { MembershipVerificationClient } from '@/infrastructure/grpc/membership-verification.client'
import { ORG_PERMISSION_KEY } from '@/infrastructure/http/decorators/require-org-permission.decorator'

/**
 * "Remote" distinguishes this from core-api's OrgGuard: that one checks
 * membership against a LOCAL DB table, this one has no Membership table of
 * its own — search-service has none — so it verifies over gRPC against
 * core-api instead. It DOES resolve permissions too (via the same
 * resolveOrgPermissions rule core-api's OrgGuard uses, returned in the gRPC
 * response) — checking membership alone would let any member bypass
 * role-based restrictions that already exist for the equivalent local
 * endpoint (e.g. GUEST-only-read on knowledge). Route declares
 * @RequireOrgPermission the same way it would under OrgGuard; omitting it
 * falls back to membership-only, same default as OrgGuard.
 *
 * X-Org-Id used to be trusted verbatim from the header (comment used to read
 * "search-service has no memberships"), which let any authenticated user
 * read/summarize another org's knowledge base by just changing the header
 * (IDOR). This guard closes that gap (resilience_patterns.md).
 *
 * Fails CLOSED: if core-api is unreachable (breaker open / gRPC error), the
 * request is rejected with 503 rather than silently allowed through — an
 * authz check that degrades to "allow" on infra failure is worse than no
 * check at all.
 */
@Injectable()
export class RemoteOrgMembershipGuard implements CanActivate {
  constructor(
    private readonly membershipClient: MembershipVerificationClient,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<FastifyRequest & { user?: JwtPayload }>()

    const userId = request.user?.sub
    if (!userId) throw new UnauthorizedException()

    const orgId = request.headers['x-org-id'] as string | undefined
    if (!orgId) throw new ForbiddenException('X-Org-Id header is required')

    let result: { isMember: boolean; permissions: string[] }
    try {
      result = await this.membershipClient.checkMembership(orgId, userId)
    } catch {
      throw new ServiceUnavailableException('Unable to verify organization membership')
    }

    if (!result.isMember) throw new ForbiddenException('You are not a member of this organization')

    const requiredPermission = this.reflector.get<OrgPermissionValue>(
      ORG_PERMISSION_KEY,
      context.getHandler(),
    )
    if (requiredPermission && !result.permissions.includes(requiredPermission)) {
      throw new ForbiddenException(`Missing permission: ${requiredPermission}`)
    }

    return true
  }
}
