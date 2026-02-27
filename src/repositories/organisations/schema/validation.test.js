import { beforeAll, describe, expect, it } from 'vitest'
import { ObjectId } from 'mongodb'
import {
  validateAccreditation,
  validateRegistration,
  validateStatusHistory
} from './validation.js'
import {
  MATERIAL,
  REG_ACC_STATUS,
  REGULATOR,
  WASTE_PROCESSING_TYPE
} from '#domain/organisations/model.js'
import {
  buildAccreditation,
  buildOrganisation,
  buildRegistration
} from '#repositories/organisations/contract/test-data.js'
import { organisationJSONSchemaOverrides } from './organisation-json-schema-overrides.js'

describe('validateStatusHistory', () => {
  it('throws badImplementation when statusHistory item has invalid status', () => {
    const statusHistory = [{ status: 'invalid-status', updatedAt: new Date() }]

    expect(() => validateStatusHistory(statusHistory)).toThrow(
      /Invalid statusHistory.*This is a system error/
    )
  })

  it('throws badImplementation when statusHistory item missing updatedAt', () => {
    const statusHistory = [{ status: REG_ACC_STATUS.CREATED }]

    expect(() => validateStatusHistory(statusHistory)).toThrow(
      /Invalid statusHistory.*updatedAt.*is required.*This is a system error/
    )
  })

  it('validates statusHistory with optional updatedBy field', () => {
    const statusHistory = [
      {
        status: REG_ACC_STATUS.CREATED,
        updatedAt: new Date(),
        updatedBy: new ObjectId().toString()
      }
    ]

    const result = validateStatusHistory(statusHistory)

    expect(result).toEqual(statusHistory)
  })
})

describe('validateRegistration', () => {
  it('throws badData when required fields are missing', () => {
    const invalidRegistration = {
      id: 'invalid-id',
      orgName: 'Test Org'
    }

    expect(() => validateRegistration(invalidRegistration)).toThrow(
      /Invalid registration data/
    )
  })

  describe('cbduNumber validation by regulator', () => {
    it('EA: rejects cbduNumber not starting with CBDU', () => {
      const registration = buildRegistration({
        submittedToRegulator: REGULATOR.EA,
        cbduNumber: 'ABC12345'
      })

      expect(() => validateRegistration(registration)).toThrow(
        /Invalid registration data.*cbduNumber.*CBDU number must start with CBDU/
      )
    })

    it('EA: rejects cbduNumber shorter than 8 characters', () => {
      const registration = buildRegistration({
        submittedToRegulator: REGULATOR.EA,
        cbduNumber: 'CBDU123'
      })

      expect(() => validateRegistration(registration)).toThrow(
        /Invalid registration data.*cbduNumber.*at least 8 characters/
      )
    })

    it('EA: rejects cbduNumber longer than 10 characters', () => {
      const registration = buildRegistration({
        submittedToRegulator: REGULATOR.EA,
        cbduNumber: 'CBDU1234567'
      })

      expect(() => validateRegistration(registration)).toThrow(
        /Invalid registration data.*cbduNumber.*at most 10 characters/
      )
    })

    it('EA: accepts valid CBDU format', () => {
      const registration = buildRegistration({
        submittedToRegulator: REGULATOR.EA,
        cbduNumber: 'CBDU12345'
      })

      expect(() => validateRegistration(registration)).not.toThrow()
    })

    it('NRW/SEPA: rejects missing cbduNumber', () => {
      ;[REGULATOR.NRW, REGULATOR.SEPA].forEach((regulator) => {
        const registration = buildRegistration({
          submittedToRegulator: regulator,
          cbduNumber: undefined
        })

        expect(() => validateRegistration(registration)).toThrow(
          /Invalid registration data.*cbduNumber.*is required/
        )
      })
    })

    it('NRW/SEPA: accepts any string format', () => {
      ;[REGULATOR.NRW, REGULATOR.SEPA].forEach((regulator) => {
        const registration = buildRegistration({
          submittedToRegulator: regulator,
          cbduNumber: 'ANY-FORMAT-123'
        })

        expect(() => validateRegistration(registration)).not.toThrow()
      })
    })

    it('NIEA: accepts when cbduNumber is omitted (optional for NIEA)', () => {
      const registration = buildRegistration({
        submittedToRegulator: REGULATOR.NIEA,
        cbduNumber: undefined
      })

      expect(() => validateRegistration(registration)).not.toThrow()
    })

    it('NIEA: accepts when cbduNumber is provided', () => {
      const registration = buildRegistration({
        submittedToRegulator: REGULATOR.NIEA,
        cbduNumber: 'NIEA-123'
      })

      expect(() => validateRegistration(registration)).not.toThrow()
    })
  })

  describe('waste exemption validation by regulator', () => {
    it('EA: accepts valid WEX reference and code format', () => {
      const registration = buildRegistration({
        submittedToRegulator: REGULATOR.EA,
        wasteManagementPermits: [
          {
            type: 'waste_exemption',
            exemptions: [
              {
                reference: 'WEX123456',
                exemptionCode: 'U9',
                materials: [MATERIAL.PAPER]
              }
            ]
          }
        ]
      })

      expect(() => validateRegistration(registration)).not.toThrow()
    })

    it('NRW/SEPA/NIEA: accepts flexible reference and code formats', () => {
      ;[REGULATOR.NRW, REGULATOR.SEPA, REGULATOR.NIEA].forEach((regulator) => {
        const registration = buildRegistration({
          submittedToRegulator: regulator,
          wasteManagementPermits: [
            {
              type: 'waste_exemption',
              exemptions: [
                {
                  reference: 'SEPA/EX/2024/001234',
                  exemptionCode: 'SEPA1',
                  materials: [MATERIAL.PAPER]
                }
              ]
            }
          ]
        })

        expect(() => validateRegistration(registration)).not.toThrow()
      })
    })

    it('EA: rejects non-WEX reference format', () => {
      const registration = buildRegistration({
        submittedToRegulator: REGULATOR.EA,
        wasteManagementPermits: [
          {
            type: 'waste_exemption',
            exemptions: [
              {
                reference: 'SEPA/EX/2024/001234',
                exemptionCode: 'U9',
                materials: [MATERIAL.PAPER]
              }
            ]
          }
        ]
      })

      expect(() => validateRegistration(registration)).toThrow(
        /Invalid registration data.*reference.*WEX reference must be in format WEX followed by 6 digits/
      )
    })

    it('EA: rejects invalid exemption code format', () => {
      const registration = buildRegistration({
        submittedToRegulator: REGULATOR.EA,
        wasteManagementPermits: [
          {
            type: 'waste_exemption',
            exemptions: [
              {
                reference: 'WEX123456',
                exemptionCode: 'SEPA1',
                materials: [MATERIAL.PAPER]
              }
            ]
          }
        ]
      })

      expect(() => validateRegistration(registration)).toThrow(
        /Invalid registration data.*exemptionCode.*Exemption code must be a letter followed by 1-2 digits/
      )
    })

    it('NRW/SEPA/NIEA: rejects missing reference', () => {
      ;[REGULATOR.NRW, REGULATOR.SEPA, REGULATOR.NIEA].forEach((regulator) => {
        const registration = buildRegistration({
          submittedToRegulator: regulator,
          wasteManagementPermits: [
            {
              type: 'waste_exemption',
              exemptions: [
                { exemptionCode: 'SEPA1', materials: [MATERIAL.PAPER] }
              ]
            }
          ]
        })

        expect(() => validateRegistration(registration)).toThrow(
          /Invalid registration data.*reference.*is required/
        )
      })
    })

    it('NRW/SEPA/NIEA: rejects missing exemptionCode', () => {
      ;[REGULATOR.NRW, REGULATOR.SEPA, REGULATOR.NIEA].forEach((regulator) => {
        const registration = buildRegistration({
          submittedToRegulator: regulator,
          wasteManagementPermits: [
            {
              type: 'waste_exemption',
              exemptions: [
                {
                  reference: 'NIEA/EX/2024/999',
                  materials: [MATERIAL.ALUMINIUM]
                }
              ]
            }
          ]
        })

        expect(() => validateRegistration(registration)).toThrow(
          /Invalid registration data.*exemptionCode.*is required/
        )
      })
    })
  })

  describe('overseasSites validation', () => {
    it('exporter: accepts valid overseasSites map with three-digit keys', () => {
      const registration = buildRegistration({
        wasteProcessingType: 'exporter',
        overseasSites: {
          '001': { overseasSiteId: 'abc123' },
          '003': { overseasSiteId: 'def456' }
        }
      })

      expect(() => validateRegistration(registration)).not.toThrow()
    })

    it('exporter: accepts empty overseasSites map', () => {
      const registration = buildRegistration({
        wasteProcessingType: 'exporter',
        overseasSites: {}
      })

      expect(() => validateRegistration(registration)).not.toThrow()
    })

    it('exporter: defaults to empty map when overseasSites is omitted', () => {
      const registration = buildRegistration({
        wasteProcessingType: 'exporter'
      })

      const result = validateRegistration(registration)
      expect(result.overseasSites).toEqual({})
    })

    it('exporter: strips overseasSites entries with non-three-digit keys', () => {
      const registration = buildRegistration({
        wasteProcessingType: 'exporter',
        overseasSites: {
          abc: { overseasSiteId: 'stripped1' },
          1234: { overseasSiteId: 'stripped2' },
          '001': { overseasSiteId: 'kept' }
        }
      })

      const result = validateRegistration(registration)
      expect(result.overseasSites).toEqual({
        '001': { overseasSiteId: 'kept' }
      })
    })

    it('exporter: rejects overseasSites entry without overseasSiteId', () => {
      const registration = buildRegistration({
        wasteProcessingType: 'exporter',
        overseasSites: {
          '001': {}
        }
      })

      expect(() => validateRegistration(registration)).toThrow(
        /Invalid registration data.*overseasSiteId.*is required/
      )
    })

    it('reprocessor: rejects when overseasSites is provided', () => {
      const registration = buildRegistration({
        wasteProcessingType: 'reprocessor'
      })
      registration.overseasSites = {
        '001': { overseasSiteId: 'abc123' }
      }

      expect(() => validateRegistration(registration)).toThrow(
        /Invalid registration data.*overseasSites.*is not allowed/
      )
    })
  })

  describe('conditional field validation by wasteProcessingType', () => {
    it('reprocessor: rejects when missing required fields', () => {
      const requiredFields = [
        {
          field: 'site',
          error: /Invalid registration data.*site.*is required/
        },
        {
          field: 'yearlyMetrics',
          error: /Invalid registration data.*yearlyMetrics.*is required/
        },
        {
          field: 'plantEquipmentDetails',
          error: /Invalid registration data.*plantEquipmentDetails.*is required/
        }
      ]

      requiredFields.forEach(({ field, error }) => {
        const registration = buildRegistration({
          wasteProcessingType: 'reprocessor',
          [field]: undefined
        })

        expect(() => validateRegistration(registration)).toThrow(error)
      })
    })

    it('exporter: rejects when missing exportPorts', () => {
      const registration = buildRegistration({
        wasteProcessingType: 'exporter',
        exportPorts: undefined
      })

      expect(() => validateRegistration(registration)).toThrow(
        /Invalid registration data.*exportPorts.*is required/
      )
    })

    it('exporter: rejects when missing noticeAddress', () => {
      const registration = buildRegistration({
        wasteProcessingType: 'exporter',
        noticeAddress: undefined
      })

      expect(() => validateRegistration(registration)).toThrow(
        /Invalid registration data.*noticeAddress.*is required/
      )
    })

    it('exporter: accepts when site is omitted (optional for exporter)', () => {
      const registration = buildRegistration({
        wasteProcessingType: 'exporter',
        site: undefined
      })

      expect(() => validateRegistration(registration)).not.toThrow()
    })

    it('reprocessor: accepts when noticeAddress is omitted (optional for reprocessor)', () => {
      const registration = buildRegistration({
        wasteProcessingType: 'reprocessor',
        noticeAddress: undefined
      })

      expect(() => validateRegistration(registration)).not.toThrow()
    })
  })

  describe('waste permit validation by type and wasteProcessingType', () => {
    it('reprocessor: rejects permits missing required fields', () => {
      const permitTests = [
        {
          permit: {
            type: 'environmental_permit',
            permitNumber: 'EPR/AB1234CD/A001'
          },
          error: /Invalid registration data.*authorisedMaterials.*is required/
        },
        {
          permit: { type: 'waste_exemption' },
          error: /Invalid registration data.*exemptions.*is required/
        }
      ]

      permitTests.forEach(({ permit, error }) => {
        const registration = buildRegistration({
          wasteProcessingType: 'reprocessor',
          wasteManagementPermits: [permit]
        })

        expect(() => validateRegistration(registration)).toThrow(error)
      })
    })
  })

  describe('material-specific field validation', () => {
    it('glass: rejects when missing glassRecyclingProcess', () => {
      const registration = buildRegistration({
        material: MATERIAL.GLASS,
        glassRecyclingProcess: undefined
      })

      expect(() => validateRegistration(registration)).toThrow(
        /Invalid registration data.*glassRecyclingProcess.*is required/
      )
    })

    it('glass: accepts valid glassRecyclingProcess', () => {
      const registration = buildRegistration({
        material: MATERIAL.GLASS,
        glassRecyclingProcess: ['glass_re_melt']
      })

      expect(() => validateRegistration(registration)).not.toThrow()
    })

    it('non-glass: accepts when glassRecyclingProcess is omitted', () => {
      const registration = buildRegistration({
        material: MATERIAL.PAPER,
        glassRecyclingProcess: null
      })

      expect(() => validateRegistration(registration)).not.toThrow()
    })
  })
})

describe('validateAccreditation', () => {
  describe('conditional field validation by wasteProcessingType', () => {
    it('reprocessor: rejects when missing site', () => {
      const accreditation = buildAccreditation({
        wasteProcessingType: 'reprocessor',
        site: undefined
      })

      expect(() => validateAccreditation(accreditation)).toThrow(
        /Invalid accreditation data.*site.*is required/
      )
    })

    it('exporter: accepts when site is omitted (optional for exporter)', () => {
      const accreditation = buildAccreditation({
        wasteProcessingType: 'exporter',
        site: undefined,
        orsFileUploads: [
          {
            defraFormUploadedFileId: 'test-file-id',
            defraFormUserDownloadLink: 'https://example.com/test-file'
          }
        ]
      })

      expect(() => validateAccreditation(accreditation)).not.toThrow()
    })

    it('exporter: rejects when missing orsFileUploads', () => {
      const accreditation = buildAccreditation({
        wasteProcessingType: 'exporter',
        orsFileUploads: undefined
      })

      expect(() => validateAccreditation(accreditation)).toThrow(
        /Invalid accreditation data.*orsFileUploads.*is required/
      )
    })

    it('reprocessor: accepts when orsFileUploads is omitted (optional for reprocessor)', () => {
      const accreditation = buildAccreditation({
        wasteProcessingType: 'reprocessor',
        site: {
          line1: '123 Test Street',
          postcode: 'AB12 3CD'
        },
        orsFileUploads: undefined
      })

      expect(() => validateAccreditation(accreditation)).not.toThrow()
    })

    it('reprocessor: accepts when site is provided', () => {
      const accreditation = buildAccreditation({
        wasteProcessingType: 'reprocessor',
        site: {
          line1: '123 Test Street',
          postcode: 'AB12 3CD'
        }
      })

      expect(() => validateAccreditation(accreditation)).not.toThrow()
    })
  })

  describe('material-specific field validation', () => {
    it('glass: rejects when missing glassRecyclingProcess', () => {
      const accreditation = buildAccreditation({
        material: MATERIAL.GLASS,
        glassRecyclingProcess: undefined
      })

      expect(() => validateAccreditation(accreditation)).toThrow(
        /Invalid accreditation data.*glassRecyclingProcess.*is required/
      )
    })

    it('glass: accepts valid glassRecyclingProcess', () => {
      const accreditation = buildAccreditation({
        material: MATERIAL.GLASS,
        glassRecyclingProcess: ['glass_re_melt']
      })

      expect(() => validateAccreditation(accreditation)).not.toThrow()
    })

    it('non-glass: accepts when glassRecyclingProcess is null', () => {
      const accreditation = buildAccreditation({
        material: MATERIAL.PAPER,
        glassRecyclingProcess: null
      })

      expect(() => validateAccreditation(accreditation)).not.toThrow()
    })
  })

  describe('PRN issuance business plan validation', () => {
    it('rejects when incomeBusinessPlan has fewer than 7 items', () => {
      const accreditation = buildAccreditation({
        prnIssuance: {
          tonnageBand: 'up_to_10000',
          signatories: [
            {
              fullName: 'Test Person',
              email: 'test@example.com',
              phone: '1234567890',
              title: 'Director'
            }
          ],
          incomeBusinessPlan: [
            {
              usageDescription: 'Infrastructure',
              detailedExplanation: 'Details',
              percentIncomeSpent: 100
            }
          ]
        }
      })

      expect(() => validateAccreditation(accreditation)).toThrow(
        /Invalid accreditation data.*incomeBusinessPlan.*must contain 7 items/
      )
    })
  })
})

describe('organisationJSONSchemaOverrides', () => {
  const validate = (data, options = {}) =>
    organisationJSONSchemaOverrides.validate(data, {
      abortEarly: false,
      stripUnknown: true,
      ...options
    })

  it('validates a complete organisation with registrations and accreditations', () => {
    const registration = buildRegistration({
      material: MATERIAL.ALUMINIUM,
      wasteProcessingType: WASTE_PROCESSING_TYPE.REPROCESSOR
    })
    delete registration.glassRecyclingProcess
    const accreditation = buildAccreditation({
      material: MATERIAL.ALUMINIUM,
      wasteProcessingType: WASTE_PROCESSING_TYPE.REPROCESSOR
    })
    delete accreditation.glassRecyclingProcess

    const organisation = buildOrganisation({
      schemaVersion: 1,
      registrations: [registration],
      accreditations: [accreditation]
    })
    delete organisation.id

    const { error } = validate(organisation)
    expect(error).toBeUndefined()
  })

  describe('fixRegistration', () => {
    it('allows null for optional registration number', () => {
      const registration = buildRegistration({
        status: REG_ACC_STATUS.CREATED,
        registrationNumber: null,
        material: MATERIAL.ALUMINIUM,
        wasteProcessingType: WASTE_PROCESSING_TYPE.REPROCESSOR
      })
      delete registration.glassRecyclingProcess
      const organisation = buildOrganisation({
        schemaVersion: 1,
        registrations: [registration],
        accreditations: []
      })
      delete organisation.id

      const { error } = validate(organisation)
      expect(error).toBeUndefined()
    })

    it('allows missing registration number when status is APPROVED', () => {
      const registration = buildRegistration({
        status: REG_ACC_STATUS.APPROVED,
        registrationNumber: undefined,
        material: MATERIAL.ALUMINIUM,
        wasteProcessingType: WASTE_PROCESSING_TYPE.REPROCESSOR
      })
      delete registration.glassRecyclingProcess
      const organisation = buildOrganisation({
        schemaVersion: 1,
        registrations: [registration],
        accreditations: []
      })
      delete organisation.id

      const { error } = validate(organisation)
      expect(error).toBeUndefined()
    })

    it('reprocessor: allows missing site, wasteManagementPermits, yearlyMetrics, and plantEquipmentDetails', () => {
      const registration = buildRegistration({
        wasteProcessingType: WASTE_PROCESSING_TYPE.REPROCESSOR,
        material: MATERIAL.ALUMINIUM // avoid glass requirements
      })
      delete registration.site
      delete registration.wasteManagementPermits
      delete registration.yearlyMetrics
      delete registration.plantEquipmentDetails

      const organisation = buildOrganisation({
        schemaVersion: 1,
        registrations: [registration],
        accreditations: []
      })
      delete organisation.id

      const { error } = validate(organisation)
      expect(error).toBeUndefined()
    })

    it('exporter: allows missing noticeAddress, exportPorts, and orsFileUploads', () => {
      const registration = buildRegistration({
        wasteProcessingType: WASTE_PROCESSING_TYPE.EXPORTER,
        material: MATERIAL.ALUMINIUM // avoid glass requirements
      })
      delete registration.noticeAddress
      delete registration.exportPorts
      delete registration.orsFileUploads

      const organisation = buildOrganisation({
        schemaVersion: 1,
        registrations: [registration],
        accreditations: []
      })
      delete organisation.id

      const { error } = validate(organisation)
      expect(error).toBeUndefined()
    })

    it('glass: allows missing glassRecyclingProcess', () => {
      const registration = buildRegistration({
        material: MATERIAL.GLASS
      })
      delete registration.glassRecyclingProcess

      const organisation = buildOrganisation({
        schemaVersion: 1,
        registrations: [registration],
        accreditations: []
      })
      delete organisation.id

      const { error } = validate(organisation)
      expect(error).toBeUndefined()
    })
  })

  describe('fixAccreditation', () => {
    it('allows null for accreditation number when not approved', () => {
      const accreditation = buildAccreditation({
        status: REG_ACC_STATUS.CREATED,
        accreditationNumber: null,
        material: MATERIAL.ALUMINIUM,
        wasteProcessingType: WASTE_PROCESSING_TYPE.REPROCESSOR
      })
      delete accreditation.glassRecyclingProcess
      const organisation = buildOrganisation({
        schemaVersion: 1,
        registrations: [],
        accreditations: [accreditation]
      })
      delete organisation.id

      const { error } = validate(organisation)
      expect(error).toBeUndefined()
    })

    it('allows missing site for reprocessor', () => {
      const accreditation = buildAccreditation({
        wasteProcessingType: WASTE_PROCESSING_TYPE.REPROCESSOR,
        material: MATERIAL.ALUMINIUM
      })
      delete accreditation.site
      delete accreditation.glassRecyclingProcess

      const organisation = buildOrganisation({
        schemaVersion: 1,
        registrations: [],
        accreditations: [accreditation]
      })
      delete organisation.id

      const { error } = validate(organisation)
      expect(error).toBeUndefined()
    })
  })
})

describe('normaliseOrganisationFromDb', () => {
  // Import dynamically to avoid circular dependency issues in test setup
  let normaliseOrganisationFromDb

  beforeAll(async () => {
    const module = await import('./validation.js')
    normaliseOrganisationFromDb = module.normaliseOrganisationFromDb
  })

  it('defaults undefined registrations to empty array', () => {
    const dbDoc = {
      _id: new ObjectId(),
      orgId: 123,
      version: 1
      // registrations is undefined
    }

    const result = normaliseOrganisationFromDb(dbDoc)

    expect(result.registrations).toEqual([])
  })

  it('defaults undefined accreditations to empty array', () => {
    const dbDoc = {
      _id: new ObjectId(),
      orgId: 123,
      version: 1
      // accreditations is undefined
    }

    const result = normaliseOrganisationFromDb(dbDoc)

    expect(result.accreditations).toEqual([])
  })

  it('defaults undefined users to empty array', () => {
    const dbDoc = {
      _id: new ObjectId(),
      orgId: 123,
      version: 1
      // users is undefined
    }

    const result = normaliseOrganisationFromDb(dbDoc)

    expect(result.users).toEqual([])
  })

  it('preserves existing arrays', () => {
    const registration = buildRegistration()
    const accreditation = buildAccreditation()
    const dbDoc = {
      _id: new ObjectId(),
      orgId: 123,
      version: 1,
      registrations: [registration],
      accreditations: [accreditation],
      users: [
        {
          email: 'test@example.com',
          fullName: 'Test User',
          roles: ['standard']
        }
      ]
    }

    const result = normaliseOrganisationFromDb(dbDoc)

    expect(result.registrations).toHaveLength(1)
    expect(result.accreditations).toHaveLength(1)
    expect(result.users).toHaveLength(1)
  })

  it('preserves MongoDB fields like _id and version', () => {
    const objectId = new ObjectId()
    const dbDoc = {
      _id: objectId,
      orgId: 123,
      version: 5,
      schemaVersion: 1,
      statusHistory: [{ status: 'created', updatedAt: new Date() }]
    }

    const result = normaliseOrganisationFromDb(dbDoc)

    expect(result._id).toEqual(objectId)
    expect(result.version).toBe(5)
    expect(result.schemaVersion).toBe(1)
    expect(result.statusHistory).toHaveLength(1)
  })

  it('preserves unknown fields from database', () => {
    const dbDoc = {
      _id: new ObjectId(),
      orgId: 123,
      version: 1,
      someFutureField: 'should be kept'
    }

    const result = normaliseOrganisationFromDb(dbDoc)

    expect(result.someFutureField).toBe('should be kept')
  })
})
