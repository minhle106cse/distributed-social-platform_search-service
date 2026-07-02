import { z } from 'zod'

export const envValidationSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  SEARCH_SERVICE_PORT: z.coerce.number().default(4004),
  CORS_ALLOWED_ORIGINS: z.string().default('http://localhost:3001'),
  SEARCH_DATABASE_URL: z.string().url(),
  JWT_PUBLIC_KEY: z.string().min(100),
  KAFKA_BROKERS: z.string().default('localhost:9092'),
  KAFKA_CLIENT_ID: z.string().default('search-service'),
  KAFKA_SEARCH_INDEXER_GROUP: z.string().default('search-service-indexer-group'),
  KAFKA_CONSUMER_MAX_RETRIES: z.coerce.number().int().min(0).default(3),
  KAFKA_CONSUMER_RETRY_BACKOFF_MS: z.coerce.number().int().min(0).default(500),
  // Embeddings (self-hosted local — NOT Claude). Ollama nomic-embed-text, dim 768.
  EMBEDDING_SERVICE_URL: z.string().url(),
  EMBEDDING_MODEL: z.string().default('nomic-embed-text'),
  EMBEDDING_DIM: z.coerce.number().int().positive().default(768),
  // Elasticsearch (BM25 keyword side of hybrid search).
  ELASTICSEARCH_URL: z.string().url().default('http://localhost:9200'),
  ELASTIC_USERNAME: z.string().default('elastic'),
  ELASTIC_PASSWORD: z.string().min(1),
  // RAG summarization. Provider swappable behind ISummarizer (same circuit
  // breaker). Keys may be empty — the breaker degrades to no-summary on failure.
  SUMMARIZER_PROVIDER: z.enum(['claude', 'gemini']).default('claude'),
  ANTHROPIC_API_KEY: z.string().default(''),
  RAG_MODEL: z.string().default('claude-opus-4-8'), // Claude alias, NOT date-suffixed
  GEMINI_API_KEY: z.string().default(''),
  GEMINI_MODEL: z.string().default('gemini-2.5-flash'),
})

export function validate(config: Record<string, unknown>) {
  const result = envValidationSchema.safeParse(config)
  if (!result.success) {
    throw new Error(`Environment variables validation failed: ${result.error.message}`)
  }
  return result.data
}
