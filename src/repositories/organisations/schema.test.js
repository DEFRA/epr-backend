import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import {
  organisationInsertSchema,
  registrationSchema,
  statusHistoryItemSchema
} from './schema.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const SEED_DATA_DIR = join(
  __dirname,
  '../../data/fixtures/common/epr-organisations'
)

/**
 * Load JSON seed data file
 */
const loadSeedData = (filename) => {
  const filePath = join(SEED_DATA_DIR, filename)
  const content = readFileSync(filePath, 'utf-8')
  return JSON.parse(content)
}

/**
 * Format Joi validation error details for readable test output
 */
const formatValidationError = (error) => {
  return error.details
    .map((d) => `  - ${d.path.join('.')}: ${d.message}`)
    .join('\n')
}

/**
 * Validate organisation data using Joi schema
 */
const validateOrganisation = (data, filename) => {
  const { error, value } = organisationInsertSchema.validate(data, {
    abortEarly: false,
    stripUnknown: false,
    allowUnknown: true // Allow fields like schemaVersion, version that are in the seed data
  })

  if (error) {
    const details = formatValidationError(error)
    throw new Error(
      `Validation failed for ${filename}:\n${details}\n\nFull error: ${error.message}`
    )
  }

  return value
}

/**
 * Validate registration data using Joi schema
 */
const validateRegistrationData = (registration, filename, index) => {
  const { error, value } = registrationSchema.validate(registration, {
    abortEarly: false,
    stripUnknown: false,
    allowUnknown: true
  })

  if (error) {
    const details = formatValidationError(error)
    throw new Error(
      `Registration validation failed for ${filename} (registration #${index}):\n${details}`
    )
  }

  return value
}

/**
 * Validate status history items
 */
const validateStatusHistoryData = (statusHistory, filename, context) => {
  statusHistory.forEach((item, index) => {
    const { error } = statusHistoryItemSchema.validate(item, {
      abortEarly: false
    })

    if (error) {
      const details = formatValidationError(error)
      throw new Error(
        `Status history validation failed for ${filename} (${context}, item #${index}):\n${details}`
      )
    }
  })
}

describe('Seed Data Validation', () => {
  const seedFiles = [
    'sample-organisation-1.json',
    'sample-organisation-2.json',
    'sample-organisation-3.json',
    'sample-organisation-4.json'
  ]

  describe('Organisation Schema Validation', () => {
    seedFiles.forEach((filename) => {
      it(`should validate ${filename} against organisationInsertSchema`, () => {
        const data = loadSeedData(filename)

        expect(() => validateOrganisation(data, filename)).not.toThrow()

        // Additional validation checks
        expect(data).toHaveProperty('id')
        expect(data).toHaveProperty('orgId')
        expect(data).toHaveProperty('wasteProcessingTypes')
        expect(data).toHaveProperty('companyDetails')
        expect(data).toHaveProperty('submitterContactDetails')
      })
    })
  })

  describe('Registration Schema Validation', () => {
    seedFiles.forEach((filename) => {
      it(`should validate all registrations in ${filename}`, () => {
        const data = loadSeedData(filename)

        if (data.registrations && data.registrations.length > 0) {
          data.registrations.forEach((registration, index) => {
            expect(() =>
              validateRegistrationData(registration, filename, index)
            ).not.toThrow()

            // Additional validation checks
            expect(registration).toHaveProperty('id')
            expect(registration).toHaveProperty('material')
            expect(registration).toHaveProperty('wasteProcessingType')
            expect(registration).toHaveProperty('cbduNumber')
          })
        }
      })
    })
  })

  describe('Status History Validation', () => {
    seedFiles.forEach((filename) => {
      it(`should validate organisation status history in ${filename}`, () => {
        const data = loadSeedData(filename)

        if (data.statusHistory) {
          expect(() =>
            validateStatusHistoryData(
              data.statusHistory,
              filename,
              'organisation'
            )
          ).not.toThrow()
        }
      })

      it(`should validate registration status histories in ${filename}`, () => {
        const data = loadSeedData(filename)

        if (data.registrations) {
          data.registrations.forEach((registration, index) => {
            if (registration.statusHistory) {
              expect(() =>
                validateStatusHistoryData(
                  registration.statusHistory,
                  filename,
                  `registration #${index}`
                )
              ).not.toThrow()
            }
          })
        }
      })

      it(`should validate accreditation status histories in ${filename}`, () => {
        const data = loadSeedData(filename)

        if (data.accreditations) {
          data.accreditations.forEach((accreditation, index) => {
            if (accreditation.statusHistory) {
              expect(() =>
                validateStatusHistoryData(
                  accreditation.statusHistory,
                  filename,
                  `accreditation #${index}`
                )
              ).not.toThrow()
            }
          })
        }
      })
    })
  })

  describe('Data Integrity Checks', () => {
    seedFiles.forEach((filename) => {
      it(`should have valid waste processing types in ${filename}`, () => {
        const data = loadSeedData(filename)

        expect(data.wasteProcessingTypes).toBeDefined()
        expect(Array.isArray(data.wasteProcessingTypes)).toBe(true)
        expect(data.wasteProcessingTypes.length).toBeGreaterThan(0)

        data.wasteProcessingTypes.forEach((type) => {
          expect(['reprocessor', 'exporter']).toContain(type)
        })
      })

      it(`should have valid regulator in ${filename}`, () => {
        const data = loadSeedData(filename)

        expect(data.submittedToRegulator).toBeDefined()
        expect(['ea', 'nrw', 'sepa', 'niea']).toContain(
          data.submittedToRegulator
        )
      })

      it(`should have valid contact details in ${filename}`, () => {
        const data = loadSeedData(filename)

        expect(data.submitterContactDetails).toBeDefined()
        expect(data.submitterContactDetails.fullName).toBeTruthy()
        expect(data.submitterContactDetails.email).toMatch(/@/)
        expect(data.submitterContactDetails.phone).toBeTruthy()
      })

      it(`should have valid company details in ${filename}`, () => {
        const data = loadSeedData(filename)

        expect(data.companyDetails).toBeDefined()
        expect(data.companyDetails.name).toBeTruthy()

        if (data.companyDetails.registrationNumber) {
          expect(data.companyDetails.registrationNumber).toMatch(
            /^[A-Z0-9]{8}$/i
          )
        }
      })
    })
  })

  describe('Registration-specific Validation', () => {
    seedFiles.forEach((filename) => {
      it(`should validate reprocessor-specific fields in ${filename}`, () => {
        const data = loadSeedData(filename)

        if (data.registrations) {
          data.registrations
            .filter((r) => r.wasteProcessingType === 'reprocessor')
            .forEach((registration, index) => {
              expect(
                registration.site,
                `Registration #${index} should have site for reprocessor`
              ).toBeDefined()
              expect(
                registration.wasteManagementPermits,
                `Registration #${index} should have wasteManagementPermits for reprocessor`
              ).toBeDefined()
              expect(
                registration.plantEquipmentDetails,
                `Registration #${index} should have plantEquipmentDetails for reprocessor`
              ).toBeDefined()
              expect(
                registration.yearlyMetrics,
                `Registration #${index} should have yearlyMetrics for reprocessor`
              ).toBeDefined()
            })
        }
      })

      it(`should validate exporter-specific fields in ${filename}`, () => {
        const data = loadSeedData(filename)

        if (data.registrations) {
          data.registrations
            .filter((r) => r.wasteProcessingType === 'exporter')
            .forEach((registration, index) => {
              expect(
                registration.exportPorts,
                `Registration #${index} should have exportPorts for exporter`
              ).toBeDefined()
              expect(
                registration.noticeAddress,
                `Registration #${index} should have noticeAddress for exporter`
              ).toBeDefined()
              expect(
                registration.orsFileUploads,
                `Registration #${index} should have orsFileUploads for exporter`
              ).toBeDefined()
            })
        }
      })

      it(`should validate glass-specific fields in ${filename}`, () => {
        const data = loadSeedData(filename)

        if (data.registrations) {
          data.registrations
            .filter((r) => r.material === 'glass')
            .forEach((registration, index) => {
              expect(
                registration.glassRecyclingProcess,
                `Registration #${index} should have glassRecyclingProcess for glass material`
              ).toBeDefined()
              expect(Array.isArray(registration.glassRecyclingProcess)).toBe(
                true
              )
            })
        }
      })
    })
  })

  describe('CBDU Number Validation', () => {
    seedFiles.forEach((filename) => {
      it(`should have valid CBDU numbers in ${filename}`, () => {
        const data = loadSeedData(filename)

        if (data.registrations) {
          data.registrations.forEach((registration, index) => {
            expect(
              registration.cbduNumber,
              `Registration #${index} should have cbduNumber`
            ).toBeDefined()
            expect(
              registration.cbduNumber,
              `Registration #${index} CBDU number should start with CBDU`
            ).toMatch(/^[cC][bB][dD][uU]/)
            expect(
              registration.cbduNumber.length,
              `Registration #${index} CBDU number should be 8-10 characters`
            ).toBeGreaterThanOrEqual(8)
            expect(
              registration.cbduNumber.length,
              `Registration #${index} CBDU number should be 8-10 characters`
            ).toBeLessThanOrEqual(10)
          })
        }
      })
    })
  })

  describe('File Upload Validation', () => {
    seedFiles.forEach((filename) => {
      it(`should have valid file uploads in ${filename}`, () => {
        const data = loadSeedData(filename)

        if (data.registrations) {
          data.registrations.forEach((registration, index) => {
            if (registration.samplingInspectionPlanPart1FileUploads) {
              registration.samplingInspectionPlanPart1FileUploads.forEach(
                (upload) => {
                  expect(upload.defraFormUploadedFileId).toBeTruthy()
                  expect(upload.defraFormUserDownloadLink).toMatch(
                    /^https?:\/\//
                  )
                }
              )
            }

            if (registration.orsFileUploads) {
              registration.orsFileUploads.forEach((upload) => {
                expect(upload.defraFormUploadedFileId).toBeTruthy()
                expect(upload.defraFormUserDownloadLink).toMatch(/^https?:\/\//)
              })
            }
          })
        }

        if (data.accreditations) {
          data.accreditations.forEach((accreditation, index) => {
            if (accreditation.samplingInspectionPlanPart2FileUploads) {
              accreditation.samplingInspectionPlanPart2FileUploads.forEach(
                (upload) => {
                  expect(upload.defraFormUploadedFileId).toBeTruthy()
                  expect(upload.defraFormUserDownloadLink).toMatch(
                    /^https?:\/\//
                  )
                }
              )
            }
          })
        }
      })
    })
  })
})
