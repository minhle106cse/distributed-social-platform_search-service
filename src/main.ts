import 'reflect-metadata'
import { collectDefaultMetrics } from 'prom-client'
import { ConfigService } from '@nestjs/config'
import { createApp } from './app'

collectDefaultMetrics()

async function bootstrap() {
  const app = await createApp()
  const config = app.get(ConfigService)

  const port = config.getOrThrow<number>('env.port')
  await app.listen({ port, host: '0.0.0.0' })
}

bootstrap().catch((err) => {
  console.error('Fatal error during bootstrap:', err)
  process.exit(1)
})
