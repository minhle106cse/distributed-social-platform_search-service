import { Injectable } from '@nestjs/common'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import { CircuitBreaker } from '@distributed-social-platform/shared-kernel'

/**
 * SRP wrapper — the ONLY job of this class is running a call through the
 * 'membership-verification-grpc' CircuitBreaker (resilience_patterns.md
 * §3.1.2), same convention as ElasticsearchSearchCaller/OllamaEmbeddingCaller.
 */
@Injectable()
export class MembershipVerificationGrpcCaller {
  private readonly breaker: CircuitBreaker

  constructor(@InjectPinoLogger(MembershipVerificationGrpcCaller.name) logger: PinoLogger) {
    this.breaker = new CircuitBreaker('membership-verification-grpc', logger)
  }

  call<T>(fn: () => Promise<T>): Promise<T> {
    return this.breaker.execute(fn)
  }
}
