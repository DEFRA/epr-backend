import { describe, it, expect } from 'vitest'
import { buildOrganisation } from './test-data.js'
import { getCurrentStatus } from '../status.js'

describe('buildOrganisation', () => {
  it('should expose a top-level status derived from statusHistory', () => {
    const org = buildOrganisation()

    expect(org.status).toBe(getCurrentStatus(org))
  })

  it('should default the status to created', () => {
    const org = buildOrganisation()

    expect(org.status).toBe('created')
  })

  it('should derive status from a statusHistory override', () => {
    const org = buildOrganisation({
      statusHistory: [
        { status: 'created', updatedAt: new Date('2024-01-01') },
        { status: 'approved', updatedAt: new Date('2024-02-01') }
      ]
    })

    expect(org.status).toBe('approved')
  })

  it('should let an explicit status override win', () => {
    const org = buildOrganisation({ status: 'active' })

    expect(org.status).toBe('active')
  })
})
