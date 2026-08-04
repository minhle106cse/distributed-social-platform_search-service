import { Injectable, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import {
  EventRouter,
  ResilientEventConsumer,
  KafkaTopic,
  type MinimalEachMessagePayload,
} from '@distributed-social-platform/shared-kernel'
import { KafkaClientService } from '@/infrastructure/kafka/kafka-client.service'
import { DeadLetterProducer } from '@/infrastructure/kafka/dead-letter.producer'
import { handlerRetryCounter } from '@/infrastructure/observability/search.metrics'
import { IndexKnowledgeHandler } from '../../application/events/index-knowledge/index-knowledge.handler'

/**
 * Consumer #2 — indexes published knowledge for search (embed-on-publish).
 * All at-least-once mechanics (retry → DLQ, offset discipline) live in
 * shared-kernel's ResilientEventConsumer; this class is only wiring.
 */
@Injectable()
export class KnowledgeIndexerConsumer implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly runner: ResilientEventConsumer
  private readonly router: EventRouter

  constructor(
    kafkaClient: KafkaClientService,
    config: ConfigService,
    deadLetter: DeadLetterProducer,
    indexKnowledgeHandler: IndexKnowledgeHandler,
    @InjectPinoLogger(KnowledgeIndexerConsumer.name) logger: PinoLogger,
  ) {
    const groupId = config.getOrThrow<string>('env.kafkaSearchIndexerGroup')

    this.router = new EventRouter(logger).register(indexKnowledgeHandler)

    this.runner = new ResilientEventConsumer({
      consumer: kafkaClient.createConsumer<MinimalEachMessagePayload>({ groupId }),
      topics: [KafkaTopic.KNOWLEDGE_EVENTS],
      router: this.router,
      deadLetter,
      logger,
      maxRetries: config.getOrThrow<number>('env.kafkaConsumerMaxRetries'),
      retryBackoffMs: config.getOrThrow<number>('env.kafkaConsumerRetryBackoffMs'),
      onRetry: (eventType) => handlerRetryCounter.inc({ eventType }),
    })
  }

  /**
   * Runs AFTER every module's `onModuleInit` — kept here (not `onModuleInit`)
   * so the consumer only starts once the whole app is up. No TxScope
   * validation step any more (2026-07-30 collapse): PrismaTxRunner's repos
   * factory is now a plain constructor dependency, wired by Nest's own DI
   * graph — there is nothing left that could be forgotten at a separate
   * registration step.
   */
  onApplicationBootstrap() {
    return this.runner.start()
  }

  onModuleDestroy() {
    return this.runner.stop()
  }
}
