import { SetMetadata } from '@nestjs/common'
import type { OrgPermissionValue } from '@distributed-social-platform/shared-kernel'

export const ORG_PERMISSION_KEY = 'requiredOrgPermission'

/**
 * Yêu cầu org permission cho route — cùng convention với core-api's
 * OrgGuard/RequireOrgPermission, chỉ khác cơ chế resolve (RemoteOrgMembershipGuard
 * lấy permissions qua gRPC thay vì query DB local).
 *
 * Nhiều permission = AND (phải có ĐỦ), không phải OR — giống hệt core-api.
 * Trước 2026-08-25 decorator này chỉ nhận MỘT permission trong khi core-api nhận
 * N, dù cùng tên và cùng metadata key: một route ở đây cần 2 quyền thì không có
 * cách nào khai báo, và cái sai đó im lặng (thiếu quyền thứ hai = không ai kiểm).
 * core-api đã có ca thật (POST /ai/ask cần KNOWLEDGE_READ + CREDIT_SPEND), nên
 * hai chữ ký khác nhau chỉ là bẫy chờ ngày copy nhầm.
 */
export const RequireOrgPermission = (...permissions: OrgPermissionValue[]) =>
  SetMetadata(ORG_PERMISSION_KEY, permissions)
