import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common'
import { FastifyRequest } from 'fastify'
import {
  PUBLIC_KEY_RESOLVER,
  AccessTokenVerifier,
} from '@distributed-social-platform/shared-kernel'
import type {
  AccessTokenClaims,
  PublicKeyResolver,
} from '@distributed-social-platform/shared-kernel'

// Alias giữ nguyên tên cũ: các file khác import { JwtPayload } từ guard này.
export type JwtPayload = AccessTokenClaims

/**
 * Nest shell around shared-kernel's `AccessTokenVerifier.verify` — the actual signature
 * check, RS256 pinning and claim normalisation live there, shared with core-api
 * and notification-service whose guards were byte-identical to this one
 * (2026-08-25 audit). What stays here is what must stay per-service: reading
 * config and translating a failure into this service's HTTP semantics.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(@Inject(PUBLIC_KEY_RESOLVER) private readonly resolver: PublicKeyResolver) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<FastifyRequest>()
    const token = this.extractToken(request)

    if (!token) throw new UnauthorizedException('Token not found')

    try {
      const payload = await AccessTokenVerifier.verify(token, this.resolver)
      ;(request as FastifyRequest & { user: JwtPayload }).user = payload
      return true
    } catch {
      throw new UnauthorizedException('Invalid token')
    }
  }

  private extractToken(request: FastifyRequest): string | undefined {
    const cookie = (request as FastifyRequest & { cookies?: Record<string, string> }).cookies
      ?.accessToken
    if (cookie) return cookie

    const [type, token] = request.headers.authorization?.split(' ') ?? []
    return type === 'Bearer' ? token : undefined
  }
}
