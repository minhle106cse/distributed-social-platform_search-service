import { Controller, Get, Res } from '@nestjs/common'
import { SkipThrottle } from '@nestjs/throttler'
import type { FastifyReply } from 'fastify'
import { register } from 'prom-client'
import { PrismaService } from '@/infrastructure/database/prisma/prisma.service'

@Controller()
@SkipThrottle()
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

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
