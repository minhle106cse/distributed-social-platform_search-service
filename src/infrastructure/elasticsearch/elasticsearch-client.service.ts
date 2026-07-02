import { Injectable, OnModuleDestroy } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Client } from '@elastic/elasticsearch'

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
      node: config.get<string>('env.elasticsearchUrl') ?? 'http://localhost:9200',
      auth: {
        username: config.get<string>('env.elasticUsername') ?? 'elastic',
        password: config.get<string>('env.elasticPassword') ?? '',
      },
    })
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.close()
  }
}
