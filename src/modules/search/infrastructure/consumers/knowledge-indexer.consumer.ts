import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import { EventRouter, ResilientEventConsumer } from '@distributed-social-platform/shared-kernel'
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
export class KnowledgeIndexerConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly runner: ResilientEventConsumer

  constructor(
    kafkaClient: KafkaClientService,
    config: ConfigService,
    deadLetter: DeadLetterProducer,
    indexKnowledgeHandler: IndexKnowledgeHandler,
    @InjectPinoLogger(KnowledgeIndexerConsumer.name) logger: PinoLogger,
  ) {
    const groupId =
      config.get<string>('env.kafkaSearchIndexerGroup') ?? 'search-service-indexer-group'

    this.runner = new ResilientEventConsumer({
      consumer: kafkaClient.client.consumer({ groupId }),
      topics: ['knowledge-events'],
      router: new EventRouter(logger).register(indexKnowledgeHandler),
      deadLetter,
      logger,
      maxRetries: config.get<number>('env.kafkaConsumerMaxRetries') ?? 3,
      retryBackoffMs: config.get<number>('env.kafkaConsumerRetryBackoffMs') ?? 500,
      onRetry: (eventType) => handlerRetryCounter.inc({ eventType }),
    })
  }

  onModuleInit() {
    return this.runner.start()
  }

  onModuleDestroy() {
    return this.runner.stop()
  }
}
