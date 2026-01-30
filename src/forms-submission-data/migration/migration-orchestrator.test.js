import { logger } from '#common/helpers/logging/logger.js'
import { ObjectId } from 'mongodb'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createFormDataMigrator,
  MigrationOrchestrator
} from './migration-orchestrator.js'
import { transformAll } from './submission-transformer.js'
import { getSubmissionsToMigrate } from './migration-delta-calculator.js'
import { upsertOrganisations } from './organisation-persistence.js'
import {
  linkItemsToOrganisations,
  linkRegistrationToAccreditations
} from '#formsubmission/link-form-submissions.js'
import {
  GLASS_RECYCLING_PROCESS,
  MATERIAL
} from '#domain/organisations/model.js'

vi.mock('#common/helpers/logging/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn()
  }
}))

vi.mock('./submission-transformer.js', () => ({
  transformAll: vi.fn()
}))

vi.mock('./migration-delta-calculator.js', () => ({
  getSubmissionsToMigrate: vi.fn()
}))

vi.mock('./organisation-persistence.js', () => ({
  upsertOrganisations: vi.fn()
}))

vi.mock('#formsubmission/link-form-submissions.js', () => ({
  linkItemsToOrganisations: vi.fn(),
  linkRegistrationToAccreditations: vi.fn()
}))

vi.mock('#formsubmission/data-migration-config.js', () => ({
  systemReferencesRequiringOrgIdMatch: vi.fn(() => new Set())
}))

describe('MigrationOrchestrator', () => {
  let formsSubmissionRepository
  let organisationsRepository
  let migrator

  // Reusable mock helpers
  const createMockDelta = (
    migratedOrgs = [],
    pendingOrgs = [],
    pendingRegs = [],
    pendingAccrs = []
  ) => ({
    migrated: {
      organisations: new Set(migratedOrgs),
      registrations: new Set(),
      accreditations: new Set(),
      totalCount: migratedOrgs.length
    },
    pendingMigration: {
      organisations: new Set(pendingOrgs),
      registrations: new Set(pendingRegs),
      accreditations: new Set(pendingAccrs),
      totalCount: pendingOrgs.length + pendingRegs.length + pendingAccrs.length
    }
  })

  const createOrg = (id = new ObjectId().toString(), orgId = 500001) => ({
    id,
    orgId,
    companyDetails: { name: `Company ${orgId}` }
  })

  const createReg = (
    id = new ObjectId().toString(),
    systemRef,
    orgId = 500001
  ) => ({
    id,
    systemReference: systemRef,
    orgId
  })

  const createAccr = (
    id = new ObjectId().toString(),
    systemRef,
    orgId = 500001
  ) => ({
    id,
    systemReference: systemRef,
    orgId
  })

  beforeEach(() => {
    vi.clearAllMocks()

    formsSubmissionRepository = {
      findOrganisationById: vi.fn(),
      findRegistrationById: vi.fn(),
      findAccreditationById: vi.fn(),
      findAllFormSubmissionIds: vi.fn()
    }

    organisationsRepository = {
      insert: vi.fn(),
      update: vi.fn(),
      findAllIds: vi.fn(),
      findById: vi.fn()
    }

    migrator = createFormDataMigrator(
      formsSubmissionRepository,
      organisationsRepository
    )

    // Default mock implementations
    linkItemsToOrganisations.mockImplementation((orgs, items, propName) => {
      return orgs.map((org) => ({
        ...org,
        [propName]: items.filter((item) => item.systemReference === org.id)
      }))
    })

    linkRegistrationToAccreditations.mockImplementation((orgs) => orgs)
  })

  describe('migrate()', () => {
    it('should exit early when no submissions to migrate', async () => {
      getSubmissionsToMigrate.mockResolvedValue(createMockDelta())

      await migrator.migrate()

      expect(logger.info).toHaveBeenCalledWith({
        message: 'No new form submissions to migrate'
      })
      expect(transformAll).not.toHaveBeenCalled()
      expect(upsertOrganisations).not.toHaveBeenCalled()
    })

    it('should perform initial migration with new org and linked reg and accr', async () => {
      const orgId = new ObjectId().toString()
      const regId = new ObjectId().toString()
      const accrId = new ObjectId().toString()

      getSubmissionsToMigrate.mockResolvedValue(
        createMockDelta([], [orgId], [regId], [accrId])
      )

      const org = createOrg(orgId)
      const reg = createReg(regId, orgId)
      const accr = createAccr(accrId, orgId)

      transformAll.mockResolvedValue({
        organisations: [org],
        registrations: [reg],
        accreditations: [accr]
      })

      await migrator.migrate()

      expect(logger.info).toHaveBeenCalledWith({
        message:
          'Found 1 organisations, 1 registrations, 1 accreditations to migrate'
      })

      expect(upsertOrganisations).toHaveBeenCalledWith(
        organisationsRepository,
        [
          {
            value: expect.objectContaining({
              id: orgId,
              registrations: [reg],
              accreditations: [accr]
            }),
            operation: 'insert'
          }
        ]
      )
    })

    it('should perform incremental migration for existing org with new submissions', async () => {
      const orgId = new ObjectId().toString()
      const regId = new ObjectId().toString()
      const accrId = new ObjectId().toString()

      getSubmissionsToMigrate.mockResolvedValue(
        createMockDelta([orgId], [], [regId], [accrId])
      )

      const reg = createReg(regId, orgId)
      const accr = createAccr(accrId, orgId)

      transformAll.mockResolvedValue({
        organisations: [],
        registrations: [reg],
        accreditations: [accr]
      })

      const existingOrg = { ...createOrg(orgId), version: 1 }
      organisationsRepository.findById.mockResolvedValue(existingOrg)

      await migrator.migrate()

      expect(upsertOrganisations).toHaveBeenCalledWith(
        organisationsRepository,
        [
          {
            value: expect.objectContaining({
              id: orgId,
              version: 1,
              registrations: [reg],
              accreditations: [accr]
            }),
            operation: 'update'
          }
        ]
      )
    })

    it('should split glass registrations with both processes before linking', async () => {
      const orgId = new ObjectId().toString()
      const regId = new ObjectId().toString()

      getSubmissionsToMigrate.mockResolvedValue(
        createMockDelta([], [orgId], [regId], [])
      )

      const org = createOrg(orgId)
      const glassReg = {
        ...createReg(regId, orgId),
        material: MATERIAL.GLASS,
        glassRecyclingProcess: [
          GLASS_RECYCLING_PROCESS.GLASS_RE_MELT,
          GLASS_RECYCLING_PROCESS.GLASS_OTHER
        ]
      }

      transformAll.mockResolvedValue({
        organisations: [org],
        registrations: [glassReg],
        accreditations: []
      })

      await migrator.migrate()

      // Verify linkItemsToOrganisations received split registrations
      const registrationsLinkCall = linkItemsToOrganisations.mock.calls.find(
        (call) => call[2] === 'registrations'
      )
      const linkedRegistrations = registrationsLinkCall[1]

      expect(linkedRegistrations).toHaveLength(2)
      expect(linkedRegistrations[0]).toEqual(
        expect.objectContaining({
          id: regId,
          material: MATERIAL.GLASS,
          glassRecyclingProcess: [GLASS_RECYCLING_PROCESS.GLASS_RE_MELT]
        })
      )
      expect(linkedRegistrations[1]).toEqual(
        expect.objectContaining({
          material: MATERIAL.GLASS,
          glassRecyclingProcess: [GLASS_RECYCLING_PROCESS.GLASS_OTHER]
        })
      )
      expect(linkedRegistrations[1].id).not.toBe(regId)
    })

    it('should perform mixed migration with both new and existing orgs', async () => {
      const newOrgId = new ObjectId().toString()
      const existingOrgId = new ObjectId().toString()
      const reg1Id = new ObjectId().toString()
      const reg2Id = new ObjectId().toString()

      getSubmissionsToMigrate.mockResolvedValue(
        createMockDelta([existingOrgId], [newOrgId], [reg1Id, reg2Id], [])
      )

      const newOrg = createOrg(newOrgId, 500001)
      const reg1 = createReg(reg1Id, newOrgId, 500001)
      const reg2 = createReg(reg2Id, existingOrgId, 500002)

      transformAll.mockResolvedValue({
        organisations: [newOrg],
        registrations: [reg1, reg2],
        accreditations: []
      })

      const existingOrg = { ...createOrg(existingOrgId, 500002), version: 1 }
      organisationsRepository.findById.mockResolvedValue(existingOrg)

      await migrator.migrate()

      expect(upsertOrganisations).toHaveBeenCalledWith(
        organisationsRepository,
        expect.arrayContaining([
          {
            value: expect.objectContaining({
              id: newOrgId,
              registrations: [reg1],
              accreditations: []
            }),
            operation: 'insert'
          },
          {
            value: expect.objectContaining({
              id: existingOrgId,
              registrations: [reg2],
              accreditations: []
            }),
            operation: 'update'
          }
        ])
      )
    })
  })

  describe('migrateById()', () => {
    let orchestrator

    beforeEach(() => {
      formsSubmissionRepository.findRegistrationsBySystemReference = vi.fn()
      formsSubmissionRepository.findAccreditationsBySystemReference = vi.fn()

      orchestrator = new MigrationOrchestrator(
        formsSubmissionRepository,
        organisationsRepository
      )
    })

    it('should return null when organisation not found', async () => {
      formsSubmissionRepository.findOrganisationById.mockResolvedValue(null)

      const result = await orchestrator.migrateById('non-existent-id')

      expect(result).toBeNull()
      expect(transformAll).not.toHaveBeenCalled()
      expect(upsertOrganisations).not.toHaveBeenCalled()
    })

    it('should migrate organisation with no registrations or accreditations', async () => {
      const orgId = new ObjectId().toString()
      const org = createOrg(orgId)

      formsSubmissionRepository.findOrganisationById.mockResolvedValue({
        id: orgId
      })
      formsSubmissionRepository.findRegistrationsBySystemReference.mockResolvedValue(
        []
      )
      formsSubmissionRepository.findAccreditationsBySystemReference.mockResolvedValue(
        []
      )
      organisationsRepository.findAllIds.mockResolvedValue({
        organisations: new Set(),
        registrations: new Set(),
        accreditations: new Set()
      })

      transformAll.mockResolvedValue({
        organisations: [org],
        registrations: [],
        accreditations: []
      })

      const result = await orchestrator.migrateById(orgId)

      expect(result).toEqual({
        organisation: true,
        registrations: 0,
        accreditations: 0
      })

      expect(upsertOrganisations).toHaveBeenCalledWith(
        organisationsRepository,
        [{ value: expect.objectContaining({ id: orgId }), operation: 'insert' }]
      )

      expect(logger.info).toHaveBeenCalledWith({
        message: `Migrating organisation ${orgId} with 0 registrations and 0 accreditations`
      })
      expect(logger.info).toHaveBeenCalledWith({
        message: `Successfully migrated organisation ${orgId}`
      })
    })

    it('should migrate organisation with related registrations', async () => {
      const orgId = new ObjectId().toString()
      const regId = new ObjectId().toString()
      const org = createOrg(orgId)
      const reg = createReg(regId, orgId)

      formsSubmissionRepository.findOrganisationById.mockResolvedValue({
        id: orgId
      })
      formsSubmissionRepository.findRegistrationsBySystemReference.mockResolvedValue(
        [{ id: regId }]
      )
      formsSubmissionRepository.findAccreditationsBySystemReference.mockResolvedValue(
        []
      )
      organisationsRepository.findAllIds.mockResolvedValue({
        organisations: new Set(),
        registrations: new Set(),
        accreditations: new Set()
      })

      transformAll.mockResolvedValue({
        organisations: [org],
        registrations: [reg],
        accreditations: []
      })

      const result = await orchestrator.migrateById(orgId)

      expect(result).toEqual({
        organisation: true,
        registrations: 1,
        accreditations: 0
      })

      expect(transformAll).toHaveBeenCalledWith(
        formsSubmissionRepository,
        expect.objectContaining({
          organisations: new Set([orgId]),
          registrations: new Set([regId])
        })
      )
    })

    it('should migrate organisation with related accreditations', async () => {
      const orgId = new ObjectId().toString()
      const accrId = new ObjectId().toString()
      const org = createOrg(orgId)
      const accr = createAccr(accrId, orgId)

      formsSubmissionRepository.findOrganisationById.mockResolvedValue({
        id: orgId
      })
      formsSubmissionRepository.findRegistrationsBySystemReference.mockResolvedValue(
        []
      )
      formsSubmissionRepository.findAccreditationsBySystemReference.mockResolvedValue(
        [{ id: accrId }]
      )
      organisationsRepository.findAllIds.mockResolvedValue({
        organisations: new Set(),
        registrations: new Set(),
        accreditations: new Set()
      })

      transformAll.mockResolvedValue({
        organisations: [org],
        registrations: [],
        accreditations: [accr]
      })

      const result = await orchestrator.migrateById(orgId)

      expect(result).toEqual({
        organisation: true,
        registrations: 0,
        accreditations: 1
      })

      expect(transformAll).toHaveBeenCalledWith(
        formsSubmissionRepository,
        expect.objectContaining({
          organisations: new Set([orgId]),
          accreditations: new Set([accrId])
        })
      )
    })

    it('should migrate organisation with both registrations and accreditations', async () => {
      const orgId = new ObjectId().toString()
      const regId = new ObjectId().toString()
      const accrId = new ObjectId().toString()
      const org = createOrg(orgId)
      const reg = createReg(regId, orgId)
      const accr = createAccr(accrId, orgId)

      formsSubmissionRepository.findOrganisationById.mockResolvedValue({
        id: orgId
      })
      formsSubmissionRepository.findRegistrationsBySystemReference.mockResolvedValue(
        [{ id: regId }]
      )
      formsSubmissionRepository.findAccreditationsBySystemReference.mockResolvedValue(
        [{ id: accrId }]
      )
      organisationsRepository.findAllIds.mockResolvedValue({
        organisations: new Set(),
        registrations: new Set(),
        accreditations: new Set()
      })

      transformAll.mockResolvedValue({
        organisations: [org],
        registrations: [reg],
        accreditations: [accr]
      })

      const result = await orchestrator.migrateById(orgId)

      expect(result).toEqual({
        organisation: true,
        registrations: 1,
        accreditations: 1
      })

      expect(upsertOrganisations).toHaveBeenCalledWith(
        organisationsRepository,
        [
          {
            value: expect.objectContaining({
              id: orgId,
              registrations: [reg],
              accreditations: [accr]
            }),
            operation: 'insert'
          }
        ]
      )
    })
  })
})
