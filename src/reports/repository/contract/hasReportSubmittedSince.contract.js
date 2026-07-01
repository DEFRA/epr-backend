import { beforeEach, describe, expect } from 'vitest'
import { ObjectId } from 'mongodb'
import { buildCreateReportParams, createAndSubmitReport } from './test-data.js'

/** @import { ReportsRepositoryFactory } from '../port.js' */

/** @typedef {{ reportsRepository: ReportsRepositoryFactory }} ReportsFixture */

const BEFORE = '2000-01-01T00:00:00.000Z'
const AFTER = '2100-01-01T00:00:00.000Z'

export const testHasReportSubmittedSinceBehaviour = (it) => {
  describe('hasReportSubmittedSince', () => {
    let repository
    let organisationId
    let registrationId

    beforeEach(
      /** @param {ReportsFixture} fixture */ async ({ reportsRepository }) => {
        repository = reportsRepository()
        organisationId = new ObjectId().toString()
        registrationId = new ObjectId().toString()
      }
    )

    it('returns true when the timestamp is before the submission instant', async () => {
      const reportId = await createAndSubmitReport(repository, {
        organisationId,
        registrationId
      })
      const { status } = await repository.findReportById(reportId)
      const oneMsBefore = new Date(
        new Date(status.submitted.at).getTime() - 1
      ).toISOString()

      // Well before the submission.
      expect(
        await repository.hasReportSubmittedSince(
          organisationId,
          registrationId,
          BEFORE
        )
      ).toBe(true)

      // One millisecond before: still strictly after -> matches (lower boundary).
      expect(
        await repository.hasReportSubmittedSince(
          organisationId,
          registrationId,
          oneMsBefore
        )
      ).toBe(true)
    })

    it('returns false when the timestamp is at or after the submission instant', async () => {
      const reportId = await createAndSubmitReport(repository, {
        organisationId,
        registrationId
      })
      const { status } = await repository.findReportById(reportId)
      const submittedAt = status.submitted.at

      // Exactly at the submission instant: not strictly after (strict >).
      expect(
        await repository.hasReportSubmittedSince(
          organisationId,
          registrationId,
          submittedAt
        )
      ).toBe(false)

      // Well after the submission.
      expect(
        await repository.hasReportSubmittedSince(
          organisationId,
          registrationId,
          AFTER
        )
      ).toBe(false)
    })

    it('returns false when the only report is not submitted', async () => {
      await repository.createReport(
        buildCreateReportParams({ organisationId, registrationId })
      )

      expect(
        await repository.hasReportSubmittedSince(
          organisationId,
          registrationId,
          BEFORE
        )
      ).toBe(false)
    })

    it('ignores submitted reports belonging to a different registration', async () => {
      await createAndSubmitReport(repository, {
        organisationId,
        registrationId: new ObjectId().toString()
      })

      expect(
        await repository.hasReportSubmittedSince(
          organisationId,
          registrationId,
          BEFORE
        )
      ).toBe(false)
    })
  })
}
