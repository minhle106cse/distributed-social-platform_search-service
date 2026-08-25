import { Injectable, OnModuleDestroy } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import Redis from 'ioredis'
import { LogContext, type ICacheStore } from '@distributed-social-platform/shared-kernel'

/**
 * Redis adapter behind shared-kernel's `ICacheStore`, used by search-service for
 * membership lookups (RemoteOrgMembershipGuard).
 *
 * WHY THIS LIVES HERE AND NOT IN shared-kernel: `check:arch` check H bans
 * `ioredis` from shared-kernel — the kernel owns algorithms, never live
 * connections (same rule that keeps kafkajs out and makes `MinimalConsumer`
 * mirror its API). Each service therefore owns its own client, exactly like
 * `OrgAwareThrottlerGuard` stays per-service while `CircuitBreaker` is shared.
 * The duplication is the rule working, not a miss.
 *
 * ⚠️ NEVER THROWS, by contract (see `ICacheStore`). Every method swallows and
 * logs. A cache sits in FRONT of an authoritative source, so an unreachable
 * Redis must degrade to a miss — re-query the source — rather than fail a
 * request. Since callers here are authz guards, a throwing cache would turn a
 * Redis hiccup into a site-wide 500 on permission checks.
 */
@Injectable()
export class RedisCacheStore implements ICacheStore, OnModuleDestroy {
  private readonly redis: Redis

  constructor(
    config: ConfigService,
    @InjectPinoLogger(RedisCacheStore.name) private readonly logger: PinoLogger,
  ) {
    this.redis = new Redis(config.getOrThrow<string>('env.redisUrl'), {
      // ioredis queues commands while disconnected and replays them on reconnect.
      // On a hot authz path that turns "Redis is down" into unbounded latency
      // instead of an instant miss — fail the command immediately and let the
      // caller go to the source.
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      lazyConnect: false,
    })
    // Without a listener, ioredis emits 'error' on an EventEmitter with none
    // attached, which Node escalates to an uncaught exception and kills the
    // process — a dead cache must never do that.
    this.redis.on('error', (err) => {
      this.logger.warn({ context: LogContext.CACHE, err }, 'Redis cache unavailable')
    })
  }

  async get(key: string): Promise<string | null> {
    try {
      return await this.redis.get(key)
    } catch (err) {
      this.logger.warn(
        { context: LogContext.CACHE, err, key },
        'Cache read failed — treating as miss',
      )
      return null
    }
  }

  async set(key: string, value: string, ttlMs: number): Promise<void> {
    try {
      await this.redis.set(key, value, 'PX', ttlMs)
    } catch (err) {
      this.logger.warn({ context: LogContext.CACHE, err, key }, 'Cache write failed — ignored')
    }
  }

  async del(key: string): Promise<void> {
    try {
      await this.redis.del(key)
    } catch (err) {
      // Logged at warn, not debug: unlike a failed read or write this leaves a
      // STALE entry readable until its TTL expires, so it is worth seeing.
      this.logger.warn({ context: LogContext.CACHE, err, key }, 'Cache invalidation failed')
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis.quit().catch(() => undefined)
  }
}
