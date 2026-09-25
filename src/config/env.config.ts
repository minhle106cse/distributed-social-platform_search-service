import { registerAs } from '@nestjs/config'
import { InternalServiceName } from '@distributed-social-platform/shared-kernel'
import { EnvValidation } from './env.validation'

/**
 * Single source of truth for defaults is envValidationSchema — this factory
 * only reshapes the already-validated/coerced env into camelCase, it never
 * re-declares a default value (that used to drift silently from the schema).
 */
export const envConfig = registerAs('env', () => {
  const env = EnvValidation.validate(process.env)
  return {
    nodeEnv: env.NODE_ENV,
    port: env.SEARCH_SERVICE_PORT,
    corsAllowedOrigins: env.CORS_ALLOWED_ORIGINS,
    redisUrl: env.REDIS_URL,
    kafkaBrokers: env.KAFKA_BROKERS.split(','),
    kafkaClientId: env.SEARCH_KAFKA_CLIENT_ID,
    // Own consumer group (concern = search indexing) — separate from notification.
    kafkaSearchIndexerGroup: env.KAFKA_SEARCH_INDEXER_GROUP,
    kafkaConsumerMaxRetries: env.KAFKA_CONSUMER_MAX_RETRIES,
    kafkaConsumerRetryBackoffMs: env.KAFKA_CONSUMER_RETRY_BACKOFF_MS,
    kafkaDlqReplayConsumerGroup: env.KAFKA_DLQ_REPLAY_CONSUMER_GROUP,
    kafkaDlqMaxReplays: env.KAFKA_DLQ_MAX_REPLAYS,
    kafkaDlqReplayBaseDelayMs: env.KAFKA_DLQ_REPLAY_BASE_DELAY_MS,
    kafkaDlqReplayMaxDelayMs: env.KAFKA_DLQ_REPLAY_MAX_DELAY_MS,
    embeddingServiceUrl: env.EMBEDDING_SERVICE_URL,
    embeddingModel: env.EMBEDDING_MODEL,
    embeddingDim: env.EMBEDDING_DIM,
    elasticsearchUrl: env.ELASTICSEARCH_URL,
    elasticUsername: env.ELASTIC_USERNAME,
    elasticPassword: env.ELASTIC_PASSWORD,
    summarizerProvider: env.SUMMARIZER_PROVIDER,
    anthropicApiKey: env.ANTHROPIC_API_KEY,
    ragModel: env.RAG_MODEL,
    geminiApiKey: env.GEMINI_API_KEY,
    geminiModel: env.GEMINI_MODEL,
    coreGrpcUrl: env.CORE_GRPC_URL,
    grpcPort: env.SEARCH_GRPC_PORT,
    // Stored base64 so a multi-line PEM survives .env files and container env vars.
    internalAssertionPrivateKey: Buffer.from(env.INTERNAL_ASSERTION_PRIVATE_KEY, 'base64').toString(
      'utf-8',
    ),
    jwksUrls: {
      [InternalServiceName.AuthService]: env.AUTH_JWKS_URL,
      [InternalServiceName.CoreApi]: env.CORE_API_JWKS_URL,
    },
  }
})
