import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { FastifyRequest } from 'fastify'
import * as jwt from 'jsonwebtoken'

export interface JwtPayload {
  sub: string
  email: string
  roles: string[]
  permissions: string[]
}

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
      const payload = jwt.verify(token, publicKey, {
        algorithms: ['RS256'],
      }) as JwtPayload
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
