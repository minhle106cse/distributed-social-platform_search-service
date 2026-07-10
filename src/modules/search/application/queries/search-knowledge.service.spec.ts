import type { PinoLogger } from 'nestjs-pino'
import type { IEmbeddingService } from '../../domain/services/embedding.service'
import type { ISearchChunkRepository, SearchHit } from '../../domain/repositories/search-chunk.repository'
import type {
  IKeywordSearchRepository,
  KeywordHit,
} from '../../domain/repositories/keyword-search.repository'
import type { ISummarizer } from '../../domain/services/summarizer'
import { SearchKnowledgeService } from './search-knowledge.service'

describe('SearchKnowledgeService', () => {
  let service: SearchKnowledgeService
  let mockEmbedding: jest.Mocked<IEmbeddingService>
  let mockChunkRepo: jest.Mocked<ISearchChunkRepository>
  let mockKeywordRepo: jest.Mocked<IKeywordSearchRepository>
  let mockSummarizer: jest.Mocked<ISummarizer>
  let mockLogger: jest.Mocked<PinoLogger>

  beforeEach(() => {
    mockEmbedding = {
      embed: jest.fn(),
      embedBatch: jest.fn().mockResolvedValue([[0.1, 0.2, 0.3]]),
    } as unknown as jest.Mocked<IEmbeddingService>

    mockChunkRepo = {
      replaceForItem: jest.fn(),
      semanticSearch: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<ISearchChunkRepository>

    mockKeywordRepo = {
      indexItem: jest.fn(),
      search: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<IKeywordSearchRepository>

    mockSummarizer = {
      summarize: jest.fn(),
    } as unknown as jest.Mocked<ISummarizer>

    mockLogger = {
      warn: jest.fn(),
    } as unknown as jest.Mocked<PinoLogger>

    service = new SearchKnowledgeService(
      mockEmbedding,
      mockChunkRepo,
      mockKeywordRepo,
      mockSummarizer,
      mockLogger,
    )
  })

  function semanticHit(overrides: Partial<SearchHit>): SearchHit {
    return { knowledgeItemId: 'item-1', content: 'c', titleSnapshot: 't', score: 0.9, ...overrides }
  }
  function keywordHit(overrides: Partial<KeywordHit>): KeywordHit {
    return { knowledgeItemId: 'item-1', content: 'c', titleSnapshot: 't', score: 10, ...overrides }
  }

  it('should rank an item appearing in BOTH semantic and keyword results higher than one appearing in only one (RRF fusion)', async () => {
    mockChunkRepo.semanticSearch.mockResolvedValueOnce([
      semanticHit({ knowledgeItemId: 'item-both', score: 0.5 }), // rank 0 semantic
      semanticHit({ knowledgeItemId: 'item-semantic-only', score: 0.9 }), // rank 1 semantic
    ])
    mockKeywordRepo.search.mockResolvedValueOnce([
      keywordHit({ knowledgeItemId: 'item-both', score: 20 }), // rank 0 keyword
    ])

    const result = await service.search('org-1', 'how to deploy', 10, false)

    expect(result.chunks[0].knowledgeItemId).toBe('item-both')
    expect(result.chunks.map((c) => c.knowledgeItemId)).toContain('item-semantic-only')
  })

  it('should collapse multiple chunks of the same item to a single ranked entry (dedupe by knowledgeItemId)', async () => {
    mockChunkRepo.semanticSearch.mockResolvedValueOnce([
      semanticHit({ knowledgeItemId: 'item-1', content: 'chunk A' }),
      semanticHit({ knowledgeItemId: 'item-1', content: 'chunk B' }),
    ])

    const result = await service.search('org-1', 'query', 10, false)

    expect(result.chunks).toHaveLength(1)
    expect(result.chunks[0].content).toBe('chunk A') // first (best-ranked) chunk wins
  })

  it('should degrade to semantic-only (not throw) when Elasticsearch keyword search fails', async () => {
    mockChunkRepo.semanticSearch.mockResolvedValueOnce([semanticHit({ knowledgeItemId: 'item-1' })])
    mockKeywordRepo.search.mockRejectedValueOnce(new Error('ES unreachable'))

    const result = await service.search('org-1', 'query', 10, false)

    expect(result.chunks).toHaveLength(1)
    expect(mockLogger.warn).toHaveBeenCalled()
  })

  it('should skip summarization and return no sources when summarize=false', async () => {
    mockChunkRepo.semanticSearch.mockResolvedValueOnce([semanticHit({ knowledgeItemId: 'item-1' })])

    const result = await service.search('org-1', 'query', 10, false)

    expect(result.summary).toBeNull()
    expect(result.sources).toEqual([])
    expect(mockSummarizer.summarize).not.toHaveBeenCalled()
  })

  it('should return null chunks/summary/sources cleanly when there is nothing to rank, without calling the summarizer', async () => {
    const result = await service.search('org-1', 'query', 10, true)

    expect(result.chunks).toEqual([])
    expect(result.summary).toBeNull()
    expect(mockSummarizer.summarize).not.toHaveBeenCalled()
  })

  it('should degrade to chunks-only (not throw) when the summarizer fails (e.g. circuit open)', async () => {
    mockChunkRepo.semanticSearch.mockResolvedValueOnce([semanticHit({ knowledgeItemId: 'item-1' })])
    mockSummarizer.summarize.mockRejectedValueOnce(new Error('AI service circuit open'))

    const result = await service.search('org-1', 'query', 10, true)

    expect(result.chunks).toHaveLength(1)
    expect(result.summary).toBeNull()
    expect(result.sources).toEqual([])
  })

  it('should return the grounded summary and sources on a successful summarization', async () => {
    mockChunkRepo.semanticSearch.mockResolvedValueOnce([semanticHit({ knowledgeItemId: 'item-1' })])
    mockSummarizer.summarize.mockResolvedValueOnce({
      text: 'Grounded answer [1]',
      sources: [{ knowledgeItemId: 'item-1', titleSnapshot: 't' }],
    })

    const result = await service.search('org-1', 'query', 10, true)

    expect(result.summary).toBe('Grounded answer [1]')
    expect(result.sources).toEqual([{ knowledgeItemId: 'item-1', titleSnapshot: 't' }])
  })
})
