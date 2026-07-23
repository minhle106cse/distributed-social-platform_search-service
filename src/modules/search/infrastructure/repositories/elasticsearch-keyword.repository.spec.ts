import { ElasticsearchKeywordRepository } from './elasticsearch-keyword.repository'
import type { ElasticsearchClientService } from '@/infrastructure/elasticsearch/elasticsearch-client.service'
import type { ElasticsearchSearchCaller } from './elasticsearch-search.caller'

describe('ElasticsearchKeywordRepository', () => {
  let repo: ElasticsearchKeywordRepository
  let mockEsClient: { search: jest.Mock; index: jest.Mock }
  let mockCaller: { call: jest.Mock }

  beforeEach(() => {
    mockEsClient = { search: jest.fn(), index: jest.fn() }
    mockCaller = { call: jest.fn((fn: () => Promise<unknown>) => fn()) }

    repo = new ElasticsearchKeywordRepository(
      { client: mockEsClient } as unknown as ElasticsearchClientService,
      mockCaller as unknown as ElasticsearchSearchCaller,
    )
  })

  describe('search', () => {
    it('nên map hits ES sang KeywordHit[], dùng index theo org (isolation per-tenant)', async () => {
      mockEsClient.search.mockResolvedValue({
        hits: {
          hits: [
            { _id: 'k1', _source: { content: 'body 1', title: 'Doc 1' }, _score: 3.2 },
            { _id: 'k2', _source: { content: 'body 2', title: 'Doc 2' }, _score: 1.1 },
          ],
        },
      })

      const result = await repo.search('org-1', 'query text', 10)

      expect(mockEsClient.search).toHaveBeenCalledWith(
        expect.objectContaining({ index: 'knowledge-org-1', size: 10 }),
      )
      expect(result).toEqual([
        { knowledgeItemId: 'k1', content: 'body 1', titleSnapshot: 'Doc 1', score: 3.2 },
        { knowledgeItemId: 'k2', content: 'body 2', titleSnapshot: 'Doc 2', score: 1.1 },
      ])
    })

    it('nên trả về [] (KHÔNG throw) khi ES trả 404 — org chưa từng được index, đây là steady-state hợp lệ chứ không phải fault', async () => {
      mockEsClient.search.mockRejectedValue({ meta: { statusCode: 404 } })

      const result = await repo.search('org-never-indexed', 'q', 10)

      expect(result).toEqual([])
    })

    it('nên rethrow lỗi ES khác 404 (fault thật) để breaker đếm đúng', async () => {
      mockEsClient.search.mockRejectedValue({ meta: { statusCode: 500 } })

      await expect(repo.search('org-1', 'q', 10)).rejects.toBeTruthy()
    })

    it('nên gọi search qua caller.call() (circuit breaker), không gọi client trực tiếp bên ngoài', async () => {
      mockEsClient.search.mockResolvedValue({ hits: { hits: [] } })

      await repo.search('org-1', 'q', 10)

      expect(mockCaller.call).toHaveBeenCalledTimes(1)
    })
  })

  describe('indexItem', () => {
    it('nên upsert theo knowledgeItemId, KHÔNG đi qua caller.call() (bảo vệ bởi Kafka retry→DLQ ở tầng message, không cần breaker chồng lên)', async () => {
      mockEsClient.index.mockResolvedValue({})

      await repo.indexItem({
        knowledgeItemId: 'k1',
        orgId: 'org-1',
        spaceId: 'space-1',
        title: 'T',
        content: 'C',
      })

      expect(mockEsClient.index).toHaveBeenCalledWith(
        expect.objectContaining({ index: 'knowledge-org-1', id: 'k1' }),
      )
      expect(mockCaller.call).not.toHaveBeenCalled()
    })
  })
})
