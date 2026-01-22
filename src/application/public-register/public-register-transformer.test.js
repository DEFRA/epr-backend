import { describe, expect, it } from 'vitest'
import { ObjectId } from 'mongodb'
import { transform } from './public-register-transformer.js'
import {
  buildAccreditation,
  buildOrganisation,
  buildRegistration
} from '#repositories/organisations/contract/test-data.js'
import {
  MATERIAL,
  REG_ACC_STATUS,
  WASTE_PROCESSING_TYPE
} from '#domain/organisations/model.js'
import { formatDate } from '#common/helpers/date-formatter.js'

describe('transform', () => {
  const baseAddress = {
    line1: '1 Waste Road',
    town: 'London',
    postcode: 'N1 1AA'
  }

  const baseSiteAddress = {
    line1: '2 Waste Site',
    town: 'London',
    postcode: 'EC1 1AA'
  }

  const VALID_FROM = new Date('2026-01-01')
  const VALID_TO = new Date('2027-01-01')

  const TODAY = new Date(Date.now())
  const CREATED_DATE = new Date(TODAY.getTime() - 24 * 60 * 60 * 1000)

  const EXPECTED_ACTIVE_DATE = formatDate(VALID_FROM)
  const EXPECTED_DATE_LAST_CHANGED = formatDate(TODAY)

  const createTestRegistration = (overrides = {}) => {
    return buildRegistration({
      status: REG_ACC_STATUS.APPROVED,
      wasteProcessingType: WASTE_PROCESSING_TYPE.REPROCESSOR,
      material: MATERIAL.PLASTIC,
      registrationNumber: 'R12345678PL',
      validFrom: VALID_FROM,
      validTo: VALID_TO,
      site: { address: baseSiteAddress },
      ...overrides
    })
  }

  const createTestAccreditation = (overrides = {}) => {
    const status = overrides.status || REG_ACC_STATUS.APPROVED
    return buildAccreditation({
      status,
      material: MATERIAL.PLASTIC,
      wasteProcessingType: WASTE_PROCESSING_TYPE.REPROCESSOR,
      validFrom: VALID_FROM,
      validTo: VALID_TO,
      formSubmissionTime: new Date('2025-12-15'),
      prnIssuance: { tonnageBand: 'up_to_10000' },
      statusHistory: [
        { status: REG_ACC_STATUS.CREATED, updatedAt: CREATED_DATE },
        { status, updatedAt: TODAY }
      ],
      ...overrides
    })
  }

  const createTestOrganisation = (overrides = {}) => {
    return buildOrganisation({
      companyDetails: {
        name: 'Waste Ltd',
        tradingName: 'Waste Recovery',
        registeredAddress: baseAddress
      },
      submittedToRegulator: 'ea',
      registrations: [],
      accreditations: [],
      ...overrides
    })
  }

  it('should produce complete row object with all fields', async () => {
    const accreditationId = new ObjectId()

    const accreditation = createTestAccreditation({
      id: accreditationId.toString(),
      accreditationNumber: 'A123456PL'
    })

    const registration = createTestRegistration({
      accreditationId: accreditationId.toString()
    })

    const org = createTestOrganisation({
      registrations: [registration],
      accreditations: [accreditation]
    })

    const rows = await transform([org])

    expect(rows).toStrictEqual([
      {
        type: 'Reprocessor',
        businessName: 'Waste Ltd',
        registeredOffice: '1 Waste Road, London, N1 1AA',
        appropriateAgency: 'ea',
        registrationNumber: 'R12345678PL',
        tradingName: 'Waste Recovery',
        reprocessingSite: '2 Waste Site, London, EC1 1AA',
        packagingWasteCategory: 'Plastic',
        annexIIProcess: 'R3',
        accreditationStatus: 'Approved',
        accreditationNo: 'A123456PL',
        tonnageBand: 'Up to 10,000 tonnes',
        activeDate: EXPECTED_ACTIVE_DATE,
        dateLastChanged: EXPECTED_DATE_LAST_CHANGED
      }
    ])
  })

  it.each([
    {
      status: REG_ACC_STATUS.APPROVED,
      expectedStatus: 'Approved'
    },
    {
      status: REG_ACC_STATUS.SUSPENDED,
      expectedStatus: 'Suspended'
    },
    {
      status: REG_ACC_STATUS.CANCELLED,
      expectedStatus: 'Cancelled'
    }
  ])(
    'should transform registration with status $expectedStatus without accreditation',
    async ({ status }) => {
      const registration = createTestRegistration({ status })
      const org = createTestOrganisation({ registrations: [registration] })

      const rows = await transform([org])

      expect(rows).toEqual([
        {
          type: 'Reprocessor',
          businessName: 'Waste Ltd',
          registeredOffice: '1 Waste Road, London, N1 1AA',
          appropriateAgency: 'ea',
          registrationNumber: 'R12345678PL',
          tradingName: 'Waste Recovery',
          reprocessingSite: '2 Waste Site, London, EC1 1AA',
          packagingWasteCategory: 'Plastic',
          annexIIProcess: 'R3',
          accreditationStatus: '',
          accreditationNo: '',
          tonnageBand: '',
          activeDate: '',
          dateLastChanged: ''
        }
      ])
    }
  )

  it.each([
    {
      status: REG_ACC_STATUS.APPROVED,
      expectedStatus: 'Approved',
      accreditationNumber: 'A123456PL',
      tonnageBand: 'up_to_10000',
      expectedTonnageBand: 'Up to 10,000 tonnes'
    },
    {
      status: REG_ACC_STATUS.SUSPENDED,
      expectedStatus: 'Suspended',
      accreditationNumber: 'A234567PL',
      tonnageBand: 'up_to_5000',
      expectedTonnageBand: 'Up to 5,000 tonnes'
    },
    {
      status: REG_ACC_STATUS.CANCELLED,
      expectedStatus: 'Cancelled',
      accreditationNumber: 'A345678PL',
      tonnageBand: 'up_to_500',
      expectedTonnageBand: 'Up to 500 tonnes'
    }
  ])(
    'should transform registration with $expectedStatus accreditation',
    async ({
      status,
      expectedStatus,
      accreditationNumber,
      tonnageBand,
      expectedTonnageBand
    }) => {
      const accreditationId = new ObjectId()

      const accreditation = createTestAccreditation({
        id: accreditationId.toString(),
        status,
        accreditationNumber,
        prnIssuance: { tonnageBand }
      })

      const registration = createTestRegistration({
        accreditationId: accreditationId.toString()
      })

      const org = createTestOrganisation({
        registrations: [registration],
        accreditations: [accreditation]
      })

      const rows = await transform([org])

      expect(rows).toEqual([
        {
          type: 'Reprocessor',
          businessName: 'Waste Ltd',
          registeredOffice: '1 Waste Road, London, N1 1AA',
          appropriateAgency: 'ea',
          registrationNumber: 'R12345678PL',
          tradingName: 'Waste Recovery',
          reprocessingSite: '2 Waste Site, London, EC1 1AA',
          packagingWasteCategory: 'Plastic',
          annexIIProcess: 'R3',
          accreditationStatus: expectedStatus,
          accreditationNo: accreditationNumber,
          tonnageBand: expectedTonnageBand,
          activeDate: EXPECTED_ACTIVE_DATE,
          dateLastChanged: EXPECTED_DATE_LAST_CHANGED
        }
      ])
    }
  )

  it('should filter out registrations with unapproved statuses', async () => {
    const org = buildOrganisation({
      companyDetails: {
        name: 'Waste Ltd',
        registeredAddress: baseAddress
      },
      registrations: [
        buildRegistration({
          status: REG_ACC_STATUS.APPROVED,
          registrationNumber: 'R11111111PL',
          validFrom: VALID_FROM,
          validTo: VALID_TO
        }),
        buildRegistration({
          status: REG_ACC_STATUS.CREATED,
          registrationNumber: 'R22222222PL'
        }),
        buildRegistration({
          status: REG_ACC_STATUS.REJECTED,
          registrationNumber: 'R33333333PL'
        })
      ]
    })

    const rows = await transform([org])

    expect(rows).toHaveLength(1)
    expect(rows[0].registrationNumber).toBe('R11111111PL')
  })

  it('should filter out accreditations with unapproved statuses', async () => {
    const accreditationId = new ObjectId()

    const org = buildOrganisation({
      companyDetails: {
        name: 'Waste Ltd',
        registeredAddress: baseAddress
      },
      submittedToRegulator: 'ea',
      registrations: [
        buildRegistration({
          status: REG_ACC_STATUS.APPROVED,
          registrationNumber: 'R11111111PL',
          validFrom: VALID_FROM,
          validTo: VALID_TO,
          accreditationId: accreditationId.toString(),
          wasteProcessingType: WASTE_PROCESSING_TYPE.REPROCESSOR,
          material: MATERIAL.PLASTIC,
          site: {
            address: {
              line1: '2 Waste Site',
              town: 'London',
              postcode: 'EC1 1AA'
            }
          }
        })
      ],
      accreditations: [
        buildAccreditation({
          id: accreditationId.toString(),
          status: REG_ACC_STATUS.CREATED,
          accreditationNumber: 'A999999PL'
        })
      ]
    })

    const rows = await transform([org])

    expect(rows).toEqual([
      {
        type: 'Reprocessor',
        businessName: 'Waste Ltd',
        registeredOffice: '1 Waste Road, London, N1 1AA',
        appropriateAgency: 'ea',
        registrationNumber: 'R11111111PL',
        tradingName: '',
        reprocessingSite: '2 Waste Site, London, EC1 1AA',
        packagingWasteCategory: 'Plastic',
        annexIIProcess: 'R3',
        accreditationStatus: '',
        accreditationNo: '',
        tonnageBand: '',
        activeDate: '',
        dateLastChanged: ''
      }
    ])
  })

  it('should not return any rows for organisations with no registrations', async () => {
    const org = buildOrganisation({
      registrations: [],
      accreditations: []
    })

    const rows = await transform([org])

    expect(rows).toHaveLength(0)
  })

  it('should handle mixed scenarios with multiple organisations', async () => {
    const org1 = buildOrganisation({
      companyDetails: {
        name: 'Multi Material Ltd',
        registeredAddress: baseAddress
      },
      submittedToRegulator: 'ea',
      registrations: [
        buildRegistration({
          status: REG_ACC_STATUS.APPROVED,
          wasteProcessingType: WASTE_PROCESSING_TYPE.REPROCESSOR,
          material: MATERIAL.PLASTIC,
          registrationNumber: 'R11111111PL',
          validFrom: VALID_FROM,
          validTo: VALID_TO,
          site: {
            address: {
              line1: '2 Waste Site',
              town: 'London',
              postcode: 'EC1 1AA'
            }
          }
        }),
        buildRegistration({
          status: REG_ACC_STATUS.APPROVED,
          wasteProcessingType: WASTE_PROCESSING_TYPE.REPROCESSOR,
          material: MATERIAL.PAPER,
          registrationNumber: 'R22222222PL',
          validFrom: VALID_FROM,
          validTo: VALID_TO,
          site: {
            address: {
              line1: '2 Waste Site',
              town: 'London',
              postcode: 'EC1 1AA'
            }
          }
        }),
        buildRegistration({
          status: REG_ACC_STATUS.CREATED,
          material: MATERIAL.STEEL,
          registrationNumber: 'R33333333PL'
        })
      ]
    })

    const org2 = buildOrganisation({
      companyDetails: {
        name: 'Exporter Ltd',
        tradingName: null,
        registeredAddress: null,
        address: baseAddress
      },
      submittedToRegulator: 'sepa',
      registrations: [
        buildRegistration({
          status: REG_ACC_STATUS.APPROVED,
          wasteProcessingType: WASTE_PROCESSING_TYPE.EXPORTER,
          material: MATERIAL.ALUMINIUM,
          registrationNumber: 'R44444444AL',
          validFrom: VALID_FROM,
          validTo: VALID_TO,
          site: null
        })
      ]
    })

    const org3 = buildOrganisation({
      registrations: [],
      accreditations: []
    })

    const rows = await transform([org1, org2, org3])

    expect(rows).toEqual([
      {
        type: 'Reprocessor',
        businessName: 'Multi Material Ltd',
        registeredOffice: '1 Waste Road, London, N1 1AA',
        appropriateAgency: 'ea',
        registrationNumber: 'R11111111PL',
        tradingName: '',
        reprocessingSite: '2 Waste Site, London, EC1 1AA',
        packagingWasteCategory: 'Plastic',
        annexIIProcess: 'R3',
        accreditationStatus: '',
        accreditationNo: '',
        tonnageBand: '',
        activeDate: '',
        dateLastChanged: ''
      },
      {
        type: 'Reprocessor',
        businessName: 'Multi Material Ltd',
        registeredOffice: '1 Waste Road, London, N1 1AA',
        appropriateAgency: 'ea',
        registrationNumber: 'R22222222PL',
        tradingName: '',
        reprocessingSite: '2 Waste Site, London, EC1 1AA',
        packagingWasteCategory: 'Paper and board',
        annexIIProcess: 'R3',
        accreditationStatus: '',
        accreditationNo: '',
        tonnageBand: '',
        activeDate: '',
        dateLastChanged: ''
      },
      {
        type: 'Exporter',
        businessName: 'Exporter Ltd',
        registeredOffice: '1 Waste Road, London, N1 1AA',
        appropriateAgency: 'sepa',
        registrationNumber: 'R44444444AL',
        tradingName: '',
        reprocessingSite: '',
        packagingWasteCategory: 'Aluminium',
        annexIIProcess: 'R4',
        accreditationStatus: '',
        accreditationNo: '',
        tonnageBand: '',
        activeDate: '',
        dateLastChanged: ''
      }
    ])
  })

  it('should filter out test organisations from results', async () => {
    const testOrgId = 999999
    const normalOrgId = 500001

    const testOrg = buildOrganisation({
      orgId: testOrgId,
      companyDetails: {
        name: 'Test Organisation',
        registeredAddress: baseAddress
      },
      submittedToRegulator: 'ea',
      registrations: [
        buildRegistration({
          status: REG_ACC_STATUS.APPROVED,
          registrationNumber: 'R99999999PL',
          wasteProcessingType: WASTE_PROCESSING_TYPE.REPROCESSOR,
          material: MATERIAL.PLASTIC,
          validFrom: VALID_FROM,
          validTo: VALID_TO,
          site: { address: baseSiteAddress }
        })
      ]
    })

    const normalOrg = buildOrganisation({
      orgId: normalOrgId,
      companyDetails: {
        name: 'Normal Organisation',
        registeredAddress: baseAddress
      },
      submittedToRegulator: 'ea',
      registrations: [
        buildRegistration({
          status: REG_ACC_STATUS.APPROVED,
          registrationNumber: 'R50000100PL',
          wasteProcessingType: WASTE_PROCESSING_TYPE.REPROCESSOR,
          material: MATERIAL.PLASTIC,
          validFrom: VALID_FROM,
          validTo: VALID_TO,
          site: { address: baseSiteAddress }
        })
      ]
    })

    const rows = await transform([testOrg, normalOrg])

    // Only the normal org should be in results, test org should be filtered out
    expect(rows).toHaveLength(1)
    expect(rows[0].businessName).toBe('Normal Organisation')
    expect(rows[0].registrationNumber).toBe('R50000100PL')

    // Verify test org is not in results
    const testOrgInResults = rows.find(
      (row) => row.businessName === 'Test Organisation'
    )
    expect(testOrgInResults).toBeUndefined()
  })
})
