import { OrgAwareThrottlerGuard } from './org-aware-throttler.guard'

describe('OrgAwareThrottlerGuard', () => {
  let guard: { getTracker: (req: unknown) => Promise<string> }

  beforeEach(() => {
    // ThrottlerGuard's ctor requires DI-injected options/storage/reflector — bypass
    // it with Object.create since getTracker() doesn't touch any of that.
    guard = Object.create(OrgAwareThrottlerGuard.prototype) as unknown as typeof guard
  })

  it('buckets by org+ip when X-Org-Id is present', async () => {
    const tracker = await guard.getTracker({ headers: { 'x-org-id': 'org-A' }, ip: '1.2.3.4' })
    expect(tracker).toBe('org:org-A:ip:1.2.3.4')
  })

  it('gives different orgs on the same IP separate buckets', async () => {
    const a = await guard.getTracker({ headers: { 'x-org-id': 'org-A' }, ip: '1.2.3.4' })
    const b = await guard.getTracker({ headers: { 'x-org-id': 'org-B' }, ip: '1.2.3.4' })
    expect(a).not.toBe(b)
  })

  it('gives the same org separate buckets per IP (raises the cost of anonymous griefing via a spoofed X-Org-Id)', async () => {
    const a = await guard.getTracker({ headers: { 'x-org-id': 'org-A' }, ip: '1.2.3.4' })
    const b = await guard.getTracker({ headers: { 'x-org-id': 'org-A' }, ip: '5.6.7.8' })
    expect(a).not.toBe(b)
  })

  it('falls back to IP-only bucket when X-Org-Id is missing', async () => {
    const tracker = await guard.getTracker({ headers: {}, ip: '9.9.9.9' })
    expect(tracker).toBe('ip:9.9.9.9')
  })

  it('falls back to IP when X-Org-Id is an empty string', async () => {
    const tracker = await guard.getTracker({ headers: { 'x-org-id': '' }, ip: '9.9.9.9' })
    expect(tracker).toBe('ip:9.9.9.9')
  })
})
