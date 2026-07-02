import { Inject, Injectable } from '@nestjs/common'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import type { IEmbeddingService } from '../../domain/services/embedding.service'
import { EMBEDDING_SERVICE } from '../../domain/services/embedding.service'
import type {
  ISearchChunkRepository,
  SearchHit,
} from '../repositories/search-chunk.repository.interface'
import { SEARCH_CHUNK_REPOSITORY } from '../repositories/search-chunk.repository.interface'
import type {
  IKeywordSearchRepository,
  KeywordHit,
} from '../repositories/keyword-search.repository.interface'
import { KEYWORD_SEARCH_REPOSITORY } from '../repositories/keyword-search.repository.interface'
import type { ISummarizer, SummarySource } from '../../domain/services/summarizer'
import { SUMMARIZER } from '../../domain/services/summarizer'

export interface RankedItem {
  knowledgeItemId: string
  content: string
  titleSnapshot: string
  score: number
}

export interface SearchResult {
  chunks: RankedItem[]
  summary: string | null
  sources: SummarySource[]
}

const RRF_K = 60 // standard constant (Cormack et al.)

/**
 * Hybrid search (C2): semantic (pgvector) + keyword (Elasticsearch BM25) run in
 * parallel and are fused with Reciprocal Rank Fusion. RRF needs only ranks, not
 * comparable scores, so it merges the two very different scoring scales cleanly.
 * Elasticsearch being down degrades to semantic-only — search never dies with it.
 */
@Injectable()
export class SearchKnowledgeService {
  constructor(
    @Inject(EMBEDDING_SERVICE) private readonly embedding: IEmbeddingService,
    @Inject(SEARCH_CHUNK_REPOSITORY) private readonly chunkRepo: ISearchChunkRepository,
    @Inject(KEYWORD_SEARCH_REPOSITORY) private readonly keywordRepo: IKeywordSearchRepository,
    @Inject(SUMMARIZER) private readonly summarizer: ISummarizer,
    @InjectPinoLogger(SearchKnowledgeService.name) private readonly logger: PinoLogger,
  ) {}

  async search(
    orgId: string,
    query: string,
    topK: number,
    summarize: boolean,
  ): Promise<SearchResult> {
    const [queryVec] = await this.embedding.embedBatch([query])
    // NOT named `fetch` — that would shadow the global fetch in this scope.
    const fetchCount = Math.max(topK * 2, 10)

    const [semanticChunks, keywordHits] = await Promise.all([
      this.chunkRepo.semanticSearch(orgId, queryVec, fetchCount),
      this.keywordRepo.search(orgId, query, fetchCount).catch((err: unknown) => {
        this.logger.warn({ err }, 'Keyword search failed — degrading to semantic-only')
        return [] as KeywordHit[]
      }),
    ])

    const semanticItems = this.dedupeToItems(semanticChunks)
    const chunks = this.rrfMerge(semanticItems, keywordHits).slice(0, topK)

    // RAG summary is best-effort: a Claude failure or an open circuit degrades to
    // chunks-only (summary: null) — search must not die with the AI provider.
    if (!summarize || chunks.length === 0) {
      return { chunks, summary: null, sources: [] }
    }

    const summary = await this.summarizer
      .summarize(
        query,
        chunks.map((c) => ({
          knowledgeItemId: c.knowledgeItemId,
          titleSnapshot: c.titleSnapshot,
          content: c.content,
        })),
      )
      .catch((err: unknown) => {
        this.logger.warn({ err }, 'RAG summarization unavailable — returning chunks only')
        return null
      })

    return { chunks, summary: summary?.text ?? null, sources: summary?.sources ?? [] }
  }

  // Semantic search is chunk-level; collapse to the best-ranked chunk per item so
  // fusion happens at item granularity (same as the keyword side).
  private dedupeToItems(chunks: SearchHit[]): RankedItem[] {
    const seen = new Set<string>()
    const items: RankedItem[] = []
    for (const c of chunks) {
      if (seen.has(c.knowledgeItemId)) continue
      seen.add(c.knowledgeItemId)
      items.push({
        knowledgeItemId: c.knowledgeItemId,
        content: c.content,
        titleSnapshot: c.titleSnapshot,
        score: c.score,
      })
    }
    return items
  }

  // RRF: score(item) = Σ 1 / (k + rank) over each list the item appears in.
  private rrfMerge(semantic: RankedItem[], keyword: KeywordHit[]): RankedItem[] {
    const scores = new Map<string, number>()
    const repr = new Map<string, { content: string; titleSnapshot: string }>()

    semantic.forEach((item, rank) => {
      scores.set(item.knowledgeItemId, (scores.get(item.knowledgeItemId) ?? 0) + 1 / (RRF_K + rank))
      // Prefer the semantic chunk snippet as the representative content.
      repr.set(item.knowledgeItemId, { content: item.content, titleSnapshot: item.titleSnapshot })
    })
    keyword.forEach((hit, rank) => {
      scores.set(hit.knowledgeItemId, (scores.get(hit.knowledgeItemId) ?? 0) + 1 / (RRF_K + rank))
      if (!repr.has(hit.knowledgeItemId)) {
        repr.set(hit.knowledgeItemId, { content: hit.content, titleSnapshot: hit.titleSnapshot })
      }
    })

    return [...scores.entries()]
      .sort(([, a], [, b]) => b - a)
      .map(([knowledgeItemId, score]) => ({
        knowledgeItemId,
        score,
        content: repr.get(knowledgeItemId)?.content ?? '',
        titleSnapshot: repr.get(knowledgeItemId)?.titleSnapshot ?? '',
      }))
  }
}
