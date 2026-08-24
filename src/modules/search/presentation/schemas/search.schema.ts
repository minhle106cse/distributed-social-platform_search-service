import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

/**
 * `summarize` is deliberately NOT a parameter here (removed 2026-08-22, Phase 5b).
 *
 * The RAG summary is the thing the AI-Query Saga charges credit for. While this
 * endpoint accepted `summarize: true`, any caller with KNOWLEDGE_READ could get
 * the identical Claude answer for free — two doors to the same RAG, one billed
 * and one not, which makes the billing decorative. Public HTTP search is now
 * retrieval only (hybrid BM25 + pgvector, chunks back); the summary path is
 * reachable only over internal gRPC (proto/ai-query.proto), behind the saga.
 */
export const searchSchema = z.object({
  query: z.string().trim().min(1),
  topK: z.coerce.number().int().min(1).max(50).default(10),
})

export class SearchDto extends createZodDto(searchSchema) {}
