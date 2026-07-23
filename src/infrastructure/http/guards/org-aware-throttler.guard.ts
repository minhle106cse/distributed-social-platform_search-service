import { Injectable } from '@nestjs/common'
import { ThrottlerGuard } from '@nestjs/throttler'
import type { FastifyRequest } from 'fastify'

// Xem apps/core-api/.../org-aware-throttler.guard.ts cho lý do đầy đủ (guard này
// là bản sao 1-1, mỗi service NestJS giữ guard riêng thay vì share qua shared-kernel
// vì shared-kernel framework-agnostic, không phụ thuộc @nestjs/throttler).
// Track theo X-Org-Id (đọc thô — search-service không có OrgGuard/membership check,
// route tự đọc header trực tiếp, cùng mức tin cậy) thay vì IP, để 1 org không ăn hết
// quota rate-limit của org khác. Route chưa có org → rơi về IP.
//
// Ghép thêm IP vào key org: ThrottlerGuard chạy TRƯỚC JwtAuthGuard nên request
// không cần token hợp lệ vẫn tiêu tốn quota — ghép IP nâng chi phí griefing 1 org
// cụ thể bằng X-Org-Id giả (orgId không bí mật). Không chặn tuyệt đối, chỉ nâng chi phí.
@Injectable()
export class OrgAwareThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: FastifyRequest): Promise<string> {
    const orgId = req.headers['x-org-id']
    if (typeof orgId === 'string' && orgId.length > 0) return `org:${orgId}:ip:${req.ip}`
    return `ip:${req.ip}`
  }
}
