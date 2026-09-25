import { Controller, Get, Inject, Res } from '@nestjs/common'
import { SkipThrottle } from '@nestjs/throttler'
import type { FastifyReply } from 'fastify'
import { register } from 'prom-client'
import {
  INTERNAL_ASSERTION_SIGNER,
  Jwks,
  type InternalAssertionSigner,
} from '@distributed-social-platform/shared-kernel'
import { PrismaService } from '@/infrastructure/database/prisma/prisma.service'

@Controller()
@SkipThrottle()
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(INTERNAL_ASSERTION_SIGNER) private readonly signer: InternalAssertionSigner,
  ) {}

  // RFC 7517 — the public half of search-service's internal-assertion signing
  // key, so core-api can verify search-service's gRPC calls without a copied
  // env key. Raw `{ keys: [...] }`, bypassing ResponseInterceptor via `@Res()`.
  @Get('.well-known/jwks.json')
  jwks(@Res() reply: FastifyReply) {
    reply
      .header('Cache-Control', 'public, max-age=300')
      .send(Jwks.buildJwkSet([this.signer.publicKey]))
  }

  @Get('health')
  async health(@Res() reply: FastifyReply) {
    const dbOk = await this.checkDb()
    reply.code(dbOk ? 200 : 503).send({
      status: dbOk ? 'ok' : 'degraded',
      service: 'search-service',
      uptime: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
      checks: {
        database: dbOk ? 'ok' : 'error',
      },
    })
  }

  @Get('metrics')
  async metrics(@Res() reply: FastifyReply) {
    reply.header('Content-Type', register.contentType)
    reply.send(await register.metrics())
  }

  private async checkDb(): Promise<boolean> {
    try {
      await this.prisma.client.$queryRaw`SELECT 1`
      return true
    } catch {
      return false
    }
  }
}
