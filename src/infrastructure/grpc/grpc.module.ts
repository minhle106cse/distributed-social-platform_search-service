import { Global, Module } from '@nestjs/common'
import { MembershipVerificationGrpcCaller } from './membership-verification-grpc.caller'
import { MembershipVerificationClient } from './membership-verification.client'
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
 */
@Global()
@Module({
  imports: [SearchModule],
  providers: [
    MembershipVerificationGrpcCaller,
    MembershipVerificationClient,
    RagQueryGrpcService,
    GrpcServerBootstrap,
  ],
  // MembershipVerificationClient for RemoteOrgMembershipGuard; GrpcServerBootstrap
  // for main.ts, which starts and stops the server with the app.
  exports: [MembershipVerificationClient, GrpcServerBootstrap],
})
export class GrpcModule {}
