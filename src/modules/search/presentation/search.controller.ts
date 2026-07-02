import { BadRequestException, Body, Controller, Headers, Post, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '@/infrastructure/http/guards/jwt-auth.guard'
import { SearchKnowledgeService } from '../application/queries/search-knowledge.service'
import { SearchDto } from './schemas/search.schema'

@Controller('search')
@UseGuards(JwtAuthGuard)
export class SearchController {
  constructor(private readonly searchService: SearchKnowledgeService) {}

  // POST /api/v1/search — hybrid search + RAG summary, scoped to the caller's org.
  // No OrgGuard (search-service has no memberships); org comes from X-Org-Id.
  @Post()
  async search(@Body() dto: SearchDto, @Headers('x-org-id') orgId?: string) {
    if (!orgId) throw new BadRequestException('X-Org-Id header is required')
    return this.searchService.search(orgId, dto.query, dto.topK, dto.summarize)
  }
}
