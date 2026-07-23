import { Inject, Injectable } from '@nestjs/common'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import type { CloudEvent } from '@distributed-social-platform/shared-kernel'
import {
  EventType,
  LogContext,
  type IIntegrationEventHandler,
  type KnowledgePublishedPayload,
} from '@distributed-social-platform/shared-kernel'
import { TextChunker } from '../../../domain/services/text-chunker'
import type { IEmbeddingService } from '../../../domain/services/embedding.service'
import { EMBEDDING_SERVICE } from '../../../domain/services/embedding.service'
import type {
  ISearchChunkRepository,
  InsertChunkRow,
} from '../../../domain/repositories/search-chunk.repository'
import { SEARCH_CHUNK_REPOSITORY } from '../../../domain/repositories/search-chunk.repository'
import type { IKeywordSearchRepository } from '../../../domain/repositories/keyword-search.repository'
import { KEYWORD_SEARCH_REPOSITORY } from '../../../domain/repositories/keyword-search.repository'

@Injectable()
export class IndexKnowledgeHandler implements IIntegrationEventHandler<KnowledgePublishedPayload> {
  readonly eventType = EventType.KNOWLEDGE_PUBLISHED
  // Both writes are idempotent by itemId: pgvector replaceForItem (delete+insert)
  // and ES indexItem (upsert by id). Re-applying a redelivered event is a no-op.
  readonly idempotency = 'natural-key' as const

  constructor(
    @Inject(EMBEDDING_SERVICE) private readonly embedding: IEmbeddingService,
    @Inject(SEARCH_CHUNK_REPOSITORY) private readonly chunkRepo: ISearchChunkRepository,
    @Inject(KEYWORD_SEARCH_REPOSITORY) private readonly keywordRepo: IKeywordSearchRepository,
    private readonly chunker: TextChunker,
    @InjectPinoLogger(IndexKnowledgeHandler.name) private readonly logger: PinoLogger,
  ) {}

  async handle(event: CloudEvent<KnowledgePublishedPayload>): Promise<void> {
    const { itemId, spaceId, title, body } = event.data
    const orgId = event.orgid
    const startedAt = Date.now()

    const chunks = this.chunker.chunk(`${title}\n\n${body}`)
    if (chunks.length === 0) {
      // Nothing to index (empty item) — clear any stale chunks and stop.
      await this.chunkRepo.replaceForItem(itemId, [])
      this.logger.info(
        { context: LogContext.EVENT_ROUTER, orgId, itemId, chunkCount: 0 },
        'Indexing skipped — empty item, cleared',
      )
      return
    }

    const vectors = await this.embedding.embedBatch(chunks)

    const rows: InsertChunkRow[] = chunks.map((content, chunkIndex) => ({
      knowledgeItemId: itemId,
      orgId,
      spaceId,
      chunkIndex,
      content,
      titleSnapshot: title,
      embedding: vectors[chunkIndex],
    }))

    // Semantic side (pgvector) + keyword side (Elasticsearch). If ES throws, the
    // whole handler retries → DLQ (both stores idempotent, so replay is safe) —
    // we don't silently skip a store and let the two drift.
    await this.chunkRepo.replaceForItem(itemId, rows)
    await this.keywordRepo.indexItem({
      knowledgeItemId: itemId,
      orgId,
      spaceId,
      title,
      content: body,
    })

    // EventRouter (shared-kernel, 2026-07-25) already logs the generic
    // "Routed KNOWLEDGE_PUBLISHED, durationMs" dispatch line for every
    // handler automatically — this extra log is handler-specific business
    // detail EventRouter can't know (which org/item, how many chunks), same
    // relationship as a CommandHandler adding its own domain log on top of
    // CommandBus's generic LoggingMiddleware line.
    this.logger.info(
      {
        context: LogContext.EVENT_ROUTER,
        orgId,
        itemId,
        chunkCount: chunks.length,
        durationMs: Date.now() - startedAt,
      },
      'Indexing completed',
    )
  }
}
