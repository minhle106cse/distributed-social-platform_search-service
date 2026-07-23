import { Injectable } from '@nestjs/common'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import { CircuitBreaker } from '@distributed-social-platform/shared-kernel'

/**
 * SRP wrapper — the ONLY job of this class is running a call through the
 * 'claude-summarizer' CircuitBreaker (resilience_patterns.md §3.1.2). Prompt-
 * building/response-parsing business logic stays in ClaudeSummarizer, which
 * injects this. Mirrors KnowledgeIndexerConsumer's shape (small, single-
 * purpose file wrapping one resilience primitive) — that's what makes a
 * protected call grep-able/obvious, not dependency injection by itself (a
 * generic shared breaker service injected everywhere would only tell you
 * WHICH CLASS has access, not WHICH CALL is protected).
 */
@Injectable()
export class ClaudeApiCaller {
  private readonly breaker: CircuitBreaker

  constructor(@InjectPinoLogger(ClaudeApiCaller.name) logger: PinoLogger) {
    this.breaker = new CircuitBreaker('claude-summarizer', logger)
  }

  call<T>(fn: () => Promise<T>): Promise<T> {
    return this.breaker.execute(fn)
  }
}
