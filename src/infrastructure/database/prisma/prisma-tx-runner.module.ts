import { Global, Module } from '@nestjs/common'
import { TX_RUNNER } from '@distributed-social-platform/shared-kernel'
import { PrismaTxRunner } from './prisma-tx-runner'
import { SearchTxScopeFactory } from '@/modules/search/infrastructure/search-tx-scope.factory'

/**
 * Global for the same reason PrismaModule is: any consumer needing TX_RUNNER
 * (e.g. IndexKnowledgeHandler) must be able to resolve it regardless of
 * which module declared it, and Nest only shares a provider across sibling
 * top-level modules automatically when it's global.
 *
 * Split out of PrismaModule (generic ORM client, no domain knowledge)
 * because PrismaTxRunner needs SearchTxScopeFactory (domain-specific)
 * injected at construction — one repos factory per service, no more
 * `registerScope()` call in `onModuleInit` (2026-07-30 collapse; see
 * shared-kernel's tx-scope.ts doc for why the per-module registry was
 * removed). Nest's own DI graph now guarantees construction order instead of
 * a hand-written lifecycle hook.
 */
@Global()
@Module({
  providers: [
    SearchTxScopeFactory,
    PrismaTxRunner,
    { provide: TX_RUNNER, useExisting: PrismaTxRunner },
  ],
  exports: [PrismaTxRunner, TX_RUNNER],
})
export class PrismaTxRunnerModule {}
