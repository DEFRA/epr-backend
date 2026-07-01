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

    it('returns true when a report was submitted after the timestamp', async () => {
      await createAndSubmitReport(repository, {
        organisationId,
        registrationId
      })

      expect(
        await repository.hasReportSubmittedSince(
          organisationId,
          registrationId,
          BEFORE
        )
      ).toBe(true)
    })

    it('returns false when the submission is not strictly after the timestamp', async () => {
      const reportId = await createAndSubmitReport(repository, {
        organisationId,
        registrationId
      })
      const { status } = await repository.findReportById(reportId)
      const submittedAt = status.submitted.at

      // Boundary: `since` equal to the submission time must not match (strict >).
      expect(
        await repository.hasReportSubmittedSince(
          organisationId,
          registrationId,
          submittedAt
        )
      ).toBe(false)

      expect(
        await repository.hasReportSubmittedSince(
          organisationId,
          registrationId,
          AFTER
        )
      ).toBe(false)
    })

    it('compares by instant, not raw string, across equivalent ISO forms', async () => {
      const reportId = await createAndSubmitReport(repository, {
        organisationId,
        registrationId
      })
      const { status } = await repository.findReportById(reportId)
      const submittedAt = status.submitted.at

      // Same instant as the submission, but written with a numeric offset rather
      // than 'Z'. A raw string compare mis-sorts this ('Z' > '+'), which would
      // wrongly report the submission as being "after" its own timestamp.
      const sameInstantOffsetForm = submittedAt.replace('Z', '+00:00')

      expect(
        await repository.hasReportSubmittedSince(
          organisationId,
          registrationId,
          sameInstantOffsetForm
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
