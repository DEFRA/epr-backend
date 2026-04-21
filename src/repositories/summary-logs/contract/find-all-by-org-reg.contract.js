import { beforeEach, describe, expect } from 'vitest'
import { ObjectId } from 'mongodb'
import { summaryLogFactory } from './test-data.js'
import { SUMMARY_LOG_STATUS } from '#domain/summary-logs/status.js'

const generateOrgReg = () => ({
  organisationId: new ObjectId().toString(),
  registrationId: new ObjectId().toString()
})

export const testFindAllByOrgReg = (it) => {
  describe('findAllByOrgReg', () => {
    /** @type {import('../port.js').SummaryLogsRepository} */
    let repo

    beforeEach(async ({ summaryLogsRepository }) => {
      repo = summaryLogsRepository
    })

    it('returns an empty array when no summary logs exist for the org/reg pair', async () => {
      const { organisationId, registrationId } = generateOrgReg()

      const result = await repo.findAllByOrgReg(organisationId, registrationId)

      expect(result).toEqual([])
    })

    it('returns submitted logs for the requested org/reg pair only', async () => {
      const { organisationId, registrationId } = generateOrgReg()
      const other = generateOrgReg()

      const ownId = new ObjectId().toString()
      await repo.insert(
        ownId,
        summaryLogFactory.submitted({
          organisationId,
          registrationId,
          submittedAt: '2026-01-15T10:00:00.000Z'
        })
      )

      await repo.insert(
        new ObjectId().toString(),
        summaryLogFactory.submitted({
          organisationId: other.organisationId,
          registrationId: other.registrationId,
          submittedAt: '2026-01-16T10:00:00.000Z'
        })
      )

      const result = await repo.findAllByOrgReg(organisationId, registrationId)

      expect(result).toHaveLength(1)
      expect(result[0]).toMatchObject({
        id: ownId,
        summaryLog: {
          status: SUMMARY_LOG_STATUS.SUBMITTED,
          organisationId,
          registrationId
        }
      })
    })

    it('returns failure-status logs alongside submitted logs', async () => {
      const { organisationId, registrationId } = generateOrgReg()

      const submittedId = new ObjectId().toString()
      await repo.insert(
        submittedId,
        summaryLogFactory.submitted({
          organisationId,
          registrationId,
          submittedAt: '2026-02-01T10:00:00.000Z'
        })
      )

      const rejectedId = new ObjectId().toString()
      await repo.insert(
        rejectedId,
        summaryLogFactory.rejected({
          organisationId,
          registrationId,
          createdAt: '2026-02-02T10:00:00.000Z'
        })
      )

      const invalidId = new ObjectId().toString()
      await repo.insert(
        invalidId,
        summaryLogFactory.invalid({
          organisationId,
          registrationId,
          createdAt: '2026-02-03T10:00:00.000Z'
        })
      )

      const validationFailedId = new ObjectId().toString()
      await repo.insert(
        validationFailedId,
        summaryLogFactory.validationFailed({
          organisationId,
          registrationId,
          createdAt: '2026-02-04T10:00:00.000Z'
        })
      )

      const submissionFailedId = new ObjectId().toString()
      await repo.insert(
        submissionFailedId,
        summaryLogFactory.submissionFailed({
          organisationId,
          registrationId,
          createdAt: '2026-02-05T10:00:00.000Z',
          submittedAt: '2026-02-05T10:00:00.000Z'
        })
      )

      const result = await repo.findAllByOrgReg(organisationId, registrationId)

      const statuses = result.map((row) => row.summaryLog.status)
      expect(statuses).toEqual(
        expect.arrayContaining([
          SUMMARY_LOG_STATUS.SUBMITTED,
          SUMMARY_LOG_STATUS.REJECTED,
          SUMMARY_LOG_STATUS.INVALID,
          SUMMARY_LOG_STATUS.VALIDATION_FAILED,
          SUMMARY_LOG_STATUS.SUBMISSION_FAILED
        ])
      )
      expect(result).toHaveLength(5)
    })

    it('excludes intermediate statuses', async () => {
      const { organisationId, registrationId } = generateOrgReg()

      await repo.insert(
        new ObjectId().toString(),
        summaryLogFactory.preprocessing({ organisationId, registrationId })
      )
      await repo.insert(
        new ObjectId().toString(),
        summaryLogFactory.validating({ organisationId, registrationId })
      )
      await repo.insert(
        new ObjectId().toString(),
        summaryLogFactory.validated({ organisationId, registrationId })
      )
      await repo.insert(
        new ObjectId().toString(),
        summaryLogFactory.submitting({ organisationId, registrationId })
      )
      await repo.insert(
        new ObjectId().toString(),
        summaryLogFactory.superseded({ organisationId, registrationId })
      )

      const visibleId = new ObjectId().toString()
      await repo.insert(
        visibleId,
        summaryLogFactory.submitted({
          organisationId,
          registrationId,
          submittedAt: '2026-03-01T10:00:00.000Z'
        })
      )

      const result = await repo.findAllByOrgReg(organisationId, registrationId)

      expect(result).toHaveLength(1)
      expect(result[0].id).toBe(visibleId)
    })

    it('returns logs newest-first by submittedAt or createdAt', async () => {
      const { organisationId, registrationId } = generateOrgReg()

      const oldest = new ObjectId().toString()
      await repo.insert(
        oldest,
        summaryLogFactory.submitted({
          organisationId,
          registrationId,
          submittedAt: '2026-01-01T10:00:00.000Z'
        })
      )

      const middle = new ObjectId().toString()
      await repo.insert(
        middle,
        summaryLogFactory.validationFailed({
          organisationId,
          registrationId,
          createdAt: '2026-02-01T10:00:00.000Z'
        })
      )

      const newest = new ObjectId().toString()
      await repo.insert(
        newest,
        summaryLogFactory.submitted({
          organisationId,
          registrationId,
          submittedAt: '2026-03-01T10:00:00.000Z'
        })
      )

      const result = await repo.findAllByOrgReg(organisationId, registrationId)

      expect(result.map((row) => row.id)).toEqual([newest, middle, oldest])
    })

    it('does not return logs for a different registration under the same organisation', async () => {
      const organisationId = new ObjectId().toString()
      const registrationId = new ObjectId().toString()
      const otherRegistrationId = new ObjectId().toString()

      const ownId = new ObjectId().toString()
      await repo.insert(
        ownId,
        summaryLogFactory.submitted({
          organisationId,
          registrationId,
          submittedAt: '2026-04-01T10:00:00.000Z'
        })
      )

      await repo.insert(
        new ObjectId().toString(),
        summaryLogFactory.submitted({
          organisationId,
          registrationId: otherRegistrationId,
          submittedAt: '2026-04-02T10:00:00.000Z'
        })
      )

      const result = await repo.findAllByOrgReg(organisationId, registrationId)

      expect(result).toHaveLength(1)
      expect(result[0].id).toBe(ownId)
    })
  })
}
