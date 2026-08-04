import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Kafka, type ConsumerConfig } from 'kafkajs'
import type {
  MinimalConsumer,
  MinimalProducer,
} from '@distributed-social-platform/shared-kernel'

@Injectable()
export class KafkaClientService {
  readonly client: Kafka

  constructor(config: ConfigService) {
    this.client = new Kafka({
      clientId: config.getOrThrow<string>('env.kafkaClientId'),
      brokers: config.getOrThrow<string[]>('env.kafkaBrokers'),
    })
  }

  /**
   * Single entry point for "give me a shared-kernel-shaped consumer" — every
   * consumer in this service goes through this instead of touching
   * `this.client.consumer(...)` directly, so there is exactly one place that
   * knows how a `MinimalConsumer<T>` is built from this service's Kafka client.
   *
   * A raw kafkajs `Consumer` already has every method `MinimalConsumer<T>`
   * needs (shared-kernel types that contract structurally so the package
   * stays free of a kafkajs dependency) — the cast is the only thing an
   * unconstrained generic `TPayload` needs from TS here; there is no runtime
   * behavior to add, so no wrapper class is needed to add it.
   */
  createConsumer<TPayload>(config: ConsumerConfig): MinimalConsumer<TPayload> {
    return this.client.consumer(config) as unknown as MinimalConsumer<TPayload>
  }

  /** Same reasoning as `createConsumer`. Idempotent — dedups on kafkajs's own
   * broker-side retries. `maxInFlightRequests: 5` is the Kafka-documented
   * ceiling for idempotence to preserve ordering under retries; kafkajs does
   * not set it automatically from `idempotent: true`. */
  createProducer(): MinimalProducer {
    return this.client.producer({
      idempotent: true,
      maxInFlightRequests: 5,
    })
  }
}
