import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Kafka } from 'kafkajs'

@Injectable()
export class KafkaClientService {
  readonly client: Kafka

  constructor(config: ConfigService) {
    this.client = new Kafka({
      clientId: config.get<string>('env.kafkaClientId') ?? 'notification-service',
      brokers: config.get<string[]>('env.kafkaBrokers') ?? ['localhost:9092'],
    })
  }
}
