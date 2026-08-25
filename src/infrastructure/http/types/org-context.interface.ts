/**
 * Per-request org context, populated by RemoteOrgMembershipGuard AFTER it has
 * verified X-Org-Id against core-api over gRPC.
 *
 * Exists so a handler consumes the VERIFIED orgId rather than re-reading the raw
 * header itself (2026-08-25). Both used to read `request.headers['x-org-id']`
 * independently: same string today, but the guard's validation and the
 * controller's use were linked by coincidence, not by data flow — nothing would
 * have caught the two drifting apart. Mirrors core-api's OrgContext.
 *
 * No `orgRole` field, unlike core-api's: the gRPC contract returns membership +
 * resolved permissions, not the role name. Better an absent field than one
 * invented at this boundary.
 */
export interface OrgContext {
  orgId: string
  permissions: string[]
}
