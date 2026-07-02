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

export interface ISearchChunkRepository {
  /** Re-index an item: delete its old chunks and insert the new set atomically. */
  replaceForItem(itemId: string, rows: InsertChunkRow[]): Promise<void>
  /** Top-K nearest chunks by cosine distance, scoped to org. */
  semanticSearch(orgId: string, queryVec: number[], topK: number): Promise<SearchHit[]>
}
