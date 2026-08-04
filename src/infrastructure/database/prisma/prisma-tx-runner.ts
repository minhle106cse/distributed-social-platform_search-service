import { Injectable } from '@nestjs/common'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import { AbstractTxRunner } from '@distributed-social-platform/shared-kernel'
import type { Prisma } from '@/generated'
import { PrismaService } from './prisma.service'
import type { SearchTxScope } from '@/modules/search/domain/search-tx-scope'
import { SearchTxScopeFactory } from '@/modules/search/infrastructure/search-tx-scope.factory'

const TRANSACTION_TIMEOUT_MS = 10_000

/**
 * The ONLY Prisma-specific line of the Unit-of-Work runner (ADR-0001) — opening
 * the interactive transaction. Everything else (nesting guard, transaction
 * logging) lives in `AbstractTxRunner` (shared-kernel), shared by every
 * service instead of copy-pasted into each one. Search-service has exactly
 * ONE repos shape, so the factory is a plain constructor dependency — no
 * registry, no boot-time registration step (2026-07-30 collapse: see
 * shared-kernel's tx-scope.ts doc for why the per-module registry was
 * removed).
 */
@Injectable()
export class PrismaTxRunner extends AbstractTxRunner<SearchTxScope, Prisma.TransactionClient> {
  constructor(
    private readonly prisma: PrismaService,
    @InjectPinoLogger(PrismaTxRunner.name) logger: PinoLogger,
    factory: SearchTxScopeFactory,
  ) {
    super(logger, factory)
  }

  protected beginTransaction<R>(fn: (db: Prisma.TransactionClient) => Promise<R>): Promise<R> {
    return this.prisma.client.$transaction(fn, { timeout: TRANSACTION_TIMEOUT_MS })
  }
}
