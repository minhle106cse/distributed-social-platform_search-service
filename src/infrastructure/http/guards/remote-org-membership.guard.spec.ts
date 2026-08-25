import {
  ForbiddenException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import type { ExecutionContext } from '@nestjs/common'
import { OrgPermission } from '@distributed-social-platform/shared-kernel'
import { RemoteOrgMembershipGuard } from './remote-org-membership.guard'
import { ORG_PERMISSION_KEY } from '@/infrastructure/http/decorators/require-org-permission.decorator'
import type { MembershipVerifier } from '@distributed-social-platform/shared-kernel'

const handlerRef = function routeHandler(): void {}
const classRef = class ControllerRef {}

interface FakeRequest {
  user?: { sub: string }
  headers: Record<string, string | undefined>
  org?: { orgId: string; permissions: string[] }
}

function contextFor(request: FakeRequest): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => handlerRef,
    getClass: () => classRef,
  } as unknown as ExecutionContext
}

function buildGuard(
  check: () => Promise<{ isMember: boolean; permissions: string[] }>,
  required?: string[],
): RemoteOrgMembershipGuard {
  const client = { checkMembership: check } as unknown as MembershipVerifier
  const reflector = new Reflector()
  jest
    .spyOn(reflector, 'getAllAndOverride')
    .mockImplementation((key: unknown) => (key === ORG_PERMISSION_KEY ? required : undefined))
  return new RemoteOrgMembershipGuard(client, reflector)
}

const AUTHED: FakeRequest = { user: { sub: 'user-1' }, headers: { 'x-org-id': 'org-1' } }

describe('RemoteOrgMembershipGuard', () => {
  it('rejects an unauthenticated request', async () => {
    const guard = buildGuard(async () => ({ isMember: true, permissions: [] }))
    await expect(
      guard.canActivate(contextFor({ headers: { 'x-org-id': 'org-1' } })),
    ).rejects.toThrow(UnauthorizedException)
  })

  it('rejects a request with no X-Org-Id header', async () => {
    const guard = buildGuard(async () => ({ isMember: true, permissions: [] }))
    await expect(
      guard.canActivate(contextFor({ user: { sub: 'user-1' }, headers: {} })),
    ).rejects.toThrow(ForbiddenException)
  })

  it('rejects a caller who is not a member of the requested org (the IDOR case)', async () => {
    const guard = buildGuard(async () => ({ isMember: false, permissions: [] }))
    await expect(guard.canActivate(contextFor({ ...AUTHED }))).rejects.toThrow(ForbiddenException)
  })

  // An authz check that degrades to "allow" when its dependency is down is worse
  // than no check at all.
  it('FAILS CLOSED with 503 when core-api is unreachable, never allowing the request', async () => {
    const guard = buildGuard(async () => {
      throw new Error('breaker open')
    })
    await expect(guard.canActivate(contextFor({ ...AUTHED }))).rejects.toThrow(
      ServiceUnavailableException,
    )
  })

  it('publishes the VERIFIED org context on the request so handlers stop re-reading the header', async () => {
    const request: FakeRequest = { ...AUTHED }
    const guard = buildGuard(async () => ({
      isMember: true,
      permissions: [OrgPermission.KNOWLEDGE_READ],
    }))

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true)
    expect(request.org).toEqual({ orgId: 'org-1', permissions: [OrgPermission.KNOWLEDGE_READ] })
  })

  it('allows a member when the route declares no permission (membership-only default)', async () => {
    const guard = buildGuard(async () => ({ isMember: true, permissions: [] }))
    await expect(guard.canActivate(contextFor({ ...AUTHED }))).resolves.toBe(true)
  })

  // The decorator is variadic now, matching core-api: several permissions mean
  // ALL of them, never any-of.
  it('requires ALL declared permissions (AND), not just one of them', async () => {
    const guard = buildGuard(
      async () => ({ isMember: true, permissions: [OrgPermission.KNOWLEDGE_READ] }),
      [OrgPermission.KNOWLEDGE_READ, OrgPermission.CREDIT_SPEND],
    )
    await expect(guard.canActivate(contextFor({ ...AUTHED }))).rejects.toThrow(
      /Missing permission: credit:spend/,
    )
  })

  it('allows when every declared permission is present', async () => {
    const guard = buildGuard(
      async () => ({
        isMember: true,
        permissions: [OrgPermission.KNOWLEDGE_READ, OrgPermission.CREDIT_SPEND],
      }),
      [OrgPermission.KNOWLEDGE_READ, OrgPermission.CREDIT_SPEND],
    )
    await expect(guard.canActivate(contextFor({ ...AUTHED }))).resolves.toBe(true)
  })

  it('consults metadata on BOTH the method and the class', async () => {
    const client = {
      checkMembership: async () => ({ isMember: true, permissions: [] }),
    } as unknown as MembershipVerifier
    const reflector = new Reflector()
    const seen: unknown[][] = []
    jest.spyOn(reflector, 'getAllAndOverride').mockImplementation((_key, targets) => {
      seen.push(targets as unknown[])
      return undefined
    })

    await new RemoteOrgMembershipGuard(client, reflector).canActivate(contextFor({ ...AUTHED }))
    expect(seen[0]).toEqual([handlerRef, classRef])
  })
})
