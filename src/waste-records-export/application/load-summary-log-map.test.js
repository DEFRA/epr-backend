import { loadSummaryLogMap } from './load-summary-log-map.js'

describe('loadSummaryLogMap', () => {
  it('returns an empty Map when no summary logs exist for the registration', async () => {
    const repo = { findAllByOrgReg: vi.fn().mockResolvedValue([]) }
    const map = await loadSummaryLogMap(repo, 'org-1', 'reg-1')
    expect(map.size).toBe(0)
    expect(repo.findAllByOrgReg).toHaveBeenCalledWith('org-1', 'reg-1')
  })

  it('returns a Map keyed by file id with submittedAt entries', async () => {
    const repo = {
      findAllByOrgReg: vi.fn().mockResolvedValue([
        {
          id: 'sl-doc-1',
          summaryLog: {
            file: { id: 'file-1' },
            submittedAt: '2026-04-15T09:00:00Z'
          }
        },
        {
          id: 'sl-doc-2',
          summaryLog: {
            file: { id: 'file-2' },
            submittedAt: '2026-07-15T10:00:00Z'
          }
        }
      ])
    }
    const map = await loadSummaryLogMap(repo, 'org-1', 'reg-1')
    expect(map.size).toBe(2)
    expect(map.get('file-1')).toEqual({ submittedAt: '2026-04-15T09:00:00Z' })
    expect(map.get('file-2')).toEqual({ submittedAt: '2026-07-15T10:00:00Z' })
  })

  it('does not answer to the summary log document id', async () => {
    const repo = {
      findAllByOrgReg: vi.fn().mockResolvedValue([
        {
          id: 'sl-doc-1',
          summaryLog: {
            file: { id: 'file-1' },
            submittedAt: '2026-04-15T09:00:00Z'
          }
        }
      ])
    }
    const map = await loadSummaryLogMap(repo, 'org-1', 'reg-1')
    expect(map.get('sl-doc-1')).toBeUndefined()
  })

  it('emits empty submittedAt for logs that have not been submitted yet', async () => {
    const repo = {
      findAllByOrgReg: vi
        .fn()
        .mockResolvedValue([
          { id: 'sl-doc-1', summaryLog: { file: { id: 'file-1' } } }
        ])
    }
    const map = await loadSummaryLogMap(repo, 'org-1', 'reg-1')
    expect(map.get('file-1')).toEqual({ submittedAt: '' })
  })
})
