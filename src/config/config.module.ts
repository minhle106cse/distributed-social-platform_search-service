import { Module } from '@nestjs/common'
import { ConfigModule as NestConfigModule } from '@nestjs/config'
import { envConfig } from './env.config'
import { validate } from './env.validation'

@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      validate,
      // Service-only secrets (.env.secrets — ANTHROPIC_API_KEY/GEMINI_API_KEY,
      // only this service reads them) take precedence, then shared infra
      // config. Neither file overlaps on keys, so precedence order doesn't
      // change behavior today — listed local-first as convention.
      envFilePath: ['.env.secrets', '../../.env'],
      load: [envConfig],
    }),
  ],
})
export class ConfigModule {}
