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
import { MembershipVerifier } from '@distributed-social-platform/shared-kernel'
import type {
  MembershipCheckResult,
  OrgPermissionValue,
} from '@distributed-social-platform/shared-kernel'
import type { JwtPayload } from './jwt-auth.guard'
import { ORG_PERMISSION_KEY } from '@/infrastructure/http/decorators/require-org-permission.decorator'
import type { OrgContext } from '@/infrastructure/http/types/org-context.interface'

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
 *
 * Publishes the verified result as `request.org` (2026-08-25) so handlers stop
 * re-reading the raw header — see OrgContext for why that mattered.
 */
@Injectable()
export class RemoteOrgMembershipGuard implements CanActivate {
  constructor(
    private readonly membershipVerifier: MembershipVerifier,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<FastifyRequest & { user?: JwtPayload; org?: OrgContext }>()

    const userId = request.user?.sub
    if (!userId) throw new UnauthorizedException()

    const orgId = request.headers['x-org-id'] as string | undefined
    if (!orgId) throw new ForbiddenException('X-Org-Id header is required')

    let result: MembershipCheckResult
    try {
      result = await this.membershipVerifier.checkMembership(orgId, userId)
    } catch {
      throw new ServiceUnavailableException('Unable to verify organization membership')
    }

    if (!result.isMember) throw new ForbiddenException('You are not a member of this organization')

    // getAllAndOverride (không phải get) — đọc metadata ở CẢ method lẫn class,
    // method thắng. Bản cũ chỉ đọc getHandler(), nên decorator đặt ở class level
    // bị bỏ qua ÂM THẦM, route tụt về membership-only mà không có dấu hiệu gì.
    const requiredPermissions = this.reflector.getAllAndOverride<OrgPermissionValue[]>(
      ORG_PERMISSION_KEY,
      [context.getHandler(), context.getClass()],
    )
    // AND, không phải OR — khai báo nhiều permission nghĩa là cần đủ cả, giống
    // core-api's OrgGuard. Metadata giờ luôn là mảng (decorator đã variadic hoá).
    const missing = requiredPermissions?.filter((p) => !result.permissions.includes(p)) ?? []
    if (missing.length > 0) {
      throw new ForbiddenException(`Missing permission: ${missing.join(', ')}`)
    }

    request.org = { orgId, permissions: result.permissions }

    return true
  }
}
