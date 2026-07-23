import { PrismaSearchChunkRepository } from './prisma-search-chunk.repository'
import type { PrismaService } from '@/infrastructure/database/prisma/prisma.service'
import type { InsertChunkRow } from '../../domain/repositories/search-chunk.repository'

describe('PrismaSearchChunkRepository', () => {
  let repo: PrismaSearchChunkRepository
  let mockDeleteMany: jest.Mock
  let mockExecuteRaw: jest.Mock
  let mockQueryRaw: jest.Mock
  let mockTransaction: jest.Mock

  beforeEach(() => {
    mockDeleteMany = jest.fn().mockResolvedValue({ count: 0 })
    mockExecuteRaw = jest.fn().mockResolvedValue(1)
    mockQueryRaw = jest.fn()
    // $transaction runs the callback against a tx client exposing the same
    // shape as the outer client — mirror that here instead of a separate mock.
    mockTransaction = jest.fn((cb: (tx: unknown) => Promise<unknown>) =>
      cb({ knowledgeChunk: { deleteMany: mockDeleteMany }, $executeRaw: mockExecuteRaw }),
    )

    const mockPrismaService = {
      client: {
        $transaction: mockTransaction,
        $queryRaw: mockQueryRaw,
      },
    } as unknown as PrismaService

    repo = new PrismaSearchChunkRepository(mockPrismaService)
  })

  describe('replaceForItem', () => {
    it('nên xoá hết chunk cũ của item rồi insert lại toàn bộ chunk mới, trong CÙNG 1 transaction (replace-semantics, không phải append)', async () => {
      const rows: InsertChunkRow[] = [
        {
          knowledgeItemId: 'item-1',
          orgId: 'org-1',
          spaceId: 'space-1',
          chunkIndex: 0,
          content: 'chunk 0',
          titleSnapshot: 'Doc',
          embedding: [0.1, 0.2],
        },
        {
          knowledgeItemId: 'item-1',
          orgId: 'org-1',
          spaceId: 'space-1',
          chunkIndex: 1,
          content: 'chunk 1',
          titleSnapshot: 'Doc',
          embedding: [0.3, 0.4],
        },
      ]

      await repo.replaceForItem('item-1', rows)

      expect(mockTransaction).toHaveBeenCalledTimes(1)
      expect(mockDeleteMany).toHaveBeenCalledWith({ where: { knowledgeItemId: 'item-1' } })
      expect(mockExecuteRaw).toHaveBeenCalledTimes(2)
    })

    it('nên chỉ xoá (không insert gì) khi rows rỗng — dùng để clear hết chunk của 1 item', async () => {
      await repo.replaceForItem('item-1', [])

      expect(mockDeleteMany).toHaveBeenCalledWith({ where: { knowledgeItemId: 'item-1' } })
      expect(mockExecuteRaw).not.toHaveBeenCalled()
    })
  })

  describe('semanticSearch', () => {
    it('nên map row snake_case từ SQL sang SearchHit camelCase', async () => {
      mockQueryRaw.mockResolvedValue([
        { knowledge_item_id: 'k1', content: 'body', title_snapshot: 'Doc', score: 0.87 },
      ])

      const result = await repo.semanticSearch('org-1', [0.1, 0.2, 0.3], 5)

      expect(result).toEqual([
        { knowledgeItemId: 'k1', content: 'body', titleSnapshot: 'Doc', score: 0.87 },
      ])
    })

    it('nên trả về [] khi không có chunk nào khớp', async () => {
      mockQueryRaw.mockResolvedValue([])

      const result = await repo.semanticSearch('org-1', [0.1], 5)

      expect(result).toEqual([])
    })
  })
})
