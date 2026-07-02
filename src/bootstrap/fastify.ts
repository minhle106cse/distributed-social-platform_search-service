import { NestFastifyApplication } from '@nestjs/platform-fastify'
import helmet from '@fastify/helmet'
import cors from '@fastify/cors'
import compress from '@fastify/compress'
import { setupSwagger } from './swagger'

export async function setupFastify(app: NestFastifyApplication) {
  const fastify = app.getHttpAdapter().getInstance()

  await fastify.register(cors, {
    origin: process.env.CORS_ALLOWED_ORIGINS?.split(',') || ['http://localhost:3001'],
    credentials: true,
  })

  // Rate limiting via @nestjs/throttler (NestJS-native, supports per-route) —
  // NOT @fastify/rate-limit (see microservice_architecture.md).
  await fastify.register(helmet)

  await fastify.register(compress, {
    encodings: ['gzip', 'deflate', 'br'],
  })

  setupSwagger(app)
}
