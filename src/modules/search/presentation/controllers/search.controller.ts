import { Body, Controller, Post, UseGuards } from '@nestjs/common'
import { Throttle } from '@nestjs/throttler'
import { OrgPermission } from '@distributed-social-platform/shared-kernel'
import { JwtAuthGuard } from '@/infrastructure/http/guards/jwt-auth.guard'
import { RemoteOrgMembershipGuard } from '@/infrastructure/http/guards/remote-org-membership.guard'
import { RequireOrgPermission } from '@/infrastructure/http/decorators/require-org-permission.decorator'
import { CurrentOrg } from '@/infrastructure/http/decorators/current-org.decorator'
import type { OrgContext } from '@/infrastructure/http/types/org-context.interface'
import { SearchKnowledgeService } from '../../application/queries/search-knowledge.service'
import { SearchDto } from '../schemas/search.schema'

@Controller('search')
@UseGuards(JwtAuthGuard, RemoteOrgMembershipGuard)
export class SearchController {
  constructor(private readonly searchService: SearchKnowledgeService) {}

  // POST /api/v1/search — hybrid search + RAG summary, scoped to the caller's org.
  // RemoteOrgMembershipGuard verifies X-Org-Id against core-api over gRPC before this
  // runs (search-service has no local Membership table to check against
  // in-process) — the header itself is no longer trusted at face value (IDOR
  // fix, resilience_patterns.md). It also checks KNOWLEDGE_READ (same
  // permission core-api's knowledge endpoints require) — plain membership was
  // NOT enough, GUEST-only-read restrictions must apply here too, not just
  // locally. `orgId` comes from @CurrentOrg (the guard's VERIFIED result), not
  // from re-reading the header — see OrgContext.
  // Tighter than global default — mỗi call chạm Elasticsearch + có thể cả Claude
  // summarize, đắt hơn nhiều so với CRUD thường.
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  @RequireOrgPermission(OrgPermission.KNOWLEDGE_READ)
  @Post()
  async search(@Body() dto: SearchDto, @CurrentOrg() org: OrgContext) {
    // summarize: false, hard-coded — see search.schema.ts. The paid RAG summary
    // is reachable only through core-api's AI-Query Saga over gRPC.
    return this.searchService.search(org.orgId, dto.query, dto.topK, false)
  }
}
