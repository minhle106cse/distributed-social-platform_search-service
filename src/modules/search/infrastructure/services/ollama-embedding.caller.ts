import { Injectable } from '@nestjs/common'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import { CircuitBreaker } from '@distributed-social-platform/shared-kernel'

/**
 * SRP wrapper — the ONLY job of this class is running a call through the
 * 'ollama-embedding' CircuitBreaker (resilience_patterns.md §3.1.2). Batching/
 * request-building/response-shape validation stay in HttpEmbeddingService,
 * which injects this.
 */
@Injectable()
export class OllamaEmbeddingCaller {
  private readonly breaker: CircuitBreaker

  constructor(@InjectPinoLogger(OllamaEmbeddingCaller.name) logger: PinoLogger) {
    this.breaker = new CircuitBreaker('ollama-embedding', logger)
  }

  call<T>(fn: () => Promise<T>): Promise<T> {
    return this.breaker.execute(fn)
  }
}
