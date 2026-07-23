import { Inject, Injectable } from '@nestjs/common'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import { LogContext } from '@distributed-social-platform/shared-kernel'
import type { IEmbeddingService } from '../../domain/services/embedding.service'
import { EMBEDDING_SERVICE } from '../../domain/services/embedding.service'
import type {
  ISearchChunkRepository,
  SearchHit,
} from '../../domain/repositories/search-chunk.repository'
import { SEARCH_CHUNK_REPOSITORY } from '../../domain/repositories/search-chunk.repository'
import type {
  IKeywordSearchRepository,
  KeywordHit,
} from '../../domain/repositories/keyword-search.repository'
import { KEYWORD_SEARCH_REPOSITORY } from '../../domain/repositories/keyword-search.repository'
import type { ISummarizer } from '../../domain/services/summarizer'
import { SUMMARIZER } from '../../domain/services/summarizer'
import type { RankedItem, SearchResult } from './search-knowledge.dto'

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
    // NOT named `fetch` — that would shadow the global fetch in this scope.
    const fetchCount = Math.max(topK * 2, 10)
    const startedAt = Date.now()
    // search-service has no CQRS bus (rag_ai_integration.md), so it doesn't
    // get LoggingMiddleware's automatic "executing/succeeded+duration"
    // lifecycle log for free like every other service's commands/queries do
    // — this is the hand-written equivalent for the single most
    // latency/cost-sensitive operation in the system (audit 2026-07-22).
    // Query text logged at debug only (not info) — same volume discipline
    // LoggingMiddleware applies to full command payloads.
    this.logger.debug(
      { context: LogContext.QUERY_BUS, orgId, topK, summarize, query },
      'Search executing',
    )

    const [semanticChunks, keywordHits] = await Promise.all([
      this.semanticSearch(orgId, query, fetchCount),
      this.keywordRepo.search(orgId, query, fetchCount).catch((err: unknown) => {
        this.logger.warn(
          { context: LogContext.QUERY_BUS, err },
          'Keyword search failed — degrading to semantic-only',
        )
        return [] as KeywordHit[]
      }),
    ])

    const semanticItems = this.dedupeToItems(semanticChunks)
    const chunks = this.rrfMerge(semanticItems, keywordHits).slice(0, topK)

    // RAG summary is best-effort: a Claude failure or an open circuit degrades to
    // chunks-only (summary: null) — search must not die with the AI provider.
    let result: SearchResult
    if (!summarize || chunks.length === 0) {
      result = { chunks, summary: null, sources: [] }
    } else {
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
          this.logger.warn(
            { context: LogContext.QUERY_BUS, err },
            'RAG summarization unavailable — returning chunks only',
          )
          return null
        })
      result = { chunks, summary: summary?.text ?? null, sources: summary?.sources ?? [] }
    }

    // DEBUG, not INFO: search is a read (query). logging_standard.md's bus rule
    // mandates queries log at debug — reads are high-frequency and the HTTP layer
    // already logged this request at info, so a second info line per search is
    // the exact noise that rule forbids. The genuinely-interesting cases (ES/RAG/
    // embedding degraded) are already surfaced at warn above; this line is just
    // the happy-path profiling detail (chunk count, RAG hit, business duration).
    this.logger.debug(
      {
        context: LogContext.QUERY_BUS,
        orgId,
        resultCount: result.chunks.length,
        hasSummary: result.summary !== null,
        durationMs: Date.now() - startedAt,
      },
      'Search completed',
    )
    return result
  }

  // Embedding (Ollama) is on this same synchronous hot path — if it's down/timed
  // out/circuit-open, degrade to keyword-only instead of failing the whole search.
  // Was previously un-caught (asymmetric with the keyword side, which already
  // degraded) — a slow/dead embedder used to 500 the entire query.
  private async semanticSearch(orgId: string, query: string, fetchCount: number): Promise<SearchHit[]> {
    try {
      const [queryVec] = await this.embedding.embedBatch([query])
      return await this.chunkRepo.semanticSearch(orgId, queryVec, fetchCount)
    } catch (err) {
      this.logger.warn(
        { context: LogContext.QUERY_BUS, err },
        'Semantic search unavailable — degrading to keyword-only',
      )
      return []
    }
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
