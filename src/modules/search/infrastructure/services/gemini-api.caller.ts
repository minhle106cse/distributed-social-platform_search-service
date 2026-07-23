import { Injectable } from '@nestjs/common'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import { CircuitBreaker } from '@distributed-social-platform/shared-kernel'

/**
 * SRP wrapper — the ONLY job of this class is running a call through the
 * 'gemini-summarizer' CircuitBreaker (resilience_patterns.md §3.1.2). URL/
 * body-building and response parsing stay in GeminiSummarizer, which injects
 * this.
 */
@Injectable()
export class GeminiApiCaller {
  private readonly breaker: CircuitBreaker

  constructor(@InjectPinoLogger(GeminiApiCaller.name) logger: PinoLogger) {
    this.breaker = new CircuitBreaker('gemini-summarizer', logger)
  }

  call<T>(fn: () => Promise<T>): Promise<T> {
    return this.breaker.execute(fn)
  }
}
