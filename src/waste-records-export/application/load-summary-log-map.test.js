import { loadSummaryLogMap } from './load-summary-log-map.js'

describe('loadSummaryLogMap', () => {
  it('returns an empty Map when no summary logs exist for the registration', async () => {
    const repo = { findAllByOrgReg: vi.fn().mockResolvedValue([]) }
    const map = await loadSummaryLogMap(repo, 'org-1', 'reg-1')
    expect(map.size).toBe(0)
    expect(repo.findAllByOrgReg).toHaveBeenCalledWith('org-1', 'reg-1')
  })

  it('returns a Map keyed by id with submittedAt entries', async () => {
    const repo = {
      findAllByOrgReg: vi.fn().mockResolvedValue([
        { id: 'sl-1', summaryLog: { submittedAt: '2026-04-15T09:00:00Z' } },
        { id: 'sl-2', summaryLog: { submittedAt: '2026-07-15T10:00:00Z' } }
      ])
    }
    const map = await loadSummaryLogMap(repo, 'org-1', 'reg-1')
    expect(map.size).toBe(2)
    expect(map.get('sl-1')).toEqual({ submittedAt: '2026-04-15T09:00:00Z' })
    expect(map.get('sl-2')).toEqual({ submittedAt: '2026-07-15T10:00:00Z' })
  })

  it('emits empty submittedAt for logs that have not been submitted yet', async () => {
    const repo = {
      findAllByOrgReg: vi
        .fn()
        .mockResolvedValue([{ id: 'sl-1', summaryLog: {} }])
    }
    const map = await loadSummaryLogMap(repo, 'org-1', 'reg-1')
    expect(map.get('sl-1')).toEqual({ submittedAt: '' })
  })
})
