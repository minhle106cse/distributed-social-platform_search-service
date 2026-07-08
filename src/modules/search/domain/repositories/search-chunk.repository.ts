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

export const SEARCH_CHUNK_REPOSITORY = Symbol('SEARCH_CHUNK_REPOSITORY')

/**
 * The pgvector chunk index — a write-model with an internal read, not an HTTP
 * query-side repo. `replaceForItem` is the write (fed by the IndexKnowledge
 * event handler); `semanticSearch` is an internal lookup whose `SearchHit[]`
 * is an intermediate input to RRF fusion in SearchKnowledgeService, NOT the
 * endpoint's response DTO (that is SearchResult). Both directions live in the
 * event/service pipeline, so this belongs in domain/repositories/ alongside
 * other write-model repos — mirrors notification's space-follower projection.
 */
export interface ISearchChunkRepository {
  /** Re-index an item: delete its old chunks and insert the new set atomically. */
  replaceForItem(itemId: string, rows: InsertChunkRow[]): Promise<void>
  /** Top-K nearest chunks by cosine distance, scoped to org. */
  semanticSearch(orgId: string, queryVec: number[], topK: number): Promise<SearchHit[]>
}
