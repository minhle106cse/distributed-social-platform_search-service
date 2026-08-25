import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { FastifyRequest } from 'fastify'
import { verifyAccessToken } from '@distributed-social-platform/shared-kernel'
import type { AccessTokenClaims } from '@distributed-social-platform/shared-kernel'

// Alias giữ nguyên tên cũ: các file khác import { JwtPayload } từ guard này.
export type JwtPayload = AccessTokenClaims

/**
 * Nest shell around shared-kernel's `verifyAccessToken` — the actual signature
 * check, RS256 pinning and claim normalisation live there, shared with core-api
 * and notification-service whose guards were byte-identical to this one
 * (2026-08-25 audit). What stays here is what must stay per-service: reading
 * config and translating a failure into this service's HTTP semantics.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<FastifyRequest>()
    const token = this.extractToken(request)

    if (!token) throw new UnauthorizedException('Token not found')

    const publicKey = this.configService.get<string>('env.jwtPublicKey')
    if (!publicKey) throw new UnauthorizedException('JWT public key not configured')

    try {
      const payload = verifyAccessToken(token, publicKey)
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
