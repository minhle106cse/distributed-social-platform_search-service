import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Kafka } from 'kafkajs'

@Injectable()
export class KafkaClientService {
  readonly client: Kafka

  constructor(config: ConfigService) {
    this.client = new Kafka({
      clientId: config.getOrThrow<string>('env.kafkaClientId'),
      brokers: config.getOrThrow<string[]>('env.kafkaBrokers'),
    })
  }
}
