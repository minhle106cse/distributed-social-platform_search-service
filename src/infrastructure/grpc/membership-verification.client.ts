import { Injectable, OnModuleDestroy } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import * as grpc from '@grpc/grpc-js'
import {
  MembershipVerificationClient as GeneratedMembershipVerificationClient,
  type MembershipVerificationClient as IGeneratedMembershipVerificationClient,
  attachInternalGrpcSecret,
} from '@distributed-social-platform/shared-kernel'
import { MembershipVerificationGrpcCaller } from './membership-verification-grpc.caller'

const DEADLINE_MS = 3000

/**
 * Client side of proto/membership.proto — search-service has no Membership
 * table of its own, so a caller-supplied X-Org-Id must be verified against
 * core-api before being trusted (IDOR fix, resilience_patterns.md).
 * Same hand-rolled convention as core-api's AuthProvisioningClient.
 */
@Injectable()
export class MembershipVerificationClient implements OnModuleDestroy {
  private readonly client: IGeneratedMembershipVerificationClient
  private readonly sharedSecret: string

  constructor(
    config: ConfigService,
    private readonly caller: MembershipVerificationGrpcCaller,
  ) {
    this.sharedSecret = config.getOrThrow<string>('env.internalGrpcSharedSecret')
    this.client = new GeneratedMembershipVerificationClient(
      config.getOrThrow<string>('env.coreGrpcUrl'),
      grpc.credentials.createInsecure(),
    )
  }

  onModuleDestroy(): void {
    this.client.close()
  }

  private metadata(): grpc.Metadata {
    return attachInternalGrpcSecret(new grpc.Metadata(), this.sharedSecret)
  }

  async checkMembership(
    orgId: string,
    userId: string,
  ): Promise<{ isMember: boolean; permissions: string[] }> {
    return this.caller.call(
      () =>
        new Promise<{ isMember: boolean; permissions: string[] }>((resolve, reject) => {
          this.client.checkMembership(
            { orgId, userId },
            this.metadata(),
            { deadline: Date.now() + DEADLINE_MS },
            (err, response) => {
              if (err) {
                reject(err)
                return
              }
              resolve({ isMember: response.isMember, permissions: response.permissions })
            },
          )
        }),
    )
  }
}
