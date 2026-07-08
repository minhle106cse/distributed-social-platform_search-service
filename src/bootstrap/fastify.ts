import { NestFastifyApplication } from '@nestjs/platform-fastify'
import helmet from '@fastify/helmet'
import cors from '@fastify/cors'
import compress from '@fastify/compress'
import fastifyCookie from '@fastify/cookie'
import { setupSwagger } from './swagger'

export async function setupFastify(app: NestFastifyApplication) {
  const fastify = app.getHttpAdapter().getInstance()

  // Parse cookies so JwtAuthGuard can read the httpOnly accessToken set by
  // auth-service (cookie-first auth; Bearer stays as fallback).
  await fastify.register(fastifyCookie)

  await fastify.register(cors, {
    origin: process.env.CORS_ALLOWED_ORIGINS?.split(',') || ['http://localhost:3001'],
    credentials: true,
  })

  // Rate limiting via @nestjs/throttler (NestJS-native, supports per-route) —
  // NOT @fastify/rate-limit (see microservice_architecture.md).
  await fastify.register(helmet)

  // /health and /metrics: skip compression. Not a fix for a reproduced bug
  // here — auth-service hit a deterministic @fastify/compress bug on its
  // /metrics route (gzip requests truncated to 0 bytes under Prometheus's
  // 15s scrape cadence); this service never showed the symptom, but these
  // two routes gain nothing from compression (small, low-traffic, infra-only)
  // so disabling it removes any chance of the same class of bug here too.
  // NestJS's @Get() doesn't expose Fastify's route `config` directly, so set
  // it via onRoute (must run before compress registers its own onRoute hook,
  // which reads routeOptions.config.compress at route-registration time).
  fastify.addHook('onRoute', (routeOptions) => {
    if (routeOptions.url === '/health' || routeOptions.url === '/metrics') {
      routeOptions.config = { ...routeOptions.config, compress: false }
    }
  })

  await fastify.register(compress, {
    encodings: ['gzip', 'deflate', 'br'],
  })

  setupSwagger(app)
}
