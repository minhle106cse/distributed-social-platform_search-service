import { Global, Module } from '@nestjs/common'
import { CACHE_STORE } from '@distributed-social-platform/shared-kernel'
import { RedisCacheStore } from './redis-cache.store'

/**
 * Redis-backed `ICacheStore` for search-service, exported under the port token so
 * consumers depend on shared-kernel's interface, never on ioredis.
 *
 * `@Global` + imported once by AppModule — same shape as KafkaModule/GrpcModule.
 */
@Global()
@Module({
  providers: [{ provide: CACHE_STORE, useClass: RedisCacheStore }],
  exports: [CACHE_STORE],
})
export class CacheModule {}
