import { PrismaSearchChunkRepository } from './prisma-search-chunk.repository'
import type { Prisma } from '@/generated'
import type { InsertChunkRow } from '../../domain/repositories/search-chunk.repository'

describe('PrismaSearchChunkRepository', () => {
  let repo: PrismaSearchChunkRepository
  let mockDeleteMany: jest.Mock
  let mockExecuteRaw: jest.Mock

  beforeEach(() => {
    mockDeleteMany = jest.fn().mockResolvedValue({ count: 0 })
    mockExecuteRaw = jest.fn().mockResolvedValue(1)

    // The repository is handed an ALREADY-OPEN transaction client now, so the mock
    // IS that client — there is no $transaction of its own left to stub (ADR-0001).
    const mockTx = {
      knowledgeChunk: { deleteMany: mockDeleteMany },
      $executeRaw: mockExecuteRaw,
    } as unknown as Prisma.TransactionClient

    repo = new PrismaSearchChunkRepository(mockTx)
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

      expect(mockDeleteMany).toHaveBeenCalledWith({ where: { knowledgeItemId: 'item-1' } })
      expect(mockExecuteRaw).toHaveBeenCalledTimes(2)
    })

    it('nên chỉ xoá (không insert gì) khi rows rỗng — dùng để clear hết chunk của 1 item', async () => {
      await repo.replaceForItem('item-1', [])

      expect(mockDeleteMany).toHaveBeenCalledWith({ where: { knowledgeItemId: 'item-1' } })
      expect(mockExecuteRaw).not.toHaveBeenCalled()
    })
  })
})
