import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import * as grpc from '@grpc/grpc-js'
import {
  LogContext,
  RagOutcome,
  type RagQueryServer,
  verifyInternalGrpcSecret,
  readTraceparent,
  startTraceContext,
  runWithTraceContext,
} from '@distributed-social-platform/shared-kernel'
import { SearchKnowledgeService } from '@/modules/search/application/queries/search-knowledge.service'

/**
 * Server side of proto/ai-query.proto — the paid RAG path. core-api's AI-Query
 * Saga calls this after it has reserved credit; this is the only caller.
 *
 * Lives in the SERVICE-WIDE `infrastructure/grpc/`, next to this service's gRPC
 * client half (the MembershipVerifier provider), not under `modules/search/`
 * (where it sat until 2026-08-24). Both directions of one transport belong
 * together — that is already the convention in core-api, whose gRPC server
 * (MembershipVerificationGrpcService) and clients share one folder, and
 * a module's own `infrastructure/` folder has no `grpc/` entry in
 * folder_structure_sop.md's canonical tree (mappers, consumers, services,
 * repositories — a closed list). It also stops
 * `bootstrap/grpc.ts` — service-wide wiring — from having to reach into a
 * module. Depending on a module's application service from here is fine: the
 * dependency points inward, exactly like core-api's RagQueryClient depending on
 * `modules/credit/domain/services/`.
 *
 * ⚠️ This RPC deliberately performs NO membership check, and that is not the IDOR
 * regression fixed in 2026-07-19. That fix was about a PUBLIC HTTP endpoint
 * trusting a client-supplied X-Org-Id; here the caller is core-api, which has
 * already run JwtAuthGuard + OrgGuard + the required org permissions before the
 * saga started, and `x-internal-secret` is the trust boundary. Checking again
 * would also mean search-service calling back into core-api
 * (RemoteOrgMembershipGuard) while core-api is blocked waiting on this call.
 *
 * Delegates straight to SearchKnowledgeService — the RAG pipeline is not
 * reimplemented here, only translated to the wire, including the one piece of
 * translation that matters: turning "summary is null" into WHY it is null.
 *
 * `#`-prefixed private fields (not plain `private`) — grpc-js's generated server
 * interface requires a `[name: string]: UntypedHandleCall` index signature, which
 * plain `private` constructor-parameter properties would collide with (TS2411).
 */
@Injectable()
export class RagQueryGrpcService implements RagQueryServer {
  [name: string]: grpc.UntypedHandleCall
  #searchService: SearchKnowledgeService
  #logger: PinoLogger
  #internalGrpcSharedSecret: string

  constructor(
    searchService: SearchKnowledgeService,
    @InjectPinoLogger(RagQueryGrpcService.name) logger: PinoLogger,
    config: ConfigService,
  ) {
    this.#searchService = searchService
    this.#logger = logger
    this.#internalGrpcSharedSecret = config.getOrThrow<string>('env.internalGrpcSharedSecret')
  }

  query: RagQueryServer['query'] = (call, callback) => {
    // core-api's RagQueryClient attaches traceparent on the way out; until
    // 2026-08-24 this server never read it, so the trace died at the boundary of
    // the one call the AI-Query Saga actually charges for. Same shape as
    // AuthProvisioningGrpcService.
    const traceCtx = startTraceContext(readTraceparent(call))
    void runWithTraceContext(traceCtx, async () => {
      if (!verifyInternalGrpcSecret(call, this.#internalGrpcSharedSecret)) {
        // gRPC has no boundary interceptor equivalent to the HTTP one, so a
        // rejected call leaves no trace unless this branch logs it itself
        // (2026-07-25 gateway audit).
        this.#logger.warn(
          { context: LogContext.GRPC },
          'RagQuery gRPC call rejected — invalid internal secret',
        )
        callback({ code: grpc.status.UNAUTHENTICATED, message: 'Invalid internal secret' })
        return
      }

      try {
        const { orgId, question, topK } = call.request
        const result = await this.#searchService.search(orgId, question, topK, true)

        // The whole reason this contract carries an outcome instead of the raw
        // `summary: string | null`. SearchKnowledgeService degrades rather than
        // throwing (ES down → semantic-only, Ollama down → keyword-only, Claude
        // down → summary null), which is right for a free search endpoint and
        // wrong for a billed one: the caller has to tell "nothing to answer from"
        // (not the AI's fault, not chargeable, not an error) from "we had context
        // but could not answer" (chargeable work not delivered → 503 + release).
        const outcome =
          result.chunks.length === 0
            ? RagOutcome.RAG_OUTCOME_NO_RESULTS
            : result.summary === null
              ? RagOutcome.RAG_OUTCOME_AI_UNAVAILABLE
              : RagOutcome.RAG_OUTCOME_ANSWERED

        this.#logger.info(
          { context: LogContext.GRPC, orgId, outcome, chunkCount: result.chunks.length },
          'RagQuery gRPC call succeeded',
        )
        callback(null, {
          outcome,
          summary: result.summary ?? '',
          sources: result.sources.map((source) => ({
            knowledgeItemId: source.knowledgeItemId,
            title: source.titleSnapshot,
          })),
          chunks: result.chunks.map((chunk) => ({
            knowledgeItemId: chunk.knowledgeItemId,
            titleSnapshot: chunk.titleSnapshot,
            content: chunk.content,
            score: chunk.score,
          })),
        })
      } catch (err) {
        this.#logger.error({ context: LogContext.GRPC, err }, 'RagQuery gRPC call failed')
        callback({ code: grpc.status.INTERNAL, message: 'Failed to run RAG query' })
      }
    })
  }
}
