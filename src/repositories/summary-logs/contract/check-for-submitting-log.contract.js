import { describe, beforeEach, expect } from 'vitest'
import { randomUUID } from 'node:crypto'

import { SUMMARY_LOG_STATUS } from '#domain/summary-logs/status.js'
import { buildSummaryLog } from './test-data.js'

/**
 * Contract tests for checkForSubmittingLog method
 * These tests verify the behaviour is consistent across implementations
 *
 * @param {import('vitest').TaskContext} it - Vitest test context with fixtures
 */
export const testCheckForSubmittingLog = (it) => {
  describe('checkForSubmittingLog', () => {
    let repository

    beforeEach(async ({ summaryLogsRepository }) => {
      repository = summaryLogsRepository
    })

    it('throws 409 when a submitting log exists for same org/reg', async () => {
      const organisationId = `org-check-constraint-${randomUUID()}`
      const registrationId = `reg-check-constraint-${randomUUID()}`

      // Insert a log in submitting status
      const existingId = `existing-submitting-${randomUUID()}`
      await repository.insert(
        existingId,
        buildSummaryLog({
          status: SUMMARY_LOG_STATUS.SUBMITTING,
          organisationId,
          registrationId
        })
      )

      // Check should throw 409
      await expect(
        repository.checkForSubmittingLog(organisationId, registrationId)
      ).rejects.toMatchObject({
        isBoom: true,
        output: { statusCode: 409 },
        message: 'A submission is in progress. Please wait.'
      })
    })

    it('does not throw when submitting log is for different registration', async () => {
      const organisationId = `org-check-shared-${randomUUID()}`

      // Insert a log in submitting status for reg-A
      const existingId = `existing-check-reg-a-${randomUUID()}`
      await repository.insert(
        existingId,
        buildSummaryLog({
          status: SUMMARY_LOG_STATUS.SUBMITTING,
          organisationId,
          registrationId: `reg-A-${randomUUID()}`
        })
      )

      // Check for reg-B (same org, different registration) should not throw
      await expect(
        repository.checkForSubmittingLog(
          organisationId,
          `reg-B-${randomUUID()}`
        )
      ).resolves.toBeUndefined()
    })

    it('does not throw when no logs exist for org/reg', async () => {
      const organisationId = `org-check-empty-${randomUUID()}`
      const registrationId = `reg-check-empty-${randomUUID()}`

      // Check should not throw when no logs exist
      await expect(
        repository.checkForSubmittingLog(organisationId, registrationId)
      ).resolves.toBeUndefined()
    })

    it('does not throw when existing log for same org/reg is not submitting', async () => {
      const organisationId = `org-check-non-submitting-${randomUUID()}`
      const registrationId = `reg-check-non-submitting-${randomUUID()}`

      // Insert logs in various non-submitting statuses
      const statuses = [
        SUMMARY_LOG_STATUS.PREPROCESSING,
        SUMMARY_LOG_STATUS.VALIDATING,
        SUMMARY_LOG_STATUS.VALIDATED,
        SUMMARY_LOG_STATUS.SUBMITTED,
        SUMMARY_LOG_STATUS.SUPERSEDED,
        SUMMARY_LOG_STATUS.REJECTED
      ]

      for (const status of statuses) {
        const existingId = `existing-check-${status}-${randomUUID()}`
        const existingLog =
          status === SUMMARY_LOG_STATUS.PREPROCESSING
            ? { status, organisationId, registrationId }
            : buildSummaryLog({ status, organisationId, registrationId })

        await repository.insert(existingId, existingLog)
      }

      // Check should not throw - none of the existing logs are in submitting status
      await expect(
        repository.checkForSubmittingLog(organisationId, registrationId)
      ).resolves.toBeUndefined()
    })
  })
}
