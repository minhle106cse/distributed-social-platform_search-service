export interface InsertChunkRow {
  knowledgeItemId: string
  orgId: string
  spaceId: string
  chunkIndex: number
  content: string
  titleSnapshot: string
  embedding: number[]
}

/**
 * WRITE port for the pgvector chunk index (ADR-0001). Only exists inside
 * `SearchTxScope` — command repository interface, returns nothing (a delete+
 * insert unit of work), no entity/mapper here since search-service has no
 * domain entity for a chunk (it's a flat row, not an aggregate).
 *
 * The READ side (`ISearchChunkReader`, `SearchHit`) used to live in this same
 * file — moved to `application/repositories/search-chunk.query-repository.ts`
 * 2026-08-20: nothing in `domain/` consumes it (only
 * `SearchKnowledgeService`, an application-layer class, does), so per
 * `cqrs_pattern.md`'s read-port rule it belongs in application, not domain.
 * Contrast with `IOrgRolePermissionReader` (core-api tenant module), which
 * DOES stay in domain because a domain service depends on it directly.
 */
export interface ISearchChunkRepository {
  /** Re-index an item: delete its old chunks and insert the new set atomically. */
  replaceForItem(itemId: string, rows: InsertChunkRow[]): Promise<void>
}
