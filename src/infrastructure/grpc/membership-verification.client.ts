import { Injectable, OnModuleDestroy } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { MembershipVerifier } from '@distributed-social-platform/shared-kernel'
import { MembershipVerificationGrpcCaller } from './membership-verification-grpc.caller'

/**
 * Nest shell around shared-kernel's `MembershipVerifier` — search-service has no
 * Membership table of its own, so a caller-supplied X-Org-Id must be verified
 * against core-api before being trusted (IDOR fix, resilience_patterns.md).
 *
 * Everything that is not Nest-specific lives in the shared verifier: this file
 * used to be a full hand-rolled gRPC client, byte-identical to notification-service's
 * copy apart from its comment (2026-08-24 audit). What stays here is what must
 * stay per-service — config resolution and this service's OWN breaker instance,
 * so one service's outage cannot open the other's circuit.
 */
@Injectable()
export class MembershipVerificationClient implements OnModuleDestroy {
  private readonly verifier: MembershipVerifier

  constructor(config: ConfigService, caller: MembershipVerificationGrpcCaller) {
    this.verifier = new MembershipVerifier(
      config.getOrThrow<string>('env.coreGrpcUrl'),
      config.getOrThrow<string>('env.internalGrpcSharedSecret'),
      (fn) => caller.call(fn),
    )
  }

  onModuleDestroy(): void {
    this.verifier.close()
  }

  async checkMembership(
    orgId: string,
    userId: string,
  ): Promise<{ isMember: boolean; permissions: string[] }> {
    return this.verifier.checkMembership(orgId, userId)
  }
}
