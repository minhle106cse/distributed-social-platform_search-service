import { Injectable } from '@nestjs/common'
import { Prisma } from '@/generated'
import { PrismaService } from '@/infrastructure/database/prisma/prisma.service'
import { chunksIndexedCounter } from '@/infrastructure/observability/search.metrics'
import type {
  InsertChunkRow,
  ISearchChunkRepository,
  SearchHit,
} from '../../application/repositories/search-chunk.repository.interface'

// pgvector has no Prisma type — vectors are read/written via raw SQL. A vector
// literal is '[f1,f2,...]' cast to ::vector.
function toVectorLiteral(v: number[]): string {
  return `[${v.join(',')}]`
}

@Injectable()
export class PrismaSearchChunkRepository implements ISearchChunkRepository {
  constructor(private readonly prisma: PrismaService) {}

  async replaceForItem(itemId: string, rows: InsertChunkRow[]): Promise<void> {
    await this.prisma.client.$transaction(async (tx) => {
      await tx.knowledgeChunk.deleteMany({ where: { knowledgeItemId: itemId } })

      for (const r of rows) {
        const vec = toVectorLiteral(r.embedding)
        await tx.$executeRaw`
          INSERT INTO knowledge_chunks
            (id, knowledge_item_id, org_id, space_id, chunk_index, content, title_snapshot, embedding, created_at)
          VALUES
            (gen_random_uuid(), ${r.knowledgeItemId}, ${r.orgId}, ${r.spaceId}, ${r.chunkIndex}, ${r.content}, ${r.titleSnapshot}, ${vec}::vector, NOW())
        `
      }
    })

    if (rows.length > 0) chunksIndexedCounter.inc(rows.length)
  }

  async semanticSearch(orgId: string, queryVec: number[], topK: number): Promise<SearchHit[]> {
    const vec = toVectorLiteral(queryVec)
    const rows = await this.prisma.client.$queryRaw<
      { knowledge_item_id: string; content: string; title_snapshot: string; score: number }[]
    >(Prisma.sql`
      SELECT knowledge_item_id, content, title_snapshot,
             1 - (embedding <=> ${vec}::vector) AS score
      FROM knowledge_chunks
      WHERE org_id = ${orgId} AND embedding IS NOT NULL
      ORDER BY embedding <=> ${vec}::vector
      LIMIT ${topK}
    `)

    return rows.map((r) => ({
      knowledgeItemId: r.knowledge_item_id,
      content: r.content,
      titleSnapshot: r.title_snapshot,
      score: r.score,
    }))
  }
}
