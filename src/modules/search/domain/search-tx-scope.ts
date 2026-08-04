import type { ISearchChunkRepository } from './repositories/search-chunk.repository'

/**
 * Write-side Unit of Work for the pgvector side of indexing (ADR-0001).
 * Search-service has exactly one of these — no per-module split, no token
 * (2026-07-30 collapse; see shared-kernel's tx-scope.ts doc for why).
 *
 * Deliberately does NOT include the Elasticsearch repository: no transaction can
 * span Postgres and Elasticsearch, and pretending otherwise by putting it in this
 * scope would be exactly the false safety this architecture exists to remove. The
 * two stores stay consistent through idempotency + consumer retry/DLQ instead —
 * see eventing_patterns.md §4.3.
 */
export interface SearchTxScope {
  readonly chunks: ISearchChunkRepository
}
