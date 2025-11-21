import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ObjectId } from 'mongodb'
import {
  linkItemsToOrganisations,
  linkRegistrationToAccreditations
} from './link-form-submissions.js'
import { logger } from '#common/helpers/logging/logger.js'
import { MATERIAL, WASTE_PROCESSING_TYPE } from '#domain/organisations/model.js'

vi.mock('#common/helpers/logging/logger.js', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn()
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

    expect(logger.info).toHaveBeenCalledWith({
      message: '2 organisations without registrations'
    })
    expect(logger.info).toHaveBeenCalledWith({
      message: `Organisation without any registrations: id=${org2Id}`
    })
    expect(logger.info).toHaveBeenCalledWith({
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

    expect(logger.warn).toHaveBeenCalledWith({
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

describe('linkRegistrationToAccreditations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('link exporter registration to accreditation', () => {
    const org1Id = new ObjectId().toString()
    const reg1Id = new ObjectId().toString()
    const accId1 = new ObjectId().toString()
    const organisations = [
      {
        id: org1Id,
        name: 'Org 1',
        orgId: 100,
        registrations: [
          {
            id: reg1Id,
            wasteProcessingType: WASTE_PROCESSING_TYPE.EXPORTER,
            material: MATERIAL.WOOD
          }
        ],
        accreditations: [
          {
            id: accId1,
            wasteProcessingType: WASTE_PROCESSING_TYPE.EXPORTER,
            material: MATERIAL.WOOD
          }
        ]
      }
    ]

    const result = linkRegistrationToAccreditations(organisations)
    expect(result).toHaveLength(1)
    expect(result[0].registrations[0].accreditationId).toEqual(accId1)
    expect(logger.info).toHaveBeenCalledWith({
      message: 'Accreditation linking complete: 1/1 linked, 0 unlinked'
    })
    expect(logger.info).toHaveBeenCalledWith({
      message: 'Registrations : 1/1 linked to accreditations, 0 unlinked'
    })
  })

  it('link reprocessor registration to accreditation', () => {
    const org1Id = new ObjectId().toString()
    const reg1Id = new ObjectId().toString()
    const accId1 = new ObjectId().toString()
    const organisations = [
      {
        id: org1Id,
        name: 'Org 1',
        orgId: 100,
        registrations: [
          {
            id: reg1Id,
            wasteProcessingType: WASTE_PROCESSING_TYPE.REPROCESSOR,
            material: MATERIAL.WOOD,
            site: { line1: '78 Portland Place', postcode: 'W1B 1NT' }
          }
        ],
        accreditations: [
          {
            id: accId1,
            wasteProcessingType: WASTE_PROCESSING_TYPE.REPROCESSOR,
            material: MATERIAL.WOOD,
            site: { line1: '78 Portland Place', postcode: 'W1B 1NT' }
          }
        ]
      }
    ]

    const result = linkRegistrationToAccreditations(organisations)
    expect(result).toHaveLength(1)
    expect(result[0].registrations[0].accreditationId).toEqual(accId1)
    expect(logger.info).toHaveBeenCalledWith({
      message: 'Accreditation linking complete: 1/1 linked, 0 unlinked'
    })
    expect(logger.info).toHaveBeenCalledWith({
      message: 'Registrations : 1/1 linked to accreditations, 0 unlinked'
    })
  })

  it('dont link registration to accreditation when required fields doesnt match', () => {
    const org1Id = new ObjectId().toString()
    const reg1Id = new ObjectId().toString()
    const acc1Id = new ObjectId().toString()
    const reg2Id = new ObjectId().toString()
    const acc2Id = new ObjectId().toString()
    const organisations = [
      {
        id: org1Id,
        name: 'Org 1',
        orgId: 100,
        registrations: [
          {
            id: reg1Id,
            wasteProcessingType: WASTE_PROCESSING_TYPE.EXPORTER,
            material: MATERIAL.WOOD
          },
          {
            id: reg2Id,
            wasteProcessingType: WASTE_PROCESSING_TYPE.REPROCESSOR,
            material: MATERIAL.ALUMINIUM,
            site: { line1: '78 Portland Place', postcode: 'W1B 1NT' }
          }
        ],
        accreditations: [
          {
            id: acc1Id,
            wasteProcessingType: WASTE_PROCESSING_TYPE.REPROCESSOR,
            material: MATERIAL.ALUMINIUM,
            site: { line1: '78', postcode: 'W1B 1NT' }
          },
          {
            id: acc2Id,
            wasteProcessingType: WASTE_PROCESSING_TYPE.EXPORTER,
            material: MATERIAL.PAPER
          }
        ]
      }
    ]

    const result = linkRegistrationToAccreditations(organisations)
    expect(result).toHaveLength(1)
    for (const reg of result[0].registrations) {
      expect(reg.accreditationId).toBeUndefined()
    }
    expect(logger.warn).toHaveBeenCalledWith({
      message: `No registrations matched for accreditation: accreditationId=${acc1Id}, orgId=100, org id:${org1Id}`
    })
    expect(logger.warn).toHaveBeenCalledWith({
      message: `No registrations matched for accreditation: accreditationId=${acc2Id}, orgId=100, org id:${org1Id}`
    })
    expect(logger.info).toHaveBeenCalledWith({
      message: 'Accreditation linking complete: 0/2 linked, 2 unlinked'
    })
    expect(logger.info).toHaveBeenCalledWith({
      message: 'Registrations : 0/2 linked to accreditations, 2 unlinked'
    })
  })

  it('link registrations from multiple org to accreditations', () => {
    const org1Id = new ObjectId().toString()
    const org2Id = new ObjectId().toString()
    const reg1Id = new ObjectId().toString()
    const acc1Id = new ObjectId().toString()
    const reg2Id = new ObjectId().toString()
    const acc2Id = new ObjectId().toString()
    const organisations = [
      {
        id: org1Id,
        name: 'Org 1',
        orgId: 100,
        registrations: [
          {
            id: reg1Id,
            wasteProcessingType: WASTE_PROCESSING_TYPE.EXPORTER,
            material: MATERIAL.WOOD
          }
        ],
        accreditations: [
          {
            id: acc1Id,
            wasteProcessingType: WASTE_PROCESSING_TYPE.EXPORTER,
            material: MATERIAL.WOOD
          }
        ]
      },
      {
        id: org2Id,
        name: 'Org 2',
        orgId: 101,
        registrations: [
          {
            id: reg2Id,
            wasteProcessingType: WASTE_PROCESSING_TYPE.REPROCESSOR,
            material: MATERIAL.ALUMINIUM,
            site: { line1: '78 Portland Place', postcode: 'W1B 1NT' }
          }
        ],
        accreditations: [
          {
            id: acc2Id,
            wasteProcessingType: WASTE_PROCESSING_TYPE.REPROCESSOR,
            material: MATERIAL.ALUMINIUM,
            site: { line1: '78 Portland Place', postcode: 'W1B 1NT' }
          }
        ]
      }
    ]

    const result = linkRegistrationToAccreditations(organisations)
    expect(result).toHaveLength(2)
    expect(result[0].registrations[0].accreditationId).toEqual(acc1Id)
    expect(result[1].registrations[0].accreditationId).toEqual(acc2Id)
    expect(logger.info).toHaveBeenCalledWith({
      message: 'Accreditation linking complete: 2/2 linked, 0 unlinked'
    })
    expect(logger.info).toHaveBeenCalledWith({
      message: 'Registrations : 2/2 linked to accreditations, 0 unlinked'
    })
  })

  it('dont link when multiple registrations match to accreditation', () => {
    const org1Id = new ObjectId().toString()
    const reg1Id = new ObjectId().toString()
    const reg2Id = new ObjectId().toString()
    const accId1 = new ObjectId().toString()
    const organisations = [
      {
        id: org1Id,
        name: 'Org 1',
        orgId: 100,
        registrations: [
          {
            id: reg1Id,
            wasteProcessingType: WASTE_PROCESSING_TYPE.REPROCESSOR,
            material: MATERIAL.WOOD,
            site: { line1: '78 Portland Place', postcode: 'W1B 1NT' }
          },
          {
            id: reg2Id,
            wasteProcessingType: WASTE_PROCESSING_TYPE.REPROCESSOR,
            material: MATERIAL.WOOD,
            site: { line1: '78 Portland Place', postcode: 'W1B 1NT' }
          }
        ],
        accreditations: [
          {
            id: accId1,
            wasteProcessingType: WASTE_PROCESSING_TYPE.REPROCESSOR,
            material: MATERIAL.WOOD,
            site: { line1: '78 Portland Place', postcode: 'W1B 1NT' }
          }
        ]
      }
    ]

    const result = linkRegistrationToAccreditations(organisations)
    expect(result).toHaveLength(1)
    expect(result[0].registrations[0].accreditationId).toBeUndefined()
    expect(result[0].registrations[1].accreditationId).toBeUndefined()
    expect(logger.warn).toHaveBeenCalledWith({
      message: `Multiple registrations matched for accreditation: accreditationId=${accId1}, registrationIds=[${reg1Id}, ${reg2Id}], orgId=100, org id:${org1Id}`
    })
    expect(logger.info).toHaveBeenCalledWith({
      message: 'Accreditation linking complete: 0/1 linked, 1 unlinked'
    })
    expect(logger.info).toHaveBeenCalledWith({
      message: 'Registrations : 0/2 linked to accreditations, 2 unlinked'
    })
  })

  it('handle organisations without any registrations or accreditations', () => {
    const org1Id = new ObjectId().toString()

    const organisations = [
      {
        id: org1Id,
        name: 'Org 1',
        orgId: 100
      }
    ]

    const result = linkRegistrationToAccreditations(organisations)
    expect(result).toHaveLength(1)
    expect(logger.info).toHaveBeenCalledWith({
      message: 'Accreditation linking complete: 0/0 linked, 0 unlinked'
    })
    expect(logger.info).toHaveBeenCalledWith({
      message: 'Registrations : 0/0 linked to accreditations, 0 unlinked'
    })
  })

  it('dont link when address line1 and postcode is missing on both registration and accreditation ', () => {
    const org1Id = new ObjectId().toString()
    const acc1Id = new ObjectId().toString()
    const reg1Id = new ObjectId().toString()
    const organisations = [
      {
        id: org1Id,
        name: 'Org 1',
        orgId: 100,
        registrations: [
          {
            id: reg1Id,
            wasteProcessingType: WASTE_PROCESSING_TYPE.REPROCESSOR,
            material: MATERIAL.ALUMINIUM,
            site: {}
          }
        ],
        accreditations: [
          {
            id: acc1Id,
            wasteProcessingType: WASTE_PROCESSING_TYPE.REPROCESSOR,
            material: MATERIAL.ALUMINIUM,
            site: {}
          }
        ]
      }
    ]

    const result = linkRegistrationToAccreditations(organisations)
    expect(result[0].registrations[0].accreditationId).toBeUndefined()
  })

  it('logs warning when postcode matches but line1 doesnt for reprocessor', () => {
    const org1Id = new ObjectId().toString()
    const reg1Id = new ObjectId().toString()
    const acc1Id = new ObjectId().toString()
    const organisations = [
      {
        id: org1Id,
        name: 'Org 1',
        orgId: 100,
        registrations: [
          {
            id: reg1Id,
            wasteProcessingType: WASTE_PROCESSING_TYPE.REPROCESSOR,
            material: MATERIAL.WOOD,
            site: { line1: '78 Portland Place', postcode: 'W1B 1NT' }
          }
        ],
        accreditations: [
          {
            id: acc1Id,
            wasteProcessingType: WASTE_PROCESSING_TYPE.REPROCESSOR,
            material: MATERIAL.WOOD,
            site: { line1: '80 Portland Place', postcode: 'W1B 1NT' }
          }
        ]
      }
    ]

    const result = linkRegistrationToAccreditations(organisations)
    expect(result[0].registrations[0].accreditationId).toBeUndefined()
    expect(logger.warn).toHaveBeenCalledWith({
      message: `Postcode matches but address line1 doesn't: regId=${reg1Id}, accId=${acc1Id}`
    })
  })
})
