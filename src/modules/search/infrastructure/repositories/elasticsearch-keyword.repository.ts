import { Injectable } from '@nestjs/common'
import { ElasticsearchClientService } from '@/infrastructure/elasticsearch/elasticsearch-client.service'
import { ElasticsearchSearchCaller } from './elasticsearch-search.caller'
import type {
  IKeywordSearchRepository,
  IndexItemDoc,
  KeywordHit,
} from '../../domain/repositories/keyword-search.repository'

interface ItemSource {
  orgId: string
  spaceId: string
  title: string
  content: string
}

@Injectable()
export class ElasticsearchKeywordRepository implements IKeywordSearchRepository {
  constructor(
    private readonly es: ElasticsearchClientService,
    private readonly caller: ElasticsearchSearchCaller,
  ) {}

  // Per-tenant index → natural isolation, no cross-tenant filter needed. orgId is
  // a uuid (lowercase hex + hyphens) so it's a valid index name.
  private indexFor(orgId: string): string {
    return `knowledge-${orgId}`
  }

  async indexItem(doc: IndexItemDoc): Promise<void> {
    await this.es.client.index<ItemSource>({
      index: this.indexFor(doc.orgId),
      id: doc.knowledgeItemId, // upsert by item id → idempotent re-index
      document: {
        orgId: doc.orgId,
        spaceId: doc.spaceId,
        title: doc.title,
        content: doc.content,
      },
      refresh: 'wait_for', // searchable on the next refresh (≤1s), no forced global refresh
    })
  }

  async search(orgId: string, query: string, limit: number): Promise<KeywordHit[]> {
    return this.caller.call(async () => {
      try {
        const res = await this.es.client.search<ItemSource>({
          index: this.indexFor(orgId),
          size: limit,
          query: {
            multi_match: {
              query,
              fields: ['title^3', 'content'], // boost title
              fuzziness: 'AUTO',
            },
          },
        })

        return res.hits.hits.map((hit) => ({
          knowledgeItemId: hit._id ?? '',
          content: hit._source?.content ?? '',
          titleSnapshot: hit._source?.title ?? '',
          score: hit._score ?? 0,
        }))
      } catch (err) {
        // Org has never been indexed yet → no index → treat as no keyword hits.
        // Caught HERE (inside the caller's wrapped body) and returned
        // normally, not rethrown — this is an expected steady-state case, not
        // a fault, and must not count toward tripping the breaker.
        if ((err as { meta?: { statusCode?: number } })?.meta?.statusCode === 404) return []
        throw err
      }
    })
  }
}
