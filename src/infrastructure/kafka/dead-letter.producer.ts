import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import { Producer } from 'kafkajs'
import {
  deadLetterTopic,
  LogContext,
  type DeadLetterInput,
} from '@distributed-social-platform/shared-kernel'
import { dlqCounter } from '@/infrastructure/observability/search.metrics'
import { KafkaClientService } from './kafka-client.service'

/**
 * Routes a terminally-failed message to `<topic>.DLQ` so it is isolated for triage
 * instead of dropped (silent data loss) or replayed forever (partition stall). The
 * original bytes + key are preserved; failure context travels in headers.
 */
@Injectable()
export class DeadLetterProducer implements OnModuleInit, OnModuleDestroy {
  private readonly producer: Producer

  constructor(
    kafkaClient: KafkaClientService,
    @InjectPinoLogger(DeadLetterProducer.name) private readonly logger: PinoLogger,
  ) {
    // maxInFlightRequests:5 is the Kafka-documented ceiling for idempotence to
    // preserve ordering under retries — kafkajs does not set it automatically.
    this.producer = kafkaClient.client.producer({ idempotent: true, maxInFlightRequests: 5 })
  }

  async onModuleInit(): Promise<void> {
    await this.producer.connect()
  }

  async onModuleDestroy(): Promise<void> {
    await this.producer.disconnect()
  }

  async send(input: DeadLetterInput): Promise<void> {
    const dlqTopic = deadLetterTopic(input.topic)

    await this.producer.send({
      topic: dlqTopic,
      messages: [
        {
          key: input.key ?? undefined,
          value: input.value ?? '',
          headers: {
            'x-dlq-reason': input.reason,
            'x-dlq-error': input.error.slice(0, 2000),
            'x-original-topic': input.topic,
            'x-original-partition': String(input.partition),
            'x-original-offset': input.offset,
            'x-dlq-at': new Date().toISOString(),
          },
        },
      ],
    })

    dlqCounter.inc({ reason: input.reason })

    this.logger.warn(
      { context: LogContext.EVENT_ROUTER, dlqTopic, reason: input.reason, offset: input.offset },
      'Message dead-lettered',
    )
  }
}
