import { describe, expect, it } from 'vitest'
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
      /Invalid statusHistory.*updatedAt.*required.*This is a system error/
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
        /Invalid registration data.*cbduNumber.*string.pattern.base/
      )
    })

    it('EA: rejects cbduNumber shorter than 8 characters', () => {
      const registration = buildRegistration({
        submittedToRegulator: REGULATOR.EA,
        cbduNumber: 'CBDU123'
      })

      expect(() => validateRegistration(registration)).toThrow(
        /Invalid registration data.*cbduNumber.*string.min/
      )
    })

    it('EA: rejects cbduNumber longer than 10 characters', () => {
      const registration = buildRegistration({
        submittedToRegulator: REGULATOR.EA,
        cbduNumber: 'CBDU1234567'
      })

      expect(() => validateRegistration(registration)).toThrow(
        /Invalid registration data.*cbduNumber.*string.max/
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
          /Invalid registration data.*cbduNumber.*any.required/
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
        /Invalid registration data.*reference.*string.pattern.base/
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
        /Invalid registration data.*exemptionCode.*string.pattern.base/
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
          /Invalid registration data.*reference.*any.required/
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
          /Invalid registration data.*exemptionCode.*any.required/
        )
      })
    })
  })

  describe('conditional field validation by wasteProcessingType', () => {
    it('reprocessor: rejects when missing required fields', () => {
      const requiredFields = [
        {
          field: 'site',
          error: /Invalid registration data.*site.*any.required/
        },
        {
          field: 'yearlyMetrics',
          error: /Invalid registration data.*yearlyMetrics.*any.required/
        },
        {
          field: 'plantEquipmentDetails',
          error:
            /Invalid registration data.*plantEquipmentDetails.*any.required/
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
        /Invalid registration data.*exportPorts.*any.required/
      )
    })

    it('exporter: rejects when missing noticeAddress', () => {
      const registration = buildRegistration({
        wasteProcessingType: 'exporter',
        noticeAddress: undefined
      })

      expect(() => validateRegistration(registration)).toThrow(
        /Invalid registration data.*noticeAddress.*any.required/
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
          error: /Invalid registration data.*authorisedMaterials.*any.required/
        },
        {
          permit: { type: 'waste_exemption' },
          error: /Invalid registration data.*exemptions.*any.required/
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
        /Invalid registration data.*glassRecyclingProcess.*any.required/
      )
    })

    it('glass: accepts glassRecyclingProcess with exactly one valid value', () => {
      ;['glass_re_melt', 'glass_other'].forEach((process) => {
        const registration = buildRegistration({
          material: MATERIAL.GLASS,
          glassRecyclingProcess: [process]
        })

        expect(() => validateRegistration(registration)).not.toThrow()
      })
    })

    it('glass: rejects glassRecyclingProcess with both values', () => {
      const registration = buildRegistration({
        material: MATERIAL.GLASS,
        glassRecyclingProcess: ['glass_re_melt', 'glass_other']
      })

      expect(() => validateRegistration(registration)).toThrow(
        /Invalid registration data.*glassRecyclingProcess.*array.max/
      )
    })

    it('glass: rejects empty glassRecyclingProcess array', () => {
      const registration = buildRegistration({
        material: MATERIAL.GLASS,
        glassRecyclingProcess: []
      })

      expect(() => validateRegistration(registration)).toThrow(
        /Invalid registration data.*glassRecyclingProcess.*array.min/
      )
    })

    it('non-glass: accepts when glassRecyclingProcess is null', () => {
      const registration = buildRegistration({
        material: MATERIAL.PAPER,
        glassRecyclingProcess: null
      })

      expect(() => validateRegistration(registration)).not.toThrow()
    })

    it('non-glass: rejects when glassRecyclingProcess has a value', () => {
      const registration = buildRegistration({
        material: MATERIAL.PAPER,
        glassRecyclingProcess: ['glass_re_melt']
      })

      expect(() => validateRegistration(registration)).toThrow(
        /Invalid registration data.*glassRecyclingProcess/
      )
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
        /Invalid accreditation data.*site.*any.required/
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
        /Invalid accreditation data.*orsFileUploads.*any.required/
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
        /Invalid accreditation data.*glassRecyclingProcess.*any.required/
      )
    })

    it('glass: accepts glassRecyclingProcess with exactly one valid value', () => {
      ;['glass_re_melt', 'glass_other'].forEach((process) => {
        const accreditation = buildAccreditation({
          material: MATERIAL.GLASS,
          glassRecyclingProcess: [process]
        })

        expect(() => validateAccreditation(accreditation)).not.toThrow()
      })
    })

    it('glass: rejects glassRecyclingProcess with both values', () => {
      const accreditation = buildAccreditation({
        material: MATERIAL.GLASS,
        glassRecyclingProcess: ['glass_re_melt', 'glass_other']
      })

      expect(() => validateAccreditation(accreditation)).toThrow(
        /Invalid accreditation data.*glassRecyclingProcess.*array.max/
      )
    })

    it('glass: rejects empty glassRecyclingProcess array', () => {
      const accreditation = buildAccreditation({
        material: MATERIAL.GLASS,
        glassRecyclingProcess: []
      })

      expect(() => validateAccreditation(accreditation)).toThrow(
        /Invalid accreditation data.*glassRecyclingProcess.*array.min/
      )
    })

    it('non-glass: accepts when glassRecyclingProcess is null', () => {
      const accreditation = buildAccreditation({
        material: MATERIAL.PAPER,
        glassRecyclingProcess: null
      })

      expect(() => validateAccreditation(accreditation)).not.toThrow()
    })

    it('non-glass: rejects when glassRecyclingProcess has a value', () => {
      const accreditation = buildAccreditation({
        material: MATERIAL.PAPER,
        glassRecyclingProcess: ['glass_re_melt']
      })

      expect(() => validateAccreditation(accreditation)).toThrow(
        /Invalid accreditation data.*glassRecyclingProcess/
      )
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
        /Invalid accreditation data.*incomeBusinessPlan.*array.length/
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
