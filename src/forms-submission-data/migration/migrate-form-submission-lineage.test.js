import { beforeEach, describe, expect, it, vi } from 'vitest'
import { migrateFormSubmissionLineage } from './migrate-form-submission-lineage.js'
import {
  GLASS_RECYCLING_PROCESS,
  MATERIAL
} from '#domain/organisations/model.js'

import { logger } from '#common/helpers/logging/logger.js'
import { auditFormSubmissionLineageMigration } from '#root/auditing/form-submission-lineage-migration.js'

vi.mock('#common/helpers/logging/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn()
  }
}))

vi.mock('#auditing/form-submission-lineage-migration.js', () => ({
  auditFormSubmissionLineageMigration: vi.fn().mockResolvedValue(undefined)
}))

const SUBMISSION_TIME = new Date('2025-01-15T10:00:00.000Z')

function makeOrg(overrides = {}) {
  return {
    id: 'org-id-1',
    version: 1,
    schemaVersion: 1,
    orgId: 500001,
    formSubmissionTime: SUBMISSION_TIME,
    registrations: [],
    accreditations: [],
    ...overrides
  }
}

function makeRegistration(overrides = {}) {
  return {
    id: 'reg-id-1',
    formSubmissionTime: SUBMISSION_TIME,
    material: MATERIAL.PLASTIC,
    ...overrides
  }
}

function makeAccreditation(overrides = {}) {
  return {
    id: 'acc-id-1',
    formSubmissionTime: SUBMISSION_TIME,
    material: MATERIAL.PLASTIC,
    ...overrides
  }
}

function makeFormSubmissionsRepository(overrides = {}) {
  return {
    findRegistrationById: vi.fn().mockResolvedValue(null),
    findAccreditationById: vi.fn().mockResolvedValue(null),
    ...overrides
  }
}

function makeOrganisationsRepository(orgs = [], overrides = {}) {
  return {
    findAllBySchemaVersion: vi.fn().mockResolvedValue(orgs),
    findById: vi
      .fn()
      .mockImplementation((id) => orgs.find((o) => o.id === id) ?? null),
    replace: vi.fn().mockResolvedValue(undefined),
    ...overrides
  }
}

function makeSystemLogsRepository() {
  return {
    insert: vi.fn().mockResolvedValue(undefined)
  }
}

describe('migrateFormSubmissionLineage', () => {
  let formSubmissionsRepository
  let organisationsRepository
  let systemLogsRepository

  beforeEach(() => {
    vi.clearAllMocks()
    formSubmissionsRepository = makeFormSubmissionsRepository()
    systemLogsRepository = makeSystemLogsRepository()
  })

  describe('when there are no organisations to migrate', () => {
    it('exits without making any changes', async () => {
      organisationsRepository = makeOrganisationsRepository([])

      await migrateFormSubmissionLineage(
        formSubmissionsRepository,
        organisationsRepository,
        systemLogsRepository
      )

      expect(organisationsRepository.replace).not.toHaveBeenCalled()
      expect(systemLogsRepository.insert).not.toHaveBeenCalled()
      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('no organisations to migrate')
        })
      )
    })
  })

  describe('form submission lineage for organisations', () => {
    it('links the organisation to its own form submission', async () => {
      const org = makeOrg({
        id: 'org-123',
        formSubmissionTime: SUBMISSION_TIME
      })
      organisationsRepository = makeOrganisationsRepository([org])

      await migrateFormSubmissionLineage(
        formSubmissionsRepository,
        organisationsRepository,
        systemLogsRepository
      )

      const updates = organisationsRepository.replace.mock.calls[0][2]
      expect(updates.formSubmission).toEqual({
        id: 'org-123',
        time: SUBMISSION_TIME
      })
      expect(updates.formSubmissionTime).toBeUndefined()
    })
  })

  describe('form submission lineage for registrations', () => {
    it('links a registration to its own form submission', async () => {
      const reg = makeRegistration({ id: 'reg-found' })
      const org = makeOrg({ registrations: [reg] })

      formSubmissionsRepository.findRegistrationById.mockImplementation((id) =>
        id === 'reg-found' ? { id } : null
      )
      organisationsRepository = makeOrganisationsRepository([org])

      await migrateFormSubmissionLineage(
        formSubmissionsRepository,
        organisationsRepository,
        systemLogsRepository
      )

      const updates = organisationsRepository.replace.mock.calls[0][2]
      expect(updates.registrations[0].formSubmission).toEqual({
        id: 'reg-found',
        time: SUBMISSION_TIME
      })
      expect(updates.registrations[0].formSubmissionTime).toBeUndefined()
    })

    it('links a glass-other registration to the same submission as its remelt sibling', async () => {
      const remelt = makeRegistration({
        id: 'remelt-id',
        material: MATERIAL.GLASS,
        glassRecyclingProcess: [GLASS_RECYCLING_PROCESS.GLASS_RE_MELT],
        formSubmissionTime: SUBMISSION_TIME
      })
      const other = makeRegistration({
        id: 'other-id',
        material: MATERIAL.GLASS,
        glassRecyclingProcess: [GLASS_RECYCLING_PROCESS.GLASS_OTHER],
        formSubmissionTime: SUBMISSION_TIME
      })
      const org = makeOrg({ registrations: [remelt, other] })

      // remelt found in the forms repo, other is not (it was a synthetic split)
      formSubmissionsRepository.findRegistrationById.mockImplementation((id) =>
        id === 'remelt-id' ? { id } : null
      )
      organisationsRepository = makeOrganisationsRepository([org])

      await migrateFormSubmissionLineage(
        formSubmissionsRepository,
        organisationsRepository,
        systemLogsRepository
      )

      const updates = organisationsRepository.replace.mock.calls[0][2]
      const otherResult = updates.registrations.find((r) => r.id === 'other-id')
      expect(otherResult.formSubmission).toEqual({
        id: 'remelt-id',
        time: SUBMISSION_TIME
      })
    })

    it('falls back to the own id when no remelt sibling exists for a glass-other registration', async () => {
      const other = makeRegistration({
        id: 'other-id',
        material: MATERIAL.GLASS,
        glassRecyclingProcess: [GLASS_RECYCLING_PROCESS.GLASS_OTHER]
      })
      const org = makeOrg({ registrations: [other] })

      formSubmissionsRepository.findRegistrationById.mockResolvedValue(null)
      organisationsRepository = makeOrganisationsRepository([org])

      await migrateFormSubmissionLineage(
        formSubmissionsRepository,
        organisationsRepository,
        systemLogsRepository
      )

      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('no sibling remelt found')
        })
      )
      const updates = organisationsRepository.replace.mock.calls[0][2]
      expect(updates.registrations[0].formSubmission).toEqual({
        id: 'other-id',
        time: SUBMISSION_TIME
      })
    })

    it('falls back to the own id when no form submission exists in the repository', async () => {
      const reg = makeRegistration({
        id: 'reg-not-found',
        material: MATERIAL.PLASTIC
      })
      const org = makeOrg({ registrations: [reg] })

      formSubmissionsRepository.findRegistrationById.mockResolvedValue(null)
      organisationsRepository = makeOrganisationsRepository([org])

      await migrateFormSubmissionLineage(
        formSubmissionsRepository,
        organisationsRepository,
        systemLogsRepository
      )

      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining(
            'no form submission found for registration reg-not-found'
          )
        })
      )
      const updates = organisationsRepository.replace.mock.calls[0][2]
      expect(updates.registrations[0].formSubmission).toEqual({
        id: 'reg-not-found',
        time: SUBMISSION_TIME
      })
    })
  })

  describe('form submission lineage for accreditations', () => {
    it('links an accreditation to its own form submission', async () => {
      const acc = makeAccreditation({ id: 'acc-found' })
      const org = makeOrg({ accreditations: [acc] })

      formSubmissionsRepository.findAccreditationById.mockImplementation(
        (id) => (id === 'acc-found' ? { id } : null)
      )
      organisationsRepository = makeOrganisationsRepository([org])

      await migrateFormSubmissionLineage(
        formSubmissionsRepository,
        organisationsRepository,
        systemLogsRepository
      )

      const updates = organisationsRepository.replace.mock.calls[0][2]
      expect(updates.accreditations[0].formSubmission).toEqual({
        id: 'acc-found',
        time: SUBMISSION_TIME
      })
    })

    it('links a glass-other accreditation to the same submission as its remelt sibling', async () => {
      const remelt = makeAccreditation({
        id: 'acc-remelt-id',
        material: MATERIAL.GLASS,
        glassRecyclingProcess: [GLASS_RECYCLING_PROCESS.GLASS_RE_MELT],
        formSubmissionTime: SUBMISSION_TIME
      })
      const other = makeAccreditation({
        id: 'acc-other-id',
        material: MATERIAL.GLASS,
        glassRecyclingProcess: [GLASS_RECYCLING_PROCESS.GLASS_OTHER],
        formSubmissionTime: SUBMISSION_TIME
      })
      const org = makeOrg({ accreditations: [remelt, other] })

      formSubmissionsRepository.findAccreditationById.mockImplementation(
        (id) => (id === 'acc-remelt-id' ? { id } : null)
      )
      organisationsRepository = makeOrganisationsRepository([org])

      await migrateFormSubmissionLineage(
        formSubmissionsRepository,
        organisationsRepository,
        systemLogsRepository
      )

      const updates = organisationsRepository.replace.mock.calls[0][2]
      const otherResult = updates.accreditations.find(
        (a) => a.id === 'acc-other-id'
      )
      expect(otherResult.formSubmission).toEqual({
        id: 'acc-remelt-id',
        time: SUBMISSION_TIME
      })
    })

    it('falls back to the own id when no remelt sibling exists for a glass-other accreditation', async () => {
      const other = makeAccreditation({
        id: 'acc-other-id',
        material: MATERIAL.GLASS,
        glassRecyclingProcess: [GLASS_RECYCLING_PROCESS.GLASS_OTHER]
      })
      const org = makeOrg({ accreditations: [other] })

      formSubmissionsRepository.findAccreditationById.mockResolvedValue(null)
      organisationsRepository = makeOrganisationsRepository([org])

      await migrateFormSubmissionLineage(
        formSubmissionsRepository,
        organisationsRepository,
        systemLogsRepository
      )

      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('no sibling remelt found')
        })
      )
      const updates = organisationsRepository.replace.mock.calls[0][2]
      expect(updates.accreditations[0].formSubmission).toEqual({
        id: 'acc-other-id',
        time: SUBMISSION_TIME
      })
    })
  })

  describe('formSubmissionTime removal', () => {
    it('removes formSubmissionTime from the organisation', async () => {
      const org = makeOrg({
        id: 'org-123',
        formSubmissionTime: SUBMISSION_TIME
      })
      organisationsRepository = makeOrganisationsRepository([org])

      await migrateFormSubmissionLineage(
        formSubmissionsRepository,
        organisationsRepository,
        systemLogsRepository
      )

      const updates = organisationsRepository.replace.mock.calls[0][2]
      expect(updates.formSubmissionTime).toBeUndefined()
    })

    it('removes formSubmissionTime from each registration', async () => {
      const reg = makeRegistration({
        id: 'reg-1',
        formSubmissionTime: SUBMISSION_TIME
      })
      const org = makeOrg({ registrations: [reg] })
      organisationsRepository = makeOrganisationsRepository([org])

      await migrateFormSubmissionLineage(
        formSubmissionsRepository,
        organisationsRepository,
        systemLogsRepository
      )

      const updates = organisationsRepository.replace.mock.calls[0][2]
      expect(updates.registrations[0].formSubmissionTime).toBeUndefined()
    })

    it('removes formSubmissionTime from each accreditation', async () => {
      const acc = makeAccreditation({
        id: 'acc-1',
        formSubmissionTime: SUBMISSION_TIME
      })
      const org = makeOrg({ accreditations: [acc] })
      organisationsRepository = makeOrganisationsRepository([org])

      await migrateFormSubmissionLineage(
        formSubmissionsRepository,
        organisationsRepository,
        systemLogsRepository
      )

      const updates = organisationsRepository.replace.mock.calls[0][2]
      expect(updates.accreditations[0].formSubmissionTime).toBeUndefined()
    })
  })

  describe('schema version upgrade', () => {
    it('upgrades each organisation to schemaVersion 2 without including id or version in the saved document', async () => {
      const org = makeOrg({ id: 'org-abc', version: 3 })
      organisationsRepository = makeOrganisationsRepository([org])

      await migrateFormSubmissionLineage(
        formSubmissionsRepository,
        organisationsRepository,
        systemLogsRepository
      )

      expect(organisationsRepository.replace).toHaveBeenCalledWith(
        'org-abc',
        3,
        expect.objectContaining({ schemaVersion: 2 })
      )
      const updates = organisationsRepository.replace.mock.calls[0][2]
      expect(updates.id).toBeUndefined()
      expect(updates.version).toBeUndefined()
    })
  })

  describe('audit trail', () => {
    it('records a migration log entry for each organisation processed', async () => {
      const org1 = makeOrg({ id: 'org-1' })
      const org2 = makeOrg({ id: 'org-2' })
      organisationsRepository = makeOrganisationsRepository([org1, org2])

      await migrateFormSubmissionLineage(
        formSubmissionsRepository,
        organisationsRepository,
        systemLogsRepository
      )

      expect(auditFormSubmissionLineageMigration).toHaveBeenCalledWith(
        systemLogsRepository,
        org1.id,
        org1,
        org1
      )
    })
  })

  describe('scope of migration', () => {
    it('only targets organisations at schemaVersion 1', async () => {
      organisationsRepository = makeOrganisationsRepository([])

      await migrateFormSubmissionLineage(
        formSubmissionsRepository,
        organisationsRepository,
        systemLogsRepository
      )

      expect(
        organisationsRepository.findAllBySchemaVersion
      ).toHaveBeenCalledWith(1)
    })
  })

  describe('error resilience', () => {
    it('continues processing remaining organisations when one fails', async () => {
      const org1 = makeOrg({ id: 'org-fail' })
      const org2 = makeOrg({ id: 'org-ok' })
      organisationsRepository = makeOrganisationsRepository([org1, org2], {
        replace: vi
          .fn()
          .mockRejectedValueOnce(new Error('version conflict'))
          .mockResolvedValueOnce(undefined)
      })

      await migrateFormSubmissionLineage(
        formSubmissionsRepository,
        organisationsRepository,
        systemLogsRepository
      )

      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining(
            'failed to migrate organisation org-fail'
          )
        })
      )
    })
  })
})
