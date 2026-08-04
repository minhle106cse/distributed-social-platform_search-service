import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import {
  DlqReplayConsumer as SharedDlqReplayConsumer,
  KafkaTopic,
  deadLetterTopic,
  type DlqEachMessagePayload,
} from '@distributed-social-platform/shared-kernel'
import { KafkaClientService } from '@/infrastructure/kafka/kafka-client.service'
import { dlqReplayedCounter, dlqGiveUpCounter } from '@/infrastructure/observability/search.metrics'

/**
 * Retries messages isolated to `<topic>.DLQ` after in-process retry
 * (ResilientEventConsumer) already gave up on them — see
 * `DlqReplayConsumer` (shared-kernel) for why this exists (review of
 * ADR-0001, 2026-07-30: DLQ had a durable store — the Kafka topic itself —
 * but nothing ever read it back).
 *
 * Separate consumer group from `KnowledgeIndexerConsumer` on purpose: this
 * one's offsets must never compete with or block the main consumer's, and its
 * own retry/replay cadence (minutes, not the main consumer's milliseconds) is
 * a different tuning knob entirely.
 */
@Injectable()
export class DlqReplayConsumerService implements OnModuleInit, OnModuleDestroy {
  private readonly runner: SharedDlqReplayConsumer
  // Owned here (not by SharedDlqReplayConsumer) because it needs its own
  // connect/disconnect lifecycle, same reasoning as DeadLetterProducer's producer.
  private readonly producer: ReturnType<KafkaClientService['createProducer']>

  constructor(
    kafkaClient: KafkaClientService,
    config: ConfigService,
    @InjectPinoLogger(DlqReplayConsumerService.name) logger: PinoLogger,
  ) {
    const groupId = config.getOrThrow<string>('env.kafkaDlqReplayConsumerGroup')
    this.producer = kafkaClient.createProducer()

    this.runner = new SharedDlqReplayConsumer({
      consumer: kafkaClient.createConsumer<DlqEachMessagePayload>({ groupId }),
      producer: this.producer,
      dlqTopics: [deadLetterTopic(KafkaTopic.KNOWLEDGE_EVENTS)],
      logger,
      maxReplays: config.getOrThrow<number>('env.kafkaDlqMaxReplays'),
      baseReplayDelayMs: config.getOrThrow<number>('env.kafkaDlqReplayBaseDelayMs'),
      maxReplayDelayMs: config.getOrThrow<number>('env.kafkaDlqReplayMaxDelayMs'),
      onReplay: (originalTopic) => dlqReplayedCounter.inc({ originalTopic }),
      onGiveUp: (originalTopic) => dlqGiveUpCounter.inc({ originalTopic }),
    })
  }

  async onModuleInit(): Promise<void> {
    await this.producer.connect()
    await this.runner.start()
  }

  async onModuleDestroy(): Promise<void> {
    await this.runner.stop()
    await this.producer.disconnect()
  }
}
