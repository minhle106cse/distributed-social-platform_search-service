export interface SummaryContext {
  knowledgeItemId: string
  titleSnapshot: string
  content: string
}

export interface SummarySource {
  knowledgeItemId: string
  titleSnapshot: string
}

export interface RagSummary {
  text: string
  sources: SummarySource[]
}

export const SUMMARIZER = Symbol('SUMMARIZER')

export interface ISummarizer {
  /** Grounded answer synthesised from the retrieved chunks. Throws if the AI
   *  provider is unavailable (circuit open) — the caller degrades to no summary. */
  summarize(query: string, context: SummaryContext[]): Promise<RagSummary>
}
