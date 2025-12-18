import { describe, beforeEach, expect } from 'vitest'
import { randomUUID } from 'node:crypto'
import { buildSummaryLog } from './test-data.js'

const generateOrgReg = () => ({
  organisationId: `org-${randomUUID()}`,
  registrationId: `reg-${randomUUID()}`
})

/**
 * Contract tests for findLatestSubmittedForOrgReg method
 * These tests verify the behaviour is consistent across implementations
 *
 * @param {import('vitest').TaskContext} it - Vitest test context with fixtures
 */
export const testFindLatestSubmittedForOrgReg = (it) => {
  describe('findLatestSubmittedForOrgReg', () => {
    let repository

    beforeEach(async ({ summaryLogsRepository }) => {
      repository = summaryLogsRepository
    })

    it('returns null when no submitted summary logs exist for org/reg', async () => {
      const { organisationId, registrationId } = generateOrgReg()

      const result = await repository.findLatestSubmittedForOrgReg(
        organisationId,
        registrationId
      )

      expect(result).toBeNull()
    })

    it('returns the submitted summary log when one exists', async () => {
      const { organisationId, registrationId } = generateOrgReg()
      const logId = `summary-${randomUUID()}`

      await repository.insert(
        logId,
        buildSummaryLog({
          status: 'submitted',
          organisationId,
          registrationId
        })
      )

      const result = await repository.findLatestSubmittedForOrgReg(
        organisationId,
        registrationId
      )

      expect(result).not.toBeNull()
      expect(result.summaryLog.status).toBe('submitted')
      expect(result.summaryLog.organisationId).toBe(organisationId)
      expect(result.summaryLog.registrationId).toBe(registrationId)
    })

    it('returns the most recent when multiple submitted summary logs exist (older first)', async () => {
      const { organisationId, registrationId } = generateOrgReg()
      const olderId = `summary-${randomUUID()}`
      const newerId = `summary-${randomUUID()}`

      // Insert older summary log first
      await repository.insert(
        olderId,
        buildSummaryLog({
          status: 'submitted',
          organisationId,
          registrationId,
          submittedAt: new Date('2024-01-01').toISOString()
        })
      )

      // Insert newer summary log
      await repository.insert(
        newerId,
        buildSummaryLog({
          status: 'submitted',
          organisationId,
          registrationId,
          submittedAt: new Date('2024-06-01').toISOString()
        })
      )

      const result = await repository.findLatestSubmittedForOrgReg(
        organisationId,
        registrationId
      )

      expect(result).not.toBeNull()
      // Should return the more recently submitted log
      expect(result.summaryLog.submittedAt).toBe(
        new Date('2024-06-01').toISOString()
      )
    })

    it('returns the most recent when multiple submitted summary logs exist (newer first)', async () => {
      const { organisationId, registrationId } = generateOrgReg()
      const olderId = `summary-${randomUUID()}`
      const newerId = `summary-${randomUUID()}`

      // Insert newer summary log first
      await repository.insert(
        newerId,
        buildSummaryLog({
          status: 'submitted',
          organisationId,
          registrationId,
          submittedAt: new Date('2024-06-01').toISOString()
        })
      )

      // Insert older summary log second
      await repository.insert(
        olderId,
        buildSummaryLog({
          status: 'submitted',
          organisationId,
          registrationId,
          submittedAt: new Date('2024-01-01').toISOString()
        })
      )

      const result = await repository.findLatestSubmittedForOrgReg(
        organisationId,
        registrationId
      )

      expect(result).not.toBeNull()
      // Should still return the more recently submitted log
      expect(result.summaryLog.submittedAt).toBe(
        new Date('2024-06-01').toISOString()
      )
    })

    it('only returns summary logs for the specified org/reg pair', async () => {
      const { organisationId, registrationId } = generateOrgReg()
      const { organisationId: otherOrgId, registrationId: otherRegId } =
        generateOrgReg()

      const targetId = `summary-${randomUUID()}`
      const otherId = `summary-${randomUUID()}`

      // Insert summary log for target org/reg
      await repository.insert(
        targetId,
        buildSummaryLog({
          status: 'submitted',
          organisationId,
          registrationId
        })
      )

      // Insert summary log for different org/reg
      await repository.insert(
        otherId,
        buildSummaryLog({
          status: 'submitted',
          organisationId: otherOrgId,
          registrationId: otherRegId
        })
      )

      const result = await repository.findLatestSubmittedForOrgReg(
        organisationId,
        registrationId
      )

      expect(result).not.toBeNull()
      expect(result.summaryLog.organisationId).toBe(organisationId)
      expect(result.summaryLog.registrationId).toBe(registrationId)
    })

    it('does not return summary logs in other statuses', async () => {
      const { organisationId, registrationId } = generateOrgReg()

      // Insert summary logs in various non-submitted statuses
      // Note: 'submitting' is excluded because the current constraint
      // prevents inserting other summary logs for the same org/reg after a
      // 'submitting' summary log exists. This constraint will be removed
      // as part of the deferred staleness detection work.
      const statuses = [
        'preprocessing',
        'validating',
        'validated',
        'superseded',
        'rejected'
      ]

      for (const status of statuses) {
        const logId = `summary-${status}-${randomUUID()}`
        const summaryLog =
          status === 'preprocessing'
            ? { status, organisationId, registrationId }
            : buildSummaryLog({ status, organisationId, registrationId })

        await repository.insert(logId, summaryLog)
      }

      const result = await repository.findLatestSubmittedForOrgReg(
        organisationId,
        registrationId
      )

      expect(result).toBeNull()
    })

    it('does not return summary logs in submitting status', async () => {
      const { organisationId, registrationId } = generateOrgReg()
      const logId = `summary-submitting-${randomUUID()}`

      await repository.insert(
        logId,
        buildSummaryLog({
          status: 'submitting',
          organisationId,
          registrationId
        })
      )

      const result = await repository.findLatestSubmittedForOrgReg(
        organisationId,
        registrationId
      )

      expect(result).toBeNull()
    })

    it('includes version in the returned result', async () => {
      const { organisationId, registrationId } = generateOrgReg()
      const logId = `summary-${randomUUID()}`

      await repository.insert(
        logId,
        buildSummaryLog({
          status: 'submitted',
          organisationId,
          registrationId
        })
      )

      const result = await repository.findLatestSubmittedForOrgReg(
        organisationId,
        registrationId
      )

      expect(result).not.toBeNull()
      expect(result.version).toBe(1)
    })
  })
}
