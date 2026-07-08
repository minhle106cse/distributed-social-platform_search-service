import { Module } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtAuthGuard } from '@/infrastructure/http/guards/jwt-auth.guard'
import { ElasticsearchClientService } from '@/infrastructure/elasticsearch/elasticsearch-client.service'
import { IndexKnowledgeHandler } from './application/events/index-knowledge/index-knowledge.handler'
import { SearchKnowledgeService } from './application/queries/search-knowledge.service'
import { TextChunker } from './domain/services/text-chunker'
import { EMBEDDING_SERVICE } from './domain/services/embedding.service'
import { SEARCH_CHUNK_REPOSITORY } from './domain/repositories/search-chunk.repository'
import { KEYWORD_SEARCH_REPOSITORY } from './domain/repositories/keyword-search.repository'
import { SUMMARIZER } from './domain/services/summarizer'
import { HttpEmbeddingService } from './infrastructure/services/http-embedding.service'
import { PrismaSearchChunkRepository } from './infrastructure/repositories/prisma-search-chunk.repository'
import { ElasticsearchKeywordRepository } from './infrastructure/repositories/elasticsearch-keyword.repository'
import { ClaudeSummarizer } from './infrastructure/services/claude-summarizer'
import { GeminiSummarizer } from './infrastructure/services/gemini-summarizer'
import { KnowledgeIndexerConsumer } from './infrastructure/consumers/knowledge-indexer.consumer'
import { SearchController } from './presentation/search.controller'

@Module({
  controllers: [SearchController],
  providers: [
    JwtAuthGuard,
    ElasticsearchClientService,
    // Event indexing (consumer #2)
    IndexKnowledgeHandler,
    KnowledgeIndexerConsumer,
    // Query side
    SearchKnowledgeService,
    TextChunker,
    // Ports
    { provide: EMBEDDING_SERVICE, useClass: HttpEmbeddingService },
    { provide: SEARCH_CHUNK_REPOSITORY, useClass: PrismaSearchChunkRepository },
    { provide: KEYWORD_SEARCH_REPOSITORY, useClass: ElasticsearchKeywordRepository },
    // Both summarizers are built (each with its own circuit breaker); the port
    // resolves to one per SUMMARIZER_PROVIDER — the swap the ISummarizer port buys.
    ClaudeSummarizer,
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
