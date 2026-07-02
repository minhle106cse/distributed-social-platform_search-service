import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

export const searchSchema = z.object({
  query: z.string().trim().min(1),
  topK: z.coerce.number().int().min(1).max(50).default(10),
  // Set false to skip the Claude RAG summary (cheaper, chunks only).
  summarize: z.boolean().default(true),
})

export class SearchDto extends createZodDto(searchSchema) {}
