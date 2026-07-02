import { Global, Module } from '@nestjs/common'
import { KafkaClientService } from './kafka-client.service'
import { DeadLetterProducer } from './dead-letter.producer'

@Global()
@Module({
  providers: [KafkaClientService, DeadLetterProducer],
  exports: [KafkaClientService, DeadLetterProducer],
})
export class KafkaModule {}
