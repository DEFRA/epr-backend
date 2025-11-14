import { describe, it, expect, vi, beforeEach } from 'vitest'
import { linkItemsToOrganisations } from './link-form-submissions.js'
import { logger } from '#common/helpers/logging/logger.js'

vi.mock('#common/helpers/logging/logger.js', () => ({
  logger: {
    error: vi.fn()
  }
}))

describe('linkItemsToOrganisations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('links all registrations to their organisations', () => {
    const organisations = [
      { id: 'org-1', name: 'Org 1' },
      { id: 'org-2', name: 'Org 2' }
    ]

    const registrations = [
      { id: 'reg-1', systemReference: 'org-1', orgId: 100 },
      { id: 'reg-2', systemReference: 'org-2', orgId: 200 }
    ]

    const result = linkItemsToOrganisations(
      organisations,
      registrations,
      'registrations'
    )

    expect(result).toHaveLength(2)

    const org1 = result.find((org) => org.id === 'org-1')
    expect(org1.registrations).toHaveLength(1)
    expect(org1.registrations[0].id).toBe('reg-1')

    const org2 = result.find((org) => org.id === 'org-2')
    expect(org2.registrations).toHaveLength(1)
    expect(org2.registrations[0].id).toBe('reg-2')

    expect(logger.error).not.toHaveBeenCalled()
  })

  it('handles organisations without registrations', () => {
    const organisations = [
      { id: 'org-1', name: 'Org 1' },
      { id: 'org-2', name: 'Org 2' },
      { id: 'org-3', name: 'Org 3' }
    ]

    const registrations = [
      { id: 'reg-1', systemReference: 'org-1', orgId: 100 }
    ]

    const result = linkItemsToOrganisations(
      organisations,
      registrations,
      'registrations'
    )

    expect(result).toHaveLength(3)

    const org1 = result.find((org) => org.id === 'org-1')
    expect(org1.registrations).toHaveLength(1)
    expect(org1.registrations[0].id).toBe('reg-1')

    const org2 = result.find((org) => org.id === 'org-2')
    expect(org2.registrations).toBeUndefined()

    const org3 = result.find((org) => org.id === 'org-3')
    expect(org3.registrations).toBeUndefined()

    expect(logger.error).not.toHaveBeenCalled()
  })

  it('logs error when registrations cannot be linked to organisations', () => {
    const organisations = [{ id: 'org-1', name: 'Org 1' }]

    const registrations = [
      { id: 'reg-1', systemReference: 'org-1', orgId: 100 },
      { id: 'reg-2', systemReference: 'org-2', orgId: 200 },
      { id: 'reg-3', systemReference: 'org-3', orgId: 300 }
    ]

    const result = linkItemsToOrganisations(
      organisations,
      registrations,
      'registrations'
    )

    expect(result).toHaveLength(1)

    const org1 = result.find((org) => org.id === 'org-1')
    expect(org1.registrations).toHaveLength(1)
    expect(org1.registrations[0].id).toBe('reg-1')

    expect(logger.error).toHaveBeenCalledTimes(2)
    expect(logger.error).toHaveBeenCalledWith({
      message: '2 registrations not linked to an organisation'
    })
    expect(logger.error).toHaveBeenCalledWith({
      message: 'registrations not linked: reg-2, reg-3'
    })
  })

  it('handles multiple registrations for the same organisation', () => {
    const organisations = [{ id: 'org-1', name: 'Org 1' }]

    const registrations = [
      { id: 'reg-1', systemReference: 'org-1', orgId: 100 },
      { id: 'reg-2', systemReference: 'org-1', orgId: 100 },
      { id: 'reg-3', systemReference: 'org-1', orgId: 100 }
    ]

    const result = linkItemsToOrganisations(
      organisations,
      registrations,
      'registrations'
    )

    expect(result).toHaveLength(1)

    const org1 = result.find((org) => org.id === 'org-1')
    expect(org1.registrations).toHaveLength(3)
    expect(org1.registrations.map((r) => r.id)).toEqual([
      'reg-1',
      'reg-2',
      'reg-3'
    ])

    expect(logger.error).not.toHaveBeenCalled()
  })
})
