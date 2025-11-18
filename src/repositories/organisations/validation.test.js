import { describe, expect, it } from 'vitest'
import { validateRegistration, validateStatusHistory } from './validation.js'
import { STATUS, REGULATOR, MATERIAL } from '#domain/organisations/model.js'
import { buildRegistration } from './contract/test-data.js'

describe('validateStatusHistory', () => {
  it('throws badImplementation when statusHistory item has invalid status', () => {
    const statusHistory = [{ status: 'invalid-status', updatedAt: new Date() }]

    expect(() => validateStatusHistory(statusHistory)).toThrow(
      /Invalid statusHistory.*This is a system error/
    )
  })

  it('throws badImplementation when statusHistory item missing updatedAt', () => {
    const statusHistory = [{ status: STATUS.CREATED }]

    expect(() => validateStatusHistory(statusHistory)).toThrow(
      /Invalid statusHistory.*updatedAt.*required.*This is a system error/
    )
  })

  it('validates statusHistory with optional updatedBy field', () => {
    const statusHistory = [
      {
        status: STATUS.CREATED,
        updatedAt: new Date(),
        updatedBy: '507f1f77bcf86cd799439011'
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
    it('EA/NRW: rejects cbduNumber not starting with CBDU', () => {
      ;[REGULATOR.EA, REGULATOR.NRW].forEach((regulator) => {
        const registration = buildRegistration({
          submittedToRegulator: regulator,
          cbduNumber: 'ABC12345'
        })

        expect(() => validateRegistration(registration)).toThrow(
          /Invalid registration data.*cbduNumber.*string.pattern.base/
        )
      })
    })

    it('EA/NRW: rejects cbduNumber shorter than 8 characters', () => {
      ;[REGULATOR.EA, REGULATOR.NRW].forEach((regulator) => {
        const registration = buildRegistration({
          submittedToRegulator: regulator,
          cbduNumber: 'CBDU123'
        })

        expect(() => validateRegistration(registration)).toThrow(
          /Invalid registration data.*cbduNumber.*string.min/
        )
      })
    })

    it('EA/NRW: rejects cbduNumber longer than 10 characters', () => {
      ;[REGULATOR.EA, REGULATOR.NRW].forEach((regulator) => {
        const registration = buildRegistration({
          submittedToRegulator: regulator,
          cbduNumber: 'CBDU1234567'
        })

        expect(() => validateRegistration(registration)).toThrow(
          /Invalid registration data.*cbduNumber.*string.max/
        )
      })
    })

    it('SEPA: rejects missing cbduNumber', () => {
      const registration = buildRegistration({
        submittedToRegulator: REGULATOR.SEPA,
        cbduNumber: undefined
      })

      expect(() => validateRegistration(registration)).toThrow(
        /Invalid registration data.*cbduNumber.*any.required/
      )
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
    it('EA/NRW: accepts valid WEX reference and code format', () => {
      ;[REGULATOR.EA, REGULATOR.NRW].forEach((regulator) => {
        const registration = buildRegistration({
          submittedToRegulator: regulator,
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
    })

    it('SEPA/NIEA: accepts flexible reference and code formats', () => {
      ;[REGULATOR.SEPA, REGULATOR.NIEA].forEach((regulator) => {
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

    it('EA/NRW: rejects non-WEX reference format', () => {
      ;[REGULATOR.EA, REGULATOR.NRW].forEach((regulator) => {
        const registration = buildRegistration({
          submittedToRegulator: regulator,
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
    })

    it('EA/NRW: rejects invalid exemption code format', () => {
      ;[REGULATOR.EA, REGULATOR.NRW].forEach((regulator) => {
        const registration = buildRegistration({
          submittedToRegulator: regulator,
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
    })

    it('SEPA/NIEA: rejects missing reference', () => {
      ;[REGULATOR.SEPA, REGULATOR.NIEA].forEach((regulator) => {
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

    it('SEPA/NIEA: rejects missing exemptionCode', () => {
      ;[REGULATOR.SEPA, REGULATOR.NIEA].forEach((regulator) => {
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
        glassRecyclingProcess: undefined
      })

      expect(() => validateRegistration(registration)).not.toThrow()
    })
  })
})
