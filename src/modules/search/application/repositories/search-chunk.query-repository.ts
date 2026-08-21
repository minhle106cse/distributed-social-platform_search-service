export interface SearchHit {
  knowledgeItemId: string
  content: string
  titleSnapshot: string
  score: number // cosine similarity (1 - distance), higher = closer
}

export const SEARCH_CHUNK_READER = Symbol('SEARCH_CHUNK_READER')

/**
 * READ port for the pgvector chunk index (application-layer query-repo, moved
 * out of `domain/repositories/search-chunk.repository.ts` 2026-08-20). No
 * transaction (search hot path, called per query) and no domain consumer —
 * only `SearchKnowledgeService` (this same `application/queries/` layer)
 * calls it, to feed RRF fusion. `SearchHit[]` is still an intermediate input
 * to fusion, not the endpoint's response DTO (that is `SearchResult` in
 * `search-knowledge.dto.ts`), so this is a query-repo returning a plain data
 * shape, not the domain's `ISearchChunkRepository` (which takes/returns
 * entity-shaped rows through the write side).
 */
export interface ISearchChunkReader {
  /** Top-K nearest chunks by cosine distance, scoped to org. */
  semanticSearch(orgId: string, queryVec: number[], topK: number): Promise<SearchHit[]>
}
