import { Injectable } from '@nestjs/common'
import type { IRepoFactory } from '@distributed-social-platform/shared-kernel'
import type { Prisma } from '@/generated'
import type { SearchTxScope } from '../domain/search-tx-scope'
import { PrismaSearchChunkRepository } from './repositories/prisma-search-chunk.repository'

@Injectable()
export class SearchTxScopeFactory implements IRepoFactory<SearchTxScope, Prisma.TransactionClient> {
  create(tx: Prisma.TransactionClient): SearchTxScope {
    return { chunks: new PrismaSearchChunkRepository(tx) }
  }
}
