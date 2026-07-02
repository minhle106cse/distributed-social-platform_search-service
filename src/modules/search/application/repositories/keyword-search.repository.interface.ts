export interface IndexItemDoc {
  knowledgeItemId: string
  orgId: string
  spaceId: string
  title: string
  content: string
}

export interface KeywordHit {
  knowledgeItemId: string
  content: string
  titleSnapshot: string
  score: number // BM25 relevance
}

export const KEYWORD_SEARCH_REPOSITORY = Symbol('KEYWORD_SEARCH_REPOSITORY')

export interface IKeywordSearchRepository {
  /** Upsert an item document into its per-tenant index (idempotent by itemId). */
  indexItem(doc: IndexItemDoc): Promise<void>
  /** BM25 keyword search within an org's index. */
  search(orgId: string, query: string, limit: number): Promise<KeywordHit[]>
}
