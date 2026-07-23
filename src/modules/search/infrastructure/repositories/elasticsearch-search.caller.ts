import { Injectable } from '@nestjs/common'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import { CircuitBreaker } from '@distributed-social-platform/shared-kernel'

/**
 * SRP wrapper — the ONLY job of this class is running a call through the
 * 'elasticsearch-search' CircuitBreaker (resilience_patterns.md §3.1.2).
 * Query-building/404-handling/result-mapping stay in
 * ElasticsearchKeywordRepository, which injects this. Only search() uses it —
 * indexItem() is Kafka-consumer-triggered and already retry→DLQ safe at the
 * message level (eventing_patterns.md §4 Inbound).
 */
@Injectable()
export class ElasticsearchSearchCaller {
  private readonly breaker: CircuitBreaker

  constructor(@InjectPinoLogger(ElasticsearchSearchCaller.name) logger: PinoLogger) {
    this.breaker = new CircuitBreaker('elasticsearch-search', logger)
  }

  call<T>(fn: () => Promise<T>): Promise<T> {
    return this.breaker.execute(fn)
  }
}
