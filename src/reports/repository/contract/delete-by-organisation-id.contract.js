import { beforeEach, describe, expect } from 'vitest'
import { ObjectId } from 'mongodb'
import { MONTHLY_PERIODS } from '#reports/domain/period-labels.js'
import {
  buildCreateReportParams,
  DEFAULT_ORG_ID,
  DEFAULT_REG_ID
} from './test-data.js'

export const testDeleteByOrganisationIdBehaviour = (it) => {
  describe('deleteByOrganisationId', () => {
    let repository

    beforeEach(async ({ reportsRepository }) => {
      repository = reportsRepository()
    })

    it('deletes all reports for the given organisationId and returns the count', async () => {
      await repository.createReport(
        buildCreateReportParams({
          cadence: 'monthly',
          period: MONTHLY_PERIODS.January
        })
      )
      await repository.createReport(
        buildCreateReportParams({
          cadence: 'monthly',
          period: MONTHLY_PERIODS.February
        })
      )
      await repository.createReport(
        buildCreateReportParams({
          cadence: 'monthly',
          period: MONTHLY_PERIODS.March
        })
      )

      const count = await repository.deleteByOrganisationId(DEFAULT_ORG_ID)

      expect(count).toBe(3)
      const remaining = await repository.findPeriodicReports({
        organisationId: DEFAULT_ORG_ID,
        registrationId: DEFAULT_REG_ID
      })
      expect(remaining).toEqual([])
    })

    it('returns 0 when no reports match the organisationId', async () => {
      await repository.createReport(
        buildCreateReportParams({
          cadence: 'monthly',
          period: MONTHLY_PERIODS.January
        })
      )

      const otherOrgId = new ObjectId().toString()
      const count = await repository.deleteByOrganisationId(otherOrgId)

      expect(count).toBe(0)
      const remaining = await repository.findPeriodicReports({
        organisationId: DEFAULT_ORG_ID,
        registrationId: DEFAULT_REG_ID
      })
      expect(remaining).toHaveLength(1)
    })

    it('does not delete reports belonging to other organisations', async () => {
      const otherOrgId = new ObjectId().toString()
      const otherRegId = new ObjectId().toString()

      await repository.createReport(
        buildCreateReportParams({
          cadence: 'monthly',
          period: MONTHLY_PERIODS.January
        })
      )
      await repository.createReport(
        buildCreateReportParams({
          organisationId: otherOrgId,
          registrationId: otherRegId,
          cadence: 'monthly',
          period: MONTHLY_PERIODS.January
        })
      )

      const count = await repository.deleteByOrganisationId(DEFAULT_ORG_ID)

      expect(count).toBe(1)
      const defaultOrgReports = await repository.findPeriodicReports({
        organisationId: DEFAULT_ORG_ID,
        registrationId: DEFAULT_REG_ID
      })
      expect(defaultOrgReports).toEqual([])
      const otherOrgReports = await repository.findPeriodicReports({
        organisationId: otherOrgId,
        registrationId: otherRegId
      })
      expect(otherOrgReports).toHaveLength(1)
    })

    it('returns 0 when storage is empty', async () => {
      const count = await repository.deleteByOrganisationId(DEFAULT_ORG_ID)

      expect(count).toBe(0)
    })
  })
}
