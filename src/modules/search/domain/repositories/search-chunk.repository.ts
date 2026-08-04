export interface InsertChunkRow {
  knowledgeItemId: string
  orgId: string
  spaceId: string
  chunkIndex: number
  content: string
  titleSnapshot: string
  embedding: number[]
}

export interface SearchHit {
  knowledgeItemId: string
  content: string
  titleSnapshot: string
  score: number // cosine similarity (1 - distance), higher = closer
}

export const SEARCH_CHUNK_READER = Symbol('SEARCH_CHUNK_READER')

/**
 * The pgvector chunk index. Split by direction in ADR-0001, because the two
 * directions have opposite transaction needs:
 *
 * - WRITE (`ISearchChunkRepository`) is a delete+insert that must be atomic, so it
 *   only exists inside `SearchTxScope`.
 * - READ (`ISearchChunkReader`) is the search hot path, called per query with no
 *   transaction at all — opening one for it would take a connection for nothing.
 *
 * `SearchHit[]` is still an intermediate input to RRF fusion in
 * SearchKnowledgeService, not the endpoint's response DTO (that is SearchResult),
 * which is why the read port lives here in domain/ rather than in application/queries/.
 */
export interface ISearchChunkRepository {
  /** Re-index an item: delete its old chunks and insert the new set atomically. */
  replaceForItem(itemId: string, rows: InsertChunkRow[]): Promise<void>
}

export interface ISearchChunkReader {
  /** Top-K nearest chunks by cosine distance, scoped to org. */
  semanticSearch(orgId: string, queryVec: number[], topK: number): Promise<SearchHit[]>
}
