import { beforeEach, describe, expect } from 'vitest'
import {
  buildCreateReportParams,
  createAndSubmitReport,
  DEFAULT_REPORT_YEAR,
  NEXT_YEAR_REPORT,
  uniqueOrganisationNumber,
  uniqueRegistrationNumber
} from './test-data.js'

/** @import { ReportsRepositoryFactory } from '../port.js' */

/** @typedef {{ reportsRepository: ReportsRepositoryFactory }} ReportsFixture */

const BEFORE = '2000-01-01T00:00:00.000Z'
const AFTER = '2100-01-01T00:00:00.000Z'

export const testHasReportSubmittedSinceBehaviour = (it) => {
  describe('hasReportSubmittedSince', () => {
    let repository
    let organisationNumber
    let registrationNumber

    beforeEach(
      /** @param {ReportsFixture} fixture */ async ({ reportsRepository }) => {
        repository = reportsRepository()
        organisationNumber = uniqueOrganisationNumber()
        registrationNumber = uniqueRegistrationNumber()
      }
    )

    it('returns true when the timestamp is before the submission instant', async () => {
      const reportId = await createAndSubmitReport(repository, {
        organisationNumber,
        registrationNumber
      })
      const { status } = await repository.findReportById(reportId)
      const oneMsBefore = new Date(
        new Date(status.submitted.at).getTime() - 1
      ).toISOString()

      // Well before the submission.
      expect(
        await repository.hasReportSubmittedSince({
          organisationNumber,
          registrationNumber,
          year: DEFAULT_REPORT_YEAR,
          since: BEFORE
        })
      ).toBe(true)

      // One millisecond before: still strictly after -> matches (lower boundary).
      expect(
        await repository.hasReportSubmittedSince({
          organisationNumber,
          registrationNumber,
          year: DEFAULT_REPORT_YEAR,
          since: oneMsBefore
        })
      ).toBe(true)
    })

    it('returns false when the timestamp is at or after the submission instant', async () => {
      const reportId = await createAndSubmitReport(repository, {
        organisationNumber,
        registrationNumber
      })
      const { status } = await repository.findReportById(reportId)
      const submittedAt = status.submitted.at

      // Exactly at the submission instant: not strictly after (strict >).
      expect(
        await repository.hasReportSubmittedSince({
          organisationNumber,
          registrationNumber,
          year: DEFAULT_REPORT_YEAR,
          since: submittedAt
        })
      ).toBe(false)

      // Well after the submission.
      expect(
        await repository.hasReportSubmittedSince({
          organisationNumber,
          registrationNumber,
          year: DEFAULT_REPORT_YEAR,
          since: AFTER
        })
      ).toBe(false)
    })

    it('returns false when the only report is not submitted', async () => {
      await repository.createReport(
        buildCreateReportParams({ organisationNumber, registrationNumber })
      )

      expect(
        await repository.hasReportSubmittedSince({
          organisationNumber,
          registrationNumber,
          year: DEFAULT_REPORT_YEAR,
          since: BEFORE
        })
      ).toBe(false)
    })

    it('ignores submitted reports belonging to a different registration', async () => {
      await createAndSubmitReport(repository, {
        organisationNumber,
        registrationNumber: uniqueRegistrationNumber()
      })

      expect(
        await repository.hasReportSubmittedSince({
          organisationNumber,
          registrationNumber,
          year: DEFAULT_REPORT_YEAR,
          since: BEFORE
        })
      ).toBe(false)
    })

    it('ignores submitted reports belonging to a different year', async () => {
      await createAndSubmitReport(repository, {
        ...NEXT_YEAR_REPORT,
        organisationNumber,
        registrationNumber
      })

      expect(
        await repository.hasReportSubmittedSince({
          organisationNumber,
          registrationNumber,
          year: DEFAULT_REPORT_YEAR,
          since: BEFORE
        })
      ).toBe(false)
    })
  })
}
