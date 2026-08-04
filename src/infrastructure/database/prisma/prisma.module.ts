import { Global, Module } from '@nestjs/common'
import { PrismaService } from './prisma.service'

// PrismaTxRunner (and the TX_RUNNER binding) live in PrismaTxRunnerModule now,
// not here: the runner needs SearchTxScopeFactory injected at construction
// (2026-07-30 collapse — one repos factory, no registry), and that factory is
// domain-specific. PrismaModule stays generic infra: the plain client only,
// usable by any read-side repository.
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
