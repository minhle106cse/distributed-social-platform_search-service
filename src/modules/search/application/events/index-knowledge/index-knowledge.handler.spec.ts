import type { PinoLogger } from 'nestjs-pino'
import type { CloudEvent, KnowledgePublishedPayload } from '@distributed-social-platform/shared-kernel'
import type { IEmbeddingService } from '../../../domain/services/embedding.service'
import type { ISearchChunkRepository } from '../../../domain/repositories/search-chunk.repository'
import type { IKeywordSearchRepository } from '../../../domain/repositories/keyword-search.repository'
import { TextChunker } from '../../../domain/services/text-chunker'
import { IndexKnowledgeHandler } from './index-knowledge.handler'

function buildEvent(
  overrides: Partial<KnowledgePublishedPayload> = {},
): CloudEvent<KnowledgePublishedPayload> {
  return {
    specversion: '1.0',
    id: 'event-1',
    source: '/cortex/core-api/KnowledgeItem',
    type: 'KNOWLEDGE_PUBLISHED',
    time: new Date().toISOString(),
    subject: 'item-1',
    datacontenttype: 'application/json',
    orgid: 'org-1',
    partitionkey: 'item-1',
    data: {
      itemId: 'item-1',
      spaceId: 'space-1',
      type: 'DOCUMENT',
      title: 'Onboarding Guide',
      body: 'Step 1. Do the thing.',
      createdByUserId: 'author-1',
      ...overrides,
    },
  }
}

describe('IndexKnowledgeHandler', () => {
  let handler: IndexKnowledgeHandler
  let mockEmbedding: jest.Mocked<IEmbeddingService>
  let mockChunkRepo: jest.Mocked<ISearchChunkRepository>
  let mockKeywordRepo: jest.Mocked<IKeywordSearchRepository>
  let mockLogger: jest.Mocked<PinoLogger>

  beforeEach(() => {
    mockEmbedding = {
      embed: jest.fn(),
      embedBatch: jest.fn(),
    } as unknown as jest.Mocked<IEmbeddingService>

    mockChunkRepo = {
      replaceForItem: jest.fn(),
      semanticSearch: jest.fn(),
    } as unknown as jest.Mocked<ISearchChunkRepository>

    mockKeywordRepo = {
      indexItem: jest.fn(),
      search: jest.fn(),
    } as unknown as jest.Mocked<IKeywordSearchRepository>

    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
    } as unknown as jest.Mocked<PinoLogger>

    handler = new IndexKnowledgeHandler(
      mockEmbedding,
      mockChunkRepo,
      mockKeywordRepo,
      new TextChunker(),
      mockLogger,
    )
  })

  it('should declare natural-key idempotency (replaceForItem + ES upsert are both idempotent by itemId)', () => {
    expect(handler.idempotency).toBe('natural-key')
  })

  it('should embed the chunked content and write both the pgvector and Elasticsearch sides', async () => {
    mockEmbedding.embedBatch.mockResolvedValueOnce([[0.1, 0.2, 0.3]])

    await handler.handle(buildEvent())

    const [itemId, rows] = mockChunkRepo.replaceForItem.mock.calls[0]
    expect(itemId).toBe('item-1')
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      knowledgeItemId: 'item-1',
      orgId: 'org-1',
      spaceId: 'space-1',
      chunkIndex: 0,
      embedding: [0.1, 0.2, 0.3],
    })

    expect(mockKeywordRepo.indexItem).toHaveBeenCalledWith({
      knowledgeItemId: 'item-1',
      orgId: 'org-1',
      spaceId: 'space-1',
      title: 'Onboarding Guide',
      content: 'Step 1. Do the thing.',
    })
  })

  it('should clear stale chunks and skip embedding entirely for an empty item', async () => {
    await handler.handle(buildEvent({ title: '', body: '   ' }))

    expect(mockChunkRepo.replaceForItem).toHaveBeenCalledWith('item-1', [])
    expect(mockEmbedding.embedBatch).not.toHaveBeenCalled()
    expect(mockKeywordRepo.indexItem).not.toHaveBeenCalled()
  })
})
