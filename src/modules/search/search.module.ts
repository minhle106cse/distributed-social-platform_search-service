import { Module } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtAuthGuard } from '@/infrastructure/http/guards/jwt-auth.guard'
import { RemoteOrgMembershipGuard } from '@/infrastructure/http/guards/remote-org-membership.guard'
import { ElasticsearchClientService } from '@/infrastructure/elasticsearch/elasticsearch-client.service'
import { IndexKnowledgeHandler } from './application/events/index-knowledge/index-knowledge.handler'
import { SearchKnowledgeService } from './application/queries/search-knowledge.service'
import { TextChunker } from './domain/services/text-chunker'
import { EMBEDDING_SERVICE } from './domain/services/embedding.service'
import { SEARCH_CHUNK_READER } from './application/repositories/search-chunk.query-repository'
import { PrismaSearchChunkQueryRepository } from './infrastructure/repositories/prisma-search-chunk.query-repository'
import { KEYWORD_SEARCH_REPOSITORY } from './domain/repositories/keyword-search.repository'
import { SUMMARIZER_SERVICE } from './domain/services/summarizer.service'
import { HttpEmbeddingService } from './infrastructure/services/http-embedding.service'
import { OllamaEmbeddingCaller } from './infrastructure/services/ollama-embedding.caller'
import { ElasticsearchKeywordRepository } from './infrastructure/repositories/elasticsearch-keyword.repository'
import { ElasticsearchSearchCaller } from './infrastructure/repositories/elasticsearch-search.caller'
import { ClaudeSummarizerService } from './infrastructure/services/claude-summarizer.service'
import { ClaudeApiCaller } from './infrastructure/services/claude-api.caller'
import { GeminiSummarizerService } from './infrastructure/services/gemini-summarizer.service'
import { GeminiApiCaller } from './infrastructure/services/gemini-api.caller'
import { KnowledgeIndexerConsumer } from './infrastructure/consumers/knowledge-indexer.consumer'
import { DlqReplayConsumerService } from './infrastructure/consumers/dlq-replay.consumer'

import { SearchController } from './presentation/controllers/search.controller'

@Module({
  controllers: [SearchController],
  providers: [
    JwtAuthGuard,
    RemoteOrgMembershipGuard,
    ElasticsearchClientService,
    // Event indexing (consumer #2)
    IndexKnowledgeHandler,
    KnowledgeIndexerConsumer,
    // Retries messages isolated to <topic>.DLQ (review of ADR-0001, 2026-07-30)
    DlqReplayConsumerService,
    // Query side
    SearchKnowledgeService,
    TextChunker,
    // Ports
    OllamaEmbeddingCaller,
    { provide: EMBEDDING_SERVICE, useClass: HttpEmbeddingService },
    // Write side: SearchTxScopeFactory lives in PrismaTxRunnerModule (global) —
    // it's a dependency of PrismaTxRunner's constructor now, not registered here.
    { provide: SEARCH_CHUNK_READER, useClass: PrismaSearchChunkQueryRepository },
    ElasticsearchSearchCaller,
    { provide: KEYWORD_SEARCH_REPOSITORY, useClass: ElasticsearchKeywordRepository },
    // Both summarizers are built (each with its own circuit breaker caller); the
    // port resolves to one per SUMMARIZER_PROVIDER — the swap the ISummarizerService port buys.
    ClaudeApiCaller,
    ClaudeSummarizerService,
    GeminiApiCaller,
    GeminiSummarizerService,
    {
      provide: SUMMARIZER_SERVICE,
      useFactory: (
        config: ConfigService,
        claude: ClaudeSummarizerService,
        gemini: GeminiSummarizerService,
      ) => (config.get<string>('env.summarizerProvider') === 'gemini' ? gemini : claude),
      inject: [ConfigService, ClaudeSummarizerService, GeminiSummarizerService],
    },
  ],
  // For GrpcModule's RagQueryGrpcService — the gRPC server drives this service.
  // Everything gRPC (client + server + bootstrap) moved to GrpcModule 2026-08-24.
  exports: [SearchKnowledgeService],
})
export class SearchModule {}
