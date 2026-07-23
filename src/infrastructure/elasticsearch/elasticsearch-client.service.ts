import { Injectable, OnModuleDestroy } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Client } from '@elastic/elasticsearch'

// Client library default is 30s — far too long for a call sitting on the
// synchronous search hot path (resilience_patterns.md §3.1). Indexing (also on
// this client) tolerates it fine since it's already retry→DLQ safe at the
// Kafka-consumer level; a shared timeout this size is still a big improvement
// over unbounded.
const REQUEST_TIMEOUT_MS = 5000

/**
 * Singleton Elasticsearch client (mirrors KafkaClientService). http + basic auth
 * (the local cluster runs security-on but TLS-off). Feature code injects this and
 * uses `.client`, never `new Client()`.
 */
@Injectable()
export class ElasticsearchClientService implements OnModuleDestroy {
  readonly client: Client

  constructor(config: ConfigService) {
    this.client = new Client({
      node: config.getOrThrow<string>('env.elasticsearchUrl'),
      auth: {
        username: config.getOrThrow<string>('env.elasticUsername'),
        password: config.getOrThrow<string>('env.elasticPassword'),
      },
      requestTimeout: REQUEST_TIMEOUT_MS,
    })
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.close()
  }
}
