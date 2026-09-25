import { Module } from '@nestjs/common'
import { ConfigModule as NestConfigModule } from '@nestjs/config'
import { envConfig } from './env.config'
import { EnvValidation } from './env.validation'

@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      validate: (config) => EnvValidation.validate(config),
      // `.env.secrets` (gitignored, per-service secrets) → `.env` (gitignored,
      // per-service non-sensitive config) → `.env.shared` (root, non-sensitive
      // config every service loads). Most specific wins on overlap — neither
      // ConfigModule nor dotenv overwrites a key already in process.env.
      // Root `.env` is INFRA-ONLY now (docker-compose/docker-init); apps no
      // longer load it. See .ai/plans/env-split-per-service.plan.md §3-4.
      envFilePath: ['.env.secrets', '.env', '../../.env.shared'],
      load: [envConfig],
    }),
  ],
})
export class ConfigModule {}
