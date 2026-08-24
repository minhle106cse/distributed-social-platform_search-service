import 'reflect-metadata'
import { collectDefaultMetrics } from 'prom-client'
import { ConfigService } from '@nestjs/config'
import { Logger } from 'nestjs-pino'
import { LogContext } from '@distributed-social-platform/shared-kernel'
import { createApp } from './app'
import { GrpcServerBootstrap } from './bootstrap/grpc'

collectDefaultMetrics()

const SHUTDOWN_TIMEOUT_MS = 10_000

async function bootstrap() {
  const app = await createApp()
  const config = app.get(ConfigService)
  const logger = app.get(Logger)

  const port = config.getOrThrow<number>('env.port')
  await app.listen({ port, host: '0.0.0.0' })

  // search-service is now a gRPC SERVER too (proto/ai-query.proto — core-api's
  // AI-Query Saga calls in for the paid RAG path), not just a client.
  const grpcServer = app.get(GrpcServerBootstrap).start()

  // Stop accepting new HTTP requests, let in-flight ones finish (bounded by
  // SHUTDOWN_TIMEOUT_MS), then exit. app.close() still runs every
  // onModuleDestroy hook (PrismaService.$disconnect, etc.) — this only adds
  // the forced-exit timeout that enableShutdownHooks() didn't have, AND
  // closes the gRPC server it doesn't know about
  // (resilience_patterns.md §5).
  const shutdown = (signal: string) => {
    logger.log(`${signal} received, shutting down gracefully...`, LogContext.LIFECYCLE)

    const forceExit = setTimeout(() => {
      logger.error('Graceful shutdown timed out, forcing exit', LogContext.LIFECYCLE)
      process.exit(1)
    }, SHUTDOWN_TIMEOUT_MS)
    forceExit.unref() // don't let this timer itself keep the process alive

    Promise.all([
      app.close(),
      new Promise<void>((resolve) => grpcServer.tryShutdown(() => resolve())),
    ])
      .then(() => {
        clearTimeout(forceExit)
        logger.log('Shutdown complete', LogContext.LIFECYCLE)
        process.exit(0)
      })
      .catch((err) => {
        // nestjs-pino's Logger.call() treats the LAST trailing arg as
        // `context`, not a message — (err, 'text') silently made 'text' the
        // context and DROPPED the message (verified with real pino, 2026-07-25).
        logger.error({ err, msg: 'Error during shutdown' }, LogContext.LIFECYCLE)
        process.exit(1)
      })
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT', () => shutdown('SIGINT'))
}

bootstrap().catch((err) => {
  console.error('Fatal error during bootstrap:', err)
  process.exit(1)
})
