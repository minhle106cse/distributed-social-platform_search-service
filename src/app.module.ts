import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common'
import { LoggerModule } from 'nestjs-pino'
import { APP_INTERCEPTOR, APP_FILTER, APP_GUARD } from '@nestjs/core'
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler'
import { createLogger } from '@distributed-social-platform/shared-kernel'
import { ConfigModule } from './config/config.module'
import { PrismaModule } from './infrastructure/database/prisma/prisma.module'
import { KafkaModule } from './infrastructure/kafka/kafka.module'
import { HealthController } from './infrastructure/http/controllers/health.controller'
import { TraceContextMiddleware } from './infrastructure/http/middlewares/trace-context.middleware'
import { HttpLoggingInterceptor } from './infrastructure/http/interceptors/http-logging.interceptor'
import { ResponseInterceptor } from './infrastructure/http/interceptors/response.interceptor'
import { GlobalExceptionFilter } from './infrastructure/http/filter/global-exception.filter'
import { SearchModule } from './modules/search/search.module'

@Module({
  controllers: [HealthController],
  imports: [
    ConfigModule,
    PrismaModule,
    KafkaModule,
    SearchModule,
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    LoggerModule.forRootAsync({
      useFactory: () => ({
        pinoHttp: {
          logger: createLogger('search-service'),
          autoLogging: {
            ignore: (req) => req.url === '/health' || req.url === '/metrics',
          },
          customAttributeKeys: {
            req: 'request',
            res: 'response',
            err: 'error',
            responseTime: 'responseTime',
          },
        },
      }),
    }),
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    HttpLoggingInterceptor,
    { provide: APP_INTERCEPTOR, useClass: HttpLoggingInterceptor },
    ResponseInterceptor,
    { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
    GlobalExceptionFilter,
    { provide: APP_FILTER, useClass: GlobalExceptionFilter },
    TraceContextMiddleware,
  ],
})
export class AppModule implements NestModule {
  // Mở trace context (AsyncLocalStorage) cho mọi request, sớm nhất có thể —
  // trước đây search-service KHÔNG có bất kỳ correlation-id nào ở HTTP layer
  // (chỉ Kafka consumer side có, qua ResilientEventConsumer) — audit
  // resilience_patterns.md §7 (2026-07-22).
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(TraceContextMiddleware).forRoutes('*')
  }
}
