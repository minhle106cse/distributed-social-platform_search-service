import { Module } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtAuthGuard } from '@/infrastructure/http/guards/jwt-auth.guard'
import { RemoteOrgMembershipGuard } from '@/infrastructure/http/guards/remote-org-membership.guard'
import { MembershipVerificationClient } from '@/infrastructure/grpc/membership-verification.client'
import { MembershipVerificationGrpcCaller } from '@/infrastructure/grpc/membership-verification-grpc.caller'
import { ElasticsearchClientService } from '@/infrastructure/elasticsearch/elasticsearch-client.service'
import { IndexKnowledgeHandler } from './application/events/index-knowledge/index-knowledge.handler'
import { SearchKnowledgeService } from './application/queries/search-knowledge.service'
import { TextChunker } from './domain/services/text-chunker'
import { EMBEDDING_SERVICE } from './domain/services/embedding.service'
import { SEARCH_CHUNK_REPOSITORY } from './domain/repositories/search-chunk.repository'
import { KEYWORD_SEARCH_REPOSITORY } from './domain/repositories/keyword-search.repository'
import { SUMMARIZER } from './domain/services/summarizer'
import { HttpEmbeddingService } from './infrastructure/services/http-embedding.service'
import { OllamaEmbeddingCaller } from './infrastructure/services/ollama-embedding.caller'
import { PrismaSearchChunkRepository } from './infrastructure/repositories/prisma-search-chunk.repository'
import { ElasticsearchKeywordRepository } from './infrastructure/repositories/elasticsearch-keyword.repository'
import { ElasticsearchSearchCaller } from './infrastructure/repositories/elasticsearch-search.caller'
import { ClaudeSummarizer } from './infrastructure/services/claude-summarizer'
import { ClaudeApiCaller } from './infrastructure/services/claude-api.caller'
import { GeminiSummarizer } from './infrastructure/services/gemini-summarizer'
import { GeminiApiCaller } from './infrastructure/services/gemini-api.caller'
import { KnowledgeIndexerConsumer } from './infrastructure/consumers/knowledge-indexer.consumer'
import { SearchController } from './presentation/search.controller'

@Module({
  controllers: [SearchController],
  providers: [
    JwtAuthGuard,
    RemoteOrgMembershipGuard,
    MembershipVerificationGrpcCaller,
    MembershipVerificationClient,
    ElasticsearchClientService,
    // Event indexing (consumer #2)
    IndexKnowledgeHandler,
    KnowledgeIndexerConsumer,
    // Query side
    SearchKnowledgeService,
    TextChunker,
    // Ports
    OllamaEmbeddingCaller,
    { provide: EMBEDDING_SERVICE, useClass: HttpEmbeddingService },
    { provide: SEARCH_CHUNK_REPOSITORY, useClass: PrismaSearchChunkRepository },
    ElasticsearchSearchCaller,
    { provide: KEYWORD_SEARCH_REPOSITORY, useClass: ElasticsearchKeywordRepository },
    // Both summarizers are built (each with its own circuit breaker caller); the
    // port resolves to one per SUMMARIZER_PROVIDER — the swap the ISummarizer port buys.
    ClaudeApiCaller,
    ClaudeSummarizer,
    GeminiApiCaller,
    GeminiSummarizer,
    {
      provide: SUMMARIZER,
      useFactory: (config: ConfigService, claude: ClaudeSummarizer, gemini: GeminiSummarizer) =>
        config.get<string>('env.summarizerProvider') === 'gemini' ? gemini : claude,
      inject: [ConfigService, ClaudeSummarizer, GeminiSummarizer],
    },
  ],
})
export class SearchModule {}
