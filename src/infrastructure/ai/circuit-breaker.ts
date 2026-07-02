import type { PinoLogger } from 'nestjs-pino'

type State = 'closed' | 'open' | 'half-open'

/**
 * Circuit Breaker for AI calls (rag_ai_integration.md §3). After `threshold`
 * consecutive failures it trips OPEN and fails fast for `timeoutMs` (no calls
 * hit the failing dependency), then HALF-OPENs to probe recovery. One success
 * closes it. Keeps a flaky/slow AI provider from becoming the search latency.
 */
export class CircuitBreaker {
  private state: State = 'closed'
  private failureCount = 0
  private lastFailureTime = 0

  constructor(
    private readonly logger: PinoLogger,
    private readonly threshold = 5,
    private readonly timeoutMs = 60_000,
  ) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (Date.now() - this.lastFailureTime > this.timeoutMs) {
        this.state = 'half-open'
      } else {
        throw new Error('AI service circuit open')
      }
    }

    try {
      const result = await fn()
      this.onSuccess()
      return result
    } catch (err) {
      this.onFailure(err)
      throw err
    }
  }

  get currentState(): State {
    return this.state
  }

  private onSuccess(): void {
    if (this.state !== 'closed') {
      this.logger.info({ state: 'closed' }, 'AI circuit recovered — closing')
    }
    this.failureCount = 0
    this.state = 'closed'
  }

  private onFailure(err: unknown): void {
    this.failureCount++
    this.lastFailureTime = Date.now()
    this.logger.warn({ err, failureCount: this.failureCount }, 'AI call failed')
    if (this.failureCount >= this.threshold && this.state !== 'open') {
      this.state = 'open'
      this.logger.error({ state: 'open' }, 'Circuit breaker OPEN — AI service unavailable')
    }
  }
}
