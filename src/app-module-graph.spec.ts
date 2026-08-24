import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'

/**
 * The only check in this repo that can see a Nest WIRING defect.
 *
 * typecheck, lint and the unit tests are all blind to it: a provider that no
 * module supplies, a token nobody binds, a module removed from `AppModule` —
 * every one of those compiles cleanly and only explodes at boot. That is exactly
 * how core-api's GrpcModule came to be reachable purely as a side effect of two
 * feature modules importing it (2026-08-24 audit).
 *
 * `preview: true` builds the whole dependency graph WITHOUT instantiating
 * providers or running `onModuleInit` — so this needs no Postgres, no Kafka, no
 * Elasticsearch, and still fails on `Nest can't resolve dependencies of X`
 * (verified by deleting GrpcModule from search-service's AppModule: it reported
 * `RemoteOrgMembershipGuard (?, Reflector)` exactly as it should).
 *
 * Env validation DOES still run in preview mode, and `.env` lives outside the
 * repo — a missing one is an environment problem, not a wiring defect, so it
 * warns and returns instead of failing. Everything else rethrows.
 */
it('AppModule dependency graph resolves', async () => {
  try {
    const app = await NestFactory.create(AppModule, {
      logger: false,
      abortOnError: false,
      preview: true,
    })
    await app.close()
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (/Environment variables validation failed/i.test(msg)) {
      console.warn('[app-module-graph] skipped — .env not available in this environment')
      return
    }
    throw err
  }
}, 60000)
