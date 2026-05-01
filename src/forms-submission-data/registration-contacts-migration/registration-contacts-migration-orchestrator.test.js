import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ObjectId } from 'mongodb'
import { RegistrationContactsMigrationOrchestrator } from './registration-contacts-migration-orchestrator.js'
import { logger } from '#common/helpers/logging/logger.js'
import { parseRegistrationSubmission } from '#formsubmission/registration/transform-registration.js'
import { auditRegistrationContactsMigration } from '#auditing/registration-contacts-migration.js'

vi.mock('#common/helpers/logging/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}))

vi.mock('#formsubmission/registration/transform-registration.js', () => ({
  parseRegistrationSubmission: vi.fn()
}))

vi.mock('#auditing/registration-contacts-migration.js', () => ({
  auditRegistrationContactsMigration: vi.fn().mockResolvedValue(undefined)
}))

const makeOrgId = () => new ObjectId().toString()
const makeRegId = () => new ObjectId().toString()
const makeSubmissionId = () => new ObjectId().toString()

const makeOrg = (overrides = {}) => {
  const orgId = makeOrgId()
  const regId = makeRegId()
  const submissionId = makeSubmissionId()
  return {
    id: orgId,
    version: 1,
    schemaVersion: 2,
    orgId: 500001,
    registrations: [
      {
        id: regId,
        material: 'plastic',
        formSubmission: { id: submissionId, time: new Date('2025-01-15') }
      }
    ],
    accreditations: [],
    users: [],
    ...overrides
  }
}

const makeSubmission = (id) => ({
  id,
  rawSubmissionData: { some: 'data' }
})

const makeParsed = (overrides = {}) => ({
  submitterContactDetails: { fullName: 'Alice', email: 'alice@example.com' },
  approvedPersons: [{ fullName: 'Bob', email: 'bob@example.com' }],
  applicationContactDetails: { fullName: 'Carol', email: 'carol@example.com' },
  ...overrides
})

describe('RegistrationContactsMigrationOrchestrator', () => {
  let formSubmissionsRepository
  let organisationsRepository
  let systemLogsRepository
  let orchestrator

  beforeEach(() => {
    vi.clearAllMocks()

    formSubmissionsRepository = {
      findRegistrationById: vi.fn()
    }

    organisationsRepository = {
      findAllBySchemaVersion: vi.fn(),
      replace: vi.fn().mockResolvedValue(undefined),
      findById: vi.fn()
    }

    systemLogsRepository = {}

    orchestrator = new RegistrationContactsMigrationOrchestrator(
      formSubmissionsRepository,
      organisationsRepository,
      systemLogsRepository
    )
  })

  describe('no v2 orgs', () => {
    it('logs completion with zero counts and does not call replace', async () => {
      organisationsRepository.findAllBySchemaVersion.mockResolvedValue([])

      await orchestrator.migrate(true)

      expect(
        organisationsRepository.findAllBySchemaVersion
      ).toHaveBeenCalledWith(2)
      expect(organisationsRepository.replace).not.toHaveBeenCalled()
      expect(auditRegistrationContactsMigration).not.toHaveBeenCalled()
      expect(logger.info).toHaveBeenCalledWith({
        message:
          'Registration contacts migration complete: 0 orgs succeeded, 0 failed, 0 total registrations updated'
      })
    })
  })

  describe('dry run (enabled = false)', () => {
    it('processes form submissions and logs results without writing', async () => {
      const org = makeOrg()
      const reg = org.registrations[0]
      const submission = makeSubmission(reg.formSubmission.id)
      const parsed = makeParsed()

      organisationsRepository.findAllBySchemaVersion.mockResolvedValue([org])
      formSubmissionsRepository.findRegistrationById.mockResolvedValue(
        submission
      )
      parseRegistrationSubmission.mockReturnValue([parsed])

      await orchestrator.migrate(false)

      expect(
        formSubmissionsRepository.findRegistrationById
      ).toHaveBeenCalledWith(reg.formSubmission.id)
      expect(parseRegistrationSubmission).toHaveBeenCalledWith(
        submission.id,
        submission.rawSubmissionData
      )
      expect(organisationsRepository.replace).not.toHaveBeenCalled()
      expect(auditRegistrationContactsMigration).not.toHaveBeenCalled()
      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('[DRY RUN]')
        })
      )
    })

    it('logs zero counts when no v2 orgs exist', async () => {
      organisationsRepository.findAllBySchemaVersion.mockResolvedValue([])

      await orchestrator.migrate(false)

      expect(organisationsRepository.replace).not.toHaveBeenCalled()
      expect(logger.info).toHaveBeenCalledWith({
        message:
          'Registration contacts migration complete: 0 orgs succeeded, 0 failed, 0 total registrations updated'
      })
    })
  })

  describe('happy path — single org, single registration', () => {
    it('looks up submission by formSubmission.id, replaces org at schemaVersion 3, then audits', async () => {
      const org = makeOrg()
      const reg = org.registrations[0]
      const submission = makeSubmission(reg.formSubmission.id)
      const parsed = makeParsed()

      organisationsRepository.findAllBySchemaVersion.mockResolvedValue([org])
      formSubmissionsRepository.findRegistrationById.mockResolvedValue(
        submission
      )
      parseRegistrationSubmission.mockReturnValue([parsed])
      const updatedOrg = { ...org, version: 2, schemaVersion: 3 }
      organisationsRepository.findById.mockResolvedValue(updatedOrg)

      await orchestrator.migrate(true)

      expect(
        formSubmissionsRepository.findRegistrationById
      ).toHaveBeenCalledWith(reg.formSubmission.id)
      expect(parseRegistrationSubmission).toHaveBeenCalledWith(
        submission.id,
        submission.rawSubmissionData
      )

      const { id, version } = org
      expect(organisationsRepository.replace).toHaveBeenCalledWith(
        id,
        version,
        expect.objectContaining({
          schemaVersion: 3,
          registrations: [
            expect.objectContaining({
              id: reg.id,
              submitterContactDetails: parsed.submitterContactDetails,
              approvedPersons: parsed.approvedPersons,
              applicationContactDetails: parsed.applicationContactDetails
            })
          ]
        })
      )

      expect(organisationsRepository.findById).toHaveBeenCalledWith(
        org.id,
        org.version + 1
      )
      expect(auditRegistrationContactsMigration).toHaveBeenCalledWith(
        systemLogsRepository,
        org.id,
        org,
        updatedOrg
      )

      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('re-migrated')
        })
      )
      expect(logger.info).toHaveBeenCalledWith({
        message:
          'Registration contacts migration complete: 1 orgs succeeded, 0 failed, 1 total registrations updated'
      })
    })
  })

  describe('multiple registrations in one org', () => {
    it('updates all registrations independently using their own formSubmission.id', async () => {
      const subId1 = makeSubmissionId()
      const subId2 = makeSubmissionId()
      const reg1Id = makeRegId()
      const reg2Id = makeRegId()
      const org = makeOrg({
        registrations: [
          {
            id: reg1Id,
            material: 'plastic',
            formSubmission: { id: subId1, time: new Date('2025-01-15') }
          },
          {
            id: reg2Id,
            material: 'glass',
            formSubmission: { id: subId2, time: new Date('2025-01-15') }
          }
        ]
      })

      const parsed1 = makeParsed({
        submitterContactDetails: { fullName: 'Alice1', email: 'a1@test.com' }
      })
      const parsed2 = makeParsed({
        submitterContactDetails: { fullName: 'Alice2', email: 'a2@test.com' }
      })

      organisationsRepository.findAllBySchemaVersion.mockResolvedValue([org])
      formSubmissionsRepository.findRegistrationById
        .mockResolvedValueOnce(makeSubmission(subId1))
        .mockResolvedValueOnce(makeSubmission(subId2))
      parseRegistrationSubmission
        .mockReturnValueOnce([parsed1])
        .mockReturnValueOnce([parsed2])
      organisationsRepository.findById.mockResolvedValue({
        ...org,
        version: 2,
        schemaVersion: 3
      })

      await orchestrator.migrate(true)

      expect(
        formSubmissionsRepository.findRegistrationById
      ).toHaveBeenCalledWith(subId1)
      expect(
        formSubmissionsRepository.findRegistrationById
      ).toHaveBeenCalledWith(subId2)

      const replaceCall = organisationsRepository.replace.mock.calls[0]
      const updatedRegs = replaceCall[2].registrations

      expect(updatedRegs).toHaveLength(2)
      expect(updatedRegs[0].submitterContactDetails).toEqual(
        parsed1.submitterContactDetails
      )
      expect(updatedRegs[1].submitterContactDetails).toEqual(
        parsed2.submitterContactDetails
      )

      expect(logger.info).toHaveBeenCalledWith({
        message:
          'Registration contacts migration complete: 1 orgs succeeded, 0 failed, 2 total registrations updated'
      })
    })
  })

  describe('missing form submission', () => {
    it('logs a warning, keeps the registration unchanged, and still calls replace with schemaVersion 3', async () => {
      const org = makeOrg()
      const reg = org.registrations[0]

      organisationsRepository.findAllBySchemaVersion.mockResolvedValue([org])
      formSubmissionsRepository.findRegistrationById.mockResolvedValue(null)
      organisationsRepository.findById.mockResolvedValue({
        ...org,
        version: 2,
        schemaVersion: 3
      })

      await orchestrator.migrate(true)

      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining(reg.id)
        })
      )
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining(reg.formSubmission.id)
        })
      )

      expect(organisationsRepository.replace).toHaveBeenCalledWith(
        org.id,
        org.version,
        expect.objectContaining({
          schemaVersion: 3,
          registrations: [expect.objectContaining({ id: reg.id })]
        })
      )

      expect(logger.info).toHaveBeenCalledWith({
        message:
          'Registration contacts migration complete: 1 orgs succeeded, 0 failed, 1 total registrations updated'
      })
    })
  })

  describe('replace throws', () => {
    it('logs error, increments failed count, and continues to next org', async () => {
      const org1 = makeOrg()
      const org2 = makeOrg({ orgId: 500002 })
      const parsed = makeParsed()

      organisationsRepository.findAllBySchemaVersion.mockResolvedValue([
        org1,
        org2
      ])
      formSubmissionsRepository.findRegistrationById.mockResolvedValue(
        makeSubmission(org1.registrations[0].formSubmission.id)
      )
      parseRegistrationSubmission.mockReturnValue([parsed])

      const replaceError = new Error('version conflict')
      organisationsRepository.replace
        .mockRejectedValueOnce(replaceError)
        .mockResolvedValueOnce(undefined)

      organisationsRepository.findById.mockResolvedValue({
        ...org2,
        version: 2,
        schemaVersion: 3
      })

      await orchestrator.migrate(true)

      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          err: replaceError,
          message: expect.stringContaining(
            `Failed to re-migrate org ${org1.id}`
          )
        })
      )

      expect(logger.info).toHaveBeenCalledWith({
        message:
          'Registration contacts migration complete: 1 orgs succeeded, 1 failed, 1 total registrations updated'
      })
    })
  })
})
