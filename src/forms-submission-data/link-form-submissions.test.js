import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ObjectId } from 'mongodb'
import { linkItemsToOrganisations } from './link-form-submissions.js'
import { logger } from '#common/helpers/logging/logger.js'

vi.mock('#common/helpers/logging/logger.js', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn()
  }
}))

describe('linkItemsToOrganisations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('links all registrations to their organisations', () => {
    const org1Id = new ObjectId().toString()
    const org2Id = new ObjectId().toString()
    const reg1Id = new ObjectId().toString()
    const reg2Id = new ObjectId().toString()

    const organisations = [
      { id: org1Id, name: 'Org 1' },
      { id: org2Id, name: 'Org 2' }
    ]

    const registrations = [
      { id: reg1Id, systemReference: org1Id, orgId: 100 },
      { id: reg2Id, systemReference: org2Id, orgId: 200 }
    ]

    const result = linkItemsToOrganisations(
      organisations,
      registrations,
      'registrations'
    )

    expect(result).toHaveLength(2)

    const org1 = result.find((org) => org.id === org1Id)
    expect(org1.registrations).toHaveLength(1)
    expect(org1.registrations[0].id).toBe(reg1Id)

    const org2 = result.find((org) => org.id === org2Id)
    expect(org2.registrations).toHaveLength(1)
    expect(org2.registrations[0].id).toBe(reg2Id)

    expect(logger.error).not.toHaveBeenCalled()
  })

  it('logs warning for organisations without any registrations', () => {
    const org1Id = new ObjectId().toString()
    const org2Id = new ObjectId().toString()
    const org3Id = new ObjectId().toString()
    const reg1Id = new ObjectId().toString()

    const organisations = [
      { id: org1Id, name: 'Org 1', reference: 'REF-001' },
      { id: org2Id, name: 'Org 2', reference: 'REF-002' },
      { id: org3Id, name: 'Org 3', reference: 'REF-003' }
    ]

    const registrations = [{ id: reg1Id, systemReference: org1Id, orgId: 100 }]

    const result = linkItemsToOrganisations(
      organisations,
      registrations,
      'registrations'
    )

    expect(result).toHaveLength(3)

    const org1 = result.find((org) => org.id === org1Id)
    expect(org1.registrations).toHaveLength(1)
    expect(org1.registrations[0].id).toBe(reg1Id)

    const org2 = result.find((org) => org.id === org2Id)
    expect(org2.registrations).toBeUndefined()

    const org3 = result.find((org) => org.id === org3Id)
    expect(org3.registrations).toBeUndefined()

    expect(logger.warn).toHaveBeenCalledWith({
      message: '2 organisations without registrations'
    })
    expect(logger.warn).toHaveBeenCalledWith({
      message: `Organisation without any registrations: id=${org2Id}`
    })
    expect(logger.warn).toHaveBeenCalledWith({
      message: `Organisation without any registrations: id=${org3Id}`
    })
  })

  it('logs error when registrations cannot be linked to organisations', () => {
    const org1Id = new ObjectId().toString()
    const org2Id = new ObjectId().toString()
    const org3Id = new ObjectId().toString()
    const reg1Id = new ObjectId().toString()
    const reg2Id = new ObjectId().toString()
    const reg3Id = new ObjectId().toString()

    const organisations = [{ id: org1Id, name: 'Org 1' }]

    const registrations = [
      { id: reg1Id, systemReference: org1Id, orgId: 100 },
      { id: reg2Id, systemReference: org2Id, orgId: 200 },
      { id: reg3Id, systemReference: org3Id, orgId: 300 }
    ]

    const result = linkItemsToOrganisations(
      organisations,
      registrations,
      'registrations'
    )

    expect(result).toHaveLength(1)

    const org1 = result.find((org) => org.id === org1Id)
    expect(org1.registrations).toHaveLength(1)
    expect(org1.registrations[0].id).toBe(reg1Id)

    expect(logger.error).toHaveBeenCalledWith({
      message: '2 registrations not linked to an organisation'
    })
    expect(logger.warn).toHaveBeenCalledWith({
      message: `registrations not linked: id=${reg2Id}, systemReference=${org2Id}, orgId=200`
    })
    expect(logger.warn).toHaveBeenCalledWith({
      message: `registrations not linked: id=${reg3Id}, systemReference=${org3Id}, orgId=300`
    })
  })

  it('handles multiple registrations for the same organisation', () => {
    const org1Id = new ObjectId().toString()
    const reg1Id = new ObjectId().toString()
    const reg2Id = new ObjectId().toString()
    const reg3Id = new ObjectId().toString()

    const organisations = [{ id: org1Id, name: 'Org 1' }]

    const registrations = [
      { id: reg1Id, systemReference: org1Id, orgId: 100 },
      { id: reg2Id, systemReference: org1Id, orgId: 100 },
      { id: reg3Id, systemReference: org1Id, orgId: 100 }
    ]

    const result = linkItemsToOrganisations(
      organisations,
      registrations,
      'registrations'
    )

    expect(result).toHaveLength(1)

    const org1 = result.find((org) => org.id === org1Id)
    expect(org1.registrations).toHaveLength(3)
    expect(org1.registrations.map((r) => r.id)).toEqual([
      reg1Id,
      reg2Id,
      reg3Id
    ])

    expect(logger.error).not.toHaveBeenCalled()
  })
})
