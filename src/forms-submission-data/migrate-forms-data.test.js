import { beforeEach, describe, expect, it, vi } from 'vitest'
import { migrateFormsData } from './migrate-forms-data.js'
import { logger } from '#common/helpers/logging/logger.js'
import { createFormSubmissionsRepository } from '#repositories/form-submissions/inmemory.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/index.js'

vi.mock('#common/helpers/logging/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn()
  }
}))

const validSubmission1 = {
  id: 'sub-1',
  orgId: 500001,
  rawSubmissionData: { someData: 'value1' }
}

const validSubmission2 = {
  id: 'sub-2',
  orgId: 500002,
  rawSubmissionData: { someData: 'value2' }
}

const transformedOrg1 = {
  id: 'org-123',
  orgId: 500001,
  companyDetails: { name: 'Test Company 1' },
  users: []
}

const transformedOrg2 = {
  id: 'org-456',
  orgId: 500002,
  companyDetails: { name: 'Test Company 2' },
  users: []
}

const validRegSubmission1 = {
  id: 'reg-1',
  rawSubmissionData: { regData: 'value1' }
}

const validRegSubmission2 = {
  id: 'reg-2',
  rawSubmissionData: { regData: 'value2' }
}

const transformedReg1 = {
  id: 'reg-1',
  orgName: 'Test Org 1',
  systemReference: 'REF-001'
}

describe('migrateFormsData', () => {
  let formsSubmissionRepository
  let organisationsRepository

  beforeEach(() => {
    vi.clearAllMocks()

    formsSubmissionRepository = {
      findAllOrganisations: vi.fn(),
      findAllRegistrations: vi.fn(),
      findAllAccreditations: vi.fn()
    }
    organisationsRepository = {
      upsert: vi.fn()
    }
  })

  describe('unit tests with mocked parseOrgSubmission', () => {
    let parseOrgSubmission
    let parseRegistrationSubmission
    let parseAccreditationSubmission

    beforeEach(async () => {
      // Import and mock all transform functions
      const orgModule = await import(
        '#formsubmission/organisation/transform-organisation.js'
      )
      parseOrgSubmission = vi.spyOn(orgModule, 'parseOrgSubmission')

      const regModule = await import(
        '#formsubmission/registration/transform-registration.js'
      )
      parseRegistrationSubmission = vi.spyOn(
        regModule,
        'parseRegistrationSubmission'
      )

      const accrModule = await import(
        '#formsubmission/accreditation/transform-accreditation.js'
      )
      parseAccreditationSubmission = vi.spyOn(
        accrModule,
        'parseAccreditationSubmission'
      )
    })

    afterEach(() => {
      // Restore the real implementation after each test
      parseOrgSubmission.mockRestore()
      parseRegistrationSubmission.mockRestore()
      parseAccreditationSubmission.mockRestore()
    })

    describe('persistence scenarios', () => {
      it('all org transforms and upsert succeed', async () => {
        formsSubmissionRepository.findAllOrganisations.mockResolvedValue([
          validSubmission1,
          validSubmission2
        ])
        formsSubmissionRepository.findAllRegistrations.mockResolvedValue([
          validRegSubmission1
        ])
        formsSubmissionRepository.findAllAccreditations.mockResolvedValue([])

        parseOrgSubmission
          .mockReturnValueOnce(transformedOrg1)
          .mockReturnValueOnce(transformedOrg2)
        parseRegistrationSubmission.mockReturnValueOnce(transformedReg1)
        organisationsRepository.upsert
          .mockResolvedValueOnce({ action: 'inserted' })
          .mockResolvedValueOnce({ action: 'updated' })

        await migrateFormsData(
          formsSubmissionRepository,
          organisationsRepository
        )

        expect(parseOrgSubmission).toHaveBeenCalledTimes(2)
        expect(parseOrgSubmission).toHaveBeenCalledWith(
          validSubmission1.id,
          validSubmission1.orgId,
          validSubmission1.rawSubmissionData
        )
        expect(parseOrgSubmission).toHaveBeenCalledWith(
          validSubmission2.id,
          validSubmission2.orgId,
          validSubmission2.rawSubmissionData
        )

        expect(parseRegistrationSubmission).toHaveBeenCalledTimes(1)
        expect(parseRegistrationSubmission).toHaveBeenCalledWith(
          validRegSubmission1.id,
          validRegSubmission1.rawSubmissionData
        )

        expect(organisationsRepository.upsert).toHaveBeenCalledTimes(2)
        expect(organisationsRepository.upsert).toHaveBeenCalledWith(
          transformedOrg1
        )
        expect(organisationsRepository.upsert).toHaveBeenCalledWith(
          transformedOrg2
        )

        expect(logger.info).toHaveBeenCalledWith({
          message: 'Transformed 2/2 organisation form submissions (0 failed)'
        })
        expect(logger.info).toHaveBeenCalledWith({
          message: 'Transformed 1/1 registration form submissions (0 failed)'
        })
        expect(logger.info).toHaveBeenCalledWith({
          message:
            'Migration completed: 2/2 organisations processed (1 inserted, 1 updated, 0 unchanged, 0 failed)'
        })
      })

      it('one upsert fails', async () => {
        formsSubmissionRepository.findAllOrganisations.mockResolvedValue([
          validSubmission1
        ])
        formsSubmissionRepository.findAllRegistrations.mockResolvedValue([])
        formsSubmissionRepository.findAllAccreditations.mockResolvedValue([])
        parseOrgSubmission.mockReturnValue(transformedOrg1)
        organisationsRepository.upsert.mockRejectedValue(
          new Error('Upsert failed')
        )

        await migrateFormsData(
          formsSubmissionRepository,
          organisationsRepository
        )

        expect(parseOrgSubmission).toHaveBeenCalledWith(
          validSubmission1.id,
          validSubmission1.orgId,
          validSubmission1.rawSubmissionData
        )
        expect(organisationsRepository.upsert).toHaveBeenCalledWith(
          transformedOrg1
        )

        expect(logger.info).toHaveBeenCalledWith({
          message: 'Transformed 1/1 organisation form submissions (0 failed)'
        })
        expect(logger.info).toHaveBeenCalledWith({
          message: 'Transformed 0/0 registration form submissions (0 failed)'
        })
        expect(logger.error).toHaveBeenCalledWith(
          expect.objectContaining({
            error: expect.any(Error),
            message: 'Error upserting organisation',
            event: expect.objectContaining({
              category: LOGGING_EVENT_CATEGORIES.DB,
              action: LOGGING_EVENT_ACTIONS.DATA_MIGRATION_FAILURE,
              reference: transformedOrg1.id
            })
          })
        )
        expect(logger.info).toHaveBeenCalledWith({
          message:
            'Migration completed: 0/1 organisations processed (0 inserted, 0 updated, 0 unchanged, 1 failed)'
        })
      })

      it('one without any change comparing to whats in db', async () => {
        formsSubmissionRepository.findAllOrganisations.mockResolvedValue([
          validSubmission1
        ])
        formsSubmissionRepository.findAllRegistrations.mockResolvedValue([])
        formsSubmissionRepository.findAllAccreditations.mockResolvedValue([])
        parseOrgSubmission.mockReturnValue(transformedOrg1)
        organisationsRepository.upsert.mockResolvedValue({
          action: 'unchanged'
        })

        await migrateFormsData(
          formsSubmissionRepository,
          organisationsRepository
        )

        expect(parseOrgSubmission).toHaveBeenCalledWith(
          validSubmission1.id,
          validSubmission1.orgId,
          validSubmission1.rawSubmissionData
        )
        expect(organisationsRepository.upsert).toHaveBeenCalledWith(
          transformedOrg1
        )

        expect(logger.info).toHaveBeenCalledWith({
          message: 'Transformed 1/1 organisation form submissions (0 failed)'
        })
        expect(logger.info).toHaveBeenCalledWith({
          message:
            'Migration completed: 1/1 organisations processed (0 inserted, 0 updated, 1 unchanged, 0 failed)'
        })
      })
    })

    describe('transformation failure scenarios', () => {
      it('1 org transform fails', async () => {
        formsSubmissionRepository.findAllOrganisations.mockResolvedValue([
          validSubmission1,
          validSubmission2
        ])
        formsSubmissionRepository.findAllRegistrations.mockResolvedValue([])
        formsSubmissionRepository.findAllAccreditations.mockResolvedValue([])
        parseOrgSubmission
          .mockReturnValueOnce(transformedOrg1)
          .mockImplementationOnce(() => {
            throw new Error('Transform failed')
          })
        organisationsRepository.upsert.mockResolvedValue({ action: 'inserted' })

        await migrateFormsData(
          formsSubmissionRepository,
          organisationsRepository
        )

        expect(parseOrgSubmission).toHaveBeenCalledTimes(2)
        expect(organisationsRepository.upsert).toHaveBeenCalledTimes(1)
        expect(organisationsRepository.upsert).toHaveBeenCalledWith(
          transformedOrg1
        )

        expect(logger.error).toHaveBeenCalledWith(
          expect.objectContaining({
            error: expect.any(Error),
            message: 'Error transforming organisation submission',
            event: expect.objectContaining({
              category: LOGGING_EVENT_CATEGORIES.DB,
              action: LOGGING_EVENT_ACTIONS.DATA_MIGRATION_FAILURE,
              reference: validSubmission2.id
            })
          })
        )
        expect(logger.info).toHaveBeenCalledWith({
          message: 'Transformed 1/2 organisation form submissions (1 failed)'
        })
        expect(logger.info).toHaveBeenCalledWith({
          message:
            'Migration completed: 1/1 organisations processed (1 inserted, 0 updated, 0 unchanged, 0 failed)'
        })
      })

      it('1 registration transform fails', async () => {
        formsSubmissionRepository.findAllOrganisations.mockResolvedValue([
          validSubmission1
        ])
        formsSubmissionRepository.findAllRegistrations.mockResolvedValue([
          validRegSubmission1,
          validRegSubmission2
        ])
        formsSubmissionRepository.findAllAccreditations.mockResolvedValue([])

        parseOrgSubmission.mockReturnValueOnce(transformedOrg1)
        parseRegistrationSubmission
          .mockReturnValueOnce(transformedReg1)
          .mockImplementationOnce(() => {
            throw new Error('Registration transform failed')
          })
        organisationsRepository.upsert.mockResolvedValue({ action: 'inserted' })

        await migrateFormsData(
          formsSubmissionRepository,
          organisationsRepository
        )

        expect(parseRegistrationSubmission).toHaveBeenCalledTimes(2)
        expect(logger.error).toHaveBeenCalledWith(
          expect.objectContaining({
            message: 'Error transforming registration submission',
            event: expect.objectContaining({
              reference: validRegSubmission2.id
            })
          })
        )
        expect(logger.info).toHaveBeenCalledWith({
          message: 'Transformed 1/2 registration form submissions (1 failed)'
        })
      })

      it('1 accreditation transform fails', async () => {
        const validAccrSubmission1 = {
          id: '507f1f77bcf86cd799439011',
          rawSubmissionData: { accrData: 'value1' }
        }
        const validAccrSubmission2 = {
          id: '507f1f77bcf86cd799439012',
          rawSubmissionData: { accrData: 'value2' }
        }

        formsSubmissionRepository.findAllOrganisations.mockResolvedValue([
          validSubmission1
        ])
        formsSubmissionRepository.findAllRegistrations.mockResolvedValue([])
        formsSubmissionRepository.findAllAccreditations.mockResolvedValue([
          validAccrSubmission1,
          validAccrSubmission2
        ])

        parseOrgSubmission.mockReturnValueOnce(transformedOrg1)
        parseAccreditationSubmission
          .mockReturnValueOnce({
            id: '507f1f77bcf86cd799439011',
            orgName: 'Test Org 1'
          })
          .mockImplementationOnce(() => {
            throw new Error('Accreditation transform failed')
          })
        organisationsRepository.upsert.mockResolvedValue({ action: 'inserted' })

        await migrateFormsData(
          formsSubmissionRepository,
          organisationsRepository
        )

        expect(parseAccreditationSubmission).toHaveBeenCalledTimes(2)
        expect(logger.error).toHaveBeenCalledWith(
          expect.objectContaining({
            message: 'Error transforming accreditation submission',
            event: expect.objectContaining({
              reference: validAccrSubmission2.id
            })
          })
        )
        expect(logger.info).toHaveBeenCalledWith({
          message: 'Transformed 1/2 accreditation form submissions (1 failed)'
        })
      })
    })
  })

  describe('integration test with fixtures', () => {
    let formsInMemoryRepo
    let organisationsInMemoryRepo

    function loadFixtures(fixtureType) {
      const fixturesDir = join(
        process.cwd(),
        `src/data/fixtures/ea/${fixtureType}`
      )
      const fixtureFiles = readdirSync(fixturesDir).filter((file) =>
        file.endsWith('.json')
      )

      return fixtureFiles.map((filename) => {
        const filePath = join(fixturesDir, filename)
        return JSON.parse(readFileSync(filePath, 'utf-8'))
      })
    }

    beforeEach(() => {
      const orgFixtures = loadFixtures('organisation')
      const regFixtures = loadFixtures('registration')
      const accrFixtures = loadFixtures('accreditation')

      // Prepare organisation form submission data
      const orgFormSubmissions = orgFixtures.map((fixture) => ({
        id: fixture._id.$oid,
        orgId: fixture.orgId,
        rawSubmissionData: fixture.rawSubmissionData
      }))

      // Prepare registration form submission data
      const regFormSubmissions = regFixtures.map((fixture) => ({
        id: fixture._id.$oid,
        orgId: fixture.orgId,
        rawSubmissionData: fixture.rawSubmissionData
      }))

      // Prepare accreditation form submission data
      const accFormSubmissions = accrFixtures.map((fixture) => ({
        id: fixture._id.$oid,
        orgId: fixture.orgId,
        rawSubmissionData: fixture.rawSubmissionData
      }))

      formsInMemoryRepo = createFormSubmissionsRepository(
        accFormSubmissions,
        regFormSubmissions,
        orgFormSubmissions
      )()
      organisationsInMemoryRepo = createInMemoryOrganisationsRepository()()
    })

    it('migrates org form submissions from EA fixtures using in-memory repositories', async () => {
      // Run migration
      await migrateFormsData(formsInMemoryRepo, organisationsInMemoryRepo)

      // Verify organisations were created
      const allOrgs = await organisationsInMemoryRepo.findAll()
      expect(allOrgs).toHaveLength(8)

      // Create a map of organisations by orgId for easy lookup
      const orgsByOrgId = allOrgs.reduce(
        (map, org) => map.set(org.orgId, org),
        new Map()
      )

      // Count total registrations across all orgs
      const totalRegistrations = allOrgs.reduce(
        (count, org) => count + (org.registrations?.length || 0),
        0
      )
      expect(totalRegistrations).toBe(3)

      // Count total accreditations across all orgs
      const totalAccreditations = allOrgs.reduce(
        (count, org) => count + (org.accreditations?.length || 0),
        0
      )
      expect(totalAccreditations).toBe(4)

      // Verify registrations count by org
      const org503181 = orgsByOrgId.get(503181)
      expect(org503181).toBeDefined()
      expect(org503181.registrations).toHaveLength(1)

      const org503176 = orgsByOrgId.get(503176)
      expect(org503176).toBeDefined()
      expect(org503176.registrations).toHaveLength(2)

      // Verify accreditations count by org
      expect(org503181.accreditations).toHaveLength(1)
      expect(org503176.accreditations).toHaveLength(2)

      const org503177 = orgsByOrgId.get(503177)
      expect(org503177).toBeDefined()
      expect(org503177.accreditations).toHaveLength(1)

      // Verify registration-to-accreditation linking
      // Exporter registration SHOULD be linked to exporter accreditation
      const exporterRegistration = org503181.registrations[0]
      const exporterAccreditation = org503181.accreditations[0]
      expect(exporterRegistration.accreditationId).toBe(
        exporterAccreditation.id
      )

      // All other registrations should NOT be linked (materials/sites don't match or no accreditation)
      for (const reg of allOrgs
        .filter((o) => o.orgId !== 503181)
        .flatMap((o) => o.registrations ?? [])) {
        expect(reg.accreditationId).toBeUndefined()
      }
    })
  })
})
