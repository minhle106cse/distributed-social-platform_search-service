import { SetMetadata } from '@nestjs/common'
import type { OrgPermissionValue } from '@distributed-social-platform/shared-kernel'

export const ORG_PERMISSION_KEY = 'requiredOrgPermission'

/**
 * Yêu cầu một org permission cụ thể cho route — cùng convention với core-api's
 * OrgGuard/RequireOrgPermission, chỉ khác cơ chế resolve (RemoteOrgMembershipGuard
 * lấy permissions qua gRPC thay vì query DB local).
 */
export const RequireOrgPermission = (permission: OrgPermissionValue) =>
  SetMetadata(ORG_PERMISSION_KEY, permission)
