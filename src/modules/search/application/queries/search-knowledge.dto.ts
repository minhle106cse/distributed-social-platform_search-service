import type { SummarySource } from '../../domain/services/summarizer.service'

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
