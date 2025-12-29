import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ObjectId } from 'mongodb'
import {
  linkItemsToOrganisations,
  linkRegistrationToAccreditations
} from './link-form-submissions.js'
import { logger } from '#common/helpers/logging/logger.js'
import {
  MATERIAL,
  ORGANISATION_STATUS,
  WASTE_PROCESSING_TYPE
} from '#domain/organisations/model.js'
import { siteInfoToLog } from '#formsubmission/parsing-common/site.js'

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
      'registrations',
      new Set()
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

  it('when organisation already has registrations append new registration to it', () => {
    const org1Id = new ObjectId().toString()
    const reg1Id = new ObjectId().toString()
    const reg2Id = new ObjectId().toString()
    const reg3Id = new ObjectId().toString()

    const existingRegistrations = [
      { id: reg1Id, systemReference: org1Id, orgId: 100 },
      { id: reg2Id, systemReference: org1Id, orgId: 200 }
    ]

    const organisations = [
      { id: org1Id, name: 'Org 1', registrations: existingRegistrations }
    ]

    const registrations = [{ id: reg3Id, systemReference: org1Id, orgId: 100 }]

    const result = linkItemsToOrganisations(
      organisations,
      registrations,
      'registrations',
      new Set()
    )

    expect(result).toHaveLength(1)

    const org1 = result.find((org) => org.id === org1Id)
    expect(org1.registrations).toHaveLength(3)
    expect(org1.registrations[0].id).toBe(reg1Id)
    expect(org1.registrations[1].id).toBe(reg2Id)
    expect(org1.registrations[2].id).toBe(reg3Id)

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
      'registrations',
      new Set()
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
      'registrations',
      new Set()
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
      'registrations',
      new Set()
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

  it('requires orgId match for systemReferences in systemReferencesRequiringOrgIdMatch', () => {
    const org1Id = new ObjectId().toString()
    const org2Id = new ObjectId().toString()
    const reg1Id = new ObjectId().toString()
    const reg2Id = new ObjectId().toString()
    const reg3Id = new ObjectId().toString()

    const organisations = [
      { id: org1Id, orgId: 100, name: 'Org 1' },
      { id: org2Id, orgId: 200, name: 'Org 2' }
    ]

    const registrations = [
      { id: reg1Id, systemReference: org1Id, orgId: 100 }, // orgId matches, systemRef in set - linked
      { id: reg2Id, systemReference: org1Id, orgId: 300 }, // orgId doesn't match, systemRef in set - unlinked
      { id: reg3Id, systemReference: org2Id, orgId: 400 } // orgId doesn't match, systemRef NOT in set - linked
    ]

    // Only items linking to org1Id require orgId validation
    const systemReferencesRequiringOrgIdMatch = new Set([org1Id])

    const result = linkItemsToOrganisations(
      organisations,
      registrations,
      'registrations',
      systemReferencesRequiringOrgIdMatch
    )

    expect(result).toHaveLength(2)

    const org1 = result.find((org) => org.id === org1Id)
    // Only reg1Id linked (reg2Id excluded because orgId doesn't match and org1Id is in validation set)
    expect(org1.registrations).toHaveLength(1)
    expect(org1.registrations.map((r) => r.id)).toEqual([reg1Id])

    const org2 = result.find((org) => org.id === org2Id)
    // reg3Id linked even though orgId doesn't match (org2Id not in validation set)
    expect(org2.registrations).toHaveLength(1)
    expect(org2.registrations.map((r) => r.id)).toEqual([reg3Id])

    // reg2Id should be logged as unlinked
    expect(logger.warn).toHaveBeenCalledWith({
      message: '1 registrations not linked to an organisation'
    })
    expect(logger.warn).toHaveBeenCalledWith({
      message: `registrations not linked: id=${reg2Id}, systemReference=${org1Id}, orgId=300`
    })
  })
})

describe('linkRegistrationToAccreditations', () => {
  const ONE_HOUR = 60 * 60 * 1000
  const ONE_DAY = 24 * ONE_HOUR
  const oneDayAgo = new Date(Date.now() - ONE_DAY)

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
            material: MATERIAL.WOOD,
            formSubmissionTime: oneDayAgo
          }
        ],
        accreditations: [
          {
            id: accId1,
            wasteProcessingType: WASTE_PROCESSING_TYPE.EXPORTER,
            material: MATERIAL.WOOD,
            formSubmissionTime: oneDayAgo
          }
        ]
      }
    ]

    const result = linkRegistrationToAccreditations(organisations)
    expect(result).toHaveLength(1)
    expect(result[0].registrations[0].accreditationId).toEqual(accId1)
    expect(logger.warn).not.toHaveBeenCalled()
    expect(logger.info).toHaveBeenCalledWith({
      message: 'Accreditation linking complete: 1/1 linked'
    })
    expect(logger.info).toHaveBeenCalledWith({
      message: 'Registrations : 1/1 linked to accreditations'
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
            site: {
              address: { line1: '78 Portland Place', postcode: '   W1b 1NT' }
            },
            formSubmissionTime: oneDayAgo
          }
        ],
        accreditations: [
          {
            id: accId1,
            wasteProcessingType: WASTE_PROCESSING_TYPE.REPROCESSOR,
            material: MATERIAL.WOOD,
            site: {
              address: { line1: '78 Portland Place', postcode: 'W1B1NT ' }
            },
            formSubmissionTime: oneDayAgo
          }
        ]
      }
    ]

    const result = linkRegistrationToAccreditations(organisations)
    expect(result).toHaveLength(1)
    expect(logger.warn).not.toHaveBeenCalled()
    expect(result[0].registrations[0].accreditationId).toEqual(accId1)
    expect(logger.info).toHaveBeenCalledWith({
      message: 'Accreditation linking complete: 1/1 linked'
    })
    expect(logger.info).toHaveBeenCalledWith({
      message: 'Registrations : 1/1 linked to accreditations'
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
            material: MATERIAL.WOOD,
            formSubmissionTime: oneDayAgo
          },
          {
            id: reg2Id,
            wasteProcessingType: WASTE_PROCESSING_TYPE.REPROCESSOR,
            material: MATERIAL.ALUMINIUM,
            site: {
              address: { line1: '78 Portland Place', postcode: 'W1C 1NT' }
            },
            formSubmissionTime: oneDayAgo
          }
        ],
        accreditations: [
          {
            id: acc1Id,
            wasteProcessingType: WASTE_PROCESSING_TYPE.REPROCESSOR,
            material: MATERIAL.ALUMINIUM,
            site: { address: { line1: '78', postcode: 'W1B 1NT' } },
            formSubmissionTime: oneDayAgo
          },
          {
            id: acc2Id,
            wasteProcessingType: WASTE_PROCESSING_TYPE.EXPORTER,
            material: MATERIAL.PAPER,
            formSubmissionTime: oneDayAgo
          }
        ]
      }
    ]

    const result = linkRegistrationToAccreditations(organisations)
    expect(result).toHaveLength(1)
    for (const reg of result[0].registrations) {
      expect(reg.accreditationId).toBeUndefined()
    }

    const expectedMessage =
      `Organisation has accreditations that cant be linked to registrations: ` +
      `orgId=100,orgDbId=${org1Id},unlinked accreditations count=2,` +
      `unlinked accreditations=[id=${acc1Id},type=reprocessor,material=aluminium,${siteInfoToLog(organisations[0].accreditations[0].site)};` +
      `id=${acc2Id},type=exporter,material=paper],` +
      `unlinked registrations=[id=${reg1Id},type=exporter,material=wood;` +
      `id=${reg2Id},type=reprocessor,material=aluminium,${siteInfoToLog(organisations[0].registrations[1].site)}]`
    expect(logger.warn).toHaveBeenCalledWith({ message: expectedMessage })
    expect(logger.info).toHaveBeenCalledWith({
      message: 'Accreditation linking complete: 0/2 linked'
    })
    expect(logger.info).toHaveBeenCalledWith({
      message: 'Registrations : 0/2 linked to accreditations'
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
            material: MATERIAL.WOOD,
            formSubmissionTime: oneDayAgo
          }
        ],
        accreditations: [
          {
            id: acc1Id,
            wasteProcessingType: WASTE_PROCESSING_TYPE.EXPORTER,
            material: MATERIAL.WOOD,
            formSubmissionTime: oneDayAgo
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
            site: {
              address: { line1: '78 Portland Place', postcode: 'W1B 1NT' }
            },
            formSubmissionTime: oneDayAgo
          }
        ],
        accreditations: [
          {
            id: acc2Id,
            wasteProcessingType: WASTE_PROCESSING_TYPE.REPROCESSOR,
            material: MATERIAL.ALUMINIUM,
            site: {
              address: { line1: '78 Portland Place', postcode: 'W1B 1NT' }
            },
            formSubmissionTime: oneDayAgo
          }
        ]
      }
    ]

    const result = linkRegistrationToAccreditations(organisations)
    expect(result).toHaveLength(2)
    expect(result[0].registrations[0].accreditationId).toEqual(acc1Id)
    expect(result[1].registrations[0].accreditationId).toEqual(acc2Id)
    expect(logger.warn).not.toHaveBeenCalled()
    expect(logger.info).toHaveBeenCalledWith({
      message: 'Accreditation linking complete: 2/2 linked'
    })
    expect(logger.info).toHaveBeenCalledWith({
      message: 'Registrations : 2/2 linked to accreditations'
    })
  })

  it('link when multiple registrations match to single accreditation', () => {
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
            site: {
              address: { line1: '78 Portland Place', postcode: 'W1B 1NT' }
            },
            formSubmissionTime: oneDayAgo
          },
          {
            id: reg2Id,
            wasteProcessingType: WASTE_PROCESSING_TYPE.REPROCESSOR,
            material: MATERIAL.WOOD,
            site: {
              address: { line1: '78 Portland Place', postcode: 'W1B 1NT' }
            },
            formSubmissionTime: oneDayAgo
          }
        ],
        accreditations: [
          {
            id: accId1,
            wasteProcessingType: WASTE_PROCESSING_TYPE.REPROCESSOR,
            material: MATERIAL.WOOD,
            site: {
              address: { line1: '78 Portland Place', postcode: 'W1B 1NT' }
            },
            formSubmissionTime: oneDayAgo
          }
        ]
      }
    ]

    const result = linkRegistrationToAccreditations(organisations)
    expect(result).toHaveLength(1)
    expect(result[0].registrations[0].accreditationId).toBe(
      result[0].accreditations[0].id
    )
    expect(result[0].registrations[1].accreditationId).toBe(
      result[0].accreditations[0].id
    )

    expect(logger.warn).not.toHaveBeenCalled()
    expect(logger.info).toHaveBeenCalledWith({
      message: 'Accreditation linking complete: 1/1 linked'
    })
    expect(logger.info).toHaveBeenCalledWith({
      message: 'Registrations : 2/2 linked to accreditations'
    })
  })

  it('links to latest accreditation when multiple accreditations match a registration', () => {
    const org1Id = new ObjectId().toString()
    const reg1Id = new ObjectId().toString()
    const accId2 = new ObjectId().toString()
    const accId1 = new ObjectId().toString()
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
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
            site: {
              address: { line1: '78 Portland Place', postcode: 'W1B 1NT' }
            },
            formSubmissionTime: oneDayAgo
          }
        ],
        accreditations: [
          {
            id: accId1,
            wasteProcessingType: WASTE_PROCESSING_TYPE.REPROCESSOR,
            material: MATERIAL.WOOD,
            site: {
              address: { line1: '78 Portland Place', postcode: 'W1B 1NT' }
            },
            formSubmissionTime: twoDaysAgo
          },
          {
            id: accId2,
            wasteProcessingType: WASTE_PROCESSING_TYPE.REPROCESSOR,
            material: MATERIAL.WOOD,
            site: {
              address: { line1: '78 Portland Place', postcode: 'W1B 1NT' }
            },
            formSubmissionTime: oneDayAgo
          }
        ]
      }
    ]

    const result = linkRegistrationToAccreditations(organisations)
    expect(result).toHaveLength(1)
    expect(result[0].registrations[0].accreditationId).toBe(accId2)

    const expectedMessage =
      `Multiple accreditations match registration, picking latest by formSubmissionTime: ` +
      `orgId=100,orgDbId=${org1Id},` +
      `registration=[id=${reg1Id},type=reprocessor,material=wood,${siteInfoToLog(organisations[0].registrations[0].site)}],` +
      `selected accreditation=[id=${accId2},type=reprocessor,material=wood,${siteInfoToLog(organisations[0].accreditations[1].site)}]`
    expect(logger.warn).toHaveBeenCalledWith({ message: expectedMessage })
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
      message: 'Accreditation linking complete: 0/0 linked'
    })
    expect(logger.info).toHaveBeenCalledWith({
      message: 'Registrations : 0/0 linked to accreditations'
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
            site: { address: {} },
            formSubmissionTime: oneDayAgo
          }
        ],
        accreditations: [
          {
            id: acc1Id,
            wasteProcessingType: WASTE_PROCESSING_TYPE.REPROCESSOR,
            material: MATERIAL.ALUMINIUM,
            site: { address: {} },
            formSubmissionTime: oneDayAgo
          }
        ]
      }
    ]

    const result = linkRegistrationToAccreditations(organisations)
    expect(result[0].registrations[0].accreditationId).toBeUndefined()
  })

  it('preserve existing link when approved registration is already linked to approved accreditation', () => {
    const org1Id = new ObjectId().toString()
    const reg1Id = new ObjectId().toString()
    const accId1 = new ObjectId().toString()
    const accId2 = new ObjectId().toString()
    const organisations = [
      {
        id: org1Id,
        name: 'Org 1',
        orgId: 100,
        registrations: [
          {
            id: reg1Id,
            status: ORGANISATION_STATUS.APPROVED,
            wasteProcessingType: WASTE_PROCESSING_TYPE.EXPORTER,
            material: MATERIAL.WOOD,
            formSubmissionTime: oneDayAgo,
            accreditationId: accId1
          }
        ],
        accreditations: [
          {
            id: accId1,
            status: ORGANISATION_STATUS.APPROVED,
            wasteProcessingType: WASTE_PROCESSING_TYPE.EXPORTER,
            material: MATERIAL.WOOD,
            formSubmissionTime: oneDayAgo
          },
          {
            id: accId2,
            status: ORGANISATION_STATUS.CREATED,
            wasteProcessingType: WASTE_PROCESSING_TYPE.EXPORTER,
            material: MATERIAL.WOOD,
            formSubmissionTime: new Date()
          }
        ]
      }
    ]

    const result = linkRegistrationToAccreditations(organisations)
    expect(result).toHaveLength(1)
    expect(result[0].registrations[0].accreditationId).toEqual(accId1)
    expect(logger.warn).toHaveBeenCalledWith({
      message: `Organisation has accreditations that cant be linked to registrations: orgId=100,orgDbId=${org1Id},unlinked accreditations count=1,unlinked accreditations=[id=${accId2},type=exporter,material=wood],unlinked registrations=[]`
    })
  })

  it('populate link for a approved registration currently not linked to any accreditation', () => {
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
            status: ORGANISATION_STATUS.APPROVED,
            wasteProcessingType: WASTE_PROCESSING_TYPE.EXPORTER,
            material: MATERIAL.WOOD,
            formSubmissionTime: oneDayAgo
          }
        ],
        accreditations: [
          {
            id: accId1,
            status: ORGANISATION_STATUS.CREATED,
            wasteProcessingType: WASTE_PROCESSING_TYPE.EXPORTER,
            material: MATERIAL.WOOD,
            formSubmissionTime: new Date()
          }
        ]
      }
    ]

    const result = linkRegistrationToAccreditations(organisations)
    expect(result).toHaveLength(1)
    expect(result[0].registrations[0].accreditationId).toEqual(accId1)
  })

  it('update link when approved registration is linked to non-approved accreditation', () => {
    const org1Id = new ObjectId().toString()
    const reg1Id = new ObjectId().toString()
    const accId1 = new ObjectId().toString()
    const accId2 = new ObjectId().toString()
    const organisations = [
      {
        id: org1Id,
        name: 'Org 1',
        orgId: 100,
        registrations: [
          {
            id: reg1Id,
            status: ORGANISATION_STATUS.APPROVED,
            wasteProcessingType: WASTE_PROCESSING_TYPE.EXPORTER,
            material: MATERIAL.WOOD,
            formSubmissionTime: oneDayAgo,
            accreditationId: accId1
          }
        ],
        accreditations: [
          {
            id: accId1,
            status: ORGANISATION_STATUS.CREATED,
            wasteProcessingType: WASTE_PROCESSING_TYPE.EXPORTER,
            material: MATERIAL.WOOD,
            formSubmissionTime: oneDayAgo
          },
          {
            id: accId2,
            status: ORGANISATION_STATUS.CREATED,
            wasteProcessingType: WASTE_PROCESSING_TYPE.EXPORTER,
            material: MATERIAL.WOOD,
            formSubmissionTime: new Date()
          }
        ]
      }
    ]

    const result = linkRegistrationToAccreditations(organisations)
    expect(result).toHaveLength(1)
    expect(result[0].registrations[0].accreditationId).toEqual(accId2)
  })

  it('skip linking when only approved accreditations are available', () => {
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
            status: ORGANISATION_STATUS.CREATED,
            accreditationId: accId1,
            wasteProcessingType: WASTE_PROCESSING_TYPE.EXPORTER,
            material: MATERIAL.WOOD,
            formSubmissionTime: oneDayAgo
          },
          {
            id: reg2Id,
            status: ORGANISATION_STATUS.CREATED,
            wasteProcessingType: WASTE_PROCESSING_TYPE.EXPORTER,
            material: MATERIAL.WOOD,
            formSubmissionTime: oneDayAgo
          }
        ],
        accreditations: [
          {
            id: accId1,
            status: ORGANISATION_STATUS.APPROVED,
            wasteProcessingType: WASTE_PROCESSING_TYPE.EXPORTER,
            material: MATERIAL.WOOD,
            formSubmissionTime: oneDayAgo
          }
        ]
      }
    ]

    const result = linkRegistrationToAccreditations(organisations)
    expect(result).toHaveLength(1)
    expect(result[0].registrations[0].accreditationId).toBe(accId1)
    expect(result[0].registrations[1].accreditationId).toBeUndefined()
    expect(logger.warn).not.toHaveBeenCalled()
  })
})
