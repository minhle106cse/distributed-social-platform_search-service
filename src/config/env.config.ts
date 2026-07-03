import { registerAs } from '@nestjs/config'

export const envConfig = registerAs('env', () => ({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.SEARCH_SERVICE_PORT ?? 4004),
  corsAllowedOrigins: process.env.CORS_ALLOWED_ORIGINS,
  // JWT_PUBLIC_KEY is base64-encoded in .env (same pattern as core-api)
  jwtPublicKey: Buffer.from(process.env.JWT_PUBLIC_KEY!, 'base64').toString('utf-8'),
  kafkaBrokers: (process.env.KAFKA_BROKERS ?? 'localhost:9092').split(','),
  kafkaClientId: process.env.SEARCH_KAFKA_CLIENT_ID ?? 'search-service',
  // Own consumer group (concern = search indexing) — separate from notification.
  kafkaSearchIndexerGroup: process.env.KAFKA_SEARCH_INDEXER_GROUP ?? 'search-service-indexer-group',
  kafkaConsumerMaxRetries: Number(process.env.KAFKA_CONSUMER_MAX_RETRIES ?? 3),
  kafkaConsumerRetryBackoffMs: Number(process.env.KAFKA_CONSUMER_RETRY_BACKOFF_MS ?? 500),
  embeddingServiceUrl: process.env.EMBEDDING_SERVICE_URL ?? 'http://localhost:8085',
  embeddingModel: process.env.EMBEDDING_MODEL ?? 'nomic-embed-text',
  embeddingDim: Number(process.env.EMBEDDING_DIM ?? 768),
  elasticsearchUrl: process.env.ELASTICSEARCH_URL ?? 'http://localhost:9200',
  elasticUsername: process.env.ELASTIC_USERNAME ?? 'elastic',
  elasticPassword: process.env.ELASTIC_PASSWORD ?? '',
  summarizerProvider: process.env.SUMMARIZER_PROVIDER ?? 'claude',
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? '',
  ragModel: process.env.RAG_MODEL ?? 'claude-opus-4-8',
  geminiApiKey: process.env.GEMINI_API_KEY ?? '',
  geminiModel: process.env.GEMINI_MODEL ?? 'gemini-2.5-flash',
}))
