import { config } from 'dotenv'
import { join } from 'path'
// Prisma CLI has no NestJS ConfigModule — mirror config.module.ts's load
// order by hand. Most specific first: SEARCH_DATABASE_URL lives in
// .env.secrets now, not root .env (env-split-per-service.plan.md §5.1).
config({ path: join(process.cwd(), '.env.secrets') })
config({ path: join(process.cwd(), '.env') })
config({ path: join(process.cwd(), '../../.env.shared') })
import { defineConfig } from 'prisma/config'

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: { url: process.env.SEARCH_DATABASE_URL! },
})
