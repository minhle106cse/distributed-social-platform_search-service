import { Counter } from 'prom-client'

/**
 * Observability for the indexing pipeline. Registered on the prom-client default
 * registry → surface on GET /metrics. Module-level singletons (Node caches the
 * module) so imports share one instance.
 */

// Terminal failures isolated to <topic>.DLQ.
export const dlqCounter = new Counter({
  name: 'search_dlq_total',
  help: 'Messages routed to the dead-letter queue',
  labelNames: ['reason'] as const,
})

// Bounded retries spent before a handler succeeded or was dead-lettered.
export const handlerRetryCounter = new Counter({
  name: 'search_handler_retry_total',
  help: 'Handler retry attempts (transient failures)',
  labelNames: ['eventType'] as const,
})

// Chunks embedded + indexed (throughput signal).
export const chunksIndexedCounter = new Counter({
  name: 'search_chunks_indexed_total',
  help: 'Knowledge chunks embedded and written to the vector store',
})

// DlqReplayConsumer (review of ADR-0001, 2026-07-30) — a message successfully
// replayed back to its original topic after sitting in the DLQ.
export const dlqReplayedCounter = new Counter({
  name: 'search_dlq_replayed_total',
  help: 'DLQ messages replayed back to their original topic',
  labelNames: ['originalTopic'] as const,
})

// Replay budget exhausted — the message stays in the DLQ topic (Kafka
// retention) but this consumer stops touching it. Any non-zero rate needs a
// human to look at the DLQ topic directly.
export const dlqGiveUpCounter = new Counter({
  name: 'search_dlq_give_up_total',
  help: 'DLQ messages that exhausted their replay budget — needs manual triage',
  labelNames: ['originalTopic'] as const,
})
