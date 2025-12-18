import { describe, beforeEach, expect } from 'vitest'
import { randomUUID } from 'node:crypto'
import { buildSummaryLog } from './test-data.js'
import { SUMMARY_LOG_STATUS } from '#domain/summary-logs/status.js'

const generateOrgReg = () => ({
  organisationId: `org-${randomUUID()}`,
  registrationId: `reg-${randomUUID()}`
})

/**
 * Contract tests for transitionToSubmittingExclusive method
 *
 * This method atomically transitions a summary log to 'submitting' status,
 * but only if no other summary log for the same organisation/registration
 * pair is already submitting. This prevents concurrent submissions.
 *
 * @param {import('vitest').TaskContext} it - Vitest test context with fixtures
 */
export const testTransitionToSubmittingExclusive = (it) => {
  describe('transitionToSubmittingExclusive', () => {
    let repository

    beforeEach(async ({ summaryLogsRepository }) => {
      repository = summaryLogsRepository
    })

    it('returns success with summaryLog and version when no other log is submitting', async () => {
      const { organisationId, registrationId } = generateOrgReg()
      const logId = `summary-${randomUUID()}`

      await repository.insert(
        logId,
        buildSummaryLog({
          status: SUMMARY_LOG_STATUS.VALIDATED,
          organisationId,
          registrationId
        })
      )

      const result = await repository.transitionToSubmittingExclusive(logId)

      expect(result.success).toBe(true)
      expect(result.summaryLog).toBeDefined()
      expect(result.summaryLog.status).toBe(SUMMARY_LOG_STATUS.SUBMITTING)
      expect(result.version).toBeDefined()
    })

    it('returns success: false when another log for same org/reg is already submitting', async () => {
      const { organisationId, registrationId } = generateOrgReg()
      const existingSubmittingId = `summary-${randomUUID()}`
      const newLogId = `summary-${randomUUID()}`

      // Insert both logs first as validated
      await repository.insert(
        existingSubmittingId,
        buildSummaryLog({
          status: SUMMARY_LOG_STATUS.VALIDATED,
          organisationId,
          registrationId
        })
      )

      await repository.insert(
        newLogId,
        buildSummaryLog({
          status: SUMMARY_LOG_STATUS.VALIDATED,
          organisationId,
          registrationId
        })
      )

      // Now transition the first log to submitting via update
      const existingDoc = await repository.findById(existingSubmittingId)
      await repository.update(existingSubmittingId, existingDoc.version, {
        status: SUMMARY_LOG_STATUS.SUBMITTING,
        submittedAt: new Date().toISOString()
      })

      const result = await repository.transitionToSubmittingExclusive(newLogId)

      expect(result.success).toBe(false)
      expect(result.summaryLog).toBeUndefined()
      expect(result.version).toBeUndefined()
    })

    it('throws when summary log not found', async () => {
      const nonExistentId = `summary-${randomUUID()}`

      await expect(
        repository.transitionToSubmittingExclusive(nonExistentId)
      ).rejects.toThrow()
    })

    it('throws when summary log is not in validated status', async () => {
      const { organisationId, registrationId } = generateOrgReg()
      const logId = `summary-${randomUUID()}`

      // Insert a log in 'validating' status (not yet validated)
      await repository.insert(
        logId,
        buildSummaryLog({
          status: SUMMARY_LOG_STATUS.VALIDATING,
          organisationId,
          registrationId
        })
      )

      await expect(
        repository.transitionToSubmittingExclusive(logId)
      ).rejects.toThrow()
    })

    it('allows concurrent submissions for different org/reg pairs', async () => {
      const orgReg1 = generateOrgReg()
      const orgReg2 = generateOrgReg()
      const logId1 = `summary-${randomUUID()}`
      const logId2 = `summary-${randomUUID()}`

      // Insert validated logs for two different org/reg pairs
      await repository.insert(
        logId1,
        buildSummaryLog({
          status: SUMMARY_LOG_STATUS.VALIDATED,
          organisationId: orgReg1.organisationId,
          registrationId: orgReg1.registrationId
        })
      )
      await repository.insert(
        logId2,
        buildSummaryLog({
          status: SUMMARY_LOG_STATUS.VALIDATED,
          organisationId: orgReg2.organisationId,
          registrationId: orgReg2.registrationId
        })
      )

      // First transition should succeed
      const result1 = await repository.transitionToSubmittingExclusive(logId1)

      // Second transition for different org/reg should also succeed
      const result2 = await repository.transitionToSubmittingExclusive(logId2)

      expect(result1.success).toBe(true)
      expect(result2.success).toBe(true)
    })

    it('increments version on successful transition', async () => {
      const { organisationId, registrationId } = generateOrgReg()
      const logId = `summary-${randomUUID()}`

      await repository.insert(
        logId,
        buildSummaryLog({
          status: SUMMARY_LOG_STATUS.VALIDATED,
          organisationId,
          registrationId
        })
      )

      const existing = await repository.findById(logId)
      expect(existing.version).toBe(1)

      const result = await repository.transitionToSubmittingExclusive(logId)

      expect(result.success).toBe(true)
      expect(result.version).toBe(2)

      // Allow staleCache to sync before reading (eventual consistency)
      await new Promise((resolve) => setImmediate(resolve))

      // Verify persisted version
      const updated = await repository.findById(logId)
      expect(updated.version).toBe(2)
    })

    describe('concurrent calls for same org/reg', () => {
      it('allows only one to succeed when racing', async () => {
        const { organisationId, registrationId } = generateOrgReg()
        const logId1 = `summary-${randomUUID()}`
        const logId2 = `summary-${randomUUID()}`

        // Insert two validated logs for the same org/reg
        await repository.insert(
          logId1,
          buildSummaryLog({
            status: SUMMARY_LOG_STATUS.VALIDATED,
            organisationId,
            registrationId
          })
        )
        await repository.insert(
          logId2,
          buildSummaryLog({
            status: SUMMARY_LOG_STATUS.VALIDATED,
            organisationId,
            registrationId
          })
        )

        // Race two transitions
        const results = await Promise.all([
          repository.transitionToSubmittingExclusive(logId1),
          repository.transitionToSubmittingExclusive(logId2)
        ])

        // Exactly one should succeed
        const successes = results.filter((r) => r.success)
        expect(successes.length).toBe(1)

        // The other should have failed
        const failures = results.filter((r) => !r.success)
        expect(failures.length).toBe(1)
      })

      it('reverts loser to validated status after race', async () => {
        const { organisationId, registrationId } = generateOrgReg()
        const logId1 = `summary-${randomUUID()}`
        const logId2 = `summary-${randomUUID()}`

        // Insert two validated logs for the same org/reg
        await repository.insert(
          logId1,
          buildSummaryLog({
            status: SUMMARY_LOG_STATUS.VALIDATED,
            organisationId,
            registrationId
          })
        )
        await repository.insert(
          logId2,
          buildSummaryLog({
            status: SUMMARY_LOG_STATUS.VALIDATED,
            organisationId,
            registrationId
          })
        )

        // Race two transitions
        await Promise.all([
          repository.transitionToSubmittingExclusive(logId1),
          repository.transitionToSubmittingExclusive(logId2)
        ])

        // Allow staleCache to sync before reading (eventual consistency)
        await new Promise((resolve) => setImmediate(resolve))

        // Verify end state: exactly one submitting, one validated
        const log1 = await repository.findById(logId1)
        const log2 = await repository.findById(logId2)
        const statuses = [log1.summaryLog.status, log2.summaryLog.status]

        expect(statuses).toContain(SUMMARY_LOG_STATUS.SUBMITTING)
        expect(statuses).toContain(SUMMARY_LOG_STATUS.VALIDATED)
      })
    })
  })
}
