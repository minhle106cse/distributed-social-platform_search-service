import { Injectable } from '@nestjs/common'
import { Prisma } from '@/generated'
import { PrismaService } from '@/infrastructure/database/prisma/prisma.service'
import type {
  ISearchChunkReader,
  SearchHit,
} from '../../domain/repositories/search-chunk.repository'

function toVectorLiteral(v: number[]): string {
  return `[${v.join(',')}]`
}

/**
 * Read side of the pgvector index — plain client, no transaction. This is the
 * search hot path: it runs on every query and must not take a write connection.
 */
@Injectable()
export class PrismaSearchChunkQueryRepository implements ISearchChunkReader {
  constructor(private readonly prisma: PrismaService) {}

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
