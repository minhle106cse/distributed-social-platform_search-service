import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import * as grpc from '@grpc/grpc-js'
import { LogContext, RagQueryService } from '@distributed-social-platform/shared-kernel'
import { RagQueryGrpcService } from '@/infrastructure/grpc/rag-query.grpc-service'

/**
 * search-service's first gRPC SERVER (it has only ever been a client, calling
 * core-api's MembershipVerification). Same shape as core-api's
 * GrpcServerBootstrap: a real Nest provider so main.ts does
 * `app.get(GrpcServerBootstrap).start()` instead of hand-threading dependencies.
 */
@Injectable()
export class GrpcServerBootstrap {
  constructor(
    private readonly ragQueryService: RagQueryGrpcService,
    @InjectPinoLogger(GrpcServerBootstrap.name) private readonly logger: PinoLogger,
    private readonly config: ConfigService,
  ) {}

  start(): grpc.Server {
    const server = new grpc.Server()
    server.addService(RagQueryService, this.ragQueryService)

    const port = this.config.getOrThrow<number>('env.grpcPort')
    server.bindAsync(
      `0.0.0.0:${port}`,
      grpc.ServerCredentials.createInsecure(),
      (err, boundPort) => {
        if (err) {
          this.logger.error({ context: LogContext.GRPC, err }, 'Failed to start gRPC server')
          return
        }
        this.logger.info(
          { context: LogContext.GRPC },
          `🔌 gRPC (RagQuery) listening on port ${boundPort}`,
        )
      },
    )

    return server
  }
}
