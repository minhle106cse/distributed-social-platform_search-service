import { Global, Module, OnModuleDestroy } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { CACHE_STORE, MembershipVerifier } from '@distributed-social-platform/shared-kernel'
import type { ICacheStore } from '@distributed-social-platform/shared-kernel'
import { MembershipVerificationGrpcCaller } from './membership-verification-grpc.caller'
import { RagQueryGrpcService } from './rag-query.grpc-service'
import { GrpcServerBootstrap } from '@/bootstrap/grpc'
import { SearchModule } from '@/modules/search/search.module'

/**
 * Everything gRPC for this service, both directions: the client that calls OUT to
 * core-api's MembershipVerification, and the RagQuery server core-api's AI-Query
 * Saga calls IN to. `@Global` + imported once by AppModule, matching KafkaModule
 * here and GrpcModule in core-api.
 *
 * Created 2026-08-24. Before this, these four providers were listed directly in
 * `SearchModule` — so search-service's ability to SERVE gRPC hung off one feature
 * module's `providers` array, and `main.ts`'s `app.get(GrpcServerBootstrap)` worked
 * by luck rather than by design. Serving a transport is a service-level lifecycle
 * concern.
 *
 * Importing SearchModule from an infrastructure module is deliberate and is not a
 * layering violation: `RagQueryGrpcService` is a driving adapter, so it depends on
 * the application service it drives (`SearchKnowledgeService`) — inward, the right
 * direction. Nest's module graph is composition wiring, not the layer graph. There
 * is no cycle: SearchModule does not import this module back, because this one is
 * global.
 *
 * ⚠️ WHY A FACTORY AND NOT AN @Injectable WRAPPER (2026-08-25). shared-kernel may
 * not import `@nestjs/*` (`check:arch` check H), so `MembershipVerifier` cannot
 * carry `@Injectable()`. The previous answer was a per-service
 * `MembershipVerificationClient` class that did nothing but `new` the verifier and
 * forward `checkMembership` — a pure pass-through, duplicated byte-for-byte across
 * search-service and notification-service, and it re-declared the return type by
 * hand instead of reusing `MembershipCheckResult`. A `useFactory` provider does the
 * same wiring without inventing a class, and guards now inject `MembershipVerifier`
 * itself. What genuinely must stay per-service still does: config resolution, this
 * service's OWN breaker instance (so one service's outage cannot open the other's
 * circuit), and its own Redis client.
 */
@Global()
@Module({
  imports: [SearchModule],
  providers: [
    MembershipVerificationGrpcCaller,
    {
      provide: MembershipVerifier,
      useFactory: (
        config: ConfigService,
        caller: MembershipVerificationGrpcCaller,
        cacheStore: ICacheStore,
      ) =>
        MembershipVerifier.connect(config.getOrThrow<string>('env.coreGrpcUrl'), {
          sharedSecret: config.getOrThrow<string>('env.internalGrpcSharedSecret'),
          call: (fn) => caller.call(fn),
          cache: { store: cacheStore },
        }),
      inject: [ConfigService, MembershipVerificationGrpcCaller, CACHE_STORE],
    },
    RagQueryGrpcService,
    GrpcServerBootstrap,
  ],
  // MembershipVerifier for RemoteOrgMembershipGuard; GrpcServerBootstrap for
  // main.ts, which starts and stops the server with the app.
  exports: [MembershipVerifier, GrpcServerBootstrap],
})
export class GrpcModule implements OnModuleDestroy {
  // A factory-provided instance gets no lifecycle hooks of its own (its class is
  // framework-free and has no onModuleDestroy), so the channel is closed here.
  constructor(private readonly membershipVerifier: MembershipVerifier) {}

  onModuleDestroy(): void {
    this.membershipVerifier.close()
  }
}
