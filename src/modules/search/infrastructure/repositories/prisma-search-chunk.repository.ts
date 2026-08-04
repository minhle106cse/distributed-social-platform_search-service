import { Prisma } from '@/generated'
import { chunksIndexedCounter } from '@/infrastructure/observability/search.metrics'
import type {
  ISearchChunkRepository,
  InsertChunkRow,
} from '../../domain/repositories/search-chunk.repository'

// pgvector has no Prisma type — vectors are read/written via raw SQL. A vector
// literal is '[f1,f2,...]' cast to ::vector.
function toVectorLiteral(v: number[]): string {
  return `[${v.join(',')}]`
}

/**
 * Built per-transaction by `SearchTxScopeFactory` (ADR-0001).
 *
 * Note what disappeared: this used to open its own `$transaction` for the
 * delete+insert, and then had to check for an ambient one first to avoid nesting.
 * The caller now owns the transaction boundary, so the whole special case is gone —
 * the atomicity is simply a property of being inside a scope.
 */
export class PrismaSearchChunkRepository implements ISearchChunkRepository {
  constructor(private readonly db: Prisma.TransactionClient) {}

  async replaceForItem(itemId: string, rows: InsertChunkRow[]): Promise<void> {
    await this.db.knowledgeChunk.deleteMany({ where: { knowledgeItemId: itemId } })

    for (const r of rows) {
      const vec = toVectorLiteral(r.embedding)
      await this.db.$executeRaw`
        INSERT INTO knowledge_chunks
          (id, knowledge_item_id, org_id, space_id, chunk_index, content, title_snapshot, embedding, created_at)
        VALUES
          (gen_random_uuid(), ${r.knowledgeItemId}, ${r.orgId}, ${r.spaceId}, ${r.chunkIndex}, ${r.content}, ${r.titleSnapshot}, ${vec}::vector, NOW())
      `
    }

    if (rows.length > 0) chunksIndexedCounter.inc(rows.length)
  }
}
